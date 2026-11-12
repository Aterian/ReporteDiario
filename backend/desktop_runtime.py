# [MOD-00] Coordinación de bandeja y ventana diferida
import threading


class ControlEscritorio:
    def __init__(self):
        self.detener = threading.Event()
        self.abrir = threading.Event()
        self.ventana = None
        self.visible = False

    def mostrar(self, *_):
        self.abrir.set()
        if self.ventana is not None:
            self.ventana.show()
            self.visibilidad(True)

    def ocultar(self, *_):
        if self.ventana is not None:
            self.ventana.hide()
        self.visibilidad(False)

    def visibilidad(self, visible):
        self.visible = bool(visible)
        if self.ventana is not None:
            try:
                valor = "true" if self.visible else "false"
                self.ventana.evaluate_js(
                    "window.dispatchEvent(new CustomEvent('escritorio-visibilidad', {detail: {visible: "
                    + valor + "}}));"
                )
            except Exception:
                pass

    def salir(self, *_):
        self.detener.set()
        self.abrir.set()
        if self.ventana is not None:
            self.ventana.events.closing.clear()
            self.ventana.destroy()

    def esperar_apertura(self):
        self.abrir.wait()
        return not self.detener.is_set()
