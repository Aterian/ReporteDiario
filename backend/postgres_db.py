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

from error_handler import DatabaseTransactionError, RegistroDuplicadoError, ValidacionError

_base = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
load_dotenv(_base / ".env", override=False)
load_dotenv(_base / "backend" / ".env", override=False)
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
                maximo = int(os.getenv("PG_POOL_MAX", "8"))
                if not 1 <= minimo <= maximo <= 100:
                    raise ValueError
            except ValueError as exc:
                raise ValidacionError("PG_POOL_MIN/MAX deben cumplir 1 <= mínimo <= máximo <= 100.") from exc
            try:
                _pool = ThreadedConnectionPool(
                    minimo, maximo, dsn=dsn, connect_timeout=8,
                    application_name="CheckDiarioIngeap",
                    options="-c statement_timeout=30000 -c lock_timeout=10000",
                )
            except psycopg2.Error:
                raise DatabaseTransactionError("No se pudo conectar a PostgreSQL. Revise la configuración y la red.") from None
            _slots = BoundedSemaphore(maximo)
        return _pool


# [FN-07.01] Prestar un cursor y cerrar siempre la transacción
@contextmanager
def obtener_cursor_pg(commit=False):
    pool = obtener_pool()
    slots = _slots
    if not slots.acquire(timeout=10):
        raise DatabaseTransactionError("Todas las conexiones están ocupadas. Reintente en unos instantes.")
    conn = None
    descartar = False
    try:
        conn = pool.getconn()
        conn.set_session(readonly=not commit, autocommit=False)
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            yield cursor
        if commit:
            conn.commit()
        else:
            conn.rollback()
    except BaseException as exc:
        if conn is not None:
            try:
                conn.rollback()
            except psycopg2.Error:
                descartar = True
        if isinstance(exc, psycopg2.errors.UniqueViolation):
            raise RegistroDuplicadoError() from None
        if isinstance(exc, (psycopg2.errors.CheckViolation, psycopg2.errors.ForeignKeyViolation,
                            psycopg2.errors.InvalidTextRepresentation, psycopg2.errors.NotNullViolation)):
            raise ValidacionError("Los datos no cumplen las restricciones de PostgreSQL.") from None
        if isinstance(exc, psycopg2.Error):
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
