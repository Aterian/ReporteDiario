// [MOD-05] RosterGanttChart - Cronograma visual Gantt y modales de edición/exportación
import React from 'react';
import { NOMBRES_MESES } from './rosterConstants';

export default function RosterGanttChart({
  mesGantt,
  anioGantt,
  onCambiarMes,
  filtroProyectoGantt,
  onFiltroProyectoChange,
  proyectosDisponibles = [],
  cargandoRosters,
  diasEnMes = [],
  empleadosEnGantt = [],
  anchoColEmp,
  anchoColTotal,
  anchoColDia,
  onResizeStart,
  onStepColDia,
  onResetColWidths,
  onAbrirEditar,
  // Modal de edición
  modalEditar,
  onCerrarModalEdit,
  editEmpleado,
  onEditEmpleadoChange,
  editProyecto,
  onEditProyectoChange,
  editFechaInicio,
  onEditFechaInicioChange,
  editFechaFin,
  onEditFechaFinChange,
  editTipo,
  onEditTipoChange,
  tarifaModalEdit,
  editPrecioDia,
  editPrecioDomingo,
  onAsignarTarifasOficiales,
  guardandoEdit,
  eliminandoEdit,
  onGuardarEdicion,
  onEliminarTurno,
  // Modal de exportación
  mostrarModalExport,
  onCerrarModalExport,
  proyectoAExportar,
  onProyectoAExportarChange,
  exportandoExcel,
  onConfirmarExportar
}) {
  return (
    <>
      <div className="roster-gantt-panel">
        <div className="roster-gantt-card">

          {/* Encabezado del Gantt: Navegación de meses, filtros y redimensionamiento */}
          <div className="gantt-header-controls">
            <div className="gantt-month-navigator">
              <button
                type="button"
                className="btn-gantt-nav"
                onClick={() => onCambiarMes(-1)}
                title="Mes anterior"
              >
                ◀
              </button>
              <span className="gantt-current-month">
                {NOMBRES_MESES[mesGantt]} {anioGantt}
              </span>
              <button
                type="button"
                className="btn-gantt-nav"
                onClick={() => onCambiarMes(1)}
                title="Mes siguiente"
              >
                ▶
              </button>
            </div>

            <div className="gantt-right-controls-group">
              {/* Selector de Proyecto */}
              <div className="gantt-project-filter">
                <label>Proyecto:</label>
                <select
                  value={filtroProyectoGantt}
                  onChange={(e) => onFiltroProyectoChange(e.target.value)}
                  className="gantt-filter-select"
                >
                  <option value="TODOS">Todos los proyectos (Ingeniería)</option>
                  {proyectosDisponibles.map((p, i) => (
                    <option key={i} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Controles manuales de tamaño de columnas de días */}
              <div className="gantt-col-size-bar">
                <span className="size-label" title="Ancho de columnas de días">Zoom días:</span>
                <button
                  type="button"
                  className="btn-col-step"
                  onClick={() => onStepColDia(-4)}
                  title="Reducir ancho de días"
                >
                  -
                </button>
                <span className="size-num-indicator">{anchoColDia}px</span>
                <button
                  type="button"
                  className="btn-col-step"
                  onClick={() => onStepColDia(4)}
                  title="Aumentar ancho de días"
                >
                  +
                </button>
                <button
                  type="button"
                  className="btn-col-reset"
                  onClick={onResetColWidths}
                  title="Restablecer anchos de columnas por defecto"
                >
                  ↺ Reset
                </button>
              </div>
            </div>
          </div>

          {/* Leyenda explicativa de colores y ayuda de columnas */}
          <div className="gantt-legend-bar">
            <div className="legend-items-left">
              <div className="legend-item">
                <span className="legend-box campo"></span>
                <span>Activo en Campo / Obra</span>
              </div>
              <div className="legend-item">
                <span className="legend-box subida"></span>
                <span>⬆️ Subida (Inicio Campo)</span>
              </div>
              <div className="legend-item">
                <span className="legend-box bajada"></span>
                <span>⬇️ Bajada (Inicio Franco)</span>
              </div>
              <div className="legend-item">
                <span className="legend-box franco"></span>
                <span>Franco / Descanso</span>
              </div>
              <div className="legend-item">
                <span className="legend-box domingo"></span>
                <span>Domingo Resaltado (Tarifa especial)</span>
              </div>
            </div>
            <div className="legend-resizer-hint">
              <span>💡 Podés arrastrar los bordes de los encabezados para cambiar el ancho de las columnas.</span>
            </div>
          </div>

          {/* Grilla Gantt con scroll horizontal y vertical */}
          <div className="gantt-table-container">
            {cargandoRosters ? (
              <div className="gantt-loading">
                <div className="spinner-mini"></div>
                <span>Cargando planificación del mes...</span>
              </div>
            ) : empleadosEnGantt.length === 0 ? (
              <div className="gantt-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <h4>No hay registros de roster en {NOMBRES_MESES[mesGantt]} {anioGantt}</h4>
                <p>Completa el formulario de la izquierda para comenzar a planificar turnos y francos.</p>
              </div>
            ) : (
              <table className="gantt-table">
                <thead>
                  <tr>
                    {/* Columna Empleado redimensionable */}
                    <th
                      className="gantt-th-emp"
                      style={{
                        width: `${anchoColEmp}px`,
                        minWidth: `${anchoColEmp}px`,
                        maxWidth: `${anchoColEmp}px`
                      }}
                    >
                      <div className="th-content-resizable">
                        <span>Empleado / Proyecto</span>
                        <div
                          className="col-resizer"
                          onMouseDown={(e) => onResizeStart(e, 'emp')}
                          title="Arrastrar para ajustar ancho de la columna Empleado"
                        />
                      </div>
                    </th>

                    {/* Columna Total a Liquidar redimensionable */}
                    <th
                      className="gantt-th-totales"
                      style={{
                        left: `${anchoColEmp}px`,
                        width: `${anchoColTotal}px`,
                        minWidth: `${anchoColTotal}px`,
                        maxWidth: `${anchoColTotal}px`
                      }}
                    >
                      <div className="th-content-resizable">
                        <span>Total a Liquidar</span>
                        <div
                          className="col-resizer"
                          onMouseDown={(e) => onResizeStart(e, 'total')}
                          title="Arrastrar para ajustar ancho de la columna Total"
                        />
                      </div>
                    </th>

                    {/* Columnas de los días del mes redimensionables */}
                    {diasEnMes.map(d => (
                      <th
                        key={d.numero}
                        className={`gantt-th-day ${d.esDomingo ? 'col-domingo' : ''}`}
                        style={{
                          width: `${anchoColDia}px`,
                          minWidth: `${anchoColDia}px`,
                          maxWidth: `${anchoColDia}px`
                        }}
                        title={d.esDomingo ? 'Día Domingo' : ''}
                      >
                        <div className="th-content-resizable day-header-cell">
                          <span className="th-day-name">{d.diaSemanaNombre}</span>
                          <span className="th-day-num">{d.numero}</span>
                          {d.esDomingo && <span className="dom-tag">DOM</span>}
                          <div
                            className="col-resizer day-resizer"
                            onMouseDown={(e) => onResizeStart(e, 'dia')}
                            title="Arrastrar para ajustar ancho de los días"
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {empleadosEnGantt.map(emp => {
                    let diasNormActivos = 0;
                    let domingosActivos = 0;
                    let dineroTotal = 0;

                    const estadoDia = {};
                    diasEnMes.forEach(d => {
                      for (const r of emp.registros) {
                        if (r.fecha_inicio <= d.fechaStr && d.fechaStr <= r.fecha_fin) {
                          estadoDia[d.numero] = r;
                          if (r.tipo === 'Campo') {
                            if (d.esDomingo) {
                              domingosActivos += 1;
                              dineroTotal += Number(r.precio_domingo) || 0;
                            } else {
                              diasNormActivos += 1;
                              dineroTotal += Number(r.precio_dia) || 0;
                            }
                          }
                          break;
                        }
                      }
                    });

                    return (
                      <tr key={emp.nombre} className="gantt-row">
                        <td
                          className="gantt-td-emp"
                          style={{
                            width: `${anchoColEmp}px`,
                            minWidth: `${anchoColEmp}px`,
                            maxWidth: `${anchoColEmp}px`
                          }}
                        >
                          <div className="emp-info-pill">
                            <div className="emp-avatar-mini">
                              {emp.nombre.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="emp-text-col">
                              <span className="emp-name-text" title={emp.nombre}>{emp.nombre}</span>
                              <div className="emp-projects-badge-row">
                                {emp.proyectos && emp.proyectos.length > 0 ? (
                                  emp.proyectos.map((proy, pIdx) => (
                                    <span
                                      key={pIdx}
                                      className="emp-proy-chip"
                                      title={`Proyecto asignado: ${proy}`}
                                    >
                                      <span className="proy-dot"></span>
                                      <span className="proy-text">{proy}</span>
                                    </span>
                                  ))
                                ) : (
                                  <span className="emp-proy-chip unassigned">Sin proyecto</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td
                          className="gantt-td-totales"
                          style={{
                            left: `${anchoColEmp}px`,
                            width: `${anchoColTotal}px`,
                            minWidth: `${anchoColTotal}px`,
                            maxWidth: `${anchoColTotal}px`
                          }}
                        >
                          <div className="totals-card-mini">
                            <span className="total-money">
                              ${dineroTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="total-days-detail">
                              {diasNormActivos}d norm. + {domingosActivos} dom.
                            </span>
                          </div>
                        </td>

                        {diasEnMes.map(d => {
                          const rInfo = estadoDia[d.numero];
                          const esDom = d.esDomingo;

                          return (
                            <td
                              key={d.numero}
                              className={`gantt-td-day ${esDom ? 'col-domingo' : ''}`}
                              style={{
                                width: `${anchoColDia}px`,
                                minWidth: `${anchoColDia}px`,
                                maxWidth: `${anchoColDia}px`,
                              }}
                            >
                              {rInfo && (() => {
                                const esSubida = (rInfo.tipo === 'Campo' && d.fechaStr === rInfo.fecha_inicio);
                                const esBajada = (rInfo.tipo === 'Franco' && d.fechaStr === rInfo.fecha_inicio);

                                let badgeTipoClass = 'bar-campo';
                                if (esSubida) badgeTipoClass = 'bar-subida';
                                else if (esBajada) badgeTipoClass = 'bar-bajada';
                                else if (rInfo.tipo === 'Campo') badgeTipoClass = 'bar-campo';
                                else if (rInfo.tipo === 'Franco') badgeTipoClass = 'bar-franco';
                                else if (rInfo.tipo === 'Vacaciones') badgeTipoClass = 'bar-vacaciones';
                                else if (rInfo.tipo === 'Licencia') badgeTipoClass = 'bar-licencia';

                                const etiquetaBarra = esSubida ? '⬆S' : (esBajada ? '⬇B' : (rInfo.tipo === 'Campo' ? 'C' : rInfo.tipo === 'Franco' ? 'F' : rInfo.tipo === 'Vacaciones' ? 'V' : 'L'));

                                const tituloTooltip = `${esSubida
                                  ? '⬆️ SUBIDA (Inicio de Campo / Viaje)'
                                  : esBajada
                                    ? '⬇️ BAJADA (Inicio de Descanso / Viaje)'
                                    : rInfo.tipo === 'Campo'
                                      ? '🚜 Campo / Obra'
                                      : rInfo.tipo === 'Franco'
                                        ? '🏠 Franco'
                                        : rInfo.tipo === 'Vacaciones'
                                          ? '🏖️ Vacaciones'
                                          : '🏥 Licencia'
                                  }\nEmpleado: ${emp.nombre}\nProyecto: ${rInfo.proyecto}${rInfo.tipo === 'Campo'
                                    ? `\nTarifa día: $${rInfo.precio_dia || 0} | Dom: $${rInfo.precio_domingo || 0}`
                                    : ''
                                  }\n\n(Click para modificar o eliminar este turno)`;

                                return (
                                  <div
                                    className={`gantt-bar-cell ${badgeTipoClass}`}
                                    data-testid="gantt-bar-cell"
                                    title={tituloTooltip}
                                    onClick={() => onAbrirEditar(rInfo)}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    {etiquetaBarra}
                                  </div>
                                );
                              })()}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>

      {/* Modal para exportar Roster a Excel por Proyecto */}
      {mostrarModalExport && (
        <div className="roster-modal-overlay" onClick={() => !exportandoExcel && onCerrarModalExport()}>
          <div className="roster-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="roster-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="roster-title-badge" style={{ margin: 0, background: '#059669' }}>EXCEL</span>
                <h3>Exportar Roster por Proyecto</h3>
              </div>
              <p>
                El archivo .xlsx oficial contendrá las 3 hojas reglamentarias (Ciclo Completo, 1ra Quincena y 2da Quincena) para <strong>{NOMBRES_MESES[mesGantt]} {anioGantt}</strong>, exclusivamente con los registros del proyecto seleccionado.
              </p>
            </div>

            <div className="roster-modal-body">
              <div className="form-group-roster highlight-project">
                <label className="roster-label">
                  <span>Proyecto a Exportar (Ingeniería - I) <strong className="required">*</strong></span>
                </label>
                <select
                  value={proyectoAExportar}
                  onChange={(e) => onProyectoAExportarChange(e.target.value)}
                  className="roster-select"
                  disabled={exportandoExcel}
                >
                  {proyectosDisponibles.map((p, idx) => (
                    <option key={idx} value={p}>{p}</option>
                  ))}
                </select>
                <span className="form-hint">
                  Mostrando únicamente proyectos del área de Ingeniería (I).
                </span>
              </div>
            </div>

            <div className="roster-modal-footer" style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn-modal-cancel"
                disabled={exportandoExcel}
                onClick={onCerrarModalExport}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-modal-confirm"
                disabled={exportandoExcel}
                onClick={onConfirmarExportar}
                style={{ background: '#059669' }}
              >
                {exportandoExcel ? 'Generando Excel...' : 'Descargar Archivo Excel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal interactivo para modificar el turno de Roster seleccionado en el Gantt */}
      {modalEditar && (
        <div className="roster-modal-overlay" onClick={() => !guardandoEdit && onCerrarModalEdit()}>
          <div className="roster-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="roster-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="roster-title-badge" style={{ margin: 0, background: '#2563eb' }}>EDITAR</span>
                <h3>Modificar Turno de Roster</h3>
              </div>
              <p>Actualiza la asignación, fechas o tarifas. Los cambios impactarán en el Gantt y se sincronizarán con Google Sheets.</p>
            </div>

            <form onSubmit={onGuardarEdicion} className="roster-modal-body">
              {/* Empleado */}
              <div className="form-group-roster" style={{ marginBottom: '10px' }}>
                <label className="roster-label" style={{ fontSize: '12px' }}>Empleado (Ingeniería - I):</label>
                <input
                  type="text"
                  value={editEmpleado}
                  onChange={(e) => onEditEmpleadoChange(e.target.value)}
                  className="roster-input"
                  required
                  readOnly
                  style={{ background: 'var(--bg-secondary, #f8fafc)', opacity: 0.9 }}
                />
              </div>

              {/* Proyecto */}
              <div className="form-group-roster" style={{ marginBottom: '10px' }}>
                <label className="roster-label" style={{ fontSize: '12px' }}>Proyecto Asignado:</label>
                <select
                  value={editProyecto}
                  onChange={(e) => onEditProyectoChange(e.target.value)}
                  className="roster-select"
                  required
                >
                  {proyectosDisponibles.map((p, i) => (
                    <option key={i} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Rango de Fechas */}
              <div className="form-group-roster" style={{ marginBottom: '10px' }}>
                <label className="roster-label" style={{ fontSize: '12px' }}>Rango de Fechas:</label>
                <div className="roster-dates-row">
                  <div className="date-field-box">
                    <span className="date-sublabel">Desde:</span>
                    <input
                      type="date"
                      value={editFechaInicio}
                      onChange={(e) => onEditFechaInicioChange(e.target.value)}
                      className="roster-input date-input"
                      required
                    />
                  </div>
                  <div className="date-field-box">
                    <span className="date-sublabel">Hasta:</span>
                    <input
                      type="date"
                      value={editFechaFin}
                      onChange={(e) => onEditFechaFinChange(e.target.value)}
                      className="roster-input date-input"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Tipo */}
              <div className="form-group-roster" style={{ marginBottom: '10px' }}>
                <label className="roster-label" style={{ fontSize: '12px' }}>Tipo de Jornada:</label>
                <div className="roster-type-selector">
                  <button
                    type="button"
                    className={`btn-type-pill pill-campo ${editTipo === 'Campo' ? 'active' : ''}`}
                    onClick={() => onEditTipoChange('Campo')}
                  >
                    🚜 Campo / Obra
                  </button>
                  <button
                    type="button"
                    className={`btn-type-pill pill-franco ${editTipo === 'Franco' ? 'active' : ''}`}
                    onClick={() => onEditTipoChange('Franco')}
                  >
                    🏠 Franco / Descanso
                  </button>
                  <button
                    type="button"
                    className={`btn-type-pill pill-vacaciones ${editTipo === 'Vacaciones' ? 'active' : ''}`}
                    onClick={() => onEditTipoChange('Vacaciones')}
                  >
                    🏖️ Vacaciones
                  </button>
                  <button
                    type="button"
                    className={`btn-type-pill pill-licencia ${editTipo === 'Licencia' ? 'active' : ''}`}
                    onClick={() => onEditTipoChange('Licencia')}
                  >
                    🏥 Licencia
                  </button>
                </div>
              </div>

              {/* Sección de Tarifas y Botón de Asignación sin crear nuevo registro */}
              {editTipo === 'Campo' && (
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-secondary, #f8fafc)', border: '1px solid var(--border-input, #cbd5e1)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <label className="roster-label" style={{ fontSize: '12px', margin: 0, fontWeight: 700 }}>
                      Tarifas Oficiales del Proyecto:
                    </label>

                    {/* [NUEVO BOTÓN]: Asignar tarifas de roster del proyecto al turno actual */}
                    <button
                      type="button"
                      aria-label="Visualizar Tarifa"
                      data-testid="btn-asignar-tarifa-local"
                      onClick={onAsignarTarifasOficiales}
                      disabled={guardandoEdit || eliminandoEdit || !tarifaModalEdit}
                      className="btn-link-action"
                      style={{
                        background: tarifaModalEdit ? '#0284c7' : '#94a3b8',
                        color: '#ffffff',
                        padding: '5px 10px',
                        borderRadius: '5px',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: tarifaModalEdit ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Guarda las tarifas vigentes del proyecto en la base de datos local para este turno, permitiendo la correcta visualización y exportación del .xlsx sin afectar Google Sheets."
                    >
                      ⚡ Asignar tarifas oficiales al turno
                    </button>
                  </div>

                  {tarifaModalEdit ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', fontSize: '12px', marginBottom: '8px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Día Normal:</span>
                          <strong>${Number(tarifaModalEdit.dia_normal || 0).toLocaleString('es-AR')}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#92400e', display: 'block' }}>Domingo:</span>
                          <strong style={{ color: '#b45309' }}>${Number(tarifaModalEdit.domingo || 0).toLocaleString('es-AR')}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#065f46', display: 'block' }}>Subida:</span>
                          <strong style={{ color: '#047857' }}>${Number(tarifaModalEdit.subida || 0).toLocaleString('es-AR')}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#1e40af', display: 'block' }}>Bajada:</span>
                          <strong style={{ color: '#1d4ed8' }}>${Number(tarifaModalEdit.bajada || 0).toLocaleString('es-AR')}</strong>
                        </div>
                      </div>

                      <div style={{ fontSize: '11px', color: '#475569', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '6px 8px' }}>
                        Tarifas aplicadas a este turno: <strong>Normal: ${Number(editPrecioDia || 0).toLocaleString('es-AR')}</strong> | <strong>Dom: ${Number(editPrecioDomingo || 0).toLocaleString('es-AR')}</strong>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '8px 10px', background: '#f1f5f9', borderRadius: '6px', fontSize: '12px', color: '#64748b' }}>
                      Sin tarifas especiales en <code>1_2_tarifas_roster</code> para este proyecto.
                    </div>
                  )}
                </div>
              )}

              <div className="roster-modal-footer" style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-modal-delete"
                  disabled={guardandoEdit || eliminandoEdit}
                  onClick={onEliminarTurno}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {eliminandoEdit ? 'Eliminando...' : '🗑️ Eliminar Turno'}
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    disabled={guardandoEdit || eliminandoEdit}
                    onClick={onCerrarModalEdit}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-modal-confirm"
                    disabled={guardandoEdit || eliminandoEdit}
                    style={{ background: '#2563eb' }}
                  >
                    {guardandoEdit ? 'Guardando...' : 'Guardar Modificación'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
