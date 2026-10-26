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
from postgres_models import AsistenciaCreate, RosterCreate, RosterUpdate, RosterResponse, LiquidacionResponse

_sesion = None
_sesion_lock = Lock()
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
    elif {"nombre", "apellido", "correo"} <= usuarios:
        nombre, correo = "concat_ws(' ', u.nombre, u.apellido)", "u.correo"
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
    return {"nombre": nombre, "correo": correo, "rol": "u.rol_app" if "rol_app" in usuarios else "NULL::text",
            "proyecto": proyecto, "proyecto_activo": "p.activo IS TRUE" if "activo" in proyectos else "TRUE",
            "proyecto_area": "p.area" if "area" in proyectos else "NULL::text", "roles_disponibles": "rol_app" in usuarios}


# [FN-07.01] Comprobar conexión sin crear tablas
def inicializar_bd():
    return perfil_esquema()


# [FN-07.02] Consultar empleados y valores diarios generados
def obtener_usuarios_cache():
    p = perfil_esquema()
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT u.id_usuario,u.id_usuario AS id_origen,u.dni,{p['nombre']} AS nombre,
            {p['correo']} AS mail,{p['correo']} AS email,u.area,COALESCE({p['rol']},'user_1') AS rol_app,
            s.dia_oficina AS costo_dia_ofi,s.dia_obra AS costo_dia_obra,s.lugar_habitual
            FROM app_rrhh.a_1_usuarios u LEFT JOIN app_rrhh.a_1_sueldos_base s ON s.id_usuario=u.id_usuario
            WHERE u.activo IS TRUE ORDER BY nombre""")
        return serializar(cur.fetchall())


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


# [FN-07.02] Consultar catálogo de proyectos real
def obtener_proyectos_cache():
    p = perfil_esquema()
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT p.id_proyecto,{p['proyecto']} AS denominacion,{p['proyecto_area']} AS area
            FROM app_proyectos.b_1_proyectos_servicios p WHERE p.id_proyecto IS NOT NULL
            AND {p['proyecto_activo']} ORDER BY denominacion""")
        return serializar(cur.fetchall())


# [FN-07.02] Resolver claves de proyecto
def resolver_proyecto(datos, proyectos):
    ref = normalizar_texto(datos.get("id_proyecto") or datos.get("proyecto") or datos.get("servicio"))
    candidatos = [p for p in proyectos if ref and ref in {normalizar_texto(p["id_proyecto"]), normalizar_texto(p["denominacion"])}]
    if len(candidatos) != 1:
        raise ValidacionError("Seleccione un proyecto válido de PostgreSQL.")
    return candidatos[0]["id_proyecto"]


# [FN-07.04] Consultar tarifas activas
def obtener_tarifas_roster_cache():
    p = perfil_esquema()
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT t.*,t.dia_domingo AS domingo,t.adicional_turno AS adicionales,{p['proyecto']} AS proyecto
            FROM app_rrhh.b_1_tarifas_roster t JOIN app_proyectos.b_1_proyectos_servicios p ON p.id_proyecto=t.id_proyecto
            WHERE t.es_activa IS TRUE ORDER BY proyecto""")
        return serializar(cur.fetchall())


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
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("checkdiario.roster",))
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario=ANY(%s::uuid[]) ORDER BY id_usuario FOR UPDATE", (sorted({str(m.id_usuario) for m in modelos}),))
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
            WHERE (%s::date IS NULL OR r.fecha_fin>=%s::date) AND (%s::date IS NULL OR r.fecha_inicio<=%s::date)
            ORDER BY empleado,r.fecha_inicio,r.id_roster""",(desde,desde,hasta,hasta))
        filas = serializar(cur.fetchall())
    return [serializar(RosterResponse.model_validate({**f,"tipo":ETIQUETAS_ROSTER[f["tipo_turno"]]}).model_dump()) for f in filas]


# [FN-07.05] Bloquear borrado hasta contar con deleted_at
def eliminar_registro_roster(id_roster):
    return {"exito":False,"error":"La eliminación está bloqueada hasta implementar borrado lógico en PostgreSQL.","codigo_error":"BORRADO_LOGICO_PENDIENTE"}


# [FN-07.05] Bloquear eliminación de asistencias
def eliminar_registro_asistencia(id_registro):
    return eliminar_registro_roster(id_registro)


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
def preparar_asistencias(datos, usuario):
    estado,lugar,clase = mapear_modalidad(datos)
    proyectos = obtener_proyectos_cache()
    modelos = []
    for fecha in fechas_captura(datos):
        for detalle in datos.get("proyectos") or [datos]:
            d = {**datos,**detalle}
            servicio = normalizar_texto(d.get("servicio"))
            es_area = (estado in ("vacaciones","licencia") or servicio.startswith("dedicado al") or
                       servicio in ("","campo","oficina","franco") or servicio.startswith("tiempo dedicado al") or d.get("dedicado_a") == "areas")
            if not es_area and not d.get("proyecto") and not d.get("id_proyecto"):
                es_area = not any(normalizar_texto(p["denominacion"]) == servicio for p in proyectos)
                if es_area and estado == "activo" and "area" not in d:
                    raise ValidacionError("La imputación no coincide con un proyecto ni con un área.")
            proyecto = None if es_area else resolver_proyecto(d,proyectos)
            manual = d.get("costo_manual",False)
            modelos.append(AsistenciaCreate(id_usuario=usuario,fecha=fecha,activo_franco=estado,lugar=lugar,
                tipo_dia=clase,dedicado_a="proyectos" if proyecto else "areas",id_proyecto=proyecto,
                hora_inicio=d.get("hora_inicio") or None,hora_fin=d.get("hora_fin") or None,
                horas_dedicadas=d.get("horas",0),costo_manual=manual,costo_dia=d.get("costo_dia") if manual else None))
    return modelos


# [FN-07.03] Insertar asistencias y delegar el costo a los triggers
def guardar_asistencias_atomicas(modelos, operador):
    resultados = []
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario=ANY(%s::uuid[]) ORDER BY id_usuario FOR UPDATE",(sorted({str(m.id_usuario) for m in modelos}),))
        for m in modelos:
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
    return resultados


# [FN-07.03] Leer historial conservando los campos del puente
def consultar_asistencias(empleado="",mes_anio="",id_asistencia=None):
    p = perfil_esquema()
    inicio = date.fromisoformat(mes_anio+"-01") if mes_anio else None
    fin = inicio.replace(day=calendar.monthrange(inicio.year,inicio.month)[1])+timedelta(days=1) if inicio else None
    with obtener_cursor_pg() as cur:
        cur.execute(f"""SELECT a.*,a.id_asistencia AS id,a.id_usuario AS id_empleado,{p['nombre']} AS empleado,
            {p['correo']} AS usuario_mail,{p['proyecto']} AS servicio,u.area,a.fecha_hora_carga AS fecha_hora
            FROM app_rrhh.b_1_asistencias a JOIN app_rrhh.a_1_usuarios u ON u.id_usuario=a.id_usuario
            LEFT JOIN app_proyectos.b_1_proyectos_servicios p ON p.id_proyecto=a.id_proyecto
            WHERE (%s='' OR {p['nombre']}=%s OR a.id_usuario::text=%s)
            AND (%s::date IS NULL OR a.fecha>=%s::date) AND (%s::date IS NULL OR a.fecha<%s::date)
            AND (%s::uuid IS NULL OR a.id_asistencia=%s::uuid) ORDER BY a.fecha DESC,a.fecha_hora_carga DESC,a.id_asistencia""",
            (empleado,empleado,empleado,inicio,inicio,fin,fin,id_asistencia,id_asistencia))
        filas = serializar(cur.fetchall())
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
        f.update(tipo_ocf=tipo,modalidad=modalidad,lugar=tipo,horas=f["horas_dedicadas"],sincronizado=1,
                 tipo_costo="Oficina" if modalidad=="oficina" else "Campo",feriado="SI" if f["tipo_dia"]=="feriado_trabajado" else "NO",
                 servicio=f["servicio"] or f["area"],modificado=False,instrumental="")
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
        return serializar(cur.fetchone())


# [FN-07.06] Leer liquidación y adicionales en una sola instantánea
def obtener_liquidacion(empleado,ciclo_cobro):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])",ciclo_cobro):
        raise ValidacionError("Ciclo de cobro inválido; utilice YYYY-MM.")
    usuario = resolver_usuario(empleado)
    with obtener_cursor_pg() as cur:
        cur.execute("""SELECT c.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id_adicional',d.id_adicional,'fecha',d.fecha,
            'cantidad_adicional',d.cantidad_adicional::text,'descripcion',d.descripcion) ORDER BY d.fecha,d.id_adicional)
            FROM app_rrhh.a_1_adicionales_sueldo d WHERE d.id_calculo_sueldo=c.id_calculo_sueldo),'[]'::jsonb) AS adicionales
            FROM app_rrhh.a_1_calculo_sueldo c WHERE c.id_usuario=%s AND c.ciclo_cobro=%s""",(usuario["id_usuario"],ciclo_cobro))
        fila = cur.fetchone()
    return serializar(LiquidacionResponse.model_validate(fila).model_dump()) if fila else None


# [FN-07.03] Registrar un costo manual explícito
def actualizar_costo_dia_manual(id_registro,nuevo_costo,quien_modifica="",motivo=""):
    valor = Decimal(str(nuevo_costo))
    if not valor.is_finite() or valor < 0:
        raise ValidacionError("El costo debe ser un número no negativo y finito.")
    with obtener_cursor_pg(commit=True) as cur:
        cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario IN (SELECT id_usuario FROM app_rrhh.b_1_asistencias WHERE id_asistencia=%s) FOR UPDATE",(uuid_valido(id_registro),))
        cur.execute("UPDATE app_rrhh.b_1_asistencias SET costo_manual=TRUE,costo_dia=%s WHERE id_asistencia=%s RETURNING id_asistencia AS id,costo_dia",(valor,uuid_valido(id_registro)))
        fila = cur.fetchone()
        if not fila:
            raise RegistroNoEncontradoError()
        return {"exito":True,**serializar(fila)}


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
        return cur.rowcount


# [FN-07.07] Consultar el estado diario de empleados activos
def obtener_estado_diario_empleados(fecha=""):
    dia = date.fromisoformat(fecha) if fecha else date.today()
    usuarios = obtener_usuarios_cache()
    with obtener_cursor_pg() as cur:
        cur.execute("""SELECT id_usuario,SUM(horas_dedicadas) AS horas,COUNT(*) AS registros,
            string_agg(DISTINCT CASE WHEN activo_franco='vacaciones' THEN 'Vacaciones'
                WHEN activo_franco='licencia' THEN 'Licencia' WHEN activo_franco='franco' THEN 'Franco'
                WHEN lugar='oficina' THEN 'Oficina' ELSE 'Campo' END, ' / ') AS modalidad
            FROM app_rrhh.b_1_asistencias WHERE fecha=%s GROUP BY id_usuario""",(dia,))
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
    with obtener_cursor_pg() as cur:
        cur.execute("SELECT EXISTS(SELECT 1 FROM app_rrhh.b_1_asistencias WHERE id_usuario=%s AND fecha=CURRENT_DATE) AS registrado",(usuario["id_usuario"],))
        return cur.fetchone()["registrado"]
