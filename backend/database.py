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
    id_proyecto: str = ""
):
    """
    Inserta una fila de asistencia con las columnas exactas de Google Sheets:
    id_asistencia, empleado, fecha, tipo_ocf, servicio, horas, instrumental, usuario_mail, fecha_hora, dia_semana, feriado, id_empleado, id_proyecto
    """
    uid = id_asistencia or str(uuid.uuid4())
    ts = fecha_hora or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    jornada_txt = f"{horas} hs" if horas > 0 else "Franco"
    dia_sem = dia_semana or calcular_dia_semana(fecha)
    fer = feriado or es_fecha_feriado(fecha)

    emp_id = id_empleado or obtener_id_empleado(empleado)
    proy_id = id_proyecto or obtener_id_proyecto(servicio)

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO historial (
                id_asistencia, empleado, fecha, tipo_ocf, servicio, 
                horas, instrumental, usuario_mail, fecha_hora, 
                lugar, jornada, dia_semana, feriado, modificado, sincronizado,
                cargado_por, id_empleado, id_proyecto
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            1 if sincronizado else 0,
            cargado_por,
            emp_id,
            proy_id
        ))
        conn.commit()
    return uid

def actualizar_registro_asistencia(
    id_registro: int,
    fecha: str,
    tipo_ocf: str,
    servicio: str,
    horas: float,
    empleado: str = "",
    cargado_por: str = "",
    id_empleado: str = "",
    id_proyecto: str = ""
) -> bool:
    """
    Actualiza un reporte de asistencia existente en historial
    y lo marca como pendiente de sincronizar (sincronizado=0, modificado=1).
    """
    dia_sem = calcular_dia_semana(fecha)
    fer = "SI" if tipo_ocf.strip().lower() == "feriado trabajado" else es_fecha_feriado(fecha)
    jornada_txt = f"{horas} hs" if horas > 0 else "Franco"

    with obtener_conexion() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT empleado, id_empleado, id_proyecto FROM historial WHERE id = ?", (id_registro,))
        row_ant = cursor.fetchone()
        emp_actual = empleado or (row_ant["empleado"] if row_ant else "")
        emp_id = id_empleado or (row_ant["id_empleado"] if row_ant and row_ant["id_empleado"] else obtener_id_empleado(emp_actual))
        proy_id = id_proyecto or obtener_id_proyecto(servicio)

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
                modificado = 1,
                sincronizado = 0
        """
        params = [fecha, tipo_ocf, tipo_ocf, servicio, horas, jornada_txt, dia_sem, fer, proy_id]

        if empleado:
            query += ", empleado = ?, id_empleado = ?"
            params.extend([empleado, emp_id])

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
    Verifica que cada turno registrado en la tabla rosters tenga todas sus jornadas
    individuales cargadas en la tabla historial.
    Si algún día del rango no existe en historial (por ejemplo, si fue purgado por error
    o pendiente de sincronización), lo regenera con sincronizado=0 para que se suba
    a Google Sheets y aparezca inmediatamente en el calendario personal de asistencia.
    Retorna la cantidad de días restaurados.
    """
    from datetime import datetime as dt, timedelta
    recuperados = 0
    try:
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM rosters")
            rosters = cursor.fetchall()
            
            usuarios_cache = obtener_usuarios_cache() or []
            mapa_mails = {}
            for u in usuarios_cache:
                nom = (u.get("nombre") or "").strip().lower()
                m = (u.get("mail") or u.get("email") or "").strip()
                if nom and m:
                    mapa_mails[nom] = m

            for r in rosters:
                emp = str(r["empleado"] or "").strip()
                f_ini = str(r["fecha_inicio"] or "").strip()
                f_fin = str(r["fecha_fin"] or "").strip()
                tipo = str(r["tipo"] or "Campo").strip()
                proy = str(r["proyecto"] or "").strip()
                
                if not emp or not f_ini:
                    continue

                dias_rango = []
                try:
                    di = dt.strptime(f_ini, "%Y-%m-%d")
                    df = dt.strptime(f_fin, "%Y-%m-%d") if f_fin else di
                    if di > df:
                        di, df = df, di
                    curr = di
                    while curr <= df:
                        dias_rango.append(curr.strftime("%Y-%m-%d"))
                        curr += timedelta(days=1)
                except Exception:
                    dias_rango = [f_ini]

                es_campo = (tipo.lower() == "campo")
                tipo_ocf = "Roster" if es_campo else "Franco"
                horas = 8.0 if es_campo else 0.0
                jornada_txt = f"{horas} hs" if horas > 0 else "Franco"
                emp_id = obtener_id_empleado(emp)
                proy_id = obtener_id_proyecto(proy) if proy else ""
                mail = mapa_mails.get(emp.lower(), "")
                ts_now = dt.now().strftime("%Y-%m-%d %H:%M:%S")

                for d_str in dias_rango:
                    cursor.execute("SELECT id FROM historial WHERE LOWER(empleado) = ? AND fecha = ?", (emp.lower(), d_str))
                    row_h = cursor.fetchone()
                    if not row_h:
                        uid_asist = str(uuid.uuid4())
                        dia_sem = calcular_dia_semana(d_str)
                        fer = es_fecha_feriado(d_str)
                        cursor.execute("""
                            INSERT INTO historial (
                                id_asistencia, empleado, fecha, tipo_ocf, servicio,
                                horas, instrumental, usuario_mail, fecha_hora,
                                lugar, jornada, dia_semana, feriado, modificado, sincronizado,
                                cargado_por, id_empleado, id_proyecto
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'RRHH', ?, ?)
                        """, (
                            uid_asist, emp, d_str, tipo_ocf, proy,
                            horas, "", mail, ts_now,
                            tipo_ocf, jornada_txt, dia_sem, fer,
                            emp_id, proy_id
                        ))
                        recuperados += 1
            if recuperados > 0:
                conn.commit()
                print(f"[BD] Se reconciliaron y recuperaron {recuperados} jornada(s) de Roster en historial.")
    except Exception as e:
        print(f"[BD] Error en reconciliar_rosters_con_historial: {e}")
    return recuperados

def purgar_rosters_huerfanos() -> int:
    """
    Elimina de la tabla rosters cualquier registro cuyos días ya no existan en historial.
    Esto garantiza que si se eliminaron filas de asistencia en Google Sheets (y por tanto
    se purgaron de historial), el registro de roster desaparezca automáticamente.
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
                      AND tipo_ocf IN ('Roster', 'Franco')
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