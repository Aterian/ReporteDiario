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
    guardar_no_laborales_cache,
    depurar_registros_eliminados,
    actualizar_registro_asistencia,
    guardar_registro_roster,
    obtener_rosters,
    eliminar_registro_roster,
    obtener_conexion,
    obtener_id_empleado,
    obtener_id_proyecto,
    eliminar_registro_asistencia,
    obtener_historial_otros_empleados,
    obtener_todos_registros_empleado,
    obtener_version_instalada,
    guardar_version_instalada,
    reconciliar_rosters_con_historial,
    purgar_rosters_huerfanos,
    vaciar_rosters_locales,
    reconstruir_rosters_desde_historial
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
    obtener_no_laborales_remotos,
    obtener_ids_asistencia_remotos,
    eliminar_registro_remoto,
    sincronizar_desde_sheets_hacia_local,
    deduplicar_hoja_remota
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
    "Esperando sincronizacion"
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


def sincronizar_todo_desde_sheets(motivo: str = "inicio"):
    """
    Realiza una reconciliación e inspección exhaustiva de la base local contra Google Sheets:
    - Sincroniza registros pendientes locales previos
    - Actualiza proyectos activos ('0_proyectos')
    - Actualiza nómina de empleados autorizados ('0_usuarios')
    - Actualiza calendario de días no laborales
    - Compara y purga registros de '1_asistencia_informada' (eliminando locales ausentes en Sheets)
    """
    print(f"[SyncGlobal] Iniciando reconciliación total contra Google Sheets ({motivo})...")
    try:
        try:
            sincronizar_pendientes()
        except Exception as e_pend:
            print(f"[SyncGlobal] Aviso al sincronizar pendientes: {e_pend}")

        p = obtener_proyectos_remotos()
        if p:
            guardar_proyectos_cache(p)

        u = obtener_usuarios_remotos()
        if u:
            guardar_usuarios_cache(u)
            sesion = obtener_sesion_activa()
            if sesion:
                dni_act = sesion.get("dni", "").strip()
                u_match = next((usr for usr in u if str(usr.get("dni", "")).strip() == dni_act), None)
                if u_match and u_match.get("area") and sesion.get("area") != u_match["area"]:
                    guardar_sesion_activa(
                        nombre=sesion.get("nombre", ""),
                        dni=dni_act,
                        mail=sesion.get("mail", ""),
                        avatar=sesion.get("avatar", ""),
                        area=u_match["area"]
                    )

        nl = obtener_no_laborales_remotos()
        if nl:
            guardar_no_laborales_cache(nl)

        res_asist = sincronizar_desde_sheets_hacia_local()
        purgar_rosters_huerfanos()
        print(f"[SyncGlobal] Reconciliación ({motivo}) exitosa: {res_asist}")
        return True
    except Exception as e:
        print(f"[SyncGlobal] Error en reconciliación total ({motivo}): {e}")
        return False


# [FN-04.00] Reglas de Permisos y Roles de Backend
import unicodedata

def _normalizar_texto(texto: str | None) -> str:
    if not texto:
        return ""
    return unicodedata.normalize("NFD", str(texto).lower()).encode("ascii", "ignore").decode("utf-8").strip()

def es_ivan_valentin(usuario: dict | None) -> bool:
    if not usuario:
        return False
    nombre = _normalizar_texto(usuario.get("nombre"))
    mail = _normalizar_texto(usuario.get("mail") or usuario.get("email"))
    dni = str(usuario.get("dni") or "").strip()
    return (("valentin" in nombre and ("ivan" in nombre or "iván" in nombre)) or
            mail == "sge@ingeap.com" or
            dni == "40158951")

def es_justina_bertolozzi(usuario: dict | None) -> bool:
    if not usuario:
        return False
    nombre = _normalizar_texto(usuario.get("nombre"))
    mail = _normalizar_texto(usuario.get("mail") or usuario.get("email"))
    dni = str(usuario.get("dni") or "").strip()
    return (("justina" in nombre and "bertolozzi" in nombre) or
            mail == "rrhh@ingeap.com" or
            dni == "45411162")

def es_area_rrhh(usuario: dict | None) -> bool:
    if not usuario:
        return False
    area = (usuario.get("area") or "").strip().upper()
    return area == "RRHH" or es_justina_bertolozzi(usuario)

def es_area_nucleo(usuario: dict | None) -> bool:
    if not usuario:
        return False
    area = (usuario.get("area") or "").strip().upper()
    return area == "N"

def puede_acceder_roster(usuario: dict | None) -> bool:
    return es_justina_bertolozzi(usuario) or es_ivan_valentin(usuario)

def puede_ver_historial_otros(usuario: dict | None) -> bool:
    return es_area_rrhh(usuario) or es_area_nucleo(usuario) or es_ivan_valentin(usuario)

def puede_modificar_registro_empleado(usuario: dict | None, empleado_registro: str, id_empleado_reg: str = "") -> bool:
    if not usuario:
        return False
    if es_justina_bertolozzi(usuario) or es_ivan_valentin(usuario):
        return True
    nombre_u = _normalizar_texto(usuario.get("nombre"))
    emp_reg = _normalizar_texto(empleado_registro)
    dni_u = str(usuario.get("dni") or "").strip()
    id_u = str(usuario.get("id_origen") or usuario.get("id_usuario") or "").strip()
    id_reg = str(id_empleado_reg or "").strip()

    es_propio = (emp_reg and nombre_u and emp_reg == nombre_u) or \
                (id_reg and (id_reg == id_u or id_reg == dni_u))
    return bool(es_propio)


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

    def refrescar_catalogos_sheets(self):
        """
        Descarga remotamente proyectos, usuarios autorizados y días no laborales
        desde Google Sheets para actualizar las cachés locales SQLite en tiempo real,
        y reconcilia la tabla '1_asistencia_informada' eliminando registros locales ausentes en Sheets.
        """
        try:
            # 1. Intentar subir primero cualquier reporte local pendiente
            try:
                sincronizar_pendientes()
            except Exception as e_pend:
                print(f"[Refrescar] Aviso al sincronizar pendientes: {e_pend}")

            # 2. Descargar y actualizar proyectos
            p_remotos = obtener_proyectos_remotos()
            if p_remotos:
                guardar_proyectos_cache(p_remotos)

            # 3. Descargar y actualizar usuarios
            u_remotos = obtener_usuarios_remotos()
            if u_remotos:
                guardar_usuarios_cache(u_remotos)
                sesion = obtener_sesion_activa()
                if sesion:
                    dni_act = sesion.get("dni", "").strip()
                    u_match = next((u for u in u_remotos if str(u.get("dni", "")).strip() == dni_act), None)
                    if u_match and u_match.get("area") and sesion.get("area") != u_match["area"]:
                        guardar_sesion_activa(
                            nombre=sesion.get("nombre", ""),
                            dni=dni_act,
                            mail=sesion.get("mail", ""),
                            avatar=sesion.get("avatar", ""),
                            area=u_match["area"]
                        )

            # 4. Descargar y actualizar días no laborales
            nl_remotos = obtener_no_laborales_remotos()
            if nl_remotos:
                guardar_no_laborales_cache(nl_remotos)

            # 4.1 Reconciliar rosters con historial para recuperar cualquier día faltante
            try:
                reconciliar_rosters_con_historial()
            except Exception as e_rec:
                print(f'[Refrescar] Aviso al reconciliar rosters: {e_rec}')

            # 5. Sincronizar sincrónicamente '1_asistencia_informada', purgando registros locales inexistentes
            res_asist = sincronizar_desde_sheets_hacia_local()
            cant_del = res_asist.get("eliminados", 0) if isinstance(res_asist, dict) else 0
            cant_ins = res_asist.get("insertados", 0) if isinstance(res_asist, dict) else 0
            cant_act = res_asist.get("actualizados", 0) if isinstance(res_asist, dict) else 0

            # 5.1 Reconstruir en la tabla local rosters todos los turnos que hayan venido de Google Sheets
            try:
                reconstruir_rosters_desde_historial()
            except Exception as e_rec_h:
                print(f"[Refrescar] Aviso al reconstruir rosters: {e_rec_h}")

            # 6. Purgar también cualquier registro de la tabla rosters cuyos días ya no existan en historial
            cant_rosters_del = purgar_rosters_huerfanos()

            cant_p = len(p_remotos) if p_remotos else 0
            cant_u = len(u_remotos) if u_remotos else 0

            msj = f"Catálogos y asistencias actualizados ({cant_p} proyectos, {cant_u} empleados)."
            if cant_del > 0 or cant_rosters_del > 0:
                msj += f" Se depuraron {cant_del} asistencia(s) y {cant_rosters_del} turno(s) de roster eliminados en Google Sheets."

            return {
                "exito": True,
                "mensaje": msj,
                "proyectos": cant_p,
                "usuarios": cant_u,
                "asistencias_insertadas": cant_ins,
                "asistencias_actualizadas": cant_act,
                "asistencias_depuradas": cant_del,
                "rosters_depurados": cant_rosters_del
            }
        except Exception as e:
            print(f"[Catálogos] Error al refrescar desde Sheets: {e}")
            return {"exito": False, "error": str(e)}

    def guardar_check_diario(self, datos: dict):
        """
        Recibe el reporte diario desde React y lo almacena localmente
        con el esquema exacto de Google Sheets:
        id_asistencia, empleado, fecha, tipo_ocf, servicio, horas, instrumental, usuario_mail, fecha_hora, dia_semana, feriado, id_empleado, id_proyecto
        Soporta carga para otro usuario (RRHH), modalidades de Vacaciones y Licencia, y rango de fechas ampliado.
        """
        if not isinstance(datos, dict):
            return {"exito": False, "error": "Formato de datos inválido."}

        fecha = datos.get("fecha") or (datos.get("fechas")[0] if isinstance(datos.get("fechas"), list) and len(datos.get("fechas")) > 0 else None)
        lugar = datos.get("lugar") or datos.get("tipo_ocf")

        if not (isinstance(fecha, str) and isinstance(lugar, str)):
            return {"exito": False, "error": "La fecha y la ubicación son obligatorias."}

        sesion = obtener_sesion_activa()
        cargado_por = sesion["nombre"] if sesion else "Empleado"
        es_rrhh = sesion and sesion.get("area", "").strip().upper() == "RRHH"

        if es_rrhh and datos.get("empleado"):
            empleado = str(datos["empleado"]).strip()
            usuario_mail = str(datos.get("usuario_mail", "")).strip()
        else:
            empleado = sesion["nombre"] if sesion else str(datos.get("empleado", "Empleado"))
            usuario_mail = sesion["mail"] if sesion and sesion.get("mail") else str(datos.get("usuario_mail", ""))

        id_empleado = str(datos.get("id_empleado", "")).strip() or obtener_id_empleado(empleado)
        fecha_hora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Calcular lista de fechas si se envió un rango de fechas
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
        lugar_norm = lugar.strip().lower()
        sub_franco = str(datos.get("tipo_franco") or datos.get("sub_franco") or "").strip().lower()

        es_franco_obra = (lugar_norm in ["franco obra", "franco de obra"]) or (lugar_norm == "franco" and "obra" in sub_franco and "trabajado" not in sub_franco)
        es_franco_obra_trabajado = (lugar_norm in ["franco obra trabajado", "franco de obra trabajado"]) or (lugar_norm == "franco" and "obra" in sub_franco and "trabajado" in sub_franco)
        es_franco_ofic_trabajado = (lugar_norm in ["franco ofic trabajado", "franco de oficina trabajado"]) or (lugar_norm == "franco" and ("oficina" in sub_franco or "ofic" in sub_franco) and "trabajado" in sub_franco)
        es_franco_trabajado_gen = (lugar_norm == "franco trabajado") or (lugar_norm == "franco" and sub_franco == "franco trabajado")
        es_franco_normal = (lugar_norm == "franco" and not (es_franco_obra or es_franco_obra_trabajado or es_franco_ofic_trabajado or es_franco_trabajado_gen)) or (lugar_norm in ["franco de oficina", "franco oficina"])
        es_feriado_trabajado = (lugar_norm == "feriado trabajado")
        es_vacaciones = (lugar_norm == "vacaciones")
        es_licencia = (lugar_norm == "licencia")

        for dia_f in fechas_a_cargar:
            # Caso: Franco Obra (0 hs, nro servicio)
            if es_franco_obra:
                proy_asignado = str(datos.get("proyecto") or datos.get("servicio") or "").strip()
                if proy_asignado.lower().startswith("franco de obra - "):
                    proy_asignado = proy_asignado[17:].strip()
                id_proy = str(datos.get("id_proyecto", "")).strip() or (obtener_id_proyecto(proy_asignado) if proy_asignado else "")
                guardar_registro_asistencia(
                    id_asistencia=str(uuid.uuid4()),
                    empleado=empleado,
                    fecha=dia_f,
                    tipo_ocf="Franco",
                    servicio=proy_asignado or "Franco",
                    horas=0.0,
                    instrumental="",
                    usuario_mail=usuario_mail,
                    fecha_hora=fecha_hora,
                    sincronizado=False,
                    cargado_por=cargado_por,
                    id_empleado=id_empleado,
                    id_proyecto=id_proy
                )
            # Caso: Franco Obra Trabajado (computa hs, nro servicio)
            elif es_franco_obra_trabajado:
                proy_asignado = str(datos.get("proyecto") or datos.get("servicio") or "").strip()
                try:
                    hrs = float(datos.get("horas", 8.0))
                except Exception:
                    hrs = 8.0
                id_proy = str(datos.get("id_proyecto", "")).strip() or (obtener_id_proyecto(proy_asignado) if proy_asignado else "")
                guardar_registro_asistencia(
                    id_asistencia=str(uuid.uuid4()),
                    empleado=empleado,
                    fecha=dia_f,
                    tipo_ocf="Franco Obra Trabajado",
                    servicio=proy_asignado or "Franco Obra Trabajado",
                    horas=hrs,
                    instrumental="",
                    usuario_mail=usuario_mail,
                    fecha_hora=fecha_hora,
                    sincronizado=False,
                    cargado_por=cargado_por,
                    id_empleado=id_empleado,
                    id_proyecto=id_proy
                )
            # Caso: Franco Ofic Trabajado (computa hs, nro servicio / area)
            elif es_franco_ofic_trabajado or es_franco_trabajado_gen:
                srv = str(datos.get("proyecto") or datos.get("servicio") or datos.get("area") or "Franco Ofic Trabajado").strip()
                try:
                    hrs = float(datos.get("horas", 8.0))
                except Exception:
                    hrs = 8.0
                id_proy = str(datos.get("id_proyecto", "")).strip() or obtener_id_proyecto(srv)
                guardar_registro_asistencia(
                    id_asistencia=str(uuid.uuid4()),
                    empleado=empleado,
                    fecha=dia_f,
                    tipo_ocf="Franco Ofic Trabajado",
                    servicio=srv,
                    horas=hrs,
                    instrumental="",
                    usuario_mail=usuario_mail,
                    fecha_hora=fecha_hora,
                    sincronizado=False,
                    cargado_por=cargado_por,
                    id_empleado=id_empleado,
                    id_proyecto=id_proy
                )
            # Caso: Franco normal / de oficina (0 hs, servicio = area para nucleo, rrhh, aplicaciones, vym)
            elif es_franco_normal:
                srv_area = str(datos.get("area") or "").strip()
                if not srv_area and empleado:
                    usuarios_disp = obtener_usuarios_cache() or []
                    emp_match = next((u for u in usuarios_disp if u.get("nombre", "").strip().lower() == empleado.lower()), None)
                    if emp_match:
                        code = str(emp_match.get("area") or "").strip().upper()
                        mapa = {
                            'A': 'Aplicaciones',
                            'N': 'Núcleo',
                            'I': 'Ingeniería',
                            'M': 'Mensura',
                            'S': 'SIG',
                            'RRHH': 'RRHH',
                            'VYM': 'Ventas y Marketing'
                        }
                        srv_area = mapa.get(code, code)
                if not srv_area:
                    srv_area = str(datos.get("servicio") or "Área").strip()
                    if srv_area.lower() in ["franco", "franco de oficina"]:
                        srv_area = "Área"

                guardar_registro_asistencia(
                    id_asistencia=str(uuid.uuid4()),
                    empleado=empleado,
                    fecha=dia_f,
                    tipo_ocf="Franco",
                    servicio=srv_area,
                    horas=0.0,
                    instrumental="",
                    usuario_mail=usuario_mail,
                    fecha_hora=fecha_hora,
                    sincronizado=False,
                    cargado_por=cargado_por,
                    id_empleado=id_empleado,
                    id_proyecto=""
                )
            # Caso: Feriado Trabajado (computa hs, nro servicio)
            elif es_feriado_trabajado:
                try:
                    hrs = float(datos.get("horas", 8.0))
                except Exception:
                    hrs = 8.0
                srv_fer = str(datos.get("proyecto") or datos.get("servicio") or "Feriado Trabajado").strip()
                id_proy = str(datos.get("id_proyecto", "")).strip() or obtener_id_proyecto(srv_fer)
                guardar_registro_asistencia(
                    id_asistencia=str(uuid.uuid4()),
                    empleado=empleado,
                    fecha=dia_f,
                    tipo_ocf="Feriado Trabajado",
                    servicio=srv_fer,
                    horas=hrs,
                    instrumental="",
                    usuario_mail=usuario_mail,
                    fecha_hora=fecha_hora,
                    feriado="SI",
                    sincronizado=False,
                    cargado_por=cargado_por,
                    id_empleado=id_empleado,
                    id_proyecto=id_proy
                )
            # Caso: Vacaciones (0 hs, vacaciones)
            elif es_vacaciones:
                guardar_registro_asistencia(
                    id_asistencia=str(uuid.uuid4()),
                    empleado=empleado,
                    fecha=dia_f,
                    tipo_ocf="Vacaciones",
                    servicio="Vacaciones",
                    horas=0.0,
                    instrumental="",
                    usuario_mail=usuario_mail,
                    fecha_hora=fecha_hora,
                    sincronizado=False,
                    cargado_por=cargado_por,
                    id_empleado=id_empleado,
                    id_proyecto=""
                )
            # Caso: Licencia (0 hs, tipos de licencia)
            elif es_licencia:
                tipo_lic = str(datos.get("tipo_licencia") or datos.get("servicio") or "Licencia").strip()
                desc_lic = tipo_lic if tipo_lic.lower().startswith("licencia") else f"Licencia - {tipo_lic}"
                guardar_registro_asistencia(
                    id_asistencia=str(uuid.uuid4()),
                    empleado=empleado,
                    fecha=dia_f,
                    tipo_ocf="Licencia",
                    servicio=desc_lic,
                    horas=0.0,
                    instrumental="",
                    usuario_mail=usuario_mail,
                    fecha_hora=fecha_hora,
                    sincronizado=False,
                    cargado_por=cargado_por,
                    id_empleado=id_empleado,
                    id_proyecto=""
                )
            # Caso 4: Múltiples proyectos provistos en datos['proyectos']
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

                        id_proy = str(item.get("id_proyecto", "")).strip() or obtener_id_proyecto(srv)

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
                            sincronizado=False,
                            cargado_por=cargado_por,
                            id_empleado=id_empleado,
                            id_proyecto=id_proy
                        )
            # Caso 5: Sin proyectos seleccionados (Tiempo dedicado al Área u Oficina/Home/Campo directo)
            else:
                srv_area = str(datos.get("servicio", "Tiempo dedicado al Área")).strip() or "Tiempo dedicado al Área"
                try:
                    hrs = float(datos.get("horas", 8))
                except (ValueError, TypeError):
                    hrs = 8.0

                id_proy = str(datos.get("id_proyecto", "")).strip() or obtener_id_proyecto(srv_area)

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
                    sincronizado=False,
                    cargado_por=cargado_por,
                    id_empleado=id_empleado,
                    id_proyecto=id_proy
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

        sesion = obtener_sesion_activa()
        if not sesion:
            return {"exito": False, "error": "No hay sesión activa para modificar reportes."}

        # Verificar permisos de modificación (Justina e Iván cualquier registro; resto solo propios)
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT empleado, id_empleado FROM historial WHERE id = ?", (id_reg,))
            reg_existente = cursor.fetchone()

        if not reg_existente:
            return {"exito": False, "error": "No se encontró el registro a modificar en la base local."}

        emp_original = reg_existente["empleado"] or ""
        id_emp_orig = reg_existente["id_empleado"] or ""

        if not puede_modificar_registro_empleado(sesion, emp_original, id_emp_orig):
            return {
                "exito": False,
                "error": "Acceso denegado: Solo Justina Bertolozzi e Iván Valentin pueden modificar registros de otros empleados."
            }

        fecha = str(datos.get("fecha", "")).strip()
        lugar = str(datos.get("lugar") or datos.get("tipo_ocf", "")).strip()
        servicio = str(datos.get("servicio", "")).strip()
        empleado = str(datos.get("empleado", "")).strip()
        id_emp = str(datos.get("id_empleado", "")).strip()
        id_proy = str(datos.get("id_proyecto", "")).strip()

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
            horas=horas,
            empleado=empleado,
            id_empleado=id_emp,
            id_proyecto=id_proy
        )
        if ok:
            threading.Thread(target=sincronizar_pendientes, daemon=True).start()
            return {"exito": True, "mensaje": "Reporte modificado exitosamente."}
        return {"exito": False, "error": "No se encontró el registro a modificar en la base local."}

    def obtener_historial_otros_empleados(self, filtro_empleado: str = ""):
        """Retorna la lista de reportes cargados para otros empleados (RRHH, Núcleo e Iván Valentin)."""
        sesion = obtener_sesion_activa()
        if not puede_ver_historial_otros(sesion):
            return []
        usuario_rrhh = sesion.get("nombre", "") if sesion else ""
        return obtener_historial_otros_empleados(usuario_rrhh=usuario_rrhh, filtro_empleado=filtro_empleado)

    def obtener_todos_registros_empleado(self, empleado: str, mes_anio: str = ""):
        """Retorna todos los registros de asistencia de un empleado específico para auditar (RRHH, Núcleo e Iván Valentin)."""
        sesion = obtener_sesion_activa()
        if not puede_ver_historial_otros(sesion):
            return []
        return obtener_todos_registros_empleado(empleado=empleado, mes_anio=mes_anio)

    def eliminar_registro_asistencia(self, id_registro: int | str):
        """Elimina un reporte de asistencia localmente y dispara el borrado en Google Sheets."""
        sesion = obtener_sesion_activa()
        if not sesion:
            return {"exito": False, "error": "No hay sesión activa."}

        try:
            with obtener_conexion() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT empleado, id_empleado FROM historial WHERE id = ?", (int(id_registro),))
                reg_existente = cursor.fetchone()

            if not reg_existente:
                return {"exito": False, "error": "No se encontró el reporte a eliminar."}

            emp_original = reg_existente["empleado"] or ""
            id_emp_orig = reg_existente["id_empleado"] or ""

            if not puede_modificar_registro_empleado(sesion, emp_original, id_emp_orig):
                return {
                    "exito": False,
                    "error": "Acceso denegado: Solo Justina Bertolozzi e Iván Valentin pueden eliminar registros de otros empleados."
                }

            res = eliminar_registro_asistencia(int(id_registro))
            if res.get("exito"):
                id_asistencia = res.get("id_asistencia")
                if id_asistencia:
                    threading.Thread(target=eliminar_registro_remoto, args=(id_asistencia,), daemon=True).start()
                return {"exito": True, "mensaje": "Registro eliminado correctamente."}
            return {"exito": False, "error": res.get("error", "No se pudo eliminar el reporte.")}
        except Exception as e:
            return {"exito": False, "error": str(e)}

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

    def _guardar_roster_interno(self, datos: dict, disparar_sync: bool = True):
        """Lógica central para guardar un roster e insertar sus asistencias en historial."""
        sesion = obtener_sesion_activa()
        if not puede_acceder_roster(sesion):
            return {"exito": False, "error": "Acceso denegado: El módulo de Roster solo puede ser gestionado por Justina Bertolozzi e Iván Valentin."}

        try:
            id_roster = str(datos.get("id") or "").strip()
            old_roster = None
            if id_roster:
                with obtener_conexion() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT * FROM rosters WHERE id = ?", (id_roster,))
                    row = cursor.fetchone()
                    if row:
                        old_roster = dict(row)

            res = guardar_registro_roster(datos)
            if not res or not res.get("exito"):
                return res

            empleado = str(datos.get("empleado", "")).strip()
            proyecto = str(datos.get("proyecto", "")).strip()
            fecha_inicio = str(datos.get("fecha_inicio", "")).strip()
            fecha_fin = str(datos.get("fecha_fin", "")).strip()
            tipo = str(datos.get("tipo", "Campo")).strip()

            usuario_mail = str(datos.get("usuario_mail", "")).strip()
            if not usuario_mail and empleado:
                usuarios_disp = obtener_usuarios_cache() or EMPLEADOS_AUTORIZADOS
                emp_match = next((u for u in usuarios_disp if u.get("nombre", "").strip().lower() == empleado.lower()), None)
                if emp_match:
                    usuario_mail = emp_match.get("mail") or emp_match.get("email") or ""

            from datetime import datetime as dt, timedelta
            fechas_a_cargar = []
            if fecha_inicio and fecha_fin:
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

            # Limpiar días antiguos si cambió el rango o empleado
            if old_roster:
                old_emp = old_roster.get("empleado", "")
                old_ini = old_roster.get("fecha_inicio", "")
                old_fin = old_roster.get("fecha_fin", "")
                fechas_antiguas = []
                if old_ini and old_fin:
                    try:
                        oi = dt.strptime(old_ini, "%Y-%m-%d")
                        of = dt.strptime(old_fin, "%Y-%m-%d")
                        if oi > of:
                            oi, of = of, oi
                        c = oi
                        while c <= of:
                            fechas_antiguas.append(c.strftime("%Y-%m-%d"))
                            c += timedelta(days=1)
                    except Exception:
                        fechas_antiguas = [old_ini]
                
                with obtener_conexion() as conn:
                    cur = conn.cursor()
                    for f_ant in fechas_antiguas:
                        if f_ant not in fechas_a_cargar or old_emp != empleado:
                            cur.execute(
                                "DELETE FROM historial WHERE empleado = ? AND fecha = ? AND tipo_ocf IN ('Roster', 'Franco')",
                                (old_emp, f_ant)
                            )
                    conn.commit()

            es_campo = (tipo.lower() == "campo")
            tipo_ocf = "Roster" if es_campo else "Franco"
            servicio = proyecto
            horas = 8.0 if es_campo else 0.0

            emp_id = obtener_id_empleado(empleado)
            proy_id = obtener_id_proyecto(proyecto) if proyecto else ""
            sesion = obtener_sesion_activa()
            cargado_por_rrhh = sesion["nombre"] if sesion else "RRHH"

            # Reconciliar/guardar jornadas en historial
            for dia_f in fechas_a_cargar:
                with obtener_conexion() as conn:
                    cursor = conn.cursor()
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
                        horas=horas,
                        empleado=empleado,
                        id_empleado=emp_id,
                        id_proyecto=proy_id,
                        cargado_por=cargado_por_rrhh
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
                        sincronizado=False,
                        cargado_por=cargado_por_rrhh,
                        id_empleado=emp_id,
                        id_proyecto=proy_id
                    )

            if disparar_sync:
                threading.Thread(target=sincronizar_pendientes, daemon=True).start()

            return res
        except Exception as e:
            print(f"[Rosters] Error al guardar roster: {e}")
            return {"exito": False, "error": str(e)}

    def guardar_roster(self, datos: dict):
        """Guarda o actualiza un registro de roster individual con identificador UUID y sincroniza con Google Sheets."""
        return self._guardar_roster_interno(datos, disparar_sync=True)

    def guardar_roster_multiple(self, lista_datos: list):
        """Guarda múltiples registros de roster de forma atómica y ejecuta una única sincronización con Google Sheets."""
        if not lista_datos:
            return {"exito": False, "error": "No se recibieron datos de roster."}
        try:
            resultados = []
            for d in lista_datos:
                r = self._guardar_roster_interno(d, disparar_sync=False)
                resultados.append(r)
            
            # Una sola sincronización segura en segundo plano para todo el lote
            threading.Thread(target=sincronizar_pendientes, daemon=True).start()
            
            todos_ok = all(r and r.get("exito") for r in resultados)
            return {"exito": todos_ok, "resultados": resultados}
        except Exception as e:
            print(f"[Rosters] Error en guardar_roster_multiple: {e}")
            return {"exito": False, "error": str(e)}

    def deduplicar_sheets(self):
        """Ejecuta la depuración de filas duplicadas en Google Sheets."""
        return deduplicar_hoja_remota()


    def obtener_rosters(self, fecha_desde: str | None = None, fecha_hasta: str | None = None):
        """Retorna los registros de roster que se superpongan con el período especificado, purgando registros huérfanos."""
        sesion = obtener_sesion_activa()
        if not puede_acceder_roster(sesion):
            return []
        try:
            purgar_rosters_huerfanos()
            return obtener_rosters(fecha_desde, fecha_hasta)
        except Exception as e:
            print(f"[Rosters] Error al obtener rosters: {e}")
            return []

    def purgar_rosters_locales(self):
        """Elimina todos los registros de la tabla rosters para una limpieza forzada."""
        sesion = obtener_sesion_activa()
        if not puede_acceder_roster(sesion):
            return {"exito": False, "error": "Acceso denegado: Solo Justina Bertolozzi e Iván Valentin pueden purgar rosters."}
        try:
            cant = vaciar_rosters_locales()
            return {"exito": True, "eliminados": cant}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def eliminar_roster(self, id_roster: str):
        """Elimina un registro de roster por su ID UUID y limpia las entradas correspondientes en historial y Google Sheets."""
        sesion = obtener_sesion_activa()
        if not puede_acceder_roster(sesion):
            return {"exito": False, "error": "Acceso denegado: Solo Justina Bertolozzi e Iván Valentin pueden eliminar rosters."}
        try:
            if id_roster:
                with obtener_conexion() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT * FROM rosters WHERE id = ?", (id_roster.strip(),))
                    row = cursor.fetchone()
                    if row:
                        emp = row["empleado"]
                        ini = row["fecha_inicio"]
                        fin = row["fecha_fin"]
                        if ini and fin:
                            from datetime import datetime as dt, timedelta
                            try:
                                d_ini = dt.strptime(ini, "%Y-%m-%d")
                                d_fin = dt.strptime(fin, "%Y-%m-%d")
                                if d_ini > d_fin:
                                    d_ini, d_fin = d_fin, d_ini
                                curr = d_ini
                                uids_a_eliminar = []
                                while curr <= d_fin:
                                    f_str = curr.strftime("%Y-%m-%d")
                                    cursor.execute(
                                        "SELECT id_asistencia FROM historial WHERE empleado = ? AND fecha = ? AND tipo_ocf IN ('Roster', 'Franco')",
                                        (emp, f_str)
                                    )
                                    filas_asist = cursor.fetchall()
                                    for fa in filas_asist:
                                        uid_remoto = fa["id_asistencia"]
                                        if uid_remoto:
                                            uids_a_eliminar.append(uid_remoto)

                                    cursor.execute(
                                        "DELETE FROM historial WHERE empleado = ? AND fecha = ? AND tipo_ocf IN ('Roster', 'Franco')",
                                        (emp, f_str)
                                    )
                                    curr += timedelta(days=1)
                                conn.commit()

                                if uids_a_eliminar:
                                    def _borrar_lote_remoto(uids):
                                        for u in uids:
                                            eliminar_registro_remoto(u)
                                    threading.Thread(target=_borrar_lote_remoto, args=(uids_a_eliminar,), daemon=True).start()
                            except Exception:
                                pass
            exito = eliminar_registro_roster(id_roster)
            return {"exito": exito}
        except Exception as e:
            return {"exito": False, "error": str(e)}

    def exportar_roster_excel(self, anio: int, mes: int, proyecto: str = ""):
        """Abre un diálogo nativo de Windows para guardar el archivo Excel de Roster por proyecto en 3 hojas."""
        sesion = obtener_sesion_activa()
        if not puede_acceder_roster(sesion):
            return {"exito": False, "error": "Acceso denegado: Solo Justina Bertolozzi e Iván Valentin pueden exportar rosters."}
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


APP_VERSION = "1.3.7"

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
    """Consulta de actualizaciones automáticas deshabilitada por configuración del usuario."""
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
set _MEIPASS=
set _MEIPASS2=
set _PYI_APPLICATION_HOME_DIR=
set _PYI_PARENT_PROCESS_LEVEL=
set _PYI_ARCHIVE_FILE=
set _PYI_SPLASH_IPC=
set PYINSTALLER_RESET_ENVIRONMENT=1

:: 6. Lanzar la aplicación desde su carpeta oficial de instalación
cd /d "{dir_actual_exe}"
start "" /D "{dir_actual_exe}" "{ruta_actual_exe}"
timeout /t 1 /nobreak >nul

:LIMPIEZA
del "%~f0" >nul 2>&1
"""
        with open(ruta_bat, "w", encoding="utf-8") as f:
            f.write(contenido_bat)

        clean_env = os.environ.copy()
        for k in list(clean_env.keys()):
            if k.startswith(("_MEI", "_PYI", "PYINSTALLER")):
                clean_env.pop(k, None)
        clean_env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"

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

    # 3. Detección de versión o nueva instalación
    version_previa = obtener_version_instalada()
    es_nueva_version = (version_previa != APP_VERSION) or ("--post-install" in sys.argv)

    if es_nueva_version:
        print(f"[Version] Nueva versión o instalación detectada ({APP_VERSION}, previa: '{version_previa or 'ninguna'}'). Chequeando base local con Google Sheets...")
        def tarea_post_instalacion():
            ok = sincronizar_todo_desde_sheets(motivo=f"instalación/actualización v{APP_VERSION}")
            if ok:
                guardar_version_instalada(APP_VERSION)
        threading.Thread(target=tarea_post_instalacion, daemon=True).start()
    else:
        # Arranque habitual: sincronizar pendientes, catálogos y asistencias en segundo plano
        threading.Thread(target=sincronizar_pendientes, daemon=True).start()
        threading.Thread(target=sincronizar_catalogos_sheets, daemon=True).start()
        threading.Thread(target=sincronizar_desde_sheets_hacia_local, daemon=True).start()

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
