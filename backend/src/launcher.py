# [MOD-00] Compatibilidad de accesos directos anteriores a onedir
import ctypes
import os
import subprocess
import sys
from pathlib import Path


def main():
    raiz = Path(sys.executable).resolve().parent
    ejecutable = raiz / "app" / "CheckDiarioIngeap.exe"
    if not ejecutable.is_file():
        return 1
    entorno = {k: v for k, v in os.environ.items() if not k.startswith(("_MEI", "_PYI", "PYINSTALLER"))}
    entorno["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    if sys.platform == "win32":
        ctypes.windll.kernel32.SetDllDirectoryW(None)
    subprocess.Popen([str(ejecutable), *sys.argv[1:]], cwd=str(raiz), env=entorno,
                     shell=False,
                     creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
