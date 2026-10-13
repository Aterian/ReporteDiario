// [FN-02.03] Calendario interactivo de auditoría mensual de asistencia
import React from 'react';
import { getTituloRpg } from '../../utils/rpgTitles';
import { NOMBRES_MESES, getBadgeClassLugar, categorizarRegistroLiquidacion } from './historyConstants';

export default function HistoryAuditCalendar({
  isRpg,
  empleadoAuditar,
  setEmpleadoAuditar,
  setFiltroEmpleadoLista,
  empleados,
  fechaCalendario,
  navegarMes,
  irAHoy,
  puedeEditarCosto,
  diasSeleccionadosCalendario,
  setDiasSeleccionadosCalendario,
  handleAplicarTipoCostoDiasCalendario,
  aplicandoCosto,
  diasMesCalendario,
  diaDestacado,
  setDiaSeleccionadoAuditoria,
  handleAbrirModalCostoDia
}) {
  return (
    <div className="audit-panel-section">
      {/* Header de Auditoría: Selector de empleado y mes */}
      <div className="audit-panel-header">
        <div className="audit-employee-select-box">
          <label className="audit-select-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{isRpg ? 'Aventurero a auditar:' : 'Auditar empleado:'}</span>
          </label>
          <select
            className="form-select form-select-clean audit-select-field"
            value={empleadoAuditar}
            onChange={(e) => {
              const nuevo = e.target.value;
              setEmpleadoAuditar(nuevo);
              setFiltroEmpleadoLista(nuevo);
            }}
          >
            {empleados.map(u => (
              <option key={u.dni || u.nombre} value={u.nombre}>
                {u.nombre} ({u.area || 'Sin área'})
              </option>
            ))}
          </select>
          {isRpg && empleadoAuditar && (
            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, display: 'block', marginTop: '2px' }}>
              {getTituloRpg(empleadoAuditar)}
            </span>
          )}
        </div>

        <div className="calendar-month-controls">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => navegarMes(-1)}
            title="Mes anterior"
          >
            ◀
          </button>
          <span className="calendar-month-title">
            {NOMBRES_MESES[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()}
          </span>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => navegarMes(1)}
            title="Mes siguiente"
          >
            ▶
          </button>
          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : 'calendar-today-btn'}
            onClick={irAHoy}
          >
            Hoy
          </button>
        </div>
      </div>

      {/* Grilla del Calendario Mensual Interactivo */}
      <div className="audit-calendar-wrapper" style={{ position: 'relative' }}>
        {/* Barra flotante para asignación masiva de costo a días seleccionados (Solo RRHH y Aplicaciones) */}
        {puedeEditarCosto && diasSeleccionadosCalendario.size > 0 && (
          <div className="calendar-floating-cost-toolbar">
            <div className="floating-cost-left">
              <span className="floating-cost-badge">{diasSeleccionadosCalendario.size}</span>
              <span className="floating-cost-text">día(s) seleccionado(s)</span>
            </div>
            <div className="floating-cost-actions">
              <button
                type="button"
                className="btn-floating-cost btn-cost-oficina"
                onClick={() => handleAplicarTipoCostoDiasCalendario('Oficina')}
                disabled={aplicandoCosto}
                title="Asignar Costo Oficina a los días seleccionados"
              >
                🏢 Costo Oficina
              </button>
              <button
                type="button"
                className="btn-floating-cost btn-cost-campo"
                onClick={() => handleAplicarTipoCostoDiasCalendario('Campo')}
                disabled={aplicandoCosto}
                title="Asignar Costo Campo a los días seleccionados"
              >
                🏕️ Costo Campo
              </button>
              <button
                type="button"
                className="btn-floating-cost btn-cost-neutral"
                onClick={() => handleAplicarTipoCostoDiasCalendario('')}
                disabled={aplicandoCosto}
                title="Quitar tipo de costo"
              >
                Sin Asignar
              </button>
              <button
                type="button"
                className="btn-floating-cost btn-cost-close"
                onClick={() => setDiasSeleccionadosCalendario(new Set())}
                title="Desmarcar todos los días"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="calendar-weekdays-row">
          <span>Lun</span>
          <span>Mar</span>
          <span>Mié</span>
          <span>Jue</span>
          <span>Vie</span>
          <span>Sáb</span>
          <span>Dom</span>
        </div>

        <div className="calendar-grid audit-calendar-grid">
          {diasMesCalendario.map((celda) => {
            if (celda.esVacio) {
              return <div key={celda.id} className="calendar-cell cell-empty" />;
            }

            const tieneRegistros = celda.registros.length > 0;
            const estaSeleccionado = diasSeleccionadosCalendario.has(celda.fechaIso);
            const tieneModificadosPendientes = celda.registros.some(r => r.modificacion_pendiente === 1 || (r.fue_modificado === 1 && r.modificacion_revisada !== 1));
            const tieneModificadosRevisados = !tieneModificadosPendientes && celda.registros.some(r => r.modificacion_revisada === 1);
            const esDestacada = diaDestacado === celda.fechaIso;

            // Agrupar por categoría para no duplicar costo en jornadas multiproyecto del mismo día
            const mapaCostosCelda = new Map();
            celda.registros.forEach(r => {
              const cat = categorizarRegistroLiquidacion(r);
              const c = Number(r.costo_dia) || 0;
              if (!mapaCostosCelda.has(cat) || c > mapaCostosCelda.get(cat)) {
                mapaCostosCelda.set(cat, c);
              }
            });
            const costoDiaTotal = Array.from(mapaCostosCelda.values()).reduce((acc, v) => acc + v, 0);

            return (
              <div
                key={celda.id}
                className={`calendar-cell ${celda.esHoy ? 'cell-today' : ''} ${tieneRegistros ? 'cell-has-data' : ''} ${estaSeleccionado ? 'cell-selected-day' : ''} ${tieneModificadosPendientes ? 'cell-has-modified' : ''} ${tieneModificadosRevisados ? 'cell-has-modified-reviewed' : ''} ${esDestacada ? 'cell-destacada-modificacion' : ''}`}
                onClick={() => {
                  if (!tieneRegistros) return;
                  setDiaSeleccionadoAuditoria(celda);
                }}
                style={{ cursor: tieneRegistros ? 'pointer' : 'default' }}
                title={tieneRegistros ? `${celda.registros.length} registro(s) el ${celda.fechaIso} • Costo total: $${costoDiaTotal.toLocaleString('es-AR')}${tieneModificadosPendientes ? ' • Modificación pendiente de revisión' : (tieneModificadosRevisados ? ' • Modificación revisada por RRHH' : '')} (Toca para ver detalles)` : celda.fechaIso}
              >
                <div className="cell-top-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="cell-day-number">{celda.diaNumero}</span>
                    {tieneModificadosPendientes && (
                      <span className="cell-mod-badge" title="Este día contiene registros con modificaciones pendientes de revisión">
                        ✏️
                      </span>
                    )}
                    {tieneModificadosRevisados && (
                      <span className="cell-mod-badge-reviewed" title="Modificación revisada por RRHH">
                        ✓
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {celda.esHoy && <span className="cell-today-dot" title="Hoy" />}
                    {puedeEditarCosto && tieneRegistros && (
                      <input
                        type="checkbox"
                        className="calendar-day-checkbox"
                        checked={estaSeleccionado}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          setDiasSeleccionadosCalendario(prev => {
                            const next = new Set(prev);
                            if (next.has(celda.fechaIso)) {
                              next.delete(celda.fechaIso);
                            } else {
                              next.add(celda.fechaIso);
                            }
                            return next;
                          });
                        }}
                        title={`Seleccionar día ${celda.fechaIso}`}
                      />
                    )}
                  </div>
                </div>

                {tieneRegistros && (
                  <div
                    className="cell-costo-badge-row"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (puedeEditarCosto) {
                        handleAbrirModalCostoDia(celda);
                      } else {
                        setDiaSeleccionadoAuditoria(celda);
                      }
                    }}
                    title={puedeEditarCosto ? `Costo día: $${costoDiaTotal.toLocaleString('es-AR')} (Click para editar costo)` : `Costo día: $${costoDiaTotal.toLocaleString('es-AR')}`}
                  >
                    <span className={`cell-costo-dia-badge ${costoDiaTotal > 0 ? 'costo-positivo' : 'costo-cero'}`}>
                      💰 ${costoDiaTotal.toLocaleString('es-AR')}
                      {puedeEditarCosto && <span className="cell-costo-edit-icon" style={{ marginLeft: '2px', fontSize: '9px' }}>✏️</span>}
                    </span>
                  </div>
                )}

                <div className="cell-events-container">
                  {celda.registros.slice(0, 3).map((r, idx) => {
                    const lug = r.tipo_ocf || r.lugar || 'Oficina';
                    const badgeClass = getBadgeClassLugar(lug, r.servicio);
                    const fueModPendiente = r.modificacion_pendiente === 1 || (r.fue_modificado === 1 && r.modificacion_revisada !== 1);
                    const fueModRevisado = !fueModPendiente && r.modificacion_revisada === 1;
                    let labelText = lug;
                    if (lug === 'Franco Obra' || r.servicio?.toLowerCase().includes('franco de obra')) {
                      labelText = 'F. Obra';
                    } else if (lug === 'Franco Obra Trabajado') {
                      labelText = 'F. Obra Trab.';
                    } else if (lug === 'Franco Ofic Trabajado' || r.servicio === 'Franco Trabajado') {
                      labelText = 'F. Ofic. Trab.';
                    } else if (lug === 'Feriado Trabajado') {
                      labelText = 'Feriado Trab.';
                    } else if (lug === 'Campaña / Campo' || lug === 'Campo') {
                      labelText = 'Campo';
                    }
                    return (
                      <div
                        key={r.id || idx}
                        className={`cell-event-pill ${badgeClass} ${fueModPendiente ? 'cell-event-modified' : ''} ${fueModRevisado ? 'cell-event-modified-reviewed' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDiaSeleccionadoAuditoria(celda);
                        }}
                        title={`${lug} - ${r.servicio} (${r.horas} hs)${fueModPendiente ? ' • ✏️ MODIFICADO (Pendiente revisión)' : (fueModRevisado ? ' • ✓ Modificación revisada' : '')}${r.detalle_modificacion ? ' • ' + r.detalle_modificacion : ''} • Toca para ver detalle`}
                      >
                        {fueModPendiente && <span className="pill-mod-icon" title="Modificado (Pendiente)">✏️</span>}
                        {fueModRevisado && <span className="pill-mod-reviewed-icon" title="Modificado (Revisado)">✓</span>}
                        <span className="cell-event-label">{labelText}</span>
                        {fueModPendiente && <span className="pill-mod-tag">MOD</span>}
                        {fueModRevisado && <span className="pill-mod-reviewed-tag">REV</span>}
                      </div>
                    );
                  })}
                  {celda.registros.length > 3 && (
                    <span className="cell-more-badge">+{celda.registros.length - 3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Referencias cromáticas */}
        <div className="calendar-legend-bar">
          <span className="legend-title">Referencias:</span>
          <div className="legend-items">
            <span className="legend-item"><span className="legend-color-box badge-modalidad-oficina" /> Oficina</span>
            <span className="legend-item"><span className="legend-color-box badge-modalidad-campo" /> Obra / Campo</span>
            <span className="legend-item"><span className="legend-color-box badge-modalidad-franco-obra" /> Franco Obra</span>
            <span className="legend-item"><span className="legend-color-box badge-modalidad-franco" /> Franco Normal</span>
            <span className="legend-item"><span className="legend-color-box badge-modalidad-franco-ofic-trabajado" /> Franco Ofic. Trab.</span>
            <span className="legend-item"><span className="legend-color-box badge-modalidad-franco-obra-trabajado" /> Franco Obra Trab.</span>
            <span className="legend-item"><span className="legend-color-box badge-modalidad-feriado-trabajado" /> Feriado Trab.</span>
            <span className="legend-item"><span className="legend-color-box badge-modalidad-vacaciones" /> Vacaciones</span>
            <span className="legend-item"><span className="legend-item"><span className="legend-color-box badge-modalidad-licencia" /> Licencia</span></span>
            <span className="legend-item"><span className="legend-mod-indicator">✏️ MOD</span> Modif. Pendiente</span>
            <span className="legend-item"><span className="legend-mod-reviewed-indicator">✓ REV</span> Modif. Revisada</span>
          </div>
        </div>
      </div>
    </div>
  );
}
