// [FN-11.03] Gráfico SVG interactivo de porcentaje de uso desde el 01/10/2026
import React, { useMemo, useState } from 'react';

const FORMATO_MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatearFechaCorta(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}`;
}

function formatearFechaCompleta(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  const mesIdx = Number(partes[1]) - 1;
  return `${partes[2]} ${FORMATO_MES_CORTO[mesIdx] || partes[1]} ${partes[0]}`;
}

// [FN-11.03] Recalcular series temporal (% acumulado ISO, % diario o semanal) según filtros activos
export function calcularPuntosEvolucion({
  detalleEmpleados = [],
  serieGlobal = [],
  areaFiltro = 'TODAS',
  empleadoFiltro = '',
  modo = 'acumulado'
}) {
  if (!Array.isArray(serieGlobal) || serieGlobal.length === 0) {
    return { puntos: [], mostrarReferenciaGlobal: false, poblacionLabel: 'Toda la empresa' };
  }

  const hayFiltro = Boolean(empleadoFiltro) || (areaFiltro && areaFiltro !== 'TODAS');
  const empleadosFiltrados = detalleEmpleados.filter((emp) => {
    if (empleadoFiltro) return String(emp.id_usuario) === String(empleadoFiltro);
    if (areaFiltro && areaFiltro !== 'TODAS') return emp.area === areaFiltro;
    return true;
  });

  const n = empleadosFiltrados.length;
  const setsPorEmpleado = empleadosFiltrados.map(
    (emp) => new Set(Array.isArray(emp.fechas_cubiertas) ? emp.fechas_cubiertas : [])
  );

  let acumCubiertos = 0;
  let acumEsperados = 0;

  const serieDiariaBase = serieGlobal.map((item) => {
    const fecha = item.fecha;
    if (!hayFiltro) {
      return {
        fecha,
        etiqueta: formatearFechaCorta(fecha),
        etiquetaCompleta: formatearFechaCompleta(fecha),
        cubiertos: Number(item.usuarios_cubiertos) || 0,
        esperados: Number(item.usuarios_esperados) || 0,
        acumCubiertos: Number(item.dias_acumulados_cubiertos) || 0,
        acumEsperados: Number(item.dias_acumulados_esperados) || 0,
        pctDiario: Number(item.porcentaje_diario) || 0,
        pctAcumulado: Number(item.porcentaje_acumulado) || 0,
        globalDiario: Number(item.porcentaje_diario) || 0,
        globalAcumulado: Number(item.porcentaje_acumulado) || 0
      };
    }

    let cubiertos = 0;
    for (const conjunto of setsPorEmpleado) {
      if (conjunto.has(fecha)) cubiertos += 1;
    }
    acumCubiertos += cubiertos;
    acumEsperados += n;

    const pctDiario = n > 0 ? Math.min(100, Number(((cubiertos / n) * 100).toFixed(2))) : 0;
    const pctAcumulado =
      acumEsperados > 0 ? Math.min(100, Number(((acumCubiertos / acumEsperados) * 100).toFixed(2))) : 0;

    return {
      fecha,
      etiqueta: formatearFechaCorta(fecha),
      etiquetaCompleta: formatearFechaCompleta(fecha),
      cubiertos,
      esperados: n,
      acumCubiertos,
      acumEsperados,
      pctDiario,
      pctAcumulado,
      globalDiario: Number(item.porcentaje_diario) || 0,
      globalAcumulado: Number(item.porcentaje_acumulado) || 0
    };
  });

  let poblacionLabel = 'Toda la empresa';
  if (empleadoFiltro) {
    poblacionLabel = empleadosFiltrados[0]?.empleado || 'Colaborador';
  } else if (areaFiltro && areaFiltro !== 'TODAS') {
    poblacionLabel = `Área ${areaFiltro} (${n} colab.)`;
  }

  if (modo === 'semanal') {
    const semanas = [];
    for (let i = 0; i < serieDiariaBase.length; i += 7) {
      const bloque = serieDiariaBase.slice(i, i + 7);
      const fuenteGlobal = serieGlobal.slice(i, i + 7);
      const sumCub = bloque.reduce((acc, d) => acc + d.cubiertos, 0);
      const sumEsp = bloque.reduce((acc, d) => acc + d.esperados, 0);
      const sumGlobalCub = fuenteGlobal.reduce((acc, d) => acc + (Number(d.usuarios_cubiertos) || 0), 0);
      const sumGlobalEsp = fuenteGlobal.reduce((acc, d) => acc + (Number(d.usuarios_esperados) || 0), 0);

      const valor = sumEsp > 0 ? Math.min(100, Number(((sumCub / sumEsp) * 100).toFixed(2))) : 0;
      const valorGlobal =
        sumGlobalEsp > 0 ? Math.min(100, Number(((sumGlobalCub / sumGlobalEsp) * 100).toFixed(2))) : 0;

      const primera = bloque[0].fecha;
      const ultima = bloque[bloque.length - 1].fecha;
      semanas.push({
        clave: `sem-${i}`,
        etiqueta: `${formatearFechaCorta(primera)}`,
        etiquetaCompleta:
          primera === ultima
            ? formatearFechaCompleta(primera)
            : `Sem. ${formatearFechaCorta(primera)} → ${formatearFechaCorta(ultima)} (${bloque.length}d)`,
        valor,
        valorGlobal,
        cubiertos: sumCub,
        esperados: sumEsp
      });
    }
    return { puntos: semanas, mostrarReferenciaGlobal: hayFiltro, poblacionLabel };
  }

  const puntos = serieDiariaBase.map((d) => ({
    clave: d.fecha,
    etiqueta: d.etiqueta,
    etiquetaCompleta: d.etiquetaCompleta,
    valor: modo === 'diario' ? d.pctDiario : d.pctAcumulado,
    valorGlobal: modo === 'diario' ? d.globalDiario : d.globalAcumulado,
    cubiertos: modo === 'diario' ? d.cubiertos : d.acumCubiertos,
    esperados: modo === 'diario' ? d.esperados : d.acumEsperados
  }));

  return { puntos, mostrarReferenciaGlobal: hayFiltro, poblacionLabel };
}

export default function UsageEvolutionChart({
  detalleEmpleados,
  serieGlobal,
  areasDisponibles,
  areaFiltro,
  onChangeArea,
  empleadoFiltro,
  onChangeEmpleado,
  modoGrafico,
  onChangeModo
}) {
  const [indiceHover, setIndiceHover] = useState(null);

  const { puntos, mostrarReferenciaGlobal, poblacionLabel } = useMemo(
    () =>
      calcularPuntosEvolucion({
        detalleEmpleados,
        serieGlobal,
        areaFiltro,
        empleadoFiltro,
        modo: modoGrafico
      }),
    [detalleEmpleados, serieGlobal, areaFiltro, empleadoFiltro, modoGrafico]
  );

  const empleadosEnArea = useMemo(() => {
    return detalleEmpleados
      .filter((emp) => areaFiltro === 'TODAS' || emp.area === areaFiltro)
      .slice()
      .sort((a, b) => a.empleado.localeCompare(b.empleado, 'es'));
  }, [detalleEmpleados, areaFiltro]);

  const width = 920;
  const height = 290;
  const padLeft = 52;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const coordX = (idx) => {
    if (puntos.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (puntos.length - 1)) * plotW;
  };
  const coordY = (pct) => padTop + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;

  const { pathPrincipal, pathArea, pathGlobal } = useMemo(() => {
    if (puntos.length === 0) {
      return { pathPrincipal: '', pathArea: '', pathGlobal: '' };
    }
    const cx = (idx) => (puntos.length <= 1 ? padLeft + plotW / 2 : padLeft + (idx / (puntos.length - 1)) * plotW);
    const cy = (pct) => padTop + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;
    const principal = puntos
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${cy(p.valor).toFixed(1)}`)
      .join(' ');
    const base = padTop + plotH;
    const area = `${principal} L ${cx(puntos.length - 1).toFixed(1)} ${base} L ${cx(0).toFixed(1)} ${base} Z`;
    const global = mostrarReferenciaGlobal
      ? puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${cy(p.valorGlobal).toFixed(1)}`).join(' ')
      : '';
    return { pathPrincipal: principal, pathArea: area, pathGlobal: global };
  }, [puntos, mostrarReferenciaGlobal, plotW, plotH, padLeft, padTop]);

  const pasoEtiquetasX = Math.max(1, Math.ceil(puntos.length / 8));
  const puntoActivo = indiceHover !== null && puntos[indiceHover] ? puntos[indiceHover] : puntos[puntos.length - 1];

  return (
    <section className="usage-chart-card" aria-label="Evolución del porcentaje de uso a lo largo del tiempo">
      <div className="usage-chart-header">
        <div>
          <h3 className="usage-chart-title">Evolución Temporal del % de Uso (desde 01/10/2026)</h3>
          <p className="usage-chart-subtitle">
            Serie evaluada: <strong>{poblacionLabel}</strong>
            {modoGrafico === 'acumulado' && ' · Indicador acumulado ISO 9001 sobre días corridos'}
            {modoGrafico === 'diario' && ' · Porcentaje de colaboradores que registraron cada día'}
            {modoGrafico === 'semanal' && ' · Cobertura agrupada por bloques de 7 días corridos'}
          </p>
        </div>

        <div className="usage-chart-modes" role="group" aria-label="Modo de visualización del gráfico">
          <button
            type="button"
            className={`usage-mode-btn ${modoGrafico === 'acumulado' ? 'active' : ''}`}
            onClick={() => onChangeModo('acumulado')}
          >
            📈 % Acumulado ISO
          </button>
          <button
            type="button"
            className={`usage-mode-btn ${modoGrafico === 'diario' ? 'active' : ''}`}
            onClick={() => onChangeModo('diario')}
          >
            📊 % Diario
          </button>
          <button
            type="button"
            className={`usage-mode-btn ${modoGrafico === 'semanal' ? 'active' : ''}`}
            onClick={() => onChangeModo('semanal')}
          >
            📅 Semanal
          </button>
        </div>
      </div>

      <div className="usage-chart-toolbar">
        <div className="usage-chart-filters">
          <div className="usage-filter-field">
            <label htmlFor="usage-chart-area">Área en gráfico</label>
            <select
              id="usage-chart-area"
              className="form-select form-select-clean"
              value={areaFiltro}
              onChange={(e) => {
                onChangeArea(e.target.value);
                onChangeEmpleado('');
              }}
            >
              <option value="TODAS">Todas las áreas</option>
              {areasDisponibles.map((area) => (
                <option key={area} value={area}>
                  Área {area}
                </option>
              ))}
            </select>
          </div>

          <div className="usage-filter-field">
            <label htmlFor="usage-chart-emp">Colaborador específico</label>
            <select
              id="usage-chart-emp"
              className="form-select form-select-clean"
              value={empleadoFiltro}
              onChange={(e) => onChangeEmpleado(e.target.value)}
            >
              <option value="">Todos ({empleadosEnArea.length})</option>
              {empleadosEnArea.map((emp) => (
                <option key={emp.id_usuario} value={emp.id_usuario}>
                  {emp.empleado} ({emp.porcentaje_cumplimiento}%)
                </option>
              ))}
            </select>
          </div>
        </div>

        {puntoActivo && (
          <div className="usage-chart-readout" aria-live="polite">
            <span className="readout-date">{puntoActivo.etiquetaCompleta}</span>
            <strong className="readout-value">{puntoActivo.valor.toFixed(1)}%</strong>
            <span className="readout-detail">
              {puntoActivo.cubiertos}/{puntoActivo.esperados} {modoGrafico === 'diario' ? 'colab.' : 'días-pers.'}
            </span>
            {mostrarReferenciaGlobal && (
              <span className="readout-global">Empresa: {puntoActivo.valorGlobal.toFixed(1)}%</span>
            )}
          </div>
        )}
      </div>

      <div className="usage-chart-legend">
        <span className="legend-item">
          <span className="legend-swatch swatch-primary" />
          {poblacionLabel}
        </span>
        {mostrarReferenciaGlobal && (
          <span className="legend-item">
            <span className="legend-swatch swatch-global" />
            Promedio Empresa
          </span>
        )}
        <span className="legend-item">
          <span className="legend-swatch swatch-meta" />
          Referencia 80%
        </span>
      </div>

      {puntos.length === 0 ? (
        <div className="usage-empty-state">No hay datos de serie temporal en el período seleccionado.</div>
      ) : (
        <div className="usage-svg-wrapper">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="usage-svg-chart"
            role="img"
            aria-label={`Gráfico de porcentaje de uso de ${poblacionLabel}`}
            onMouseLeave={() => setIndiceHover(null)}
          >
            <defs>
              <linearGradient id="usageAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-red, #cc3333)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--brand-red, #cc3333)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {[0, 25, 50, 75, 100].map((pct) => {
              const y = coordY(pct);
              return (
                <g key={pct}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    className="usage-grid-line"
                  />
                  <text x={padLeft - 10} y={y + 4} textAnchor="end" className="usage-axis-label">
                    {pct}%
                  </text>
                </g>
              );
            })}

            <line
              x1={padLeft}
              y1={coordY(80)}
              x2={width - padRight}
              y2={coordY(80)}
              className="usage-target-line"
            />

            {modoGrafico === 'semanal' ? (
              <>
                {puntos.map((p, idx) => {
                  const anchoCelda = plotW / Math.max(1, puntos.length);
                  const barW = Math.min(44, Math.max(12, anchoCelda * 0.56));
                  const xCentro = puntos.length === 1 ? padLeft + plotW / 2 : padLeft + idx * anchoCelda + anchoCelda / 2;
                  const x = xCentro - barW / 2;
                  const y = coordY(p.valor);
                  const h = Math.max(2, padTop + plotH - y);
                  const activo = indiceHover === idx;
                  return (
                    <g key={p.clave} onMouseEnter={() => setIndiceHover(idx)}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        rx="5"
                        className={`usage-bar ${activo ? 'active' : ''}`}
                      />
                      <text x={xCentro} y={y - 6} textAnchor="middle" className="usage-bar-value">
                        {p.valor.toFixed(0)}%
                      </text>
                      <text x={xCentro} y={height - 14} textAnchor="middle" className="usage-axis-label">
                        {p.etiqueta}
                      </text>
                    </g>
                  );
                })}
                {mostrarReferenciaGlobal && puntos.length > 0 && (
                  <path
                    d={puntos
                      .map((p, idx) => {
                        const anchoCelda = plotW / Math.max(1, puntos.length);
                        const xCentro = puntos.length === 1 ? padLeft + plotW / 2 : padLeft + idx * anchoCelda + anchoCelda / 2;
                        return `${idx === 0 ? 'M' : 'L'} ${xCentro.toFixed(1)} ${coordY(p.valorGlobal).toFixed(1)}`;
                      })
                      .join(' ')}
                    fill="none"
                    className="usage-line-global"
                  />
                )}
              </>
            ) : (
              <>
                <path d={pathArea} fill="url(#usageAreaGrad)" />
                {mostrarReferenciaGlobal && (
                  <path d={pathGlobal} fill="none" className="usage-line-global" />
                )}
                <path d={pathPrincipal} fill="none" className="usage-line-primary" />

                {puntos.map((p, idx) => {
                  const x = coordX(idx);
                  const y = coordY(p.valor);
                  const mostrarLabelX = idx === 0 || idx === puntos.length - 1 || idx % pasoEtiquetasX === 0;
                  const activo = indiceHover === idx;
                  const anchoFranja = puntos.length > 1 ? plotW / (puntos.length - 1) : plotW;

                  return (
                    <g key={p.clave} onMouseEnter={() => setIndiceHover(idx)}>
                      {mostrarLabelX && (
                        <text x={x} y={height - 14} textAnchor="middle" className="usage-axis-label">
                          {p.etiqueta}
                        </text>
                      )}
                      {activo && (
                        <line x1={x} y1={padTop} x2={x} y2={padTop + plotH} className="usage-hover-guide" />
                      )}
                      <circle
                        cx={x}
                        cy={y}
                        r={activo ? 5.5 : puntos.length <= 35 ? 3 : 2}
                        className={`usage-point ${activo ? 'active' : ''}`}
                      />
                      <rect
                        x={Math.max(padLeft, x - anchoFranja / 2)}
                        y={padTop}
                        width={anchoFranja}
                        height={plotH}
                        fill="transparent"
                      />
                    </g>
                  );
                })}
              </>
            )}
          </svg>
        </div>
      )}
    </section>
  );
}
