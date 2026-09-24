import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';

export default function RosterHistoryView({ onVolver, onNuevoRoster, tema }) {
  const isDark = tema === 'dark';

  // Poner la ventana en pantalla completa al entrar (se conserva el tamaño al salir)
  useEffect(() => {
    localStorage.removeItem('ingeap_rosters_mock');
    api.maximizarVentana();
  }, []);

  const [refrescando, setRefrescando] = useState(false);
  const [mesSeleccionado, setMesSeleccionado] = useState(() => new Date().getMonth() + 1);
  const [anioSeleccionado, setAnioSeleccionado] = useState(() => new Date().getFullYear());
  const [proyectosDisponibles, setProyectosDisponibles] = useState([]);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState('');
  const [filtrarTablaPorProyecto, setFiltrarTablaPorProyecto] = useState(false);
  const [rosters, setRosters] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo: 'exito'|'error', texto: '' }

  const nombresMeses = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const [empleadosDisponibles, setEmpleadosDisponibles] = useState([]);

  // Estados para Modal de Edición de Roster
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

  // Cargar proyectos y empleados exclusivos de Ingeniería (I)
  useEffect(() => {
    async function cargarCatalogos() {
      try {
        const [proys, emps] = await Promise.all([
          api.obtenerServicios('I'),
          api.obtenerTodosUsuarios('I')
        ]);
        if (Array.isArray(proys)) {
          setProyectosDisponibles(proys);
          if (proys.length > 0) {
            setProyectoSeleccionado(proys[0]);
          }
        }
        if (Array.isArray(emps)) {
          const empsIng = emps.filter(e => (e.area || '').trim().toUpperCase() === 'I');
          setEmpleadosDisponibles(empsIng.length > 0 ? empsIng : emps);
        }
      } catch (err) {
        console.error('Error cargando catálogos de ingeniería:', err);
      }
    }
    cargarCatalogos();
  }, []);

  const cargarRegistrosMes = async (anio, mes) => {
    setCargando(true);
    setMensaje(null);
    try {
      const ultimoDia = new Date(anio, mes, 0).getDate();
      const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
      const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
      const data = await api.obtenerRosters(desde, hasta);
      if (Array.isArray(data)) {
        setRosters(data);
      }
    } catch (err) {
      console.error('Error cargando historial de rosters:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarRegistrosMes(anioSeleccionado, mesSeleccionado);
  }, [anioSeleccionado, mesSeleccionado]);

  // Escuchar evento de actualización de catálogos o sincronización
  useEffect(() => {
    const handleCatalogosActualizados = () => {
      cargarRegistrosMes(anioSeleccionado, mesSeleccionado);
    };
    window.addEventListener('catalogos-actualizados', handleCatalogosActualizados);
    return () => {
      window.removeEventListener('catalogos-actualizados', handleCatalogosActualizados);
    };
  }, [anioSeleccionado, mesSeleccionado]);

  const handleRefrescar = async () => {
    setRefrescando(true);
    try {
      localStorage.removeItem('ingeap_rosters_mock');
      await api.refrescarCatalogos();
    } catch (err) {
      console.error('Error al refrescar catálogos de Roster:', err);
    } finally {
      await cargarRegistrosMes(anioSeleccionado, mesSeleccionado);
      setRefrescando(false);
    }
  };

  const handleAbrirEditar = (r) => {
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

  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    if (!editEmpleado || !editProyecto || !editFechaInicio || !editFechaFin) {
      alert('Por favor completa todos los campos requeridos.');
      return;
    }
    if (editFechaInicio > editFechaFin) {
      alert('La fecha de inicio no puede ser posterior a la fecha de fin.');
      return;
    }

    setGuardandoEdit(true);
    try {
      const empObj = empleadosDisponibles.find(emp => emp.nombre === editEmpleado);
      const res = await api.guardarRoster({
        id: editId,
        empleado: editEmpleado,
        dni: empObj ? empObj.dni : '',
        usuario_mail: empObj ? (empObj.mail || empObj.email || '') : '',
        proyecto: editProyecto,
        fecha_inicio: editFechaInicio,
        fecha_fin: editFechaFin,
        tipo: editTipo,
        precio_dia: editTipo === 'Campo' ? Number(editPrecioDia) || 0 : 0,
        precio_domingo: editTipo === 'Campo' ? Number(editPrecioDomingo) || 0 : 0
      });

      if (res && res.exito) {
        setModalEditar(false);
        setMensaje({
          tipo: 'exito',
          texto: `Turno de roster de ${editEmpleado} modificado y sincronizado correctamente.`
        });
        await cargarRegistrosMes(anioSeleccionado, mesSeleccionado);
      } else {
        alert(res?.error || 'No se pudo guardar la modificación del roster.');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión al modificar el registro.');
    } finally {
      setGuardandoEdit(false);
    }
  };

  const handleExportarExcel = async () => {
    if (!proyectoSeleccionado) {
      setMensaje({ tipo: 'error', texto: 'Debes seleccionar un proyecto de Ingeniería para exportar.' });
      return;
    }
    setExportando(true);
    setMensaje(null);
    try {
      const res = await api.exportarRosterExcel(anioSeleccionado, mesSeleccionado, proyectoSeleccionado);
      if (res && res.exito) {
        setMensaje({
          tipo: 'exito',
          texto: res.mensaje || `¡Archivo Excel exportado exitosamente para "${proyectoSeleccionado}" con las 3 hojas reglamentarias!`
        });
      } else if (res && res.cancelado) {
        // El usuario cerró el cuadro de diálogo de Windows sin guardar
      } else {
        setMensaje({
          tipo: 'error',
          texto: res?.error || 'No se pudo generar el archivo Excel.'
        });
      }
    } catch (err) {
      console.error('Error exportando:', err);
      setMensaje({ tipo: 'error', texto: 'Error al exportar: ' + err.message });
    } finally {
      setExportando(false);
    }
  };

  const handleEliminarRegistro = async (id, emp) => {
    if (!window.confirm(`¿Estás seguro de eliminar el registro de roster de ${emp}?`)) {
      return;
    }
    try {
      const res = await api.eliminarRoster(id);
      if (res && res.exito) {
        setMensaje({ tipo: 'exito', texto: 'Registro eliminado correctamente.' });
        await cargarRegistrosMes(anioSeleccionado, mesSeleccionado);
      } else {
        setMensaje({ tipo: 'error', texto: 'No se pudo eliminar el registro.' });
      }
    } catch (err) {
      console.error(err);
      setMensaje({ tipo: 'error', texto: 'Error de comunicación al eliminar.' });
    }
  };

  // Filtrado de la tabla según el checkbox
  const rostersFiltrados = useMemo(() => {
    if (!filtrarTablaPorProyecto || !proyectoSeleccionado) return rosters;
    return rosters.filter(r => r.proyecto === proyectoSeleccionado);
  }, [rosters, filtrarTablaPorProyecto, proyectoSeleccionado]);

  return (
    <div className={`roster-history-container ${isDark ? 'dark-theme' : ''}`}>
      {/* Barra de navegación superior */}
      <div className="roster-top-nav">
        <div className="roster-top-nav-left">
          <button
            type="button"
            className="btn-roster-back"
            onClick={onVolver}
            title="Volver al Menú Principal"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Volver al Menú
          </button>
          <div className="roster-header-title">
            <span className="roster-title-badge">RRHH</span>
            <h2>Historial y Exportación de Rosters</h2>
          </div>
        </div>

        <div className="roster-top-nav-actions">
          {/* Botón Refrescar: Sincroniza y depura registros de Sheets y BD local */}
          <button
            type="button"
            className={`btn-roster-refresh ${refrescando ? 'btn-refresh-spinning' : ''}`}
            onClick={handleRefrescar}
            disabled={refrescando || cargando}
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
            {refrescando ? 'Sincronizando...' : 'Refrescar'}
          </button>

          <button
            type="button"
            className="btn-go-new-roster"
            onClick={onNuevoRoster}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Cargar Nuevo Roster
          </button>
        </div>
      </div>

      <div className="roster-history-content">
        {/* Tarjeta de Control y Exportación */}
        <div className="history-export-card">
          <div className="history-controls-row" style={{ flexWrap: 'wrap', gap: '16px' }}>
            <div className="history-period-selector">
              <label className="history-filter-label">Mes del Reporte:</label>
              <div className="select-row-period">
                <select
                  value={mesSeleccionado}
                  onChange={(e) => setMesSeleccionado(Number(e.target.value))}
                  className="period-select"
                >
                  {nombresMeses.slice(1).map((nom, i) => (
                    <option key={i + 1} value={i + 1}>{nom}</option>
                  ))}
                </select>

                <select
                  value={anioSeleccionado}
                  onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
                  className="period-select year-select"
                >
                  {[2024, 2025, 2026, 2027, 2028].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selector de Proyecto de Ingeniería a Exportar */}
            <div className="history-period-selector" style={{ flex: 1, minWidth: '260px' }}>
              <label className="history-filter-label">Proyecto (Área de Ingeniería - I):</label>
              <select
                value={proyectoSeleccionado}
                onChange={(e) => setProyectoSeleccionado(e.target.value)}
                className="period-select"
                style={{ width: '100%', maxWidth: '440px' }}
              >
                {proyectosDisponibles.map((p, idx) => (
                  <option key={idx} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* BOTÓN DE DESCARGA EXCEL EN 3 HOJAS POR PROYECTO */}
            <div className="history-download-action">
              <button
                type="button"
                className="btn-download-excel"
                disabled={exportando || !proyectoSeleccionado}
                onClick={handleExportarExcel}
                title="Descargar archivo Excel oficial con 3 hojas para el proyecto seleccionado"
              >
                {exportando ? (
                  <>
                    <div className="spinner-mini"></div>
                    Generando archivo Excel...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

          {/* Información sobre el formato de exportación */}
          <div className="excel-info-pill-box">
            <span className="excel-badge">Excel por Proyecto</span>
            <span className="excel-desc-text">
              Genera un reporte oficial con <strong>3 hojas</strong> (Ciclo Completo, 1ra Quincena y 2da Quincena) para <strong>{proyectoSeleccionado || 'el proyecto seleccionado'}</strong> ({nombresMeses[mesSeleccionado]} {anioSeleccionado}).
            </span>
          </div>

          {/* Feedback */}
          {mensaje && (
            <div className={`roster-alert ${mensaje.tipo === 'exito' ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '14px' }}>
              <span>{mensaje.tipo === 'exito' ? '✓' : '⚠️'}</span>
              <p>{mensaje.texto}</p>
              <button type="button" onClick={() => setMensaje(null)}>✕</button>
            </div>
          )}
        </div>

        {/* Tabla de Registros */}
        <div className="history-table-card">
          <div className="history-table-header">
            <h3>Registros de {nombresMeses[mesSeleccionado]} {anioSeleccionado}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filtrarTablaPorProyecto}
                  onChange={(e) => setFiltrarTablaPorProyecto(e.target.checked)}
                />
                Ver únicamente registros de este proyecto
              </label>
              <span className="records-count-chip">{rostersFiltrados.length} registros cargados</span>
            </div>
          </div>

          {cargando ? (
            <div className="history-loading">
              <div className="spinner-mini"></div>
              <span>Cargando historial...</span>
            </div>
          ) : rostersFiltrados.length === 0 ? (
            <div className="history-empty">
              <p>No se encontraron registros de turnos o francos {filtrarTablaPorProyecto ? 'para este proyecto' : 'para este mes'}.</p>
              <button type="button" className="btn-empty-action" onClick={onNuevoRoster}>
                + Cargar primer roster para este período
              </button>
            </div>
          ) : (
            <div className="history-table-wrapper">
              <table className="roster-history-table">
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th>Proyecto Asignado</th>
                    <th>Fecha Inicio</th>
                    <th>Fecha Fin</th>
                    <th>Tipo</th>
                    <th>Tarifa Día</th>
                    <th>Tarifa Domingo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rostersFiltrados.map(r => (
                    <tr key={r.id}>
                      <td className="emp-cell">
                        <strong>{r.empleado}</strong>
                        {r.dni && <span className="emp-dni-sub">DNI: {r.dni}</span>}
                      </td>
                      <td className="proy-cell" title={r.proyecto}>
                        {r.proyecto}
                      </td>
                      <td className="date-cell">{r.fecha_inicio}</td>
                      <td className="date-cell">{r.fecha_fin}</td>
                      <td>
                        <span className={`status-pill ${r.tipo === 'Campo' ? 'status-campo' : 'status-franco'}`}>
                          {r.tipo === 'Campo' ? '🚜 Campo' : '🏠 Franco'}
                        </span>
                      </td>
                      <td className="num-cell">
                        {r.tipo === 'Campo' && r.precio_dia > 0
                          ? `$${Number(r.precio_dia).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : '-'}
                      </td>
                      <td className="num-cell">
                        {r.tipo === 'Campo' && r.precio_domingo > 0
                          ? `$${Number(r.precio_domingo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : '-'}
                      </td>
                      <td className="action-cell">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn-edit-roster"
                            onClick={() => handleAbrirEditar(r)}
                            title="Modificar este turno de roster"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="btn-delete-roster"
                            onClick={() => handleEliminarRegistro(r.id, r.empleado)}
                            title="Eliminar este turno"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal para Modificar Registro de Roster Existente */}
      {modalEditar && (
        <div className="roster-modal-overlay" onClick={() => !guardandoEdit && setModalEditar(false)}>
          <div className="roster-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="roster-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="roster-title-badge" style={{ margin: 0, background: '#2563eb' }}>EDITAR</span>
                <h3>Modificar Registro de Roster</h3>
              </div>
              <p>Actualiza la asignación, fechas o tarifas del empleado. Los cambios se sincronizarán con Google Sheets.</p>
            </div>

            <form onSubmit={handleGuardarEdicion} className="roster-modal-body">
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
                </div>
              </div>

              {/* Tarifas si es Campo */}
              {editTipo === 'Campo' && (
                <div className="tariffs-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                  <div className="tariff-input-box">
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>Tarifa Día Normal ($):</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editPrecioDia}
                      onChange={(e) => setEditPrecioDia(e.target.value)}
                      placeholder="0.00"
                      className="roster-input"
                    />
                  </div>
                  <div className="tariff-input-box">
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>Tarifa Día Domingo ($):</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editPrecioDomingo}
                      onChange={(e) => setEditPrecioDomingo(e.target.value)}
                      placeholder="0.00"
                      className="roster-input"
                    />
                  </div>
                </div>
              )}

              <div className="roster-modal-footer" style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn-modal-cancel"
                  disabled={guardandoEdit}
                  onClick={() => setModalEditar(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-modal-confirm"
                  disabled={guardandoEdit}
                  style={{ background: '#2563eb' }}
                >
                  {guardandoEdit ? 'Guardando...' : 'Guardar Modificación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
