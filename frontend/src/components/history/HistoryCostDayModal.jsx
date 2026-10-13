// [FN-06.07] Modal independiente y exclusivo para edición manual de costo_dia
import React from 'react';

export default function HistoryCostDayModal({
  modalCostoDia,
  setModalCostoDia,
  guardandoCostoDia,
  handleGuardarCostoDia,
  handleSeleccionarRegistroModalCostoDia,
  empActual,
  onClose
}) {
  if (!modalCostoDia) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-box modal-costo-dia" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>💰</span>
            <span>Editar Costo del Día</span>
          </span>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={guardandoCostoDia}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleGuardarCostoDia}>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'var(--bg-surface-subtle, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {modalCostoDia.empleado}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#cc3333' }}>
                  📅 {modalCostoDia.fecha}
                </span>
              </div>
              {modalCostoDia.registros.length > 1 && (
                <div style={{ marginTop: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Selecciona el registro específico a modificar:
                  </label>
                  <select
                    className="form-select form-select-sm"
                    style={{ width: '100%', fontSize: '12px' }}
                    value={modalCostoDia.registroSeleccionado?.id || modalCostoDia.registroSeleccionado?.id_asistencia}
                    onChange={(e) => {
                      const idSel = e.target.value;
                      const found = modalCostoDia.registros.find(r => (r.id || r.id_asistencia) === idSel);
                      if (found) handleSeleccionarRegistroModalCostoDia(found);
                    }}
                  >
                    {modalCostoDia.registros.map((r, i) => (
                      <option key={r.id || r.id_asistencia || i} value={r.id || r.id_asistencia}>
                        {r.servicio || 'Sin servicio'} ({r.tipo_ocf || r.lugar} - {r.horas} hs) • Actual: ${Number(r.costo_dia || 0).toLocaleString('es-AR')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {modalCostoDia.registroSeleccionado && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                  <div>Proyecto / Servicio: <strong>{modalCostoDia.registroSeleccionado.servicio || 'Tiempo de área'}</strong></div>
                  <div>Modalidad: <strong>{modalCostoDia.registroSeleccionado.tipo_ocf || modalCostoDia.registroSeleccionado.lugar}</strong> ({modalCostoDia.registroSeleccionado.horas || 0} hs)</div>
                  <div>Tipo de Costo: <strong>{modalCostoDia.registroSeleccionado.tipo_costo || 'No definido'}</strong></div>
                  <div>Costo actual: <strong style={{ color: '#059669' }}>${Number(modalCostoDia.costoDiaActual).toLocaleString('es-AR')}</strong></div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Nuevo Valor de Costo del Día ($ ARS):
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', fontWeight: 700, color: 'var(--text-secondary)' }}>$</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  className="form-input"
                  style={{ paddingLeft: '26px', fontSize: '15px', fontWeight: 700, height: '40px', width: '100%' }}
                  value={modalCostoDia.nuevoCostoDia}
                  onChange={(e) => setModalCostoDia(prev => ({ ...prev, nuevoCostoDia: e.target.value }))}
                  autoFocus
                />
              </div>

              {/* Sugerencias rápidas según nómina del colaborador */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                {empActual && Number(empActual.costo_dia_ofi) > 0 && (
                  <button
                    type="button"
                    className="btn-action-ghost"
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                    onClick={() => setModalCostoDia(prev => ({ ...prev, nuevoCostoDia: String(empActual.costo_dia_ofi) }))}
                  >
                    🏢 Oficina (${Number(empActual.costo_dia_ofi).toLocaleString('es-AR')})
                  </button>
                )}
                {empActual && Number(empActual.costo_dia_obra) > 0 && (
                  <button
                    type="button"
                    className="btn-action-ghost"
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                    onClick={() => setModalCostoDia(prev => ({ ...prev, nuevoCostoDia: String(empActual.costo_dia_obra) }))}
                  >
                    🏕️ Obra (${Number(empActual.costo_dia_obra).toLocaleString('es-AR')})
                  </button>
                )}
                <button
                  type="button"
                  className="btn-action-ghost"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setModalCostoDia(prev => ({ ...prev, nuevoCostoDia: '0' }))}
                >
                  $0 (Sin Costo)
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Motivo de la modificación (Auditoría):
              </label>
              <input
                type="text"
                className="form-input form-input-sm"
                placeholder="Ej: Ajuste de tarifa especial / corrección de liquidación"
                value={modalCostoDia.motivo}
                onChange={(e) => setModalCostoDia(prev => ({ ...prev, motivo: e.target.value }))}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary, #94a3b8)' }}>
                ℹ️ Esta modificación impactará en SQLite local, en Google Sheets (`1_asistencia_informada`) y quedará registrada en el historial de auditoría (`modificaciones_realizadas`).
              </span>
            </div>
          </div>

          <div className="modal-footer" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={onClose}
              disabled={guardandoCostoDia}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="modal-btn-save"
              style={{ background: '#cc3333', borderColor: '#cc3333', color: '#ffffff', minWidth: '130px' }}
              disabled={guardandoCostoDia}
            >
              {guardandoCostoDia ? 'Guardando...' : 'Guardar Costo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
