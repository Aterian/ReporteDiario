// [MOD-05] RosterEmployeeChecklist - Selección múltiple de colaboradores
import React from 'react';

export default function RosterEmployeeChecklist({
  empleadosDisponibles = [],
  empleadosSeleccionados = [],
  onToggleEmpleado,
  onSeleccionarTodos,
  onDeseleccionarTodos
}) {
  return (
    <div className="form-group-roster">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '4px' }}>
        <label className="roster-label" style={{ margin: 0 }}>
          <span className="roster-label-num">2</span>
          <span>Empleados (Ingeniería - I) <strong className="required">*</strong></span>
        </label>
        <div className="roster-emp-actions-row" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            className="btn-link-action"
            onClick={onSeleccionarTodos}
            style={{ padding: '2px 6px', background: 'var(--bg-surface-hover, #f1f5f9)', borderRadius: '4px', textDecoration: 'none' }}
            title="Seleccionar todos los colaboradores disponibles"
          >
            Todos
          </button>
          <span style={{ color: 'var(--border-input)', fontSize: '11px' }}>•</span>
          <button
            type="button"
            className="btn-link-action"
            onClick={onDeseleccionarTodos}
            style={{ padding: '2px 6px', background: 'var(--bg-surface-hover, #f1f5f9)', borderRadius: '4px', textDecoration: 'none' }}
            title="Deseleccionar todos los colaboradores"
          >
            Ninguno
          </button>
        </div>
      </div>

      <div className="roster-multi-emp-container">
        {empleadosDisponibles.length === 0 ? (
          <div className="roster-multi-emp-empty">No hay empleados disponibles en el área de Ingeniería.</div>
        ) : (
          empleadosDisponibles.map((emp, idx) => {
            const isSelected = empleadosSeleccionados.includes(emp.nombre);
            return (
              <div
                key={idx}
                className={`emp-multi-chip ${isSelected ? 'selected' : ''}`}
                onClick={() => onToggleEmpleado(emp.nombre)}
                title={`Click para ${isSelected ? 'quitar' : 'seleccionar'} a ${emp.nombre}`}
              >
                <div className={`chip-checkbox ${isSelected ? 'checked' : ''}`}>
                  {isSelected ? '✓' : ''}
                </div>
                <span className="chip-emp-name">{emp.nombre}</span>
                {emp.area && <span className="chip-emp-area">({emp.area})</span>}
              </div>
            );
          })
        )}
      </div>

      <div className="roster-emp-selected-summary">
        {empleadosSeleccionados.length === 0 ? (
          <span className="summary-empty">⚠️ Seleccioná uno o más empleados para asignar el roster.</span>
        ) : (
          <span className="summary-filled">
            ✓ <strong>{empleadosSeleccionados.length}</strong> seleccionado{empleadosSeleccionados.length > 1 ? 's' : ''}: {empleadosSeleccionados.join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}
