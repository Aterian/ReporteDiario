// [FN-02.04] Panel flotante dividido comparativo de modificaciones para auditoría
import React from 'react';
import { getBadgeClassLugar } from './historyConstants';

export default function HistoryDiffModal({
  comparativaModificacion,
  onClose,
  handleCambiarModificacionActiva,
  marcandoRevisadoId,
  handleMarcarRevisadoDesdeComparativa,
  puedeModificarRegistro,
  usuario,
  onEditarRegistro
}) {
  if (!comparativaModificacion) return null;

  const reg = comparativaModificacion.registro || {};
  const mod = comparativaModificacion.modActiva || {};
  const tieneMod = Boolean(mod.id_modificacion || mod.quien_modifica);

  const tipoAntes = tieneMod ? (mod.tipo_antes || 'Sin tipo') : 'Original';
  const tipoDespues = tieneMod ? (mod.tipo_despues || 'Sin tipo') : (reg.tipo_ocf || reg.lugar || 'Oficina');

  const horasAntes = tieneMod ? Number(mod.horas_antes || 0) : 0;
  const horasDespues = tieneMod ? Number(mod.horas_despues || 0) : Number(reg.horas || 0);

  const servAntes = tieneMod ? (mod.servicio_antes || 'Tiempo dedicado al Área') : 'Tiempo previo';
  const servDespues = tieneMod ? (mod.servicio_despues || 'Tiempo dedicado al Área') : (reg.servicio || '');

  const badgeAntes = getBadgeClassLugar(tipoAntes, servAntes);
  const badgeDespues = getBadgeClassLugar(tipoDespues, servDespues);

  const diffHoras = Number((horasDespues - horasAntes).toFixed(2));
  const cambioTipo = tipoAntes !== tipoDespues;
  const cambioHoras = horasAntes !== horasDespues;
  const cambioServ = servAntes !== servDespues;

  return (
    <div className="modal-backdrop">
      <div className="modal-box modal-comparativa-box">
        {/* Cabecera */}
        <div className="modal-header">
          <div className="comparativa-header-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚖️ Auditoría de Modificación
              </span>
              <span className="comparativa-colab-badge">
                {reg.empleado || 'Colaborador'}
              </span>
              {mod.revisado === 1 || reg.modificacion_revisada === 1 ? (
                <span className="status-badge badge-modificado-revisado">
                  ✓ Revisado por RRHH
                </span>
              ) : (
                <span className="status-badge badge-modificado">
                  ✏️ Pendiente de Revisión
                </span>
              )}
            </div>
            <div className="comparativa-header-meta">
              <span>
                📅 Reporte: <strong>{reg.fecha}</strong> {reg.dia_semana ? `(${reg.dia_semana})` : ''}
              </span>
              {mod.quien_modifica && (
                <span>
                  👤 Modificado por: <strong>{mod.quien_modifica}</strong>
                </span>
              )}
              {mod.fecha_hora_modificaciones && (
                <span>
                  🕒 Fecha cambio: <strong>{mod.fecha_hora_modificaciones}</strong>
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            title="Cerrar panel comparativo"
          >
            ✕
          </button>
        </div>

        {/* Selector de iteraciones de modificación si hay más de 1 */}
        {comparativaModificacion.modificaciones && comparativaModificacion.modificaciones.length > 1 && (
          <div className="comparativa-timeline-bar">
            <span className="timeline-title">Versiones registradas:</span>
            <div className="timeline-chips">
              {comparativaModificacion.modificaciones.map((m, idx) => {
                const esActiva = (comparativaModificacion.indiceActivo === idx) ||
                  (comparativaModificacion.modActiva?.id_modificacion === m.id_modificacion);
                return (
                  <button
                    key={m.id_modificacion || idx}
                    type="button"
                    className={`timeline-chip ${esActiva ? 'chip-active' : ''}`}
                    onClick={() => handleCambiarModificacionActiva(idx)}
                  >
                    Cambio #{idx + 1} ({m.fecha_hora_modificaciones?.split(' ')[1] || m.fecha_hora_modificaciones || 'Rev'})
                    {idx === comparativaModificacion.modificaciones.length - 1 && ' (Último)'}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Contenedor Dividido (Split View) */}
        <div className="comparativa-body">
          <div className="comparativa-split-grid">
            {/* LADO IZQUIERDO: ANTERIOR A LA MODIFICACIÓN */}
            <div className="comparativa-panel panel-antes">
              <div className="panel-side-badge badge-antes-tag">
                <span>⬅️ ANTERIOR A LA MODIFICACIÓN</span>
              </div>
              <div className="comparativa-field-group">
                <label className="comparativa-field-label">Modalidad / Ubicación</label>
                <div className="comparativa-field-content">
                  <span className={`modalidad-pill ${badgeAntes}`} style={{ fontSize: '13px', padding: '4px 10px' }}>
                    {tipoAntes}
                  </span>
                </div>
              </div>

              <div className="comparativa-field-group">
                <label className="comparativa-field-label">Horas Computadas</label>
                <div className="comparativa-hours-card hours-card-before">
                  <span className="hours-number">{horasAntes}</span>
                  <span className="hours-unit">hs</span>
                </div>
              </div>

              <div className="comparativa-field-group">
                <label className="comparativa-field-label">Proyecto / Servicio</label>
                <div className="comparativa-service-box">
                  {servAntes}
                </div>
              </div>
            </div>

            {/* CENTRO: INDICADOR DE CAMBIO */}
            <div className="comparativa-center-divider">
              <div className="divider-arrow-circle" title="Transformación del registro">
                ➔
              </div>
              <div className="divider-metrics">
                {cambioHoras && (
                  <span className={`diff-delta-badge ${diffHoras > 0 ? 'delta-positive' : 'delta-negative'}`}>
                    {diffHoras > 0 ? `+${diffHoras} hs` : `${diffHoras} hs`}
                  </span>
                )}
                {!cambioHoras && (
                  <span className="diff-delta-badge delta-neutral">
                    = 0 hs
                  </span>
                )}
              </div>
            </div>

            {/* LADO DERECHO: POSTERIOR A LA MODIFICACIÓN */}
            <div className="comparativa-panel panel-despues">
              <div className="panel-side-badge badge-despues-tag">
                <span>POSTERIOR A LA MODIFICACIÓN ➡️</span>
              </div>

              <div className="comparativa-field-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="comparativa-field-label">Modalidad / Ubicación</label>
                  {cambioTipo && (
                    <span className="chip-cambio-alerta" title="La modalidad fue alterada">
                      Cambió
                    </span>
                  )}
                </div>
                <div className="comparativa-field-content">
                  <span className={`modalidad-pill ${badgeDespues} ${cambioTipo ? 'pill-highlight-changed' : ''}`} style={{ fontSize: '13px', padding: '4px 10px' }}>
                    {tipoDespues}
                  </span>
                </div>
              </div>

              <div className="comparativa-field-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="comparativa-field-label">Horas Computadas</label>
                  {cambioHoras && (
                    <span className="chip-cambio-alerta" title="La cantidad de horas fue alterada">
                      {diffHoras > 0 ? `+${diffHoras} hs` : `${diffHoras} hs`}
                    </span>
                  )}
                </div>
                <div className={`comparativa-hours-card hours-card-after ${cambioHoras ? 'hours-card-changed' : ''}`}>
                  <span className="hours-number">{horasDespues}</span>
                  <span className="hours-unit">hs</span>
                </div>
              </div>

              <div className="comparativa-field-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="comparativa-field-label">Proyecto / Servicio</label>
                  {cambioServ && (
                    <span className="chip-cambio-alerta" title="El proyecto o servicio fue alterado">
                      Reasignado
                    </span>
                  )}
                </div>
                <div className={`comparativa-service-box ${cambioServ ? 'service-box-changed' : ''}`}>
                  {servDespues}
                </div>
              </div>
            </div>
          </div>

          {/* Resumen de auditoría */}
          <div className="comparativa-summary-footer">
            <div className="summary-left">
              <div className="summary-title">Resumen de Cambios:</div>
              <ul className="summary-bullets">
                {cambioTipo ? (
                  <li>Modalidad cambió de <strong>{tipoAntes}</strong> a <strong>{tipoDespues}</strong></li>
                ) : (
                  <li className="bullet-neutral">Modalidad sin cambios ({tipoDespues})</li>
                )}
                {cambioHoras ? (
                  <li>Jornada modificada de <strong>{horasAntes} hs</strong> a <strong>{horasDespues} hs</strong> (variación de <strong>{diffHoras > 0 ? `+${diffHoras}` : diffHoras} hs</strong>)</li>
                ) : (
                  <li className="bullet-neutral">Carga horaria idéntica ({horasDespues} hs)</li>
                )}
                {cambioServ ? (
                  <li>Proyecto cambiado de "<em>{servAntes}</em>" a "<em>{servDespues}</em>"</li>
                ) : (
                  <li className="bullet-neutral">Proyecto/Servicio sin cambios</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Pie de acciones del panel flotante */}
        <div className="modal-actions" style={{ justifyContent: 'space-between', padding: '16px 20px', background: 'var(--bg-surface-elevated, #f8fafc)', borderTop: '1px solid var(--border-subtle)' }}>
          <div>
            {(mod.revisado !== 1 && reg.modificacion_revisada !== 1) ? (
              <button
                type="button"
                className="btn-mark-reviewed-big"
                onClick={handleMarcarRevisadoDesdeComparativa}
                disabled={marcandoRevisadoId === (reg.id_asistencia || reg.id)}
              >
                {marcandoRevisadoId === (reg.id_asistencia || reg.id)
                  ? 'Guardando revisión...'
                  : '✓ Marcar como Revisado por RRHH'}
              </button>
            ) : (
              <span className="reviewed-success-text" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', padding: '6px 12px', borderRadius: '6px' }}>
                ✓ Modificación auditada y revisada por RRHH
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {puedeModificarRegistro(usuario, reg) && (
              <button
                type="button"
                className="btn-action-ghost"
                style={{ fontSize: '12px', padding: '6px 12px' }}
                onClick={() => onEditarRegistro(reg)}
                title="Realizar una nueva edición sobre este registro"
              >
                ✏️ Editar Registro
              </button>
            )}
            <button
              type="button"
              className="modal-btn-cancel"
              style={{ minWidth: '80px' }}
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
