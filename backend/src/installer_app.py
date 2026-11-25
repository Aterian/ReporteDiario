# [MOD-00] Instalador autocontenido y migrador para clientes anteriores
import ctypes
import os
import sys
from pathlib import Path

from app_paths import recurso_path, validar_directorio_instalacion
from app_version import APP_EDITION, APP_VERSION
from deployment import ErrorPaquete, instalar_paquete, validar_instalacion, validar_paquete, leer_operacion, revertir, bloqueo_instalacion
from updater import opciones_actualizador, esperar_proceso, iniciar_y_comprobar

INSTALLER_VERSION = APP_VERSION


# [FN-00.12] Comprobar si ya está instalada exactamente la misma versión
def _misma_version_instalada(raiz) -> bool:
    if raiz is None:
        return False
    app_dir = Path(raiz) / "app"
    if not (app_dir / "manifest.json").is_file():
        return False
    try:
        manifiesto = validar_instalacion(app_dir)
        return (
            manifiesto.get("version") == APP_VERSION
            and manifiesto.get("edicion", "gestion") == APP_EDITION
        )
    except Exception:
        return False


# [FN-00.12] Despertar la instancia instalada luego de finalizar instalación o actualización
def solicitar_apertura_instalada() -> bool:
    try:
        from instance_manager import InstanciaUnica
        instancia = InstanciaUnica()
        try:
            if not instancia.primaria:
                instancia.solicitar_apertura()
                return True
            return False
        finally:
            instancia.cerrar()
    except Exception:
        return False


def comprobar_instancia_cerrada(raiz=None, *, permitir_activar=False) -> bool:
    from instance_manager import InstanciaUnica
    instancia = InstanciaUnica()
    try:
        if not instancia.primaria:
            if permitir_activar and _misma_version_instalada(raiz):
                instancia.solicitar_apertura()
                return True
            raise ErrorPaquete("Cerrá Check Diario desde la bandeja antes de instalar o reparar.")
        return False
    finally:
        instancia.cerrar()


def instalar(raiz, paquete, *, iniciar=iniciar_y_comprobar):
    from installer_settings import capturar, restaurar, configurar
    raiz = Path(raiz).resolve()
    primera = not (raiz / "app").exists() and not (raiz / "CheckDiarioIngeap.exe").exists()
    raiz.mkdir(parents=True, exist_ok=True)
    return instalar_paquete(
        paquete, raiz, iniciar=iniciar,
        preparar=lambda tx: capturar(raiz, tx),
        configurar=lambda exe, op: configurar(raiz, exe, primera_instalacion=primera,
                                              launcher=recurso_path("CheckDiarioLauncher.exe"), transaccion=op["id"],
                                              desinstalador=recurso_path("Desinstalar.ps1")),
        restaurar=lambda tx: restaurar(raiz, tx),
    )


def main(argv=None):
    args = opciones_actualizador(sys.argv[1:] if argv is None else argv)
    paquete = Path(recurso_path("CheckDiarioIngeap-win64.zip"))
    try:
        if args.validate_package_only:
            validar_paquete(paquete)
            return 0
        raiz = validar_directorio_instalacion(args.target_dir)
        if args.updater:
            esperar_proceso(args.parent_pid)
        if comprobar_instancia_cerrada(raiz, permitir_activar=not args.updater and not args.rollback) is True:
            return 0
        if args.rollback:
            from installer_settings import restaurar
            with bloqueo_instalacion(raiz):
                operacion = leer_operacion(raiz)
                if not operacion:
                    raise ErrorPaquete("No hay una actualización registrada para revertir.")
                revertir(raiz, operacion, lambda tx: restaurar(raiz, tx))
        else:
            validar_paquete(paquete)
            raiz.mkdir(parents=True, exist_ok=True)
            origen = Path(recurso_path(".env"))
            destino = raiz / ".env"
            if origen.is_file() and not destino.exists():
                with destino.open("xb") as salida:
                    salida.write(origen.read_bytes())
            instalar(raiz, paquete)
        if not args.updater:
            etiqueta_edicion = "Edición Gestión" if APP_EDITION == "gestion" else "Edición Operativa"
            mensaje = ("Se restauró la versión anterior. Podés abrirla desde el acceso directo."
                       if args.rollback else f"Check Diario {APP_VERSION} ({etiqueta_edicion}) quedó instalado. Podés abrirlo desde la bandeja o el acceso directo.")
            ctypes.windll.user32.MessageBoxW(
                0, mensaje,
                "Check Diario - Ingeap", 0x40,
            )
        if not args.rollback:
            solicitar_apertura_instalada()
        return 0
    except Exception as exc:
        if sys.platform == "win32" and not args.validate_package_only:
            ctypes.windll.user32.MessageBoxW(0, str(exc), "No se pudo completar la instalación", 0x10)
        return 1


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    raise SystemExit(main())
