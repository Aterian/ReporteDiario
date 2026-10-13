// [MOD-05] RosterView - Orquestador modular de Gestión y Carga de Rosters
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';
import { puedeAccederRoster } from '../utils/permissions';
import {
  COLABORADORES_GANTT_INGENIERIA,
  normalizarTexto,
  buscarTarifaRoster,
  NOMBRES_MESES
} from './roster/rosterConstants';
import RosterShiftForm from './roster/RosterShiftForm';
import RosterGanttChart from './roster/RosterGanttChart';

// Re-exportamos para compatibilidad retroactiva con otros componentes (ej: RosterHistoryView)
export { COLABORADORES_GANTT_INGENIERIA, normalizarTexto, buscarTarifaRoster };

export default function RosterView({ usuario, onVolver, tema }) {
  const isDark = tema === 'dark';
  const isRpg = tema === 'rpg';

  if (!puedeAccederRoster(usuario)) {
    return (
      <div className="view-content" style={{ padding: '32px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Acceso denegado: El módulo de Roster solo puede ser visualizado por personal autorizado (Justina Bertolozzi e Iván Valentin).
        </p>
        <button type="button" className="btn-back" onClick={onVolver}>
          Volver al Inicio
        </button>
      </div>
    );
  }

  // Al entrar a Roster, la ventana se maximiza a pantalla completa
  useEffect(() => {
    localStorage.removeItem('ingeap_rosters_mock');
    api.maximizarVentana();
  }, []);

  // Estados de control de vista
  const [refrescando, setRefrescando] = useState(false);
  const [mostrarCalendario, setMostrarCalendario] = useState(true);
  const [limpiando, setLimpiando] = useState(false);

  // Catálogos
  const [proyectosDisponibles, setProyectosDisponibles] = useState([]);
  const [empleadosDisponibles, setEmpleadosDisponibles] = useState([]);
  const [todosLosEmpleados, setTodosLosEmpleados] = useState([]);
  const [tarifasRoster, setTarifasRoster] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);

  // Fechas por defecto: hoy
  const getFechaHoy = () => {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Estado del Formulario de Roster
  const [proyecto, setProyecto] = useState('');
  const [empleadosSeleccionados, setEmpleadosSeleccionados] = useState([]);
  const [fechaInicio, setFechaInicio] = useState(getFechaHoy());
  const [fechaFin, setFechaFin] = useState(getFechaHoy());
  const [tipo, setTipo] = useState('Campo'); // 'Campo' | 'Franco' | 'Vacaciones' | 'Licencia'
  const [precioDia, setPrecioDia] = useState('');
  const [precioDomingo, setPrecioDomingo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensajeFeedback, setMensajeFeedback] = useState(null);

  // Tarifa oficial para el proyecto seleccionado en el formulario
  const tarifaActual = useMemo(() => {
    return buscarTarifaRoster(proyecto, tarifasRoster);
  }, [proyecto, tarifasRoster]);

  useEffect(() => {
    if (tarifaActual) {
      if (tarifaActual.dia_normal != null) setPrecioDia(String(tarifaActual.dia_normal));
      if (tarifaActual.domingo != null) setPrecioDomingo(String(tarifaActual.domingo));
    } else {
      setPrecioDia('0');
      setPrecioDomingo('0');
    }
  }, [tarifaActual]);

  // Selección múltiple de empleados
  const toggleSeleccionEmpleado = (nom) => {
    setEmpleadosSeleccionados(prev =>
      prev.includes(nom) ? prev.filter(n => n !== nom) : [...prev, nom]
    );
  };
  const seleccionarTodosEmpleados = () => {
    setEmpleadosSeleccionados(empleadosDisponibles.map(e => e.nombre));
  };
  const deseleccionarTodosEmpleados = () => {
    setEmpleadosSeleccionados([]);
  };

  // Estados de navegación del Gantt
  const [mesGantt, setMesGantt] = useState(() => new Date().getMonth() + 1);
  const [anioGantt, setAnioGantt] = useState(() => new Date().getFullYear());
  const [rostersPeriodo, setRostersPeriodo] = useState([]);
  const [cargandoRosters, setCargandoRosters] = useState(false);
  const [filtroProyectoGantt, setFiltroProyectoGantt] = useState('TODOS');

  // Dimensiones manuales de columnas del Gantt
  const [anchoColEmp, setAnchoColEmp] = useState(() => {
    return Number(localStorage.getItem('roster_col_emp_width')) || 270;
  });
  const [anchoColTotal, setAnchoColTotal] = useState(() => {
    return Number(localStorage.getItem('roster_col_total_width')) || 150;
  });
  const [anchoColDia, setAnchoColDia] = useState(() => {
    return Number(localStorage.getItem('roster_col_dia_width')) || 38;
  });

  const handleMouseDownResize = (e, tipoCol) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWEmp = anchoColEmp;
    const startWTotal = anchoColTotal;
    const startWDia = anchoColDia;

    const handleMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      if (tipoCol === 'emp') {
        const newW = Math.max(180, Math.min(550, startWEmp + delta));
        setAnchoColEmp(newW);
        localStorage.setItem('roster_col_emp_width', String(newW));
      } else if (tipoCol === 'total') {
        const newW = Math.max(110, Math.min(320, startWTotal + delta));
        setAnchoColTotal(newW);
        localStorage.setItem('roster_col_total_width', String(newW));
      } else if (tipoCol === 'dia') {
        const newW = Math.max(26, Math.min(90, startWDia + delta));
        setAnchoColDia(newW);
        localStorage.setItem('roster_col_dia_width', String(newW));
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleStepColDia = (delta) => {
    setAnchoColDia(prev => {
      const newW = Math.max(26, Math.min(80, prev + delta));
      localStorage.setItem('roster_col_dia_width', String(newW));
      return newW;
    });
  };

  const handleResetColWidths = () => {
    setAnchoColEmp(270);
    setAnchoColTotal(150);
    setAnchoColDia(38);
    localStorage.removeItem('roster_col_emp_width');
    localStorage.removeItem('roster_col_total_width');
    localStorage.removeItem('roster_col_dia_width');
  };

  // Estados del modal de edición de turno en Gantt
  const [modalEditar, setModalEditar] = useState(false);
  const [editId, setEditId] = useState('');
  const [editEmpleado, setEditEmpleado] = useState('');
  const [editProyecto, setEditProyecto] = useState('');
  const [editFechaInicio, setEditFechaInicio] = useState('');
  const [editFechaFin, setEditFechaFin] = useState('');
  const [editTipo, setEditTipo] = useState('Campo');
  const [editPrecioDia, setEditPrecioDia] = useState('');
  const [editPrecioDomingo, setEditPrecioDomingo] = useState('');
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [eliminandoEdit, setEliminandoEdit] = useState(false);

  // Tarifa oficial vinculada al proyecto que se está editando en el modal
  const tarifaModalEdit = useMemo(() => {
    return buscarTarifaRoster(editProyecto, tarifasRoster);
  }, [editProyecto, tarifasRoster]);

  const handleAbrirEditarGantt = (r) => {
    if (!r) return;
    setEditId(r.id);
    setEditEmpleado(r.empleado);
    setEditProyecto(r.proyecto);
    setEditFechaInicio(r.fecha_inicio);
    setEditFechaFin(r.fecha_fin);
    setEditTipo(r.tipo || 'Campo');
    setEditPrecioDia(r.precio_dia != null ? String(r.precio_dia) : '');
    setEditPrecioDomingo(r.precio_domingo != null ? String(r.precio_domingo) : '');
    setModalEditar(true);
  };

  // [FN-03.08] Asignar tarifas oficiales de roster al turno en edición en base local (sin sincronizar con Sheets ni tocar historial)
  const handleAsignarTarifasOficiales = async () => {
    if (!tarifaModalEdit) {
      alert(`No se encontraron tarifas configuradas para el proyecto "${editProyecto}" en 1_2_tarifas_roster.`);
      return;
    }
    const diaNorm = Number(tarifaModalEdit.dia_normal || 0);
    const dom = Number(tarifaModalEdit.domingo || 0);

    try {
      const res = await api.aplicarTarifaLocalRoster({
        id_roster: editId,
        id: editId,
        empleado: editEmpleado,
        proyecto: editProyecto,
        id_proyecto: tarifaModalEdit.id_proyecto || '',
        precio_dia: diaNorm,
        precio_domingo: dom
      });

      if (res && res.exito) {
        const pdiaFinal = res.precio_dia != null ? Number(res.precio_dia) : diaNorm;
        const pdomFinal = res.precio_domingo != null ? Number(res.precio_domingo) : dom;

        setEditPrecioDia(String(pdiaFinal));
        setEditPrecioDomingo(String(pdomFinal));

        // Actualizar reactivamente en memoria rostersPeriodo para visualización en Gantt y exportación a Excel
        setRostersPeriodo(prev => prev.map(r => {
          if (r.id === editId) {
            return { ...r, precio_dia: pdiaFinal, precio_domingo: pdomFinal };
          }
          return r;
        }));

        setMensajeFeedback({
          tipo: 'exito',
          texto: `Tarifa oficial asignada y guardada en base local para ${editEmpleado} (${editProyecto}): Normal: $${pdiaFinal.toLocaleString('es-AR')} | Dom: $${pdomFinal.toLocaleString('es-AR')}. Lista para visualización y exportación Excel.`
        });
      } else {
        alert(res?.error || 'No se pudo guardar la tarifa en la base local.');
      }
    } catch (err) {
      console.error('Error al asignar tarifa oficial en base local:', err);
      alert('Error de conexión al asignar la tarifa en la base local.');
    }
  };

  // Modal de exportación de Excel
  const [mostrarModalExport, setMostrarModalExport] = useState(false);
  const [proyectoAExportar, setProyectoAExportar] = useState('');
  const [exportandoExcel, setExportandoExcel] = useState(false);

  // 1. Cargar catálogos iniciales
  useEffect(() => {
    let activo = true;
    async function cargarCatalogos() {
      setCargandoCatalogos(true);
      try {
        const [proys, emps, tarifas] = await Promise.all([
          api.obtenerServicios('I'),
          api.obtenerTodosUsuarios('I'),
          api.obtenerTarifasRoster()
        ]);
        if (activo) {
          if (Array.isArray(tarifas)) {
            setTarifasRoster(tarifas);
          }
          if (Array.isArray(proys)) {
            const setProys = new Set();
            proys.forEach(p => { if (p) setProys.add(p.trim()); });
            if (Array.isArray(tarifas)) {
              tarifas.forEach(t => {
                if (t.proyecto) setProys.add(t.proyecto.trim());
              });
            }
            const proysUnificados = Array.from(setProys);
            setProyectosDisponibles(proysUnificados);
            if (proysUnificados.length > 0 && !proyecto) {
              setProyecto(proysUnificados[0]);
              setProyectoAExportar(proysUnificados[0]);
            }
          }
          if (Array.isArray(emps)) {
            setTodosLosEmpleados(emps);
            const setNombres = new Set();
            const empsIngenieria = [];

            COLABORADORES_GANTT_INGENIERIA.forEach(nom => {
              const normKey = normalizarTexto(nom);
              const eRef = emps.find(e => normalizarTexto(e.nombre) === normKey);
              if (eRef && !setNombres.has(normKey)) {
                setNombres.add(normKey);
                empsIngenieria.push(eRef);
              } else if (!setNombres.has(normKey)) {
                setNombres.add(normKey);
                empsIngenieria.push({ nombre: nom, dni: '', area: 'I', mail: '' });
              }
            });

            emps.forEach(e => {
              const areaNorm = (e.area || '').trim().toUpperCase();
              const normNom = normalizarTexto(e.nombre);
              if (['I', 'INGENIERÍA', 'INGENIERIA'].includes(areaNorm) && !setNombres.has(normNom)) {
                setNombres.add(normNom);
                empsIngenieria.push(e);
              }
            });

            setEmpleadosDisponibles(empsIngenieria);
          }
        }
      } catch (err) {
        console.error('Error cargando catálogos para Roster:', err);
      } finally {
        if (activo) setCargandoCatalogos(false);
      }
    }
    cargarCatalogos();
    return () => {
      activo = false;
    };
  }, []);

  // 2. Cargar registros de roster del mes
  const cargarRostersMes = async (anio, mes) => {
    setCargandoRosters(true);
    try {
      const ultimoDia = new Date(anio, mes, 0).getDate();
      const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
      const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
      const data = await api.obtenerRosters(desde, hasta);
      if (Array.isArray(data)) {
        setRostersPeriodo(data);
      }
    } catch (err) {
      console.error('Error al obtener rosters del mes:', err);
    } finally {
      setCargandoRosters(false);
    }
  };

  useEffect(() => {
    cargarRostersMes(anioGantt, mesGantt);
  }, [anioGantt, mesGantt]);

  useEffect(() => {
    const handleCatalogosActualizados = () => {
      cargarRostersMes(anioGantt, mesGantt);
    };
    window.addEventListener('catalogos-actualizados', handleCatalogosActualizados);
    return () => {
      window.removeEventListener('catalogos-actualizados', handleCatalogosActualizados);
    };
  }, [anioGantt, mesGantt]);

  // Manejo de sincronización y limpieza
  const handleRefrescar = async () => {
    setRefrescando(true);
    try {
      localStorage.removeItem('ingeap_rosters_mock');
      await api.refrescarCatalogos();
    } catch (err) {
      console.error('Error al refrescar catálogos de Roster:', err);
    } finally {
      await cargarRostersMes(anioGantt, mesGantt);
      setRefrescando(false);
    }
  };

  const handleLimpiarLocalYDescargar = async () => {
    if (!window.confirm('¿Deseas limpiar todos los registros locales y volver a descargar la información oficial desde Google Sheets? Esta acción descarta cambios locales no sincronizados y evita duplicados.')) {
      return;
    }
    setLimpiando(true);
    setMensajeFeedback(null);
    try {
      localStorage.removeItem('ingeap_rosters_mock');
      const res = await api.limpiarYDescargarSheets();
      if (res && res.exito) {
        setMensajeFeedback({
          tipo: 'exito',
          texto: res.mensaje || 'Registros locales limpiados y actualizados exitosamente desde Google Sheets.'
        });
        await cargarRostersMes(anioGantt, mesGantt);
      } else {
        setMensajeFeedback({
          tipo: 'error',
          texto: res?.error || 'No se pudo completar la limpieza y descarga.'
        });
      }
    } catch (err) {
      console.error(err);
      setMensajeFeedback({ tipo: 'error', texto: 'Error de comunicación al limpiar y descargar.' });
    } finally {
      setLimpiando(false);
    }
  };

  // Navegación de meses
  const cambiarMes = (delta) => {
    let nuevoMes = mesGantt + delta;
    let nuevoAnio = anioGantt;
    if (nuevoMes > 12) {
      nuevoMes = 1;
      nuevoAnio += 1;
    } else if (nuevoMes < 1) {
      nuevoMes = 12;
      nuevoAnio -= 1;
    }
    setMesGantt(nuevoMes);
    setAnioGantt(nuevoAnio);
  };

  // Exportar Excel
  const abrirModalExportar = () => {
    if (filtroProyectoGantt && filtroProyectoGantt !== 'TODOS') {
      setProyectoAExportar(filtroProyectoGantt);
    } else if (proyecto) {
      setProyectoAExportar(proyecto);
    } else if (proyectosDisponibles.length > 0) {
      setProyectoAExportar(proyectosDisponibles[0]);
    }
    setMostrarModalExport(true);
  };

  const handleExportarExcelDirecto = async () => {
    if (!proyectoAExportar) {
      setMensajeFeedback({ tipo: 'error', texto: 'Debes seleccionar un proyecto de Ingeniería para exportar.' });
      return;
    }
    setExportandoExcel(true);
    setMensajeFeedback(null);
    try {
      const res = await api.exportarRosterExcel(anioGantt, mesGantt, proyectoAExportar);
      if (res && res.exito) {
        setMostrarModalExport(false);
        setMensajeFeedback({
          tipo: 'exito',
          texto: res.mensaje || `¡Archivo Excel oficial para "${proyectoAExportar}" (${NOMBRES_MESES[mesGantt]} ${anioGantt}) generado con éxito en 3 hojas!`
        });
      } else if (res && !res.cancelado) {
        setMensajeFeedback({
          tipo: 'error',
          texto: res?.error || 'No se pudo generar el archivo Excel.'
        });
      }
    } catch (err) {
      console.error('Error exportando Excel:', err);
      setMensajeFeedback({ tipo: 'error', texto: 'Error al exportar: ' + err.message });
    } finally {
      setExportandoExcel(false);
    }
  };

  // Envío del formulario de guardado múltiple
  const handleGuardarRoster = async (e) => {
    e.preventDefault();
    setMensajeFeedback(null);

    if (!proyecto) {
      setMensajeFeedback({ tipo: 'error', texto: 'Debes seleccionar el proyecto asignado.' });
      return;
    }
    if (empleadosSeleccionados.length === 0) {
      setMensajeFeedback({ tipo: 'error', texto: 'Debes seleccionar al menos un empleado para el roster.' });
      return;
    }
    if (!fechaInicio || !fechaFin) {
      setMensajeFeedback({ tipo: 'error', texto: 'Debes definir el rango de fechas (inicio y fin).' });
      return;
    }
    if (fechaInicio > fechaFin) {
      setMensajeFeedback({ tipo: 'error', texto: 'La fecha de inicio no puede ser posterior a la fecha fin.' });
      return;
    }

    setGuardando(true);
    try {
      const listaDatos = empleadosSeleccionados.map(empNombre => {
        const empObj = empleadosDisponibles.find(e => e.nombre === empNombre);
        const dniEmp = empObj ? empObj.dni : '';
        const mailEmp = empObj ? (empObj.mail || empObj.email || '') : '';
        return {
          empleado: empNombre,
          dni: dniEmp,
          usuario_mail: mailEmp,
          proyecto: proyecto,
          id_proyecto: tarifaActual ? tarifaActual.id_proyecto : '',
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          tipo: tipo,
          precio_dia: tipo === 'Campo' ? (tarifaActual ? Number(tarifaActual.dia_normal) || 0 : Number(precioDia) || 0) : 0,
          precio_domingo: tipo === 'Campo' ? (tarifaActual ? Number(tarifaActual.domingo) || 0 : Number(precioDomingo) || 0) : 0
        };
      });

      const resMultiple = await api.guardarRosterMultiple(listaDatos);
      const fallo = !resMultiple || !resMultiple.exito;

      if (!fallo) {
        const cant = empleadosSeleccionados.length;
        setMensajeFeedback({
          tipo: 'exito',
          texto: `¡Roster registrado y sincronizado en Google Sheets para ${cant} empleado${cant > 1 ? 's' : ''} (${empleadosSeleccionados.join(', ')})! Podés continuar cargando los siguientes turnos.`
        });
        await cargarRostersMes(anioGantt, mesGantt);

        if (tipo === 'Campo') {
          const partes = fechaFin.split('-');
          const finObj = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
          finObj.setDate(finObj.getDate() + 1);
          const sigAnio = finObj.getFullYear();
          const sigMes = String(finObj.getMonth() + 1).padStart(2, '0');
          const sigDia = String(finObj.getDate()).padStart(2, '0');
          const sigDiaStr = `${sigAnio}-${sigMes}-${sigDia}`;
          setFechaInicio(sigDiaStr);
          setFechaFin(sigDiaStr);
          setTipo('Franco');
        }
      } else {
        setMensajeFeedback({ tipo: 'error', texto: fallo?.error || 'Ocurrió un error al guardar el roster para algunos empleados.' });
      }
    } catch (err) {
      console.error('Error guardando roster:', err);
      setMensajeFeedback({ tipo: 'error', texto: 'Error de comunicación al guardar.' });
    } finally {
      setGuardando(false);
    }
  };

  // Guardar edición de un turno existente en Gantt
  const handleGuardarEdicionGantt = async (e) => {
    e.preventDefault();
    if (!editEmpleado || !editProyecto || !editFechaInicio || !editFechaFin) {
      alert('Por favor completa todos los campos requeridos.');
      return;
    }
    if (editFechaInicio > editFechaFin) {
      alert('La fecha de inicio no puede ser posterior a la fecha fin.');
      return;
    }
    setGuardandoEdit(true);
    try {
      const empObj = empleadosDisponibles.find(emp => emp.nombre === editEmpleado) || (todosLosEmpleados || []).find(emp => emp.nombre === editEmpleado);
      const res = await api.guardarRoster({
        id: editId,
        empleado: editEmpleado,
        dni: empObj ? empObj.dni : '',
        usuario_mail: empObj ? (empObj.mail || empObj.email || '') : '',
        proyecto: editProyecto,
        id_proyecto: tarifaModalEdit ? tarifaModalEdit.id_proyecto : '',
        fecha_inicio: editFechaInicio,
        fecha_fin: editFechaFin,
        tipo: editTipo,
        precio_dia: editTipo === 'Campo' ? (Number(editPrecioDia) || (tarifaModalEdit ? Number(tarifaModalEdit.dia_normal) || 0 : 0)) : 0,
        precio_domingo: editTipo === 'Campo' ? (Number(editPrecioDomingo) || (tarifaModalEdit ? Number(tarifaModalEdit.domingo) || 0 : 0)) : 0
      });
      if (res && res.exito) {
        setModalEditar(false);
        setMensajeFeedback({
          tipo: 'exito',
          texto: `Turno de roster de ${editEmpleado} modificado y sincronizado correctamente.`
        });
        await cargarRostersMes(anioGantt, mesGantt);
      } else {
        const errorMsg = res?.error || 'Error al guardar la modificación.';
        const textoUsuario = errorMsg.toLowerCase().includes('locked')
          ? 'La base de datos estaba ocupada sincronizando en segundo plano. Por favor, reintenta guardar en unos segundos.'
          : errorMsg;
        alert(textoUsuario);
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al modificar el registro.');
    } finally {
      setGuardandoEdit(false);
    }
  };

  const handleEliminarTurnoGantt = async () => {
    if (!editId) return;
    if (!window.confirm(`¿Estás seguro de eliminar el registro de roster de ${editEmpleado}?`)) {
      return;
    }
    setEliminandoEdit(true);
    try {
      const res = await api.eliminarRoster(editId);
      if (res && res.exito) {
        setModalEditar(false);
        setMensajeFeedback({
          tipo: 'exito',
          texto: `Turno de roster de ${editEmpleado} eliminado correctamente.`
        });
        await cargarRostersMes(anioGantt, mesGantt);
      } else {
        alert(res?.error || 'No se pudo eliminar el registro de roster.');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al eliminar el turno.');
    } finally {
      setEliminandoEdit(false);
    }
  };

  // Cálculos para la grilla de días del Gantt
  const diasEnMes = useMemo(() => {
    const ultimoDia = new Date(anioGantt, mesGantt, 0).getDate();
    const dias = [];
    const nombresDias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    for (let d = 1; d <= ultimoDia; d++) {
      const fechaObj = new Date(anioGantt, mesGantt - 1, d);
      const diaSemana = fechaObj.getDay();
      dias.push({
        numero: d,
        diaSemanaNombre: nombresDias[diaSemana],
        esDomingo: diaSemana === 0,
        fechaStr: `${anioGantt}-${String(mesGantt).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      });
    }
    return dias;
  }, [anioGantt, mesGantt]);

  // Colaboradores canónicos en el Gantt
  const empleadosEnGantt = useMemo(() => {
    const mapa = {};
    COLABORADORES_GANTT_INGENIERIA.forEach(nom => {
      const normKey = normalizarTexto(nom);
      const empCat = (empleadosDisponibles || []).find(e => normalizarTexto(e.nombre) === normKey)
        || (todosLosEmpleados || []).find(e => normalizarTexto(e.nombre) === normKey);

      mapa[normKey] = {
        nombre: nom,
        dni: empCat ? empCat.dni : '',
        area: empCat ? empCat.area : 'I',
        proyectosMap: {},
        registros: []
      };
    });

    const registrosAConsiderar = (filtroProyectoGantt && filtroProyectoGantt !== 'TODOS')
      ? rostersPeriodo.filter(r => (r.proyecto || '').trim() === filtroProyectoGantt.trim())
      : rostersPeriodo;

    registrosAConsiderar.forEach(r => {
      const empNom = r.empleado;
      if (!empNom) return;
      const keyNorm = normalizarTexto(empNom);
      if (mapa[keyNorm]) {
        mapa[keyNorm].registros.push(r);
        if (r.proyecto) {
          mapa[keyNorm].proyectosMap[r.proyecto] = true;
        }
      }
    });

    const lista = Object.values(mapa).map(empObj => ({
      ...empObj,
      proyectos: Object.keys(empObj.proyectosMap)
    }));

    if (filtroProyectoGantt && filtroProyectoGantt !== 'TODOS') {
      return lista.filter(empObj => empObj.registros.length > 0);
    }

    return lista;
  }, [rostersPeriodo, filtroProyectoGantt, empleadosDisponibles, todosLosEmpleados]);

  const contenidoPrincipal = (
    <>
      {/* Barra superior de navegación y acciones */}
      <div className="roster-top-nav">
        <div className="roster-top-nav-left">
          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : 'btn-roster-back'}
            onClick={onVolver}
            title={isRpg ? 'Regresar a la Taberna' : 'Volver al menú principal'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {isRpg ? 'Taberna' : 'Volver al Menú'}
          </button>
          <div className="roster-header-title">
            <span className="roster-title-badge">{isRpg ? 'GREMIO' : 'RRHH'}</span>
            <h2>{isRpg ? 'Decreto de Guardias y Expediciones (Roster)' : 'Gestión y Carga de Rosters'}</h2>
          </div>
        </div>

        <div className="roster-top-nav-actions">
          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : `btn-roster-refresh ${refrescando ? 'btn-refresh-spinning' : ''}`}
            onClick={handleRefrescar}
            disabled={refrescando || cargandoRosters || limpiando}
            title="Refrescar y sincronizar con Google Sheets"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refrescando ? 'spinner' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refrescando ? 'Sincronizando...' : (isRpg ? 'Consultar Oráculo' : 'Refrescar')}
          </button>

          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : 'btn-roster-refresh'}
            onClick={handleLimpiarLocalYDescargar}
            disabled={refrescando || cargandoRosters || limpiando}
            title="Eliminar registros locales y descargar registros oficiales desde Google Sheets para evitar duplicados"
          >
            <svg
              width="14"
              height="14"
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

          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : 'btn-export-excel-header'}
            disabled={exportandoExcel}
            onClick={abrirModalExportar}
            title={`Descargar archivo Excel oficial por proyecto de ${NOMBRES_MESES[mesGantt]} ${anioGantt}`}
          >
            {exportandoExcel ? (
              <>
                <div className="spinner-mini" style={{ width: '13px', height: '13px', margin: 0, borderWidth: '2px' }}></div>
                Exportando Excel...
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {isRpg ? `Exportar Pergamino (${NOMBRES_MESES[mesGantt]})` : `Descargar Excel (${NOMBRES_MESES[mesGantt]})`}
              </>
            )}
          </button>

          <button
            type="button"
            className={`${isRpg ? 'rpg-wood-btn' : 'btn-toggle-gantt'} ${!mostrarCalendario ? 'gantt-hidden' : ''}`}
            onClick={() => setMostrarCalendario(prev => !prev)}
            title={mostrarCalendario ? 'Ocultar calendario y centrar formulario' : 'Mostrar calendario Gantt'}
          >
            {mostrarCalendario ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                Ocultar Calendario
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Mostrar Calendario
              </>
            )}
          </button>
        </div>
      </div>

      {/* Disposición principal: Dividido (Formulario + Gantt) o Centrado (Formulario) */}
      <div className={`roster-main-layout ${!mostrarCalendario ? 'layout-centered' : 'layout-split'}`}>
        <RosterShiftForm
          proyecto={proyecto}
          onProyectoChange={setProyecto}
          proyectosDisponibles={proyectosDisponibles}
          tarifaActual={tarifaActual}
          empleadosDisponibles={empleadosDisponibles}
          empleadosSeleccionados={empleadosSeleccionados}
          onToggleEmpleado={toggleSeleccionEmpleado}
          onSeleccionarTodos={seleccionarTodosEmpleados}
          onDeseleccionarTodos={deseleccionarTodosEmpleados}
          fechaInicio={fechaInicio}
          onFechaInicioChange={setFechaInicio}
          fechaFin={fechaFin}
          onFechaFinChange={setFechaFin}
          tipo={tipo}
          onTipoChange={setTipo}
          guardando={guardando}
          onSubmit={handleGuardarRoster}
          mensajeFeedback={mensajeFeedback}
          onDismissFeedback={() => setMensajeFeedback(null)}
        />

        {mostrarCalendario && (
          <RosterGanttChart
            mesGantt={mesGantt}
            anioGantt={anioGantt}
            onCambiarMes={cambiarMes}
            filtroProyectoGantt={filtroProyectoGantt}
            onFiltroProyectoChange={setFiltroProyectoGantt}
            proyectosDisponibles={proyectosDisponibles}
            cargandoRosters={cargandoRosters}
            diasEnMes={diasEnMes}
            empleadosEnGantt={empleadosEnGantt}
            anchoColEmp={anchoColEmp}
            anchoColTotal={anchoColTotal}
            anchoColDia={anchoColDia}
            onResizeStart={handleMouseDownResize}
            onStepColDia={handleStepColDia}
            onResetColWidths={handleResetColWidths}
            onAbrirEditar={handleAbrirEditarGantt}
            // Props Modal Edición
            modalEditar={modalEditar}
            onCerrarModalEdit={() => !guardandoEdit && setModalEditar(false)}
            editEmpleado={editEmpleado}
            onEditEmpleadoChange={setEditEmpleado}
            editProyecto={editProyecto}
            onEditProyectoChange={setEditProyecto}
            editFechaInicio={editFechaInicio}
            onEditFechaInicioChange={setEditFechaInicio}
            editFechaFin={editFechaFin}
            onEditFechaFinChange={setEditFechaFin}
            editTipo={editTipo}
            onEditTipoChange={setEditTipo}
            tarifaModalEdit={tarifaModalEdit}
            editPrecioDia={editPrecioDia}
            editPrecioDomingo={editPrecioDomingo}
            onAsignarTarifasOficiales={handleAsignarTarifasOficiales}
            guardandoEdit={guardandoEdit}
            eliminandoEdit={eliminandoEdit}
            onGuardarEdicion={handleGuardarEdicionGantt}
            onEliminarTurno={handleEliminarTurnoGantt}
            // Props Modal Exportación
            mostrarModalExport={mostrarModalExport}
            onCerrarModalExport={() => !exportandoExcel && setMostrarModalExport(false)}
            proyectoAExportar={proyectoAExportar}
            onProyectoAExportarChange={setProyectoAExportar}
            exportandoExcel={exportandoExcel}
            onConfirmarExportar={handleExportarExcelDirecto}
          />
        )}
      </div>
    </>
  );

  // Renderizado temático RPG
  if (isRpg) {
    return (
      <div className="rpg-board-viewport rpg-roster-viewport">
        <div className="rpg-notice-board">
          <div className="rpg-iron-bracket top-left" />
          <div className="rpg-iron-bracket top-right" />
          <div className="rpg-iron-bracket bottom-left" />
          <div className="rpg-iron-bracket bottom-right" />

          <div className="rpg-curved-banner">
            <div className="rpg-banner-scroll-roll left" />
            <div className="rpg-banner-body">
              <div className="rpg-banner-heading-wrap">
                <div className="rpg-illuminated-box">R</div>
                <h1 className="rpg-banner-main-title">DECRETO DE GUARDIAS Y EXPEDICIONES</h1>
              </div>
              <span className="rpg-banner-subtitle">
                TABLÓN DE ASIGNACIÓN DE TURNOS • GREMIO INGEAP
              </span>
            </div>
            <div className="rpg-banner-scroll-roll right" />
          </div>

          <div className="roster-view-container rpg-roster-content">
            {contenidoPrincipal}
          </div>
        </div>
      </div>
    );
  }

  // Renderizado corporativo habitual
  return (
    <div className={`roster-view-container ${isDark ? 'dark-theme' : ''}`}>
      {contenidoPrincipal}
    </div>
  );
}
