import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';

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

export default function OtherEmployeesHistoryView({ usuario, onVolver, tema, onVerMiHistorial, onNuevoReporte }) {
  const isRpg = tema === 'rpg';

  // Maximizar ventana para experiencia panorámica
  useEffect(() => {
    api.maximizarVentana();
  }, []);

  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensajeSync, setMensajeSync] = useState(null);

  // Catálogos auxiliares
  const [empleados, setEmpleados] = useState([]);
  const [serviciosDisponibles, setServiciosDisponibles] = useState([]);

  // Filtros columna izquierda
  const [filtroTexto, setFiltroTexto] = useState('');

  // Estado del calendario mensual columna derecha
  const [fechaCalendario, setFechaCalendario] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [empleadoAuditar, setEmpleadoAuditar] = useState('');
  const [registrosEmpleadoAuditar, setRegistrosEmpleadoAuditar] = useState([]);
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false);
  const [diaSeleccionadoAuditoria, setDiaSeleccionadoAuditoria] = useState(null);

  // Modal de edición
  const [registroEditando, setRegistroEditando] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Modal de eliminación
  const [registroEliminando, setRegistroEliminando] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  // Cantidad manual de Francos Trabajados para la calculadora de liquidación
  const [diasFrancoManual, setDiasFrancoManual] = useState('');

  // Tarifas de Liquidación (guardadas en localStorage)
  const [tarifas, setTarifas] = useState(() => {
    try {
      const guardadas = localStorage.getItem('ingeap_tarifas_rrhh');
      if (guardadas) return JSON.parse(guardadas);
    } catch (e) {
      console.error(e);
    }
    return {
      precioOficina: 0,
      precioObra: 0,
      precioFrancoTrabajado: 0,
      precioFeriadoTrabajado: 0
    };
  });

  const handleTarifaChange = (campo, valor) => {
    const num = parseFloat(valor) || 0;
    const nuevas = { ...tarifas, [campo]: num };
    setTarifas(nuevas);
    try {
      localStorage.setItem('ingeap_tarifas_rrhh', JSON.stringify(nuevas));
    } catch (e) {
      console.error(e);
    }
  };

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [dataRegs, dataEmps, dataServs] = await Promise.all([
        api.obtenerHistorialOtrosEmpleados('TODOS'),
        api.obtenerTodosUsuarios(),
        api.obtenerServicios('TODOS')
      ]);

      if (Array.isArray(dataRegs)) setRegistros(dataRegs);
      if (Array.isArray(dataEmps) && dataEmps.length > 0) {
        setEmpleados(dataEmps);
        setEmpleadoAuditar(prev => prev || dataEmps[0].nombre);
      }
      if (Array.isArray(dataServs)) setServiciosDisponibles(dataServs);
    } catch (err) {
      console.error('Error al cargar historial de otros empleados:', err);
    } finally {
      setCargando(false);
    }
  };

  const cargarAuditoriaEmpleado = async (emp, fechaCal) => {
    if (!emp) return;
    setCargandoAuditoria(true);
    try {
      const anio = fechaCal.getFullYear();
      const mesStr = String(fechaCal.getMonth() + 1).padStart(2, '0');
      const mesAnio = `${anio}-${mesStr}`;
      const data = await api.obtenerTodosRegistrosEmpleado(emp, mesAnio);
      if (Array.isArray(data)) {
        setRegistrosEmpleadoAuditar(data);
      }
    } catch (err) {
      console.error('Error al cargar registros del empleado para auditoría:', err);
    } finally {
      setCargandoAuditoria(false);
    }
  };

  useEffect(() => {
    cargarDatos();

    const handleCatalogos = () => {
      cargarDatos();
      if (empleadoAuditar) {
        cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
      }
    };
    window.addEventListener('catalogos-actualizados', handleCatalogos);
    return () => {
      window.removeEventListener('catalogos-actualizados', handleCatalogos);
    };
  }, []);

  useEffect(() => {
    if (empleadoAuditar) {
      setDiasFrancoManual('');
      cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
    }
  }, [empleadoAuditar, fechaCalendario]);

  const ejecutarSincronizacion = async () => {
    setSincronizando(true);
    setMensajeSync(null);
    try {
      const res = await api.sincronizarSheets();
      if (res && res.exito) {
        setMensajeSync({ tipo: 'exito', texto: res.mensaje || 'Sincronizado correctamente con Google Sheets.' });
        await cargarDatos();
        if (empleadoAuditar) {
          await cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
        }
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
        empleado: registroEditando.empleado,
        id_empleado: registroEditando.id_empleado || '',
        id_proyecto: registroEditando.id_proyecto || ''
      });

      if (res && res.exito) {
        setMensajeSync({ tipo: 'exito', texto: 'Registro modificado exitosamente.' });
        setRegistroEditando(null);
        await cargarDatos();
        if (empleadoAuditar) {
          await cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
        }
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

  const handleConfirmarEliminacion = async () => {
    if (!registroEliminando) return;
    setEliminando(true);
    try {
      const res = await api.eliminarRegistroAsistencia(registroEliminando.id);
      if (res && res.exito) {
        setMensajeSync({ tipo: 'exito', texto: res.mensaje || 'Registro eliminado correctamente.' });
        setRegistroEliminando(null);
        await cargarDatos();
        if (empleadoAuditar) {
          await cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
        }
      } else {
        setMensajeSync({ tipo: 'error', texto: res?.error || 'No se pudo eliminar el registro.' });
      }
    } catch (err) {
      console.error('Error al eliminar registro:', err);
      setMensajeSync({ tipo: 'error', texto: 'Error al eliminar el registro.' });
    } finally {
      setEliminando(false);
    }
  };

  // Filtrado en memoria para la lista de registros de RRHH (lado izquierdo)
  const registrosFiltrados = useMemo(() => {
    return registros.filter(r => {
      if (filtroTexto) {
        const q = filtroTexto.toLowerCase();
        const emp = (r.empleado || '').toLowerCase();
        const srv = (r.servicio || '').toLowerCase();
        const lug = (r.tipo_ocf || r.lugar || '').toLowerCase();
        const fec = (r.fecha || '').toLowerCase();
        const cpor = (r.cargado_por || '').toLowerCase();
        if (!emp.includes(q) && !srv.includes(q) && !lug.includes(q) && !fec.includes(q) && !cpor.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [registros, filtroTexto]);

  // Mapa de registros del empleado seleccionado indexados por fecha (YYYY-MM-DD) para el calendario
  const mapaRegistrosAuditoria = useMemo(() => {
    const mapa = {};
    registrosEmpleadoAuditar.forEach(r => {
      if (!r.fecha) return;
      const f = r.fecha.trim();
      if (!mapa[f]) {
        mapa[f] = [];
      }
      mapa[f].push(r);
    });
    return mapa;
  }, [registrosEmpleadoAuditar]);

  // Generador de días del mes para el calendario del empleado
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
      const regsDia = mapaRegistrosAuditoria[fechaIso] || [];

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
  }, [fechaCalendario, mapaRegistrosAuditoria]);

  const navegarMes = (delta) => {
    setFechaCalendario(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const irAHoy = () => {
    const hoy = new Date();
    setFechaCalendario(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  };

  const nombresMeses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Cálculo de conteos para la calculadora de liquidación
  // Regla de RRHH: Francos normales cuentan como oficina, francos de obra cuentan como obra
  const conteosLiquidacion = useMemo(() => {
    const anio = fechaCalendario.getFullYear();
    const mesStr = String(fechaCalendario.getMonth() + 1).padStart(2, '0');
    const prefijoMes = `${anio}-${mesStr}`;

    const fechasOficina = new Set();
    const fechasObra = new Set();
    const fechasFrancoTrabajado = new Set();
    const fechasFeriadoTrabajado = new Set();

    registrosEmpleadoAuditar.forEach(r => {
      if (!r.fecha || !r.fecha.startsWith(prefijoMes)) return;
      const f = r.fecha.trim();
      const lug = (r.tipo_ocf || r.lugar || '').trim();
      const srv = (r.servicio || '').trim();
      const srvLower = srv.toLowerCase();
      const hrs = Number(r.horas) || 0;
      const esFer = (r.feriado || '').toUpperCase() === 'SI';

      // 1. Franco trabajado (oficina u obra)
      if (
        lug.toLowerCase() === 'franco ofic trabajado' ||
        lug.toLowerCase() === 'franco obra trabajado' ||
        srv === 'Franco Trabajado' ||
        (lug === 'Franco' && hrs > 0 && srvLower.includes('trabajado'))
      ) {
        fechasFrancoTrabajado.add(f);
      }
      // 2. Feriado trabajado
      else if (lug.toLowerCase() === 'feriado trabajado' || (esFer && hrs > 0)) {
        fechasFeriadoTrabajado.add(f);
      }
      // 3. Franco de Obra -> Contar como días de Obra
      else if (
        lug.toLowerCase() === 'franco obra' ||
        lug.toLowerCase() === 'franco de obra' ||
        srvLower.includes('franco de obra') ||
        (lug === 'Franco' && srvLower.includes('obra'))
      ) {
        fechasObra.add(f);
      }
      // 4. Franco normal o de oficina -> Contar como días de Oficina
      else if (
        lug.toLowerCase() === 'franco' ||
        lug.toLowerCase() === 'franco de oficina' ||
        srvLower.includes('franco de oficina') ||
        srvLower === 'franco'
      ) {
        fechasOficina.add(f);
      }
      // 5. Obra / Campo habitual
      else if (['campaña / campo', 'campo', 'obra', 'roster'].includes(lug.toLowerCase())) {
        fechasObra.add(f);
      }
      // 6. Oficina habitual
      else if (['oficina', 'home office'].includes(lug.toLowerCase())) {
        fechasOficina.add(f);
      }
    });

    return {
      diasOficina: fechasOficina.size,
      diasObra: fechasObra.size,
      diasFrancoTrabajado: fechasFrancoTrabajado.size,
      diasFeriadoTrabajado: fechasFeriadoTrabajado.size
    };
  }, [registrosEmpleadoAuditar, fechaCalendario]);

  // Cantidad efectiva de Francos Trabajados (manual o automática)
  const cantDiasFrancoTrabajado = (diasFrancoManual !== '' && !isNaN(Number(diasFrancoManual)))
    ? Math.max(0, Number(diasFrancoManual))
    : conteosLiquidacion.diasFrancoTrabajado;

  const subtotalOficina = conteosLiquidacion.diasOficina * (tarifas.precioOficina || 0);
  const subtotalObra = conteosLiquidacion.diasObra * (tarifas.precioObra || 0);
  const subtotalFranco = cantDiasFrancoTrabajado * (tarifas.precioFrancoTrabajado || 0);
  const subtotalFeriado = conteosLiquidacion.diasFeriadoTrabajado * (tarifas.precioFeriadoTrabajado || 0);
  const totalLiquidar = subtotalOficina + subtotalObra + subtotalFranco + subtotalFeriado;

  const formatMoneda = (val) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val || 0);
  };

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

  const getIniciales = (nombre) => {
    if (!nombre) return 'EM';
    const partes = nombre.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  const pendientesCount = registros.filter(r => r.sincronizado === 0).length;

  return (
    <div className={`view-content other-history-container ${isRpg ? 'rpg-board-viewport' : ''}`}>
      {/* Barra superior de navegación */}
      <div className="view-header-bar other-history-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onVolver && (
            <button type="button" className="btn-back" onClick={onVolver}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Inicio</span>
            </button>
          )}

          {onVerMiHistorial && (
            <button type="button" className="btn-action-ghost" onClick={onVerMiHistorial}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
              <span>Mi Historial</span>
            </button>
          )}

          <div className="other-history-title-block">
            <span className="other-history-title">Panel de Control de Empleados (RRHH)</span>
            <span className="other-history-subtitle">
              Auditoría integral de asistencia • Registros de RRHH • Calculadora de Liquidación
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {pendientesCount > 0 && (
            <button
              type="button"
              className="btn-sync"
              onClick={ejecutarSincronizacion}
              disabled={sincronizando}
              title="Sincronizar cambios pendientes con Google Sheets"
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
            onClick={async () => {
              await cargarDatos();
              if (empleadoAuditar) {
                await cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
              }
            }}
            disabled={cargando || sincronizando}
            title="Actualizar registros desde la base y Google Sheets"
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

      {/* CONTENEDOR DIVIDIDO: IZQUIERDA REGISTROS RRHH, DERECHA AUDITORÍA Y LIQUIDACIÓN */}
      <div className="other-history-split-grid">

        {/* =========================================================================
            PANEL IZQUIERDO: Registros cargados por RRHH para otros empleados
            ========================================================================= */}
        <div className="other-left-panel">
          <div className="other-panel-header">
            <div className="other-panel-title-row">
              <span className="other-panel-title">Cargados por RRHH</span>
              <span className="other-count-badge">{registrosFiltrados.length}</span>
            </div>

            <div className="other-left-filters">
              <div className="search-input-wrapper">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Buscar por empleado, proyecto o fecha..."
                  className="form-input form-input-sm search-field"
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                />
                {filtroTexto && (
                  <button type="button" className="clear-search-btn" onClick={() => setFiltroTexto('')}>✕</button>
                )}
              </div>
            </div>
          </div>

          <div className="other-cards-scroll">
            {cargando && registros.length === 0 ? (
              <div className="empty-state">
                <div className="spinner" style={{ width: '28px', height: '28px' }} />
                <span className="empty-text">Cargando registros cargados para otros empleados...</span>
              </div>
            ) : registrosFiltrados.length === 0 ? (
              <div className="empty-state">
                <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="empty-text">
                  {registros.length === 0
                    ? 'No hay registros cargados por RRHH para otros empleados.'
                    : 'No se encontraron registros con la búsqueda.'}
                </span>
              </div>
            ) : (
              <div className="other-cards-col">
                {registrosFiltrados.map((item) => {
                  const lugarDisplay = item.tipo_ocf || item.lugar || 'Oficina';
                  const badgeClass = getBadgeClassLugar(lugarDisplay, item.servicio);
                  const horasDisplay = item.horas > 0 ? `${item.horas} hs` : (item.jornada || '0 hs');
                  const estaSincronizado = item.sincronizado === 1;

                  return (
                    <div key={item.id} className="other-record-card">
                      <div className="other-card-header">
                        <div className="other-card-user">
                          <div className="other-user-avatar">
                            {getIniciales(item.empleado)}
                          </div>
                          <div className="other-user-meta">
                            <span className="other-user-name">{item.empleado || 'Sin empleado'}</span>
                            {item.cargado_por && (
                              <span className="other-user-sub">
                                Cargado por: <strong>{item.cargado_por}</strong>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="other-card-badges">
                          <span className={`status-badge ${estaSincronizado ? 'status-synced' : 'status-pending'}`}>
                            {estaSincronizado ? 'Sincronizado' : 'Pendiente'}
                          </span>
                        </div>
                      </div>

                      <div className="other-card-content">
                        <div className="other-meta-row">
                          <span className="other-meta-date">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            {item.fecha} {item.dia_semana ? `(${item.dia_semana})` : ''}
                          </span>
                          {item.feriado === 'SI' && (
                            <span className="chip-feriado">Feriado</span>
                          )}
                          <span className={`modalidad-pill ${badgeClass}`}>
                            {item.servicio === 'Franco Trabajado' ? 'Franco Trabajado' : lugarDisplay}
                          </span>
                        </div>

                        <div className="other-project-row">
                          <span className="other-project-label">Proyecto / Detalle:</span>
                          <span className="other-project-name" title={item.servicio}>
                            {item.servicio || 'Tiempo dedicado al área'}
                          </span>
                        </div>

                        <div className="other-hours-row">
                          <span className="other-hours-label">Jornada:</span>
                          <span className="other-hours-value">{horasDisplay}</span>
                        </div>
                      </div>

                      <div className="other-card-actions">
                        <button
                          type="button"
                          className="btn-card-action btn-card-edit"
                          onClick={() => setRegistroEditando({ ...item })}
                          title="Modificar reporte"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Modificar
                        </button>

                        <button
                          type="button"
                          className="btn-card-action btn-card-delete"
                          onClick={() => setRegistroEliminando(item)}
                          title="Eliminar este reporte localmente y de Google Sheets"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            PANEL DERECHO: Calendario de Auditoría y Calculadora de Liquidación
            ========================================================================= */}
        <div className="other-right-panel">
          {/* Header de Auditoría: Selector de empleado y mes */}
          <div className="audit-panel-header">
            <div className="audit-employee-select-box">
              <label className="audit-select-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>Auditar empleado:</span>
              </label>
              <select
                className="form-select form-select-clean audit-select-field"
                value={empleadoAuditar}
                onChange={(e) => setEmpleadoAuditar(e.target.value)}
              >
                {empleados.map(u => (
                  <option key={u.dni || u.nombre} value={u.nombre}>
                    {u.nombre} ({u.area || 'Sin área'})
                  </option>
                ))}
              </select>
            </div>

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
              <button
                type="button"
                className="calendar-today-btn"
                onClick={irAHoy}
              >
                Hoy
              </button>
            </div>
          </div>

          {/* Grilla del Calendario Mensual Interactivo */}
          <div className="audit-calendar-wrapper">
            <div className="calendar-weekdays-row">
              <span>Lun</span>
              <span>Mar</span>
              <span>Mié</span>
              <span>Jue</span>
              <span>Vie</span>
              <span>Sáb</span>
              <span>Dom</span>
            </div>

            <div className="calendar-grid audit-calendar-grid">
              {diasMesCalendario.map((celda) => {
                if (celda.esVacio) {
                  return <div key={celda.id} className="calendar-cell cell-empty" />;
                }

                const tieneRegistros = celda.registros.length > 0;

                return (
                  <div
                    key={celda.id}
                    className={`calendar-cell ${celda.esHoy ? 'cell-today' : ''} ${tieneRegistros ? 'cell-has-data' : ''}`}
                    onClick={() => {
                      if (!tieneRegistros) return;
                      if (celda.registros.length === 1) {
                        setRegistroEditando({ ...celda.registros[0] });
                      } else {
                        setDiaSeleccionadoAuditoria(celda);
                      }
                    }}
                    style={{ cursor: tieneRegistros ? 'pointer' : 'default' }}
                    title={tieneRegistros ? `${celda.registros.length} registro(s) el ${celda.fechaIso} (Toca para editar/eliminar)` : celda.fechaIso}
                  >
                    <div className="cell-top-bar">
                      <span className="cell-day-number">{celda.diaNumero}</span>
                      {celda.esHoy && <span className="cell-today-dot" title="Hoy" />}
                    </div>

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
                        return (
                          <div
                            key={r.id || idx}
                            className={`cell-event-pill ${badgeClass}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRegistroEditando({ ...r });
                            }}
                            title={`${lug} - ${r.servicio} (${r.horas} hs) • Clic para editar o eliminar`}
                          >
                            <span className="cell-event-label">{labelText}</span>
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

            {/* Referencias cromáticas */}
            <div className="calendar-legend-bar">
              <span className="legend-title">Referencias:</span>
              <div className="legend-items">
                <span className="legend-item"><span className="legend-color-box badge-modalidad-oficina" /> Oficina</span>
                <span className="legend-item"><span className="legend-color-box badge-modalidad-campo" /> Obra / Campo</span>
                <span className="legend-item"><span className="legend-color-box badge-modalidad-franco-obra" /> Franco Obra</span>
                <span className="legend-item"><span className="legend-color-box badge-modalidad-franco" /> Franco Normal</span>
                <span className="legend-item"><span className="legend-color-box badge-modalidad-franco-ofic-trabajado" /> Franco Ofic. Trab.</span>
                <span className="legend-item"><span className="legend-color-box badge-modalidad-franco-obra-trabajado" /> Franco Obra Trab.</span>
                <span className="legend-item"><span className="legend-color-box badge-modalidad-feriado-trabajado" /> Feriado Trab.</span>
                <span className="legend-item"><span className="legend-color-box badge-modalidad-vacaciones" /> Vacaciones</span>
                <span className="legend-item"><span className="legend-color-box badge-modalidad-licencia" /> Licencia</span>
              </div>
            </div>
          </div>

          {/* =========================================================================
              CALCULADORA DE LIQUIDACIÓN DEBAJO DEL CALENDARIO
              ========================================================================= */}
          <div className="liquidation-card">
            <div className="liquidation-card-header">
              <div className="liquidation-card-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                <span>Calculadora de Liquidación • {empleadoAuditar || 'Empleado'} ({nombresMeses[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()})</span>
              </div>
              <span className="liquidation-help">
                Francos normales computan como oficina y francos de obra computan como obra. Asigna tarifas y francos trabajados:
              </span>
            </div>

            <div className="liquidation-grid">
              {/* Tarjeta 1: Oficina */}
              <div className="liquidation-item">
                <div className="liq-item-top">
                  <span className="liq-label">Día de Oficina</span>
                  <span className="liq-count-badge" title="Incluye oficina y francos normales">{conteosLiquidacion.diasOficina} días</span>
                </div>
                <div className="liq-input-row">
                  <span className="liq-currency-symbol">$</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="Precio día"
                    className="form-input form-input-sm liq-input"
                    value={tarifas.precioOficina || ''}
                    onChange={(e) => handleTarifaChange('precioOficina', e.target.value)}
                  />
                </div>
                <div className="liq-subtotal-row">
                  <span>Subtotal:</span>
                  <strong>{formatMoneda(subtotalOficina)}</strong>
                </div>
              </div>

              {/* Tarjeta 2: Obra */}
              <div className="liquidation-item">
                <div className="liq-item-top">
                  <span className="liq-label">Día de Obra / Campo</span>
                  <span className="liq-count-badge" title="Incluye campo/obra y francos de obra">{conteosLiquidacion.diasObra} días</span>
                </div>
                <div className="liq-input-row">
                  <span className="liq-currency-symbol">$</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="Precio día"
                    className="form-input form-input-sm liq-input"
                    value={tarifas.precioObra || ''}
                    onChange={(e) => handleTarifaChange('precioObra', e.target.value)}
                  />
                </div>
                <div className="liq-subtotal-row">
                  <span>Subtotal:</span>
                  <strong>{formatMoneda(subtotalObra)}</strong>
                </div>
              </div>

              {/* Tarjeta 3: Franco Trabajado (con asignación manual o automática) */}
              <div className="liquidation-item">
                <div className="liq-item-top">
                  <span className="liq-label">Franco Trabajado</span>
                  <span className="liq-count-badge" title="Conteo detectado por calendario">{conteosLiquidacion.diasFrancoTrabajado} detectado(s)</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    Cant. días:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="form-input form-input-sm"
                    style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
                    value={diasFrancoManual !== '' ? diasFrancoManual : conteosLiquidacion.diasFrancoTrabajado}
                    onChange={(e) => setDiasFrancoManual(e.target.value)}
                    title="Cantidad de francos trabajados (editable manualmente)"
                  />
                  {diasFrancoManual !== '' && (
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ padding: '2px 5px', fontSize: '10px' }}
                      onClick={() => setDiasFrancoManual('')}
                      title="Restablecer al conteo automático del calendario"
                    >
                      ↺ Auto
                    </button>
                  )}
                </div>

                <div className="liq-input-row">
                  <span className="liq-currency-symbol">$</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="Precio franco trab."
                    className="form-input form-input-sm liq-input"
                    value={tarifas.precioFrancoTrabajado || ''}
                    onChange={(e) => handleTarifaChange('precioFrancoTrabajado', e.target.value)}
                  />
                </div>
                <div className="liq-subtotal-row">
                  <span>Subtotal ({cantDiasFrancoTrabajado} d):</span>
                  <strong>{formatMoneda(subtotalFranco)}</strong>
                </div>
              </div>

              {/* Tarjeta 4: Feriado Trabajado */}
              <div className="liquidation-item">
                <div className="liq-item-top">
                  <span className="liq-label">Feriado Trabajado</span>
                  <span className="liq-count-badge">{conteosLiquidacion.diasFeriadoTrabajado} días</span>
                </div>
                <div className="liq-input-row">
                  <span className="liq-currency-symbol">$</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="Precio feriado trab."
                    className="form-input form-input-sm liq-input"
                    value={tarifas.precioFeriadoTrabajado || ''}
                    onChange={(e) => handleTarifaChange('precioFeriadoTrabajado', e.target.value)}
                  />
                </div>
                <div className="liq-subtotal-row">
                  <span>Subtotal:</span>
                  <strong>{formatMoneda(subtotalFeriado)}</strong>
                </div>
              </div>
            </div>

            {/* Total Liquidación Banner */}
            <div className="liquidation-total-banner">
              <div className="liq-total-info">
                <span className="liq-total-subtitle">Liquidación total correspondiente a {empleadoAuditar || 'empleado'}:</span>
                <span className="liq-total-period">{nombresMeses[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()}</span>
              </div>
              <div className="liq-total-amount-box">
                <span className="liq-total-amount-label">TOTAL A LIQUIDAR</span>
                <span className="liq-total-amount-value">{formatMoneda(totalLiquidar)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Múltiples Registros del Día */}
      {diaSeleccionadoAuditoria && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <span className="modal-title">
                Registros del {diaSeleccionadoAuditoria.fechaIso}
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setDiaSeleccionadoAuditoria(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Empleado: <strong>{empleadoAuditar}</strong> • Selecciona un registro para modificarlo o eliminarlo:
              </span>
              {diaSeleccionadoAuditoria.registros.map((item) => {
                const lug = item.tipo_ocf || item.lugar || 'Oficina';
                const badge = getBadgeClassLugar(lug, item.servicio);
                return (
                  <div
                    key={item.id}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' }}>
                      <span className={`modalidad-pill ${badge}`} style={{ width: 'fit-content' }}>{lug}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.servicio}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {item.horas > 0 ? `${item.horas} hs` : '0 hs'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn-card-action btn-card-edit"
                        onClick={() => {
                          setDiaSeleccionadoAuditoria(null);
                          setRegistroEditando({ ...item });
                        }}
                        title="Modificar este registro"
                      >
                        Modificar
                      </button>
                      <button
                        type="button"
                        className="btn-card-action btn-card-delete"
                        onClick={() => {
                          setDiaSeleccionadoAuditoria(null);
                          setRegistroEliminando(item);
                        }}
                        title="Eliminar este registro"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions" style={{ padding: '12px 16px' }}>
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={() => setDiaSeleccionadoAuditoria(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Modificación (con botón para Eliminar directamente) */}
      {registroEditando && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Modificar Registro de Asistencia</span>
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
                <label className="form-label-clean">Empleado:</label>
                <select
                  className="form-select form-select-clean"
                  value={registroEditando.empleado}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, empleado: e.target.value })}
                  required
                >
                  {empleados.map(u => (
                    <option key={u.dni || u.nombre} value={u.nombre}>
                      {u.nombre} ({u.area || 'Sin área'})
                    </option>
                  ))}
                </select>
              </div>

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

                    if (nuevoLugar === 'Franco' || nuevoLugar === 'Franco de Oficina' || nuevoLugar === 'Franco Obra' || nuevoLugar === 'Franco de Obra' || nuevoLugar === 'Vacaciones') {
                      nuevasHoras = 0;
                      if (nuevoLugar === 'Vacaciones') nuevoServicio = 'Vacaciones';
                      if (nuevoLugar === 'Franco Obra' || nuevoLugar === 'Franco de Obra') nuevoServicio = '';
                      if (nuevoLugar === 'Franco') nuevoServicio = registroEditando.servicio || 'Área';
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
                  {LUGARES_OPCIONES.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>

              {/* Si es Licencia, detalle del tipo de licencia */}
              {(registroEditando.tipo_ocf === 'Licencia' || registroEditando.lugar === 'Licencia') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Tipo de Licencia:</label>
                  <input
                    type="text"
                    className="form-input form-input-clean"
                    value={registroEditando.servicio}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                    placeholder="Ej: Licencia Médica, Licencia Especial, Examen..."
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
                  disabled={['Franco', 'Franco de Oficina', 'Franco Obra', 'Franco de Obra', 'Vacaciones', 'Licencia'].includes(registroEditando.tipo_ocf || registroEditando.lugar)}
                  required
                />
              </div>

              <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn-card-action btn-card-delete"
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                  onClick={() => {
                    const reg = { ...registroEditando };
                    setRegistroEditando(null);
                    setRegistroEliminando(reg);
                  }}
                  title="Eliminar este registro"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Eliminar Registro
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="modal-btn-cancel"
                    onClick={() => setRegistroEditando(null)}
                    disabled={guardandoEdicion}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="modal-btn-confirm"
                    disabled={guardandoEdicion}
                  >
                    {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {registroEliminando && (
        <div className="modal-backdrop">
          <div className="modal-box modal-danger">
            <div className="modal-header">
              <span className="modal-title" style={{ color: 'var(--primary)' }}>
                ⚠️ Confirmar Eliminación
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setRegistroEliminando(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body-text" style={{ padding: '18px' }}>
              <p>
                ¿Estás seguro de que deseas eliminar este registro de <strong>{registroEliminando.empleado}</strong>?
              </p>
              <div className="delete-details-card" style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Fecha:</strong> {registroEliminando.fecha}</div>
                <div><strong>Modalidad:</strong> {registroEliminando.tipo_ocf || registroEliminando.lugar}</div>
                <div><strong>Proyecto:</strong> {registroEliminando.servicio}</div>
                <div><strong>Horas:</strong> {registroEliminando.horas} hs</div>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '10px' }}>
                Esta acción eliminará el registro de la base local y también borrará la fila correspondiente en la hoja de Google Sheets en segundo plano.
              </p>
            </div>

            <div className="modal-actions" style={{ padding: '0 18px 18px 18px' }}>
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={() => setRegistroEliminando(null)}
                disabled={eliminando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="modal-btn-delete"
                onClick={handleConfirmarEliminacion}
                disabled={eliminando}
              >
                {eliminando ? 'Eliminando...' : 'Sí, Eliminar Registro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
