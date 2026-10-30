# [MOD-07] Exportación de liquidación PostgreSQL y resumen corporativo
from datetime import datetime
from decimal import Decimal
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from postgres_exports import exportar_liquidacion


# [FN-07.09] Generar informe de liquidación con resumen de categorías y hojas canónicas
def generar_excel_informe_liquidacion(datos: dict, ruta_archivo: str) -> dict:
    resultado = exportar_liquidacion(datos, ruta_archivo)
    categorias = datos.get("resumen_categorias") or []
    proyectos = datos.get("proyectos_imputados") or []
    if not categorias and not proyectos:
        return resultado

    wb = openpyxl.load_workbook(ruta_archivo)
    ws = wb.create_sheet(title="Resumen Liquidación", index=0)
    ws.views.sheetView[0].showGridLines = True

    thin = Side(border_style="thin", color="CBD5E1")
    borde = Border(top=thin, bottom=thin, left=thin, right=thin)
    header_fill = PatternFill(start_color="CC3333", end_color="CC3333", fill_type="solid")
    sub_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    tot_fill = PatternFill(start_color="FEF2F2", end_color="FEF2F2", fill_type="solid")

    empleado = str(datos.get("empleado") or "Colaborador").strip()
    dni = str(datos.get("dni") or "-").strip() or "-"
    area = str(datos.get("area") or "-").strip() or "-"
    email = str(datos.get("email") or "-").strip() or "-"
    ciclo = str(datos.get("ciclo_cobro") or "")
    nombre_mes = str(datos.get("nombre_mes") or ciclo).strip()
    anio = str(datos.get("anio") or "")
    liq = datos.get("liquidacion") or {}
    total_liq = Decimal(str(liq.get("sueldo_total") or datos.get("total_liquidar") or 0))

    ws.merge_cells("A1:D1")
    ws["A1"] = "INGEAP S.A. • INFORME DE LIQUIDACIÓN MENSUAL"
    ws["A1"].font = Font(name="Calibri", size=13, bold=True, color="FFFFFF")
    ws["A1"].fill = header_fill
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28

    ws.merge_cells("A2:D2")
    ws["A2"] = f"Período: {nombre_mes} {anio} ({ciclo})  |  Emisión: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    ws["A2"].font = Font(name="Calibri", size=10, italic=True, color="475569")
    ws["A2"].alignment = Alignment(horizontal="center", vertical="center")

    ws.cell(row=4, column=1, value="Colaborador:").font = Font(bold=True)
    ws.cell(row=4, column=2, value=empleado)
    ws.cell(row=4, column=3, value="DNI:").font = Font(bold=True)
    ws.cell(row=4, column=4, value=dni)
    ws.cell(row=5, column=1, value="Área:").font = Font(bold=True)
    ws.cell(row=5, column=2, value=area)
    ws.cell(row=5, column=3, value="Email:").font = Font(bold=True)
    ws.cell(row=5, column=4, value=email)

    row_idx = 7
    for col_idx, titulo in enumerate(["Concepto / Categoría", "Días Computados", "Tarifa Diaria ($)", "Subtotal ($)"], start=1):
        c = ws.cell(row=row_idx, column=col_idx, value=titulo)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = header_fill
        c.alignment = Alignment(horizontal="center" if col_idx > 1 else "left", vertical="center")
        c.border = borde
    row_idx += 1

    total_dias = Decimal("0")
    total_subtotales = Decimal("0")
    for cat in categorias:
        dias_v = Decimal(str(cat.get("dias") or 0))
        tar_v = Decimal(str(cat.get("tarifa_diaria") or 0))
        sub_v = Decimal(str(cat.get("subtotal") or 0))
        total_dias += dias_v
        total_subtotales += sub_v
        vals = [cat.get("concepto", ""), float(dias_v), float(tar_v), float(sub_v)]
        for col_idx, val in enumerate(vals, start=1):
            c = ws.cell(row=row_idx, column=col_idx, value=val)
            c.border = borde
            if col_idx in (3, 4):
                c.number_format = "$ #,##0.00"
                c.alignment = Alignment(horizontal="right")
            elif col_idx == 2:
                c.alignment = Alignment(horizontal="center")
        row_idx += 1

    # Incluir fila explícita para adicionales aprobados si existen y no están en las categorías
    total_adic = Decimal(str(liq.get("total_adicionales") or 0))
    tiene_adic_en_cats = any("adicional" in str(cat.get("concepto", "")).lower() for cat in categorias)
    if total_adic > 0 and not tiene_adic_en_cats:
        total_subtotales += total_adic
        vals_adic = ["Adicionales aprobados del mes", "", "", float(total_adic)]
        for col_idx, val in enumerate(vals_adic, start=1):
            c = ws.cell(row=row_idx, column=col_idx, value=val)
            c.border = borde
            if col_idx == 4:
                c.number_format = "$ #,##0.00"
                c.alignment = Alignment(horizontal="right")
            elif col_idx in (2, 3):
                c.alignment = Alignment(horizontal="center")
        row_idx += 1

    # El TOTAL A LIQUIDAR debe cuadrar exactamente con la suma de las filas
    total_final_cuadre = total_subtotales if total_subtotales > 0 else total_liq
    for col_idx, val in enumerate(["TOTAL A LIQUIDAR", float(total_dias), "", float(total_final_cuadre)], start=1):
        c = ws.cell(row=row_idx, column=col_idx, value=val)
        c.font = Font(bold=True, color="991B1B")
        c.fill = tot_fill
        c.border = borde
        if col_idx == 4:
            c.number_format = "$ #,##0.00"
            c.alignment = Alignment(horizontal="right")
        elif col_idx == 2:
            c.alignment = Alignment(horizontal="center")

    if proyectos:
        row_idx += 3
        ws.cell(row=row_idx, column=1, value="PROYECTOS Y TAREAS IMPUTADAS EN EL MES").font = Font(bold=True)
        row_idx += 1
        for col_idx, titulo in enumerate(["Proyecto / Servicio", "Días Registrados", "Horas Totales", "Monto Imputado ($)"], start=1):
            c = ws.cell(row=row_idx, column=col_idx, value=titulo)
            c.font = Font(bold=True, color="334155")
            c.fill = sub_fill
            c.border = borde
        row_idx += 1
        for p in proyectos:
            vals = [p.get("proyecto", ""), float(p.get("dias") or 0), float(p.get("horas") or 0), float(p.get("monto") or 0)]
            for col_idx, val in enumerate(vals, start=1):
                c = ws.cell(row=row_idx, column=col_idx, value=val)
                c.border = borde
                if col_idx == 4:
                    c.number_format = "$ #,##0.00"
                    c.alignment = Alignment(horizontal="right")
                elif col_idx in (2, 3):
                    c.alignment = Alignment(horizontal="center")
            row_idx += 1

    for col_letter, ancho in [("A", 38), ("B", 20), ("C", 22), ("D", 24)]:
        ws.column_dimensions[col_letter].width = ancho

    wb.save(ruta_archivo)
    return resultado
