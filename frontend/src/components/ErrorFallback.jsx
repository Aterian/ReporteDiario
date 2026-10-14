// [FN-00.03] ErrorFallback Component for react-error-boundary
import React, { useState } from 'react';

export default function ErrorFallback({ error, resetErrorBoundary }) {
  const [mostrarDetalles, setMostrarDetalles] = useState(false);

  const handleRecargar = () => {
    window.location.reload();
  };

  return (
    <div className="error-boundary-container error-fallback-backdrop" role="alert" aria-live="assertive">
      <div className="error-boundary-card error-fallback-card">
        {/* Icono de advertencia corporativo */}
        <div className="error-boundary-icon error-fallback-icon-wrap" aria-hidden="true">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h2 className="error-boundary-title error-fallback-title">Ocurrió un error en esta vista</h2>
        <p className="error-boundary-desc error-fallback-subtitle">
          La aplicación detectó una inconsistencia de renderizado. Tus datos guardados permanecen intactos.
        </p>

        {/* Sección de detalles técnicos colapsables */}
        <div className="error-fallback-details-wrapper">
          <button
            type="button"
            className="error-fallback-toggle-btn"
            onClick={() => setMostrarDetalles(!mostrarDetalles)}
            aria-expanded={mostrarDetalles}
          >
            <span>{mostrarDetalles ? '▲ Ocultar detalle técnico' : '▼ Ver detalle del error'}</span>
          </button>

          {mostrarDetalles && (
            <div className="error-boundary-details error-fallback-code-box">
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                {error?.message || (typeof error === 'string' ? error : JSON.stringify(error, null, 2))}
              </pre>
            </div>
          )}
        </div>

        {/* Acciones de recuperación con accesibilidad táctil >= 44px */}
        <div className="error-boundary-actions error-fallback-actions">
          <button
            type="button"
            className="btn-error-primary touch-target"
            onClick={resetErrorBoundary}
            title="Intenta recuperar y volver a renderizar la vista"
          >
            🔄 Reintentar Vista
          </button>
          <button
            type="button"
            className="btn-error-secondary touch-target"
            onClick={handleRecargar}
            title="Recarga completamente la ventana de la aplicación"
          >
            ⟳ Recargar Aplicación
          </button>
        </div>
      </div>
    </div>
  );
}
