# [MOD-00] Regresión del arranque sin red y sin interfaz
import json
import subprocess
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from connection_state import EstadoConexion
from desktop_runtime import ControlEscritorio
from error_handler import DatabaseTransactionError, ValidacionError
from postgres_bridge import ApiPuente
from reminders import Recordatorios
from startup_manager import configurar_inicio


def esperar(predicado, timeout=2):
    fin = time.monotonic() + timeout
    while time.monotonic() < fin:
        if predicado():
            return
        time.sleep(0.002)
    assert predicado()


def fallo_red():
    exc = DatabaseTransactionError("Sin red")
    exc.es_fallo_conexion = True
    return exc


def test_importar_main_no_carga_interfaz_ni_base():
    resultado = subprocess.run(
        [sys.executable, "-c",
         "import main,sys; assert not {'webview','pydantic','postgres_repository','pystray'}.intersection(sys.modules)"],
        cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, timeout=10,
    )
    assert resultado.returncode == 0, resultado.stderr

@pytest.mark.parametrize("autostart", [True, False])
def test_runtime_crea_webview_solo_por_apertura_y_en_hilo_principal(monkeypatch, autostart):
    import main
    import builtins
    import connection_state
    import startup_trace
    from unittest.mock import MagicMock
    conexion = Mock()
    conexion.esperar_cierre.return_value = True
    monkeypatch.setattr(connection_state, "EstadoConexion", Mock(return_value=conexion))
    monkeypatch.setattr(startup_trace, "MedicionArranque", Mock())
    monkeypatch.setattr(main, "obtener_icono_tray", Mock())
    monkeypatch.setattr(main.threading, "Thread", Mock())
    class Menu(list):
        SEPARATOR = None
        def __init__(self, *items):
            super().__init__(items)
    class Icono:
        def __init__(self, *args):
            self.menu = args[3]
        def run_detached(self):
            if autostart:
                self.menu[-1].action()
        def stop(self):
            pass
    monkeypatch.setitem(sys.modules, "pystray", SimpleNamespace(
        Icon=Icono, Menu=Menu, MenuItem=lambda nombre, action, **_: SimpleNamespace(action=action)))
    importar = builtins.__import__
    ventana = MagicMock()
    hilos = []
    def crear_ventana(**kw):
        hilos.append(threading.current_thread())
        return ventana
    webview = SimpleNamespace(create_window=Mock(side_effect=crear_ventana), start=Mock())
    def importacion(nombre, *args, **kwargs):
        if nombre == "webview":
            assert not autostart, "El modo bandeja no debe cargar WebView2"
            return webview
        return importar(nombre, *args, **kwargs)
    monkeypatch.setattr(builtins, "__import__", importacion)
    main.ejecutar_escritorio(autostart)
    conexion.iniciar.assert_called_once()
    conexion.detener.assert_called_once()
    if autostart:
        webview.start.assert_not_called()
    else:
        webview.start.assert_called_once_with(gui="edgechromium")
        assert hilos == [threading.main_thread()]


def test_una_sesion_desactivada_no_se_autoriza_tras_recuperar_red(monkeypatch):
    import postgres_repository as db
    usuario = {"id_usuario": "desactivado", "rol_app": "admin"}
    monkeypatch.setattr(db, "_sesion", usuario)
    monkeypatch.setattr(db, "obtener_usuarios_cache", Mock(return_value=[]))
    borrar = Mock()
    monkeypatch.setattr(db, "borrar_sesion", borrar)
    assert db.obtener_sesion_activa() is None
    borrar.assert_called_once()


def test_fixture_rechaza_una_base_que_no_es_de_pruebas():
    import psycopg2
    with pytest.raises(AssertionError, match="base operativa"):
        psycopg2.connect("dbname=operativa host=invalid.example")



@pytest.mark.parametrize("autostart", [False, True])
def test_segundo_lanzamiento_solo_solicita_ventana_si_es_manual(monkeypatch, autostart):
    import main
    import instance_manager
    instancia = Mock(primaria=False)
    monkeypatch.setattr(instance_manager, "InstanciaUnica", Mock(return_value=instancia))
    escritorio = Mock()
    monkeypatch.setattr(main, "ejecutar_escritorio", escritorio)
    assert main.main(["--autostart"] if autostart else []) == 0
    assert instancia.solicitar_apertura.call_count == (0 if autostart else 1)
    escritorio.assert_not_called()
    instancia.cerrar.assert_called_once()


def test_actualizador_no_adquiere_instancia_normal(monkeypatch):
    import main
    import instance_manager
    nuevo = Mock()
    mutex = Mock(side_effect=AssertionError("No debe adquirir mutex"))
    monkeypatch.setattr(main, "ejecutar_modo_actualizador", nuevo)
    monkeypatch.setattr(instance_manager, "InstanciaUnica", mutex)
    assert main.main(["--updater", "--parent-pid", "5"]) == 0
    assert "--updater" in nuevo.call_args.args[0]
    mutex.assert_not_called()


def test_salir_de_bandeja_despierta_hilo_principal_sin_ventana():
    control = ControlEscritorio()
    control.salir()
    assert control.esperar_apertura() is False


def test_visibilidad_y_salida_no_pierden_ventana():
    control = ControlEscritorio()
    control.ventana = Mock()
    control.ocultar()
    assert control.visible is False
    control.mostrar()
    assert control.visible is True
    control.ventana.show.assert_called_once()
    assert "true" in control.ventana.evaluate_js.call_args.args[0]
    control.salir()
    control.ventana.destroy.assert_called_once()


def test_conexion_solo_tiene_un_trabajador_y_no_bloquea():
    entrada, soltar = threading.Event(), threading.Event()
    def cargar():
        entrada.set()
        assert soltar.wait(2)
    conexion = EstadoConexion(cargar)
    try:
        assert conexion.iniciar() is True
        assert entrada.wait(1)
        assert conexion.iniciar() is False
        assert conexion.reintentar() is False
        assert conexion.estado()["estado"] == "iniciando"
        soltar.set()
        esperar(lambda: conexion.estado()["estado"] == "disponible")
        assert conexion.estado()["intento"] == 1
    finally:
        soltar.set()
        conexion.detener()
        assert conexion.esperar_cierre(1)


def test_conexion_recupera_red_sin_reiniciar():
    inicializar = Mock(side_effect=[fallo_red(), None])
    conexion = EstadoConexion(inicializar, esperas=(0.03,), variacion=lambda *_: 0)
    try:
        conexion.iniciar()
        esperar(lambda: conexion.estado()["estado"] == "sin_conexion")
        esperar(lambda: conexion.estado()["estado"] == "disponible")
        assert inicializar.call_count == 2
    finally:
        conexion.detener()
        assert conexion.esperar_cierre(1)


@pytest.mark.parametrize("error,estado", [
    (ValidacionError("Configure DATABASE_URL"), "configuracion_invalida"),
    (ValidacionError("El esquema operativo está incompleto"), "esquema_incompatible"),
    (RuntimeError("Error de programación"), "error_interno"),
])
def test_error_permanente_espera_reintento_explicito(error, estado):
    inicializar = Mock(side_effect=[error, None])
    conexion = EstadoConexion(inicializar, esperas=(0.01,), variacion=lambda *_: 0)
    try:
        conexion.iniciar()
        esperar(lambda: conexion.estado()["estado"] == estado)
        assert inicializar.call_count == 1
        assert conexion.reintentar()
        esperar(lambda: conexion.estado()["estado"] == "disponible")
    finally:
        conexion.detener()
        assert conexion.esperar_cierre(1)


def test_cancelar_reintentos_al_salir():
    inicializar = Mock(side_effect=fallo_red())
    conexion = EstadoConexion(inicializar, esperas=(600,), variacion=lambda *_: 0)
    conexion.iniciar()
    esperar(lambda: conexion.estado()["estado"] == "sin_conexion")
    conexion.detener()
    assert conexion.esperar_cierre(1)
    assert inicializar.call_count == 1


def test_puente_no_consulta_ni_escribe_mientras_no_hay_conexion(monkeypatch):
    import postgres_repository as db
    escritura = Mock()
    sesion = Mock()
    monkeypatch.setattr(db, "obtener_sesion_activa", sesion)
    monkeypatch.setattr(db, "crear_sugerencia", escritura)
    conexion = EstadoConexion(Mock())
    puente = ApiPuente()
    puente._configurar_runtime(conexion, ControlEscritorio())
    assert puente.crear_sugerencia({})["codigo_error"] == "BD_NO_DISPONIBLE"
    assert puente.obtener_estado_sesion()["codigo_error"] == "BD_NO_DISPONIBLE"
    escritura.assert_not_called()
    sesion.assert_not_called()
    estado = puente.obtener_estado_inicializacion()
    assert set(estado) == {"exito", "datos", "error", "codigo_error"}
    assert estado["datos"]["estado"] == "iniciando"


def test_fallo_en_escritura_no_se_reintenta_y_reconecta(monkeypatch):
    import postgres_repository as db
    monkeypatch.setattr(db, "obtener_sesion_activa", Mock(return_value={"id_usuario": "x", "rol_app": "admin"}))
    escribir = Mock(side_effect=fallo_red())
    monkeypatch.setattr(db, "crear_sugerencia", escribir)
    conexion = Mock()
    conexion.estado.return_value = {"estado": "disponible"}
    puente = ApiPuente()
    puente._configurar_runtime(conexion, ControlEscritorio())
    assert puente.crear_sugerencia({})["codigo_error"] == "BD_NO_DISPONIBLE"
    escribir.assert_called_once()
    conexion.desconectado.assert_called_once()


def test_configuracion_inicio_no_inyecta_rutas_en_powershell(monkeypatch, tmp_path):
    import startup_manager
    ejecutar = Mock(return_value=SimpleNamespace(returncode=0, stdout='{"exito":true,"habilitado":false,"demora":90}'))
    monkeypatch.setattr(startup_manager.subprocess, "run", ejecutar)
    exe = tmp_path / "O'Brien $demo" / "CheckDiarioIngeap.exe"
    resultado = configurar_inicio(exe, primera_instalacion=False, habilitado=False)
    assert resultado["habilitado"] is False
    args, opciones = ejecutar.call_args
    assert str(exe.resolve()) not in " ".join(args[0])
    assert json.loads(opciones["input"])["ejecutable"] == str(exe.resolve())
    assert json.loads(opciones["input"])["habilitado"] is False


def test_rechazo_de_windows_no_se_informa_como_instalacion_correcta(monkeypatch, tmp_path):
    import startup_manager
    monkeypatch.setattr(startup_manager.subprocess, "run", Mock(return_value=SimpleNamespace(returncode=1, stdout="")))
    assert configurar_inicio(tmp_path / "app.exe")["exito"] is False
    with pytest.raises(ValueError):
        configurar_inicio(tmp_path / "app.exe", demora=0)


def test_recordatorios_no_abren_ventana_y_recuperan_horario(monkeypatch):
    import postgres_repository as db
    from datetime import datetime
    monkeypatch.setattr(db, "obtener_sesion_activa", Mock(return_value={"id_usuario": "usuario"}))
    monkeypatch.setattr(db, "usuario_registro_hoy", Mock(return_value=False))
    faltantes = Mock(return_value={"es_ultimo_dia_mes": True, "cantidad_faltantes": 2})
    monkeypatch.setattr(db, "obtener_dias_faltantes_mes", faltantes)
    avisos = Mock()
    recordatorios = Recordatorios(avisos, ahora=lambda: datetime(2026, 11, 30, 16, 40))
    recordatorios.comprobar()
    recordatorios.comprobar()
    assert avisos.call_count == 2
    assert "16:30" in avisos.call_args.args[0]
    faltantes.assert_called_once()


def test_recordatorio_sin_sesion_no_consulta_asistencias(monkeypatch):
    import postgres_repository as db
    monkeypatch.setattr(db, "obtener_sesion_activa", Mock(return_value=None))
    asistencias = Mock()
    monkeypatch.setattr(db, "usuario_registro_hoy", asistencias)
    Recordatorios(Mock()).comprobar()
    asistencias.assert_not_called()


def test_logging_sin_consola_importa_correctamente(tmp_path):
    codigo = (
        "import sys; sys.stdout=None; import error_handler; "
        "from loguru import logger; logger.info('inicio sin consola'); logger.remove()"
    )
    resultado = subprocess.run([sys.executable, "-c", codigo],
                              cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, timeout=10)
    assert resultado.returncode == 0, resultado.stderr

@pytest.mark.skipif(sys.platform != "win32", reason="Interfaz de handles de Windows")
def test_instancia_configura_handles_de_64_bits_y_cierra_sin_duplicar(monkeypatch):
    import ctypes
    from ctypes import wintypes
    from instance_manager import InstanciaUnica
    kernel = Mock()
    kernel.CreateEventW.return_value = 0x100000001
    kernel.CreateMutexW.return_value = 0x100000002
    monkeypatch.setattr(ctypes, "WinDLL", Mock(return_value=kernel))
    monkeypatch.setattr(ctypes, "get_last_error", Mock(return_value=0))
    instancia = InstanciaUnica()
    assert instancia.primaria
    assert kernel.CreateMutexW.restype is wintypes.HANDLE
    assert kernel.CreateEventW.restype is wintypes.HANDLE
    instancia.solicitar_apertura()
    kernel.SetEvent.assert_called_once_with(0x100000001)
    instancia.cerrar()
    instancia.cerrar()
    assert [call.args[0] for call in kernel.CloseHandle.call_args_list] == [0x100000001, 0x100000002]


def test_prueba_de_carga_rechaza_dsn_operativa_antes_de_conectar(monkeypatch):
    from tests.test_postgres_concurrency_load import EntornoCarga20Usuarios
    import psycopg2
    conectar = Mock()
    monkeypatch.setattr(psycopg2, "connect", conectar)
    with pytest.raises(RuntimeError, match="base aislada"):
        EntornoCarga20Usuarios("dbname=operativa host=invalid.example").__enter__()
    conectar.assert_not_called()
