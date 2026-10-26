# [MOD-07] Exportación de roster desde PostgreSQL
import calendar
from postgres_repository import obtener_rosters
from postgres_exports import exportar_rosters


# [FN-07.09] Exportar turnos que intersectan el mes sin prorratear importes
def generar_excel_roster_mes(anio: int, mes: int, ruta_archivo: str, proyecto: str | None = None) -> dict:
    inicio = f"{anio:04d}-{mes:02d}-01"
    fin = f"{anio:04d}-{mes:02d}-{calendar.monthrange(anio,mes)[1]:02d}"
    filas = obtener_rosters(inicio,fin)
    if proyecto and proyecto != "TODOS":
        filas = [f for f in filas if f["proyecto"] == proyecto]
    return exportar_rosters(filas,ruta_archivo)
