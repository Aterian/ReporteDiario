// [MOD-11] [FN-11.05] Generador de informes PDF vectoriales para Estadísticas de Uso ISO 9001
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatearFechaUi } from './usageReportStats';

const COLOR_ROJO = [204, 51, 51];
const COLOR_TEXTO = [15, 23, 42];
const COLOR_SECUNDARIO = [71, 85, 105];
const COLOR_SUAVE = [100, 116, 139];
const COLOR_BORDE = [203, 213, 225];
const COLOR_FONDO_SUAVE = [248, 250, 252];
const COLOR_VERDE = [5, 150, 105];
const COLOR_AMBAR = [217, 119, 6];
const COLOR_AZUL = [2, 132, 199];

function obtenerColorNivel(nivel) {
  if (nivel === 'alto') return COLOR_VERDE;
  if (nivel === 'medio') return COLOR_AMBAR;
  if (nivel === 'bajo') return COLOR_ROJO;
  return COLOR_TEXTO;
}

function arrayBufferABase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const tamanoChunk = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += tamanoChunk) {
    binario += String.fromCharCode(...bytes.subarray(i, i + tamanoChunk));
  }
  return btoa(binario);
}

async function cargarLogoDataUrl(logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') return null;
  if (logoUrl.startsWith('data:image/png;base64,')) return logoUrl;
  if (typeof fetch !== 'function' || typeof window === 'undefined') return null;
  try {
    const resp = await fetch(logoUrl);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    return `data:image/png;base64,${arrayBufferABase64(buf)}`;
  } catch {
    return null;
  }
}

function asegurarEspacio(doc, yActual, alturaRequerida, margenSuperior = 16) {
  const pageH = doc.internal.pageSize.getHeight();
  if (yActual + alturaRequerida > pageH - 18) {
    doc.addPage();
    return margenSuperior;
  }
  return yActual;
}

function renderEncabezado(doc, { informe, logoDataUrl, nombreEmisor, fechaEmisionStr }) {
  const pageW = doc.internal.pageSize.getWidth();
  const margen = 14;

  // Banda superior corporativa
  doc.setFillColor(...COLOR_ROJO);
  doc.rect(0, 0, pageW, 3.5, 'F');

  doc.setFillColor(...COLOR_FONDO_SUAVE);
  doc.rect(0, 3.5, pageW, 25.5, 'F');

  let tituloX = margen;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margen, 7, 14, 14);
      tituloX = margen + 17;
    } catch {
      tituloX = margen;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...COLOR_TEXTO);
  doc.text('INFORME DE MÉTRICAS DE USO • ISO 9001:2026', tituloX, 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(...COLOR_SECUNDARIO);
  const periodoTexto = `Alcance: ${informe.tituloAlcance}  |  Período: ${formatearFechaUi(informe.fechaInicio)} al ${formatearFechaUi(informe.fechaFin)} (${informe.diasCorridos} días corridos)`;
  doc.text(doc.splitTextToSize(periodoTexto, pageW - tituloX - 48), tituloX, 18.5);

  doc.setFontSize(7.8);
  doc.setTextColor(...COLOR_SUAVE);
  doc.text(`Emisión: ${fechaEmisionStr}`, pageW - margen, 12.5, { align: 'right' });
  if (nombreEmisor) {
    doc.text(`Emitido por: ${nombreEmisor}`, pageW - margen, 17.5, { align: 'right' });
  }

  doc.setDrawColor(...COLOR_BORDE);
  doc.setLineWidth(0.35);
  doc.line(margen, 29, pageW - margen, 29);
  return 34;
}

function renderTarjetasKpi(doc, kpis, yInicio) {
  const margen = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const anchoTotal = pageW - margen * 2;
  const gap = 3;
  const anchoCard = (anchoTotal - gap * 3) / 4;
  const altoCard = 23;

  kpis.slice(0, 4).forEach((kpi, idx) => {
    const x = margen + idx * (anchoCard + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COLOR_BORDE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, yInicio, anchoCard, altoCard, 2, 2, 'FD');

    if (idx === 0) {
      doc.setFillColor(...COLOR_ROJO);
      doc.rect(x, yInicio + 1.5, 1.3, altoCard - 3, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...COLOR_SUAVE);
    const labelLines = doc.splitTextToSize(String(kpi.etiqueta || '').toUpperCase(), anchoCard - 5);
    doc.text(labelLines.slice(0, 2), x + 3, yInicio + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...obtenerColorNivel(kpi.nivel));
    doc.text(String(kpi.valor ?? '-'), x + 3, yInicio + 13.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...COLOR_SECUNDARIO);
    const detLines = doc.splitTextToSize(String(kpi.detalle || ''), anchoCard - 5);
    doc.text(detLines.slice(0, 2), x + 3, yInicio + 18.2);
  });

  return yInicio + altoCard + 7;
}

function renderGraficoEvolucion(doc, { informe, yInicio }) {
  const evolucion = informe?.evolucion || {};
  const puntos = Array.isArray(evolucion.puntos) ? evolucion.puntos : [];
  if (puntos.length === 0) return yInicio;

  let y = asegurarEspacio(doc, yInicio, 70);
  const margen = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const anchoTotal = pageW - margen * 2;
  const modo = informe.modoGrafico || 'acumulado';
  const etiquetaModo = modo === 'diario' ? '% Diario' : modo === 'semanal' ? 'Semanal (bloques 7d)' : '% Acumulado ISO';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_TEXTO);
  doc.text(`Evolución Temporal del % de Uso (${etiquetaModo})`, margen, y);

  // Leyenda alineada a la derecha
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  let lx = pageW - margen;
  const drawLegendItem = (label, colorRgb, dashed = false) => {
    const wText = doc.getTextWidth(label);
    lx -= wText;
    doc.setTextColor(...COLOR_SECUNDARIO);
    doc.text(label, lx, y);
    lx -= 8;
    doc.setDrawColor(...colorRgb);
    doc.setLineWidth(0.7);
    if (dashed) doc.setLineDashPattern([1.5, 1.2], 0);
    doc.line(lx, y - 1, lx + 6, y - 1);
    doc.setLineDashPattern([], 0);
    lx -= 4;
  };
  drawLegendItem('Meta 80%', COLOR_VERDE, true);
  if (evolucion.mostrarReferenciaGlobal) {
    drawLegendItem('Prom. Empresa', COLOR_AZUL, true);
  }
  drawLegendItem(informe.tituloAlcance, COLOR_ROJO, false);

  y += 3.5;
  const boxH = 54;
  doc.setFillColor(...COLOR_FONDO_SUAVE);
  doc.setDrawColor(...COLOR_BORDE);
  doc.setLineWidth(0.25);
  doc.roundedRect(margen, y, anchoTotal, boxH, 2, 2, 'FD');

  const padL = 12;
  const padR = 5;
  const padT = 5;
  const padB = 9;
  const plotX = margen + padL;
  const plotY = y + padT;
  const plotW = anchoTotal - padL - padR;
  const plotH = boxH - padT - padB;

  const coordY = (pct) => plotY + plotH - (Math.max(0, Math.min(100, Number(pct) || 0)) / 100) * plotH;
  const coordX = (idx) => (puntos.length <= 1 ? plotX + plotW / 2 : plotX + (idx / (puntos.length - 1)) * plotW);

  // Grilla Y (0..100%)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  [0, 25, 50, 75, 100].forEach((pct) => {
    const gy = coordY(pct);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.setTextColor(...COLOR_SUAVE);
    doc.text(`${pct}%`, plotX - 1.5, gy + 1, { align: 'right' });
  });

  // Línea de referencia 80%
  const yMeta = coordY(80);
  doc.setDrawColor(...COLOR_VERDE);
  doc.setLineWidth(0.45);
  doc.setLineDashPattern([2, 1.5], 0);
  doc.line(plotX, yMeta, plotX + plotW, yMeta);
  doc.setLineDashPattern([], 0);

  if (modo === 'semanal') {
    const anchoCelda = plotW / Math.max(1, puntos.length);
    const barW = Math.min(11, Math.max(2.5, anchoCelda * 0.56));
    puntos.forEach((p, idx) => {
      const xc = puntos.length === 1 ? plotX + plotW / 2 : plotX + idx * anchoCelda + anchoCelda / 2;
      const yb = coordY(p.valor);
      const hb = Math.max(0.6, plotY + plotH - yb);
      doc.setFillColor(...COLOR_ROJO);
      doc.rect(xc - barW / 2, yb, barW, hb, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...COLOR_TEXTO);
      doc.text(`${Math.round(p.valor)}%`, xc, yb - 1.2, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLOR_SUAVE);
      doc.text(String(p.etiqueta || ''), xc, plotY + plotH + 4.2, { align: 'center' });
    });
    if (evolucion.mostrarReferenciaGlobal && puntos.length > 1) {
      doc.setDrawColor(...COLOR_AZUL);
      doc.setLineWidth(0.5);
      doc.setLineDashPattern([1.6, 1.2], 0);
      for (let i = 1; i < puntos.length; i += 1) {
        const x1 = plotX + (i - 1) * anchoCelda + anchoCelda / 2;
        const x2 = plotX + i * anchoCelda + anchoCelda / 2;
        doc.line(x1, coordY(puntos[i - 1].valorGlobal), x2, coordY(puntos[i].valorGlobal));
      }
      doc.setLineDashPattern([], 0);
    }
  } else {
    if (evolucion.mostrarReferenciaGlobal && puntos.length > 1) {
      doc.setDrawColor(...COLOR_AZUL);
      doc.setLineWidth(0.5);
      doc.setLineDashPattern([1.6, 1.2], 0);
      for (let i = 1; i < puntos.length; i += 1) {
        doc.line(coordX(i - 1), coordY(puntos[i - 1].valorGlobal), coordX(i), coordY(puntos[i].valorGlobal));
      }
      doc.setLineDashPattern([], 0);
    }

    doc.setDrawColor(...COLOR_ROJO);
    doc.setLineWidth(0.75);
    for (let i = 1; i < puntos.length; i += 1) {
      doc.line(coordX(i - 1), coordY(puntos[i - 1].valor), coordX(i), coordY(puntos[i].valor));
    }

    const pasoX = Math.max(1, Math.ceil(puntos.length / 8));
    puntos.forEach((p, idx) => {
      const cx = coordX(idx);
      const cy = coordY(p.valor);
      if (puntos.length <= 40 || idx === 0 || idx === puntos.length - 1) {
        doc.setFillColor(...COLOR_ROJO);
        doc.circle(cx, cy, 0.7, 'F');
      }
      if (idx === 0 || idx === puntos.length - 1 || idx % pasoX === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(...COLOR_SUAVE);
        doc.text(String(p.etiqueta || ''), cx, plotY + plotH + 4.2, { align: 'center' });
      }
    });
  }

  return y + boxH + 7;
}

function getEstadoAutoTable(doc, yFallback) {
  const tabla = doc.lastAutoTable;
  return tabla && typeof tabla.finalY === 'number' ? tabla.finalY + 7 : yFallback;
}

function renderSeccionTablas(doc, { informe, yInicio }) {
  const margen = 14;
  let y = yInicio;

  if (informe.alcance === 'persona' && informe.personaDetalle) {
    const { desgloseMensual, fechasFaltantes } = informe.personaDetalle;

    y = asegurarEspacio(doc, y, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text('Cumplimiento Mensual del Colaborador', margen, y);

    autoTable(doc, {
      startY: y + 2.5,
      margin: { left: margen, right: margen, bottom: 18 },
      head: [['Mes', 'Días Cargados', 'Días Faltantes', 'Días Esperados', '% Cumplimiento']],
      body: desgloseMensual.map((m) => [
        m.label,
        String(m.cubiertos),
        String(m.faltantes),
        String(m.esperados),
        `${m.porcentaje.toFixed(1)}%`
      ]),
      styles: { fontSize: 8, cellPadding: 2.2, textColor: COLOR_TEXTO },
      headStyles: { fillColor: COLOR_ROJO, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: COLOR_FONDO_SUAVE },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' }
      }
    });

    y = getEstadoAutoTable(doc, y + 30);
    y = asegurarEspacio(doc, y, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text(`Días Sin Registrar en el Período (${fechasFaltantes.length})`, margen, y);

    if (fechasFaltantes.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...COLOR_VERDE);
      doc.text('Cobertura completa del 100%: el colaborador no presenta días corridos sin carga en el período.', margen, y + 6);
      return y + 12;
    }

    const filasFaltantes = [];
    for (let i = 0; i < fechasFaltantes.length; i += 3) {
      filasFaltantes.push([
        fechasFaltantes[i]?.etiqueta || '',
        fechasFaltantes[i + 1]?.etiqueta || '',
        fechasFaltantes[i + 2]?.etiqueta || ''
      ]);
    }
    autoTable(doc, {
      startY: y + 2.5,
      margin: { left: margen, right: margen, bottom: 18 },
      head: [['Fecha Faltante (Col. 1)', 'Fecha Faltante (Col. 2)', 'Fecha Faltante (Col. 3)']],
      body: filasFaltantes,
      styles: { fontSize: 7.8, cellPadding: 1.9, textColor: COLOR_SECUNDARIO },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: COLOR_FONDO_SUAVE }
    });
    return getEstadoAutoTable(doc, y + 24);
  }

  // Resumen por Área cuando es General
  if (informe.alcance === 'general' && Array.isArray(informe.resumenAreas) && informe.resumenAreas.length > 0) {
    y = asegurarEspacio(doc, y, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXTO);
    doc.text('Resumen Consolidado por Área', margen, y);

    autoTable(doc, {
      startY: y + 2.5,
      margin: { left: margen, right: margen, bottom: 18 },
      head: [['Área', 'Colaboradores', 'Con Carga', 'Días Cargados', 'Días Faltantes', 'Esperados', '% Uso Área']],
      body: informe.resumenAreas.map((a) => [
        `Área ${a.area}`,
        String(a.totalColab),
        String(a.conRegistros),
        String(a.diasCargados),
        String(a.diasFaltantes),
        String(a.diasEsperados),
        `${a.pctUso.toFixed(2)}%`
      ]),
      styles: { fontSize: 7.8, cellPadding: 2, textColor: COLOR_TEXTO },
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: COLOR_FONDO_SUAVE },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' }
      }
    });
    y = getEstadoAutoTable(doc, y + 32);
  }

  // Tabla de Colaboradores (General o Área)
  const colaboradores = Array.isArray(informe.empleadosTabla) ? informe.empleadosTabla : [];
  const tot = informe.totalesTabla;
  y = asegurarEspacio(doc, y, 28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR_TEXTO);
  doc.text(
    informe.alcance === 'area'
      ? `Detalle de Colaboradores (${informe.tituloAlcance})`
      : 'Detalle Completo por Colaborador',
    margen,
    y
  );

  autoTable(doc, {
    startY: y + 2.5,
    margin: { left: margen, right: margen, bottom: 18 },
    head: [['#', 'Colaborador', 'Área', 'Cargados', 'Act. / Fr.', 'Faltantes', 'Esperados', '% Cumpl.', 'Último Reg.']],
    body: colaboradores.map((emp, idx) => [
      String(idx + 1),
      emp.empleado || '-',
      emp.area || '-',
      String(emp.dias_cargados ?? 0),
      `${emp.dias_activos ?? 0} / ${emp.dias_franco ?? 0}`,
      String(emp.dias_faltantes ?? 0),
      String(emp.dias_corridos_esperados ?? informe.diasCorridos),
      `${Number(emp.porcentaje_cumplimiento || 0).toFixed(1)}%`,
      formatearFechaUi(emp.ultima_fecha)
    ]),
    foot: tot
      ? [[
          '',
          `Total (${tot.totalColab} colab.)`,
          informe.alcance === 'area' ? informe.tituloAlcance.replace('Área ', '') : 'Todas',
          String(tot.diasCargados),
          `${tot.diasActivos} / ${tot.diasFranco}`,
          String(tot.diasFaltantes),
          String(tot.diasEsperados),
          `${Number(tot.pctUso || 0).toFixed(2)}%`,
          ''
        ]]
      : undefined,
    styles: { fontSize: 7.4, cellPadding: 1.8, textColor: COLOR_TEXTO },
    headStyles: { fillColor: COLOR_ROJO, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: COLOR_TEXTO, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: COLOR_FONDO_SUAVE },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
      8: { halign: 'center' }
    }
  });

  return getEstadoAutoTable(doc, y + 36);
}

function renderPiePaginas(doc) {
  const totalPaginas = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margen = 14;

  for (let p = 1; p <= totalPaginas; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...COLOR_BORDE);
    doc.setLineWidth(0.25);
    doc.line(margen, pageH - 12, pageW - margen, pageH - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_SUAVE);
    doc.text('Check Diario Ingeap • Evidencia de Conformidad ISO 9001:2026', margen, pageH - 7.5);
    doc.text(`Página ${p} de ${totalPaginas}`, pageW - margen, pageH - 7.5, { align: 'right' });
  }
}

export async function generarInformeUsoPdf({
  informe,
  opciones = { incluirGrafico: true, incluirDetalle: true },
  usuarioEmisor = null,
  logoUrl = null
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logoDataUrl = await cargarLogoDataUrl(logoUrl);
  const ahora = new Date();
  const fechaEmisionStr = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  const nombreEmisor = usuarioEmisor?.nombre || '';

  let yCursor = renderEncabezado(doc, { informe, logoDataUrl, nombreEmisor, fechaEmisionStr });
  yCursor = renderTarjetasKpi(doc, informe.kpis || [], yCursor);

  if (opciones.incluirGrafico !== false) {
    yCursor = renderGraficoEvolucion(doc, { informe, yInicio: yCursor });
  }

  if (opciones.incluirDetalle !== false) {
    renderSeccionTablas(doc, { informe, yInicio: yCursor });
  }

  renderPiePaginas(doc);

  const arrayBuffer = doc.output('arraybuffer');
  const base64 = arrayBufferABase64(arrayBuffer);
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const nombreArchivo = `${informe.slugArchivo || 'informe_uso_iso9001'}.pdf`;

  return { nombreArchivo, blob, base64 };
}
