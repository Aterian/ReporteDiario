# [MOD-07] Exportaciones de importes calculados por PostgreSQL
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


# [FN-07.09] Escribir una hoja sin fórmulas salariales
def agregar_hoja(libro, nombre, columnas, filas):
    hoja = libro.create_sheet(nombre)
    hoja.append([titulo for _,titulo in columnas])
    for celda in hoja[1]:
        celda.font = Font(bold=True,color="FFFFFF")
        celda.fill = PatternFill("solid",fgColor="CC3333")
        celda.alignment = Alignment(wrap_text=True)
    for fila in filas:
        valores = []
        for clave,_ in columnas:
            valor = fila.get(clave)
            if clave in {"total_viaticos","subtotal_ofi","subtotal_obra","subtotal_estimado","total_real","total_adicionales","sueldo_total","cantidad_adicional","costo_dia","precio_dia","precio_domingo"} and valor is not None:
                valor = Decimal(str(valor))
            if isinstance(valor,str) and valor.startswith(("=","+","-","@")):
                valor = "'"+valor
            valores.append(valor)
        hoja.append(valores)
    hoja.freeze_panes = "A2"
    hoja.auto_filter.ref = hoja.dimensions
    for i in range(1,len(columnas)+1):
        hoja.column_dimensions[get_column_letter(i)].width = 26
    return hoja


# [FN-07.09] Exportar liquidación canónica y detalle de adicionales
def exportar_liquidacion(datos,ruta_archivo):
    libro = Workbook()
    libro.remove(libro.active)
    liquidacion = datos["liquidacion"]
    agregar_hoja(libro,"Liquidación",[("empleado","Empleado"),("ciclo_cobro","Ciclo"),("cant_dias_ofi","Días oficina"),
        ("cant_dias_obra","Días obra"),("subtotal_estimado","Subtotal estimado"),("total_real","Total real"),
        ("total_adicionales","Total adicionales"),("sueldo_total","Sueldo total"),("cerrado","Cerrado")],
        [{**liquidacion,"empleado":datos["empleado"]}])
    agregar_hoja(libro,"Adicionales",[("fecha","Fecha"),("descripcion","Descripción"),("cantidad_adicional","Importe")],liquidacion["adicionales"])
    agregar_hoja(libro,"Asistencias",[("fecha","Fecha"),("tipo_ocf","Estado"),("modalidad","Modalidad"),
        ("servicio","Servicio / Área"),("horas","Horas"),("costo_dia","Costo registrado"),("costo_manual","Costo manual")],datos.get("detalle",[]))
    libro.save(ruta_archivo)
    return {"exito":True,"ruta":str(ruta_archivo)}


# [FN-07.09] Exportar turnos completos con viáticos canónicos
def exportar_rosters(filas,ruta_archivo):
    libro = Workbook()
    libro.remove(libro.active)
    agregar_hoja(libro,"Roster",[("empleado","Empleado"),("proyecto","Proyecto"),("fecha_inicio","Inicio"),
        ("fecha_fin","Fin"),("tipo","Estado"),("precio_dia","Tarifa normal"),("precio_domingo","Tarifa domingo"),
        ("total_viaticos","Viáticos del turno completo")],filas)
    libro.save(ruta_archivo)
    return {"exito":True,"ruta":str(ruta_archivo)}
