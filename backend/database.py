import sqlite3
import os
import sys
import shutil
import uuid
import json
from datetime import datetime, date
from typing import TypedDict

class BloqueRoster(TypedDict):
    empleado: str
    servicio: str
    tipo: str
    inicio: date
    fin: date

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
                id_origen TEXT DEFAULT '',
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migración defensiva para usuarios_cache
        cursor.execute("PRAGMA table_info(usuarios_cache)")
        cols_usr = [col["name"] for col in cursor.fetchall()]
        if "id_origen" not in cols_usr:
            cursor.execute("ALTER TABLE usuarios_cache ADD COLUMN id_origen TEXT DEFAULT ''")

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
                hora_inicio TEXT DEFAULT '',
                hora_fin TEXT DEFAULT '',
                tipo_costo TEXT DEFAULT '',
                instrumental TEXT DEFAULT '',
                usuario_mail TEXT DEFAULT '',
                fecha_hora TEXT DEFAULT '',
                lugar TEXT,
                jornada TEXT,
                dia_semana TEXT DEFAULT '',
                feriado TEXT DEFAULT '',
                cargado_por TEXT DEFAULT '',
                id_empleado TEXT DEFAULT '',
                id_proyecto TEXT DEFAULT '',
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
        if "hora_inicio" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN hora_inicio TEXT DEFAULT ''")
        if "hora_fin" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN hora_fin TEXT DEFAULT ''")
        if "tipo_costo" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN tipo_costo TEXT DEFAULT ''")
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
        if "cargado_por" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN cargado_por TEXT DEFAULT ''")
        if "id_empleado" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN id_empleado TEXT DEFAULT ''")
        if "id_proyecto" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN id_proyecto TEXT DEFAULT ''")
        if "modificado" not in columnas_hist:
            cursor.execute("ALTER TABLE historial ADD COLUMN modificado INTEGER DEFAULT 0")

        # Tabla de auditoría para modificaciones realizadas en Google Sheets 1_1_modificaciones_realizadas
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS modificaciones_realizadas (
                id_modificacion TEXT PRIMARY KEY,
                id_asistencia TEXT NOT NULL,
                tipo_antes TEXT DEFAULT '',
                tipo_despues TEXT DEFAULT '',
                horas_antes REAL DEFAULT 0,
                horas_despues REAL DEFAULT 0,
                servicio_antes TEXT DEFAULT '',
                servicio_despues TEXT DEFAULT '',
                fecha_hora_modificaciones TEXT NOT NULL,
                quien_modifica TEXT NOT NULL,
                sincronizado INTEGER DEFAULT 0,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial(fecha)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_historial_asistencia ON historial(id_asistencia)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_modificaciones_asistencia ON modificaciones_realizadas(id_asistencia)")

        # Tabla de rosters para planificación y turnos de RRHH
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rosters (
                id TEXT PRIMARY KEY,
                empleado TEXT NOT NULL,
                dni TEXT DEFAULT '',
                fecha_inicio TEXT NOT NULL,
                fecha_fin TEXT NOT NULL,
                tipo TEXT NOT NULL,
                proyecto TEXT NOT NULL,
                precio_dia REAL DEFAULT 0,
                precio_domingo REAL DEFAULT 0,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabla de metadatos del sistema (versión instalada, estado de sincronización)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS meta_app (
                clave TEXT PRIMARY KEY,
                valor TEXT,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

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
    if usuarios is None:
        return
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM usuarios_cache")
        for u in usuarios:
            id_u = str(u.get("id_usuario", "")).strip() or str(uuid.uuid4())
            id_orig = str(u.get("id_origen", "")).strip()
            cursor.execute("""
                INSERT INTO usuarios_cache (id_usuario, nombre, email, area, dni, id_origen, actualizado_en)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                id_u,
                str(u.get("nombre", "")).strip(),
                str(u.get("email", "") or u.get("mail", "")).strip(),
                str(u.get("area", "")).strip(),
                str(u.get("dni", "")).strip(),
                id_orig
            ))
        conn.commit()

def obtener_usuarios_cache() -> list:
    """Retorna los usuarios autorizados almacenados en caché local."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id_usuario, nombre, email, area, dni, id_origen FROM usuarios_cache ORDER BY nombre ASC")
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


def depurar_registros_eliminados(ids_remotos: set, purgar_todo: bool = False) -> int:
    """
    Elimina de la base local los reportes ya sincronizados (sincronizado=1)
    cuyo id_asistencia ya no existe en Google Sheets (fueron borrados en la hoja remota).
    NUNCA purga registros pendientes de sincronización (sincronizado=0).
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
        ids_borrar = [
            f["id"] for f in filas 
            if str(f["id_asistencia"]).strip() not in ids_remotos
        ]
        if ids_borrar:
            placeholders = ",".join(["?"] * len(ids_borrar))
            cursor.execute(f"DELETE FROM historial WHERE id IN ({placeholders})", ids_borrar)
            conn.commit()
            return len(ids_borrar)
    return 0

def obtener_version_instalada() -> str:
    """Retorna la última versión registrada en la base local (meta_app)."""
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("CREATE TABLE IF NOT EXISTS meta_app (clave TEXT PRIMARY KEY, valor TEXT, actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            cursor.execute("SELECT valor FROM meta_app WHERE clave = 'version_instalada'")
            row = cursor.fetchone()
            return str(row["valor"]).strip() if row else ""
    except Exception as e:
        print(f"[BD] Error al leer versión instalada: {e}")
        return ""


def guardar_version_instalada(version: str):
    """Guarda la versión de la aplicación confirmada tras inicialización o actualización."""
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("CREATE TABLE IF NOT EXISTS meta_app (clave TEXT PRIMARY KEY, valor TEXT, actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
            cursor.execute("""
                INSERT INTO meta_app (clave, valor, actualizado_en)
                VALUES ('version_instalada', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = CURRENT_TIMESTAMP
            """, (version.strip(),))
            conn.commit()
    except Exception as e:
        print(f"[BD] Error al guardar versión instalada: {e}")


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

def obtener_id_empleado(nombre_o_dni: str) -> str:
    """Busca el id_origen (o id_usuario como fallback) asociado al nombre o DNI en la tabla usuarios_cache."""
    if not nombre_o_dni:
        return ""
    val = nombre_o_dni.strip().lower()
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id_origen, id_usuario FROM usuarios_cache WHERE LOWER(dni) = ? OR LOWER(nombre) = ? LIMIT 1", (val, val))
            row = cursor.fetchone()
            if row:
                id_orig = str(row["id_origen"]).strip() if row["id_origen"] else ""
                if id_orig:
                    return id_orig
                return str(row["id_usuario"]).strip() if row["id_usuario"] else ""
            return ""
    except Exception:
        return ""

def obtener_email_empleado(nombre_o_dni: str) -> str:
    """Busca el email asociado al nombre o DNI en la tabla usuarios_cache."""
    if not nombre_o_dni:
        return ""
    val = nombre_o_dni.strip().lower()
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT email FROM usuarios_cache WHERE LOWER(dni) = ? OR LOWER(nombre) = ? LIMIT 1", (val, val))
            row = cursor.fetchone()
            if row and row["email"]:
                return str(row["email"]).strip()
    except Exception:
        pass
    return ""

def obtener_id_proyecto(denominacion: str) -> str:
    """Busca el id_proyecto asociado a la denominación en la tabla proyectos_cache."""
    if not denominacion:
        return ""
    val = denominacion.strip().lower()
    if val.startswith("franco de obra - "):
        val = val[len("franco de obra - "):].strip()
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id_proyecto FROM proyectos_cache WHERE LOWER(denominacion) = ? LIMIT 1", (val,))
            row = cursor.fetchone()
            return str(row["id_proyecto"]).strip() if row and row["id_proyecto"] else ""
    except Exception:
        return ""

# [FN-01.05] Guardar asistencia con soporte de horas de campo y tipo de costo
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
    sincronizado: bool = False,
    cargado_por: str = "",
    id_empleado: str = "",
    id_proyecto: str = "",
    hora_inicio: str = "",
    hora_fin: str = "",
    tipo_costo: str = ""
):
    """
    Inserta una fila de asistencia con las columnas exactas de Google Sheets (17 columnas):
    id_asistencia, empleado, fecha, tipo_ocf, servicio, hora_inicio, hora_fin, horas, instrumental, usuario_mail, fecha_hora, dia_semana, feriado, id_empleado, id_proyecto, cargado_por, tipo_costo
    """
    uid = id_asistencia or str(uuid.uuid4())
    ts = fecha_hora or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    jornada_txt = f"{horas} hs" if horas > 0 else "Franco"
    dia_sem = dia_semana or calcular_dia_semana(fecha)
    fer = feriado or es_fecha_feriado(fecha)

    emp_id = id_empleado or obtener_id_empleado(empleado)
    proy_id = id_proyecto or obtener_id_proyecto(servicio)
    carg_por = (cargado_por or empleado or "").strip()

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO historial (
                id_asistencia, empleado, fecha, tipo_ocf, servicio, 
                horas, hora_inicio, hora_fin, tipo_costo, instrumental, usuario_mail, fecha_hora, 
                lugar, jornada, dia_semana, feriado, modificado, sincronizado,
                cargado_por, id_empleado, id_proyecto
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            uid,
            empleado,
            fecha,
            tipo_ocf,
            servicio,
            horas,
            hora_inicio,
            hora_fin,
            tipo_costo,
            instrumental,
            usuario_mail,
            ts,
            tipo_ocf,      # compatibilidad con columna lugar
            jornada_txt,   # compatibilidad con columna jornada
            dia_sem,
            fer,
            0,
            1 if sincronizado else 0,
            carg_por,
            emp_id,
            proy_id
        ))
        conn.commit()
    return uid

# [FN-02.01] Actualizar asistencia y registrar en tabla de auditoría 1_1_modificaciones_realizadas
def actualizar_registro_asistencia(
    id_registro: int,
    fecha: str,
    tipo_ocf: str,
    servicio: str,
    horas: float,
    empleado: str = "",
    cargado_por: str = "",
    id_empleado: str = "",
    id_proyecto: str = "",
    usuario_mail: str = "",
    hora_inicio: str = "",
    hora_fin: str = "",
    tipo_costo: str = "",
    quien_modifica: str = ""
) -> bool:
    """
    Actualiza un reporte de asistencia existente en historial, registra la auditoría
    en modificaciones_realizadas y marca el registro como pendiente de sincronizar.
    """
    dia_sem = calcular_dia_semana(fecha)
    fer = "SI" if tipo_ocf.strip().lower() == "feriado trabajado" else es_fecha_feriado(fecha)
    jornada_txt = f"{horas} hs" if horas > 0 else "Franco"

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, id_asistencia, empleado, id_empleado, id_proyecto, usuario_mail, 
                   tipo_ocf, horas, servicio, hora_inicio, hora_fin, tipo_costo
            FROM historial WHERE id = ?
        """, (id_registro,))
        row_ant = cursor.fetchone()
        if not row_ant:
            return False

        emp_actual = empleado or (row_ant["empleado"] if row_ant else "")
        cambio_empleado = bool(row_ant and empleado and empleado.strip().lower() != (row_ant["empleado"] or "").strip().lower())

        if cambio_empleado:
            emp_id = id_empleado or obtener_id_empleado(emp_actual)
            emp_mail = usuario_mail or obtener_email_empleado(emp_actual)
        else:
            emp_id = id_empleado or (row_ant["id_empleado"] if row_ant and row_ant["id_empleado"] else obtener_id_empleado(emp_actual))
            emp_mail = usuario_mail or (row_ant["usuario_mail"] if row_ant and row_ant["usuario_mail"] else obtener_email_empleado(emp_actual))

        proy_id = id_proyecto or obtener_id_proyecto(servicio)

        # Registrar auditoría en modificaciones_realizadas
        uid_asistencia = str(row_ant["id_asistencia"] or "").strip()
        tipo_previo = str(row_ant["tipo_ocf"] or "")
        horas_previas = float(row_ant["horas"] or 0.0)
        servicio_previo = str(row_ant["servicio"] or "")

        hubo_cambio_sustantivo = (
            tipo_previo.strip().lower() != tipo_ocf.strip().lower() or
            abs(horas_previas - horas) > 0.01 or
            servicio_previo.strip().lower() != servicio.strip().lower()
        )

        if hubo_cambio_sustantivo and uid_asistencia:
            id_mod = str(uuid.uuid4())
            fh_mod = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            usuario_autor = (quien_modifica or cargado_por or emp_actual or "Usuario").strip()
            cursor.execute("""
                INSERT INTO modificaciones_realizadas (
                    id_modificacion, id_asistencia, tipo_antes, tipo_despues,
                    horas_antes, horas_despues, servicio_antes, servicio_despues,
                    fecha_hora_modificaciones, quien_modifica, sincronizado
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (
                id_mod,
                uid_asistencia,
                tipo_previo,
                tipo_ocf,
                horas_previas,
                horas,
                servicio_previo,
                servicio,
                fh_mod,
                usuario_autor
            ))

        query = """
            UPDATE historial
            SET fecha = ?,
                tipo_ocf = ?,
                lugar = ?,
                servicio = ?,
                horas = ?,
                jornada = ?,
                dia_semana = ?,
                feriado = ?,
                id_proyecto = ?,
                hora_inicio = ?,
                hora_fin = ?,
                modificado = 1,
                sincronizado = 0
        """
        params = [fecha, tipo_ocf, tipo_ocf, servicio, horas, jornada_txt, dia_sem, fer, proy_id, hora_inicio, hora_fin]

        if tipo_costo:
            query += ", tipo_costo = ?"
            params.append(tipo_costo)

        if empleado:
            query += ", empleado = ?, id_empleado = ?, usuario_mail = ?"
            params.extend([empleado, emp_id, emp_mail])
        elif usuario_mail:
            query += ", usuario_mail = ?"
            params.append(usuario_mail)

        if cargado_por:
            query += ", cargado_por = ?"
            params.append(cargado_por)

        query += " WHERE id = ?"
        params.append(id_registro)

        cursor.execute(query, params)
        conn.commit()
        return cursor.rowcount > 0

def eliminar_registro_asistencia(id_registro: int) -> dict:
    """Elimina un reporte de la tabla historial por su ID entero y devuelve su id_asistencia."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, id_asistencia, empleado, fecha FROM historial WHERE id = ?", (id_registro,))
        row = cursor.fetchone()
        if not row:
            return {"exito": False, "error": "No se encontró el registro a eliminar."}
        id_asistencia = str(row["id_asistencia"] or "").strip()
        cursor.execute("DELETE FROM historial WHERE id = ?", (id_registro,))
        conn.commit()
        return {"exito": True, "id_asistencia": id_asistencia}

def obtener_historial_otros_empleados(usuario_rrhh: str = "", filtro_empleado: str = "") -> list:
    """
    Retorna los registros de historial cargados por personal de RRHH para otros empleados.
    Muestra los registros cargados por el usuario o para otros empleados delegados.
    """
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        u_clean = (usuario_rrhh or "").strip().lower()
        query = """
            SELECT 
                id,
                COALESCE(id_asistencia, '') as id_asistencia,
                COALESCE(empleado, '') as empleado,
                fecha,
                COALESCE(tipo_ocf, lugar) as tipo_ocf,
                servicio,
                COALESCE(horas, 0) as horas,
                COALESCE(hora_inicio, '') as hora_inicio,
                COALESCE(hora_fin, '') as hora_fin,
                COALESCE(tipo_costo, '') as tipo_costo,
                COALESCE(instrumental, '') as instrumental,
                COALESCE(usuario_mail, '') as usuario_mail,
                COALESCE(fecha_hora, creado_en) as fecha_hora,
                COALESCE(lugar, tipo_ocf) as lugar,
                COALESCE(jornada, '') as jornada,
                COALESCE(dia_semana, '') as dia_semana,
                COALESCE(feriado, '') as feriado,
                COALESCE(cargado_por, '') as cargado_por,
                COALESCE(id_empleado, '') as id_empleado,
                COALESCE(id_proyecto, '') as id_proyecto,
                sincronizado,
                creado_en
            FROM historial
            WHERE (
                (cargado_por != '' AND LOWER(cargado_por) != LOWER(empleado))
                OR (cargado_por != '' AND LOWER(cargado_por) = ?)
                OR (cargado_por = '' AND ? != '' AND LOWER(empleado) != ?)
            )
        """
        params = [u_clean, u_clean, u_clean]

        if filtro_empleado and filtro_empleado.strip().upper() != "TODOS":
            query += " AND LOWER(empleado) = ?"
            params.append(filtro_empleado.strip().lower())

        query += " ORDER BY fecha DESC, id DESC LIMIT 200"
        cursor.execute(query, params)
        filas = cursor.fetchall()
        return [dict(f) for f in filas]

def obtener_todos_registros_empleado(empleado: str, mes_anio: str = "") -> list:
    """
    Retorna todos los registros de asistencia de un empleado específico en la tabla historial,
    independientemente de si fueron cargados por él mismo o por RRHH.
    Opcionalmente filtra por mes (formato 'YYYY-MM').
    """
    if not empleado:
        return []
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        emp_clean = empleado.strip().lower()
        query = """
            SELECT 
                id,
                COALESCE(id_asistencia, '') as id_asistencia,
                COALESCE(empleado, '') as empleado,
                fecha,
                COALESCE(tipo_ocf, lugar) as tipo_ocf,
                servicio,
                COALESCE(horas, 0) as horas,
                COALESCE(hora_inicio, '') as hora_inicio,
                COALESCE(hora_fin, '') as hora_fin,
                COALESCE(tipo_costo, '') as tipo_costo,
                COALESCE(instrumental, '') as instrumental,
                COALESCE(usuario_mail, '') as usuario_mail,
                COALESCE(fecha_hora, creado_en) as fecha_hora,
                COALESCE(lugar, tipo_ocf) as lugar,
                COALESCE(jornada, '') as jornada,
                COALESCE(dia_semana, '') as dia_semana,
                COALESCE(feriado, '') as feriado,
                COALESCE(cargado_por, '') as cargado_por,
                COALESCE(id_empleado, '') as id_empleado,
                COALESCE(id_proyecto, '') as id_proyecto,
                sincronizado,
                creado_en
            FROM historial
            WHERE LOWER(empleado) = ?
        """
        params = [emp_clean]

        if mes_anio and mes_anio.strip():
            mes_clean = mes_anio.strip()
            query += " AND fecha LIKE ?"
            params.append(f"{mes_clean}%")

        query += " ORDER BY fecha ASC, id ASC"
        cursor.execute(query, params)
        return [dict(f) for f in cursor.fetchall()]

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
                COALESCE(hora_inicio, '') as hora_inicio,
                COALESCE(hora_fin, '') as hora_fin,
                COALESCE(tipo_costo, '') as tipo_costo,
                COALESCE(instrumental, '') as instrumental,
                COALESCE(usuario_mail, '') as usuario_mail,
                COALESCE(fecha_hora, creado_en) as fecha_hora,
                COALESCE(dia_semana, '') as dia_semana,
                COALESCE(feriado, '') as feriado,
                COALESCE(cargado_por, '') as cargado_por,
                COALESCE(id_empleado, '') as id_empleado,
                COALESCE(id_proyecto, '') as id_proyecto,
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
                    COALESCE(hora_inicio, '') as hora_inicio,
                    COALESCE(hora_fin, '') as hora_fin,
                    COALESCE(tipo_costo, '') as tipo_costo,
                    COALESCE(instrumental, '') as instrumental,
                    COALESCE(usuario_mail, '') as usuario_mail,
                    COALESCE(fecha_hora, creado_en) as fecha_hora,
                    COALESCE(lugar, tipo_ocf) as lugar,
                    COALESCE(jornada, '') as jornada,
                    COALESCE(dia_semana, '') as dia_semana,
                    COALESCE(feriado, '') as feriado,
                    COALESCE(cargado_por, '') as cargado_por,
                    COALESCE(id_empleado, '') as id_empleado,
                    COALESCE(id_proyecto, '') as id_proyecto,
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
                    COALESCE(hora_inicio, '') as hora_inicio,
                    COALESCE(hora_fin, '') as hora_fin,
                    COALESCE(tipo_costo, '') as tipo_costo,
                    COALESCE(instrumental, '') as instrumental,
                    COALESCE(usuario_mail, '') as usuario_mail,
                    COALESCE(fecha_hora, creado_en) as fecha_hora,
                    COALESCE(lugar, tipo_ocf) as lugar,
                    COALESCE(jornada, '') as jornada,
                    COALESCE(dia_semana, '') as dia_semana,
                    COALESCE(feriado, '') as feriado,
                    COALESCE(cargado_por, '') as cargado_por,
                    COALESCE(id_empleado, '') as id_empleado,
                    COALESCE(id_proyecto, '') as id_proyecto,
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

# [FN-03.05] Asignación masiva de tipo_costo para registros de asistencia
def actualizar_tipo_costo_lote(ids_asistencia: list, tipo_costo: str) -> int:
    """Actualiza en lote la columna tipo_costo para los registros indicados en SQLite y los marca para sync."""
    if not ids_asistencia:
        return 0
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        val = tipo_costo.strip().capitalize() if tipo_costo.strip().lower() in ["oficina", "campo"] else ""
        total_modificados = 0
        for item_id in ids_asistencia:
            cursor.execute("""
                UPDATE historial
                SET tipo_costo = ?,
                    sincronizado = 0,
                    modificado = 1
                WHERE id_asistencia = ? OR id = ?
            """, (val, str(item_id), item_id if str(item_id).isdigit() else -1))
            total_modificados += cursor.rowcount
        conn.commit()
        return total_modificados

# [FN-02.01] Consultar modificaciones recientes registradas
def obtener_modificaciones_recientes(limite: int = 50) -> list:
    """Retorna las últimas modificaciones registradas para auditoría de RRHH."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.*, h.empleado, h.fecha 
            FROM modificaciones_realizadas m
            LEFT JOIN historial h ON m.id_asistencia = h.id_asistencia
            ORDER BY m.fecha_hora_modificaciones DESC
            LIMIT ?
        """, (limite,))
        return [dict(r) for r in cursor.fetchall()]

# [FN-02.02] Resumen de modificaciones para alertas visuales y badges en RRHH
def obtener_resumen_modificaciones() -> dict:
    """Retorna el conteo total de modificaciones y las 10 más recientes."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as total FROM modificaciones_realizadas")
        row = cursor.fetchone()
        total = row["total"] if row else 0
        cursor.execute("""
            SELECT m.*, h.empleado, h.fecha 
            FROM modificaciones_realizadas m
            LEFT JOIN historial h ON m.id_asistencia = h.id_asistencia
            ORDER BY m.fecha_hora_modificaciones DESC
            LIMIT 10
        """)
        recientes = [dict(r) for r in cursor.fetchall()]
        return {"total": total, "recientes": recientes}

# [FN-02.01] Obtener modificaciones pendientes de sincronización a Google Sheets
def obtener_modificaciones_pendientes() -> list:
    """Retorna las filas de modificaciones_realizadas pendientes de sincronizar con Google Sheets."""
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id_modificacion, id_asistencia, tipo_antes, tipo_despues,
                   horas_antes, horas_despues, servicio_antes, servicio_despues,
                   fecha_hora_modificaciones, quien_modifica
            FROM modificaciones_realizadas
            WHERE sincronizado = 0
            ORDER BY fecha_hora_modificaciones ASC
        """)
        return [dict(f) for f in cursor.fetchall()]

# [FN-02.01] Marcar modificaciones como sincronizadas
def marcar_modificaciones_sincronizadas(ids_modificacion: list):
    """Marca como sincronizadas (sincronizado = 1) las modificaciones subidas a Google Sheets."""
    if not ids_modificacion:
        return
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        placeholders = ",".join(["?"] * len(ids_modificacion))
        cursor.execute(f"""
            UPDATE modificaciones_realizadas
            SET sincronizado = 1
            WHERE id_modificacion IN ({placeholders})
        """, ids_modificacion)
        conn.commit()

# [FN-06.02] Widget de Control de Estado Diario en Pantalla Inicial
def obtener_estado_diario_empleados(fecha: str = "") -> dict:
    """
    Retorna la lista de todos los colaboradores autorizados y su estado de reporte para la fecha actual (o especificada).
    Verde: Ya envió su check del día.
    Rojo/Gris: Aún no ha realizado el registro diario.
    """
    from datetime import datetime
    fecha_target = fecha or datetime.now().strftime("%Y-%m-%d")

    usuarios = obtener_usuarios_cache()
    if not usuarios:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT nombre, mail, area, dni FROM perfiles_empleados")
            usuarios = [dict(r) for r in cursor.fetchall()]

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT empleado, usuario_mail, tipo_ocf, servicio, horas, hora_inicio, hora_fin, tipo_costo, id_asistencia
            FROM historial
            WHERE fecha = ?
        """, (fecha_target,))
        registros_hoy = cursor.fetchall()

    mapa_registros = {}
    for r in registros_hoy:
        emp = (r["empleado"] or "").strip().lower()
        mail = (r["usuario_mail"] or "").strip().lower()
        if emp:
            mapa_registros[emp] = dict(r)
        if mail:
            mapa_registros[mail] = dict(r)

    resultado = []
    con_check = 0

    for u in usuarios:
        nom = (u.get("nombre") or "").strip()
        if not nom:
            continue
        mail = (u.get("email") or u.get("mail") or "").strip()
        area = (u.get("area") or "").strip()

        reg = mapa_registros.get(nom.lower()) or (mapa_registros.get(mail.lower()) if mail else None)

        ha_enviado = reg is not None
        if ha_enviado:
            con_check += 1

        resultado.append({
            "nombre": nom,
            "mail": mail,
            "area": area,
            "registrado": ha_enviado,
            "tipo_ocf": reg["tipo_ocf"] if reg else "",
            "servicio": reg["servicio"] if reg else "",
            "horas": reg["horas"] if reg else 0.0,
            "hora_inicio": reg.get("hora_inicio", "") if reg else "",
            "hora_fin": reg.get("hora_fin", "") if reg else "",
            "tipo_costo": reg.get("tipo_costo", "") if reg else ""
        })

    # Ordenar: primero los pendientes (para que RRHH los audite fácilmente), luego por nombre
    resultado.sort(key=lambda x: (x["registrado"], x["nombre"].lower()))

    return {
        "fecha": fecha_target,
        "total": len(resultado),
        "registrados": con_check,
        "pendientes": len(resultado) - con_check,
        "empleados": resultado
    }

def guardar_registro_roster(datos: dict) -> dict:
    """Guarda o actualiza un registro de roster con ID UUID obligatorio."""
    id_roster = str(datos.get("id") or "").strip()
    if not id_roster:
        id_roster = str(uuid.uuid4())
    
    empleado = str(datos.get("empleado") or "").strip()
    dni = str(datos.get("dni") or "").strip()
    fecha_inicio = str(datos.get("fecha_inicio") or "").strip()
    fecha_fin = str(datos.get("fecha_fin") or "").strip()
    tipo = str(datos.get("tipo") or "Campo").strip()
    proyecto = str(datos.get("proyecto") or "").strip()
    
    try:
        precio_dia = float(datos.get("precio_dia") or 0)
    except (ValueError, TypeError):
        precio_dia = 0.0

    try:
        precio_domingo = float(datos.get("precio_domingo") or 0)
    except (ValueError, TypeError):
        precio_domingo = 0.0

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO rosters (id, empleado, dni, fecha_inicio, fecha_fin, tipo, proyecto, precio_dia, precio_domingo, creado_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                empleado = excluded.empleado,
                dni = excluded.dni,
                fecha_inicio = excluded.fecha_inicio,
                fecha_fin = excluded.fecha_fin,
                tipo = excluded.tipo,
                proyecto = excluded.proyecto,
                precio_dia = excluded.precio_dia,
                precio_domingo = excluded.precio_domingo
        """, (id_roster, empleado, dni, fecha_inicio, fecha_fin, tipo, proyecto, precio_dia, precio_domingo))
        conn.commit()
    return {"exito": True, "id": id_roster}


def reconciliar_rosters_con_historial() -> int:
    """
    [Desactivado por regla de negocio]: No se deben rellenar automáticamente registros
    a la hoja de Google Sheets. Solo los usuarios pueden crear registros.
    """
    return 0

def purgar_rosters_huerfanos() -> int:
    """
    Elimina de la tabla rosters cualquier registro cuyos días ya no existan en historial.
    Esto garantiza que si se eliminaron filas de asistencia en Google Sheets (y por tanto
    se purgaron de historial), el registro de roster desaparezca automáticamente.
    Soporta turnos de Campo (Roster), Franco, Licencia y Vacaciones.
    """
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, empleado, fecha_inicio, fecha_fin FROM rosters")
            filas = cursor.fetchall()
            ids_borrar = []
            for f in filas:
                cursor.execute(
                    """
                    SELECT count(*) FROM historial 
                    WHERE empleado = ? 
                      AND fecha >= ? 
                      AND fecha <= ? 
                      AND tipo_ocf IN ('Roster', 'Franco', 'Licencia', 'Vacaciones')
                    """,
                    (f["empleado"], f["fecha_inicio"], f["fecha_fin"])
                )
                cnt = cursor.fetchone()[0]
                if cnt == 0:
                    ids_borrar.append(f["id"])
            if ids_borrar:
                placeholders = ",".join(["?"] * len(ids_borrar))
                cursor.execute(f"DELETE FROM rosters WHERE id IN ({placeholders})", ids_borrar)
                conn.commit()
                return len(ids_borrar)
    except Exception as e:
        print(f"[BD] Error al purgar rosters huérfanos: {e}")
    return 0

def reconstruir_rosters_desde_historial() -> int:
    """
    Examina la tabla historial y reconstruye automáticamente en la tabla local 'rosters'
    los bloques de planificación de Campo, Franco, Licencia y Vacaciones que hayan sido
    sincronizados desde Google Sheets.
    Preserva registros y tarifas existentes sin duplicar.
    Retorna la cantidad de bloques de roster incorporados a la tabla rosters.
    """
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()

            # 1. Mapa de DNIs por empleado desde usuarios_cache
            cursor.execute("SELECT nombre, dni FROM usuarios_cache")
            mapa_dni = {r["nombre"].strip().lower(): r["dni"].strip() for r in cursor.fetchall()}

            # 2. Mapa de tarifas conocidas por proyecto (para heredar inteligentemente)
            cursor.execute("SELECT proyecto, precio_dia, precio_domingo FROM rosters WHERE precio_dia > 0")
            mapa_tarifas_proy = {}
            for r in cursor.fetchall():
                proy_k = (r["proyecto"] or "").strip().lower()
                if proy_k and proy_k not in mapa_tarifas_proy:
                    mapa_tarifas_proy[proy_k] = (float(r["precio_dia"] or 0), float(r["precio_domingo"] or 0))

            # 3. Obtener registros existentes en rosters para no duplicar
            cursor.execute("SELECT empleado, proyecto, tipo, fecha_inicio, fecha_fin FROM rosters")
            existentes = {
                (
                    r["empleado"].strip().lower(),
                    r["proyecto"].strip().lower(),
                    r["tipo"].strip().lower(),
                    r["fecha_inicio"].strip(),
                    r["fecha_fin"].strip()
                )
                for r in cursor.fetchall()
            }

            # 4. Leer jornadas de historial que califiquen como Roster, Franco, Vacaciones o Licencia
            cursor.execute("""
                SELECT empleado, servicio, fecha, tipo_ocf
                FROM historial
                WHERE tipo_ocf IN ('Roster', 'Vacaciones', 'Licencia')
                   OR (tipo_ocf = 'Franco' AND servicio != '' AND servicio NOT IN ('Oficina', 'Administración', 'Área'))
                ORDER BY LOWER(empleado), LOWER(servicio), fecha ASC
            """)
            filas = cursor.fetchall()

            if not filas:
                return 0

            # 5. Agrupar en secuencias contiguas del mismo (empleado, servicio, tipo)
            bloques: list[BloqueRoster] = []
            current: BloqueRoster | None = None

            for f in filas:
                emp = f["empleado"].strip()
                srv = f["servicio"].strip()
                t_raw = f["tipo_ocf"].strip().lower()
                if t_raw == "roster":
                    tipo_bd = "Campo"
                elif t_raw == "franco":
                    tipo_bd = "Franco"
                elif t_raw == "vacaciones":
                    tipo_bd = "Vacaciones"
                elif t_raw == "licencia":
                    tipo_bd = "Licencia"
                else:
                    tipo_bd = f["tipo_ocf"].strip()

                fec = datetime.strptime(f["fecha"].strip(), "%Y-%m-%d").date()

                if current is None:
                    current = {
                        "empleado": emp,
                        "servicio": srv,
                        "tipo": tipo_bd,
                        "inicio": fec,
                        "fin": fec
                    }
                else:
                    mismo_grupo = (
                        current["empleado"].lower() == emp.lower() and
                        current["servicio"].lower() == srv.lower() and
                        current["tipo"] == tipo_bd
                    )
                    es_consecutivo = ((fec - current["fin"]).days == 1)

                    if mismo_grupo and es_consecutivo:
                        current["fin"] = fec
                    else:
                        bloques.append(current)
                        current = {
                            "empleado": emp,
                            "servicio": srv,
                            "tipo": tipo_bd,
                            "inicio": fec,
                            "fin": fec
                        }

            if current:
                bloques.append(current)

            # 6. Insertar en rosters los bloques que falten
            incorporados = 0
            for b in bloques:
                emp_nom = b["empleado"]
                srv_nom = b["servicio"]
                tipo_nom = b["tipo"]
                f_ini = b["inicio"].strftime("%Y-%m-%d")
                f_fin = b["fin"].strftime("%Y-%m-%d")

                clave = (emp_nom.lower(), srv_nom.lower(), tipo_nom.lower(), f_ini, f_fin)
                if clave in existentes:
                    continue

                dni_emp = mapa_dni.get(emp_nom.lower(), "")
                p_dia, p_dom = mapa_tarifas_proy.get(srv_nom.lower(), (0.0, 0.0))
                uid_roster = str(uuid.uuid4())

                cursor.execute("""
                    INSERT INTO rosters (
                        id, empleado, dni, fecha_inicio, fecha_fin,
                        tipo, proyecto, precio_dia, precio_domingo, creado_en
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (
                    uid_roster, emp_nom, dni_emp, f_ini, f_fin,
                    tipo_nom, srv_nom, p_dia, p_dom
                ))
                existentes.add(clave)
                incorporados += 1

            if incorporados > 0:
                conn.commit()
                print(f"[BD] Se reconstruyeron e incorporaron {incorporados} bloque(s) de roster desde el historial.")

            return incorporados
    except Exception as e:
        print(f"[BD] Error en reconstruir_rosters_desde_historial: {e}")
        return 0

def vaciar_rosters_locales() -> int:
    """Elimina todos los registros de la tabla rosters para una limpieza forzada."""
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM rosters")
            conn.commit()
            return cursor.rowcount
    except Exception as e:
        print(f"[BD] Error al vaciar rosters locales: {e}")
        return 0

def obtener_rosters(fecha_desde: str | None = None, fecha_hasta: str | None = None) -> list:
    """Retorna registros de roster vigentes superpuestos con el rango, purgando previamente los registros huérfanos."""
    reconstruir_rosters_desde_historial()
    purgar_rosters_huerfanos()
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        if fecha_desde and fecha_hasta:
            # Se superpone si fecha_inicio <= fecha_hasta Y fecha_fin >= fecha_desde
            cursor.execute("""
                SELECT id, empleado, dni, fecha_inicio, fecha_fin, tipo, proyecto, precio_dia, precio_domingo, creado_en
                FROM rosters
                WHERE fecha_inicio <= ? AND fecha_fin >= ?
                ORDER BY fecha_inicio ASC, empleado ASC
            """, (fecha_hasta, fecha_desde))
        else:
            cursor.execute("""
                SELECT id, empleado, dni, fecha_inicio, fecha_fin, tipo, proyecto, precio_dia, precio_domingo, creado_en
                FROM rosters
                ORDER BY fecha_inicio DESC, empleado ASC
            """)
        filas = cursor.fetchall()
        return [dict(f) for f in filas]

def eliminar_registro_roster(id_roster: str) -> bool:
    """Elimina un registro de roster por su ID UUID."""
    if not id_roster:
        return False
    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM rosters WHERE id = ?", (id_roster.strip(),))
        conn.commit()
        return cursor.rowcount > 0