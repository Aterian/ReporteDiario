# [MOD-07] Integración con PostgreSQL y triggers reales
from decimal import Decimal
from uuid import uuid4

import pytest
from psycopg2.extras import RealDictCursor

from error_handler import ValidacionError
from postgres_bridge import ApiPuente
from postgres_models import AsistenciaCreate, AsistenciaUpdate
from postgres_exports import exportar_liquidacion, exportar_rosters


# [FN-07.04] Validar generación diaria, viáticos y edición solo desde roster
def test_roster_trigger_y_edicion(pg_repository,pg_connection):
    db,ids = pg_repository
    datos = dict(empleado=ids["usuario"],proyecto=ids["proyecto"],fecha_inicio="2026-10-03",fecha_fin="2026-10-05",tipo="Campo",precio_dia=999999)
    resultado = db.guardar_rosters_atomicos([datos],ids["usuario"])[0]
    assert Decimal(resultado["total_viaticos"]) == 390
    historial = db.consultar_asistencias(ids["usuario"],"2026-10")
    assert len(historial) == 3
    assert {f["modalidad"] for f in historial} == {"roster"}
    assert {f["id_roster"] for f in historial} == {resultado["id"]}
    datos.update(id=resultado["id"],fecha_fin="2026-10-06")
    db.guardar_rosters_atomicos([datos],ids["usuario"])
    assert len(db.consultar_asistencias(ids["usuario"],"2026-10")) == 4
    with pg_connection.cursor() as cur:
        cur.execute("SELECT id_tarifa FROM app_rrhh.b_1_roster WHERE id_roster=%s",(resultado["id"],))
        assert str(cur.fetchone()[0]) == ids["tarifa"]


# [FN-07.04] Mantener tarifas históricas al publicar una nueva tarifa activa
def test_tarifa_historica_y_franco(pg_repository,pg_connection):
    db,ids = pg_repository
    datos = dict(empleado=ids["usuario"],proyecto=ids["proyecto"],fecha_inicio="2026-10-01",fecha_fin="2026-10-02",tipo="Franco")
    resultado = db.guardar_rosters_atomicos([datos],ids["usuario"])[0]
    assert Decimal(resultado["total_viaticos"]) == 30
    with pg_connection.cursor() as cur:
        cur.execute("INSERT INTO app_rrhh.b_1_tarifas_roster (id_proyecto,dia_normal,dia_domingo) VALUES (%s,%s,%s)",(ids["proyecto"],999,888))
    roster = next(r for r in db.obtener_rosters() if r["id"]==resultado["id"])
    assert Decimal(roster["precio_dia"]) == 100
    assert Decimal(roster["precio_domingo"]) == 200
    assert roster["tipo"] == "Franco"


# [FN-07.04] Deshacer el lote entero si un turno se superpone
def test_lote_atomico_roster(pg_repository,pg_connection):
    db,ids = pg_repository
    datos = dict(empleado=ids["usuario"],proyecto=ids["proyecto"],fecha_inicio="2026-10-01",fecha_fin="2026-10-03",tipo="Campo")
    with pytest.raises(ValidacionError):
        db.guardar_rosters_atomicos([datos,dict(datos,fecha_inicio="2026-10-02")],ids["usuario"])
    with pg_connection.cursor() as cur:
        cur.execute("SELECT count(*) FROM app_rrhh.b_1_roster WHERE id_usuario=%s",(ids["usuario"],))
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT count(*) FROM app_rrhh.b_1_asistencias WHERE id_usuario=%s",(ids["usuario"],))
        assert cur.fetchone()[0] == 0


# [FN-07.03] Delegar vacaciones, prioridad de oficina y liquidación a PostgreSQL
def test_asistencia_y_liquidacion(pg_repository,pg_connection):
    db,ids = pg_repository
    base = dict(id_usuario=ids["usuario"],fecha="2026-10-01",activo_franco="vacaciones",lugar="obra",dedicado_a="areas")
    db.guardar_asistencias_atomicas([AsistenciaCreate(**base)],ids["usuario"])
    obra = db.obtener_liquidacion(ids["usuario"],"2026-10")
    assert Decimal(obra["total_real"]) == 20000
    db.guardar_asistencias_atomicas([AsistenciaCreate(**dict(base,lugar="oficina"))],ids["usuario"])
    liquidacion = db.obtener_liquidacion(ids["usuario"],"2026-10")
    assert liquidacion["cant_dias_ofi"] == 1
    assert liquidacion["cant_dias_obra"] == 0
    assert Decimal(liquidacion["subtotal_estimado"]) == 10000
    assert Decimal(liquidacion["total_real"]) == 10000
    with pg_connection.cursor() as cur:
        cur.execute("INSERT INTO app_rrhh.a_1_adicionales_sueldo (id_calculo_sueldo,fecha,cantidad_adicional,descripcion) VALUES (%s,%s,%s,%s)",
            (liquidacion["id_calculo_sueldo"],"2026-10-02",Decimal("123.45"),"Adicional sintético"))
    liquidacion = db.obtener_liquidacion(ids["usuario"],"2026-10")
    assert Decimal(liquidacion["total_adicionales"]) == Decimal("123.45")
    assert Decimal(liquidacion["sueldo_total"]) == Decimal("10123.45")
    assert liquidacion["adicionales"][0]["fecha"] == "2026-10-02"
    assert liquidacion["adicionales"][0]["descripcion"] == "Adicional sintético"


# [FN-07.03] Respetar costo manual incluso cuando es cero
def test_costo_manual_y_actualizacion(pg_repository):
    db,ids = pg_repository
    modelo = AsistenciaCreate(id_usuario=ids["usuario"],fecha="2026-10-01",activo_franco="licencia",lugar="oficina",dedicado_a="areas",costo_manual=True,costo_dia=Decimal("123.45"))
    fila = db.guardar_asistencias_atomicas([modelo],ids["usuario"])[0]
    assert Decimal(fila["costo_dia"]) == Decimal("123.45")
    db.actualizar_costo_dia_manual(fila["id"],0)
    assert Decimal(db.obtener_liquidacion(ids["usuario"],"2026-10")["total_real"]) == 0


# [FN-07.03] Validar actualización y recálculo al cambiar el mes
def test_editar_asistencia_cambia_ciclo(pg_repository):
    db,ids = pg_repository
    modelo = AsistenciaCreate(id_usuario=ids["usuario"],fecha="2026-10-01",activo_franco="activo",lugar="oficina",dedicado_a="areas",horas_dedicadas=8)
    fila = db.guardar_asistencias_atomicas([modelo],ids["usuario"])[0]
    valores = modelo.model_dump()
    valores.update(fecha="2026-11-01",lugar="obra")
    db.modificar_asistencia(AsistenciaUpdate(**valores,id_asistencia=fila["id"]),ids["usuario"])
    assert Decimal(db.obtener_liquidacion(ids["usuario"],"2026-10")["total_real"]) == 0
    assert Decimal(db.obtener_liquidacion(ids["usuario"],"2026-11")["total_real"]) == 20000


# [FN-07.02] Probar firmas del puente y operador tomado de sesión
def test_puente_transaccional(pg_repository):
    db,ids = pg_repository
    usuario = db.resolver_usuario(ids["usuario"])
    api = ApiPuente()
    assert api.iniciar_sesion(usuario["nombre"],usuario["dni"])["exito"]
    respuesta = api.guardar_check_diario({"fecha":"2026-10-01","lugar":"Vacaciones","modalidad":"obra","cargado_por":str(uuid4())})
    assert respuesta["exito"]
    assert api.obtener_historial()[0]["cargado_por_id"] == ids["usuario"]
    assert api.obtener_liquidacion(usuario["nombre"],"2026-10")["liquidacion"]["total_real"] == "20000.00"
    assert api.eliminar_roster(str(uuid4()))["codigo_error"] == "BORRADO_LOGICO_PENDIENTE"
    assert api.cerrar_sesion()["exito"]


# [FN-07.03] Resolver proyecto y modalidad nuevos al editar un registro heredado
def test_puente_edita_modalidad_y_proyecto(pg_repository):
    db,ids = pg_repository
    usuario = db.resolver_usuario(ids["usuario"])
    db.guardar_sesion_activa(usuario)
    api = ApiPuente()
    assert api.guardar_check_diario({"fecha":"2026-10-01","lugar":"Campo","id_proyecto":ids["proyecto"],"servicio":"Proyecto","horas":8})["exito"]
    anterior = api.obtener_historial()[0]
    respuesta = api.modificar_registro({"id":anterior["id"],"fecha":"2026-10-01","lugar":"Oficina","modalidad":"oficina",
        "servicio":"Dedicado al área","id_proyecto":ids["proyecto"],"horas":8})
    assert respuesta["exito"],respuesta
    actual = api.obtener_historial()[0]
    assert actual["modalidad"] == "oficina"
    assert actual["id_proyecto"] is None
    assert Decimal(actual["costo_dia"]) == 10000


# [FN-07.07] Mantener el contrato del widget de actividad diaria
def test_actividad_diaria_contrato(pg_repository):
    db,ids = pg_repository
    modelo = AsistenciaCreate(id_usuario=ids["usuario"],fecha="2026-10-01",activo_franco="activo",lugar="oficina",dedicado_a="areas",horas_dedicadas=8)
    db.guardar_asistencias_atomicas([modelo],ids["usuario"])
    estado = db.obtener_estado_diario_empleados("2026-10-01")
    empleado = next(u for u in estado["lista"] if u["id_usuario"]==ids["usuario"])
    assert empleado["registrado"] and empleado["enviado"]
    assert empleado["modalidad"] == "Oficina"
    assert Decimal(empleado["horas"]) == 8
    assert estado["registrados"] == 1


# [FN-07.09] Exportar los importes canónicos sin multiplicaciones
def test_exportaciones_canonicas(pg_repository,tmp_path):
    from openpyxl import load_workbook
    db,ids = pg_repository
    datos = dict(empleado=ids["usuario"],proyecto=ids["proyecto"],fecha_inicio="2026-10-01",fecha_fin="2026-10-02",tipo="Campo")
    db.guardar_rosters_atomicos([datos],ids["usuario"])
    rosters = db.obtener_rosters()
    liquidacion = db.obtener_liquidacion(ids["usuario"],"2026-10")
    ruta = tmp_path/"roster.xlsx"
    exportar_rosters(rosters,ruta)
    assert load_workbook(ruta)["Roster"].cell(2,8).value == 190
    ruta = tmp_path/"liquidacion.xlsx"
    exportar_liquidacion({"empleado":"Sintético","liquidacion":liquidacion},ruta)
    assert load_workbook(ruta)["Liquidación"].cell(2,8).value == float(liquidacion["sueldo_total"])

# [FN-07.12] Preservar costos manuales al modificar un turno de Roster
def test_update_roster_preserva_costos_manuales(pg_repository, pg_connection):
    db, ids = pg_repository
    # 1. Crear turno inicial 2026-10-01 al 2026-10-04
    datos = dict(
        empleado=ids["usuario"],
        proyecto=ids["proyecto"],
        fecha_inicio="2026-10-01",
        fecha_fin="2026-10-04",
        tipo="Campo"
    )
    resultado = db.guardar_rosters_atomicos([datos], ids["usuario"])[0]
    id_roster = resultado["id"]

    # 2. Modificar manualmente el costo del día 2026-10-02
    with pg_connection.cursor() as cur:
        cur.execute("""UPDATE app_rrhh.b_1_asistencias
            SET costo_manual = TRUE, costo_dia = 55000.00
            WHERE id_roster = %s AND fecha = '2026-10-02'""", (id_roster,))

    # 3. Actualizar el turno extendiéndolo al 2026-10-05
    datos_actualizados = dict(
        id=id_roster,
        empleado=ids["usuario"],
        proyecto=ids["proyecto"],
        fecha_inicio="2026-10-01",
        fecha_fin="2026-10-05",
        tipo="Campo"
    )
    db.guardar_rosters_atomicos([datos_actualizados], ids["usuario"])

    # 4. Verificar que el día 2026-10-02 conservó costo_manual=TRUE y costo_dia=55000.00
    with pg_connection.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""SELECT fecha, costo_manual, costo_dia
            FROM app_rrhh.b_1_asistencias
            WHERE id_roster = %s ORDER BY fecha""", (id_roster,))
        filas = cur.fetchall()

    assert len(filas) == 5
    fila_manual = next(f for f in filas if str(f["fecha"]) == "2026-10-02")
    assert fila_manual["costo_manual"] is True
    assert Decimal(str(fila_manual["costo_dia"])) == Decimal("55000.00")

    fila_automatica = next(f for f in filas if str(f["fecha"]) == "2026-10-03")
    assert fila_automatica["costo_manual"] is False


# [FN-07.12] Prevenir recursión infinita en liquidación cuando el costo es $0.00
def test_trigger_liquidacion_sin_recursion_en_tarifa_cero(pg_repository, pg_connection):
    db, ids = pg_repository
    u_id = ids["usuario"]
    # 1. Configurar sueldos base en $0.00
    with pg_connection.cursor() as cur:
        cur.execute("""UPDATE app_rrhh.a_1_sueldos_base
            SET sueldo_oficina = 0.00, sueldo_obra = 0.00
            WHERE id_usuario = %s""", (u_id,))

    # 2. Insertar dos asistencias para la misma fecha (oficina y obra, ambas resultarán en $0.00)
    m_ofi = AsistenciaCreate(id_usuario=u_id, fecha="2026-10-15", activo_franco="activo", lugar="oficina", dedicado_a="areas")
    m_obra = AsistenciaCreate(id_usuario=u_id, fecha="2026-10-15", activo_franco="activo", lugar="obra", dedicado_a="proyectos", id_proyecto=ids["proyecto"])
    res = db.guardar_asistencias_atomicas([m_ofi, m_obra], u_id)
    assert len(res) == 2

    # 3. Eliminar la asistencia de obra (dispara trg_sincronizar_liquidacion_mensual)
    # Sin el blindaje de pg_trigger_depth() = 1, esto disparaba recursión infinita
    with pg_connection.cursor() as cur:
        cur.execute("""DELETE FROM app_rrhh.b_1_asistencias
            WHERE id_usuario = %s AND fecha = '2026-10-15' AND lugar = 'obra'""", (u_id,))

    # 4. Modificar la asistencia restante (también dispara trg_sincronizar_liquidacion_mensual)
    with pg_connection.cursor() as cur:
        cur.execute("""UPDATE app_rrhh.b_1_asistencias
            SET horas_dedicadas = 4.0
            WHERE id_usuario = %s AND fecha = '2026-10-15' AND lugar = 'oficina'""", (u_id,))

    # 5. Confirmar que la liquidación existe y liquidó sin error
    liq = db.obtener_liquidacion(u_id, "2026-10")
    assert liq is not None
    assert Decimal(liq["total_real"]) == Decimal("0.00")


# [FN-07.16] Verificar trigger de auditoría y consultas con esquema real (nombre + apellido)
def test_auditoria_real_y_consultas_modificaciones(pg_repository):
    db, ids = pg_repository
    u_id = ids["usuario"]
    assert db.perfil_esquema()["tiene_auditoria"] is True

    # 1. Crear una asistencia inicial
    m_ofi = AsistenciaCreate(id_usuario=u_id, fecha="2026-10-20", activo_franco="activo", lugar="oficina", dedicado_a="areas", horas_dedicadas=8.0)
    creado = db.guardar_asistencias_atomicas([m_ofi], u_id)[0]
    id_asist = creado["id"]

    # 2. Actualizar horas dedicadas y costo manual para disparar trg_auditar_modificaciones_asistencia
    db.actualizar_costo_dia_manual(id_asist, 15000.00, quien_modifica=u_id, motivo="Ajuste RRHH")

    # 3. Consultar asistencias debe incluir el historial de modificaciones sin errores SQL
    historial = db.consultar_asistencias(u_id, "2026-10")
    assert len(historial) == 1
    assert historial[0]["fue_modificado"] is True
    assert len(historial[0]["modificaciones"]) >= 1
    mod = historial[0]["modificaciones"][-1]
    assert "Ajuste RRHH" in mod["detalle_cambio"]
    assert mod["quien_modifica"] == "Empleado Sintético"

    # 4. Consultar modificaciones recientes y notificaciones pendientes
    recientes = db.obtener_modificaciones_recientes(limite=10)
    assert any(r["id_asistencia"] == id_asist for r in recientes)
    notificaciones = db.obtener_notificaciones_modificaciones(solo_no_revisadas=True)
    assert any(n["id_asistencia"] == id_asist for n in notificaciones)

    # 5. Marcar modificación como revisada
    res_rev = db.marcar_modificacion_por_asistencia_revisada(id_asist, id_operador=u_id)
    assert res_rev["exito"] is True
    assert res_rev["afectados"] >= 1

# [FN-07.20] Validar liquidación dual 'base_30' vs 'por_dia', ajuste de días mixtos y meses incompletos
def test_modalidad_calculo_sueldo_base_30_vs_por_dia(pg_repository, pg_connection):
    db, ids = pg_repository
    u_id = ids["usuario"]

    # 1. Configurar inicialmente en base_30 con lugar_habitual oficina
    db.actualizar_configuracion_sueldo_usuario({
        "id_usuario": u_id,
        "modalidad_calculo": "base_30",
        "lugar_habitual": "oficina"
    })

    # 2. Escenario Mes Incompleto (15 días en 2026-10): No debe aplicar ajuste a 30
    asistencias_15 = [
        AsistenciaCreate(
            id_usuario=u_id,
            fecha=f"2026-10-{d:02d}",
            activo_franco="activo",
            lugar="oficina",
            tipo_dia="dia_normal",
            dedicado_a="areas",
            horas_dedicadas=8.0
        )
        for d in range(1, 16)
    ]
    db.guardar_asistencias_atomicas(asistencias_15, u_id)
    liq_15 = db.obtener_liquidacion(u_id, "2026-10")
    assert liq_15["modalidad_calculo"] == "base_30"
    assert liq_15["cant_dias_ofi"] == 15
    assert Decimal(liq_15["total_real"]) == Decimal("150000.00")

    # 3. Escenario Mes Completo de 31 días (2026-10) con 1 feriado trabajado
    asistencias_resto = [
        AsistenciaCreate(
            id_usuario=u_id,
            fecha=f"2026-10-{d:02d}",
            activo_franco="activo",
            lugar="oficina",
            tipo_dia="feriado_trabajado" if d == 20 else "dia_normal",
            dedicado_a="areas",
            horas_dedicadas=8.0
        )
        for d in range(16, 32)
    ]
    db.guardar_asistencias_atomicas(asistencias_resto, u_id)

    liq_31 = db.obtener_liquidacion(u_id, "2026-10")
    # Base 30 en mes de 31: total 31 >= 31 -> ajuste delta = -1 día sobre lugar_habitual (oficina)
    assert liq_31["modalidad_calculo"] == "base_30"
    assert liq_31["cant_dias_ofi"] == 30
    # Costo base 30 días a 10000 + 10000 recargo feriado = 310000
    assert Decimal(liq_31["total_real"]) == Decimal("310000.00")

    # 4. Escenario Mes Completo de 28 días (Febrero 2026): Ajuste +2 días
    asistencias_feb = [
        AsistenciaCreate(
            id_usuario=u_id,
            fecha=f"2026-02-{d:02d}",
            activo_franco="activo",
            lugar="oficina",
            tipo_dia="dia_normal",
            dedicado_a="areas",
            horas_dedicadas=8.0
        )
        for d in range(1, 29)
    ]
    db.guardar_asistencias_atomicas(asistencias_feb, u_id)

    liq_feb = db.obtener_liquidacion(u_id, "2026-02")
    # Base 30 en febrero 28 días: delta = +2 días sobre lugar_habitual (oficina)
    assert liq_feb["modalidad_calculo"] == "base_30"
    assert liq_feb["cant_dias_ofi"] == 30
    assert Decimal(liq_feb["total_real"]) == Decimal("300000.00")

    # 5. Cambiar a modalidad 'por_dia': Se deben liquidar días reales calendario exactos
    res_cambio = db.actualizar_configuracion_sueldo_usuario({
        "id_usuario": u_id,
        "modalidad_calculo": "por_dia",
        "lugar_habitual": "oficina"
    })
    assert res_cambio["exito"] is True

    # Octubre (31 días reales): cant_dias_ofi = 31, costo = 31 * 10000 + 10000 feriado = 320000
    liq_31_pordia = db.obtener_liquidacion(u_id, "2026-10")
    assert liq_31_pordia["modalidad_calculo"] == "por_dia"
    assert liq_31_pordia["cant_dias_ofi"] == 31
    assert Decimal(liq_31_pordia["total_real"]) == Decimal("320000.00")

    # Febrero (28 días reales): cant_dias_ofi = 28, costo = 28 * 10000 = 280000
    liq_feb_pordia = db.obtener_liquidacion(u_id, "2026-02")
    assert liq_feb_pordia["modalidad_calculo"] == "por_dia"
    assert liq_feb_pordia["cant_dias_ofi"] == 28
    assert Decimal(liq_feb_pordia["total_real"]) == Decimal("280000.00")
