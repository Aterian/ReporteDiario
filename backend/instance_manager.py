# [MOD-00] Instancia única y solicitud de apertura por sesión de Windows
import sys
import threading


class InstanciaUnica:
    def __init__(self):
        self._kernel = None
        self._mutex = None
        self._evento = None
        self._hilo = None
        self.primaria = True
        if sys.platform != "win32":
            return
        import ctypes
        from ctypes import wintypes
        self._kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self._kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
        self._kernel.CreateMutexW.restype = wintypes.HANDLE
        self._kernel.CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
        self._kernel.CreateEventW.restype = wintypes.HANDLE
        self._kernel.SetEvent.argtypes = [wintypes.HANDLE]
        self._kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        self._kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self._evento = self._kernel.CreateEventW(None, False, False, "Local\\CheckDiarioIngeap_Abrir")
        if not self._evento:
            raise ctypes.WinError(ctypes.get_last_error())
        ctypes.set_last_error(0)
        self._mutex = self._kernel.CreateMutexW(None, False, "Local\\CheckDiarioIngeap_App_SingleInstance_Mutex")
        error = ctypes.get_last_error()
        if not self._mutex:
            self.cerrar()
            raise ctypes.WinError(error)
        self.primaria = error != 183

    # [FN-00.12] Despertar instancia activa cediendo permiso de primer plano
    def solicitar_apertura(self):
        if sys.platform == "win32":
            try:
                import ctypes
                from ctypes import wintypes
                user32 = ctypes.WinDLL("user32", use_last_error=True)
                user32.AllowSetForegroundWindow.argtypes = [wintypes.DWORD]
                user32.AllowSetForegroundWindow.restype = wintypes.BOOL
                user32.AllowSetForegroundWindow(0xFFFFFFFF)
            except Exception:
                pass
        if self._evento:
            self._kernel.SetEvent(self._evento)
        if not self.primaria and sys.platform == "win32":
            try:
                import ctypes
                from ctypes import wintypes
                user32 = ctypes.WinDLL("user32", use_last_error=True)
                user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
                user32.FindWindowW.restype = wintypes.HWND
                user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
                user32.ShowWindow.restype = wintypes.BOOL
                user32.SetForegroundWindow.argtypes = [wintypes.HWND]
                user32.SetForegroundWindow.restype = wintypes.BOOL
                hwnd = user32.FindWindowW(None, "Check Diario - Ingeap")
                if hwnd:
                    user32.ShowWindow(hwnd, 9)
                    user32.SetForegroundWindow(hwnd)
            except Exception:
                pass

    # [FN-00.12] Escuchar eventos de apertura sin interrumpir el hilo IPC ante fallos transitorios
    def escuchar(self, abrir, detener):
        if not self._evento:
            return
        def escuchar_evento():
            while not detener.is_set():
                if self._kernel.WaitForSingleObject(self._evento, 250) == 0:
                    try:
                        abrir()
                    except Exception:
                        pass
        self._hilo = threading.Thread(target=escuchar_evento, name="solicitudes-apertura", daemon=True)
        self._hilo.start()

    def cerrar(self):
        if self._hilo:
            self._hilo.join(0.5)
        for nombre in ("_evento", "_mutex"):
            handle = getattr(self, nombre, None)
            if handle:
                self._kernel.CloseHandle(handle)
                setattr(self, nombre, None)
