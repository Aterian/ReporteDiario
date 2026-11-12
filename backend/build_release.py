# [MOD-00] Construcción de carpeta y migrador con dependencias fijadas
import argparse
import base64
import hashlib
import importlib.metadata
import json
import os
import shutil
import subprocess
import sys
import venv
import uuid
from pathlib import Path

from app_version import APP_VERSION
from deployment import crear_paquete, contenido_seguro

BACKEND = Path(__file__).resolve().parent
ROOT = BACKEND.parent


def preparar_entorno(destino):
    destino = Path(destino).resolve()
    venv.EnvBuilder(with_pip=False).create(destino)
    site = destino / "Lib" / "site-packages"
    site.mkdir(parents=True, exist_ok=True)
    origen_venv = Path(sys.prefix).resolve()
    inventario = {}
    for linea in (BACKEND / "requirements-build.lock").read_text(encoding="utf-8").splitlines():
        nombre, version = linea.split("==")
        dist = importlib.metadata.distribution(nombre)
        if dist.version != version:
            raise RuntimeError(f"La construcción requiere {nombre}=={version}.")
        for registro in dist.files or []:
            origen = Path(dist.locate_file(registro)).resolve()
            if not origen.is_file() or origen.suffix == ".pyc":
                continue
            try:
                relativo = origen.relative_to(origen_venv / "Lib" / "site-packages")
            except ValueError:
                continue
            datos = origen.read_bytes()
            if registro.hash and registro.hash.mode == "sha256":
                actual = base64.urlsafe_b64encode(hashlib.sha256(datos).digest()).rstrip(b"=").decode("ascii")
                if actual != registro.hash.value:
                    raise RuntimeError(f"El archivo de {nombre} no coincide con su distribución.")
            salida = site / relativo
            salida.parent.mkdir(parents=True, exist_ok=True)
            salida.write_bytes(datos)
        inventario[nombre] = version
    (destino / "distribuciones.json").write_text(json.dumps(inventario, sort_keys=True, indent=2), encoding="utf-8")
    return destino / "Scripts" / "python.exe"


def ejecutar(comando, log, cwd, env=None):
    with Path(log).open("w", encoding="utf-8") as salida:
        resultado = subprocess.run(comando, cwd=cwd, stdout=salida, stderr=subprocess.STDOUT, env=env)
    if resultado.returncode:
        raise RuntimeError(f"Falló la construcción. Revisá {log}.")


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--clean-env", action="store_true")
    args = parser.parse_args(argv)
    output = ROOT / "output"
    output.mkdir(exist_ok=True)
    for carpeta in (ROOT / "instalador", BACKEND / "build", ROOT / "instalador" / "app"):
        contenido_seguro(ROOT, carpeta)
    release = contenido_seguro(ROOT, ROOT / "instalador" / "releases" / (APP_VERSION + "-" + uuid.uuid4().hex[:8]))
    release.mkdir(parents=True)
    entorno = dict(os.environ, CHECK_DIARIO_RELEASE_DIR=str(release))
    if not args.skip_frontend:
        ejecutar(["npm.cmd", "run", "build"], output / "build-frontend.log", ROOT / "frontend")
    python = preparar_entorno(BACKEND / "build" / ("env-" + APP_VERSION + "-" + uuid.uuid4().hex[:8])) if args.clean_env else Path(sys.executable)
    for spec in ["CheckDiarioIngeap.spec"]:
        ejecutar([str(python), "-m", "PyInstaller", "--noconfirm", "--distpath", str(release),
                  "--workpath", str(BACKEND / "build" / "onedir"), spec],
                 output / "build-onedir.log", BACKEND)
    paquete = release / "CheckDiarioIngeap-win64.zip"
    manifiesto = crear_paquete(release / "app", paquete, APP_VERSION)
    (release / "app" / "manifest.json").write_text(json.dumps(manifiesto, sort_keys=True), encoding="utf-8")
    ejecutar([str(python), "-m", "PyInstaller", "--noconfirm", "--distpath", str(release),
              "--workpath", str(BACKEND / "build" / "launcher"), "CheckDiarioLauncher.spec"],
             output / "build-launcher.log", BACKEND)
    ejecutar([str(python), "-m", "PyInstaller", "--noconfirm", "--distpath", str(release),
              "--workpath", str(BACKEND / "build" / "migrator"), "Instalador_CheckDiario_Ingeap.spec"],
             output / "build-migrator.log", BACKEND, env=entorno)
    migrador = release / "CheckDiarioIngeap.exe"
    shutil.copy2(migrador, release / "Instalador_CheckDiario_Ingeap.exe")
    for nombre in ("CheckDiarioIngeap.exe", "Instalador_CheckDiario_Ingeap.exe", "CheckDiarioIngeap-win64.zip", "CheckDiarioLauncher.exe"):
        shutil.copy2(release / nombre, ROOT / "instalador" / nombre)
    (ROOT / "instalador" / "ultima_compilacion.json").write_text(json.dumps({"version": APP_VERSION, "directorio": str(release)}), encoding="utf-8")
    print(json.dumps({"version": APP_VERSION, "directorio": str(release), "archivos_app": len(manifiesto["archivos"]),
                      "paquete_bytes": paquete.stat().st_size, "migrador_bytes": migrador.stat().st_size}))


if __name__ == "__main__":
    main()
