# [MOD-00] Actualización compatible y comprobación de arranque local
import argparse
import ctypes
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from app_paths import directorio_datos, validar_directorio_instalacion
from app_version import APP_VERSION
from deployment import APP_EXE, ErrorPaquete, contenido_seguro, guardar_json


def entorno_limpio():
    entorno = {k: v for k, v in os.environ.items() if not k.startswith(("_MEI", "_PYI", "PYINSTALLER"))}
    entorno["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    return entorno


def lanzar_proceso(comando, **opciones):
    if not isinstance(comando, list) or not comando or not Path(comando[0]).is_absolute():
        raise ErrorPaquete("El proceso de actualización requiere un ejecutable absoluto y argumentos separados.")
    kernel = None
    anterior = None
    if sys.platform == "win32" and getattr(sys, "frozen", False):
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.GetDllDirectoryW.argtypes = [wintypes.DWORD, wintypes.LPWSTR]
        kernel.SetDllDirectoryW.argtypes = [wintypes.LPCWSTR]
        buffer = ctypes.create_unicode_buffer(32768)
        kernel.GetDllDirectoryW(len(buffer), buffer)
        anterior = buffer.value or None
        kernel.SetDllDirectoryW(None)
    try:
        return subprocess.Popen(comando, env=entorno_limpio(), shell=False, **opciones)
    finally:
        if kernel is not None:
            kernel.SetDllDirectoryW(anterior)


def esperar_proceso(parent_pid, timeout=30):
    if not isinstance(parent_pid, int) or parent_pid <= 0:
        raise ErrorPaquete("Identificador de proceso inválido.")
    if sys.platform != "win32":
        raise ErrorPaquete("El actualizador requiere Windows.")
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x00100000, False, parent_pid)
    if not handle:
        if ctypes.get_last_error() == 87:
            return
        raise ErrorPaquete("No se pudo verificar el cierre de la aplicación anterior.")
    try:
        if kernel.WaitForSingleObject(handle, int(timeout * 1000)) != 0:
            raise ErrorPaquete("La aplicación anterior sigue abierta. Cerrala antes de actualizar.")
    finally:
        kernel.CloseHandle(handle)


def opciones_actualizador(argv):
    parser = argparse.ArgumentParser(description="Instalador y migrador Check Diario")
    parser.add_argument("--updater", action="store_true")
    parser.add_argument("--parent-pid", type=int)
    parser.add_argument("--target-dir", type=Path)
    parser.add_argument("--update-file", type=Path)
    parser.add_argument("--validate-package-only", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args(argv)
    if args.updater and (not args.parent_pid or args.target_dir is None or args.update_file is None):
        parser.error("--updater requiere --parent-pid, --target-dir y --update-file")
    return args


def confirmar_arranque(token, archivo):
    if not token or not archivo:
        return
    if not isinstance(token, str) or len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
        raise ErrorPaquete("Token de arranque inválido.")
    raiz = directorio_datos()
    destino = contenido_seguro(raiz, raiz / "updates" / ("health-" + token + ".json"))
    if Path(archivo).resolve() != destino:
        raise ErrorPaquete("La confirmación sale del directorio de actualización.")
    guardar_json(destino, {"token": token, "version": APP_VERSION, "pid": os.getpid(), "estado": "bandeja_lista"})


def iniciar_y_comprobar(ejecutable, operacion, timeout=45):
    ejecutable = Path(ejecutable).resolve()
    raiz = ejecutable.parent.parent
    token = operacion["id"]
    archivo = contenido_seguro(raiz, raiz / "updates" / ("health-" + token + ".json"))
    proceso = lanzar_proceso(
        [str(ejecutable), "--autostart", "--health-token", token, "--health-file", str(archivo)],
        cwd=str(raiz), creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
    )
    limite = time.monotonic() + timeout
    try:
        while time.monotonic() < limite:
            if proceso.poll() is not None:
                raise ErrorPaquete("La nueva aplicación terminó antes de confirmar su arranque.")
            if archivo.exists():
                try:
                    datos = json.loads(archivo.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    datos = {}
                if (datos.get("token") == token and datos.get("version") == operacion["version"] and
                        datos.get("pid") == proceso.pid and datos.get("estado") == "bandeja_lista"):
                    operacion["pid_nuevo"] = proceso.pid
                    return proceso
            time.sleep(0.1)
        raise ErrorPaquete("No se recibió la confirmación local de arranque.")
    except BaseException:
        if proceso.poll() is None:
            proceso.terminate()
            proceso.wait(timeout=10)
        raise


def url_actualizacion_valida(url):
    p = urllib.parse.urlparse(str(url))
    dominios = {"github.com", "api.github.com", "objects.githubusercontent.com",
                "release-assets.githubusercontent.com", "github-releases.githubusercontent.com"}
    if p.scheme != "https" or p.hostname not in dominios or p.username or p.password:
        raise ErrorPaquete("La URL de actualización no es un origen autorizado.")
    return url


class DescargaSegura(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        url_actualizacion_valida(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def descargar_y_reiniciar(url_descarga):
    if not getattr(sys, "frozen", False):
        return {"exito": False, "error": "Las actualizaciones se aplican desde la aplicación instalada."}
    try:
        import ssl
        url_actualizacion_valida(url_descarga)
        raiz = validar_directorio_instalacion(directorio_datos())
        carpeta = contenido_seguro(raiz, raiz / "updates")
        carpeta.mkdir(exist_ok=True)
        destino = contenido_seguro(raiz, carpeta / ("migrator-" + uuid.uuid4().hex + ".exe"))
        opener = urllib.request.build_opener(DescargaSegura(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        request = urllib.request.Request(url_descarga, headers={"User-Agent": "CheckDiarioIngeap/" + APP_VERSION})
        with opener.open(request, timeout=120) as entrada, destino.open("xb") as salida:
            total = 0
            while bloque := entrada.read(1024 * 1024):
                total += len(bloque)
                if total > 256 * 1024 * 1024:
                    raise ErrorPaquete("El archivo de actualización supera el tamaño esperado.")
                salida.write(bloque)
        with destino.open("rb") as archivo:
            if archivo.read(2) != b"MZ":
                raise ErrorPaquete("El archivo descargado no es un instalador de Windows.")
        lanzar_proceso([str(destino), "--updater", "--parent-pid", str(os.getpid()),
                        "--target-dir", str(raiz), "--update-file", str(destino)],
                       cwd=str(carpeta), creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        os._exit(0)
    except Exception as exc:
        return {"exito": False, "error": str(exc)}
