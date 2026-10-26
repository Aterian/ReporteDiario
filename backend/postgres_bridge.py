# [MOD-07] Puente de escritorio PostgreSQL
import functools
from datetime import date

from loguru import logger
from pydantic import ValidationError

import postgres_repository as db
from error_handler import AppBaseException, PermisoDenegadoError, ValidacionError
from postgres_models import AsistenciaUpdate


# [FN-07.02] Mantener respuestas del puente y ocultar detalles internos
def respuesta_segura(funcion):
    @functools.wraps(funcion)
    def ejecutar(*args, **kwargs):
        try:
            return funcion(*args, **kwargs)
        except AppBaseException as exc:
            return {"exito":False,"error":exc.mensaje,"codigo_error":exc.codigo_error}
        except ValidationError as exc:
            mensaje = "; ".join(".".join(str(p) for p in e["loc"])+": "+e["msg"] for e in exc.errors())
            return {"exito":False,"error":mensaje,"codigo_error":"VALIDACION_ERROR"}
        except (ValueError, TypeError, KeyError):
            return {"exito":False,"error":"Datos incompletos o inválidos.","codigo_error":"VALIDACION_ERROR"}
        except Exception as exc:
            logger.error("[API] {}: {}",funcion.__name__,type(exc).__name__)
            return {"exito":False,"error":"No se pudo completar la operación.","codigo_error":"ERROR_INTERNO"}
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
        usuario = db.resolver_usuario(dni.strip())
        if db.normalizar_texto(nombre) != db.normalizar_texto(usuario["nombre"]):
            raise ValidacionError("El nombre y DNI no coinciden con un empleado activo.")
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
        if area and area.upper() not in ("TODOS","N","RRHH"):
            proyectos = [p for p in proyectos if not p["area"] or p["area"].upper() == area.upper()]
        return [p["denominacion"] for p in proyectos]

    def refrescar_catalogos_sheets(self):
        self._sesion()
        db.perfil_esquema.cache_clear()
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
        modelos = db.preparar_asistencias(datos,usuario["id_usuario"])
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
            combinado["id_proyecto"] = None
        if "modalidad" not in datos and ("lugar" in datos or "tipo_ocf" in datos):
            combinado.pop("modalidad",None)
        if "costo_manual" not in datos:
            combinado["costo_manual"] = anterior["costo_manual"]
        modelos = db.preparar_asistencias(combinado,usuario["id_usuario"])
        if len(modelos)!=1:
            raise ValidacionError("La edición debe corresponder a una asistencia.")
        m = modelos[0]
        if not admin and (m.costo_manual or m.activo_franco.value in ("vacaciones","licencia") or m.tipo_dia!="dia_normal"):
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
        return {"total_modificaciones":0,"ultimas_24h":0,"no_sincronizadas":0,"ultima_modificacion":None,"disponible":False}

    def obtener_modificaciones_recientes(self, limite: int = 50):
        self._sesion(auditor=True)
        return []

    def obtener_notificaciones_modificaciones(self, solo_no_revisadas: bool = True):
        self._sesion(auditor=True)
        return []

    def marcar_modificacion_revisada(self, id_modificacion: str):
        self._sesion(admin=True)
        return self._no_disponible("El esquema PostgreSQL no incluye la auditoría de modificaciones.")

    def marcar_modificacion_por_asistencia_revisada(self, id_asistencia: str):
        return self.marcar_modificacion_revisada(id_asistencia)

    def marcar_todas_modificaciones_revisadas(self):
        return self.marcar_modificacion_revisada("")

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

    def obtener_historial_otros_empleados(self, filtro_empleado: str = ""):
        self._sesion(auditor=True)
        return db.consultar_asistencias("" if filtro_empleado=="TODOS" else filtro_empleado)

    def obtener_todos_registros_empleado(self, empleado: str, mes_anio: str = ""):
        self._sesion(auditor=True)
        return db.consultar_asistencias(empleado,mes_anio)

    def obtener_actividad_dia_anterior(self):
        self._sesion(auditor=True)
        return db.obtener_actividad_dia_anterior()

    def eliminar_registro_asistencia(self, id_registro: int | str):
        self._sesion()
        return db.eliminar_registro_asistencia(id_registro)

    def obtener_todos_usuarios(self, area: str | None = None):
        sesion = self._sesion()
        usuarios = db.obtener_usuarios_cache()
        if area and area.upper()!="TODOS":
            usuarios = [u for u in usuarios if u["area"].upper()==area.upper()]
        if sesion["rol_app"] not in ("admin","sub_admin"):
            usuarios = [{k:v for k,v in u.items() if k not in ("costo_dia_ofi","costo_dia_obra")} for u in usuarios]
        return usuarios

    def obtener_historial(self):
        sesion = self._sesion()
        return db.consultar_asistencias(sesion["id_usuario"])

    def verificar_registro_hoy(self):
        sesion = self._sesion()
        return {"registrado":db.usuario_registro_hoy(sesion["id_usuario"])}

    def verificar_actualizacion(self):
        from main import verificar_actualizacion_github
        return verificar_actualizacion_github()

    def aplicar_actualizacion(self, url_descarga: str):
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

    def deduplicar_sheets(self):
        return self._no_disponible("La deduplicación de Google Sheets fue retirada.")

    def limpiar_y_descargar_sheets(self):
        return self._no_disponible("La limpieza local fue retirada; utilice Refrescar.")

    def obtener_rosters(self, fecha_desde: str | None = None, fecha_hasta: str | None = None):
        self._sesion(admin=True)
        return db.obtener_rosters(fecha_desde,fecha_hasta)

    def purgar_rosters_locales(self):
        self._sesion(admin=True)
        return db.eliminar_registro_roster("")

    def eliminar_roster(self, id_roster: str):
        self._sesion(admin=True)
        return db.eliminar_registro_roster(id_roster)

    def _destino_excel(self,nombre):
        if not self._ventana:
            return None
        import webview
        resultado = self._ventana.create_file_dialog(webview.FileDialog.SAVE,save_filename=nombre,file_types=("Archivos Excel (*.xlsx)",))
        return resultado if isinstance(resultado,str) else resultado[0] if resultado else None

    def exportar_roster_excel(self, anio: int, mes: int, proyecto: str = ""):
        self._sesion(admin=True)
        from roster_export import generar_excel_roster_mes
        date(int(anio),int(mes),1)
        destino = self._destino_excel(f"Roster_{anio}_{mes:02d}.xlsx")
        return generar_excel_roster_mes(anio,mes,destino,proyecto) if destino else {"exito":False,"cancelado":True}

    def obtener_liquidacion(self, empleado: str, ciclo_cobro: str):
        self._sesion(admin=True)
        return {"exito":True,"liquidacion":db.obtener_liquidacion(empleado,ciclo_cobro)}

    def exportar_informe_liquidacion(self, datos_informe: dict):
        self._sesion(admin=True)
        from liquidacion_export import generar_excel_informe_liquidacion
        ciclo = datos_informe.get("ciclo_cobro") or f"{int(datos_informe['anio']):04d}-{int(datos_informe['mes']):02d}"
        usuario = db.resolver_usuario(datos_informe["empleado"])
        liquidacion = db.obtener_liquidacion(usuario["id_usuario"],ciclo)
        if liquidacion is None:
            raise ValidacionError("No hay liquidación registrada para el ciclo.")
        destino = self._destino_excel(f"Liquidacion_{ciclo}.xlsx")
        informe = {"empleado":usuario["nombre"],"ciclo_cobro":ciclo,"liquidacion":liquidacion,
                   "detalle":db.consultar_asistencias(usuario["id_usuario"],ciclo)}
        return generar_excel_informe_liquidacion(informe,destino) if destino else {"exito":False,"cancelado":True}

    def obtener_tarifas_roster(self):
        self._sesion(admin=True)
        return db.obtener_tarifas_roster_cache()

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


for _nombre,_metodo in list(vars(ApiPuente).items()):
    if not _nombre.startswith("_") and callable(_metodo):
        setattr(ApiPuente,_nombre,respuesta_segura(_metodo))
