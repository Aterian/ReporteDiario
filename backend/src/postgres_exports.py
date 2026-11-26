# [MOD-07] Exportaciones de importes calculados por PostgreSQL
from datetime import date, datetime
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

_DIAS_SEMANA_ES = ("Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo")
_MESES_ES = (
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
)
_ETIQUETAS_MODALIDAD = {"oficina": "Oficina", "obra": "Obra", "roster": "Roster"}
_ETIQUETAS_CLASIFICACION = {
    "dia_normal": "Normal",
    "franco_trabajado": "Franco Trabajado",
    "feriado_trabajado": "Feriado Trabajado",
}
_ETIQUETAS_DEDICACION = {"proyectos": "Proyectos", "areas": "Áreas"}


def _sanitizar_celda_texto(valor):
    if isinstance(valor, str) and valor.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + valor
    return valor


def _formatear_hora(valor) -> str:
    if not valor:
        return "—"
    texto = str(valor).strip()
    return texto[:5] if len(texto) >= 5 else texto


def _formatear_fecha_hora_carga(valor) -> str:
    if not valor:
        return "—"
    texto = str(valor).strip()
    try:
        dt = datetime.fromisoformat(texto.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone()
        return dt.strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return texto


def _estado_auditoria(fila: dict) -> str:
    if fila.get("modificacion_pendiente"):
        return "Pendiente de revisión"
    if fila.get("modificacion_revisada") or fila.get("fue_modificado"):
        return "Revisada"
    return "Sin modificaciones"


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
            valor = _sanitizar_celda_texto(valor)
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


# [FN-07.09] Exportar turnos en 3 hojas: Ciclo Completo, 1ra Quincena y 2da Quincena
def exportar_rosters(filas, ruta_archivo, anio=None, mes=None):
    from datetime import date, timedelta
    import calendar
    libro = Workbook()
    libro.remove(libro.active)

    cols_ciclo = [
        ("empleado", "Empleado"),
        ("proyecto", "Proyecto"),
        ("fecha_inicio", "Inicio"),
        ("fecha_fin", "Fin"),
        ("tipo", "Estado"),
        ("precio_dia", "Tarifa normal"),
        ("precio_domingo", "Tarifa domingo"),
        ("bajada", "Bajada ($)"),
        ("subida", "Subida ($)"),
        ("adicional_turno", "Adicional ($)"),
        ("total_viaticos", "Viáticos del turno completo")
    ]
    # Hoja 1: Ciclo Completo con desglose detallado
    agregar_hoja(libro, "Ciclo Completo", cols_ciclo, filas)

    # Alias "Roster" para compatibilidad estricta con tests e integraciones legadas (8 columnas canónicas)
    cols_roster_legacy = [
        ("empleado", "Empleado"),
        ("proyecto", "Proyecto"),
        ("fecha_inicio", "Inicio"),
        ("fecha_fin", "Fin"),
        ("tipo", "Estado"),
        ("precio_dia", "Tarifa normal"),
        ("precio_domingo", "Tarifa domingo"),
        ("total_viaticos", "Viáticos del turno completo")
    ]
    agregar_hoja(libro, "Roster", cols_roster_legacy, filas)

    # Determinar año y mes para el cálculo de quincenas
    if not anio or not mes:
        if filas and filas[0].get("fecha_inicio"):
            try:
                f_ref = date.fromisoformat(str(filas[0]["fecha_inicio"]))
                anio, mes = f_ref.year, f_ref.month
            except Exception:
                anio, mes = date.today().year, date.today().month
        else:
            anio, mes = date.today().year, date.today().month

    fin_mes = calendar.monthrange(int(anio), int(mes))[1]
    q1_ini = date(int(anio), int(mes), 1)
    q1_fin = date(int(anio), int(mes), 15)
    q2_ini = date(int(anio), int(mes), 16)
    q2_fin = date(int(anio), int(mes), fin_mes)

    def _calcular_tramo_quincena(f, q_ini, q_fin):
        try:
            t_ini = date.fromisoformat(str(f["fecha_inicio"]))
            t_fin = date.fromisoformat(str(f["fecha_fin"]))
        except Exception:
            return None

        if t_fin < q_ini or t_ini > q_fin:
            return None

        inter_ini = max(t_ini, q_ini)
        inter_fin = min(t_fin, q_fin)

        tipo_raw = str(f.get("tipo") or f.get("tipo_turno") or "campo").lower()
        es_campo = "franco" not in tipo_raw

        p_dia = Decimal(str(f.get("precio_dia") or 0))
        p_dom = Decimal(str(f.get("precio_domingo") or 0))
        p_sub = Decimal(str(f.get("subida") or 0))
        p_baj = Decimal(str(f.get("bajada") or 0))
        p_adic = Decimal(str(f.get("adicional_turno") or 0))

        dias_norm = 0
        dias_dom = 0
        bajada_q = Decimal("0")
        subida_q = Decimal("0")
        adicional_q = Decimal("0")

        curr = inter_ini
        while curr <= inter_fin:
            if es_campo:
                if curr == t_fin:
                    bajada_q = p_baj
                elif curr.weekday() == 6:
                    dias_dom += 1
                else:
                    dias_norm += 1
            else:
                if curr == t_fin:
                    subida_q = p_sub
            curr += timedelta(days=1)

        if es_campo and (q_ini <= t_fin <= q_fin):
            adicional_q = p_adic

        total_q = (Decimal(dias_norm) * p_dia) + (Decimal(dias_dom) * p_dom) + bajada_q + subida_q + adicional_q

        return {
            "empleado": f.get("empleado"),
            "proyecto": f.get("proyecto"),
            "tipo": f.get("tipo") or ("Campo" if es_campo else "Franco"),
            "fecha_inicio": f.get("fecha_inicio"),
            "fecha_fin": f.get("fecha_fin"),
            "tramo_inicio": inter_ini.isoformat(),
            "tramo_fin": inter_fin.isoformat(),
            "dias_normales": dias_norm,
            "dias_domingo": dias_dom,
            "bajada": bajada_q,
            "subida": subida_q,
            "adicional_turno": adicional_q,
            "total_viaticos": total_q
        }

    cols_quincena = [
        ("empleado", "Empleado"),
        ("proyecto", "Proyecto"),
        ("tipo", "Estado"),
        ("fecha_inicio", "Inicio Turno"),
        ("fecha_fin", "Fin Turno"),
        ("tramo_inicio", "Tramo en Q"),
        ("tramo_fin", "Fin Tramo en Q"),
        ("dias_normales", "Días normales en Q"),
        ("dias_domingo", "Domingos en Q"),
        ("bajada", "Bajada ($)"),
        ("subida", "Subida ($)"),
        ("adicional_turno", "Adicional ($)"),
        ("total_viaticos", "Monto Quincena ($)")
    ]

    filas_q1 = [_calcular_tramo_quincena(f, q1_ini, q1_fin) for f in filas]
    filas_q1 = [r for r in filas_q1 if r is not None]
    agregar_hoja(libro, "1ra Quincena (1 al 15)", cols_quincena, filas_q1)

    filas_q2 = [_calcular_tramo_quincena(f, q2_ini, q2_fin) for f in filas]
    filas_q2 = [r for r in filas_q2 if r is not None]
    agregar_hoja(libro, "2da Quincena (16 al Fin)", cols_quincena, filas_q2)

    libro.save(ruta_archivo)
    return {"exito": True, "ruta": str(ruta_archivo)}


# [FN-02.09] Exportar todos los registros de asistencia del mes de un colaborador en .xlsx
def exportar_registros_mes_empleado(
    usuario: dict,
    mes_anio: str,
    filas: list[dict],
    ruta_archivo,
    liquidacion: dict | None = None,
) -> dict:
    anio_n, mes_n = int(mes_anio[:4]), int(mes_anio[5:7])
    nombre_mes = _MESES_ES[mes_n - 1]
    filas_ord = sorted(
        filas or [],
        key=lambda f: (
            str(f.get("fecha") or ""),
            str(f.get("hora_inicio") or ""),
            str(f.get("fecha_hora") or ""),
            str(f.get("id") or f.get("id_asistencia") or ""),
        ),
    )

    wb = Workbook()
    ws = wb.active
    ws.title = "Registros del Mes"
    ws.views.sheetView[0].showGridLines = True

    thin = Side(border_style="thin", color="CBD5E1")
    borde = Border(top=thin, bottom=thin, left=thin, right=thin)
    header_fill = PatternFill(start_color="CC3333", end_color="CC3333", fill_type="solid")
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    tot_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    real_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")

    empleado = str(usuario.get("nombre") or "Colaborador").strip() or "Colaborador"
    dni = str(usuario.get("dni") or "—").strip() or "—"
    area = str(usuario.get("area") or "—").strip() or "—"
    email = str(usuario.get("email") or usuario.get("correo") or usuario.get("mail") or "—").strip() or "—"

    ws.merge_cells("A1:P1")
    ws["A1"] = "INGEAP S.A.S. • REGISTROS MENSUALES DE ASISTENCIA"
    ws["A1"].font = Font(name="Calibri", size=13, bold=True, color="FFFFFF")
    ws["A1"].fill = header_fill
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28

    ws.merge_cells("A2:P2")
    ws["A2"] = (
        f"Período: {nombre_mes} {anio_n} ({mes_anio})  |  "
        f"Registros: {len(filas_ord)}  |  "
        f"Emisión: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    )
    ws["A2"].font = Font(name="Calibri", size=10, italic=True, color="475569")
    ws["A2"].alignment = Alignment(horizontal="center", vertical="center")

    ws.cell(row=4, column=1, value="Colaborador:").font = Font(bold=True)
    ws.merge_cells("B4:C4")
    ws.cell(row=4, column=2, value=_sanitizar_celda_texto(empleado))
    ws.cell(row=4, column=4, value="DNI:").font = Font(bold=True)
    ws.merge_cells("E4:F4")
    ws.cell(row=4, column=5, value=_sanitizar_celda_texto(dni))
    ws.cell(row=4, column=7, value="Área:").font = Font(bold=True)
    ws.cell(row=4, column=8, value=_sanitizar_celda_texto(area))
    ws.cell(row=4, column=9, value="Email:").font = Font(bold=True)
    ws.merge_cells("J4:L4")
    ws.cell(row=4, column=10, value=_sanitizar_celda_texto(email))

    columnas = [
        ("Fecha", 14),
        ("Día", 14),
        ("Estado / Modalidad", 25),
        ("Lugar", 14),
        ("Clasificación Día", 22),
        ("Dedicado a", 16),
        ("Proyecto / Servicio", 36),
        ("Hora Inicio", 15),
        ("Hora Fin", 15),
        ("Horas", 14),
        ("Origen", 18),
        ("Costo Día ($)", 19),
        ("Costo Manual", 17),
        ("Cargado por", 24),
        ("Fecha/Hora Carga", 22),
        ("Auditoría Modif.", 25),
    ]

    fila_encabezado = 6
    ws.row_dimensions[fila_encabezado].height = 24
    for col_idx, (titulo, ancho) in enumerate(columnas, start=1):
        celda = ws.cell(row=fila_encabezado, column=col_idx, value=titulo)
        celda.font = Font(bold=True, color="FFFFFF")
        celda.fill = header_fill
        celda.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        celda.border = borde
        ws.column_dimensions[get_column_letter(col_idx)].width = ancho

    total_horas = Decimal("0")
    total_costo = Decimal("0")
    fila_actual = fila_encabezado + 1

    for idx, f in enumerate(filas_ord):
        fecha_iso = str(f.get("fecha") or "")[:10]
        try:
            dia_nombre = _DIAS_SEMANA_ES[date.fromisoformat(fecha_iso).weekday()]
        except ValueError:
            dia_nombre = ""

        modalidad_raw = str(f.get("modalidad") or "").strip().lower()
        tipo_dia_raw = str(f.get("tipo_dia") or "").strip().lower()
        dedicado_raw = str(f.get("dedicado_a") or "").strip().lower()
        horas_val = Decimal(str(f.get("horas") if f.get("horas") is not None else (f.get("horas_dedicadas") or 0)))
        costo_val = Decimal(str(f.get("costo_dia") or 0))
        total_horas += horas_val
        total_costo += costo_val

        valores = [
            fecha_iso,
            dia_nombre,
            _sanitizar_celda_texto(f.get("tipo_ocf") or f.get("lugar") or ""),
            _sanitizar_celda_texto(_ETIQUETAS_MODALIDAD.get(modalidad_raw, f.get("modalidad") or "")),
            _sanitizar_celda_texto(_ETIQUETAS_CLASIFICACION.get(tipo_dia_raw, f.get("tipo_dia") or "")),
            _sanitizar_celda_texto(_ETIQUETAS_DEDICACION.get(dedicado_raw, f.get("dedicado_a") or "")),
            _sanitizar_celda_texto(f.get("servicio") or f.get("area") or ""),
            _formatear_hora(f.get("hora_inicio")),
            _formatear_hora(f.get("hora_fin")),
            float(horas_val),
            "Roster" if f.get("id_roster") else "Registro diario",
            float(costo_val),
            "Sí" if f.get("costo_manual") else "No",
            _sanitizar_celda_texto(f.get("cargado_por") or ""),
            _formatear_fecha_hora_carga(f.get("fecha_hora")),
            _estado_auditoria(f),
        ]

        es_par = idx % 2 == 1
        for col_idx, val in enumerate(valores, start=1):
            celda = ws.cell(row=fila_actual, column=col_idx, value=val)
            celda.border = borde
            if es_par:
                celda.fill = zebra_fill
            if col_idx == 10:
                celda.number_format = "0.00"
                celda.alignment = Alignment(horizontal="right", vertical="center")
            elif col_idx == 12:
                celda.number_format = "$ #,##0.00"
                celda.alignment = Alignment(horizontal="right", vertical="center")
            elif col_idx in (1, 2, 4, 8, 9, 11, 13):
                celda.alignment = Alignment(horizontal="center", vertical="center")
            else:
                celda.alignment = Alignment(horizontal="left", vertical="center")
        fila_actual += 1

    valores_totales = [None] * len(columnas)
    valores_totales[0] = f"TOTALES ({len(filas_ord)} registros)"
    valores_totales[9] = float(total_horas)
    valores_totales[11] = float(total_costo)
    for col_idx, val in enumerate(valores_totales, start=1):
        celda = ws.cell(row=fila_actual, column=col_idx, value=val)
        celda.font = Font(bold=True, color="1E293B")
        celda.fill = tot_fill
        celda.border = borde
        if col_idx == 10:
            celda.number_format = "0.00"
            celda.alignment = Alignment(horizontal="right", vertical="center")
        elif col_idx == 12:
            celda.number_format = "$ #,##0.00"
            celda.alignment = Alignment(horizontal="right", vertical="center")

    liq = liquidacion if isinstance(liquidacion, dict) else {}
    raw_sueldo_total = liq.get("sueldo_total")
    if raw_sueldo_total is None:
        raw_sueldo_total = liq.get("total_real")
    sueldo_total_val = Decimal(str(raw_sueldo_total)) if raw_sueldo_total is not None else Decimal("0")

    fila_real = fila_actual + 1
    valores_reales = [None] * len(columnas)
    valores_reales[0] = "COSTO REAL (Sueldo Total)"
    valores_reales[11] = float(sueldo_total_val)
    for col_idx, val in enumerate(valores_reales, start=1):
        celda = ws.cell(row=fila_real, column=col_idx, value=val)
        celda.font = Font(bold=True, color="166534")
        celda.fill = real_fill
        celda.border = borde
        if col_idx == 12:
            celda.number_format = "$ #,##0.00"
            celda.alignment = Alignment(horizontal="right", vertical="center")

    ws.freeze_panes = f"A{fila_encabezado + 1}"
    ws.auto_filter.ref = f"A{fila_encabezado}:P{fila_encabezado + len(filas_ord)}"
    wb.save(ruta_archivo)
    return {
        "exito": True,
        "ruta": str(ruta_archivo),
        "total_registros": len(filas_ord),
        "sueldo_total": str(sueldo_total_val),
    }
