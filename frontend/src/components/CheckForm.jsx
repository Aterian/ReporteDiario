import React, { useState, useEffect } from 'react';
import { api } from '../services/apiBridge';

const LUGARES = [
  { id: 'Oficina', label: 'Oficina', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'Campaña / Campo', label: 'Campaña / Campo', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' },
  { id: 'Home Office', label: 'Home Office', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' },
  { id: 'Franco', label: 'Franco (Descanso)', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }
];

const MAPA_AREAS = {
  'A': 'Aplicaciones',
  'N': 'Núcleo',
  'I': 'Ingeniería',
  'M': 'Mensura',
  'S': 'SIG',
  'RRHH': 'RRHH',
  'VYM': 'Ventas y Marketing'
};

const LISTADO_AREAS_CORPORATIVAS = [
  'Aplicaciones',
  'Ingeniería',
  'Mensura',
  'SIG',
  'Administración',
  'RRHH',
  'CyF',
  'Marketing',
  'Inventario',
  'I+D',
  'Ventas',
  'CD'
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
  const [fechaFin, setFechaFin] = useState(getFechaHoy());
  const [usarRangoFechas, setUsarRangoFechas] = useState(false);
  const [lugar, setLugar] = useState('Oficina');

  // Sesión y permisos
  const [sesionUsuario, setSesionUsuario] = useState(null);
  const [todosUsuarios, setTodosUsuarios] = useState([]);
  const [cargarParaOtro, setCargarParaOtro] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null);

  // Proyectos y área
  const [serviciosDisponibles, setServiciosDisponibles] = useState([]);
  const [proyectosSeleccionados, setProyectosSeleccionados] = useState([]);
  const [cargandoServicios, setCargandoServicios] = useState(true);
  const [verTodosProyectos, setVerTodosProyectos] = useState(false);

  // Sub-área para usuarios N, RRHH y A (default: Aplicaciones para A, o Ingeniería)
  const [areaElegida, setAreaElegida] = useState('Aplicaciones');

  // División de jornada: 'equitativo' o 'personalizado' (sin límite de 8 horas)
  const [modoDivision, setModoDivision] = useState('equitativo');
  const [horasPorProyecto, setHorasPorProyecto] = useState({}); // { [proyecto]: number }
  const [horasArea, setHorasArea] = useState(8);

  const [enviando, setEnviando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');
  const [mensajeError, setMensajeError] = useState('');

  // 1. Cargar sesión de usuario
  useEffect(() => {
    async function cargarSesion() {
      try {
        const estado = await api.obtenerEstadoSesion();
        if (estado && estado.usuario) {
          setSesionUsuario(estado.usuario);
          // Si el usuario es de RRHH, cargar lista de todos los empleados
          const esRRHH = (estado.usuario.area || '').toUpperCase() === 'RRHH';
          if (esRRHH) {
            const listaU = await api.obtenerTodosUsuarios();
            if (Array.isArray(listaU)) {
              setTodosUsuarios(listaU);
            }
          }
        }
      } catch (err) {
        console.error('Error al cargar sesión:', err);
      }
    }
    cargarSesion();
  }, []);

  // Si RRHH activa la opción de cargar para otro, refrescar lista fresca de empleados
  useEffect(() => {
    if (cargarParaOtro && esRRHH) {
      api.obtenerTodosUsuarios().then((listaU) => {
        if (Array.isArray(listaU) && listaU.length > 0) {
          setTodosUsuarios(listaU);
        }
      }).catch(err => console.error('Error al actualizar usuarios para RRHH:', err));
    }
  }, [cargarParaOtro, esRRHH]);

  // Determinar área activa y si tiene permiso especial (N, RRHH, A)
  const areaActiva = ((cargarParaOtro && usuarioSeleccionado)
    ? (usuarioSeleccionado.area || '')
    : (sesionUsuario?.area || '')).trim().toUpperCase();

  const esUsuarioAreaEspecial = ['N', 'RRHH', 'A'].includes(areaActiva);
  const esRRHH = (sesionUsuario?.area || '').toUpperCase() === 'RRHH';
  const esCampañaOCampo = lugar === 'Campaña / Campo';

  // 2. Cargar lista de proyectos disponibles desde el backend (depende del área activa o si se pide ver todos)
  useEffect(() => {
    let activo = true;
    async function cargarServicios() {
      setCargandoServicios(true);
      try {
        const areaFiltro = verTodosProyectos ? 'TODOS' : areaActiva;
        const lista = await api.obtenerServicios(areaFiltro);
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
  }, [areaActiva, verTodosProyectos]);

  // Agregar un proyecto regular o la opción 'Dedicado al área'
  const handleAgregarProyecto = (e) => {
    const seleccionado = e.target.value;
    if (!seleccionado) return;

    if (seleccionado === '__OPCION_AREA__') {
      const nombreItemArea = esUsuarioAreaEspecial
        ? `Dedicado al área - ${areaElegida}`
        : 'Dedicado al área';

      if (!proyectosSeleccionados.includes(nombreItemArea)) {
        const nuevaLista = [...proyectosSeleccionados, nombreItemArea];
        setProyectosSeleccionados(nuevaLista);
        const horasDefault = Number((8 / nuevaLista.length).toFixed(1));
        setHorasPorProyecto(prev => ({
          ...prev,
          [nombreItemArea]: horasDefault
        }));
      }
      e.target.value = '';
      return;
    }

    if (!proyectosSeleccionados.includes(seleccionado)) {
      const nuevaLista = [...proyectosSeleccionados, seleccionado];
      setProyectosSeleccionados(nuevaLista);

      const horasDefault = Number((8 / nuevaLista.length).toFixed(1));
      setHorasPorProyecto(prev => {
        const nuevo = { ...prev };
        nuevaLista.forEach(p => {
          if (nuevo[p] === undefined) {
            nuevo[p] = horasDefault;
          }
        });
        return nuevo;
      });
    }
    e.target.value = ''; // Reset select
  };

  // Botón directo para agregar tiempo al área como ítem
  const handleAgregarTiempoAreaBoton = () => {
    const nombreItemArea = esUsuarioAreaEspecial
      ? `Dedicado al área - ${areaElegida}`
      : 'Dedicado al área';

    if (!proyectosSeleccionados.includes(nombreItemArea)) {
      const nuevaLista = [...proyectosSeleccionados, nombreItemArea];
      setProyectosSeleccionados(nuevaLista);
      const horasDefault = Number((8 / nuevaLista.length).toFixed(1));
      setHorasPorProyecto(prev => ({
        ...prev,
        [nombreItemArea]: horasDefault
      }));
    }
  };

  // Remover un proyecto o tiempo al área
  const handleRemoverProyecto = (nombre) => {
    const nuevaLista = proyectosSeleccionados.filter(p => p !== nombre);
    setProyectosSeleccionados(nuevaLista);
    setHorasPorProyecto(prev => {
      const copia = { ...prev };
      delete copia[nombre];
      return copia;
    });
  };

  // Total horas personalizadas (sin tope artificial de 8 hs)
  const getTotalHorasPersonalizadas = () => {
    if (proyectosSeleccionados.length === 0) return Math.max(0, horasArea);
    const total = proyectosSeleccionados.reduce((acc, p) => acc + (Number(horasPorProyecto[p]) || 0), 0);
    return Math.round(total * 10) / 10;
  };

  // Modificar horas con botones +/- (sin limitante de 8 horas)
  const handleCambiarHoras = (proyecto, delta) => {
    setHorasPorProyecto(prev => {
      const actual = Number(prev[proyecto]) || 0;
      const nuevo = Math.max(0.5, Math.round((actual + delta) * 10) / 10);
      return { ...prev, [proyecto]: nuevo };
    });
  };

  // Modificar horas mediante teclado libremente
  const handleInputHoras = (proyecto, valor) => {
    const num = parseFloat(valor);
    if (isNaN(num)) {
      setHorasPorProyecto(prev => ({ ...prev, [proyecto]: 0 }));
      return;
    }
    const valorAjustado = Math.max(0, Math.round(num * 10) / 10);
    setHorasPorProyecto(prev => ({ ...prev, [proyecto]: valorAjustado }));
  };

  // Horas para tiempo al área (cuando no se agregan proyectos específicos)
  const handleCambiarHorasArea = (delta) => {
    setHorasArea(prev => Math.max(0.5, Math.round((prev + delta) * 10) / 10));
  };

  const handleInputHorasArea = (valor) => {
    const num = parseFloat(valor);
    if (isNaN(num)) {
      setHorasArea(0);
      return;
    }
    setHorasArea(Math.max(0.5, Math.round(num * 10) / 10));
  };

  // Cálculo de horas equitativas (reparte 8hs base o divide entre los ítems)
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

    if (cargarParaOtro && !usuarioSeleccionado) {
      setMensajeError('Por favor selecciona el empleado para quien estás cargando el reporte.');
      return;
    }

    // Validación de horas mínimas
    if (lugar !== 'Franco' && modoDivision === 'personalizado') {
      const total = getTotalHorasPersonalizadas();
      if (total <= 0) {
        setMensajeError('Debes asignar una cantidad de horas mayor a 0 a los proyectos trabajados.');
        return;
      }
    }

    setEnviando(true);

    try {
      let payload = {
        fecha,
        lugar
      };

      // Si es carga delegada de RRHH
      if (cargarParaOtro && usuarioSeleccionado) {
        payload.empleado = usuarioSeleccionado.nombre;
        payload.usuario_mail = usuarioSeleccionado.email || usuarioSeleccionado.mail || '';
      }

      // Si es rango de fechas (Campaña / Campo)
      if (esCampañaOCampo && usarRangoFechas && fechaFin) {
        payload.fecha_fin = fechaFin;
      }

      if (lugar === 'Franco') {
        payload.lugar = 'Franco';
      } else if (proyectosSeleccionados.length === 0) {
        // Sin proyectos específicos: Tiempo dedicado al área
        const h = modoDivision === 'equitativo' ? 8 : horasArea;
        const nombreServicio = esUsuarioAreaEspecial
          ? `Dedicado al área - ${areaElegida}`
          : 'Dedicado al área';

        payload.proyectos = [{ servicio: nombreServicio, horas: h }];
        payload.servicio = nombreServicio;
        payload.horas = h;
      } else {
        // Con uno o varios proyectos (incluyendo potencialmente Dedicado al área como ítem)
        if (modoDivision === 'equitativo') {
          const h = getHorasEquitativas();
          payload.proyectos = proyectosSeleccionados.map(p => ({
            servicio: p,
            horas: h
          }));
        } else {
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
          
          {/* SECCIÓN RRHH: Cargar para otro empleado */}
          {esRRHH && (
            <div style={{
              background: 'var(--bg-surface-hover)',
              border: '1px solid var(--border-input)',
              borderRadius: '8px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Gestión RRHH: Cargar reporte para otro empleado
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={cargarParaOtro}
                    onChange={(e) => {
                      setCargarParaOtro(e.target.checked);
                      if (!e.target.checked) setUsuarioSeleccionado(null);
                    }}
                  />
                  Activar
                </label>
              </div>

              {cargarParaOtro && (
                <div>
                  <select
                    className="form-select"
                    value={usuarioSeleccionado ? usuarioSeleccionado.dni : ''}
                    onChange={(e) => {
                      const u = todosUsuarios.find(x => x.dni === e.target.value);
                      setUsuarioSeleccionado(u || null);
                      setProyectosSeleccionados([]);
                      setHorasPorProyecto({});
                    }}
                  >
                    <option value="">-- Selecciona el empleado --</option>
                    {todosUsuarios.map(u => {
                      const nombreArea = MAPA_AREAS[u.area?.toUpperCase()] || u.area || 'Sin área';
                      return (
                        <option key={u.dni} value={u.dni}>
                          {u.nombre} ({nombreArea})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Fecha o Rango de Fechas */}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label className="form-label" htmlFor="fecha" style={{ margin: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {usarRangoFechas ? 'Rango de Jornadas' : 'Fecha de Jornada'}
              </label>

              {/* Toggle de Rango para Campaña / Campo */}
              {esCampañaOCampo && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#64748b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={usarRangoFechas}
                    onChange={(e) => setUsarRangoFechas(e.target.checked)}
                  />
                  <span>Rango múltiple</span>
                </label>
              )}
            </div>

            {usarRangoFechas && esCampañaOCampo ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Desde:</span>
                  <input
                    type="date"
                    className="form-input"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    disabled={enviando}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', display: 'block', marginBottom: '2px' }}>Hasta (inclusive):</span>
                  <input
                    type="date"
                    className="form-input"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    disabled={enviando}
                  />
                </div>
              </div>
            ) : (
              <input
                id="fecha"
                type="date"
                className="form-input"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={enviando}
              />
            )}
          </div>

          {/* Ubicación / Lugar */}
          <div className="form-group">
            <label className="form-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Ubicación / Modalidad
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
                    onClick={() => {
                      setLugar(item.id);
                      if (item.id !== 'Campaña / Campo') {
                        setUsarRangoFechas(false);
                      }
                    }}
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

          {/* FRANCO */}
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
              {/* Proyectos Activos */}
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                    Proyectos en los que se trabajó ({proyectosSeleccionados.length})
                  </label>

                  <button
                    type="button"
                    onClick={handleAgregarTiempoAreaBoton}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                    title="Agregar tiempo dedicado al área a la jornada"
                  >
                    + Dedicado al área
                  </button>
                </div>

                {/* Sub-selector de área corporativa para empleados de Aplicaciones (A), Núcleo (N) o RRHH */}
                {esUsuarioAreaEspecial && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-surface-hover)',
                    border: '1px solid var(--border-input)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    marginBottom: '8px'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      🏢 Área de dedicación ({MAPA_AREAS[areaActiva] || areaActiva}):
                    </span>
                    <select
                      className="form-select"
                      value={areaElegida}
                      onChange={(e) => setAreaElegida(e.target.value)}
                      style={{ width: 'auto', padding: '3px 8px', fontSize: '11.5px', height: '28px' }}
                    >
                      {LISTADO_AREAS_CORPORATIVAS.map(ar => (
                        <option key={ar} value={ar}>{ar}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Toggle para RRHH: Ver todos los proyectos */}
                {esRRHH && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={verTodosProyectos}
                        onChange={(e) => setVerTodosProyectos(e.target.checked)}
                      />
                      <span>Ver proyectos de todas las áreas</span>
                    </label>
                  </div>
                )}

                <select
                  className="form-select"
                  value=""
                  onChange={handleAgregarProyecto}
                  disabled={enviando || cargandoServicios}
                >
                  <option value="">
                    {cargandoServicios
                      ? 'Cargando proyectos...'
                      : '+ Seleccionar proyecto de la lista...'}
                  </option>
                  <option value="__OPCION_AREA__" style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                    ★ [Dedicado al área{esUsuarioAreaEspecial ? ` - ${areaElegida}` : ''}]
                  </option>
                  {serviciosDisponibles.map((srv) => (
                    <option key={srv} value={srv}>
                      {srv}
                    </option>
                  ))}
                </select>

                {/* Lista de proyectos seleccionados */}
                {proyectosSeleccionados.length === 0 ? (
                  <div className="empty-projects-notice">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <span>
                      Sin proyectos seleccionados: Se registrará como{' '}
                      <strong>{esUsuarioAreaEspecial ? `Dedicado al área (${areaElegida})` : 'Tiempo dedicado al Área'}</strong>.
                    </span>
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
                          title="Quitar ítem"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECCIÓN: Cómputo de horas */}
              <div className="division-section">
                <span className="division-title">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Distribución de horas trabajadas
                </span>

                <div className="division-modes-grid">
                  <button
                    type="button"
                    className={`division-mode-btn ${modoDivision === 'equitativo' ? 'selected' : ''}`}
                    onClick={() => setModoDivision('equitativo')}
                  >
                    <span className="division-mode-title">Dividir jornada</span>
                    <span className="division-mode-subtitle">Equitativo (8 hs base)</span>
                  </button>

                  <button
                    type="button"
                    className={`division-mode-btn ${modoDivision === 'personalizado' ? 'selected' : ''}`}
                    onClick={() => setModoDivision('personalizado')}
                  >
                    <span className="division-mode-title">Ingresar horas</span>
                    <span className="division-mode-subtitle">Libre por proyecto</span>
                  </button>
                </div>

                {/* Vista del desglose según el modo */}
                {modoDivision === 'equitativo' ? (
                  <div className="breakdown-list">
                    {proyectosSeleccionados.length === 0 ? (
                      <div className="breakdown-item">
                        <span>{esUsuarioAreaEspecial ? `Dedicado al área - ${areaElegida}` : 'Tiempo dedicado al Área'}</span>
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
                  /* Modo personalizado (sin límite de 8 horas) */
                  <div className="custom-hours-list">
                    {proyectosSeleccionados.length === 0 ? (
                      <div className="custom-hours-item">
                        <span className="custom-hours-name">
                          {esUsuarioAreaEspecial ? `Dedicado al área - ${areaElegida}` : 'Tiempo dedicado al Área'}
                        </span>
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
                            className="input-hours"
                            value={horasArea}
                            onChange={(e) => handleInputHorasArea(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-step"
                            onClick={() => handleCambiarHorasArea(0.5)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ) : (
                      proyectosSeleccionados.map((p) => {
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
                                className="input-hours"
                                value={valorActual}
                                onChange={(e) => handleInputHoras(p, e.target.value)}
                              />
                              <button
                                type="button"
                                className="btn-step"
                                onClick={() => handleCambiarHoras(p, 0.5)}
                                title="Sumar 0.5 hs"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Resumen de horas totales sin limitante restrictivo */}
                    {(() => {
                      const totalHs = getTotalHorasPersonalizadas();
                      return (
                        <div className="hours-total-bar">
                          <div className="hours-total-info">
                            <span className="hours-total-label">Total asignado:</span>
                            <span className="hours-total-value complete" style={{ fontSize: '13px', fontWeight: 700 }}>
                              {totalHs} hs
                            </span>
                          </div>
                          {totalHs >= 8 && (
                            <div style={{ fontSize: '11px', color: '#166534', marginTop: '3px' }}>
                              ✓ Jornada completa alcanzada
                            </div>
                          )}
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
                <span>
                  {esFranco
                    ? 'Registrar Franco (Descanso)'
                    : usarRangoFechas && esCampañaOCampo
                    ? 'Registrar Rango Campaña/Campo'
                    : 'Registrar Check Diario'}
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
