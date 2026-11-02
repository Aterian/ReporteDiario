// [FN-02.03] Modal de confirmación para eliminación de registros de asistencia
import React from 'react';

export default function HistoryDeleteRecordModal({
  registroEliminando,
  onClose,
  eliminando,
  handleConfirmarEliminacion
}) {
  if (!registroEliminando) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-box modal-danger">
        <div className="modal-header">
          <span className="modal-title" style={{ color: 'var(--primary)' }}>
            ⚠️ Confirmar Eliminación
          </span>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="modal-body-text" style={{ padding: '18px' }}>
          <p>
            ¿Estás seguro de que deseas eliminar este registro de <strong>{registroEliminando.empleado}</strong>?
          </p>
          <div className="delete-details-card" style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div><strong>Fecha:</strong> {registroEliminando.fecha}</div>
            <div><strong>Modalidad:</strong> {registroEliminando.tipo_ocf || registroEliminando.lugar}</div>
            <div><strong>Proyecto:</strong> {registroEliminando.servicio}</div>
            <div><strong>Horas:</strong> {registroEliminando.horas} hs</div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '10px' }}>
            Esta acción eliminará el registro de la base local y también borrará la fila correspondiente en la hoja de Google Sheets en segundo plano.
          </p>
        </div>

        <div className="modal-actions" style={{ padding: '0 18px 18px 18px' }}>
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={onClose}
            disabled={eliminando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="modal-btn-delete"
            onClick={handleConfirmarEliminacion}
            disabled={eliminando}
          >
            {eliminando ? 'Eliminando...' : 'Sí, Eliminar Registro'}
          </button>
        </div>
      </div>
    </div>
  );
}
