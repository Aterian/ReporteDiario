// [MOD-11] [FN-11.05] Agregación de métricas de uso por alcance (General, Área, Persona) para informe PDF
import { calcularPuntosEvolucion } from '../components/UsageEvolutionChart';

const DIAS_SEMANA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function formatearFechaConDia(iso) {
  if (!iso || typeof iso !== 'string') return 'Sin fecha';
  const partes = iso.slice(0, 10).split('-').map(Number);
  if (partes.length !== 3 || partes.some(Number.isNaN)) return iso;
  const dt = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  const diaSem = DIAS_SEMANA_CORTO[dt.getUTCDay()] || '';
  return `${diaSem} ${String(partes[2]).padStart(2, '0')}/${String(partes[1]).padStart(2, '0')}/${partes[0]}`;
}

export function formatearFechaUi(iso) {
  if (!iso || typeof iso !== 'string') return 'Sin registros';
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatearCicloMes(mesIso) {
  const partes = String(mesIso || '').split('-').map(Number);
  if (partes.length !== 2 || Number.isNaN(partes[0]) || Number.isNaN(partes[1])) return mesIso;
  const nombreMes = MESES_ES[partes[1] - 1] || String(partes[1]).padStart(2, '0');
  return `${nombreMes} ${partes[0]}`;
}

export function generarRangoFechasIso(fechaInicioIso, fechaFinIso) {
  const [yi, mi, di] = String(fechaInicioIso || '2026-10-01').slice(0, 10).split('-').map(Number);
  const [yf, mf, df] = String(fechaFinIso || '2026-10-01').slice(0, 10).split('-').map(Number);
  if ([yi, mi, di, yf, mf, df].some(Number.isNaN)) return [];
  const inicioMs = Date.UTC(yi, mi - 1, di);
  const finMs = Date.UTC(yf, mf - 1, df);
  if (finMs < inicioMs) return [];
  const dias = Math.floor((finMs - inicioMs) / 86400000) + 1;
  return Array.from({ length: dias }, (_, idx) => new Date(inicioMs + idx * 86400000).toISOString().slice(0, 10));
}

function resumirGrupoColaboradores(colaboradores, diasCorridos) {
  const totalColab = colaboradores.length;
  const conRegistros = colaboradores.filter((e) => (Number(e.dias_cargados) || 0) > 0).length;
  const diasCargados = colaboradores.reduce((acc, e) => acc + (Number(e.dias_cargados) || 0), 0);
  const diasActivos = colaboradores.reduce((acc, e) => acc + (Number(e.dias_activos) || 0), 0);
  const diasFranco = colaboradores.reduce((acc, e) => acc + (Number(e.dias_franco) || 0), 0);
  const diasFaltantes = colaboradores.reduce((acc, e) => acc + (Number(e.dias_faltantes) || 0), 0);
  const totalRegistros = colaboradores.reduce((acc, e) => acc + (Number(e.total_registros) || 0), 0);
  const diasEsperados = colaboradores.reduce(
    (acc, e) => acc + (Number(e.dias_corridos_esperados) || diasCorridos),
    0
  );

  const pctUso = diasEsperados > 0
    ? Math.min(100, Number(((diasCargados / diasEsperados) * 100).toFixed(2)))
    : 0;
  const pctAdopcion = totalColab > 0
    ? Math.min(100, Number(((conRegistros / totalColab) * 100).toFixed(2)))
    : 0;

  return {
    totalColab,
    conRegistros,
    diasCargados,
    diasActivos,
    diasFranco,
    diasFaltantes,
    totalRegistros,
    diasEsperados,
    pctUso,
    pctAdopcion
  };
}

export function calcularResumenPorAreas(detalleEmpleados, diasCorridos) {
  const mapa = new Map();
  detalleEmpleados.forEach((emp) => {
    const area = emp.area || 'S/A';
    if (!mapa.has(area)) mapa.set(area, []);
    mapa.get(area).push(emp);
  });

  return Array.from(mapa.entries())
    .map(([area, lista]) => ({
      area,
      ...resumirGrupoColaboradores(lista, diasCorridos)
    }))
    .sort((a, b) => b.pctUso - a.pctUso || a.area.localeCompare(b.area, 'es'));
}

export function construirDatosInformePdf({
  datos,
  alcance = 'general',
  areaSeleccionada = 'TODAS',
  empleadoId = '',
  modoGrafico = 'acumulado',
  fechaCorte = ''
}) {
  const resumen = datos?.resumen_general || {};
  const detalleEmpleados = Array.isArray(datos?.detalle_empleados) ? datos.detalle_empleados : [];
  const serieGlobal = Array.isArray(datos?.serie_diaria) ? datos.serie_diaria : [];

  const fechaInicio = resumen.fecha_inicio_medicion || '2026-10-01';
  const fechaFin = resumen.fecha_corte_medicion || fechaCorte || fechaInicio;
  const diasCorridos = Math.max(1, Number(resumen.dias_corridos_calendario) || serieGlobal.length || 1);
  const pctUsoGlobal = Number(resumen.porcentaje_uso_sobre_dias_corridos) || 0;
  const resumenAreas = calcularResumenPorAreas(detalleEmpleados, diasCorridos);

  if (alcance === 'area') {
    const areaObjetivo = areaSeleccionada && areaSeleccionada !== 'TODAS'
      ? areaSeleccionada
      : (resumenAreas[0]?.area || 'S/A');
    const empleadosArea = detalleEmpleados
      .filter((e) => (e.area || 'S/A') === areaObjetivo)
      .slice()
      .sort((a, b) => (b.porcentaje_cumplimiento - a.porcentaje_cumplimiento) || a.empleado.localeCompare(b.empleado, 'es'));

    const metrics = resumirGrupoColaboradores(empleadosArea, diasCorridos);
    const deltaEmpresa = Number((metrics.pctUso - pctUsoGlobal).toFixed(2));
    const evolucion = calcularPuntosEvolucion({
      detalleEmpleados,
      serieGlobal,
      areaFiltro: areaObjetivo,
      empleadoFiltro: '',
      modo: modoGrafico
    });

    return {
      alcance: 'area',
      tituloAlcance: `Área ${areaObjetivo}`,
      slugArchivo: `informe_uso_area_${areaObjetivo}_${fechaFin}`,
      fechaInicio,
      fechaFin,
      diasCorridos,
      modoGrafico,
      pctUsoGlobal,
      kpis: [
        {
          etiqueta: '% Uso del Área (Días Corridos)',
          valor: `${metrics.pctUso.toFixed(2)}%`,
          detalle: `${metrics.diasCargados} / ${metrics.diasEsperados} días-persona`,
          nivel: metrics.pctUso >= 80 ? 'alto' : metrics.pctUso >= 50 ? 'medio' : 'bajo'
        },
        {
          etiqueta: 'Adopción en el Área',
          valor: `${metrics.pctAdopcion.toFixed(1)}%`,
          detalle: `${metrics.conRegistros} de ${metrics.totalColab} colaboradores con carga`
        },
        {
          etiqueta: 'Comparativa vs Empresa',
          valor: `${deltaEmpresa >= 0 ? '+' : ''}${deltaEmpresa.toFixed(2)} pp`,
          detalle: `Promedio global empresa: ${pctUsoGlobal.toFixed(2)}%`
        },
        {
          etiqueta: 'Distribución Activos / Francos',
          valor: `${metrics.totalRegistros} reg.`,
          detalle: `${metrics.diasActivos} activos · ${metrics.diasFranco} francos · ${metrics.diasFaltantes} faltantes`
        }
      ],
      empleadosTabla: empleadosArea,
      totalesTabla: metrics,
      resumenAreas: [],
      personaDetalle: null,
      evolucion
    };
  }

  if (alcance === 'persona') {
    const emp = detalleEmpleados.find((e) => e.id_usuario === empleadoId) || detalleEmpleados[0] || null;
    const fechasPeriodo = serieGlobal.length > 0
      ? serieGlobal.map((s) => s.fecha)
      : generarRangoFechasIso(fechaInicio, fechaFin);
    const cubiertasSet = new Set(Array.isArray(emp?.fechas_cubiertas) ? emp.fechas_cubiertas : []);
    const fechasFaltantes = fechasPeriodo
      .filter((f) => !cubiertasSet.has(f))
      .map((iso) => ({ iso, etiqueta: formatearFechaConDia(iso) }));

    const mesesMap = new Map();
    fechasPeriodo.forEach((iso) => {
      const mes = iso.slice(0, 7);
      if (!mesesMap.has(mes)) {
        mesesMap.set(mes, { mes, label: formatearCicloMes(mes), esperados: 0, cubiertos: 0, faltantes: 0 });
      }
      const item = mesesMap.get(mes);
      item.esperados += 1;
      if (cubiertasSet.has(iso)) {
        item.cubiertos += 1;
      } else {
        item.faltantes += 1;
      }
    });
    const desgloseMensual = Array.from(mesesMap.values()).map((m) => ({
      ...m,
      porcentaje: m.esperados > 0 ? Number(((m.cubiertos / m.esperados) * 100).toFixed(1)) : 0
    }));

    const pctPersona = Number(emp?.porcentaje_cumplimiento) || 0;
    const areaStats = resumenAreas.find((a) => a.area === (emp?.area || 'S/A'));
    const pctArea = areaStats ? areaStats.pctUso : pctUsoGlobal;
    const deltaEmpresa = Number((pctPersona - pctUsoGlobal).toFixed(1));
    const evolucion = calcularPuntosEvolucion({
      detalleEmpleados,
      serieGlobal,
      areaFiltro: 'TODAS',
      empleadoFiltro: emp?.id_usuario || '',
      modo: modoGrafico
    });

    const nombreLimpio = (emp?.empleado || 'colaborador').replace(/[^A-Za-z0-9]+/g, '_');

    return {
      alcance: 'persona',
      tituloAlcance: `${emp?.empleado || 'Colaborador'} (Área ${emp?.area || 'S/A'})`,
      slugArchivo: `informe_uso_${nombreLimpio}_${fechaFin}`,
      fechaInicio,
      fechaFin,
      diasCorridos,
      modoGrafico,
      pctUsoGlobal,
      kpis: [
        {
          etiqueta: '% Cumplimiento Individual',
          valor: `${pctPersona.toFixed(1)}%`,
          detalle: `${emp?.dias_cargados || 0} / ${emp?.dias_corridos_esperados || diasCorridos} días corridos`,
          nivel: pctPersona >= 80 ? 'alto' : pctPersona >= 50 ? 'medio' : 'bajo'
        },
        {
          etiqueta: 'Desglose Días Cargados',
          valor: `${emp?.dias_cargados || 0} días`,
          detalle: `${emp?.dias_activos || 0} activos · ${emp?.dias_franco || 0} francos (${emp?.total_registros || 0} reg.)`
        },
        {
          etiqueta: 'Días Sin Registrar',
          valor: `${emp?.dias_faltantes ?? fechasFaltantes.length} días`,
          detalle: `Último registro: ${formatearFechaUi(emp?.ultima_fecha)}`
        },
        {
          etiqueta: 'Comparativa Área / Empresa',
          valor: `${deltaEmpresa >= 0 ? '+' : ''}${deltaEmpresa.toFixed(1)} pp`,
          detalle: `Área ${emp?.area || '-'}: ${pctArea.toFixed(1)}% · Empresa: ${pctUsoGlobal.toFixed(2)}%`
        }
      ],
      empleadosTabla: emp ? [emp] : [],
      totalesTabla: null,
      resumenAreas: [],
      personaDetalle: {
        empleado: emp,
        desgloseMensual,
        fechasFaltantes
      },
      evolucion
    };
  }

  // Alcance 'general'
  const empleadosOrdenados = detalleEmpleados
    .slice()
    .sort((a, b) => (b.porcentaje_cumplimiento - a.porcentaje_cumplimiento) || a.empleado.localeCompare(b.empleado, 'es'));
  const totalesGeneral = resumirGrupoColaboradores(empleadosOrdenados, diasCorridos);
  const evolucion = calcularPuntosEvolucion({
    detalleEmpleados,
    serieGlobal,
    areaFiltro: 'TODAS',
    empleadoFiltro: '',
    modo: modoGrafico
  });

  return {
    alcance: 'general',
    tituloAlcance: 'Total General Empresa',
    slugArchivo: `informe_uso_general_${fechaFin}`,
    fechaInicio,
    fechaFin,
    diasCorridos,
    modoGrafico,
    pctUsoGlobal,
    kpis: [
      {
        etiqueta: '% Uso Total (Días Corridos)',
        valor: `${pctUsoGlobal.toFixed(2)}%`,
        detalle: `${resumen.dias_unicos_cubiertos_empresa || totalesGeneral.diasCargados} / ${resumen.dias_calendario_esperados_empresa || totalesGeneral.diasEsperados} días-persona`,
        nivel: pctUsoGlobal >= 80 ? 'alto' : pctUsoGlobal >= 50 ? 'medio' : 'bajo'
      },
      {
        etiqueta: 'Adopción de Plantilla Activa',
        valor: `${Number(resumen.porcentaje_adopcion_plantilla || totalesGeneral.pctAdopcion).toFixed(1)}%`,
        detalle: `${resumen.usuarios_con_registros || totalesGeneral.conRegistros} de ${resumen.usuarios_activos_totales || totalesGeneral.totalColab} colaboradores`
      },
      {
        etiqueta: 'Período Evaluado (Días Corridos)',
        valor: `${diasCorridos} días`,
        detalle: `${formatearFechaUi(fechaInicio)} → ${formatearFechaUi(fechaFin)}`
      },
      {
        etiqueta: 'Volumen de Registros',
        valor: `${resumen.total_registros_asistencia ?? totalesGeneral.totalRegistros}`,
        detalle: `Incluye ${resumen.registros_de_franco_cargados ?? 0} registros de franco`
      }
    ],
    empleadosTabla: empleadosOrdenados,
    totalesTabla: totalesGeneral,
    resumenAreas,
    personaDetalle: null,
    evolucion
  };
}
