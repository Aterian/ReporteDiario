# [MOD-00] Recordatorios cancelables sin crear la interfaz
from datetime import datetime, time
import calendar


class Recordatorios:
    def __init__(self, notificar, *, ahora=datetime.now):
        self._notificar = notificar
        self._ahora = ahora
        self._enviados = set()

    def comprobar(self):
        from postgres_repository import obtener_sesion_activa, obtener_dias_faltantes_mes, usuario_registro_hoy
        sesion = obtener_sesion_activa()
        if not sesion:
            return
        ahora = self._ahora()
        clave = (sesion["id_usuario"], ahora.date().isoformat())
        if ahora.day == calendar.monthrange(ahora.year, ahora.month)[1] and (clave, "fin_mes") not in self._enviados:
            faltantes = obtener_dias_faltantes_mes(sesion["id_usuario"])
            if faltantes.get("es_ultimo_dia_mes") and faltantes.get("cantidad_faltantes", 0):
                self._notificar(f"Hoy es fin de mes y tenés {faltantes['cantidad_faltantes']} día(s) sin cargar.")
            self._enviados.add((clave, "fin_mes"))
        if (clave, "inicio") in self._enviados and (ahora.time() < time(16, 30) or (clave, "tarde") in self._enviados):
            return
        registrado = usuario_registro_hoy(sesion["id_usuario"])
        if (clave, "inicio") not in self._enviados:
            if not registrado and ahora.time() < time(16, 30):
                self._notificar("Buenos días, ¡recordá registrar tu jornada antes de que finalice el día!")
            self._enviados.add((clave, "inicio"))
        if ahora.time() >= time(16, 30) and (clave, "tarde") not in self._enviados:
            if not registrado:
                self._notificar("Son más de las 16:30 hs. ¡No olvides completar tu registro diario de hoy!")
            self._enviados.add((clave, "tarde"))

    def ejecutar(self, detener, conexion):
        if detener.wait(8):
            return
        while not detener.is_set():
            if conexion.estado()["estado"] == "disponible":
                try:
                    self.comprobar()
                except Exception as exc:
                    if getattr(exc, "es_fallo_conexion", False):
                        conexion.desconectado()
            if detener.wait(25):
                return
