import os
import sys
import json
import re
import threading
_sync_lock = threading.Lock()
import gspread
from gspread.utils import ValueInputOption
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
    "id_proyecto",
    "cargado_por"
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

    # Verificar encabezados: solo en '1_asistencia_informada'
    try:
        es_hoja_asistencia = (s_name.strip().lower() == "1_asistencia_informada")
        if es_hoja_asistencia:
            fila_1 = ws.row_values(1)
            if not fila_1 or len(fila_1) == 0:
                ws.append_row(COLUMNAS_ESQUEMA, value_input_option=ValueInputOption.user_entered)
            else:
                headers_limpios = [c.strip().lower() for c in fila_1]
                if "id_empleado" not in headers_limpios:
                    # Agregar columnas L y M al encabezado existente de la hoja de asistencia
                    ws.update(range_name="L1:M1", values=[["id_empleado", "id_proyecto"]], value_input_option=ValueInputOption.user_entered)
                if "cargado_por" not in headers_limpios:
                    ws.update(range_name="N1", values=[["cargado_por"]], value_input_option=ValueInputOption.user_entered)
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
    en la hoja '1_asistencia_informada' con las 13 columnas completas.
    Utiliza un bloqueo seguro para impedir concurrencia de hilos y valida si la fila
    ya existe por id_asistencia o por (empleado, fecha) para evitar duplicados en Google Sheets.
    """
    if not _sync_lock.acquire(blocking=True, timeout=45):
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

        mapa_ids_remotos = {}
        mapa_emp_fecha = {}
        for r_idx, f in enumerate(todas_filas[1:], start=2):
            uid_val = f[idx_id].strip() if len(f) > idx_id else ""
            emp_val = f[idx_emp].strip().lower() if len(f) > idx_emp else ""
            fec_val = f[idx_fecha].strip() if len(f) > idx_fecha else ""
            if uid_val and uid_val != "id_asistencia":
                mapa_ids_remotos[uid_val] = r_idx
            if emp_val and fec_val:
                mapa_emp_fecha[(emp_val, fec_val)] = r_idx

        filas_a_insertar = []
        ids_sincronizados = []
        next_row_num = len(todas_filas) + 1

        for p in pendientes:
            emp = str(p.get("empleado", "")).strip()
            f_str = str(p.get("fecha", "")).strip()
            dia_sem = p.get("dia_semana") or calcular_dia_semana(f_str)
            fer = p.get("feriado") or es_fecha_feriado(f_str, fechas_feriados)

            carg_por = str(p.get("cargado_por") or emp).strip()
            fila = [
                str(p.get("id_asistencia", "")),
                emp,
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
                str(p.get("id_proyecto", "")),
                carg_por
            ]

            uid = p.get("id_asistencia")
            clave_ef = (emp.lower(), f_str)

            # Si ya existe en Google Sheets por ID o por (empleado, fecha), actualizar in-place
            row_existente = mapa_ids_remotos.get(uid) or mapa_emp_fecha.get(clave_ef)

            if row_existente:
                try:
                    ws.update(range_name=f"A{row_existente}:N{row_existente}", values=[fila], value_input_option=ValueInputOption.user_entered)
                    ids_sincronizados.append(uid)
                    mapa_ids_remotos[uid] = row_existente
                    mapa_emp_fecha[clave_ef] = row_existente
                except Exception as e_up:
                    print(f"[Sheets] Error al actualizar fila {row_existente}: {e_up}")
            else:
                filas_a_insertar.append(fila)
                ids_sincronizados.append(uid)
                mapa_ids_remotos[uid] = next_row_num
                mapa_emp_fecha[clave_ef] = next_row_num
                next_row_num += 1

        # Inserción en lote en Google Sheets de filas verdaderamente nuevas
        if filas_a_insertar:
            ws.append_rows(filas_a_insertar, value_input_option=ValueInputOption.user_entered)

        # Marcar en la base local como sincronizados
        if ids_sincronizados:
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
    finally:
        _sync_lock.release()


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


def obtener_usuarios_remotos(spreadsheet_id: str = "") -> list:
    """
    Lee los usuarios autorizados de la pestaña '0_usuarios'.
    Retorna lista de diccionarios: [{'id_usuario': ..., 'id_origen': ..., 'nombre': ..., 'email': ..., 'area': ..., 'dni': ...}, ...]
    """
    try:
        sh, _ = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="0_usuarios")
        ws_u = sh.worksheet("0_usuarios")
        filas = ws_u.get_all_values()
        if not filas or len(filas) < 2:
            return []

        headers = [str(h).strip().lower() for h in filas[0]]
        idx_nombre = headers.index("nombre") if "nombre" in headers else 1
        idx_dni = headers.index("dni") if "dni" in headers else 4
        idx_area = headers.index("area") if "area" in headers else 3
        idx_email = headers.index("email") if "email" in headers else (headers.index("mail") if "mail" in headers else 2)
        idx_id_u = headers.index("id_usuario") if "id_usuario" in headers else 0
        idx_id_orig = headers.index("id_origen") if "id_origen" in headers else -1

        usuarios = []
        for f in filas[1:]:
            nom = f[idx_nombre].strip() if len(f) > idx_nombre else ""
            dni = f[idx_dni].strip() if len(f) > idx_dni else ""
            area = f[idx_area].strip() if len(f) > idx_area else ""
            email = f[idx_email].strip() if len(f) > idx_email else ""
            id_u = f[idx_id_u].strip() if len(f) > idx_id_u else ""
            id_orig = f[idx_id_orig].strip() if (idx_id_orig >= 0 and len(f) > idx_id_orig) else ""
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
                            horas = ?, instrumental = ?, usuario_mail = ?, fecha_hora = ?,
                            lugar = ?, jornada = ?, dia_semana = ?, feriado = ?,
                            modificado = 0, sincronizado = 1, id_empleado = ?, id_proyecto = ?,
                            cargado_por = ?
                        WHERE id_asistencia = ?
                    """, (
                        emp, f_str, tipo, serv,
                        hrs, inst, mail, fh,
                        tipo, f"{hrs} hs" if hrs > 0 else tipo, dia_s, fer,
                        id_e, id_p, carg_por, uid
                    ))
                    actualizados += 1
                else:
                    cursor.execute("""
                        INSERT INTO historial (
                            id_asistencia, empleado, fecha, tipo_ocf, servicio,
                            horas, instrumental, usuario_mail, fecha_hora,
                            lugar, jornada, dia_semana, feriado, modificado, sincronizado,
                            cargado_por, id_empleado, id_proyecto
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
                    """, (
                        uid, emp, f_str, tipo, serv,
                        hrs, inst, mail, fh,
                        tipo, f"{hrs} hs" if hrs > 0 else tipo, dia_s, fer,
                        carg_por, id_e, id_p
                    ))
                    existentes.add(uid)
                    insertados += 1

            conn.commit()
            try:
                reconstruir_rosters_desde_historial()
            except Exception:
                pass
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




def deduplicar_hoja_remota(spreadsheet_id: str = "") -> dict:
    """
    Audita la pestaña '1_asistencia_informada' en Google Sheets y elimina filas duplicadas,
    conservando únicamente la primera aparición de cada registro (por id_asistencia o par empleado-fecha).
    Retorna la cantidad de filas duplicadas eliminadas.
    """
    if not _sync_lock.acquire(blocking=True, timeout=60):
        return {"exito": False, "error": "Sincronización en curso. Reintente en unos momentos."}
    try:
        sh, ws = obtener_hoja_trabajo(spreadsheet_id=spreadsheet_id, sheet_name="1_asistencia_informada")
        filas = ws.get_all_values()
        if not filas or len(filas) < 2:
            return {"exito": True, "eliminados": 0, "mensaje": "No hay registros para deduplicar."}

        headers = [h.strip().lower() for h in filas[0]]
        idx_id = headers.index("id_asistencia") if "id_asistencia" in headers else 0
        idx_emp = headers.index("empleado") if "empleado" in headers else 1
        idx_fecha = headers.index("fecha") if "fecha" in headers else 2

        vistos_id = set()
        vistos_emp_fecha = set()
        filas_a_borrar = []

        # Recorremos de arriba a abajo para marcar duplicados (conservando la primera aparición)
        for r_idx, f in enumerate(filas[1:], start=2):
            uid = f[idx_id].strip() if len(f) > idx_id else ""
            emp = f[idx_emp].strip().lower() if len(f) > idx_emp else ""
            fec = f[idx_fecha].strip() if len(f) > idx_fecha else ""

            es_duplicado = False
            if uid and uid in vistos_id:
                es_duplicado = True
            elif emp and fec and (emp, fec) in vistos_emp_fecha:
                es_duplicado = True

            if es_duplicado:
                filas_a_borrar.append(r_idx)
            else:
                if uid:
                    vistos_id.add(uid)
                if emp and fec:
                    vistos_emp_fecha.add((emp, fec))

        # Borramos de abajo hacia arriba para no alterar los índices de las filas superiores
        eliminados = 0
        for r_num in reversed(filas_a_borrar):
            try:
                ws.delete_rows(r_num)
                eliminados += 1
            except Exception as e_del:
                print(f"[Sheets] Error al borrar fila duplicada {r_num}: {e_del}")

        print(f"[Sheets] Deduplicación finalizada: {eliminados} fila(s) duplicada(s) eliminada(s).")
        return {"exito": True, "eliminados": eliminados, "mensaje": f"Se eliminaron {eliminados} filas duplicadas de Google Sheets."}
    except Exception as e:
        print(f"[Sheets] Error en deduplicar_hoja_remota: {e}")
        return {"exito": False, "error": str(e)}
    finally:
        _sync_lock.release()
