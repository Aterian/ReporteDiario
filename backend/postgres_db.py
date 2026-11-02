# [MOD-07] Conexiones PostgreSQL transaccionales
import atexit
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from threading import BoundedSemaphore, Lock

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool

from error_handler import DatabaseTransactionError, RegistroDuplicadoError, ValidacionError, logger

_base = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
load_dotenv(_base / ".env", override=False)
load_dotenv(_base / "backend" / ".env", override=False)
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    load_dotenv(Path(sys._MEIPASS) / ".env", override=False)
_pool = None
_slots = None
_lock = Lock()


# [FN-07.01] Inicializar el pool bajo demanda
def obtener_pool():
    global _pool, _slots
    with _lock:
        if _pool is None:
            dsn = os.getenv("DATABASE_URL", "").strip()
            if not dsn:
                raise ValidacionError("Configure DATABASE_URL en el entorno o en .env.")
            try:
                minimo = int(os.getenv("PG_POOL_MIN", "1"))
                maximo = int(os.getenv("PG_POOL_MAX", "20"))
                if not 1 <= minimo <= maximo <= 100:
                    raise ValueError
            except ValueError as exc:
                raise ValidacionError("PG_POOL_MIN/MAX deben cumplir 1 <= mínimo <= máximo <= 100.") from exc
            try:
                _pool = ThreadedConnectionPool(
                    minimo, maximo, dsn=dsn, connect_timeout=8,
                    keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5,
                    application_name="CheckDiarioIngeap",
                    options="-c statement_timeout=30000 -c lock_timeout=10000",
                )
            except psycopg2.Error as exc:
                logger.error("[DB] Fallo al inicializar ThreadedConnectionPool: {}", str(exc).strip())
                raise DatabaseTransactionError("No se pudo conectar a PostgreSQL. Revise la configuración y la red.") from None
            _slots = BoundedSemaphore(maximo)
        return _pool


# [FN-07.01] Prestar un cursor y cerrar siempre la transacción
@contextmanager
def obtener_cursor_pg(commit=False):
    pool = obtener_pool()
    slots = _slots
    timeout_espera = float(os.getenv("PG_POOL_ACQUIRE_TIMEOUT", "15"))
    if not slots.acquire(timeout=timeout_espera):
        raise DatabaseTransactionError("Todas las conexiones están ocupadas. Reintente en unos instantes.")
    conn = None
    descartar = False
    try:
        conn = pool.getconn()
        if getattr(conn, "closed", 0):
            pool.putconn(conn, close=True)
            conn = pool.getconn()
        if conn.autocommit:
            conn.autocommit = False
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            yield cursor
        if commit:
            conn.commit()
        else:
            conn.rollback()
    except BaseException as exc:
        if isinstance(exc, (psycopg2.OperationalError, psycopg2.InterfaceError)):
            descartar = True
        if conn is not None:
            try:
                if not getattr(conn, "closed", 0):
                    conn.rollback()
            except psycopg2.Error:
                descartar = True
        if isinstance(exc, psycopg2.errors.UniqueViolation):
            raise RegistroDuplicadoError() from None
        if isinstance(exc, (psycopg2.errors.CheckViolation, psycopg2.errors.ForeignKeyViolation,
                            psycopg2.errors.InvalidTextRepresentation, psycopg2.errors.NotNullViolation)):
            logger.warning("[DB] Restricción PostgreSQL ({}): {}", getattr(exc, "pgcode", type(exc).__name__), str(exc).strip())
            raise ValidacionError("Los datos no cumplen las restricciones de PostgreSQL.") from None
        if isinstance(exc, psycopg2.Error):
            logger.error("[DB] Error PostgreSQL ({}): {}", getattr(exc, "pgcode", type(exc).__name__), str(exc).strip())
            raise DatabaseTransactionError("PostgreSQL no pudo completar la operación; no se guardaron cambios.") from None
        raise
    finally:
        try:
            if conn is not None:
                pool.putconn(conn, close=descartar or bool(conn.closed))
        finally:
            slots.release()


# [FN-07.01] Cerrar conexiones al finalizar la aplicación
def cerrar_pool():
    global _pool, _slots
    with _lock:
        if _pool is not None:
            _pool.closeall()
            _pool = None
            _slots = None


atexit.register(cerrar_pool)
