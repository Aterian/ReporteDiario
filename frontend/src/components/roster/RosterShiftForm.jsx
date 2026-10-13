// [MOD-05] RosterShiftForm - Formulario de carga continua de turnos de Roster
import React from 'react';
import RosterEmployeeChecklist from './RosterEmployeeChecklist';

export default function RosterShiftForm({
  proyecto,
  onProyectoChange,
  proyectosDisponibles = [],
  tarifaActual,
  empleadosDisponibles = [],
  empleadosSeleccionados = [],
  onToggleEmpleado,
  onSeleccionarTodos,
  onDeseleccionarTodos,
  fechaInicio,
  onFechaInicioChange,
  fechaFin,
  onFechaFinChange,
  tipo,
  onTipoChange,
  guardando,
  onSubmit,
  mensajeFeedback,
  onDismissFeedback
}) {
  return (
    <div className="roster-form-panel">
      <div className="roster-form-card">
        <div className="roster-form-header">
          <h3>Nuevo Registro de Roster</h3>
          <p>Asigna turnos, obra, descansos y tarifas para el cálculo automático.</p>
        </div>

        {/* Mensajes de feedback ágil */}
        {mensajeFeedback && (
          <div className={`roster-alert ${mensajeFeedback.tipo === 'exito' ? 'alert-success' : 'alert-error'}`}>
            <span>{mensajeFeedback.tipo === 'exito' ? '✓' : '⚠️'}</span>
            <p>{mensajeFeedback.texto}</p>
            <button type="button" onClick={onDismissFeedback}>✕</button>
          </div>
        )}

        <form onSubmit={onSubmit} className="roster-form-fields">
          {/* 1. SELECCIÓN DE PROYECTO (PRIMERO Y OBLIGATORIO) */}
          <div className="form-group-roster highlight-project">
            <label className="roster-label">
              <span className="roster-label-num">1</span>
              <span>Proyecto Asignado (Ingeniería - I) <strong className="required">*</strong></span>
            </label>
            <select
              value={proyecto}
              onChange={(e) => onProyectoChange(e.target.value)}
              className="roster-select"
              required
            >
              <option value="" disabled>Selecciona el proyecto (Ingeniería)...</option>
              {proyectosDisponibles.map((p, idx) => (
                <option key={idx} value={p}>{p}</option>
              ))}
            </select>
            <span className="form-hint">Proyectos exclusivos de Ingeniería. Los francos deben asignarse a este mismo proyecto para cerrar el ciclo.</span>

            {tarifaActual && (
              <div className="roster-tarifa-info-box" style={{ marginTop: '8px', padding: '10px 12px', background: 'var(--bg-secondary, #f8fafc)', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary, #cc3333)', letterSpacing: '0.5px' }}>
                    📊 TARIFAS ROSTER VINCULADAS
                  </span>
                  {tarifaActual.id_proyecto && (
                    <span style={{ fontSize: '10px', color: '#64748b' }}>
                      ID: {tarifaActual.id_proyecto}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
                  <span style={{ background: '#ffffff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    Día normal: <b>${tarifaActual.dia_normal}</b>
                  </span>
                  <span style={{ background: '#fef3c7', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fde68a', color: '#92400e' }}>
                    Domingo: <b>${tarifaActual.domingo}</b>
                  </span>
                  <span style={{ background: '#ecfdf5', padding: '3px 8px', borderRadius: '4px', border: '1px solid #a7f3d0', color: '#065f46' }}>
                    ⬆️ Subida: <b>${tarifaActual.subida}</b>
                  </span>
                  <span style={{ background: '#eff6ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe', color: '#1e40af' }}>
                    ⬇️ Bajada: <b>${tarifaActual.bajada}</b>
                  </span>
                  {Number(tarifaActual.adicionales) > 0 && (
                    <span style={{ background: '#fdf2f8', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fbcfe8', color: '#9d174d' }}>
                      Adicionales: <b>${tarifaActual.adicionales}</b> (x1)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. SELECCIÓN DE EMPLEADOS (CARGA MÚLTIPLE - INGENIERÍA) */}
          <RosterEmployeeChecklist
            empleadosDisponibles={empleadosDisponibles}
            empleadosSeleccionados={empleadosSeleccionados}
            onToggleEmpleado={onToggleEmpleado}
            onSeleccionarTodos={onSeleccionarTodos}
            onDeseleccionarTodos={onDeseleccionarTodos}
          />

          {/* 3. RANGO DE FECHAS */}
          <div className="form-group-roster">
            <label className="roster-label">
              <span className="roster-label-num">3</span>
              <span>Rango de Fechas del Turno <strong className="required">*</strong></span>
            </label>
            <div className="roster-dates-row">
              <div className="date-field-box">
                <span className="date-sublabel">Desde:</span>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => onFechaInicioChange(e.target.value)}
                  className="roster-input date-input"
                  required
                />
              </div>
              <div className="date-field-box">
                <span className="date-sublabel">Hasta:</span>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => onFechaFinChange(e.target.value)}
                  className="roster-input date-input"
                  required
                />
              </div>
            </div>
          </div>

          {/* 4. ESTADO DE ROSTER: CAMPO, FRANCO, VACACIONES O LICENCIA */}
          <div className="form-group-roster">
            <label className="roster-label">
              <span className="roster-label-num">4</span>
              <span>Tipo de Jornada</span>
            </label>
            <div className="roster-type-selector">
              <button
                type="button"
                className={`btn-type-pill pill-campo ${tipo === 'Campo' ? 'active' : ''}`}
                onClick={() => onTipoChange('Campo')}
              >
                <span className="pill-dot"></span>
                🚜 Activo en Campo / Obra
              </button>
              <button
                type="button"
                className={`btn-type-pill pill-franco ${tipo === 'Franco' ? 'active' : ''}`}
                onClick={() => onTipoChange('Franco')}
              >
                <span className="pill-dot"></span>
                🏠 Días de Franco
              </button>
              <button
                type="button"
                className={`btn-type-pill pill-vacaciones ${tipo === 'Vacaciones' ? 'active' : ''}`}
                onClick={() => onTipoChange('Vacaciones')}
              >
                <span className="pill-dot"></span>
                🏖️ Vacaciones
              </button>
              <button
                type="button"
                className={`btn-type-pill pill-licencia ${tipo === 'Licencia' ? 'active' : ''}`}
                onClick={() => onTipoChange('Licencia')}
              >
                <span className="pill-dot"></span>
                🏥 Licencia
              </button>
            </div>
          </div>

          {/* 5. TARIFAS ASIGNADAS AL PROYECTO (MODO SOLO LECTURA) */}
          {tipo === 'Campo' ? (
            <div className="form-group-roster tariffs-container">
              <label className="roster-label">
                <span className="roster-label-num">5</span>
                <span>Tarifas Oficiales Asignadas al Proyecto (Solo Lectura)</span>
              </label>
              {tarifaActual ? (
                <div className="tariffs-readonly-card">
                  <div className="tariffs-readonly-header">
                    <div className="tariffs-readonly-title">
                      <span style={{ fontSize: '14px' }}>🔒</span>
                      <strong>Tarifas Reglamentarias ({tarifaActual.proyecto})</strong>
                    </div>
                    {tarifaActual.id_proyecto && (
                      <span className="tariffs-readonly-id">ID: {tarifaActual.id_proyecto}</span>
                    )}
                  </div>
                  <p className="tariffs-readonly-desc">
                    Valores asignados automáticamente desde la hoja oficial <code>1_2_tarifas_roster</code> para este proyecto.
                  </p>
                  <div className="tariffs-readonly-grid">
                    <div className="tariff-readonly-item">
                      <span className="item-label">Día Normal en Obra</span>
                      <span className="item-value">${Number(tarifaActual.dia_normal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="tariff-readonly-item highlight-domingo">
                      <span className="item-label">Día Domingo (DOM)</span>
                      <span className="item-value">${Number(tarifaActual.domingo || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="tariff-readonly-item highlight-subida">
                      <span className="item-label">⬆️ Subida (Inicio Campo)</span>
                      <span className="item-value">${Number(tarifaActual.subida || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="tariff-readonly-item highlight-bajada">
                      <span className="item-label">⬇️ Bajada (Inicio Franco)</span>
                      <span className="item-value">${Number(tarifaActual.bajada || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {Number(tarifaActual.adicionales) > 0 && (
                      <div className="tariff-readonly-item highlight-adicionales">
                        <span className="item-label">Adicionales (x1 por bloque)</span>
                        <span className="item-value">${Number(tarifaActual.adicionales || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="tariffs-readonly-empty">
                  <span style={{ fontSize: '18px' }}>ℹ️</span>
                  <span>
                    {proyecto
                      ? 'El proyecto seleccionado no registra tarifas especiales en 1_2_tarifas_roster (se liquidará con tarifa base $0.00).'
                      : 'Selecciona un proyecto asignado arriba para cargar automáticamente sus tarifas reglamentarias.'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="franco-info-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Los días de franco se registran como descanso del proyecto y no computan tarifas de liquidación de obra.</span>
            </div>
          )}

          {/* BOTÓN PRINCIPAL DE GUARDADO CONTINUO */}
          <div className="roster-form-actions">
            <button
              type="submit"
              disabled={guardando}
              className="btn-roster-submit"
            >
              {guardando ? (
                'Guardando...'
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Guardar Registro de Roster
                </>
              )}
            </button>
            <span className="save-hint">Al guardar, permanecerás aquí para continuar cargando todos los turnos que necesites.</span>
          </div>
        </form>
      </div>
    </div>
  );
}
