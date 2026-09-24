import { useState, useEffect } from 'react';
import { api } from '../services/apiBridge';

const LUGARES_BASE = [
  { id: 'Oficina', label: 'Oficina', labelRpg: '🏰 Ciudadela (Oficina)', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'Campaña / Campo', label: 'Campaña', labelRpg: '🌲 Expedición (Campaña)', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' },
  { id: 'Franco', label: 'Franco', labelRpg: '🍺 Taberna & Descanso', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }
];

const LUGARES_RRHH = [
  { id: 'Feriado Trabajado', label: 'Feriado Trabajado', labelRpg: '🎉 Feriado Trabajado', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'Vacaciones', label: 'Vacaciones', labelRpg: '🏖️ Vacaciones', icon: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' },
  { id: 'Licencia', label: 'Licencia', labelRpg: '📜 Licencia', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6' }
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

export default function CheckForm({ onRegistroGuardado, onVolver, tema }) {
  const isRpg = tema === 'rpg';

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
  const [tipoFranco, setTipoFranco] = useState('Franco de Oficina');
  const [proyectoFrancoObra, setProyectoFrancoObra] = useState('');
  const [proyectoFrancoOfic, setProyectoFrancoOfic] = useState('');
  const [proyectoFeriado, setProyectoFeriado] = useState('');
  const [horasFrancoTrabajado, setHorasFrancoTrabajado] = useState(8);
  const [horasFeriado, setHorasFeriado] = useState(8);
  const [tipoLicencia, setTipoLicencia] = useState('Médica');
  const [detalleLicencia, setDetalleLicencia] = useState('');

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

  // División de jornada: 'equitativo' o 'personalizado'
  const [modoDivision, setModoDivision] = useState('equitativo');
  const [horasPorProyecto, setHorasPorProyecto] = useState({}); // { [proyecto]: number }
  const [horasArea, setHorasArea] = useState(8);

  const [enviando, setEnviando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');
  const [mensajeError, setMensajeError] = useState('');

  // =========================================================================
  // VARIABLES DERIVADAS (Declaradas aquí para evitar errores TDZ antes de los hooks)
  // =========================================================================
  const esRRHH = (sesionUsuario?.area || '').toUpperCase() === 'RRHH';
  const empleadoActivoNombre = ((cargarParaOtro && usuarioSeleccionado)
    ? (usuarioSeleccionado.nombre || '')
    : (sesionUsuario?.nombre || '')).trim();
  const areaActiva = ((cargarParaOtro && usuarioSeleccionado)
    ? (usuarioSeleccionado.area || '')
    : (sesionUsuario?.area || '')).trim().toUpperCase();

  // Empleados exclusivos de oficina: Todo Mensura (M) y Camila Llovio (Ingeniería)
  // NOTA: La limitación NO aplica si el registro lo carga RRHH (RRHH tiene permisos completos)
  const esSoloOficina = !esRRHH && (
    areaActiva === 'M' ||
    areaActiva === 'MENSURA' ||
    empleadoActivoNombre.toLowerCase().includes('camila llovio') ||
    empleadoActivoNombre.toLowerCase().includes('llovio')
  );

  const esUsuarioAreaEspecial = ['N', 'RRHH', 'A'].includes(areaActiva);
  const areaNombreFinal = (esUsuarioAreaEspecial && areaElegida)
    ? areaElegida
    : (MAPA_AREAS[areaActiva] || areaActiva || 'General');
  const esCampañaOCampo = lugar === 'Campo' || lugar === 'Campaña / Campo';
  const esFranco = lugar === 'Franco';
  const esFeriadoTrabajado = lugar === 'Feriado Trabajado';
  const esVacaciones = lugar === 'Vacaciones';
  const esLicencia = lugar === 'Licencia';
  const esSinProyectos = esFranco || esVacaciones || esLicencia || esFeriadoTrabajado;
  const permitirRango = esSoloOficina ? false : (esCampañaOCampo || esRRHH);

  // 1. Cargar sesión de usuario
  useEffect(() => {
    async function cargarSesion() {
      try {
        const estado = await api.obtenerEstadoSesion();
        if (estado && estado.usuario) {
          setSesionUsuario(estado.usuario);
          const rolRRHH = (estado.usuario.area || '').toUpperCase() === 'RRHH';
          if (rolRRHH) {
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

  // Mantener consistencia para empleados de Mensura y Camila Llovio (solo Oficina y Franco de Oficina)
  useEffect(() => {
    if (esSoloOficina) {
      if (lugar !== 'Oficina' && lugar !== 'Franco') {
        setLugar('Oficina');
      }
      if (tipoFranco !== 'Franco de Oficina') {
        setTipoFranco('Franco de Oficina');
      }
      if (usarRangoFechas) {
        setUsarRangoFechas(false);
      }
    }
  }, [esSoloOficina, lugar, tipoFranco, usarRangoFechas]);

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

  // 2. Cargar lista de proyectos disponibles desde el backend
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

  // Manejo de Proyectos y Áreas dedicadas
  const handleAgregarProyecto = (e) => {
    const seleccionado = e.target.value;
    if (!seleccionado) return;

    let itemNombre = seleccionado;

    // Si seleccionó un área corporativa específica
    if (seleccionado.startsWith('__AREA__:')) {
      const nombreAr = seleccionado.replace('__AREA__:', '').trim();
      itemNombre = `Dedicado al área - ${nombreAr}`;
    } else if (seleccionado === '__OPCION_AREA__') {
      itemNombre = esUsuarioAreaEspecial
        ? `Dedicado al área - ${areaElegida}`
        : 'Dedicado al área';
    }

    if (!proyectosSeleccionados.includes(itemNombre)) {
      const nuevaLista = [...proyectosSeleccionados, itemNombre];
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
    e.target.value = '';
  };

  const handleAgregarAreaDirecta = (nombreAr) => {
    const itemNombre = `Dedicado al área - ${nombreAr}`;
    if (!proyectosSeleccionados.includes(itemNombre)) {
      const nuevaLista = [...proyectosSeleccionados, itemNombre];
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
  };

  const handleRemoverProyecto = (nombre) => {
    const nuevaLista = proyectosSeleccionados.filter(p => p !== nombre);
    setProyectosSeleccionados(nuevaLista);
    setHorasPorProyecto(prev => {
      const copia = { ...prev };
      delete copia[nombre];
      return copia;
    });
  };

  // Cálculo de horas
  const getHorasEquitativas = () => {
    if (proyectosSeleccionados.length === 0) return 8;
    return Number((8 / proyectosSeleccionados.length).toFixed(1));
  };

  const getTotalHoras = () => {
    if (proyectosSeleccionados.length === 0) return Math.max(0, horasArea);
    if (modoDivision === 'equitativo') return 8;
    const total = proyectosSeleccionados.reduce((acc, p) => acc + (Number(horasPorProyecto[p]) || 0), 0);
    return Math.round(total * 10) / 10;
  };

  const handleCambiarHoras = (proyecto, delta) => {
    setHorasPorProyecto(prev => {
      const actual = Number(prev[proyecto]) || getHorasEquitativas();
      const nuevo = Math.max(0.5, Math.round((actual + delta) * 10) / 10);
      return { ...prev, [proyecto]: nuevo };
    });
  };

  const handleInputHoras = (proyecto, valor) => {
    const num = parseFloat(valor);
    if (isNaN(num)) {
      setHorasPorProyecto(prev => ({ ...prev, [proyecto]: 0 }));
      return;
    }
    const valorAjustado = Math.max(0, Math.round(num * 10) / 10);
    setHorasPorProyecto(prev => ({ ...prev, [proyecto]: valorAjustado }));
  };

  const handleCambiarHorasArea = (delta) => {
    setHorasArea(prev => Math.max(0.5, Math.round((prev + delta) * 10) / 10));
  };

  // Envío del formulario
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

    if (esFranco && (tipoFranco === 'Franco de Obra' || tipoFranco === 'Franco Obra Trabajado') && !proyectoFrancoObra) {
      setMensajeError('Por favor selecciona el proyecto asignado al Franco de Obra.');
      return;
    }

    if (esFeriadoTrabajado && !proyectoFeriado) {
      setMensajeError('Por favor selecciona el proyecto asignado al Feriado Trabajado.');
      return;
    }

    if (!esSinProyectos && modoDivision === 'personalizado') {
      const total = getTotalHoras();
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

      if (cargarParaOtro && usuarioSeleccionado) {
        payload.empleado = usuarioSeleccionado.nombre;
        payload.usuario_mail = usuarioSeleccionado.email || usuarioSeleccionado.mail || '';
        payload.id_empleado = usuarioSeleccionado.id_origen || usuarioSeleccionado.id_usuario || '';
      }

      if (usarRangoFechas && fechaFin) {
        payload.fecha_fin = fechaFin;
      }

      if (esFranco) {
        payload.sub_franco = tipoFranco;
        if (tipoFranco === 'Franco de Obra') {
          payload.lugar = 'Franco';
          payload.tipo_ocf = 'Franco';
          payload.servicio = proyectoFrancoObra;
          payload.proyecto = proyectoFrancoObra;
          payload.horas = 0.0;
        } else if (tipoFranco === 'Franco Obra Trabajado') {
          payload.lugar = 'Franco Obra Trabajado';
          payload.tipo_ocf = 'Franco Obra Trabajado';
          payload.servicio = proyectoFrancoObra;
          payload.proyecto = proyectoFrancoObra;
          payload.horas = Number(horasFrancoTrabajado || 8);
        } else if (tipoFranco === 'Franco Ofic Trabajado') {
          payload.lugar = 'Franco Ofic Trabajado';
          payload.tipo_ocf = 'Franco Ofic Trabajado';
          const srv = proyectoFrancoOfic || areaNombreFinal;
          payload.servicio = srv;
          payload.proyecto = proyectoFrancoOfic || '';
          payload.area = areaNombreFinal;
          payload.horas = Number(horasFrancoTrabajado || 8);
        } else {
          // Franco de oficina / normal (0 hs, servicio = area)
          payload.lugar = 'Franco';
          payload.tipo_ocf = 'Franco';
          payload.servicio = areaNombreFinal;
          payload.area = areaNombreFinal;
          payload.horas = 0.0;
        }
      } else if (esFeriadoTrabajado) {
        payload.lugar = 'Feriado Trabajado';
        payload.tipo_ocf = 'Feriado Trabajado';
        payload.servicio = proyectoFeriado;
        payload.proyecto = proyectoFeriado;
        payload.feriado = 'SI';
        payload.horas = Number(horasFeriado || 8);
      } else if (esVacaciones) {
        payload.lugar = 'Vacaciones';
        payload.servicio = 'Vacaciones';
        payload.horas = 0.0;
      } else if (esLicencia) {
        const descLic = tipoLicencia === 'Otra' ? (detalleLicencia.trim() || 'Especial') : tipoLicencia;
        payload.lugar = 'Licencia';
        payload.tipo_licencia = descLic;
        payload.servicio = `Licencia - ${descLic}`;
        payload.horas = 0.0;
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
        const msg = isRpg 
          ? '🏆 ¡Misión sellada con honores! EXP acumulada en el Gremio Ingeap.' 
          : (res.mensaje || '¡Check diario guardado con éxito!');
        setMensajeExito(msg);
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

  const totalHs = getTotalHoras();

  return (
    <div className={`view-content checkform-container ${isRpg ? 'rpg-board-viewport rpg-table-desk' : ''}`}>
      {/* Barra superior de navegación */}
      {onVolver && (
        <div className={`view-header-bar ${isRpg ? 'rpg-parchment-nav' : ''}`}>
          <button type="button" className={`btn-back ${isRpg ? 'rpg-wood-btn' : ''}`} onClick={onVolver}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>{isRpg ? '↩ Volver al Tablón' : 'Inicio'}</span>
          </button>
          <span className={`view-header-title ${isRpg ? 'rpg-nav-title' : ''}`}>
            {isRpg ? '📜 Contrato de Misión Diaria' : 'Cargar Reporte Diario'}
          </span>
        </div>
      )}

      <div className={`form-card clean-form-card ${isRpg ? 'rpg-scroll-parchment' : ''}`}>
        {isRpg && (
          <>
            <div className="rpg-tack tack-tl" />
            <div className="rpg-tack tack-tr" />
            <div className="rpg-tack tack-bl" />
            <div className="rpg-tack tack-br" />

            <div className="rpg-scroll-banner-top">
              <div className="rpg-scroll-crest">📜</div>
              <div className="rpg-scroll-titles">
                <h3 className="rpg-scroll-main-title">CONTRATO DE MISIÓN DIARIA</h3>
                <span className="rpg-scroll-sub-title">GREMIO INGEAP • REGISTRA TUS HAZAÑAS DEL CICLO SOLAR</span>
              </div>
            </div>
          </>
        )}
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

        <form onSubmit={handleSubmit} className="clean-form">

          {/* GESTIÓN RRHH: Acordeón discreto */}
          {esRRHH && (
            <div className={`rrhh-card ${cargarParaOtro ? 'active' : ''}`}>
              <div className="rrhh-header" onClick={() => setCargarParaOtro(!cargarParaOtro)}>
                <div className="rrhh-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span>Cargar reporte para otro empleado (RRHH)</span>
                </div>
                <input
                  type="checkbox"
                  checked={cargarParaOtro}
                  onChange={(e) => {
                    e.stopPropagation();
                    setCargarParaOtro(e.target.checked);
                    if (!e.target.checked) setUsuarioSeleccionado(null);
                  }}
                  className="rrhh-checkbox"
                />
              </div>

              {cargarParaOtro && (
                <div className="rrhh-body">
                  <select
                    className="form-select form-select-clean"
                    value={usuarioSeleccionado ? usuarioSeleccionado.dni : ''}
                    onChange={(e) => {
                      const u = todosUsuarios.find(x => x.dni === e.target.value);
                      setUsuarioSeleccionado(u || null);
                      setProyectosSeleccionados([]);
                      setHorasPorProyecto({});
                    }}
                  >
                    <option value="">-- Seleccionar empleado --</option>
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

          {/* SECCIÓN 1: CUÁNDO Y DÓNDE / REINO Y CAMPAMENTO */}
          <div className="form-section-card">
            <div className="form-section-header">
              <span className="form-section-tag">{isRpg ? 'Fase I' : 'Paso 1'}</span>
              <span className="form-section-title">
                {isRpg ? '🗺️ Territorio y Modalidad' : 'Fecha y Modalidad'}
              </span>
            </div>

            {/* Fecha */}
            <div className="form-group-clean">
              <div className="form-group-label-row">
                <label className="form-label-clean" htmlFor="fecha">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>{isRpg ? 'Ciclo Solar (Fecha)' : (usarRangoFechas ? 'Rango de fechas' : 'Fecha')}</span>
                </label>

                {permitirRango && (
                  <label className="range-toggle-label">
                    <input
                      type="checkbox"
                      checked={usarRangoFechas}
                      onChange={(e) => setUsarRangoFechas(e.target.checked)}
                    />
                    <span>Rango múltiple</span>
                  </label>
                )}
              </div>

              {usarRangoFechas && permitirRango ? (
                <div className="range-inputs-grid">
                  <div>
                    <span className="input-sublabel">Desde:</span>
                    <input
                      type="date"
                      className="form-input form-input-clean"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      disabled={enviando}
                    />
                  </div>
                  <div>
                    <span className="input-sublabel">Hasta:</span>
                    <input
                      type="date"
                      className="form-input form-input-clean"
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
                  className="form-input form-input-clean"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  disabled={enviando}
                />
              )}
            </div>

            {/* Modalidad / Ubicación: Selector segmentado estilizado */}
            <div className="form-group-clean">
              <label className="form-label-clean">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{isRpg ? 'Puesto de Misión' : 'Modalidad'}</span>
              </label>

              <div className="segmented-modalidad-grid">
                {(esSoloOficina
                  ? LUGARES_BASE.filter((i) => i.id === 'Oficina' || i.id === 'Franco')
                  : (esRRHH ? [...LUGARES_BASE, ...LUGARES_RRHH] : LUGARES_BASE)
                ).map((item) => {
                  const isSelected = lugar === item.id;
                  const isFrancoItem = item.id === 'Franco';
                  const isVacacionesItem = item.id === 'Vacaciones';
                  const isLicenciaItem = item.id === 'Licencia';
                  const isFeriadoItem = item.id === 'Feriado Trabajado';
                  const labelText = isRpg ? item.labelRpg : item.label;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`seg-btn ${
                        isSelected 
                          ? (isFrancoItem ? 'seg-franco' : isVacacionesItem ? 'seg-vacaciones' : isLicenciaItem ? 'seg-licencia' : isFeriadoItem ? 'seg-feriado' : 'seg-active') 
                          : ''
                      }`}
                      onClick={() => {
                        setLugar(item.id);
                        if (!esRRHH && item.id !== 'Campo' && item.id !== 'Campaña / Campo') {
                          setUsarRangoFechas(false);
                        }
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={item.icon} />
                      </svg>
                      <span>{labelText}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SI ES FRANCO, FERIADO TRABAJADO, VACACIONES O LICENCIA */}
          {esFranco ? (
            <div className="franco-serene-card">
              <div className="franco-serene-icon">☕</div>
              <div className="franco-serene-body" style={{ width: '100%' }}>
                <h4>{isRpg ? 'Campamento en la Taberna del Reino' : 'Día de Descanso / Franco'}</h4>
                <p>
                  {esSoloOficina
                    ? (isRpg ? 'Descanso de la Orden en la Ciudadela (0 hs imputadas al área).' : 'Franco de oficina (0 hs imputadas al área de adscripción).')
                    : (isRpg ? 'Define la modalidad del franco a registrar:' : 'Selecciona la categoría de franco a registrar:')
                  }
                </p>

                {/* Sub-selector de Franco (Oculto para empleados exclusivos de oficina: Mensura y Camila Llovio) */}
                {!esSoloOficina && (
                  <div className="franco-subtypes-grid">
                  {[
                    { id: 'Franco de Oficina', label: 'Franco de oficina', desc: '0 hs • Imputa al área' },
                    { id: 'Franco de Obra', label: 'Franco de obra', desc: '0 hs • Imputa al proyecto' },
                    { id: 'Franco Ofic Trabajado', label: 'Franco ofic. trabajado', desc: 'Computa hs • Oficina / Área' },
                    { id: 'Franco Obra Trabajado', label: 'Franco obra trabajado', desc: 'Computa hs • Imputa a obra' }
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      className={`franco-sub-btn ${tipoFranco === sub.id ? 'active' : ''}`}
                      onClick={() => setTipoFranco(sub.id)}
                    >
                      <span className="franco-sub-title">{sub.label}</span>
                      <span className="franco-sub-desc">{sub.desc}</span>
                    </button>
                  ))}
                  </div>
                )}

                {tipoFranco === 'Franco de Oficina' && (
                  <div className="franco-hours-box" style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginTop: '8px' }}>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                      Asignación: Se registrará en la columna de servicio el área <strong>{areaNombreFinal}</strong> con 0 hs computadas.
                    </span>
                  </div>
                )}

                {(tipoFranco === 'Franco de Obra' || tipoFranco === 'Franco Obra Trabajado') && (
                  <div className="franco-hours-box">
                    <label className="form-label-clean">
                      Proyecto asignado al Franco de Obra: <strong className="required">*</strong>
                    </label>
                    <select
                      className="form-select form-select-clean"
                      style={{ marginTop: '4px' }}
                      value={proyectoFrancoObra}
                      onChange={(e) => setProyectoFrancoObra(e.target.value)}
                      required
                    >
                      <option value="">-- Seleccionar proyecto asignado --</option>
                      {serviciosDisponibles.map((srv, idx) => (
                        <option key={idx} value={srv}>{srv}</option>
                      ))}
                    </select>
                  </div>
                )}

                {tipoFranco === 'Franco Obra Trabajado' && (
                  <div className="franco-hours-box" style={{ marginTop: '8px' }}>
                    <label className="form-label-clean">
                      Horas de Franco de Obra Trabajado:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        step="0.5"
                        className="form-input form-input-clean"
                        style={{ maxWidth: '120px' }}
                        value={horasFrancoTrabajado}
                        onChange={(e) => setHorasFrancoTrabajado(Number(e.target.value) || 0)}
                      />
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>hs imputadas</span>
                    </div>
                  </div>
                )}

                {tipoFranco === 'Franco Ofic Trabajado' && (
                  <div className="franco-hours-box">
                    <label className="form-label-clean">
                      Horas de Franco de Oficina Trabajado:
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        step="0.5"
                        className="form-input form-input-clean"
                        style={{ maxWidth: '120px' }}
                        value={horasFrancoTrabajado}
                        onChange={(e) => setHorasFrancoTrabajado(Number(e.target.value) || 0)}
                      />
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>hs imputadas</span>
                    </div>

                    <div style={{ marginTop: '10px' }}>
                      <label className="form-label-clean">
                        Proyecto asignado (opcional, por defecto imputa a {areaNombreFinal}):
                      </label>
                      <select
                        className="form-select form-select-clean"
                        style={{ marginTop: '4px' }}
                        value={proyectoFrancoOfic}
                        onChange={(e) => setProyectoFrancoOfic(e.target.value)}
                      >
                        <option value="">-- Imputar a Área ({areaNombreFinal}) --</option>
                        {serviciosDisponibles.map((srv, idx) => (
                          <option key={idx} value={srv}>{srv}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : esFeriadoTrabajado ? (
            <div className="feriado-trabajado-card">
              <div className="feriado-icon">🎉</div>
              <div className="feriado-body" style={{ width: '100%' }}>
                <h4>Feriado Trabajado</h4>
                <p>Registro de feriado trabajado con cómputo de horas laborales e imputación a proyecto.</p>

                <div className="form-group-clean" style={{ marginTop: '10px' }}>
                  <label className="form-label-clean">Proyecto asignado al Feriado Trabajado: <strong className="required">*</strong></label>
                  <select
                    className="form-select form-select-clean"
                    style={{ marginTop: '4px' }}
                    value={proyectoFeriado}
                    onChange={(e) => setProyectoFeriado(e.target.value)}
                    required
                  >
                    <option value="">-- Seleccionar proyecto asignado --</option>
                    {serviciosDisponibles.map((srv, idx) => (
                      <option key={idx} value={srv}>{srv}</option>
                    ))}
                  </select>
                </div>

                <div className="feriado-hours-box" style={{ marginTop: '10px' }}>
                  <label className="form-label-clean">Horas de Feriado Trabajado:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      step="0.5"
                      className="form-input form-input-clean"
                      style={{ maxWidth: '120px' }}
                      value={horasFeriado}
                      onChange={(e) => setHorasFeriado(Number(e.target.value) || 0)}
                    />
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>hs imputadas</span>
                  </div>
                </div>
              </div>
            </div>
          ) : esVacaciones ? (
            <div className="vacaciones-serene-card">
              <div className="vacaciones-serene-icon">🏖️</div>
              <div className="vacaciones-serene-body">
                <h4>{isRpg ? 'Vacaciones del Aventurero' : 'Período de Vacaciones'}</h4>
                <p>
                  Registro oficial de vacaciones. Se computarán las fechas seleccionadas con 0 hs sin requerir imputación de proyectos.
                </p>
              </div>
            </div>
          ) : esLicencia ? (
            <div className="licencia-card">
              <div className="licencia-header">
                <span className="licencia-icon">📋</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Registro de Licencia</h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Indica el tipo o motivo de la licencia otorgada:</p>
                </div>
              </div>
              <div className="licencia-body" style={{ marginTop: '12px' }}>
                <div className="form-group-clean">
                  <label className="form-label-clean">Tipo de Licencia:</label>
                  <select
                    className="form-select form-select-clean"
                    value={tipoLicencia}
                    onChange={(e) => setTipoLicencia(e.target.value)}
                  >
                    <option value="Médica">Médica / Salud</option>
                    <option value="Especial">Especial</option>
                    <option value="Estudio / Examen">Estudio / Examen</option>
                    <option value="Maternidad / Paternidad">Maternidad / Paternidad</option>
                    <option value="Duelo">Duelo familiar</option>
                    <option value="Gremial">Gremial</option>
                    <option value="Otra">Otra (especificar detalle)...</option>
                  </select>
                </div>
                {tipoLicencia === 'Otra' && (
                  <div className="form-group-clean" style={{ marginTop: '8px' }}>
                    <label className="form-label-clean">Detalle / Motivo:</label>
                    <input
                      type="text"
                      className="form-input form-input-clean"
                      placeholder="Ej: Licencia sin goce de sueldo, etc."
                      value={detalleLicencia}
                      onChange={(e) => setDetalleLicencia(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* SECCIÓN 2: ACTIVIDAD Y PROYECTOS / HAZAÑAS */
            <div className="form-section-card">
              <div className="form-section-header">
                <span className="form-section-tag">{isRpg ? 'Fase II' : 'Paso 2'}</span>
                <span className="form-section-title">
                  {isRpg ? '⚔️ Misiones y Gremios Aliados' : 'Proyectos y Dedicación'} {proyectosSeleccionados.length > 0 && `(${proyectosSeleccionados.length})`}
                </span>
              </div>

              {/* Selector desplegable de proyectos y áreas corporativas múltiples */}
              <div className="form-group-clean">
                <div className="form-group-label-row">
                  <span className="form-label-clean">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                    <span>
                      {proyectosSeleccionados.length === 0
                        ? (isRpg ? '¿En qué misiones luchaste?' : '¿Trabajaste en proyectos o áreas específicas?')
                        : (isRpg ? '+ Sumar otra misión o gremio' : '+ Agregar otro proyecto o área')}
                    </span>
                  </span>

                  {esRRHH && (
                    <label className="range-toggle-label">
                      <input
                        type="checkbox"
                        checked={verTodosProyectos}
                        onChange={(e) => setVerTodosProyectos(e.target.checked)}
                      />
                      <span>Todas las áreas</span>
                    </label>
                  )}
                </div>

                <select
                  className="form-select form-select-clean"
                  value=""
                  onChange={handleAgregarProyecto}
                  disabled={enviando || cargandoServicios}
                >
                  <option value="">
                    {cargandoServicios
                      ? 'Cargando opciones...'
                      : isRpg
                      ? '+ Seleccionar misión o gremio aliado...'
                      : '+ Seleccionar de la lista...'}
                  </option>

                  {/* Si es A, N o RRHH: Permite elegir libremente entre todas las áreas corporativas */}
                  {esUsuarioAreaEspecial ? (
                    <optgroup label="🏢 Dedicación a Áreas Internas">
                      {LISTADO_AREAS_CORPORATIVAS.map(ar => (
                        <option key={ar} value={`__AREA__:${ar}`}>
                          🏢 Dedicado al área - {ar}
                        </option>
                      ))}
                    </optgroup>
                  ) : (
                    <option value="__OPCION_AREA__">
                      🏢 ★ Dedicado al área habitual
                    </option>
                  )}

                  <optgroup label="📁 Proyectos Activos">
                    {serviciosDisponibles.map((srv) => (
                      <option key={srv} value={srv}>
                        {srv}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* CASO A: Sin proyectos/áreas agregadas -> Dedicación habitual */}
              {proyectosSeleccionados.length === 0 ? (
                <div className="area-default-card">
                  <div className="area-default-top">
                    <div className="area-default-badge">
                      <span className="dot-green" />
                      <span>{isRpg ? 'Misión de Gremio' : 'Jornada Habitual'}</span>
                    </div>
                    <div className="stepper-compact">
                      <button
                        type="button"
                        className="btn-step-compact"
                        onClick={() => handleCambiarHorasArea(-0.5)}
                        disabled={horasArea <= 0.5}
                        title="Restar 0.5 hs"
                      >
                        -
                      </button>
                      <span className="area-default-hours">{horasArea} hs</span>
                      <button
                        type="button"
                        className="btn-step-compact"
                        onClick={() => handleCambiarHorasArea(0.5)}
                        title="Sumar 0.5 hs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="area-default-name">
                    {isRpg ? 'Dedicado a tareas de la Orden' : 'Dedicado a tareas de área'}
                  </div>

                  {esUsuarioAreaEspecial && (
                    <div className="area-subselect-row">
                      <span className="area-subselect-label">
                        {isRpg ? '🏛️ Gremio:' : '🏢 Imputar a:'}
                      </span>
                      <select
                        className="form-select-inline"
                        value={areaElegida}
                        onChange={(e) => setAreaElegida(e.target.value)}
                      >
                        {LISTADO_AREAS_CORPORATIVAS.map(ar => (
                          <option key={ar} value={ar}>{ar}</option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="btn-add-extra-area"
                        onClick={() => handleAgregarAreaDirecta(areaElegida)}
                        title="Agregar como ítem para poder combinarlo con más áreas"
                      >
                        + Sumar otra área
                      </button>
                    </div>
                  )}

                  <div className="area-default-footer">
                    <span>
                      {isRpg
                        ? 'Se registrará tu jornada completa para el gremio (+800 EXP). Si luchaste en obras o proyectos específicos, selecciónalos arriba.'
                        : 'Se registrará tu jornada completa asignada al área. Si trabajaste en una obra o proyecto, selecciónalo arriba.'}
                    </span>
                  </div>
                </div>
              ) : (
                /* CASO B: Proyectos o Múltiples Áreas seleccionadas */
                <div className="projects-active-wrapper">
                  {/* Selector de modo si son 2 o más ítems */}
                  {proyectosSeleccionados.length >= 2 && (
                    <div className="division-toggle-bar">
                      <button
                        type="button"
                        className={`division-toggle-btn ${modoDivision === 'equitativo' ? 'active' : ''}`}
                        onClick={() => setModoDivision('equitativo')}
                      >
                        {isRpg ? '⚖️ Reparto de Botín (8 hs)' : '⚖️ Dividir equitativo (8 hs)'}
                      </button>
                      <button
                        type="button"
                        className={`division-toggle-btn ${modoDivision === 'personalizado' ? 'active' : ''}`}
                        onClick={() => setModoDivision('personalizado')}
                      >
                        {isRpg ? '🗡️ Puntos de Esfuerzo' : '✏️ Ajustar por ítem'}
                      </button>
                    </div>
                  )}

                  {/* Lista de proyectos y áreas añadidas */}
                  <div className="projects-streamlined-list">
                    {proyectosSeleccionados.map((p) => {
                      const horasItem = modoDivision === 'equitativo'
                        ? getHorasEquitativas()
                        : (horasPorProyecto[p] ?? getHorasEquitativas());

                      const esAreaItem = p.startsWith('Dedicado al área');

                      return (
                        <div key={p} className={`project-row-item ${esAreaItem ? 'area-item-highlight' : ''}`}>
                          <div className="project-row-info">
                            <span className="project-row-name" title={p}>
                              {esAreaItem ? `🏢 ${p.replace('Dedicado al área - ', 'Área: ')}` : p}
                            </span>
                            {modoDivision === 'equitativo' && (
                              <span className="project-row-badge-hours">{horasItem} hs</span>
                            )}
                          </div>

                          {modoDivision === 'personalizado' && (
                            <div className="stepper-compact">
                              <button
                                type="button"
                                className="btn-step-compact"
                                onClick={() => handleCambiarHoras(p, -0.5)}
                                disabled={Number(horasItem) <= 0.5}
                              >
                                -
                              </button>
                              <input
                                type="number"
                                step="0.5"
                                min="0.5"
                                className="input-step-compact"
                                value={horasItem}
                                onChange={(e) => handleInputHoras(p, e.target.value)}
                              />
                              <button
                                type="button"
                                className="btn-step-compact"
                                onClick={() => handleCambiarHoras(p, 0.5)}
                              >
                                +
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            className="btn-del-project"
                            onClick={() => handleRemoverProyecto(p)}
                            title="Quitar ítem"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resumen total de horas */}
                  <div className="hours-summary-strip">
                    <span className="hours-summary-label">
                      {isRpg ? '✨ Esfuerzo Heroico:' : 'Total asignado:'}
                    </span>
                    <span className="hours-summary-value">{totalHs} hs</span>
                    {totalHs >= 8 && (
                      <span className="hours-summary-tag">
                        {isRpg ? `🏆 ¡Quest Cumplida! (+${Math.round(totalHs * 100)} EXP)` : '✓ Completa'}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BOTÓN DE CONFIRMACIÓN */}
          <button type="submit" className="btn-submit btn-submit-spacious" disabled={enviando}>
            {enviando ? (
              <>
                <div className="spinner" />
                <span>{isRpg ? 'Conjurando registro...' : 'Guardando...'}</span>
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
                    ? (isRpg ? '🍺 Descansar en la Posada' : 'Registrar Franco (Descanso)')
                    : esVacaciones
                    ? (usarRangoFechas ? 'Registrar Período de Vacaciones' : 'Registrar Vacaciones')
                    : esLicencia
                    ? (usarRangoFechas ? 'Registrar Período de Licencia' : 'Registrar Licencia')
                    : usarRangoFechas && esCampañaOCampo
                    ? (isRpg ? '🌲 Registrar Gran Expedición' : 'Registrar Rango Campo')
                    : usarRangoFechas
                    ? `Registrar Rango (${lugar})`
                    : (isRpg ? `⚡ ¡Sellar Misión Diaria! (+${Math.round(totalHs * 100)} EXP)` : 'Registrar Check Diario')}
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
