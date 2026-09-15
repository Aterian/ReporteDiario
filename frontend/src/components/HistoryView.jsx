import React, { useState, useEffect } from 'react';
import { api } from '../services/apiBridge';

const LUGARES_OPCIONES = ['Oficina', 'Campaña / Campo', 'Home Office', 'Franco'];

export default function HistoryView({ onVolver }) {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeSync, setMensajeSync] = useState(null);

  // Estado para la edición de registros
  const [registroEditando, setRegistroEditando] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [serviciosDisponibles, setServiciosDisponibles] = useState([]);

  const cargarHistorial = async () => {
    setCargando(true);
    try {
      const data = await api.obtenerHistorial();
      if (Array.isArray(data)) {
        setRegistros(data);
      }
    } catch (err) {
      console.error('Error al cargar historial:', err);
    } finally {
      setCargando(false);
    }
  };

  const ejecutarSincronizacion = async () => {
    setSincronizando(true);
    setMensajeSync(null);
    try {
      const res = await api.sincronizarSheets();
      if (res && res.exito) {
        setMensajeSync({ tipo: 'exito', texto: res.mensaje || 'Sincronizado correctamente con Google Sheets.' });
        await cargarHistorial();
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

  useEffect(() => {
    cargarHistorial();
    async function cargarServicios() {
      try {
        const s = await api.obtenerServicios('TODOS');
        if (Array.isArray(s)) setServiciosDisponibles(s);
      } catch (e) {
        console.error('Error al obtener servicios para modal:', e);
      }
    }
    cargarServicios();
  }, []);

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
        horas: Number(registroEditando.horas) || 0
      });

      if (res && res.exito) {
        setMensajeSync({ tipo: 'exito', texto: 'Reporte modificado y programado para sincronización.' });
        setRegistroEditando(null);
        await cargarHistorial();
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

  const pendientesCount = registros.filter((r) => r.sincronizado === 0).length;

  return (
    <div className="view-content">
      {onVolver && (
        <div className="view-header-bar">
          <button type="button" className="btn-back" onClick={onVolver}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Inicio</span>
          </button>
          <span className="view-header-title">Historial de Registros</span>
        </div>
      )}

      <div className="history-header">
        <span className="history-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 14 14" />
          </svg>
          Últimos Reportes
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {pendientesCount > 0 && (
            <button
              type="button"
              className="btn-sync-action"
              onClick={ejecutarSincronizacion}
              disabled={sincronizando}
              title="Sincronizar reportes pendientes con Google Sheets"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={sincronizando ? 'spinner' : ''}
              >
                <path d="M21 2v6h-6" />
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
            onClick={cargarHistorial}
            disabled={cargando || sincronizando}
            title="Actualizar lista"
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
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '11px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: mensajeSync.tipo === 'exito' ? '#f0fdf4' : '#fef2f2',
            color: mensajeSync.tipo === 'exito' ? '#166534' : '#991b1b',
            border: `1px solid ${mensajeSync.tipo === 'exito' ? '#bbf7d0' : '#fecaca'}`
          }}
        >
          <span>{mensajeSync.texto}</span>
          <button
            type="button"
            onClick={() => setMensajeSync(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {cargando && registros.length === 0 ? (
        <div className="empty-state">
          <div className="spinner" style={{ width: '28px', height: '28px' }} />
          <span className="empty-text">Cargando reportes guardados...</span>
        </div>
      ) : registros.length === 0 ? (
        <div className="empty-state">
          <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          <span className="empty-text">Aún no hay reportes registrados en este equipo.</span>
        </div>
      ) : (
        <div className="history-list">
          {registros.map((item) => {
            const horasDisplay = item.horas > 0 ? `${item.horas} hs` : (item.jornada || 'Franco');
            const lugarDisplay = item.tipo_ocf || item.lugar || 'Oficina';
            const estaSincronizado = item.sincronizado === 1;

            return (
              <div key={item.id} className="history-card">
                <div className="history-card-top">
                  <span className="history-date">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    {item.fecha}
                    {item.dia_semana ? ` (${item.dia_semana})` : ''}
                    {item.feriado === 'SI' && (
                      <span style={{ marginLeft: '4px', fontSize: '9px', background: '#fee2e2', color: '#991b1b', padding: '1px 4px', borderRadius: '4px' }}>
                        Feriado
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="history-badge-jornada">
                      {horasDisplay}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRegistroEditando({ ...item })}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        color: '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                      title="Modificar este registro"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Editar
                    </button>
                  </div>
                </div>

                <div className="history-service">
                  {item.servicio}
                </div>

                <div className="history-card-bottom">
                  <span className="history-lugar">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {lugarDisplay}
                  </span>

                  <span className={`history-sync-status ${estaSincronizado ? 'synced' : 'pending'}`}>
                    {estaSincronizado ? (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Sheets
                      </>
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 14 14" />
                        </svg>
                        Pendiente
                      </>
                    )}
                  </span>
                </div>

                {item.usuario_mail && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', borderTop: '1px dashed #f1f5f9', paddingTop: '4px' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span>{item.usuario_mail}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL PARA MODIFICAR REGISTRO ANTERIOR */}
      {registroEditando && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '380px',
            padding: '18px',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-input)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Modificar Registro
              </span>
              <button
                type="button"
                onClick={() => setRegistroEditando(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarModificacion} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '3px' }}>
                  Fecha:
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={registroEditando.fecha || ''}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, fecha: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '3px' }}>
                  Ubicación / Modalidad:
                </label>
                <select
                  className="form-select"
                  value={registroEditando.tipo_ocf || registroEditando.lugar || 'Oficina'}
                  onChange={(e) => {
                    const nuevoLugar = e.target.value;
                    setRegistroEditando({
                      ...registroEditando,
                      tipo_ocf: nuevoLugar,
                      lugar: nuevoLugar,
                      horas: nuevoLugar === 'Franco' ? 0 : (registroEditando.horas || 8)
                    });
                  }}
                >
                  {LUGARES_OPCIONES.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '3px' }}>
                  Proyecto o Tarea:
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={registroEditando.servicio || ''}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '3px' }}>
                  Horas:
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="form-input"
                  value={registroEditando.horas ?? 8}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, horas: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setRegistroEditando(null)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-input)',
                    background: 'var(--bg-surface-hover)',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
