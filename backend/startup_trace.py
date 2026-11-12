# [MOD-00] Medición local de las etapas del arranque
import time


class MedicionArranque:
    def __init__(self, inicio=None):
        self._inicio = time.perf_counter() if inicio is None else inicio

    def registrar(self, etapa):
        import logging
        from app_paths import directorio_datos
        try:
            carpeta = directorio_datos() / "logs"
            carpeta.mkdir(parents=True, exist_ok=True)
            ruta = carpeta / "inicio.log"
            if ruta.exists() and ruta.stat().st_size > 1024 * 1024:
                ruta.replace(carpeta / "inicio.anterior.log")
            with ruta.open("a", encoding="utf-8") as archivo:
                archivo.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} | {etapa} | {time.perf_counter() - self._inicio:.3f}s\n")
        except OSError:
            logging.getLogger(__name__).debug("No se pudo registrar la medición de inicio.")
