// [FN-11.04] Vista dedicada de Estadísticas de Uso y Conformidad ISO 9001 desde 01/10/2026
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, toast } from '../services/apiBridge';
import { puedeVerEstadisticasUso } from '../utils/permissions';
import { descargarJson } from '../utils/downloadJson';
import { construirDatosInformePdf } from '../utils/usageReportStats';
import logoIngeap from '../assets/Logo_Ingeap1.png';
import UsageEvolutionChart from './UsageEvolutionChart';

function obtenerHoyLocalIso() {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatearFechaUi(iso) {
  if (!iso || typeof iso !== 'string') return 'Sin registros';
  const partes = iso.slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function obtenerClaseNivelUso(porcentaje) {
  if (porcentaje >= 80) return 'uso-alto';
  if (porcentaje >= 50) return 'uso-medio';
  return 'uso-bajo';
}

export default function UsageStatsView({ usuario, onVolver, tema }) {
  const esAutorizado = puedeVerEstadisticasUso(usuario);
  const isRpg = tema === 'rpg';
  const hoyIso = obtenerHoyLocalIso();
  const chartSectionRef = useRef(null);

  const [fechaCorte, setFechaCorte] = useState(hoyIso >= '2026-10-01' ? hoyIso : '2026-10-01');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  // Controles de gráfico
  const [modoGrafico, setModoGrafico] = useState('acumulado'); // 'acumulado' | 'diario' | 'semanal'
  const [areaGrafico, setAreaGrafico] = useState('TODAS');
  const [empleadoGrafico, setEmpleadoGrafico] = useState('');

  // Controles de tabla
  const [busqueda, setBusqueda] = useState('');
  const [areaTabla, setAreaTabla] = useState('TODAS');
  const [nivelFiltro, setNivelFiltro] = useState('todos'); // 'todos' | 'alto' | 'medio' | 'bajo'
  const [ordenTabla, setOrdenTabla] = useState('pct_desc');

  // Modal de exportación de informe PDF
  const [modalPdfAbierto, setModalPdfAbierto] = useState(false);
  const [alcancePdf, setAlcancePdf] = useState('general'); // 'general' | 'area' | 'persona'
  const [areaPdf, setAreaPdf] = useState('TODAS');
  const [personaPdf, setPersonaPdf] = useState('');
  const [modoGraficoPdf, setModoGraficoPdf] = useState('acumulado');
  const [incluirGraficoPdf, setIncluirGraficoPdf] = useState(true);
  const [incluirDetallePdf, setIncluirDetallePdf] = useState(true);
  const [exportandoPdf, setExportandoPdf] = useState(false);

  useEffect(() => {
    if (esAutorizado) {
      api.maximizarVentana();
    }
  }, [esAutorizado]);

  const cargarEstadisticas = useCallback(async (fechaSolicitada = fechaCorte) => {
    if (!esAutorizado) return;
    setCargando(true);
    setErrorCarga('');
    try {
      const res = await api.obtenerEstadisticasUso(fechaSolicitada);
      if (res && res.resumen_general) {
        setDatos(res);
      } else {
        setErrorCarga('No se pudieron obtener las estadísticas de uso desde PostgreSQL.');
      }
    } catch (err) {
      console.error('Error cargando estadísticas de uso:', err);
      setErrorCarga('Error de comunicación al consultar estadísticas de uso.');
    } finally {
      setCargando(false);
    }
  }, [esAutorizado, fechaCorte]);

  useEffect(() => {
    cargarEstadisticas(fechaCorte);
  }, [cargarEstadisticas, fechaCorte]);

  const resumen = datos?.resumen_general || {
    fecha_inicio_medicion: '2026-10-01',
    fecha_corte_medicion: fechaCorte,
    dias_corridos_calendario: 1,
    usuarios_activos_totales: 0,
    usuarios_con_registros: 0,
    porcentaje_adopcion_plantilla: 0,
    dias_calendario_esperados_empresa: 0,
    dias_unicos_cubiertos_empresa: 0,
    registros_de_franco_cargados: 0,
    total_registros_asistencia: 0,
    porcentaje_uso_sobre_dias_corridos: 0
  };

  const detalleEmpleados = useMemo(
    () => (Array.isArray(datos?.detalle_empleados) ? datos.detalle_empleados : []),
    [datos]
  );

  const serieGlobal = useMemo(
    () => (Array.isArray(datos?.serie_diaria) ? datos.serie_diaria : []),
    [datos]
  );

  const areasDisponibles = useMemo(() => {
    const conjunto = new Set();
    detalleEmpleados.forEach((emp) => {
      if (emp.area) conjunto.add(emp.area);
    });
    return Array.from(conjunto).sort((a, b) => a.localeCompare(b, 'es'));
  }, [detalleEmpleados]);

  const empleadosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = detalleEmpleados.filter((emp) => {
      if (areaTabla !== 'TODAS' && emp.area !== areaTabla) return false;
      if (nivelFiltro === 'alto' && emp.porcentaje_cumplimiento < 80) return false;
      if (nivelFiltro === 'medio' && (emp.porcentaje_cumplimiento < 50 || emp.porcentaje_cumplimiento >= 80)) return false;
      if (nivelFiltro === 'bajo' && emp.porcentaje_cumplimiento >= 50) return false;
      if (q) {
        const nombre = String(emp.empleado || '').toLowerCase();
        const area = String(emp.area || '').toLowerCase();
        if (!nombre.includes(q) && !area.includes(q)) return false;
      }
      return true;
    });

    return lista.slice().sort((a, b) => {
      if (ordenTabla === 'pct_asc') {
        return a.porcentaje_cumplimiento - b.porcentaje_cumplimiento || a.empleado.localeCompare(b.empleado, 'es');
      }
      if (ordenTabla === 'nombre_asc') {
        return a.empleado.localeCompare(b.empleado, 'es');
      }
      if (ordenTabla === 'faltantes_desc') {
        return b.dias_faltantes - a.dias_faltantes || a.empleado.localeCompare(b.empleado, 'es');
      }
      return b.porcentaje_cumplimiento - a.porcentaje_cumplimiento || a.empleado.localeCompare(b.empleado, 'es');
    });
  }, [detalleEmpleados, busqueda, areaTabla, nivelFiltro, ordenTabla]);

  const totalesTabla = useMemo(() => {
    const totalCargados = empleadosFiltrados.reduce((acc, e) => acc + (e.dias_cargados || 0), 0);
    const totalActivos = empleadosFiltrados.reduce((acc, e) => acc + (e.dias_activos || 0), 0);
    const totalFrancos = empleadosFiltrados.reduce((acc, e) => acc + (e.dias_franco || 0), 0);
    const totalFaltantes = empleadosFiltrados.reduce((acc, e) => acc + (e.dias_faltantes || 0), 0);
    const totalEsperados = empleadosFiltrados.reduce((acc, e) => acc + (e.dias_corridos_esperados || 0), 0);
    const pct = totalEsperados > 0 ? Math.min(100, Number(((totalCargados / totalEsperados) * 100).toFixed(2))) : 0;
    return { totalCargados, totalActivos, totalFrancos, totalFaltantes, totalEsperados, pct };
  }, [empleadosFiltrados]);

  const handleVerEmpleadoEnGrafico = (emp) => {
    setAreaGrafico('TODAS');
    setEmpleadoGrafico(emp.id_usuario);
    chartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const empleadosOrdenadosNombre = useMemo(() => {
    return detalleEmpleados
      .slice()
      .sort((a, b) => String(a.empleado || '').localeCompare(String(b.empleado || ''), 'es'));
  }, [detalleEmpleados]);

  const empleadosModalPdf = useMemo(() => {
    if (areaPdf === 'TODAS') return empleadosOrdenadosNombre;
    return empleadosOrdenadosNombre.filter((e) => e.area === areaPdf);
  }, [empleadosOrdenadosNombre, areaPdf]);

  useEffect(() => {
    if (!modalPdfAbierto) return undefined;
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape' && !exportandoPdf) {
        setModalPdfAbierto(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalPdfAbierto, exportandoPdf]);

  const handleAbrirModalPdf = () => {
    if (!datos) return;
    if (empleadoGrafico) {
      const empObj = detalleEmpleados.find((e) => e.id_usuario === empleadoGrafico);
      setAlcancePdf('persona');
      setAreaPdf(empObj?.area || (areaGrafico !== 'TODAS' ? areaGrafico : 'TODAS'));
      setPersonaPdf(empleadoGrafico);
    } else if (areaGrafico !== 'TODAS' || areaTabla !== 'TODAS') {
      const areaActiva = areaGrafico !== 'TODAS' ? areaGrafico : areaTabla;
      setAlcancePdf('area');
      setAreaPdf(areaActiva);
      const primeroArea = empleadosOrdenadosNombre.find((e) => e.area === areaActiva);
      setPersonaPdf(primeroArea?.id_usuario || empleadosOrdenadosNombre[0]?.id_usuario || '');
    } else {
      setAlcancePdf('general');
      setAreaPdf(areasDisponibles[0] || 'TODAS');
      setPersonaPdf(empleadosOrdenadosNombre[0]?.id_usuario || '');
    }
    setModoGraficoPdf(modoGrafico);
    setModalPdfAbierto(true);
  };

  const handleCambiarAlcancePdf = (nuevoAlcance) => {
    setAlcancePdf(nuevoAlcance);
    if (nuevoAlcance === 'area' && (areaPdf === 'TODAS' || !areasDisponibles.includes(areaPdf))) {
      setAreaPdf(areasDisponibles[0] || 'TODAS');
    }
    if (nuevoAlcance === 'persona' && !personaPdf) {
      setPersonaPdf(empleadosModalPdf[0]?.id_usuario || empleadosOrdenadosNombre[0]?.id_usuario || '');
    }
  };

  const handleConfirmarExportarPdf = async () => {
    if (!datos || exportandoPdf) return;
    if (alcancePdf === 'area' && (!areaPdf || areaPdf === 'TODAS')) {
      toast.error('Seleccione un área para generar el informe PDF.');
      return;
    }
    if (alcancePdf === 'persona' && !personaPdf) {
      toast.error('Seleccione un colaborador para generar el informe PDF.');
      return;
    }

    setExportandoPdf(true);
    try {
      const informe = construirDatosInformePdf({
        datos,
        alcance: alcancePdf,
        areaSeleccionada: areaPdf,
        empleadoId: personaPdf,
        modoGrafico: modoGraficoPdf,
        fechaCorte: resumen.fecha_corte_medicion
      });
      const { generarInformeUsoPdf } = await import('../utils/usageStatsPdf');
      const { nombreArchivo, blob, base64 } = await generarInformeUsoPdf({
        informe,
        opciones: {
          incluirGrafico: incluirGraficoPdf,
          incluirDetalle: incluirDetallePdf
        },
        usuarioEmisor: usuario,
        logoUrl: logoIngeap
      });

      const res = await api.guardarInformePdf(nombreArchivo, base64, blob);
      if (res?.cancelado) {
        toast.info('Exportación PDF cancelada.');
        return;
      }
      if (res?.exito) {
        setModalPdfAbierto(false);
        toast.success(
          res.descargadoNavegador
            ? `Informe PDF descargado (${nombreArchivo}).`
            : `Informe PDF guardado en ${res.ruta || nombreArchivo}.`
        );
      }
    } catch (err) {
      console.error('Error al generar o guardar informe PDF:', err);
      toast.error('No se pudo generar el informe PDF de estadísticas.');
    } finally {
      setExportandoPdf(false);
    }
  };

  const handleExportarJson = () => {
    if (!datos) return;
    const evidencia = {
      norma_referencia: 'ISO 9001:2026 (Sexta edicion)',
      fecha_generacion_evidencia: new Date().toISOString(),
      '1_eficacia_del_cambio_dias_corridos_desde_2026_10_01': {
        ...resumen,
        porcentaje_adopcion_plantilla: `${resumen.porcentaje_adopcion_plantilla}%`,
        porcentaje_uso_sobre_dias_corridos: `${resumen.porcentaje_uso_sobre_dias_corridos}%`,
        detalle_cumplimiento_por_empleado: detalleEmpleados.map((e) => ({
          empleado: e.empleado,
          area: e.area,
          dias_cargados: e.dias_cargados,
          dias_activos: e.dias_activos,
          dias_franco: e.dias_franco,
          dias_faltantes: e.dias_faltantes,
          dias_corridos_esperados: e.dias_corridos_esperados,
          porcentaje_cumplimiento: `${e.porcentaje_cumplimiento}%`,
          ultima_fecha: e.ultima_fecha
        }))
      },
      serie_evolucion_diaria: serieGlobal
    };
    descargarJson(evidencia, `estadisticas_uso_iso9001_${resumen.fecha_corte_medicion}.json`);
    toast.success('Evidencia de estadísticas exportada en JSON.');
  };

  if (!esAutorizado) {
    return (
      <div className="view-content usage-stats-denied">
        <p>El módulo de Estadísticas de Uso solo está disponible para usuarios Core, Sub Admin o Admin.</p>
        <button type="button" className="btn-back" onClick={onVolver}>
          ← Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className={`view-content usage-stats-container ${isRpg ? 'history-rpg-container' : ''}`}>
      <div className="usage-stats-header">
        <div className="usage-header-left">
          <button type="button" className="btn-back usage-btn-control" onClick={onVolver}>
            ← Volver
          </button>
          <div>
            <h2 className="usage-stats-title">📊 Estadísticas de Uso y Conformidad</h2>
            <p className="usage-stats-subtitle">
              Evaluación de días corridos (lunes a domingo, incluyendo francos) del{' '}
              <strong>01/10/2026</strong> al <strong>{formatearFechaUi(resumen.fecha_corte_medicion)}</strong>{' '}
              ({resumen.dias_corridos_calendario} días)
            </p>
          </div>
        </div>

        <div className="usage-header-actions">
          <div className="usage-date-control">
            <label htmlFor="usage-cutoff-date">Fecha de corte</label>
            <input
              id="usage-cutoff-date"
              type="date"
              className="form-input form-input-clean"
              min="2026-10-01"
              max={hoyIso >= '2026-10-01' ? hoyIso : '2026-10-01'}
              value={fechaCorte}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v >= '2026-10-01') setFechaCorte(v);
              }}
            />
          </div>

          <button
            type="button"
            className="usage-btn-secondary"
            onClick={() => cargarEstadisticas(fechaCorte)}
            disabled={cargando}
          >
            🔄 {cargando ? 'Actualizando...' : 'Actualizar'}
          </button>

          <button
            type="button"
            className="usage-btn-secondary"
            onClick={handleExportarJson}
            disabled={!datos || cargando}
          >
            📥 Exportar JSON
          </button>

          <button
            type="button"
            className="usage-btn-primary"
            onClick={handleAbrirModalPdf}
            disabled={!datos || cargando || detalleEmpleados.length === 0}
          >
            📄 Exportar PDF
          </button>
        </div>
      </div>

      {errorCarga && (
        <div className="usage-error-banner" role="alert">
          <span>{errorCarga}</span>
          <button type="button" className="usage-btn-secondary" onClick={() => cargarEstadisticas(fechaCorte)}>
            Reintentar
          </button>
        </div>
      )}

      {/* Tarjetas KPI de Total General */}
      <div className="usage-kpi-grid">
        <div className="usage-kpi-card kpi-highlight">
          <span className="usage-kpi-label">% Uso Total (Días Corridos)</span>
          <div className="usage-kpi-value">{resumen.porcentaje_uso_sobre_dias_corridos}%</div>
          <div className="usage-kpi-progress">
            <div
              className={`usage-kpi-progress-fill ${obtenerClaseNivelUso(resumen.porcentaje_uso_sobre_dias_corridos)}`}
              style={{ width: `${Math.min(100, resumen.porcentaje_uso_sobre_dias_corridos)}%` }}
            />
          </div>
          <span className="usage-kpi-foot">
            {resumen.dias_unicos_cubiertos_empresa} / {resumen.dias_calendario_esperados_empresa} días-persona cubiertos
          </span>
        </div>

        <div className="usage-kpi-card">
          <span className="usage-kpi-label">Adopción de Plantilla Activa</span>
          <div className="usage-kpi-value">{resumen.porcentaje_adopcion_plantilla}%</div>
          <span className="usage-kpi-foot">
            {resumen.usuarios_con_registros} de {resumen.usuarios_activos_totales} colaboradores con al menos 1 registro
          </span>
        </div>

        <div className="usage-kpi-card">
          <span className="usage-kpi-label">Período Calendario Evaluado</span>
          <div className="usage-kpi-value">{resumen.dias_corridos_calendario} días</div>
          <span className="usage-kpi-foot">
            Base fija: 01/10/2026 → {formatearFechaUi(resumen.fecha_corte_medicion)}
          </span>
        </div>

        <div className="usage-kpi-card">
          <span className="usage-kpi-label">Volumen Total de Registros</span>
          <div className="usage-kpi-value">{resumen.total_registros_asistencia}</div>
          <span className="usage-kpi-foot">
            Incluye {resumen.registros_de_franco_cargados} registro(s) de franco cargados
          </span>
        </div>
      </div>

      {/* Gráfico de Evolución Temporal */}
      <div ref={chartSectionRef}>
        <UsageEvolutionChart
          detalleEmpleados={detalleEmpleados}
          serieGlobal={serieGlobal}
          areasDisponibles={areasDisponibles}
          areaFiltro={areaGrafico}
          onChangeArea={setAreaGrafico}
          empleadoFiltro={empleadoGrafico}
          onChangeEmpleado={setEmpleadoGrafico}
          modoGrafico={modoGrafico}
          onChangeModo={setModoGrafico}
        />
      </div>

      {/* Desglose por Empleado */}
      <section className="usage-table-card" aria-label="Cumplimiento por colaborador">
        <div className="usage-table-header">
          <div>
            <h3 className="usage-chart-title">Cumplimiento Detallado por Colaborador</h3>
            <p className="usage-chart-subtitle">
              Mostrando {empleadosFiltrados.length} de {detalleEmpleados.length} colaboradores activos
            </p>
          </div>

          <div className="usage-table-filters">
            <input
              type="text"
              className="form-input form-input-clean"
              placeholder="Buscar colaborador o área..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar colaborador o área"
            />

            <select
              className="form-select form-select-clean"
              value={areaTabla}
              onChange={(e) => setAreaTabla(e.target.value)}
              aria-label="Filtrar tabla por área"
            >
              <option value="TODAS">Todas las áreas</option>
              {areasDisponibles.map((area) => (
                <option key={area} value={area}>
                  Área {area}
                </option>
              ))}
            </select>

            <select
              className="form-select form-select-clean"
              value={nivelFiltro}
              onChange={(e) => setNivelFiltro(e.target.value)}
              aria-label="Filtrar por nivel de cumplimiento"
            >
              <option value="todos">Todos los niveles</option>
              <option value="alto">Alto (≥ 80%)</option>
              <option value="medio">Medio (50% – 79%)</option>
              <option value="bajo">Bajo (&lt; 50%)</option>
            </select>

            <select
              className="form-select form-select-clean"
              value={ordenTabla}
              onChange={(e) => setOrdenTabla(e.target.value)}
              aria-label="Ordenar tabla de colaboradores"
            >
              <option value="pct_desc">Mayor % cumplimiento</option>
              <option value="pct_asc">Menor % cumplimiento</option>
              <option value="faltantes_desc">Más días faltantes</option>
              <option value="nombre_asc">Nombre (A–Z)</option>
            </select>
          </div>
        </div>

        <div className="usage-table-scroll">
          <table className="usage-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Colaborador</th>
                <th>Área</th>
                <th>Días Cargados</th>
                <th>Activos / Francos</th>
                <th>Faltantes</th>
                <th>Esperados</th>
                <th>% Cumplimiento</th>
                <th>Último Registro</th>
                <th>Evolución</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan="10" className="usage-table-empty">
                    Calculando estadísticas de uso en PostgreSQL...
                  </td>
                </tr>
              ) : empleadosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="10" className="usage-table-empty">
                    No se encontraron colaboradores para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                empleadosFiltrados.map((emp, index) => {
                  const claseNivel = obtenerClaseNivelUso(emp.porcentaje_cumplimiento);
                  const seleccionado = empleadoGrafico === emp.id_usuario;
                  return (
                    <tr key={emp.id_usuario} className={seleccionado ? 'usage-row-selected' : ''}>
                      <td>{index + 1}</td>
                      <td>
                        <div className="usage-emp-name">{emp.empleado}</div>
                      </td>
                      <td>
                        <span className="usage-area-badge">{emp.area}</span>
                      </td>
                      <td className="usage-num-strong">{emp.dias_cargados}</td>
                      <td className="usage-num-muted">
                        {emp.dias_activos} act. / {emp.dias_franco} fr.
                      </td>
                      <td className="usage-num-muted">{emp.dias_faltantes}</td>
                      <td className="usage-num-muted">{emp.dias_corridos_esperados}</td>
                      <td>
                        <div className="usage-pct-cell">
                          <div className="usage-progress-bar">
                            <div
                              className={`usage-progress-fill ${claseNivel}`}
                              style={{ width: `${Math.min(100, emp.porcentaje_cumplimiento)}%` }}
                            />
                          </div>
                          <span className={`usage-pct-badge ${claseNivel}`}>
                            {emp.porcentaje_cumplimiento.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="usage-num-muted">{formatearFechaUi(emp.ultima_fecha)}</td>
                      <td>
                        <button
                          type="button"
                          className={`usage-btn-row-chart ${seleccionado ? 'active' : ''}`}
                          onClick={() => handleVerEmpleadoEnGrafico(emp)}
                          title={`Ver evolución temporal de ${emp.empleado} en el gráfico`}
                        >
                          {seleccionado ? '✓ En gráfico' : '📈 Gráfico'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!cargando && empleadosFiltrados.length > 0 && (
              <tfoot>
                <tr className="usage-table-total-row">
                  <td colSpan="3">
                    <strong>
                      Total ({empleadosFiltrados.length === detalleEmpleados.length ? 'General Empresa' : 'Selección Filtrada'})
                    </strong>
                  </td>
                  <td>
                    <strong>{totalesTabla.totalCargados}</strong>
                  </td>
                  <td>
                    {totalesTabla.totalActivos} act. / {totalesTabla.totalFrancos} fr.
                  </td>
                  <td>
                    <strong>{totalesTabla.totalFaltantes}</strong>
                  </td>
                  <td>{totalesTabla.totalEsperados}</td>
                  <td>
                    <span className={`usage-pct-badge ${obtenerClaseNivelUso(totalesTabla.pct)}`}>
                      {totalesTabla.pct.toFixed(2)}%
                    </span>
                  </td>
                  <td colSpan="2">
                    Base global: {resumen.porcentaje_uso_sobre_dias_corridos}% ({resumen.dias_unicos_cubiertos_empresa}/
                    {resumen.dias_calendario_esperados_empresa})
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {modalPdfAbierto && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="usage-pdf-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !exportandoPdf) {
              setModalPdfAbierto(false);
            }
          }}
        >
          <div className="modal-box usage-pdf-modal">
            <div className="modal-header">
              <span id="usage-pdf-modal-title" className="modal-title">
                📄 Descargar Informe PDF de Métricas de Uso
              </span>
              <button
                type="button"
                className="modal-close"
                aria-label="Cerrar modal de exportación PDF"
                onClick={() => !exportandoPdf && setModalPdfAbierto(false)}
                disabled={exportandoPdf}
              >
                ✕
              </button>
            </div>

            <div className="usage-pdf-modal-body">
              <p className="usage-pdf-period-info">
                Período evaluado: <strong>01/10/2026</strong> al{' '}
                <strong>{formatearFechaUi(resumen.fecha_corte_medicion)}</strong> ({resumen.dias_corridos_calendario} días corridos)
              </p>

              <div className="usage-pdf-field-group">
                <span className="usage-pdf-section-label">Alcance del informe</span>
                <div className="usage-pdf-scope-grid" role="group" aria-label="Alcance del informe PDF">
                  <button
                    type="button"
                    className={`usage-pdf-scope-btn ${alcancePdf === 'general' ? 'active' : ''}`}
                    onClick={() => handleCambiarAlcancePdf('general')}
                    disabled={exportandoPdf}
                  >
                    🏢 Toda la empresa
                  </button>
                  <button
                    type="button"
                    className={`usage-pdf-scope-btn ${alcancePdf === 'area' ? 'active' : ''}`}
                    onClick={() => handleCambiarAlcancePdf('area')}
                    disabled={exportandoPdf || areasDisponibles.length === 0}
                  >
                    🗂️ Por Área
                  </button>
                  <button
                    type="button"
                    className={`usage-pdf-scope-btn ${alcancePdf === 'persona' ? 'active' : ''}`}
                    onClick={() => handleCambiarAlcancePdf('persona')}
                    disabled={exportandoPdf || empleadosOrdenadosNombre.length === 0}
                  >
                    👤 Por Persona
                  </button>
                </div>
              </div>

              {(alcancePdf === 'area' || alcancePdf === 'persona') && (
                <div className="usage-pdf-selectors-grid">
                  <div className="usage-filter-field">
                    <label htmlFor="usage-pdf-area">
                      {alcancePdf === 'area' ? 'Área a informar' : 'Filtrar por Área (opcional)'}
                    </label>
                    <select
                      id="usage-pdf-area"
                      className="form-select form-select-clean"
                      value={areaPdf}
                      disabled={exportandoPdf}
                      onChange={(e) => {
                        const nuevaArea = e.target.value;
                        setAreaPdf(nuevaArea);
                        if (alcancePdf === 'persona') {
                          const listaArea = nuevaArea === 'TODAS'
                            ? empleadosOrdenadosNombre
                            : empleadosOrdenadosNombre.filter((emp) => emp.area === nuevaArea);
                          if (!listaArea.some((emp) => emp.id_usuario === personaPdf)) {
                            setPersonaPdf(listaArea[0]?.id_usuario || '');
                          }
                        }
                      }}
                    >
                      {alcancePdf === 'persona' && <option value="TODAS">Todas las áreas</option>}
                      {areasDisponibles.map((area) => (
                        <option key={area} value={area}>
                          Área {area}
                        </option>
                      ))}
                    </select>
                  </div>

                  {alcancePdf === 'persona' && (
                    <div className="usage-filter-field">
                      <label htmlFor="usage-pdf-persona">Colaborador</label>
                      <select
                        id="usage-pdf-persona"
                        className="form-select form-select-clean"
                        value={personaPdf}
                        disabled={exportandoPdf}
                        onChange={(e) => setPersonaPdf(e.target.value)}
                      >
                        {empleadosModalPdf.map((emp) => (
                          <option key={emp.id_usuario} value={emp.id_usuario}>
                            {emp.empleado} ({emp.area} · {emp.porcentaje_cumplimiento}%)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="usage-pdf-field-group">
                <label className="usage-pdf-section-label" htmlFor="usage-pdf-chart-mode">
                  Serie temporal de evolución
                </label>
                <select
                  id="usage-pdf-chart-mode"
                  className="form-select form-select-clean"
                  value={modoGraficoPdf}
                  disabled={exportandoPdf || !incluirGraficoPdf}
                  onChange={(e) => setModoGraficoPdf(e.target.value)}
                >
                  <option value="acumulado">% Acumulado ISO (días corridos desde 01/10/2026)</option>
                  <option value="diario">% Diario (cobertura día a día)</option>
                  <option value="semanal">Semanal (bloques de 7 días)</option>
                </select>
              </div>

              <div className="usage-pdf-field-group">
                <span className="usage-pdf-section-label">Secciones del documento</span>
                <label className="usage-pdf-checkbox-row">
                  <input
                    type="checkbox"
                    checked={incluirGraficoPdf}
                    disabled={exportandoPdf}
                    onChange={(e) => setIncluirGraficoPdf(e.target.checked)}
                  />
                  <span>Incluir gráfico de evolución temporal (% uso vs meta 80%)</span>
                </label>
                <label className="usage-pdf-checkbox-row">
                  <input
                    type="checkbox"
                    checked={incluirDetallePdf}
                    disabled={exportandoPdf}
                    onChange={(e) => setIncluirDetallePdf(e.target.checked)}
                  />
                  <span>
                    {alcancePdf === 'persona'
                      ? 'Incluir resumen mensual y listado de días sin cargar'
                      : 'Incluir tabla detallada de cumplimiento por colaborador'}
                  </span>
                </label>
              </div>
            </div>

            <div className="modal-actions usage-pdf-modal-actions">
              <button
                type="button"
                className="usage-btn-secondary"
                onClick={() => setModalPdfAbierto(false)}
                disabled={exportandoPdf}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="usage-btn-primary"
                onClick={handleConfirmarExportarPdf}
                disabled={exportandoPdf}
              >
                {exportandoPdf ? '⏳ Generando PDF...' : '⬇ Generar y Guardar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
