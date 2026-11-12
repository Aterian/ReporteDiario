# [MOD-00] Rutas persistentes y recursos de escritorio
import os
import sys
from pathlib import Path


def directorio_datos():
    if getattr(sys, "frozen", False):
        carpeta = Path(sys.executable).resolve().parent
        if carpeta.name.lower() == "app" and (carpeta / "_internal").is_dir():
            return carpeta.parent
        return carpeta
    return Path(__file__).resolve().parent.parent


def recurso_path(ruta_relativa):
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return str(base / ruta_relativa)


def directorio_sesion():
    from deployment import contenido_seguro
    base = _directorio_local_usuario()
    return contenido_seguro(base, base / "Ingeap" / "CheckDiario")


def _directorio_local_usuario():
    """Consultar Windows; LOCALAPPDATA/USERPROFILE no eligen el destino."""
    if sys.platform != "win32":
        return Path.home() / "AppData" / "Local"
    import ctypes
    from ctypes import wintypes
    from uuid import UUID

    carpeta_id = ctypes.create_string_buffer(UUID("F1B32785-6FBA-4FCF-9D55-7B8E7F157091").bytes_le)
    ruta = ctypes.c_wchar_p()
    shell = ctypes.WinDLL("shell32", use_last_error=True)
    ole = ctypes.WinDLL("ole32", use_last_error=True)
    shell.SHGetKnownFolderPath.argtypes = [ctypes.c_void_p, wintypes.DWORD, wintypes.HANDLE,
                                          ctypes.POINTER(ctypes.c_wchar_p)]
    shell.SHGetKnownFolderPath.restype = ctypes.c_long
    ole.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    ole.CoTaskMemFree.restype = None
    try:
        resultado = shell.SHGetKnownFolderPath(carpeta_id, 0, None, ctypes.byref(ruta))
        if resultado != 0 or not ruta.value:
            raise OSError("Windows no pudo resolver la carpeta local del usuario.")
        base = Path(ruta.value)
        if not base.is_absolute():
            raise OSError("Windows devolvió una carpeta local inválida.")
        return base
    finally:
        if ruta:
            ole.CoTaskMemFree(ctypes.cast(ruta, ctypes.c_void_p))


def validar_directorio_instalacion(candidato=None):
    """El protocolo legado solo puede actualizar la ubicación oficial por usuario."""
    from deployment import ErrorPaquete
    permitida = directorio_sesion()
    if candidato is not None:
        solicitada = Path(candidato)
        if (not solicitada.is_absolute() or ".." in solicitada.parts or
                os.path.normcase(str(solicitada)) != os.path.normcase(str(permitida))):
            raise ErrorPaquete("La instalación debe permanecer en la carpeta oficial de Check Diario.")
    return permitida
