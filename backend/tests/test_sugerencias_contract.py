# [FN-06.10] Contrato de envío y gestión de sugerencias en el puente
from unittest.mock import Mock

import pytest

import postgres_bridge
import postgres_repository as db
from error_handler import AppBaseException, DatabaseTransactionError
from postgres_bridge import ApiPuente


ID_SUGERENCIA = "60000000-0000-4000-8000-000000000001"
NUEVA = {"descripcion_sugerencia": "Actualizar la aplicación.", "tipo_sugerencia": "Aplicaciones"}
CAMBIO = {
    "id_participacion": ID_SUGERENCIA,
    "estado_revision": "vista",
    "nivel_urgencia": "con tiempo",
    "respuesta": None,
    "original": {"estado_revision": "nueva", "nivel_urgencia": "con tiempo", "respuesta": None},
}


@pytest.mark.parametrize("rol", ["user_1", "user_2", "core", "sub_admin", "admin"])
def test_usuario_autenticado_puede_enviar(monkeypatch, rol):
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"rol_app": rol})
    recibo = {"id_participacion": ID_SUGERENCIA}
    crear = Mock(return_value=recibo)
    monkeypatch.setattr(db, "crear_sugerencia", crear)

    assert ApiPuente().crear_sugerencia(NUEVA) == {
        "exito": True, "datos": recibo, "error": None, "codigo_error": None,
    }
    crear.assert_called_once_with(NUEVA)


@pytest.mark.parametrize("rol", ["core", "sub_admin", "admin"])
def test_roles_gestores_pueden_leer_y_actualizar(monkeypatch, rol):
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"rol_app": rol})
    pagina = {"sugerencias": [], "total": 0, "contadores": {}}
    leer = Mock(return_value=pagina)
    guardar = Mock(return_value={"id_participacion": ID_SUGERENCIA})
    monkeypatch.setattr(db, "obtener_sugerencias", leer)
    monkeypatch.setattr(db, "actualizar_sugerencia", guardar)

    puente = ApiPuente()
    filtros = {"pagina": 2, "estado_revision": "vista"}
    assert puente.obtener_sugerencias(filtros) == {
        "exito": True, "datos": pagina, "error": None, "codigo_error": None,
    }
    assert puente.actualizar_sugerencia(CAMBIO) == {
        "exito": True, "datos": {"id_participacion": ID_SUGERENCIA}, "error": None, "codigo_error": None,
    }
    leer.assert_called_once_with(filtros)
    guardar.assert_called_once_with(CAMBIO)


@pytest.mark.parametrize("rol", [None, "user_1", "user_2", "desconocido"])
def test_gestion_denegada_antes_de_acceder_al_repositorio(monkeypatch, rol):
    sesion = {"rol_app": rol} if rol else None
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: sesion)
    repositorio = Mock(side_effect=AssertionError("El repositorio no debe invocarse."))
    monkeypatch.setattr(db, "obtener_sugerencias", repositorio)
    monkeypatch.setattr(db, "actualizar_sugerencia", repositorio)
    monkeypatch.setattr(db, "crear_sugerencia", repositorio)

    puente = ApiPuente()
    respuestas = [puente.obtener_sugerencias(), puente.actualizar_sugerencia(CAMBIO)]
    if sesion is None:
        respuestas.append(puente.crear_sugerencia(NUEVA))
    for respuesta in respuestas:
        assert respuesta["exito"] is False
        assert respuesta["datos"] is None
        assert respuesta["codigo_error"] == "ACCESO_DENEGADO"
        assert respuesta["error"]
    repositorio.assert_not_called()


@pytest.mark.parametrize(("metodo", "datos"), [
    ("crear_sugerencia", {"descripcion_sugerencia": " \t\n "}),
    ("crear_sugerencia", {**NUEVA, "nombre": "a" * 151}),
    ("crear_sugerencia", {**NUEVA, "descripcion_sugerencia": "a" * 1001}),
    ("crear_sugerencia", {**NUEVA, "tipo_sugerencia": "Tipo inventado"}),
    ("crear_sugerencia", {**NUEVA, "estado_revision": "resuelta"}),
    ("crear_sugerencia", {**NUEVA, "descripcion_sugerencia": "Texto\x00inválido"}),
    ("obtener_sugerencias", {"limite": 101}),
    ("obtener_sugerencias", {"pagina": 0}),
    ("obtener_sugerencias", {"pagina": True}),
    ("actualizar_sugerencia", {**CAMBIO, "fecha_hora_resolucion": "2026-01-01"}),
    ("actualizar_sugerencia", {**CAMBIO, "nivel_urgencia": "alta"}),
])
def test_validar_entrada_antes_de_acceder_a_postgresql(monkeypatch, metodo, datos):
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"rol_app": "core"})
    cursor = Mock(side_effect=AssertionError("La entrada inválida no debe llegar a PostgreSQL."))
    monkeypatch.setattr(db, "obtener_cursor_pg", cursor)

    resultado = getattr(ApiPuente(), metodo)(datos)

    assert resultado["exito"] is False
    assert resultado["codigo_error"] == "VALIDACION_ERROR"
    assert resultado["datos"] is None
    cursor.assert_not_called()


def test_conflicto_respetado_sin_telemetria_remota(monkeypatch):
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"rol_app": "admin"})
    guardar = Mock(side_effect=AppBaseException("La sugerencia cambió.", codigo_error="ERROR_CONCURRENCIA"))
    telemetria = Mock()
    monkeypatch.setattr(db, "actualizar_sugerencia", guardar)
    monkeypatch.setattr(db, "registrar_error_remoto", telemetria)

    resultado = ApiPuente().actualizar_sugerencia(CAMBIO)

    assert resultado == {
        "exito": False, "datos": None, "error": "La sugerencia cambió.", "codigo_error": "ERROR_CONCURRENCIA",
    }
    guardar.assert_called_once_with(CAMBIO)
    telemetria.assert_not_called()


def test_lectura_reintenta_y_escritura_no_reintenta(monkeypatch):
    monkeypatch.setattr(db, "obtener_sesion_activa", lambda: {"rol_app": "admin"})
    monkeypatch.setattr(postgres_bridge.time, "sleep", Mock())
    conexion = DatabaseTransactionError("No se pudo conectar a PostgreSQL.")
    conexion.es_fallo_conexion = True
    leer = Mock(side_effect=[conexion, {"sugerencias": [], "total": 0, "contadores": {}}])
    crear = Mock(side_effect=conexion)
    monkeypatch.setattr(db, "obtener_sugerencias", leer)
    monkeypatch.setattr(db, "crear_sugerencia", crear)

    puente = ApiPuente()
    assert puente.obtener_sugerencias()["exito"] is True
    assert puente.crear_sugerencia(NUEVA)["codigo_error"] == "ERROR_BASE_DATOS"
    assert leer.call_count == 2
    crear.assert_called_once_with(NUEVA)
