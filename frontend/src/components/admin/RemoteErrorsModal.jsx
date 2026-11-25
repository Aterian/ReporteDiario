// [FN-07.21] RemoteErrorsModal — Panel de Auditoría y Resolución de Errores Remotos del Sistema
import React, { useState } from 'react';

export default function RemoteErrorsModal({
  isOpen,
  onClose,
  errores = [],
  onMarcarResuelto,
  onMarcarTodosResueltos,
  cargando = false
}) {
  const [expandidos, setExpandidos] = useState({});

  if (!isOpen) return null;

  const toggleExpandir = (id) => {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatearFechaHora = (fechaIso) => {
    if (!fechaIso) return '-';
    try {
      const d = new Date(fechaIso);
      return d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return String(fechaIso);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
      <div 
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden shadow-2xl border"
        style={{
          background: 'var(--bg-secondary, #1e293b)',
          borderColor: 'var(--border-color, #334155)',
          color: 'var(--text-primary, #f8fafc)'
        }}
      >
        {/* Encabezado */}
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-color, #334155)' }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚨</span>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary, #f8fafc)' }}>
                Auditoría de Errores Remotos
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                  {errores.length} {errores.length === 1 ? 'pendiente' : 'pendientes'}
                </span>
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
                Registro de fallos capturados en clientes de usuarios para diagnóstico técnico centralizado
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {errores.length > 0 && (
              <button
                type="button"
                onClick={onMarcarTodosResueltos}
                disabled={cargando}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                style={{ cursor: cargando ? 'not-allowed' : 'pointer' }}
                title="Marcar todos los errores listados como resueltos"
              >
                ✓ Marcar todos resueltos
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-lg text-lg leading-none"
              title="Cerrar modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Lista de Errores */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errores.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-2">🎉</span>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary, #f8fafc)' }}>
                No hay errores remotos pendientes
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
                Todos los incidentes técnicos reportados han sido resueltos.
              </p>
            </div>
          ) : (
            errores.map((err) => {
              const expandido = !!expandidos[err.id_error];
              return (
                <div
                  key={err.id_error}
                  className="rounded-lg border p-4 transition-all"
                  style={{
                    background: 'var(--bg-primary, #0f172a)',
                    borderColor: 'var(--border-color, #334155)'
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-800/40">
                          {err.codigo_error || 'ERROR_SISTEMA'}
                        </span>
                        <span className="text-gray-300 font-semibold">
                          👤 {err.usuario_nombre || err.nombre_usuario || 'Sesión no iniciada'}
                        </span>
                        {err.rol_usuario && (
                          <span className="text-gray-400">({err.rol_usuario})</span>
                        )}
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-400 font-mono text-[11px]">
                          {formatearFechaHora(err.fecha_hora)}
                        </span>
                        {err.equipo_info && (
                          <span className="text-gray-500 font-mono text-[10px]">
                            💻 {err.equipo_info}
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary, #f8fafc)' }}>
                        {err.accion_metodo ? `[${err.accion_metodo}] ` : ''}{err.mensaje_error}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {err.detalle_tecnico && (
                        <button
                          type="button"
                          onClick={() => toggleExpandir(err.id_error)}
                          className="px-2.5 py-1 text-xs rounded border border-gray-600 hover:bg-gray-700/50 text-gray-300 transition-colors"
                        >
                          {expandido ? 'Ocultar Stack' : 'Ver Stack'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onMarcarResuelto(err.id_error)}
                        disabled={cargando}
                        className="px-3 py-1 text-xs font-semibold rounded bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
                        title="Marcar error como resuelto"
                      >
                        ✓ Resuelto
                      </button>
                    </div>
                  </div>

                  {expandido && err.detalle_tecnico && (
                    <div className="mt-3 pt-3 border-t border-gray-700/60">
                      <div className="text-xs font-semibold text-gray-400 mb-1">Detalle Técnico / Stack Trace:</div>
                      <pre className="text-[11px] font-mono p-3 rounded bg-black/60 text-red-300 overflow-x-auto whitespace-pre-wrap max-h-48">
                        {err.detalle_tecnico}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pie de modal */}
        <div className="px-6 py-3 border-t flex justify-end" style={{ borderColor: 'var(--border-color, #334155)' }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
