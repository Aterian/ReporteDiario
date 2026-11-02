// [FN-02.03] Modal de múltiples registros por día para auditoría y selección
import React from 'react';
import { getBadgeClassLugar } from './historyConstants';

export default function HistoryDayRecordsModal({
  diaSeleccionadoAuditoria,
  onClose,
  empleadoAuditar,
  puedeVerModif,
  abrirComparativa,
  marcandoRevisadoId,
  handleMarcarRevisado,
  puedeEditarCosto,
  handleAbrirModalCostoDia,
  esSoloLecturaNucleo,
  puedeModificarRegistro,
  usuario,
  setRegistroEditando,
  setRegistroEliminando
}) {
  if (!diaSeleccionadoAuditoria) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-box" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <span className="modal-title">
            Registros del {diaSeleccionadoAuditoria.fechaIso}
          </span>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Empleado: <strong>{empleadoAuditar}</strong> • Selecciona un registro para modificarlo o eliminarlo:
          </span>
          {diaSeleccionadoAuditoria.registros.map((item) => {
            const lug = item.tipo_ocf || item.lugar || 'Oficina';
            const badge = getBadgeClassLugar(lug, item.servicio);
            return (
              <div
                key={item.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' }}>
                  <span className={`modalidad-pill ${badge}`} style={{ width: 'fit-content' }}>{lug}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.servicio}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {item.horas > 0 ? `${item.horas} hs` : '0 hs'}
                  </span>
                  {puedeVerModif && Boolean(item.fue_modificado || item.modificado) && (
                    item.modificacion_revisada === 1 && item.modificacion_pendiente !== 1 ? (
                      <div style={{ marginTop: '6px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '6px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            ✓ Modificación revisada por RRHH
                          </span>
                          <button
                            type="button"
                            className="btn-comparativa-action"
                            style={{
                              background: '#7c3aed',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '5px',
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            onClick={() => abrirComparativa(item)}
                            title="Ver panel comparativo antes / después"
                          >
                            ⚖️ Ver Comparativa
                          </button>
                        </div>
                        {item.detalle_modificacion && (
                          <span style={{ fontSize: '11px', color: '#15803d', display: 'block', marginTop: '2px' }}>
                            {item.detalle_modificacion}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop: '6px', background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '6px', padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            ✏️ MODIFICACIÓN PENDIENTE DE REVISIÓN
                          </span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn-comparativa-action"
                              style={{
                                background: '#7c3aed',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '5px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              onClick={() => abrirComparativa(item)}
                              title="Ver comparativa dividida antes y después"
                            >
                              ⚖️ Comparativa
                            </button>
                            <button
                              type="button"
                              className="btn-mark-reviewed"
                              style={{
                                background: '#10b981',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '5px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 1px 3px rgba(16, 185, 129, 0.3)'
                              }}
                              disabled={marcandoRevisadoId === (item.id_asistencia || item.id)}
                              onClick={() => handleMarcarRevisado(item)}
                              title="Marcar como revisado para que no vuelva a aparecer la alerta"
                            >
                              {marcandoRevisadoId === (item.id_asistencia || item.id) ? 'Guardando...' : '✓ Marcar como Revisado'}
                            </button>
                          </div>
                        </div>
                        {item.detalle_modificacion && (
                          <span style={{ fontSize: '11px', color: '#92400e', display: 'block', marginTop: '4px', lineHeight: 1.3 }}>
                            {item.detalle_modificacion}
                          </span>
                        )}
                      </div>
                    )
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                  {puedeEditarCosto && (
                    <button
                      type="button"
                      className="btn-card-action"
                      style={{ color: '#059669', borderColor: '#10b98150', background: '#10b98115', fontWeight: 600 }}
                      onClick={() => {
                        const celdaRef = diaSeleccionadoAuditoria;
                        onClose();
                        handleAbrirModalCostoDia(celdaRef, item);
                      }}
                      title="Editar manualmente costo_dia de este registro"
                    >
                      💰 ${Number(item.costo_dia || 0).toLocaleString('es-AR')} ✏️
                    </button>
                  )}
                  {!esSoloLecturaNucleo && puedeModificarRegistro(usuario, item) ? (
                    <>
                      <button
                        type="button"
                        className="btn-card-action btn-card-edit"
                        onClick={() => {
                          onClose();
                          setRegistroEditando({ ...item });
                        }}
                        title="Modificar este registro"
                      >
                        Modificar
                      </button>
                      <button
                        type="button"
                        className="btn-card-action btn-card-delete"
                        onClick={() => {
                          onClose();
                          setRegistroEliminando(item);
                        }}
                        title="Eliminar este registro"
                      >
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
        <div className="modal-actions" style={{ padding: '12px 16px' }}>
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
