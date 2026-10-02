import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';
import { puedeVerHistorialOtros, puedeModificarRegistro, puedeGestionarTipoCosto, puedeVerModificaciones, esAreaNucleo, puedeVerCalculadoraLiquidacion, esCore, puedeModificarHistorialOtros } from '../utils/permissions';
import { esServicioAreaInterna, esFrancoDeObra, obtenerEtiquetaModalidad } from '../utils/francoUtils';
import { getTituloRpg } from '../utils/rpgTitles';

// [MOD-03] OtherEmployeesHistoryView

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

const TIPOS_LICENCIA = [
  'Licencia - Médica',
  'Licencia - Examen',
  'Licencia - Fallecimiento',
  'Licencia - Paternidad / Maternidad',
  'Licencia - Mudanza',
  'Licencia - Especial',
  'Licencia - Otra'
];

// [FN-06.04] Categorización de registro según las 5 categorías oficiales de liquidación de RRHH
export const categorizarRegistroLiquidacion = (r) => {
  if (!r) return 'oficina';
  const lugLower = (r.tipo_ocf || r.lugar || '').trim().toLowerCase();
  const srv = (r.servicio || '').trim();
  const srvLower = srv.toLowerCase();
  const hrs = Number(r.horas) || 0;
  const esFer = (r.feriado || '').toUpperCase() === 'SI';
  const tipoCosto = (r.tipo_costo || '').trim();

  const esFrancoObraTrab = (
    lugLower === 'franco obra trabajado' ||
    (lugLower === 'franco trabajado' && (tipoCosto === 'Campo' || esFrancoDeObra(r))) ||
    ((lugLower === 'franco' || lugLower === 'franco obra' || lugLower === 'franco de obra') && hrs > 0 && (tipoCosto === 'Campo' || esFrancoDeObra(r)))
  );

  if (esFrancoObraTrab) return 'franco_obra_trab';

  const esFrancoOficTrab = (
    lugLower === 'franco ofic trabajado' ||
    lugLower === 'franco trabajado' ||
    ((lugLower === 'franco' || lugLower === 'franco de oficina') && hrs > 0 && (srvLower.includes('trabajado') || tipoCosto === 'Oficina' || esServicioAreaInterna(srv)))
  );

  if (esFrancoOficTrab) return 'franco_ofic_trab';
  if (lugLower === 'feriado trabajado' || (esFer && hrs > 0)) return 'feriado_trab';
  if (esFrancoDeObra(r) || ['campaña / campo', 'campo', 'obra', 'roster'].includes(lugLower)) return 'obra';
  return 'oficina';
};

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
  const esSoloLecturaNucleo = esSoloLectura; // Mantiene compatibilidad con chequeos existentes en la vista
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

  const nombresMeses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // [FN-06.04] Registros seleccionados para liquidación:
  // Si hay días seleccionados en el calendario o registros seleccionados en tabla, toma esos;
  // de lo contrario, toma todos los registros del mes activo en el calendario.
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

  // [FN-06.04] Cálculo de días detectados para la calculadora de liquidación
  // Regla estricta: un registro por día si son del mismo tipo (dos registros de oficina en proyectos distintos
  // cuentan como 1 solo día de oficina para costo); si tiene oficina y campo en el mismo día, se cuentan ambos.
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

  // Indicador de modo manual o excepción
  const hayModoManual = (
    diasOficinaManual !== '' ||
    diasCampoManual !== '' ||
    diasFrancoObraManual !== '' ||
    diasFrancoOficManual !== '' ||
    diasFeriadoManual !== ''
  );

  // Cantidad efectiva para cada categoría (con soporte de incremento 0.5 y restablecimiento automático)
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

  const subtotalOficina = Math.round(cantDiasOficina * (tarifas.precioOficina || 0) * 100) / 100;
  const subtotalObra = Math.round(cantDiasObra * (tarifas.precioObra || 0) * 100) / 100;
  const subtotalFrancoObra = Math.round(cantDiasFrancoObra * (tarifas.precioFrancoObraTrabajado || 0) * 100) / 100;
  const subtotalFrancoOfic = Math.round(cantDiasFrancoOfic * (tarifas.precioFrancoOficTrabajado || 0) * 100) / 100;
  const subtotalFeriado = Math.round(cantDiasFeriadoTrabajado * (tarifas.precioFeriadoTrabajado || 0) * 100) / 100;

  const totalLiquidar = Math.round((subtotalOficina + subtotalObra + subtotalFrancoObra + subtotalFrancoOfic + subtotalFeriado) * 100) / 100;

  const totalDiasComputados = cantDiasOficina + cantDiasObra + cantDiasFrancoObra + cantDiasFrancoOfic + cantDiasFeriadoTrabajado;

  const formatMoneda = (val) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val || 0);
  };

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

      // Tarifas efectivas por categoría
      const getTarifaEfectiva = (cat) => {
        if (cat === 'oficina') return cantDiasOficina > 0 ? subtotalOficina / cantDiasOficina : (tarifas.precioOficina || 0);
        if (cat === 'obra') return cantDiasObra > 0 ? subtotalObra / cantDiasObra : (tarifas.precioObra || 0);
        if (cat === 'franco_obra_trab') return cantDiasFrancoObra > 0 ? subtotalFrancoObra / cantDiasFrancoObra : (tarifas.precioFrancoObraTrabajado || 0);
        if (cat === 'franco_ofic_trab') return cantDiasFrancoOfic > 0 ? subtotalFrancoOfic / cantDiasFrancoOfic : (tarifas.precioFrancoOficTrabajado || 0);
        if (cat === 'feriado_trab') return cantDiasFeriadoTrabajado > 0 ? subtotalFeriado / cantDiasFeriadoTrabajado : (tarifas.precioFeriadoTrabajado || 0);
        return 0;
      };

      // 1. Agrupar registros por fecha para distribuir costos proporcionalmente entre proyectos del mismo día
      const mapaPorFecha = new Map();
      registrosMes.forEach(r => {
        const f = r.fecha || '';
        if (!mapaPorFecha.has(f)) mapaPorFecha.set(f, []);
        mapaPorFecha.get(f).push(r);
      });

      const mapaProyectos = new Map();
      const registrosDetalle = [];

      mapaPorFecha.forEach((regsDia, fechaStr) => {
        // Agrupar registros del día por categoría
        const regsPorCat = new Map();
        regsDia.forEach(r => {
          const cat = categorizarRegistroLiquidacion(r);
          if (!regsPorCat.has(cat)) regsPorCat.set(cat, []);
          regsPorCat.get(cat).push(r);
        });

        regsPorCat.forEach((regsCat, cat) => {
          const tarifaCat = getTarifaEfectiva(cat);
          const totHrsCat = regsCat.reduce((sum, r) => sum + (Number(r.horas) || 0), 0);
          let acumuladoDiaCat = 0.0;

          regsCat.forEach((r, idx) => {
            const hrs = Number(r.horas) || 0;
            let share = 0.0;
            if (idx === regsCat.length - 1) {
              share = Math.round((tarifaCat - acumuladoDiaCat) * 100) / 100;
            } else {
              if (totHrsCat > 0) {
                share = Math.round(tarifaCat * (hrs / totHrsCat) * 100) / 100;
              } else {
                share = Math.round((tarifaCat / regsCat.length) * 100) / 100;
              }
              acumuladoDiaCat += share;
            }

            const srv = (r.servicio || 'Sin servicio').trim();
            if (!mapaProyectos.has(srv)) {
              mapaProyectos.set(srv, { proyecto: srv, diasSet: new Set(), horas: 0, monto: 0 });
            }
            const itemP = mapaProyectos.get(srv);
            itemP.diasSet.add(fechaStr);
            itemP.horas += hrs;
            itemP.monto += share;

            registrosDetalle.push({
              fecha: r.fecha || '',
              dia_semana: r.dia_semana || '',
              tipo_ocf: obtenerEtiquetaModalidad(r),
              servicio: srv,
              horas: hrs,
              tipo_costo: r.tipo_costo || (cat === 'obra' || cat === 'franco_obra_trab' ? 'Campo' : 'Oficina'),
              costo_dia: share
            });
          });
        });
      });

      const proyectosImputados = Array.from(mapaProyectos.values()).map(p => ({
        proyecto: p.proyecto,
        dias: p.diasSet.size,
        horas: Math.round(p.horas * 10) / 10,
        monto: Math.round(p.monto * 100) / 100
      })).sort((a, b) => b.horas - a.horas);

      // 2. Resumen categorías
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
        nombre_mes: nombresMeses[fechaCalendario.getMonth()],
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
        // Cancelado por el usuario en el diálogo
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

  const getBadgeClassLugar = (lugar, servicio = '') => {
    const l = (lugar || '').toLowerCase().trim();
    const s = (servicio || '').toLowerCase().trim();
    if (l === 'franco obra' || l === 'franco de obra' || s.includes('franco de obra') || (l === 'franco' && s && !esServicioAreaInterna(s))) {
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

  const contenidoPrincipal = (
    <>
      {/* Barra superior de navegación */}
      <div className="view-header-bar other-history-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onVolver && (
            <button type="button" className={isRpg ? 'rpg-wood-btn' : 'btn-back'} onClick={onVolver}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>{isRpg ? 'Taberna' : 'Inicio'}</span>
            </button>
          )}

          {onVerMiHistorial && (
            <button type="button" className={isRpg ? 'rpg-wood-btn' : 'btn-action-ghost'} onClick={onVerMiHistorial}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
              <span>{isRpg ? 'Mi Libro' : 'Mi Historial'}</span>
            </button>
          )}

          <div className="other-history-title-block">
            <span className="other-history-title">
              {isRpg ? '🏰 Cuartel General • Crónicas de Aventureros' : 'Panel de Control de Empleados (RRHH)'}
            </span>
            <span className="other-history-subtitle">
              {isRpg
                ? (`📜 Anales de la Compañía • Historial de Aventureros${puedeVerLiquidacion ? ' • Reparto de Botín' : ''}`)
                : (`Auditoría integral de asistencia • Registros de RRHH${puedeVerLiquidacion ? ' • Calculadora de Liquidación' : ''}`)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {pendientesCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="sync-auto-helper" title="La aplicación sincroniza en segundo plano automáticamente">
                <span className="sync-dot-pulse" /> Sincronización automática activa (~3-5s)
              </span>
              <button
                type="button"
                className={isRpg ? 'rpg-wood-btn' : 'btn-sync'}
                onClick={ejecutarSincronizacion}
                disabled={sincronizando}
                title="Sincronizar cambios pendientes inmediatamente con Google Sheets (No requerido: se sincroniza solo)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
                <span>{sincronizando ? 'Enviando...' : (isRpg ? `Sellar Hojas (${pendientesCount})` : `Subir ahora (${pendientesCount})`)}</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : 'btn-refresh'}
            onClick={async () => {
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
            disabled={cargando || sincronizando || limpiando}
            title="Actualizar registros desde Google Sheets y base local"
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
            {isRpg ? 'Consultar Oráculo' : 'Refrescar'}
          </button>

          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : 'btn-refresh'}
            onClick={handleLimpiarLocalYDescargar}
            disabled={cargando || sincronizando || limpiando}
            title="Eliminar registros locales y descargar directamente desde Google Sheets para evitar duplicados"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={limpiando ? 'spinner' : ''}
            >
              <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            {limpiando ? 'Purgando...' : (isRpg ? 'Purgar Anales' : 'Limpiar')}
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
            PANEL IZQUIERDO: Listado de registros con filtro por empleado
            ========================================================================= */}
        <div className="other-left-panel">
          <div className="other-panel-header">
            <div className="other-panel-title-row">
              <span className="other-panel-title">
                {isRpg ? '📜 Registro de Expediciones' : 'Listado de registros'}
              </span>
              <span className="other-count-badge">{registrosFiltrados.length}</span>
            </div>

            <div className="other-left-filters" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="search-input-wrapper">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder={isRpg ? 'Buscar en los anales por misión, lugar o fecha...' : 'Buscar por proyecto, lugar o fecha...'}
                  className="form-input form-input-sm search-field"
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                />
                {filtroTexto && (
                  <button type="button" className="clear-search-btn" onClick={() => setFiltroTexto('')}>✕</button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {isRpg ? 'Aventurero:' : 'Empleado:'}
                </span>
                <select
                  className="form-select form-select-sm"
                  style={{ width: '100%', height: '30px', fontSize: '12px' }}
                  value={filtroEmpleadoLista}
                  onChange={(e) => {
                    const nuevo = e.target.value;
                    setFiltroEmpleadoLista(nuevo);
                    if (nuevo) setEmpleadoAuditar(nuevo);
                  }}
                  title="Filtrar listado por empleado"
                >
                  <option value="">{isRpg ? 'Todos los aventureros' : 'Todos los empleados'}</option>
                  {empleados.map(u => (
                    <option key={u.dni || u.nombre} value={u.nombre}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro rápido por mes del calendario */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={filtroSoloMes}
                    onChange={(e) => setFiltroSoloMes(e.target.checked)}
                    style={{ accentColor: '#cc3333', cursor: 'pointer' }}
                  />
                  <span>Solo mes visible ({nombresMeses[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()})</span>
                </label>
              </div>
            </div>

            {/* Asignación Masiva de Costos Toolbar (Exclusivo RRHH y Aplicaciones) */}
            {puedeEditarCosto && (
              <div className="bulk-selection-toolbar" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-action-ghost"
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                    onClick={handleToggleSelectAll}
                  >
                    {registrosFiltrados.length > 0 && registrosFiltrados.every(r => seleccionados.has(r.id))
                      ? '☑ Deseleccionar visibles'
                      : '☐ Seleccionar visibles'}
                  </button>
                  {seleccionados.size > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#cc3333' }}>
                      {seleccionados.size} seleccionado(s)
                    </span>
                  )}
                </div>

                {seleccionados.size > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--bg-surface-elevated, #f8fafc)',
                    border: '1px solid #cc333340',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Asignar Costo:
                    </span>
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ fontSize: '11px', padding: '3px 8px', background: '#3b82f615', color: '#2563eb', borderColor: '#3b82f640' }}
                      onClick={() => handleAplicarTipoCostoLote('Oficina')}
                      disabled={aplicandoCosto}
                    >
                      Oficina
                    </button>
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ fontSize: '11px', padding: '3px 8px', background: '#10b98115', color: '#059669', borderColor: '#10b98140' }}
                      onClick={() => handleAplicarTipoCostoLote('Campo')}
                      disabled={aplicandoCosto}
                    >
                      Campo
                    </button>
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      onClick={() => handleAplicarTipoCostoLote('')}
                      disabled={aplicandoCosto}
                    >
                      Sin Asignar
                    </button>
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ fontSize: '11px', padding: '3px 6px', marginLeft: 'auto' }}
                      onClick={() => setSeleccionados(new Set())}
                      title="Limpiar selección"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
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
                    ? 'No hay registros cargados en la base de datos.'
                    : 'No se encontraron registros con los filtros aplicados.'}
                </span>
              </div>
            ) : (
              <div className="other-cards-col">
                {registrosFiltrados.map((item) => {
                  const lugarDisplay = obtenerEtiquetaModalidad(item);
                  const badgeClass = getBadgeClassLugar(lugarDisplay, item.servicio);
                  const horasDisplay = item.horas > 0 ? `${item.horas} hs` : (item.jornada || '0 hs');
                  const estaSincronizado = item.sincronizado === 1;
                  const isChecked = seleccionados.has(item.id);

                  return (
                    <div key={item.id} className={`other-record-card ${isChecked ? 'card-selected' : ''}`}>
                      <div className="other-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {puedeEditarCosto && (
                            <input
                              type="checkbox"
                              style={{
                                width: '18px',
                                height: '18px',
                                cursor: 'pointer',
                                accentColor: '#cc3333'
                              }}
                              checked={isChecked}
                              onChange={() => handleToggleSelect(item.id)}
                              title="Seleccionar para asignar costo"
                            />
                          )}
                          <div className="other-card-user">
                            <div className="other-user-avatar">
                              {getIniciales(item.empleado)}
                            </div>
                            <div className="other-user-meta">
                              <span className="other-user-name">{item.empleado || 'Sin empleado'}</span>
                              {isRpg && (
                                <span className="rpg-card-role-chip" style={{ fontSize: '10px', color: '#f59e0b', display: 'block', fontWeight: 600 }}>
                                  {getTituloRpg(item.empleado)}
                                </span>
                              )}
                              {item.cargado_por && (
                                <span className="other-user-sub">
                                  Cargado por: <strong>{item.cargado_por}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="other-card-badges">
                          {Boolean(item.fue_modificado || item.modificado) && (
                            item.modificacion_revisada === 1 && item.modificacion_pendiente !== 1 ? (
                              <span className="status-badge badge-modificado-revisado" title={item.detalle_modificacion || 'Modificación revisada por RRHH'}>
                                ✓ Revisado
                              </span>
                            ) : (
                              <span className="status-badge badge-modificado" title={item.detalle_modificacion || 'Modificado - Pendiente de revisión'}>
                                ✏️ Modificado
                              </span>
                            )
                          )}
                          {puedeEditarCosto && item.tipo_costo && (
                            <span className={`status-badge ${item.tipo_costo.toLowerCase() === 'campo' ? 'badge-costo-campo' : 'badge-costo-oficina'}`}>
                              Costo: {item.tipo_costo}
                            </span>
                          )}
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
                          className="btn-card-action"
                          style={{ color: '#2563eb', borderColor: '#3b82f640' }}
                          onClick={() => {
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
                          }}
                          title="Ver y enfocar este día en el calendario"
                        >
                          📅 Calendario
                        </button>

                        {puedeVerModif && Boolean(item.fue_modificado || item.modificado || (item.modificaciones && item.modificaciones.length > 0)) && (
                          <button
                            type="button"
                            className="btn-card-action btn-comparativa-action"
                            style={{ color: '#7c3aed', borderColor: '#8b5cf650', background: '#8b5cf615', fontWeight: 600 }}
                            onClick={() => abrirComparativa(item)}
                            title="Auditar modificación: ver comparativa dividida antes y después"
                          >
                            ⚖️ Comparativa
                          </button>
                        )}

                        {puedeVerModif && (item.modificacion_pendiente === 1 || (Boolean(item.fue_modificado || item.modificado) && item.modificacion_revisada !== 1)) && (
                          <button
                            type="button"
                            className="btn-card-action"
                            style={{ color: '#059669', borderColor: '#10b98150', background: '#10b98115', fontWeight: 600 }}
                            disabled={marcandoRevisadoId === (item.id_asistencia || item.id)}
                            onClick={() => handleMarcarRevisado(item)}
                            title="Marcar modificación como revisada por RRHH para quitar la alerta"
                          >
                            ✓ Revisado
                          </button>
                        )}

                        {!esSoloLecturaNucleo && puedeModificarRegistro(usuario, item) ? (
                          <>
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
                          </>
                        ) : (
                          <span className="badge-solo-lectura" title="Solo lectura">
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
                <span>{isRpg ? 'Aventurero a auditar:' : 'Auditar empleado:'}</span>
              </label>
              <select
                className="form-select form-select-clean audit-select-field"
                value={empleadoAuditar}
                onChange={(e) => {
                  const nuevo = e.target.value;
                  setEmpleadoAuditar(nuevo);
                  setFiltroEmpleadoLista(nuevo);
                }}
              >
                {empleados.map(u => (
                  <option key={u.dni || u.nombre} value={u.nombre}>
                    {u.nombre} ({u.area || 'Sin área'})
                  </option>
                ))}
              </select>
              {isRpg && empleadoAuditar && (
                <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, display: 'block', marginTop: '2px' }}>
                  {getTituloRpg(empleadoAuditar)}
                </span>
              )}
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
                className={isRpg ? 'rpg-wood-btn' : 'calendar-today-btn'}
                onClick={irAHoy}
              >
                Hoy
              </button>
            </div>
          </div>

          {/* Grilla del Calendario Mensual Interactivo */}
          <div className="audit-calendar-wrapper" style={{ position: 'relative' }}>
            {/* Barra flotante para asignación masiva de costo a días seleccionados (Solo RRHH y Aplicaciones) */}
            {puedeEditarCosto && diasSeleccionadosCalendario.size > 0 && (
              <div className="calendar-floating-cost-toolbar">
                <div className="floating-cost-left">
                  <span className="floating-cost-badge">{diasSeleccionadosCalendario.size}</span>
                  <span className="floating-cost-text">día(s) seleccionado(s)</span>
                </div>
                <div className="floating-cost-actions">
                  <button
                    type="button"
                    className="btn-floating-cost btn-cost-oficina"
                    onClick={() => handleAplicarTipoCostoDiasCalendario('Oficina')}
                    disabled={aplicandoCosto}
                    title="Asignar Costo Oficina a los días seleccionados"
                  >
                    🏢 Costo Oficina
                  </button>
                  <button
                    type="button"
                    className="btn-floating-cost btn-cost-campo"
                    onClick={() => handleAplicarTipoCostoDiasCalendario('Campo')}
                    disabled={aplicandoCosto}
                    title="Asignar Costo Campo a los días seleccionados"
                  >
                    🏕️ Costo Campo
                  </button>
                  <button
                    type="button"
                    className="btn-floating-cost btn-cost-neutral"
                    onClick={() => handleAplicarTipoCostoDiasCalendario('')}
                    disabled={aplicandoCosto}
                    title="Quitar tipo de costo"
                  >
                    Sin Asignar
                  </button>
                  <button
                    type="button"
                    className="btn-floating-cost btn-cost-close"
                    onClick={() => setDiasSeleccionadosCalendario(new Set())}
                    title="Desmarcar todos los días"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

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
                const estaSeleccionado = diasSeleccionadosCalendario.has(celda.fechaIso);
                const tieneModificadosPendientes = celda.registros.some(r => r.modificacion_pendiente === 1 || (r.fue_modificado === 1 && r.modificacion_revisada !== 1));
                const tieneModificadosRevisados = !tieneModificadosPendientes && celda.registros.some(r => r.modificacion_revisada === 1);
                const esDestacada = diaDestacado === celda.fechaIso;

                return (
                  <div
                    key={celda.id}
                    className={`calendar-cell ${celda.esHoy ? 'cell-today' : ''} ${tieneRegistros ? 'cell-has-data' : ''} ${estaSeleccionado ? 'cell-selected-day' : ''} ${tieneModificadosPendientes ? 'cell-has-modified' : ''} ${tieneModificadosRevisados ? 'cell-has-modified-reviewed' : ''} ${esDestacada ? 'cell-destacada-modificacion' : ''}`}
                    onClick={() => {
                      if (!tieneRegistros) return;
                      setDiaSeleccionadoAuditoria(celda);
                    }}
                    style={{ cursor: tieneRegistros ? 'pointer' : 'default' }}
                    title={tieneRegistros ? `${celda.registros.length} registro(s) el ${celda.fechaIso}${tieneModificadosPendientes ? ' • Modificación pendiente de revisión' : (tieneModificadosRevisados ? ' • Modificación revisada por RRHH' : '')} (Toca para ver detalles)` : celda.fechaIso}
                  >
                    <div className="cell-top-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="cell-day-number">{celda.diaNumero}</span>
                        {tieneModificadosPendientes && (
                          <span className="cell-mod-badge" title="Este día contiene registros con modificaciones pendientes de revisión">
                            ✏️
                          </span>
                        )}
                        {tieneModificadosRevisados && (
                          <span className="cell-mod-badge-reviewed" title="Modificación revisada por RRHH">
                            ✓
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {celda.esHoy && <span className="cell-today-dot" title="Hoy" />}
                        {puedeEditarCosto && tieneRegistros && (
                          <input
                            type="checkbox"
                            className="calendar-day-checkbox"
                            checked={estaSeleccionado}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              setDiasSeleccionadosCalendario(prev => {
                                const next = new Set(prev);
                                if (next.has(celda.fechaIso)) {
                                  next.delete(celda.fechaIso);
                                } else {
                                  next.add(celda.fechaIso);
                                }
                                return next;
                              });
                            }}
                            title={`Seleccionar día ${celda.fechaIso}`}
                          />
                        )}
                      </div>
                    </div>

                    <div className="cell-events-container">
                      {celda.registros.slice(0, 3).map((r, idx) => {
                        const lug = r.tipo_ocf || r.lugar || 'Oficina';
                        const badgeClass = getBadgeClassLugar(lug, r.servicio);
                        const fueModPendiente = r.modificacion_pendiente === 1 || (r.fue_modificado === 1 && r.modificacion_revisada !== 1);
                        const fueModRevisado = !fueModPendiente && r.modificacion_revisada === 1;
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
                            className={`cell-event-pill ${badgeClass} ${fueModPendiente ? 'cell-event-modified' : ''} ${fueModRevisado ? 'cell-event-modified-reviewed' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDiaSeleccionadoAuditoria(celda);
                            }}
                            title={`${lug} - ${r.servicio} (${r.horas} hs)${fueModPendiente ? ' • ✏️ MODIFICADO (Pendiente revisión)' : (fueModRevisado ? ' • ✓ Modificación revisada' : '')}${r.detalle_modificacion ? ' • ' + r.detalle_modificacion : ''} • Toca para ver detalle`}
                          >
                            {fueModPendiente && <span className="pill-mod-icon" title="Modificado (Pendiente)">✏️</span>}
                            {fueModRevisado && <span className="pill-mod-reviewed-icon" title="Modificado (Revisado)">✓</span>}
                            <span className="cell-event-label">{labelText}</span>
                            {fueModPendiente && <span className="pill-mod-tag">MOD</span>}
                            {fueModRevisado && <span className="pill-mod-reviewed-tag">REV</span>}
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
                <span className="legend-item"><span className="legend-item"><span className="legend-color-box badge-modalidad-licencia" /> Licencia</span></span>
                <span className="legend-item"><span className="legend-mod-indicator">✏️ MOD</span> Modif. Pendiente</span>
                <span className="legend-item"><span className="legend-mod-reviewed-indicator">✓ REV</span> Modif. Revisada</span>
              </div>
            </div>
          </div>

          {/* =========================================================================
              CALCULADORA DE LIQUIDACIÓN DEBAJO DEL CALENDARIO (Exclusivo Justina e Iván)
              ========================================================================= */}
          {puedeVerLiquidacion && (
            <div className={`liquidation-card ${isRpg ? 'rpg-liquidation-card' : ''}`}>
              <div className="liquidation-card-header">
                <div className="liquidation-card-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  <span>
                    {isRpg
                      ? `💰 Reparto de Botín y Recompensas • ${empleadoAuditar || 'Aventurero'}`
                      : `Calculadora de Liquidación • ${empleadoAuditar || 'Empleado'}`} ({nombresMeses[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()})
                  </span>
                </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: !hayModoManual ? '#dcfce7' : '#fef3c7', color: !hayModoManual ? '#15803d' : '#b45309', fontWeight: 600 }}>
                  {!hayModoManual
                    ? `⚡ Cálculo automático (${totalDiasComputados} d)`
                    : '✏️ Modo manual / excepciones'}
                </span>
                {hayModoManual && (
                  <button
                    type="button"
                    className="btn-action-ghost"
                    style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--color-primary, #cc3333)' }}
                    onClick={() => {
                      setDiasOficinaManual('');
                      setDiasCampoManual('');
                      setDiasFrancoObraManual('');
                      setDiasFrancoOficManual('');
                      setDiasFeriadoManual('');
                    }}
                    title="Restablecer todos los campos al cálculo automático oficial"
                  >
                    ↺ Restablecer a cálculo auto
                  </button>
                )}
                <button
                  type="button"
                  className="btn-action-primary"
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: '#16a34a',
                    borderColor: '#16a34a',
                    color: '#ffffff',
                    fontWeight: 600,
                    borderRadius: '6px'
                  }}
                  disabled={exportandoInforme}
                  onClick={handleDescargarInformeLiquidacion}
                  title="Descargar informe oficial en Excel con detalle de días, costos y proyectos auditados"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {exportandoInforme ? 'Generando Excel...' : 'Descargar Informe'}
                </button>
              </div>
            </div>

            <div className="liquidation-grid">
              {/* Tarjeta 1: Día de oficina */}
              <div className="liquidation-item">
                <div className="liq-item-top">
                  <span className="liq-label">Día de oficina</span>
                  <span className="liq-count-badge" title="Incluye oficina y francos asignados a áreas internas">{conteosLiquidacion.diasOficina} detectado(s)</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    Cant. días:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="form-input form-input-sm"
                    style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
                    value={diasOficinaManual !== '' ? diasOficinaManual : conteosLiquidacion.diasOficina}
                    onChange={(e) => setDiasOficinaManual(e.target.value)}
                    title="Cantidad de días de oficina (editable con incrementos de 0.5)"
                  />
                  {diasOficinaManual !== '' && (
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ padding: '2px 5px', fontSize: '10px' }}
                      onClick={() => setDiasOficinaManual('')}
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
                    placeholder="Precio día"
                    className="form-input form-input-sm liq-input"
                    value={tarifas.precioOficina || ''}
                    onChange={(e) => handleTarifaChange('precioOficina', e.target.value)}
                  />
                </div>
                <div className="liq-subtotal-row">
                  <span>Subtotal ({cantDiasOficina} d):</span>
                  <strong>{formatMoneda(subtotalOficina)}</strong>
                </div>
              </div>

              {/* Tarjeta 2: Día de obra */}
              <div className="liquidation-item">
                <div className="liq-item-top">
                  <span className="liq-label">Día de obra</span>
                  <span className="liq-count-badge" title="Incluye campo/obra y francos de obra">{conteosLiquidacion.diasObra} detectado(s)</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    Cant. días:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="form-input form-input-sm"
                    style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
                    value={diasCampoManual !== '' ? diasCampoManual : conteosLiquidacion.diasObra}
                    onChange={(e) => setDiasCampoManual(e.target.value)}
                    title="Cantidad de días de obra (editable con incrementos de 0.5)"
                  />
                  {diasCampoManual !== '' && (
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ padding: '2px 5px', fontSize: '10px' }}
                      onClick={() => setDiasCampoManual('')}
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
                    placeholder="Precio día obra"
                    className="form-input form-input-sm liq-input"
                    value={tarifas.precioObra || ''}
                    onChange={(e) => handleTarifaChange('precioObra', e.target.value)}
                  />
                </div>
                <div className="liq-subtotal-row">
                  <span>Subtotal ({cantDiasObra} d):</span>
                  <strong>{formatMoneda(subtotalObra)}</strong>
                </div>
              </div>

              {/* Tarjeta 3: Franco de Obra Trabajado */}
              <div className="liquidation-item">
                <div className="liq-item-top">
                  <span className="liq-label">Franco de obra trab.</span>
                  <span className="liq-count-badge" title="Franco de obra trabajado (150% día obra)">{conteosLiquidacion.diasFrancoObraTrabajado} detectado(s)</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    Cant. días:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="form-input form-input-sm"
                    style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
                    value={diasFrancoObraManual !== '' ? diasFrancoObraManual : conteosLiquidacion.diasFrancoObraTrabajado}
                    onChange={(e) => setDiasFrancoObraManual(e.target.value)}
                    title="Cantidad de francos de obra trabajados (editable con incrementos de 0.5)"
                  />
                  {diasFrancoObraManual !== '' && (
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ padding: '2px 5px', fontSize: '10px' }}
                      onClick={() => setDiasFrancoObraManual('')}
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
                    placeholder="Precio franco obra"
                    className="form-input form-input-sm liq-input"
                    value={tarifas.precioFrancoObraTrabajado || ''}
                    onChange={(e) => handleTarifaChange('precioFrancoObraTrabajado', e.target.value)}
                  />
                </div>
                <div className="liq-subtotal-row">
                  <span>Subtotal ({cantDiasFrancoObra} d):</span>
                  <strong>{formatMoneda(subtotalFrancoObra)}</strong>
                </div>
              </div>

              {/* Tarjeta 4: Franco de Oficina Trabajado */}
              <div className="liquidation-item">
                <div className="liq-item-top">
                  <span className="liq-label">Franco de ofic. trab.</span>
                  <span className="liq-count-badge" title="Franco de oficina trabajado (150% día oficina)">{conteosLiquidacion.diasFrancoOficTrabajado} detectado(s)</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    Cant. días:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="form-input form-input-sm"
                    style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
                    value={diasFrancoOficManual !== '' ? diasFrancoOficManual : conteosLiquidacion.diasFrancoOficTrabajado}
                    onChange={(e) => setDiasFrancoOficManual(e.target.value)}
                    title="Cantidad de francos de oficina trabajados (editable con incrementos de 0.5)"
                  />
                  {diasFrancoOficManual !== '' && (
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ padding: '2px 5px', fontSize: '10px' }}
                      onClick={() => setDiasFrancoOficManual('')}
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
                    placeholder="Precio franco ofic."
                    className="form-input form-input-sm liq-input"
                    value={tarifas.precioFrancoOficTrabajado || ''}
                    onChange={(e) => handleTarifaChange('precioFrancoOficTrabajado', e.target.value)}
                  />
                </div>
                <div className="liq-subtotal-row">
                  <span>Subtotal ({cantDiasFrancoOfic} d):</span>
                  <strong>{formatMoneda(subtotalFrancoOfic)}</strong>
                </div>
              </div>

              {/* Tarjeta 5: Feriado trabajado */}
              <div className="liquidation-item">
                <div className="liq-item-top">
                  <span className="liq-label">Feriado trabajado</span>
                  <span className="liq-count-badge">{conteosLiquidacion.diasFeriadoTrabajado} detectado(s)</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    Cant. días:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="form-input form-input-sm"
                    style={{ width: '65px', height: '28px', padding: '2px 6px', fontWeight: 700 }}
                    value={diasFeriadoManual !== '' ? diasFeriadoManual : conteosLiquidacion.diasFeriadoTrabajado}
                    onChange={(e) => setDiasFeriadoManual(e.target.value)}
                    title="Cantidad de feriados trabajados (editable con incrementos de 0.5)"
                  />
                  {diasFeriadoManual !== '' && (
                    <button
                      type="button"
                      className="btn-action-ghost"
                      style={{ padding: '2px 5px', fontSize: '10px' }}
                      onClick={() => setDiasFeriadoManual('')}
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
                    placeholder="Precio feriado trab."
                    className="form-input form-input-sm liq-input"
                    value={tarifas.precioFeriadoTrabajado || ''}
                    onChange={(e) => handleTarifaChange('precioFeriadoTrabajado', e.target.value)}
                  />
                </div>
                <div className="liq-subtotal-row">
                  <span>Subtotal ({cantDiasFeriadoTrabajado} d):</span>
                  <strong>{formatMoneda(subtotalFeriado)}</strong>
                </div>
              </div>
            </div>

            {/* Total Liquidación Banner */}
            <div className="liquidation-total-banner">
              <div className="liq-total-info">
                <span className="liq-total-subtitle">Liquidación total correspondiente a {empleadoAuditar || 'empleado'}:</span>
                <span className="liq-total-period">
                  {nombresMeses[fechaCalendario.getMonth()]} {fechaCalendario.getFullYear()}
                  {diasSeleccionadosCalendario && diasSeleccionadosCalendario.size > 0 && ` (${diasSeleccionadosCalendario.size} días seleccionados en calendario)`}
                  {seleccionados && seleccionados.size > 0 && ` (${seleccionados.size} registros seleccionados)`}
                </span>
                <span style={{ fontSize: '11px', color: !hayModoManual ? '#16a34a' : 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                  {!hayModoManual
                    ? '✓ Calculado automáticamente (1 registro por día para el mismo tipo; computa ambos si combina oficina y campo).'
                    : 'Recálculo manual aplicado según días y tarifas configuradas.'}
                </span>
              </div>
              <div className="liq-total-amount-box">
                <span className="liq-total-amount-label">{isRpg ? 'TESORO TOTAL A LIQUIDAR' : 'TOTAL A LIQUIDAR'}</span>
                <span className="liq-total-amount-value">{formatMoneda(totalLiquidar)}</span>
              </div>
            </div>
          </div>
          )}
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
                      {puedeVerModif && Boolean(item.fue_modificado || item.modificado) && (
                        item.modificacion_revisada === 1 && item.modificacion_pendiente !== 1 ? (
                          <div style={{ marginTop: '6px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '6px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                ✓ Modificación revisada por RRHH
                              </span>
                              <button
                                type="button"
                                className="btn-comparativa-action"
                                style={{
                                  background: '#7c3aed',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '5px',
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onClick={() => abrirComparativa(item)}
                                title="Ver panel comparativo antes / después"
                              >
                                ⚖️ Ver Comparativa
                              </button>
                            </div>
                            {item.detalle_modificacion && (
                              <span style={{ fontSize: '11px', color: '#15803d', display: 'block', marginTop: '2px' }}>
                                {item.detalle_modificacion}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginTop: '6px', background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '6px', padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                ✏️ MODIFICACIÓN PENDIENTE DE REVISIÓN
                              </span>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="btn-comparativa-action"
                                  style={{
                                    background: '#7c3aed',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '5px',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  onClick={() => abrirComparativa(item)}
                                  title="Ver comparativa dividida antes y después"
                                >
                                  ⚖️ Comparativa
                                </button>
                                <button
                                  type="button"
                                  className="btn-mark-reviewed"
                                  style={{
                                    background: '#10b981',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '5px',
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 3px rgba(16, 185, 129, 0.3)'
                                  }}
                                  disabled={marcandoRevisadoId === (item.id_asistencia || item.id)}
                                  onClick={() => handleMarcarRevisado(item)}
                                  title="Marcar como revisado para que no vuelva a aparecer la alerta"
                                >
                                  {marcandoRevisadoId === (item.id_asistencia || item.id) ? 'Guardando...' : '✓ Marcar como Revisado'}
                                </button>
                              </div>
                            </div>
                            {item.detalle_modificacion && (
                              <span style={{ fontSize: '11px', color: '#92400e', display: 'block', marginTop: '4px', lineHeight: 1.3 }}>
                                {item.detalle_modificacion}
                              </span>
                            )}
                          </div>
                        )
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                      {!esSoloLecturaNucleo && puedeModificarRegistro(usuario, item) ? (
                        <>
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
                        </>
                      ) : (
                        <span className="badge-solo-lectura" title="Solo lectura">
                          🔒 Solo lectura
                        </span>
                      )}
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
                  onChange={(e) => {
                    const nuevoNombre = e.target.value;
                    const empData = empleados.find(u => u.nombre === nuevoNombre);
                    setRegistroEditando({
                      ...registroEditando,
                      empleado: nuevoNombre,
                      id_empleado: empData ? (empData.id_origen || empData.id_usuario || empData.dni || '') : '',
                      usuario_mail: empData ? (empData.email || empData.mail || '') : ''
                    });
                  }}
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

              {/* Si es Licencia: enum de tipos de licencia */}
              {(registroEditando.tipo_ocf === 'Licencia' || registroEditando.lugar === 'Licencia') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Tipo de Licencia:</label>
                  <select
                    className="form-select form-select-clean"
                    value={registroEditando.servicio || 'Licencia - Médica'}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                    required
                  >
                    {TIPOS_LICENCIA.map(tl => (
                      <option key={tl} value={tl}>{tl}</option>
                    ))}
                    {registroEditando.servicio && !TIPOS_LICENCIA.includes(registroEditando.servicio) && (
                      <option value={registroEditando.servicio}>{registroEditando.servicio}</option>
                    )}
                  </select>
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
                    <optgroup label="Proyectos Activos">
                      {serviciosDisponibles.map((srv, idx) => (
                        <option key={idx} value={srv}>{srv}</option>
                      ))}
                    </optgroup>
                    {registroEditando.servicio && !serviciosDisponibles.includes(registroEditando.servicio) && (
                      <option value={registroEditando.servicio}>{registroEditando.servicio}</option>
                    )}
                  </select>
                </div>
              ) : (registroEditando.tipo_ocf === 'Franco' || registroEditando.lugar === 'Franco') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Área / Asignación (Franco):</label>
                  <select
                    className="form-select form-select-clean"
                    value={registroEditando.servicio || ''}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                    required
                  >
                    <option value="">-- Seleccionar asignación de Franco --</option>
                    <optgroup label="Áreas Corporativas (Franco de Oficina)">
                      {LISTADO_AREAS_CORPORATIVAS.map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Proyectos Activos (Franco de Obra)">
                      {serviciosDisponibles.map((srv, idx) => (
                        <option key={idx} value={srv}>{srv}</option>
                      ))}
                    </optgroup>
                    {registroEditando.servicio &&
                      !LISTADO_AREAS_CORPORATIVAS.includes(registroEditando.servicio) &&
                      !serviciosDisponibles.includes(registroEditando.servicio) && (
                        <option value={registroEditando.servicio}>{registroEditando.servicio}</option>
                    )}
                  </select>
                </div>
              ) : (registroEditando.tipo_ocf === 'Vacaciones' || registroEditando.lugar === 'Vacaciones') ? (
                <div className="form-group-clean">
                  <label className="form-label-clean">Detalle:</label>
                  <select
                    className="form-select form-select-clean"
                    value="Vacaciones"
                    disabled
                  >
                    <option value="Vacaciones">Vacaciones</option>
                  </select>
                </div>
              ) : (
                <div className="form-group-clean">
                  <label className="form-label-clean">Proyecto / Tarea asignada:</label>
                  <select
                    className="form-select form-select-clean"
                    value={registroEditando.servicio || 'Tiempo dedicado al Área'}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, servicio: e.target.value })}
                    required
                  >
                    <optgroup label="Tareas y Áreas Internas">
                      <option value="Tiempo dedicado al Área">Tiempo dedicado al Área</option>
                      <option value="Dedicado al área">Dedicado al área</option>
                      {LISTADO_AREAS_CORPORATIVAS.map(a => (
                        <option key={a} value={`Dedicado al área - ${a}`}>Dedicado al área - {a}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Proyectos Activos">
                      {serviciosDisponibles.map((srv, idx) => (
                        <option key={idx} value={srv}>{srv}</option>
                      ))}
                    </optgroup>
                    {registroEditando.servicio &&
                      registroEditando.servicio !== 'Tiempo dedicado al Área' &&
                      registroEditando.servicio !== 'Dedicado al área' &&
                      !LISTADO_AREAS_CORPORATIVAS.some(a => `Dedicado al área - ${a}` === registroEditando.servicio) &&
                      !serviciosDisponibles.includes(registroEditando.servicio) && (
                        <option value={registroEditando.servicio}>{registroEditando.servicio}</option>
                    )}
                  </select>
                </div>
              )}

              {/* Si es Campo: selectores de hora inicio y fin */}
              {['Campo', 'Campaña / Campo'].includes(registroEditando.tipo_ocf || registroEditando.lugar) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group-clean">
                    <label className="form-label-clean">Hora Inicio:</label>
                    <input
                      type="time"
                      className="form-input form-input-clean"
                      value={registroEditando.hora_inicio || ''}
                      onChange={(e) => {
                        const hIni = e.target.value;
                        const hFin = registroEditando.hora_fin;
                        let hCalc = registroEditando.horas;
                        if (hIni && hFin) {
                          const [h1, m1] = hIni.split(':').map(Number);
                          const [h2, m2] = hFin.split(':').map(Number);
                          let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                          if (diff < 0) diff += 24 * 60;
                          hCalc = Number((diff / 60).toFixed(2));
                        }
                        setRegistroEditando({ ...registroEditando, hora_inicio: hIni, horas: hCalc });
                      }}
                    />
                  </div>
                  <div className="form-group-clean">
                    <label className="form-label-clean">Hora Fin:</label>
                    <input
                      type="time"
                      className="form-input form-input-clean"
                      value={registroEditando.hora_fin || ''}
                      onChange={(e) => {
                        const hFin = e.target.value;
                        const hIni = registroEditando.hora_inicio;
                        let hCalc = registroEditando.horas;
                        if (hIni && hFin) {
                          const [h1, m1] = hIni.split(':').map(Number);
                          const [h2, m2] = hFin.split(':').map(Number);
                          let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                          if (diff < 0) diff += 24 * 60;
                          hCalc = Number((diff / 60).toFixed(2));
                        }
                        setRegistroEditando({ ...registroEditando, hora_fin: hFin, horas: hCalc });
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="form-group-clean">
                <label className="form-label-clean">Horas Registradas:</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="form-input form-input-clean"
                  value={registroEditando.horas}
                  onChange={(e) => setRegistroEditando({ ...registroEditando, horas: e.target.value })}
                  disabled={['Franco', 'Franco de Oficina', 'Franco Obra', 'Franco de Obra', 'Vacaciones', 'Licencia'].includes(registroEditando.tipo_ocf || registroEditando.lugar)}
                  required
                />
              </div>

              {puedeEditarCosto && (
                <div className="form-group-clean">
                  <label className="form-label-clean">Tipo de Costo (RRHH / Aplicaciones):</label>
                  <select
                    className="form-select form-select-clean"
                    value={registroEditando.tipo_costo || ''}
                    onChange={(e) => setRegistroEditando({ ...registroEditando, tipo_costo: e.target.value })}
                  >
                    <option value="">-- Sin Asignar --</option>
                    <option value="Oficina">Oficina</option>
                    <option value="Campo">Campo</option>
                  </select>
                </div>
              )}

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

      {/* [FN-02.04] Panel Flotante Dividido Comparativo de Modificaciones */}
      {comparativaModificacion && (
        <div className="modal-backdrop">
          <div className="modal-box modal-comparativa-box">
            {/* Cabecera */}
            <div className="modal-header">
              <div className="comparativa-header-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚖️ Auditoría de Modificación
                  </span>
                  <span className="comparativa-colab-badge">
                    {comparativaModificacion.registro?.empleado || 'Colaborador'}
                  </span>
                  {comparativaModificacion.modActiva?.revisado === 1 || comparativaModificacion.registro?.modificacion_revisada === 1 ? (
                    <span className="status-badge badge-modificado-revisado">
                      ✓ Revisado por RRHH
                    </span>
                  ) : (
                    <span className="status-badge badge-modificado">
                      ✏️ Pendiente de Revisión
                    </span>
                  )}
                </div>
                <div className="comparativa-header-meta">
                  <span>
                    📅 Reporte: <strong>{comparativaModificacion.registro?.fecha}</strong> {comparativaModificacion.registro?.dia_semana ? `(${comparativaModificacion.registro?.dia_semana})` : ''}
                  </span>
                  {comparativaModificacion.modActiva?.quien_modifica && (
                    <span>
                      👤 Modificado por: <strong>{comparativaModificacion.modActiva.quien_modifica}</strong>
                    </span>
                  )}
                  {comparativaModificacion.modActiva?.fecha_hora_modificaciones && (
                    <span>
                      🕒 Fecha cambio: <strong>{comparativaModificacion.modActiva.fecha_hora_modificaciones}</strong>
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setComparativaModificacion(null)}
                title="Cerrar panel comparativo"
              >
                ✕
              </button>
            </div>

            {/* Selector de iteraciones de modificación si hay más de 1 */}
            {comparativaModificacion.modificaciones && comparativaModificacion.modificaciones.length > 1 && (
              <div className="comparativa-timeline-bar">
                <span className="timeline-title">Versiones registradas:</span>
                <div className="timeline-chips">
                  {comparativaModificacion.modificaciones.map((m, idx) => {
                    const esActiva = (comparativaModificacion.indiceActivo === idx) ||
                      (comparativaModificacion.modActiva?.id_modificacion === m.id_modificacion);
                    return (
                      <button
                        key={m.id_modificacion || idx}
                        type="button"
                        className={`timeline-chip ${esActiva ? 'chip-active' : ''}`}
                        onClick={() => handleCambiarModificacionActiva(idx)}
                      >
                        Cambio #{idx + 1} ({m.fecha_hora_modificaciones?.split(' ')[1] || m.fecha_hora_modificaciones || 'Rev'})
                        {idx === comparativaModificacion.modificaciones.length - 1 && ' (Último)'}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contenedor Dividido (Split View) */}
            <div className="comparativa-body">
              {(() => {
                const reg = comparativaModificacion.registro || {};
                const mod = comparativaModificacion.modActiva || {};
                const tieneMod = Boolean(mod.id_modificacion || mod.quien_modifica);

                const tipoAntes = tieneMod ? (mod.tipo_antes || 'Sin tipo') : 'Original';
                const tipoDespues = tieneMod ? (mod.tipo_despues || 'Sin tipo') : (reg.tipo_ocf || reg.lugar || 'Oficina');

                const horasAntes = tieneMod ? Number(mod.horas_antes || 0) : 0;
                const horasDespues = tieneMod ? Number(mod.horas_despues || 0) : Number(reg.horas || 0);

                const servAntes = tieneMod ? (mod.servicio_antes || 'Tiempo dedicado al Área') : 'Tiempo previo';
                const servDespues = tieneMod ? (mod.servicio_despues || 'Tiempo dedicado al Área') : (reg.servicio || '');

                const badgeAntes = getBadgeClassLugar(tipoAntes, servAntes);
                const badgeDespues = getBadgeClassLugar(tipoDespues, servDespues);

                const diffHoras = Number((horasDespues - horasAntes).toFixed(2));
                const cambioTipo = tipoAntes !== tipoDespues;
                const cambioHoras = horasAntes !== horasDespues;
                const cambioServ = servAntes !== servDespues;

                return (
                  <>
                    <div className="comparativa-split-grid">
                      {/* LADO IZQUIERDO: ANTERIOR A LA MODIFICACIÓN */}
                      <div className="comparativa-panel panel-antes">
                        <div className="panel-side-badge badge-antes-tag">
                          <span>⬅️ ANTERIOR A LA MODIFICACIÓN</span>
                        </div>
                        <div className="comparativa-field-group">
                          <label className="comparativa-field-label">Modalidad / Ubicación</label>
                          <div className="comparativa-field-content">
                            <span className={`modalidad-pill ${badgeAntes}`} style={{ fontSize: '13px', padding: '4px 10px' }}>
                              {tipoAntes}
                            </span>
                          </div>
                        </div>

                        <div className="comparativa-field-group">
                          <label className="comparativa-field-label">Horas Computadas</label>
                          <div className="comparativa-hours-card hours-card-before">
                            <span className="hours-number">{horasAntes}</span>
                            <span className="hours-unit">hs</span>
                          </div>
                        </div>

                        <div className="comparativa-field-group">
                          <label className="comparativa-field-label">Proyecto / Servicio</label>
                          <div className="comparativa-service-box">
                            {servAntes}
                          </div>
                        </div>
                      </div>

                      {/* CENTRO: INDICADOR DE CAMBIO */}
                      <div className="comparativa-center-divider">
                        <div className="divider-arrow-circle" title="Transformación del registro">
                          ➔
                        </div>
                        <div className="divider-metrics">
                          {cambioHoras && (
                            <span className={`diff-delta-badge ${diffHoras > 0 ? 'delta-positive' : 'delta-negative'}`}>
                              {diffHoras > 0 ? `+${diffHoras} hs` : `${diffHoras} hs`}
                            </span>
                          )}
                          {!cambioHoras && (
                            <span className="diff-delta-badge delta-neutral">
                              = 0 hs
                            </span>
                          )}
                        </div>
                      </div>

                      {/* LADO DERECHO: POSTERIOR A LA MODIFICACIÓN */}
                      <div className="comparativa-panel panel-despues">
                        <div className="panel-side-badge badge-despues-tag">
                          <span>POSTERIOR A LA MODIFICACIÓN ➡️</span>
                        </div>

                        <div className="comparativa-field-group">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label className="comparativa-field-label">Modalidad / Ubicación</label>
                            {cambioTipo && (
                              <span className="chip-cambio-alerta" title="La modalidad fue alterada">
                                Cambió
                              </span>
                            )}
                          </div>
                          <div className="comparativa-field-content">
                            <span className={`modalidad-pill ${badgeDespues} ${cambioTipo ? 'pill-highlight-changed' : ''}`} style={{ fontSize: '13px', padding: '4px 10px' }}>
                              {tipoDespues}
                            </span>
                          </div>
                        </div>

                        <div className="comparativa-field-group">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label className="comparativa-field-label">Horas Computadas</label>
                            {cambioHoras && (
                              <span className="chip-cambio-alerta" title="La cantidad de horas fue alterada">
                                {diffHoras > 0 ? `+${diffHoras} hs` : `${diffHoras} hs`}
                              </span>
                            )}
                          </div>
                          <div className={`comparativa-hours-card hours-card-after ${cambioHoras ? 'hours-card-changed' : ''}`}>
                            <span className="hours-number">{horasDespues}</span>
                            <span className="hours-unit">hs</span>
                          </div>
                        </div>

                        <div className="comparativa-field-group">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label className="comparativa-field-label">Proyecto / Servicio</label>
                            {cambioServ && (
                              <span className="chip-cambio-alerta" title="El proyecto o servicio fue alterado">
                                Reasignado
                              </span>
                            )}
                          </div>
                          <div className={`comparativa-service-box ${cambioServ ? 'service-box-changed' : ''}`}>
                            {servDespues}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Resumen de auditoría */}
                    <div className="comparativa-summary-footer">
                      <div className="summary-left">
                        <div className="summary-title">Resumen de Cambios:</div>
                        <ul className="summary-bullets">
                          {cambioTipo ? (
                            <li>Modalidad cambió de <strong>{tipoAntes}</strong> a <strong>{tipoDespues}</strong></li>
                          ) : (
                            <li className="bullet-neutral">Modalidad sin cambios ({tipoDespues})</li>
                          )}
                          {cambioHoras ? (
                            <li>Jornada modificada de <strong>{horasAntes} hs</strong> a <strong>{horasDespues} hs</strong> (variación de <strong>{diffHoras > 0 ? `+${diffHoras}` : diffHoras} hs</strong>)</li>
                          ) : (
                            <li className="bullet-neutral">Carga horaria idéntica ({horasDespues} hs)</li>
                          )}
                          {cambioServ ? (
                            <li>Proyecto cambiado de "<em>{servAntes}</em>" a "<em>{servDespues}</em>"</li>
                          ) : (
                            <li className="bullet-neutral">Proyecto/Servicio sin cambios</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Pie de acciones del panel flotante */}
            <div className="modal-actions" style={{ justifyContent: 'space-between', padding: '16px 20px', background: 'var(--bg-surface-elevated, #f8fafc)', borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                {(comparativaModificacion.modActiva?.revisado !== 1 && comparativaModificacion.registro?.modificacion_revisada !== 1) ? (
                  <button
                    type="button"
                    className="btn-mark-reviewed-big"
                    onClick={handleMarcarRevisadoDesdeComparativa}
                    disabled={marcandoRevisadoId === (comparativaModificacion.registro?.id_asistencia || comparativaModificacion.registro?.id)}
                  >
                    {marcandoRevisadoId === (comparativaModificacion.registro?.id_asistencia || comparativaModificacion.registro?.id)
                      ? 'Guardando revisión...'
                      : '✓ Marcar como Revisado por RRHH'}
                  </button>
                ) : (
                  <span className="reviewed-success-text" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', padding: '6px 12px', borderRadius: '6px' }}>
                    ✓ Modificación auditada y revisada por RRHH
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {puedeModificarRegistro(usuario, comparativaModificacion.registro) && (
                  <button
                    type="button"
                    className="btn-action-ghost"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => {
                      const reg = { ...comparativaModificacion.registro };
                      setComparativaModificacion(null);
                      setRegistroEditando(reg);
                    }}
                    title="Realizar una nueva edición sobre este registro"
                  >
                    ✏️ Editar Registro
                  </button>
                )}
                <button
                  type="button"
                  className="modal-btn-cancel"
                  style={{ minWidth: '80px' }}
                  onClick={() => setComparativaModificacion(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // En modo RPG: envuelto dentro del Tablón de Madera de la Taberna con herrajes y estandarte curvado
  if (isRpg) {
    return (
      <div className="rpg-board-viewport rpg-other-history-viewport">
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
