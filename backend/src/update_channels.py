# [FN-03.06] Resolución de canales de actualización por rol, proxy privado y crossgrade de edición
import json
import os
import re
import ssl
import sys
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

from app_paths import directorio_sesion
from app_version import APP_EDITION, APP_VERSION, edicion_requerida_para_rol

ASSET_OPERATIVA = "CheckDiarioIngeap.exe"
ASSET_GESTION = "CheckDiarioIngeap_Gestion.exe"
CACHE_TTL_SEGUNDOS = 15 * 60
DEFAULT_UPDATE_SERVICE_URL = ""

_cache_lock = threading.Lock()
_cache_actualizaciones: dict[tuple[str, ...], tuple[float, dict]] = {}
_metadatos_descarga: dict[str, str] = {}


def limpiar_cache_actualizaciones() -> None:
    """Invalida el caché en memoria de consultas de actualización y hashes asociados."""
    with _cache_lock:
        _cache_actualizaciones.clear()
        _metadatos_descarga.clear()


def obtener_url_servicio_actualizaciones() -> str:
    """Resuelve la URL HTTPS del proxy de actualizaciones (entorno o default de compilación)."""
    bruta = os.environ.get("UPDATE_SERVICE_URL", "").strip()
    if not bruta:
        bruta = str(DEFAULT_UPDATE_SERVICE_URL or "").strip()
    if not bruta:
        return ""
    p = urllib.parse.urlparse(bruta)
    if p.scheme != "https" or not p.hostname or p.username or p.password:
        return ""
    return bruta.rstrip("/")


def es_url_proxy_actualizaciones(url: str) -> bool:
    """Indica si una URL apunta al endpoint de assets del proxy configurado."""
    base = obtener_url_servicio_actualizaciones()
    if not base:
        return False
    p_base = urllib.parse.urlparse(base)
    p_url = urllib.parse.urlparse(str(url or "").strip())
    if p_url.scheme != "https" or p_url.username or p_url.password:
        return False
    if (p_url.hostname, p_url.port) != (p_base.hostname, p_base.port):
        return False
    prefijo = (p_base.path.rstrip("/") + "/v1/updates/assets/")
    return p_url.path.startswith(prefijo)


def _registrar_sha256_descarga(url: str, sha256: str) -> None:
    limpio = str(sha256 or "").strip().lower()
    if url and re.fullmatch(r"[0-9a-f]{64}", limpio):
        with _cache_lock:
            _metadatos_descarga[url] = limpio


def obtener_sha256_descarga(url: str) -> str:
    """Retorna el hash SHA-256 esperado registrado para una URL de descarga si existe."""
    with _cache_lock:
        return _metadatos_descarga.get(str(url or "").strip(), "")


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


def leer_contexto_sesion_actual() -> tuple[str | None, str | None]:
    """Obtiene (id_usuario, rol_app) desde memoria o sesión local sin bloquear ni importar BD."""
    pg = sys.modules.get("postgres_repository")
    if pg is not None:
        bloqueo = getattr(pg, "_sesion_lock", None)
        if bloqueo is not None:
            with bloqueo:
                datos = getattr(pg, "_sesion", None)
        else:
            datos = getattr(pg, "_sesion", None)
        if isinstance(datos, dict):
            uid = str(datos.get("id_usuario") or "").strip() or None
            rol = str(datos.get("rol_app") or "").strip().lower() or None
            if uid or rol:
                return uid, rol

    if os.environ.get("PYTEST_CURRENT_TEST") and not os.environ.get("CHECK_DIARIO_SESSION_FILE"):
        return None, None

    try:
        ruta_env = os.environ.get("CHECK_DIARIO_SESSION_FILE")
        ruta = Path(ruta_env).resolve() if ruta_env else (directorio_sesion() / "sesion_activa.json")
        if not ruta.is_file() or ruta.is_symlink():
            return None, None
        contenido = json.loads(ruta.read_text(encoding="utf-8"))
        if isinstance(contenido, dict):
            uid = str(contenido.get("id_usuario") or "").strip() or None
            rol = str(contenido.get("rol_app") or "").strip().lower() or None
            return uid, rol
    except Exception:
        return None, None
    return None, None


def leer_rol_sesion_actual() -> str | None:
    """Obtiene el rol activo desde memoria o sesión local sin bloquear ni importar BD."""
    _, rol = leer_contexto_sesion_actual()
    return rol


def _extraer_sha256_asset(asset: dict) -> str:
    raw = str(asset.get("digest") or "").strip().lower()
    if raw.startswith("sha256:"):
        raw = raw[len("sha256:"):]
    return raw if re.fullmatch(r"[0-9a-f]{64}", raw) else ""


def _buscar_asset(assets: list, nombre: str) -> tuple[str, str]:
    for asset in assets or []:
        if isinstance(asset, dict) and asset.get("name") == nombre:
            return str(asset.get("browser_download_url") or ""), _extraer_sha256_asset(asset)
    return "", ""


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
            url_descarga, sha256 = _buscar_asset(assets, ASSET_OPERATIVA)
        else:
            url_descarga, sha256 = _buscar_asset(assets, ASSET_GESTION)
            if not url_descarga and es_tag_gestion:
                url_descarga, sha256 = _buscar_asset(assets, ASSET_OPERATIVA)
        if not url_descarga:
            continue
        candidatos.append({
            "version": version_remota,
            "url_descarga": url_descarga,
            "sha256": sha256,
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

    url_final = mejor["url_descarga"] if (disponible and mejor) else ""
    sha_final = mejor["sha256"] if (disponible and mejor) else ""
    if url_final and sha_final:
        _registrar_sha256_descarga(url_final, sha_final)

    return {
        "actualizacion_disponible": disponible,
        "version_actual": version_instalada,
        "edicion_actual": edicion_actual,
        "edicion_objetivo": edicion_objetivo,
        "cambio_edicion": cambio_edicion,
        "version_nueva": mejor["version"] if mejor else "",
        "notas": mejor["notas"] if mejor else "",
        "url_descarga": url_final,
        "sha256": sha_final,
        "verificacion_exitosa": True,
    }


def _consultar_actualizacion_proxy(
    *,
    servicio_url: str,
    forzar: bool,
    id_usuario: str | None,
    rol: str | None,
    edicion_actual: str,
    ver_actual: str,
    edicion_objetivo: str,
) -> dict:
    if not id_usuario:
        return {
            "actualizacion_disponible": False,
            "version_actual": ver_actual,
            "edicion_actual": edicion_actual,
            "edicion_objetivo": edicion_objetivo,
            "cambio_edicion": False,
            "verificacion_exitosa": True,
        }

    usar_cache = not forzar and not os.environ.get("PYTEST_CURRENT_TEST")
    clave_cache = ("proxy", servicio_url, id_usuario, str(rol or ""), edicion_actual, ver_actual)
    if usar_cache:
        with _cache_lock:
            entrada = _cache_actualizaciones.get(clave_cache)
            if entrada and (time.monotonic() - entrada[0]) < CACHE_TTL_SEGUNDOS:
                return dict(entrada[1])

    import postgres_repository as pg
    token = pg.emitir_token_actualizacion(id_usuario, proposito="check")
    query = urllib.parse.urlencode({
        "edition": edicion_actual,
        "version": ver_actual,
        "force": "true" if forzar else "false",
    })
    url = f"{servicio_url}/v1/updates/check?{query}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": f"CheckDiarioIngeap/{ver_actual}",
            "Accept": "application/json",
        },
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
        data = json.loads(response.read().decode("utf-8"))

    if not isinstance(data, dict):
        raise ValueError("Respuesta inválida del servicio de actualizaciones.")

    disponible = bool(data.get("actualizacion_disponible"))
    url_descarga = str(data.get("url_descarga") or "").strip()
    if url_descarga.startswith("/"):
        url_descarga = f"{servicio_url}{url_descarga}"
    if disponible and not es_url_proxy_actualizaciones(url_descarga):
        raise ValueError("El servicio devolvió una URL de descarga fuera del origen autorizado.")

    sha256 = str(data.get("sha256") or "").strip().lower()
    if sha256 and not re.fullmatch(r"[0-9a-f]{64}", sha256):
        sha256 = ""
    if disponible and url_descarga and sha256:
        _registrar_sha256_descarga(url_descarga, sha256)

    resultado = {
        "actualizacion_disponible": disponible,
        "version_actual": str(data.get("version_actual") or ver_actual),
        "edicion_actual": str(data.get("edicion_actual") or edicion_actual),
        "edicion_objetivo": str(data.get("edicion_objetivo") or edicion_objetivo),
        "cambio_edicion": bool(data.get("cambio_edicion")),
        "version_nueva": str(data.get("version_nueva") or ""),
        "notas": str(data.get("notas") or ""),
        "url_descarga": url_descarga if disponible else "",
        "sha256": sha256 if disponible else "",
        "verificacion_exitosa": True,
    }
    if usar_cache:
        with _cache_lock:
            _cache_actualizaciones[clave_cache] = (time.monotonic(), dict(resultado))
    return resultado


def consultar_actualizacion_github(
    *,
    forzar: bool = False,
    rol_usuario: str | None = None,
    edicion_instalada: str | None = None,
    version_instalada: str | None = None,
) -> dict:
    """Consulta el proxy autenticado (si está configurado) o GitHub Releases con caché de 15 minutos."""
    edicion_actual = (edicion_instalada or APP_EDITION).strip().lower()
    ver_actual = version_instalada or APP_VERSION
    id_sesion, rol_sesion = leer_contexto_sesion_actual()
    rol = rol_usuario if rol_usuario is not None else rol_sesion
    edicion_objetivo = edicion_requerida_para_rol(rol, edicion_actual)

    try:
        servicio_url = obtener_url_servicio_actualizaciones()
        if servicio_url:
            return _consultar_actualizacion_proxy(
                servicio_url=servicio_url,
                forzar=forzar,
                id_usuario=id_sesion,
                rol=rol,
                edicion_actual=edicion_actual,
                ver_actual=ver_actual,
                edicion_objetivo=edicion_objetivo,
            )

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
        clave_cache = ("github", repo, str(rol or ""), edicion_actual, ver_actual)
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
