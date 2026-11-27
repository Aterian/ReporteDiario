# [FN-00.13] Pruebas unitarias de canales de actualización por rol y crossgrade de edición
import json
from unittest.mock import MagicMock, Mock

import pytest

import app_version
import update_channels as uc


def _release(tag, assets, *, draft=False, prerelease=False, body="Notas"):
    return {
        "tag_name": tag,
        "draft": draft,
        "prerelease": prerelease,
        "body": body,
        "assets": [
            {"name": nombre, "browser_download_url": f"https://github.com/Aterian/ReporteDiario/releases/download/{tag}/{nombre}"}
            for nombre in assets
        ],
    }


def test_extraer_info_tag_distingue_general_y_gestion():
    assert uc.extraer_info_tag("v2.18.0") == ("2.18.0", False)
    assert uc.extraer_info_tag("gestion-v2.18.1") == ("2.18.1", True)
    assert uc.extraer_info_tag("v2.18.2-gestion") == ("2.18.2", True)
    assert uc.extraer_info_tag("invalido") == ("", False)


@pytest.mark.parametrize("rol", ["user_1", "user_2"])
def test_usuarios_operativos_ignoran_releases_de_gestion(rol):
    releases = [
        _release("gestion-v2.18.2", [uc.ASSET_GESTION]),
        _release("gestion-v2.18.1", [uc.ASSET_GESTION]),
        _release("v2.18.0", [uc.ASSET_OPERATIVA, uc.ASSET_GESTION]),
    ]
    res = uc.seleccionar_actualizacion_para_contexto(
        releases,
        rol_usuario=rol,
        edicion_instalada="operativa",
        version_instalada="2.18.0",
    )
    assert res["actualizacion_disponible"] is False
    assert res["cambio_edicion"] is False
    assert res["edicion_objetivo"] == "operativa"

    releases.append(_release("v2.19.0", [uc.ASSET_OPERATIVA, uc.ASSET_GESTION]))
    res_general = uc.seleccionar_actualizacion_para_contexto(
        releases,
        rol_usuario=rol,
        edicion_instalada="operativa",
        version_instalada="2.18.0",
    )
    assert res_general["actualizacion_disponible"] is True
    assert res_general["version_nueva"] == "2.19.0"
    assert res_general["url_descarga"].endswith(f"/v2.19.0/{uc.ASSET_OPERATIVA}")


def test_usuario_operativo_heredado_en_gestion_ignora_gestion_y_migra_en_general():
    releases = [
        _release("gestion-v2.18.5", [uc.ASSET_GESTION]),
        _release("v2.19.0", [uc.ASSET_OPERATIVA, uc.ASSET_GESTION]),
    ]
    res = uc.seleccionar_actualizacion_para_contexto(
        releases,
        rol_usuario="user_1",
        edicion_instalada="gestion",
        version_instalada="2.18.0",
    )
    assert res["actualizacion_disponible"] is True
    assert res["cambio_edicion"] is True
    assert res["edicion_objetivo"] == "operativa"
    assert res["version_nueva"] == "2.19.0"
    assert res["url_descarga"].endswith(f"/v2.19.0/{uc.ASSET_OPERATIVA}")


@pytest.mark.parametrize("rol", ["core", "sub_admin", "admin"])
def test_usuarios_gestion_toman_mayor_semver_entre_gestion_y_general(rol):
    releases = [
        _release("v2.18.0", [uc.ASSET_OPERATIVA, uc.ASSET_GESTION]),
        _release("gestion-v2.18.2", [uc.ASSET_GESTION]),
        _release("v2.19.0", [uc.ASSET_OPERATIVA]),  # sin asset de gestión: no debe ofrecer operativa
    ]
    res = uc.seleccionar_actualizacion_para_contexto(
        releases,
        rol_usuario=rol,
        edicion_instalada="gestion",
        version_instalada="2.18.0",
    )
    assert res["actualizacion_disponible"] is True
    assert res["cambio_edicion"] is False
    assert res["version_nueva"] == "2.18.2"
    assert res["url_descarga"].endswith(f"/gestion-v2.18.2/{uc.ASSET_GESTION}")


@pytest.mark.parametrize("rol", ["core", "sub_admin", "admin"])
def test_crossgrade_automatico_si_rol_gestion_abre_en_edicion_operativa(rol):
    releases = [
        _release("v2.18.0", [uc.ASSET_OPERATIVA, uc.ASSET_GESTION]),
    ]
    res = uc.seleccionar_actualizacion_para_contexto(
        releases,
        rol_usuario=rol,
        edicion_instalada="operativa",
        version_instalada="2.18.0",
    )
    assert res["actualizacion_disponible"] is True
    assert res["cambio_edicion"] is True
    assert res["edicion_actual"] == "operativa"
    assert res["edicion_objetivo"] == "gestion"
    assert res["version_nueva"] == "2.18.0"
    assert res["url_descarga"].endswith(f"/v2.18.0/{uc.ASSET_GESTION}")


def test_sin_sesion_respeta_edicion_local_y_descarta_drafts_o_prereleases():
    releases = [
        _release("v2.20.0", [uc.ASSET_OPERATIVA], draft=True),
        _release("v2.19.1", [uc.ASSET_OPERATIVA], prerelease=True),
        _release("gestion-v2.18.3", [uc.ASSET_GESTION]),
    ]
    res_op = uc.seleccionar_actualizacion_para_contexto(
        releases,
        rol_usuario=None,
        edicion_instalada="operativa",
        version_instalada="2.18.0",
    )
    assert res_op["actualizacion_disponible"] is False
    assert res_op["edicion_objetivo"] == "operativa"


def test_consultar_actualizacion_github_usa_cache_por_rol_y_edicion(monkeypatch):
    uc.limpiar_cache_actualizaciones()
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("GITHUB_REPO", "Aterian/ReporteDiario")
    monkeypatch.setattr(app_version, "APP_EDITION", "operativa")
    monkeypatch.setattr(uc, "APP_EDITION", "operativa")
    monkeypatch.setattr(uc, "APP_VERSION", "2.18.0")

    respuesta = MagicMock()
    respuesta.__enter__.return_value.read.return_value = json.dumps([
        _release("gestion-v2.18.1", [uc.ASSET_GESTION]),
        _release("v2.18.0", [uc.ASSET_OPERATIVA, uc.ASSET_GESTION]),
    ]).encode("utf-8")
    urlopen_mock = Mock(return_value=respuesta)
    monkeypatch.setattr(uc.urllib.request, "urlopen", urlopen_mock)

    res_u1 = uc.consultar_actualizacion_github(rol_usuario="user_1")
    res_u1_rep = uc.consultar_actualizacion_github(rol_usuario="user_1")
    assert res_u1["actualizacion_disponible"] is False
    assert res_u1_rep["actualizacion_disponible"] is False
    assert urlopen_mock.call_count == 1

    res_admin = uc.consultar_actualizacion_github(rol_usuario="admin")
    assert res_admin["actualizacion_disponible"] is True
    assert res_admin["cambio_edicion"] is True
    assert res_admin["version_nueva"] == "2.18.1"
    assert urlopen_mock.call_count == 2


def test_consultar_actualizacion_proxy_omite_si_no_hay_sesion(monkeypatch):
    uc.limpiar_cache_actualizaciones()
    monkeypatch.setenv("UPDATE_SERVICE_URL", "https://updates.ingeap.up.railway.app")
    monkeypatch.setattr(uc, "leer_contexto_sesion_actual", lambda: (None, None))
    urlopen_mock = Mock()
    monkeypatch.setattr(uc.urllib.request, "urlopen", urlopen_mock)

    res = uc.consultar_actualizacion_github(edicion_instalada="operativa", version_instalada="2.18.1")
    assert res["actualizacion_disponible"] is False
    assert res["verificacion_exitosa"] is True
    assert urlopen_mock.call_count == 0


def test_consultar_actualizacion_proxy_envia_token_y_registra_sha256(monkeypatch):
    import postgres_repository as pg

    uc.limpiar_cache_actualizaciones()
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("UPDATE_SERVICE_URL", "https://updates.ingeap.up.railway.app/")
    monkeypatch.setattr(uc, "leer_contexto_sesion_actual", lambda: ("11111111-1111-1111-1111-111111111111", "admin"))
    emitir_mock = Mock(return_value="token-efimero-de-prueba-123456")
    monkeypatch.setattr(pg, "emitir_token_actualizacion", emitir_mock)

    sha_ok = "c" * 64
    respuesta = MagicMock()
    respuesta.__enter__.return_value.read.return_value = json.dumps({
        "actualizacion_disponible": True,
        "version_actual": "2.19.0",
        "edicion_actual": "gestion",
        "edicion_objetivo": "gestion",
        "cambio_edicion": False,
        "version_nueva": "2.20.0",
        "notas": "Release privado",
        "url_descarga": "/v1/updates/assets/555",
        "sha256": sha_ok,
    }).encode("utf-8")

    peticiones = []
    def fake_urlopen(req, timeout=10, context=None):
        peticiones.append(req)
        return respuesta

    monkeypatch.setattr(uc.urllib.request, "urlopen", fake_urlopen)

    res = uc.consultar_actualizacion_github(edicion_instalada="gestion", version_instalada="2.19.0")
    res_cache = uc.consultar_actualizacion_github(edicion_instalada="gestion", version_instalada="2.19.0")
    assert res["actualizacion_disponible"] is True
    assert res["url_descarga"] == "https://updates.ingeap.up.railway.app/v1/updates/assets/555"
    assert res["sha256"] == sha_ok
    assert res_cache["url_descarga"] == res["url_descarga"]
    assert uc.obtener_sha256_descarga(res["url_descarga"]) == sha_ok
    assert len(peticiones) == 1
    assert peticiones[0].get_header("Authorization") == "Bearer token-efimero-de-prueba-123456"
    emitir_mock.assert_called_once_with("11111111-1111-1111-1111-111111111111", proposito="check")


def test_consultar_actualizacion_proxy_rechaza_url_fuera_de_origen(monkeypatch):
    import postgres_repository as pg

    uc.limpiar_cache_actualizaciones()
    monkeypatch.setenv("UPDATE_SERVICE_URL", "https://updates.ingeap.up.railway.app")
    monkeypatch.setattr(uc, "leer_contexto_sesion_actual", lambda: ("11111111-1111-1111-1111-111111111111", "user_1"))
    monkeypatch.setattr(pg, "emitir_token_actualizacion", Mock(return_value="token-efimero-de-prueba-123456"))

    respuesta = MagicMock()
    respuesta.__enter__.return_value.read.return_value = json.dumps({
        "actualizacion_disponible": True,
        "version_nueva": "2.20.0",
        "url_descarga": "https://evil.example.com/v1/updates/assets/999",
    }).encode("utf-8")
    monkeypatch.setattr(uc.urllib.request, "urlopen", Mock(return_value=respuesta))

    res = uc.consultar_actualizacion_github(edicion_instalada="operativa", version_instalada="2.18.1")
    assert res["actualizacion_disponible"] is False
    assert res["verificacion_exitosa"] is False


def test_emitir_token_actualizacion_guarda_hash_sha256_parametrizado(monkeypatch):
    import hashlib
    from contextlib import contextmanager
    import postgres_repository as pg

    ejecuciones = []
    class FakeCursor:
        def execute(self, sql, params=None):
            ejecuciones.append((sql, params))

    @contextmanager
    def fake_cursor(commit=False):
        assert commit is True
        yield FakeCursor()

    monkeypatch.setattr(pg, "obtener_cursor_pg", fake_cursor)
    uid = "11111111-1111-1111-1111-111111111111"
    token = pg.emitir_token_actualizacion(uid, proposito="download", ttl_segundos=120)
    assert len(token) >= 32
    assert len(ejecuciones) == 2
    assert "DELETE FROM app_rrhh.b_1_tokens_actualizacion" in ejecuciones[0][0]
    sql_ins, params_ins = ejecuciones[1]
    assert "INSERT INTO app_rrhh.b_1_tokens_actualizacion" in sql_ins
    assert params_ins[0] == uid
    assert params_ins[1] == "download"
    assert params_ins[2] == hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert params_ins[3] == 120
