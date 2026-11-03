// [MOD-10] [FN-07.18] Módulo de Supervisión y Registro de Errores Remotos (Exclusivo Administradores)
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';
import { esAdmin, getEtiquetaRol } from '../utils/permissions';

export default function RemoteErrorsView({ usuario, onVolver, tema }) {
  const isDark = tema === 'dark';
  const isRpg = tema === 'rpg';
  const esAutorizado = esAdmin(usuario);

  const [errores, setErrores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('pendientes'); // 'pendientes' | 'resueltos' | 'todos'
  const [filtroOrigen, setFiltroOrigen] = useState('todos'); // 'todos' | 'frontend' | 'backend'
  const [filtroCodigo, setFiltroCodigo] = useState('todos');

  // Modal de Detalle Técnico / Stack Trace
  const [errorSeleccionado, setErrorSeleccionado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  // Estados de acción
  const [resolviendoId, setResolviendoId] = useState(null);
  const [resolviendoTodos, setResolviendoTodos] = useState(false);
  const [modalConfirmarTodos, setModalConfirmarTodos] = useState(false);
  const [mensajeFeedback, setMensajeFeedback] = useState(null);

  const cargarErrores = async () => {
    setCargando(true);
    setMensajeFeedback(null);
    try {
      // Cargamos tanto pendientes como resueltos (solo_pendientes = false para alimentar los filtros)
      const data = await api.obtenerErroresRemotos(false, 300);
      if (Array.isArray(data)) {
        setErrores(data);
      } else if (data?.datos && Array.isArray(data.datos)) {
        setErrores(data.datos);
      }
    } catch (err) {
      console.error('Error al consultar el registro de errores remotos:', err);
      setMensajeFeedback({ tipo: 'error', texto: 'No se pudo cargar el registro de errores remotos.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (esAutorizado) {
      cargarErrores();
    }
  }, [esAutorizado]);

  // Lista única de códigos de error presentes en los datos
  const codigosDisponibles = useMemo(() => {
    const setCodigos = new Set();
    errores.forEach(e => {
      if (e.codigo_error) setCodigos.add(e.codigo_error);
    });
    return Array.from(setCodigos).sort();
  }, [errores]);

  // Métricas / KPIs
  const kpis = useMemo(() => {
    const total = errores.length;
    const pendientes = errores.filter(e => !e.resuelto).length;
    const resueltos = total - pendientes;
    const tasa = total > 0 ? Math.round((resueltos / total) * 100) : 100;
    return { total, pendientes, resueltos, tasa };
  }, [errores]);

  // Filtrado de la lista
  const erroresFiltrados = useMemo(() => {
    return errores.filter(item => {
      // Filtro de Estado
      if (filtroEstado === 'pendientes' && item.resuelto) return false;
      if (filtroEstado === 'resueltos' && !item.resuelto) return false;

      // Filtro de Origen
      if (filtroOrigen !== 'todos' && String(item.origen || '').toLowerCase() !== filtroOrigen) {
        return false;
      }

      // Filtro de Código
      if (filtroCodigo !== 'todos' && item.codigo_error !== filtroCodigo) {
        return false;
      }

      // Búsqueda por texto
      if (busqueda) {
        const q = busqueda.toLowerCase().trim();
        const usr = String(item.nombre_usuario || '').toLowerCase();
        const msg = String(item.mensaje_error || '').toLowerCase();
        const cod = String(item.codigo_error || '').toLowerCase();
        const met = String(item.accion_metodo || '').toLowerCase();
        const det = String(item.detalle_tecnico || '').toLowerCase();
        if (!usr.includes(q) && !msg.includes(q) && !cod.includes(q) && !met.includes(q) && !det.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [errores, filtroEstado, filtroOrigen, filtroCodigo, busqueda]);

  // Resolver error individual
  const handleResolverError = async (idError) => {
    setResolviendoId(idError);
    try {
      const res = await api.marcarErrorRemotoResuelto(idError, false);
      if (res && res.exito) {
        setErrores(prev => prev.map(e => (e.id_error === idError ? { ...e, resuelto: true } : e)));
        if (errorSeleccionado?.id_error === idError) {
          setErrorSeleccionado(prev => (prev ? { ...prev, resuelto: true } : null));
        }
        setMensajeFeedback({ tipo: 'exito', texto: 'Error marcado como resuelto.' });
      } else {
        setMensajeFeedback({ tipo: 'error', texto: res?.error || 'No se pudo resolver el error.' });
      }
    } catch (err) {
      console.error(err);
      setMensajeFeedback({ tipo: 'error', texto: 'Error de conexión al marcar como resuelto.' });
    } finally {
      setResolviendoId(null);
    }
  };

  // Resolver todos los errores pendientes
  const handleConfirmarResolverTodos = async () => {
    setResolviendoTodos(true);
    try {
      const res = await api.marcarErrorRemotoResuelto(null, true);
      if (res && res.exito) {
        setErrores(prev => prev.map(e => ({ ...e, resuelto: true })));
        setModalConfirmarTodos(false);
        setMensajeFeedback({ tipo: 'exito', texto: `Se marcaron como resueltos ${res.afectados || 'todos los'} errores pendientes.` });
      } else {
        setMensajeFeedback({ tipo: 'error', texto: res?.error || 'No se pudieron resolver los errores.' });
      }
    } catch (err) {
      console.error(err);
      setMensajeFeedback({ tipo: 'error', texto: 'Error de conexión al resolver los errores.' });
    } finally {
      setResolviendoTodos(false);
    }
  };

  // Exportar lista de errores a archivo descargable (.json)
  const handleExportarErrores = () => {
    try {
      const datosExport = erroresFiltrados.map(e => ({
        id: e.id_error,
        fecha_hora: e.fecha_hora,
        origen: e.origen,
        codigo_error: e.codigo_error,
        metodo: e.accion_metodo,
        usuario: e.nombre_usuario,
        rol: e.rol_usuario,
        equipo_info: e.equipo_info,
        mensaje_error: e.mensaje_error,
        detalle_tecnico: e.detalle_tecnico,
        resuelto: e.resuelto
      }));

      const jsonStr = JSON.stringify(datosExport, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const fechaHoy = new Date().toISOString().split('T')[0];
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `log_errores_remotos_${fechaHoy}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMensajeFeedback({
        tipo: 'exito',
        texto: `Exportados exitosamente ${datosExport.length} registros de error a archivo JSON.`
      });
    } catch (err) {
      console.error('Error al exportar errores:', err);
      setMensajeFeedback({ tipo: 'error', texto: 'No se pudo generar el archivo de exportación.' });
    }
  };

  // Copiar detalle técnico al portapapeles
  const handleCopiarDetalle = (texto) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }).catch(err => {
      console.error('Error al copiar al portapapeles:', err);
    });
  };

  if (!esAutorizado) {
    return (
      <div className="view-content" style={{ padding: '32px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          🔒 El módulo de Errores Remotos es exclusivo para usuarios con rol de Administrador.
        </p>
        <button type="button" className="btn-back" onClick={onVolver}>
          Volver al Inicio
        </button>
      </div>
    );
  }

  return (
    <div className={`view-content ${isRpg ? 'history-rpg-container' : ''}`} style={{ maxWidth: '1360px', margin: '0 auto', padding: '16px' }}>
      {/* Barra de cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="btn-back"
            onClick={onVolver}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', minWidth: '44px', padding: '8px 16px', borderRadius: '6px' }}
          >
            ← Volver
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              🛠️ Log Centralizado de Errores Remotos
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Diagnóstico y auditoría de excepciones no controladas capturadas en clientes y backend
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={cargarErrores}
            disabled={cargando}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              background: 'var(--card-bg, #1e293b)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color, #334155)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔄 {cargando ? 'Cargando...' : 'Actualizar'}
          </button>

          <button
            type="button"
            onClick={handleExportarErrores}
            disabled={erroresFiltrados.length === 0}
            style={{
              minHeight: '44px',
              padding: '8px 14px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Descargar lista de errores filtrados en formato JSON"
          >
            ⬇ Exportar JSON ({erroresFiltrados.length})
          </button>

          {kpis.pendientes > 0 && (
            <button
              type="button"
              onClick={() => setModalConfirmarTodos(true)}
              style={{
                minHeight: '44px',
                padding: '8px 14px',
                background: '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ✓ Resolver Todos ({kpis.pendientes})
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de Métricas / KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--card-bg, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total de Errores</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{kpis.total}</div>
        </div>

        <div style={{ background: 'var(--card-bg, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <span style={{ fontSize: '0.8rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pendientes de Revisión</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>{kpis.pendientes}</div>
        </div>

        <div style={{ background: 'var(--card-bg, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
          <span style={{ fontSize: '0.8rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Errores Resueltos</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e', marginTop: '4px' }}>{kpis.resueltos}</div>
        </div>

        <div style={{ background: 'var(--card-bg, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tasa de Resolución</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: kpis.tasa >= 80 ? '#22c55e' : '#f59e0b', marginTop: '4px' }}>{kpis.tasa}%</div>
        </div>
      </div>

      {/* Mensaje de feedback / toast */}
      {mensajeFeedback && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
          fontSize: '0.9rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: mensajeFeedback.tipo === 'exito' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: mensajeFeedback.tipo === 'exito' ? '#22c55e' : '#ef4444',
          border: `1px solid ${mensajeFeedback.tipo === 'exito' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
        }}>
          <span>{mensajeFeedback.texto}</span>
          <button type="button" onClick={() => setMensajeFeedback(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {/* Barra de Controles y Filtros */}
      <div style={{
        background: 'var(--card-bg, #1e293b)',
        padding: '16px',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #334155)',
        marginBottom: '16px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        alignItems: 'end'
      }}>
        {/* Buscador */}
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Buscar error:</label>
          <input
            type="text"
            className="form-input form-input-clean"
            placeholder="Filtrar por usuario, mensaje, método o detalle..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ minHeight: '44px', width: '100%' }}
          />
        </div>

        {/* Filtro Estado */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Estado:</label>
          <select
            className="form-select form-select-clean"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{ minHeight: '44px', width: '100%' }}
          >
            <option value="pendientes">Pendientes ({kpis.pendientes})</option>
            <option value="resueltos">Resueltos ({kpis.resueltos})</option>
            <option value="todos">Todos los registros ({kpis.total})</option>
          </select>
        </div>

        {/* Filtro Origen */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Origen:</label>
          <select
            className="form-select form-select-clean"
            value={filtroOrigen}
            onChange={(e) => setFiltroOrigen(e.target.value)}
            style={{ minHeight: '44px', width: '100%' }}
          >
            <option value="todos">Todos los orígenes</option>
            <option value="frontend">Frontend (Cliente)</option>
            <option value="backend">Backend (Python)</option>
          </select>
        </div>

        {/* Filtro Código */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Código:</label>
          <select
            className="form-select form-select-clean"
            value={filtroCodigo}
            onChange={(e) => setFiltroCodigo(e.target.value)}
            style={{ minHeight: '44px', width: '100%' }}
          >
            <option value="todos">Todos los códigos</option>
            {codigosDisponibles.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla de Registros */}
      <div style={{
        background: 'var(--card-bg, #1e293b)',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #334155)',
        overflowX: 'auto'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border-color, #334155)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '12px 14px' }}>Fecha y Hora</th>
              <th style={{ padding: '12px 14px' }}>Origen</th>
              <th style={{ padding: '12px 14px' }}>Código</th>
              <th style={{ padding: '12px 14px' }}>Usuario Afectado</th>
              <th style={{ padding: '12px 14px' }}>Mensaje del Error</th>
              <th style={{ padding: '12px 14px' }}>Estado</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Cargando log de errores...
                </td>
              </tr>
            ) : erroresFiltrados.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No se encontraron errores remotos con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              erroresFiltrados.map((item) => {
                const fechaFormat = item.fecha_hora
                  ? new Date(item.fecha_hora).toLocaleString('es-AR', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })
                  : 'Fecha desconocida';

                const esFrontend = String(item.origen || '').toLowerCase() === 'frontend';

                return (
                  <tr
                    key={item.id_error}
                    style={{
                      borderBottom: '1px solid var(--border-color, #334155)',
                      background: item.resuelto ? 'transparent' : 'rgba(239, 68, 68, 0.03)'
                    }}
                  >
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {fechaFormat}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: esFrontend ? 'rgba(147, 51, 234, 0.15)' : 'rgba(234, 88, 12, 0.15)',
                        color: esFrontend ? '#a855f7' : '#f97316',
                        border: `1px solid ${esFrontend ? 'rgba(147, 51, 234, 0.3)' : 'rgba(234, 88, 12, 0.3)'}`
                      }}>
                        {esFrontend ? '💻 Frontend' : '⚙️ Backend'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.codigo_error || 'ERROR'}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.nombre_usuario || 'Anónimo / Desconocido'}
                      </div>
                      {item.rol_usuario && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Rol: {item.rol_usuario}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '12px 14px', maxWidth: '380px' }}>
                      <div style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text-primary)'
                      }} title={item.mensaje_error}>
                        {item.mensaje_error || '(Sin mensaje detallado)'}
                      </div>
                      {item.accion_metodo && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          Método: {item.accion_metodo}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {item.resuelto ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: 'rgba(34, 197, 94, 0.15)',
                          color: '#22c55e',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        }}>
                          ✓ Resuelto
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)'
                        }}>
                          ● Pendiente
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setErrorSeleccionado(item)}
                          style={{
                            minHeight: '36px',
                            minWidth: '36px',
                            padding: '6px 10px',
                            background: 'var(--card-bg, #1e293b)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color, #334155)',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 500
                          }}
                          title="Ver detalle técnico completo y stack trace"
                        >
                          👁️ Detalle
                        </button>

                        {!item.resuelto && (
                          <button
                            type="button"
                            onClick={() => handleResolverError(item.id_error)}
                            disabled={resolviendoId === item.id_error}
                            style={{
                              minHeight: '36px',
                              padding: '6px 12px',
                              background: '#16a34a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}
                            title="Marcar error como resuelto"
                          >
                            {resolviendoId === item.id_error ? '...' : '✓ Resolver'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Detalle Técnico / Stack Trace */}
      {errorSeleccionado && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '780px', width: '90%' }}>
            <div className="modal-header">
              <span className="modal-title">
                🔍 Detalle Técnico de la Excepción
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setErrorSeleccionado(null);
                  setCopiado(false);
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '12px 0 16px 0', fontSize: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px' }}>
                <div><strong>Código:</strong> {errorSeleccionado.codigo_error}</div>
                <div><strong>Origen:</strong> {errorSeleccionado.origen}</div>
                <div><strong>Usuario:</strong> {errorSeleccionado.nombre_usuario} ({errorSeleccionado.rol_usuario})</div>
                <div><strong>Método:</strong> {errorSeleccionado.accion_metodo || 'N/A'}</div>
                <div><strong>Equipo / Cliente:</strong> {errorSeleccionado.equipo_info || 'N/A'}</div>
                <div><strong>Estado:</strong> {errorSeleccionado.resuelto ? 'Resuelto' : 'Pendiente'}</div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--text-primary)' }}>Mensaje de Error:</strong>
                <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', color: '#ef4444', fontWeight: 600 }}>
                  {errorSeleccionado.mensaje_error || '(Sin mensaje)'}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Detalle Técnico / Stack Trace:</strong>
                  <button
                    type="button"
                    onClick={() => handleCopiarDetalle(errorSeleccionado.detalle_tecnico || errorSeleccionado.mensaje_error)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-color, #334155)',
                      color: 'var(--text-secondary)',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    {copiado ? '✓ ¡Copiado!' : '📋 Copiar'}
                  </button>
                </div>

                <pre style={{
                  padding: '12px',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                  fontSize: '0.78rem',
                  fontFamily: 'Consolas, Monaco, monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  margin: 0
                }}>
                  {errorSeleccionado.detalle_tecnico || 'No se adjuntó stack trace técnico.'}
                </pre>
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {!errorSeleccionado.resuelto && (
                <button
                  type="button"
                  className="btn-confirm"
                  onClick={() => handleResolverError(errorSeleccionado.id_error)}
                  disabled={resolviendoId === errorSeleccionado.id_error}
                  style={{ background: '#16a34a', borderColor: '#16a34a' }}
                >
                  {resolviendoId === errorSeleccionado.id_error ? 'Resolviendo...' : '✓ Marcar como Resuelto'}
                </button>
              )}

              <button
                type="button"
                className="btn-cancel"
                onClick={() => {
                  setErrorSeleccionado(null);
                  setCopiado(false);
                }}
                style={{ marginLeft: 'auto' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para Resolver Todos */}
      {modalConfirmarTodos && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: '#16a34a' }}>
                ✓ Resolver Todos los Errores
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => !resolviendoTodos && setModalConfirmarTodos(false)}
                disabled={resolviendoTodos}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '12px 0 16px 0', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 10px 0', color: 'var(--text-primary)' }}>
                ¿Deseas marcar los <strong>{kpis.pendientes}</strong> errores pendientes como resueltos?
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Esta acción actualizará el estado de todos los incidentes pendientes en la base de datos PostgreSQL.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setModalConfirmarTodos(false)}
                disabled={resolviendoTodos}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn-confirm"
                onClick={handleConfirmarResolverTodos}
                disabled={resolviendoTodos}
                style={{ background: '#16a34a', borderColor: '#16a34a' }}
              >
                {resolviendoTodos ? 'Marcando...' : 'Sí, Marcar Todos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

