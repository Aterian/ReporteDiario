import sqlite3
import os
import sys
import shutil
import uuid
import json
from datetime import datetime

def obtener_directorio_datos() -> str:
    """
    Retorna la ruta segura donde se guardan los datos persistentes del usuario.
    En Windows: %LOCALAPPDATA%/Ingeap/CheckDiario
    """
    appdata = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    directorio = os.path.join(appdata, "Ingeap", "CheckDiario")
    os.makedirs(directorio, exist_ok=True)
    return directorio

# Ruta fija y permanente del archivo de base de datos en AppData (persistente ante reinicios)
RUTA_DB_APPDATA = os.path.join(obtener_directorio_datos(), "registro_local.db")
RUTA_SESION_BACKUP = os.path.join(obtener_directorio_datos(), "sesion_activa.json")

# Migración defensiva: Si no existe aún la BD en AppData, buscar si existe alguna previa
if not os.path.exists(RUTA_DB_APPDATA):
    posibles_origenes = []
    if getattr(sys, "frozen", False):
        posibles_origenes.append(os.path.join(os.path.dirname(sys.executable), "registro_local.db"))
    posibles_origenes.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "registro_local.db"))
    for ruta_origen in posibles_origenes:
        if os.path.exists(ruta_origen) and ruta_origen != RUTA_DB_APPDATA:
            try:
                shutil.copy2(ruta_origen, RUTA_DB_APPDATA)
                print(f"[BD] Base de datos migrada exitosamente desde {ruta_origen} a AppData.")
                break
            except Exception as e:
                print(f"[BD] Aviso al migrar BD previa: {e}")

# RUTA_DB es SIEMPRE la ruta persistente en AppData (nunca temporal)
RUTA_DB = RUTA_DB_APPDATA

def obtener_conexion():
    """Crea y retorna una conexión a la base de datos local SQLite."""
    conn = sqlite3.connect(RUTA_DB)
    conn.row_factory = sqlite3.Row
    return conn

def inicializar_bd():
    """Crea y actualiza las tablas necesarias para soportar el esquema de Google Sheets, sesión y perfiles."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        
        # Tabla de sesión activa
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sesion (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                nombre TEXT NOT NULL,
                dni TEXT NOT NULL,
                mail TEXT DEFAULT '',
                avatar TEXT DEFAULT '',
                area TEXT DEFAULT ''
            )
        """)

        # Migración defensiva para sesion si se creó con columnas antiguas
        cursor.execute("PRAGMA table_info(sesion)")
        columnas_sesion = [col["name"] for col in cursor.fetchall()]
        if "mail" not in columnas_sesion:
            cursor.execute("ALTER TABLE sesion ADD COLUMN mail TEXT DEFAULT ''")
        if "avatar" not in columnas_sesion:
            cursor.execute("ALTER TABLE sesion ADD COLUMN avatar TEXT DEFAULT ''")
        if "area" not in columnas_sesion:
            cursor.execute("ALTER TABLE sesion ADD COLUMN area TEXT DEFAULT ''")

        # Tabla de perfiles persistentes de empleados (para recordar avatares y áreas por DNI)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS perfiles_empleados (
                dni TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                mail TEXT DEFAULT '',
                avatar TEXT DEFAULT '',
                area TEXT DEFAULT '',
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migración defensiva para perfiles_empleados
        cursor.execute("PRAGMA table_info(perfiles_empleados)")
        columnas_perfiles = [col["name"] for col in cursor.fetchall()]
        if "area" not in columnas_perfiles:
            cursor.execute("ALTER TABLE perfiles_empleados ADD COLUMN area TEXT DEFAULT ''")

        # Tabla de proyectos activos en caché (sincronizada desde 0_proyectos)
        cursor.execute("PRAGMA table_info(proyectos_cache)")
        cols_proy = [c["name"] for c in cursor.fetchall()]
        if cols_proy and "id" not in cols_proy:
            cursor.execute("DROP TABLE proyectos_cache")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS proyectos_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_proyecto TEXT DEFAULT '',
                denominacion TEXT NOT NULL,
                area TEXT NOT NULL,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabla de usuarios autorizados en caché (sincronizada desde 0_usuarios)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios_cache (
                id_usuario TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                email TEXT DEFAULT '',
                area TEXT DEFAULT '',
                dni TEXT NOT NULL,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabla de caché para días no laborales (0_no_laborales)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS no_laborales_cache (
                fecha TEXT PRIMARY KEY,
                motivo TEXT DEFAULT '',
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabla de historial con las columnas exactas de Google Sheets
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS historial (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_asistencia TEXT,
                empleado TEXT,
                fecha TEXT NOT NULL,
                tipo_ocf TEXT NOT NULL,
                servicio TEXT NOT NULL,
                horas REAL DEFAULT 0,
                instrumental TEXT DEFAULT '',
                usuario_mail TEXT DEFAULT '',
                fecha_hora TEXT DEFAULT '',
                lugar TEXT,
                jornada TEXT,
                dia_semana TEXT DEFAULT '',
                feriado TEXT DEFAULT '',
                modificado INTEGER DEFAULT 0,
                sincronizado INTEGER DEFAULT 1,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migración defensiva para historial
        cursor.execute("PRAGMA table_info(historial)")
        columnas_hist = [col["name"] for col in cursor.fetchall()]
        if "id_asistencia" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN id_asistencia TEXT DEFAULT ''")
        if "empleado" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN empleado TEXT DEFAULT ''")
        if "tipo_ocf" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN tipo_ocf TEXT DEFAULT ''")
        if "horas" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN horas REAL DEFAULT 0")
        if "instrumental" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN instrumental TEXT DEFAULT ''")
        if "usuario_mail" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN usuario_mail TEXT DEFAULT ''")
        if "fecha_hora" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN fecha_hora TEXT DEFAULT ''")
        if "dia_semana" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN dia_semana TEXT DEFAULT ''")
        if "feriado" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN feriado TEXT DEFAULT ''")
        if "modificado" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN modificado INTEGER DEFAULT 0")

        conn.commit()

def obtener_avatar_por_dni(dni: str) -> str:
    """Recupera el avatar guardado de un empleado por su DNI."""
    if not dni:
        return ""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT avatar FROM perfiles_empleados WHERE dni = ?", (dni.strip(),))
        fila = cursor.fetchone()
        if fila and fila["avatar"]:
            return fila["avatar"]
    return ""

def guardar_avatar_empleado(dni: str, avatar_base64: str, nombre: str = "", mail: str = ""):
    """Guarda permanentemente el avatar de un empleado por su DNI y actualiza la sesión activa."""
    dni_limpio = dni.strip()
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO perfiles_empleados (dni, nombre, mail, avatar, actualizado_en)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(dni) DO UPDATE SET 
                avatar = excluded.avatar,
                actualizado_en = CURRENT_TIMESTAMP
        """, (dni_limpio, nombre.strip(), mail.strip(), avatar_base64))
        # Actualizamos también en la sesión activa
        cursor.execute("UPDATE sesion SET avatar = ? WHERE id = 1", (avatar_base64,))
        conn.commit()

def obtener_area_por_dni(dni: str) -> str:
    """Recupera el área guardada de un empleado por su DNI desde perfiles o usuarios_cache."""
    if not dni:
        return ""
    dni_clean = dni.strip()
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT area FROM perfiles_empleados WHERE dni = ?", (dni_clean,))
        fila = cursor.fetchone()
        if fila and fila["area"]:
            return fila["area"]
        cursor.execute("SELECT area FROM usuarios_cache WHERE dni = ?", (dni_clean,))
        fila_u = cursor.fetchone()
        if fila_u and fila_u["area"]:
            return fila_u["area"]
    return ""

def guardar_usuarios_cache(usuarios: list):
    """Actualiza la lista de usuarios autorizados en la base local."""
    if not usuarios:
        return
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM usuarios_cache")
        for u in usuarios:
            id_u = str(u.get("id_usuario", "")).strip() or str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO usuarios_cache (id_usuario, nombre, email, area, dni, actualizado_en)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                id_u,
                str(u.get("nombre", "")).strip(),
                str(u.get("email", "") or u.get("mail", "")).strip(),
                str(u.get("area", "")).strip(),
                str(u.get("dni", "")).strip()
            ))
        conn.commit()

def obtener_usuarios_cache() -> list:
    """Retorna los usuarios autorizados almacenados en caché local."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id_usuario, nombre, email, area, dni FROM usuarios_cache ORDER BY nombre ASC")
        return [dict(f) for f in cursor.fetchall()]

def guardar_proyectos_cache(proyectos: list):
    """Actualiza la lista de proyectos activos en la base local."""
    if not proyectos:
        return
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM proyectos_cache")
        for p in proyectos:
            id_p = str(p.get("id_proyecto", "")).strip()
            denom = str(p.get("denominacion", "")).strip()
            area = str(p.get("area", "")).strip()
            if denom:
                cursor.execute("""
                    INSERT INTO proyectos_cache (id_proyecto, denominacion, area, actualizado_en)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """, (id_p, denom, area))
        conn.commit()

def obtener_proyectos_cache() -> list:
    """Retorna los proyectos almacenados en caché local."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id_proyecto, denominacion, area FROM proyectos_cache ORDER BY denominacion ASC")
        return [dict(f) for f in cursor.fetchall()]

DIAS_SEMANA = {
    0: "lunes",
    1: "martes",
    2: "miércoles",
    3: "jueves",
    4: "viernes",
    5: "sábado",
    6: "domingo"
}

def normalizar_fecha_iso(fecha_str: str) -> str:
    """Normaliza cualquier formato de fecha (YYYY-MM-DD o DD/MM/YYYY) a YYYY-MM-DD."""
    if not fecha_str:
        return ""
    texto = fecha_str.strip()
    if "/" in texto:
        partes = texto.split("/")
        if len(partes) == 3:
            d, m, y = partes[0].strip(), partes[1].strip(), partes[2].strip()
            if len(y) == 4:
                return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    if "-" in texto:
        partes = texto.split("-")
        if len(partes) == 3:
            if len(partes[0]) == 4:
                return f"{partes[0]}-{partes[1].zfill(2)}-{partes[2].zfill(2)}"
            elif len(partes[2]) == 4:
                return f"{partes[2]}-{partes[1].zfill(2)}-{partes[0].zfill(2)}"
    return texto

def calcular_dia_semana(fecha_str: str) -> str:
    """Calcula el día de la semana en español en minúsculas (ej: martes) para una fecha dada."""
    try:
        f_iso = normalizar_fecha_iso(fecha_str)
        if f_iso:
            dt = datetime.strptime(f_iso, "%Y-%m-%d")
            return DIAS_SEMANA.get(dt.weekday(), "")
    except Exception:
        pass
    return ""

def guardar_no_laborales_cache(dias: list):
    """Guarda en caché local los días no laborales de 0_no_laborales."""
    if not dias:
        return
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM no_laborales_cache")
        for d in dias:
            f = str(d.get("fecha", "")).strip()
            m = str(d.get("motivo", "")).strip()
            if f:
                cursor.execute("""
                    INSERT OR REPLACE INTO no_laborales_cache (fecha, motivo, actualizado_en)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                """, (f, m))
        conn.commit()

def obtener_no_laborales_cache() -> list:
    """Retorna los días no laborales almacenados en la base local."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT fecha, motivo FROM no_laborales_cache ORDER BY fecha ASC")
        return [dict(f) for f in cursor.fetchall()]

def es_fecha_feriado(fecha_str: str, fechas_feriados: set | None = None) -> str:
    """Determina si la fecha corresponde a un día no laboral ('SI' o 'NO')."""
    try:
        f_iso = normalizar_fecha_iso(fecha_str)
        if not f_iso:
            return "NO"
        if fechas_feriados is None:
            cache = obtener_no_laborales_cache()
            fechas_feriados = {normalizar_fecha_iso(c["fecha"]) for c in cache if c.get("fecha")}
        return "SI" if f_iso in fechas_feriados else "NO"
    except Exception:
        return "NO"


def depurar_registros_eliminados(ids_remotos: set) -> int:
    """
    Elimina de la base local los reportes con sincronizado=1 cuyo id_asistencia ya no existe
    en Google Sheets. Conserva los pendientes de sincronización (sincronizado=0).
    """
    if not ids_remotos:
        return 0
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, id_asistencia 
            FROM historial 
            WHERE sincronizado = 1 
              AND id_asistencia IS NOT NULL 
              AND id_asistencia != ''
        """)
        filas = cursor.fetchall()
        ids_borrar = [f["id"] for f in filas if f["id_asistencia"] not in ids_remotos]
        if ids_borrar:
            placeholders = ",".join(["?"] * len(ids_borrar))
            cursor.execute(f"DELETE FROM historial WHERE id IN ({placeholders})", ids_borrar)
            conn.commit()
            return len(ids_borrar)
    return 0

def obtener_sesion_activa():
    """Devuelve los datos del empleado activo restaurando su avatar y área persistentes si están disponibles."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT nombre, dni, mail, avatar, area FROM sesion WHERE id = 1")
        fila = cursor.fetchone()
        if fila:
            dni_val = fila["dni"]
            avatar_val = fila["avatar"] or ""
            area_val = fila["area"] or ""
            if not avatar_val and dni_val:
                avatar_val = obtener_avatar_por_dni(dni_val)
            if not area_val and dni_val:
                area_val = obtener_area_por_dni(dni_val)
            return {
                "nombre": fila["nombre"],
                "dni": dni_val,
                "mail": fila["mail"] or "",
                "avatar": avatar_val,
                "area": area_val
            }
        
        # Si la tabla sesion en SQLite está vacía, intentar restaurar desde el archivo de respaldo permanente
        if os.path.exists(RUTA_SESION_BACKUP):
            try:
                with open(RUTA_SESION_BACKUP, "r", encoding="utf-8") as f:
                    datos = json.load(f)
                    if isinstance(datos, dict) and datos.get("dni") and datos.get("nombre"):
                        # Restaurar en SQLite para futuras consultas rápidas
                        cursor.execute("""
                            INSERT INTO sesion (id, nombre, dni, mail, avatar, area)
                            VALUES (1, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET 
                                nombre = excluded.nombre, 
                                dni = excluded.dni,
                                mail = excluded.mail,
                                avatar = excluded.avatar,
                                area = excluded.area
                        """, (
                            datos["nombre"],
                            datos["dni"],
                            datos.get("mail", ""),
                            datos.get("avatar", ""),
                            datos.get("area", "")
                        ))
                        conn.commit()
                        return datos
            except Exception as e:
                print(f"[Sesion] Aviso al recuperar sesion desde backup JSON: {e}")

        return None

def guardar_sesion_activa(nombre: str, dni: str, mail: str = "", avatar: str = "", area: str = ""):
    """Registra la sesión del empleado restaurando su avatar y área persistente si ya tiene uno."""
    dni_limpio = dni.strip()
    avatar_final = avatar
    if not avatar_final:
        avatar_final = obtener_avatar_por_dni(dni_limpio)
    area_final = area
    if not area_final:
        area_final = obtener_area_por_dni(dni_limpio)

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        # Asegurar que el empleado esté registrado en perfiles_empleados
        cursor.execute("""
            INSERT INTO perfiles_empleados (dni, nombre, mail, avatar, area, actualizado_en)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(dni) DO UPDATE SET 
                nombre = excluded.nombre,
                mail = excluded.mail,
                avatar = CASE WHEN excluded.avatar != '' THEN excluded.avatar ELSE perfiles_empleados.avatar END,
                area = CASE WHEN excluded.area != '' THEN excluded.area ELSE perfiles_empleados.area END,
                actualizado_en = CURRENT_TIMESTAMP
        """, (dni_limpio, nombre.strip(), mail.strip(), avatar_final, area_final))

        cursor.execute("""
            INSERT INTO sesion (id, nombre, dni, mail, avatar, area)
            VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                nombre = excluded.nombre, 
                dni = excluded.dni,
                mail = excluded.mail,
                avatar = excluded.avatar,
                area = excluded.area
        """, (nombre.strip(), dni_limpio, mail.strip(), avatar_final, area_final))
        conn.commit()

    # Respaldo permanente espejo en JSON
    try:
        with open(RUTA_SESION_BACKUP, "w", encoding="utf-8") as f:
            json.dump({
                "nombre": nombre.strip(),
                "dni": dni_limpio,
                "mail": mail.strip(),
                "avatar": avatar_final,
                "area": area_final
            }, f, ensure_ascii=False)
    except Exception as e:
        print(f"[Sesion] Aviso al guardar backup JSON: {e}")

def actualizar_avatar_sesion(avatar_base64: str):
    """Actualiza el avatar tanto en la sesión activa como en el perfil permanente del empleado."""
    sesion = obtener_sesion_activa()
    if sesion and sesion.get("dni"):
        guardar_avatar_empleado(
            dni=sesion["dni"],
            avatar_base64=avatar_base64,
            nombre=sesion.get("nombre", ""),
            mail=sesion.get("mail", "")
        )
    else:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE sesion SET avatar = ? WHERE id = 1", (avatar_base64,))
            conn.commit()

def borrar_sesion():
    """Elimina la sesión actual para permitir cambiar de usuario sin borrar los perfiles."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sesion WHERE id = 1")
        conn.commit()
    if os.path.exists(RUTA_SESION_BACKUP):
        try:
            os.remove(RUTA_SESION_BACKUP)
        except Exception:
            pass

def guardar_registro_asistencia(
    empleado: str,
    fecha: str,
    tipo_ocf: str,
    servicio: str,
    horas: float,
    usuario_mail: str,
    instrumental: str = "",
    fecha_hora: str = "",
    id_asistencia: str = "",
    dia_semana: str = "",
    feriado: str = "",
    sincronizado: bool = False
):
    """
    Inserta una fila de asistencia con las columnas exactas de Google Sheets:
    id_asistencia, empleado, fecha, tipo_ocf, servicio, horas, instrumental, usuario_mail, fecha_hora, dia_semana, feriado
    """
    uid = id_asistencia or str(uuid.uuid4())
    ts = fecha_hora or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    jornada_txt = f"{horas} hs" if horas > 0 else "Franco"
    dia_sem = dia_semana or calcular_dia_semana(fecha)
    fer = feriado or es_fecha_feriado(fecha)

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO historial (
                id_asistencia, empleado, fecha, tipo_ocf, servicio, 
                horas, instrumental, usuario_mail, fecha_hora, 
                lugar, jornada, dia_semana, feriado, modificado, sincronizado
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            uid,
            empleado,
            fecha,
            tipo_ocf,
            servicio,
            horas,
            instrumental,
            usuario_mail,
            ts,
            tipo_ocf,      # compatibilidad con columna lugar
            jornada_txt,   # compatibilidad con columna jornada
            dia_sem,
            fer,
            0,
            1 if sincronizado else 0
        ))
        conn.commit()
    return uid

def actualizar_registro_asistencia(
    id_registro: int,
    fecha: str,
    tipo_ocf: str,
    servicio: str,
    horas: float
) -> bool:
    """
    Actualiza un reporte de asistencia existente en historial
    y lo marca como pendiente de sincronizar (sincronizado=0, modificado=1).
    """
    dia_sem = calcular_dia_semana(fecha)
    fer = es_fecha_feriado(fecha)
    jornada_txt = f"{horas} hs" if horas > 0 else "Franco"

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE historial
            SET fecha = ?,
                tipo_ocf = ?,
                lugar = ?,
                servicio = ?,
                horas = ?,
                jornada = ?,
                dia_semana = ?,
                feriado = ?,
                modificado = 1,
                sincronizado = 0
            WHERE id = ?
        """, (
            fecha, tipo_ocf, tipo_ocf, servicio, horas, jornada_txt, dia_sem, fer, id_registro
        ))
        conn.commit()
        return cursor.rowcount > 0

def obtener_pendientes_sincronizacion():
    """Retorna todas las filas de historial que aún no han sido sincronizadas con Google Sheets."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                id,
                COALESCE(id_asistencia, '') as id_asistencia,
                COALESCE(empleado, '') as empleado,
                fecha,
                COALESCE(tipo_ocf, lugar) as tipo_ocf,
                servicio,
                COALESCE(horas, 0) as horas,
                COALESCE(instrumental, '') as instrumental,
                COALESCE(usuario_mail, '') as usuario_mail,
                COALESCE(fecha_hora, creado_en) as fecha_hora,
                COALESCE(dia_semana, '') as dia_semana,
                COALESCE(feriado, '') as feriado,
                COALESCE(modificado, 0) as modificado
            FROM historial
            WHERE sincronizado = 0
            ORDER BY id ASC
        """)
        filas = cursor.fetchall()
        return [dict(f) for f in filas]

def marcar_como_sincronizados(ids_asistencia: list):
    """Actualiza el flag sincronizado a 1 para los registros indicados por su id_asistencia."""
    if not ids_asistencia:
        return
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        placeholders = ",".join(["?"] * len(ids_asistencia))
        cursor.execute(f"""
            UPDATE historial 
            SET sincronizado = 1, modificado = 0
            WHERE id_asistencia IN ({placeholders})
        """, ids_asistencia)
        conn.commit()

def guardar_registro_historial(fecha: str, lugar: str, servicio: str, jornada: str, sincronizado: bool = True):
    """Método de conveniencia para compatibilidad."""
    # Extraer horas si viene en texto tipo '4.0 hs'
    horas_val = 8.0
    try:
        horas_val = float(jornada.replace("hs", "").replace("h", "").strip())
    except Exception:
        horas_val = 0.0 if "franco" in jornada.lower() else 8.0

    sesion = obtener_sesion_activa()
    empleado_nom = sesion["nombre"] if sesion else "Empleado"
    mail_val = sesion["mail"] if sesion else ""

    guardar_registro_asistencia(
        empleado=empleado_nom,
        fecha=fecha,
        tipo_ocf=lugar,
        servicio=servicio,
        horas=horas_val,
        usuario_mail=mail_val,
        sincronizado=sincronizado
    )

def obtener_ultimos_registros(empleado: str = "", usuario_mail: str = "", limite: int = 30):
    """Retorna los últimos reportes cargados para la pantalla de historial filtrando por usuario."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        emp_clean = (empleado or "").strip()
        mail_clean = (usuario_mail or "").strip()

        if emp_clean or mail_clean:
            cursor.execute("""
                SELECT 
                    id,
                    COALESCE(id_asistencia, '') as id_asistencia,
                    COALESCE(empleado, '') as empleado,
                    fecha,
                    COALESCE(tipo_ocf, lugar) as tipo_ocf,
                    servicio,
                    COALESCE(horas, 0) as horas,
                    COALESCE(instrumental, '') as instrumental,
                    COALESCE(usuario_mail, '') as usuario_mail,
                    COALESCE(fecha_hora, creado_en) as fecha_hora,
                    COALESCE(lugar, tipo_ocf) as lugar,
                    COALESCE(jornada, '') as jornada,
                    COALESCE(dia_semana, '') as dia_semana,
                    COALESCE(feriado, '') as feriado,
                    sincronizado,
                    creado_en
                FROM historial 
                WHERE (usuario_mail != '' AND LOWER(usuario_mail) = LOWER(?))
                   OR (empleado != '' AND LOWER(empleado) = LOWER(?))
                ORDER BY id DESC 
                LIMIT ?
            """, (mail_clean, emp_clean, limite))
        else:
            cursor.execute("""
                SELECT 
                    id,
                    COALESCE(id_asistencia, '') as id_asistencia,
                    COALESCE(empleado, '') as empleado,
                    fecha,
                    COALESCE(tipo_ocf, lugar) as tipo_ocf,
                    servicio,
                    COALESCE(horas, 0) as horas,
                    COALESCE(instrumental, '') as instrumental,
                    COALESCE(usuario_mail, '') as usuario_mail,
                    COALESCE(fecha_hora, creado_en) as fecha_hora,
                    COALESCE(lugar, tipo_ocf) as lugar,
                    COALESCE(jornada, '') as jornada,
                    COALESCE(dia_semana, '') as dia_semana,
                    COALESCE(feriado, '') as feriado,
                    sincronizado,
                    creado_en
                FROM historial 
                ORDER BY id DESC 
                LIMIT ?
            """, (limite,))
        filas = cursor.fetchall()
        return [dict(f) for f in filas]

def usuario_registro_hoy(empleado: str = "", usuario_mail: str = "") -> bool:
    """Verifica si el empleado ya completó al menos un registro para la fecha actual."""
    from datetime import datetime
    fecha_hoy = datetime.now().strftime("%Y-%m-%d")
    emp_clean = (empleado or "").strip()
    mail_clean = (usuario_mail or "").strip()

    if not emp_clean and not mail_clean:
        return False

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COUNT(*) as cant 
            FROM historial 
            WHERE fecha = ? 
              AND (
                (usuario_mail != '' AND LOWER(usuario_mail) = LOWER(?))
                OR (empleado != '' AND LOWER(empleado) = LOWER(?))
              )
        """, (fecha_hoy, mail_clean, emp_clean))
        fila = cursor.fetchone()
        return (fila["cant"] if fila else 0) > 0