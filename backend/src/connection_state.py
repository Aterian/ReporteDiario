# [MOD-00] Inicialización remota coordinada sin bloquear la interfaz
import random
import threading
import time


class EstadoConexion:
    def __init__(self, inicializar, *, esperas=(5, 15, 30, 60), variacion=random.uniform):
        self._inicializar = inicializar
        self._esperas = esperas
        self._variacion = variacion
        self._lock = threading.Lock()
        self._despertar = threading.Event()
        self._detener = threading.Event()
        self._hilo = None
        self._estado = "iniciando"
        self._mensaje = "Conectando con Ingeap..."
        self._intento = 0
        self._proximo = None
        self._revision = 0

    def estado(self):
        with self._lock:
            return {"estado": self._estado, "mensaje": self._mensaje,
                    "intento": self._intento, "revision": self._revision,
                    "reintento_en": max(0, round(self._proximo - time.monotonic())) if self._proximo else None}

    def iniciar(self):
        with self._lock:
            if self._detener.is_set() or self._hilo is not None:
                return False
            self._hilo = threading.Thread(target=self._ejecutar, name="conexion-inicial", daemon=True)
            self._hilo.start()
        return True

    def reintentar(self):
        with self._lock:
            if self._detener.is_set() or self._estado == "iniciando":
                return False
            self._estado = "iniciando"
            self._mensaje = "Reconectando con Ingeap..."
            self._revision += 1
        self._despertar.set()
        return True

    def desconectado(self):
        self.reintentar()

    def detener(self):
        self._detener.set()
        self._despertar.set()

    def esperar_cierre(self, timeout=0):
        if self._hilo and self._hilo is not threading.current_thread():
            self._hilo.join(timeout)
        return self._hilo is None or not self._hilo.is_alive()

    def _actualizar(self, estado, mensaje, proximo=None):
        with self._lock:
            self._estado, self._mensaje, self._proximo = estado, mensaje, proximo
            self._revision += 1

    def _ejecutar(self):
        fallos = 0
        while not self._detener.is_set():
            self._despertar.clear()
            with self._lock:
                self._estado = "iniciando"
                self._intento += 1
                self._proximo = None
            try:
                self._inicializar()
            except Exception as exc:
                if self._detener.is_set():
                    return
                nombre = type(exc).__name__
                if nombre == "ValidacionError":
                    estado = "esquema_incompatible" if "esquema" in str(exc).lower() else "configuracion_invalida"
                    self._actualizar(estado, "Revisá la configuración o la versión de la base de datos.")
                    self._despertar.wait()
                elif nombre == "DatabaseTransactionError" and not getattr(exc, "es_fallo_conexion", False):
                    self._actualizar("esquema_incompatible", "La base de datos requiere revisión. Contactá al administrador.")
                    self._despertar.wait()
                elif getattr(exc, "es_fallo_conexion", False) or nombre in ("OperationalError", "InterfaceError"):
                    demora = self._esperas[min(fallos, len(self._esperas) - 1)]
                    demora += self._variacion(0, min(2, demora * 0.1))
                    fallos += 1
                    self._actualizar("sin_conexion", "Sin conexión. Reintentaremos automáticamente.",
                                     time.monotonic() + demora)
                    self._despertar.wait(demora)
                else:
                    self._actualizar("error_interno", "No se pudo iniciar la conexión. Contactá al administrador.")
                    self._despertar.wait()
            else:
                if self._detener.is_set():
                    return
                fallos = 0
                self._actualizar("disponible", "Conectado")
                self._despertar.wait()
