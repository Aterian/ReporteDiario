import React, { useState, useEffect } from 'react';
import { api } from '../services/apiBridge';
import { puedeVerModificaciones } from '../utils/permissions';

// [FN-06.02] Widget de Actividad de Ayer (Estilo Usuarios Conectados)
export default function DailyStatusWidget({ usuario }) {
  const [data, setData] = useState({
    fecha: '',
    total: 0,
    enviados: 0,
    pendientes: 0,
    usuarios: []
  });
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todos'); // 'todos' | 'pendientes' | 'enviados'
  const [busqueda, setBusqueda] = useState('');

  const puedeVerModif = puedeVerModificaciones(usuario);

  // Modificaciones auditadas (Exclusivo Justina Bertolozzi e Iván Valentin)
  const [resumenModificaciones, setResumenModificaciones] = useState(null);
  const [modalModificacionesOpen, setModalModificacionesOpen] = useState(false);
  const [modificacionesRecientes, setModificacionesRecientes] = useState([]);
  const [cargandoModificaciones, setCargandoModificaciones] = useState(false);

  const cargarActividad = async () => {
    setCargando(true);
    try {
      const res = await api.obtenerActividadDiaAnterior();
      if (res && Array.isArray(res.usuarios)) {
        setData(res);
      }
    } catch (err) {
      console.error('Error al cargar actividad del día anterior:', err);
    } finally {
      setCargando(false);
    }
  };

  const cargarResumenModificaciones = async () => {
    if (!puedeVerModif) return;
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
    cargarActividad();
    if (puedeVerModif) {
      cargarResumenModificaciones();
    }

    const handleCatalogos = () => {
      cargarActividad();
      if (puedeVerModif) {
        cargarResumenModificaciones();
      }
    };
    window.addEventListener('catalogos-actualizados', handleCatalogos);
    return () => {
      window.removeEventListener('catalogos-actualizados', handleCatalogos);
    };
  }, [puedeVerModif]);

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

  const formatFechaAyer = (fechaStr) => {
    if (!fechaStr) return '';
    try {
      const [anio, mes, dia] = fechaStr.split('-');
      return `${dia}/${mes}`;
    } catch {
      return fechaStr;
    }
  };

  const listaFiltrada = (data.usuarios || []).filter((item) => {
    if (filtro === 'pendientes' && item.enviado) return false;
    if (filtro === 'enviados' && !item.enviado) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const n = (item.nombre || '').toLowerCase();
      const a = (item.area || '').toLowerCase();
      const m = (item.modalidad || '').toLowerCase();
      if (!n.includes(q) && !a.includes(q) && !m.includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="daily-status-widget-container connected-widget-compact">
      {/* Alerta/Badge sutil de Modificaciones de Auditoría (Exclusivo Justina Bertolozzi e Iván Valentin) */}
      {puedeVerModif && resumenModificaciones && (resumenModificaciones.ultimas_24h > 0 || resumenModificaciones.total_modificaciones > 0) && (
        <div className="audit-modification-banner-compact" onClick={handleVerModificaciones} title="Clic para ver historial de modificaciones">
          <span className="audit-bell-icon">🔔</span>
          <span className="audit-banner-text-compact">
            {resumenModificaciones.ultimas_24h > 0
              ? `${resumenModificaciones.ultimas_24h} modif. en 24h`
              : `${resumenModificaciones.total_modificaciones} registros auditados`}
          </span>
          <span className="audit-link-inline">Ver detalle ›</span>
        </div>
      )}

      {/* Tarjeta Principal del Widget Estilo Usuarios Conectados */}
      <div className="daily-status-card compact-card">
        {/* Cabecera del Widget */}
        <div className="daily-status-header-compact">
          <div className="daily-status-title-box">
            <h4 className="daily-status-title">Actividad de ayer</h4>
            {data.fecha && (
              <span className="daily-status-date-badge">
                {formatFechaAyer(data.fecha)}
              </span>
            )}
          </div>

          <div className="daily-status-header-right">
            <div className="daily-counters-inline">
              <span className="counter-pill-green" title="Enviaron su registro">
                <span className="status-dot-inline green" /> {data.enviados}
              </span>
              <span className="counter-pill-gray" title="Pendientes de registro">
                <span className="status-dot-inline gray" /> {data.pendientes}
              </span>
            </div>

            <button
              type="button"
              className="btn-refresh-compact"
              onClick={cargarActividad}
              disabled={cargando}
              title="Actualizar estado de actividad"
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

        {/* Barra de Filtros y Búsqueda Rápida */}
        <div className="daily-compact-filter-bar">
          <div className="daily-search-box-compact">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Buscar colaborador..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="daily-search-input-compact"
            />
            {busqueda && (
              <button type="button" className="daily-search-clear-compact" onClick={() => setBusqueda('')}>✕</button>
            )}
          </div>

          <div className="daily-filter-pills-compact">
            <button
              type="button"
              className={`pill-btn-compact ${filtro === 'todos' ? 'active' : ''}`}
              onClick={() => setFiltro('todos')}
            >
              Todos ({data.total})
            </button>
            <button
              type="button"
              className={`pill-btn-compact ${filtro === 'pendientes' ? 'active pending' : ''}`}
              onClick={() => setFiltro('pendientes')}
            >
              Pendientes ({data.pendientes})
            </button>
            <button
              type="button"
              className={`pill-btn-compact ${filtro === 'enviados' ? 'active sent' : ''}`}
              onClick={() => setFiltro('enviados')}
            >
              Enviados ({data.enviados})
            </button>
          </div>
        </div>

        {/* Lista con Estilo de Usuarios Conectados */}
        <div className="connected-users-scroll-list">
          {cargando && data.usuarios.length === 0 ? (
            <div className="daily-status-empty-compact">
              <div className="spinner" style={{ width: '18px', height: '18px' }} />
              <span>Consultando actividad...</span>
            </div>
          ) : listaFiltrada.length === 0 ? (
            <div className="daily-status-empty-compact">
              <span>No hay colaboradores para mostrar.</span>
            </div>
          ) : (
            <div className="connected-users-grid">
              {listaFiltrada.map((emp) => {
                const enviado = !!emp.enviado;
                return (
                  <div
                    key={emp.dni || emp.nombre}
                    className={`connected-user-pill ${enviado ? 'status-sent' : 'status-pending'}`}
                    title={`${emp.nombre}${emp.area ? ` (${emp.area})` : ''} • ${enviado ? `Enviado: ${emp.modalidad || ''}` : 'Sin registro cargado ayer'}`}
                  >
                    <div className="connected-avatar-container">
                      <div className="connected-avatar-circle">
                        {getIniciales(emp.nombre)}
                      </div>
                      <span className={`connected-dot ${enviado ? 'dot-green' : 'dot-gray'}`} />
                    </div>

                    <div className="connected-user-text">
                      <div className="connected-user-name-line">
                        <span className="connected-user-name">{emp.nombre}</span>
                        {emp.area && <span className="connected-area-tag">{emp.area}</span>}
                      </div>
                      <span className="connected-user-desc">
                        {enviado ? (
                          <span className="text-desc-sent">
                            ✓ {emp.modalidad || 'Enviado'} {emp.horas > 0 ? `(${emp.horas}h)` : ''}
                          </span>
                        ) : (
                          <span className="text-desc-pending">Sin registro</span>
                        )}
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
      {puedeVerModif && modalModificacionesOpen && (
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
