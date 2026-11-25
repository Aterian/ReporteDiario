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
