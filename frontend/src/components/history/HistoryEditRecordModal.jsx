// [FN-02.03] Modal de modificación y edición de registros de asistencia
import React from 'react';
import { LUGARES_OPCIONES, LISTADO_AREAS_CORPORATIVAS, TIPOS_LICENCIA } from './historyConstants';

export default function HistoryEditRecordModal({
  registroEditando,
  setRegistroEditando,
  empleados,
  serviciosDisponibles,
  puedeEditarCosto,
  guardandoEdicion,
  handleGuardarModificacion,
  onSolicitarEliminar,
  onClose
}) {
  if (!registroEditando) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">Modificar Registro de Asistencia</span>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleGuardarModificacion} className="modal-form">
          <div className="form-group-clean">
            <label className="form-label-clean">Empleado:</label>
            <select
              className="form-select form-select-clean"
              value={registroEditando.empleado}
              onChange={(e) => {
                const nuevoNombre = e.target.value;
                const empData = empleados.find(u => u.nombre === nuevoNombre);
                setRegistroEditando({
                  ...registroEditando,
                  empleado: nuevoNombre,
                  id_empleado: empData ? (empData.id_origen || empData.id_usuario || empData.dni || '') : '',
                  usuario_mail: empData ? (empData.email || empData.mail || '') : ''
                });
              }}
              required
            >
              {empleados.map(u => (
                <option key={u.dni || u.nombre} value={u.nombre}>
                  {u.nombre} ({u.area || 'Sin área'})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group-clean">
            <label className="form-label-clean">Fecha:</label>
            <input
              type="date"
              className="form-input form-input-clean"
              value={registroEditando.fecha}
              onChange={(e) => setRegistroEditando({ ...registroEditando, fecha: e.target.value })}
              required
            />
          </div>

          <div className="form-group-clean">
            <label className="form-label-clean">Modalidad / Lugar:</label>
            <select
              className="form-select form-select-clean"
              value={registroEditando.tipo_ocf || registroEditando.lugar || 'Oficina'}
              onChange={(e) => {
                const nuevoLugar = e.target.value;
                let nuevoServicio = registroEditando.servicio;
                let nuevasHoras = registroEditando.horas;

                if (nuevoLugar === 'Franco' || nuevoLugar === 'Franco de Oficina' || nuevoLugar === 'Franco Obra' || nuevoLugar === 'Franco de Obra' || nuevoLugar === 'Vacaciones') {
                  nuevasHoras = 0;
                  if (nuevoLugar === 'Vacaciones') nuevoServicio = 'Vacaciones';
                  if (nuevoLugar === 'Franco Obra' || nuevoLugar === 'Franco de Obra') nuevoServicio = '';
                  if (nuevoLugar === 'Franco') nuevoServicio = registroEditando.servicio || 'Área';
                } else if (nuevoLugar === 'Franco Ofic Trabajado' || nuevoLugar === 'Franco Trabajado') {
                  nuevoServicio = 'Tiempo dedicado al Área';
                  nuevasHoras = 8;
                } else if (nuevoLugar === 'Franco Obra Trabajado' || nuevoLugar === 'Feriado Trabajado') {
                  nuevoServicio = '';
                  nuevasHoras = 8;
                } else if (nuevoLugar === 'Licencia') {
                  nuevoServicio = 'Licencia Médica';
                  nuevasHoras = 0;
                } else if (nuevasHoras === 0) {
                  nuevasHoras = 8;
                }

                setRegistroEditando({
                  ...registroEditando,
                  tipo_ocf: nuevoLugar,
                  lugar: nuevoLugar,
                  servicio: nuevoServicio,
                  horas: nuevasHoras
                });
              }}
              required
            >
              {LUGARES_OPCIONES.map(op => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>

          {/* Si es Licencia: enum de tipos de licencia */}
          {(registroEditando.tipo_ocf === 'Licencia' || registroEditando.lugar === 'Licencia') ? (
            <div className="form-group-clean">
              <label className="form-label-clean">Tipo de Licencia:</label>
              <select
                className="form-select form-select-clean"
                value={registroEditando.servicio || 'Licencia - Médica'}
                onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                required
              >
                {TIPOS_LICENCIA.map(tl => (
                  <option key={tl} value={tl}>{tl}</option>
                ))}
                {registroEditando.servicio && !TIPOS_LICENCIA.includes(registroEditando.servicio) && (
                  <option value={registroEditando.servicio}>{registroEditando.servicio}</option>
                )}
              </select>
            </div>
          ) : (['Franco Obra', 'Franco de Obra', 'Franco Obra Trabajado', 'Feriado Trabajado', 'Campo', 'Campaña / Campo', 'Roster'].includes(registroEditando.tipo_ocf || registroEditando.lugar)) ? (
            <div className="form-group-clean">
              <label className="form-label-clean">Proyecto Asignado:</label>
              <select
                className="form-select form-select-clean"
                value={registroEditando.servicio || ''}
                onChange={(e) => {
                  setRegistroEditando({
                    ...registroEditando,
                    servicio: e.target.value
                  });
                }}
                required
              >
                <option value="">-- Seleccionar proyecto asignado --</option>
                <optgroup label="Proyectos Activos">
                  {serviciosDisponibles.map((srv, idx) => (
                    <option key={idx} value={srv}>{srv}</option>
                  ))}
                </optgroup>
                {registroEditando.servicio && !serviciosDisponibles.includes(registroEditando.servicio) && (
                  <option value={registroEditando.servicio}>{registroEditando.servicio}</option>
                )}
              </select>
            </div>
          ) : (registroEditando.tipo_ocf === 'Franco' || registroEditando.lugar === 'Franco') ? (
            <div className="form-group-clean">
              <label className="form-label-clean">Área / Asignación (Franco):</label>
              <select
                className="form-select form-select-clean"
                value={registroEditando.servicio || ''}
                onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                required
              >
                <option value="">-- Seleccionar asignación de Franco --</option>
                <optgroup label="Áreas Corporativas (Franco de Oficina)">
                  {LISTADO_AREAS_CORPORATIVAS.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </optgroup>
                <optgroup label="Proyectos Activos (Franco de Obra)">
                  {serviciosDisponibles.map((srv, idx) => (
                    <option key={idx} value={srv}>{srv}</option>
                  ))}
                </optgroup>
                {registroEditando.servicio &&
                  !LISTADO_AREAS_CORPORATIVAS.includes(registroEditando.servicio) &&
                  !serviciosDisponibles.includes(registroEditando.servicio) && (
                    <option value={registroEditando.servicio}>{registroEditando.servicio}</option>
                )}
              </select>
            </div>
          ) : (registroEditando.tipo_ocf === 'Vacaciones' || registroEditando.lugar === 'Vacaciones') ? (
            <div className="form-group-clean">
              <label className="form-label-clean">Detalle:</label>
              <select
                className="form-select form-select-clean"
                value="Vacaciones"
                disabled
              >
                <option value="Vacaciones">Vacaciones</option>
              </select>
            </div>
          ) : (
            <div className="form-group-clean">
              <label className="form-label-clean">Proyecto / Tarea asignada:</label>
              <select
                className="form-select form-select-clean"
                value={registroEditando.servicio || 'Tiempo dedicado al Área'}
                onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                required
              >
                <optgroup label="Tareas y Áreas Internas">
                  <option value="Tiempo dedicado al Área">Tiempo dedicado al Área</option>
                  <option value="Dedicado al área">Dedicado al área</option>
                  {LISTADO_AREAS_CORPORATIVAS.map(a => (
                    <option key={a} value={`Dedicado al área - ${a}`}>Dedicado al área - {a}</option>
                  ))}
                </optgroup>
                <optgroup label="Proyectos Activos">
                  {serviciosDisponibles.map((srv, idx) => (
                    <option key={idx} value={srv}>{srv}</option>
                  ))}
                </optgroup>
                {registroEditando.servicio &&
                  registroEditando.servicio !== 'Tiempo dedicado al Área' &&
                  registroEditando.servicio !== 'Dedicado al área' &&
                  !LISTADO_AREAS_CORPORATIVAS.some(a => `Dedicado al área - ${a}` === registroEditando.servicio) &&
                  !serviciosDisponibles.includes(registroEditando.servicio) && (
                    <option value={registroEditando.servicio}>{registroEditando.servicio}</option>
                )}
              </select>
            </div>
          )}

          {/* Si es Campo: selectores de hora inicio y fin */}
          {['Campo', 'Campaña / Campo'].includes(registroEditando.tipo_ocf || registroEditando.lugar) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group-clean">
                <label className="form-label-clean">Hora Inicio:</label>
                <input
                  type="time"
                  className="form-input form-input-clean"
                  value={registroEditando.hora_inicio || ''}
                  onChange={(e) => {
                    const hIni = e.target.value;
                    const hFin = registroEditando.hora_fin;
                    let hCalc = registroEditando.horas;
                    if (hIni && hFin) {
                      const [h1, m1] = hIni.split(':').map(Number);
                      const [h2, m2] = hFin.split(':').map(Number);
                      let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                      if (diff < 0) diff += 24 * 60;
                      hCalc = Number((diff / 60).toFixed(2));
                    }
                    setRegistroEditando({ ...registroEditando, hora_inicio: hIni, horas: hCalc });
                  }}
                />
              </div>
              <div className="form-group-clean">
                <label className="form-label-clean">Hora Fin:</label>
                <input
                  type="time"
                  className="form-input form-input-clean"
                  value={registroEditando.hora_fin || ''}
                  onChange={(e) => {
                    const hFin = e.target.value;
                    const hIni = registroEditando.hora_inicio;
                    let hCalc = registroEditando.horas;
                    if (hIni && hFin) {
                      const [h1, m1] = hIni.split(':').map(Number);
                      const [h2, m2] = hFin.split(':').map(Number);
                      let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                      if (diff < 0) diff += 24 * 60;
                      hCalc = Number((diff / 60).toFixed(2));
                    }
                    setRegistroEditando({ ...registroEditando, hora_fin: hFin, horas: hCalc });
                  }}
                />
              </div>
            </div>
          )}

          <div className="form-group-clean">
            <label className="form-label-clean">Horas Registradas:</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="form-input form-input-clean"
              value={registroEditando.horas}
              onChange={(e) => setRegistroEditando({ ...registroEditando, horas: e.target.value })}
              disabled={['Franco', 'Franco de Oficina', 'Franco Obra', 'Franco de Obra', 'Vacaciones', 'Licencia'].includes(registroEditando.tipo_ocf || registroEditando.lugar)}
              required
            />
          </div>

          {puedeEditarCosto && (
            <div className="form-group-clean">
              <label className="form-label-clean">Tipo de Costo (RRHH / Aplicaciones):</label>
              <select
                className="form-select form-select-clean"
                value={registroEditando.tipo_costo || ''}
                onChange={(e) => setRegistroEditando({ ...registroEditando, tipo_costo: e.target.value })}
              >
                <option value="">-- Sin Asignar --</option>
                <option value="Oficina">Oficina</option>
                <option value="Campo">Campo</option>
              </select>
            </div>
          )}

          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn-card-action btn-card-delete"
              style={{ color: '#dc2626', borderColor: '#fca5a5' }}
              onClick={() => onSolicitarEliminar(registroEditando)}
              title="Eliminar este registro"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Eliminar Registro
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={onClose}
                disabled={guardandoEdicion}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="modal-btn-confirm"
                disabled={guardandoEdicion}
              >
                {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
