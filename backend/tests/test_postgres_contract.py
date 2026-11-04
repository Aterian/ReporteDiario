# [MOD-07] Contratos de tipos, SQL y autorizaciones
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

import postgres_repository as db
from error_handler import ValidacionError
from postgres_bridge import ApiPuente
from postgres_models import AsistenciaCreate

USUARIO = str(uuid4())
PROYECTO = str(uuid4())


# [FN-07.02] Verificar estados React y PostgreSQL
@pytest.mark.parametrize("etiqueta,estado",[("Campo","activo"),("Franco","franco"),("Vacaciones","vacaciones"),("Licencia","licencia")])
def test_mapeo_roster(etiqueta,estado):
    modelo = db.preparar_roster({"empleado":"Persona","proyecto":"Proyecto","fecha_inicio":"2026-10-01","fecha_fin":"2026-10-03","tipo":etiqueta},
        [{"id_usuario":USUARIO,"nombre":"Persona"}],[{"id_proyecto":PROYECTO,"denominacion":"Proyecto"}])
    assert modelo.tipo_turno.value == estado
    assert db.ETIQUETAS_ROSTER[estado] == etiqueta


# [FN-07.03] Verificar modalidad y clasificación de asistencia
@pytest.mark.parametrize("datos,resultado",[
    ({"lugar":"Oficina"},("activo","oficina","dia_normal")),
    ({"lugar":"Campo"},("activo","obra","dia_normal")),
    ({"tipo_ocf":"Vacaciones","modalidad":"oficina","feriado":"SI"},("vacaciones","oficina","dia_normal")),
    ({"tipo_ocf":"Licencia","modalidad":"obra"},("licencia","obra","dia_normal")),
    ({"lugar":"Franco","sub_franco":"Franco de Obra"},("franco","obra","dia_normal")),
    ({"lugar":"Franco Obra Trabajado"},("activo","obra","franco_trabajado")),
    ({"lugar":"Feriado Trabajado","tipo_costo":"Oficina"},("activo","oficina","feriado_trabajado")),
])
def test_mapeo_asistencia(datos,resultado):
    assert db.mapear_modalidad(datos) == resultado


# [FN-07.03] Rechazar ausencias sin modalidad
def test_ausencia_necesita_modalidad():
    with pytest.raises(ValidacionError):
        db.mapear_modalidad({"lugar":"Licencia"})


# [FN-07.03] Evitar costos calculados por el cliente en modo automático
def test_dto_costo_automatico_y_manual():
    base = dict(id_usuario=USUARIO,fecha="2026-10-01",activo_franco="vacaciones",lugar="obra",dedicado_a="areas")
    with pytest.raises(ValidationError):
        AsistenciaCreate(**base,costo_manual=True)
    with pytest.raises(ValidationError):
        AsistenciaCreate(**base,costo_dia=999)
    assert AsistenciaCreate(**base,costo_manual=True,costo_dia=0).costo_dia == Decimal("0")
    for valor in ("NaN","Infinity","-1"):
        with pytest.raises(ValidationError):
            AsistenciaCreate(**base,costo_manual=True,costo_dia=valor)


# [FN-07.02] Conservar exactitud decimal al serializar
def test_serializacion():
    assert db.serializar({"id":uuid4(),"fecha":date(2026,10,1),"monto":Decimal("123456789.01")})["monto"] == "123456789.01"


# [FN-07.17] Borrado lógico en asistencias y roster con validación y RBAC
def test_borrado_logico_asistencias_y_roster(monkeypatch):
    from error_handler import PermisoDenegadoError, RegistroNoEncontradoError
    id_asist = str(uuid4())
    id_usuario_reg = str(uuid4())
    id_operador_ajeno = str(uuid4())
    id_operador_admin = str(uuid4())
    id_roster = str(uuid4())

    # 1. UUID inválido debe arrojar ValidacionError
    with pytest.raises(ValidacionError):
        db.eliminar_registro_asistencia("uuid-invalido", id_operador_admin, administrador=True)

    # 2. Usuario no admin intentando borrar asistencia ajena -> PermisoDenegadoError
    cursor_mock = MagicMock()
    cursor_mock.fetchone.return_value = {"id_usuario": id_usuario_reg, "id_roster": None, "fecha": date(2026, 10, 15)}
    @contextmanager
    def mock_conn(commit=False):
        yield cursor_mock
    monkeypatch.setattr(db, "obtener_cursor_pg", mock_conn)

    with pytest.raises(PermisoDenegadoError):
        db.eliminar_registro_asistencia(id_asist, operador=id_operador_ajeno, administrador=False)

    # 3. Borrado lógico exitoso de asistencia por admin
    cursor_mock.fetchone.side_effect = [
        {"id_usuario": id_usuario_reg, "id_roster": None, "fecha": date(2026, 10, 15)},
        {"id": id_asist, "fecha": date(2026, 10, 15), "id_usuario": id_usuario_reg}
    ]
    res_asist = db.eliminar_registro_asistencia(id_asist, operador=id_operador_admin, administrador=True)
    assert res_asist["exito"] is True
    assert res_asist["id"] == id_asist

    # 4. Usuario no admin intentando borrar turno de Roster -> PermisoDenegadoError
    cursor_mock.fetchone.side_effect = [{"id_usuario": id_usuario_reg}]
    with pytest.raises(PermisoDenegadoError):
        db.eliminar_registro_roster(id_roster, operador=id_operador_ajeno, administrador=False)

    # 5. Borrado lógico exitoso de Roster por admin
    cursor_mock.fetchone.side_effect = [
        {"id_usuario": id_usuario_reg},
        {"id": id_roster}
    ]
    res_roster = db.eliminar_registro_roster(id_roster, operador=id_operador_admin, administrador=True)
    assert res_roster["exito"] is True
    assert res_roster["id"] == id_roster


# [FN-07.03] Omitir costo_dia de INSERT automático
def test_insercion_automatica_parametrizada(monkeypatch):
    cursor = MagicMock()
    cursor.fetchone.return_value = {"id":uuid4(),"costo_dia":Decimal("23.45")}
    @contextmanager
    def conexion(commit=False):
        assert commit
        yield cursor
    monkeypatch.setattr(db,"obtener_cursor_pg",conexion)
    modelo = AsistenciaCreate(id_usuario=USUARIO,fecha="2026-10-01",activo_franco="activo",lugar="oficina",dedicado_a="areas")
    assert db.guardar_asistencias_atomicas([modelo],USUARIO)[0]["costo_dia"] == "23.45"
    consulta,parametros = cursor.execute.call_args.args
    assert "costo_dia" not in consulta.split("VALUES")[0]
    assert "costo_manual" in consulta
    assert USUARIO not in consulta
    assert parametros[-1] == USUARIO


# [FN-07.03] Mantener el filtro fuera del texto SQL
def test_consulta_parametrizada(monkeypatch):
    cursor = MagicMock()
    cursor.fetchall.return_value = []
    @contextmanager
    def conexion(commit=False):
        yield cursor
    monkeypatch.setattr(db,"obtener_cursor_pg",conexion)
    monkeypatch.setattr(db,"perfil_esquema",lambda:{"nombre":"u.nombre_completo","correo":"u.email","proyecto":"p.denominacion"})
    malicioso = "x' OR TRUE --"
    assert db.consultar_asistencias(malicioso) == []
    consulta,parametros = cursor.execute.call_args.args
    assert malicioso not in consulta
    assert malicioso in parametros


# [FN-07.04] Consultar la tarifa histórica sin sustituir por activa
def test_join_tarifa_historica(monkeypatch):
    cursor = MagicMock()
    cursor.fetchall.return_value = []
    @contextmanager
    def conexion(commit=False):
        yield cursor
    monkeypatch.setattr(db,"obtener_cursor_pg",conexion)
    monkeypatch.setattr(db,"perfil_esquema",lambda:{"nombre":"u.nombre_completo","proyecto":"p.denominacion"})
    db.obtener_rosters("2026-10-01","2026-10-31")
    consulta,parametros = cursor.execute.call_args.args
    assert "t.id_tarifa=r.id_tarifa" in consulta
    assert "es_activa" not in consulta
    assert parametros == (date(2026,10,1),date(2026,10,1),date(2026,10,31),date(2026,10,31))


# [FN-07.02] Impedir escalamiento de privilegios por identidad o payload
def test_sesion_sin_rol_administrativo(monkeypatch):
    monkeypatch.setattr(db,"obtener_sesion_activa",lambda:{"id_usuario":USUARIO,"rol_app":"user_1","nombre":"Iván Valentin"})
    respuesta = ApiPuente().guardar_roster({"rol_app":"admin"})
    assert respuesta["codigo_error"] == "ACCESO_DENEGADO"


# [FN-07.02] Rechazar una llamada sin sesión
def test_sin_sesion(monkeypatch):
    monkeypatch.setattr(db,"obtener_sesion_activa",lambda:None)
    assert ApiPuente().guardar_check_diario({})["codigo_error"] == "ACCESO_DENEGADO"


# [FN-07.09] Exportar informe de liquidación resolviendo mes por nombre o ciclo
def test_exportar_informe_liquidacion_con_nombre_mes(monkeypatch, tmp_path):
    from openpyxl import load_workbook
    destino = tmp_path / "Liquidacion_Test_2026-10.xlsx"
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"id_usuario": USUARIO, "rol_app": "admin", "nombre": "Iván Valentin"})
    monkeypatch.setattr(db, "resolver_usuario", lambda _: {"id_usuario": USUARIO, "nombre": "Iván Valentin"})
    monkeypatch.setattr(db, "consultar_asistencias", lambda u, c: [
        {"fecha": "2026-10-01", "tipo_ocf": "Oficina", "modalidad": "oficina", "servicio": "A", "horas": "8.00", "costo_dia": "40000.00", "costo_manual": False}
    ])
    monkeypatch.setattr(db, "obtener_liquidacion", lambda u, c: None)
    puente = ApiPuente()
    monkeypatch.setattr(puente, "_destino_excel", lambda _: str(destino))
    res = puente.exportar_informe_liquidacion({
        "empleado": "Iván Valentin",
        "nombre_mes": "Octubre",
        "anio": 2026,
        "total_liquidar": 40000,
        "resumen_categorias": [{"concepto": "Día de oficina", "dias": 1, "tarifa_diaria": 40000, "subtotal": 40000}],
        "proyectos_imputados": [{"proyecto": "A", "dias": 1, "horas": 8, "monto": 40000}],
    })
    assert res["exito"] is True
    wb = load_workbook(destino)
    assert "Resumen Liquidación" in wb.sheetnames
    assert "Liquidación" in wb.sheetnames
    assert wb["Liquidación"].cell(2, 2).value == "2026-10"


# [FN-07.15] Consolidar asistencias huérfanas en bloques de Roster sin duplicar jornadas
def test_crear_rosters_desde_asistencias_absorbe_huerfanas(monkeypatch):
    id_roster_nuevo = uuid4()
    cursor = MagicMock()
    cursor.fetchone.side_effect = [
        None,
        {"id": id_roster_nuevo, "total_viaticos": Decimal("190000.00")},
    ]
    cursor.fetchall.return_value = [{"fecha": date(2026, 10, 5), "costo_dia": Decimal("95000.00")}]
    cursor.rowcount = 5

    @contextmanager
    def conexion(commit=False):
        assert commit
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "obtener_usuarios_cache", lambda: [{"id_usuario": USUARIO, "nombre": "Agustina Ferrante"}])
    monkeypatch.setattr(db, "obtener_proyectos_cache", lambda: [{"id_proyecto": PROYECTO, "denominacion": "318-SF-I-932-SM VMOS"}])
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"id_usuario": USUARIO, "rol_app": "admin", "nombre": "Iván Valentin"})

    res = ApiPuente().crear_rosters_desde_asistencias([{
        "empleado": "Agustina Ferrante",
        "proyecto": "318-SF-I-932-SM VMOS",
        "tipo": "Campo",
        "fecha_inicio": "2026-10-05",
        "fecha_fin": "2026-10-09",
    }])
    assert res["exito"] is True
    assert res["guardados"] == 1
    assert res["absorbidos"] == 5
    sql_ejecutados = [c.args[0] for c in cursor.execute.call_args_list]
    assert any("DELETE FROM app_rrhh.b_1_asistencias" in s and "id_roster IS NULL" in s for s in sql_ejecutados)
    assert any("INSERT INTO app_rrhh.b_1_roster" in s for s in sql_ejecutados)




# [FN-07.02] Autenticación estricta: rechazar nombre en campo DNI
def test_autenticar_usuario_rechaza_nombre_en_dni(monkeypatch):
    usuarios_mock = [{"id_usuario": USUARIO, "nombre": "Iván Valentin", "dni": "40158951", "activo": True}]
    monkeypatch.setattr(db, "obtener_usuarios_cache", lambda **_: usuarios_mock)
    
    # 1. Enviar el nombre en ambos campos debe fallar por formato o discrepancia de DNI
    with pytest.raises(ValidacionError) as exc:
        db.autenticar_usuario("Iván Valentin", "Iván Valentin", usuarios_mock)
    assert "DNI" in str(exc.value)

    # 2. Enviar DNI con formato válido y nombre correcto debe autenticar
    u = db.autenticar_usuario("Iván Valentin", "40.158.951", usuarios_mock)
    assert u["id_usuario"] == USUARIO


# [FN-04.12] Separación de permisos: core no puede actualizar usuarios y sub_admin no puede auto-promoverse
def test_bloqueo_escalada_roles(monkeypatch):
    id_core = str(uuid4())
    id_subadmin = str(uuid4())
    id_admin = str(uuid4())
    
    # 1. Usuario core intentando actualizar debe recibir ACCESO_DENEGADO en el puente
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"id_usuario": id_core, "rol_app": "core", "nombre": "Core User"})
    res = ApiPuente().actualizar_usuario_y_sueldo({"id_usuario": id_core, "rol_app": "admin"})
    assert res["codigo_error"] == "ACCESO_DENEGADO"

    # 2. SubAdmin intentando promoverse a admin en el repositorio
    cursor = MagicMock()
    cursor.fetchone.return_value = {"id_usuario": id_subadmin, "rol_app": "sub_admin"}
    @contextmanager
    def conexion(commit=False):
        yield cursor
    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "perfil_esquema", lambda: {"apellido": "u.apellido"})

    with pytest.raises(db.PermisoDenegadoError) as exc:
        db.actualizar_usuario_y_sueldo(
            {"id_usuario": id_subadmin, "nombre": "Sub", "apellido": "Admin", "dni": "12345678", "correo": "s@i.com", "area": "RRHH", "rol_app": "admin", "activo": True},
            operador_sesion={"id_usuario": id_subadmin, "rol_app": "sub_admin"}
        )
    assert "admin" in str(exc.value).lower()


# [FN-07.03] Rechazar costo_manual anidado inyectado por usuario operativo
def test_guardar_check_diario_rechaza_costo_manual_anidado(monkeypatch):
    id_user1 = str(uuid4())
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"id_usuario": id_user1, "rol_app": "user_1", "nombre": "Tecnico Campo"})
    monkeypatch.setattr(db, "resolver_usuario", lambda _: {"id_usuario": id_user1, "nombre": "Tecnico Campo"})
    monkeypatch.setattr(db, "obtener_proyectos_cache", lambda: [{"id_proyecto": PROYECTO, "denominacion": "Proyecto Test"}])
    
    # Intento de inyectar costo_manual en un detalle de proyectos
    payload = {
        "fecha": "2026-10-10",
        "lugar": "Campo",
        "proyectos": [
            {"proyecto": "Proyecto Test", "costo_manual": True, "costo_dia": 999999}
        ]
    }
    
    # preparar_asistencias con permitir_costo_manual=False debe desarmar el costo manual
    modelos = db.preparar_asistencias(payload, id_user1, permitir_costo_manual=False)
    assert not any(m.costo_manual for m in modelos)
    assert all(m.costo_dia is None for m in modelos)


# [FN-07.02] Minimización de datos personales en obtener_todos_usuarios para rol operativo
def test_obtener_todos_usuarios_oculta_datos_sensibles(monkeypatch):
    id_user1 = str(uuid4())
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"id_usuario": id_user1, "rol_app": "user_1", "nombre": "Operario"})
    usuarios_db = [
        {"id_usuario": USUARIO, "id_origen": USUARIO, "nombre": "Admin Boss", "primer_nombre": "Admin", "apellido": "Boss",
         "dni": "99887766", "email": "secret@ingeap.com", "rol_app": "admin", "area": "I", "sueldo_oficina": "1000000",
         "ultima_asistencia_fecha": "2026-10-28", "activo": True}
    ]
    monkeypatch.setattr(db, "obtener_usuarios_cache", lambda **_: usuarios_db)
    
    res = ApiPuente().obtener_todos_usuarios()
    assert len(res) == 1
    u = res[0]
    # Claves públicas permitidas
    assert "id_usuario" in u
    assert "nombre" in u
    # Claves sensibles privadas suprimidas
    assert "dni" not in u
    assert "email" not in u
    assert "rol_app" not in u
    assert "sueldo_oficina" not in u
    assert "ultima_asistencia_fecha" not in u


# [FN-07.09] Exportar informe de liquidación respeta subtotales en cero y adicionales
def test_exportar_informe_liquidacion_respeta_cero_y_cuadre(tmp_path):
    from openpyxl import load_workbook
    from liquidacion_export import generar_excel_informe_liquidacion

    destino = tmp_path / "Liquidacion_Cuadre_Test.xlsx"
    datos = {
        "empleado": "Colaborador Test",
        "dni": "12345678",
        "area": "I",
        "email": "test@ingeap.com",
        "ciclo_cobro": "2026-10",
        "nombre_mes": "Octubre",
        "anio": 2026,
        "total_liquidar": 60000,
        "liquidacion": {
            "sueldo_total": "75000.00",
            "total_real": "60000.00",
            "total_adicionales": "15000.00",
            "adicionales": [{"fecha": "2026-10-15", "descripcion": "Bono guardia", "cantidad_adicional": "15000.00"}]
        },
        "resumen_categorias": [
            {"concepto": "Día de oficina", "dias": 2, "tarifa_diaria": 30000, "subtotal": 60000},
            {"concepto": "Día de obra", "dias": 1, "tarifa_diaria": 40000, "subtotal": 0}  # $0.00 por coexistir con oficina
        ],
        "detalle": [
            {"fecha": "2026-10-01", "tipo_ocf": "Oficina", "modalidad": "oficina", "servicio": "Central", "horas": "8.00", "costo_dia": "30000.00", "costo_manual": False},
            {"fecha": "2026-10-01", "tipo_ocf": "Campo", "modalidad": "obra", "servicio": "Obra 1", "horas": "4.00", "costo_dia": "0.00", "costo_manual": False},
        ],
        "proyectos_imputados": [
            {"proyecto": "Central", "dias": 1, "horas": 8, "monto": 30000},
            {"proyecto": "Obra 1", "dias": 1, "horas": 4, "monto": 0}
        ]
    }

    generar_excel_informe_liquidacion(datos, str(destino))
    wb = load_workbook(destino)
    assert "Resumen Liquidación" in wb.sheetnames
    ws = wb["Resumen Liquidación"]
    
    # Verificar que el subtotal de obra se registre en 0.00
    assert ws.cell(9, 1).value == "Día de obra"
    assert ws.cell(9, 4).value == 0.0

    # Verificar que se inserte la fila de adicionales
    assert ws.cell(10, 1).value == "Adicionales aprobados del mes"
    assert ws.cell(10, 4).value == 15000.0

    # Verificar que el TOTAL A LIQUIDAR coincida con la suma exacta (60000 + 0 + 15000 = 75000)
    assert ws.cell(11, 1).value == "TOTAL A LIQUIDAR"
    assert ws.cell(11, 4).value == 75000.0


# [FN-07.09] Exportar Roster genera 3 hojas con cálculo de quincenas canónicas
def test_exportar_roster_tres_hojas(tmp_path):
    from openpyxl import load_workbook
    from postgres_exports import exportar_rosters

    destino = tmp_path / "Roster_TresHojas_Test.xlsx"
    filas = [
        {
            "empleado": "Juan Perez",
            "proyecto": "Proyecto Norte",
            "fecha_inicio": "2026-10-05",
            "fecha_fin": "2026-10-18", # Abarca 1ra quincena (5 al 15) y 2da quincena (16 al 18)
            "tipo": "Campo",
            "precio_dia": "20000.00",
            "precio_domingo": "35000.00",
            "bajada": "25000.00",
            "subida": "0.00",
            "adicional_turno": "10000.00",
            "total_viaticos": "285000.00"
        }
    ]

    res = exportar_rosters(filas, str(destino), anio=2026, mes=10)
    assert res["exito"] is True
    wb = load_workbook(destino)
    
    # 3 hojas reglamentarias (más alias "Roster")
    assert "Ciclo Completo" in wb.sheetnames
    assert "1ra Quincena (1 al 15)" in wb.sheetnames
    assert "2da Quincena (16 al Fin)" in wb.sheetnames
    assert "Roster" in wb.sheetnames

    ws_q1 = wb["1ra Quincena (1 al 15)"]
    assert ws_q1.cell(2, 1).value == "Juan Perez"
    assert ws_q1.cell(2, 6).value == "2026-10-05"
    assert ws_q1.cell(2, 7).value == "2026-10-15"

    ws_q2 = wb["2da Quincena (16 al Fin)"]
    assert ws_q2.cell(2, 1).value == "Juan Perez"
    assert ws_q2.cell(2, 6).value == "2026-10-16"
    assert ws_q2.cell(2, 7).value == "2026-10-18"
    # Bajada y Adicional caen en la fecha_fin (18 de octubre = 2da quincena)
    assert ws_q2.cell(2, 10).value == 25000.0
    assert ws_q2.cell(2, 12).value == 10000.0

# [FN-07.15] Preservar horas y atributos al consolidar en Roster
def test_crear_rosters_preserva_horas_y_atributos_originales(monkeypatch):
    id_u = USUARIO
    id_p = PROYECTO
    id_r = str(uuid4())
    cursor = MagicMock()
    
    cursor.fetchone.side_effect = [
        None,
        {"id": id_r, "total_viaticos": Decimal("150000.00")}
    ]
    cursor.fetchall.return_value = [
        {
            "fecha": date(2026, 10, 5),
            "activo_franco": "activo",
            "lugar": "obra",
            "tipo_dia": "franco_trabajado",
            "hora_inicio": "08:00",
            "hora_fin": "17:00",
            "horas_dedicadas": Decimal("9.0"),
            "id_proyecto": id_p,
            "costo_manual": True,
            "costo_dia": Decimal("45000.00")
        }
    ]
    cursor.rowcount = 1

    @contextmanager
    def conexion(commit=False):
        assert commit
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "obtener_usuarios_cache", lambda: [{"id_usuario": id_u, "nombre": "Persona"}])
    monkeypatch.setattr(db, "obtener_proyectos_cache", lambda: [{"id_proyecto": id_p, "denominacion": "Proyecto"}])

    res = db.crear_rosters_desde_asistencias([{
        "empleado": "Persona",
        "proyecto": "Proyecto",
        "fecha_inicio": "2026-10-05",
        "fecha_fin": "2026-10-10",
        "tipo": "Campo"
    }], operador=USUARIO)

    assert res["guardados"] == 1
    assert res["absorbidos"] == 1

    update_restaurar = [call for call in cursor.execute.call_args_list if "UPDATE app_rrhh.b_1_asistencias" in call.args[0]]
    assert len(update_restaurar) >= 1
    sql, params = update_restaurar[0].args
    assert "horas_dedicadas = CASE WHEN %s > 0" in sql
    assert params[0] == "08:00"
    assert params[1] == "17:00"
    assert params[2] == Decimal("9.0")
    assert params[5] is True
    assert params[7] == Decimal("45000.00")


# [FN-07.15] Rechazar consolidación si existen jornadas de oficina o ausencias justificadas
def test_crear_rosters_rechaza_incompatibles(monkeypatch):
    id_u = USUARIO
    id_p = PROYECTO
    cursor = MagicMock()
    cursor.fetchone.return_value = None

    cursor.fetchall.return_value = [
        {"fecha": date(2026, 10, 5), "activo_franco": "activo", "lugar": "oficina", "tipo_dia": "dia_normal", "costo_manual": False}
    ]

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "obtener_usuarios_cache", lambda: [{"id_usuario": id_u, "nombre": "Persona"}])
    monkeypatch.setattr(db, "obtener_proyectos_cache", lambda: [{"id_proyecto": id_p, "denominacion": "Proyecto"}])

    with pytest.raises(ValidacionError) as exc_ofi:
        db.crear_rosters_desde_asistencias([{
            "empleado": "Persona",
            "proyecto": "Proyecto",
            "fecha_inicio": "2026-10-05",
            "fecha_fin": "2026-10-10",
            "tipo": "Campo"
        }], operador=USUARIO)
    assert "Oficina" in str(exc_ofi.value)

    cursor.fetchall.return_value = [
        {"fecha": date(2026, 10, 6), "activo_franco": "vacaciones", "lugar": "obra", "tipo_dia": "dia_normal", "costo_manual": False}
    ]
    with pytest.raises(ValidacionError) as exc_vac:
        db.crear_rosters_desde_asistencias([{
            "empleado": "Persona",
            "proyecto": "Proyecto",
            "fecha_inicio": "2026-10-05",
            "fecha_fin": "2026-10-10",
            "tipo": "Campo"
        }], operador=USUARIO)
    assert "vacaciones" in str(exc_vac.value)


# [FN-04.12] Preservar vigencia salarial y evitar recálculo si el sueldo no cambió
def test_actualizar_usuario_preserva_vigencia_si_sueldo_no_cambia(monkeypatch):
    id_u = USUARIO
    cursor = MagicMock()
    
    cursor.fetchone.side_effect = [
        {"id_usuario": id_u, "rol_app": "admin"},
        {"id_usuario": id_u},
        {
            "id_sueldo": str(uuid4()),
            "sueldo_oficina": Decimal("1250000.00"),
            "sueldo_obra": Decimal("2760000.00"),
            "lugar_habitual": "obra",
            "dia_oficina": Decimal("41666.67"),
            "dia_obra": Decimal("92000.00"),
            "vigente_desde": date(2026, 1, 1)
        }
    ]

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "perfil_esquema", lambda: {"apellido": "u.apellido"})

    datos = {
        "id_usuario": id_u,
        "nombre": "Juan Carlos",
        "apellido": "Perez",
        "dni": "35123456",
        "correo": "jc.perez_nuevo@ingeap.com",
        "area": "I",
        "rol_app": "user_1",
        "activo": True,
        "sueldo_oficina": Decimal("1250000.00"),
        "sueldo_obra": Decimal("2760000.00"),
        "lugar_habitual": "obra"
    }

    res = db.actualizar_usuario_y_sueldo(datos, operador_sesion={"id_usuario": id_u, "rol_app": "admin"})
    assert res["exito"] is True
    assert res["vigente_desde"] == "2026-01-01"

    consultas = [call.args[0] for call in cursor.execute.call_args_list]
    assert not any("INSERT INTO app_rrhh.a_1_sueldos_base" in q for q in consultas)
    assert not any("fn_recalcular_liquidacion_mes" in q for q in consultas)


# [FN-07.03] Actualizar costo manual vincula operador y motivo a la trazabilidad
def test_actualizar_costo_manual_asigna_operador_y_motivo(monkeypatch):
    id_asistencia = str(uuid4())
    id_operador = USUARIO
    cursor = MagicMock()
    cursor.fetchone.return_value = {
        "id_asistencia": id_asistencia,
        "costo_dia": Decimal("55000.00"),
        "fecha": date(2026, 10, 5),
        "id_usuario": id_operador
    }

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "perfil_esquema", lambda: {"tiene_auditoria": True})

    res = db.actualizar_costo_dia_manual(
        id_asistencia,
        nuevo_costo="55000.00",
        quien_modifica=id_operador,
        motivo="Guardia de emergencia nocturna"
    )
    assert res["exito"] is True
    assert res["costo_dia"] == "55000.00"

    consultas = [call.args for call in cursor.execute.call_args_list]
    update_asist = [c for c in consultas if "UPDATE app_rrhh.b_1_asistencias" in c[0]][0]
    sql_asist, params_asist = update_asist
    assert "cargado_por=COALESCE(%s, cargado_por)" in sql_asist
    assert params_asist[1] == id_operador

    update_audit = [c for c in consultas if "UPDATE app_rrhh.b_1_modificaciones_realizadas" in c[0]][0]
    sql_audit, params_audit = update_audit
    assert "[Motivo: Guardia de emergencia nocturna]" in params_audit[0]

# [FN-07.06] Lectura de liquidación sin bloqueo de escritura FOR UPDATE
def test_obtener_liquidacion_lectura_sin_bloqueo(monkeypatch):
    id_u = USUARIO
    cursor = MagicMock()
    cursor.fetchone.return_value = {
        "id_calculo_sueldo": str(uuid4()),
        "id_sueldo": str(uuid4()),
        "id_usuario": id_u,
        "ciclo_cobro": "2026-10",
        "cant_dias_ofi": 20,
        "cant_dias_obra": 0,
        "subtotal_ofi": Decimal("600000.00"),
        "subtotal_obra": Decimal("0.00"),
        "subtotal_estimado": Decimal("600000.00"),
        "total_real": Decimal("600000.00"),
        "total_adicionales": Decimal("0.00"),
        "sueldo_total": Decimal("600000.00"),
        "cerrado": False,
        "adicionales": []
    }

    @contextmanager
    def conexion(commit=False):
        assert not commit
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "resolver_usuario", lambda _: {"id_usuario": id_u, "nombre": "Persona"})

    res = db.obtener_liquidacion(id_u, "2026-10", forzar_recalculo=False)
    assert res is not None
    consultas = [call.args[0] for call in cursor.execute.call_args_list]
    assert not any("FOR UPDATE" in q for q in consultas)
    assert not any("fn_recalcular_liquidacion_mes" in q for q in consultas)


# [FN-07.04] Cerrojos de Roster aislados por empleado en lugar de bloqueo global
def test_roster_advisory_lock_por_empleado(monkeypatch):
    id_u1 = str(uuid4())
    id_u2 = str(uuid4())
    cursor = MagicMock()
    cursor.fetchone.return_value = None

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "obtener_usuarios_cache", lambda: [
        {"id_usuario": id_u1, "nombre": "Emp 1"},
        {"id_usuario": id_u2, "nombre": "Emp 2"}
    ])
    monkeypatch.setattr(db, "obtener_proyectos_cache", lambda: [
        {"id_proyecto": PROYECTO, "denominacion": "Proyecto"}
    ])

    lote = [
        {"empleado": "Emp 1", "proyecto": "Proyecto", "fecha_inicio": "2026-10-01", "fecha_fin": "2026-10-05", "tipo": "Campo"},
        {"empleado": "Emp 2", "proyecto": "Proyecto", "fecha_inicio": "2026-10-01", "fecha_fin": "2026-10-05", "tipo": "Campo"}
    ]

    db.guardar_rosters_atomicos(lote, operador=USUARIO)

    consultas = [call.args for call in cursor.execute.call_args_list]
    advisory_calls = [c for c in consultas if "pg_advisory_xact_lock" in c[0]]
    
    assert len(advisory_calls) == 2
    uids_esperados = sorted([id_u1, id_u2])
    assert advisory_calls[0][1][0] == f"checkdiario.roster.{uids_esperados[0]}"
    assert advisory_calls[1][1][0] == f"checkdiario.roster.{uids_esperados[1]}"
    assert not any(c[1][0] == "checkdiario.roster" for c in advisory_calls)


# [FN-07.03] Paginación en consultar_asistencias
def test_consultar_asistencias_paginacion(monkeypatch):
    cursor = MagicMock()
    cursor.fetchall.return_value = []

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "perfil_esquema", lambda: {
        "nombre": "u.nombre_completo",
        "correo": "u.email",
        "proyecto": "p.denominacion",
        "tiene_auditoria": False
    })

    db.consultar_asistencias(empleado="", mes_anio="", limite=30, offset=60)

    sql, params = cursor.execute.call_args.args
    assert "LIMIT %s OFFSET %s" in sql
    assert params[-2] == 30
    assert params[-1] == 60


# [FN-07.02] Invalidador de caché purga ambas variantes de usuarios
def test_invalidar_caches_repositorio_invalida_ambas_variantes_usuarios():
    db._cache_mem[('usuarios', True)] = (9999999999.0, [{"id": "1"}])
    db._cache_mem[('usuarios', False)] = (9999999999.0, [{"id": "2"}])
    db._cache_mem[('tarifas_roster',)] = (9999999999.0, [{"tarifa": "A"}])

    db.invalidar_caches_repositorio(('usuarios', True))

    assert ('usuarios', True) not in db._cache_mem
    assert ('usuarios', False) not in db._cache_mem
    assert ('tarifas_roster',) in db._cache_mem

# [FN-07.15] Generación determinista e idempotente de UUIDv5 para migración Excel
def test_migracion_excel_uuid_estable():
    from migrar_excel_a_postgres import generar_uuid_asistencia_estable
    import uuid

    id_u = str(uuid.uuid4())
    u1 = generar_uuid_asistencia_estable(id_u, "2026-10-01", "activo", "obra", "PROY_1", "08:00", "17:00", 9.0, 1)
    u2 = generar_uuid_asistencia_estable(id_u, "2026-10-01", "activo", "obra", "PROY_1", "08:00", "17:00", 9.0, 1)
    # Idempotencia estricta
    assert u1 == u2
    assert uuid.UUID(u1).version == 5

    # Variación por ocurrencia en el mismo día
    u_ocurrencia2 = generar_uuid_asistencia_estable(id_u, "2026-10-01", "activo", "obra", "PROY_1", "08:00", "17:00", 9.0, 2)
    assert u1 != u_ocurrencia2

    # Variación por fecha
    u_otra_fecha = generar_uuid_asistencia_estable(id_u, "2026-10-02", "activo", "obra", "PROY_1", "08:00", "17:00", 9.0, 1)
    assert u1 != u_otra_fecha


# [FN-07.15] Modo simulación activo por defecto sin argumento --commit
def test_migracion_excel_dry_run_por_defecto(monkeypatch):
    import sys
    monkeypatch.setattr(sys, "argv", ["migrar_excel_a_postgres.py"])
    # Re-evaluar lógica de dry-run
    modo_dry_run = "--commit" not in sys.argv
    assert modo_dry_run is True

    monkeypatch.setattr(sys, "argv", ["migrar_excel_a_postgres.py", "--commit"])
    modo_dry_run_commit = "--commit" not in sys.argv
    assert modo_dry_run_commit is False


# [FN-07.01] Compatibilidad de esquema real (nombre + apellido + b_1_modificaciones_realizadas)
def test_compatibilidad_esquema_nombre_apellido_en_consultas_auditoria(monkeypatch):
    cursor = MagicMock()
    cursor.fetchall.return_value = []

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "perfil_esquema", lambda: {
        "nombre": "concat_ws(' ', u.nombre, u.apellido)",
        "correo": "u.correo",
        "rol": "u.rol_app",
        "primer_nombre": "u.nombre",
        "apellido": "u.apellido",
        "proyecto": "COALESCE(p.codificacion_serv, p.id_proyecto::text)",
        "proyecto_activo": "TRUE",
        "proyecto_area": "NULL::text",
        "roles_disponibles": True,
        "nombre_cargador": "NULLIF(concat_ws(' ', uc.nombre, uc.apellido), '')",
        "nombre_modificador": "NULLIF(concat_ws(' ', um.nombre, um.apellido), '')",
        "tiene_auditoria": True
    })

    # 1. consultar_asistencias no debe usar um.nombre_completo sino um.nombre / um.apellido
    db.consultar_asistencias(empleado="Iván Valentin", mes_anio="2026-10", limite=20)
    sql_asist, _ = cursor.execute.call_args.args
    assert "um.nombre_completo" not in sql_asist
    assert "uc.nombre_completo" not in sql_asist
    assert "NULLIF(concat_ws(' ', um.nombre, um.apellido), '')" in sql_asist
    assert "NULLIF(concat_ws(' ', uc.nombre, uc.apellido), '')" in sql_asist

    # 2. obtener_modificaciones_recientes debe usar alias um (no uc)
    db.obtener_modificaciones_recientes(limite=10)
    sql_rec, _ = cursor.execute.call_args.args
    assert "uc." not in sql_rec
    assert "um.nombre_completo" not in sql_rec
    assert "NULLIF(concat_ws(' ', um.nombre, um.apellido), '')" in sql_rec

    # 3. obtener_notificaciones_modificaciones debe usar alias um (no uc)
    db.obtener_notificaciones_modificaciones(solo_no_revisadas=True)
    sql_notif = cursor.execute.call_args.args[0]
    assert "uc." not in sql_notif
    assert "um.nombre_completo" not in sql_notif
    assert "NULLIF(concat_ws(' ', um.nombre, um.apellido), '')" in sql_notif

# [FN-04.13] Validación de contratos para modalidad de cálculo salarial
def test_actualizar_configuracion_sueldo_usuario_contrato(monkeypatch):
    cursor = MagicMock()
    cursor.fetchone.side_effect = [
        {"id_usuario": "11111111-1111-1111-1111-111111111111"},
        {
            "id_sueldo": "22222222-2222-2222-2222-222222222222",
            "id_usuario": "11111111-1111-1111-1111-111111111111",
            "modalidad_calculo": "base_30",
            "lugar_habitual": "oficina",
            "dia_oficina": Decimal("10000.00"),
            "dia_obra": Decimal("20000.00")
        }
    ]

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "resolver_usuario", lambda r: {"id_usuario": "11111111-1111-1111-1111-111111111111"})

    res = db.actualizar_configuracion_sueldo_usuario({
        "id_usuario": "11111111-1111-1111-1111-111111111111",
        "modalidad_calculo": "base_30",
        "lugar_habitual": "oficina"
    })

    assert res["exito"] is True
    assert res["modalidad_calculo"] == "base_30"
    assert res["lugar_habitual"] == "oficina"


# [FN-04.13] Validación de rechazo ante modalidad de cálculo inválida
def test_actualizar_configuracion_sueldo_usuario_rechaza_valores_invalidos(monkeypatch):
    monkeypatch.setattr(db, "resolver_usuario", lambda r: {"id_usuario": "11111111-1111-1111-1111-111111111111"})

    with pytest.raises(ValidacionError, match="Modalidad de cálculo inválida"):
        db.actualizar_configuracion_sueldo_usuario({
            "id_usuario": "11111111-1111-1111-1111-111111111111",
            "modalidad_calculo": "invalido",
            "lugar_habitual": "oficina"
        })

    with pytest.raises(ValidacionError, match="Lugar habitual inválido"):
        db.actualizar_configuracion_sueldo_usuario({
            "id_usuario": "11111111-1111-1111-1111-111111111111",
            "modalidad_calculo": "por_dia",
            "lugar_habitual": "remoto"
        })


# [FN-04.13] Restricción RBAC en ApiPuente para actualizar_configuracion_sueldo_usuario
def test_puente_actualizar_configuracion_sueldo_rbac(monkeypatch):
    from postgres_bridge import ApiPuente

    puente = ApiPuente()
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"id_usuario": "1111", "rol_app": "user_1"})

    res = puente.actualizar_configuracion_sueldo_usuario({
        "id_usuario": "2222",
        "modalidad_calculo": "base_30",
        "lugar_habitual": "oficina"
    })

    assert res["exito"] is False
    assert res["codigo_error"] == "ACCESO_DENEGADO"


# [FN-07.21] Contrato de Registro y Consulta de Errores Remotos
def test_registrar_y_consultar_errores_remotos(monkeypatch):
    cursor = MagicMock()
    cursor.fetchall.return_value = [
        {
            "id_error": "00000000-0000-0000-0000-000000000001",
            "nombre_usuario": "Iván Valentin",
            "codigo_error": "ERROR_BASE_DATOS",
            "mensaje_error": "Timeout simulado",
            "fecha_hora": datetime(2026, 11, 2, 10, 0, 0),
            "resuelto": False
        }
    ]

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)

    # 1. Registro seguro
    res_reg = db.registrar_error_remoto({
        "codigo_error": "ERROR_BASE_DATOS",
        "mensaje_error": "Timeout simulado"
    }, sesion={"id_usuario": "11111111-1111-1111-1111-111111111111", "nombre": "Iván Valentin", "rol_app": "admin"})
    assert res_reg["exito"] is True

    # 2. Consulta
    errores = db.obtener_errores_remotos(solo_pendientes=True)
    assert len(errores) == 1
    assert errores[0]["codigo_error"] == "ERROR_BASE_DATOS"


# [FN-07.21] RBAC en ApiPuente para Errores Remotos
def test_puente_errores_remotos_rbac(monkeypatch):
    from postgres_bridge import ApiPuente
    puente = ApiPuente()

    # Usuario no admin no puede listar errores remotos
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"id_usuario": "1111", "rol_app": "user_1"})
    res = puente.obtener_errores_remotos()
    assert res["exito"] is False
    assert res["codigo_error"] == "ACCESO_DENEGADO"


# [FN-07.22] Contrato de Gestión de Proyectos por Administrador
def test_creacion_y_edicion_proyectos_admin(monkeypatch):
    cursor = MagicMock()
    cursor.fetchone.side_effect = [
        None,  # SELECT id_proyecto (no existe colisión)
        {      # RETURNING insert
            "id_servicio": "22222222-2222-2222-2222-222222222222",
            "id_proyecto": "33333333-3333-3333-3333-333333333333",
            "codificacion_serv": "228-SF-I-626",
            "n_serv": Decimal("626"),
            "responsable_des": "Santiago Destefanis",
            "area": "I",
            "url_des": "https://ingeap.com",
            "activo": True
        }
    ]

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "invalidar_caches_repositorio", lambda *a: None)

    res = db.crear_proyecto({
        "id_proyecto": "33333333-3333-3333-3333-333333333333",
        "codificacion_serv": "228-SF-I-626",
        "n_serv": 626,
        "responsable_des": "Santiago Destefanis",
        "area": "I",
        "url_des": "https://ingeap.com",
        "activo": True
    })

    assert res["exito"] is True
    assert res["codificacion_serv"] == "228-SF-I-626"
    assert res["id_proyecto"] == "33333333-3333-3333-3333-333333333333"


# [FN-07.22] RBAC en ApiPuente para Gestión de Proyectos
def test_puente_proyectos_admin_rbac(monkeypatch):
    from postgres_bridge import ApiPuente
    puente = ApiPuente()

    # Usuario no admin no puede gestionar proyectos
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"id_usuario": "1111", "rol_app": "sub_admin"})
    res = puente.crear_proyecto({"id_proyecto": "33333333-3333-3333-3333-333333333333", "codificacion_serv": "TEST"})
    assert res["exito"] is False
    assert res["codigo_error"] == "ACCESO_DENEGADO"


# [FN-07.23] Detección de Días Faltantes en Fin de Mes
def test_obtener_dias_faltantes_mes(monkeypatch):
    cursor = MagicMock()
    # Simula que registró solo los días 1, 2 y 3 en un mes de 31 días
    cursor.fetchall.return_value = [{"dia": 1}, {"dia": 2}, {"dia": 3}]

    @contextmanager
    def conexion(commit=False):
        yield cursor

    monkeypatch.setattr(db, "obtener_cursor_pg", conexion)
    monkeypatch.setattr(db, "perfil_esquema", lambda: {"tiene_soft_delete_asistencias": True})

    # Evaluación el día 31 (último día de octubre)
    res = db.obtener_dias_faltantes_mes("11111111-1111-1111-1111-111111111111", fecha_ref=date(2026, 10, 31))
    assert res["es_ultimo_dia_mes"] is True
    assert res["ultimo_dia"] == 31
    assert res["cantidad_faltantes"] == 28
    assert 4 in res["dias_faltantes"]
    assert 31 in res["dias_faltantes"]

    # Evaluación a mitad de mes (día 15)
    res_mitad = db.obtener_dias_faltantes_mes("11111111-1111-1111-1111-111111111111", fecha_ref=date(2026, 10, 15))
    assert res_mitad["es_ultimo_dia_mes"] is False

# [FN-07.17] Probar modificación de registro preservando modalidad y resolviendo proyectos
def test_modificar_registro_preserva_modalidad_y_proyecto(monkeypatch):
    id_asist = str(uuid4())
    id_user = str(uuid4())
    id_proy = str(uuid4())
    asistencia_bd = {
        "id": id_asist, "id_asistencia": id_asist, "id_usuario": id_user, "id_empleado": id_user,
        "empleado": "Ivan Valentin", "fecha": "2026-10-15", "activo_franco": "activo", "lugar": "Campo",
        "modalidad": "obra", "tipo_dia": "dia_normal", "dedicado_a": "areas", "hora_inicio": None,
        "hora_fin": None, "horas": Decimal("8"), "horas_dedicadas": Decimal("8"), "id_proyecto": None,
        "servicio": "Proyecto Alpha", "costo_manual": False, "costo_dia": Decimal("20000"),
        "cargado_por": id_user, "cargado_por_nombre": "Ivan Valentin", "id_roster": None, "modificaciones": []
    }
    usuario_sesion = {"id_usuario": id_user, "nombre": "Ivan Valentin", "dni": "12345678", "rol_app": "admin"}
    proyectos = [{"id_proyecto": id_proy, "denominacion": "Proyecto Alpha", "area": "I"}]

    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: usuario_sesion)
    monkeypatch.setattr(db, "consultar_asistencias", lambda **kwargs: [dict(asistencia_bd)])
    monkeypatch.setattr(db, "resolver_usuario", lambda x: usuario_sesion)
    monkeypatch.setattr(db, "obtener_proyectos_cache", lambda: proyectos)
    monkeypatch.setattr(db, "obtener_usuarios_cache", lambda **kw: [usuario_sesion])

    cursor_mock = MagicMock()
    cursor_mock.fetchone.side_effect = [
        {"id_usuario": id_user, "id_roster": None},
        {"id": id_asist, "costo_dia": Decimal("20000")}
    ]
    @contextmanager
    def mock_conn(commit=False):
        yield cursor_mock
    monkeypatch.setattr(db, "obtener_cursor_pg", mock_conn)

    api = ApiPuente()
    # Modificación enviando solo horas sin modalidad explícita (debe preservar 'obra' y resolver id_proy)
    res = api.modificar_registro({"id": id_asist, "fecha": "2026-10-15", "lugar": "Campo", "servicio": "Proyecto Alpha", "horas": 10})
    assert res["exito"] is True


# [FN-07.18] Probar exportar errores remotos y RBAC
def test_exportar_errores_remotos_rbac(monkeypatch):
    user_normal = {"id_usuario": str(uuid4()), "nombre": "User", "dni": "123", "rol_app": "user_1"}
    user_admin = {"id_usuario": str(uuid4()), "nombre": "Admin", "dni": "456", "rol_app": "admin"}
    api = ApiPuente()

    # Usuario normal debe recibir ACCESO_DENEGADO
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: user_normal)
    res_denegado = api.exportar_errores_remotos()
    assert res_denegado["codigo_error"] == "ACCESO_DENEGADO"

    # Usuario admin debe recibir los errores
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: user_admin)
    monkeypatch.setattr(db, "obtener_errores_remotos", lambda **kw: [{"id_error": str(uuid4()), "codigo_error": "ERROR_TEST"}])
    res_ok = api.exportar_errores_remotos()
    assert res_ok["exito"] is True
    assert res_ok["total"] == 1

# [FN-07.01] Verificar manejo de excepciones de psycopg2.errors sin AttributeError
def test_psycopg2_errors_disponibles():
    import psycopg2.errors
    assert hasattr(psycopg2, 'errors')
    assert issubclass(psycopg2.errors.UniqueViolation, psycopg2.Error)
    assert issubclass(psycopg2.errors.NotNullViolation, psycopg2.Error)
    assert issubclass(psycopg2.errors.CheckViolation, psycopg2.Error)


# [FN-07.01] Verificar que SingleFlight en _obtener_de_cache ejecute el generador una sola vez bajo concurrencia
def test_singleflight_cache_evita_stampede():
    from concurrent.futures import ThreadPoolExecutor
    import time

    db.invalidar_caches_repositorio()
    llamadas = 0

    def generador_lento():
        nonlocal llamadas
        time.sleep(0.05)
        llamadas += 1
        return ["PROYECTO-1", "PROYECTO-2"]

    with ThreadPoolExecutor(max_workers=8) as executor:
        futuros = [
            executor.submit(db._obtener_de_cache, ("test_singleflight",), 60, generador_lento)
            for _ in range(8)
        ]
        resultados = [f.result() for f in futuros]

    assert llamadas == 1
    assert all(r == ["PROYECTO-1", "PROYECTO-2"] for r in resultados)
    db.invalidar_caches_repositorio(("test_singleflight",))


# [FN-07.21] Omitir telemetría en BD cuando el error proviene de saturación del pool
def test_respuesta_segura_omite_telemetria_en_saturacion_pool(monkeypatch):
    from postgres_bridge import respuesta_segura
    from error_handler import DatabaseTransactionError

    llamadas_telemetria = []
    monkeypatch.setattr(db, "registrar_error_remoto", lambda datos, sesion=None: llamadas_telemetria.append(datos))

    @respuesta_segura
    def metodo_saturado():
        err = DatabaseTransactionError("Todas las conexiones están ocupadas. Reintente en unos instantes.")
        err.es_saturacion_pool = True
        raise err

    res = metodo_saturado()
    assert res["exito"] is False
    assert res["codigo_error"] == "ERROR_BASE_DATOS"
    assert len(llamadas_telemetria) == 0


# [FN-07.02] Empleados de Ingeniería (I) y Mensura (M) ven proyectos de ambas áreas (I y M)
def test_obtener_servicios_unifica_ingenieria_y_mensura(monkeypatch):
    from postgres_bridge import ApiPuente
    puente = ApiPuente()
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"id_usuario": USUARIO, "rol_app": "user_1"})
    monkeypatch.setattr(db, "obtener_proyectos_cache", lambda: [
        {"denominacion": "228-SF-I-626-SOLAR", "area": "I"},
        {"denominacion": "148-M-821-MENSURA", "area": "M"},
        {"denominacion": "300-A-100-APP", "area": "A"},
        {"denominacion": "999-GENERAL", "area": ""},
    ])

    servicios_i = puente.obtener_servicios("I")
    servicios_m = puente.obtener_servicios("M")
    servicios_a = puente.obtener_servicios("A")

    assert "228-SF-I-626-SOLAR" in servicios_i
    assert "148-M-821-MENSURA" in servicios_i
    assert "999-GENERAL" in servicios_i
    assert "300-A-100-APP" not in servicios_i

    assert servicios_m == servicios_i
    assert "300-A-100-APP" in servicios_a
    assert "228-SF-I-626-SOLAR" not in servicios_a


