# [FN-00.03] Arquitectura Robusta de Manejo de Errores y Logging
import os
import sys
import functools
import inspect
import asyncio
from typing import Any, Callable, Optional
from contextlib import contextmanager

# 1. Configuración de Loguru
from loguru import logger

# Directorio persistente de logs
LOGS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "logs"))
os.makedirs(LOGS_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOGS_DIR, "app_errors.log")

# Remover configuración por defecto para evitar duplicados
logger.remove()

# Handler 1: Consola con formato enriquecido
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="INFO",
    colorize=True
)

# Handler 2: Archivo rotativo para persistencia de fallos y auditoría
logger.add(
    LOG_FILE,
    rotation="10 MB",
    retention="10 days",
    compression="zip",
    level="INFO",
    encoding="utf-8",
    backtrace=True,
    diagnose=True,
    enqueue=True
)


# 2. Jerarquía de Excepciones de Dominio
class AppBaseException(Exception):
    """Excepción raíz para errores de dominio en el sistema."""
    def __init__(self, mensaje: str, codigo_error: str = "ERROR_GENERAL", detalles: Any = None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo_error = codigo_error
        self.detalles = detalles


class ValidacionError(AppBaseException):
    """Fallo en las validaciones de negocio o esquema Pydantic."""
    def __init__(self, mensaje: str, detalles: Any = None):
        super().__init__(mensaje=mensaje, codigo_error="VALIDACION_ERROR", detalles=detalles)


class RegistroDuplicadoError(AppBaseException):
    """Violación de unicidad o clave primaria duplicada."""
    def __init__(self, mensaje: str = "El registro ya existe para esa fecha y empleado.", detalles: Any = None):
        super().__init__(mensaje=mensaje, codigo_error="REGISTRO_DUPLICADO", detalles=detalles)


class RegistroNoEncontradoError(AppBaseException):
    """Registro solicitado inexistente en la base de datos."""
    def __init__(self, mensaje: str = "El recurso solicitado no fue encontrado.", detalles: Any = None):
        super().__init__(mensaje=mensaje, codigo_error="NO_ENCONTRADO", detalles=detalles)


class PermisoDenegadoError(AppBaseException):
    """Acceso restringido por rol RBAC o permisos insuficientes."""
    def __init__(self, mensaje: str = "Acceso denegado: No posee los permisos requeridos.", detalles: Any = None):
        super().__init__(mensaje=mensaje, codigo_error="ACCESO_DENEGADO", detalles=detalles)


class DatabaseTransactionError(AppBaseException):
    """Fallo en la persistencia transaccional."""
    def __init__(self, mensaje: str = "Error en la transacción de base de datos.", detalles: Any = None):
        super().__init__(mensaje=mensaje, codigo_error="ERROR_BASE_DATOS", detalles=detalles)


class ServicioExternoError(AppBaseException):
    """Error al comunicarse con APIs externas (ej. Google Sheets)."""
    def __init__(self, mensaje: str = "Fallo de comunicación con el servicio remoto.", detalles: Any = None):
        super().__init__(mensaje=mensaje, codigo_error="SERVICIO_EXTERNO_ERROR", detalles=detalles)


# 3. Manejador de Transacciones (PostgreSQL y SQLite)
@contextmanager
def transaccion_db(conn):
    """
    Context manager que asegura atomicidad:
    - Ejecuta conn.commit() si el bloque finaliza sin errores.
    - Ejecuta conn.rollback() inmediato ante cualquier excepción para evitar conexiones 'idle in transaction'.
    - Traduce excepciones de PostgreSQL (psycopg2 / psycopg) y SQLite a excepciones de dominio legibles.
    """
    try:
        yield conn
        if hasattr(conn, "commit"):
            conn.commit()
    except Exception as exc:
        if hasattr(conn, "rollback"):
            try:
                conn.rollback()
            except Exception as rb_err:
                logger.error(f"[DB] Error al ejecutar rollback: {rb_err}")

        # Identificar tipos de error de PostgreSQL o SQLite
        exc_type = type(exc).__name__
        exc_msg = str(exc)

        # Caso A: Clave única / duplicados (PostgreSQL UniqueViolation o SQLite UNIQUE constraint)
        if "UniqueViolation" in exc_type or "UNIQUE constraint failed" in exc_msg:
            logger.warning(f"[DB] Violación de unicidad detectada: {exc_msg}")
            raise RegistroDuplicadoError(
                mensaje="El registro ya existe para esa fecha y empleado. No se permiten entradas duplicadas.",
                detalles={"original_error": exc_msg}
            ) from exc

        # Caso B: Clave foránea inexistente (PostgreSQL ForeignKeyViolation o SQLite FOREIGN KEY)
        if "ForeignKeyViolation" in exc_type or "FOREIGN KEY constraint failed" in exc_msg:
            logger.warning(f"[DB] Violación de clave foránea: {exc_msg}")
            raise ValidacionError(
                mensaje="El registro referenciado (proyecto o empleado) no existe en la base de datos.",
                detalles={"original_error": exc_msg}
            ) from exc

        # Caso C: Timeout o bloqueo concurrente (OperationalError)
        if "OperationalError" in exc_type or "database is locked" in exc_msg or "canceling statement due to statement timeout" in exc_msg:
            logger.error(f"[DB] Concurrencia o timeout en base de datos: {exc_msg}")
            raise DatabaseTransactionError(
                mensaje="La base de datos se encuentra temporalmente ocupada. Por favor intente nuevamente en unos instantes.",
                detalles={"original_error": exc_msg}
            ) from exc

        # Si ya es una excepción de dominio, propagarla
        if isinstance(exc, AppBaseException):
            raise exc

        # Caso D: Error genérico de persistencia
        logger.error(f"[DB] Error no controlado en persistencia: {exc}")
        raise DatabaseTransactionError(
            mensaje=f"Error en la operación de base de datos: {exc_msg}",
            detalles={"original_error": exc_msg}
        ) from exc


# 4. Decorador Centralizado de API
def formatear_respuesta(
    exito: bool,
    datos: Any = None,
    error: Optional[str] = None,
    codigo_error: Optional[str] = None
) -> dict:
    """Estandariza el contrato canónico hacia el cliente React."""
    return {
        "exito": bool(exito),
        "datos": datos,
        "error": str(error) if error else None,
        "codigo_error": str(codigo_error) if codigo_error else None
    }


def manejar_errores_api(func: Callable) -> Callable:
    """
    Decorador que envuelve métodos del backend / ApiPuente.
    Captura Pydantic ValidationError, excepciones de BD y errores no controlados,
    registrando el traceback en loguru y garantizando siempre el contrato de respuesta:
    {"exito": bool, "datos": any, "error": str | None, "codigo_error": str | None}
    """
    # Verificación de Pydantic disponible
    try:
        from pydantic import ValidationError as PydanticValidationError
    except ImportError:
        class PydanticValidationError(Exception):
            pass

    if inspect.iscoroutinefunction(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            try:
                res = await func(*args, **kwargs)
                return _normalizar_resultado(res)
            except PydanticValidationError as e:
                return _procesar_error_pydantic(func.__name__, e)
            except AppBaseException as e:
                return _procesar_error_dominio(func.__name__, e)
            except Exception as e:
                return _procesar_error_inesperado(func.__name__, e)
        return async_wrapper
    else:
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                res = func(*args, **kwargs)
                return _normalizar_resultado(res)
            except PydanticValidationError as e:
                return _procesar_error_pydantic(func.__name__, e)
            except AppBaseException as e:
                return _procesar_error_dominio(func.__name__, e)
            except Exception as e:
                return _procesar_error_inesperado(func.__name__, e)
        return sync_wrapper


def _normalizar_resultado(resultado: Any) -> dict:
    """Asegura que el retorno satisfaga el contrato estandarizado de la API."""
    if isinstance(resultado, dict):
        if "exito" in resultado:
            exito = bool(resultado["exito"])
            datos = resultado.get("datos") if "datos" in resultado else {k: v for k, v in resultado.items() if k not in ("exito", "error", "codigo_error")}
            error = resultado.get("error")
            codigo_error = resultado.get("codigo_error")
            if not exito and not codigo_error:
                codigo_error = "ERROR_OPERACION"
            return formatear_respuesta(exito=exito, datos=datos, error=error, codigo_error=codigo_error)
        else:
            return formatear_respuesta(exito=True, datos=resultado)
    return formatear_respuesta(exito=True, datos=resultado)


def _procesar_error_pydantic(nombre_func: str, e: Any) -> dict:
    """Extrae y formatea errores de validación de Pydantic."""
    try:
        errores = e.errors()
        campos = []
        for err in errores:
            loc = " -> ".join([str(x) for x in err.get("loc", [])])
            msg = err.get("msg", "Inválido")
            campos.append(f"{loc}: {msg}" if loc else msg)
        mensaje_formateado = "Validación fallida: " + "; ".join(campos)
    except Exception:
        mensaje_formateado = f"Datos de entrada inválidos: {str(e)}"

    logger.warning(f"[API] Fallo de validación en '{nombre_func}': {mensaje_formateado}")
    return formatear_respuesta(
        exito=False,
        datos=None,
        error=mensaje_formateado,
        codigo_error="VALIDACION_ERROR"
    )


def _procesar_error_dominio(nombre_func: str, e: AppBaseException) -> dict:
    """Maneja excepciones de dominio tipificadas."""
    logger.warning(f"[API] Error de dominio en '{nombre_func}' [{e.codigo_error}]: {e.mensaje}")
    return formatear_respuesta(
        exito=False,
        datos=e.detalles,
        error=e.mensaje,
        codigo_error=e.codigo_error
    )


def _procesar_error_inesperado(nombre_func: str, e: Exception) -> dict:
    """Captura excepciones no controladas registrando el traceback completo."""
    logger.exception(f"[API] Excepción no controlada en '{nombre_func}': {str(e)}")
    return formatear_respuesta(
        exito=False,
        datos=None,
        error="Ocurrió un error inesperado al procesar la solicitud. El evento ha sido registrado.",
        codigo_error="ERROR_INTERNO"
    )
