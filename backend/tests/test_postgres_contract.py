# [MOD-07] Contratos de tipos, SQL y autorizaciones
from contextlib import contextmanager
from datetime import date
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


# [FN-07.05] No ejecutar SQL al eliminar
def test_borrados_bloqueados(monkeypatch):
    ejecutar = MagicMock(side_effect=AssertionError("No debe abrir conexión"))
    monkeypatch.setattr(db,"obtener_cursor_pg",ejecutar)
    assert db.eliminar_registro_roster("id")["codigo_error"] == "BORRADO_LOGICO_PENDIENTE"
    assert not db.eliminar_registro_asistencia("id")["exito"]
    ejecutar.assert_not_called()


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
