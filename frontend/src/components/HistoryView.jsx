import React, { useState, useEffect } from 'react';
import { api } from '../services/apiBridge';

export default function HistoryView({ onVolver }) {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeSync, setMensajeSync] = useState(null);

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
      setMensajeSync({ tipo: 'error', texto: 'Error de red o comunicación con Google Sheets.' });
    } finally {
      setSincronizando(false);
    }
  };

  useEffect(() => {
    cargarHistorial();
  }, []);

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
                  </span>
                  <span className="history-badge-jornada">
                    {horasDisplay}
                  </span>
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
    </div>
  );
}
