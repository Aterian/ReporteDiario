import React, { useState, useEffect } from 'react';
import { api } from '../services/apiBridge';

const LUGARES_OPCIONES = ['Oficina', 'Campaña / Campo', 'Home Office', 'Franco'];

// Iconos vectoriales
const QuillIcon = ({ size = 16, color = "#6b4317" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
    <line x1="16" y1="8" x2="2" y2="22" />
    <line x1="17.5" y1="15" x2="9" y2="15" />
  </svg>
);

export default function HistoryView({ onVolver, tema, onNuevoReporte }) {
  const isRpg = tema === 'rpg';
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
    <div className={`view-content ${isRpg ? 'rpg-board-viewport' : ''}`}>
      {isRpg ? (
        /* ===================================================================
           DISEÑO MODO AVENTURA RPG: TABLÓN DE CRÓNICAS HISTÓRICAS DE LA TABERNA
           =================================================================== */
        <div className="rpg-notice-board">
          {/* Esquineros de hierro forjado */}
          <div className="rpg-iron-bracket top-left" />
          <div className="rpg-iron-bracket top-right" />
          <div className="rpg-iron-bracket bottom-left" />
          <div className="rpg-iron-bracket bottom-right" />

          {/* Banner de Pergamino Curvado Superior */}
          <div className="rpg-curved-banner">
            <div className="rpg-banner-scroll-roll left" />
            <div className="rpg-banner-body">
              <div className="rpg-banner-heading-wrap">
                <div className="rpg-illuminated-box">T</div>
                <h1 className="rpg-banner-main-title">OMO DE CRÓNICAS HISTÓRICAS</h1>
              </div>
              <span className="rpg-banner-subtitle">ANALES DEL GREMIO INGEAP • REGISTRO DE HAZAÑAS</span>
            </div>
            <div className="rpg-banner-scroll-roll right" />
          </div>

          {/* Pergamino principal clavado a la madera */}
          <div className="rpg-pinned-parchment parchment-history">
            <div className="rpg-tack tack-tl" />
            <div className="rpg-tack tack-tr" />
            <div className="rpg-tack tack-bl" />
            <div className="rpg-tack tack-br" />

            <div className="parchment-header-row">
              <div className="parchment-title-group">
                <QuillIcon size={16} color="#78350f" />
                <h3 className="parchment-title">CRÓNICAS DE JORNADA</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {pendientesCount > 0 && (
                  <button
                    type="button"
                    className="rpg-wood-btn"
                    onClick={ejecutarSincronizacion}
                    disabled={sincronizando}
                    title="Sincronizar crónicas pendientes con el Pergamino Maestro"
                  >
                    ⚡ Subir ({pendientesCount})
                  </button>
                )}
                <button
                  type="button"
                  className="rpg-wood-btn"
                  onClick={cargarHistorial}
                  disabled={cargando || sincronizando}
                  title="Actualizar anales del gremio"
                >
                  🔄 Refrescar
                </button>
              </div>
            </div>

            {/* Cartel de mensaje de sincronización */}
            {mensajeSync && (
              <div className={`rpg-parchment-alert ${mensajeSync.tipo === 'exito' ? 'rpg-alert-success' : 'rpg-alert-error'}`}>
                <span>{mensajeSync.texto}</span>
                <button type="button" onClick={() => setMensajeSync(null)} className="rpg-alert-close">✕</button>
              </div>
            )}

            {/* Listado de crónicas medievales */}
            {cargando && registros.length === 0 ? (
              <div className="rpg-empty-state">
                <div className="spinner" style={{ width: '28px', height: '28px' }} />
                <span>Consultando pergaminos del archivo real...</span>
              </div>
            ) : registros.length === 0 ? (
              <div className="rpg-empty-state">
                <span style={{ fontSize: '28px' }}>📜</span>
                <span>Aún no se han asentado crónicas en este tomo de aventuras.</span>
              </div>
            ) : (
              <div className="rpg-history-list">
                {registros.map((item) => {
                  const horasDisplay = item.horas > 0 ? `${item.horas} hs` : (item.jornada || 'Franco');
                  const lugarDisplay = item.tipo_ocf || item.lugar || 'Oficina';
                  const estaSincronizado = item.sincronizado === 1;

                  const getIconoLugar = (l) => {
                    if (l.includes('Oficina')) return '🏰';
                    if (l.includes('Home') || l.includes('Torre')) return '🧙‍♂️';
                    if (l.includes('Campaña') || l.includes('Expedición')) return '🌲';
                    if (l.includes('Franco') || l.includes('Taberna')) return '🍺';
                    return '📍';
                  };

                  return (
                    <div key={item.id} className="rpg-history-entry">
                      <div className="rpg-entry-top">
                        <span className="rpg-entry-date">
                          📅 {item.fecha} {item.dia_semana ? `(${item.dia_semana})` : ''}
                        </span>
                        <div className="rpg-entry-badges">
                          <span className={`rpg-sync-stamp ${estaSincronizado ? 'synced' : 'pending'}`}>
                            {estaSincronizado ? '✓ Sellado' : '⏳ Pendiente'}
                          </span>
                        </div>
                      </div>

                      <div className="rpg-entry-main">
                        <div className="rpg-entry-service">
                          <span className="rpg-entry-icon">⚔️</span>
                          <span className="rpg-entry-name">{item.servicio || 'Misión del Gremio'}</span>
                        </div>
                        <div className="rpg-entry-details">
                          <span className="rpg-entry-lugar">{getIconoLugar(lugarDisplay)} {lugarDisplay}</span>
                          <span className="rpg-entry-hours">⌛ {horasDisplay}</span>
                        </div>
                      </div>

                      <div className="rpg-entry-footer">
                        <button
                          type="button"
                          className="rpg-btn-edit-entry"
                          onClick={() => setRegistroEditando(item)}
                        >
                          ✎ Enmendar Acta
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Viga de madera tallada inferior */}
          <div className="rpg-wood-bottom-bar">
            <button type="button" className="rpg-wood-btn" onClick={onVolver}>
              ↩ Volver al Tablón
            </button>
            <div style={{ display: 'flex', gap: '6px' }}>
              {pendientesCount > 0 && (
                <button type="button" className="rpg-wood-btn active" onClick={ejecutarSincronizacion} disabled={sincronizando}>
                  ⚡ Sincronizar ({pendientesCount})
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ===================================================================
           DISEÑO ESTÁNDAR CLARO / OSCURO
           =================================================================== */
        <>
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
                          <span style={{ marginLeft: '4px', fontSize: '9px', background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', padding: '1px 4px', borderRadius: '4px' }}>
                            Feriado
                          </span>
                        )}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`status-badge ${estaSincronizado ? 'status-synced' : 'status-pending'}`}>
                          {estaSincronizado ? (
                            <>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Sincronizado
                            </>
                          ) : (
                            <>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 14 14" />
                              </svg>
                              Pendiente
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="history-card-body">
                      <div className="history-info-row">
                        <span className="history-info-label">Lugar:</span>
                        <span className="history-info-value">{lugarDisplay}</span>
                      </div>
                      <div className="history-info-row">
                        <span className="history-info-label">Tarea / Proyecto:</span>
                        <span className="history-info-value">{item.servicio || 'Dedicado al área'}</span>
                      </div>
                      <div className="history-info-row">
                        <span className="history-info-label">Horas registradas:</span>
                        <span className="history-info-value" style={{ fontWeight: 700 }}>{horasDisplay}</span>
                      </div>
                    </div>

                    <div className="history-card-footer">
                      <button
                        type="button"
                        className="btn-edit-record"
                        onClick={() => setRegistroEditando(item)}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Modificar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal de Modificación de Registro */}
      {registroEditando && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isRpg ? 'rgba(0, 0, 0, 0.85)' : 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className={isRpg ? 'rpg-modal-parchment' : ''} style={{
            background: isRpg ? '#f5e4bf' : 'var(--bg-surface)',
            color: isRpg ? '#2b1d0c' : 'var(--text-primary)',
            borderRadius: isRpg ? '6px' : '12px',
            width: '100%',
            maxWidth: '380px',
            padding: '18px',
            boxShadow: isRpg ? '0 12px 35px rgba(0,0,0,0.9), inset 0 0 25px rgba(184, 137, 72, 0.2)' : 'var(--shadow-lg)',
            border: isRpg ? '2px solid #8c6a38' : '1px solid var(--border-input)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            position: 'relative'
          }}>
            {isRpg && (
              <>
                <div className="rpg-tack tack-tl" />
                <div className="rpg-tack tack-tr" />
                <div className="rpg-tack tack-bl" />
                <div className="rpg-tack tack-br" />
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: isRpg ? '1px dashed #8c6a38' : '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: isRpg ? 'Cinzel, serif' : 'inherit', color: isRpg ? '#3b220c' : 'var(--text-primary)' }}>
                {isRpg ? '📜 Enmendar Acta de Misión' : 'Modificar Registro'}
              </span>
              <button
                type="button"
                onClick={() => setRegistroEditando(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: isRpg ? '#6b4317' : 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarModificacion} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: isRpg ? '#6b4317' : 'var(--text-secondary)', display: 'block', marginBottom: '3px', fontFamily: isRpg ? 'Cinzel, serif' : 'inherit' }}>
                  Fecha:
                </label>
                <input
                  type="date"
                  className={isRpg ? 'form-input-clean' : 'form-input'}
                  value={registroEditando.fecha || ''}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, fecha: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: isRpg ? '#6b4317' : 'var(--text-secondary)', display: 'block', marginBottom: '3px', fontFamily: isRpg ? 'Cinzel, serif' : 'inherit' }}>
                  Ubicación / Modalidad:
                </label>
                <select
                  className={isRpg ? 'form-select-clean' : 'form-select'}
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
                <label style={{ fontSize: '11px', fontWeight: 600, color: isRpg ? '#6b4317' : 'var(--text-secondary)', display: 'block', marginBottom: '3px', fontFamily: isRpg ? 'Cinzel, serif' : 'inherit' }}>
                  Proyecto o Tarea:
                </label>
                <input
                  type="text"
                  className={isRpg ? 'form-input-clean' : 'form-input'}
                  value={registroEditando.servicio || ''}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: isRpg ? '#6b4317' : 'var(--text-secondary)', display: 'block', marginBottom: '3px', fontFamily: isRpg ? 'Cinzel, serif' : 'inherit' }}>
                  Horas:
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className={isRpg ? 'form-input-clean' : 'form-input'}
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
                    border: isRpg ? '1px solid #8c6a38' : '1px solid var(--border-input)',
                    background: isRpg ? 'rgba(184, 137, 72, 0.2)' : 'var(--bg-surface-hover)',
                    color: isRpg ? '#3b220c' : 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: isRpg ? 'Cinzel, serif' : 'inherit',
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
                    border: isRpg ? '1px solid #b91c1c' : 'none',
                    background: isRpg ? 'linear-gradient(135deg, #991b1b, #881337)' : 'var(--primary)',
                    color: isRpg ? '#fef3c7' : '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: isRpg ? 'Cinzel, serif' : 'inherit',
                    cursor: 'pointer'
                  }}
                >
                  {guardandoEdicion ? 'Guardando...' : (isRpg ? '📜 Sellar Acta' : 'Guardar Cambios')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
