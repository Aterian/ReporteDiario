# [MOD-00] Coordinación de bandeja y ventana diferida
import os
import sys
import threading


# [FN-00.12] Verificar estado de eventos pywebview sin bloquear hilos llamantes
def _evento_listo(ventana, nombre: str) -> bool:
    eventos = getattr(ventana, "events", None)
    evento = getattr(eventos, nombre, None) if eventos is not None else None
    if evento is None or not hasattr(evento, "is_set"):
        return True
    return bool(evento.is_set())


# [FN-00.12] Detectar si la ventana nativa permanece minimizada
def _esta_minimizada(ventana, hwnd=None) -> bool:
    native = getattr(ventana, "native", None)
    estado = getattr(native, "WindowState", None) if native is not None else None
    if estado is not None and str(estado) == "Minimized":
        return True
    if sys.platform == "win32" and type(hwnd) is int and hwnd > 0:
        try:
            import ctypes
            from ctypes import wintypes
            user32 = ctypes.WinDLL("user32", use_last_error=True)
            user32.IsIconic.argtypes = [wintypes.HWND]
            user32.IsIconic.restype = wintypes.BOOL
            return bool(user32.IsIconic(hwnd))
        except Exception:
            return False
    return False


# [FN-00.12] Obtener el HWND nativo perteneciente al proceso actual
def _obtener_hwnd(ventana, titulo: str):
    native = getattr(ventana, "native", None)
    handle = getattr(native, "Handle", None) if native is not None else None
    if handle is not None:
        try:
            valor = handle.ToInt64() if hasattr(handle, "ToInt64") else handle
            if type(valor) is int and valor > 0:
                return valor
        except Exception:
            pass
    if sys.platform != "win32" or not titulo:
        return None
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.WinDLL("user32", use_last_error=True)
        user32.FindWindowExW.argtypes = [wintypes.HWND, wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR]
        user32.FindWindowExW.restype = wintypes.HWND
        user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
        user32.GetWindowThreadProcessId.restype = wintypes.DWORD
        pid_actual = os.getpid()
        hwnd = None
        while True:
            hwnd = user32.FindWindowExW(None, hwnd, None, titulo)
            if not hwnd:
                return None
            pid = wintypes.DWORD(0)
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value == pid_actual:
                return int(hwnd)
    except Exception:
        return None


# [FN-00.12] Reubicar la ventana en el monitor principal si quedó fuera de pantalla
def _asegurar_en_monitor(user32, hwnd: int) -> None:
    import ctypes
    from ctypes import wintypes

    class _MONITORINFO(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("rcMonitor", wintypes.RECT),
            ("rcWork", wintypes.RECT),
            ("dwFlags", wintypes.DWORD),
        ]

    user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user32.GetWindowRect.restype = wintypes.BOOL
    user32.MonitorFromRect.argtypes = [ctypes.POINTER(wintypes.RECT), wintypes.DWORD]
    user32.MonitorFromRect.restype = wintypes.HMONITOR
    user32.GetMonitorInfoW.argtypes = [wintypes.HMONITOR, ctypes.POINTER(_MONITORINFO)]
    user32.GetMonitorInfoW.restype = wintypes.BOOL
    user32.SetWindowPos.argtypes = [
        wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int, wintypes.UINT,
    ]
    user32.SetWindowPos.restype = wintypes.BOOL

    rect = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        return
    ancho = rect.right - rect.left
    alto = rect.bottom - rect.top
    if ancho <= 0 or alto <= 0 or not user32.MonitorFromRect(ctypes.byref(rect), 0):
        primario = user32.MonitorFromRect(ctypes.byref(rect), 1)
        if not primario:
            return
        info = _MONITORINFO()
        info.cbSize = ctypes.sizeof(_MONITORINFO)
        if not user32.GetMonitorInfoW(primario, ctypes.byref(info)):
            return
        work = info.rcWork
        ancho_obj = max(ancho, 440)
        alto_obj = max(alto, 660)
        x = work.left + max(0, (work.right - work.left - ancho_obj) // 2)
        y = work.top + max(0, (work.bottom - work.top - alto_obj) // 2)
        user32.SetWindowPos(hwnd, None, x, y, ancho_obj, alto_obj, 0x0004 | 0x0040)


# [FN-00.12] Controlador de bandeja y ventana WinForms/WebView2
class ControlEscritorio:
    def __init__(self, titulo="Check Diario - Ingeap"):
        self.titulo = titulo
        self.detener = threading.Event()
        self.abrir = threading.Event()
        self.ventana = None
        self.visible = False

    def _activar_ventana_nativa(self):
        if sys.platform != "win32":
            return
        hwnd = _obtener_hwnd(self.ventana, self.titulo)
        if not hwnd:
            return
        try:
            import ctypes
            from ctypes import wintypes
            user32 = ctypes.WinDLL("user32", use_last_error=True)
            user32.IsIconic.argtypes = [wintypes.HWND]
            user32.IsIconic.restype = wintypes.BOOL
            user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
            user32.ShowWindow.restype = wintypes.BOOL
            user32.SetWindowPos.argtypes = [
                wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int,
                ctypes.c_int, ctypes.c_int, wintypes.UINT,
            ]
            user32.SetWindowPos.restype = wintypes.BOOL
            user32.BringWindowToTop.argtypes = [wintypes.HWND]
            user32.BringWindowToTop.restype = wintypes.BOOL
            user32.SetForegroundWindow.argtypes = [wintypes.HWND]
            user32.SetForegroundWindow.restype = wintypes.BOOL

            user32.ShowWindow(hwnd, 9 if user32.IsIconic(hwnd) else 5)
            _asegurar_en_monitor(user32, hwnd)
            flags = 0x0001 | 0x0002 | 0x0040
            user32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, flags)
            user32.SetWindowPos(hwnd, -2, 0, 0, 0, 0, flags)
            user32.BringWindowToTop(hwnd)
            user32.SetForegroundWindow(hwnd)
        except Exception:
            pass

    def al_mostrar_ventana(self, *_):
        if not self.visible:
            ventana = self.ventana
            if ventana is not None and _evento_listo(ventana, "shown"):
                try:
                    ventana.hide()
                except Exception:
                    pass
            return
        self._activar_ventana_nativa()

    def mostrar(self, *_):
        self.abrir.set()
        self.visible = True
        ventana = self.ventana
        if ventana is not None and _evento_listo(ventana, "shown"):
            hwnd = _obtener_hwnd(ventana, self.titulo)
            if _esta_minimizada(ventana, hwnd):
                try:
                    if hasattr(ventana, "restore"):
                        ventana.restore()
                except Exception:
                    pass
            try:
                ventana.show()
            except Exception:
                pass
            self._activar_ventana_nativa()
            self.visibilidad(True)

    def ocultar(self, *_):
        self.visible = False
        ventana = self.ventana
        if ventana is not None and _evento_listo(ventana, "shown"):
            try:
                ventana.hide()
            except Exception:
                pass
        self.visibilidad(False)

    def visibilidad(self, visible):
        self.visible = bool(visible)
        ventana = self.ventana
        if ventana is not None and _evento_listo(ventana, "_pywebviewready"):
            valor = "true" if self.visible else "false"
            script = (
                "window.dispatchEvent(new CustomEvent('escritorio-visibilidad', {detail: {visible: "
                + valor + "}}));"
            )
            def _enviar():
                try:
                    ventana.evaluate_js(script)
                except Exception:
                    pass
            native = getattr(ventana, "native", None)
            invoke_req = getattr(native, "InvokeRequired", None) if native is not None else None
            if isinstance(invoke_req, bool):
                threading.Thread(target=_enviar, name="visibilidad-ui", daemon=True).start()
            else:
                _enviar()

    def salir(self, *_):
        self.detener.set()
        self.abrir.set()
        ventana = self.ventana
        if ventana is not None:
            try:
                ventana.events.closing.clear()
            except Exception:
                pass
            if _evento_listo(ventana, "shown"):
                try:
                    ventana.destroy()
                except Exception:
                    pass

    def esperar_apertura(self):
        self.abrir.wait()
        return not self.detener.is_set()
