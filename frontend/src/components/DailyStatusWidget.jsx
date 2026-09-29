import React, { useState, useEffect } from 'react';
import { api } from '../services/apiBridge';

// [FN-06.02] Widget de Control de Estado Diario
export default function DailyStatusWidget({ usuario }) {
  const getFechaHoy = () => {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  };

  const [fecha, setFecha] = useState(getFechaHoy());
  const [data, setData] = useState({
    fecha: getFechaHoy(),
    total_empleados: 0,
    registrados: 0,
    pendientes: 0,
    lista: []
  });
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todos'); // 'todos' | 'pendientes' | 'registrados'
  const [busqueda, setBusqueda] = useState('');

  // Modificaciones auditadas
  const [resumenModificaciones, setResumenModificaciones] = useState(null);
  const [modalModificacionesOpen, setModalModificacionesOpen] = useState(false);
  const [modificacionesRecientes, setModificacionesRecientes] = useState([]);
  const [cargandoModificaciones, setCargandoModificaciones] = useState(false);

  const cargarEstado = async (fechaConsulta = fecha) => {
    setCargando(true);
    try {
      const res = await api.obtenerEstadoDiarioEmpleados(fechaConsulta);
      if (res && Array.isArray(res.lista)) {
        setData(res);
      }
    } catch (err) {
      console.error('Error al cargar estado diario de empleados:', err);
    } finally {
      setCargando(false);
    }
  };

  const cargarResumenModificaciones = async () => {
    try {
      const resumen = await api.obtenerResumenModificaciones();
      if (resumen) {
        setResumenModificaciones(resumen);
      }
    } catch (err) {
      console.error('Error al cargar resumen de modificaciones:', err);
    }
  };

  useEffect(() => {
    cargarEstado(fecha);
    cargarResumenModificaciones();

    const handleCatalogos = () => {
      cargarEstado(fecha);
      cargarResumenModificaciones();
    };
    window.addEventListener('catalogos-actualizados', handleCatalogos);
    return () => {
      window.removeEventListener('catalogos-actualizados', handleCatalogos);
    };
  }, [fecha]);

  const handleVerModificaciones = async () => {
    setModalModificacionesOpen(true);
    setCargandoModificaciones(true);
    try {
      const lista = await api.obtenerModificacionesRecientes(40);
      if (Array.isArray(lista)) {
        setModificacionesRecientes(lista);
      }
    } catch (err) {
      console.error('Error al cargar lista de modificaciones:', err);
    } finally {
      setCargandoModificaciones(false);
    }
  };

  const getIniciales = (nombre) => {
    if (!nombre) return 'EM';
    const partes = nombre.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  const listaFiltrada = (data.lista || []).filter((item) => {
    if (filtro === 'pendientes' && item.registrado) return false;
    if (filtro === 'registrados' && !item.registrado) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const n = (item.nombre || '').toLowerCase();
      const a = (item.area || '').toLowerCase();
      const s = (item.servicio || '').toLowerCase();
      const m = (item.modalidad || '').toLowerCase();
      if (!n.includes(q) && !a.includes(q) && !s.includes(q) && !m.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const porcentaje = data.total_empleados > 0
    ? Math.round((data.registrados / data.total_empleados) * 100)
    : 0;

  return (
    <div className="daily-status-widget-container">
      {/* Alerta/Badge de Modificaciones de Auditoría */}
      {resumenModificaciones && (resumenModificaciones.ultimas_24h > 0 || resumenModificaciones.total_modificaciones > 0) && (
        <div className="audit-modification-banner" onClick={handleVerModificaciones} title="Clic para ver historial de modificaciones">
          <div className="audit-banner-left">
            <span className="audit-bell-icon">🔔</span>
            <div className="audit-banner-text">
              <strong>Control de Auditoría:</strong>{' '}
              {resumenModificaciones.ultimas_24h > 0 ? (
                <span>
                  Se registraron <strong style={{ color: '#cc3333' }}>{resumenModificaciones.ultimas_24h}</strong> modificaciones en las últimas 24 hs.
                </span>
              ) : (
                <span>
                  Hay <strong>{resumenModificaciones.total_modificaciones}</strong> registros auditados en <code>1_1_modificaciones_realizadas</code>.
                </span>
              )}
            </div>
          </div>
          <button type="button" className="audit-banner-btn">
            Ver detalle ({resumenModificaciones.total_modificaciones})
          </button>
        </div>
      )}

      {/* Tarjeta Principal del Widget */}
      <div className="daily-status-card">
        {/* Cabecera del Widget */}
        <div className="daily-status-header">
          <div className="daily-status-title-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="daily-status-icon">👥</span>
              <div>
                <h3 className="daily-status-title">Control de Estado Diario</h3>
                <span className="daily-status-subtitle">
                  Supervisión en tiempo real de checks enviados hoy
                </span>
              </div>
            </div>
          </div>

          <div className="daily-status-controls">
            <input
              type="date"
              className="form-input form-input-sm daily-date-picker"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              title="Cambiar fecha de inspección"
            />
            <button
              type="button"
              className="btn-refresh"
              onClick={() => cargarEstado(fecha)}
              disabled={cargando}
              title="Actualizar estado"
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
            </button>
          </div>
        </div>

        {/* Barra de progreso y contadores rápidos */}
        <div className="daily-status-metric-bar">
          <div className="daily-metric-pill total">
            <span className="metric-num">{data.total_empleados}</span>
            <span className="metric-label">Equipo</span>
          </div>

          <div className="daily-metric-pill green" onClick={() => setFiltro('registrados')} title="Ver registrados">
            <span className="metric-dot green" />
            <span className="metric-num">{data.registrados}</span>
            <span className="metric-label">Completados</span>
          </div>

          <div className="daily-metric-pill red" onClick={() => setFiltro('pendientes')} title="Ver pendientes">
            <span className="metric-dot red" />
            <span className="metric-num">{data.pendientes}</span>
            <span className="metric-label">Pendientes</span>
          </div>

          <div className="daily-metric-progress-wrapper">
            <div className="progress-info">
              <span>{porcentaje}% completado</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${porcentaje}%`, backgroundColor: porcentaje === 100 ? '#10b981' : '#cc3333' }}
              />
            </div>
          </div>
        </div>

        {/* Filtros de búsqueda */}
        <div className="daily-status-filter-row">
          <div className="daily-search-box">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar colaborador..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="daily-search-input"
            />
            {busqueda && (
              <button type="button" className="daily-search-clear" onClick={() => setBusqueda('')}>✕</button>
            )}
          </div>

          <div className="daily-filter-pills">
            <button
              type="button"
              className={`pill-btn ${filtro === 'todos' ? 'active' : ''}`}
              onClick={() => setFiltro('todos')}
            >
              Todos ({data.total_empleados})
            </button>
            <button
              type="button"
              className={`pill-btn pill-pending ${filtro === 'pendientes' ? 'active' : ''}`}
              onClick={() => setFiltro('pendientes')}
            >
              Pendientes ({data.pendientes})
            </button>
            <button
              type="button"
              className={`pill-btn pill-done ${filtro === 'registrados' ? 'active' : ''}`}
              onClick={() => setFiltro('registrados')}
            >
              Enviados ({data.registrados})
            </button>
          </div>
        </div>

        {/* Lista compacta de colaboradores */}
        <div className="daily-status-list-scroll">
          {cargando && data.lista.length === 0 ? (
            <div className="daily-status-empty">
              <div className="spinner" style={{ width: '20px', height: '20px' }} />
              <span>Consultando estado del personal...</span>
            </div>
          ) : listaFiltrada.length === 0 ? (
            <div className="daily-status-empty">
              <span>No se encontraron empleados para el criterio seleccionado.</span>
            </div>
          ) : (
            <div className="daily-status-grid">
              {listaFiltrada.map((emp) => {
                const esReg = emp.registrado;
                return (
                  <div
                    key={emp.dni || emp.nombre}
                    className={`daily-employee-row ${esReg ? 'row-completed' : 'row-pending'}`}
                  >
                    <div className="daily-emp-avatar">
                      {getIniciales(emp.nombre)}
                      <span className={`emp-avatar-dot ${esReg ? 'dot-green' : 'dot-red'}`} />
                    </div>

                    <div className="daily-emp-info">
                      <div className="daily-emp-name-line">
                        <span className="daily-emp-name">{emp.nombre}</span>
                        {emp.area && <span className="daily-emp-area">{emp.area}</span>}
                      </div>

                      <div className="daily-emp-detail-line">
                        {esReg ? (
                          <span className="daily-detail-text">
                            <strong style={{ color: '#059669' }}>✓ {emp.modalidad}</strong>
                            {emp.horas > 0 && ` (${emp.horas} hs)`}
                            {emp.servicio && ` • ${emp.servicio}`}
                          </span>
                        ) : (
                          <span className="daily-detail-pending">
                            ⏳ Sin registro el día de hoy
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="daily-emp-badge-box">
                      <span className={`daily-badge ${esReg ? 'badge-sent' : 'badge-wait'}`}>
                        {esReg ? 'Enviado' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Auditoría de Modificaciones */}
      {modalModificacionesOpen && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '640px', width: '92%' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📝</span>
                <div>
                  <span className="modal-title">Auditoría: Modificaciones Registradas</span>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Historial registrado en <code>1_1_modificaciones_realizadas</code>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalModificacionesOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '420px', overflowY: 'auto', padding: '14px' }}>
              {cargandoModificaciones ? (
                <div style={{ padding: '30px', textAlign: 'center' }}>
                  <div className="spinner" style={{ width: '24px', height: '24px', margin: '0 auto 8px' }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Cargando auditoría...</span>
                </div>
              ) : modificacionesRecientes.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  No se han registrado modificaciones en el sistema hasta el momento.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {modificacionesRecientes.map((mod) => (
                    <div
                      key={mod.id_modificacion || mod.id}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)' }}>
                            {mod.quien_modifica || 'Usuario autenticado'}
                          </strong>
                          {mod.empleado && (
                            <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>
                              sobre <strong>{mod.empleado}</strong>
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {mod.fecha_hora_modificaciones || mod.fecha_hora || ''}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--bg-app)', padding: '6px 8px', borderRadius: '6px' }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Antes</div>
                          <div><strong>Modalidad:</strong> {mod.tipo_antes || '-'}</div>
                          <div><strong>Horas:</strong> {mod.horas_antes ?? '-'} hs</div>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <strong>Servicio:</strong> {mod.servicio_antes || '-'}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '10px', color: '#cc3333', textTransform: 'uppercase', fontWeight: 'bold' }}>Después</div>
                          <div><strong>Modalidad:</strong> {mod.tipo_despues || '-'}</div>
                          <div><strong>Horas:</strong> {mod.horas_despues ?? '-'} hs</div>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <strong>Servicio:</strong> {mod.servicio_despues || '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ padding: '10px 14px' }}>
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={() => setModalModificacionesOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
