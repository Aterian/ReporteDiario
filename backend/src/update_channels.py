# [FN-03.06] Resolución de canales de actualización por rol y crossgrade de edición
import json
import os
import re
import ssl
import sys
import threading
import time
import urllib.request
from pathlib import Path

from app_paths import directorio_sesion
from app_version import APP_EDITION, APP_VERSION, edicion_requerida_para_rol

ASSET_OPERATIVA = "CheckDiarioIngeap.exe"
ASSET_GESTION = "CheckDiarioIngeap_Gestion.exe"
CACHE_TTL_SEGUNDOS = 15 * 60

_cache_lock = threading.Lock()
_cache_actualizaciones: dict[tuple[str, str, str, str], tuple[float, dict]] = {}


def limpiar_cache_actualizaciones() -> None:
    """Invalida el caché en memoria de consultas a GitHub Releases."""
    with _cache_lock:
        _cache_actualizaciones.clear()


def parsear_version(v_str: str) -> tuple[int, ...]:
    """Convierte una cadena SemVer en tupla comparable de enteros."""
    partes = []
    for segmento in str(v_str or "").split("."):
        coincidencia = re.match(r"^\s*(\d+)", segmento)
        partes.append(int(coincidencia.group(1)) if coincidencia else 0)
    return tuple(partes)


def extraer_info_tag(tag_name: str) -> tuple[str, bool]:
    """Extrae la versión SemVer y determina si el tag es exclusivo de Edición Gestión."""
    tag = str(tag_name or "").strip()
    if not tag:
        return "", False
    tag_lower = tag.lower()
    es_tag_gestion = False
    if tag_lower.startswith("gestion-v"):
        es_tag_gestion = True
        resto = tag[len("gestion-v"):]
    elif tag_lower.startswith("gestion-"):
        es_tag_gestion = True
        resto = tag[len("gestion-"):]
    elif tag_lower.startswith("v"):
        resto = tag[1:]
    else:
        resto = tag
    if resto.lower().endswith("-gestion"):
        es_tag_gestion = True
        resto = resto[:-len("-gestion")]
    resto = resto.strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", resto):
        return "", False
    return resto, es_tag_gestion


def leer_rol_sesion_actual() -> str | None:
    """Obtiene el rol activo desde memoria o sesión local sin bloquear ni importar BD."""
    pg = sys.modules.get("postgres_repository")
    if pg is not None:
        bloqueo = getattr(pg, "_sesion_lock", None)
        if bloqueo is not None:
            with bloqueo:
                datos = getattr(pg, "_sesion", None)
        else:
            datos = getattr(pg, "_sesion", None)
        if isinstance(datos, dict) and datos.get("rol_app"):
            return str(datos.get("rol_app")).strip().lower() or None

    if os.environ.get("PYTEST_CURRENT_TEST") and not os.environ.get("CHECK_DIARIO_SESSION_FILE"):
        return None

    try:
        ruta_env = os.environ.get("CHECK_DIARIO_SESSION_FILE")
        ruta = Path(ruta_env).resolve() if ruta_env else (directorio_sesion() / "sesion_activa.json")
        if not ruta.is_file() or ruta.is_symlink():
            return None
        contenido = json.loads(ruta.read_text(encoding="utf-8"))
        if isinstance(contenido, dict) and contenido.get("rol_app"):
            return str(contenido.get("rol_app")).strip().lower() or None
    except Exception:
        return None
    return None


def _buscar_asset(assets: list, nombre: str) -> str:
    for asset in assets or []:
        if isinstance(asset, dict) and asset.get("name") == nombre:
            return str(asset.get("browser_download_url") or "")
    return ""


def seleccionar_actualizacion_para_contexto(
    releases: list[dict],
    *,
    rol_usuario: str | None,
    edicion_instalada: str,
    version_instalada: str,
) -> dict:
    """Elige el release y asset aplicable según el rol y la edición instalada."""
    edicion_actual = (edicion_instalada or "gestion").strip().lower()
    if edicion_actual not in ("operativa", "gestion"):
        edicion_actual = "gestion"
    edicion_objetivo = edicion_requerida_para_rol(rol_usuario, edicion_actual)

    candidatos = []
    for rel in releases or []:
        if not isinstance(rel, dict) or rel.get("draft"):
            continue
        version_remota, es_tag_gestion = extraer_info_tag(rel.get("tag_name", ""))
        if not version_remota:
            continue
        assets = rel.get("assets") or []
        if edicion_objetivo == "operativa":
            if rel.get("prerelease") or es_tag_gestion:
                continue
            url_descarga = _buscar_asset(assets, ASSET_OPERATIVA)
        else:
            url_descarga = _buscar_asset(assets, ASSET_GESTION)
            if not url_descarga and es_tag_gestion:
                url_descarga = _buscar_asset(assets, ASSET_OPERATIVA)
        if not url_descarga:
            continue
        candidatos.append({
            "version": version_remota,
            "url_descarga": url_descarga,
            "notas": rel.get("body") or "Mejoras y correcciones en esta versión.",
            "clave": (parsear_version(version_remota), 1 if es_tag_gestion else 0),
        })

    mejor = max(candidatos, key=lambda c: c["clave"], default=None)
    disponible = False
    cambio_edicion = False
    if mejor:
        ver_remota_tupla = parsear_version(mejor["version"])
        ver_actual_tupla = parsear_version(version_instalada)
        if edicion_objetivo == "gestion" and edicion_actual == "operativa":
            disponible = ver_remota_tupla >= ver_actual_tupla
            cambio_edicion = disponible
        else:
            disponible = ver_remota_tupla > ver_actual_tupla
            cambio_edicion = bool(disponible and edicion_objetivo != edicion_actual)

    return {
        "actualizacion_disponible": disponible,
        "version_actual": version_instalada,
        "edicion_actual": edicion_actual,
        "edicion_objetivo": edicion_objetivo,
        "cambio_edicion": cambio_edicion,
        "version_nueva": mejor["version"] if mejor else "",
        "notas": mejor["notas"] if mejor else "",
        "url_descarga": mejor["url_descarga"] if (disponible and mejor) else "",
        "verificacion_exitosa": True,
    }


def consultar_actualizacion_github(
    *,
    forzar: bool = False,
    rol_usuario: str | None = None,
    edicion_instalada: str | None = None,
    version_instalada: str | None = None,
) -> dict:
    """Consulta GitHub Releases aplicando filtrado por rol y caché de 15 minutos."""
    edicion_actual = (edicion_instalada or APP_EDITION).strip().lower()
    ver_actual = version_instalada or APP_VERSION
    rol = rol_usuario if rol_usuario is not None else leer_rol_sesion_actual()
    edicion_objetivo = edicion_requerida_para_rol(rol, edicion_actual)

    try:
        repo = os.environ.get("GITHUB_REPO", "Aterian/ReporteDiario").strip()
        if not repo:
            return {
                "actualizacion_disponible": False,
                "version_actual": ver_actual,
                "edicion_actual": edicion_actual,
                "edicion_objetivo": edicion_objetivo,
                "cambio_edicion": False,
                "verificacion_exitosa": True,
            }

        usar_cache = not forzar and not os.environ.get("PYTEST_CURRENT_TEST")
        clave_cache = (repo, str(rol or ""), edicion_actual, ver_actual)
        if usar_cache:
            with _cache_lock:
                entrada = _cache_actualizaciones.get(clave_cache)
                if entrada and (time.monotonic() - entrada[0]) < CACHE_TTL_SEGUNDOS:
                    return dict(entrada[1])

        url = f"https://api.github.com/repos/{repo}/releases?per_page=15"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CheckDiarioIngeap-App",
                "Accept": "application/vnd.github.v3+json",
            },
        )
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=8, context=ctx) as response:
            data = json.loads(response.read().decode("utf-8"))

        releases = data if isinstance(data, list) else ([data] if isinstance(data, dict) else [])
        resultado = seleccionar_actualizacion_para_contexto(
            releases,
            rol_usuario=rol,
            edicion_instalada=edicion_actual,
            version_instalada=ver_actual,
        )
        if usar_cache:
            with _cache_lock:
                _cache_actualizaciones[clave_cache] = (time.monotonic(), dict(resultado))
        return resultado
    except Exception as exc:
        print(f"[AutoUpdate] Verificación de actualización remota falló: {exc}")
        return {
            "actualizacion_disponible": False,
            "version_actual": ver_actual,
            "edicion_actual": edicion_actual,
            "edicion_objetivo": edicion_objetivo,
            "cambio_edicion": False,
            "verificacion_exitosa": False,
            "error": str(exc),
        }
