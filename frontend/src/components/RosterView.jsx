import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';

export default function RosterView({ usuario, onVolver, tema }) {
  const isDark = tema === 'dark';

  // Al entrar a Roster, la ventana se maximiza a pantalla completa.
  // El tamaño se preserva al volver al menú principal para mantener una experiencia consistente.
  useEffect(() => {
    api.maximizarVentana();
  }, []);

  // Control de vista: Calendario Gantt visible u oculto
  const [mostrarCalendario, setMostrarCalendario] = useState(true);

  // Catálogos
  const [proyectosDisponibles, setProyectosDisponibles] = useState([]);
  const [empleadosDisponibles, setEmpleadosDisponibles] = useState([]);
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
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState('');
  const [fechaInicio, setFechaInicio] = useState(getFechaHoy());
  const [fechaFin, setFechaFin] = useState(getFechaHoy());
  const [tipo, setTipo] = useState('Campo'); // 'Campo' | 'Franco'
  const [precioDia, setPrecioDia] = useState('');
  const [precioDomingo, setPrecioDomingo] = useState('');

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
        const [proys, emps] = await Promise.all([
          api.obtenerServicios('I'), // Exclusivamente área de Ingeniería (I)
          api.obtenerTodosUsuarios('I') // Exclusivamente empleados del área de Ingeniería (I)
        ]);
        if (activo) {
          if (Array.isArray(proys)) {
            setProyectosDisponibles(proys);
            if (proys.length > 0 && !proyecto) {
              setProyecto(proys[0]);
              setProyectoAExportar(proys[0]);
            }
          }
          if (Array.isArray(emps)) {
            // Filtrado defensivo adicional por área 'I' (Ingeniería)
            const empsIngenieria = emps.filter(
              (e) => (e.area || '').trim().toUpperCase() === 'I'
            );
            setEmpleadosDisponibles(empsIngenieria.length > 0 ? empsIngenieria : emps);
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

  // Envío del formulario
  const handleGuardarRoster = async (e) => {
    e.preventDefault();
    setMensajeFeedback(null);

    if (!proyecto) {
      setMensajeFeedback({ tipo: 'error', texto: 'Debes seleccionar el proyecto asignado.' });
      return;
    }
    if (!empleadoSeleccionado) {
      setMensajeFeedback({ tipo: 'error', texto: 'Debes seleccionar un empleado.' });
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

    const empObj = empleadosDisponibles.find(e => e.nombre === empleadoSeleccionado);
    const dniEmp = empObj ? empObj.dni : '';
    const mailEmp = empObj ? (empObj.mail || empObj.email || '') : '';

    setGuardando(true);
    try {
      const datos = {
        empleado: empleadoSeleccionado,
        dni: dniEmp,
        usuario_mail: mailEmp,
        proyecto: proyecto,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        tipo: tipo,
        precio_dia: tipo === 'Campo' ? Number(precioDia) || 0 : 0,
        precio_domingo: tipo === 'Campo' ? Number(precioDomingo) || 0 : 0
      };

      const res = await api.guardarRoster(datos);
      if (res && res.exito) {
        setMensajeFeedback({
          tipo: 'exito',
          texto: `¡Roster registrado y sincronizado en Google Sheets para ${empleadoSeleccionado}! Podés continuar cargando los siguientes turnos.`
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
        setMensajeFeedback({ tipo: 'error', texto: res?.error || 'Error al guardar el roster.' });
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

  // Agrupar los registros por Empleado e identificar todos los proyectos a los que pertenece
  const empleadosEnGantt = useMemo(() => {
    const mapa = {};
    rostersFiltrados.forEach(r => {
      const emp = r.empleado;
      if (!mapa[emp]) {
        mapa[emp] = {
          nombre: emp,
          dni: r.dni,
          proyectosMap: {},
          registros: []
        };
      }
      mapa[emp].registros.push(r);
      if (r.proyecto) {
        mapa[emp].proyectosMap[r.proyecto] = true;
      }
    });

    return Object.values(mapa).map(empObj => ({
      ...empObj,
      proyectos: Object.keys(empObj.proyectosMap)
    })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rostersFiltrados]);

  // Nombres de los meses en español
  const nombresMeses = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  return (
    <div className={`roster-view-container ${isDark ? 'dark-theme' : ''}`}>
      {/* Barra superior de la vista de Roster */}
      <div className="roster-top-nav">
        <div className="roster-top-nav-left">
          <button
            type="button"
            className="btn-roster-back"
            onClick={onVolver}
            title="Volver al menú principal"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Volver al Menú
          </button>
          <div className="roster-header-title">
            <span className="roster-title-badge">RRHH</span>
            <h2>Gestión y Carga de Rosters</h2>
          </div>
        </div>

        <div className="roster-top-nav-actions">
          {/* NUEVO: Botón para exportar Excel directo desde esta ventana */}
          <button
            type="button"
            className="btn-export-excel-header"
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
                Descargar Excel ({nombresMeses[mesGantt]})
              </>
            )}
          </button>

          {/* Botón para Mostrar / Esconder Calendario Gantt */}
          <button
            type="button"
            className={`btn-toggle-gantt ${!mostrarCalendario ? 'gantt-hidden' : ''}`}
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
              </div>

              {/* 2. SELECCIÓN DE EMPLEADO (EXCLUSIVAMENTE ÁREA DE INGENIERÍA) */}
              <div className="form-group-roster">
                <label className="roster-label">
                  <span className="roster-label-num">2</span>
                  <span>Empleado (Ingeniería - I) <strong className="required">*</strong></span>
                </label>
                <select
                  value={empleadoSeleccionado}
                  onChange={(e) => setEmpleadoSeleccionado(e.target.value)}
                  className="roster-select"
                  required
                >
                  <option value="" disabled>Seleccionar empleado de Ingeniería...</option>
                  {empleadosDisponibles.map((emp, idx) => (
                    <option key={idx} value={emp.nombre}>
                      {emp.nombre} {emp.area ? `(${emp.area})` : ''}
                    </option>
                  ))}
                </select>
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

              {/* 4. ESTADO DE ROSTER: CAMPO O FRANCO */}
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
                </div>
              </div>

              {/* 5. TARIFAS: PRECIO DÍA NORMAL Y PRECIO DOMINGO */}
              {tipo === 'Campo' ? (
                <div className="form-group-roster tariffs-container">
                  <label className="roster-label">
                    <span className="roster-label-num">5</span>
                    <span>Tarifas a Liquidar por Día Trabajado</span>
                  </label>
                  <div className="tariffs-inputs-row">
                    <div className="tariff-input-box">
                      <span className="tariff-title">Día Normal en Obra</span>
                      <div className="input-currency-wrapper">
                        <span className="currency-symbol">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={precioDia}
                          onChange={(e) => setPrecioDia(e.target.value)}
                          className="roster-input tariff-input"
                        />
                      </div>
                    </div>

                    <div className="tariff-input-box sunday-tariff">
                      <span className="tariff-title">
                        Día Domingo <span className="sunday-badge-mini">DOM</span>
                      </span>
                      <div className="input-currency-wrapper">
                        <span className="currency-symbol">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={precioDomingo}
                          onChange={(e) => setPrecioDomingo(e.target.value)}
                          className="roster-input tariff-input"
                        />
                      </div>
                    </div>
                  </div>
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
                                    maxWidth: `${anchoColDia}px`
                                  }}
                                >
                                  {rInfo && (
                                    <div
                                      className={`gantt-bar-cell ${rInfo.tipo === 'Campo' ? 'bar-campo' : 'bar-franco'}`}
                                      title={`${rInfo.tipo === 'Campo' ? '🚜 Campo / Obra' : '🏠 Franco'}\nEmpleado: ${emp.nombre}\nProyecto: ${rInfo.proyecto}\nTarifa día: $${rInfo.precio_dia || 0} | Dom: $${rInfo.precio_domingo || 0}`}
                                    >
                                      {rInfo.tipo === 'Campo' ? 'C' : 'F'}
                                    </div>
                                  )}
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
    </div>
  );
}
