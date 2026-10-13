// [FN-02.03] Orquestador de Historial de Otros Empleados, Auditoría y Liquidación
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';
import {
  puedeVerHistorialOtros,
  puedeModificarRegistro,
  puedeGestionarTipoCosto,
  puedeVerModificaciones,
  esAreaNucleo,
  puedeVerCalculadoraLiquidacion,
  esCore,
  puedeModificarHistorialOtros
} from '../utils/permissions';
import { obtenerEtiquetaModalidad } from '../utils/francoUtils';

import {
  categorizarRegistroLiquidacion,
  NOMBRES_MESES
} from './history/historyConstants';
import HistoryTopBar from './history/HistoryTopBar';
import HistoryRecordsList from './history/HistoryRecordsList';
import HistoryAuditCalendar from './history/HistoryAuditCalendar';
import HistoryLiquidationCard from './history/HistoryLiquidationCard';
import HistoryDayRecordsModal from './history/HistoryDayRecordsModal';
import HistoryEditRecordModal from './history/HistoryEditRecordModal';
import HistoryDeleteRecordModal from './history/HistoryDeleteRecordModal';
import HistoryDiffModal from './history/HistoryDiffModal';
import HistoryCostDayModal from './history/HistoryCostDayModal';

// Re-exportar para preservar compatibilidad con posibles importadores externos
export { categorizarRegistroLiquidacion };

export default function OtherEmployeesHistoryView({
  usuario,
  onVolver,
  tema,
  onVerMiHistorial,
  onNuevoReporte,
  navegacionAuditoria,
  onConsumirNavegacion
}) {
  const isRpg = tema === 'rpg';

  // Si el usuario no tiene permisos para ver historial de otros empleados, denegar acceso
  if (!puedeVerHistorialOtros(usuario)) {
    return (
      <div className="view-content" style={{ padding: '32px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          No tienes permisos para visualizar el historial de otros colaboradores.
        </p>
        <button type="button" className="btn-back" onClick={onVolver}>
          Volver al Inicio
        </button>
      </div>
    );
  }

  // Maximizar ventana para experiencia panorámica
  useEffect(() => {
    api.maximizarVentana();
  }, []);

  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
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
  const [diaDestacado, setDiaDestacado] = useState(null);

  // Modal de edición
  const [registroEditando, setRegistroEditando] = useState(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Modal de eliminación
  const [registroEliminando, setRegistroEliminando] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  // Selección múltiple para asignación masiva de costo (RRHH)
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [aplicandoCosto, setAplicandoCosto] = useState(false);

  // Filtro por empleado en lista izquierda y selección de días en calendario
  const [filtroEmpleadoLista, setFiltroEmpleadoLista] = useState('');
  const [filtroSoloMes, setFiltroSoloMes] = useState(false);
  const [diasSeleccionadosCalendario, setDiasSeleccionadosCalendario] = useState(new Set());
  const [marcandoRevisadoId, setMarcandoRevisadoId] = useState(null);
  const [comparativaModificacion, setComparativaModificacion] = useState(null);

  // [FN-04.11] Controles de permisos según rol RBAC
  const esSoloLectura = esCore(usuario) || esAreaNucleo(usuario) || !puedeModificarHistorialOtros(usuario);
  const esSoloLecturaNucleo = esSoloLectura;
  const puedeVerModif = puedeVerModificaciones(usuario);
  const puedeEditarCosto = !esSoloLectura && puedeGestionarTipoCosto(usuario);
  const puedeVerLiquidacion = puedeVerCalculadoraLiquidacion(usuario);

  // Cantidad manual de días para las 5 categorías de liquidación (RRHH)
  const [diasOficinaManual, setDiasOficinaManual] = useState('');
  const [diasCampoManual, setDiasCampoManual] = useState('');
  const [diasFrancoObraManual, setDiasFrancoObraManual] = useState('');
  const [diasFrancoOficManual, setDiasFrancoOficManual] = useState('');
  const [diasFeriadoManual, setDiasFeriadoManual] = useState('');
  const [exportandoInforme, setExportandoInforme] = useState(false);

  // [FN-06.07] Modal exclusivo e independiente para edición manual de costo_dia
  const [modalCostoDia, setModalCostoDia] = useState(null);
  const [guardandoCostoDia, setGuardandoCostoDia] = useState(false);

  // Tarifas de Liquidación (guardadas en localStorage)
  const [tarifas, setTarifas] = useState(() => {
    try {
      const guardadas = localStorage.getItem('ingeap_tarifas_rrhh');
      if (guardadas) {
        const parsed = JSON.parse(guardadas);
        return {
          precioOficina: parsed.precioOficina || 0,
          precioObra: parsed.precioObra || 0,
          precioFrancoObraTrabajado: parsed.precioFrancoObraTrabajado ?? (parsed.precioFrancoTrabajado || 0),
          precioFrancoOficTrabajado: parsed.precioFrancoOficTrabajado ?? (parsed.precioFrancoTrabajado || 0),
          precioFeriadoTrabajado: parsed.precioFeriadoTrabajado || 0
        };
      }
    } catch (e) {
      console.error(e);
    }
    return {
      precioOficina: 0,
      precioObra: 0,
      precioFrancoObraTrabajado: 0,
      precioFrancoOficTrabajado: 0,
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

  // Colaborador actualmente seleccionado para auditar
  const empActual = useMemo(() => {
    if (!empleadoAuditar || !Array.isArray(empleados)) return null;
    const n = empleadoAuditar.trim().toLowerCase();
    return empleados.find(e => (e.nombre || '').trim().toLowerCase() === n);
  }, [empleadoAuditar, empleados]);

  // [FN-01.02] Pre-cargar tarifas con los costos reales de nómina del empleado si existen
  useEffect(() => {
    if (empActual) {
      const cOfi = Number(empActual.costo_dia_ofi) || 0;
      const cObra = Number(empActual.costo_dia_obra) || 0;
      if (cOfi > 0 || cObra > 0) {
        setTarifas(prev => ({
          precioOficina: cOfi > 0 ? cOfi : prev.precioOficina,
          precioObra: cObra > 0 ? cObra : prev.precioObra,
          precioFrancoObraTrabajado: cObra > 0 ? Math.round(cObra * 1.5 * 100) / 100 : (cOfi > 0 ? Math.round(cOfi * 1.5 * 100) / 100 : (prev.precioFrancoObraTrabajado || 0)),
          precioFrancoOficTrabajado: cOfi > 0 ? Math.round(cOfi * 1.5 * 100) / 100 : (cObra > 0 ? Math.round(cObra * 1.5 * 100) / 100 : (prev.precioFrancoOficTrabajado || 0)),
          precioFeriadoTrabajado: cObra > 0 ? Math.round(cObra * 2.0 * 100) / 100 : (cOfi > 0 ? Math.round(cOfi * 2.0 * 100) / 100 : prev.precioFeriadoTrabajado)
        }));
      }
    }
  }, [empActual]);

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
        setEmpleadoAuditar(prev => {
          const emp = prev || dataEmps[0].nombre;
          setFiltroEmpleadoLista(fPrev => (!fPrev ? emp : fPrev));
          return emp;
        });
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

  // [FN-02.04] Abrir panel flotante dividido comparativo de modificación
  const abrirComparativa = (item, modEspecifica = null) => {
    if (!item) return;
    const mods = Array.isArray(item.modificaciones) ? item.modificaciones : [];
    const modActiva = modEspecifica || (mods.length > 0 ? mods[mods.length - 1] : null);
    setComparativaModificacion({
      registro: item,
      modificaciones: mods,
      modActiva: modActiva,
      indiceActivo: modActiva ? mods.findIndex(m => m.id_modificacion === modActiva.id_modificacion) : (mods.length - 1)
    });
  };

  // [FN-02.02] Responder a navegación directa desde aviso/notificación de RRHH
  useEffect(() => {
    if (navegacionAuditoria && navegacionAuditoria.empleado) {
      const emp = navegacionAuditoria.empleado;
      setEmpleadoAuditar(emp);
      setFiltroEmpleadoLista(emp);
      if (navegacionAuditoria.fecha) {
        const partes = String(navegacionAuditoria.fecha).split('-');
        if (partes.length === 3) {
          const anio = parseInt(partes[0], 10);
          const mes = parseInt(partes[1], 10);
          setFechaCalendario(new Date(anio, mes - 1, 1));
        }
        setDiaDestacado(navegacionAuditoria.fecha);
      }
      if (navegacionAuditoria.idAsistencia) {
        const targetId = String(navegacionAuditoria.idAsistencia).trim();
        const targetItem = registros.find(r => String(r.id_asistencia || r.id).trim() === targetId);
        if (targetItem) {
          abrirComparativa(targetItem);
        }
      }
      if (onConsumirNavegacion) {
        onConsumirNavegacion();
      }
    }
  }, [navegacionAuditoria, registros]);

  // Si hay un día destacado por auditoría, intentar abrir comparativa automáticamente al cargar datos
  useEffect(() => {
    if (diaDestacado && registrosEmpleadoAuditar.length > 0 && !comparativaModificacion) {
      const itemDestacado = registrosEmpleadoAuditar.find(r => r.fecha === diaDestacado && Boolean(r.fue_modificado || r.modificado || (r.modificaciones && r.modificaciones.length > 0)));
      if (itemDestacado) {
        abrirComparativa(itemDestacado);
      }
    }
  }, [diaDestacado, registrosEmpleadoAuditar]);

  useEffect(() => {
    if (empleadoAuditar) {
      setDiasOficinaManual('');
      setDiasCampoManual('');
      setDiasFrancoObraManual('');
      setDiasFrancoOficManual('');
      setDiasFeriadoManual('');
      setDiasSeleccionadosCalendario(new Set());
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

  const handleLimpiarLocalYDescargar = async () => {
    if (!window.confirm('¿Deseas limpiar todos los registros locales y volver a descargar la información oficial desde Google Sheets? Esta acción descarta datos locales y previene registros duplicados.')) {
      return;
    }
    setLimpiando(true);
    setMensajeSync(null);
    try {
      const res = await api.limpiarYDescargarSheets();
      if (res && res.exito) {
        setMensajeSync({
          tipo: 'exito',
          texto: res.mensaje || 'Registros locales limpiados y sincronizados desde Google Sheets.'
        });
        await cargarDatos();
        if (empleadoAuditar) {
          await cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
        }
      } else {
        setMensajeSync({
          tipo: 'error',
          texto: res?.error || 'No se pudo completar la limpieza y descarga desde Google Sheets.'
        });
      }
    } catch (err) {
      console.error(err);
      setMensajeSync({ tipo: 'error', texto: 'Error de comunicación al limpiar y descargar.' });
    } finally {
      setLimpiando(false);
    }
  };

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
      const empData = empleados.find(u => u.nombre === registroEditando.empleado);
      const idEmp = registroEditando.id_empleado || (empData ? (empData.id_origen || empData.id_usuario || empData.dni || '') : '');
      const mailEmp = registroEditando.usuario_mail || (empData ? (empData.email || empData.mail || '') : '');

      const res = await api.modificarRegistro({
        id: registroEditando.id,
        fecha: registroEditando.fecha,
        lugar: registroEditando.tipo_ocf || registroEditando.lugar || 'Oficina',
        servicio: registroEditando.servicio,
        horas: Number(registroEditando.horas) || 0,
        hora_inicio: registroEditando.hora_inicio || '',
        hora_fin: registroEditando.hora_fin || '',
        tipo_costo: registroEditando.tipo_costo || '',
        empleado: registroEditando.empleado,
        id_empleado: idEmp,
        usuario_mail: mailEmp,
        id_proyecto: registroEditando.id_proyecto || '',
        quien_modifica: usuario?.nombre || ''
      });

      if (res && res.exito) {
        setMensajeSync({
          tipo: 'exito',
          texto: 'Registro modificado exitosamente. Sincronizando con Google Sheets en segundo plano (~3-5 seg)... No es necesario presionar Subir.'
        });
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

    if (!puedeModificarRegistro(usuario, registroEliminando)) {
      alert('Solo Justina Bertolozzi e Iván Valentin pueden eliminar registros de otros empleados.');
      setRegistroEliminando(null);
      return;
    }

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

  // [FN-02.02] Marcar modificación de una asistencia como revisada por RRHH
  const handleMarcarRevisado = async (item) => {
    const idAsistencia = item.id_asistencia || item.id;
    if (!idAsistencia) return;
    setMarcandoRevisadoId(idAsistencia);
    try {
      await api.marcarModificacionPorAsistenciaRevisada(idAsistencia);
      setRegistros(prev => prev.map(r => {
        if (r.id_asistencia === idAsistencia || r.id === item.id) {
          return { ...r, modificacion_pendiente: 0, modificacion_revisada: 1 };
        }
        return r;
      }));
      setRegistrosEmpleadoAuditar(prev => prev.map(r => {
        if (r.id_asistencia === idAsistencia || r.id === item.id) {
          return { ...r, modificacion_pendiente: 0, modificacion_revisada: 1 };
        }
        return r;
      }));
      if (diaSeleccionadoAuditoria) {
        setDiaSeleccionadoAuditoria(prev => {
          if (!prev) return null;
          return {
            ...prev,
            registros: prev.registros.map(r => {
              if (r.id_asistencia === idAsistencia || r.id === item.id) {
                return { ...r, modificacion_pendiente: 0, modificacion_revisada: 1 };
              }
              return r;
            })
          };
        });
      }
      if (comparativaModificacion) {
        setComparativaModificacion(prev => {
          if (!prev) return null;
          const targetId = prev.registro?.id_asistencia || prev.registro?.id;
          if (targetId === idAsistencia || targetId === item.id) {
            const modsUpdated = (prev.modificaciones || []).map(m => ({ ...m, revisado: 1 }));
            return {
              ...prev,
              modificaciones: modsUpdated,
              modActiva: prev.modActiva ? { ...prev.modActiva, revisado: 1 } : null,
              registro: { ...prev.registro, modificacion_pendiente: 0, modificacion_revisada: 1 }
            };
          }
          return prev;
        });
      }
      setMensajeSync({
        tipo: 'exito',
        texto: 'Modificación marcada como revisada. La alerta visual fue desactivada.'
      });
      window.dispatchEvent(new CustomEvent('catalogos-actualizados'));
    } catch (err) {
      console.error('Error al marcar modificación como revisada:', err);
      setMensajeSync({ tipo: 'error', texto: 'No se pudo marcar la modificación como revisada.' });
    } finally {
      setMarcandoRevisadoId(null);
    }
  };


  const handleMarcarRevisadoDesdeComparativa = async () => {
    if (!comparativaModificacion?.registro) return;
    await handleMarcarRevisado(comparativaModificacion.registro);
  };

  const handleCambiarModificacionActiva = (idx) => {
    if (!comparativaModificacion || !comparativaModificacion.modificaciones[idx]) return;
    setComparativaModificacion(prev => ({
      ...prev,
      modActiva: prev.modificaciones[idx],
      indiceActivo: idx
    }));
  };

  // [FN-06.07] Apertura de modal exclusivo para edición de costo_dia
  const handleAbrirModalCostoDia = (celda, regEspecifico = null) => {
    if (!celda || !celda.registros || celda.registros.length === 0) return;
    const reg = regEspecifico || celda.registros[0];
    setModalCostoDia({
      fecha: celda.fechaIso,
      empleado: reg.empleado || empleadoAuditar,
      registros: celda.registros,
      registroSeleccionado: reg,
      costoDiaActual: Number(reg.costo_dia) || 0,
      nuevoCostoDia: String(reg.costo_dia !== undefined && reg.costo_dia !== null ? reg.costo_dia : 0),
      motivo: ''
    });
  };

  const handleSeleccionarRegistroModalCostoDia = (reg) => {
    if (!modalCostoDia || !reg) return;
    setModalCostoDia(prev => ({
      ...prev,
      registroSeleccionado: reg,
      costoDiaActual: Number(reg.costo_dia) || 0,
      nuevoCostoDia: String(reg.costo_dia !== undefined && reg.costo_dia !== null ? reg.costo_dia : 0)
    }));
  };

  const handleGuardarCostoDia = async (e) => {
    e.preventDefault();
    if (!modalCostoDia || !modalCostoDia.registroSeleccionado) return;
    const target = modalCostoDia.registroSeleccionado;
    const idTarget = target.id_asistencia || target.id;
    if (!idTarget) {
      alert('No se pudo identificar el registro para actualizar.');
      return;
    }

    setGuardandoCostoDia(true);
    try {
      const valorNum = parseFloat(modalCostoDia.nuevoCostoDia) || 0;
      const res = await api.actualizarCostoDiaManual({
        id_asistencia: idTarget,
        costo_dia: valorNum,
        motivo: modalCostoDia.motivo?.trim() || 'Ajuste manual de costo_dia desde calendario'
      });

      if (res && res.exito) {
        setRegistros(prev => prev.map(r => {
          if ((r.id_asistencia && r.id_asistencia === idTarget) || (r.id && r.id === idTarget)) {
            return { ...r, costo_dia: valorNum };
          }
          return r;
        }));

        setRegistrosEmpleadoAuditar(prev => prev.map(r => {
          if ((r.id_asistencia && r.id_asistencia === idTarget) || (r.id && r.id === idTarget)) {
            return { ...r, costo_dia: valorNum };
          }
          return r;
        }));

        if (diaSeleccionadoAuditoria) {
          setDiaSeleccionadoAuditoria(prev => {
            if (!prev) return null;
            return {
              ...prev,
              registros: prev.registros.map(r => {
                if ((r.id_asistencia && r.id_asistencia === idTarget) || (r.id && r.id === idTarget)) {
                  return { ...r, costo_dia: valorNum };
                }
                return r;
              })
            };
          });
        }

        setMensajeSync({
          tipo: 'exito',
          texto: `Costo del día ($${valorNum.toLocaleString('es-AR')}) guardado para ${target.empleado} (${modalCostoDia.fecha}).`
        });
        setModalCostoDia(null);
        cargarDatos();
        if (empleadoAuditar) {
          cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
        }
      } else {
        alert(res?.error || 'No se pudo guardar el costo del día.');
      }
    } catch (err) {
      console.error('Error al guardar costo_dia manual:', err);
      alert('Error de comunicación al actualizar el costo del día.');
    } finally {
      setGuardandoCostoDia(false);
    }
  };

  // Manejo de asignación masiva de tipo_costo (RRHH)
  const handleToggleSelect = (id) => {
    setSeleccionados(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) {
        nuevo.delete(id);
      } else {
        nuevo.add(id);
      }
      return nuevo;
    });
  };

  const handleToggleSelectAll = () => {
    const visiblesIds = registrosFiltrados.map(r => r.id);
    const todosSeleccionados = visiblesIds.length > 0 && visiblesIds.every(id => seleccionados.has(id));
    if (todosSeleccionados) {
      setSeleccionados(prev => {
        const nuevo = new Set(prev);
        visiblesIds.forEach(id => nuevo.delete(id));
        return nuevo;
      });
    } else {
      setSeleccionados(prev => {
        const nuevo = new Set(prev);
        visiblesIds.forEach(id => nuevo.add(id));
        return nuevo;
      });
    }
  };

  const handleAplicarTipoCostoLote = async (tipoCosto) => {
    if (seleccionados.size === 0) return;
    setAplicandoCosto(true);
    try {
      const idsArray = Array.from(seleccionados);
      const res = await api.actualizarTipoCostoMasivo(idsArray, tipoCosto);
      if (res && res.exito) {
        setMensajeSync({
          tipo: 'exito',
          texto: `Se aplicó tipo de costo '${tipoCosto || 'Sin asignar'}' a ${res.actualizados || idsArray.length} registros.`
        });
        setSeleccionados(new Set());
        await cargarDatos();
        if (empleadoAuditar) {
          await cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
        }
      } else {
        setMensajeSync({ tipo: 'error', texto: res?.error || 'No se pudo actualizar el tipo de costo en lote.' });
      }
    } catch (err) {
      console.error('Error al aplicar tipo de costo masivo:', err);
      setMensajeSync({ tipo: 'error', texto: 'Error al comunicarse con la aplicación.' });
    } finally {
      setAplicandoCosto(false);
    }
  };

  // Filtrado en memoria para la lista de registros (lado izquierdo)
  const registrosFiltrados = useMemo(() => {
    const anio = fechaCalendario.getFullYear();
    const mesStr = String(fechaCalendario.getMonth() + 1).padStart(2, '0');
    const prefijoMes = `${anio}-${mesStr}`;

    return registros.filter(r => {
      if (filtroEmpleadoLista && (r.empleado || '').trim().toLowerCase() !== filtroEmpleadoLista.trim().toLowerCase()) {
        return false;
      }
      if (filtroSoloMes) {
        if (!r.fecha || !r.fecha.startsWith(prefijoMes)) {
          return false;
        }
      }
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
  }, [registros, filtroTexto, filtroEmpleadoLista, filtroSoloMes, fechaCalendario]);

  // Mapa de registros del empleado seleccionado indexados por fecha para el calendario
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
    const mes = fechaCalendario.getMonth();

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

  // [FN-02.02] Auto-abrir modal de auditoría al navegar desde notificación de RRHH
  useEffect(() => {
    if (diaDestacado && diasMesCalendario.length > 0) {
      const celdaTarget = diasMesCalendario.find(c => c.fechaIso === diaDestacado);
      if (celdaTarget && celdaTarget.registros && celdaTarget.registros.length > 0) {
        setDiaSeleccionadoAuditoria(celdaTarget);
      }
    }
  }, [diaDestacado, diasMesCalendario]);

  // Asignar tipo de costo a todos los registros de los días seleccionados en el calendario
  const handleAplicarTipoCostoDiasCalendario = async (tipoCosto) => {
    const ids = [];
    diasMesCalendario.forEach(celda => {
      if (!celda.esVacio && diasSeleccionadosCalendario.has(celda.fechaIso)) {
        (celda.registros || []).forEach(r => {
          const id = r.id_asistencia || r.id;
          if (id) ids.push(id);
        });
      }
    });

    if (ids.length === 0) {
      alert('No se encontraron registros de asistencia en los días seleccionados.');
      return;
    }

    setAplicandoCosto(true);
    try {
      const res = await api.actualizarTipoCostoMasivo(ids, tipoCosto);
      if (res && res.exito) {
        setMensajeSync({
          tipo: 'exito',
          texto: `Se asignó costo "${tipoCosto || 'Sin Asignar'}" a ${res.actualizados || ids.length} registro(s) de los días seleccionados.`
        });
        setDiasSeleccionadosCalendario(new Set());
        await cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
        await cargarDatos();
      } else {
        setMensajeSync({
          tipo: 'error',
          texto: res?.error || 'No se pudo actualizar el costo de los días seleccionados.'
        });
      }
    } catch (err) {
      console.error('Error al actualizar tipo de costo para días del calendario:', err);
      setMensajeSync({ tipo: 'error', texto: 'Error al comunicarse con la aplicación.' });
    } finally {
      setAplicandoCosto(false);
    }
  };

  const navegarMes = (delta) => {
    setFechaCalendario(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const irAHoy = () => {
    const hoy = new Date();
    setFechaCalendario(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  };

  // [FN-06.04] Registros seleccionados para liquidación
  const registrosParaLiquidar = useMemo(() => {
    const anio = fechaCalendario.getFullYear();
    const mesStr = String(fechaCalendario.getMonth() + 1).padStart(2, '0');
    const prefijoMes = `${anio}-${mesStr}`;

    if (diasSeleccionadosCalendario && diasSeleccionadosCalendario.size > 0) {
      return registrosEmpleadoAuditar.filter(r => r.fecha && diasSeleccionadosCalendario.has(r.fecha));
    }
    if (seleccionados && seleccionados.size > 0) {
      return registrosEmpleadoAuditar.filter(r => seleccionados.has(r.id || r.id_asistencia));
    }
    return registrosEmpleadoAuditar.filter(r => r.fecha && r.fecha.startsWith(prefijoMes));
  }, [registrosEmpleadoAuditar, fechaCalendario, diasSeleccionadosCalendario, seleccionados]);

  // [FN-06.04] Conteo de días para la calculadora de liquidación
  const conteosLiquidacion = useMemo(() => {
    const fechasOficina = new Set();
    const fechasObra = new Set();
    const fechasFrancoObraTrabajado = new Set();
    const fechasFrancoOficTrabajado = new Set();
    const fechasFeriadoTrabajado = new Set();

    registrosParaLiquidar.forEach(r => {
      if (!r.fecha) return;
      const f = r.fecha.trim();
      const cat = categorizarRegistroLiquidacion(r);

      if (cat === 'oficina') fechasOficina.add(f);
      else if (cat === 'obra') fechasObra.add(f);
      else if (cat === 'franco_obra_trab') fechasFrancoObraTrabajado.add(f);
      else if (cat === 'franco_ofic_trab') fechasFrancoOficTrabajado.add(f);
      else if (cat === 'feriado_trab') fechasFeriadoTrabajado.add(f);
    });

    return {
      diasOficina: fechasOficina.size,
      diasObra: fechasObra.size,
      diasFrancoObraTrabajado: fechasFrancoObraTrabajado.size,
      diasFrancoOficTrabajado: fechasFrancoOficTrabajado.size,
      diasFeriadoTrabajado: fechasFeriadoTrabajado.size
    };
  }, [registrosParaLiquidar]);

  const hayModoManual = (
    diasOficinaManual !== '' ||
    diasCampoManual !== '' ||
    diasFrancoObraManual !== '' ||
    diasFrancoOficManual !== '' ||
    diasFeriadoManual !== ''
  );

  const cantDiasOficina = (diasOficinaManual !== '' && !isNaN(parseFloat(diasOficinaManual)))
    ? Math.max(0, parseFloat(diasOficinaManual))
    : conteosLiquidacion.diasOficina;

  const cantDiasObra = (diasCampoManual !== '' && !isNaN(parseFloat(diasCampoManual)))
    ? Math.max(0, parseFloat(diasCampoManual))
    : conteosLiquidacion.diasObra;

  const cantDiasFrancoObra = (diasFrancoObraManual !== '' && !isNaN(parseFloat(diasFrancoObraManual)))
    ? Math.max(0, parseFloat(diasFrancoObraManual))
    : conteosLiquidacion.diasFrancoObraTrabajado;

  const cantDiasFrancoOfic = (diasFrancoOficManual !== '' && !isNaN(parseFloat(diasFrancoOficManual)))
    ? Math.max(0, parseFloat(diasFrancoOficManual))
    : conteosLiquidacion.diasFrancoOficTrabajado;

  const cantDiasFeriadoTrabajado = (diasFeriadoManual !== '' && !isNaN(parseFloat(diasFeriadoManual)))
    ? Math.max(0, parseFloat(diasFeriadoManual))
    : conteosLiquidacion.diasFeriadoTrabajado;

  // [FN-06.06] Suma de importes basada en costo_dia agrupado por (fecha, categoría)
  const sumasCostoDiaPorCategoria = useMemo(() => {
    const mapaFechaCat = new Map();

    registrosParaLiquidar.forEach(r => {
      if (!r.fecha) return;
      const f = r.fecha.trim();
      const cat = categorizarRegistroLiquidacion(r);
      const clave = `${f}__${cat}`;
      const c = Number(r.costo_dia) || 0;

      if (!mapaFechaCat.has(clave)) {
        mapaFechaCat.set(clave, { cat, fecha: f, costo_dia: c });
      } else {
        const actual = mapaFechaCat.get(clave);
        if (c > actual.costo_dia) {
          actual.costo_dia = c;
        }
      }
    });

    let sumOficina = 0;
    let sumObra = 0;
    let sumFrancoObra = 0;
    let sumFrancoOfic = 0;
    let sumFeriado = 0;
    let totalDirecto = 0;

    mapaFechaCat.forEach(({ cat, costo_dia }) => {
      totalDirecto += costo_dia;
      if (cat === 'oficina') sumOficina += costo_dia;
      else if (cat === 'obra') sumObra += costo_dia;
      else if (cat === 'franco_obra_trab') sumFrancoObra += costo_dia;
      else if (cat === 'franco_ofic_trab') sumFrancoOfic += costo_dia;
      else if (cat === 'feriado_trab') sumFeriado += costo_dia;
      else sumOficina += costo_dia;
    });

    return {
      oficina: Math.round(sumOficina * 100) / 100,
      obra: Math.round(sumObra * 100) / 100,
      francoObra: Math.round(sumFrancoObra * 100) / 100,
      francoOfic: Math.round(sumFrancoOfic * 100) / 100,
      feriado: Math.round(sumFeriado * 100) / 100,
      totalDirecto: Math.round(totalDirecto * 100) / 100
    };
  }, [registrosParaLiquidar]);

  const subtotalOficina = (diasOficinaManual !== '')
    ? Math.round(cantDiasOficina * (tarifas.precioOficina || 0) * 100) / 100
    : sumasCostoDiaPorCategoria.oficina;

  const subtotalObra = (diasCampoManual !== '')
    ? Math.round(cantDiasObra * (tarifas.precioObra || 0) * 100) / 100
    : sumasCostoDiaPorCategoria.obra;

  const subtotalFrancoObra = (diasFrancoObraManual !== '')
    ? Math.round(cantDiasFrancoObra * (tarifas.precioFrancoObraTrabajado || 0) * 100) / 100
    : sumasCostoDiaPorCategoria.francoObra;

  const subtotalFrancoOfic = (diasFrancoOficManual !== '')
    ? Math.round(cantDiasFrancoOfic * (tarifas.precioFrancoOficTrabajado || 0) * 100) / 100
    : sumasCostoDiaPorCategoria.francoOfic;

  const subtotalFeriado = (diasFeriadoManual !== '')
    ? Math.round(cantDiasFeriadoTrabajado * (tarifas.precioFeriadoTrabajado || 0) * 100) / 100
    : sumasCostoDiaPorCategoria.feriado;

  const totalLiquidar = Math.round((subtotalOficina + subtotalObra + subtotalFrancoObra + subtotalFrancoOfic + subtotalFeriado) * 100) / 100;
  const totalDiasComputados = cantDiasOficina + cantDiasObra + cantDiasFrancoObra + cantDiasFrancoOfic + cantDiasFeriadoTrabajado;

  // [FN-06.05] Exportación oficial de informe de liquidación a Excel
  const handleDescargarInformeLiquidacion = async () => {
    if (!empleadoAuditar) return;
    setExportandoInforme(true);
    try {
      const anio = fechaCalendario.getFullYear();
      const mesStr = String(fechaCalendario.getMonth() + 1).padStart(2, '0');
      const prefijoMes = `${anio}-${mesStr}`;

      const registrosMes = registrosParaLiquidar
        .filter(r => r.fecha && r.fecha.startsWith(prefijoMes))
        .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

      const getTarifaEfectiva = (cat) => {
        if (cat === 'oficina') return cantDiasOficina > 0 ? subtotalOficina / cantDiasOficina : (tarifas.precioOficina || 0);
        if (cat === 'obra') return cantDiasObra > 0 ? subtotalObra / cantDiasObra : (tarifas.precioObra || 0);
        if (cat === 'franco_obra_trab') return cantDiasFrancoObra > 0 ? subtotalFrancoObra / cantDiasFrancoObra : (tarifas.precioFrancoObraTrabajado || 0);
        if (cat === 'franco_ofic_trab') return cantDiasFrancoOfic > 0 ? subtotalFrancoOfic / cantDiasFrancoOfic : (tarifas.precioFrancoOficTrabajado || 0);
        if (cat === 'feriado_trab') return cantDiasFeriadoTrabajado > 0 ? subtotalFeriado / cantDiasFeriadoTrabajado : (tarifas.precioFeriadoTrabajado || 0);
        return 0;
      };

      const mapaPorFecha = new Map();
      registrosMes.forEach(r => {
        const f = r.fecha || '';
        if (!mapaPorFecha.has(f)) mapaPorFecha.set(f, []);
        mapaPorFecha.get(f).push(r);
      });

      const mapaProyectos = new Map();
      const registrosDetalle = [];

      mapaPorFecha.forEach((regsDia, fechaStr) => {
        const regsPorCat = new Map();
        regsDia.forEach(r => {
          const cat = categorizarRegistroLiquidacion(r);
          if (!regsPorCat.has(cat)) regsPorCat.set(cat, []);
          regsPorCat.get(cat).push(r);
        });

        regsPorCat.forEach((regsCat, cat) => {
          const tarifaCat = getTarifaEfectiva(cat);
          const costoDiaCat = Math.round(tarifaCat * 100) / 100;
          const totHrsCat = regsCat.reduce((sum, r) => sum + (Number(r.horas) || 0), 0);

          const regRepresentativo = [...regsCat].sort((a, b) => (Number(b.horas) || 0) - (Number(a.horas) || 0))[0];

          const srv = (regRepresentativo.servicio || 'Sin servicio').trim();
          if (!mapaProyectos.has(srv)) {
            mapaProyectos.set(srv, { proyecto: srv, diasSet: new Set(), horas: 0, monto: 0 });
          }
          const itemP = mapaProyectos.get(srv);
          itemP.diasSet.add(fechaStr);
          itemP.horas += totHrsCat;
          itemP.monto += costoDiaCat;

          registrosDetalle.push({
            fecha: regRepresentativo.fecha || fechaStr,
            dia_semana: regRepresentativo.dia_semana || '',
            tipo_ocf: obtenerEtiquetaModalidad(regRepresentativo),
            servicio: srv,
            horas: totHrsCat,
            tipo_costo: regRepresentativo.tipo_costo || (cat === 'obra' || cat === 'franco_obra_trab' ? 'Campo' : 'Oficina'),
            costo_dia: costoDiaCat
          });
        });
      });

      const proyectosImputados = Array.from(mapaProyectos.values()).map(p => ({
        proyecto: p.proyecto,
        dias: p.diasSet.size,
        horas: Math.round(p.horas * 10) / 10,
        monto: Math.round(p.monto * 100) / 100
      })).sort((a, b) => b.horas - a.horas);

      const resumenCategorias = [
        {
          concepto: 'Día de oficina',
          dias: cantDiasOficina,
          tarifa_diaria: tarifas.precioOficina || 0,
          subtotal: subtotalOficina
        },
        {
          concepto: 'Día de obra',
          dias: cantDiasObra,
          tarifa_diaria: tarifas.precioObra || 0,
          subtotal: subtotalObra
        },
        {
          concepto: 'Franco de obra trabajado',
          dias: cantDiasFrancoObra,
          tarifa_diaria: tarifas.precioFrancoObraTrabajado || 0,
          subtotal: subtotalFrancoObra
        },
        {
          concepto: 'Franco de oficina trabajado',
          dias: cantDiasFrancoOfic,
          tarifa_diaria: tarifas.precioFrancoOficTrabajado || 0,
          subtotal: subtotalFrancoOfic
        },
        {
          concepto: 'Feriado trabajado',
          dias: cantDiasFeriadoTrabajado,
          tarifa_diaria: tarifas.precioFeriadoTrabajado || 0,
          subtotal: subtotalFeriado
        }
      ].filter(c => c.dias > 0 || c.subtotal > 0 || c.tarifa_diaria > 0);

      const datosInforme = {
        empleado: empActual?.nombre || empleadoAuditar,
        dni: empActual?.dni || '',
        email: empActual?.mail || empActual?.email || '',
        area: empActual?.area || '',
        nombre_mes: NOMBRES_MESES[fechaCalendario.getMonth()],
        anio: fechaCalendario.getFullYear(),
        total_liquidar: totalLiquidar,
        resumen_categorias: resumenCategorias,
        proyectos_imputados: proyectosImputados,
        registros_detalle: registrosDetalle
      };

      const res = await api.exportarInformeLiquidacion(datosInforme);
      if (res && res.exito) {
        alert(`Informe de liquidación generado con éxito:\n${res.ruta || 'Archivo guardado'}`);
      } else if (res && res.cancelado) {
        // Cancelado por el usuario
      } else {
        alert(`No se pudo exportar el informe: ${res?.error || 'Error desconocido'}`);
      }
    } catch (err) {
      console.error('Error al exportar informe de liquidación:', err);
      alert('Error inesperado al generar el informe de liquidación.');
    } finally {
      setExportandoInforme(false);
    }
  };

  const handleEnfocarDiaCalendario = (item) => {
    if (item.empleado && item.empleado !== empleadoAuditar) {
      setEmpleadoAuditar(item.empleado);
      setFiltroEmpleadoLista(item.empleado);
    }
    if (item.fecha) {
      const partes = String(item.fecha).split('-');
      if (partes.length === 3) {
        setFechaCalendario(new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, 1));
      }
      setDiaDestacado(item.fecha);
    }
  };

  const pendientesCount = registros.filter(r => r.sincronizado === 0).length;

  const contenidoPrincipal = (
    <>
      {/* Barra superior de navegación y sincronización */}
      <HistoryTopBar
        isRpg={isRpg}
        onVolver={onVolver}
        onVerMiHistorial={onVerMiHistorial}
        puedeVerLiquidacion={puedeVerLiquidacion}
        pendientesCount={pendientesCount}
        sincronizando={sincronizando}
        cargando={cargando}
        limpiando={limpiando}
        mensajeSync={mensajeSync}
        setMensajeSync={setMensajeSync}
        ejecutarSincronizacion={ejecutarSincronizacion}
        onRefrescar={async () => {
          setCargando(true);
          try {
            await api.refrescarCatalogos();
          } catch (e) {
            console.error('Error al refrescar catálogos:', e);
          }
          await cargarDatos();
          if (empleadoAuditar) {
            await cargarAuditoriaEmpleado(empleadoAuditar, fechaCalendario);
          }
          setCargando(false);
        }}
        handleLimpiarLocalYDescargar={handleLimpiarLocalYDescargar}
      />

      {/* Contenedor dividido: Lista de registros a la izquierda, Auditoría y Liquidación a la derecha */}
      <div className="other-history-split-grid">
        <HistoryRecordsList
          isRpg={isRpg}
          registrosFiltrados={registrosFiltrados}
          filtroTexto={filtroTexto}
          setFiltroTexto={setFiltroTexto}
          filtroEmpleadoLista={filtroEmpleadoLista}
          setFiltroEmpleadoLista={setFiltroEmpleadoLista}
          setEmpleadoAuditar={setEmpleadoAuditar}
          empleados={empleados}
          filtroSoloMes={filtroSoloMes}
          setFiltroSoloMes={setFiltroSoloMes}
          nombresMeses={NOMBRES_MESES}
          fechaCalendario={fechaCalendario}
          puedeEditarCosto={puedeEditarCosto}
          seleccionados={seleccionados}
          handleToggleSelectAll={handleToggleSelectAll}
          handleToggleSelect={handleToggleSelect}
          handleAplicarTipoCostoLote={handleAplicarTipoCostoLote}
          aplicandoCosto={aplicandoCosto}
          setSeleccionados={setSeleccionados}
          cargando={cargando}
          registrosTotalCount={registros.length}
          onEnfocarDiaCalendario={handleEnfocarDiaCalendario}
          puedeVerModif={puedeVerModif}
          abrirComparativa={abrirComparativa}
          marcandoRevisadoId={marcandoRevisadoId}
          handleMarcarRevisado={handleMarcarRevisado}
          handleAbrirModalCostoDia={handleAbrirModalCostoDia}
          esSoloLecturaNucleo={esSoloLecturaNucleo}
          puedeModificarRegistro={puedeModificarRegistro}
          usuario={usuario}
          setRegistroEditando={setRegistroEditando}
          setRegistroEliminando={setRegistroEliminando}
        />

        <div className="other-right-panel">
          <HistoryAuditCalendar
            isRpg={isRpg}
            empleadoAuditar={empleadoAuditar}
            setEmpleadoAuditar={setEmpleadoAuditar}
            setFiltroEmpleadoLista={setFiltroEmpleadoLista}
            empleados={empleados}
            fechaCalendario={fechaCalendario}
            navegarMes={navegarMes}
            irAHoy={irAHoy}
            puedeEditarCosto={puedeEditarCosto}
            diasSeleccionadosCalendario={diasSeleccionadosCalendario}
            setDiasSeleccionadosCalendario={setDiasSeleccionadosCalendario}
            handleAplicarTipoCostoDiasCalendario={handleAplicarTipoCostoDiasCalendario}
            aplicandoCosto={aplicandoCosto}
            diasMesCalendario={diasMesCalendario}
            diaDestacado={diaDestacado}
            setDiaSeleccionadoAuditoria={setDiaSeleccionadoAuditoria}
            handleAbrirModalCostoDia={handleAbrirModalCostoDia}
          />

          {puedeVerLiquidacion && (
            <HistoryLiquidationCard
              isRpg={isRpg}
              empleadoAuditar={empleadoAuditar}
              fechaCalendario={fechaCalendario}
              hayModoManual={hayModoManual}
              totalDiasComputados={totalDiasComputados}
              conteosLiquidacion={conteosLiquidacion}
              diasOficinaManual={diasOficinaManual}
              setDiasOficinaManual={setDiasOficinaManual}
              diasCampoManual={diasCampoManual}
              setDiasCampoManual={setDiasCampoManual}
              diasFrancoObraManual={diasFrancoObraManual}
              setDiasFrancoObraManual={setDiasFrancoObraManual}
              diasFrancoOficManual={diasFrancoOficManual}
              setDiasFrancoOficManual={setDiasFrancoOficManual}
              diasFeriadoManual={diasFeriadoManual}
              setDiasFeriadoManual={setDiasFeriadoManual}
              exportandoInforme={exportandoInforme}
              handleDescargarInformeLiquidacion={handleDescargarInformeLiquidacion}
              tarifas={tarifas}
              handleTarifaChange={handleTarifaChange}
              cantDiasOficina={cantDiasOficina}
              subtotalOficina={subtotalOficina}
              cantDiasObra={cantDiasObra}
              subtotalObra={subtotalObra}
              cantDiasFrancoObra={cantDiasFrancoObra}
              subtotalFrancoObra={subtotalFrancoObra}
              cantDiasFrancoOfic={cantDiasFrancoOfic}
              subtotalFrancoOfic={subtotalFrancoOfic}
              cantDiasFeriadoTrabajado={cantDiasFeriadoTrabajado}
              subtotalFeriado={subtotalFeriado}
              totalLiquidar={totalLiquidar}
              diasSeleccionadosCalendario={diasSeleccionadosCalendario}
              seleccionados={seleccionados}
            />
          )}
        </div>
      </div>

      {/* Modales */}
      <HistoryDayRecordsModal
        diaSeleccionadoAuditoria={diaSeleccionadoAuditoria}
        onClose={() => setDiaSeleccionadoAuditoria(null)}
        empleadoAuditar={empleadoAuditar}
        puedeVerModif={puedeVerModif}
        abrirComparativa={abrirComparativa}
        marcandoRevisadoId={marcandoRevisadoId}
        handleMarcarRevisado={handleMarcarRevisado}
        puedeEditarCosto={puedeEditarCosto}
        handleAbrirModalCostoDia={handleAbrirModalCostoDia}
        esSoloLecturaNucleo={esSoloLecturaNucleo}
        puedeModificarRegistro={puedeModificarRegistro}
        usuario={usuario}
        setRegistroEditando={setRegistroEditando}
        setRegistroEliminando={setRegistroEliminando}
      />

      <HistoryEditRecordModal
        registroEditando={registroEditando}
        setRegistroEditando={setRegistroEditando}
        empleados={empleados}
        serviciosDisponibles={serviciosDisponibles}
        puedeEditarCosto={puedeEditarCosto}
        guardandoEdicion={guardandoEdicion}
        handleGuardarModificacion={handleGuardarModificacion}
        onSolicitarEliminar={(reg) => {
          setRegistroEditando(null);
          setRegistroEliminando(reg);
        }}
        onClose={() => setRegistroEditando(null)}
      />

      <HistoryDeleteRecordModal
        registroEliminando={registroEliminando}
        onClose={() => setRegistroEliminando(null)}
        eliminando={eliminando}
        handleConfirmarEliminacion={handleConfirmarEliminacion}
      />

      <HistoryDiffModal
        comparativaModificacion={comparativaModificacion}
        onClose={() => setComparativaModificacion(null)}
        handleCambiarModificacionActiva={handleCambiarModificacionActiva}
        marcandoRevisadoId={marcandoRevisadoId}
        handleMarcarRevisadoDesdeComparativa={handleMarcarRevisadoDesdeComparativa}
        puedeModificarRegistro={puedeModificarRegistro}
        usuario={usuario}
        onEditarRegistro={(reg) => {
          setComparativaModificacion(null);
          setRegistroEditando(reg);
        }}
      />

      <HistoryCostDayModal
        modalCostoDia={modalCostoDia}
        setModalCostoDia={setModalCostoDia}
        guardandoCostoDia={guardandoCostoDia}
        handleGuardarCostoDia={handleGuardarCostoDia}
        handleSeleccionarRegistroModalCostoDia={handleSeleccionarRegistroModalCostoDia}
        empActual={empActual}
        onClose={() => setModalCostoDia(null)}
      />
    </>
  );

  // En modo RPG: envuelto dentro del Tablón de Madera de la Taberna
  if (isRpg) {
    return (
      <div className="rpg-board-viewport rpg-other-history-viewport">
        <div className="rpg-notice-board">
          <div className="rpg-iron-bracket top-left" />
          <div className="rpg-iron-bracket top-right" />
          <div className="rpg-iron-bracket bottom-left" />
          <div className="rpg-iron-bracket bottom-right" />

          <div className="rpg-curved-banner">
            <div className="rpg-banner-scroll-roll left" />
            <div className="rpg-banner-body">
              <div className="rpg-banner-heading-wrap">
                <div className="rpg-illuminated-box">A</div>
                <h1 className="rpg-banner-main-title">CRÓNICAS DE AVENTUREROS • GREMIO INGEAP</h1>
              </div>
              <span className="rpg-banner-subtitle">
                LIBRO DE COMPAÑÍA • AUDITORÍA DE MISIONES Y RECOMPENSAS
              </span>
            </div>
            <div className="rpg-banner-scroll-roll right" />
          </div>

          <div className="view-content other-history-container rpg-other-history-content">
            {contenidoPrincipal}
          </div>
        </div>
      </div>
    );
  }

  // En modo Normal / Corporativo
  return (
    <div className="view-content other-history-container">
      {contenidoPrincipal}
    </div>
  );
}
