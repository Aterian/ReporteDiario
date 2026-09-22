import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';

const LUGARES_OPCIONES = [
  'Oficina',
  'Campaña / Campo',
  'Home Office',
  'Franco',
  'Vacaciones',
  'Licencia'
];

export default function OtherEmployeesHistoryView({ usuario, onVolver, tema, onVerMiHistorial, onNuevoReporte }) {
  const isRpg = tema === 'rpg';

  // Maximizar ventana para experiencia panorámica
  useEffect(() => {
    api.maximizarVentana();
  }, []);

  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeSync, setMensajeSync] = useState(null);

  // Catálogos auxiliares
  const [empleados, setEmpleados] = useState([]);
  const [serviciosDisponibles, setServiciosDisponibles] = useState([]);

  // Filtros
  const [filtroEmpleado, setFiltroEmpleado] = useState('TODOS');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroMes, setFiltroMes] = useState(''); // YYYY-MM opcional

  // Modal de edición
  const [registroEditando, setRegistroEditando] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Modal de eliminación
  const [registroEliminando, setRegistroEliminando] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [dataRegs, dataEmps, dataServs] = await Promise.all([
        api.obtenerHistorialOtrosEmpleados(filtroEmpleado),
        api.obtenerTodosUsuarios(),
        api.obtenerServicios('TODOS')
      ]);

      if (Array.isArray(dataRegs)) setRegistros(dataRegs);
      if (Array.isArray(dataEmps)) setEmpleados(dataEmps);
      if (Array.isArray(dataServs)) setServiciosDisponibles(dataServs);
    } catch (err) {
      console.error('Error al cargar historial de otros empleados:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();

    const handleCatalogos = () => cargarDatos();
    window.addEventListener('catalogos-actualizados', handleCatalogos);
    return () => {
      window.removeEventListener('catalogos-actualizados', handleCatalogos);
    };
  }, [filtroEmpleado]);

  const ejecutarSincronizacion = async () => {
    setSincronizando(true);
    setMensajeSync(null);
    try {
      const res = await api.sincronizarSheets();
      if (res && res.exito) {
        setMensajeSync({ tipo: 'exito', texto: res.mensaje || 'Sincronizado correctamente con Google Sheets.' });
        await cargarDatos();
      } else {
        setMensajeSync({ tipo: 'error', texto: res?.error || 'No se pudo sincronizar con Google Sheets.' });
      }
    } catch (err) {
      console.error(err);
      setMensajeSync({ tipo: 'error', texto: 'Error de red o comunicación con Google Sheets.' });
    } finally {
      setSincronizando(false);
    }
  };

  const handleGuardarModificacion = async (e) => {
    e.preventDefault();
    if (!registroEditando) return;

    setGuardandoEdicion(true);
    try {
      const res = await api.modificarRegistro({
        id: registroEditando.id,
        fecha: registroEditando.fecha,
        lugar: registroEditando.tipo_ocf || registroEditando.lugar || 'Oficina',
        servicio: registroEditando.servicio,
        horas: Number(registroEditando.horas) || 0,
        empleado: registroEditando.empleado,
        id_empleado: registroEditando.id_empleado || '',
        id_proyecto: registroEditando.id_proyecto || ''
      });

      if (res && res.exito) {
        setMensajeSync({ tipo: 'exito', texto: 'Registro modificado exitosamente.' });
        setRegistroEditando(null);
        await cargarDatos();
      } else {
        setMensajeSync({ tipo: 'error', texto: res?.error || 'No se pudo guardar la modificación.' });
      }
    } catch (err) {
      console.error(err);
      setMensajeSync({ tipo: 'error', texto: 'Error al conectar con la aplicación.' });
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const handleConfirmarEliminacion = async () => {
    if (!registroEliminando) return;
    setEliminando(true);
    try {
      const res = await api.eliminarRegistroAsistencia(registroEliminando.id);
      if (res && res.exito) {
        setMensajeSync({ tipo: 'exito', texto: res.mensaje || 'Registro eliminado correctamente.' });
        setRegistroEliminando(null);
        await cargarDatos();
      } else {
        setMensajeSync({ tipo: 'error', texto: res?.error || 'No se pudo eliminar el registro.' });
      }
    } catch (err) {
      console.error('Error al eliminar registro:', err);
      setMensajeSync({ tipo: 'error', texto: 'Error al eliminar el registro.' });
    } finally {
      setEliminando(false);
    }
  };

  // Filtrado en memoria
  const registrosFiltrados = useMemo(() => {
    return registros.filter(r => {
      // Filtro texto
      if (filtroTexto) {
        const q = filtroTexto.toLowerCase();
        const emp = (r.empleado || '').toLowerCase();
        const srv = (r.servicio || '').toLowerCase();
        const lug = (r.tipo_ocf || r.lugar || '').toLowerCase();
        const fec = (r.fecha || '').toLowerCase();
        if (!emp.includes(q) && !srv.includes(q) && !lug.includes(q) && !fec.includes(q)) {
          return false;
        }
      }

      // Filtro mes (YYYY-MM)
      if (filtroMes) {
        if (!r.fecha || !r.fecha.startsWith(filtroMes)) {
          return false;
        }
      }

      return true;
    });
  }, [registros, filtroTexto, filtroMes]);

  const pendientesCount = registros.filter(r => r.sincronizado === 0).length;

  const getBadgeClassLugar = (lugar) => {
    const l = (lugar || '').toLowerCase();
    if (l.includes('oficina')) return 'badge-modalidad-oficina';
    if (l.includes('campo') || l.includes('campaña') || l.includes('roster')) return 'badge-modalidad-campo';
    if (l.includes('home')) return 'badge-modalidad-home';
    if (l.includes('franco')) return 'badge-modalidad-franco';
    if (l.includes('vacaciones')) return 'badge-modalidad-vacaciones';
    if (l.includes('licencia')) return 'badge-modalidad-licencia';
    return 'badge-modalidad-oficina';
  };

  const getIniciales = (nombre) => {
    if (!nombre) return 'EM';
    const partes = nombre.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  return (
    <div className="view-content other-history-container">
      {/* Barra superior de navegación */}
      <div className="view-header-bar other-history-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onVolver && (
            <button type="button" className="btn-back" onClick={onVolver}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Inicio</span>
            </button>
          )}

          {onVerMiHistorial && (
            <button type="button" className="btn-action-ghost" onClick={onVerMiHistorial}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
              <span>Mi Historial</span>
            </button>
          )}

          <div className="other-history-title-block">
            <span className="other-history-title">Historial de Otros Empleados (RRHH)</span>
            <span className="other-history-subtitle">
              Registros cargados a nombre de otros empleados • Edición y eliminación
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {pendientesCount > 0 && (
            <button
              type="button"
              className="btn-sync"
              onClick={ejecutarSincronizacion}
              disabled={sincronizando}
              title="Sincronizar cambios pendientes con Google Sheets"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
              <span>{sincronizando ? 'Enviando...' : `Subir (${pendientesCount})`}</span>
            </button>
          )}

          <button
            type="button"
            className="btn-refresh"
            onClick={cargarDatos}
            disabled={cargando || sincronizando}
            title="Actualizar registros"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cargando ? 'spinner' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refrescar
          </button>
        </div>
      </div>

      {mensajeSync && (
        <div className={`alert-banner ${mensajeSync.tipo === 'exito' ? 'alert-success' : 'alert-error'}`}>
          <span>{mensajeSync.texto}</span>
          <button type="button" onClick={() => setMensajeSync(null)}>✕</button>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="filters-card">
        <div className="filter-item">
          <label className="filter-label">Empleado asignado:</label>
          <select
            className="form-select form-select-sm"
            value={filtroEmpleado}
            onChange={(e) => setFiltroEmpleado(e.target.value)}
          >
            <option value="TODOS">-- Todos los empleados --</option>
            {empleados.map(u => (
              <option key={u.dni || u.nombre} value={u.nombre}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label className="filter-label">Filtrar por mes:</label>
          <input
            type="month"
            className="form-input form-input-sm"
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
          />
        </div>

        <div className="filter-item filter-search">
          <label className="filter-label">Búsqueda rápida:</label>
          <div className="search-input-wrapper">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por empleado, proyecto o fecha..."
              className="form-input form-input-sm search-field"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
            {filtroTexto && (
              <button type="button" className="clear-search-btn" onClick={() => setFiltroTexto('')}>✕</button>
            )}
          </div>
        </div>

        {(filtroEmpleado !== 'TODOS' || filtroMes || filtroTexto) && (
          <button
            type="button"
            className="btn-clear-filters"
            onClick={() => {
              setFiltroEmpleado('TODOS');
              setFiltroMes('');
              setFiltroTexto('');
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Lista / Tabla de Registros */}
      <div className="other-history-body">
        {cargando && registros.length === 0 ? (
          <div className="empty-state">
            <div className="spinner" style={{ width: '30px', height: '30px' }} />
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
              {registros.length === 0
                ? 'Aún no se han registrado asistencias para otros empleados.'
                : 'No se encontraron registros con los filtros seleccionados.'}
            </span>
          </div>
        ) : (
          <div className="other-cards-grid">
            {registrosFiltrados.map((item) => {
              const lugarDisplay = item.tipo_ocf || item.lugar || 'Oficina';
              const badgeClass = getBadgeClassLugar(lugarDisplay);
              const horasDisplay = item.horas > 0 ? `${item.horas} hs` : (item.jornada || '0 hs');
              const estaSincronizado = item.sincronizado === 1;

              return (
                <div key={item.id} className="other-record-card">
                  <div className="other-card-header">
                    <div className="other-card-user">
                      <div className="other-user-avatar">
                        {getIniciales(item.empleado)}
                      </div>
                      <div className="other-user-meta">
                        <span className="other-user-name">{item.empleado || 'Sin empleado'}</span>
                        {item.cargado_por && (
                          <span className="other-user-sub">
                            Cargado por: <strong>{item.cargado_por}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="other-card-badges">
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
                        {lugarDisplay}
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Modificación */}
      {registroEditando && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Modificar Registro de Asistencia</span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setRegistroEditando(null)}
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
                  onChange={(e) => setRegistroEditando({ ...registroEditando, empleado: e.target.value })}
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

                    if (nuevoLugar === 'Franco' || nuevoLugar === 'Vacaciones') {
                      nuevoServicio = nuevoLugar;
                      nuevasHoras = 0;
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

              {/* Si es Licencia, detalle del tipo de licencia */}
              {(registroEditando.tipo_ocf === 'Licencia' || registroEditando.lugar === 'Licencia') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Tipo de Licencia:</label>
                  <input
                    type="text"
                    className="form-input form-input-clean"
                    value={registroEditando.servicio}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                    placeholder="Ej: Licencia Médica, Licencia Especial, Examen..."
                    required
                  />
                </div>
              ) : (registroEditando.tipo_ocf === 'Franco' || registroEditando.lugar === 'Franco' ||
                   registroEditando.tipo_ocf === 'Vacaciones' || registroEditando.lugar === 'Vacaciones') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Detalle:</label>
                  <input
                    type="text"
                    className="form-input form-input-clean"
                    value={registroEditando.servicio}
                    disabled
                  />
                </div>
              ) : (
                <div className="form-group-clean">
                  <label className="form-label-clean">Proyecto / Tarea:</label>
                  <select
                    className="form-select form-select-clean"
                    value={registroEditando.servicio}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                    required
                  >
                    <option value="Tiempo dedicado al Área">Tiempo dedicado al Área</option>
                    {serviciosDisponibles.map((srv, idx) => (
                      <option key={idx} value={srv}>{srv}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group-clean">
                <label className="form-label-clean">Horas Registradas:</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  className="form-input form-input-clean"
                  value={registroEditando.horas}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, horas: e.target.value })}
                  disabled={['Franco', 'Vacaciones', 'Licencia'].includes(registroEditando.tipo_ocf || registroEditando.lugar)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setRegistroEditando(null)}
                  disabled={guardandoEdicion}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-confirm"
                  disabled={guardandoEdicion}
                >
                  {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {registroEliminando && (
        <div className="modal-backdrop">
          <div className="modal-box modal-danger">
            <div className="modal-header">
              <span className="modal-title" style={{ color: 'var(--primary)' }}>
                ⚠️ Confirmar Eliminación
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setRegistroEliminando(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body-text">
              <p>
                ¿Estás seguro de que deseas eliminar este registro de <strong>{registroEliminando.empleado}</strong>?
              </p>
              <div className="delete-details-card">
                <div><strong>Fecha:</strong> {registroEliminando.fecha}</div>
                <div><strong>Modalidad:</strong> {registroEliminando.tipo_ocf || registroEliminando.lugar}</div>
                <div><strong>Proyecto:</strong> {registroEliminando.servicio}</div>
                <div><strong>Horas:</strong> {registroEliminando.horas} hs</div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                Esta acción eliminará el registro de la base local y también borrará la fila correspondiente en la hoja de Google Sheets en segundo plano.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setRegistroEliminando(null)}
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmarEliminacion}
                disabled={eliminando}
              >
                {eliminando ? 'Eliminando...' : 'Sí, Eliminar Registro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
