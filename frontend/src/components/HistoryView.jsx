import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';

const LUGARES_OPCIONES = [
  'Oficina',
  'Campaña / Campo',
  'Home Office',
  'Franco',
  'Vacaciones',
  'Licencia'
];

export default function HistoryView({ onVolver, tema, onNuevoReporte, usuario, onHistorialOtrosEmpleados }) {
  const isRpg = tema === 'rpg';

  // Al entrar al historial, maximizar para una vista panorámica óptima
  useEffect(() => {
    api.maximizarVentana();
  }, []);

  const esRRHH = (usuario?.area || '').toUpperCase() === 'RRHH';

  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeSync, setMensajeSync] = useState(null);

  // Filtro de día seleccionado en el calendario
  const [diaSeleccionado, setDiaSeleccionado] = useState(null); // 'YYYY-MM-DD' o null
  const [busquedaTexto, setBusquedaTexto] = useState('');

  // Estado del calendario mensual
  const [fechaCalendario, setFechaCalendario] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });

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

    const handleCatalogos = () => {
      cargarHistorial();
      cargarServicios();
    };
    window.addEventListener('catalogos-actualizados', handleCatalogos);
    return () => {
      window.removeEventListener('catalogos-actualizados', handleCatalogos);
    };
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
        horas: Number(registroEditando.horas) || 0,
        empleado: registroEditando.empleado || '',
        id_empleado: registroEditando.id_empleado || '',
        id_proyecto: registroEditando.id_proyecto || ''
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

  // Mapa de registros indexados por fecha (YYYY-MM-DD) para el calendario
  const mapaRegistrosPorFecha = useMemo(() => {
    const mapa = {};
    registros.forEach(r => {
      if (!r.fecha) return;
      const f = r.fecha.trim();
      if (!mapa[f]) {
        mapa[f] = [];
      }
      mapa[f].push(r);
    });
    return mapa;
  }, [registros]);

  // Registros filtrados para la columna izquierda
  const registrosFiltrados = useMemo(() => {
    return registros.filter(item => {
      if (diaSeleccionado && item.fecha !== diaSeleccionado) {
        return false;
      }
      if (busquedaTexto) {
        const q = busquedaTexto.toLowerCase();
        const srv = (item.servicio || '').toLowerCase();
        const lug = (item.tipo_ocf || item.lugar || '').toLowerCase();
        const fec = (item.fecha || '').toLowerCase();
        if (!srv.includes(q) && !lug.includes(q) && !fec.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [registros, diaSeleccionado, busquedaTexto]);

  // Generador de días del mes para el calendario
  const diasMesCalendario = useMemo(() => {
    const anio = fechaCalendario.getFullYear();
    const mes = fechaCalendario.getMonth(); // 0-indexed

    const primerDiaMes = new Date(anio, mes, 1);
    const ultimoDiaMes = new Date(anio, mes + 1, 0);
    const totalDias = ultimoDiaMes.getDate();

    // En JS getDay() es 0=Domingo, 1=Lunes. Lo convertimos a 0=Lunes, 6=Domingo
    let diaInicioSemana = primerDiaMes.getDay() - 1;
    if (diaInicioSemana === -1) diaInicioSemana = 6;

    const celdas = [];
    // Celdas vacías previas
    for (let i = 0; i < diaInicioSemana; i++) {
      celdas.push({ esVacio: true, id: `prev-${i}` });
    }

    const hoyStr = new Date().toISOString().split('T')[0];

    // Celdas de los días del mes
    for (let d = 1; d <= totalDias; d++) {
      const mesStr = String(mes + 1).padStart(2, '0');
      const diaStr = String(d).padStart(2, '0');
      const fechaIso = `${anio}-${mesStr}-${diaStr}`;
      const regsDia = mapaRegistrosPorFecha[fechaIso] || [];

      celdas.push({
        esVacio: false,
        id: fechaIso,
        diaNumero: d,
        fechaIso,
        esHoy: fechaIso === hoyStr,
        registros: regsDia
      });
    }

    return celdas;
  }, [fechaCalendario, mapaRegistrosPorFecha]);

  const navegarMes = (delta) => {
    setFechaCalendario(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const irAHoy = () => {
    const hoy = new Date();
    setFechaCalendario(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    setDiaSeleccionado(hoy.toISOString().split('T')[0]);
  };

  const nombresMeses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const getBadgeClassLugar = (lugar) => {
    const l = (lugar || '').toLowerCase();
    if (l.includes('oficina')) return 'badge-modalidad-oficina';
    if (l.includes('campo') || l.includes('campaña') || l.includes('roster')) return 'badge-modalidad-campo';
    if (l.includes('home')) return 'badge-modalidad-home';
    if (l.includes('franco')) return 'badge-modalidad-franco';
    if (l.includes('vacaciones')) return 'badge-modalidad-vacaciones';
    if (l.includes('licencia')) return 'badge-modalidad-licencia';
    return 'badge-modalidad-oficina';
  };

  const pendientesCount = registros.filter((r) => r.sincronizado === 0).length;

  return (
    <div className={`view-content history-split-viewport ${isRpg ? 'rpg-board-viewport' : ''}`}>
      {/* Barra superior de navegación */}
      <div className="view-header-bar history-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onVolver && (
            <button type="button" className="btn-back" onClick={onVolver}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Inicio</span>
            </button>
          )}

          <div className="history-title-block">
            <span className="history-main-title">
              {isRpg ? '📖 Tomo de Crónicas Históricas' : 'Historial de Registros'}
            </span>
            <span className="history-sub-title">
              {isRpg
                ? 'Anales de misiones selladas • Registro cromático del reino'
                : 'Pantalla dividida con vista de lista y calendario mensual'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {esRRHH && onHistorialOtrosEmpleados && (
            <button
              type="button"
              className="btn-action-ghost"
              onClick={onHistorialOtrosEmpleados}
              title="Ver registros que has cargado para otros empleados"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Historial Otros Empleados</span>
            </button>
          )}

          {onNuevoReporte && (
            <button
              type="button"
              className="btn-action-primary"
              onClick={onNuevoReporte}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Nuevo Check</span>
            </button>
          )}

          {pendientesCount > 0 && (
            <button
              type="button"
              className="btn-sync"
              onClick={ejecutarSincronizacion}
              disabled={sincronizando}
              title="Sincronizar reportes pendientes con Google Sheets"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
        <div className={`alert-banner ${mensajeSync.tipo === 'exito' ? 'alert-success' : 'alert-error'}`}>
          <span>{mensajeSync.texto}</span>
          <button type="button" onClick={() => setMensajeSync(null)}>✕</button>
        </div>
      )}

      {/* DISPOSICIÓN DIVIDIDA: LISTADO IZQUIERDA | CALENDARIO DERECHA */}
      <div className="history-split-grid">
        
        {/* PANEL IZQUIERDO: LISTADO DE REGISTROS */}
        <div className="history-list-panel">
          <div className="history-panel-toolbar">
            <div className="history-search-box">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por proyecto o fecha..."
                value={busquedaTexto}
                onChange={(e) => setBusquedaTexto(e.target.value)}
                className="form-input form-input-sm search-field"
              />
              {busquedaTexto && (
                <button type="button" className="clear-search-btn" onClick={() => setBusquedaTexto('')}>✕</button>
              )}
            </div>

            {diaSeleccionado && (
              <div className="active-day-filter-chip">
                <span>Día: <strong>{diaSeleccionado}</strong></span>
                <button
                  type="button"
                  onClick={() => setDiaSeleccionado(null)}
                  title="Quitar filtro de día"
                  className="chip-remove-btn"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div className="history-cards-scroll">
            {cargando && registros.length === 0 ? (
              <div className="empty-state">
                <div className="spinner" style={{ width: '28px', height: '28px' }} />
                <span className="empty-text">Cargando registros guardados...</span>
              </div>
            ) : registrosFiltrados.length === 0 ? (
              <div className="empty-state">
                <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <span className="empty-text">
                  {diaSeleccionado
                    ? `No hay reportes cargados para el día ${diaSeleccionado}.`
                    : 'Aún no hay reportes registrados.'}
                </span>
                {diaSeleccionado && (
                  <button
                    type="button"
                    className="btn-action-ghost"
                    style={{ marginTop: '8px' }}
                    onClick={() => setDiaSeleccionado(null)}
                  >
                    Ver todos los días
                  </button>
                )}
              </div>
            ) : (
              <div className="history-cards-col">
                {registrosFiltrados.map((item) => {
                  const horasDisplay = item.horas > 0 ? `${item.horas} hs` : (item.jornada || '0 hs');
                  const lugarDisplay = item.tipo_ocf || item.lugar || 'Oficina';
                  const badgeClass = getBadgeClassLugar(lugarDisplay);
                  const estaSincronizado = item.sincronizado === 1;

                  return (
                    <div
                      key={item.id}
                      className={`history-item-card ${diaSeleccionado === item.fecha ? 'item-card-active' : ''}`}
                    >
                      <div className="item-card-header">
                        <span className="item-card-date">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          {item.fecha}
                          {item.dia_semana ? ` (${item.dia_semana})` : ''}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {item.feriado === 'SI' && (
                            <span className="chip-feriado">Feriado</span>
                          )}
                          <span className={`status-badge ${estaSincronizado ? 'status-synced' : 'status-pending'}`}>
                            {estaSincronizado ? 'Sincronizado' : 'Pendiente'}
                          </span>
                        </div>
                      </div>

                      <div className="item-card-body">
                        <div className="item-card-row">
                          <span className={`modalidad-pill ${badgeClass}`}>{lugarDisplay}</span>
                          <span className="item-hours-pill">{horasDisplay}</span>
                        </div>
                        <div className="item-card-task" title={item.servicio}>
                          {item.servicio || 'Tiempo dedicado al área'}
                        </div>
                      </div>

                      <div className="item-card-footer">
                        <button
                          type="button"
                          className="btn-edit-record"
                          onClick={() => setRegistroEditando({ ...item })}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
          </div>
        </div>

        {/* PANEL DERECHO: CALENDARIO MENSUAL CROMÁTICO */}
        <div className="history-calendar-panel">
          <div className="calendar-panel-header">
            <div className="calendar-month-controls">
              <button
                type="button"
                className="calendar-nav-btn"
                onClick={() => navegarMes(-1)}
                title="Mes anterior"
              >
                ◀
              </button>
              <span className="calendar-month-title">
                {nombresMeses[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()}
              </span>
              <button
                type="button"
                className="calendar-nav-btn"
                onClick={() => navegarMes(1)}
                title="Mes siguiente"
              >
                ▶
              </button>
            </div>

            <button
              type="button"
              className="calendar-today-btn"
              onClick={irAHoy}
            >
              Hoy
            </button>
          </div>

          {/* Días de la semana */}
          <div className="calendar-weekdays-row">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mié</span>
            <span>Jue</span>
            <span>Vie</span>
            <span>Sáb</span>
            <span>Dom</span>
          </div>

          {/* Grilla de celdas del mes */}
          <div className="calendar-grid">
            {diasMesCalendario.map((celda) => {
              if (celda.esVacio) {
                return <div key={celda.id} className="calendar-cell cell-empty" />;
              }

              const estaSeleccionado = diaSeleccionado === celda.fechaIso;
              const tieneRegistros = celda.registros.length > 0;

              return (
                <div
                  key={celda.id}
                  className={`calendar-cell ${celda.esHoy ? 'cell-today' : ''} ${estaSeleccionado ? 'cell-selected' : ''} ${tieneRegistros ? 'cell-has-data' : ''}`}
                  onClick={() => {
                    // Alternar selección de día
                    if (diaSeleccionado === celda.fechaIso) {
                      setDiaSeleccionado(null);
                    } else {
                      setDiaSeleccionado(celda.fechaIso);
                    }
                  }}
                  title={tieneRegistros ? `${celda.registros.length} registro(s) el ${celda.fechaIso}` : celda.fechaIso}
                >
                  <div className="cell-top-bar">
                    <span className="cell-day-number">{celda.diaNumero}</span>
                    {celda.esHoy && <span className="cell-today-dot" title="Hoy" />}
                  </div>

                  {/* Indicadores cromáticos por registro */}
                  <div className="cell-events-container">
                    {celda.registros.slice(0, 3).map((r, idx) => {
                      const lug = r.tipo_ocf || r.lugar || 'Oficina';
                      const badgeClass = getBadgeClassLugar(lug);
                      return (
                        <div
                          key={r.id || idx}
                          className={`cell-event-pill ${badgeClass}`}
                          title={`${lug} - ${r.servicio} (${r.horas} hs)`}
                        >
                          <span className="cell-event-label">
                            {lug === 'Campaña / Campo' ? 'Campo' : lug}
                          </span>
                        </div>
                      );
                    })}
                    {celda.registros.length > 3 && (
                      <span className="cell-more-badge">+{celda.registros.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leyenda de colores explicativa */}
          <div className="calendar-legend-bar">
            <span className="legend-title">Referencias:</span>
            <div className="legend-items">
              <span className="legend-item">
                <span className="legend-color-box dot-oficina" /> Oficina
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-campo" /> Campo / Roster
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-home" /> Home Office
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-franco" /> Franco
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-vacaciones" /> Vacaciones
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-licencia" /> Licencia
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Modal de Modificación de Registro */}
      {registroEditando && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Modificar Registro</span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setRegistroEditando(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarModificacion} className="modal-form">
              <div className="form-group-clean">
                <label className="form-label-clean">Fecha:</label>
                <input
                  type="date"
                  className="form-input form-input-clean"
                  value={registroEditando.fecha}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, fecha: e.target.value })}
                  required
                />
              </div>

              <div className="form-group-clean">
                <label className="form-label-clean">Modalidad / Lugar:</label>
                <select
                  className="form-select form-select-clean"
                  value={registroEditando.tipo_ocf || registroEditando.lugar || 'Oficina'}
                  onChange={(e) => {
                    const nuevoLugar = e.target.value;
                    let nuevoServicio = registroEditando.servicio;
                    let nuevasHoras = registroEditando.horas;

                    if (nuevoLugar === 'Franco' || nuevoLugar === 'Vacaciones') {
                      nuevoServicio = nuevoLugar;
                      nuevasHoras = 0;
                    } else if (nuevoLugar === 'Licencia') {
                      nuevoServicio = 'Licencia Médica';
                      nuevasHoras = 0;
                    } else if (nuevasHoras === 0) {
                      nuevasHoras = 8;
                    }

                    setRegistroEditando({
                      ...registroEditando,
                      tipo_ocf: nuevoLugar,
                      lugar: nuevoLugar,
                      servicio: nuevoServicio,
                      horas: nuevasHoras
                    });
                  }}
                  required
                >
                  {LUGARES_OPCIONES.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>

              {/* Si es Licencia, detalle */}
              {(registroEditando.tipo_ocf === 'Licencia' || registroEditando.lugar === 'Licencia') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Tipo de Licencia:</label>
                  <input
                    type="text"
                    className="form-input form-input-clean"
                    value={registroEditando.servicio}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                    placeholder="Ej: Médica, Especial, Examen..."
                    required
                  />
                </div>
              ) : (registroEditando.tipo_ocf === 'Franco' || registroEditando.lugar === 'Franco' ||
                   registroEditando.tipo_ocf === 'Vacaciones' || registroEditando.lugar === 'Vacaciones') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Detalle:</label>
                  <input
                    type="text"
                    className="form-input form-input-clean"
                    value={registroEditando.servicio}
                    disabled
                  />
                </div>
              ) : (
                <div className="form-group-clean">
                  <label className="form-label-clean">Proyecto / Tarea:</label>
                  <select
                    className="form-select form-select-clean"
                    value={registroEditando.servicio}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                    required
                  >
                    <option value="Tiempo dedicado al Área">Tiempo dedicado al Área</option>
                    {serviciosDisponibles.map((srv, idx) => (
                      <option key={idx} value={srv}>{srv}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group-clean">
                <label className="form-label-clean">Horas Registradas:</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  className="form-input form-input-clean"
                  value={registroEditando.horas}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, horas: e.target.value })}
                  disabled={['Franco', 'Vacaciones', 'Licencia'].includes(registroEditando.tipo_ocf || registroEditando.lugar)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setRegistroEditando(null)}
                  disabled={guardandoEdicion}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-confirm"
                  disabled={guardandoEdicion}
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
