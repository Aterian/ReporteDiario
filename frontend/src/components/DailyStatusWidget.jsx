import React, { useState, useEffect, useContext } from 'react';
import { api } from '../services/apiBridge';
import { puedeVerModificaciones } from '../utils/permissions';
import { toast } from 'sonner';

import { DesktopActivityContext } from '../services/desktopState';

// [FN-06.02] Widget de Actividad de Ayer (Estilo Usuarios Conectados)
export default function DailyStatusWidget({ usuario }) {
  const activo = useContext(DesktopActivityContext);
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
  const [filtroModif, setFiltroModif] = useState('pendientes'); // 'pendientes' | 'todas'
  const [seleccionadasModal, setSeleccionadasModal] = useState(new Set());
  const [marcandoLote, setMarcandoLote] = useState(false);

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
    if (!activo) return;
    cargarActividad();
    if (puedeVerModif) {
      cargarResumenModificaciones();
    }

    let debounceTimer = null;
    const handleCatalogos = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        cargarActividad();
        if (puedeVerModif) {
          cargarResumenModificaciones();
        }
      }, 200);
    };
    window.addEventListener('catalogos-actualizados', handleCatalogos);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('catalogos-actualizados', handleCatalogos);
    };
  }, [puedeVerModif, activo]);

  const cargarModificacionesModal = async () => {
    setCargandoModificaciones(true);
    try {
      const lista = await api.obtenerModificacionesRecientes(60);
      if (Array.isArray(lista)) {
        setModificacionesRecientes(lista);
      }
    } catch (err) {
      console.error('Error al cargar lista de modificaciones:', err);
    } finally {
      setCargandoModificaciones(false);
    }
  };

  const handleVerModificaciones = async () => {
    setModalModificacionesOpen(true);
    setSeleccionadasModal(new Set());
    setFiltroModif('pendientes');
    await cargarModificacionesModal();
  };

  const handleMarcarIndividual = async (idModificacion) => {
    if (!idModificacion) return;
    setModificacionesRecientes(prev =>
      prev.map(m => m.id_modificacion === idModificacion ? { ...m, revisado: 1 } : m)
    );
    setSeleccionadasModal(prev => {
      const next = new Set(prev);
      next.delete(idModificacion);
      return next;
    });
    try {
      const res = await api.marcarModificacionRevisada(idModificacion);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudo marcar la modificación');
        await cargarModificacionesModal();
      } else {
        toast.success('Modificación marcada como revisada.');
        cargarResumenModificaciones();
      }
    } catch (err) {
      toast.error('Error de comunicación');
      await cargarModificacionesModal();
    }
  };

  const handleMarcarSeleccionadas = async () => {
    if (seleccionadasModal.size === 0) return;
    const ids = Array.from(seleccionadasModal);
    const idsSet = new Set(ids);
    setMarcandoLote(true);
    setModificacionesRecientes(prev =>
      prev.map(m => idsSet.has(m.id_modificacion) ? { ...m, revisado: 1 } : m)
    );
    setSeleccionadasModal(new Set());
    try {
      const res = await api.marcarModificacionesRevisadasLote(ids);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron marcar las modificaciones');
        await cargarModificacionesModal();
      } else {
        toast.success(`${res.afectados || ids.length} modificación(es) marcada(s) como revisada(s).`);
        cargarResumenModificaciones();
      }
    } catch (err) {
      toast.error('Error de comunicación');
      await cargarModificacionesModal();
    } finally {
      setMarcandoLote(false);
    }
  };

  const handleMarcarTodas = async () => {
    setMarcandoLote(true);
    setModificacionesRecientes(prev => prev.map(m => ({ ...m, revisado: 1 })));
    setSeleccionadasModal(new Set());
    try {
      const res = await api.marcarTodasModificacionesRevisadas();
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron marcar las modificaciones');
        await cargarModificacionesModal();
      } else {
        toast.success(`Se marcaron ${res.actualizados || 'todas las'} modificaciones como revisadas.`);
        cargarResumenModificaciones();
      }
    } catch (err) {
      toast.error('Error de comunicación');
      await cargarModificacionesModal();
    } finally {
      setMarcandoLote(false);
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
      {puedeVerModif && resumenModificaciones && (resumenModificaciones.ultimas_24h > 0 || resumenModificaciones.total_modificaciones > 0 || resumenModificaciones.no_revisadas > 0) && (
        <div className="audit-modification-banner-compact" onClick={handleVerModificaciones} title="Clic para ver historial de modificaciones">
          <span className="audit-bell-icon">🔔</span>
          <span className="audit-banner-text-compact">
            {resumenModificaciones.no_revisadas > 0
              ? `${resumenModificaciones.no_revisadas} pendiente(s) de revisión`
              : (resumenModificaciones.ultimas_24h > 0
                ? `${resumenModificaciones.ultimas_24h} modif. en 24h`
                : `${resumenModificaciones.total_modificaciones} registros auditados`)}
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
      {puedeVerModif && modalModificacionesOpen && (() => {
        const pendientesLista = modificacionesRecientes.filter(m => !m.revisado);
        const listaModifFiltrada = modificacionesRecientes.filter(m => {
          if (filtroModif === 'pendientes') return !m.revisado;
          return true;
        });
        const pendientesVisibles = listaModifFiltrada.filter(m => !m.revisado);

        return (
          <div className="modal-backdrop">
            <div className="modal-box" style={{ maxWidth: '680px', width: '92%' }}>
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

              {/* Filtros de Pestañas y Acciones Masivas */}
              <div className="modal-audit-filter-bar">
                <div className="daily-filter-pills-compact">
                  <button
                    type="button"
                    className={`pill-btn-compact ${filtroModif === 'pendientes' ? 'active pending' : ''}`}
                    onClick={() => setFiltroModif('pendientes')}
                  >
                    Pendientes ({pendientesLista.length})
                  </button>
                  <button
                    type="button"
                    className={`pill-btn-compact ${filtroModif === 'todas' ? 'active' : ''}`}
                    onClick={() => setFiltroModif('todas')}
                  >
                    Todas ({modificacionesRecientes.length})
                  </button>
                </div>

                {pendientesVisibles.length > 0 && (
                  <div className="modal-audit-bulk-actions">
                    <label className="modal-audit-select-all">
                      <input
                        type="checkbox"
                        checked={
                          pendientesVisibles.length > 0 &&
                          pendientesVisibles.every(m => seleccionadasModal.has(m.id_modificacion))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const pendIds = pendientesVisibles.map(m => m.id_modificacion);
                            setSeleccionadasModal(new Set(pendIds));
                          } else {
                            setSeleccionadasModal(new Set());
                          }
                        }}
                      />
                      <span>Seleccionar</span>
                    </label>

                    {seleccionadasModal.size > 0 && (
                      <button
                        type="button"
                        className="btn-modal-mark-selected"
                        onClick={handleMarcarSeleccionadas}
                        disabled={marcandoLote}
                      >
                        ✓ Revisar seleccionadas ({seleccionadasModal.size})
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn-modal-mark-all"
                      onClick={handleMarcarTodas}
                      disabled={marcandoLote}
                      title="Marcar todas las modificaciones como revisadas"
                    >
                      ✓ Marcar todas
                    </button>
                  </div>
                )}
              </div>

              <div className="modal-body" style={{ maxHeight: '420px', overflowY: 'auto', padding: '14px' }}>
                {cargandoModificaciones ? (
                  <div style={{ padding: '30px', textAlign: 'center' }}>
                    <div className="spinner" style={{ width: '24px', height: '24px', margin: '0 auto 8px' }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Cargando auditoría...</span>
                  </div>
                ) : listaModifFiltrada.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {filtroModif === 'pendientes'
                      ? 'No hay modificaciones pendientes de revisión en este momento.'
                      : 'No se han registrado modificaciones en el sistema hasta el momento.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {listaModifFiltrada.map((mod) => (
                      <div
                        key={mod.id_modificacion || mod.id}
                        className={`modal-audit-card-item ${mod.revisado ? 'item-reviewed' : 'item-pending'} ${seleccionadasModal.has(mod.id_modificacion) ? 'selected' : ''}`}
                      >
                        <div className="modal-audit-card-top">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            {!mod.revisado && (
                              <input
                                type="checkbox"
                                checked={seleccionadasModal.has(mod.id_modificacion)}
                                onChange={(e) => {
                                  setSeleccionadasModal(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(mod.id_modificacion);
                                    else next.delete(mod.id_modificacion);
                                    return next;
                                  });
                                }}
                                title="Seleccionar para marcar en lote"
                              />
                            )}
                            <span className={`modal-audit-status-badge ${mod.revisado ? 'badge-reviewed' : 'badge-pending'}`}>
                              {mod.revisado ? '✓ Revisado' : '⏳ Pendiente'}
                            </span>
                            <strong style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {mod.quien_modifica || 'Usuario autenticado'}
                            </strong>
                            {mod.empleado && (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                sobre <strong>{mod.empleado}</strong>
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {mod.fecha_hora_modificaciones || mod.fecha_hora || ''}
                            </span>
                            {!mod.revisado && (
                              <button
                                type="button"
                                className="btn-modal-item-dismiss"
                                onClick={() => handleMarcarIndividual(mod.id_modificacion)}
                                title="Marcar como revisada esta modificación"
                              >
                                ✓ Revisar
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--bg-app)', padding: '6px 8px', borderRadius: '6px', marginTop: '6px' }}>
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
        );
      })()}
    </div>
  );
}
