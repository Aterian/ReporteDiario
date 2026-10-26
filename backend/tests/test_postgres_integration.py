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
    assert api.obtener_historial()[0]["cargado_por"] == ids["usuario"]
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
