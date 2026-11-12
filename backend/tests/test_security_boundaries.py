"""Casos adversarios para las fronteras indicadas por el análisis SAST."""
import base64
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import pytest

import app_paths
import bootstrap_test_db as bootstrap
import installer_app
import installer_settings
import postgres_repository as db
import updater
from deployment import ErrorPaquete


@pytest.mark.parametrize("ruta_inyectada", ["../../ajeno.json", "C:/Windows/ajeno.json", r"\\servidor\compartida\sesion.json"])
def test_sesion_no_lee_escribe_ni_borra_el_destino_del_entorno(tmp_path, monkeypatch, ruta_inyectada):
    raiz = tmp_path / "datos-app"
    raiz.mkdir()
    ajeno = tmp_path / "ajeno.json"
    ajeno.write_text('{"id_usuario":"no-tocar"}')
    monkeypatch.setattr(db, "directorio_sesion", lambda: raiz)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("CHECK_DIARIO_SESSION_FILE", ruta_inyectada)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "otro-usuario"))
    assert db._cargar_sesion_disco() is None
    db._guardar_sesion_disco({"id_usuario": "prueba-sintetica"})
    assert db._cargar_sesion_disco() == {"id_usuario": "prueba-sintetica"}
    db._eliminar_sesion_disco()
    assert not (raiz / "sesion_activa.json").exists()
    assert json.loads(ajeno.read_text()) == {"id_usuario": "no-tocar"}


def test_una_ruta_absoluta_custom_tampoco_redirige_la_sesion(tmp_path, monkeypatch):
    ajeno = tmp_path / "victima.json"
    ajeno.write_text('{"id_usuario":"intacto"}')
    monkeypatch.setenv("CHECK_DIARIO_SESSION_FILE", str(ajeno))
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setattr(db, "directorio_sesion", lambda: tmp_path / "app")
    assert db._cargar_sesion_disco() is None
    db._guardar_sesion_disco({"id_usuario": "sintetico"})
    db._eliminar_sesion_disco()
    assert json.loads(ajeno.read_text()) == {"id_usuario": "intacto"}


def test_destino_oficial_no_depende_de_localappdata(tmp_path, monkeypatch):
    local_windows = tmp_path / "carpeta-conocida"
    monkeypatch.setattr(app_paths, "_directorio_local_usuario", lambda: local_windows)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "infiltrada"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "perfil-infiltrado"))
    oficial = local_windows / "Ingeap" / "CheckDiario"
    assert app_paths.directorio_sesion() == oficial
    assert app_paths.validar_directorio_instalacion(oficial) == oficial


@pytest.mark.skipif(sys.platform != "win32", reason="API de carpetas conocidas de Windows")
def test_api_windows_no_acepta_redireccion_por_entorno(tmp_path, monkeypatch):
    esperada = app_paths._directorio_local_usuario()
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "infiltrada"))
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "perfil-infiltrado"))
    assert app_paths._directorio_local_usuario() == esperada


@pytest.mark.parametrize("candidato", ["../otra", "relativa", "C:/Windows", "C:/otra/CheckDiario"])
def test_actualizador_rechaza_destinos_cli_ajenos(tmp_path, monkeypatch, candidato):
    monkeypatch.setattr(app_paths, "_directorio_local_usuario", lambda: tmp_path)
    with pytest.raises(ErrorPaquete):
        app_paths.validar_directorio_instalacion(candidato)


def test_actualizador_rechaza_traversal_aun_si_resuelve_al_destino_oficial(tmp_path, monkeypatch):
    monkeypatch.setattr(app_paths, "_directorio_local_usuario", lambda: tmp_path)
    ruta = tmp_path / "Ingeap" / "subcarpeta" / ".." / "CheckDiario"
    with pytest.raises(ErrorPaquete):
        app_paths.validar_directorio_instalacion(ruta)


def test_sesion_rechaza_enlace_en_el_archivo(tmp_path, monkeypatch):
    archivo = tmp_path / "sesion_activa.json"
    archivo.write_text('{"id_usuario":"intacto"}')
    original = Path.is_symlink
    monkeypatch.setattr(Path, "is_symlink", lambda p: p == archivo or original(p))
    monkeypatch.setattr(db, "directorio_sesion", lambda: tmp_path)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    with pytest.raises(ErrorPaquete):
        db._eliminar_sesion_disco()
    assert archivo.exists()


def test_instalador_rechaza_cli_antes_de_modificar_archivos_o_accesos(tmp_path, monkeypatch):
    monkeypatch.setattr(app_paths, "_directorio_local_usuario", lambda: tmp_path / "local")
    comprobar = Mock()
    instalar = Mock()
    monkeypatch.setattr(installer_app, "comprobar_instancia_cerrada", comprobar)
    monkeypatch.setattr(installer_app, "instalar", instalar)
    if sys.platform == "win32":
        monkeypatch.setattr(installer_app.ctypes.windll.user32, "MessageBoxW", Mock())
    ajena = tmp_path / "ajena"
    assert installer_app.main(["--target-dir", str(ajena)]) == 1
    assert not ajena.exists()
    comprobar.assert_not_called()
    instalar.assert_not_called()


@pytest.mark.parametrize("comando", ["cmd /c echo inseguro", ["relativa.exe", "arg"]])
def test_lanzador_rechaza_comando_shell_o_ejecutable_relativo(monkeypatch, comando):
    popen = Mock()
    monkeypatch.setattr(updater.subprocess, "Popen", popen)
    with pytest.raises(ErrorPaquete):
        updater.lanzar_proceso(comando)
    popen.assert_not_called()


def test_metacaracteres_se_transmiten_como_argumentos_sin_shell(tmp_path, monkeypatch):
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    popen = Mock()
    monkeypatch.setattr(updater.subprocess, "Popen", popen)
    comando = [str(tmp_path / "O'Connor & Equipo" / "CheckDiarioIngeap.exe"), "'; & echo inyectado"]
    updater.lanzar_proceso(comando)
    assert popen.call_args.args[0] == comando
    assert popen.call_args.kwargs["shell"] is False


def test_powershell_recibe_rutas_solo_como_json(tmp_path, monkeypatch):
    ejecutar = Mock(return_value=SimpleNamespace(returncode=0, stdout='{"exito":true}'))
    monkeypatch.setattr(installer_settings.subprocess, "run", ejecutar)
    ruta = tmp_path / "O'Connor; & Write-Error inyectado"
    installer_settings.ejecutar("accesos", ruta, ejecutable=str(ruta / "CheckDiarioIngeap.exe"))
    comando = ejecutar.call_args.args[0]
    script = base64.b64decode(comando[-1]).decode("utf-16-le")
    assert script == installer_settings.SCRIPT
    assert str(ruta) not in script
    assert json.loads(ejecutar.call_args.kwargs["input"])["raiz"] == str(ruta)
    assert ejecutar.call_args.kwargs["shell"] is False


def _bootstrap_simulado(tmp_path, monkeypatch, nombre_real=None):
    nombre = bootstrap.PREFIJO_PRUEBAS + "1234567890"
    fixture = tmp_path / "backend" / "tests" / "fixtures" / "postgres_schema.sql"
    fixture.parent.mkdir(parents=True)
    fixture.write_text("-- esquema local revisado\nCREATE SCHEMA app_rrhh;", encoding="utf-8")
    monkeypatch.setattr(bootstrap, "ROOT", tmp_path)
    monkeypatch.setattr(bootstrap, "load_dotenv", Mock())
    monkeypatch.setattr(bootstrap, "uuid4", lambda: SimpleNamespace(hex="1234567890abcdef"))
    monkeypatch.setenv("DATABASE_URL", "dbname=origen_sintetico user=prueba")
    admin = MagicMock()
    destino = MagicMock()
    destino.__enter__.return_value = destino
    destino.info.dbname = nombre_real or nombre
    conectar = Mock(side_effect=[admin, destino])
    monkeypatch.setattr(bootstrap.psycopg2, "connect", conectar)
    return conectar, destino, fixture


def test_bootstrap_ejecuta_solo_fixture_local_y_no_lee_ddl_remoto(tmp_path, monkeypatch):
    conectar, destino, fixture = _bootstrap_simulado(tmp_path, monkeypatch)
    bootstrap.main()
    assert conectar.call_count == 2
    cursor = destino.cursor.return_value.__enter__.return_value
    cursor.execute.assert_called_once_with(fixture.read_text(encoding="utf-8"))
    cursor.fetchall.assert_not_called()
    assert (tmp_path / ".env.test").exists()
    assert fixture.read_text(encoding="utf-8").startswith("-- esquema local revisado")


@pytest.mark.parametrize("nombre", ["produccion", "template1", "codex_check_diario_test_otra"])
def test_bootstrap_no_ejecuta_sql_en_una_base_inesperada(tmp_path, monkeypatch, nombre):
    _, destino, _ = _bootstrap_simulado(tmp_path, monkeypatch, nombre_real=nombre)
    with pytest.raises(RuntimeError, match="base aislada"):
        bootstrap.main()
    destino.cursor.assert_not_called()
    assert not (tmp_path / ".env.test").exists()
