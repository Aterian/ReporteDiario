import os
import sys
import json
import re
import threading
import uuid       # <- REQUERIDO para generar identificadores únicos
import time       # <- REQUERIDO para pausas de seguridad en Google Sheets API

_sync_lock = threading.Lock()
import gspread
from gspread.utils import ValueInputOption, rowcol_to_a1
from google.oauth2.service_account import Credentials
from google.auth.exceptions import GoogleAuthError
from database import (
    obtener_conexion,
    reconstruir_rosters_desde_historial,
    obtener_pendientes_sincronizacion,
    marcar_como_sincronizados,
    obtener_directorio_datos,
    guardar_no_laborales_cache,
    calcular_dia_semana,
    es_fecha_feriado,
    normalizar_fecha_iso,
    obtener_modificaciones_pendientes,
    marcar_modificaciones_sincronizadas,
    obtener_modificaciones_pendientes_revisado,
    marcar_modificaciones_revisado_sincronizadas
)

def recurso_path(ruta_relativa: str) -> str:
    """Obtiene la ruta absoluta para un recurso, compatible con PyInstaller y desarrollo."""
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, ruta_relativa)

RUTA_CONFIG_USER = os.path.join(obtener_directorio_datos(), "config.json")
RUTA_CONFIG_BUNDLE = recurso_path("config.json")

# [FN-01.08] Configuración de la segunda hoja: CALCULO DE SUELDOS
ID_HOJA_SUELDOS_DEFAULT = "1rBLHa44JeBlqtkUfKg6WO1EFdiChhvgUTng8GpZQdJo"
TABLA_SUELDOS = "sueldos_empleados"

# [FN-03.05] Esquema de 18 columnas de la tabla 1_asistencia_informada
COLUMNAS_ESQUEMA = [
    "id_asistencia",
    "empleado",
    "fecha",
    "tipo_ocf",
    "servicio",
    "hora_inicio",
    "hora_fin",
    "horas",
    "instrumental",
    "usuario_mail",
    "fecha_hora",
    "dia_semana",
    "feriado",
    "id_empleado",
    "id_proyecto",
    "cargado_por",
    "tipo_costo",
    "costo_dia"
]

# [FN-02.01] Esquema de 11 columnas de la tabla 1_1_modificaciones_realizadas (Auditoría)
COLUMNAS_MODIFICACIONES = [
    "id_modificacion",
    "id_asistencia",
    "tipo_antes",
    "tipo_despues",
    "horas_antes",
    "horas_despues",
    "servicio_antes",
    "servicio_despues",
    "fecha_hora_modificaciones",
    "quien_modifica",
    "revisado"
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
        elif s_name.strip().lower() == "1_1_modificaciones_realizadas":
            # [FN-02.01] Crear automáticamente la pestaña de auditoría si no existe en el libro
            try:
                ws = sh.add_worksheet(title="1_1_modificaciones_realizadas", rows=1000, cols=11)
                ws.append_row(COLUMNAS_MODIFICACIONES, value_input_option=ValueInputOption.user_entered)
            except Exception as e_add:
                raise ValueError(f"No se pudo crear la pestaña '1_1_modificaciones_realizadas': {e_add}")
        else:
            raise ValueError(
                f"No se encontró la pestaña '{s_name}' en el libro '{sh.title}'. "
                f"Pestañas disponibles: {', '.join(hojas_disponibles)}"
            )

    # Verificar encabezados: en '1_asistencia_informada' y '1_1_modificaciones_realizadas'
    try:
        es_hoja_asistencia = (s_name.strip().lower() == "1_asistencia_informada")
        es_hoja_modificaciones = (s_name.strip().lower() == "1_1_modificaciones_realizadas")
        if es_hoja_asistencia:
            fila_1 = ws.row_values(1)
            if not fila_1 or len(fila_1) == 0:
                ws.append_row(COLUMNAS_ESQUEMA, value_input_option=ValueInputOption.user_entered)
            else:
                headers_limpios = [c.strip().lower() for c in fila_1]
                if "hora_inicio" not in headers_limpios or "tipo_costo" not in headers_limpios or "costo_dia" not in headers_limpios:
                    ws.update(range_name="A1:R1", values=[COLUMNAS_ESQUEMA], value_input_option=ValueInputOption.user_entered)
        elif es_hoja_modificaciones:
            fila_1 = ws.row_values(1)
            if not fila_1 or len(fila_1) == 0:
                ws.append_row(COLUMNAS_MODIFICACIONES, value_input_option=ValueInputOption.user_entered)
            else:
                headers_limpios = [c.strip().lower() for c in fila_1]
                if "revisado" not in headers_limpios:
                    col_idx_rev = len(fila_1) + 1
                    try:
                        celda_rev = rowcol_to_a1(1, col_idx_rev)
                        ws.update(range_name=celda_rev, values=[["revisado"]], value_input_option=ValueInputOption.user_entered)
                    except Exception as e_hrev:
                        print(f"Aviso al agregar encabezado 'revisado': {e_hrev}")
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


# [FN-03.05] Construcción de fila dinámica según esquema de columnas de la hoja
def construir_fila_asistencia(registro: dict, headers: list | None = None) -> list:
    """Construye la lista de valores para la fila alineada a los encabezados presentes en la hoja."""
    emp = str(registro.get("empleado", "")).strip()
    f_str = str(registro.get("fecha", "")).strip()
    dia_sem = registro.get("dia_semana") or calcular_dia_semana(f_str)
    fer = registro.get("feriado") or es_fecha_feriado(f_str)
    serv = str(registro.get("servicio", "")).strip()
    carg_por = str(registro.get("cargado_por") or emp).strip()
    uid = str(registro.get("id_asistencia", "")).strip()
    tipo_ocf = str(registro.get("tipo_ocf", "")).strip()
    try:
        horas_val = float(registro.get("horas", 0.0))
    except (ValueError, TypeError):
        horas_val = 0.0
    hora_ini = str(registro.get("hora_inicio", "")).strip()
    hora_fin = str(registro.get("hora_fin", "")).strip()
    costo = str(registro.get("tipo_costo", "")).strip()
    try:
        costo_dia_val = round(float(registro.get("costo_dia", 0.0) or 0.0), 2)
    except (ValueError, TypeError):
        costo_dia_val = 0.0

    mapa_valores = {
        "id_asistencia": uid,
        "empleado": emp,
        "fecha": f_str,
        "tipo_ocf": tipo_ocf,
        "servicio": serv,
        "hora_inicio": hora_ini,
        "hora_fin": hora_fin,
        "horas": horas_val,
        "instrumental": str(registro.get("instrumental", "")),
        "usuario_mail": str(registro.get("usuario_mail", "")),
        "fecha_hora": str(registro.get("fecha_hora", "")),
        "dia_semana": dia_sem,
        "feriado": fer,
        "id_empleado": str(registro.get("id_empleado", "")),
        "id_proyecto": str(registro.get("id_proyecto", "")),
        "cargado_por": carg_por,
        "tipo_costo": costo,
        "costo_dia": costo_dia_val
    }

    if not headers:
        return [mapa_valores.get(col, "") for col in COLUMNAS_ESQUEMA]

    return [mapa_valores.get(h.strip().lower(), "") for h in headers]

# [FN-02.01] Sincronizar auditoría de modificaciones realizadas con Google Sheets
def sincronizar_modificaciones_pendientes() -> dict:
    """Sube a la hoja '1_1_modificaciones_realizadas' de Google Sheets los registros de auditoría pendientes."""
    pendientes = obtener_modificaciones_pendientes()
    if not pendientes:
        # Si no hay nuevas modificaciones por insertar, verificar si hay estados de 'revisado' pendientes por sincronizar
        actualizar_revisado_en_sheets()
        return {"exito": True, "cantidad": 0}
    try:
        _, ws = obtener_hoja_trabajo(sheet_name="1_1_modificaciones_realizadas")
        filas = []
        ids_exitosos = []
        for p in pendientes:
            rev_val = "OK" if int(p.get("revisado") or 0) == 1 else ""
            fila = [
                str(p.get("id_modificacion", "")),
                str(p.get("id_asistencia", "")),
                str(p.get("tipo_antes", "")),
                str(p.get("tipo_despues", "")),
                float(p.get("horas_antes", 0.0)),
                float(p.get("horas_despues", 0.0)),
                str(p.get("servicio_antes", "")),
                str(p.get("servicio_despues", "")),
                str(p.get("fecha_hora_modificaciones", "")),
                str(p.get("quien_modifica", "")),
                rev_val
            ]
            filas.append(fila)
            ids_exitosos.append(p["id_modificacion"])

        if filas:
            ws.append_rows(filas, value_input_option=ValueInputOption.user_entered)
            marcar_modificaciones_sincronizadas(ids_exitosos)
            marcar_modificaciones_revisado_sincronizadas(ids_exitosos)
            print(f"[Sheets] Se registraron {len(filas)} modificaciones en '1_1_modificaciones_realizadas'.")

        # Asegurar además que cualquier actualización previa de 'revisado' pendiente impacte
        actualizar_revisado_en_sheets()
        return {"exito": True, "cantidad": len(filas)}
    except Exception as e:
        print(f"[Sheets] Error al sincronizar modificaciones en Google Sheets: {e}")
        return {"exito": False, "error": str(e)}

# [FN-02.02] Sincronizar estado revisado ('OK') en Google Sheets '1_1_modificaciones_realizadas'
def actualizar_revisado_en_sheets(ids_modificacion: list = None) -> dict:
    """
    Escribe 'OK' en la columna 'revisado' de la hoja '1_1_modificaciones_realizadas'
    para las modificaciones indicadas o pendientes de sincronización.
    """
    if ids_modificacion is None:
        ids_modificacion = obtener_modificaciones_pendientes_revisado()

    if not ids_modificacion:
        return {"exito": True, "actualizadas": 0}

    ids_set = {str(x).strip() for x in ids_modificacion if str(x).strip()}
    if not ids_set:
        return {"exito": True, "actualizadas": 0}

    try:
        _, ws = obtener_hoja_trabajo(sheet_name="1_1_modificaciones_realizadas")
        filas = ws.get_all_values()
        if not filas or len(filas) < 1:
            return {"exito": True, "actualizadas": 0}

        headers = [str(h).strip().lower() for h in filas[0]]
        idx_id_mod = headers.index("id_modificacion") if "id_modificacion" in headers else 0
        if "revisado" in headers:
            idx_revisado = headers.index("revisado")
        else:
            idx_revisado = len(headers)
            try:
                celda_head = rowcol_to_a1(1, idx_revisado + 1)
                ws.update(range_name=celda_head, values=[["revisado"]], value_input_option=ValueInputOption.user_entered)
            except Exception as e_h:
                print(f"[Sheets] Aviso al insertar encabezado revisado: {e_h}")

        col_revisado_num = idx_revisado + 1

        updates_batch = []
        ids_actualizados = []

        for r_idx, f in enumerate(filas[1:], start=2):
            id_m = str(f[idx_id_mod]).strip() if len(f) > idx_id_mod else ""
            if id_m in ids_set:
                curr_rev = str(f[idx_revisado]).strip().upper() if len(f) > idx_revisado else ""
                if curr_rev != "OK":
                    celda_a1 = rowcol_to_a1(r_idx, col_revisado_num)
                    updates_batch.append({
                        "range": celda_a1,
                        "values": [["OK"]]
                    })
                ids_actualizados.append(id_m)

        if updates_batch:
            try:
                ws.batch_update(updates_batch, value_input_option=ValueInputOption.user_entered)
            except Exception as e_batch:
                print(f"[Sheets] Batch update falló ({e_batch}), reintentando por celda...")
                for item in updates_batch:
                    try:
                        ws.update(range_name=item["range"], values=item["values"], value_input_option=ValueInputOption.user_entered)
                    except Exception as e_cell:
                        print(f"[Sheets] Fallo en celda {item['range']}: {e_cell}")
            print(f"[Sheets] Se marcaron {len(updates_batch)} modificaciones como 'OK' en '1_1_modificaciones_realizadas'.")

        if ids_actualizados:
            marcar_modificaciones_revisado_sincronizadas(ids_actualizados)

        return {"exito": True, "actualizadas": len(updates_batch)}
    except Exception as e:
        print(f"[Sheets] Error al actualizar estado revisado en Google Sheets: {e}")
        return {"exito": False, "error": str(e), "actualizadas": 0}

# [FN-02.01] Descargar auditoría de modificaciones realizadas desde Google Sheets hacia local
def descargar_modificaciones_desde_sheets(spreadsheet_id: str = "") -> dict:
    """
    Descarga las modificaciones de la hoja '1_1_modificaciones_realizadas' de Google Sheets,
    e inserta en la base local las que aún no existan. Si una modificación ya existente fue
    marcada con 'OK' en Google Sheets, actualiza la base local a revisado=1, desactivando la alerta
    para todos los administradores.
    """
    try:
        sh, ws = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="1_1_modificaciones_realizadas")
        filas = ws.get_all_values()
        if not filas or len(filas) < 2:
            return {"exito": True, "nuevas": 0, "revisadas": 0}

        headers = [str(h).strip().lower() for h in filas[0]]
        idx_id_mod = headers.index("id_modificacion") if "id_modificacion" in headers else 0
        idx_id_asist = headers.index("id_asistencia") if "id_asistencia" in headers else 1
        idx_tipo_ant = headers.index("tipo_antes") if "tipo_antes" in headers else 2
        idx_tipo_desp = headers.index("tipo_despues") if "tipo_despues" in headers else 3
        idx_h_ant = headers.index("horas_antes") if "horas_antes" in headers else 4
        idx_h_desp = headers.index("horas_despues") if "horas_despues" in headers else 5
        idx_serv_ant = headers.index("servicio_antes") if "servicio_antes" in headers else 6
        idx_serv_desp = headers.index("servicio_despues") if "servicio_despues" in headers else 7
        idx_fh = headers.index("fecha_hora_modificaciones") if "fecha_hora_modificaciones" in headers else 8
        idx_quien = headers.index("quien_modifica") if "quien_modifica" in headers else 9
        idx_revisado = headers.index("revisado") if "revisado" in headers else -1

        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id_modificacion, COALESCE(revisado, 0) as revisado FROM modificaciones_realizadas")
            existentes = {str(r["id_modificacion"]).strip(): int(r["revisado"]) for r in cursor.fetchall()}

            nuevas = 0
            actualizadas_revisadas = 0
            for f in filas[1:]:
                id_m = str(f[idx_id_mod]).strip() if len(f) > idx_id_mod else ""
                if not id_m:
                    continue

                rev_str = str(f[idx_revisado]).strip().upper() if idx_revisado >= 0 and len(f) > idx_revisado else ""
                esta_revisado_remoto = (rev_str in ["OK", "1", "TRUE", "SI"])
                rev_int = 1 if esta_revisado_remoto else 0

                if id_m not in existentes:
                    id_a = str(f[idx_id_asist]).strip() if len(f) > idx_id_asist else ""
                    t_ant = str(f[idx_tipo_ant]).strip() if len(f) > idx_tipo_ant else ""
                    t_desp = str(f[idx_tipo_desp]).strip() if len(f) > idx_tipo_desp else ""
                    try:
                        h_ant = float(f[idx_h_ant]) if len(f) > idx_h_ant and str(f[idx_h_ant]).strip() else 0.0
                    except Exception:
                        h_ant = 0.0
                    try:
                        h_desp = float(f[idx_h_desp]) if len(f) > idx_h_desp and str(f[idx_h_desp]).strip() else 0.0
                    except Exception:
                        h_desp = 0.0
                    s_ant = str(f[idx_serv_ant]).strip() if len(f) > idx_serv_ant else ""
                    s_desp = str(f[idx_serv_desp]).strip() if len(f) > idx_serv_desp else ""
                    fh = str(f[idx_fh]).strip() if len(f) > idx_fh else ""
                    quien = str(f[idx_quien]).strip() if len(f) > idx_quien else ""

                    cursor.execute("""
                        INSERT INTO modificaciones_realizadas (
                            id_modificacion, id_asistencia, tipo_antes, tipo_despues,
                            horas_antes, horas_despues, servicio_antes, servicio_despues,
                            fecha_hora_modificaciones, quien_modifica, sincronizado, revisado, revisado_sincronizado
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1)
                    """, (id_m, id_a, t_ant, t_desp, h_ant, h_desp, s_ant, s_desp, fh, quien, rev_int))
                    existentes[id_m] = rev_int
                    nuevas += 1
                else:
                    # El registro ya existía localmente: verificar si fue marcado como revisado ('OK') en Google Sheets
                    if esta_revisado_remoto and existentes[id_m] != 1:
                        cursor.execute("""
                            UPDATE modificaciones_realizadas
                            SET revisado = 1, revisado_sincronizado = 1
                            WHERE id_modificacion = ?
                        """, (id_m,))
                        existentes[id_m] = 1
                        actualizadas_revisadas += 1

            conn.commit()
            if nuevas > 0 or actualizadas_revisadas > 0:
                print(f"[Sheets] Modificaciones sincronizadas: {nuevas} nuevas, {actualizadas_revisadas} marcadas como revisadas ('OK').")
            return {"exito": True, "nuevas": nuevas, "revisadas": actualizadas_revisadas}
    except Exception as e:
        print(f"[Sheets] Error al descargar modificaciones desde Google Sheets: {e}")
        return {"exito": False, "error": str(e), "nuevas": 0, "revisadas": 0}

def sincronizar_pendientes() -> dict:
    """
    Lee los registros con sincronizado=0 de la base local y los sube/actualiza
    en la hoja '1_asistencia_informada'.
    Garantiza que si una fecha ya tiene una fila en Google Sheets (cargada desde otra PC),
    se actualice en su lugar (in-place) en vez de generar una fila duplicada.
    """
    if not _sync_lock.acquire(blocking=True, timeout=60):
        return {
            "exito": False,
            "error": "Ya existe una sincronización en curso. Por favor espere unos segundos."
        }
    try:
        config = cargar_configuracion()
        sp_id = config.get("spreadsheet_id", "").strip()

        if not sp_id:
            return {
                "exito": False,
                "error": "No se ha configurado el ID del Google Sheet para la sincronización."
            }

        pendientes = obtener_pendientes_sincronizacion()
        if not pendientes:
            try:
                sincronizar_modificaciones_pendientes()
            except Exception:
                pass
            return {
                "exito": True,
                "cantidad": 0,
                "mensaje": "No hay reportes pendientes de sincronización."
            }

        # Refrescar caché de días no laborales
        fechas_feriados = set()
        try:
            nl = obtener_no_laborales_remotos(sp_id)
            fechas_feriados = {normalizar_fecha_iso(x["fecha"]) for x in nl if x.get("fecha")}
        except Exception:
            pass

        _, ws = obtener_hoja_trabajo()

        # Obtener todas las filas remotas existentes para mapear por ID y por (empleado, fecha)
        todas_filas = ws.get_all_values()
        headers = [h.strip().lower() for h in todas_filas[0]] if todas_filas else []
        idx_id = headers.index("id_asistencia") if "id_asistencia" in headers else 0
        idx_emp = headers.index("empleado") if "empleado" in headers else 1
        idx_fecha = headers.index("fecha") if "fecha" in headers else 2
        idx_serv = headers.index("servicio") if "servicio" in headers else 4

        mapa_ids_remotos = {}
        mapa_emp_fecha_remoto = {}      # <- NUEVO: Mapeo para evitar duplicaciones entre PCs
        mapa_historico_sin_id = {}

        for r_idx, f in enumerate(todas_filas[1:], start=2):
            uid_val = f[idx_id].strip() if len(f) > idx_id else ""
            emp_val = f[idx_emp].strip().lower() if len(f) > idx_emp else ""
            fec_val = f[idx_fecha].strip() if len(f) > idx_fecha else ""
            serv_val = f[idx_serv].strip().lower() if len(f) > idx_serv else ""

            if uid_val and uid_val.lower() != "id_asistencia":
                mapa_ids_remotos[uid_val] = r_idx

            # Mapeamos la fila por la combinación natural de empleado y fecha
            if emp_val and fec_val:
                mapa_emp_fecha_remoto[(emp_val, fec_val)] = r_idx

            if (not uid_val or uid_val.lower() == "id_asistencia") and emp_val and fec_val:
                mapa_historico_sin_id[(emp_val, fec_val, serv_val)] = r_idx

        filas_a_insertar = []
        filas_a_actualizar = []
        ids_exitosos = []

        for p in pendientes:
            emp = str(p.get("empleado", "")).strip()
            f_str = str(p.get("fecha", "")).strip()
            serv = str(p.get("servicio", "")).strip()
            uid = str(p.get("id_asistencia", "")).strip()

            fila = construir_fila_asistencia(p, headers)
            es_modificacion = int(p.get("modificado") or 0) == 1

            # 1. Comprobar si existe por id_asistencia directo
            row_existente = mapa_ids_remotos.get(uid)

            # 2. Si no coincide por UUID, verificar si ya existe una fila para ese colaborador y fecha en Google Sheets
            if not row_existente and emp and f_str:
                row_existente = mapa_emp_fecha_remoto.get((emp.lower(), f_str))

            # 3. Respaldo para registros históricos sin ID
            if not row_existente and es_modificacion:
                clave_historica = (emp.lower(), f_str, serv.lower())
                row_existente = mapa_historico_sin_id.get(clave_historica)

            if row_existente:
                # Si ya existía una fila para ese día, la actualizamos en su lugar (in-place)
                filas_a_actualizar.append((row_existente, fila, uid))
            else:
                # Solo se inserta si la fecha verdaderamente no existía en Google Sheets
                filas_a_insertar.append((fila, uid))

        # 1. Ejecutar actualizaciones in-place para registros existentes
        for row_idx, fila_vals, uid_reg in filas_a_actualizar:
            try:
                col_end = chr(ord('A') + len(fila_vals) - 1)
                ws.update(
                    range_name=f"A{row_idx}:{col_end}{row_idx}",
                    values=[fila_vals],
                    value_input_option=ValueInputOption.user_entered
                )
                ids_exitosos.append(uid_reg)
                mapa_ids_remotos[uid_reg] = row_idx
            except Exception as e_up:
                print(f"[Sheets] Error al actualizar fila {row_idx} ({uid_reg}): {e_up}")

        # 2. Inserción de filas que realmente son nuevas
        if filas_a_insertar:
            bloque_filas = [item[0] for item in filas_a_insertar]
            uids_bloque = [item[1] for item in filas_a_insertar]
            try:
                ws.append_rows(bloque_filas, value_input_option=ValueInputOption.user_entered)
                ids_exitosos.extend(uids_bloque)
                print(f"[Sheets] Se insertaron {len(bloque_filas)} fila(s) nuevas en Google Sheets.")
            except Exception as e_ins:
                print(f"[Sheets] Error al insertar filas en lote: {e_ins}")
                for f_vals, uid_item in filas_a_insertar:
                    try:
                        ws.append_rows([f_vals], value_input_option=ValueInputOption.user_entered)
                        ids_exitosos.append(uid_item)
                    except Exception as e_indiv:
                        print(f"[Sheets] Error en inserción individual ({uid_item}): {e_indiv}")

        # 3. Marcar en SQLite local como sincronizados los registros confirmados
        if ids_exitosos:
            marcar_como_sincronizados(ids_exitosos)

        try:
            sincronizar_modificaciones_pendientes()
        except Exception as e_mod:
            print(f"[Sheets] Error al sincronizar modificaciones de auditoría: {e_mod}")

        total = len(ids_exitosos)
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
    finally:
        _sync_lock.release()


def eliminar_registro_remoto(id_asistencia: str) -> bool:
    """
    Busca y elimina la fila en '1_asistencia_informada' cuyo id_asistencia (columna A)
    coincida con el proporcionado, bajo sincronización de hilo segura.
    """
    if not id_asistencia:
        return False
    if not _sync_lock.acquire(blocking=True, timeout=30):
        print(f"[Sheets] Bloqueo ocupado al intentar eliminar {id_asistencia}")
        return False
    try:
        _, ws = obtener_hoja_trabajo()
        col_ids = ws.col_values(1)
        target = id_asistencia.strip()
        for idx, val in enumerate(col_ids, start=1):
            if val and str(val).strip() == target:
                ws.delete_rows(idx)
                print(f"[Sheets] Fila {idx} eliminada con éxito para id_asistencia={id_asistencia}")
                return True
        return False
    except Exception as e:
        print(f"[Sheets] Error al eliminar registro remoto ({id_asistencia}): {e}")
        return False
    finally:
        _sync_lock.release()


def obtener_proyectos_remotos(spreadsheet_id: str = "") -> list:
    """
    Lee los proyectos activos de la pestaña '0_proyectos'.
    Retorna lista de diccionarios: [{'id_proyecto': ..., 'denominacion': ..., 'area': ...}, ...]
    """
    try:
        sh, _ = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="0_proyectos")
        ws_p = sh.worksheet("0_proyectos")
        filas = ws_p.get_all_values()
        if not filas or len(filas) < 2:
            return []

        headers = [str(h).strip().lower() for h in filas[0]]
        idx_denom = headers.index("denominacion") if "denominacion" in headers else 1
        idx_area = headers.index("area") if "area" in headers else 2
        idx_id = headers.index("id_proyecto") if "id_proyecto" in headers else 0

        proyectos = []
        for f in filas[1:]:
            denom = f[idx_denom].strip() if len(f) > idx_denom else ""
            area = f[idx_area].strip() if len(f) > idx_area else ""
            id_p = f[idx_id].strip() if len(f) > idx_id else ""
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


def parse_currency(val) -> float:
    """Convierte cadenas monetarias con símbolos, comas y puntos a flotante limpio."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = re.sub(r"[^\d.,-]", "", str(val).strip())
    if not s:
        return 0.0
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


# [FN-03.08] Obtener tarifas de roster desde la hoja remota '1_2_tarifas_roster'
def obtener_tarifas_roster_remotas(spreadsheet_id: str = "") -> list:
    """
    Lee las tarifas de roster de la pestaña '1_2_tarifas_roster'.
    Columnas: id_tarifa, proyecto, dia_normal, domingo, subida, bajada, adicionales, id_proyecto.
    """
    try:
        sh, _ = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="1_2_tarifas_roster")
        try:
            ws = sh.worksheet("1_2_tarifas_roster")
        except gspread.exceptions.WorksheetNotFound:
            print("[Sheets] Pestaña '1_2_tarifas_roster' no encontrada en la hoja de cálculo.")
            return []

        filas = ws.get_all_values()
        if not filas or len(filas) < 2:
            return []

        headers = [str(h).strip().lower() for h in filas[0]]
        idx_id_tarifa = headers.index("id_tarifa") if "id_tarifa" in headers else -1
        idx_proy = headers.index("proyecto") if "proyecto" in headers else (headers.index("denominacion") if "denominacion" in headers else 1)
        idx_dia_norm = headers.index("dia_normal") if "dia_normal" in headers else -1
        idx_dom = headers.index("domingo") if "domingo" in headers else -1
        idx_sub = headers.index("subida") if "subida" in headers else -1
        idx_baj = headers.index("bajada") if "bajada" in headers else -1
        idx_adic = headers.index("adicionales") if "adicionales" in headers else -1
        idx_id_proy = headers.index("id_proyecto") if "id_proyecto" in headers else -1

        tarifas = []
        for f in filas[1:]:
            proy = f[idx_proy].strip() if (idx_proy >= 0 and len(f) > idx_proy) else ""
            if not proy:
                continue

            id_t = f[idx_id_tarifa].strip() if (idx_id_tarifa >= 0 and len(f) > idx_id_tarifa) else ""
            id_p = f[idx_id_proy].strip() if (idx_id_proy >= 0 and len(f) > idx_id_proy) else ""
            d_norm = parse_currency(f[idx_dia_norm]) if (idx_dia_norm >= 0 and len(f) > idx_dia_norm) else 0.0
            d_dom = parse_currency(f[idx_dom]) if (idx_dom >= 0 and len(f) > idx_dom) else 0.0
            d_sub = parse_currency(f[idx_sub]) if (idx_sub >= 0 and len(f) > idx_sub) else 0.0
            d_baj = parse_currency(f[idx_baj]) if (idx_baj >= 0 and len(f) > idx_baj) else 0.0
            d_adic = parse_currency(f[idx_adic]) if (idx_adic >= 0 and len(f) > idx_adic) else 0.0

            #tarifas.append({
             #   "id_tarifa": id_t or str(uuid.uuid4()),
              #  "id_proyecto": id_p,
               # "proyecto": proy,
                #"dia_normal": d_norm,
                #"domingo": d_dom,
                #"subida": d_sub,
                #"bajada": d_baj,
                #"adicionales": d_adic
            #})

            # Dentro del bucle 'for f in filas[1:]' en backend/sheets_service.py:
            tarifas.append({
                "id_tarifa": id_t or str(uuid.uuid4()),
                "id_proyecto": id_p,              # UUID del proyecto
                "denominacion": proy,              # Nombre exacto según la cabecera de Sheets
                "proyecto": proy,                  # Compatibilidad retroactiva con código previo
                "dia_normal": d_norm,
                "domingo": d_dom,
                "subida": d_sub,
                "bajada": d_baj,
                "adicionales": d_adic
            })

        print(f"[Sheets] {len(tarifas)} tarifas de roster cargadas desde '1_2_tarifas_roster'.")
        return tarifas
    except Exception as e:
        print(f"[Sheets] Error al obtener tarifas de roster remotas: {e}")
        return []



# [FN-01.08] Obtener sueldos y costos diarios desde la hoja CALCULO DE SUELDOS
def obtener_sueldos_remotos(spreadsheet_id: str = "") -> dict:
    """
    Lee la tabla 'sueldos_empleados' de la hoja 'CALCULO DE SUELDOS' (ID: 1rBLHa44JeBlqtkUfKg6WO1EFdiChhvgUTng8GpZQdJo).
    Retorna diccionario indexado por id_origen:
    { id_origen: {'empleado': ..., 'costo_dia_ofi': float, 'costo_dia_obra': float} }
    """
    try:
        cfg = cargar_configuracion()
        sp_id = spreadsheet_id or cfg.get("spreadsheet_sueldos_id", ID_HOJA_SUELDOS_DEFAULT)
        gc, _ = obtener_cliente()
        sh = gc.open_by_key(sp_id)
        ws = sh.worksheet(TABLA_SUELDOS)
        filas = ws.get_all_values()
        if not filas or len(filas) < 2:
            return {}

        headers = [str(h).strip().lower() for h in filas[0]]
        idx_id_orig = headers.index("id_origen") if "id_origen" in headers else 0
        idx_emp = headers.index("empleado") if "empleado" in headers else 1
        idx_ofi = headers.index("costo_dia_ofi") if "costo_dia_ofi" in headers else -1
        idx_obra = headers.index("costo_dia_obra") if "costo_dia_obra" in headers else -1

        res = {}
        for f in filas[1:]:
            id_orig = str(f[idx_id_orig]).strip() if len(f) > idx_id_orig else ""
            if not id_orig:
                continue
            emp = str(f[idx_emp]).strip() if len(f) > idx_emp else ""
            c_ofi = parse_currency(f[idx_ofi]) if (idx_ofi >= 0 and len(f) > idx_ofi) else 0.0
            c_obra = parse_currency(f[idx_obra]) if (idx_obra >= 0 and len(f) > idx_obra) else 0.0
            res[id_orig] = {
                "empleado": emp,
                "costo_dia_ofi": c_ofi,
                "costo_dia_obra": c_obra
            }
        print(f"[Sheets] {len(res)} registros de sueldos cargados desde '{TABLA_SUELDOS}'.")
        return res
    except Exception as e:
        print(f"[Sheets] Error al obtener sueldos remotos: {e}")
        return {}


def obtener_usuarios_remotos(spreadsheet_id: str = "") -> list:
    """
    Lee los usuarios autorizados de la pestaña '0_usuarios' y los cruza con 'sueldos_empleados' mediante 'id_origen'.
    Retorna lista de diccionarios: [{'id_usuario': ..., 'id_origen': ..., 'nombre': ..., 'email': ..., 'area': ..., 'dni': ..., 'costo_dia_ofi': ..., 'costo_dia_obra': ...}, ...]
    """
    try:
        sh, _ = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="0_usuarios")
        ws_u = sh.worksheet("0_usuarios")
        filas = ws_u.get_all_values()
        if not filas or len(filas) < 2:
            return []

        # Obtener mapeo de sueldos por id_origen
        sueldos_map = obtener_sueldos_remotos()

        headers = [str(h).strip().lower().replace(" ", "_") for h in filas[0]]
        idx_nombre = headers.index("nombre") if "nombre" in headers else 1
        idx_dni = headers.index("dni") if "dni" in headers else 4
        idx_area = headers.index("area") if "area" in headers else 3
        idx_email = headers.index("email") if "email" in headers else (headers.index("mail") if "mail" in headers else 2)
        idx_id_u = headers.index("id_usuario") if "id_usuario" in headers else 0
        idx_id_orig = headers.index("id_origen") if "id_origen" in headers else -1

        idx_rol = -1
        for candidate in ["rol_app", "rol", "roles", "permisos", "tipo_usuario"]:
            if candidate in headers:
                idx_rol = headers.index(candidate)
                break

        usuarios = []
        for f in filas[1:]:
            nom = f[idx_nombre].strip() if len(f) > idx_nombre else ""
            dni = f[idx_dni].strip() if len(f) > idx_dni else ""
            area = f[idx_area].strip() if len(f) > idx_area else ""
            email = f[idx_email].strip() if len(f) > idx_email else ""
            id_u = f[idx_id_u].strip() if len(f) > idx_id_u else ""
            id_orig = f[idx_id_orig].strip() if (idx_id_orig >= 0 and len(f) > idx_id_orig) else ""
            rol_raw = f[idx_rol].strip().lower().replace(" ", "_") if (idx_rol >= 0 and len(f) > idx_rol) else ""

            # Normalización y asignación defensiva de roles RBAC
            rol_norm = rol_raw
            if dni == "40158951" or "valentin" in nom.lower() or email in ["ivangvalentin97@gmail.com", "sge@ingeap.com"]:
                rol_norm = "admin"
            elif dni == "45411162" or "justina" in nom.lower() or email == "rrhh@ingeap.com":
                rol_norm = "sub_admin"
            elif not rol_norm:
                if area.upper() == "RRHH":
                    rol_norm = "sub_admin"
                elif area.upper() == "N":
                    rol_norm = "core"
                elif area.upper() in ["S", "SIG"] or "llovio" in nom.lower():
                    rol_norm = "user_2"
                else:
                    rol_norm = "user_1"
            elif rol_norm in ["administrador", "admin_general"]:
                rol_norm = "admin"
            elif rol_norm in ["rrhh", "gestion", "subadmin"]:
                rol_norm = "sub_admin"
            elif rol_norm in ["nucleo", "direccion"]:
                rol_norm = "core"

            info_sueldo = sueldos_map.get(id_orig, {})
            costo_ofi = float(info_sueldo.get("costo_dia_ofi", 0.0) or 0.0)
            costo_obra = float(info_sueldo.get("costo_dia_obra", 0.0) or 0.0)

            if nom and dni:
                usuarios.append({
                    "id_usuario": id_u,
                    "id_origen": id_orig,
                    "nombre": nom,
                    "email": email,
                    "area": area,
                    "dni": dni,
                    "costo_dia_ofi": costo_ofi,
                    "costo_dia_obra": costo_obra,
                    "rol_app": rol_norm
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


def sincronizar_desde_sheets_hacia_local(spreadsheet_id: str = "") -> dict:
    """
    Descarga los registros existentes en '1_asistencia_informada' de Google Sheets,
    purga de la tabla local 'historial' cualquier registro que ya no exista en la hoja,
    e inserta o actualiza los registros vigentes para asegurar que la base local refleje
    fielmente la fuente de verdad de Google Sheets sin incongruencias ni registros fantasma.
    """
    try:
        sh, ws = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="1_asistencia_informada")
        filas = ws.get_all_values()
        if not filas or len(filas) < 2:
            return {"exito": True, "insertados": 0, "actualizados": 0, "eliminados": 0, "total": 0}

        headers = [str(h).strip().lower() for h in filas[0]]
        idx_id_asist = headers.index("id_asistencia") if "id_asistencia" in headers else 0
        idx_emp = headers.index("empleado") if "empleado" in headers else 1
        idx_fecha = headers.index("fecha") if "fecha" in headers else 2
        idx_tipo = headers.index("tipo_ocf") if "tipo_ocf" in headers else 3
        idx_serv = headers.index("servicio") if "servicio" in headers else 4
        idx_horas = headers.index("horas") if "horas" in headers else 5
        idx_inst = headers.index("instrumental") if "instrumental" in headers else 6
        idx_mail = headers.index("usuario_mail") if "usuario_mail" in headers else 7
        idx_fh = headers.index("fecha_hora") if "fecha_hora" in headers else 8
        idx_dia = headers.index("dia_semana") if "dia_semana" in headers else 9
        idx_fer = headers.index("feriado") if "feriado" in headers else 10
        idx_id_emp = headers.index("id_empleado") if "id_empleado" in headers else -1
        idx_id_proy = headers.index("id_proyecto") if "id_proyecto" in headers else -1
        idx_cargado_por = headers.index("cargado_por") if "cargado_por" in headers else -1
        idx_h_ini = headers.index("hora_inicio") if "hora_inicio" in headers else -1
        idx_h_fin = headers.index("hora_fin") if "hora_fin" in headers else -1
        idx_costo = headers.index("tipo_costo") if "tipo_costo" in headers else -1
        idx_costo_dia = headers.index("costo_dia") if "costo_dia" in headers else -1

        # Recopilar todos los id_asistencia válidos presentes en Google Sheets
        uids_en_sheets = {str(f[idx_id_asist]).strip() for f in filas[1:] if len(f) > idx_id_asist and str(f[idx_id_asist]).strip()}

        with obtener_conexion() as conn:
            cursor = conn.cursor()

            # 1. Purgar de la base local los registros que no existen en Google Sheets
            ids_a_borrar = []
            if uids_en_sheets:
                cursor.execute("SELECT id, id_asistencia FROM historial WHERE sincronizado = 1 AND id_asistencia IS NOT NULL AND id_asistencia != ''")
                locales = cursor.fetchall()
                ids_a_borrar = [
                    r["id"] for r in locales 
                    if not r["id_asistencia"] or str(r["id_asistencia"]).strip() not in uids_en_sheets
                ]
                if ids_a_borrar:
                    cursor.executemany("DELETE FROM historial WHERE id = ?", [(i,) for i in ids_a_borrar])
                    print(f"[Sheets] Se purgaron {len(ids_a_borrar)} registros locales eliminados o ausentes en Google Sheets.")

            cursor.execute("SELECT id_asistencia FROM historial WHERE id_asistencia IS NOT NULL AND id_asistencia != ''")
            existentes = {str(r["id_asistencia"]).strip() for r in cursor.fetchall()}

            insertados = 0
            actualizados = 0
            for f in filas[1:]:
                uid = str(f[idx_id_asist]).strip() if len(f) > idx_id_asist else ""
                if not uid:
                    continue

                emp = str(f[idx_emp]).strip() if len(f) > idx_emp else ""
                f_str = str(f[idx_fecha]).strip() if len(f) > idx_fecha else ""
                tipo = str(f[idx_tipo]).strip() if len(f) > idx_tipo else ""
                serv = str(f[idx_serv]).strip() if len(f) > idx_serv else ""
                try:
                    hrs = float(f[idx_horas]) if len(f) > idx_horas and str(f[idx_horas]).strip() else 0.0
                except Exception:
                    hrs = 0.0
                h_ini = str(f[idx_h_ini]).strip() if (idx_h_ini >= 0 and len(f) > idx_h_ini) else ""
                h_fin = str(f[idx_h_fin]).strip() if (idx_h_fin >= 0 and len(f) > idx_h_fin) else ""
                costo = str(f[idx_costo]).strip() if (idx_costo >= 0 and len(f) > idx_costo) else ""
                costo_dia = parse_currency(f[idx_costo_dia]) if (idx_costo_dia >= 0 and len(f) > idx_costo_dia) else 0.0
                inst = str(f[idx_inst]).strip() if len(f) > idx_inst else ""
                mail = str(f[idx_mail]).strip() if len(f) > idx_mail else ""
                fh = str(f[idx_fh]).strip() if len(f) > idx_fh else ""
                dia_s = str(f[idx_dia]).strip() if len(f) > idx_dia else ""
                fer = str(f[idx_fer]).strip() if len(f) > idx_fer else ""
                id_e = str(f[idx_id_emp]).strip() if (idx_id_emp >= 0 and len(f) > idx_id_emp) else ""
                id_p = str(f[idx_id_proy]).strip() if (idx_id_proy >= 0 and len(f) > idx_id_proy) else ""
                carg_por = str(f[idx_cargado_por]).strip() if (idx_cargado_por >= 0 and len(f) > idx_cargado_por) else ""
                if not carg_por:
                    carg_por = emp

                if uid in existentes:
                    cursor.execute("""
                        UPDATE historial SET
                            empleado = ?, fecha = ?, tipo_ocf = ?, servicio = ?,
                            horas = ?, hora_inicio = ?, hora_fin = ?, tipo_costo = ?, costo_dia = ?,
                            instrumental = ?, usuario_mail = ?, fecha_hora = ?,
                            lugar = ?, jornada = ?, dia_semana = ?, feriado = ?,
                            modificado = 0, sincronizado = 1, id_empleado = ?, id_proyecto = ?,
                            cargado_por = ?
                        WHERE id_asistencia = ?
                    """, (
                        emp, f_str, tipo, serv,
                        hrs, h_ini, h_fin, costo, costo_dia,
                        inst, mail, fh,
                        tipo, f"{hrs} hs" if hrs > 0 else tipo, dia_s, fer,
                        id_e, id_p, carg_por, uid
                    ))
                    actualizados += 1
                else:
                    cursor.execute("""
                        INSERT INTO historial (
                            id_asistencia, empleado, fecha, tipo_ocf, servicio,
                            horas, hora_inicio, hora_fin, tipo_costo, costo_dia, instrumental, usuario_mail, fecha_hora,
                            lugar, jornada, dia_semana, feriado, modificado, sincronizado,
                            cargado_por, id_empleado, id_proyecto
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
                    """, (
                        uid, emp, f_str, tipo, serv,
                        hrs, h_ini, h_fin, costo, costo_dia, inst, mail, fh,
                        tipo, f"{hrs} hs" if hrs > 0 else tipo, dia_s, fer,
                        carg_por, id_e, id_p
                    ))
                    existentes.add(uid)
                    insertados += 1

                if (insertados + actualizados) % 150 == 0:
                    conn.commit()

            conn.commit()
            try:
                reconstruir_rosters_desde_historial()
            except Exception:
                pass
            try:
                descargar_modificaciones_desde_sheets(spreadsheet_id=spreadsheet_id)
            except Exception as e_mod:
                print(f"[Sheets] Aviso al descargar modificaciones en sync local: {e_mod}")
            print(f"[Sheets] Sincronización completa: {insertados} insertados, {actualizados} actualizados, {len(ids_a_borrar)} purgados.")
            return {
                "exito": True,
                "insertados": insertados,
                "actualizados": actualizados,
                "eliminados": len(ids_a_borrar),
                "total": len(uids_en_sheets)
            }
    except Exception as e:
        print(f"[Sheets] Aviso al sincronizar desde sheets hacia local: {e}")
        return {"exito": False, "error": str(e), "insertados": 0, "actualizados": 0, "eliminados": 0}


def deduplicar_hoja_remota(filas_registros: list[dict] | None = None, spreadsheet_id: str = "") -> list[dict] | dict:
    """
    Filtra y elimina registros duplicados.
    Si filas_registros es None, audita directamente la pestaña '1_asistencia_informada'
    en Google Sheets, detecta colisiones de (empleado, fecha), conserva la fila principal
    (priorizando Campo/Roster) y elimina las duplicadas en orden descendente.
    """
    if filas_registros is not None:
        registros_unicos = []
        claves_vistas = set()

        for registro in filas_registros:
            id_asistencia = str(registro.get("id_asistencia", "")).strip()
            if id_asistencia:
                clave_primaria = ("ID", id_asistencia)
                if clave_primaria in claves_vistas:
                    continue
                claves_vistas.add(clave_primaria)
                registros_unicos.append(registro)
                continue

            empleado = str(registro.get("empleado", "")).strip().lower()
            fecha = str(registro.get("fecha", "")).strip()
            servicio = str(registro.get("servicio", "")).strip().lower()
            lugar = str(registro.get("lugar", "") or registro.get("tipo_ocf", "")).strip().lower()
            hora_inicio = str(registro.get("hora_inicio", "")).strip()
            hora_fin = str(registro.get("hora_fin", "")).strip()
            horas_totales = str(registro.get("horas_totales", "") or registro.get("horas", "")).strip()

            if not empleado and not fecha:
                continue

            clave_extendida = (empleado, fecha, servicio, lugar, hora_inicio, hora_fin, horas_totales)
            if clave_extendida in claves_vistas:
                continue

            claves_vistas.add(clave_extendida)
            registros_unicos.append(registro)

        return registros_unicos

    # Deduplicación remota directa sobre la hoja de Google Sheets
    if not _sync_lock.acquire(blocking=True, timeout=60):
        return {"exito": False, "error": "Sincronización en curso. Reintente en unos momentos."}
    try:
        sh, ws = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="1_asistencia_informada")
        filas = ws.get_all_values()
        if not filas or len(filas) < 2:
            return {"exito": True, "eliminados": 0, "mensaje": "No hay registros para deduplicar."}

        headers = [h.strip().lower() for h in filas[0]]
        idx_emp = headers.index("empleado") if "empleado" in headers else 1
        idx_fecha = headers.index("fecha") if "fecha" in headers else 2
        idx_tipo = headers.index("tipo_ocf") if "tipo_ocf" in headers else 3
        idx_serv = headers.index("servicio") if "servicio" in headers else 4
        idx_costo = headers.index("costo_dia") if "costo_dia" in headers else -1

        # Agrupamos todas las filas por (empleado, fecha)
        grupos_por_dia = {}
        for r_idx, f in enumerate(filas[1:], start=2):
            emp = f[idx_emp].strip().lower() if len(f) > idx_emp else ""
            fec = f[idx_fecha].strip() if len(f) > idx_fecha else ""
            tipo = f[idx_tipo].strip().lower() if len(f) > idx_tipo else ""
            serv = f[idx_serv].strip().lower() if len(f) > idx_serv else ""
            costo_val = parse_currency(f[idx_costo]) if (idx_costo >= 0 and len(f) > idx_costo) else 0.0

            if not emp or not fec:
                continue

            clave = (emp, fec)
            if clave not in grupos_por_dia:
                grupos_por_dia[clave] = []

            grupos_por_dia[clave].append({
                "num_fila": r_idx,
                "es_campo": ("campo" in tipo or "roster" in tipo),
                "costo_dia": costo_val
            })

        filas_a_borrar = []
        for clave, ocurrencias in grupos_por_dia.items():
            if len(ocurrencias) > 1:
                # Priorizar la fila de Campo/Roster y, en caso de empate, la que tenga mayor costo salarial
                ocurrencias_ordenadas = sorted(
                    ocurrencias,
                    key=lambda x: (1 if x["es_campo"] else 0, x["costo_dia"]),
                    reverse=True
                )
                # Conservamos la primera ocurrencia (índice 0) y marcamos las demás para eliminar
                for duplicado in ocurrencias_ordenadas[1:]:
                    filas_a_borrar.append(duplicado["num_fila"])

        # Eliminamos en orden descendente (de mayor a menor) para que los índices no se desplacen
        filas_a_borrar.sort(reverse=True)
        eliminados = 0
        for r_num in filas_a_borrar:
            try:
                ws.delete_rows(r_num)
                eliminados += 1
                time.sleep(0.4)  # Pausa breve de seguridad contra cuotas de Google Sheets API
            except Exception as e_del:
                print(f"[Sheets] Error al borrar fila duplicada {r_num}: {e_del}")

        print(f"[Sheets] Deduplicación remota finalizada: {eliminados} fila(s) eliminada(s).")
        return {"exito": True, "eliminados": eliminados, "mensaje": f"Se eliminaron {eliminados} filas duplicadas de Google Sheets."}
    except Exception as e:
        print(f"[Sheets] Error en deduplicar_hoja_remota: {e}")
        return {"exito": False, "error": str(e)}
    finally:
        _sync_lock.release()


def limpiar_y_descargar_desde_sheets(spreadsheet_id: str = "") -> dict:
    """
    Elimina los registros locales de historial y rosters para purgar cualquier
    incongruencia o modificación indebida, y descarga nuevamente todos los registros
    vigentes desde la hoja '1_asistencia_informada' de Google Sheets.
    """
    if not _sync_lock.acquire(blocking=True, timeout=60):
        return {
            "exito": False,
            "error": "Ya existe una sincronización en curso. Por favor espere unos segundos."
        }
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM historial")
            cursor.execute("DELETE FROM rosters")
            conn.commit()

        # Descargar directamente de Google Sheets
        res = sincronizar_desde_sheets_hacia_local(spreadsheet_id)
        # Reconstruir los bloques de rosters a partir del historial limpio descargado
        reconstruir_rosters_desde_historial()

        cant_ins = res.get("insertados", 0) if isinstance(res, dict) else 0
        return {
            "exito": True,
            "mensaje": f"Base local limpiada y sincronizada: {cant_ins} registro(s) descargados desde Google Sheets.",
            "total": cant_ins
        }
    except Exception as e:
        print(f"[Sheets] Error en limpiar_y_descargar_desde_sheets: {e}")
        return {"exito": False, "error": str(e)}
    finally:
        _sync_lock.release()

def calcular_costo_dia_asistencia(
    tipo_ocf: str,
    servicio: str,
    feriado: str,
    empleado: str,
    tipo_costo: str = ""
) -> tuple[str, float]:
    """
    Calcula estrictamente el costo salarial diario de un empleado para 'historial' y Google Sheets.
    Determina si corresponde 'Campo' u 'Oficina' y aplica el sueldo base del colaborador.
    """
    tipo_norm = str(tipo_ocf or "").strip().lower()
    
    # Días no computables de costo
    if tipo_norm in ("vacaciones", "licencia"):
        t_costo = tipo_costo or "Oficina"
        return (t_costo, 0.0)

    # 1. Determinar si el concepto es Campo u Oficina
    if tipo_costo:
        t_costo = tipo_costo
    elif "campo" in tipo_norm or "roster" in tipo_norm:
        t_costo = "Campo"
    else:
        t_costo = "Oficina"

    # 2. Consultar tarifas salariales base del empleado en la base local SQLite
    costo_ofi = 0.0
    costo_obra = 0.0
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT costo_dia_ofi, costo_dia_obra FROM usuarios_cache WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) LIMIT 1",
                (empleado,)
            )
            u = cursor.fetchone()
            if u:
                costo_ofi = float(u["costo_dia_ofi"] or 0.0)
                costo_obra = float(u["costo_dia_obra"] or 0.0)
    except Exception as e:
        print(f"[Sheets] Aviso al leer tarifas salariales de {empleado}: {e}")

    costo_base = costo_obra if t_costo == "Campo" else costo_ofi

    # 3. Aplicar multiplicadores de convenio
    # Días no trabajados (Franco, Licencia, Vacaciones) no reciben recargo por feriado (x2.0)
    es_no_trabajado = (
        tipo_norm in ("franco", "licencia", "vacaciones")
        or (tipo_norm.startswith("franco") and "trabajado" not in tipo_norm)
    )

    if str(feriado or "").strip().upper() == "SI" and not es_no_trabajado:
        costo_final = round(costo_base * 2.0, 2)
    elif "trabajado" in str(servicio or "").lower() or "trabajado" in tipo_norm:
        costo_final = round(costo_base * 1.5, 2)
    else:
        costo_final = round(costo_base, 2)

    return (t_costo, costo_final)


def obtener_tarifa_roster_por_proyecto(id_proyecto: str = "", nombre_proyecto: str = "") -> dict | None:
    """
    Busca la tarifa oficial de un proyecto en '1_2_tarifas_roster' por UUID o denominación.
    Retorna el diccionario de tarifas o None si no registra configuración.
    """
    catalogo = obtener_tarifas_roster_remotas()
    if not catalogo:
        return None

    id_buscado = str(id_proyecto or "").strip().lower()
    nom_buscado = str(nombre_proyecto or "").strip().lower()

    for item in catalogo:
        item_id = str(item.get("id_proyecto", "")).strip().lower()
        item_nom = str(item.get("denominacion") or item.get("proyecto") or "").strip().lower()

        if id_buscado and item_id and item_id == id_buscado:
            return item
        if nom_buscado and item_nom and (nom_buscado == item_nom or nom_buscado in item_nom or item_nom in nom_buscado):
            return item

    return None