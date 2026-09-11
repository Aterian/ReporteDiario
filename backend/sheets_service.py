import os
import sys
import json
import re
import gspread
from google.oauth2.service_account import Credentials
from google.auth.exceptions import GoogleAuthError
from database import obtener_pendientes_sincronizacion, marcar_como_sincronizados, obtener_directorio_datos

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
    "fecha_hora"
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

    # Verificar encabezados: si la hoja está completamente vacía, creamos la fila 1
    try:
        fila_1 = ws.row_values(1)
        if not fila_1 or len(fila_1) == 0:
            ws.append_row(COLUMNAS_ESQUEMA, value_input_option="USER_ENTERED")
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

def sincronizar_pendientes() -> dict:
    """
    Lee los registros con sincronizado=0 de la base local y los sube en bloque
    a la hoja '1_asistencia_informada'.
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
        _, ws = obtener_hoja_trabajo()

        filas_a_insertar = []
        ids_sincronizados = []

        for p in pendientes:
            fila = [
                str(p.get("id_asistencia", "")),
                str(p.get("empleado", "")),
                str(p.get("fecha", "")),
                str(p.get("tipo_ocf", "")),
                str(p.get("servicio", "")),
                float(p.get("horas", 0.0)),
                str(p.get("instrumental", "")),
                str(p.get("usuario_mail", "")),
                str(p.get("fecha_hora", ""))
            ]
            filas_a_insertar.append(fila)
            ids_sincronizados.append(p.get("id_asistencia"))

        # Inserción en lote en Google Sheets
        ws.append_rows(filas_a_insertar, value_input_option="USER_ENTERED")

        # Marcar en la base local como sincronizados
        marcar_como_sincronizados(ids_sincronizados)

        return {
            "exito": True,
            "cantidad": len(filas_a_insertar),
            "mensaje": f"Se sincronizaron exitosamente {len(filas_a_insertar)} registro(s) con Google Sheets."
        }

    except Exception as e:
        print(f"Error al sincronizar con Google Sheets: {e}")
        return {
            "exito": False,
            "error": str(e)
        }
