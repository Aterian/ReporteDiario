# [MOD-00] Regresión del paquete, migración y recuperación de carpetas
import hashlib
import json
import sys
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

import deployment as d
import updater
from app_paths import directorio_datos


def armar_paquete(tmp_path, version="2.14.0", nombre="nueva"):
    app = tmp_path / nombre
    (app / "_internal" / "dist").mkdir(parents=True)
    (app / d.APP_EXE).write_bytes(b"MZ-" + version.encode())
    (app / "_internal" / "dist" / "index.html").write_text("<html>Prueba</html>", encoding="utf-8")
    (app / "_internal" / "python314.dll").write_bytes(b"runtime-test")
    ruta = tmp_path / (nombre + ".zip")
    d.crear_paquete(app, ruta, version)
    return ruta


def alterar(paquete, reemplazos=None, agregar=None):
    with zipfile.ZipFile(paquete) as origen:
        datos = {n: origen.read(n) for n in origen.namelist()}
    datos.update(reemplazos or {})
    datos.update(agregar or {})
    with zipfile.ZipFile(paquete, "w", zipfile.ZIP_DEFLATED) as salida:
        for nombre, contenido in datos.items():
            salida.writestr(nombre, contenido)


def test_paquete_no_fija_metadatos_mutables_del_explorador(tmp_path):
    armar_paquete(tmp_path)
    app = tmp_path / "nueva"
    for ruta in (app / "desktop.ini", app / "_internal" / "Thumbs.db"):
        if not ruta.exists():
            ruta.write_bytes(b"metadatos de carpeta")
    salida = tmp_path / "sin-metadatos.zip"
    manifiesto = d.crear_paquete(app, salida, "2.14.0")
    assert not any(Path(n).name.casefold() in {"desktop.ini", "thumbs.db"}
                   for n in manifiesto["archivos"])
    with zipfile.ZipFile(salida) as paquete:
        assert set(paquete.namelist()) == set(manifiesto["archivos"]) | {"manifest.json"}


def test_paquete_completo_preserva_configuracion_y_legacy(tmp_path):
    paquete = armar_paquete(tmp_path)
    raiz = tmp_path / "instalada"
    raiz.mkdir()
    (raiz / ".env").write_text("configuracion-privada")
    (raiz / "sesion_activa.json").write_text("identidad-local")
    (raiz / d.APP_EXE).write_bytes(b"MZ-legacy")
    eventos = []
    operacion = d.instalar_paquete(
        paquete, raiz,
        preparar=lambda tx: eventos.append("snapshot"),
        iniciar=lambda exe, op: eventos.append("arranque"),
        configurar=lambda exe, op: eventos.append("preferencias"),
    )
    assert eventos == ["snapshot", "arranque", "preferencias"]
    assert operacion["estado"] == "confirmada"
    assert d.validar_instalacion(raiz / "app")["version"] == "2.14.0"
    assert (raiz / ".env").read_text() == "configuracion-privada"
    assert (raiz / "sesion_activa.json").read_text() == "identidad-local"
    assert (raiz / d.APP_EXE).read_bytes() == b"MZ-legacy"


def test_actualizar_carpeta_y_revertir_la_version_completa(tmp_path):
    raiz = tmp_path / "instalada"
    anterior = armar_paquete(tmp_path, "2.13.3", "anterior")
    nueva = armar_paquete(tmp_path)
    d.instalar_paquete(anterior, raiz, iniciar=lambda *_: None)
    operacion = d.instalar_paquete(nueva, raiz, iniciar=lambda *_: None)
    assert d.validar_instalacion(raiz / "app")["version"] == "2.14.0"
    d.revertir(raiz, operacion)
    assert d.validar_instalacion(raiz / "app")["version"] == "2.13.3"
    assert d.leer_operacion(raiz)["estado"] == "revertida"


@pytest.mark.parametrize("etapa", ["salud", "configuracion"])
def test_fallo_detiene_solo_el_hijo_y_restaura_anterior(tmp_path, etapa):
    raiz = tmp_path / "instalada"
    anterior = armar_paquete(tmp_path, "2.13.3", "anterior")
    nueva = armar_paquete(tmp_path)
    d.instalar_paquete(anterior, raiz, iniciar=lambda *_: None)
    hijo = Mock()
    hijo.poll.return_value = None
    restaurar = Mock()
    def iniciar(*_):
        if etapa == "salud":
            raise d.ErrorPaquete("No hubo confirmación")
        return hijo
    def configurar(*_):
        raise d.ErrorPaquete("Windows rechazó los accesos")
    with pytest.raises(d.ErrorPaquete):
        d.instalar_paquete(nueva, raiz, iniciar=iniciar, configurar=configurar, restaurar=restaurar)
    assert d.validar_instalacion(raiz / "app")["version"] == "2.13.3"
    restaurar.assert_called_once()
    if etapa == "configuracion":
        hijo.terminate.assert_called_once()


@pytest.mark.parametrize("tenia_app", [True, False])
def test_recupera_corte_entre_promocion_y_confirmacion(tmp_path, monkeypatch, tenia_app):
    raiz = tmp_path / "instalada"
    if tenia_app:
        d.instalar_paquete(armar_paquete(tmp_path, "2.13.3", "anterior"), raiz, iniciar=lambda *_: None)
    paquete = armar_paquete(tmp_path)
    renombrar = Path.rename
    class CorteDeEnergia(BaseException):
        pass
    def cortar(origen, destino):
        resultado = renombrar(origen, destino)
        if origen.name.startswith("staging-") and Path(destino).name == "app":
            raise CorteDeEnergia()
        return resultado
    with monkeypatch.context() as m:
        m.setattr(Path, "rename", cortar)
        with pytest.raises(CorteDeEnergia):
            d.instalar_paquete(paquete, raiz, iniciar=lambda *_: None)
    assert d.recuperar_pendiente(raiz)
    if tenia_app:
        assert d.validar_instalacion(raiz / "app")["version"] == "2.13.3"
    else:
        assert not (raiz / "app").exists()


@pytest.mark.parametrize("ruta", ["../fuera.exe", "/absoluta", "C:/Windows/a.dll", "carpeta\\archivo",
                                  "carpeta/CON.txt", "archivo.", "carpeta /archivo", "carpeta//archivo"])
def test_rechaza_rutas_que_windows_interpreta_fuera_del_paquete(ruta):
    with pytest.raises(d.ErrorPaquete):
        d.nombre_seguro(ruta)


def test_rechaza_archivo_agregado_sin_manifestar(tmp_path):
    paquete = armar_paquete(tmp_path)
    alterar(paquete, agregar={"extra.dll": b"no declarado"})
    with pytest.raises(d.ErrorPaquete):
        d.validar_paquete(paquete)


def test_rechaza_archivo_corrupto_antes_de_instalar(tmp_path):
    paquete = armar_paquete(tmp_path)
    alterar(paquete, reemplazos={d.APP_EXE: b"MZ-corrupto"})
    raiz = tmp_path / "no-cambiar"
    with pytest.raises(d.ErrorPaquete):
        d.instalar_paquete(paquete, raiz, iniciar=Mock())
    assert not (raiz / "app").exists()


def test_rechaza_duplicados_insensibles_a_mayusculas(tmp_path):
    paquete = armar_paquete(tmp_path)
    alterar(paquete, agregar={"checkdiarioingeap.EXE": b"MZ"})
    with pytest.raises(d.ErrorPaquete):
        d.validar_paquete(paquete)


def test_rechaza_enlaces_dentro_del_zip(tmp_path):
    paquete = armar_paquete(tmp_path)
    with zipfile.ZipFile(paquete, "a") as z:
        entrada = zipfile.ZipInfo("enlace")
        entrada.external_attr = 0o120777 << 16
        z.writestr(entrada, "../fuera")
    with pytest.raises(d.ErrorPaquete):
        d.validar_paquete(paquete)


def test_no_incluye_env_en_la_distribucion(tmp_path):
    paquete = armar_paquete(tmp_path)
    app = tmp_path / "nueva"
    (app / ".env").write_text("no compartir")
    with pytest.raises(d.ErrorPaquete):
        d.crear_paquete(app, tmp_path / "privado.zip", "2.14.0")


def test_journal_invalido_no_mueve_directorios(tmp_path):
    raiz = tmp_path / "instalada"
    (raiz / "updates").mkdir(parents=True)
    (raiz / "updates" / "pending.json").write_text(json.dumps({"formato": d.FORMATO, "id": "../fuera", "estado": "promoviendo"}))
    with pytest.raises(d.ErrorPaquete):
        d.recuperar_pendiente(raiz)


def test_bloqueo_impide_dos_actualizadores(tmp_path):
    with d.bloqueo_instalacion(tmp_path):
        with pytest.raises(d.ErrorPaquete):
            with d.bloqueo_instalacion(tmp_path):
                pytest.fail("No debe adquirir un segundo bloqueo")


def test_datos_persisten_fuera_de_app(tmp_path, monkeypatch):
    app = tmp_path / "app"
    (app / "_internal").mkdir(parents=True)
    monkeypatch.setattr(sys, "executable", str(app / d.APP_EXE))
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert directorio_datos() == tmp_path


def test_acepta_el_protocolo_del_cliente_2_13_2():
    args = updater.opciones_actualizador(["--updater", "--parent-pid", "123", "--target-dir", "instalada",
                                         "--update-file", "CheckDiarioIngeap_update.exe"])
    assert args.updater
    assert args.parent_pid == 123
    assert args.target_dir == Path("instalada")


def test_comprobacion_exportaciones_acepta_alias_legacy_roster(monkeypatch):
    import package_checks
    monkeypatch.setattr(package_checks, "validar_instalacion", Mock())
    assert package_checks.verificar_paquete_instalado(Path("."), exigir_sin_numpy=False)


def test_verificacion_cli_informa_fallo_sin_ventana_no_controlada(monkeypatch):
    import main
    import package_checks
    monkeypatch.setattr(package_checks, "verificar_paquete_instalado", Mock(side_effect=d.ErrorPaquete("Fallo de prueba")))
    assert main.main(["--verify-install"]) == 1


@pytest.mark.parametrize("url", ["http://github.com/archivo", "https://github.com.evil.test/archivo",
                                "https://usuario:clave@github.com/archivo", "file:///archivo"])
def test_actualizacion_no_sigue_redirecciones_fuera_de_github(url):
    with pytest.raises(d.ErrorPaquete):
        updater.url_actualizacion_valida(url)


def test_url_actualizacion_valida_acepta_proxy_https_y_elimina_authorization_al_redirigir(monkeypatch):
    import urllib.request

    monkeypatch.setenv("UPDATE_SERVICE_URL", "https://updates.ingeap.up.railway.app")
    url_proxy = "https://updates.ingeap.up.railway.app/v1/updates/assets/42"
    url_cdn = "https://objects.githubusercontent.com/github-production-release-asset/42?sig=xyz"

    assert updater.url_actualizacion_valida(url_proxy) == url_proxy
    with pytest.raises(d.ErrorPaquete):
        updater.url_actualizacion_valida("http://updates.ingeap.up.railway.app/v1/updates/assets/42")

    req = urllib.request.Request(url_proxy, headers={"Authorization": "Bearer secreto-efimero", "User-Agent": "Test"})
    handler = updater.DescargaSegura()
    redir = handler.redirect_request(req, None, 302, "Found", {}, url_cdn)
    assert redir is not None
    assert redir.full_url == url_cdn
    assert redir.get_header("Authorization") is None
    assert all(k.lower() != "authorization" for k in redir.headers)
    assert all(k.lower() != "authorization" for k in redir.unredirected_hdrs)


def test_descargar_y_reiniciar_rechaza_sha256_incorrecto_y_limpia_temporal(tmp_path, monkeypatch):
    import io

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(updater, "directorio_datos", lambda: tmp_path)
    monkeypatch.setattr(updater, "validar_directorio_instalacion", lambda r: tmp_path)

    class FakeResponse(io.BytesIO):
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False

    fake_opener = Mock()
    fake_opener.open.return_value = FakeResponse(b"MZ-binario-de-prueba")
    monkeypatch.setattr(updater.urllib.request, "build_opener", lambda *a, **kw: fake_opener)

    res = updater.descargar_y_reiniciar(
        "https://objects.githubusercontent.com/github-production-release-asset/test.exe",
        sha256_esperado="0" * 64,
    )
    assert res["exito"] is False
    assert "SHA-256" in res["error"]
    assert list((tmp_path / "updates").glob("migrator-*.exe")) == []


def test_marcador_viejo_no_confirma_otra_version(tmp_path, monkeypatch):
    raiz = tmp_path
    (raiz / "app").mkdir()
    (raiz / "updates").mkdir()
    tx = "a" * 32
    archivo = raiz / "updates" / ("health-" + tx + ".json")
    archivo.write_text(json.dumps({"token": "otro", "version": "2.14.0", "pid": 99, "estado": "bandeja_lista"}))
    hijo = Mock(pid=99)
    hijo.poll.return_value = None
    monkeypatch.setattr(updater, "lanzar_proceso", Mock(return_value=hijo))
    monkeypatch.setattr(updater.time, "monotonic", Mock(side_effect=[0, 0, 100]))
    monkeypatch.setattr(updater.time, "sleep", Mock())
    with pytest.raises(d.ErrorPaquete):
        updater.iniciar_y_comprobar(raiz / "app" / d.APP_EXE, {"id": tx, "version": "2.14.0"}, timeout=1)
    hijo.terminate.assert_called_once()


def test_confirmacion_valida_es_local_y_no_depende_de_railway(tmp_path, monkeypatch):
    (tmp_path / "updates").mkdir()
    tx = "b" * 32
    archivo = tmp_path / "updates" / ("health-" + tx + ".json")
    monkeypatch.setattr(updater, "directorio_datos", lambda: tmp_path)
    updater.confirmar_arranque(tx, archivo)
    datos = json.loads(archivo.read_text())
    assert datos["version"] == updater.APP_VERSION
    assert datos["estado"] == "bandeja_lista"
    with pytest.raises(d.ErrorPaquete):
        updater.confirmar_arranque(tx, tmp_path.parent / "fuera.json")


def test_accesos_anteriores_reciben_lanzador_y_rollback_recupera_exe(tmp_path, monkeypatch):
    import installer_settings as s
    raiz = tmp_path / "instalada"
    (raiz / "updates").mkdir(parents=True)
    legacy = raiz / d.APP_EXE
    legacy.write_bytes(b"MZ-version-anterior")
    launcher = tmp_path / "launcher.exe"
    launcher.write_bytes(b"MZ-lanzador")
    (raiz / "Desinstalar.ps1").write_bytes(b"desinstalador anterior")
    desinstalador = tmp_path / "nuevo.ps1"
    desinstalador.write_bytes(b"desinstalador nuevo")
    ejecutar = Mock(return_value={"sid": "usuario", "task": None, "run": None, "files": {}, "config": None})
    monkeypatch.setattr(s, "ejecutar", ejecutar)
    import startup_manager
    monkeypatch.setattr(startup_manager, "configurar_inicio", Mock(return_value={"exito": True}))
    tx = "c" * 32
    s.capturar(raiz, tx)
    s.configurar(raiz, raiz / "app" / d.APP_EXE, launcher=launcher, transaccion=tx, desinstalador=desinstalador)
    assert legacy.read_bytes() == b"MZ-lanzador"
    assert (raiz / "Desinstalar.ps1").read_bytes() == b"desinstalador nuevo"
    s.restaurar(raiz, tx)
    assert legacy.read_bytes() == b"MZ-version-anterior"
    assert (raiz / "Desinstalar.ps1").read_bytes() == b"desinstalador anterior"
    assert ejecutar.call_args.args[0] == "restaurar"


def test_release_sin_migrador_exacto_no_se_ofrece_como_actualizacion(monkeypatch):
    import main
    monkeypatch.setenv("GITHUB_REPO", "example/check-diario")
    from unittest.mock import MagicMock
    respuesta = MagicMock()
    respuesta.__enter__.return_value.read.return_value = json.dumps({
        "tag_name": "v2.14.1",
        "assets": [{"name": "aplicacion-aislada.exe", "browser_download_url": "https://github.com/aislada.exe"}],
    }).encode()
    monkeypatch.setattr(main.urllib.request, "urlopen", Mock(return_value=respuesta))
    assert main.verificar_actualizacion_github()["actualizacion_disponible"] is False


def test_instalador_solicita_apertura_luego_de_actualizar(tmp_path, monkeypatch):
    import installer_app
    raiz = tmp_path / "instalada"
    paquete = armar_paquete(tmp_path)
    monkeypatch.setattr(installer_app, "recurso_path", lambda nombre: str(paquete if nombre.endswith(".zip") else tmp_path / "inexistente"))
    monkeypatch.setattr(installer_app, "validar_directorio_instalacion", Mock(return_value=raiz))
    monkeypatch.setattr(installer_app, "esperar_proceso", Mock())
    monkeypatch.setattr(installer_app, "comprobar_instancia_cerrada", Mock(return_value=False))
    monkeypatch.setattr(installer_app, "instalar", Mock())
    abrir = Mock(return_value=True)
    monkeypatch.setattr(installer_app, "solicitar_apertura_instalada", abrir)
    assert installer_app.main([
        "--updater", "--parent-pid", "123", "--target-dir", str(raiz), "--update-file", "dummy.exe"
    ]) == 0
    abrir.assert_called_once()


def test_instalador_manual_despierta_misma_version_activa_sin_error(tmp_path, monkeypatch):
    import installer_app
    import instance_manager
    raiz = tmp_path / "instalada"
    paquete = armar_paquete(tmp_path, installer_app.APP_VERSION)
    d.instalar_paquete(paquete, raiz, iniciar=lambda *_: None)
    instancia = Mock(primaria=False)
    monkeypatch.setattr(instance_manager, "InstanciaUnica", Mock(return_value=instancia))
    monkeypatch.setattr(installer_app, "recurso_path", lambda nombre: str(paquete))
    monkeypatch.setattr(installer_app, "validar_directorio_instalacion", Mock(return_value=raiz))
    instalar = Mock()
    monkeypatch.setattr(installer_app, "instalar", instalar)
    assert installer_app.main([]) == 0
    instancia.solicitar_apertura.assert_called_once()
    instancia.cerrar.assert_called_once()
    instalar.assert_not_called()


def test_instalador_manual_rechaza_otra_version_si_instancia_sigue_abierta(tmp_path, monkeypatch):
    import installer_app
    import instance_manager
    raiz = tmp_path / "instalada"
    paquete_viejo = armar_paquete(tmp_path, "2.13.3", "vieja")
    d.instalar_paquete(paquete_viejo, raiz, iniciar=lambda *_: None)
    instancia = Mock(primaria=False)
    monkeypatch.setattr(instance_manager, "InstanciaUnica", Mock(return_value=instancia))
    monkeypatch.setattr(installer_app, "recurso_path", lambda nombre: str(paquete_viejo))
    monkeypatch.setattr(installer_app, "validar_directorio_instalacion", Mock(return_value=raiz))
    if sys.platform == "win32":
        monkeypatch.setattr(installer_app.ctypes.windll.user32, "MessageBoxW", Mock())
    assert installer_app.main([]) == 1
    instancia.solicitar_apertura.assert_not_called()
    instancia.cerrar.assert_called_once()


def test_paquete_operativo_registra_edicion_y_rechaza_edicion_invalida(tmp_path):
    app = tmp_path / "op"
    (app / "_internal" / "dist").mkdir(parents=True)
    (app / d.APP_EXE).write_bytes(b"MZ-2.18.0")
    (app / "_internal" / "dist" / "index.html").write_text("<html>Op</html>", encoding="utf-8")
    ruta = tmp_path / "op.zip"
    manifiesto = d.crear_paquete(app, ruta, "2.18.0", edicion="operativa")
    assert manifiesto["edicion"] == "operativa"
    assert d.validar_paquete(ruta)["edicion"] == "operativa"

    with pytest.raises(d.ErrorPaquete):
        d.crear_paquete(app, tmp_path / "bad.zip", "2.18.0", edicion="desconocida")


def test_misma_version_instalada_distingue_edicion_operativa_vs_gestion(tmp_path, monkeypatch):
    import installer_app

    raiz = tmp_path / "instalada"
    app = tmp_path / "op"
    (app / "_internal" / "dist").mkdir(parents=True)
    (app / d.APP_EXE).write_bytes(b"MZ-2.18.0")
    (app / "_internal" / "dist" / "index.html").write_text("<html>Op</html>", encoding="utf-8")
    paquete = tmp_path / "op.zip"
    d.crear_paquete(app, paquete, "2.18.0", edicion="operativa")
    d.instalar_paquete(paquete, raiz, iniciar=lambda *_: None)

    monkeypatch.setattr(installer_app, "APP_VERSION", "2.18.0")
    monkeypatch.setattr(installer_app, "APP_EDITION", "operativa")
    assert installer_app._misma_version_instalada(raiz) is True

    monkeypatch.setattr(installer_app, "APP_EDITION", "gestion")
    assert installer_app._misma_version_instalada(raiz) is False


def test_package_checks_operativa_omite_y_rechaza_openpyxl(monkeypatch):
    import package_checks

    monkeypatch.setattr(package_checks, "validar_instalacion", Mock(return_value={"edicion": "operativa"}))
    if "openpyxl" not in sys.modules:
        assert package_checks.verificar_paquete_instalado(Path("."), exigir_sin_numpy=False) is True

    monkeypatch.setitem(sys.modules, "openpyxl", SimpleNamespace(__version__="3.1.5"))
    with pytest.raises(d.ErrorPaquete, match="openpyxl"):
        package_checks.verificar_paquete_instalado(Path("."), exigir_sin_numpy=False)

