import React, { useState, useEffect } from 'react';
import { api } from '../services/apiBridge';

const LUGARES = [
  { id: 'Oficina', label: 'Oficina', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'Campaña / Campo', label: 'Campaña / Campo', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' },
  { id: 'Home Office', label: 'Home Office', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' },
  { id: 'Franco', label: 'Franco (Descanso)', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }
];

export default function CheckForm({ onRegistroGuardado, onVolver }) {
  const getFechaHoy = () => {
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  };

  const [fecha, setFecha] = useState(getFechaHoy());
  const [lugar, setLugar] = useState('Oficina');

  // Proyectos
  const [serviciosDisponibles, setServiciosDisponibles] = useState([]);
  const [proyectosSeleccionados, setProyectosSeleccionados] = useState([]);
  const [cargandoServicios, setCargandoServicios] = useState(true);

  // División de jornada: 'equitativo' (8hs divididas) o 'personalizado' (horas manuales)
  const [modoDivision, setModoDivision] = useState('equitativo');
  const [horasPorProyecto, setHorasPorProyecto] = useState({}); // { [proyecto]: number }
  const [horasArea, setHorasArea] = useState(8);

  const [enviando, setEnviando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');
  const [mensajeError, setMensajeError] = useState('');

  // Cargar lista de proyectos disponibles desde el backend
  useEffect(() => {
    let activo = true;
    async function cargarServicios() {
      try {
        const lista = await api.obtenerServicios();
        if (activo && Array.isArray(lista)) {
          setServiciosDisponibles(lista);
        }
      } catch (err) {
        console.error('Error cargando servicios:', err);
      } finally {
        if (activo) setCargandoServicios(false);
      }
    }
    cargarServicios();
    return () => {
      activo = false;
    };
  }, []);

  // Agregar un proyecto
  const handleAgregarProyecto = (e) => {
    const seleccionado = e.target.value;
    if (!seleccionado) return;

    if (!proyectosSeleccionados.includes(seleccionado)) {
      const nuevaLista = [...proyectosSeleccionados, seleccionado];
      setProyectosSeleccionados(nuevaLista);

      // Distribuir equitativamente las 8 horas entre los proyectos para no superar nunca el tope
      const horasDefault = Number((8 / nuevaLista.length).toFixed(1));
      setHorasPorProyecto(() => {
        const nuevo = {};
        nuevaLista.forEach(p => {
          nuevo[p] = horasDefault;
        });
        return nuevo;
      });
    }
    e.target.value = ''; // Reset select
  };

  // Remover un proyecto
  const handleRemoverProyecto = (nombre) => {
    const nuevaLista = proyectosSeleccionados.filter(p => p !== nombre);
    setProyectosSeleccionados(nuevaLista);
    setHorasPorProyecto(prev => {
      const copia = { ...prev };
      delete copia[nombre];
      return copia;
    });
  };

  // Total horas personalizadas (redondeado a 1 decimal)
  const getTotalHorasPersonalizadas = () => {
    if (proyectosSeleccionados.length === 0) return Math.min(8.0, Math.max(0, horasArea));
    const total = proyectosSeleccionados.reduce((acc, p) => acc + (Number(horasPorProyecto[p]) || 0), 0);
    return Math.round(total * 10) / 10;
  };

  // Modificar horas con botones +/- respetando el tope de 8 horas
  const handleCambiarHoras = (proyecto, delta) => {
    setHorasPorProyecto(prev => {
      const actual = Number(prev[proyecto]) || 0;
      const totalOtros = proyectosSeleccionados
        .filter(p => p !== proyecto)
        .reduce((acc, p) => acc + (Number(prev[p]) || 0), 0);

      // El total acumulado no debe superar 8.0 horas
      const maxPermitido = Math.max(0.5, Math.round((8.0 - totalOtros) * 10) / 10);

      let nuevo = Math.round((actual + delta) * 10) / 10;
      if (delta > 0) {
        nuevo = Math.min(maxPermitido, nuevo);
      } else {
        nuevo = Math.max(0.5, nuevo);
      }
      return { ...prev, [proyecto]: nuevo };
    });
  };

  // Modificar horas mediante teclado acotando a un máximo de 8 hs totales
  const handleInputHoras = (proyecto, valor) => {
    const num = parseFloat(valor);
    if (isNaN(num)) {
      setHorasPorProyecto(prev => ({ ...prev, [proyecto]: 0 }));
      return;
    }

    setHorasPorProyecto(prev => {
      const totalOtros = proyectosSeleccionados
        .filter(p => p !== proyecto)
        .reduce((acc, p) => acc + (Number(prev[p]) || 0), 0);

      const maxPermitido = Math.max(0.5, Math.round((8.0 - totalOtros) * 10) / 10);
      const valorAjustado = Math.min(maxPermitido, Math.max(0, Math.round(num * 10) / 10));
      return { ...prev, [proyecto]: valorAjustado };
    });
  };

  // Manejo de horas para tiempo al área (sin proyectos)
  const handleCambiarHorasArea = (delta) => {
    setHorasArea(prev => Math.min(8.0, Math.max(0.5, Math.round((prev + delta) * 10) / 10)));
  };

  const handleInputHorasArea = (valor) => {
    const num = parseFloat(valor);
    if (isNaN(num)) {
      setHorasArea(0);
      return;
    }
    setHorasArea(Math.min(8.0, Math.max(0.5, Math.round(num * 10) / 10)));
  };

  // Cálculo de horas equitativas
  const getHorasEquitativas = () => {
    if (proyectosSeleccionados.length === 0) return 8;
    return Number((8 / proyectosSeleccionados.length).toFixed(2));
  };

  // Enviar formulario
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensajeExito('');
    setMensajeError('');

    if (!fecha || !lugar) {
      setMensajeError('Por favor selecciona la fecha y la ubicación.');
      return;
    }

    // Validación estricta: las horas asignadas no deben superar las 8 horas
    if (lugar !== 'Franco' && modoDivision === 'personalizado') {
      const total = getTotalHorasPersonalizadas();
      if (total > 8.001) {
        setMensajeError(`El total de horas asignadas (${total} hs) no debe superar las 8 horas.`);
        return;
      }
      if (total <= 0) {
        setMensajeError('Debes asignar horas a los proyectos trabajados.');
        return;
      }
    }

    setEnviando(true);

    try {
      let payload = { fecha, lugar };

      if (lugar === 'Franco') {
        payload.lugar = 'Franco';
      } else if (proyectosSeleccionados.length === 0) {
        // Sin proyectos: Se computa como tiempo dedicado al área
        const h = modoDivision === 'equitativo' ? 8 : horasArea;
        payload.proyectos = [{ servicio: 'Tiempo dedicado al Área', horas: h }];
        payload.horas = h;
      } else {
        // Con uno o varios proyectos
        if (modoDivision === 'equitativo') {
          const h = getHorasEquitativas();
          payload.proyectos = proyectosSeleccionados.map(p => ({
            servicio: p,
            horas: h
          }));
        } else {
          // Personalizado
          payload.proyectos = proyectosSeleccionados.map(p => ({
            servicio: p,
            horas: Number(horasPorProyecto[p]) || 0
          }));
        }
      }

      const res = await api.guardarCheckDiario(payload);

      if (res.exito) {
        setMensajeExito(res.mensaje || '¡Check diario guardado con éxito!');
        if (onRegistroGuardado) {
          onRegistroGuardado();
        }
        // Redirige automáticamente a la pantalla principal tras 1.3s
        setTimeout(() => {
          setMensajeExito('');
          if (onVolver) {
            onVolver();
          }
        }, 1300);
      } else {
        setMensajeError(res.error || 'No se pudo registrar el reporte.');
      }
    } catch (err) {
      console.error(err);
      setMensajeError('Error de conexión al guardar el registro.');
    } finally {
      setEnviando(false);
    }
  };

  const esFranco = lugar === 'Franco';

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
          <span className="view-header-title">Cargar Reporte Diario</span>
        </div>
      )}

      <div className="form-card">
        {mensajeExito && (
          <div className="alert alert-success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span>{mensajeExito}</span>
          </div>
        )}

        {mensajeError && (
          <div className="alert alert-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{mensajeError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Fecha */}
          <div className="form-group">
            <label className="form-label" htmlFor="fecha">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Fecha de Jornada
            </label>
            <input
              id="fecha"
              type="date"
              className="form-input"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              disabled={enviando}
            />
          </div>

          {/* Ubicación / Lugar (4 opciones fijas) */}
          <div className="form-group">
            <label className="form-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Ubicación / Lugar
            </label>
            <div className="location-grid">
              {LUGARES.map((item) => {
                const isSelected = lugar === item.id;
                const isFrancoItem = item.id === 'Franco';
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`location-btn ${isSelected ? (isFrancoItem ? 'franco-selected' : 'selected') : ''}`}
                    onClick={() => setLugar(item.id)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon} />
                    </svg>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SI SELECCIONA FRANCO: Solo muestra aviso amigable y botón */}
          {esFranco ? (
            <div className="franco-banner">
              <div className="franco-banner-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </div>
              <span className="franco-banner-title">Día de Descanso / Franco</span>
              <p className="franco-banner-desc">
                No es necesario asignar proyectos ni cómputo de horas para este día.
              </p>
            </div>
          ) : (
            <>
              {/* Proyectos Activos (Selección múltiple o en blanco) */}
              <div className="form-group">
                <label className="form-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                  Proyectos Activos ({proyectosSeleccionados.length})
                </label>

                <select
                  className="form-select"
                  value=""
                  onChange={handleAgregarProyecto}
                  disabled={enviando || cargandoServicios}
                >
                  <option value="">
                    {cargandoServicios
                      ? 'Cargando proyectos...'
                      : '+ Seleccionar o agregar proyecto...'}
                  </option>
                  {serviciosDisponibles.map((srv) => (
                    <option key={srv} value={srv}>
                      {srv}
                    </option>
                  ))}
                </select>

                {/* Lista de proyectos seleccionados o aviso de campo en blanco */}
                {proyectosSeleccionados.length === 0 ? (
                  <div className="empty-projects-notice">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>Sin proyectos seleccionados: Se computará como tiempo dedicado al Área.</span>
                  </div>
                ) : (
                  <div className="selected-projects-list">
                    {proyectosSeleccionados.map((item) => (
                      <div key={item} className="project-chip">
                        <span>{item}</span>
                        <button
                          type="button"
                          className="project-chip-remove"
                          onClick={() => handleRemoverProyecto(item)}
                          title="Quitar proyecto"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECCIÓN: Dividir jornada entre proyectos */}
              <div className="division-section">
                <span className="division-title">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Dividir jornada entre proyectos
                </span>

                <div className="division-modes-grid">
                  <button
                    type="button"
                    className={`division-mode-btn ${modoDivision === 'equitativo' ? 'selected' : ''}`}
                    onClick={() => setModoDivision('equitativo')}
                  >
                    <span className="division-mode-title">Dividir jornada (8 hs)</span>
                    <span className="division-mode-subtitle">Reparto equitativo</span>
                  </button>

                  <button
                    type="button"
                    className={`division-mode-btn ${modoDivision === 'personalizado' ? 'selected' : ''}`}
                    onClick={() => setModoDivision('personalizado')}
                  >
                    <span className="division-mode-title">Ingresar horas</span>
                    <span className="division-mode-subtitle">Manual por proyecto</span>
                  </button>
                </div>

                {/* Vista del desglose según el modo */}
                {modoDivision === 'equitativo' ? (
                  <div className="breakdown-list">
                    {proyectosSeleccionados.length === 0 ? (
                      <div className="breakdown-item">
                        <span>Tiempo dedicado al Área</span>
                        <span className="breakdown-hours-badge">8.0 hs</span>
                      </div>
                    ) : (
                      proyectosSeleccionados.map((p) => (
                        <div key={p} className="breakdown-item">
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            {p}
                          </span>
                          <span className="breakdown-hours-badge">
                            {getHorasEquitativas()} hs
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  /* Modo personalizado: inputs de horas */
                  <div className="custom-hours-list">
                    {proyectosSeleccionados.length === 0 ? (
                      <div className="custom-hours-item">
                        <span className="custom-hours-name">Tiempo dedicado al Área</span>
                        <div className="custom-hours-controls">
                          <button
                            type="button"
                            className="btn-step"
                            onClick={() => handleCambiarHorasArea(-0.5)}
                            disabled={horasArea <= 0.5}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="8"
                            className="input-hours"
                            value={horasArea}
                            onChange={(e) => handleInputHorasArea(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-step"
                            onClick={() => handleCambiarHorasArea(0.5)}
                            disabled={horasArea >= 8.0}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ) : (
                      proyectosSeleccionados.map((p) => {
                        const totalActual = getTotalHorasPersonalizadas();
                        const puedeSumar = totalActual < 8.0;
                        const valorActual = horasPorProyecto[p] ?? getHorasEquitativas();

                        return (
                          <div key={p} className="custom-hours-item">
                            <span className="custom-hours-name" title={p}>
                              {p}
                            </span>
                            <div className="custom-hours-controls">
                              <button
                                type="button"
                                className="btn-step"
                                onClick={() => handleCambiarHoras(p, -0.5)}
                                disabled={Number(valorActual) <= 0.5}
                                title="Restar 0.5 hs"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                step="0.5"
                                min="0.5"
                                max="8"
                                className="input-hours"
                                value={valorActual}
                                onChange={(e) => handleInputHoras(p, e.target.value)}
                              />
                              <button
                                type="button"
                                className="btn-step"
                                onClick={() => handleCambiarHoras(p, 0.5)}
                                disabled={!puedeSumar}
                                title={puedeSumar ? "Sumar 0.5 hs" : "Límite de 8 hs alcanzado"}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Barra de progreso y resumen de horas */}
                    {(() => {
                      const totalHs = getTotalHorasPersonalizadas();
                      const porcentaje = Math.min(100, Math.max(0, (totalHs / 8.0) * 100));
                      const esCompleto = totalHs === 8.0;
                      const esExcedido = totalHs > 8.0;

                      return (
                        <div className="hours-total-bar">
                          <div className="hours-total-info">
                            <span className="hours-total-label">Total asignado:</span>
                            <span className={`hours-total-value ${esCompleto ? 'complete' : ''} ${esExcedido ? 'over-limit' : ''}`}>
                              {totalHs} / 8.0 hs
                            </span>
                          </div>

                          <div className="hours-progress-track">
                            <div
                              className={`hours-progress-fill ${esCompleto ? 'complete' : ''} ${esExcedido ? 'over-limit' : ''}`}
                              style={{ width: `${porcentaje}%` }}
                            />
                          </div>

                          <div className="hours-status-badge">
                            {esCompleto ? (
                              <span className="badge-complete">✓ Jornada de 8 hs completa</span>
                            ) : esExcedido ? (
                              <span className="badge-over">⚠️ No debe superar 8 hs</span>
                            ) : (
                              <span className="badge-remaining">
                                Restan {(8.0 - totalHs).toFixed(1)} hs por asignar
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Botón de Confirmación */}
          <button type="submit" className="btn-submit" disabled={enviando}>
            {enviando ? (
              <>
                <div className="spinner" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>{esFranco ? 'Registrar Franco (Descanso)' : 'Registrar Check Diario'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
