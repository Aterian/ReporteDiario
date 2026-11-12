# [MOD-00] Comprobación local del paquete sin conexión a datos operativos
import io
import sys

from app_paths import recurso_path
from deployment import validar_instalacion, ErrorPaquete


def verificar_paquete_instalado(carpeta, exigir_sin_numpy=True):
    validar_instalacion(carpeta)
    from openpyxl import load_workbook
    from PIL import Image
    from postgres_exports import exportar_liquidacion, exportar_rosters
    datos = {"empleado": "Prueba sintética", "liquidacion": {
        "ciclo_cobro": "2026-11", "cant_dias_ofi": 1, "cant_dias_obra": 0,
        "subtotal_estimado": "100.25", "total_real": "100.25",
        "total_adicionales": "0.50", "sueldo_total": "100.75", "cerrado": False,
        "adicionales": [{"fecha": "2026-11-01", "descripcion": "Prueba", "cantidad_adicional": "0.50"}],
    }, "detalle": []}
    salida = io.BytesIO()
    exportar_liquidacion(datos, salida)
    salida.seek(0)
    libro = load_workbook(salida)
    if (libro.sheetnames != ["Liquidación", "Adicionales", "Asistencias"] or
            libro["Liquidación"]["H2"].value != 100.75 or not libro["Liquidación"]["A1"].font.bold):
        raise ErrorPaquete("La exportación de liquidación no conservó sus datos o formatos.")
    roster = io.BytesIO()
    exportar_rosters([], roster, 2026, 11)
    roster.seek(0)
    principales = {"Ciclo Completo", "1ra Quincena (1 al 15)", "2da Quincena (16 al Fin)"}
    hojas = set(load_workbook(roster).sheetnames)
    if not principales <= hojas or hojas - principales - {"Roster"}:
        raise ErrorPaquete("La exportación de roster no conservó las hojas requeridas.")
    with Image.open(recurso_path("assets/icon.png")) as imagen:
        if imagen.width <= 0:
            raise ErrorPaquete("No se pudo abrir el icono de la aplicación.")
    if exigir_sin_numpy and "numpy" in sys.modules:
        raise ErrorPaquete("El paquete todavía carga la dependencia opcional NumPy.")
    return True
