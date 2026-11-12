# [MOD-00] Paquetes completos y promoción recuperable de versiones
import hashlib
import json
import os
import re
import stat
import uuid
import zipfile
from contextlib import contextmanager
from pathlib import Path, PurePosixPath

APP_EXE = "CheckDiarioIngeap.exe"
FORMATO = "check-diario/onedir-v1"
MAX_TOTAL = 512 * 1024 * 1024
MAX_FILE = 128 * 1024 * 1024
RESERVADOS = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


class ErrorPaquete(RuntimeError):
    pass


def nombre_seguro(nombre):
    if (not isinstance(nombre, str) or not nombre or "\\" in nombre or
            any(c in nombre for c in ':<>|"*?') or any(ord(c) < 32 for c in nombre)):
        raise ErrorPaquete("Ruta inválida en el paquete.")
    partes = nombre.split("/")
    if any(not p or p in (".", "..") or p.endswith((" ", ".")) or
           p.split(".")[0].upper() in RESERVADOS for p in partes):
        raise ErrorPaquete("Ruta insegura en el paquete.")
    return PurePosixPath(nombre)


def contenido_seguro(raiz, ruta):
    raiz = Path(raiz).resolve()
    ruta = Path(ruta)
    actual = ruta
    while actual != raiz and actual != actual.parent:
        if actual.exists() and (actual.is_symlink() or
                getattr(actual.lstat(), "st_file_attributes", 0) & 0x400):
            raise ErrorPaquete("La instalación contiene un enlace o una unión de directorios.")
        actual = actual.parent
    destino = ruta.resolve()
    if destino == raiz or not destino.is_relative_to(raiz):
        raise ErrorPaquete("La ruta sale del directorio de instalación.")
    return destino


def guardar_json(ruta, datos):
    ruta = Path(ruta)
    temporal = ruta.with_name(ruta.name + ".tmp")
    with temporal.open("w", encoding="utf-8") as archivo:
        json.dump(datos, archivo, ensure_ascii=False, sort_keys=True)
        archivo.flush()
        os.fsync(archivo.fileno())
    temporal.replace(ruta)


def crear_paquete(carpeta, destino, version):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ErrorPaquete("Versión inválida.")
    carpeta = Path(carpeta).resolve()
    archivos = {}
    for archivo in sorted(carpeta.rglob("*")):
        if archivo.is_file():
            if archivo.name.casefold() in {"desktop.ini", "thumbs.db"}:
                continue
            contenido_seguro(carpeta, archivo)
            nombre = archivo.relative_to(carpeta).as_posix()
            nombre_seguro(nombre)
            if archivo.name.startswith(".env") or nombre == "manifest.json":
                raise ErrorPaquete("No se admite configuración privada dentro del paquete.")
            archivos[nombre] = {"bytes": archivo.stat().st_size,
                                "sha256": hashlib.sha256(archivo.read_bytes()).hexdigest()}
    manifiesto = {"formato": FORMATO, "version": version, "arquitectura": "win_amd64", "archivos": archivos}
    with zipfile.ZipFile(destino, "w", compression=zipfile.ZIP_DEFLATED) as paquete:
        paquete.writestr("manifest.json", json.dumps(manifiesto, sort_keys=True))
        for nombre in archivos:
            paquete.write(carpeta / nombre, nombre)
    validar_paquete(destino)
    return manifiesto


def validar_paquete(ruta):
    with zipfile.ZipFile(ruta) as paquete:
        entradas = paquete.infolist()
        if len(entradas) > 5000 or sum(e.file_size for e in entradas) > MAX_TOTAL:
            raise ErrorPaquete("El paquete supera los límites de instalación.")
        nombres = set()
        for entrada in entradas:
            nombre_seguro(entrada.filename)
            normalizado = entrada.filename.casefold()
            if normalizado in nombres:
                raise ErrorPaquete("El paquete tiene rutas duplicadas.")
            nombres.add(normalizado)
            modo = entrada.external_attr >> 16
            if stat.S_IFMT(modo) not in (0, stat.S_IFREG) or entrada.file_size > MAX_FILE:
                raise ErrorPaquete("El paquete contiene un enlace, directorio o archivo demasiado grande.")
        if "manifest.json" not in paquete.namelist() or paquete.getinfo("manifest.json").file_size > 2 * 1024 * 1024:
            raise ErrorPaquete("Falta el manifiesto del paquete.")
        manifiesto = json.loads(paquete.read("manifest.json"))
        if (manifiesto.get("formato") != FORMATO or manifiesto.get("arquitectura") != "win_amd64" or
                not re.fullmatch(r"\d+\.\d+\.\d+", manifiesto.get("version", ""))):
            raise ErrorPaquete("El formato, la arquitectura o la versión no son compatibles.")
        archivos = manifiesto.get("archivos")
        if not isinstance(archivos, dict) or set(archivos) | {"manifest.json"} != set(paquete.namelist()):
            raise ErrorPaquete("El contenido no coincide con el manifiesto.")
        if APP_EXE not in archivos or "_internal/dist/index.html" not in archivos:
            raise ErrorPaquete("El paquete no contiene una aplicación completa.")
        for nombre, info in archivos.items():
            nombre_seguro(nombre)
            if Path(nombre).name.startswith(".env"):
                raise ErrorPaquete("La configuración privada debe conservarse fuera de app.")
            if not isinstance(info, dict) or type(info.get("bytes")) is not int or info["bytes"] < 0:
                raise ErrorPaquete("Tamaño inválido en el manifiesto.")
            digest = info.get("sha256", "")
            if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ErrorPaquete("Hash inválido en el manifiesto.")
            if paquete.getinfo(nombre).file_size != info["bytes"]:
                raise ErrorPaquete("Tamaño de archivo incorrecto.")
            with paquete.open(nombre) as archivo:
                if hashlib.file_digest(archivo, "sha256").hexdigest() != digest:
                    raise ErrorPaquete("El paquete está incompleto o dañado.")
    return manifiesto


def validar_instalacion(carpeta):
    carpeta = Path(carpeta).resolve()
    manifiesto = json.loads((carpeta / "manifest.json").read_text(encoding="utf-8"))
    if manifiesto.get("formato") != FORMATO:
        raise ErrorPaquete("La instalación no tiene un manifiesto compatible.")
    for nombre, info in manifiesto["archivos"].items():
        archivo = contenido_seguro(carpeta, carpeta / nombre_seguro(nombre))
        if not archivo.is_file() or archivo.stat().st_size != info["bytes"]:
            raise ErrorPaquete(f"Falta o cambió el tamaño del archivo empaquetado: {nombre}")
        with archivo.open("rb") as contenido:
            if hashlib.file_digest(contenido, "sha256").hexdigest() != info["sha256"]:
                raise ErrorPaquete("Un archivo de la instalación no coincide con su versión.")
    return manifiesto


@contextmanager
def bloqueo_instalacion(raiz):
    import msvcrt
    raiz = Path(raiz).resolve()
    carpeta = contenido_seguro(raiz, raiz / "updates")
    carpeta.mkdir(exist_ok=True)
    ruta = contenido_seguro(raiz, carpeta / "install.lock")
    with ruta.open("a+b") as archivo:
        try:
            if os.fstat(archivo.fileno()).st_size == 0:
                archivo.write(b"0")
                archivo.flush()
            archivo.seek(0)
            msvcrt.locking(archivo.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise ErrorPaquete("Ya hay otra instalación o actualización en curso.") from None
        try:
            yield
        finally:
            archivo.seek(0)
            msvcrt.locking(archivo.fileno(), msvcrt.LK_UNLCK, 1)


def leer_operacion(raiz):
    raiz = Path(raiz).resolve()
    ruta = contenido_seguro(raiz, raiz / "updates" / "pending.json")
    if not ruta.exists():
        return None
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    if datos.get("formato") != FORMATO or not re.fullmatch(r"[0-9a-f]{32}", datos.get("id", "")):
        raise ErrorPaquete("El registro de recuperación no es válido.")
    if datos.get("estado") not in ("preparada", "promoviendo", "probando", "confirmada", "revertida"):
        raise ErrorPaquete("El estado de recuperación no es válido.")
    return datos


def revertir(raiz, operacion, restaurar_configuracion=None):
    raiz = Path(raiz).resolve()
    tx = operacion["id"]
    if not re.fullmatch(r"[0-9a-f]{32}", tx):
        raise ErrorPaquete("Identificador inválido.")
    app = contenido_seguro(raiz, raiz / "app")
    backup = contenido_seguro(raiz, raiz / "updates" / ("previous-" + tx))
    fallida = contenido_seguro(raiz, raiz / "updates" / ("failed-" + tx))
    if backup.exists():
        if app.exists():
            app.rename(fallida)
        backup.rename(app)
    elif not operacion.get("habia_app") and (operacion["estado"] in ("probando", "confirmada") or
            not (raiz / "updates" / ("staging-" + tx)).exists()):
        if app.exists():
            app.rename(fallida)
    elif operacion.get("habia_app") and not app.exists():
        raise ErrorPaquete("No se encuentra la versión anterior. Se conservaron los archivos de recuperación.")
    if restaurar_configuracion is not None:
        restaurar_configuracion(operacion["id"])
    operacion["estado"] = "revertida"
    guardar_json(raiz / "updates" / "pending.json", operacion)


def recuperar_pendiente(raiz, restaurar_configuracion=None):
    operacion = leer_operacion(raiz)
    if operacion and operacion["estado"] not in ("confirmada", "revertida"):
        revertir(raiz, operacion, restaurar_configuracion)
        return True
    return False


def instalar_paquete(paquete, raiz, *, iniciar, preparar=None, configurar=None, restaurar=None):
    raiz = Path(raiz).resolve()
    if raiz == raiz.parent:
        raise ErrorPaquete("No se puede instalar en la raíz del disco.")
    raiz.mkdir(parents=True, exist_ok=True)
    manifiesto = validar_paquete(paquete)
    with bloqueo_instalacion(raiz):
        recuperar_pendiente(raiz, restaurar)
        tx = uuid.uuid4().hex
        app = contenido_seguro(raiz, raiz / "app")
        stage = contenido_seguro(raiz, raiz / "updates" / ("staging-" + tx))
        backup = contenido_seguro(raiz, raiz / "updates" / ("previous-" + tx))
        stage.mkdir()
        with zipfile.ZipFile(paquete) as origen:
            for nombre in origen.namelist():
                destino = contenido_seguro(raiz, stage / nombre_seguro(nombre))
                destino.parent.mkdir(parents=True, exist_ok=True)
                with origen.open(nombre) as entrada, destino.open("xb") as salida:
                    import shutil
                    shutil.copyfileobj(entrada, salida, 1024 * 1024)
        validar_instalacion(stage)
        operacion = {"formato": FORMATO, "id": tx, "version": manifiesto["version"],
                     "habia_app": app.exists(), "estado": "preparada"}
        if preparar:
            preparar(tx)
        guardar_json(raiz / "updates" / "pending.json", operacion)
        proceso = None
        try:
            operacion["estado"] = "promoviendo"
            guardar_json(raiz / "updates" / "pending.json", operacion)
            if app.exists():
                app.rename(backup)
            stage.rename(app)
            operacion["estado"] = "probando"
            guardar_json(raiz / "updates" / "pending.json", operacion)
            proceso = iniciar(app / APP_EXE, operacion)
            if configurar:
                configurar(app / APP_EXE, operacion)
            operacion["estado"] = "confirmada"
            guardar_json(raiz / "updates" / "pending.json", operacion)
        except Exception:
            if proceso is not None and proceso.poll() is None:
                proceso.terminate()
                proceso.wait(timeout=10)
            revertir(raiz, operacion, restaurar)
            raise
        return operacion
