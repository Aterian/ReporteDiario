# [FN-03.08] Lógica pura de canales, validación de assets y seguridad para el proxy de actualizaciones
import hashlib
import re
import urllib.parse

EDICIONES_VALIDAS = ("operativa", "gestion")
ROLES_GESTION = frozenset({"admin", "sub_admin", "core"})
ASSET_OPERATIVA = "CheckDiarioIngeap.exe"
ASSET_GESTION = "CheckDiarioIngeap_Gestion.exe"
ASSETS_PERMITIDOS = frozenset({ASSET_OPERATIVA, ASSET_GESTION})
DOMINIOS_REDIRECT_GITHUB = frozenset({
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "github-releases.githubusercontent.com",
})


def hash_token(token: str) -> str:
    """Calcula el digest SHA-256 hexadecimal del token efímero recibido por Bearer."""
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


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


def edicion_requerida_para_rol(rol: str | None, edicion_instalada: str | None = None) -> str:
    """Determina la edición objetivo según el rol autoritativo leído de PostgreSQL."""
    rol_norm = str(rol or "").strip().lower()
    if not rol_norm:
        actual = str(edicion_instalada or "operativa").strip().lower()
        return actual if actual in EDICIONES_VALIDAS else "operativa"
    return "gestion" if rol_norm in ROLES_GESTION else "operativa"


def extraer_sha256_asset(asset: dict) -> str:
    """Extrae SHA-256 hexadecimal de 64 caracteres desde el campo digest de GitHub si existe."""
    if not isinstance(asset, dict):
        return ""
    raw = str(asset.get("digest") or "").strip().lower()
    if raw.startswith("sha256:"):
        raw = raw[len("sha256:"):]
    return raw if re.fullmatch(r"[0-9a-f]{64}", raw) else ""


def _buscar_asset_info(assets: list, nombre: str) -> dict | None:
    for asset in assets or []:
        if not isinstance(asset, dict) or asset.get("name") != nombre:
            continue
        asset_id = asset.get("id")
        if isinstance(asset_id, int) and asset_id > 0:
            return {
                "id": asset_id,
                "name": nombre,
                "sha256": extraer_sha256_asset(asset),
            }
    return None


def seleccionar_actualizacion_proxy(
    releases: list[dict],
    *,
    rol_usuario: str | None,
    edicion_instalada: str,
    version_instalada: str,
    base_url: str,
) -> dict:
    """Selecciona el release aplicable y construye la URL de descarga a través del proxy."""
    edicion_actual = (edicion_instalada or "operativa").strip().lower()
    if edicion_actual not in EDICIONES_VALIDAS:
        edicion_actual = "operativa"
    edicion_objetivo = edicion_requerida_para_rol(rol_usuario, edicion_actual)
    base = str(base_url or "").strip().rstrip("/")

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
            asset_info = _buscar_asset_info(assets, ASSET_OPERATIVA)
        else:
            asset_info = _buscar_asset_info(assets, ASSET_GESTION)
            if not asset_info and es_tag_gestion:
                asset_info = _buscar_asset_info(assets, ASSET_OPERATIVA)
        if not asset_info:
            continue
        candidatos.append({
            "version": version_remota,
            "asset_id": asset_info["id"],
            "sha256": asset_info["sha256"],
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

    ruta_asset = f"/v1/updates/assets/{mejor['asset_id']}" if (disponible and mejor) else ""
    url_descarga = f"{base}{ruta_asset}" if (ruta_asset and base) else ruta_asset

    return {
        "actualizacion_disponible": disponible,
        "version_actual": version_instalada,
        "edicion_actual": edicion_actual,
        "edicion_objetivo": edicion_objetivo,
        "cambio_edicion": cambio_edicion,
        "version_nueva": mejor["version"] if mejor else "",
        "notas": mejor["notas"] if mejor else "",
        "url_descarga": url_descarga,
        "sha256": mejor["sha256"] if (disponible and mejor) else "",
        "verificacion_exitosa": True,
    }


def asset_autorizado_para_rol(releases: list[dict], asset_id: int, rol_usuario: str | None) -> bool:
    """Verifica que asset_id corresponda a un release publicado y permitido para el rol."""
    if not isinstance(asset_id, int) or asset_id <= 0:
        return False
    edicion_objetivo = edicion_requerida_para_rol(rol_usuario)
    for rel in releases or []:
        if not isinstance(rel, dict) or rel.get("draft"):
            continue
        version_remota, es_tag_gestion = extraer_info_tag(rel.get("tag_name", ""))
        if not version_remota:
            continue
        if edicion_objetivo == "operativa" and (rel.get("prerelease") or es_tag_gestion):
            continue
        for asset in rel.get("assets") or []:
            if not isinstance(asset, dict) or asset.get("id") != asset_id:
                continue
            nombre = str(asset.get("name") or "")
            if nombre not in ASSETS_PERMITIDOS:
                return False
            if edicion_objetivo == "operativa":
                return nombre == ASSET_OPERATIVA
            if nombre == ASSET_GESTION:
                return True
            return bool(es_tag_gestion and nombre == ASSET_OPERATIVA)
    return False


def validar_destino_redirect_github(url: str) -> str:
    """Valida que el redirect emitido por GitHub apunte exclusivamente a su CDN HTTPS oficial."""
    p = urllib.parse.urlparse(str(url or "").strip())
    if p.scheme != "https" or p.hostname not in DOMINIOS_REDIRECT_GITHUB or p.username or p.password:
        raise ValueError("El destino de descarga devuelto por GitHub no pertenece a un host autorizado.")
    return str(url).strip()
