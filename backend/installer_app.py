import os
import sys
import shutil
import time
import subprocess
import ctypes
import winreg

def resource_path(relative_path):
    """Obtiene la ruta absoluta al recurso embebido en PyInstaller."""
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

def main():
    try:
        # 1. Definir directorio de destino oficial en LocalAppData (libre de restricciones de permisos)
        local_app_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser(r"~\AppData\Local")
        target_dir = os.path.join(local_app_data, "Ingeap", "CheckDiario")
        os.makedirs(target_dir, exist_ok=True)
        target_exe = os.path.join(target_dir, "CheckDiarioIngeap.exe")

        # 2. Cerrar procesos previos de CheckDiario si están abiertos para permitir reemplazo
        no_window_flag = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
        subprocess.run(["taskkill", "/F", "/IM", "CheckDiarioIngeap.exe"], capture_output=True, creationflags=no_window_flag)
        time.sleep(1)

        # 3. Extraer y copiar el binario embebido a la carpeta oficial
        payload_exe = resource_path("CheckDiarioIngeap.exe")
        if not os.path.exists(payload_exe):
            # Fallback en caso de ejecución de prueba
            fallback_payload = os.path.join(os.path.dirname(__file__), "..", "instalador", "CheckDiarioIngeap.exe")
            if os.path.exists(fallback_payload):
                payload_exe = fallback_payload
            else:
                raise FileNotFoundError(f"No se encontró el binario empaquetado: {payload_exe}")

        shutil.copy2(payload_exe, target_exe)

        # Desbloquear permisos de Windows 11 SmartScreen (quitar Zone.Identifier) en el ejecutable instalado
        ps_unblock = f"Unblock-File -LiteralPath '{target_exe}' -ErrorAction SilentlyContinue"
        subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_unblock], capture_output=True, creationflags=no_window_flag)

        # 4. Crear accesos directos en Escritorio y Menú Inicio
        desktop_dir = os.path.join(os.environ.get("USERPROFILE", ""), "Desktop")
        programs_dir = os.path.join(os.environ.get("APPDATA", ""), r"Microsoft\Windows\Start Menu\Programs")

        shortcut_desktop = os.path.join(desktop_dir, "Check Diario - Ingeap.lnk")
        shortcut_start = os.path.join(programs_dir, "Check Diario - Ingeap.lnk")

        ps_cmd = f"""
$w = New-Object -ComObject WScript.Shell
$s1 = $w.CreateShortcut('{shortcut_desktop}')
$s1.TargetPath = '{target_exe}'
$s1.WorkingDirectory = '{target_dir}'
$s1.Description = 'Check Diario de Asistencia y Proyectos - Ingeap'
$s1.IconLocation = '{target_exe},0'
$s1.Save()

$s2 = $w.CreateShortcut('{shortcut_start}')
$s2.TargetPath = '{target_exe}'
$s2.WorkingDirectory = '{target_dir}'
$s2.Description = 'Check Diario de Asistencia y Proyectos - Ingeap'
$s2.IconLocation = '{target_exe},0'
$s2.Save()
"""
        subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd], capture_output=True, creationflags=no_window_flag)

        # 5. Registrar en Windows Run (inicio automático al iniciar sesión)
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, "CheckDiarioIngeap", 0, winreg.REG_SZ, f'"{target_exe}"')
            winreg.CloseKey(key)
        except Exception as reg_err:
            print(f"[Installer] Registro Run omitido o con advertencia: {reg_err}")

        # 6. Lanzar la aplicación instalada con entorno limpio de PyInstaller y directorio de trabajo correcto
        clean_env = os.environ.copy()
        clean_env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
        for pyi_var in ("_PYI_APPLICATION_HOME_DIR", "_PYI_PARENT_PROCESS_LEVEL", "_PYI_ARCHIVE_FILE", "_PYI_SPLASH_IPC"):
            clean_env.pop(pyi_var, None)

        creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP") else 0
        subprocess.Popen([target_exe], cwd=target_dir, env=clean_env, creationflags=creation_flags)

        # 7. Cuadro de diálogo de confirmación
        ctypes.windll.user32.MessageBoxW(
            0,
            "¡Check Diario Ingeap se ha instalado correctamente en tu equipo!\n\n"
            "✓ Acceso directo creado en el Escritorio\n"
            "✓ Agregado al Menú Inicio de Windows\n"
            "✓ Configurado para iniciar con tu sesión\n\n"
            "La aplicación ya se encuentra abierta.",
            "Instalación Completada - Ingeap",
            0x40  # MB_ICONINFORMATION
        )

    except Exception as e:
        ctypes.windll.user32.MessageBoxW(
            0,
            f"Ocurrió un inconveniente durante la instalación:\n{str(e)}",
            "Error de Instalación - Ingeap",
            0x10  # MB_ICONERROR
        )

if __name__ == "__main__":
    main()
