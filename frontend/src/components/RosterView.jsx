import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';
import { puedeAccederRoster } from '../utils/permissions';

// [MOD-05] Lista canónica exclusiva de colaboradores autorizados de Ingeniería para el gráfico Gantt
export const COLABORADORES_GANTT_INGENIERIA = [
  'Gabriel Juarez',
  'Maximiliano Kromm',
  'Fernando Aimar',
  'Norberto José Luis Botto',
  'Ivan Emanuel Altamirano',
  'Alejo Ferrero',
  'Facundo Ezequiel Calgaro',
  'Rodolfo Julian Lescano',
  'Agustina Ferrante',
  'José María Zufiaurre'
];

/**
 * [FN-03.07] Normalización robusta de texto.
 * Convierte a minúsculas, elimina tildes/acentos y unifica espacios en blanco.
 *
 * @param {any} valor - Texto o dato a normalizar.
 * @returns {string} - Texto limpio y uniforme.
 */
export const normalizarTexto = (valor) => {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .trim()
    .toLowerCase()
    .normalize('NFD') // Separa caracteres acentuados en letra base + tilde
    .replace(/[\u0300-\u036f]/g, '') // Elimina los signos diacríticos
    .replace(/\s+/g, ' '); // Unifica espacios repetidos
};

/**
 * [FN-03.08] Búsqueda de tarifa oficial en 1_2_tarifas_roster.
 * Busca coincidencias tanto por 'id_proyecto' como por 'denominacion' / 'proyecto',
 * tolerando diferencias de mayúsculas, tildes y estructuras de formulario.
 *
 * @param {string} proyectoBuscado - UUID o Denominación del proyecto seleccionado.
 * @param {Array} tarifas - Lista de tarifas cargadas desde 1_2_tarifas_roster.
 * @returns {Object|null} - Objeto de tarifa encontrado o null si no existe.
 */
export const buscarTarifaRoster = (proyectoBuscado, tarifas) => {
  // Validación de seguridad inicial
  if (!proyectoBuscado || !Array.isArray(tarifas) || tarifas.length === 0) {
    console.warn('[Tarifas Roster] Lista de tarifas vacía o proyecto no especificado:', {
      proyectoBuscado,
      cantidadTarifas: Array.isArray(tarifas) ? tarifas.length : 'No es un arreglo'
    });
    return null;
  }

  const busquedaNorm = normalizarTexto(proyectoBuscado);

  // Registro de depuración en consola para verificar los datos en tiempo real
  console.log(`[Tarifas Roster] Buscando: "${busquedaNorm}" en ${tarifas.length} tarifas disponibles.`);

  // 1. Coincidencia por ID de Proyecto (UUID)
  const matchPorId = tarifas.find((t) => {
    const idTarifa = normalizarTexto(t.id_proyecto);
    return idTarifa !== '' && (idTarifa === busquedaNorm || busquedaNorm.includes(idTarifa) || idTarifa.includes(busquedaNorm));
  });

  if (matchPorId) {
    console.log('[Tarifas Roster] ¡Coincidencia encontrada por ID de proyecto!', matchPorId);
    return matchPorId;
  }

  // 2. Coincidencia por Denominación Exacta (revisando 'denominacion' y 'proyecto')
  const matchDenominacionExacta = tarifas.find((t) => {
    const nombreTarifa = normalizarTexto(t.denominacion || t.proyecto);
    return nombreTarifa !== '' && nombreTarifa === busquedaNorm;
  });

  if (matchDenominacionExacta) {
    console.log('[Tarifas Roster] ¡Coincidencia encontrada por denominación exacta!', matchDenominacionExacta);
    return matchDenominacionExacta;
  }

  // 3. Coincidencia por Inclusión Parcial (útil si el selector agrega códigos o prefijos)
  const matchParcial = tarifas.find((t) => {
    const nombreTarifa = normalizarTexto(t.denominacion || t.proyecto);
    return nombreTarifa !== '' && (busquedaNorm.includes(nombreTarifa) || nombreTarifa.includes(busquedaNorm));
  });

  if (matchParcial) {
    console.log('[Tarifas Roster] ¡Coincidencia encontrada por inclusión parcial!', matchParcial);
    return matchParcial;
  }

  console.warn(`[Tarifas Roster] No se encontró tarifa para "${proyectoBuscado}". Tarifas actuales:`, tarifas);
  return null;
};

// [MOD-05] RosterView
export default function RosterView({ usuario, onVolver, tema }) {
  const isDark = tema === 'dark';
  const isRpg = tema === 'rpg';

  if (!puedeAccederRoster(usuario)) {
    return (
      <div className="view-content" style={{ padding: '32px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Acceso denegado: El módulo de Roster solo puede ser visualizado por Justina Bertolozzi e Iván Valentin.
        </p>
        <button type="button" className="btn-back" onClick={onVolver}>
          Volver al Inicio
        </button>
      </div>
    );
  }

  // Al entrar a Roster, la ventana se maximiza a pantalla completa.
  // El tamaño se preserva al volver al menú principal para mantener una experiencia consistente.
  useEffect(() => {
    localStorage.removeItem('ingeap_rosters_mock');
    api.maximizarVentana();
  }, []);

  // Estado para el botón de refrescar / sincronización con Google Sheets
  const [refrescando, setRefrescando] = useState(false);

  // Control de vista: Calendario Gantt visible u oculto
  const [mostrarCalendario, setMostrarCalendario] = useState(true);

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
  // IMPORTANTE: Según especificación del usuario, la selección de Proyecto va PRIMERO y es obligatoria
  const [proyecto, setProyecto] = useState('');
  const [empleadosSeleccionados, setEmpleadosSeleccionados] = useState([]);
  const [fechaInicio, setFechaInicio] = useState(getFechaHoy());
  const [fechaFin, setFechaFin] = useState(getFechaHoy());
  const [tipo, setTipo] = useState('Campo'); // 'Campo' | 'Franco' | 'Vacaciones' | 'Licencia'
  const [precioDia, setPrecioDia] = useState('');
  const [precioDomingo, setPrecioDomingo] = useState('');

  // [FN-03.08] Vincular tarifa oficial del proyecto seleccionado desde 1_2_tarifas_roster
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

  // Helpers para selección múltiple
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

  // Estados para Modal de Modificación de Roster desde el Gantt
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
  const [limpiando, setLimpiando] = useState(false);

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

  // [FN-03.08] Tarifa oficial para el proyecto que se está editando en el modal de Gantt
  const tarifaModalEdit = useMemo(() => {
    return buscarTarifaRoster(editProyecto, tarifasRoster);
  }, [editProyecto, tarifasRoster]);

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
        precio_dia: editTipo === 'Campo' ? (tarifaModalEdit ? Number(tarifaModalEdit.dia_normal) || 0 : Number(editPrecioDia) || 0) : 0,
        precio_domingo: editTipo === 'Campo' ? (tarifaModalEdit ? Number(tarifaModalEdit.domingo) || 0 : Number(editPrecioDomingo) || 0) : 0
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

  // Estados de carga y feedback ágil
  const [guardando, setGuardando] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [mensajeFeedback, setMensajeFeedback] = useState(null); // { tipo: 'exito'|'error', texto: '' }

  // Estado de navegación del Calendario Gantt (Mes y Año actual)
  const [mesGantt, setMesGantt] = useState(() => new Date().getMonth() + 1);
  const [anioGantt, setAnioGantt] = useState(() => new Date().getFullYear());
  const [rostersPeriodo, setRostersPeriodo] = useState([]);
  const [cargandoRosters, setCargandoRosters] = useState(false);
  const [filtroProyectoGantt, setFiltroProyectoGantt] = useState('TODOS');

  // =========================================================================
  // CONTROL DE TAMAÑO DE COLUMNAS MANUAL EN EL GANTT
  // =========================================================================
  const [anchoColEmp, setAnchoColEmp] = useState(() => {
    return Number(localStorage.getItem('roster_col_emp_width')) || 270;
  });
  const [anchoColTotal, setAnchoColTotal] = useState(() => {
    return Number(localStorage.getItem('roster_col_total_width')) || 150;
  });
  const [anchoColDia, setAnchoColDia] = useState(() => {
    return Number(localStorage.getItem('roster_col_dia_width')) || 38;
  });

  // Manejador de arrastre de borde de columnas (Drag-to-resize)
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

  // Modal de exportación por proyecto específico
  const [mostrarModalExport, setMostrarModalExport] = useState(false);
  const [proyectoAExportar, setProyectoAExportar] = useState('');

  // 1. Cargar catálogo de proyectos (exclusivamente del Área de Ingeniería 'I') y empleados
  useEffect(() => {
    let activo = true;
    async function cargarCatalogos() {
      setCargandoCatalogos(true);
      try {
        const [proys, emps, tarifas] = await Promise.all([
          api.obtenerServicios('I'), // Exclusivamente área de Ingeniería (I)
          api.obtenerTodosUsuarios('I'), // Exclusivamente empleados del área de Ingeniería (I)
          api.obtenerTarifasRoster() // Tarifas de roster desde 1_2_tarifas_roster
        ]);
        if (activo) {
          if (Array.isArray(tarifas)) {
            setTarifasRoster(tarifas);
          }
          if (Array.isArray(proys)) {
            // Unificar proyectos disponibles asegurando que incluyan todas las denominaciones de 1_2_tarifas_roster
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
            // Asegurar que los 10 colaboradores canónicos de Ingeniería estén disponibles para selección
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

            // Sumar cualquier otro empleado con área 'I' si existiese en el catálogo
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

  // 2. Cargar registros de roster para el mes visualizado en el Gantt
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

  // Escuchar evento de actualización de catálogos o sincronización externa
  useEffect(() => {
    const handleCatalogosActualizados = () => {
      cargarRostersMes(anioGantt, mesGantt);
    };
    window.addEventListener('catalogos-actualizados', handleCatalogosActualizados);
    return () => {
      window.removeEventListener('catalogos-actualizados', handleCatalogosActualizados);
    };
  }, [anioGantt, mesGantt]);

  // Manejo de refrescar manual: depura huérfanos y recarga desde Google Sheets
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

  // Manejo de limpiar local: elimina datos locales y descarga de Google Sheets
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

  // Manejo de cambio de mes en el Gantt
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

  // Abrir modal para elegir qué proyecto exportar para el mes
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

  // Exportar Excel directo por proyecto desde la ventana de registro de Roster
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
          texto: res.mensaje || `¡Archivo Excel oficial para "${proyectoAExportar}" (${nombresMeses[mesGantt]} ${anioGantt}) generado con éxito en 3 hojas!`
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

  // Envío del formulario con soporte para múltiples empleados
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
        // Actualizar el Gantt en tiempo real
        await cargarRostersMes(anioGantt, mesGantt);

        // Dejar el formulario listo para el siguiente turno (ej: cargar el franco consecutivo)
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

  // Cálculos para la grilla del Gantt
  const diasEnMes = useMemo(() => {
    const ultimoDia = new Date(anioGantt, mesGantt, 0).getDate();
    const dias = [];
    const nombresDias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    for (let d = 1; d <= ultimoDia; d++) {
      const fechaObj = new Date(anioGantt, mesGantt - 1, d);
      const diaSemana = fechaObj.getDay(); // 0 = Domingo
      dias.push({
        numero: d,
        diaSemanaNombre: nombresDias[diaSemana],
        esDomingo: diaSemana === 0,
        fechaStr: `${anioGantt}-${String(mesGantt).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      });
    }
    return dias;
  }, [anioGantt, mesGantt]);

  // Filtrar rosters por proyecto en el Gantt si se especifica
  const rostersFiltrados = useMemo(() => {
    if (filtroProyectoGantt === 'TODOS') return rostersPeriodo;
    return rostersPeriodo.filter(r => r.proyecto === filtroProyectoGantt);
  }, [rostersPeriodo, filtroProyectoGantt]);

  // [FN-03.09] Colaboradores en Gantt: Exclusivamente los 10 colaboradores autorizados de Ingeniería
  // Si se selecciona un proyecto específico, solo mostrar los colaboradores que tengan registros de ese proyecto
  const empleadosEnGantt = useMemo(() => {
    const mapa = {};

    // 1. Inicializar mapa exclusivamente con los 10 colaboradores canónicos de Ingeniería
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

    // 2. Asociar los registros del mes/período exclusivamente a estos colaboradores
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

    // 3. Filtrado por proyecto: si se selecciona un proyecto específico,
    // mostrar en la lista únicamente a los colaboradores que tengan registros de ese proyecto
    if (filtroProyectoGantt && filtroProyectoGantt !== 'TODOS') {
      return lista.filter(empObj => empObj.registros.length > 0);
    }

    return lista;
  }, [rostersPeriodo, filtroProyectoGantt, empleadosDisponibles, todosLosEmpleados]);

  // Nombres de los meses en español
  const nombresMeses = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const contenidoPrincipal = (
    <>
      {/* Barra superior de la vista de Roster */}
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
          {/* Botón Refrescar: Sincroniza y depura registros de Sheets y BD local */}
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

          {/* Botón Limpiar: Purga datos locales y descarga directamente de Google Sheets */}
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

          {/* NUEVO: Botón para exportar Excel directo desde esta ventana */}
          <button
            type="button"
            className={isRpg ? 'rpg-wood-btn' : 'btn-export-excel-header'}
            disabled={exportandoExcel}
            onClick={abrirModalExportar}
            title={`Descargar archivo Excel oficial por proyecto de ${nombresMeses[mesGantt]} ${anioGantt}`}
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
                {isRpg ? `Exportar Pergamino (${nombresMeses[mesGantt]})` : `Descargar Excel (${nombresMeses[mesGantt]})`}
              </>
            )}
          </button>

          {/* Botón para Mostrar / Esconder Calendario Gantt */}
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

      {/* Contenido principal: Dividido o Centrado */}
      <div className={`roster-main-layout ${!mostrarCalendario ? 'layout-centered' : 'layout-split'}`}>

        {/* =================================================================== */}
        {/* PANEL IZQUIERDO: FORMULARIO DE CARGA CONTINUA                      */}
        {/* =================================================================== */}
        <div className="roster-form-panel">
          <div className="roster-form-card">
            <div className="roster-form-header">
              <h3>Nuevo Registro de Roster</h3>
              <p>Asigna turnos, obra, descansos y tarifas para el cálculo automático.</p>
            </div>

            {/* Mensajes de feedback ágil */}
            {mensajeFeedback && (
              <div className={`roster-alert ${mensajeFeedback.tipo === 'exito' ? 'alert-success' : 'alert-error'}`}>
                <span>{mensajeFeedback.tipo === 'exito' ? '✓' : '⚠️'}</span>
                <p>{mensajeFeedback.texto}</p>
                <button type="button" onClick={() => setMensajeFeedback(null)}>✕</button>
              </div>
            )}

            <form onSubmit={handleGuardarRoster} className="roster-form-fields">

              {/* 1. SELECCIÓN DE PROYECTO (PRIMERO Y OBLIGATORIO) */}
              <div className="form-group-roster highlight-project">
                <label className="roster-label">
                  <span className="roster-label-num">1</span>
                  <span>Proyecto Asignado (Ingeniería - I) <strong className="required">*</strong></span>
                </label>
                <select
                  value={proyecto}
                  onChange={(e) => setProyecto(e.target.value)}
                  className="roster-select"
                  required
                >
                  <option value="" disabled>Selecciona el proyecto (Ingeniería)...</option>
                  {proyectosDisponibles.map((p, idx) => (
                    <option key={idx} value={p}>{p}</option>
                  ))}
                </select>
                <span className="form-hint">Proyectos exclusivos de Ingeniería. Los francos deben asignarse a este mismo proyecto para cerrar el ciclo.</span>
                {tarifaActual && (
                  <div className="roster-tarifa-info-box" style={{ marginTop: '8px', padding: '10px 12px', background: 'var(--bg-secondary, #f8fafc)', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary, #cc3333)', letterSpacing: '0.5px' }}>
                        📊 TARIFAS ROSTER VINCULADAS
                      </span>
                      {tarifaActual.id_proyecto && (
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          ID: {tarifaActual.id_proyecto}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
                      <span style={{ background: '#ffffff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                        Día normal: <b>${tarifaActual.dia_normal}</b>
                      </span>
                      <span style={{ background: '#fef3c7', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fde68a', color: '#92400e' }}>
                        Domingo: <b>${tarifaActual.domingo}</b>
                      </span>
                      <span style={{ background: '#ecfdf5', padding: '3px 8px', borderRadius: '4px', border: '1px solid #a7f3d0', color: '#065f46' }}>
                        ⬆️ Subida: <b>${tarifaActual.subida}</b>
                      </span>
                      <span style={{ background: '#eff6ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe', color: '#1e40af' }}>
                        ⬇️ Bajada: <b>${tarifaActual.bajada}</b>
                      </span>
                      {Number(tarifaActual.adicionales) > 0 && (
                        <span style={{ background: '#fdf2f8', padding: '3px 8px', borderRadius: '4px', border: '1px solid #fbcfe8', color: '#9d174d' }}>
                          Adicionales: <b>${tarifaActual.adicionales}</b> (x1)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. SELECCIÓN DE EMPLEADOS (CARGA MÚLTIPLE - INGENIERÍA) */}
              <div className="form-group-roster">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="roster-label" style={{ margin: 0 }}>
                    <span className="roster-label-num">2</span>
                    <span>Empleados (Ingeniería - I) <strong className="required">*</strong></span>
                  </label>
                  <div className="roster-emp-actions-row">
                    <button
                      type="button"
                      className="btn-link-action"
                      onClick={seleccionarTodosEmpleados}
                    >
                      Seleccionar todos
                    </button>
                    <span style={{ color: 'var(--border-input)', fontSize: '11px' }}>•</span>
                    <button
                      type="button"
                      className="btn-link-action"
                      onClick={deseleccionarTodosEmpleados}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div className="roster-multi-emp-container">
                  {empleadosDisponibles.length === 0 ? (
                    <div className="roster-multi-emp-empty">No hay empleados disponibles en el área de Ingeniería.</div>
                  ) : (
                    empleadosDisponibles.map((emp, idx) => {
                      const isSelected = empleadosSeleccionados.includes(emp.nombre);
                      return (
                        <div
                          key={idx}
                          className={`emp-multi-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleSeleccionEmpleado(emp.nombre)}
                          title={`Click para ${isSelected ? 'quitar' : 'seleccionar'} a ${emp.nombre}`}
                        >
                          <div className={`chip-checkbox ${isSelected ? 'checked' : ''}`}>
                            {isSelected ? '✓' : ''}
                          </div>
                          <span className="chip-emp-name">{emp.nombre}</span>
                          {emp.area && <span className="chip-emp-area">({emp.area})</span>}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="roster-emp-selected-summary">
                  {empleadosSeleccionados.length === 0 ? (
                    <span className="summary-empty">⚠️ Seleccioná uno o más empleados para asignar el roster.</span>
                  ) : (
                    <span className="summary-filled">
                      ✓ <strong>{empleadosSeleccionados.length}</strong> seleccionado{empleadosSeleccionados.length > 1 ? 's' : ''}: {empleadosSeleccionados.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* 3. RANGO DE FECHAS (DISPONIBLE TANTO PARA CAMPO COMO PARA FRANCO) */}
              <div className="form-group-roster">
                <label className="roster-label">
                  <span className="roster-label-num">3</span>
                  <span>Rango de Fechas del Turno <strong className="required">*</strong></span>
                </label>
                <div className="roster-dates-row">
                  <div className="date-field-box">
                    <span className="date-sublabel">Desde:</span>
                    <input
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      className="roster-input date-input"
                      required
                    />
                  </div>
                  <div className="date-field-box">
                    <span className="date-sublabel">Hasta:</span>
                    <input
                      type="date"
                      value={fechaFin}
                      onChange={(e) => setFechaFin(e.target.value)}
                      className="roster-input date-input"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* 4. ESTADO DE ROSTER: CAMPO, FRANCO, VACACIONES O LICENCIA */}
              <div className="form-group-roster">
                <label className="roster-label">
                  <span className="roster-label-num">4</span>
                  <span>Tipo de Jornada</span>
                </label>
                <div className="roster-type-selector">
                  <button
                    type="button"
                    className={`btn-type-pill pill-campo ${tipo === 'Campo' ? 'active' : ''}`}
                    onClick={() => setTipo('Campo')}
                  >
                    <span className="pill-dot"></span>
                    🚜 Activo en Campo / Obra
                  </button>
                  <button
                    type="button"
                    className={`btn-type-pill pill-franco ${tipo === 'Franco' ? 'active' : ''}`}
                    onClick={() => setTipo('Franco')}
                  >
                    <span className="pill-dot"></span>
                    🏠 Días de Franco
                  </button>
                  <button
                    type="button"
                    className={`btn-type-pill pill-vacaciones ${tipo === 'Vacaciones' ? 'active' : ''}`}
                    onClick={() => setTipo('Vacaciones')}
                  >
                    <span className="pill-dot"></span>
                    🏖️ Vacaciones
                  </button>
                  <button
                    type="button"
                    className={`btn-type-pill pill-licencia ${tipo === 'Licencia' ? 'active' : ''}`}
                    onClick={() => setTipo('Licencia')}
                  >
                    <span className="pill-dot"></span>
                    🏥 Licencia
                  </button>
                </div>
              </div>

              {/* 5. TARIFAS ASIGNADAS AL PROYECTO (MODO SOLO LECTURA) */}
              {tipo === 'Campo' ? (
                <div className="form-group-roster tariffs-container">
                  <label className="roster-label">
                    <span className="roster-label-num">5</span>
                    <span>Tarifas Oficiales Asignadas al Proyecto (Solo Lectura)</span>
                  </label>
                  {tarifaActual ? (
                    <div className="tariffs-readonly-card">
                      <div className="tariffs-readonly-header">
                        <div className="tariffs-readonly-title">
                          <span style={{ fontSize: '14px' }}>🔒</span>
                          <strong>Tarifas Reglamentarias ({tarifaActual.proyecto})</strong>
                        </div>
                        {tarifaActual.id_proyecto && (
                          <span className="tariffs-readonly-id">ID: {tarifaActual.id_proyecto}</span>
                        )}
                      </div>
                      <p className="tariffs-readonly-desc">
                        Valores asignados automáticamente desde la hoja oficial <code>1_2_tarifas_roster</code> para este proyecto.
                      </p>
                      <div className="tariffs-readonly-grid">
                        <div className="tariff-readonly-item">
                          <span className="item-label">Día Normal en Obra</span>
                          <span className="item-value">${Number(tarifaActual.dia_normal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="tariff-readonly-item highlight-domingo">
                          <span className="item-label">Día Domingo (DOM)</span>
                          <span className="item-value">${Number(tarifaActual.domingo || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="tariff-readonly-item highlight-subida">
                          <span className="item-label">⬆️ Subida (Inicio Campo)</span>
                          <span className="item-value">${Number(tarifaActual.subida || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="tariff-readonly-item highlight-bajada">
                          <span className="item-label">⬇️ Bajada (Inicio Franco)</span>
                          <span className="item-value">${Number(tarifaActual.bajada || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {Number(tarifaActual.adicionales) > 0 && (
                          <div className="tariff-readonly-item highlight-adicionales">
                            <span className="item-label">Adicionales (x1 por bloque)</span>
                            <span className="item-value">${Number(tarifaActual.adicionales || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="tariffs-readonly-empty">
                      <span style={{ fontSize: '18px' }}>ℹ️</span>
                      <span>
                        {proyecto
                          ? 'El proyecto seleccionado no registra tarifas especiales en 1_2_tarifas_roster (se liquidará con tarifa base $0.00).'
                          : 'Selecciona un proyecto asignado arriba para cargar automáticamente sus tarifas reglamentarias.'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="franco-info-box">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Los días de franco se registran como descanso del proyecto y no computan tarifas de liquidación de obra.</span>
                </div>
              )}

              {/* BOTÓN PRINCIPAL DE GUARDADO CONTINUO */}
              <div className="roster-form-actions">
                <button
                  type="submit"
                  disabled={guardando}
                  className="btn-roster-submit"
                >
                  {guardando ? (
                    'Guardando...'
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      Guardar Registro de Roster
                    </>
                  )}
                </button>
                <span className="save-hint">Al guardar, permanecerás aquí para continuar cargando todos los turnos que necesites.</span>
              </div>
            </form>
          </div>
        </div>

        {/* =================================================================== */}
        {/* PANEL DERECHO: CALENDARIO ESTILO GANTT INTERACTIVO                  */}
        {/* =================================================================== */}
        {mostrarCalendario && (
          <div className="roster-gantt-panel">
            <div className="roster-gantt-card">

              {/* Encabezado del Gantt: Navegación de meses, filtros y redimensionamiento */}
              <div className="gantt-header-controls">
                <div className="gantt-month-navigator">
                  <button
                    type="button"
                    className="btn-gantt-nav"
                    onClick={() => cambiarMes(-1)}
                    title="Mes anterior"
                  >
                    ◀
                  </button>
                  <span className="gantt-current-month">
                    {nombresMeses[mesGantt]} {anioGantt}
                  </span>
                  <button
                    type="button"
                    className="btn-gantt-nav"
                    onClick={() => cambiarMes(1)}
                    title="Mes siguiente"
                  >
                    ▶
                  </button>
                </div>

                <div className="gantt-right-controls-group">
                  {/* Selector de Proyecto */}
                  <div className="gantt-project-filter">
                    <label>Proyecto:</label>
                    <select
                      value={filtroProyectoGantt}
                      onChange={(e) => setFiltroProyectoGantt(e.target.value)}
                      className="gantt-filter-select"
                    >
                      <option value="TODOS">Todos los proyectos (Ingeniería)</option>
                      {proyectosDisponibles.map((p, i) => (
                        <option key={i} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  {/* NUEVO: Controles manuales de tamaño de columnas de días */}
                  <div className="gantt-col-size-bar">
                    <span className="size-label" title="Ancho de columnas de días">Zoom días:</span>
                    <button
                      type="button"
                      className="btn-col-step"
                      onClick={() => {
                        const newW = Math.max(26, anchoColDia - 4);
                        setAnchoColDia(newW);
                        localStorage.setItem('roster_col_dia_width', String(newW));
                      }}
                      title="Reducir ancho de días"
                    >
                      -
                    </button>
                    <span className="size-num-indicator">{anchoColDia}px</span>
                    <button
                      type="button"
                      className="btn-col-step"
                      onClick={() => {
                        const newW = Math.min(80, anchoColDia + 4);
                        setAnchoColDia(newW);
                        localStorage.setItem('roster_col_dia_width', String(newW));
                      }}
                      title="Aumentar ancho de días"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="btn-col-reset"
                      onClick={() => {
                        setAnchoColEmp(270);
                        setAnchoColTotal(150);
                        setAnchoColDia(38);
                        localStorage.removeItem('roster_col_emp_width');
                        localStorage.removeItem('roster_col_total_width');
                        localStorage.removeItem('roster_col_dia_width');
                      }}
                      title="Restablecer anchos de columnas por defecto"
                    >
                      ↺ Reset
                    </button>
                  </div>
                </div>
              </div>

              {/* Leyenda explicativa de colores y ayuda de columnas */}
              <div className="gantt-legend-bar">
                <div className="legend-items-left">
                  <div className="legend-item">
                    <span className="legend-box campo"></span>
                    <span>Activo en Campo / Obra</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-box subida"></span>
                    <span>⬆️ Subida (Inicio Campo)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-box bajada"></span>
                    <span>⬇️ Bajada (Inicio Franco)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-box franco"></span>
                    <span>Franco / Descanso</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-box domingo"></span>
                    <span>Domingo Resaltado (Tarifa especial)</span>
                  </div>
                </div>
                <div className="legend-resizer-hint">
                  <span>💡 Podés arrastrar los bordes de los encabezados para cambiar el ancho de las columnas.</span>
                </div>
              </div>

              {/* Grilla Gantt con scroll horizontal y vertical suave */}
              <div className="gantt-table-container">
                {cargandoRosters ? (
                  <div className="gantt-loading">
                    <div className="spinner-mini"></div>
                    <span>Cargando planificación del mes...</span>
                  </div>
                ) : empleadosEnGantt.length === 0 ? (
                  <div className="gantt-empty">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <h4>No hay registros de roster en {nombresMeses[mesGantt]} {anioGantt}</h4>
                    <p>Completa el formulario de la izquierda para comenzar a planificar turnos y francos.</p>
                  </div>
                ) : (
                  <table className="gantt-table">
                    <thead>
                      <tr>
                        {/* Columna Empleado redimensionable */}
                        <th
                          className="gantt-th-emp"
                          style={{
                            width: `${anchoColEmp}px`,
                            minWidth: `${anchoColEmp}px`,
                            maxWidth: `${anchoColEmp}px`
                          }}
                        >
                          <div className="th-content-resizable">
                            <span>Empleado / Proyecto</span>
                            <div
                              className="col-resizer"
                              onMouseDown={(e) => handleMouseDownResize(e, 'emp')}
                              title="Arrastrar para ajustar ancho de la columna Empleado"
                            />
                          </div>
                        </th>

                        {/* Columna Total a Liquidar redimensionable */}
                        <th
                          className="gantt-th-totales"
                          style={{
                            left: `${anchoColEmp}px`,
                            width: `${anchoColTotal}px`,
                            minWidth: `${anchoColTotal}px`,
                            maxWidth: `${anchoColTotal}px`
                          }}
                        >
                          <div className="th-content-resizable">
                            <span>Total a Liquidar</span>
                            <div
                              className="col-resizer"
                              onMouseDown={(e) => handleMouseDownResize(e, 'total')}
                              title="Arrastrar para ajustar ancho de la columna Total"
                            />
                          </div>
                        </th>

                        {/* Columnas de los días del mes redimensionables */}
                        {diasEnMes.map(d => (
                          <th
                            key={d.numero}
                            className={`gantt-th-day ${d.esDomingo ? 'col-domingo' : ''}`}
                            style={{
                              width: `${anchoColDia}px`,
                              minWidth: `${anchoColDia}px`,
                              maxWidth: `${anchoColDia}px`
                            }}
                            title={d.esDomingo ? 'Día Domingo' : ''}
                          >
                            <div className="th-content-resizable day-header-cell">
                              <span className="th-day-name">{d.diaSemanaNombre}</span>
                              <span className="th-day-num">{d.numero}</span>
                              {d.esDomingo && <span className="dom-tag">DOM</span>}
                              <div
                                className="col-resizer day-resizer"
                                onMouseDown={(e) => handleMouseDownResize(e, 'dia')}
                                title="Arrastrar para ajustar ancho de los días"
                              />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {empleadosEnGantt.map(emp => {
                        let diasNormActivos = 0;
                        let domingosActivos = 0;
                        let dineroTotal = 0;

                        // Mapeo de días para este empleado
                        const estadoDia = {}; // d.numero -> { tipo, proyecto, precio_dia, precio_domingo }

                        diasEnMes.forEach(d => {
                          for (const r of emp.registros) {
                            if (r.fecha_inicio <= d.fechaStr && d.fechaStr <= r.fecha_fin) {
                              estadoDia[d.numero] = r;
                              if (r.tipo === 'Campo') {
                                if (d.esDomingo) {
                                  domingosActivos += 1;
                                  dineroTotal += Number(r.precio_domingo) || 0;
                                } else {
                                  diasNormActivos += 1;
                                  dineroTotal += Number(r.precio_dia) || 0;
                                }
                              }
                              break;
                            }
                          }
                        });

                        return (
                          <tr key={emp.nombre} className="gantt-row">
                            {/* Columna Empleado con distinción clara de Proyecto asignado */}
                            <td
                              className="gantt-td-emp"
                              style={{
                                width: `${anchoColEmp}px`,
                                minWidth: `${anchoColEmp}px`,
                                maxWidth: `${anchoColEmp}px`
                              }}
                            >
                              <div className="emp-info-pill">
                                <div className="emp-avatar-mini">
                                  {emp.nombre.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="emp-text-col">
                                  <span className="emp-name-text" title={emp.nombre}>{emp.nombre}</span>

                                  {/* Distinción del proyecto asignado (muy visible cuando está en 'Todos los proyectos') */}
                                  <div className="emp-projects-badge-row">
                                    {emp.proyectos && emp.proyectos.length > 0 ? (
                                      emp.proyectos.map((proy, pIdx) => (
                                        <span
                                          key={pIdx}
                                          className="emp-proy-chip"
                                          title={`Proyecto asignado: ${proy}`}
                                        >
                                          <span className="proy-dot"></span>
                                          <span className="proy-text">{proy}</span>
                                        </span>
                                      ))
                                    ) : (
                                      <span className="emp-proy-chip unassigned">Sin proyecto</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Columna Total a Liquidar y Desglose */}
                            <td
                              className="gantt-td-totales"
                              style={{
                                left: `${anchoColEmp}px`,
                                width: `${anchoColTotal}px`,
                                minWidth: `${anchoColTotal}px`,
                                maxWidth: `${anchoColTotal}px`
                              }}
                            >
                              <div className="totals-card-mini">
                                <span className="total-money">
                                  ${dineroTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="total-days-detail">
                                  {diasNormActivos}d norm. + {domingosActivos} dom.
                                </span>
                              </div>
                            </td>

                            {/* Celdas de los días del mes */}
                            {diasEnMes.map(d => {
                              const rInfo = estadoDia[d.numero];
                              const esDom = d.esDomingo;

                              return (
                                <td
                                  key={d.numero}
                                  className={`gantt-td-day ${esDom ? 'col-domingo' : ''}`}
                                  style={{
                                    width: `${anchoColDia}px`,
                                    minWidth: `${anchoColDia}px`,
                                    maxWidth: `${anchoColDia}px`,
                                  }}
                                >
                                  {rInfo && (() => {
                                    const esSubida = (rInfo.tipo === 'Campo' && d.fechaStr === rInfo.fecha_inicio);
                                    const esBajada = (rInfo.tipo === 'Franco' && d.fechaStr === rInfo.fecha_inicio);

                                    let badgeTipoClass = 'bar-campo';
                                    if (esSubida) badgeTipoClass = 'bar-subida';
                                    else if (esBajada) badgeTipoClass = 'bar-bajada';
                                    else if (rInfo.tipo === 'Campo') badgeTipoClass = 'bar-campo';
                                    else if (rInfo.tipo === 'Franco') badgeTipoClass = 'bar-franco';
                                    else if (rInfo.tipo === 'Vacaciones') badgeTipoClass = 'bar-vacaciones';
                                    else if (rInfo.tipo === 'Licencia') badgeTipoClass = 'bar-licencia';

                                    const etiquetaBarra = esSubida ? '⬆S' : (esBajada ? '⬇B' : (rInfo.tipo === 'Campo' ? 'C' : rInfo.tipo === 'Franco' ? 'F' : rInfo.tipo === 'Vacaciones' ? 'V' : 'L'));

                                    const tituloTooltip = `${esSubida
                                      ? '⬆️ SUBIDA (Inicio de Campo / Viaje)'
                                      : esBajada
                                        ? '⬇️ BAJADA (Inicio de Descanso / Viaje)'
                                        : rInfo.tipo === 'Campo'
                                          ? '🚜 Campo / Obra'
                                          : rInfo.tipo === 'Franco'
                                            ? '🏠 Franco'
                                            : rInfo.tipo === 'Vacaciones'
                                              ? '🏖️ Vacaciones'
                                              : '🏥 Licencia'
                                      }\nEmpleado: ${emp.nombre}\nProyecto: ${rInfo.proyecto}${rInfo.tipo === 'Campo'
                                        ? `\nTarifa día: $${rInfo.precio_dia || 0} | Dom: $${rInfo.precio_domingo || 0}`
                                        : ''
                                      }\n\n(Click para modificar o eliminar este turno)`;

                                    return (
                                      <div
                                        className={`gantt-bar-cell ${badgeTipoClass}`}
                                        title={tituloTooltip}
                                        onClick={() => handleAbrirEditarGantt(rInfo)}
                                        style={{ cursor: 'pointer' }}
                                      >
                                        {etiquetaBarra}
                                      </div>
                                    );
                                  })()}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Modal interactivo para seleccionar el proyecto a exportar a Excel */}
      {mostrarModalExport && (
        <div className="roster-modal-overlay" onClick={() => !exportandoExcel && setMostrarModalExport(false)}>
          <div className="roster-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="roster-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="roster-title-badge" style={{ margin: 0, background: '#059669' }}>EXCEL</span>
                <h3>Exportar Roster por Proyecto</h3>
              </div>
              <p>
                El archivo .xlsx oficial contendrá las 3 hojas reglamentarias (Ciclo Completo, 1ra Quincena y 2da Quincena) para <strong>{nombresMeses[mesGantt]} {anioGantt}</strong>, exclusivamente con los registros del proyecto seleccionado.
              </p>
            </div>

            <div className="roster-modal-body">
              <div className="form-group-roster highlight-project">
                <label className="roster-label">
                  <span>Proyecto a Exportar (Ingeniería - I) <strong className="required">*</strong></span>
                </label>
                <select
                  value={proyectoAExportar}
                  onChange={(e) => setProyectoAExportar(e.target.value)}
                  className="roster-select"
                  disabled={exportandoExcel}
                >
                  {proyectosDisponibles.map((p, idx) => (
                    <option key={idx} value={p}>{p}</option>
                  ))}
                </select>
                <span className="form-hint">
                  Mostrando únicamente proyectos del área de Ingeniería (I).
                </span>
              </div>
            </div>

            <div className="roster-modal-footer">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setMostrarModalExport(false)}
                disabled={exportandoExcel}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-modal-confirm"
                onClick={handleExportarExcelDirecto}
                disabled={exportandoExcel || !proyectoAExportar}
              >
                {exportandoExcel ? (
                  <>
                    <div className="spinner-mini" style={{ width: '13px', height: '13px', margin: 0, borderWidth: '2px' }}></div>
                    Exportando Excel...
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Descargar Archivo .xlsx
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal interactivo para modificar el turno de Roster seleccionado en el Gantt */}
      {modalEditar && (
        <div className="roster-modal-overlay" onClick={() => !guardandoEdit && setModalEditar(false)}>
          <div className="roster-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="roster-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="roster-title-badge" style={{ margin: 0, background: '#2563eb' }}>EDITAR</span>
                <h3>Modificar Turno de Roster</h3>
              </div>
              <p>Actualiza la asignación, fechas o tarifas. Los cambios impactarán en el Gantt y se sincronizarán con Google Sheets.</p>
            </div>

            <form onSubmit={handleGuardarEdicionGantt} className="roster-modal-body">
              {/* Empleado */}
              <div className="form-group-roster" style={{ marginBottom: '10px' }}>
                <label className="roster-label" style={{ fontSize: '12px' }}>Empleado (Ingeniería - I):</label>
                <select
                  value={editEmpleado}
                  onChange={(e) => setEditEmpleado(e.target.value)}
                  className="roster-select"
                  required
                >
                  {empleadosDisponibles.map((emp, i) => (
                    <option key={i} value={emp.nombre}>{emp.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Proyecto */}
              <div className="form-group-roster" style={{ marginBottom: '10px' }}>
                <label className="roster-label" style={{ fontSize: '12px' }}>Proyecto Asignado:</label>
                <select
                  value={editProyecto}
                  onChange={(e) => setEditProyecto(e.target.value)}
                  className="roster-select"
                  required
                >
                  {proyectosDisponibles.map((p, i) => (
                    <option key={i} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Rango de Fechas */}
              <div className="form-group-roster" style={{ marginBottom: '10px' }}>
                <label className="roster-label" style={{ fontSize: '12px' }}>Rango de Fechas:</label>
                <div className="roster-dates-row">
                  <div className="date-field-box">
                    <span className="date-sublabel">Desde:</span>
                    <input
                      type="date"
                      value={editFechaInicio}
                      onChange={(e) => setEditFechaInicio(e.target.value)}
                      className="roster-input date-input"
                      required
                    />
                  </div>
                  <div className="date-field-box">
                    <span className="date-sublabel">Hasta:</span>
                    <input
                      type="date"
                      value={editFechaFin}
                      onChange={(e) => setEditFechaFin(e.target.value)}
                      className="roster-input date-input"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Tipo */}
              <div className="form-group-roster" style={{ marginBottom: '10px' }}>
                <label className="roster-label" style={{ fontSize: '12px' }}>Tipo de Jornada:</label>
                <div className="roster-type-selector">
                  <button
                    type="button"
                    className={`btn-type-pill pill-campo ${editTipo === 'Campo' ? 'active' : ''}`}
                    onClick={() => setEditTipo('Campo')}
                  >
                    🚜 Campo / Obra
                  </button>
                  <button
                    type="button"
                    className={`btn-type-pill pill-franco ${editTipo === 'Franco' ? 'active' : ''}`}
                    onClick={() => setEditTipo('Franco')}
                  >
                    🏠 Franco / Descanso
                  </button>
                  <button
                    type="button"
                    className={`btn-type-pill pill-vacaciones ${editTipo === 'Vacaciones' ? 'active' : ''}`}
                    onClick={() => setEditTipo('Vacaciones')}
                  >
                    🏖️ Vacaciones
                  </button>
                  <button
                    type="button"
                    className={`btn-type-pill pill-licencia ${editTipo === 'Licencia' ? 'active' : ''}`}
                    onClick={() => setEditTipo('Licencia')}
                  >
                    🏥 Licencia
                  </button>
                </div>
              </div>

              {/* Tarifas si es Campo (Modo Solo Lectura) */}
              {editTipo === 'Campo' && (
                <div style={{ marginTop: '10px' }}>
                  <label className="roster-label" style={{ fontSize: '12px', marginBottom: '6px' }}>
                    Tarifas Reglamentarias Asignadas (Solo Lectura):
                  </label>
                  {tarifaModalEdit ? (
                    <div style={{ background: 'var(--bg-secondary, #f8fafc)', border: '1px solid var(--border-input, #cbd5e1)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '12px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>Día Normal:</span>
                          <strong>${Number(tarifaModalEdit.dia_normal || 0).toLocaleString('es-AR')}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#92400e', display: 'block' }}>Domingo:</span>
                          <strong style={{ color: '#b45309' }}>${Number(tarifaModalEdit.domingo || 0).toLocaleString('es-AR')}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#065f46', display: 'block' }}>Subida:</span>
                          <strong style={{ color: '#047857' }}>${Number(tarifaModalEdit.subida || 0).toLocaleString('es-AR')}</strong>
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: '#1e40af', display: 'block' }}>Bajada:</span>
                          <strong style={{ color: '#1d4ed8' }}>${Number(tarifaModalEdit.bajada || 0).toLocaleString('es-AR')}</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '8px 12px', background: '#f1f5f9', borderRadius: '6px', fontSize: '12px', color: '#64748b' }}>
                      Sin tarifa configurada en 1_2_tarifas_roster para este proyecto (Tarifa: $0.00).
                    </div>
                  )}
                </div>
              )}

              <div className="roster-modal-footer" style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn-modal-delete"
                  disabled={guardandoEdit || eliminandoEdit}
                  onClick={handleEliminarTurnoGantt}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {eliminandoEdit ? 'Eliminando...' : '🗑️ Eliminar Turno'}
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    disabled={guardandoEdit || eliminandoEdit}
                    onClick={() => setModalEditar(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-modal-confirm"
                    disabled={guardandoEdit || eliminandoEdit}
                    style={{ background: '#2563eb' }}
                  >
                    {guardandoEdit ? 'Guardando...' : 'Guardar Modificación'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

  // En modo RPG: envuelto dentro del Tablón de Madera de la Taberna con herrajes y estandarte curvado
  if (isRpg) {
    return (
      <div className="rpg-board-viewport rpg-roster-viewport">
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

  // En modo Normal / Corporativo
  return (
    <div className={`roster-view-container ${isDark ? 'dark-theme' : ''}`}>
      {contenidoPrincipal}
    </div>
  );
}
