# [MOD-07] Exportación de liquidación PostgreSQL
from postgres_exports import exportar_liquidacion


# [FN-07.09] Escribir importes del servidor sin recalcular
def generar_excel_informe_liquidacion(datos: dict, ruta_archivo: str) -> dict:
    return exportar_liquidacion(datos,ruta_archivo)
