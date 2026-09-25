import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';
import { puedeVerHistorialOtros, puedeModificarRegistro } from '../utils/permissions';

// [MOD-02] HistoryView

// Iconos vectoriales medievales para garantizar renderizado perfecto sin depender de compatibilidad de emojis
const QuillIcon = ({ size = 16, color = "#78350f" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
    <line x1="16" y1="8" x2="2" y2="22" />
    <line x1="17.5" y1="15" x2="9" y2="15" />
  </svg>
);

const CalendarRpgIcon = ({ size = 16, color = "#78350f" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);


export const getTagAutorInfo = (item, usuario) => {
  const cargadoPor = (item?.cargado_por || '').trim();
  const nombreUsuario = (usuario?.nombre || '').trim().toLowerCase();
  const nombreEmpleado = (item?.empleado || '').trim().toLowerCase();

  const esPropio = !cargadoPor || 
                   (nombreUsuario && cargadoPor.toLowerCase() === nombreUsuario) ||
                   (nombreEmpleado && cargadoPor.toLowerCase() === nombreEmpleado);

  if (esPropio) {
    return {
      tipo: 'propia',
      label: 'Cargado por mí',
      badgeClass: 'badge-autor-propia'
    };
  }

  const esRRHH = cargadoPor.toLowerCase().includes('rrhh');
  return {
    tipo: 'rrhh',
    label: esRRHH ? 'Cargado por RRHH' : `Cargado por ${cargadoPor}`,
    badgeClass: 'badge-autor-rrhh'
  };
};

const LUGARES_OPCIONES = [
  'Oficina',
  'Campo',
  'Roster',
  'Franco',
  'Franco Obra',
  'Franco Ofic Trabajado',
  'Franco Obra Trabajado',
  'Feriado Trabajado',
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
  const [filtroOrigen, setFiltroOrigen] = useState('todos'); // 'todos' | 'propios' | 'rrhh'

  // Estado del calendario mensual
  const [fechaCalendario, setFechaCalendario] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });

  // Estado para la carga asistida de fines de semana (RRHH y Aplicaciones)
  const [modalFinesDeSemanaOpen, setModalFinesDeSemanaOpen] = useState(false);
  const [cargandoFinesDeSemana, setCargandoFinesDeSemana] = useState(false);
  const [finesDeSemanaPendientes, setFinesDeSemanaPendientes] = useState([]);
  const [finesDeSemanaTotalMes, setFinesDeSemanaTotalMes] = useState(0);
  const [nombreMesFinesDeSemana, setNombreMesFinesDeSemana] = useState('');

  const areaUsuarioUpper = (usuario?.area || '').toUpperCase().trim();
  const esRRHHoAplicaciones = areaUsuarioUpper === 'RRHH' || areaUsuarioUpper === 'A' || areaUsuarioUpper === 'APLICACIONES';

  const handleAbrirModalFinesDeSemana = () => {
    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();

    const nombresMeses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const nombreMes = nombresMeses[mesActual];
    setNombreMesFinesDeSemana(`${nombreMes} ${anioActual}`);

    const diasEnMes = new Date(anioActual, mesActual + 1, 0).getDate();
    const todosFDS = [];

    for (let d = 1; d <= diasEnMes; d++) {
      const f = new Date(anioActual, mesActual, d);
      const dow = f.getDay(); // 0 = Domingo, 6 = Sábado
      if (dow === 0 || dow === 6) {
        const mStr = String(mesActual + 1).padStart(2, '0');
        const dStr = String(d).padStart(2, '0');
        const fechaIso = `${anioActual}-${mStr}-${dStr}`;
        const nombreDia = dow === 6 ? 'Sábado' : 'Domingo';
        todosFDS.push({
          fecha: fechaIso,
          dia: d,
          nombreDia: nombreDia,
          label: `${nombreDia} ${dStr}/${mStr}`
        });
      }
    }

    setFinesDeSemanaTotalMes(todosFDS.length);

    // Fechas que ya tienen registro en el historial
    const fechasRegistradas = new Set(registros.map((r) => r.fecha));
    const pendientes = todosFDS.filter((fds) => !fechasRegistradas.has(fds.fecha));

    if (pendientes.length === 0) {
      alert(`¡Excelente! Todos los fines de semana de ${nombreMes} ${anioActual} (${todosFDS.length} días) ya están registrados.`);
      return;
    }

    setFinesDeSemanaPendientes(pendientes);
    setModalFinesDeSemanaOpen(true);
  };

  const handleConfirmarFinesDeSemana = async () => {
    if (finesDeSemanaPendientes.length === 0) return;
    setCargandoFinesDeSemana(true);

    try {
      const areaDestino = areaUsuarioUpper === 'RRHH' ? 'RRHH' : 'Aplicaciones';
      const fechasArray = finesDeSemanaPendientes.map((f) => f.fecha);

      const payload = {
        fecha: fechasArray[0],
        lugar: 'Franco',
        tipo_ocf: 'Franco',
        tipo_franco: 'Franco de Oficina',
        sub_franco: 'Franco de Oficina',
        area: areaDestino,
        servicio: areaDestino,
        horas: 0.0,
        fechas: fechasArray,
        empleado: usuario?.nombre || '',
        usuario_mail: usuario?.email || usuario?.mail || '',
        id_empleado: usuario?.id_origen || usuario?.id_usuario || ''
      };

      const res = await api.guardarCheckDiario(payload);
      if (res && res.exito) {
        setModalFinesDeSemanaOpen(false);
        setMensajeSync({
          tipo: 'exito',
          texto: `✓ Se registraron exitosamente ${fechasArray.length} fines de semana como Franco.`
        });
        await cargarHistorial();
      } else {
        alert(res?.error || 'No se pudieron registrar los fines de semana.');
      }
    } catch (err) {
      console.error('Error al registrar fines de semana:', err);
      alert('Error de conexión al registrar los fines de semana.');
    } finally {
      setCargandoFinesDeSemana(false);
    }
  };

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

    if (!puedeModificarRegistro(usuario, registroEditando)) {
      alert('Solo Justina Bertolozzi e Iván Valentin pueden modificar registros de otros empleados.');
      setRegistroEditando(null);
      return;
    }

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
      if (filtroOrigen && filtroOrigen !== 'todos') {
        const tag = getTagAutorInfo(item, usuario);
        if (filtroOrigen === 'propios' && tag.tipo !== 'propia') return false;
        if (filtroOrigen === 'rrhh' && tag.tipo !== 'rrhh') return false;
      }
      if (busquedaTexto) {
        const q = busquedaTexto.toLowerCase();
        const srv = (item.servicio || '').toLowerCase();
        const lug = (item.tipo_ocf || item.lugar || '').toLowerCase();
        const fec = (item.fecha || '').toLowerCase();
        const cpor = (item.cargado_por || '').toLowerCase();
        if (!srv.includes(q) && !lug.includes(q) && !fec.includes(q) && !cpor.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [registros, diaSeleccionado, busquedaTexto, filtroOrigen, usuario]);

  // Generador de días del mes para el calendario
  const diasMesCalendario = useMemo(() => {
    const anio = fechaCalendario.getFullYear();
    const mes = fechaCalendario.getMonth(); // 0-indexed

    const primerDiaMes = new Date(anio, mes, 1);
    const ultimoDiaMes = new Date(anio, mes + 1, 0);
    const totalDias = ultimoDiaMes.getDate();

    let diaInicioSemana = primerDiaMes.getDay() - 1;
    if (diaInicioSemana === -1) diaInicioSemana = 6;

    const celdas = [];
    for (let i = 0; i < diaInicioSemana; i++) {
      celdas.push({ esVacio: true, id: `prev-${i}` });
    }

    const hoyStr = new Date().toISOString().split('T')[0];

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

  const getBadgeClassLugar = (lugar, servicio = '') => {
    const l = (lugar || '').toLowerCase().trim();
    const s = (servicio || '').toLowerCase().trim();
    if (l === 'franco obra' || l === 'franco de obra' || s.includes('franco de obra')) {
      return 'badge-modalidad-franco-obra';
    }
    if (l === 'franco obra trabajado') {
      return 'badge-modalidad-franco-obra-trabajado';
    }
    if (l === 'franco ofic trabajado' || s === 'franco trabajado' || (l === 'franco' && s.includes('trabajado'))) {
      return 'badge-modalidad-franco-ofic-trabajado';
    }
    if (l === 'feriado trabajado' || l.includes('feriado')) {
      return 'badge-modalidad-feriado-trabajado';
    }
    if (l.includes('oficina')) return 'badge-modalidad-oficina';
    if (l.includes('campo') || l.includes('campaña') || l.includes('roster') || l.includes('obra')) return 'badge-modalidad-campo';
    if (l.includes('franco')) return 'badge-modalidad-franco';
    if (l.includes('vacaciones')) return 'badge-modalidad-vacaciones';
    if (l.includes('licencia')) return 'badge-modalidad-licencia';
    return 'badge-modalidad-oficina';
  };

  const pendientesCount = registros.filter((r) => r.sincronizado === 0).length;

  // Renderizado interior de la vista dividida
  const contenidoPrincipal = (
    <>
      {/* Barra superior de navegación / acciones */}
      <div className={`view-header-bar ${isRpg ? 'rpg-nav-toolbar' : 'history-header-bar'}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onVolver && (
            <button
              type="button"
              className={isRpg ? 'rpg-wood-btn' : 'btn-back'}
              onClick={onVolver}
              title={isRpg ? 'Regresar a la Taberna' : 'Volver al Inicio'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>{isRpg ? 'Taberna' : 'Inicio'}</span>
            </button>
          )}

          {!isRpg && (
            <div className="history-title-block">
              <span className="history-main-title">Historial de Registros</span>
              <span className="history-sub-title">Pantalla dividida con vista de lista y calendario mensual</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {puedeVerHistorialOtros(usuario) && onHistorialOtrosEmpleados && (
            <button
              type="button"
              className={isRpg ? 'rpg-wood-btn' : 'btn-action-ghost'}
              onClick={onHistorialOtrosEmpleados}
              title="Ver registros que has cargado para otros empleados"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>{isRpg ? 'Crónicas de Colegas' : 'Historial Otros Empleados'}</span>
            </button>
          )}

          {esRRHHoAplicaciones && (
            <button
              type="button"
              className={isRpg ? 'rpg-wood-btn' : 'btn-action-ghost'}
              onClick={handleAbrirModalFinesDeSemana}
              title="Cargar automáticamente los sábados y domingos del mes actual como Franco"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{isRpg ? 'Descanso Fines de Semana' : 'Fines de Semana a Franco'}</span>
            </button>
          )}

          {onNuevoReporte && (
            <button
              type="button"
              className={isRpg ? 'rpg-wood-btn rpg-wood-btn-primary' : 'btn-action-primary'}
              onClick={onNuevoReporte}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>{isRpg ? 'Sellar Nueva Misión' : 'Nuevo Check'}</span>
            </button>
          )}

          {pendientesCount > 0 && (
            <button
              type="button"
              className={isRpg ? 'rpg-wood-btn' : 'btn-sync'}
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
            className={isRpg ? 'rpg-wood-btn' : 'btn-refresh'}
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
      <div className={`history-split-grid ${isRpg ? 'rpg-history-split-grid' : ''}`}>
        
        {/* PANEL IZQUIERDO: LISTADO DE REGISTROS */}
        <div className={`history-list-panel ${isRpg ? 'history-rpg-parchment rpg-pinned-parchment' : ''}`}>
          {isRpg && (
            <>
              <div className="rpg-tack tack-tl" />
              <div className="rpg-tack tack-tr" />
              <div className="rpg-tack tack-bl" />
              <div className="rpg-tack tack-br" />
              <div className="parchment-header-row" style={{ padding: '8px 14px 4px 14px', marginBottom: 0 }}>
                <div className="parchment-title-group">
                  <QuillIcon size={16} color="#78350f" />
                  <h3 className="parchment-title">ANALES DE MISIONES</h3>
                </div>
                <span className="parchment-date">{registrosFiltrados.length} Registros</span>
              </div>
            </>
          )}

          <div className="history-panel-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <div className="history-search-box" style={{ flex: 1 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder={isRpg ? "Buscar crónica por proyecto o fecha..." : "Buscar por proyecto o fecha..."}
                value={busquedaTexto}
                onChange={(e) => setBusquedaTexto(e.target.value)}
                className="form-input form-input-sm search-field"
              />
              {busquedaTexto && (
                <button type="button" className="clear-search-btn" onClick={() => setBusquedaTexto('')}>✕</button>
              )}
            </div>

            <select
              className="form-select form-select-sm origen-select"
              value={filtroOrigen}
              onChange={(e) => setFiltroOrigen(e.target.value)}
              style={{ width: 'auto', minWidth: '135px', height: '32px', fontSize: '0.78rem', padding: '2px 8px', borderRadius: '6px' }}
              title="Filtrar por autor de la carga"
            >
              <option value="todos">Todos los orígenes</option>
              <option value="propios">✓ Cargados por mí</option>
              <option value="rrhh">🏢 Cargados por RRHH</option>
            </select>
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
                  const badgeClass = getBadgeClassLugar(lugarDisplay, item.servicio);
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
                          {(() => {
                            const tagAutor = getTagAutorInfo(item, usuario);
                            return (
                              <span className={`badge-autor ${tagAutor.badgeClass}`} title={tagAutor.label}>
                                {tagAutor.tipo === 'propia' ? '✓ Cargado por mí' : '🏢 ' + tagAutor.label}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="item-card-task" title={item.servicio}>
                          {item.servicio || 'Tiempo dedicado al área'}
                        </div>
                      </div>

                      <div className="item-card-footer">
                        {puedeModificarRegistro(usuario, item) ? (
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
                        ) : (
                          <span className="badge-solo-lectura" title="Solo Justina Bertolozzi e Iván Valentin pueden modificar registros de otros empleados">
                            🔒 Solo lectura
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* PANEL DERECHO: CALENDARIO MENSUAL CROMÁTICO */}
        <div className={`history-calendar-panel ${isRpg ? 'history-rpg-parchment rpg-pinned-parchment' : ''}`}>
          {isRpg && (
            <>
              <div className="rpg-tack tack-tl" />
              <div className="rpg-tack tack-tr" />
              <div className="rpg-tack tack-bl" />
              <div className="rpg-tack tack-br" />
              <div className="parchment-header-row" style={{ padding: '4px 8px 4px 8px', marginBottom: '8px' }}>
                <div className="parchment-title-group">
                  <CalendarRpgIcon size={16} color="#78350f" />
                  <h3 className="parchment-title">CRÓNICA MENSUAL</h3>
                </div>
                <span className="parchment-date">Registro del Reino</span>
              </div>
            </>
          )}

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
              className={isRpg ? 'rpg-wood-btn' : 'calendar-today-btn'}
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
                      const badgeClass = getBadgeClassLugar(lug, r.servicio);
                      let labelText = lug;
                      if (lug === 'Franco Obra' || r.servicio?.toLowerCase().includes('franco de obra')) {
                        labelText = 'F. Obra';
                      } else if (lug === 'Franco Obra Trabajado') {
                        labelText = 'F. Obra Trab.';
                      } else if (lug === 'Franco Ofic Trabajado' || r.servicio === 'Franco Trabajado') {
                        labelText = 'F. Ofic. Trab.';
                      } else if (lug === 'Feriado Trabajado') {
                        labelText = 'Feriado Trab.';
                      } else if (lug === 'Campaña / Campo' || lug === 'Campo') {
                        labelText = 'Campo';
                      }

                      const tagCell = getTagAutorInfo(r, usuario);
                      return (
                        <div
                          key={r.id || idx}
                          className={`cell-event-pill ${badgeClass}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (puedeModificarRegistro(usuario, r)) {
                              setRegistroEditando({ ...r });
                            }
                          }}
                          style={{ cursor: puedeModificarRegistro(usuario, r) ? 'pointer' : 'default' }}
                          title={`${lug} - ${r.servicio} (${r.horas} hs) • ${tagCell.label}${puedeModificarRegistro(usuario, r) ? ' • Clic para modificar' : ' • Solo lectura'}`}
                        >
                          <span className="cell-event-label">{labelText}</span>
                          {tagCell.tipo === 'rrhh' && (
                            <span className="cell-event-rrhh-indicator" title={tagCell.label}>• RRHH</span>
                          )}
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
                <span className="legend-color-box dot-campo" /> Obra / Campo
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-franco-obra" /> Franco Obra
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-franco" /> Franco
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-franco-ofic-trabajado" /> Franco Ofic. Trab.
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-franco-obra-trabajado" /> Franco Obra Trab.
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-feriado-trabajado" /> Feriado Trab.
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-vacaciones" /> Vacaciones
              </span>
              <span className="legend-item">
                <span className="legend-color-box dot-licencia" /> Licencia
              </span>
              <span className="legend-item">
                <span className="cell-event-rrhh-indicator" style={{ display: 'inline-block', marginRight: '4px' }}>• RRHH</span>
                Cargado por RRHH
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Modal de Modificación de Registro */}
      {registroEditando && (
        <div className="modal-backdrop">
          <div className={`modal-box ${isRpg ? 'rpg-modal-box' : ''}`}>
            <div className="modal-header">
              <span className="modal-title">
                {isRpg ? '📜 Modificar Crónica' : 'Modificar Registro'}
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setRegistroEditando(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarModificacion} className="modal-form">
              {(() => {
                const tagModal = getTagAutorInfo(registroEditando, usuario);
                return (
                  <div className="autor-info-banner">
                    <div style={{ fontSize: '1.4rem' }}>{tagModal.tipo === 'propia' ? '👤' : '🏢'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>
                        Origen de la carga
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                        <span className={`badge-autor ${tagModal.badgeClass}`}>
                          {tagModal.tipo === 'propia' ? '✓ Cargado por mí' : '🏢 ' + tagModal.label}
                        </span>
                        {registroEditando.fecha_hora && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
                            Registrado el {registroEditando.fecha_hora}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                {(() => {
                  const esRRHHUsuario = (usuario?.area || '').toUpperCase() === 'RRHH';
                  const esSoloOficinaEditando = !esRRHHUsuario && (
                    usuario?.area === 'M' ||
                    (usuario?.nombre || '').toLowerCase().includes('camila llovio') ||
                    (usuario?.nombre || '').toLowerCase().includes('llovio') ||
                    (registroEditando?.empleado || '').toLowerCase().includes('camila llovio') ||
                    (registroEditando?.empleado || '').toLowerCase().includes('llovio') ||
                    registroEditando?.area === 'M'
                  );
                  const opcionesModal = esSoloOficinaEditando
                    ? ['Oficina', 'Franco']
                    : LUGARES_OPCIONES;

                  return (
                    <select
                      className="form-select form-select-clean"
                      value={registroEditando.tipo_ocf || registroEditando.lugar || 'Oficina'}
                      onChange={(e) => {
                        const nuevoLugar = e.target.value;
                        let nuevoServicio = registroEditando.servicio;
                        let nuevasHoras = registroEditando.horas;

                        if (nuevoLugar === 'Franco' || nuevoLugar === 'Franco Obra' || nuevoLugar === 'Franco de Obra' || nuevoLugar === 'Vacaciones') {
                          nuevasHoras = 0;
                          if (nuevoLugar === 'Vacaciones') nuevoServicio = 'Vacaciones';
                          if (nuevoLugar === 'Franco Obra' || nuevoLugar === 'Franco de Obra') nuevoServicio = '';
                          if (nuevoLugar === 'Franco') {
                            nuevoServicio = esSoloOficinaEditando
                              ? ((registroEditando?.empleado || '').toLowerCase().includes('llovio') || (usuario?.nombre || '').toLowerCase().includes('llovio') ? 'Ingeniería' : 'Mensura')
                              : (registroEditando.servicio || 'Área');
                          }
                        } else if (nuevoLugar === 'Franco Ofic Trabajado' || nuevoLugar === 'Franco Trabajado') {
                          nuevoServicio = 'Tiempo dedicado al Área';
                          nuevasHoras = 8;
                        } else if (nuevoLugar === 'Franco Obra Trabajado' || nuevoLugar === 'Feriado Trabajado') {
                          nuevoServicio = '';
                          nuevasHoras = 8;
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
                      {opcionesModal.map(op => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  );
                })()}
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
              ) : (['Franco Obra', 'Franco de Obra', 'Franco Obra Trabajado', 'Feriado Trabajado', 'Campo', 'Campaña / Campo', 'Roster'].includes(registroEditando.tipo_ocf || registroEditando.lugar)) ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Proyecto Asignado:</label>
                  <select
                    className="form-select form-select-clean"
                    value={registroEditando.servicio || ''}
                    onChange={(e) => {
                      setRegistroEditando({
                        ...registroEditando,
                        servicio: e.target.value
                      });
                    }}
                    required
                  >
                    <option value="">-- Seleccionar proyecto asignado --</option>
                    {serviciosDisponibles.map((srv, idx) => (
                      <option key={idx} value={srv}>{srv}</option>
                    ))}
                  </select>
                </div>
              ) : (registroEditando.tipo_ocf === 'Franco' || registroEditando.lugar === 'Franco') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Área / Asignación (Franco):</label>
                  <input
                    type="text"
                    className="form-input form-input-clean"
                    value={registroEditando.servicio || ''}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                    placeholder="Área del empleado (o proyecto si roster)"
                    required
                  />
                </div>
              ) : (registroEditando.tipo_ocf === 'Vacaciones' || registroEditando.lugar === 'Vacaciones') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Detalle:</label>
                  <input
                    type="text"
                    className="form-input form-input-clean"
                    value={registroEditando.servicio || 'Vacaciones'}
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
                  disabled={['Franco', 'Franco Obra', 'Franco de Obra', 'Vacaciones', 'Licencia'].includes(registroEditando.tipo_ocf || registroEditando.lugar)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className={isRpg ? 'rpg-wood-btn' : 'btn-cancel'}
                  onClick={() => setRegistroEditando(null)}
                  disabled={guardandoEdicion}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={isRpg ? 'rpg-wood-btn rpg-wood-btn-primary' : 'btn-confirm'}
                  disabled={guardandoEdicion}
                >
                  {guardandoEdicion ? 'Guardando...' : (isRpg ? 'Sellar Cambios' : 'Guardar Cambios')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Asistido: Cargar Fines de Semana del Mes */}
      {modalFinesDeSemanaOpen && (
        <div className="modal-backdrop">
          <div className={`modal-box ${isRpg ? 'rpg-modal-box' : ''}`} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <span className="modal-title">
                {isRpg ? '📜 Decretar Descanso de Fines de Semana' : '📅 Cargar Fines de Semana a Franco'}
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => !cargandoFinesDeSemana && setModalFinesDeSemanaOpen(false)}
                disabled={cargandoFinesDeSemana}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '6px 0 16px 0' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #94a3b8)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                Se registrarán como <strong>Franco</strong> (0 hs imputadas a <strong>{areaUsuarioUpper === 'RRHH' ? 'RRHH' : 'Aplicaciones'}</strong>) los siguientes <strong>{finesDeSemanaPendientes.length}</strong> días de fin de semana que aún no poseen registro en <strong>{nombreMesFinesDeSemana}</strong>:
              </p>

              <div className="weekend-pills-container">
                {finesDeSemanaPendientes.map((f) => (
                  <span key={f.fecha} className="weekend-pill">
                    ☕ {f.label}
                  </span>
                ))}
              </div>

              {finesDeSemanaTotalMes > finesDeSemanaPendientes.length && (
                <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>ℹ️</span>
                  <span>{finesDeSemanaTotalMes - finesDeSemanaPendientes.length} fin(es) de semana ya tenían registros previos y se mantendrán sin cambios.</span>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className={isRpg ? 'rpg-wood-btn' : 'btn-cancel'}
                onClick={() => setModalFinesDeSemanaOpen(false)}
                disabled={cargandoFinesDeSemana}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={isRpg ? 'rpg-wood-btn rpg-wood-btn-primary' : 'btn-confirm'}
                onClick={handleConfirmarFinesDeSemana}
                disabled={cargandoFinesDeSemana}
              >
                {cargandoFinesDeSemana ? 'Registrando...' : (isRpg ? `Sellar ${finesDeSemanaPendientes.length} Francos` : `✓ Cargar ${finesDeSemanaPendientes.length} Francos`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // En modo RPG: envuelto dentro del Tablón de Madera de la Taberna con herrajes y estandarte curvado
  if (isRpg) {
    return (
      <div className="rpg-board-viewport rpg-history-viewport">
        <div className="rpg-notice-board">
          {/* Herrajes de hierro forjado en las 4 esquinas */}
          <div className="rpg-iron-bracket top-left" />
          <div className="rpg-iron-bracket top-right" />
          <div className="rpg-iron-bracket bottom-left" />
          <div className="rpg-iron-bracket bottom-right" />

          {/* Estandarte de Pergamino Curvado */}
          <div className="rpg-curved-banner">
            <div className="rpg-banner-scroll-roll left" />
            <div className="rpg-banner-body">
              <div className="rpg-banner-heading-wrap">
                <div className="rpg-illuminated-box">H</div>
                <h1 className="rpg-banner-main-title">ANALES DE MISIONES Y CRÓNICAS</h1>
              </div>
              <span className="rpg-banner-subtitle">LIBRO DE REGISTRO HISTÓRICO • GREMIO INGEAP</span>
            </div>
            <div className="rpg-banner-scroll-roll right" />
          </div>

          {contenidoPrincipal}
        </div>
      </div>
    );
  }

  // En modo Normal / Corporativo
  return (
    <div className="view-content history-split-viewport">
      {contenidoPrincipal}
    </div>
  );
}
