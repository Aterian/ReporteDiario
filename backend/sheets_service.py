import os
import sys
import json
import re
import gspread
from gspread.utils import ValueInputOption
from google.oauth2.service_account import Credentials
from google.auth.exceptions import GoogleAuthError
from database import (
    obtener_pendientes_sincronizacion,
    marcar_como_sincronizados,
    obtener_directorio_datos,
    guardar_no_laborales_cache,
    calcular_dia_semana,
    es_fecha_feriado,
    normalizar_fecha_iso
)

def recurso_path(ruta_relativa: str) -> str:
    """Obtiene la ruta absoluta para un recurso, compatible con PyInstaller y desarrollo."""
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, ruta_relativa)

RUTA_CONFIG_USER = os.path.join(obtener_directorio_datos(), "config.json")
RUTA_CONFIG_BUNDLE = recurso_path("config.json")

COLUMNAS_ESQUEMA = [
    "id_asistencia",
    "empleado",
    "fecha",
    "tipo_ocf",
    "servicio",
    "horas",
    "instrumental",
    "usuario_mail",
    "fecha_hora",
    "dia_semana",
    "feriado",
    "id_empleado",
    "id_proyecto"
]

def cargar_configuracion():
    """Lee config.json desde AppData o desde los recursos empaquetados."""
    # 1. Intentar desde AppData (modificaciones del usuario)
    if os.path.exists(RUTA_CONFIG_USER):
        try:
            with open(RUTA_CONFIG_USER, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    # 2. Intentar desde el bundle o carpeta del backend
    if os.path.exists(RUTA_CONFIG_BUNDLE):
        try:
            with open(RUTA_CONFIG_BUNDLE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    return {
        "spreadsheet_id": "1IIZLcGELVTEpS5x9w1wqn2fHuh4O7wrAZj8zIgAbciE",
        "sheet_name": "1_asistencia_informada",
        "credentials_file": "app-xrbnwyhr6nmuvnylmuutjr43be-4baae45ec6b2.json"
    }

def guardar_configuracion(config: dict):
    """Guarda los parámetros de configuración en el directorio de usuario (AppData)."""
    try:
        with open(RUTA_CONFIG_USER, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Aviso al guardar config en AppData: {e}")

def extraer_spreadsheet_id(texto_o_url: str) -> str:
    """Extrae el ID del spreadsheet a partir de una URL completa o una clave pura."""
    if not texto_o_url:
        return ""
    texto = texto_o_url.strip()
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", texto)
    if match:
        return match.group(1)
    return texto

def buscar_archivo_credenciales(nombre_sugerido: str = "") -> str:
    """Busca el archivo de credenciales en el paquete o en directorios locales."""
    # 1. Buscar en recurso empaquetado o carpeta actual
    if nombre_sugerido:
        ruta_bundle = recurso_path(nombre_sugerido)
        if os.path.exists(ruta_bundle):
            return ruta_bundle

    # 2. Buscar en directorio base de ejecución
    base_dir = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    if os.path.exists(base_dir):
        for archivo in os.listdir(base_dir):
            if archivo.endswith(".json") and not archivo.startswith("config") and not archivo.startswith("pyright"):
                ruta_cand = os.path.join(base_dir, archivo)
                try:
                    with open(ruta_cand, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if data.get("type") == "service_account":
                            return ruta_cand
                except Exception:
                    continue
    return ""


def obtener_cliente():
    """Crea una instancia autorizada de gspread Client usando la cuenta de servicio."""
    config = cargar_configuracion()
    ruta_cred = buscar_archivo_credenciales(config.get("credentials_file", ""))
    
    if not ruta_cred or not os.path.exists(ruta_cred):
        raise FileNotFoundError("No se encontró el archivo JSON de credenciales de la cuenta de servicio.")

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    credentials = Credentials.from_service_account_file(ruta_cred, scopes=scopes)
    gc = gspread.Client(auth=credentials)
    return gc, ruta_cred

def obtener_hoja_trabajo(spreadsheet_id: str = "", sheet_name: str = ""):
    """Abre el libro y la hoja especificada, creando los encabezados si está vacía."""
    config = cargar_configuracion()
    sp_id = extraer_spreadsheet_id(spreadsheet_id or config.get("spreadsheet_id", ""))
    s_name = sheet_name or config.get("sheet_name", "1_asistencia_informada")

    if not sp_id:
        raise ValueError("El ID o enlace del Google Sheet no está configurado.")

    gc, _ = obtener_cliente()
    try:
        sh = gc.open_by_key(sp_id)
    except Exception as e:
        str_err = str(e)
        if "APIError: [403]" in str_err and "Google Sheets API" in str_err:
            raise RuntimeError(
                "La API de Google Sheets no está habilitada en el proyecto de Google Cloud. "
                "Por favor actívala en Google Cloud Console."
            ) from e
        raise

    # Intentar obtener la pestaña requerida
    try:
        ws = sh.worksheet(s_name)
    except gspread.exceptions.WorksheetNotFound:
        # Si no existe por nombre exacto, buscar sin distinguir mayúsculas/minúsculas
        hojas_disponibles = [w.title for w in sh.worksheets()]
        encontrada = None
        for h in hojas_disponibles:
            if h.strip().lower() == s_name.strip().lower():
                encontrada = h
                break
        if encontrada:
            ws = sh.worksheet(encontrada)
        else:
            raise ValueError(
                f"No se encontró la pestaña '{s_name}' en el libro '{sh.title}'. "
                f"Pestañas disponibles: {', '.join(hojas_disponibles)}"
            )

    # Verificar encabezados: si la hoja está vacía, creamos la fila 1 completa
    try:
        fila_1 = ws.row_values(1)
        if not fila_1 or len(fila_1) == 0:
            ws.append_row(COLUMNAS_ESQUEMA, value_input_option=ValueInputOption.user_entered)
        else:
            headers_limpios = [str(c).strip().lower() for c in fila_1]
            if "id_empleado" not in headers_limpios:
                # Agregar columnas L y M al encabezado existente
                ws.update(range_name="L1:M1", values=[["id_empleado", "id_proyecto"]], value_input_option=ValueInputOption.user_entered)
    except Exception as e:
        print(f"Aviso al verificar encabezados: {e}")

    return sh, ws

def probar_conexion(spreadsheet_id: str = "") -> dict:
    """Verifica la conectividad con la cuenta de servicio y la hoja de Google Sheets."""
    try:
        config = cargar_configuracion()
        sp_id = extraer_spreadsheet_id(spreadsheet_id or config.get("spreadsheet_id", ""))
        
        if not sp_id:
            return {
                "exito": False,
                "error": "Debe indicar el ID o enlace de la hoja de Google Sheets."
            }

        sh, ws = obtener_hoja_trabajo(spreadsheet_id=sp_id)
        cantidad_filas = ws.row_count

        return {
            "exito": True,
            "mensaje": f"Conexión exitosa con el libro '{sh.title}' y la pestaña '{ws.title}'.",
            "libro_titulo": sh.title,
            "pestaña_titulo": ws.title,
            "filas": cantidad_filas
        }
    except Exception as e:
        return {
            "exito": False,
            "error": str(e)
        }

def obtener_no_laborales_remotos(spreadsheet_id: str = "") -> list:
    """
    Lee los días no laborales de la pestaña '0_no_laborales' (o '0_no_laborables').
    Retorna lista de diccionarios: [{'id_no_laborable': ..., 'fecha': ..., 'motivo': ...}, ...]
    y actualiza la caché local SQLite.
    """
    try:
        config = cargar_configuracion()
        sp_id = extraer_spreadsheet_id(spreadsheet_id or config.get("spreadsheet_id", ""))
        if not sp_id:
            return []

        gc, _ = obtener_cliente()
        sh = gc.open_by_key(sp_id)

        ws_nl = None
        for w in sh.worksheets():
            tit = w.title.strip().lower()
            if "no_labora" in tit:
                ws_nl = w
                break

        if not ws_nl:
            return []

        filas = ws_nl.get_all_values()
        if not filas or len(filas) < 2:
            return []

        headers = [h.strip().lower() for h in filas[0]]
        idx_fecha = headers.index("fecha") if "fecha" in headers else 1
        idx_motivo = headers.index("motivo") if "motivo" in headers else 2
        idx_id = headers.index("id_no_laborable") if "id_no_laborable" in headers else 0

        resultado = []
        for f in filas[1:]:
            if len(f) > idx_fecha and f[idx_fecha].strip():
                resultado.append({
                    "id_no_laborable": f[idx_id].strip() if len(f) > idx_id else "",
                    "fecha": f[idx_fecha].strip(),
                    "motivo": f[idx_motivo].strip() if len(f) > idx_motivo else ""
                })
        if resultado:
            guardar_no_laborales_cache(resultado)
        return resultado
    except Exception as e:
        print(f"Aviso al obtener días no laborales remotos: {e}")
        return []


def sincronizar_pendientes() -> dict:
    """
    Lee los registros con sincronizado=0 de la base local y los sube/actualiza
    en la hoja '1_asistencia_informada' con las 11 columnas completas.
    """
    config = cargar_configuracion()
    sp_id = config.get("spreadsheet_id", "").strip()

    if not sp_id:
        return {
            "exito": False,
            "error": "No se ha configurado el ID del Google Sheet para la sincronización."
        }

    pendientes = obtener_pendientes_sincronizacion()
    if not pendientes:
        return {
            "exito": True,
            "cantidad": 0,
            "mensaje": "No hay reportes pendientes de sincronización."
        }

    try:
        # Refrescar caché de días no laborales
        fechas_feriados = set()
        try:
            nl = obtener_no_laborales_remotos(sp_id)
            fechas_feriados = {normalizar_fecha_iso(x["fecha"]) for x in nl if x.get("fecha")}
        except Exception:
            pass

        _, ws = obtener_hoja_trabajo()

        filas_a_insertar = []
        ids_sincronizados = []

        # Si hay registros modificados, mapear columna A para actualización in-place
        hay_modificados = any(p.get("modificado") == 1 for p in pendientes)
        mapa_filas_remotas = {}
        if hay_modificados:
            try:
                col_ids = ws.col_values(1)
                for idx, val in enumerate(col_ids, start=1):
                    if val and val != "id_asistencia":
                        mapa_filas_remotas[str(val).strip()] = idx
            except Exception as e:
                print(f"Aviso al leer col_ids para actualización: {e}")

        for p in pendientes:
            f_str = str(p.get("fecha", ""))
            dia_sem = p.get("dia_semana") or calcular_dia_semana(f_str)
            fer = p.get("feriado") or es_fecha_feriado(f_str, fechas_feriados)

            fila = [
                str(p.get("id_asistencia", "")),
                str(p.get("empleado", "")),
                f_str,
                str(p.get("tipo_ocf", "")),
                str(p.get("servicio", "")),
                float(p.get("horas", 0.0)),
                str(p.get("instrumental", "")),
                str(p.get("usuario_mail", "")),
                str(p.get("fecha_hora", "")),
                dia_sem,
                fer,
                str(p.get("id_empleado", "")),
                str(p.get("id_proyecto", ""))
            ]

            uid = p.get("id_asistencia")
            es_modificado = (p.get("modificado") == 1)

            if es_modificado and uid in mapa_filas_remotas:
                # Actualizar la fila existente en Google Sheets (columnas A a M)
                row_num = mapa_filas_remotas[uid]
                ws.update(range_name=f"A{row_num}:M{row_num}", values=[fila], value_input_option=ValueInputOption.user_entered)
                ids_sincronizados.append(uid)
            else:
                filas_a_insertar.append(fila)
                ids_sincronizados.append(uid)

        # Inserción en lote en Google Sheets de filas nuevas
        if filas_a_insertar:
            ws.append_rows(filas_a_insertar, value_input_option=ValueInputOption.user_entered)

        # Marcar en la base local como sincronizados
        marcar_como_sincronizados(ids_sincronizados)

        total = len(ids_sincronizados)
        return {
            "exito": True,
            "cantidad": total,
            "mensaje": f"Se sincronizaron exitosamente {total} registro(s) con Google Sheets."
        }

    except Exception as e:
        print(f"Error al sincronizar con Google Sheets: {e}")
        return {
            "exito": False,
            "error": str(e)
        }

def eliminar_registro_remoto(id_asistencia: str) -> bool:
    """
    Busca y elimina la fila en '1_asistencia_informada' cuyo id_asistencia (columna A)
    coincida con el proporcionado.
    """
    if not id_asistencia:
        return False
    try:
        _, ws = obtener_hoja_trabajo()
        col_ids = ws.col_values(1)
        target = str(id_asistencia).strip()
        for idx, val in enumerate(col_ids, start=1):
            if val and str(val).strip() == target:
                ws.delete_rows(idx)
                print(f"[Sheets] Fila {idx} eliminada con éxito para id_asistencia={id_asistencia}")
                return True
        return False
    except Exception as e:
        print(f"[Sheets] Error al eliminar registro remoto ({id_asistencia}): {e}")
        return False


def obtener_proyectos_remotos(spreadsheet_id: str = "") -> list:
    """
    Lee los proyectos activos de la pestaña '0_proyectos'.
    Retorna lista de diccionarios: [{'id_proyecto': ..., 'denominacion': ..., 'area': ...}, ...]
    """
    try:
        sh, _ = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="0_proyectos")
        ws_p = sh.worksheet("0_proyectos")
        filas = ws_p.get_all_records()
        proyectos = []
        for f in filas:
            denom = str(f.get("denominacion", "")).strip()
            area = str(f.get("area", "")).strip()
            id_p = str(f.get("id_proyecto", "")).strip()
            if denom:
                proyectos.append({
                    "id_proyecto": id_p,
                    "denominacion": denom,
                    "area": area
                })
        return proyectos
    except Exception as e:
        print(f"[Sheets] Error al obtener proyectos remotos: {e}")
        return []


def obtener_usuarios_remotos(spreadsheet_id: str = "") -> list:
    """
    Lee los usuarios autorizados de la pestaña '0_usuarios'.
    Retorna lista de diccionarios: [{'id_usuario': ..., 'nombre': ..., 'email': ..., 'area': ..., 'dni': ...}, ...]
    """
    try:
        sh, _ = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="0_usuarios")
        ws_u = sh.worksheet("0_usuarios")
        filas = ws_u.get_all_records()
        usuarios = []
        for f in filas:
            nom = str(f.get("nombre", "")).strip()
            dni = str(f.get("dni", "")).strip()
            area = str(f.get("area", "")).strip()
            email = str(f.get("email", "")).strip()
            id_u = str(f.get("id_usuario", "")).strip()
            id_orig = str(f.get("id_origen", "")).strip()
            if nom and dni:
                usuarios.append({
                    "id_usuario": id_u,
                    "id_origen": id_orig,
                    "nombre": nom,
                    "email": email,
                    "area": area,
                    "dni": dni
                })
        return usuarios
    except Exception as e:
        print(f"[Sheets] Error al obtener usuarios remotos: {e}")
        return []


def obtener_ids_asistencia_remotos(spreadsheet_id: str = "") -> set:
    """
    Obtiene el conjunto de todos los id_asistencia existentes en '1_asistencia_informada'.
    Permite verificar qué registros fueron eliminados de Google Sheets.
    """
    try:
        sh, ws = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="1_asistencia_informada")
        valores_col = ws.col_values(1)
        # Omitimos el encabezado 'id_asistencia'
        ids = {str(v).strip() for v in valores_col[1:] if str(v).strip()}
        return ids
    except Exception as e:
        print(f"[Sheets] Error al obtener IDs de asistencia remotos: {e}")
        return set()

