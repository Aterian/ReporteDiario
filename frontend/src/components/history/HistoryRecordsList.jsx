// [FN-02.03] Listado y filtrado de registros de asistencia para otros empleados
import React from 'react';
import { getTituloRpg } from '../../utils/rpgTitles';
import { obtenerEtiquetaModalidad } from '../../utils/francoUtils';
import { getBadgeClassLugar, getIniciales } from './historyConstants';

export default function HistoryRecordsList({
  isRpg,
  registrosFiltrados,
  filtroTexto,
  setFiltroTexto,
  filtroEmpleadoLista,
  setFiltroEmpleadoLista,
  setEmpleadoAuditar,
  empleados,
  filtroSoloMes,
  setFiltroSoloMes,
  nombresMeses,
  fechaCalendario,
  puedeEditarCosto,
  seleccionados,
  handleToggleSelectAll,
  handleToggleSelect,
  handleAplicarTipoCostoLote,
  aplicandoCosto,
  setSeleccionados,
  cargando,
  registrosTotalCount,
  onEnfocarDiaCalendario,
  puedeVerModif,
  abrirComparativa,
  marcandoRevisadoId,
  handleMarcarRevisado,
  handleAbrirModalCostoDia,
  esSoloLecturaNucleo,
  puedeModificarRegistro,
  usuario,
  setRegistroEditando,
  setRegistroEliminando
}) {
  return (
    <div className="other-left-panel">
      <div className="other-panel-header">
        <div className="other-panel-title-row">
          <span className="other-panel-title">
            {isRpg ? '📜 Registro de Expediciones' : 'Listado de registros'}
          </span>
          <span className="other-count-badge">{registrosFiltrados.length}</span>
        </div>

        <div className="other-left-filters" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="search-input-wrapper">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={isRpg ? 'Buscar en los anales por misión, lugar o fecha...' : 'Buscar por proyecto, lugar o fecha...'}
              className="form-input form-input-sm search-field"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
            {filtroTexto && (
              <button type="button" className="clear-search-btn" onClick={() => setFiltroTexto('')}>✕</button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {isRpg ? 'Aventurero:' : 'Empleado:'}
            </span>
            <select
              className="form-select form-select-sm"
              style={{ width: '100%', height: '30px', fontSize: '12px' }}
              value={filtroEmpleadoLista}
              onChange={(e) => {
                const nuevo = e.target.value;
                setFiltroEmpleadoLista(nuevo);
                if (nuevo) setEmpleadoAuditar(nuevo);
              }}
              title="Filtrar listado por empleado"
            >
              <option value="">{isRpg ? 'Todos los aventureros' : 'Todos los empleados'}</option>
              {empleados.map(u => (
                <option key={u.dni || u.nombre} value={u.nombre}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro rápido por mes del calendario */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={filtroSoloMes}
                onChange={(e) => setFiltroSoloMes(e.target.checked)}
                style={{ accentColor: '#cc3333', cursor: 'pointer' }}
              />
              <span>Solo mes visible ({nombresMeses[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()})</span>
            </label>
          </div>
        </div>

        {/* Asignación Masiva de Costos Toolbar (Exclusivo RRHH y Aplicaciones) */}
        {puedeEditarCosto && (
          <div className="bulk-selection-toolbar" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-action-ghost"
                style={{ fontSize: '11px', padding: '3px 8px' }}
                onClick={handleToggleSelectAll}
              >
                {registrosFiltrados.length > 0 && registrosFiltrados.every(r => seleccionados.has(r.id))
                  ? '☑ Deseleccionar visibles'
                  : '☐ Seleccionar visibles'}
              </button>
              {seleccionados.size > 0 && (
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#cc3333' }}>
                  {seleccionados.size} seleccionado(s)
                </span>
              )}
            </div>

            {seleccionados.size > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-surface-elevated, #f8fafc)',
                border: '1px solid #cc333340',
                padding: '6px 10px',
                borderRadius: '6px',
                flexWrap: 'wrap'
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Asignar Costo:
                </span>
                <button
                  type="button"
                  className="btn-action-ghost"
                  style={{ fontSize: '11px', padding: '3px 8px', background: '#3b82f615', color: '#2563eb', borderColor: '#3b82f640' }}
                  onClick={() => handleAplicarTipoCostoLote('Oficina')}
                  disabled={aplicandoCosto}
                >
                  Oficina
                </button>
                <button
                  type="button"
                  className="btn-action-ghost"
                  style={{ fontSize: '11px', padding: '3px 8px', background: '#10b98115', color: '#059669', borderColor: '#10b98140' }}
                  onClick={() => handleAplicarTipoCostoLote('Campo')}
                  disabled={aplicandoCosto}
                >
                  Campo
                </button>
                <button
                  type="button"
                  className="btn-action-ghost"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => handleAplicarTipoCostoLote('')}
                  disabled={aplicandoCosto}
                >
                  Sin Asignar
                </button>
                <button
                  type="button"
                  className="btn-action-ghost"
                  style={{ fontSize: '11px', padding: '3px 6px', marginLeft: 'auto' }}
                  onClick={() => setSeleccionados(new Set())}
                  title="Limpiar selección"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="other-cards-scroll">
        {cargando && registrosTotalCount === 0 ? (
          <div className="empty-state">
            <div className="spinner" style={{ width: '28px', height: '28px' }} />
            <span className="empty-text">Cargando registros cargados para otros empleados...</span>
          </div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="empty-text">
              {registrosTotalCount === 0
                ? 'No hay registros cargados en la base de datos.'
                : 'No se encontraron registros con los filtros aplicados.'}
            </span>
          </div>
        ) : (
          <div className="other-cards-col">
            {registrosFiltrados.map((item) => {
              const lugarDisplay = obtenerEtiquetaModalidad(item);
              const badgeClass = getBadgeClassLugar(lugarDisplay, item.servicio);
              const horasDisplay = item.horas > 0 ? `${item.horas} hs` : (item.jornada || '0 hs');
              const estaSincronizado = item.sincronizado === 1;
              const isChecked = seleccionados.has(item.id);

              return (
                <div key={item.id} className={`other-record-card ${isChecked ? 'card-selected' : ''}`}>
                  <div className="other-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {puedeEditarCosto && (
                        <input
                          type="checkbox"
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer',
                            accentColor: '#cc3333'
                          }}
                          checked={isChecked}
                          onChange={() => handleToggleSelect(item.id)}
                          title="Seleccionar para asignar costo"
                        />
                      )}
                      <div className="other-card-user">
                        <div className="other-user-avatar">
                          {getIniciales(item.empleado)}
                        </div>
                        <div className="other-user-meta">
                          <span className="other-user-name">{item.empleado || 'Sin empleado'}</span>
                          {isRpg && (
                            <span className="rpg-card-role-chip" style={{ fontSize: '10px', color: '#f59e0b', display: 'block', fontWeight: 600 }}>
                              {getTituloRpg(item.empleado)}
                            </span>
                          )}
                          {item.cargado_por && (
                            <span className="other-user-sub">
                              Cargado por: <strong>{item.cargado_por}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="other-card-badges">
                      {Boolean(item.fue_modificado || item.modificado) && (
                        item.modificacion_revisada === 1 && item.modificacion_pendiente !== 1 ? (
                          <span className="status-badge badge-modificado-revisado" title={item.detalle_modificacion || 'Modificación revisada por RRHH'}>
                            ✓ Revisado
                          </span>
                        ) : (
                          <span className="status-badge badge-modificado" title={item.detalle_modificacion || 'Modificado - Pendiente de revisión'}>
                            ✏️ Modificado
                          </span>
                        )
                      )}
                      {puedeEditarCosto && item.tipo_costo && (
                        <span className={`status-badge ${item.tipo_costo.toLowerCase() === 'campo' ? 'badge-costo-campo' : 'badge-costo-oficina'}`}>
                          Costo: {item.tipo_costo}
                        </span>
                      )}
                      {item.costo_dia !== undefined && item.costo_dia !== null && (
                        <span
                          className="status-badge badge-costo-monto"
                          title={puedeEditarCosto ? `Costo día: $${Number(item.costo_dia).toLocaleString('es-AR')} (Click para editar)` : `Costo día: $${Number(item.costo_dia).toLocaleString('es-AR')}`}
                          style={{ cursor: puedeEditarCosto ? 'pointer' : 'default', background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}
                          onClick={() => {
                            if (puedeEditarCosto) handleAbrirModalCostoDia({ fechaIso: item.fecha, registros: [item] }, item);
                          }}
                        >
                          💰 ${Number(item.costo_dia).toLocaleString('es-AR')}{puedeEditarCosto ? ' ✏️' : ''}
                        </span>
                      )}
                      <span className={`status-badge ${estaSincronizado ? 'status-synced' : 'status-pending'}`}>
                        {estaSincronizado ? 'Sincronizado' : 'Pendiente'}
                      </span>
                    </div>
                  </div>

                  <div className="other-card-content">
                    <div className="other-meta-row">
                      <span className="other-meta-date">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {item.fecha} {item.dia_semana ? `(${item.dia_semana})` : ''}
                      </span>
                      {item.feriado === 'SI' && (
                        <span className="chip-feriado">Feriado</span>
                      )}
                      <span className={`modalidad-pill ${badgeClass}`}>
                        {item.servicio === 'Franco Trabajado' ? 'Franco Trabajado' : lugarDisplay}
                      </span>
                    </div>

                    <div className="other-project-row">
                      <span className="other-project-label">Proyecto / Detalle:</span>
                      <span className="other-project-name" title={item.servicio}>
                        {item.servicio || 'Tiempo dedicado al área'}
                      </span>
                    </div>

                    <div className="other-hours-row">
                      <span className="other-hours-label">Jornada:</span>
                      <span className="other-hours-value">{horasDisplay}</span>
                    </div>
                  </div>

                  <div className="other-card-actions">
                    <button
                      type="button"
                      className="btn-card-action"
                      style={{ color: '#2563eb', borderColor: '#3b82f640' }}
                      onClick={() => onEnfocarDiaCalendario(item)}
                      title="Ver y enfocar este día en el calendario"
                    >
                      📅 Calendario
                    </button>

                    {puedeVerModif && Boolean(item.fue_modificado || item.modificado || (item.modificaciones && item.modificaciones.length > 0)) && (
                      <button
                        type="button"
                        className="btn-card-action btn-comparativa-action"
                        style={{ color: '#7c3aed', borderColor: '#8b5cf650', background: '#8b5cf615', fontWeight: 600 }}
                        onClick={() => abrirComparativa(item)}
                        title="Auditar modificación: ver comparativa dividida antes y después"
                      >
                        ⚖️ Comparativa
                      </button>
                    )}

                    {puedeVerModif && (item.modificacion_pendiente === 1 || (Boolean(item.fue_modificado || item.modificado) && item.modificacion_revisada !== 1)) && (
                      <button
                        type="button"
                        className="btn-card-action"
                        style={{ color: '#059669', borderColor: '#10b98150', background: '#10b98115', fontWeight: 600 }}
                        disabled={marcandoRevisadoId === (item.id_asistencia || item.id)}
                        onClick={() => handleMarcarRevisado(item)}
                        title="Marcar modificación como revisada por RRHH para quitar la alerta"
                      >
                        ✓ Revisado
                      </button>
                    )}

                    {puedeEditarCosto && (
                      <button
                        type="button"
                        className="btn-card-action"
                        style={{ color: '#059669', borderColor: '#10b98150', background: '#10b98115', fontWeight: 600 }}
                        onClick={() => handleAbrirModalCostoDia({ fechaIso: item.fecha, registros: [item] }, item)}
                        title="Editar manualmente costo_dia de este registro"
                      >
                        💰 Costo ($)
                      </button>
                    )}

                    {!esSoloLecturaNucleo && puedeModificarRegistro(usuario, item) ? (
                      <>
                        <button
                          type="button"
                          className="btn-card-action btn-card-edit"
                          onClick={() => setRegistroEditando({ ...item })}
                          title="Modificar reporte"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Modificar
                        </button>

                        <button
                          type="button"
                          className="btn-card-action btn-card-delete"
                          onClick={() => setRegistroEliminando(item)}
                          title="Eliminar este reporte localmente y de Google Sheets"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          Eliminar
                        </button>
                      </>
                    ) : (
                      <span className="badge-solo-lectura" title="Solo lectura">
                        🔒 Solo lectura
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
