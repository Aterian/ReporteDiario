// [FN-02.03] Barra superior de navegación y sincronización para historial de colaboradores
import React from 'react';

export default function HistoryTopBar({
  isRpg,
  onVolver,
  onVerMiHistorial,
  puedeVerLiquidacion,
  pendientesCount,
  sincronizando,
  cargando,
  limpiando,
  mensajeSync,
  setMensajeSync,
  ejecutarSincronizacion,
  onRefrescar,
  handleLimpiarLocalYDescargar
}) {
  return (
    <>
      <div className="view-header-bar other-history-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onVolver && (
            <button type="button" className={isRpg ? 'rpg-wood-btn' : 'btn-back'} onClick={onVolver}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>{isRpg ? 'Taberna' : 'Inicio'}</span>
            </button>
          )}

          {onVerMiHistorial && (
            <button type="button" className={isRpg ? 'rpg-wood-btn' : 'btn-action-ghost'} onClick={onVerMiHistorial}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
              <span>{isRpg ? 'Mi Libro' : 'Mi Historial'}</span>
            </button>
          )}

          <div className="other-history-title-block">
            <span className="other-history-title">
              {isRpg ? '🏰 Cuartel General • Crónicas de Aventureros' : 'Panel de Control de Empleados (RRHH)'}
            </span>
            <span className="other-history-subtitle">
              {isRpg
                ? (`📜 Anales de la Compañía • Historial de Aventureros${puedeVerLiquidacion ? ' • Reparto de Botín' : ''}`)
                : (`Auditoría integral de asistencia • Registros de RRHH${puedeVerLiquidacion ? ' • Calculadora de Liquidación' : ''}`)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {pendientesCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="sync-auto-helper" title="La aplicación sincroniza en segundo plano automáticamente">
                <span className="sync-dot-pulse" /> Sincronización automática activa (~3-5s)
              </span>
              <button
                type="button"
                className={isRpg ? 'rpg-wood-btn' : 'btn-sync'}
                onClick={ejecutarSincronizacion}
                disabled={sincronizando}
                title="Sincronizar cambios pendientes inmediatamente con Google Sheets (No requerido: se sincroniza solo)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
                <span>{sincronizando ? 'Enviando...' : (isRpg ? `Sellar Hojas (${pendientesCount})` : `Subir ahora (${pendientesCount})`)}</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : 'btn-refresh'}
            onClick={onRefrescar}
            disabled={cargando || sincronizando || limpiando}
            title="Actualizar registros desde Google Sheets y base local"
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
            {isRpg ? 'Consultar Oráculo' : 'Refrescar'}
          </button>

          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : 'btn-refresh'}
            onClick={handleLimpiarLocalYDescargar}
            disabled={cargando || sincronizando || limpiando}
            title="Eliminar registros locales y descargar directamente desde Google Sheets para evitar duplicados"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={limpiando ? 'spinner' : ''}
            >
              <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            {limpiando ? 'Purgando...' : (isRpg ? 'Purgar Anales' : 'Limpiar')}
          </button>
        </div>
      </div>

      {mensajeSync && (
        <div className={`alert-banner ${mensajeSync.tipo === 'exito' ? 'alert-success' : 'alert-error'}`}>
          <span>{mensajeSync.texto}</span>
          <button type="button" onClick={() => setMensajeSync(null)}>✕</button>
        </div>
      )}
    </>
  );
}
