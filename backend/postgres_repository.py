# [MOD-07] Persistencia exclusiva en PostgreSQL
import calendar
import re
import unicodedata
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from functools import lru_cache
from threading import Lock
from uuid import UUID

from error_handler import PermisoDenegadoError, RegistroNoEncontradoError, ValidacionError
from postgres_db import obtener_cursor_pg
from postgres_models import (
    UsuarioSueldoCreate, ErrorRemotoCreate, ProyectoCreate, ProyectoUpdate,
    AsistenciaCreate, RosterCreate, RosterUpdate, RosterResponse,
    LiquidacionResponse, TarifaRosterCreate, UsuarioSueldoUpdate, ConfiguracionSueldoUpdate
)

_sesion = None
import time as _time
_sesion_lock = Lock()
_cache_mem = {}
_cache_lock = Lock()
_key_locks = {}

def _obtener_de_cache(clave, ttl_segundos, generador):
    ahora = _time.time()
    with _cache_lock:
        if clave in _cache_mem:
            expira, valor = _cache_mem[clave]
            if ahora < expira:
                return valor
        lock_clave = _key_locks.setdefault(clave, Lock())

    with lock_clave:
        ahora = _time.time()
        with _cache_lock:
            if clave in _cache_mem:
                expira, valor = _cache_mem[clave]
                if ahora < expira:
                    return valor
        valor = generador()
        with _cache_lock:
            _cache_mem[clave] = (_time.time() + ttl_segundos, valor)
        return valor

def invalidar_caches_repositorio(*claves):
    with _cache_lock:
        if not claves:
            _cache_mem.clear()
        else:
            for c in claves:
                _cache_mem.pop(c, None)
                if c in (('usuarios', True), ('usuarios', False), 'usuarios'):
                    _cache_mem.pop(('usuarios', False), None)
                    _cache_mem.pop(('usuarios', True), None)
TIPOS_ROSTER = {"campo": "activo", "activo": "activo", "franco": "franco", "vacaciones": "vacaciones", "licencia": "licencia"}
ETIQUETAS_ROSTER = {"activo": "Campo", "franco": "Franco", "vacaciones": "Vacaciones", "licencia": "Licencia"}


# [FN-07.02] Serializar tipos PostgreSQL sin recalcular importes
def serializar(valor):
    if isinstance(valor, dict):
        return {k: serializar(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [serializar(v) for v in valor]
    if isinstance(valor, (date, datetime, time)):
        return valor.isoformat()
    if isinstance(valor, (UUID, Decimal)):
        return str(valor)
    return valor


# [FN-07.02] Normalizar etiquetas del puente
def normalizar_texto(texto):
    return "".join(c for c in unicodedata.normalize("NFKD", str(texto or "")) if not unicodedata.combining(c)).strip().lower()


# [FN-07.02] Validar identificadores UUID
def uuid_valido(valor):
    try:
        return str(UUID(str(valor)))
    except (ValueError, TypeError, AttributeError):
        raise ValidacionError("Identificador UUID inválido.") from None


# [FN-07.01] Verificar variantes observadas del esquema antes de consultar
@lru_cache(maxsize=1)
def perfil_esquema():
    with obtener_cursor_pg() as cur:
        cur.execute("SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE table_schema IN (%s,%s)", ("app_rrhh", "app_proyectos"))
        tablas = {}
        for fila in cur.fetchall():
            tablas.setdefault((fila["table_schema"], fila["table_name"]), set()).add(fila["column_name"])
    usuarios = tablas.get(("app_rrhh", "a_1_usuarios"), set())
    proyectos = tablas.get(("app_proyectos", "b_1_proyectos_servicios"), set())
    if {"nombre_completo", "email"} <= usuarios:
        nombre, correo = "u.nombre_completo", "u.email"
        nombre_cargador = "uc.nombre_completo"
        nombre_modificador = "um.nombre_completo"
    elif {"nombre", "apellido", "correo"} <= usuarios:
        nombre, correo = "concat_ws(' ', u.nombre, u.apellido)", "u.correo"
        nombre_cargador = "NULLIF(concat_ws(' ', uc.nombre, uc.apellido), '')"
        nombre_modificador = "NULLIF(concat_ws(' ', um.nombre, um.apellido), '')"
    else:
        raise ValidacionError("El esquema de usuarios no coincide con las variantes verificadas.")
    if "denominacion" in proyectos:
        proyecto = "p.denominacion"
    elif "codificacion_serv" in proyectos:
        proyecto = "COALESCE(p.codificacion_serv, p.id_proyecto::text)"
    else:
        raise ValidacionError("Falta la denominación o codificación del proyecto.")
    requeridas = {
        ("app_rrhh", "b_1_roster"): {"id_roster", "id_usuario", "id_proyecto", "id_tarifa", "fecha_inicio", "fecha_fin", "tipo_turno", "total_viaticos", "cargado_por"},
        ("app_rrhh", "b_1_asistencias"): {"id_asistencia", "id_usuario", "fecha", "activo_franco", "lugar", "tipo_dia", "dedicado_a", "hora_inicio", "hora_fin", "horas_dedicadas", "id_proyecto", "id_roster", "costo_dia", "costo_manual", "cargado_por", "fecha_hora_carga"},
        ("app_rrhh", "a_1_calculo_sueldo"): {"id_calculo_sueldo", "id_usuario", "ciclo_cobro", "subtotal_estimado", "total_real", "total_adicionales", "sueldo_total"},
        ("app_rrhh", "a_1_adicionales_sueldo"): {"id_adicional", "id_calculo_sueldo", "fecha", "cantidad_adicional", "descripcion"},
        ("app_rrhh", "a_1_sueldos_base"): {"id_usuario", "dia_oficina", "dia_obra", "lugar_habitual"},
        ("app_rrhh", "b_1_tarifas_roster"): {"id_tarifa", "id_proyecto", "dia_normal", "dia_domingo", "subida", "bajada", "adicional_turno", "es_activa"},
    }
    if any(not columnas <= tablas.get(tabla, set()) for tabla, columnas in requeridas.items()):
        raise ValidacionError("El esquema operativo de PostgreSQL está incompleto; revise tablas y columnas.")
    tiene_auditoria = ("app_rrhh", "b_1_modificaciones_realizadas") in tablas and {"id_modificacion", "id_asistencia", "detalle_cambio"} <= tablas.get(("app_rrhh", "b_1_modificaciones_realizadas"), set())
    tiene_soft_delete_asistencias = "eliminado_en" in tablas.get(("app_rrhh", "b_1_asistencias"), set())
    return {"nombre": nombre, "correo": correo, "rol": "u.rol_app" if "rol_app" in usuarios else "NULL::text",
            "primer_nombre": "u.nombre" if "nombre" in usuarios else "split_part(u.nombre_completo, ' ', 1)",
            "apellido": "u.apellido" if "apellido" in usuarios else "split_part(u.nombre_completo, ' ', 2)",
            "proyecto": proyecto, "proyecto_activo": "p.activo IS TRUE" if "activo" in proyectos else "TRUE",
            "proyecto_area": "p.area" if "area" in proyectos else "NULL::text", "roles_disponibles": "rol_app" in usuarios, "nombre_cargador": nombre_cargador,
            "nombre_modificador": nombre_modificador, "tiene_auditoria": tiene_auditoria,
            "tiene_soft_delete_asistencias": tiene_soft_delete_asistencias,
            "modalidad_calculo": "s.modalidad_calculo::text" if "modalidad_calculo" in tablas.get(("app_rrhh", "a_1_sueldos_base"), set()) else "'base_30'"}


# [FN-07.01] Comprobar conexión sin crear tablas
def inicializar_bd():
    return perfil_esquema()


# [FN-07.02] Consultar empleados, valores diarios generados y último registro
def obtener_usuarios_cache(incluir_inactivos=False):
    def _cargar():
        p = perfil_esquema()
        with obtener_cursor_pg() as cur:
            cur.execute(f"""SELECT u.id_usuario, u.id_usuario AS id_origen, u.dni, {p['nombre']} AS nombre,
                {p['primer_nombre']} AS primer_nombre, {p['apellido']} AS apellido,
                {p['correo']} AS mail, {p['correo']} AS email, u.area, COALESCE({p['rol']}, 'user_1') AS rol_app,
                u.activo, s.sueldo_oficina, s.sueldo_obra,
                s.dia_oficina AS costo_dia_ofi, s.dia_obra AS costo_dia_obra, COALESCE(s.lugar_habitual, 'oficina') AS lugar_habitual,
                COALESCE(s.modalidad_calculo::text, 'base_30') AS modalidad_calculo,
                ult.fecha AS ultima_asistencia_fecha, ult.lugar AS ultima_asistencia_lugar,
                ult.activo_franco AS ultima_asistencia_estado, ult.denominacion AS ultima_asistencia_proyecto
                FROM app_rrhh.a_1_usuarios u
                LEFT JOIN app_rrhh.a_1_sueldos_base s ON s.id_usuario = u.id_usuario
                LEFT JOIN LATERAL (
                    SELECT a.fecha, a.lugar, a.activo_franco, {p['proyecto']} AS denominacion
                    FROM app_rrhh.b_1_asistencias a
                    LEFT JOIN app_proyectos.b_1_proyectos_servicios p ON p.id_proyecto = a.id_proyecto
                    WHERE a.id_usuario = u.id_usuario
                    ORDER BY a.fecha DESC, a.fecha_hora_carga DESC
                    LIMIT 1
                ) ult ON TRUE
                WHERE (%s IS TRUE OR u.activo IS TRUE) ORDER BY nombre""", (incluir_inactivos,))
            return serializar(cur.fetchall())
    return _obtener_de_cache(("usuarios", bool(incluir_inactivos)), 45, _cargar)


# [FN-07.02] Autenticar empleado estrictamente por DNI y Nombre
def autenticar_usuario(nombre: str, dni: str, usuarios=None):
    if not nombre or not str(nombre).strip():
        raise ValidacionError("Ingrese el nombre del colaborador.")
    dni_str = str(dni or "").strip()
    dni_limpio = re.sub(r"\D", "", dni_str)
    if len(dni_limpio) < 6 and len(dni_str) < 6:
        raise ValidacionError("El DNI debe contener al menos 6 dígitos numéricos.")
    usuarios = usuarios if usuarios is not None else obtener_usuarios_cache(incluir_inactivos=False)
    nom_norm = normalizar_texto(nombre)
    coincidencias = [
        u for u in usuarios
        if u.get("activo") is not False
        and ((dni_limpio and re.sub(r"\D", "", str(u.get("dni") or "")).strip() == dni_limpio) or str(u.get("dni") or "").strip() == dni_str)
        and normalizar_texto(u.get("nombre")) == nom_norm
    ]
    if len(coincidencias) != 1:
        raise ValidacionError("El nombre y DNI no coinciden con un empleado activo.")
    return coincidencias[0]


# [FN-07.02] Resolver empleados activos sin ambigüedad
def resolver_usuario(referencia, usuarios=None):
    usuarios = usuarios if usuarios is not None else obtener_usuarios_cache()
    ref = normalizar_texto(referencia)
    candidatos = [u for u in usuarios if ref and ref in {normalizar_texto(u.get(k)) for k in ("id_usuario", "dni", "nombre")}]
    if len(candidatos) != 1:
        raise ValidacionError("Seleccione un empleado activo inequívoco.")
    return candidatos[0]


# [FN-07.02] Mantener sesión en memoria
def guardar_sesion_activa(usuario):
    global _sesion
    with _sesion_lock:
        _sesion = dict(usuario)


# [FN-07.02] Revalidar estado y rol de la sesión
def obtener_sesion_activa():
    with _sesion_lock:
        identidad = dict(_sesion) if _sesion else None
    if identidad is None:
        return None
    actual = next((u for u in obtener_usuarios_cache() if u["id_usuario"] == identidad["id_usuario"]), None)
    if actual is None:
        borrar_sesion()
    return actual


# [FN-07.02] Cerrar sesión
def borrar_sesion():
    global _sesion
    with _sesion_lock:
        _sesion = None
    invalidar_caches_repositorio()


# [FN-07.02] Consultar catálogo de proyectos real
def obtener_proyectos_cache():
    def _cargar():
        p = perfil_esquema()
        with obtener_cursor_pg() as cur:
            cur.execute(f"""SELECT p.id_proyecto,{p['proyecto']} AS denominacion,{p['proyecto_area']} AS area
                FROM app_proyectos.b_1_proyectos_servicios p WHERE p.id_proyecto IS NOT NULL
                AND {p['proyecto_activo']} ORDER BY denominacion""")
            return serializar(cur.fetchall())
    return _obtener_de_cache(("proyectos",), 120, _cargar)


# [FN-07.02] Resolver claves de proyecto
def resolver_proyecto(datos, proyectos):
    for clave in ("id_proyecto", "proyecto", "servicio"):
        ref = normalizar_texto(datos.get(clave))
        if not ref:
            continue
        candidatos = [p for p in proyectos if ref in {normalizar_texto(p["id_proyecto"]), normalizar_texto(p["denominacion"])}]
        if len(candidatos) == 1:
            return candidatos[0]["id_proyecto"]
        parciales = [p for p in proyectos if len(ref) >= 8 and (ref in normalizar_texto(p["denominacion"]) or normalizar_texto(p["denominacion"]) in ref)]
        if len(parciales) == 1:
            return parciales[0]["id_proyecto"]
    raise ValidacionError("Seleccione un proyecto válido de PostgreSQL.")


# [FN-07.04] Consultar tarifas activas
def obtener_tarifas_roster_cache():
    def _cargar():
        p = perfil_esquema()
        with obtener_cursor_pg() as cur:
            cur.execute(f"""SELECT t.*,t.dia_domingo AS domingo,t.adicional_turno AS adicionales,{p['proyecto']} AS proyecto
                FROM app_rrhh.b_1_tarifas_roster t JOIN app_proyectos.b_1_proyectos_servicios p ON p.id_proyecto=t.id_proyecto
                WHERE t.es_activa IS TRUE ORDER BY proyecto""")
            return serializar(cur.fetchall())
    return _obtener_de_cache(("tarifas_roster",), 60, _cargar)


# [FN-07.04] Traducir el contrato React de turnos
def preparar_roster(datos, usuarios, proyectos):
    if not isinstance(datos, dict):
        raise ValidacionError("Datos de roster inválidos.")
    estado = TIPOS_ROSTER.get(normalizar_texto(datos.get("tipo", "Campo")))
    if estado is None:
        raise ValidacionError("Tipo de turno inválido.")
    valores = {"id_usuario":resolver_usuario(datos.get("id_empleado") or datos.get("empleado"),usuarios)["id_usuario"],
               "id_proyecto":resolver_proyecto(datos,proyectos),"fecha_inicio":datos.get("fecha_inicio"),
               "fecha_fin":datos.get("fecha_fin"),"tipo_turno":estado}
    return RosterUpdate(**valores,id_roster=datos["id"]) if datos.get("id") else RosterCreate(**valores)


# [FN-07.04] Guardar turnos en una sola transacción sin generar asistencias en Python
def guardar_rosters_atomicos(lista_datos, operador):
    if not isinstance(lista_datos,list) or not 1 <= len(lista_datos) <= 200:
        raise ValidacionError("Envíe entre 1 y 200 turnos.")
    usuarios, proyectos = obtener_usuarios_cache(), obtener_proyectos_cache()
    modelos = [preparar_roster(d,usuarios,proyectos) for d in lista_datos]
    resultados = []
    with obtener_cursor_pg(commit=True) as cur:
        uids_ordenados = sorted({str(m.id_usuario) for m in modelos})
        for uid in uids_ordenados:
            cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"checkdiario.roster.{uid}",))
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario=ANY(%s::uuid[]) ORDER BY id_usuario FOR UPDATE", (uids_ordenados,))
        for m in modelos:
            identificador = str(m.id_roster) if isinstance(m,RosterUpdate) else None
            if identificador:
                cur.execute("SELECT id_roster FROM app_rrhh.b_1_roster WHERE id_roster=%s FOR UPDATE",(identificador,))
                if not cur.fetchone():
                    raise RegistroNoEncontradoError("No se encontró el turno a modificar.")
            cur.execute("""SELECT id_roster FROM app_rrhh.b_1_roster WHERE id_usuario=%s
                AND fecha_inicio<=%s AND fecha_fin>=%s AND (%s::uuid IS NULL OR id_roster<>%s::uuid) LIMIT 1""",
                (str(m.id_usuario),m.fecha_fin,m.fecha_inicio,identificador,identificador))
            if cur.fetchone():
                raise ValidacionError("El empleado ya tiene un turno que se superpone con estas fechas.")
            valores = (str(m.id_usuario),str(m.id_proyecto),m.fecha_inicio,m.fecha_fin,m.tipo_turno.value,uuid_valido(operador))
            if identificador:
                cur.execute("""UPDATE app_rrhh.b_1_roster SET id_usuario=%s,id_proyecto=%s,fecha_inicio=%s,
                    fecha_fin=%s,tipo_turno=%s,cargado_por=%s WHERE id_roster=%s
                    RETURNING id_roster AS id,total_viaticos""",(*valores,identificador))
            else:
                cur.execute("""INSERT INTO app_rrhh.b_1_roster (id_usuario,id_proyecto,fecha_inicio,fecha_fin,tipo_turno,cargado_por)
                    VALUES (%s,%s,%s,%s,%s,%s) RETURNING id_roster AS id,total_viaticos""",valores)
            resultados.append(serializar(cur.fetchone()))
    invalidar_caches_repositorio(('usuarios', True))
    return resultados


# [FN-07.04] Leer rosters con la tarifa histórica vinculada
def obtener_rosters(fecha_desde=None, fecha_hasta=None):
    desde = date.fromisoformat(fecha_desde) if fecha_desde else None
    hasta = date.fromisoformat(fecha_hasta) if fecha_hasta else None
    p = perfil_esquema()
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT r.id_roster AS id,r.id_usuario AS id_empleado,r.id_proyecto,r.id_tarifa,
            {p['nombre']} AS empleado,{p['proyecto']} AS proyecto,r.fecha_inicio,r.fecha_fin,r.tipo_turno,r.total_viaticos,
            t.dia_normal AS precio_dia,t.dia_domingo AS precio_domingo,t.subida,t.bajada,t.adicional_turno
            FROM app_rrhh.b_1_roster r JOIN app_rrhh.a_1_usuarios u ON u.id_usuario=r.id_usuario
            JOIN app_proyectos.b_1_proyectos_servicios p ON p.id_proyecto=r.id_proyecto
            LEFT JOIN app_rrhh.b_1_tarifas_roster t ON t.id_tarifa=r.id_tarifa
            WHERE (%s::date IS NULL OR r.fecha_fin>=%s::date) AND (%s::date IS NULL OR r.fecha_inicio<=%s::date) AND (r.eliminado_en IS NULL)
            ORDER BY empleado,r.fecha_inicio,r.id_roster""",(desde,desde,hasta,hasta))
        filas = serializar(cur.fetchall())
    return [serializar(RosterResponse.model_validate({**f,"tipo":ETIQUETAS_ROSTER[f["tipo_turno"]]}).model_dump()) for f in filas]


# [FN-07.05] Borrado lógico de turno de Roster con cascada a asistencias
def eliminar_registro_roster(id_roster, operador="", administrador=False):
    uid_roster = uuid_valido(id_roster)
    operador_uid = uuid_valido(operador) if operador else None
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario FROM app_rrhh.b_1_roster WHERE id_roster=%s AND (eliminado_en IS NULL) FOR UPDATE", (uid_roster,))
        fila = cur.fetchone()
        if not fila:
            raise RegistroNoEncontradoError("No se encontró el turno de Roster o ya fue eliminado.")
        if not administrador:
            raise PermisoDenegadoError("Solo usuarios con rol de RRHH o Administración pueden eliminar turnos de Roster.")
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"checkdiario.roster.{fila['id_usuario']}",))
        cur.execute("""UPDATE app_rrhh.b_1_roster
            SET eliminado_en = TIMEZONE('utc', NOW()), eliminado_por = %s
            WHERE id_roster = %s AND (eliminado_en IS NULL)
            RETURNING id_roster AS id""", (operador_uid, uid_roster))
        res = serializar(cur.fetchone())
    invalidar_caches_repositorio(('usuarios', True))
    return {"exito": True, "mensaje": "Turno de Roster eliminado correctamente.", **res}


# [FN-07.05] Borrado lógico de registro de asistencia individual
def eliminar_registro_asistencia(id_registro, operador="", administrador=False):
    uid_asist = uuid_valido(id_registro)
    operador_uid = uuid_valido(operador) if operador else None
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario, id_roster, fecha FROM app_rrhh.b_1_asistencias WHERE id_asistencia=%s AND (eliminado_en IS NULL) FOR UPDATE", (uid_asist,))
        fila = cur.fetchone()
        if not fila:
            raise RegistroNoEncontradoError("No se encontró la asistencia o ya fue eliminada.")
        if fila["id_roster"] is not None:
            raise ValidacionError("Esta asistencia pertenece a un turno de Roster. Debe eliminar el turno desde el módulo de Roster.")
        if not administrador and str(fila["id_usuario"]) != str(operador_uid):
            raise PermisoDenegadoError("Solo puede eliminar sus propios registros de asistencia.")
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario=%s FOR UPDATE", (str(fila["id_usuario"]),))
        cur.execute("""UPDATE app_rrhh.b_1_asistencias
            SET eliminado_en = TIMEZONE('utc', NOW()), eliminado_por = %s
            WHERE id_asistencia = %s AND (eliminado_en IS NULL)
            RETURNING id_asistencia AS id, fecha, id_usuario""", (operador_uid, uid_asist))
        res = serializar(cur.fetchone())
    invalidar_caches_repositorio(('usuarios', True))
    return {"exito": True, "mensaje": "Registro de asistencia eliminado correctamente.", **res}


# [FN-07.03] Traducir estado y modalidad sin calcular salarios
def mapear_modalidad(datos):
    tipo = normalizar_texto(datos.get("tipo_ocf") or datos.get("lugar") or "Oficina")
    subtipo = normalizar_texto(datos.get("sub_franco") or datos.get("tipo_franco"))
    estado = tipo if tipo in ("vacaciones","licencia") else "activo"
    if tipo.startswith("franco") and "trabajado" not in tipo and "trabajado" not in subtipo:
        estado = "franco"
    clase = "dia_normal"
    if estado == "activo":
        if tipo == "feriado trabajado" or normalizar_texto(datos.get("feriado")) == "si":
            clase = "feriado_trabajado"
        elif "trabajado" in tipo or "trabajado" in subtipo:
            clase = "franco_trabajado"
    modalidad = normalizar_texto(datos.get("modalidad") or datos.get("tipo_costo") or datos.get("lugar"))
    if modalidad in ("campo","campana / campo","obra","roster") or "obra" in tipo or "obra" in subtipo:
        lugar = "obra"
    elif modalidad in ("oficina","ofic") or "ofic" in tipo or "ofic" in subtipo:
        lugar = "oficina"
    elif estado in ("vacaciones","licencia"):
        raise ValidacionError("Seleccione modalidad Oficina u Obra para vacaciones o licencia.")
    elif tipo in ("oficina","franco","franco trabajado","feriado trabajado"):
        lugar = "oficina"
    else:
        raise ValidacionError("Modalidad de asistencia no válida.")
    return estado,lugar,clase


# [FN-07.03] Validar rango de fechas de captura
def fechas_captura(datos):
    if datos.get("fechas"):
        fechas = sorted({date.fromisoformat(f) for f in datos["fechas"]})
    else:
        inicio = date.fromisoformat(datos["fecha"])
        fin = date.fromisoformat(datos.get("fecha_fin") or datos["fecha"])
        if fin < inicio or (fin-inicio).days > 366:
            raise ValidacionError("Rango de fechas inválido; máximo 367 días.")
        fechas = [inicio+timedelta(days=i) for i in range((fin-inicio).days+1)]
    if not 1 <= len(fechas) <= 367:
        raise ValidacionError("Cantidad de fechas inválida.")
    return fechas


# [FN-07.03] Preparar asistencias con claves verificadas
def preparar_asistencias(datos, usuario, permitir_costo_manual=False):
    estado,lugar,clase = mapear_modalidad(datos)
    proyectos = obtener_proyectos_cache()
    modelos = []
    for fecha in fechas_captura(datos):
        for detalle in datos.get("proyectos") or [datos]:
            d = {**datos,**detalle}
            servicio = normalizar_texto(d.get("servicio"))
            tiene_proyecto = bool(d.get("id_proyecto") or any(normalizar_texto(p["denominacion"]) == servicio for p in proyectos))
            es_area = (estado in ("vacaciones","licencia") or servicio.startswith("dedicado al") or
                       servicio in ("","campo","oficina","franco") or servicio.startswith("tiempo dedicado al") or
                       (not tiene_proyecto and d.get("dedicado_a") == "areas"))
            if not es_area and not d.get("proyecto") and not d.get("id_proyecto"):
                es_area = not any(normalizar_texto(p["denominacion"]) == servicio for p in proyectos)
                if es_area and estado == "activo" and "area" not in d:
                    raise ValidacionError("La imputación no coincide con un proyecto ni con un área.")
            proyecto = None if es_area else resolver_proyecto(d,proyectos)
            manual = bool(d.get("costo_manual", False)) if permitir_costo_manual else False
            costo_dia_val = d.get("costo_dia") if (manual and permitir_costo_manual) else None
            modelos.append(AsistenciaCreate(id_usuario=usuario,fecha=fecha,activo_franco=estado,lugar=lugar,
                tipo_dia=clase,dedicado_a="proyectos" if proyecto else "areas",id_proyecto=proyecto,
                hora_inicio=d.get("hora_inicio") or None,hora_fin=d.get("hora_fin") or None,
                horas_dedicadas=d.get("horas",0),costo_manual=manual,costo_dia=costo_dia_val))
    return modelos


# [FN-07.03] Insertar asistencias y delegar el costo a los triggers
def guardar_asistencias_atomicas(modelos, operador):
    resultados = []
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario=ANY(%s::uuid[]) ORDER BY id_usuario FOR UPDATE",(sorted({str(m.id_usuario) for m in modelos}),))
        if len(modelos) == 1:
            m = modelos[0]
            consulta = """INSERT INTO app_rrhh.b_1_asistencias
                (id_usuario,fecha,activo_franco,lugar,tipo_dia,dedicado_a,hora_inicio,hora_fin,horas_dedicadas,id_proyecto,costo_manual,cargado_por)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id_asistencia AS id,costo_dia"""
            valores = (str(m.id_usuario),m.fecha,m.activo_franco.value,m.lugar,m.tipo_dia,m.dedicado_a,m.hora_inicio,
                       m.hora_fin,m.horas_dedicadas,str(m.id_proyecto) if m.id_proyecto else None,m.costo_manual,uuid_valido(operador))
            if m.costo_manual:
                consulta = """INSERT INTO app_rrhh.b_1_asistencias
                    (id_usuario,fecha,activo_franco,lugar,tipo_dia,dedicado_a,hora_inicio,hora_fin,horas_dedicadas,id_proyecto,costo_manual,cargado_por,costo_dia)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id_asistencia AS id,costo_dia"""
                valores = (*valores,m.costo_dia)
            cur.execute(consulta,valores)
            resultados.append(serializar(cur.fetchone()))
        else:
            sin_manual = [m for m in modelos if not m.costo_manual]
            con_manual = [m for m in modelos if m.costo_manual]
            if sin_manual:
                filas_sql = []
                parametros = []
                for m in sin_manual:
                    filas_sql.append("(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)")
                    parametros.extend([str(m.id_usuario),m.fecha,m.activo_franco.value,m.lugar,m.tipo_dia,m.dedicado_a,
                                       m.hora_inicio,m.hora_fin,m.horas_dedicadas,str(m.id_proyecto) if m.id_proyecto else None,
                                       False,uuid_valido(operador)])
                consulta = f"""INSERT INTO app_rrhh.b_1_asistencias
                    (id_usuario,fecha,activo_franco,lugar,tipo_dia,dedicado_a,hora_inicio,hora_fin,horas_dedicadas,id_proyecto,costo_manual,cargado_por)
                    VALUES {','.join(filas_sql)} RETURNING id_asistencia AS id,costo_dia"""
                cur.execute(consulta, parametros)
                resultados.extend(serializar(cur.fetchall()))
            if con_manual:
                filas_sql = []
                parametros = []
                for m in con_manual:
                    filas_sql.append("(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)")
                    parametros.extend([str(m.id_usuario),m.fecha,m.activo_franco.value,m.lugar,m.tipo_dia,m.dedicado_a,
                                       m.hora_inicio,m.hora_fin,m.horas_dedicadas,str(m.id_proyecto) if m.id_proyecto else None,
                                       True,uuid_valido(operador),m.costo_dia])
                consulta = f"""INSERT INTO app_rrhh.b_1_asistencias
                    (id_usuario,fecha,activo_franco,lugar,tipo_dia,dedicado_a,hora_inicio,hora_fin,horas_dedicadas,id_proyecto,costo_manual,cargado_por,costo_dia)
                    VALUES {','.join(filas_sql)} RETURNING id_asistencia AS id,costo_dia"""
                cur.execute(consulta, parametros)
                resultados.extend(serializar(cur.fetchall()))
    invalidar_caches_repositorio(("usuarios", True))
    return resultados


# [FN-07.03] Derivar etiqueta legible de modalidad desde valores de asistencia
def _etiqueta_modalidad_asistencia(datos_asist):
    if not isinstance(datos_asist, dict) or not datos_asist:
        return None
    af = datos_asist.get("activo_franco") or "activo"
    mod = datos_asist.get("lugar") or "oficina"
    td = datos_asist.get("tipo_dia") or "dia_normal"
    if af != "activo":
        return ETIQUETAS_ROSTER.get(af, str(af).capitalize())
    if td == "feriado_trabajado":
        return "Feriado Trabajado"
    if td == "franco_trabajado":
        return "Franco Ofic Trabajado" if mod == "oficina" else "Franco Obra Trabajado"
    return "Oficina" if mod == "oficina" else "Campo"


# [FN-07.16] Normalizar campos de una modificación de auditoría para el frontend
def _enriquecer_modificacion_auditoria(m, mapa_proyectos=None, area_fallback="Tiempo dedicado al Área"):
    mapa_proyectos = mapa_proyectos or {}
    vant = m.get("valores_anteriores") or {}
    vnue = m.get("valores_nuevos") or {}
    pid_ant = str(vant.get("id_proyecto") or "").lower()
    pid_nue = str(vnue.get("id_proyecto") or "").lower()
    serv_ant = mapa_proyectos.get(pid_ant) if pid_ant else (area_fallback if vant else None)
    serv_nue = mapa_proyectos.get(pid_nue) if pid_nue else (area_fallback if vnue else None)
    fh = m.get("fecha_hora_modificacion") or m.get("fecha_hora")
    rev_bool = bool(m.get("revisado"))
    m.update(
        fecha=m.get("fecha_asistencia") or vnue.get("fecha") or vant.get("fecha"),
        tipo_antes=_etiqueta_modalidad_asistencia(vant) or vant.get("lugar") or vant.get("activo_franco"),
        horas_antes=vant.get("horas_dedicadas"),
        servicio_antes=serv_ant or vant.get("id_proyecto") or area_fallback,
        tipo_despues=_etiqueta_modalidad_asistencia(vnue) or vnue.get("lugar") or vnue.get("activo_franco"),
        horas_despues=vnue.get("horas_dedicadas"),
        servicio_despues=serv_nue or vnue.get("id_proyecto") or area_fallback,
        fecha_hora=fh,
        fecha_hora_modificaciones=fh,
        revisado=1 if rev_bool else 0
    )
    return m


# [FN-07.03] Leer historial conservando los campos del puente con soporte de paginación
def consultar_asistencias(empleado="",mes_anio="",id_asistencia=None,limite=None,offset=0):
    p = perfil_esquema()
    inicio = date.fromisoformat(mes_anio+"-01") if mes_anio else None
    fin = inicio.replace(day=calendar.monthrange(inicio.year,inicio.month)[1])+timedelta(days=1) if inicio else None
    cargador_expr = p.get("nombre_cargador") or "uc.nombre_completo"
    modificador_expr = p.get("nombre_modificador") or "um.nombre_completo"
    tiene_auditoria = p.get("tiene_auditoria", False)
    filtro_soft = "AND (a.eliminado_en IS NULL)" if p.get("tiene_soft_delete_asistencias") else ""
    subquery_audit = f"""COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id_modificacion', m.id_modificacion,
            'tipo_operacion', m.tipo_operacion::text,
            'fecha_hora', m.fecha_hora_modificacion,
            'detalle_cambio', m.detalle_cambio,
            'quien_modifica', COALESCE({modificador_expr}, m.modificado_por::text, 'Usuario'),
            'valores_anteriores', m.valores_anteriores,
            'valores_nuevos', m.valores_nuevos,
            'revisado', COALESCE(m.revisado, FALSE)
        ) ORDER BY m.fecha_hora_modificacion ASC)
        FROM app_rrhh.b_1_modificaciones_realizadas m
        LEFT JOIN app_rrhh.a_1_usuarios um ON um.id_usuario = m.modificado_por
        WHERE m.id_asistencia = a.id_asistencia
    ), '[]'::jsonb)""" if tiene_auditoria else "'[]'::jsonb"

    limite_sql = ""
    parametros_limite = []
    if limite is not None and int(limite) > 0:
        limite_sql = " LIMIT %s OFFSET %s"
        parametros_limite = [int(limite), max(0, int(offset or 0))]

    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT a.*,a.id_asistencia AS id,a.id_usuario AS id_empleado,{p['nombre']} AS empleado,
            {p['correo']} AS usuario_mail,{p['proyecto']} AS servicio,u.area,a.fecha_hora_carga AS fecha_hora,
            a.cargado_por AS cargado_por_id,
            COALESCE({cargador_expr},{p['nombre']},a.cargado_por::text) AS cargado_por_nombre,
            {subquery_audit} AS modificaciones
            FROM app_rrhh.b_1_asistencias a JOIN app_rrhh.a_1_usuarios u ON u.id_usuario=a.id_usuario
            LEFT JOIN app_rrhh.a_1_usuarios uc ON uc.id_usuario=a.cargado_por
            LEFT JOIN app_proyectos.b_1_proyectos_servicios p ON p.id_proyecto=a.id_proyecto
            WHERE (%s='' OR {p['nombre']}=%s OR a.id_usuario::text=%s)
            AND (%s::date IS NULL OR a.fecha>=%s::date) AND (%s::date IS NULL OR a.fecha<%s::date)
            AND (%s::uuid IS NULL OR a.id_asistencia=%s::uuid)
            {filtro_soft}
            ORDER BY a.fecha DESC,a.fecha_hora_carga DESC,a.id_asistencia{limite_sql}""",
            (empleado,empleado,empleado,inicio,inicio,fin,fin,id_asistencia,id_asistencia, *parametros_limite))
        filas = serializar(cur.fetchall())
    mapa_proy = {}
    if any(f.get("modificaciones") for f in filas):
        try:
            mapa_proy = {str(pr["id_proyecto"]).lower(): pr["denominacion"] for pr in obtener_proyectos_cache()}
        except Exception:
            mapa_proy = {}
    for f in filas:
        modalidad = f["lugar"]
        if f["activo_franco"] != "activo":
            tipo = ETIQUETAS_ROSTER[f["activo_franco"]]
        elif f["tipo_dia"] == "feriado_trabajado":
            tipo = "Feriado Trabajado"
        elif f["tipo_dia"] == "franco_trabajado":
            tipo = "Franco Ofic Trabajado" if modalidad == "oficina" else "Franco Obra Trabajado"
        else:
            tipo = "Oficina" if modalidad == "oficina" else "Campo"
        cargador = f.get("cargado_por_nombre") or f.get("cargado_por") or f["empleado"]
        mods = [_enriquecer_modificacion_auditoria(dict(m), mapa_proy, f.get("area") or "Tiempo dedicado al Área") for m in (f.get("modificaciones") or [])]
        tiene_mods = len(mods) > 0
        pendientes = any(not m.get("revisado") for m in mods)
        f.update(tipo_ocf=tipo,modalidad=modalidad,lugar=tipo,horas=f["horas_dedicadas"],sincronizado=1,
                 tipo_costo="Oficina" if modalidad=="oficina" else "Campo",feriado="SI" if f["tipo_dia"]=="feriado_trabajado" else "NO",
                 servicio=f["servicio"] or f["area"],cargado_por=cargador,
                 modificado=tiene_mods,fue_modificado=tiene_mods,
                 modificacion_pendiente=1 if pendientes else 0,
                 modificacion_revisada=1 if (tiene_mods and not pendientes) else 0,
                 modificaciones=mods,
                 instrumental="")
    return filas


# [FN-07.03] Editar una asistencia controlando propiedad y origen
def modificar_asistencia(m,operador,administrador=False):
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario=%s FOR UPDATE",(str(m.id_usuario),))
        cur.execute("SELECT id_usuario,id_roster FROM app_rrhh.b_1_asistencias WHERE id_asistencia=%s FOR UPDATE",(str(m.id_asistencia),))
        fila = cur.fetchone()
        if not fila:
            raise RegistroNoEncontradoError()
        if fila["id_roster"] is not None:
            raise ValidacionError("Edite este registro desde su turno de Roster.")
        if not administrador and (str(fila["id_usuario"])!=operador or str(m.id_usuario)!=operador):
            raise PermisoDenegadoError()
        cur.execute("""UPDATE app_rrhh.b_1_asistencias SET id_usuario=%s,fecha=%s,activo_franco=%s,lugar=%s,tipo_dia=%s,
            dedicado_a=%s,hora_inicio=%s,hora_fin=%s,horas_dedicadas=%s,id_proyecto=%s,costo_manual=%s,
            costo_dia=CASE WHEN %s THEN %s ELSE costo_dia END,cargado_por=%s WHERE id_asistencia=%s
            RETURNING id_asistencia AS id,costo_dia""",
            (str(m.id_usuario),m.fecha,m.activo_franco.value,m.lugar,m.tipo_dia,m.dedicado_a,m.hora_inicio,m.hora_fin,
             m.horas_dedicadas,str(m.id_proyecto) if m.id_proyecto else None,m.costo_manual,m.costo_manual,m.costo_dia,operador,str(m.id_asistencia)))
        res = serializar(cur.fetchone())
        invalidar_caches_repositorio(('usuarios', True))
        return res


# [FN-07.06] Leer liquidación mantenida por triggers sin bloquear operaciones concurrentes
def obtener_liquidacion(empleado, ciclo_cobro, forzar_recalculo=False):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", ciclo_cobro):
        raise ValidacionError("Ciclo de cobro inválido; utilice YYYY-MM.")
    usuario = resolver_usuario(empleado)
    uid = usuario["id_usuario"]

    consulta_sql = """SELECT c.*,
        COALESCE(s.modalidad_calculo::text, 'base_30') AS modalidad_calculo,
        COALESCE(s.lugar_habitual::text, 'oficina') AS lugar_habitual,
        COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id_adicional', d.id_adicional,
            'fecha', d.fecha,
            'cantidad_adicional', d.cantidad_adicional::text,
            'descripcion', d.descripcion
        ) ORDER BY d.fecha, d.id_adicional)
        FROM app_rrhh.a_1_adicionales_sueldo d
        WHERE d.id_calculo_sueldo = c.id_calculo_sueldo
    ), '[]'::jsonb) AS adicionales
    FROM app_rrhh.a_1_calculo_sueldo c
    LEFT JOIN app_rrhh.a_1_sueldos_base s ON s.id_usuario = c.id_usuario
    WHERE c.id_usuario = %s AND c.ciclo_cobro = %s"""

    # 1. Si no se fuerza recálculo, lectura limpia sin bloqueo FOR UPDATE
    if not forzar_recalculo:
        with obtener_cursor_pg() as cur:
            cur.execute(consulta_sql, (uid, ciclo_cobro))
            fila = cur.fetchone()
            if fila:
                return serializar(LiquidacionResponse.model_validate(fila).model_dump())

    # 2. Si no existe o se forzó recálculo, recalcular atómicamente con lock
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario=%s FOR UPDATE", (uid,))
        cur.execute("SELECT app_rrhh.fn_recalcular_liquidacion_mes(%s, %s)", (uid, ciclo_cobro))
        cur.execute(consulta_sql, (uid, ciclo_cobro))
        fila = cur.fetchone()
    return serializar(LiquidacionResponse.model_validate(fila).model_dump()) if fila else None


# [FN-07.03] Registrar un costo manual explícito registrando operador y motivo
def actualizar_costo_dia_manual(id_registro,nuevo_costo,quien_modifica="",motivo=""):
    valor = Decimal(str(nuevo_costo))
    if not valor.is_finite() or valor < 0:
        raise ValidacionError("El costo debe ser un número no negativo y finito.")
    p = perfil_esquema() if (motivo and str(motivo).strip()) else {}
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario IN (SELECT id_usuario FROM app_rrhh.b_1_asistencias WHERE id_asistencia=%s) FOR UPDATE",(uuid_valido(id_registro),))
        operador_uuid = uuid_valido(quien_modifica) if quien_modifica else None
        cur.execute("""UPDATE app_rrhh.b_1_asistencias
            SET costo_manual=TRUE, costo_dia=%s, cargado_por=COALESCE(%s, cargado_por)
            WHERE id_asistencia=%s
            RETURNING id_asistencia AS id, costo_dia, fecha, id_usuario""",
            (valor, operador_uuid, uuid_valido(id_registro)))
        fila = cur.fetchone()
        if not fila:
            raise RegistroNoEncontradoError()
        if motivo and str(motivo).strip():
            if p.get("tiene_auditoria"):
                cur.execute("""UPDATE app_rrhh.b_1_modificaciones_realizadas
                    SET detalle_cambio = detalle_cambio || %s
                    WHERE id_asistencia=%s
                    AND id_modificacion = (
                        SELECT id_modificacion FROM app_rrhh.b_1_modificaciones_realizadas
                        WHERE id_asistencia=%s ORDER BY fecha_hora_modificacion DESC LIMIT 1
                    )""", (f" [Motivo: {str(motivo).strip()}]", uuid_valido(id_registro), uuid_valido(id_registro)))
        invalidar_caches_repositorio(('usuarios', False), ('usuarios', True))
        return {"exito":True,**serializar(fila)}



# [FN-07.16] Consultar resumen ejecutivo de auditoría de modificaciones
def obtener_resumen_modificaciones():
    p = perfil_esquema()
    if not p.get("tiene_auditoria"):
        return {"total_modificaciones": 0, "ultimas_24h": 0, "no_sincronizadas": 0, "ultima_modificacion": None, "disponible": False}
    with obtener_cursor_pg() as cur:
        cur.execute("""SELECT
            COUNT(*)::int AS total_modificaciones,
            COUNT(*) FILTER (WHERE fecha_hora_modificacion >= NOW() - INTERVAL '24 hours')::int AS ultimas_24h,
            COUNT(*) FILTER (WHERE revisado IS NOT TRUE)::int AS no_revisadas,
            MAX(fecha_hora_modificacion) AS ultima_modificacion
            FROM app_rrhh.b_1_modificaciones_realizadas""")
        res = cur.fetchone() or {}
        return {
            "total_modificaciones": res.get("total_modificaciones") or 0,
            "ultimas_24h": res.get("ultimas_24h") or 0,
            "no_sincronizadas": 0,
            "no_revisadas": res.get("no_revisadas") or 0,
            "ultima_modificacion": serializar(res.get("ultima_modificacion")),
            "disponible": True
        }


# [FN-07.16] Listar modificaciones recientes de auditoría
def obtener_modificaciones_recientes(limite=50):
    p = perfil_esquema()
    if not p.get("tiene_auditoria"):
        return []
    limite = max(1, min(int(limite or 50), 200))
    modificador_expr = p.get("nombre_modificador") or "um.nombre_completo"
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT m.id_modificacion, m.id_asistencia, m.tipo_operacion,
            m.fecha_hora_modificacion, m.fecha_asistencia, m.detalle_cambio,
            m.valores_anteriores, m.valores_nuevos, COALESCE(m.revisado, FALSE) AS revisado,
            {p['nombre']} AS empleado, u.area,
            COALESCE({modificador_expr}, m.modificado_por::text, 'Usuario') AS quien_modifica
            FROM app_rrhh.b_1_modificaciones_realizadas m
            LEFT JOIN app_rrhh.a_1_usuarios u ON u.id_usuario = m.id_usuario
            LEFT JOIN app_rrhh.a_1_usuarios um ON um.id_usuario = m.modificado_por
            ORDER BY m.fecha_hora_modificacion DESC
            LIMIT %s""", (limite,))
        filas = serializar(cur.fetchall())
    mapa_proy = {}
    if filas:
        try:
            mapa_proy = {str(pr["id_proyecto"]).lower(): pr["denominacion"] for pr in obtener_proyectos_cache()}
        except Exception:
            mapa_proy = {}
    return [_enriquecer_modificacion_auditoria(f, mapa_proy, f.get("area") or "Tiempo dedicado al Área") for f in filas]


# [FN-07.16] Obtener notificaciones de modificaciones pendientes para banner/pop-up
def obtener_notificaciones_modificaciones(solo_no_revisadas=True):
    p = perfil_esquema()
    if not p.get("tiene_auditoria"):
        return []
    modificador_expr = p.get("nombre_modificador") or "um.nombre_completo"
    with obtener_cursor_pg() as cur:
        filtro_rev = "WHERE m.revisado IS NOT TRUE" if solo_no_revisadas else ""
        cur.execute(f"""SELECT m.id_modificacion, m.id_asistencia, m.tipo_operacion,
            m.fecha_hora_modificacion, m.fecha_asistencia, m.detalle_cambio,
            m.valores_anteriores, m.valores_nuevos, COALESCE(m.revisado, FALSE) AS revisado,
            {p['nombre']} AS empleado, u.area,
            COALESCE({modificador_expr}, m.modificado_por::text, 'Usuario') AS quien_modifica
            FROM app_rrhh.b_1_modificaciones_realizadas m
            LEFT JOIN app_rrhh.a_1_usuarios u ON u.id_usuario = m.id_usuario
            LEFT JOIN app_rrhh.a_1_usuarios um ON um.id_usuario = m.modificado_por
            {filtro_rev}
            ORDER BY m.fecha_hora_modificacion DESC
            LIMIT 50""")
        filas = serializar(cur.fetchall())
    mapa_proy = {}
    if filas:
        try:
            mapa_proy = {str(pr["id_proyecto"]).lower(): pr["denominacion"] for pr in obtener_proyectos_cache()}
        except Exception:
            mapa_proy = {}
    return [_enriquecer_modificacion_auditoria(f, mapa_proy, f.get("area") or "Tiempo dedicado al Área") for f in filas]


# [FN-07.16] Marcar una o varias modificaciones como revisadas
def marcar_modificacion_revisada(id_modificacion, id_operador=None):
    p = perfil_esquema()
    if not p.get("tiene_auditoria"):
        return {"exito": False, "error": "La tabla de auditoría no está configurada.", "codigo_error": "TABLA_NO_ENCONTRADA"}
    operador_uuid = uuid_valido(id_operador) if id_operador else None
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("""UPDATE app_rrhh.b_1_modificaciones_realizadas
            SET revisado = TRUE,
                revisado_por = %s,
                fecha_hora_revision = CURRENT_TIMESTAMP
            WHERE id_modificacion = %s
            RETURNING id_modificacion""", (operador_uuid, uuid_valido(id_modificacion)))
        fila = cur.fetchone()
        if not fila:
            raise RegistroNoEncontradoError("Modificación no encontrada.")
        return {"exito": True, "id_modificacion": str(fila["id_modificacion"])}


# [FN-07.16] Marcar modificaciones de una asistencia como revisadas
def marcar_modificacion_por_asistencia_revisada(id_asistencia, id_operador=None):
    p = perfil_esquema()
    if not p.get("tiene_auditoria"):
        return {"exito": False, "error": "La tabla de auditoría no está configurada.", "codigo_error": "TABLA_NO_ENCONTRADA"}
    operador_uuid = uuid_valido(id_operador) if id_operador else None
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("""UPDATE app_rrhh.b_1_modificaciones_realizadas
            SET revisado = TRUE,
                revisado_por = %s,
                fecha_hora_revision = CURRENT_TIMESTAMP
            WHERE id_asistencia = %s AND revisado IS NOT TRUE
            RETURNING id_modificacion""", (operador_uuid, uuid_valido(id_asistencia)))
        filas = cur.fetchall()
        return {"exito": True, "afectados": len(filas)}


# [FN-07.16] Marcar modificaciones de múltiples asistencias como revisadas en lote
def marcar_modificaciones_por_asistencias_lote(ids_asistencia, id_operador=None):
    p = perfil_esquema()
    if not p.get("tiene_auditoria"):
        return {"exito": False, "error": "La tabla de auditoría no está configurada.", "codigo_error": "TABLA_NO_ENCONTRADA"}
    if not ids_asistencia:
        return {"exito": True, "afectados": 0}
    operador_uuid = uuid_valido(id_operador) if id_operador else None
    uuids = [uuid_valido(i) for i in ids_asistencia]
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("""UPDATE app_rrhh.b_1_modificaciones_realizadas
            SET revisado = TRUE,
                revisado_por = %s,
                fecha_hora_revision = CURRENT_TIMESTAMP
            WHERE id_asistencia = ANY(%s::uuid[]) AND revisado IS NOT TRUE
            RETURNING id_modificacion""", (operador_uuid, uuids))
        filas = cur.fetchall()
        return {"exito": True, "afectados": len(filas)}


# [FN-07.16] Marcar todas las modificaciones pendientes como revisadas
def marcar_todas_modificaciones_revisadas(id_operador=None):
    p = perfil_esquema()
    if not p.get("tiene_auditoria"):
        return {"exito": False, "error": "La tabla de auditoría no está configurada.", "codigo_error": "TABLA_NO_ENCONTRADA"}
    operador_uuid = uuid_valido(id_operador) if id_operador else None
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("""UPDATE app_rrhh.b_1_modificaciones_realizadas
            SET revisado = TRUE,
                revisado_por = %s,
                fecha_hora_revision = CURRENT_TIMESTAMP
            WHERE revisado IS NOT TRUE
            RETURNING id_modificacion""", (operador_uuid,))
        filas = cur.fetchall()
        return {"exito": True, "actualizados": len(filas)}


# [FN-07.03] Actualizar modalidad de un lote mediante triggers
def actualizar_tipo_costo_lote(ids_asistencia,tipo_costo):
    modalidad = {"oficina":"oficina","campo":"obra","obra":"obra"}.get(normalizar_texto(tipo_costo))
    if modalidad is None or not ids_asistencia:
        raise ValidacionError("Seleccione registros y modalidad Oficina u Obra.")
    ids = [uuid_valido(i) for i in ids_asistencia]
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario IN (SELECT id_usuario FROM app_rrhh.b_1_asistencias WHERE id_asistencia=ANY(%s::uuid[])) ORDER BY id_usuario FOR UPDATE",(ids,))
        cur.execute("SELECT id_roster FROM app_rrhh.b_1_asistencias WHERE id_asistencia=ANY(%s::uuid[]) AND id_roster IS NOT NULL LIMIT 1",(ids,))
        if cur.fetchone():
            raise ValidacionError("Los registros de Roster se modifican desde su turno.")
        cur.execute("UPDATE app_rrhh.b_1_asistencias SET lugar=%s,costo_manual=FALSE WHERE id_asistencia=ANY(%s::uuid[])",(modalidad,ids))
        filas_afectadas = cur.rowcount
    invalidar_caches_repositorio(('usuarios', False), ('usuarios', True))
    return filas_afectadas


# [FN-07.07] Consultar el estado diario de empleados activos
def obtener_estado_diario_empleados(fecha=""):
    dia = date.fromisoformat(fecha) if fecha else date.today()
    usuarios = obtener_usuarios_cache()
    p = perfil_esquema()
    filtro_soft = "AND (eliminado_en IS NULL)" if p.get("tiene_soft_delete_asistencias") else ""
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT id_usuario,SUM(horas_dedicadas) AS horas,COUNT(*) AS registros,
            string_agg(DISTINCT CASE WHEN activo_franco='vacaciones' THEN 'Vacaciones'
                WHEN activo_franco='licencia' THEN 'Licencia' WHEN activo_franco='franco' THEN 'Franco'
                WHEN lugar='oficina' THEN 'Oficina' ELSE 'Campo' END, ' / ') AS modalidad
            FROM app_rrhh.b_1_asistencias WHERE fecha=%s {filtro_soft} GROUP BY id_usuario""",(dia,))
        presentes = {str(f["id_usuario"]):f for f in cur.fetchall()}
    lista = [{"id_usuario":u["id_usuario"],"nombre":u["nombre"],"dni":u["dni"],"area":u["area"],
              "registrado":u["id_usuario"] in presentes,"enviado":u["id_usuario"] in presentes,
              "modalidad":presentes.get(u["id_usuario"],{}).get("modalidad",""),
              "horas":serializar(presentes.get(u["id_usuario"],{}).get("horas",0)),
              "registros":presentes.get(u["id_usuario"],{}).get("registros",0)} for u in usuarios]
    cantidad = sum(u["registrado"] for u in lista)
    return {"fecha":dia.isoformat(),"lista":lista,"total_empleados":len(lista),"registrados":cantidad,"pendientes":len(lista)-cantidad}


# [FN-07.07] Consultar actividad del día anterior
def obtener_actividad_dia_anterior():
    e = obtener_estado_diario_empleados((date.today()-timedelta(days=1)).isoformat())
    return {"fecha":e["fecha"],"total":e["total_empleados"],"enviados":e["registrados"],"pendientes":e["pendientes"],"usuarios":e["lista"]}


# [FN-07.07] Verificar la asistencia de hoy
def usuario_registro_hoy(empleado="",usuario_mail=""):
    usuario = resolver_usuario(empleado)
    p = perfil_esquema()
    filtro_soft = "AND (eliminado_en IS NULL)" if p.get("tiene_soft_delete_asistencias") else ""
    with obtener_cursor_pg() as cur:
        cur.execute(f"SELECT EXISTS(SELECT 1 FROM app_rrhh.b_1_asistencias WHERE id_usuario=%s AND fecha=CURRENT_DATE {filtro_soft}) AS registrado",(usuario["id_usuario"],))
        return cur.fetchone()["registrado"]


# [FN-07.04] Guardar tarifa de proyecto para roster
def guardar_tarifa_roster(datos):
    if not isinstance(datos, dict):
        raise ValidacionError("Datos de tarifa inválidos.")
    proyectos = obtener_proyectos_cache()
    id_proy = resolver_proyecto(datos, proyectos)
    modelo = TarifaRosterCreate(
        id_proyecto=id_proy,
        dia_normal=Decimal(str(datos.get("dia_normal", 0))),
        dia_domingo=Decimal(str(datos.get("dia_domingo", 0))),
        subida=Decimal(str(datos.get("subida") or 0)),
        bajada=Decimal(str(datos.get("bajada") or 0)),
        adicional_turno=Decimal(str(datos.get("adicional_turno") or 0)),
    )
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("""INSERT INTO app_rrhh.b_1_tarifas_roster
            (id_proyecto, dia_normal, dia_domingo, subida, bajada, adicional_turno, es_activa)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE)
            RETURNING id_tarifa, id_proyecto, dia_normal, dia_domingo, subida, bajada, adicional_turno, es_activa""",
            (str(modelo.id_proyecto), modelo.dia_normal, modelo.dia_domingo, modelo.subida, modelo.bajada, modelo.adicional_turno))
        res = serializar(cur.fetchone())
        invalidar_caches_repositorio(('tarifas_roster',))
        return res


# [FN-04.12] Actualizar datos de usuario y sueldo base
def actualizar_usuario_y_sueldo(datos, operador_sesion=None):
    if not isinstance(datos, dict):
        raise ValidacionError("Datos inválidos.")
    id_u = uuid_valido(datos.get("id_usuario") or datos.get("id"))
    modelo = UsuarioSueldoUpdate(**{**datos, "id_usuario": id_u})
    p = perfil_esquema()
    rol_operador = operador_sesion.get("rol_app") if operador_sesion else None
    id_operador = str(operador_sesion.get("id_usuario")) if operador_sesion else None
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario, rol_app FROM app_rrhh.a_1_usuarios WHERE id_usuario=%s FOR UPDATE", (str(modelo.id_usuario),))
        fila_existente = cur.fetchone()
        if not fila_existente:
            raise RegistroNoEncontradoError("Usuario no encontrado.")
        rol_actual_db = fila_existente.get("rol_app") or "user_1"
        rol_final = modelo.rol_app
        if rol_operador != "admin":
            if rol_actual_db == "admin":
                raise PermisoDenegadoError("Solo un administrador puede modificar cuentas de administradores.")
            if modelo.rol_app == "admin":
                raise PermisoDenegadoError("Solo un administrador puede promover usuarios al rol admin.")
            if id_operador and str(modelo.id_usuario) == id_operador and modelo.rol_app != rol_actual_db:
                raise PermisoDenegadoError("No se permite modificar el propio rol de usuario.")
            rol_final = rol_actual_db
        if "apellido" in p["apellido"]:
            cur.execute("""UPDATE app_rrhh.a_1_usuarios
                SET nombre=%s, apellido=%s, dni=%s, correo=%s, area=%s, rol_app=%s, activo=%s
                WHERE id_usuario=%s RETURNING id_usuario""",
                (modelo.nombre, modelo.apellido, modelo.dni, modelo.correo, modelo.area, rol_final, modelo.activo, str(modelo.id_usuario)))
        else:
            cur.execute("""UPDATE app_rrhh.a_1_usuarios
                SET nombre_completo=%s, dni=%s, email=%s, area=%s, rol_app=%s, activo=%s
                WHERE id_usuario=%s RETURNING id_usuario""",
                (f"{modelo.nombre} {modelo.apellido}".strip(), modelo.dni, modelo.correo, modelo.area, rol_final, modelo.activo, str(modelo.id_usuario)))
        if not cur.fetchone():
            raise RegistroNoEncontradoError("Usuario no encontrado.")

        cur.execute("""SELECT id_sueldo, sueldo_oficina, sueldo_obra, lugar_habitual, modalidad_calculo, dia_oficina, dia_obra, vigente_desde
            FROM app_rrhh.a_1_sueldos_base WHERE id_usuario = %s""", (str(modelo.id_usuario),))
        sueldo_actual = cur.fetchone()

        sueldo_cambio = False
        if not sueldo_actual:
            sueldo_cambio = True
        else:
            s_ofi_act = Decimal(str(sueldo_actual.get("sueldo_oficina") or 0))
            s_obra_act = Decimal(str(sueldo_actual.get("sueldo_obra") or 0))
            lugar_act = str(sueldo_actual.get("lugar_habitual") or "oficina")
            mod_act = str(sueldo_actual.get("modalidad_calculo") or "base_30")

            s_ofi_nuevo = Decimal(str(modelo.sueldo_oficina or 0))
            s_obra_nuevo = Decimal(str(modelo.sueldo_obra or 0))
            lugar_nuevo = str(modelo.lugar_habitual or "oficina")
            mod_nuevo = str(getattr(modelo, "modalidad_calculo", "base_30") or "base_30")

            if s_ofi_act != s_ofi_nuevo or s_obra_act != s_obra_nuevo or lugar_act != lugar_nuevo or mod_act != mod_nuevo:
                sueldo_cambio = True

        if sueldo_cambio:
            vigente_desde = getattr(modelo, "vigente_desde", None) or datos.get("vigente_desde") or date.today()
            mod_final = getattr(modelo, "modalidad_calculo", "base_30") or "base_30"
            cur.execute("""INSERT INTO app_rrhh.a_1_sueldos_base
                (id_usuario, sueldo_oficina, sueldo_obra, lugar_habitual, modalidad_calculo, vigente_desde)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id_usuario) DO UPDATE
                SET sueldo_oficina=EXCLUDED.sueldo_oficina,
                    sueldo_obra=EXCLUDED.sueldo_obra,
                    lugar_habitual=EXCLUDED.lugar_habitual,
                    modalidad_calculo=EXCLUDED.modalidad_calculo,
                    vigente_desde=EXCLUDED.vigente_desde,
                    actualizado_en=CURRENT_TIMESTAMP
                RETURNING id_sueldo, dia_oficina, dia_obra, lugar_habitual, modalidad_calculo, vigente_desde""",
                (str(modelo.id_usuario), modelo.sueldo_oficina, modelo.sueldo_obra, modelo.lugar_habitual, mod_final, vigente_desde))
            res_sueldo = cur.fetchone()

            ciclo_actual = date.today().strftime("%Y-%m")
            cur.execute("SELECT app_rrhh.fn_recalcular_liquidacion_mes(%s, %s)", (str(modelo.id_usuario), ciclo_actual))
        else:
            res_sueldo = sueldo_actual

    invalidar_caches_repositorio(('usuarios', False), ('usuarios', True))
    return {"exito": True, "id_usuario": str(modelo.id_usuario), **serializar(res_sueldo)}

# [FN-07.15] Consolidar asistencias huérfanas en bloques de Roster atómicamente
def crear_rosters_desde_asistencias(lista_datos, operador):
    if not isinstance(lista_datos, list) or not 1 <= len(lista_datos) <= 200:
        raise ValidacionError("Envíe entre 1 y 200 bloques para consolidar en Roster.")
    usuarios, proyectos = obtener_usuarios_cache(), obtener_proyectos_cache()
    modelos = [preparar_roster(d, usuarios, proyectos) for d in lista_datos]
    resultados = []
    absorbidos = 0
    with obtener_cursor_pg(commit=True) as cur:
        uids_ordenados = sorted({str(m.id_usuario) for m in modelos})
        for uid in uids_ordenados:
            cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"checkdiario.roster.{uid}",))
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario=ANY(%s::uuid[]) ORDER BY id_usuario FOR UPDATE", (uids_ordenados,))
        for m in modelos:
            uid = str(m.id_usuario)
            pid = str(m.id_proyecto)
            cur.execute("""SELECT id_roster FROM app_rrhh.b_1_roster WHERE id_usuario=%s
                AND fecha_inicio<=%s AND fecha_fin>=%s LIMIT 1""", (uid, m.fecha_fin, m.fecha_inicio))
            if cur.fetchone():
                raise ValidacionError(f"El empleado ya posee un turno de Roster entre {m.fecha_inicio} y {m.fecha_fin}.")
            # Consultar asistencias previas en el rango antes de consolidar
            cur.execute("""SELECT fecha, activo_franco, lugar, tipo_dia, hora_inicio, hora_fin,
                horas_dedicadas, id_proyecto, costo_manual, costo_dia
                FROM app_rrhh.b_1_asistencias
                WHERE id_usuario=%s AND fecha>=%s AND fecha<=%s AND id_roster IS NULL""",
                (uid, m.fecha_inicio, m.fecha_fin))
            asistencias_previas = cur.fetchall()

            # Validar incompatibilidades: no consolidar sobre jornadas de oficina ni vacaciones/licencias
            for ap in asistencias_previas:
                if ap.get("lugar") == "oficina":
                    raise ValidacionError(f"No se puede consolidar en Roster: el empleado tiene jornada de Oficina el {ap['fecha']}.")
                if ap.get("activo_franco") in ("vacaciones", "licencia"):
                    raise ValidacionError(f"No se puede consolidar en Roster: el empleado tiene {ap['activo_franco']} registrada el {ap['fecha']}.")

            # Agrupar atributos a preservar por fecha
            atributos_por_fecha = {}
            for ap in asistencias_previas:
                f = ap["fecha"]
                if f not in atributos_por_fecha:
                    atributos_por_fecha[f] = {
                        "hora_inicio": ap.get("hora_inicio"),
                        "hora_fin": ap.get("hora_fin"),
                        "horas_dedicadas": Decimal(str(ap.get("horas_dedicadas") or 0)),
                        "tipo_dia": ap.get("tipo_dia"),
                        "costo_manual": bool(ap.get("costo_manual")),
                        "costo_dia": ap.get("costo_dia")
                    }
                else:
                    atributos_por_fecha[f]["horas_dedicadas"] += Decimal(str(ap.get("horas_dedicadas") or 0))
                    if ap.get("costo_manual"):
                        atributos_por_fecha[f]["costo_manual"] = True
                        atributos_por_fecha[f]["costo_dia"] = ap.get("costo_dia")
                    if ap.get("tipo_dia") in ("feriado_trabajado", "franco_trabajado"):
                        atributos_por_fecha[f]["tipo_dia"] = ap.get("tipo_dia")

            cur.execute("""DELETE FROM app_rrhh.b_1_asistencias
                WHERE id_usuario=%s AND fecha>=%s AND fecha<=%s AND id_roster IS NULL""",
                (uid, m.fecha_inicio, m.fecha_fin))
            absorbidos += cur.rowcount

            cur.execute("""INSERT INTO app_rrhh.b_1_roster
                (id_usuario, id_proyecto, fecha_inicio, fecha_fin, tipo_turno, cargado_por)
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING id_roster AS id, total_viaticos""",
                (uid, pid, m.fecha_inicio, m.fecha_fin, m.tipo_turno.value, uuid_valido(operador)))
            creado = serializar(cur.fetchone())

            # Restaurar atributos preservados en las asistencias generadas por el trigger
            for f, attrs in atributos_por_fecha.items():
                cur.execute("""UPDATE app_rrhh.b_1_asistencias
                    SET hora_inicio = COALESCE(%s, hora_inicio),
                        hora_fin = COALESCE(%s, hora_fin),
                        horas_dedicadas = CASE WHEN %s > 0 THEN %s ELSE horas_dedicadas END,
                        tipo_dia = COALESCE(%s, tipo_dia),
                        costo_manual = %s,
                        costo_dia = CASE WHEN %s THEN %s ELSE costo_dia END
                    WHERE id_usuario=%s AND fecha=%s AND id_roster=%s""",
                    (attrs["hora_inicio"], attrs["hora_fin"],
                     attrs["horas_dedicadas"], attrs["horas_dedicadas"],
                     attrs["tipo_dia"],
                     attrs["costo_manual"],
                     attrs["costo_manual"], attrs["costo_dia"],
                     uid, f, creado["id"]))
            resultados.append(creado)
    invalidar_caches_repositorio(('usuarios', False), ('usuarios', True))
    return {"resultados": resultados, "guardados": len(resultados), "absorbidos": absorbidos}

# [FN-04.13] Actualizar modalidad de cálculo y lugar habitual de un colaborador
def actualizar_configuracion_sueldo_usuario(datos, ciclo_cobro=None):
    if not isinstance(datos, dict):
        raise ValidacionError("Datos de configuración salarial inválidos.")
    u_ref = datos.get("id_usuario") or datos.get("empleado")
    if not u_ref:
        raise ValidacionError("Identificador de empleado requerido.")
    usuario = resolver_usuario(u_ref)
    uid = usuario["id_usuario"]
    mod_calc = str(datos.get("modalidad_calculo") or "").strip().lower()
    lug_hab = str(datos.get("lugar_habitual") or "").strip().lower()
    if mod_calc not in ("por_dia", "base_30"):
        raise ValidacionError("Modalidad de cálculo inválida. Opciones: 'por_dia' o 'base_30'.")
    if lug_hab not in ("oficina", "obra"):
        raise ValidacionError("Lugar habitual inválido. Opciones: 'oficina' u 'obra'.")
    modelo = ConfiguracionSueldoUpdate(
        id_usuario=uid,
        modalidad_calculo=mod_calc,
        lugar_habitual=lug_hab
    )
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario=%s FOR UPDATE", (str(uid),))
        if not cur.fetchone():
            raise RegistroNoEncontradoError("Usuario no encontrado.")
        cur.execute("""INSERT INTO app_rrhh.a_1_sueldos_base
            (id_usuario, modalidad_calculo, lugar_habitual)
            VALUES (%s, %s, %s)
            ON CONFLICT (id_usuario) DO UPDATE
            SET modalidad_calculo = EXCLUDED.modalidad_calculo,
                lugar_habitual = EXCLUDED.lugar_habitual,
                actualizado_en = CURRENT_TIMESTAMP
            RETURNING id_sueldo, id_usuario, modalidad_calculo, lugar_habitual, dia_oficina, dia_obra""",
            (str(uid), modelo.modalidad_calculo, modelo.lugar_habitual))
        fila = cur.fetchone()
        ciclos_a_recalcular = set()
        if ciclo_cobro and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", str(ciclo_cobro)):
            ciclos_a_recalcular.add(str(ciclo_cobro))
        ciclos_a_recalcular.add(date.today().strftime("%Y-%m"))
        for c in ciclos_a_recalcular:
            cur.execute("SELECT app_rrhh.fn_recalcular_liquidacion_mes(%s, %s)", (str(uid), c))
    invalidar_caches_repositorio(('usuarios', False), ('usuarios', True))
    return {"exito": True, **serializar(fila)}

# [FN-07.21] Registrar error remoto de forma segura sin propagar excepciones
def registrar_error_remoto(datos, sesion=None):
    try:
        import socket
        if not isinstance(datos, dict):
            datos = {"mensaje_error": str(datos)}
        
        id_u = None
        nom_u = "Sesión no iniciada"
        rol_u = None
        if sesion and isinstance(sesion, dict):
            id_u = sesion.get("id_usuario")
            nom_u = sesion.get("nombre") or sesion.get("nombre_completo") or "Usuario en sesión"
            rol_u = sesion.get("rol_app")
        elif datos.get("id_usuario"):
            id_u = datos.get("id_usuario")
            nom_u = datos.get("nombre_usuario") or nom_u
            rol_u = datos.get("rol_usuario")
        
        if id_u:
            try:
                id_u = str(uuid_valido(id_u))
            except Exception:
                id_u = None
        
        hostname = None
        try:
            hostname = socket.gethostname()
        except Exception:
            hostname = None

        equipo = datos.get("equipo_info") or hostname

        modelo = ErrorRemotoCreate(
            id_usuario=id_u,
            nombre_usuario=str(nom_u)[:150],
            rol_usuario=str(rol_u)[:30] if rol_u else None,
            origen=str(datos.get("origen") or "backend")[:40],
            accion_metodo=str(datos.get("accion_metodo") or "")[:120] if datos.get("accion_metodo") else None,
            codigo_error=str(datos.get("codigo_error") or "ERROR_INTERNO")[:60],
            mensaje_error=str(datos.get("mensaje_error") or "Error sin mensaje específico"),
            detalle_tecnico=str(datos.get("detalle_tecnico") or "") if datos.get("detalle_tecnico") else None,
            equipo_info=str(equipo)[:150] if equipo else None
        )

        with obtener_cursor_pg(commit=True) as cur:
            cur.execute("""INSERT INTO app_rrhh.b_1_errores_remotos
                (id_usuario, nombre_usuario, rol_usuario, origen, accion_metodo, codigo_error, mensaje_error, detalle_tecnico, equipo_info)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id_error, fecha_hora""",
                (str(modelo.id_usuario) if modelo.id_usuario else None, modelo.nombre_usuario, modelo.rol_usuario,
                 modelo.origen, modelo.accion_metodo, modelo.codigo_error, modelo.mensaje_error, modelo.detalle_tecnico, modelo.equipo_info))
            res = cur.fetchone()
            return {"exito": True, **serializar(res)}
    except Exception as err:
        logger.warning(f"[Telemetría] No se pudo persistir error remoto: {err}")
        return {"exito": False, "error": str(err)}


# [FN-07.21] Consultar historial de errores remotos para administradores
def obtener_errores_remotos(solo_pendientes=True, limite=50):
    filtro_pendientes = "WHERE e.resuelto IS FALSE" if solo_pendientes else ""
    lim = max(1, min(int(limite or 50), 200))
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT e.*,
            u.dni AS usuario_dni,
            COALESCE(e.nombre_usuario, 'Sesión no iniciada') AS usuario_nombre,
            rp.dni AS resuelto_por_dni
            FROM app_rrhh.b_1_errores_remotos e
            LEFT JOIN app_rrhh.a_1_usuarios u ON u.id_usuario = e.id_usuario
            LEFT JOIN app_rrhh.a_1_usuarios rp ON rp.id_usuario = e.resuelto_por
            {filtro_pendientes}
            ORDER BY e.fecha_hora DESC
            LIMIT %s""", (lim,))
        return serializar(cur.fetchall())


# [FN-07.21] Marcar errores remotos como resueltos
def marcar_error_remoto_resuelto(id_error=None, todos=False, id_operador=None):
    op_id = None
    if id_operador:
        try:
            op_id = str(uuid_valido(id_operador))
        except Exception:
            op_id = None

    with obtener_cursor_pg(commit=True) as cur:
        if todos:
            cur.execute("""UPDATE app_rrhh.b_1_errores_remotos
                SET resuelto = TRUE, resuelto_por = %s
                WHERE resuelto IS FALSE""", (op_id,))
            afectados = cur.rowcount
        else:
            if not id_error:
                raise ValidacionError("Especifique el id_error a resolver.")
            eid = str(uuid_valido(id_error))
            cur.execute("""UPDATE app_rrhh.b_1_errores_remotos
                SET resuelto = TRUE, resuelto_por = %s
                WHERE id_error = %s""", (op_id, eid))
            afectados = cur.rowcount
    return {"exito": True, "afectados": afectados}


# [FN-04.14] Alta de nuevo usuario y sueldo base desde Empleados
def crear_usuario_y_sueldo(datos, operador_sesion=None):
    if not isinstance(datos, dict):
        raise ValidacionError("Datos inválidos.")
    rol_operador = operador_sesion.get("rol_app") if operador_sesion else None
    if rol_operador not in ("admin", "sub_admin"):
        raise PermisoDenegadoError("Solo usuarios admin o sub_admin pueden dar de alta nuevos empleados.")

    modelo = UsuarioSueldoCreate(**datos)
    if rol_operador != "admin" and modelo.rol_app == "admin":
        raise PermisoDenegadoError("Solo un administrador puede crear usuarios con rol admin.")

    p = perfil_esquema()
    dni_limpio = str(modelo.dni).strip()

    with obtener_cursor_pg(commit=True) as cur:
        # 1. Comprobar que no exista otro usuario con el mismo DNI
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE dni=%s", (dni_limpio,))
        if cur.fetchone():
            raise ValidacionError(f"Ya existe un usuario registrado con el DNI {dni_limpio}.")

        # 2. Insertar usuario según esquema verificado
        if "apellido" in p["apellido"]:
            cur.execute("""INSERT INTO app_rrhh.a_1_usuarios
                (nombre, apellido, dni, correo, area, rol_app, activo)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id_usuario, nombre, apellido, dni, correo, area, rol_app, activo, creado_en""",
                (modelo.primer_nombre, modelo.apellido, dni_limpio, modelo.email, modelo.area, modelo.rol_app, modelo.activo))
        else:
            nombre_completo = f"{modelo.primer_nombre} {modelo.apellido}".strip()
            cur.execute("""INSERT INTO app_rrhh.a_1_usuarios
                (nombre_completo, dni, email, area, rol_app, activo)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id_usuario, nombre_completo, dni, email, area, rol_app, activo, creado_en""",
                (nombre_completo, dni_limpio, modelo.email, modelo.area, modelo.rol_app, modelo.activo))
        
        nuevo_u = cur.fetchone()
        id_nuevo = str(nuevo_u["id_usuario"])

        # 3. Insertar sueldo base vinculado
        cur.execute("""INSERT INTO app_rrhh.a_1_sueldos_base
            (id_usuario, sueldo_oficina, sueldo_obra, lugar_habitual, modalidad_calculo, vigente_desde)
            VALUES (%s, %s, %s, %s, %s, CURRENT_DATE)
            RETURNING id_sueldo, dia_oficina, dia_obra, lugar_habitual, modalidad_calculo, vigente_desde""",
            (id_nuevo, modelo.sueldo_oficina, modelo.sueldo_obra, modelo.lugar_habitual, modelo.modalidad_calculo))
        nuevo_s = cur.fetchone()

    invalidar_caches_repositorio(('usuarios', False), ('usuarios', True))
    return {
        "exito": True,
        "id_usuario": id_nuevo,
        **serializar(nuevo_u),
        **serializar(nuevo_s)
    }


# [FN-07.22] Consultar catálogo completo de proyectos para vista de gestión administrativa
def obtener_proyectos_gestion(incluir_inactivos=True):
    filtro_activo = "" if incluir_inactivos else "WHERE COALESCE(p.activo, TRUE) IS TRUE"
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT p.id_servicio, p.id_proyecto,
            COALESCE(p.codificacion_serv, p.id_proyecto::text) AS denominacion,
            p.codificacion_serv, p.n_serv, p.responsable_des, p.area, p.url_des,
            COALESCE(p.activo, TRUE) AS activo
            FROM app_proyectos.b_1_proyectos_servicios p
            {filtro_activo}
            ORDER BY p.n_serv DESC NULLS LAST, p.codificacion_serv ASC""")
        return serializar(cur.fetchall())


# [FN-07.22] Creación de nuevo proyecto por administrador
def crear_proyecto(datos):
    if not isinstance(datos, dict):
        raise ValidacionError("Datos de proyecto inválidos.")
    modelo = ProyectoCreate(**datos)
    id_proy_str = str(uuid_valido(modelo.id_proyecto))
    n_serv_val = Decimal(str(modelo.n_serv)) if modelo.n_serv is not None else None

    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_proyecto FROM app_proyectos.b_1_proyectos_servicios WHERE id_proyecto=%s", (id_proy_str,))
        if cur.fetchone():
            raise ValidacionError(f"Ya existe un proyecto registrado con el id_proyecto {id_proy_str}.")

        cur.execute("""INSERT INTO app_proyectos.b_1_proyectos_servicios
            (id_proyecto, codificacion_serv, n_serv, responsable_des, area, url_des, activo)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id_servicio, id_proyecto, codificacion_serv, n_serv, responsable_des, area, url_des, activo""",
            (id_proy_str, modelo.codificacion_serv.strip(), n_serv_val,
             modelo.responsable_des.strip() if modelo.responsable_des else None,
             modelo.area.strip() if modelo.area else None,
             modelo.url_des.strip() if modelo.url_des else None,
             modelo.activo))
        creado = cur.fetchone()

    invalidar_caches_repositorio(('proyectos',), ('tarifas_roster',))
    return {"exito": True, **serializar(creado)}


# [FN-07.22] Edición de proyecto existente por administrador
def actualizar_proyecto(datos):
    if not isinstance(datos, dict):
        raise ValidacionError("Datos de proyecto inválidos.")
    modelo = ProyectoUpdate(**datos)
    id_serv_str = str(uuid_valido(modelo.id_servicio))
    id_proy_str = str(uuid_valido(modelo.id_proyecto))
    n_serv_val = Decimal(str(modelo.n_serv)) if modelo.n_serv is not None else None

    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_servicio FROM app_proyectos.b_1_proyectos_servicios WHERE id_servicio=%s FOR UPDATE", (id_serv_str,))
        if not cur.fetchone():
            raise RegistroNoEncontradoError("Proyecto no encontrado.")

        cur.execute("""SELECT id_servicio FROM app_proyectos.b_1_proyectos_servicios
            WHERE id_proyecto=%s AND id_servicio<>%s""", (id_proy_str, id_serv_str))
        if cur.fetchone():
            raise ValidacionError(f"El id_proyecto {id_proy_str} ya se encuentra asignado a otro proyecto.")

        cur.execute("""UPDATE app_proyectos.b_1_proyectos_servicios
            SET id_proyecto=%s, codificacion_serv=%s, n_serv=%s, responsable_des=%s, area=%s, url_des=%s, activo=%s
            WHERE id_servicio=%s
            RETURNING id_servicio, id_proyecto, codificacion_serv, n_serv, responsable_des, area, url_des, activo""",
            (id_proy_str, modelo.codificacion_serv.strip(), n_serv_val,
             modelo.responsable_des.strip() if modelo.responsable_des else None,
             modelo.area.strip() if modelo.area else None,
             modelo.url_des.strip() if modelo.url_des else None,
             modelo.activo, id_serv_str))
        actualizado = cur.fetchone()

    invalidar_caches_repositorio(('proyectos',), ('tarifas_roster',))
    return {"exito": True, **serializar(actualizado)}


# [FN-07.23] Detección de días pendientes de registro en el último día del mes
def obtener_dias_faltantes_mes(id_usuario, fecha_ref=None):
    if not id_usuario:
        raise ValidacionError("Usuario inválido.")
    uid = str(uuid_valido(id_usuario))
    
    fecha_base = date.fromisoformat(str(fecha_ref)) if fecha_ref else date.today()
    ultimo_dia = calendar.monthrange(fecha_base.year, fecha_base.month)[1]
    es_ultimo_dia = (fecha_base.day == ultimo_dia)

    inicio_mes = fecha_base.replace(day=1)
    fin_mes = fecha_base.replace(day=ultimo_dia)
    mes_anio = fecha_base.strftime("%Y-%m")

    p = perfil_esquema()
    filtro_soft = "AND (eliminado_en IS NULL)" if p.get("tiene_soft_delete_asistencias") else ""
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT DISTINCT EXTRACT(DAY FROM fecha)::int AS dia
            FROM app_rrhh.b_1_asistencias
            WHERE id_usuario = %s AND fecha >= %s AND fecha <= %s {filtro_soft}
            ORDER BY dia ASC""", (uid, inicio_mes, fin_mes))
        dias_cargados = {r["dia"] for r in cur.fetchall()}

    dias_faltantes = [d for d in range(1, ultimo_dia + 1) if d not in dias_cargados]
    return {
        "es_ultimo_dia_mes": es_ultimo_dia,
        "dia_hoy": fecha_base.day,
        "ultimo_dia": ultimo_dia,
        "ultimo_dia_mes": ultimo_dia,
        "mes_anio": mes_anio,
        "dias_faltantes": dias_faltantes,
        "cantidad_faltantes": len(dias_faltantes),
        "dias_registrados": len(dias_cargados)
    }

# [FN-07.19] Marcar todos los errores remotos como resueltos
def marcar_todos_errores_remotos_resueltos(id_admin):
    admin_uuid = uuid_valido(id_admin)
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("""UPDATE app_rrhh.b_1_errores_remotos
            SET resuelto = TRUE, resuelto_por = %s
            WHERE resuelto = FALSE
            RETURNING id_error""", (admin_uuid,))
        afectados = len(cur.fetchall())
    return {"exito": True, "resueltos": afectados, "mensaje": f"{afectados} error(es) marcados como resueltos."}
