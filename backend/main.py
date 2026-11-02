# [MOD-00] Aplicación de escritorio con PostgreSQL
import os
import sys
import uuid
import time
import json
import threading
import subprocess
import urllib.request
from datetime import datetime
import webview
import pystray
from PIL import Image, ImageDraw
from postgres_repository import inicializar_bd, obtener_sesion_activa, usuario_registro_hoy
from postgres_bridge import ApiPuente
from postgres_db import cerrar_pool

APP_VERSION = "2.10.0"


def recurso_path(ruta_relativa: str) -> str:
    """Obtiene la ruta absoluta para un recurso, compatible con PyInstaller y desarrollo."""
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, ruta_relativa)


def obtener_icono_tray():
    """Retorna la imagen del icono de calendario rojo corporativo para la bandeja del sistema."""
    ruta_assets = recurso_path("assets")
    ruta_png = os.path.join(ruta_assets, "icon.png")
    if os.path.exists(ruta_png):
        try:
            return Image.open(ruta_png)
        except Exception as e:
            print(f"Error procesando icon.png: {e}")

    ruta_ico = os.path.join(ruta_assets, "app.ico")
    if os.path.exists(ruta_ico):
        try:
            return Image.open(ruta_ico)
        except Exception:
            pass

    from crear_icono import crear_icono_calendario
    return crear_icono_calendario(64)


_mutex_instancia = None


def asegurar_instancia_unica():
    """
    Garantiza que solo exista una instancia activa de Check Diario en Windows.
    Si ya hay otra instancia en ejecución, restaura su ventana y finaliza el proceso duplicado.
    """
    global _mutex_instancia
    if sys.platform != "win32":
        return

    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        ERROR_ALREADY_EXISTS = 183
        MUTEX_NAME = "Local\\CheckDiarioIngeap_App_SingleInstance_Mutex"

        _mutex_instancia = kernel32.CreateMutexW(None, False, MUTEX_NAME)
        ultimo_error = kernel32.GetLastError()

        if ultimo_error == ERROR_ALREADY_EXISTS:
            try:
                user32 = ctypes.windll.user32
                hwnd = user32.FindWindowW(None, "Check Diario - Ingeap")
                if hwnd:
                    # SW_RESTORE = 9, SW_SHOW = 5
                    user32.ShowWindow(hwnd, 9)
                    user32.SetForegroundWindow(hwnd)
            except Exception:
                pass
            sys.exit(0)
    except Exception as e:
        print(f"[InstanciaUnica] Advertencia al verificar instancia única: {e}")


def asegurar_inicio_automatico():
    """
    Registra la aplicación en el Registro de Windows (HKCU/Run) para inicio automático
    y remueve accesos directos redundantes en la carpeta Startup para evitar doble apertura.
    """
    if sys.platform == "win32":
        try:
            # 1. Eliminar acceso directo duplicado de la carpeta Startup de Windows si existe
            appdata = os.environ.get("APPDATA", "")
            if appdata:
                startup_lnk = os.path.join(
                    appdata,
                    r"Microsoft\Windows\Start Menu\Programs\Startup",
                    "Check Diario - Ingeap.lnk"
                )
                if os.path.exists(startup_lnk):
                    try:
                        os.remove(startup_lnk)
                        print("[AutoStart] Acceso directo redundante eliminado de la carpeta Inicio.")
                    except Exception as err_del:
                        print(f"[AutoStart] No se pudo eliminar acceso directo de Inicio: {err_del}")
        except Exception as e:
            print(f"[AutoStart] Error al verificar carpeta Inicio: {e}")

    if getattr(sys, "frozen", False):
        try:
            import winreg
            exe_path = sys.executable
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0,
                winreg.KEY_SET_VALUE
            )
            winreg.SetValueEx(key, "CheckDiarioIngeap", 0, winreg.REG_SZ, f'"{exe_path}"')
            winreg.CloseKey(key)
        except Exception as e:
            print(f"[AutoStart] Error registrando en Windows Run: {e}")


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

            # Buscar binario ejecutable (.exe)
            exe_asset = next(
                (a for a in assets if "checkdiarioingeap" in a.get("name", "").lower() and a.get("name", "").lower().endswith(".exe")),
                next((a for a in assets if a.get("name", "").lower().endswith(".exe")), None)
            )
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


# [FN-03.07] Mecanismo de Actualización Desacoplado para Windows 11 / Windows 10
def ejecutar_modo_actualizador(argv: list):
    """
    Subproceso actualizador independiente. Evita inspección dinámica del proceso padre
    y resuelve condiciones de carrera en Windows 11 recibiendo parámetros explícitos vía CLI:
      --updater --parent-pid <PID> --target-dir "<DIR>" --update-file "<FILE>"
    """
    import argparse
    import shutil
    import ctypes

    parser = argparse.ArgumentParser(description="Actualizador Check Diario Ingeap")
    parser.add_argument("--updater", action="store_true")
    parser.add_argument("--parent-pid", type=int, required=True)
    parser.add_argument("--target-dir", type=str, required=True)
    parser.add_argument("--update-file", type=str, required=True)

    args, _ = parser.parse_known_args(argv[1:])
    parent_pid = args.parent_pid
    target_dir = os.path.abspath(args.target_dir)
    update_file = os.path.abspath(args.update_file)
    target_exe = os.path.join(target_dir, "CheckDiarioIngeap.exe")

    # 1. Espera activa explícita al proceso padre mediante la API nativa de Windows
    SYNCHRONIZE = 0x00100000
    kernel32 = ctypes.windll.kernel32
    h_proc = kernel32.OpenProcess(SYNCHRONIZE, False, parent_pid)
    if h_proc:
        kernel32.WaitForSingleObject(h_proc, 30000)
        kernel32.CloseHandle(h_proc)

    time.sleep(1)

    # 2. Bucle de sustitución con reintentos para tolerar el escaneo en tiempo real de Windows Defender
    reemplazo_exitoso = False
    for _ in range(25):
        try:
            shutil.copy2(update_file, target_exe)
            reemplazo_exitoso = True
            break
        except Exception:
            try:
                subprocess.run(
                    ["taskkill", "/F", "/IM", "CheckDiarioIngeap.exe"],
                    capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
                )
            except Exception:
                pass
            time.sleep(1)

    if not reemplazo_exitoso:
        try:
            ctypes.windll.user32.MessageBoxW(
                0,
                "No fue posible completar el reemplazo del archivo ejecutable.\n"
                "Por favor ejecuta el instalador manualmente para actualizar.",
                "Actualización - Check Diario",
                0x10  # MB_ICONERROR
            )
        except Exception:
            pass
        return

    # 3. Quitar Zone.Identifier (SmartScreen) del binario sustituido
    no_window_flag = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", f"Unblock-File -LiteralPath '{target_exe}' -ErrorAction SilentlyContinue"],
            creationflags=no_window_flag,
            timeout=5
        )
    except Exception:
        pass

    # 4. Limpieza del archivo temporal descargado
    try:
        if os.path.exists(update_file) and os.path.abspath(update_file) != os.path.abspath(target_exe):
            os.remove(update_file)
    except Exception:
        pass

    # 5. Reinicio de la aplicación actualizada con entorno rigurosamente limpio
    clean_env = os.environ.copy()
    for k in list(clean_env.keys()):
        if k.startswith(("_MEI", "_PYI", "PYINSTALLER")):
            clean_env.pop(k, None)
    clean_env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"

    flags = 0
    if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
        flags |= subprocess.CREATE_NEW_PROCESS_GROUP
    if hasattr(subprocess, "DETACHED_PROCESS"):
        flags |= subprocess.DETACHED_PROCESS

    subprocess.Popen([target_exe, "--post-update"], cwd=target_dir, env=clean_env, creationflags=flags)


def ejecutar_descarga_y_reinicio(url_descarga: str):
    """
    Descarga el nuevo .exe en TEMP y lanza el actualizador independiente con paso explícito
    de parámetros CLI (--parent-pid, --target-dir, --update-file) y entorno limpio,
    previniendo el error de inspección de proceso padre en Windows 11.
    """
    if not getattr(sys, "frozen", False):
        return {"exito": False, "error": "La actualización automática solo aplica sobre el ejecutable (.exe)."}

    try:
        import urllib.parse
        parsed = urllib.parse.urlparse(str(url_descarga or "").strip())
        if parsed.scheme != "https":
            return {"exito": False, "error": "La URL de actualización debe utilizar HTTPS seguro."}
        host = (parsed.netloc or "").lower().split(":")[0]
        dominios_ok = ("github.com", "api.github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "github-releases.githubusercontent.com")
        if not any(host == d or host.endswith("." + d) for d in dominios_ok):
            return {"exito": False, "error": f"El dominio '{host}' no está autorizado para descargas de actualización."}

        temp_dir = os.environ.get("TEMP", os.path.expanduser("~"))
        nuevo_exe = os.path.join(temp_dir, "CheckDiarioIngeap_update.exe")

        req = urllib.request.Request(
            url_descarga,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CheckDiarioIngeap-App",
                "Accept": "*/*"
            }
        )
        import ssl
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=120, context=ctx) as resp, open(nuevo_exe, "wb") as f:
            f.write(resp.read())

        with open(nuevo_exe, "rb") as check_f:
            if check_f.read(2) != b"MZ":
                try:
                    os.remove(nuevo_exe)
                except Exception:
                    pass
                return {"exito": False, "error": "El archivo descargado no es un ejecutable válido de Windows (cabecera corrupta o no ejecutable)."}

        no_window_flag = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
        try:
            subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", f"Unblock-File -LiteralPath '{nuevo_exe}' -ErrorAction SilentlyContinue"],
                creationflags=no_window_flag,
                timeout=5
            )
        except Exception:
            pass

        ruta_actual_exe = sys.executable
        dir_actual_exe = os.path.dirname(ruta_actual_exe)
        mi_pid = os.getpid()

        clean_env = os.environ.copy()
        for k in list(clean_env.keys()):
            if k.startswith(("_MEI", "_PYI", "PYINSTALLER")):
                clean_env.pop(k, None)
        clean_env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"

        flags = 0
        if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
            flags |= subprocess.CREATE_NEW_PROCESS_GROUP
        if hasattr(subprocess, "DETACHED_PROCESS"):
            flags |= subprocess.DETACHED_PROCESS

        cmd = [
            nuevo_exe,
            "--updater",
            "--parent-pid", str(mi_pid),
            "--target-dir", dir_actual_exe,
            "--update-file", nuevo_exe
        ]

        subprocess.Popen(cmd, cwd=temp_dir, env=clean_env, creationflags=flags)
        os._exit(0)
    except Exception as e:
        return {"exito": False, "error": str(e)}


def demonio_recordatorios(ventana, tray_icon):
    """
    Hilo en segundo plano para notificaciones automáticas:
    1. Al encender la PC / abrir la aplicación (mensaje de bienvenida/mañana).
    2. A las 16:30 hs (recordatorio de cierre de jornada).
    """
    # Pausa inicial de 8 segundos para que Windows y la app carguen completamente
    time.sleep(8)

    # 1. Recordatorio matutino / al encender la PC
    try:
        sesion = obtener_sesion_activa()
        nom = sesion.get("nombre", "") if sesion else ""
        mail = sesion.get("mail", "") if sesion else ""

        if sesion:
            try:
                from postgres_repository import obtener_dias_faltantes_mes
                info_f = obtener_dias_faltantes_mes(sesion.get("id_usuario"))
                if info_f.get("es_ultimo_dia_mes") and info_f.get("cantidad_faltantes", 0) > 0:
                    if tray_icon and hasattr(tray_icon, "notify"):
                        tray_icon.notify(
                            f"¡Atención! Hoy es fin de mes y tenés {info_f['cantidad_faltantes']} día(s) sin cargar.",
                            "Check Diario - Ingeap"
                        )
            except Exception as e_f:
                print(f"[Recordatorios] Error en chequeo fin de mes: {e_f}")

        if not usuario_registro_hoy(nom, mail):
            if tray_icon and hasattr(tray_icon, "notify"):
                try:
                    tray_icon.notify(
                        "Buenos días, ¡recordá registrar tu jornada antes de que finalice el día!",
                        "Check Diario - Ingeap"
                    )
                except Exception as e:
                    print(f"[Recordatorios] Error en notify matutino: {e}")
            if ventana:
                ventana.show()
    except Exception as e:
        print(f"[Recordatorios] Error en chequeo inicial: {e}")

    # 2. Monitoreo para las 16:30 hs
    notificado_tarde_fecha = ""
    while True:
        try:
            time.sleep(25)
            ahora = datetime.now()
            fecha_hoy = ahora.strftime("%Y-%m-%d")

            # Ventana horaria de 16:30 a 16:33
            if ahora.hour == 16 and 30 <= ahora.minute <= 33 and notificado_tarde_fecha != fecha_hoy:
                sesion = obtener_sesion_activa()
                nom = sesion.get("nombre", "") if sesion else ""
                mail = sesion.get("mail", "") if sesion else ""

                if not usuario_registro_hoy(nom, mail):
                    if tray_icon and hasattr(tray_icon, "notify"):
                        try:
                            tray_icon.notify(
                                "Son las 16:30 hs. ¡No olvides completar tu registro diario de hoy antes de retirarte!",
                                "Check Diario - Ingeap"
                            )
                        except Exception as e:
                            print(f"[Recordatorios] Error en notify 16:30: {e}")
                    if ventana:
                        ventana.show()
                        try:
                            ventana.evaluate_js("window.dispararAlertaRecordatorio && window.dispararAlertaRecordatorio('16:30');")
                        except Exception:
                            pass
                notificado_tarde_fecha = fecha_hoy
        except Exception as e:
            print(f"[Recordatorios] Error en bucle continuo: {e}")


def main():
    # 1. Asegurar inicio automático en el sistema
    asegurar_inicio_automatico()

    inicializar_bd()

    api = ApiPuente()
    ruta_dist = recurso_path(os.path.join("dist", "index.html"))
    url_objetivo = ruta_dist if os.path.exists(ruta_dist) else "http://localhost:5173"

    ventana = webview.create_window(
        title="Check Diario - Ingeap",
        url=url_objetivo,
        js_api=api,
        width=440,
        height=660,
        resizable=True,
        min_size=(380, 560)
    )
    if ventana is None:
        raise RuntimeError("No se pudo crear la ventana de la aplicación.")

    api.set_ventana(ventana)

    # Configuración de bandeja del sistema (System Tray)
    icono_img = obtener_icono_tray()
    tray_icon = None

    def mostrar_ventana(icon=None, item=None):
        if ventana:
            ventana.show()

    def ocultar_ventana(icon=None, item=None):
        if ventana:
            ventana.hide()

    def salir_programa(icon=None, item=None):
        if tray_icon:
            tray_icon.stop()
        if ventana:
            ventana.events.closing.clear()
            ventana.destroy()
        os._exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("Abrir Check Diario", mostrar_ventana, default=True),
        pystray.MenuItem("Ocultar", ocultar_ventana),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Salir", salir_programa)
    )

    tray_icon = pystray.Icon(
        "CheckDiarioIngeap",
        icono_img,
        "Check Diario - Ingeap",
        menu
    )

    def al_cerrar():
        if ventana:
            ventana.hide()
        return False

    ventana.events.closing += al_cerrar

    # Iniciamos el icono de la bandeja en segundo plano
    tray_icon.run_detached()

    # Lanzamos el hilo demonio de recordatorios diarios (al iniciar y a las 16:30 hs)
    threading.Thread(target=demonio_recordatorios, args=(ventana, tray_icon), daemon=True).start()

    try:
        webview.start(gui="edgechromium")
    finally:
        cerrar_pool()

    try:
        if tray_icon:
            tray_icon.stop()
    except Exception:
        pass



if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    if "--updater" in sys.argv:
        ejecutar_modo_actualizador(sys.argv)
        sys.exit(0)
    asegurar_instancia_unica()
    main()
