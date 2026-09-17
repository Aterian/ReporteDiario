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
    usuario_registro_hoy,
    obtener_area_por_dni,
    guardar_usuarios_cache,
    obtener_usuarios_cache,
    guardar_proyectos_cache,
    obtener_proyectos_cache,
    depurar_registros_eliminados,
    actualizar_registro_asistencia,
    guardar_registro_roster,
    obtener_rosters,
    eliminar_registro_roster,
    obtener_conexion
)
from roster_export import generar_excel_roster_mes
from sheets_service import (
    sincronizar_pendientes,
    probar_conexion,
    cargar_configuracion,
    guardar_configuracion,
    extraer_spreadsheet_id,
    obtener_proyectos_remotos,
    obtener_usuarios_remotos,
    obtener_ids_asistencia_remotos
)


# Lista predefinida de los empleados habilitados con sus correos oficiales y áreas por defecto
EMPLEADOS_AUTORIZADOS = [
    {"nombre": "Sergio Juarez", "dni": "33357062", "mail": "sjuarez@ingeap.com", "area": "N"},
    {"nombre": "Camila Llovio", "dni": "39695074", "mail": "cllovio@ingeap.com", "area": "I"},
    {"nombre": "Nicolás Parajón", "dni": "35223765", "mail": "nparajon@ingeap.com", "area": "I"},
    {"nombre": "Pablo Zanor", "dni": "30866202", "mail": "pzanor@ingeap.com", "area": "I"},
    {"nombre": "Francisco Tibaldo", "dni": "31200004", "mail": "ftibaldo@ingeap.com", "area": "N"},
    {"nombre": "Rocío Salim", "dni": "37880578", "mail": "rsalim@ingeap.com", "area": "M"},
    {"nombre": "Daiana Ferrero", "dni": "37875017", "mail": "of.tecnica@ingeap.com", "area": "M"},
    {"nombre": "Marco Regis", "dni": "38337660", "mail": "sge@ingeap.com", "area": "A"},
    {"nombre": "Iván Valentin", "dni": "40158951", "mail": "sge@ingeap.com", "area": "A"},
    {"nombre": "Lionel Juarez", "dni": "43008805", "mail": "ljuarez@ingeap.com", "area": "A"},
    {"nombre": "Santiago Destefanis", "dni": "36580770", "mail": "sdestefanis@ingeap.com", "area": "N"},
    {"nombre": "Justina Bertolozzi", "dni": "45411162", "mail": "rrhh@ingeap.com", "area": "RRHH"},
    {"nombre": "Alejandro Maglianesi", "dni": "32370731", "mail": "amaglianesi@ingeap.com", "area": "VYM"},
    {"nombre": "Daiana Sanchez", "dni": "37546183", "mail": "marketing@ingeap.com", "area": "VYM"}
]

# Proyectos de respaldo offline si aún no se sincronizó con Google Sheets
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


def sincronizar_catalogos_sheets():
    """
    Sincroniza en segundo plano los proyectos activos ('0_proyectos')
    y los usuarios autorizados ('0_usuarios') desde Google Sheets.
    """
    try:
        proyectos = obtener_proyectos_remotos()
        if proyectos:
            guardar_proyectos_cache(proyectos)
            print(f"[Catálogos] {len(proyectos)} proyectos sincronizados desde '0_proyectos'.")

        usuarios = obtener_usuarios_remotos()
        if usuarios:
            guardar_usuarios_cache(usuarios)
            print(f"[Catálogos] {len(usuarios)} usuarios sincronizados desde '0_usuarios'.")

            # Si hay una sesión activa, asegurar que tenga su área actualizada
            sesion = obtener_sesion_activa()
            if sesion:
                dni_act = sesion.get("dni", "").strip()
                u_match = next((u for u in usuarios if str(u.get("dni", "")).strip() == dni_act), None)
                if u_match and u_match.get("area") and sesion.get("area") != u_match["area"]:
                    guardar_sesion_activa(
                        nombre=sesion.get("nombre", ""),
                        dni=dni_act,
                        mail=sesion.get("mail", ""),
                        avatar=sesion.get("avatar", ""),
                        area=u_match["area"]
                    )
                    print(f"[Catálogos] Área '{u_match['area']}' actualizada para sesión activa.")
    except Exception as e:
        print(f"[Catálogos] Aviso al sincronizar proyectos y usuarios: {e}")

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
        """Valida que el nombre o DNI coincida con el listado autorizado y guarda su área."""
        nombre_limpio = nombre.strip().lower()
        dni_limpio = dni.strip()

        # Primero buscar en usuarios de Google Sheets en caché
        usuarios_disp = obtener_usuarios_cache()
        if not usuarios_disp:
            usuarios_disp = EMPLEADOS_AUTORIZADOS

        usuario_valido = next(
            (emp for emp in usuarios_disp 
             if str(emp.get("dni", "")).strip() == dni_limpio and emp.get("nombre", "").strip().lower() == nombre_limpio),
            None
        )

        # Si no se encuentra en caché, intentar consultar de inmediato Google Sheets
        if not usuario_valido:
            try:
                usuarios_remotos = obtener_usuarios_remotos()
                if usuarios_remotos:
                    guardar_usuarios_cache(usuarios_remotos)
                    usuarios_disp = usuarios_remotos
                    usuario_valido = next(
                        (emp for emp in usuarios_disp 
                         if str(emp.get("dni", "")).strip() == dni_limpio and emp.get("nombre", "").strip().lower() == nombre_limpio),
                        None
                    )
            except Exception as e:
                print(f"[Login] Error al verificar usuarios remotos: {e}")

        if not usuario_valido:
            # Fallback en lista predefinida
            usuario_valido = next(
                (emp for emp in EMPLEADOS_AUTORIZADOS 
                 if emp["dni"] == dni_limpio and emp["nombre"].lower() == nombre_limpio),
                None
            )

        if usuario_valido:
            area_val = usuario_valido.get("area", "")
            if not area_val:
                area_val = obtener_area_por_dni(dni_limpio)

            guardar_sesion_activa(
                nombre=usuario_valido["nombre"],
                dni=usuario_valido["dni"],
                mail=usuario_valido.get("mail", "") or usuario_valido.get("email", ""),
                area=area_val
            )
            sesion = obtener_sesion_activa()
            avatar_actual = sesion.get("avatar", "") if sesion else ""
            res_usuario = {
                **usuario_valido,
                "avatar": avatar_actual,
                "area": sesion.get("area", "") if sesion else area_val
            }
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

    def obtener_servicios(self, area: str | None = None):
        """
        Retorna la lista de proyectos activos cargados desde la pestaña '0_proyectos'.
        Si se especifica 'area' (por ejemplo cuando RRHH carga para otro empleado),
        se filtra por dicha área.
        Si el usuario es de área 'N' (Núcleo) o 'RRHH', o el área solicitada es 'N', 'RRHH' o 'TODOS',
        o no se especifica área, retorna todos los proyectos.
        """
        sesion = obtener_sesion_activa()
        area_sesion = (sesion.get("area", "") if sesion else "").strip().upper()

        area_filtro = area.strip().upper() if (area and isinstance(area, str)) else area_sesion

        proyectos = obtener_proyectos_cache()
        if not proyectos:
            proyectos = obtener_proyectos_remotos()
            if proyectos:
                guardar_proyectos_cache(proyectos)

        if not proyectos:
            return SERVICIOS_DISPONIBLES

        todos = []
        vistos_todos = set()
        for p in proyectos:
            if p.get("denominacion"):
                nom = p["denominacion"].strip()
                if nom not in vistos_todos:
                    vistos_todos.add(nom)
                    todos.append(nom)

        # Si el área a consultar es N (Núcleo), RRHH, TODOS o no hay filtro definido: ven todos los proyectos
        if not area_filtro or area_filtro in ["N", "RRHH", "TODOS"]:
            return todos

        # Proyectos filtrados por el área indicada (ej: 'I', 'A', 'M', 'S', 'VYM')
        proyectos_filtrados = []
        vistos_area = set()
        for p in proyectos:
            if p.get("area", "").strip().upper() == area_filtro and p.get("denominacion"):
                nom = p["denominacion"].strip()
                if nom not in vistos_area:
                    vistos_area.add(nom)
                    proyectos_filtrados.append(nom)

        # Si el área tiene proyectos, los retornamos; si no tuviese, retornamos todos como fallback
        return proyectos_filtrados if proyectos_filtrados else todos

    def guardar_check_diario(self, datos: dict):
        """
        Recibe el reporte diario desde React y lo almacena localmente
        con el esquema exacto de Google Sheets:
        id_asistencia, empleado, fecha, tipo_ocf, servicio, horas, instrumental, usuario_mail, fecha_hora, dia_semana, feriado
        Soporta carga para otro usuario (RRHH) y rango de fechas para Campaña / Campo.
        """
        if not isinstance(datos, dict):
            return {"exito": False, "error": "Formato de datos inválido."}

        fecha = datos.get("fecha")
        lugar = datos.get("lugar") or datos.get("tipo_ocf")

        if not (isinstance(fecha, str) and isinstance(lugar, str)):
            return {"exito": False, "error": "La fecha y la ubicación son obligatorias."}

        sesion = obtener_sesion_activa()
        es_rrhh = sesion and sesion.get("area", "").strip().upper() == "RRHH"
        if es_rrhh and datos.get("empleado"):
            empleado = str(datos["empleado"]).strip()
            usuario_mail = str(datos.get("usuario_mail", "")).strip()
        else:
            empleado = sesion["nombre"] if sesion else str(datos.get("empleado", "Empleado"))
            usuario_mail = sesion["mail"] if sesion and sesion.get("mail") else str(datos.get("usuario_mail", ""))

        fecha_hora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Calcular lista de fechas si se envió un rango de fechas (Campaña / Campo)
        fechas_a_cargar = []
        fecha_inicio = fecha
        fecha_fin = datos.get("fecha_fin")
        if fecha_fin and fecha_inicio and fecha_fin != fecha_inicio:
            from datetime import timedelta
            try:
                d_ini = datetime.strptime(fecha_inicio, "%Y-%m-%d")
                d_fin = datetime.strptime(fecha_fin, "%Y-%m-%d")
                if d_ini > d_fin:
                    d_ini, d_fin = d_fin, d_ini
                curr = d_ini
                while curr <= d_fin:
                    fechas_a_cargar.append(curr.strftime("%Y-%m-%d"))
                    curr += timedelta(days=1)
            except Exception:
                fechas_a_cargar = [fecha_inicio]
        elif isinstance(datos.get("fechas"), list) and len(datos["fechas"]) > 0:
            fechas_a_cargar = [str(f).strip() for f in datos["fechas"] if f]
        else:
            fechas_a_cargar = [fecha_inicio]

        proyectos = datos.get("proyectos")
        es_franco = lugar.strip().lower() == "franco"

        for dia_f in fechas_a_cargar:
            # Caso 1: Franco (Día de descanso)
            if es_franco:
                guardar_registro_asistencia(
                    id_asistencia=str(uuid.uuid4()),
                    empleado=empleado,
                    fecha=dia_f,
                    tipo_ocf="Franco",
                    servicio="Franco",
                    horas=0.0,
                    instrumental="",
                    usuario_mail=usuario_mail,
                    fecha_hora=fecha_hora,
                    sincronizado=False
                )
            # Caso 2: Múltiples proyectos provistos en datos['proyectos']
            elif isinstance(proyectos, list) and len(proyectos) > 0:
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
                            fecha=dia_f,
                            tipo_ocf=lugar,
                            servicio=srv,
                            horas=hrs,
                            instrumental="",
                            usuario_mail=usuario_mail,
                            fecha_hora=fecha_hora,
                            sincronizado=False
                        )
            # Caso 3: Sin proyectos seleccionados (Tiempo dedicado al Área)
            else:
                srv_area = str(datos.get("servicio", "Tiempo dedicado al Área")).strip() or "Tiempo dedicado al Área"
                try:
                    hrs = float(datos.get("horas", 8))
                except (ValueError, TypeError):
                    hrs = 8.0

                guardar_registro_asistencia(
                    id_asistencia=str(uuid.uuid4()),
                    empleado=empleado,
                    fecha=dia_f,
                    tipo_ocf=lugar,
                    servicio=srv_area,
                    horas=hrs,
                    instrumental="",
                    usuario_mail=usuario_mail,
                    fecha_hora=fecha_hora,
                    sincronizado=False
                )

        threading.Thread(target=sincronizar_pendientes, daemon=True).start()
        cant_dias = len(fechas_a_cargar)
        msj = f"Reporte registrado correctamente ({cant_dias} día{'s' if cant_dias > 1 else ''})."
        return {"exito": True, "mensaje": msj}

    def modificar_registro(self, datos: dict):
        """Actualiza un reporte ya existente en el historial local y sincroniza con Sheets."""
        if not isinstance(datos, dict) or "id" not in datos:
            return {"exito": False, "error": "Identificador de reporte no provisto."}
        try:
            id_reg = int(datos["id"])
        except (ValueError, TypeError):
            return {"exito": False, "error": "Identificador de registro no válido."}

        fecha = str(datos.get("fecha", "")).strip()
        lugar = str(datos.get("lugar") or datos.get("tipo_ocf", "")).strip()
        servicio = str(datos.get("servicio", "")).strip()
        try:
            horas = float(datos.get("horas", 0.0))
        except (ValueError, TypeError):
            horas = 0.0

        if not fecha or not lugar or not servicio:
            return {"exito": False, "error": "Todos los campos son obligatorios para modificar el reporte."}

        ok = actualizar_registro_asistencia(
            id_registro=id_reg,
            fecha=fecha,
            tipo_ocf=lugar,
            servicio=servicio,
            horas=horas
        )
        if ok:
            threading.Thread(target=sincronizar_pendientes, daemon=True).start()
            return {"exito": True, "mensaje": "Reporte modificado exitosamente."}
        return {"exito": False, "error": "No se encontró el registro a modificar en la base local."}

    def obtener_todos_usuarios(self, area: str | None = None):
        """Retorna la lista de empleados activos para la selección delegada de RRHH, opcionalmente filtrada por área."""
        try:
            usuarios_remotos = obtener_usuarios_remotos()
            if usuarios_remotos:
                guardar_usuarios_cache(usuarios_remotos)
                usuarios = usuarios_remotos
            else:
                usuarios = obtener_usuarios_cache() or EMPLEADOS_AUTORIZADOS
        except Exception as e:
            print(f"[Catálogos] Aviso al consultar usuarios remotos para RRHH: {e}")
            usuarios = obtener_usuarios_cache() or EMPLEADOS_AUTORIZADOS

        if area and isinstance(area, str) and area.strip().upper() != "TODOS":
            area_filtro = area.strip().upper()
            return [u for u in usuarios if (u.get("area") or "").strip().upper() == area_filtro]

        return usuarios

    def obtener_historial(self):
        """
        Retorna los registros para la pestaña de historial filtrados por el empleado en sesión.
        Verifica previamente contra '1_asistencia_informada' en Google Sheets y depura
        aquellos registros que hayan sido borrados de la hoja de cálculo.
        """
        sesion = obtener_sesion_activa()
        if not sesion:
            return []

        # Chequeo contra Google Sheets para no mostrar registros borrados en la hoja
        try:
            ids_remotos = obtener_ids_asistencia_remotos()
            if ids_remotos:
                cant_depurados = depurar_registros_eliminados(ids_remotos)
                if cant_depurados > 0:
                    print(f"[Historial] Se depuraron {cant_depurados} registro(s) eliminados de Google Sheets.")
        except Exception as e:
            print(f"[Historial] Chequeo de registros borrados omitido: {e}")

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

    def redimensionar_ventana(self, ancho: int, alto: int):
        """Ajusta el tamaño de la ventana de pywebview dinámicamente."""
        if self._ventana:
            try:
                self._ventana.resize(ancho, alto)
            except Exception as e:
                print(f"[Ventana] Error al redimensionar: {e}")
        return {"exito": True}

    def maximizar_ventana(self):
        """Maximiza la ventana de pywebview a pantalla completa."""
        if self._ventana:
            try:
                self._ventana.maximize()
            except Exception as e:
                print(f"[Ventana] Error al maximizar: {e}")
        return {"exito": True}

    def restaurar_ventana(self):
        """Restaura la ventana de pywebview a su tamaño compacto habitual (440x660)."""
        if self._ventana:
            try:
                self._ventana.restore()
                self._ventana.resize(440, 660)
            except Exception as e:
                print(f"[Ventana] Error al restaurar: {e}")
        return {"exito": True}

    def guardar_roster(self, datos: dict):
        """Guarda o actualiza un registro de roster con identificador UUID y sincroniza con Google Sheets."""
        try:
            res = guardar_registro_roster(datos)
            if not res or not res.get("exito"):
                return res

            # Cargar los registros en el historial y Google Sheets siguiendo el mismo concepto
            # que un registro normal, pero en lugar de campo/campaña debe decir "Roster"
            empleado = str(datos.get("empleado", "")).strip()
            proyecto = str(datos.get("proyecto", "")).strip()
            fecha_inicio = str(datos.get("fecha_inicio", "")).strip()
            fecha_fin = str(datos.get("fecha_fin", "")).strip()
            tipo = str(datos.get("tipo", "Campo")).strip()

            # Obtener correo del empleado para las columnas de Google Sheets
            usuario_mail = str(datos.get("usuario_mail", "")).strip()
            if not usuario_mail and empleado:
                usuarios_disp = obtener_usuarios_cache() or EMPLEADOS_AUTORIZADOS
                emp_match = next((u for u in usuarios_disp if u.get("nombre", "").strip().lower() == empleado.lower()), None)
                if emp_match:
                    usuario_mail = emp_match.get("mail") or emp_match.get("email") or ""

            # Determinar lista de fechas del rango
            fechas_a_cargar = []
            if fecha_inicio and fecha_fin:
                from datetime import datetime as dt, timedelta
                try:
                    d_ini = dt.strptime(fecha_inicio, "%Y-%m-%d")
                    d_fin = dt.strptime(fecha_fin, "%Y-%m-%d")
                    if d_ini > d_fin:
                        d_ini, d_fin = d_fin, d_ini
                    curr = d_ini
                    while curr <= d_fin:
                        fechas_a_cargar.append(curr.strftime("%Y-%m-%d"))
                        curr += timedelta(days=1)
                except Exception:
                    fechas_a_cargar = [fecha_inicio]
            elif fecha_inicio:
                fechas_a_cargar = [fecha_inicio]

            es_campo = (tipo.lower() == "campo")
            # En lugar de campo/campaña debe decir "Roster"
            tipo_ocf = "Roster" if es_campo else "Franco"
            servicio = proyecto if es_campo else "Franco"
            horas = 8.0 if es_campo else 0.0
            fecha_hora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            with obtener_conexion() as conn:
                cursor = conn.cursor()
                for dia_f in fechas_a_cargar:
                    cursor.execute(
                        "SELECT id FROM historial WHERE empleado = ? AND fecha = ?",
                        (empleado, dia_f)
                    )
                    existente = cursor.fetchone()
                    if existente:
                        actualizar_registro_asistencia(
                            id_registro=existente["id"],
                            fecha=dia_f,
                            tipo_ocf=tipo_ocf,
                            servicio=servicio,
                            horas=horas
                        )
                    else:
                        guardar_registro_asistencia(
                            id_asistencia=str(uuid.uuid4()),
                            empleado=empleado,
                            fecha=dia_f,
                            tipo_ocf=tipo_ocf,
                            servicio=servicio,
                            horas=horas,
                            instrumental="",
                            usuario_mail=usuario_mail,
                            fecha_hora=fecha_hora,
                            sincronizado=False
                        )

            # Disparar sincronización en segundo plano con Google Sheets
            threading.Thread(target=sincronizar_pendientes, daemon=True).start()

            return res
        except Exception as e:
            print(f"[Rosters] Error al guardar roster y sincronizar con Google Sheets: {e}")
            return {"exito": False, "error": str(e)}

    def obtener_rosters(self, fecha_desde: str | None = None, fecha_hasta: str | None = None):
        """Retorna los registros de roster que se superpongan con el período especificado."""
        try:
            return obtener_rosters(fecha_desde, fecha_hasta)
        except Exception as e:
            print(f"[Rosters] Error al obtener rosters: {e}")
            return []

    def eliminar_roster(self, id_roster: str):
        """Elimina un registro de roster por su ID UUID."""
        try:
            exito = eliminar_registro_roster(id_roster)
            return {"exito": exito}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def exportar_roster_excel(self, anio: int, mes: int, proyecto: str = ""):
        """Abre un diálogo nativo de Windows para guardar el archivo Excel de Roster por proyecto en 3 hojas."""
        try:
            nombres_meses = [
                "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
            ]
            nombre_mes = nombres_meses[mes] if 1 <= mes <= 12 else str(mes)
            
            import re
            proy_limpio = proyecto.strip() if isinstance(proyecto, str) else ""
            if proy_limpio and proy_limpio.upper() != "TODOS":
                # Limpiar caracteres no válidos para nombres de archivo en Windows
                proy_slug = re.sub(r'[\\/*?:"<>|]', "", proy_limpio).strip()
                proy_slug = (proy_slug[:35]).strip()
                nombre_sugerido = f"Roster_{proy_slug}_{nombre_mes}_{anio}.xlsx"
            else:
                nombre_sugerido = f"Roster_Ingeap_{nombre_mes}_{anio}.xlsx"
            
            ruta_destino = None
            if self._ventana:
                try:
                    dialog_mode = getattr(getattr(webview, 'FileDialog', object), 'SAVE', getattr(webview, 'SAVE_DIALOG', 0))
                    res = self._ventana.create_file_dialog(
                        dialog_mode,
                        save_filename=nombre_sugerido,
                        file_types=('Archivos de Excel (*.xlsx)', 'Todos los archivos (*.*)')
                    )
                    if res:
                        ruta_destino = res if isinstance(res, str) else res[0]
                except Exception as err_dialog:
                    print(f"[Rosters] Error en create_file_dialog: {err_dialog}")

            if not ruta_destino:
                return {"exito": False, "cancelado": True}

            return generar_excel_roster_mes(anio, mes, ruta_destino, proyecto=proy_limpio)
        except Exception as e:
            print(f"[Rosters] Error al exportar Excel: {e}")
            return {"exito": False, "error": str(e)}



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


APP_VERSION = "1.3.0"

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


def verificar_actualizacion_github():
    """Consulta la API de GitHub Releases para comprobar si existe una versión más reciente."""
    try:
        cfg = cargar_configuracion()
        repo = cfg.get("github_repo", "")
        if not repo:
            return {"actualizacion_disponible": False, "version_actual": APP_VERSION}

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
            version_remota = data.get("tag_name", "").lstrip("v").strip()
            assets = data.get("assets", [])

            # Priorizar CheckDiarioIngeap.exe para el reemplazo in-place del ejecutable principal
            exe_asset = next((a for a in assets if a.get("name", "").strip().lower() == "checkdiarioingeap.exe"), None)
            if not exe_asset:
                exe_asset = next((a for a in assets if "instalador" not in a.get("name", "").lower() and a.get("name", "").lower().endswith(".exe")), None)
            if not exe_asset:
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
    """
    Descarga el nuevo .exe en TEMP y ejecuta el reemplazo en segundo plano.
    Diseñado específicamente para compatibilidad total con Windows 11, evitando bloqueos
    por escaneo en tiempo real de Microsoft Defender y permisos de SmartScreen.
    """
    if not getattr(sys, "frozen", False):
        return {"exito": False, "error": "La actualización automática solo aplica sobre el ejecutable (.exe)."}

    try:
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

        # Desbloquear permisos de Windows 11 SmartScreen en el archivo recién descargado (quitar Zone.Identifier)
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
        ruta_bat = os.path.join(temp_dir, "update_check_diario.bat")

        # Script Batch robusto con bucle de espera y reintentos (hasta 30 segundos)
        # para tolerar el escaneo en tiempo real de Microsoft Defender y la liberación de locks de Windows 11
        contenido_bat = f"""@echo off
setlocal enabledelayedexpansion

:: 1. Finalizar cualquier proceso previo para liberar bloqueos del binario
taskkill /F /IM CheckDiarioIngeap.exe >nul 2>&1

:: 2. Bucle de reintentos de reemplazo (espera a que Defender y Windows liberen el archivo)
set INTENTO=0
:INTENTO_COPIA
set /a INTENTO+=1
timeout /t 1 /nobreak >nul

copy /y "{nuevo_exe}" "{ruta_actual_exe}" >nul 2>&1
if !ERRORLEVEL! equ 0 goto EXITO_COPIA

:: Reintentar forzar cierre si continúa ocupado
taskkill /F /IM CheckDiarioIngeap.exe >nul 2>&1

if !INTENTO! lss 30 goto INTENTO_COPIA

:: Registro de diagnóstico en caso de fallo
echo [ERROR] No se pudo reemplazar CheckDiarioIngeap.exe tras 30 intentos. > "%TEMP%\\checkdiario_update_fail.log"
goto LIMPIEZA

:EXITO_COPIA
:: 3. Limpiar archivo temporal de descarga
del /f /q "{nuevo_exe}" >nul 2>&1

:: 4. Desbloquear la aplicación actualizada para Windows 11 SmartScreen (quitar Zone.Identifier)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '{ruta_actual_exe}' -ErrorAction SilentlyContinue" >nul 2>&1

:: 5. Limpiar variables de entorno de PyInstaller para asegurar inicio limpio
set PYINSTALLER_RESET_ENVIRONMENT=1
set _PYI_APPLICATION_HOME_DIR=
set _PYI_PARENT_PROCESS_LEVEL=
set _PYI_ARCHIVE_FILE=
set _PYI_SPLASH_IPC=

:: 6. Lanzar la aplicación desde su carpeta oficial de instalación
cd /d "{dir_actual_exe}"
start "" /D "{dir_actual_exe}" "{ruta_actual_exe}"

:LIMPIEZA
del "%~f0" >nul 2>&1
"""
        with open(ruta_bat, "w", encoding="utf-8") as f:
            f.write(contenido_bat)

        clean_env = os.environ.copy()
        clean_env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
        for pyi_var in ("_PYI_APPLICATION_HOME_DIR", "_PYI_PARENT_PROCESS_LEVEL", "_PYI_ARCHIVE_FILE", "_PYI_SPLASH_IPC"):
            clean_env.pop(pyi_var, None)

        subprocess.Popen(["cmd.exe", "/c", ruta_bat], env=clean_env, creationflags=no_window_flag)
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

    # 2. Creamos las tablas locales si no existen aún
    inicializar_bd()

    # Intentar sincronizar en segundo plano registros pendientes de sesiones previas
    threading.Thread(target=sincronizar_pendientes, daemon=True).start()

    # Sincronizar en segundo plano proyectos y usuarios desde Google Sheets
    threading.Thread(target=sincronizar_catalogos_sheets, daemon=True).start()

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
    import multiprocessing
    multiprocessing.freeze_support()
    asegurar_instancia_unica()
    main()