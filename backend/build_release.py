# [MOD-00] Construcción selectiva de ediciones Operativa y Gestión con dependencias fijadas
import argparse
import base64
import hashlib
import importlib.metadata
import json
import os
import shutil
import subprocess
import sys
import uuid
import venv
from pathlib import Path

from app_version import obtener_version_edicion
from deployment import contenido_seguro, crear_paquete

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
        if not linea.strip():
            continue
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


def escribir_version_pe(destino: Path, version: str, edicion: str, original_filename: str) -> Path:
    partes = [int(p) for p in version.split(".")[:3]]
    while len(partes) < 3:
        partes.append(0)
    tupla = f"({partes[0]}, {partes[1]}, {partes[2]}, 0)"
    ver_str = f"{partes[0]}.{partes[1]}.{partes[2]}.0"
    etiqueta = "Gestión" if edicion == "gestion" else "Operativa"
    contenido = f"""# UTF-8
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers={tupla},
    prodvers={tupla},
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo(
      [
        StringTable(
          '040904b0',
          [
            StringStruct('CompanyName', 'Ingeap'),
            StringStruct('FileDescription', 'Check Diario Ingeap - Edicion {etiqueta}'),
            StringStruct('FileVersion', '{ver_str}'),
            StringStruct('InternalName', 'CheckDiarioIngeap'),
            StringStruct('LegalCopyright', 'Copyright (C) 2026 Ingeap. Todos los derechos reservados.'),
            StringStruct('OriginalFilename', '{original_filename}'),
            StringStruct('ProductName', 'Check Diario Ingeap ({etiqueta})'),
            StringStruct('ProductVersion', '{ver_str}'),
          ]
        )
      ]
    ),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
"""
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(contenido, encoding="utf-8")
    return destino


def _limpiar_marca_edicion():
    marca = BACKEND / "_build_edition.py"
    if marca.exists():
        marca.unlink()
    cache = BACKEND / "__pycache__"
    if cache.is_dir():
        for pyc in cache.glob("_build_edition*.pyc"):
            pyc.unlink()


def compilar_edicion(edicion: str, python: Path, skip_frontend: bool, output: Path) -> dict:
    version = obtener_version_edicion(edicion)
    release = contenido_seguro(ROOT, ROOT / "instalador" / "releases" / f"{edicion}-{version}-{uuid.uuid4().hex[:8]}")
    release.mkdir(parents=True)

    installer_base = "CheckDiarioIngeap_Gestion" if edicion == "gestion" else "CheckDiarioIngeap"
    installer_exe = f"{installer_base}.exe"
    installer_alias = "Instalador_CheckDiario_Gestion.exe" if edicion == "gestion" else "Instalador_CheckDiario_Ingeap.exe"
    zip_entrega = "CheckDiarioIngeap-gestion-win64.zip" if edicion == "gestion" else "CheckDiarioIngeap-win64.zip"

    version_file = BACKEND / "build" / f"file_version_info_{edicion}.txt"
    escribir_version_pe(version_file, version, edicion, installer_exe)

    entorno = dict(
        os.environ,
        CHECK_DIARIO_RELEASE_DIR=str(release),
        CHECK_DIARIO_EDITION=edicion,
        CHECK_DIARIO_VERSION_FILE=str(version_file),
        CHECK_DIARIO_INSTALLER_NAME=installer_base,
        VITE_APP_EDITION=edicion,
        VITE_APP_VERSION=version,
    )

    (BACKEND / "_build_edition.py").write_text(f'BUILD_EDITION = "{edicion}"\n', encoding="utf-8")
    try:
        if not skip_frontend:
            ejecutar(["npm.cmd", "run", "build"], output / f"build-frontend-{edicion}.log", ROOT / "frontend", env=entorno)

        ejecutar(
            [str(python), "-m", "PyInstaller", "--noconfirm", "--distpath", str(release),
             "--workpath", str(BACKEND / "build" / f"onedir-{edicion}"), "CheckDiarioIngeap.spec"],
            output / f"build-onedir-{edicion}.log",
            BACKEND,
            env=entorno,
        )

        paquete = release / "CheckDiarioIngeap-win64.zip"
        manifiesto = crear_paquete(release / "app", paquete, version, edicion=edicion)
        (release / "app" / "manifest.json").write_text(json.dumps(manifiesto, sort_keys=True), encoding="utf-8")

        ejecutar(
            [str(python), "-m", "PyInstaller", "--noconfirm", "--distpath", str(release),
             "--workpath", str(BACKEND / "build" / f"launcher-{edicion}"), "CheckDiarioLauncher.spec"],
            output / f"build-launcher-{edicion}.log",
            BACKEND,
            env=entorno,
        )
        ejecutar(
            [str(python), "-m", "PyInstaller", "--noconfirm", "--distpath", str(release),
             "--workpath", str(BACKEND / "build" / f"migrator-{edicion}"), "Instalador_CheckDiario_Ingeap.spec"],
            output / f"build-migrator-{edicion}.log",
            BACKEND,
            env=entorno,
        )
    finally:
        _limpiar_marca_edicion()

    migrador = release / installer_exe
    shutil.copy2(migrador, release / installer_alias)
    shutil.copy2(migrador, ROOT / "instalador" / installer_exe)
    shutil.copy2(migrador, ROOT / "instalador" / installer_alias)
    shutil.copy2(paquete, ROOT / "instalador" / zip_entrega)
    shutil.copy2(release / "CheckDiarioLauncher.exe", ROOT / "instalador" / "CheckDiarioLauncher.exe")

    return {
        "edicion": edicion,
        "version": version,
        "directorio": str(release),
        "archivos_app": len(manifiesto["archivos"]),
        "paquete_bytes": paquete.stat().st_size,
        "migrador_bytes": migrador.stat().st_size,
        "artefactos": [installer_exe, installer_alias, zip_entrega, "CheckDiarioLauncher.exe"],
    }


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--clean-env", action="store_true")
    parser.add_argument("--edicion", choices=("gestion", "operativa", "ambas"), default="ambas")
    args = parser.parse_args(argv)

    output = ROOT / "output"
    output.mkdir(exist_ok=True)
    for carpeta in (ROOT / "instalador", BACKEND / "build", ROOT / "instalador" / "app"):
        contenido_seguro(ROOT, carpeta)

    python = (
        preparar_entorno(BACKEND / "build" / ("env-" + uuid.uuid4().hex[:8]))
        if args.clean_env
        else Path(sys.executable)
    )

    ediciones = ["operativa", "gestion"] if args.edicion == "ambas" else [args.edicion]
    resultados = {}
    for ed in ediciones:
        resultados[ed] = compilar_edicion(ed, python, args.skip_frontend, output)

    principal = resultados.get("gestion") or resultados[ediciones[-1]]
    meta = {
        "version": principal["version"],
        "edicion": principal["edicion"],
        "directorio": principal["directorio"],
        "ediciones": resultados,
    }
    (ROOT / "instalador" / "ultima_compilacion.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
