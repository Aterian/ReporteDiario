# [MOD-07] Conexiones PostgreSQL transaccionales
import atexit
import os
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from threading import BoundedSemaphore, Lock

import psycopg2
import psycopg2.errors
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
_ultimos_usos = {}
_ultimos_usos_lock = Lock()


def _registrar_uso_conexion(conn, timestamp=None):
    if conn is None:
        return
    ts = time.monotonic() if timestamp is None else timestamp
    try:
        key = id(conn)
        with _ultimos_usos_lock:
            _ultimos_usos[key] = ts
    except Exception:
        pass
    try:
        conn._ultimo_uso_monotonic = ts
    except (AttributeError, TypeError):
        pass


def _obtener_ultimo_uso(conn):
    if conn is None:
        return None
    try:
        d = getattr(conn, "__dict__", None)
        if isinstance(d, dict) and "_ultimo_uso_monotonic" in d:
            val = d["_ultimo_uso_monotonic"]
            if isinstance(val, (int, float)):
                return val
    except Exception:
        pass
    try:
        key = id(conn)
        with _ultimos_usos_lock:
            return _ultimos_usos.get(key)
    except Exception:
        return None


def _olvidar_conexion(conn):
    if conn is not None:
        try:
            key = id(conn)
            with _ultimos_usos_lock:
                _ultimos_usos.pop(key, None)
        except Exception:
            pass


# [FN-07.01] Pool resiliente con sellado de tiempo para prevención de sockets inactivos
class ResilientThreadedConnectionPool(ThreadedConnectionPool):
    def _connect(self, key=None):
        conn = super()._connect(key=key)
        _registrar_uso_conexion(conn)
        return conn


# [FN-07.01] Inicializar el pool bajo demanda
def obtener_pool():
    global _pool, _slots
    with _lock:
        if _pool is None or getattr(_pool, "closed", False):
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
                _pool = ResilientThreadedConnectionPool(
                    minimo, maximo, dsn=dsn, connect_timeout=8,
                    keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5,
                    application_name="CheckDiarioIngeap",
                    options="-c statement_timeout=30000 -c lock_timeout=10000",
                )
                for c in getattr(_pool, "_pool", []):
                    _registrar_uso_conexion(c)
            except psycopg2.Error as exc:
                logger.error("[DB] Fallo al inicializar ThreadedConnectionPool: {}", str(exc).strip())
                exc_db = DatabaseTransactionError("No se pudo conectar a PostgreSQL. Revise la configuración y la red.")
                exc_db.es_fallo_conexion = True
                raise exc_db from None
            _slots = BoundedSemaphore(maximo)
        return _pool


# [FN-07.01] Verificar si una conexión física continúa activa y utilizable
def _es_conexion_saludable(conn):
    if conn is None or getattr(conn, "closed", 0):
        return False
    status = getattr(conn, "get_transaction_status", None)
    if callable(status):
        try:
            st = conn.get_transaction_status()
            if isinstance(st, int):
                if st in (1, 4):
                    return False
                if st in (2, 3):
                    conn.rollback()
        except Exception:
            return False
    ahora = time.monotonic()
    ultimo = _obtener_ultimo_uso(conn)
    if ultimo is not None and isinstance(ultimo, (int, float)) and ahora - ultimo < 15.0:
        return True
    prev_autocommit = getattr(conn, "autocommit", False)
    try:
        if not prev_autocommit and hasattr(conn, "autocommit"):
            conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        _registrar_uso_conexion(conn)
        return True
    except (psycopg2.OperationalError, psycopg2.InterfaceError, psycopg2.Error):
        return False
    except Exception:
        return False
    finally:
        try:
            if not prev_autocommit and hasattr(conn, "autocommit"):
                conn.autocommit = prev_autocommit
        except Exception:
            pass


# [FN-07.01] Prestar un cursor y cerrar siempre la transacción
@contextmanager
def obtener_cursor_pg(commit=False):
    pool = obtener_pool()
    slots = _slots
    timeout_espera = float(os.getenv("PG_POOL_ACQUIRE_TIMEOUT", "25"))
    if not slots.acquire(timeout=timeout_espera):
        exc_pool = DatabaseTransactionError("Todas las conexiones están ocupadas. Reintente en unos instantes.")
        exc_pool.es_saturacion_pool = True
        exc_pool.es_fallo_conexion = True
        raise exc_pool
    conn = None
    descartar = False
    try:
        intentos = 0
        pool_max = getattr(pool, "maxconn", 20)
        if not isinstance(pool_max, int):
            pool_max = 20
        max_reemplazos = max(5, pool_max)
        while intentos < max_reemplazos:
            conn = pool.getconn()
            if _es_conexion_saludable(conn):
                break
            logger.warning("[DB] Conexión inactiva o caída detectada en el pool; descartando y renovando...")
            try:
                pool.putconn(conn, close=True)
            except Exception:
                pass
            conn = None
            intentos += 1

        if conn is None:
            conn = pool.getconn()
            if not _es_conexion_saludable(conn):
                try:
                    pool.putconn(conn, close=True)
                except Exception:
                    pass
                conn = None
                exc_conn = DatabaseTransactionError("No se pudo obtener una conexión válida a PostgreSQL.")
                exc_conn.es_fallo_conexion = True
                raise exc_conn

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
        _registrar_uso_conexion(conn)
    except BaseException as exc:
        es_fallo_red = isinstance(exc, (psycopg2.OperationalError, psycopg2.InterfaceError))
        if es_fallo_red:
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
        if isinstance(exc, (psycopg2.errors.UndefinedColumn, psycopg2.errors.UndefinedTable)):
            logger.error("[DB] Esquema desactualizado ({}): {}", getattr(exc, "pgcode", type(exc).__name__), str(exc).strip())
            raise DatabaseTransactionError("El esquema de PostgreSQL requiere actualización (columna o tabla faltante).") from None
        if isinstance(exc, psycopg2.Error):
            logger.error("[DB] Error PostgreSQL ({}): {}", getattr(exc, "pgcode", type(exc).__name__), str(exc).strip())
            msg = (
                "PostgreSQL no pudo completar la operación; no se guardaron cambios."
                if commit
                else "No se pudo completar la consulta en PostgreSQL."
            )
            exc_db = DatabaseTransactionError(msg)
            exc_db.es_fallo_conexion = es_fallo_red
            raise exc_db from None
        raise
    finally:
        try:
            if conn is not None:
                if descartar or bool(getattr(conn, "closed", 0)):
                    _olvidar_conexion(conn)
                else:
                    _registrar_uso_conexion(conn)
                pool.putconn(conn, close=descartar or bool(getattr(conn, "closed", 0)))
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
    with _ultimos_usos_lock:
        _ultimos_usos.clear()


atexit.register(cerrar_pool)
