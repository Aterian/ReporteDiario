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
from database import (
    inicializar_bd,
    obtener_sesion_activa,
    guardar_sesion_activa,
    actualizar_avatar_sesion,
    borrar_sesion,
    guardar_registro_asistencia,
    guardar_registro_historial,
    obtener_ultimos_registros,
    usuario_registro_hoy
)
from sheets_service import (
    sincronizar_pendientes,
    probar_conexion,
    cargar_configuracion,
    guardar_configuracion,
    extraer_spreadsheet_id
)


# Lista predefinida de los empleados habilitados con sus correos oficiales
EMPLEADOS_AUTORIZADOS = [
    {"nombre": "Sergio Juarez", "dni": "33357062", "mail": "sjuarez@ingeap.com"},
    {"nombre": "Camila Llovio", "dni": "39695074", "mail": "cllovio@ingeap.com"},
    {"nombre": "Nicolás Parajón", "dni": "35223765", "mail": "nparajon@ingeap.com"},
    {"nombre": "Pablo Zanor", "dni": "30866202", "mail": "pzanor@ingeap.com"},
    {"nombre": "Francisco Tibaldo", "dni": "31200004", "mail": "ftibaldo@ingeap.com"},
    {"nombre": "Rocío Salim", "dni": "37880578", "mail": "rsalim@ingeap.com"},
    {"nombre": "Daiana Ferrero", "dni": "37875017", "mail": "of.tecnica@ingeap.com"},
    {"nombre": "Marco Regis", "dni": "38337660", "mail": "sge@ingeap.com"},
    {"nombre": "Iván Valentin", "dni": "40158951", "mail": "sge@ingeap.com"},
    {"nombre": "Lionel Juarez", "dni": "43008805", "mail": "ljuarez@ingeap.com"},
    {"nombre": "Santiago Destefanis", "dni": "36580770", "mail": "sdestefanis@ingeap.com"},
    {"nombre": "Justina Bertolozzi", "dni": "45411162", "mail": "rrhh@ingeap.com"},
    {"nombre": "Alejandro Maglianesi", "dni": "32370731", "mail": "amaglianesi@ingeap.com"},
    {"nombre": "Daiana Sanchez", "dni": "37546183", "mail": "marketing@ingeap.com"}
]

# Proyectos activos de prueba (más adelante se sincronizarán directo de Google Sheets)
SERVICIOS_DISPONIBLES = [
    "352-SF-I-1084-Rel Limp Canales Centro-Sta Fe-MEM",
    "353-SF-I-1086-Fot Proy empalme ruta-R Neg-Baires ing",
    "356-SF-I-1003-Fot Bat Cambio Traza CE AL-Neuqúen-Heck",
    "354-SF-M-1085- VEP SCARAFIA SUNCHALES",
    "351-SF-M-1076- Replanteo Corestein Santa Fe",
    "350-SF-M-1088- MENSURA CASA CUNA RINCON",
    "347-SF-M-1032- PRESUPUESTOS ALLASIA",
    "345-SF-M-1043- REPLANTEO LOTES SOLARO",
    "344-SF-M-1040- CEP IMOBERDORF"
]

class ApiPuente:
    """Métodos accesibles desde React mediante window.pywebview.api."""

    def __init__(self):
        self._ventana = None

    def set_ventana(self, ventana):
        self._ventana = ventana

    def minimizar_a_bandeja(self):
        """Oculta la ventana y la mantiene en el área de notificación (System Tray)."""
        if self._ventana:
            self._ventana.hide()
        return {"exito": True}

    def obtener_estado_sesion(self):
        """React consulta esta función al abrir para saber si mostrar el login o el formulario."""
        sesion = obtener_sesion_activa()
        return {"logueado": sesion is not None, "usuario": sesion}

    def iniciar_sesion(self, nombre: str, dni: str):
        """Valida que el nombre o DNI coincida con el listado autorizado."""
        nombre_limpio = nombre.strip().lower()
        dni_limpio = dni.strip()

        usuario_valido = next(
            (emp for emp in EMPLEADOS_AUTORIZADOS 
             if emp["dni"] == dni_limpio and emp["nombre"].lower() == nombre_limpio),
            None
        )

        if usuario_valido:
            guardar_sesion_activa(
                usuario_valido["nombre"],
                usuario_valido["dni"],
                usuario_valido.get("mail", "")
            )
            sesion = obtener_sesion_activa()
            avatar_actual = sesion.get("avatar", "") if sesion else ""
            res_usuario = {**usuario_valido, "avatar": avatar_actual}
            return {"exito": True, "usuario": res_usuario}
        
        return {"exito": False, "error": "Los datos ingresados no coinciden con ningún empleado registrado."}

    def guardar_avatar(self, avatar_base64: str):
        """Guarda la imagen de avatar del empleado activo en la base local."""
        actualizar_avatar_sesion(avatar_base64)
        return {"exito": True}

    def cerrar_sesion(self):
        """Permite que otro empleado use la misma computadora."""
        borrar_sesion()
        return {"exito": True}

    def obtener_servicios(self):
        """Retorna la lista de proyectos para el menú desplegable."""
        return SERVICIOS_DISPONIBLES

    def guardar_check_diario(self, datos: dict):
        """
        Recibe el reporte diario desde React y lo almacena localmente
        con el esquema exacto de Google Sheets:
        id_asistencia, empleado, fecha, tipo_ocf, servicio, horas, instrumental, usuario_mail, fecha_hora
        """
        if not isinstance(datos, dict):
            return {"exito": False, "error": "Formato de datos inválido."}

        fecha = datos.get("fecha")
        lugar = datos.get("lugar") or datos.get("tipo_ocf")

        if not (isinstance(fecha, str) and isinstance(lugar, str)):
            return {"exito": False, "error": "La fecha y la ubicación son obligatorias."}

        sesion = obtener_sesion_activa()
        empleado = sesion["nombre"] if sesion else str(datos.get("empleado", "Empleado"))
        usuario_mail = sesion["mail"] if sesion and sesion.get("mail") else str(datos.get("usuario_mail", ""))
        fecha_hora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Caso 1: Franco (Día de descanso)
        if lugar.strip().lower() == "franco":
            guardar_registro_asistencia(
                id_asistencia=str(uuid.uuid4()),
                empleado=empleado,
                fecha=fecha,
                tipo_ocf="Franco",
                servicio="Franco",
                horas=0.0,
                instrumental="",
                usuario_mail=usuario_mail,
                fecha_hora=fecha_hora,
                sincronizado=False
            )
            threading.Thread(target=sincronizar_pendientes, daemon=True).start()
            return {"exito": True, "mensaje": "Franco registrado correctamente."}

        # Caso 2: Múltiples proyectos provistos en datos['proyectos']
        proyectos = datos.get("proyectos")
        if isinstance(proyectos, list) and len(proyectos) > 0:
            for item in proyectos:
                if isinstance(item, dict):
                    srv = str(item.get("servicio", "Tiempo dedicado al Área")).strip()
                    if not srv:
                        srv = "Tiempo dedicado al Área"
                    try:
                        hrs = float(item.get("horas", 8))
                    except (ValueError, TypeError):
                        hrs = 8.0

                    guardar_registro_asistencia(
                        id_asistencia=str(uuid.uuid4()),
                        empleado=empleado,
                        fecha=fecha,
                        tipo_ocf=lugar,
                        servicio=srv,
                        horas=hrs,
                        instrumental="",
                        usuario_mail=usuario_mail,
                        fecha_hora=fecha_hora,
                        sincronizado=False
                    )
            threading.Thread(target=sincronizar_pendientes, daemon=True).start()
            return {"exito": True, "mensaje": "Reporte diario registrado correctamente."}

        # Caso 3: Sin proyectos seleccionados (se computa como tiempo dedicado al área)
        if not proyectos or (isinstance(proyectos, list) and len(proyectos) == 0):
            try:
                hrs = float(datos.get("horas", 8))
            except (ValueError, TypeError):
                hrs = 8.0

            guardar_registro_asistencia(
                id_asistencia=str(uuid.uuid4()),
                empleado=empleado,
                fecha=fecha,
                tipo_ocf=lugar,
                servicio="Tiempo dedicado al Área",
                horas=hrs,
                instrumental="",
                usuario_mail=usuario_mail,
                fecha_hora=fecha_hora,
                sincronizado=False
            )
            threading.Thread(target=sincronizar_pendientes, daemon=True).start()
            return {"exito": True, "mensaje": "Reporte registrado como tiempo al área."}

        return {"exito": False, "error": "Datos del reporte incompletos o inválidos."}

    def obtener_historial(self):
        """Retorna los registros para la pestaña de historial filtrados por el empleado en sesión."""
        sesion = obtener_sesion_activa()
        if not sesion:
            return []
        return obtener_ultimos_registros(
            empleado=sesion.get("nombre", ""),
            usuario_mail=sesion.get("mail", ""),
            limite=35
        )

    def verificar_registro_hoy(self):
        """Informa al frontend si el empleado activo ya completó el registro de hoy."""
        sesion = obtener_sesion_activa()
        if not sesion:
            return {"registrado": False}
        return {"registrado": usuario_registro_hoy(sesion.get("nombre", ""), sesion.get("mail", ""))}

    def verificar_actualizacion(self):
        """Comprueba si existe una versión superior en GitHub Releases."""
        return verificar_actualizacion_github()

    def aplicar_actualizacion(self, url_descarga: str):
        """Descarga la nueva versión y relanza la aplicación silenciosamente."""
        return ejecutar_descarga_y_reinicio(url_descarga)

    def sincronizar_sheets(self):
        """Dispara manualmente la sincronización con Google Sheets."""
        return sincronizar_pendientes()

    def probar_conexion_sheets(self, spreadsheet_id=""):
        """Prueba la conexión con el libro y la pestaña especificada."""
        return probar_conexion(spreadsheet_id)

    def obtener_config_sheets(self):
        """Devuelve la configuración actual de Google Sheets."""
        return cargar_configuracion()

    def guardar_config_sheets(self, spreadsheet_id: str):
        """Actualiza el ID/URL del Google Sheet en config.json y prueba la conexión."""
        cfg = cargar_configuracion()
        sp_id = extraer_spreadsheet_id(spreadsheet_id)
        cfg["spreadsheet_id"] = sp_id
        guardar_configuracion(cfg)
        return probar_conexion(sp_id)



def recurso_path(ruta_relativa: str) -> str:
    """Obtiene la ruta absoluta para un recurso, compatible con PyInstaller y desarrollo."""
    base_path = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, ruta_relativa)


def obtener_icono_tray():
    """Retorna la imagen del icono para la bandeja del sistema utilizando Logo_Ingeap1."""
    ruta_assets = recurso_path("assets")
    ruta_logo = os.path.join(ruta_assets, "Logo_Ingeap1.png")
    if os.path.exists(ruta_logo):
        try:
            logo = Image.open(ruta_logo)
            icon_img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
            logo_thumb = logo.copy()
            logo_thumb.thumbnail((60, 60), Image.Resampling.LANCZOS)
            offset = ((64 - logo_thumb.width) // 2, (64 - logo_thumb.height) // 2)
            icon_img.paste(logo_thumb, offset, mask=logo_thumb if logo_thumb.mode == "RGBA" else None)
            return icon_img
        except Exception as e:
            print(f"Error procesando Logo_Ingeap1: {e}")

    ruta_png = os.path.join(ruta_assets, "icon.png")
    if os.path.exists(ruta_png):
        return Image.open(ruta_png)

    os.makedirs(ruta_assets, exist_ok=True)
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([2, 2, 61, 61], radius=14, fill=(220, 38, 38, 255))
    draw.line([(18, 33), (28, 43)], fill=(255, 255, 255, 255), width=5)
    draw.line([(28, 43), (46, 21)], fill=(255, 255, 255, 255), width=5)
    img.save(ruta_png)
    return img


APP_VERSION = "1.0.0"


def asegurar_inicio_automatico():
    """Registra la aplicación en el Registro de Windows (HKCU/Run) para inicio automático."""
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


def verificar_actualizacion_github():
    """Consulta la API de GitHub Releases para comprobar si existe una versión más reciente."""
    try:
        cfg = cargar_configuracion()
        repo = cfg.get("github_repo", "")
        if not repo:
            return {"actualizacion_disponible": False, "version_actual": APP_VERSION}

        url = f"https://api.github.com/repos/{repo}/releases/latest"
        req = urllib.request.Request(url, headers={"User-Agent": "CheckDiarioIngeap-App"})
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode("utf-8"))
            version_remota = data.get("tag_name", "").lstrip("v").strip()
            assets = data.get("assets", [])
            exe_asset = next((a for a in assets if a.get("name", "").lower().endswith(".exe")), None)
            url_descarga = exe_asset.get("browser_download_url", "") if exe_asset else ""

            if version_remota and version_remota != APP_VERSION and url_descarga:
                return {
                    "actualizacion_disponible": True,
                    "version_actual": APP_VERSION,
                    "version_nueva": version_remota,
                    "notas": data.get("body", "") or "Mejoras y correcciones en esta versión.",
                    "url_descarga": url_descarga
                }
    except Exception as e:
        print(f"[AutoUpdate] Verificación omitida o sin conexión: {e}")

    return {"actualizacion_disponible": False, "version_actual": APP_VERSION}


def ejecutar_descarga_y_reinicio(url_descarga: str):
    """Descarga el nuevo .exe en TEMP y ejecuta el reemplazo en segundo plano."""
    if not getattr(sys, "frozen", False):
        return {"exito": False, "error": "La actualización automática solo aplica sobre el ejecutable (.exe)."}

    try:
        temp_dir = os.environ.get("TEMP", os.path.expanduser("~"))
        nuevo_exe = os.path.join(temp_dir, "CheckDiarioIngeap_update.exe")

        req = urllib.request.Request(url_descarga, headers={"User-Agent": "CheckDiarioIngeap-App"})
        with urllib.request.urlopen(req, timeout=120) as resp, open(nuevo_exe, "wb") as f:
            f.write(resp.read())

        ruta_actual_exe = sys.executable
        ruta_bat = os.path.join(temp_dir, "update_check_diario.bat")

        contenido_bat = f"""@echo off
timeout /t 2 /nobreak > nul
move /y "{nuevo_exe}" "{ruta_actual_exe}"
start "" "{ruta_actual_exe}"
del "%~f0"
"""
        with open(ruta_bat, "w", encoding="utf-8") as f:
            f.write(contenido_bat)

        creationflags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
        subprocess.Popen(["cmd.exe", "/c", ruta_bat], creationflags=creationflags)
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
                ventana.restore()
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
                        ventana.restore()
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

    # 2. Creamos las tablas locales si no existen aún
    inicializar_bd()

    # Intentar sincronizar en segundo plano registros pendientes de sesiones previas
    threading.Thread(target=sincronizar_pendientes, daemon=True).start()

    api = ApiPuente()
    ruta_dist = recurso_path(os.path.join("dist", "index.html"))
    url_objetivo = ruta_dist if os.path.exists(ruta_dist) else "http://localhost:5173"

    ventana = webview.create_window(
        title="Check Diario - Ingeap",
        url=url_objetivo,
        js_api=api,
        width=420,
        height=640,
        resizable=False
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
            ventana.restore()

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

    def al_minimizar():
        if ventana:
            ventana.hide()

    def al_cerrar():
        if ventana:
            ventana.hide()
        return False

    ventana.events.minimized += al_minimizar
    ventana.events.closing += al_cerrar

    # Iniciamos el icono de la bandeja en segundo plano
    tray_icon.run_detached()

    # Lanzamos el hilo demonio de recordatorios diarios (al iniciar y a las 16:30 hs)
    threading.Thread(target=demonio_recordatorios, args=(ventana, tray_icon), daemon=True).start()

    webview.start(gui="edgechromium")

    try:
        if tray_icon:
            tray_icon.stop()
    except Exception:
        pass



if __name__ == "__main__":
    main()