# [MOD-00] Aplicación de escritorio con inicio diferido
import argparse
import os
import sys
import time
import json
import threading
import subprocess
import urllib.request

from app_version import APP_VERSION
from app_paths import recurso_path, directorio_datos

_INICIO_PYTHON = time.perf_counter()


def obtener_icono_tray():
    from PIL import Image
    for nombre in ("assets/icon.png", "assets/app.ico"):
        ruta = recurso_path(nombre)
        if os.path.exists(ruta):
            return Image.open(ruta)
    from crear_icono import crear_icono_calendario
    return crear_icono_calendario(64)


# [FN-03.06] Verificación de Actualizaciones Remotas desde GitHub Releases
def verificar_actualizacion_github():
    """
    Consulta el repositorio oficial de GitHub buscando la última versión publicada.
    Retorna si hay actualización disponible, versión actual, versión nueva y URL de descarga.
    """
    try:
        repo = os.environ.get("GITHUB_REPO", "Aterian/ReporteDiario").strip()
        if not repo:
            return {"actualizacion_disponible": False, "version_actual": APP_VERSION, "verificacion_exitosa": True}

        url = f"https://api.github.com/repos/{repo}/releases/latest"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CheckDiarioIngeap-App",
                "Accept": "application/vnd.github.v3+json"
            }
        )
        import ssl
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=8, context=ctx) as response:
            data = json.loads(response.read().decode("utf-8"))
            tag_name = data.get("tag_name", "").strip()
            version_remota = tag_name.lstrip("v").strip()
            assets = data.get("assets", [])

            exe_asset = next((a for a in assets if a.get("name") == "CheckDiarioIngeap.exe"), None)
            url_descarga = exe_asset.get("browser_download_url", "") if exe_asset else ""

            def parse_ver(v_str):
                partes = []
                for p in v_str.split("."):
                    try:
                        partes.append(int(p))
                    except ValueError:
                        partes.append(0)
                return tuple(partes)

            es_mas_nueva = parse_ver(version_remota) > parse_ver(APP_VERSION)

            return {
                "actualizacion_disponible": bool(es_mas_nueva and url_descarga),
                "version_actual": APP_VERSION,
                "version_nueva": version_remota,
                "notas": data.get("body", "") or "Mejoras y correcciones en esta versión.",
                "url_descarga": url_descarga,
                "verificacion_exitosa": True
            }
    except Exception as e:
        print(f"[AutoUpdate] Verificación de actualización remota falló: {e}")
        return {
            "actualizacion_disponible": False,
            "version_actual": APP_VERSION,
            "verificacion_exitosa": False,
            "error": str(e)
        }


# [FN-03.07] Mantener el protocolo del actualizador legado
def ejecutar_modo_actualizador(argv: list):
    from installer_app import main as instalar
    return instalar(argv[1:])


def ejecutar_descarga_y_reinicio(url_descarga: str):
    from updater import descargar_y_reiniciar
    return descargar_y_reiniciar(url_descarga)


# [FN-00.10] Inicializar PostgreSQL fuera del hilo de interfaz
def inicializar_servicios():
    from startup_trace import MedicionArranque
    tiempos = MedicionArranque(_INICIO_PYTHON)
    tiempos.registrar("conexion_iniciando")
    import postgres_repository as db
    db.perfil_esquema.cache_clear()
    db.invalidar_caches_repositorio()
    db.inicializar_bd()
    db.obtener_sesion_activa()
    tiempos.registrar("conexion_disponible")


# [FN-00.10] Crear WebView2 únicamente al solicitar la interfaz
def ejecutar_escritorio(autostart=False, instancia=None, salud=None):
    from desktop_runtime import ControlEscritorio
    from connection_state import EstadoConexion
    from reminders import Recordatorios
    from startup_trace import MedicionArranque
    import pystray

    tiempos = MedicionArranque(_INICIO_PYTHON)
    tiempos.registrar("python_listo")
    control = ControlEscritorio()
    conexion = EstadoConexion(inicializar_servicios)
    tray = pystray.Icon(
        "CheckDiarioIngeap", obtener_icono_tray(), "Check Diario - Ingeap",
        pystray.Menu(
            pystray.MenuItem("Abrir Check Diario", control.mostrar, default=True),
            pystray.MenuItem("Ocultar", control.ocultar),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Salir", control.salir),
        ),
    )
    try:
        if salud:
            from updater import confirmar_arranque
            def bandeja_lista(icon):
                icon.visible = True
                confirmar_arranque(*salud)
            tray.run_detached(setup=bandeja_lista)
        else:
            tray.run_detached()
        tiempos.registrar("bandeja_lista")
        if instancia:
            instancia.escuchar(control.mostrar, control.detener)
        conexion.iniciar()
        recordatorios = Recordatorios(lambda texto: tray.notify(texto, "Check Diario - Ingeap"))
        threading.Thread(target=recordatorios.ejecutar, args=(control.detener, conexion),
                         name="recordatorios", daemon=True).start()
        if not autostart:
            control.mostrar()
        if not control.esperar_apertura():
            return
        import webview
        from postgres_bridge import ApiPuente
        tiempos.registrar("modulos_interfaz_listos")
        api = ApiPuente()
        api._configurar_runtime(conexion, control)
        ruta = recurso_path(os.path.join("dist", "index.html"))
        ventana = webview.create_window(
            title="Check Diario - Ingeap", url=ruta if os.path.exists(ruta) else "http://localhost:5173",
            js_api=api, width=440, height=660, resizable=True, min_size=(380, 560),
        )
        if ventana is None:
            raise RuntimeError("No se pudo crear la ventana de la aplicación.")
        control.ventana = ventana
        control.visible = True
        api.set_ventana(ventana)
        def al_cerrar():
            control.ocultar()
            return False
        ventana.events.closing += al_cerrar
        ventana.events.loaded += lambda: tiempos.registrar("interfaz_cargada")
        tiempos.registrar("iniciando_webview2")
        webview.start(gui="edgechromium")
    finally:
        control.detener.set()
        conexion.detener()
        tray.stop()
        if instancia:
            instancia.cerrar()
        if conexion.esperar_cierre(0.5):
            db = sys.modules.get("postgres_db")
            if db:
                db.cerrar_pool()


# [FN-00.10] Seleccionar arranque manual, automático o configuración explícita
def main(argv=None):
    argumentos = list(sys.argv[1:] if argv is None else argv)
    if "--updater" in argumentos:
        resultado = ejecutar_modo_actualizador([sys.argv[0], *argumentos])
        return resultado if type(resultado) is int else 0
    parser = argparse.ArgumentParser(description="Check Diario - Ingeap")
    parser.add_argument("--autostart", action="store_true")
    parser.add_argument("--post-install", action="store_true")
    parser.add_argument("--post-update", action="store_true")
    parser.add_argument("--configure-startup", action="store_true")
    parser.add_argument("--disable-autostart", action="store_true")
    parser.add_argument("--startup-delay", type=int, default=90)
    parser.add_argument("--health-token")
    parser.add_argument("--health-file")
    parser.add_argument("--verify-install", action="store_true")
    args = parser.parse_args(argumentos)
    if args.verify_install:
        from pathlib import Path
        from package_checks import verificar_paquete_instalado
        try:
            return 0 if verificar_paquete_instalado(Path(sys.executable).parent) else 1
        except Exception as exc:
            if sys.stderr is not None:
                print(type(exc).__name__, str(exc), file=sys.stderr)
            return 1
    if args.configure_startup:
        if not getattr(sys, "frozen", False):
            return 1
        from startup_manager import configurar_inicio
        resultado = configurar_inicio(sys.executable, habilitado=False if args.disable_autostart else None,
                                      demora=args.startup_delay, directorio=directorio_datos())
        return 0 if resultado["exito"] else 1
    from instance_manager import InstanciaUnica
    instancia = InstanciaUnica()
    if not instancia.primaria:
        if not args.autostart:
            instancia.solicitar_apertura()
        instancia.cerrar()
        return 0
    try:
        if getattr(sys, "frozen", False):
            if args.post_update:
                from startup_manager import configurar_inicio
                configurar_inicio(sys.executable, directorio=directorio_datos())
        salud = (args.health_token, args.health_file) if args.health_token and args.health_file else None
        if salud:
            ejecutar_escritorio(args.autostart, instancia, salud)
        else:
            ejecutar_escritorio(args.autostart, instancia)
    finally:
        instancia.cerrar()
    return 0


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    raise SystemExit(main())
