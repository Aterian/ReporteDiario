# [MOD-07] Puente de escritorio PostgreSQL
import functools
import time
from datetime import date

from loguru import logger
from pydantic import ValidationError
import psycopg2
import psycopg2.pool

import postgres_repository as db
from error_handler import AppBaseException, PermisoDenegadoError, ValidacionError, formatear_respuesta, manejar_errores_api
from postgres_models import AsistenciaUpdate

# [FN-07.02] Identificar métodos de sólo lectura para reintento automático
METODOS_LECTURA = {
    "obtener_estado_sesion",
    "obtener_servicios",
    "obtener_historial",
    "verificar_registro_hoy",
    "obtener_todos_registros_empleado",
    "obtener_todos_usuarios",
    "obtener_tarifas_roster",
    "obtener_rosters",
    "obtener_liquidacion",
    "obtener_estado_diario_empleados",
    "obtener_resumen_modificaciones",
    "obtener_modificaciones_recientes",
    "obtener_actividad_dia_anterior",
    "obtener_dias_faltantes_mes",
    "obtener_proyectos_admin",
    "obtener_errores_remotos",
}
_METODOS_SUGERENCIAS = {"crear_sugerencia", "obtener_sugerencias", "actualizar_sugerencia"}


def es_operacion_lectura(nombre: str) -> bool:
    return nombre in METODOS_LECTURA or nombre.startswith(("obtener_", "verificar_", "consultar_", "exportar_"))


# [FN-07.02] Mantener respuestas del puente y ocultar detalles internos
def respuesta_segura(funcion, *, privado=False):
    es_lectura = es_operacion_lectura(funcion.__name__)

    def error_seguro(mensaje, codigo):
        if privado:
            return formatear_respuesta(False, error=mensaje, codigo_error=codigo)
        return {"exito": False, "error": mensaje, "codigo_error": codigo}

    @functools.wraps(funcion)
    def ejecutar(*args, **kwargs):
        max_reintentos = 2 if es_lectura else 0
        intento = 0
        while True:
            try:
                return funcion(*args, **kwargs)
            except AppBaseException as exc:
                es_saturacion = getattr(exc, "es_saturacion_pool", False)
                es_fallo_conn = (
                    getattr(exc, "es_fallo_conexion", False)
                    or "No se pudo completar la consulta" in str(exc)
                    or "No se pudo conectar a PostgreSQL" in str(exc)
                    or "conexiones están ocupadas" in str(exc)
                )
                if es_lectura and es_fallo_conn and intento < max_reintentos:
                    intento += 1
                    logger.warning("[API] Reintentando consulta de lectura '{}' (intento {}/{}) tras fallo transitorio: {}",
                                   funcion.__name__, intento, max_reintentos, exc.mensaje)
                    time.sleep(0.25 * intento)
                    continue

                es_lectura_errores = funcion.__name__ == "obtener_errores_remotos"
                if (
                    not privado
                    and getattr(exc, "codigo_error", "") in ("ERROR_BASE_DATOS", "ERROR_CONCURRENCIA")
                    and not es_saturacion
                    and not es_fallo_conn
                    and not es_lectura_errores
                ):
                    try:
                        sesion = db.obtener_sesion_activa()
                        db.registrar_error_remoto({
                            "origen": "backend",
                            "accion_metodo": funcion.__name__,
                            "codigo_error": exc.codigo_error,
                            "mensaje_error": exc.mensaje,
                            "detalle_tecnico": f"{type(exc).__name__}: {str(exc)}"
                        }, sesion=sesion)
                    except Exception:
                        pass
                elif es_saturacion or es_fallo_conn:
                    logger.warning("[DB Conexión/Saturación] Se omite telemetría remota en BD para {}: {}", funcion.__name__, exc.mensaje)
                return error_seguro(exc.mensaje, exc.codigo_error)
            except ValidationError as exc:
                if privado:
                    return error_seguro("Revisá los datos de la sugerencia.", "VALIDACION_ERROR")
                mensaje = "; ".join(".".join(str(p) for p in e["loc"])+": "+e["msg"] for e in exc.errors())
                return error_seguro(mensaje, "VALIDACION_ERROR")
            except (ValueError, TypeError, KeyError):
                return error_seguro("Datos incompletos o inválidos.", "VALIDACION_ERROR")
            except Exception as exc:
                logger.error("[API] {}: {}",funcion.__name__,type(exc).__name__)
                es_err_conn = isinstance(exc, (psycopg2.OperationalError, psycopg2.InterfaceError, psycopg2.pool.PoolError))
                if es_lectura and es_err_conn and intento < max_reintentos:
                    intento += 1
                    logger.warning("[API] Reintentando consulta de lectura '{}' (intento {}/{}) tras fallo transitorio no encapsulado: {}",
                                   funcion.__name__, intento, max_reintentos, type(exc).__name__ if privado else str(exc).strip())
                    time.sleep(0.25 * intento)
                    continue
                if not es_err_conn and not privado:
                    try:
                        sesion = db.obtener_sesion_activa()
                        db.registrar_error_remoto({
                            "origen": "backend",
                            "accion_metodo": funcion.__name__,
                            "codigo_error": "ERROR_INTERNO",
                            "mensaje_error": str(exc),
                            "detalle_tecnico": f"{type(exc).__name__}: {str(exc)}"
                        }, sesion=sesion)
                    except Exception:
                        pass
                return error_seguro("No se pudo completar la operación.", "ERROR_INTERNO")
    return ejecutar


# [FN-07.02] ApiPuente compatible con window.pywebview.api
class ApiPuente:
    def __init__(self):
        self._ventana = None

    def set_ventana(self, ventana):
        self._ventana = ventana

    def _sesion(self, admin=False, auditor=False):
        sesion = db.obtener_sesion_activa()
        if not sesion:
            raise PermisoDenegadoError("Inicie sesión para continuar.")
        rol = sesion.get("rol_app")
        if admin and rol not in ("admin","sub_admin"):
            raise PermisoDenegadoError("La operación requiere rol_app admin o sub_admin en PostgreSQL.")
        if auditor and rol not in ("admin","sub_admin","core"):
            raise PermisoDenegadoError("No tiene permisos de auditoría.")
        return sesion

    def _notificar_cambios(self):
        if self._ventana:
            try:
                self._ventana.evaluate_js("window.dispatchEvent(new CustomEvent('catalogos-actualizados'))")
            except Exception:
                pass

    def _disparar_sync_segundo_plano(self):
        self._notificar_cambios()

    def minimizar_a_bandeja(self):
        if self._ventana:
            self._ventana.hide()
        return {"exito":True}

    def obtener_estado_sesion(self):
        sesion = db.obtener_sesion_activa()
        return {"logueado":sesion is not None,"usuario":sesion}

    def iniciar_sesion(self, nombre: str, dni: str):
        db.perfil_esquema.cache_clear()
        usuario = db.autenticar_usuario(nombre, dni)
        db.guardar_sesion_activa(usuario)
        return {"exito":True,"usuario":usuario,"roles_disponibles":db.perfil_esquema()["roles_disponibles"]}

    def guardar_avatar(self, avatar_base64: str):
        self._sesion()
        return self._no_disponible("El esquema PostgreSQL no incluye almacenamiento de avatares.")

    def cerrar_sesion(self):
        db.borrar_sesion()
        return {"exito":True}

    def obtener_servicios(self, area: str | None = None):
        self._sesion()
        proyectos = db.obtener_proyectos_cache()
        area_norm = (area or "").strip().upper()
        if area_norm and area_norm not in ("TODOS", "N", "RRHH"):
            areas_im = {"I", "M", "INGENIERIA", "INGENIERÍA", "MENSURA", "IM", "I+M"}
            if area_norm in areas_im:
                proyectos = [
                    p for p in proyectos
                    if not p.get("area")
                    or str(p.get("area")).strip().upper() in areas_im
                    or "-I-" in str(p.get("denominacion") or "").upper()
                    or "-M-" in str(p.get("denominacion") or "").upper()
                ]
            else:
                proyectos = [
                    p for p in proyectos
                    if not p.get("area") or str(p.get("area")).strip().upper() == area_norm
                ]
        return [p["denominacion"] for p in proyectos]

    def refrescar_catalogos_sheets(self):
        self._sesion()
        db.perfil_esquema.cache_clear()
        db.invalidar_caches_repositorio()
        db.inicializar_bd()
        self._notificar_cambios()
        return {"exito":True,"mensaje":"Datos actualizados desde PostgreSQL."}

    def guardar_check_diario(self, datos: dict):
        sesion = self._sesion()
        if not isinstance(datos,dict):
            raise ValidacionError("Datos de asistencia inválidos.")
        admin = sesion["rol_app"] in ("admin","sub_admin")
        destino = datos.get("id_empleado") or datos.get("empleado") or sesion["id_usuario"]
        usuario = db.resolver_usuario(destino)
        if not admin and usuario["id_usuario"] != sesion["id_usuario"]:
            raise PermisoDenegadoError("Solo RRHH puede registrar jornadas de otros empleados.")
        estado,lugar,clase = db.mapear_modalidad(datos)
        if not admin and sesion["rol_app"] == "user_2" and lugar != "oficina":
            raise PermisoDenegadoError("El rol user_2 solo puede registrar modalidad Oficina.")
        if not admin and (estado in ("vacaciones","licencia") or clase != "dia_normal" or datos.get("costo_manual")):
            raise PermisoDenegadoError("La modalidad o costo manual requiere permisos de RRHH.")
        fechas = db.fechas_captura(datos)
        if not admin and len(fechas)>1 and not (estado=="franco" and all(f.weekday()>=5 for f in fechas)):
            raise PermisoDenegadoError("Los rangos de fechas requieren permisos de RRHH.")
        modelos = db.preparar_asistencias(datos,usuario["id_usuario"],permitir_costo_manual=admin)
        if not admin:
            if any(m.costo_manual or m.costo_dia is not None or m.activo_franco.value in ("vacaciones","licencia") or m.tipo_dia != "dia_normal" for m in modelos):
                raise PermisoDenegadoError("La modalidad o costo manual requiere permisos de RRHH.")
        if len(modelos)>1500:
            raise ValidacionError("La carga supera el máximo de 1500 registros.")
        resultados = db.guardar_asistencias_atomicas(modelos,sesion["id_usuario"])
        self._notificar_cambios()
        return {"exito":True,"mensaje":"Asistencias guardadas en PostgreSQL.","registros":resultados}

    def modificar_registro(self, datos: dict):
        sesion = self._sesion()
        identificador = db.uuid_valido(datos.get("id") or datos.get("id_asistencia"))
        filas = db.consultar_asistencias(id_asistencia=identificador)
        if not filas:
            raise ValidacionError("No se encontró el registro.")
        anterior = filas[0]
        admin = sesion["rol_app"] in ("admin","sub_admin")
        if not admin and anterior["id_empleado"]!=sesion["id_usuario"]:
            raise PermisoDenegadoError()
        destino = (datos.get("empleado") or datos.get("id_empleado") or anterior["id_empleado"]) if admin else sesion["id_usuario"]
        usuario = db.resolver_usuario(destino)
        combinado = {**anterior,**datos}
        combinado["fecha_fin"] = combinado["fecha"]
        combinado.pop("fechas",None)
        if datos.get("empleado") and datos["empleado"] != anterior["empleado"] and not datos.get("id_empleado"):
            combinado["id_empleado"] = usuario["id_usuario"]
        if "servicio" in datos and datos["servicio"] != anterior["servicio"]:
            id_proy_entrante = datos.get("id_proyecto") or None
            if not id_proy_entrante or str(id_proy_entrante) == str(anterior.get("id_proyecto") or ""):
                combinado["id_proyecto"] = None
            else:
                combinado["id_proyecto"] = id_proy_entrante
            combinado.pop("dedicado_a", None)
        elif not datos.get("id_proyecto"):
            combinado["id_proyecto"] = anterior.get("id_proyecto")
        # Preservar o inferir modalidad coherentemente según el nuevo lugar
        nuevo_lugar = str(datos.get("tipo_ocf") or datos.get("lugar") or "").strip()
        if nuevo_lugar in ("Campo", "Campaña / Campo", "Roster", "Franco Obra", "Franco de Obra", "Franco Obra Trabajado"):
            combinado["modalidad"] = "obra"
            combinado.pop("dedicado_a", None)
        elif nuevo_lugar in ("Oficina", "Franco Ofic Trabajado", "Franco Trabajado"):
            combinado["modalidad"] = "oficina"
            combinado.pop("dedicado_a", None)
        elif not datos.get("modalidad") and anterior.get("modalidad"):
            combinado["modalidad"] = anterior["modalidad"]
        if "feriado" not in datos and nuevo_lugar and nuevo_lugar != "Feriado Trabajado":
            combinado["feriado"] = "NO"
        if "costo_manual" in datos:
            combinado["costo_manual"] = bool(datos["costo_manual"]) if admin else False
            if combinado["costo_manual"]:
                combinado["costo_dia"] = datos.get("costo_dia")
            else:
                combinado["costo_dia"] = None
        else:
            combinado["costo_manual"] = anterior.get("costo_manual", False) if admin else False
        modelos = db.preparar_asistencias(combinado,usuario["id_usuario"],permitir_costo_manual=admin)
        if len(modelos)!=1:
            raise ValidacionError("La edición debe corresponder a una asistencia.")
        m = modelos[0]
        if not admin and (m.costo_manual or m.costo_dia is not None or m.activo_franco.value in ("vacaciones","licencia") or m.tipo_dia!="dia_normal"):
            raise PermisoDenegadoError("La edición de costos y estados especiales requiere RRHH.")
        if not admin and sesion["rol_app"] == "user_2" and m.lugar != "oficina":
            raise PermisoDenegadoError("El rol user_2 solo puede registrar modalidad Oficina.")
        resultado = db.modificar_asistencia(AsistenciaUpdate(**m.model_dump(),id_asistencia=identificador),sesion["id_usuario"],admin)
        self._notificar_cambios()
        return {"exito":True,**resultado}

    def obtener_estado_diario_empleados(self, fecha: str = ""):
        self._sesion(auditor=True)
        return db.obtener_estado_diario_empleados(fecha)

    def obtener_resumen_modificaciones(self):
        self._sesion(auditor=True)
        return db.obtener_resumen_modificaciones()

    def obtener_modificaciones_recientes(self, limite: int = 50, solo_no_revisadas: bool = False):
        self._sesion(auditor=True)
        return db.obtener_modificaciones_recientes(limite, solo_no_revisadas)

    def obtener_notificaciones_modificaciones(self, solo_no_revisadas: bool = True):
        self._sesion(auditor=True)
        return db.obtener_notificaciones_modificaciones(solo_no_revisadas)

    def marcar_modificacion_revisada(self, id_modificacion: str):
        sesion = self._sesion(admin=True)
        res = db.marcar_modificacion_revisada(id_modificacion, sesion.get("id_usuario"))
        if res.get("exito"):
            self._notificar_cambios()
        return res

    def marcar_modificacion_por_asistencia_revisada(self, id_asistencia: str):
        sesion = self._sesion(admin=True)
        res = db.marcar_modificacion_por_asistencia_revisada(id_asistencia, sesion.get("id_usuario"))
        if res.get("exito"):
            self._notificar_cambios()
        return res

    def marcar_modificaciones_revisadas_lote(self, ids_modificacion: list):
        sesion = self._sesion(admin=True)
        if not isinstance(ids_modificacion, (list, tuple, set)):
            raise ValidacionError("Debe suministrar una lista de identificadores de modificación.")
        res = db.marcar_modificaciones_revisadas_lote(ids_modificacion, sesion.get("id_usuario"))
        if res.get("exito"):
            self._notificar_cambios()
        return res

    def marcar_modificaciones_por_asistencias_lote(self, ids_asistencia: list):
        sesion = self._sesion(admin=True)
        if not isinstance(ids_asistencia, (list, tuple, set)):
            raise ValidacionError("Debe suministrar una lista de identificadores de asistencia.")
        res = db.marcar_modificaciones_por_asistencias_lote(ids_asistencia, sesion.get("id_usuario"))
        if res.get("exito"):
            self._notificar_cambios()
        return res

    def marcar_todas_modificaciones_revisadas(self):
        sesion = self._sesion(admin=True)
        res = db.marcar_todas_modificaciones_revisadas(sesion.get("id_usuario"))
        if res.get("exito"):
            self._notificar_cambios()
        return res

    def verificar_nuevas_modificaciones_sheets(self):
        self._sesion()
        return {"exito":True,"nuevas":0,"disponible":False}

    def actualizar_tipo_costo_masivo(self, datos_o_ids, tipo_costo: str = None):
        self._sesion(admin=True)
        ids = datos_o_ids.get("ids_asistencia") or datos_o_ids.get("ids") or [] if isinstance(datos_o_ids,dict) else datos_o_ids
        costo = datos_o_ids.get("tipo_costo") if isinstance(datos_o_ids,dict) else tipo_costo
        cantidad = db.actualizar_tipo_costo_lote(ids,costo)
        self._notificar_cambios()
        return {"exito":True,"actualizados":cantidad,"afectados":cantidad}

    def obtener_historial_otros_empleados(self, filtro_empleado: str = "", mes_anio: str = "", limite: int | None = None, offset: int = 0):
        self._sesion(auditor=True)
        return db.consultar_asistencias("" if filtro_empleado=="TODOS" else filtro_empleado, mes_anio, limite=limite, offset=offset)

    def obtener_todos_registros_empleado(self, empleado: str, mes_anio: str = "", limite: int | None = None, offset: int = 0):
        self._sesion(auditor=True)
        return db.consultar_asistencias(empleado, mes_anio, limite=limite, offset=offset)

    def obtener_actividad_dia_anterior(self):
        self._sesion(auditor=True)
        return db.obtener_actividad_dia_anterior()

    def eliminar_registro_asistencia(self, id_registro: int | str):
        sesion = self._sesion()
        admin = sesion.get("rol_app") in ("admin", "sub_admin")
        res = db.eliminar_registro_asistencia(id_registro, operador=sesion["id_usuario"], administrador=admin)
        self._notificar_cambios()
        return res

    def eliminar_roster(self, id_roster: int | str):
        sesion = self._sesion()
        admin = sesion.get("rol_app") in ("admin", "sub_admin")
        if not admin:
            raise PermisoDenegadoError("Solo usuarios con rol admin o sub_admin pueden eliminar turnos de Roster.")
        res = db.eliminar_registro_roster(id_roster, operador=sesion["id_usuario"], administrador=True)
        self._notificar_cambios()
        return res

    def obtener_todos_usuarios(self, area: str | None = None, incluir_inactivos: bool = False):
        sesion = self._sesion()
        es_autorizado = sesion.get("rol_app") in ("admin", "sub_admin", "core")
        usuarios = db.obtener_usuarios_cache(incluir_inactivos=incluir_inactivos and es_autorizado)
        if area and area.upper() != "TODOS":
            usuarios = [u for u in usuarios if (u.get("area") or "").upper() == area.upper()]
        if not es_autorizado:
            claves_publicas = {"id_usuario", "id_origen", "nombre", "primer_nombre", "apellido", "area", "lugar_habitual", "activo"}
            usuarios = [{k: v for k, v in u.items() if k in claves_publicas} for u in usuarios]
        return usuarios

    def obtener_historial(self):
        sesion = self._sesion()
        return db.consultar_asistencias(sesion["id_usuario"])

    def verificar_registro_hoy(self):
        sesion = self._sesion()
        uid = sesion["id_usuario"]
        registrado = db.usuario_registro_hoy(uid)
        info_faltantes = db.obtener_dias_faltantes_mes(uid)
        return {
            "registrado": registrado,
            **info_faltantes
        }

    def verificar_actualizacion(self):
        from main import verificar_actualizacion_github
        return verificar_actualizacion_github()

    def aplicar_actualizacion(self, url_descarga: str):
        self._sesion()
        from main import ejecutar_descarga_y_reinicio
        return ejecutar_descarga_y_reinicio(url_descarga)

    def sincronizar_sheets(self):
        return self.refrescar_catalogos_sheets()

    def probar_conexion_sheets(self, spreadsheet_id=""):
        self._sesion()
        db.inicializar_bd()
        return {"exito":True,"mensaje":"Conexión directa con PostgreSQL disponible."}

    def obtener_config_sheets(self):
        self._sesion()
        return {"proveedor":"postgresql","spreadsheet_id":""}

    def guardar_config_sheets(self, spreadsheet_id: str):
        return self._no_disponible("Configure DATABASE_URL mediante el entorno o .env.")

    def redimensionar_ventana(self, ancho: int, alto: int):
        if self._ventana:
            self._ventana.resize(int(ancho),int(alto))
        return {"exito":True}

    def maximizar_ventana(self):
        if self._ventana:
            self._ventana.maximize()
        return {"exito":True}

    def restaurar_ventana(self):
        if self._ventana:
            self._ventana.restore()
        return {"exito":True}

    def _guardar_roster_interno(self, datos: dict, disparar_sync: bool = True):
        sesion = self._sesion(admin=True)
        resultado = db.guardar_rosters_atomicos([datos],sesion["id_usuario"])[0]
        if disparar_sync:
            self._notificar_cambios()
        return {"exito":True,**resultado}

    def aplicar_tarifa_local_roster(self, datos: dict) -> dict:
        self._sesion(admin=True)
        tarifas = db.obtener_tarifas_roster_cache()
        ref = datos.get("id_proyecto") or datos.get("proyecto")
        tarifa = next((t for t in tarifas if ref in (t["id_proyecto"],t["proyecto"])),None)
        if not tarifa:
            raise ValidacionError("No hay tarifa activa para el proyecto.")
        return {"exito":True,"precio_dia":tarifa["dia_normal"],"precio_domingo":tarifa["dia_domingo"],"mensaje":"Tarifa de referencia; el turno conserva la tarifa asignada por PostgreSQL."}

    def guardar_roster(self, datos: dict):
        return self._guardar_roster_interno(datos)

    def guardar_roster_multiple(self, lista_datos: list):
        sesion = self._sesion(admin=True)
        resultados = db.guardar_rosters_atomicos(lista_datos,sesion["id_usuario"])
        self._notificar_cambios()
        return {"exito":True,"resultados":resultados,"guardados":len(resultados),"errores":[]}

    def crear_rosters_desde_asistencias(self, lista_datos: list):
        sesion = self._sesion(admin=True)
        res = db.crear_rosters_desde_asistencias(lista_datos,sesion["id_usuario"])
        self._notificar_cambios()
        return {"exito":True,**res,"errores":[]}

    def deduplicar_sheets(self):
        return self._no_disponible("La deduplicación de Google Sheets fue retirada.")

    def limpiar_y_descargar_sheets(self):
        return self._no_disponible("La limpieza local fue retirada; utilice Refrescar.")

    def obtener_rosters(self, fecha_desde: str | None = None, fecha_hasta: str | None = None):
        self._sesion(admin=True)
        return db.obtener_rosters(fecha_desde,fecha_hasta)

    def purgar_rosters_locales(self):
        sesion = self._sesion(admin=True)
        return db.eliminar_registro_roster("", operador=sesion["id_usuario"], administrador=True)

    def _destino_excel(self,nombre):
        if not self._ventana:
            return None
        import webview
        modo = getattr(getattr(webview,"FileDialog",object),"SAVE",getattr(webview,"SAVE_DIALOG",0))
        resultado = self._ventana.create_file_dialog(modo,save_filename=nombre,file_types=("Archivos Excel (*.xlsx)","Todos los archivos (*.*)"))
        return resultado if isinstance(resultado,str) else resultado[0] if resultado else None

    def exportar_roster_excel(self, anio: int, mes: int, proyecto: str = ""):
        self._sesion(admin=True)
        from roster_export import generar_excel_roster_mes
        date(int(anio),int(mes),1)
        destino = self._destino_excel(f"Roster_{anio}_{mes:02d}.xlsx")
        return generar_excel_roster_mes(anio,mes,destino,proyecto) if destino else {"exito":False,"cancelado":True}

    def obtener_liquidacion(self, empleado: str, ciclo_cobro: str, forzar_recalculo: bool = False):
        self._sesion(admin=True)
        return {"exito":True,"liquidacion":db.obtener_liquidacion(empleado,ciclo_cobro,forzar_recalculo)}

    def exportar_informe_liquidacion(self, datos_informe: dict):
        self._sesion(admin=True)
        import re
        from decimal import Decimal
        from liquidacion_export import generar_excel_informe_liquidacion
        meses_es = {"enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,
                    "julio":7,"agosto":8,"septiembre":9,"setiembre":9,"octubre":10,"noviembre":11,"diciembre":12}
        ciclo = datos_informe.get("ciclo_cobro")
        if not ciclo:
            anio = int(datos_informe.get("anio") or date.today().year)
            mes_val = datos_informe.get("mes")
            if mes_val is None and datos_informe.get("nombre_mes"):
                mes_val = meses_es.get(db.normalizar_texto(datos_informe.get("nombre_mes")))
            if mes_val is None:
                raise ValidacionError("Mes o ciclo de cobro inválido para el informe.")
            ciclo = f"{anio:04d}-{int(mes_val):02d}"
        usuario = db.resolver_usuario(datos_informe["empleado"])
        detalle = db.consultar_asistencias(usuario["id_usuario"],ciclo)
        liquidacion = db.obtener_liquidacion(usuario["id_usuario"],ciclo)
        if liquidacion is None:
            total_calc = Decimal(str(datos_informe.get("total_liquidar") or sum(Decimal(str(r.get("costo_dia") or 0)) for r in detalle)))
            fechas_ofi = {r["fecha"] for r in detalle if r.get("modalidad") == "oficina"}
            fechas_obra = {r["fecha"] for r in detalle if r.get("modalidad") in ("obra","roster")} - fechas_ofi
            liquidacion = {
                "ciclo_cobro":ciclo,
                "cant_dias_ofi":len(fechas_ofi),
                "cant_dias_obra":len(fechas_obra),
                "subtotal_ofi":"0.00",
                "subtotal_obra":"0.00",
                "subtotal_estimado":f"{total_calc:.2f}",
                "total_real":f"{total_calc:.2f}",
                "total_adicionales":"0.00",
                "sueldo_total":f"{total_calc:.2f}",
                "cerrado":False,
                "adicionales":[],
            }
        emp_slug = re.sub(r'[\\/*?:"<>|]',"",usuario["nombre"]).strip().replace(" ","_")
        destino = self._destino_excel(f"Liquidacion_{emp_slug}_{ciclo}.xlsx")
        informe = {**datos_informe,"empleado":usuario["nombre"],"ciclo_cobro":ciclo,"liquidacion":liquidacion,"detalle":detalle}
        return generar_excel_informe_liquidacion(informe,destino) if destino else {"exito":False,"cancelado":True}

    def obtener_tarifas_roster(self):
        self._sesion(admin=True)
        return db.obtener_tarifas_roster_cache()

    def guardar_tarifa_roster(self, datos: dict):
        self._sesion(admin=True)
        resultado = db.guardar_tarifa_roster(datos)
        self._notificar_cambios()
        return {"exito": True, **resultado}

    def actualizar_usuario_y_sueldo(self, datos: dict):
        sesion = self._sesion(admin=True)
        resultado = db.actualizar_usuario_y_sueldo(datos, operador_sesion=sesion)
        self._notificar_cambios()
        return resultado

    def actualizar_configuracion_sueldo_usuario(self, datos: dict):
        self._sesion(admin=True)
        resultado = db.actualizar_configuracion_sueldo_usuario(datos)
        self._notificar_cambios()
        return {"exito": True, "datos": resultado, **resultado}

    def actualizar_costo_dia_manual(self, datos: dict):
        sesion = self._sesion(admin=True)
        resultado = db.actualizar_costo_dia_manual(datos.get("id") or datos.get("id_registro") or datos.get("id_asistencia"),
            datos.get("costo_dia",datos.get("nuevo_costo")),sesion["id_usuario"],datos.get("motivo",""))
        self._notificar_cambios()
        return resultado

    def guardar_costo_dia(self, datos: dict):
        return self.actualizar_costo_dia_manual(datos)

    def reparar_costos_salariales_historial(self):
        self._sesion(admin=True)
        return self._no_disponible("Los costos son administrados por los triggers de PostgreSQL.")

    def _no_disponible(self,mensaje):
        return {"exito":False,"error":mensaje,"codigo_error":"FUNCION_RETIRADA"}

    # [FN-07.21] Telemetría y captura de errores remotos
    def reportar_error_cliente(self, datos: dict):
        sesion = db.obtener_sesion_activa()
        return db.registrar_error_remoto(datos, sesion=sesion)

    def obtener_errores_remotos(self, solo_pendientes: bool = True, limite: int = 50):
        sesion = self._sesion()
        if sesion.get("rol_app") != "admin":
            raise PermisoDenegadoError("Solo los administradores pueden consultar el log de errores remotos.")
        return db.obtener_errores_remotos(solo_pendientes=solo_pendientes, limite=limite)

    def marcar_error_remoto_resuelto(self, id_error: str | None = None, todos: bool = False):
        sesion = self._sesion()
        if sesion.get("rol_app") != "admin":
            raise PermisoDenegadoError("Solo los administradores pueden resolver errores remotos.")
        res = db.marcar_error_remoto_resuelto(id_error=id_error, todos=todos, id_operador=sesion.get("id_usuario"))
        self._notificar_cambios()
        return res

    # [FN-04.14] Alta de nuevo usuario y sueldo base
    def crear_usuario_y_sueldo(self, datos: dict):
        sesion = self._sesion()
        if sesion.get("rol_app") not in ("admin", "sub_admin"):
            raise PermisoDenegadoError("Solo usuarios admin o sub_admin pueden dar de alta empleados.")
        res = db.crear_usuario_y_sueldo(datos, operador_sesion=sesion)
        self._notificar_cambios()
        return res

    # [FN-07.22] Gestión integral de proyectos por administradores
    def obtener_proyectos_admin(self, incluir_inactivos: bool = True):
        sesion = self._sesion()
        if sesion.get("rol_app") != "admin":
            raise PermisoDenegadoError("La gestión de proyectos es exclusiva para administradores.")
        return db.obtener_proyectos_gestion(incluir_inactivos=incluir_inactivos)

    def crear_proyecto(self, datos: dict):
        sesion = self._sesion()
        if sesion.get("rol_app") != "admin":
            raise PermisoDenegadoError("La gestión de proyectos es exclusiva para administradores.")
        res = db.crear_proyecto(datos)
        self._notificar_cambios()
        return res

    def actualizar_proyecto(self, datos: dict):
        sesion = self._sesion()
        if sesion.get("rol_app") != "admin":
            raise PermisoDenegadoError("La gestión de proyectos es exclusiva para administradores.")
        res = db.actualizar_proyecto(datos)
        self._notificar_cambios()
        return res



    def exportar_errores_remotos(self, solo_pendientes: bool = False):
        sesion = self._sesion()
        if sesion.get("rol_app") != "admin":
            raise PermisoDenegadoError("Solo los administradores pueden exportar errores remotos.")
        lista = db.obtener_errores_remotos(solo_pendientes=solo_pendientes, limite=500)
        return {"exito": True, "total": len(lista), "datos": lista}

    # [FN-06.10] Enviar una sugerencia con una sesión activa
    def crear_sugerencia(self, datos: dict):
        self._sesion()
        return db.crear_sugerencia(datos)

    # [FN-06.10] Consultar la bandeja para core, sub_admin y admin
    def obtener_sugerencias(self, filtros: dict | None = None):
        self._sesion(auditor=True)
        return db.obtener_sugerencias({} if filtros is None else filtros)

    # [FN-06.10] Gestionar la sugerencia para core, sub_admin y admin
    def actualizar_sugerencia(self, datos: dict):
        self._sesion(auditor=True)
        return db.actualizar_sugerencia(datos)


for _nombre,_metodo in list(vars(ApiPuente).items()):
    if not _nombre.startswith("_") and callable(_metodo):
        _privado = _nombre in _METODOS_SUGERENCIAS
        _metodo_seguro = respuesta_segura(_metodo, privado=_privado)
        setattr(ApiPuente, _nombre, manejar_errores_api(_metodo_seguro) if _privado else _metodo_seguro)
