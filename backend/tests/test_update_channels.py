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
