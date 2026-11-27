# [FN-03.08] Pruebas unitarias y de seguridad del microservicio update_proxy
import asyncio
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from update_proxy.logic import (
    ASSET_GESTION,
    ASSET_OPERATIVA,
    asset_autorizado_para_rol,
    hash_token,
    seleccionar_actualizacion_proxy,
    validar_destino_redirect_github,
)
from update_proxy.service import ProxyError, UpdateProxyService

SHA_OP = "a" * 64
SHA_GE = "b" * 64


class _DummySelector:
    def select(self, timeout=None):
        if timeout and timeout > 0:
            time.sleep(min(timeout, 0.02))
        return []

    def close(self):
        pass


class _InMemoryEventLoop(asyncio.selector_events.BaseSelectorEventLoop):
    def __init__(self):
        super().__init__(_DummySelector())

    def _make_self_pipe(self):
        pass

    def _close_self_pipe(self):
        pass

    def _write_to_self(self):
        pass


def _run_async(coro):
    loop = _InMemoryEventLoop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        asyncio.set_event_loop(None)
        loop.close()


def _releases_fixture():
    return [
        {
            "tag_name": "gestion-v2.20.1",
            "draft": False,
            "prerelease": False,
            "body": "Mejora exclusiva gestión",
            "assets": [
                {"id": 201, "name": ASSET_GESTION, "digest": f"sha256:{SHA_GE}"},
            ],
        },
        {
            "tag_name": "v2.20.0",
            "draft": False,
            "prerelease": False,
            "body": "Versión puente general",
            "assets": [
                {"id": 101, "name": ASSET_OPERATIVA, "digest": f"sha256:{SHA_OP}"},
                {"id": 102, "name": ASSET_GESTION, "digest": f"sha256:{SHA_GE}"},
                {"id": 103, "name": "Instalador_CheckDiario_Ingeap.exe"},
            ],
        },
        {
            "tag_name": "v2.21.0",
            "draft": True,
            "prerelease": False,
            "body": "Borrador",
            "assets": [
                {"id": 301, "name": ASSET_OPERATIVA},
            ],
        },
    ]


def _crear_servicio(*, tokens_validos=None, releases=None, redirect_url=None):
    almacen = dict(tokens_validos or {})
    llamadas = {"fetch": 0, "redirect": 0}
    datos_rel = list(releases if releases is not None else _releases_fixture())
    destino = redirect_url or "https://objects.githubusercontent.com/github-production-release-asset/signed?sig=abc"

    async def consume_token(token_hash: str, proposito: str):
        entrada = almacen.get(token_hash)
        if not entrada or entrada["consumido"] or entrada["proposito"] != proposito:
            return None
        entrada["consumido"] = True
        return {"id_usuario": entrada["id_usuario"], "rol_app": entrada["rol_app"]}

    async def fetch_releases():
        llamadas["fetch"] += 1
        await asyncio.sleep(0.01)
        return datos_rel

    async def resolve_redirect(asset_id: int):
        llamadas["redirect"] += 1
        return destino

    svc = UpdateProxyService(
        consume_token=consume_token,
        fetch_releases=fetch_releases,
        resolve_asset_redirect=resolve_redirect,
        cache_ttl_seconds=300,
    )
    return svc, llamadas


def test_seleccion_y_rbac_assets_distingue_operativa_y_gestion():
    releases = _releases_fixture()
    res_op = seleccionar_actualizacion_proxy(
        releases,
        rol_usuario="user_1",
        edicion_instalada="operativa",
        version_instalada="2.18.1",
        base_url="https://updates.ingeap.up.railway.app",
    )
    assert res_op["actualizacion_disponible"] is True
    assert res_op["version_nueva"] == "2.20.0"
    assert res_op["url_descarga"] == "https://updates.ingeap.up.railway.app/v1/updates/assets/101"
    assert res_op["sha256"] == SHA_OP

    res_adm = seleccionar_actualizacion_proxy(
        releases,
        rol_usuario="admin",
        edicion_instalada="operativa",
        version_instalada="2.20.0",
        base_url="https://updates.ingeap.up.railway.app",
    )
    assert res_adm["actualizacion_disponible"] is True
    assert res_adm["cambio_edicion"] is True
    assert res_adm["version_nueva"] == "2.20.1"
    assert res_adm["url_descarga"] == "https://updates.ingeap.up.railway.app/v1/updates/assets/201"
    assert res_adm["sha256"] == SHA_GE

    assert asset_autorizado_para_rol(releases, 101, "user_1") is True
    assert asset_autorizado_para_rol(releases, 102, "user_1") is False
    assert asset_autorizado_para_rol(releases, 201, "user_2") is False
    assert asset_autorizado_para_rol(releases, 103, "admin") is False
    assert asset_autorizado_para_rol(releases, 301, "admin") is False
    assert asset_autorizado_para_rol(releases, 201, "admin") is True


def test_token_efimero_es_de_un_solo_uso_y_respeta_proposito():
    tok_check = "tok-check-1234567890abcdef"
    tok_dl = "tok-download-1234567890abcdef"
    svc, _ = _crear_servicio(tokens_validos={
        hash_token(tok_check): {"id_usuario": "u1", "rol_app": "user_1", "proposito": "check", "consumido": False},
        hash_token(tok_dl): {"id_usuario": "u1", "rol_app": "user_1", "proposito": "download", "consumido": False},
    })

    async def ejecutar():
        res = await svc.verificar_actualizacion(
            token_bruto=tok_check,
            edicion_instalada="operativa",
            version_instalada="2.18.1",
            base_url="https://updates.ingeap.up.railway.app",
        )
        assert res["actualizacion_disponible"] is True

        with pytest.raises(ProxyError) as err_replay:
            await svc.verificar_actualizacion(
                token_bruto=tok_check,
                edicion_instalada="operativa",
                version_instalada="2.18.1",
                base_url="https://updates.ingeap.up.railway.app",
            )
        assert err_replay.value.status_code == 401

        with pytest.raises(ProxyError) as err_prop:
            await svc.verificar_actualizacion(
                token_bruto=tok_dl,
                edicion_instalada="operativa",
                version_instalada="2.18.1",
                base_url="https://updates.ingeap.up.railway.app",
            )
        assert err_prop.value.status_code == 401

        url_firmada = await svc.resolver_descarga_asset(token_bruto=tok_dl, asset_id=101)
        assert url_firmada.startswith("https://objects.githubusercontent.com/")

    _run_async(ejecutar())


def test_usuario_operativo_recibe_403_si_pide_asset_de_gestion():
    tok_dl = "tok-operativo-dl-1234567890"
    svc, llamadas = _crear_servicio(tokens_validos={
        hash_token(tok_dl): {"id_usuario": "u1", "rol_app": "user_1", "proposito": "download", "consumido": False},
    })

    async def ejecutar():
        with pytest.raises(ProxyError) as err:
            await svc.resolver_descarga_asset(token_bruto=tok_dl, asset_id=201)
        assert err.value.status_code == 403
        assert llamadas["redirect"] == 0

    _run_async(ejecutar())


def test_singleflight_cachea_consultas_concurrentes():
    tokens = {}
    brutos = []
    for idx in range(8):
        tok = f"tok-concurrente-{idx:02d}-1234567890"
        brutos.append(tok)
        tokens[hash_token(tok)] = {"id_usuario": f"u{idx}", "rol_app": "admin", "proposito": "check", "consumido": False}
    svc, llamadas = _crear_servicio(tokens_validos=tokens)

    async def ejecutar():
        resultados = await asyncio.gather(*(
            svc.verificar_actualizacion(
                token_bruto=t,
                edicion_instalada="gestion",
                version_instalada="2.19.0",
                base_url="https://updates.ingeap.up.railway.app",
            )
            for t in brutos
        ))
        assert len(resultados) == 8
        assert all(r["version_nueva"] == "2.20.1" for r in resultados)
        assert llamadas["fetch"] == 1

    _run_async(ejecutar())


@pytest.mark.parametrize("url_mala", [
    "http://objects.githubusercontent.com/file.exe",
    "https://evil.example.com/file.exe",
    "https://user:pass@objects.githubusercontent.com/file.exe",
    "https://github.com/Aterian/ReporteDiario",
])
def test_rechaza_destinos_redirect_no_oficiales(url_mala):
    with pytest.raises(ValueError):
        validar_destino_redirect_github(url_mala)

    tok_dl = "tok-bad-redir-1234567890"
    svc, _ = _crear_servicio(
        tokens_validos={
            hash_token(tok_dl): {"id_usuario": "u1", "rol_app": "admin", "proposito": "download", "consumido": False},
        },
        redirect_url=url_mala,
    )

    async def ejecutar():
        with pytest.raises(ProxyError) as err:
            await svc.resolver_descarga_asset(token_bruto=tok_dl, asset_id=201)
        assert err.value.status_code == 502

    _run_async(ejecutar())
