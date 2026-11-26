# [MOD-00] Versión compartida y edición de distribución de la aplicación
import os

EDICIONES_VALIDAS = ("operativa", "gestion")
OPERATIVA_VERSION = "2.18.1"
GESTION_VERSION = "2.19.0"
ROLES_GESTION = frozenset({"admin", "sub_admin", "core"})


def _resolver_edicion_inicial() -> str:
    try:
        from _build_edition import BUILD_EDITION
        candidata = str(BUILD_EDITION or "").strip().lower()
    except ImportError:
        candidata = os.environ.get("CHECK_DIARIO_EDITION", "gestion").strip().lower()
    return candidata if candidata in EDICIONES_VALIDAS else "gestion"


APP_EDITION = _resolver_edicion_inicial()


def obtener_version_edicion(edicion: str | None = None) -> str:
    """Retorna la versión SemVer correspondiente a la edición indicada."""
    objetivo = (edicion or APP_EDITION).strip().lower()
    return OPERATIVA_VERSION if objetivo == "operativa" else GESTION_VERSION


def es_rol_gestion(rol: str | None) -> bool:
    """Indica si el rol requiere los módulos de supervisión, RRHH o administración."""
    return str(rol or "").strip().lower() in ROLES_GESTION


def edicion_requerida_para_rol(rol: str | None, edicion_instalada: str | None = None) -> str:
    """Determina el canal de edición correspondiente al rol activo."""
    rol_norm = str(rol or "").strip().lower()
    if not rol_norm:
        actual = str(edicion_instalada or APP_EDITION).strip().lower()
        return actual if actual in EDICIONES_VALIDAS else "gestion"
    return "gestion" if es_rol_gestion(rol_norm) else "operativa"


APP_VERSION = obtener_version_edicion(APP_EDITION)
