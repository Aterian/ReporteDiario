// [MOD-08] Módulo de Empleados (Admin, SubAdmin y Core)
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';
import { puedeGestionarUsuarios, puedeEditarUsuarios, esAdmin, esSubAdmin, esCore, getEtiquetaRol } from '../utils/permissions';
import { formatMoneda } from './history/historyConstants';

export const AREAS_SISTEMA = [
  { codigo: 'I', etiqueta: 'Ingeniería (I)', nombre: 'Ingeniería' },
  { codigo: 'A', etiqueta: 'Aplicaciones (A)', nombre: 'Aplicaciones' },
  { codigo: 'M', etiqueta: 'Mensura (M)', nombre: 'Mensura' },
  { codigo: 'RRHH', etiqueta: 'Recursos Humanos (RRHH)', nombre: 'Recursos Humanos' },
  { codigo: 'N', etiqueta: 'Núcleo (N)', nombre: 'Núcleo' },
  { codigo: 'VyM', etiqueta: 'Ventas y Marketing (VyM)', nombre: 'Ventas y Marketing' },
  { codigo: 'S', etiqueta: 'Sistema de Información Geográfica (S)', nombre: 'Sistema de Información Geográfica' }
];

export const getAreaInfo = (areaCodigo) => {
  if (!areaCodigo) return { codigo: '-', etiqueta: '-', nombre: '-' };
  const raw = String(areaCodigo).trim();
  const normalizado = raw.toUpperCase();
  const encontrada = AREAS_SISTEMA.find(a => a.codigo.toUpperCase() === normalizado);
  if (encontrada) return encontrada;
  if (normalizado === 'INGENIERIA' || normalizado === 'INGENIERÍA') return AREAS_SISTEMA[0];
  if (normalizado === 'APLICACIONES' || normalizado === 'ADMINISTRACION' || normalizado === 'ADMINISTRACIÓN') return AREAS_SISTEMA[1];
  if (normalizado === 'MENSURA') return AREAS_SISTEMA[2];
  if (normalizado === 'RRHH' || normalizado === 'RECURSOS HUMANOS') return AREAS_SISTEMA[3];
  if (normalizado === 'NUCLEO' || normalizado === 'NÚCLEO') return AREAS_SISTEMA[4];
  if (normalizado === 'VYM' || normalizado === 'VENTAS' || normalizado === 'MARKETING') return AREAS_SISTEMA[5];
  if (normalizado === 'S' || normalizado === 'SIG' || normalizado === 'GIS') return AREAS_SISTEMA[6];
  return { codigo: raw, etiqueta: raw, nombre: raw };
};

export default function UsersManagementView({ usuario, onVolver, tema }) {
  const isDark = tema === 'dark';
  const isRpg = tema === 'rpg';
  const puedeEditar = puedeEditarUsuarios(usuario);
  const soyAdmin = esAdmin(usuario);
  const soySubAdmin = esSubAdmin(usuario);

  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroArea, setFiltroArea] = useState('TODAS');
  const [filtroEstado, setFiltroEstado] = useState('TODOS'); // 'TODOS' | 'ACTIVOS' | 'INACTIVOS'

  // Modal de creación / edición
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [modoCreacion, setModoCreacion] = useState(false);
  const [formDatos, setFormDatos] = useState({
    id_usuario: '',
    primer_nombre: '',
    apellido: '',
    dni: '',
    email: '',
    area: '',
    rol_app: 'user_1',
    activo: true,
    sueldo_oficina: '',
    sueldo_obra: '',
    lugar_habitual: 'oficina',
    modalidad_calculo: 'base_30'
  });
  const [guardando, setGuardando] = useState(false);
  const [mensajeFeedback, setMensajeFeedback] = useState(null);

  const cargarUsuarios = async () => {
    setCargando(true);
    try {
      const data = await api.obtenerTodosUsuarios(null, true);
      if (Array.isArray(data)) {
        setUsuarios(data);
      }
    } catch (err) {
      console.error('Error al cargar lista de usuarios:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (puedeGestionarUsuarios(usuario)) {
      cargarUsuarios();
    }
  }, [usuario]);

  // Filtrado de usuarios
  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter(u => {
      // Filtro de texto
      if (busqueda) {
        const q = busqueda.toLowerCase().trim();
        const nom = (u.nombre || `${u.primer_nombre || ''} ${u.apellido || ''}`).toLowerCase();
        const dni = String(u.dni || '').toLowerCase();
        const mail = (u.email || u.mail || '').toLowerCase();
        const area = (u.area || '').toLowerCase();
        const rol = (u.rol_app || '').toLowerCase();
        if (!nom.includes(q) && !dni.includes(q) && !mail.includes(q) && !area.includes(q) && !rol.includes(q)) {
          return false;
        }
      }

      // Filtro de área
      if (filtroArea !== 'TODAS') {
        const areaInfo = getAreaInfo(u.area);
        if (areaInfo.codigo.toUpperCase() !== filtroArea.toUpperCase()) return false;
      }

      // Filtro de estado
      if (filtroEstado === 'ACTIVOS') {
        if (u.activo === false || u.activo === 0) return false;
      } else if (filtroEstado === 'INACTIVOS') {
        if (u.activo === true || u.activo === 1) return false;
      }

      return true;
    });
  }, [usuarios, busqueda, filtroArea, filtroEstado]);

  const abrirCreacion = () => {
    setModoCreacion(true);
    setUsuarioEditando(true);
    setFormDatos({
      id_usuario: '',
      primer_nombre: '',
      apellido: '',
      dni: '',
      email: '',
      area: 'I',
      rol_app: 'user_1',
      activo: true,
      sueldo_oficina: '',
      sueldo_obra: '',
      lugar_habitual: 'oficina',
      modalidad_calculo: 'base_30'
    });
    setMensajeFeedback(null);
  };

  const abrirEdicion = (u) => {
    setModoCreacion(false);
    setUsuarioEditando(u);
    const areaVal = getAreaInfo(u.area).codigo;
    setFormDatos({
      id_usuario: u.id_usuario || u.id_origen || u.dni || '',
      primer_nombre: u.primer_nombre || (u.nombre ? u.nombre.split(' ')[0] : ''),
      apellido: u.apellido || (u.nombre && u.nombre.includes(' ') ? u.nombre.split(' ').slice(1).join(' ') : ''),
      dni: u.dni || '',
      email: u.email || u.mail || '',
      area: areaVal !== '-' ? areaVal : 'I',
      rol_app: u.rol_app || 'user_1',
      activo: u.activo !== false && u.activo !== 0,
      sueldo_oficina: u.sueldo_oficina !== undefined && u.sueldo_oficina !== null ? String(u.sueldo_oficina) : '',
      sueldo_obra: u.sueldo_obra !== undefined && u.sueldo_obra !== null ? String(u.sueldo_obra) : '',
      lugar_habitual: u.lugar_habitual || 'oficina',
      modalidad_calculo: u.modalidad_calculo || 'base_30'
    });
    setMensajeFeedback(null);
  };

  const handleGuardarUsuario = async (e) => {
    e.preventDefault();
    if (!usuarioEditando) return;

    setGuardando(true);
    setMensajeFeedback(null);
    try {
      const payload = {
        id_usuario: formDatos.id_usuario,
        primer_nombre: formDatos.primer_nombre.trim(),
        apellido: formDatos.apellido.trim(),
        dni: formDatos.dni.trim(),
        email: formDatos.email.trim(),
        area: formDatos.area.trim(),
        rol_app: formDatos.rol_app,
        activo: Boolean(formDatos.activo),
        sueldo_oficina: formDatos.sueldo_oficina !== '' ? parseFloat(formDatos.sueldo_oficina) : null,
        sueldo_obra: formDatos.sueldo_obra !== '' ? parseFloat(formDatos.sueldo_obra) : null,
        lugar_habitual: formDatos.lugar_habitual,
        modalidad_calculo: formDatos.modalidad_calculo || 'base_30'
      };

      const res = modoCreacion
        ? await api.crearUsuarioYSueldo(payload)
        : await api.actualizarUsuarioYSueldo(payload);

      if (res && res.exito) {
        setMensajeFeedback({
          tipo: 'exito',
          texto: modoCreacion
            ? `Empleado ${payload.primer_nombre} ${payload.apellido} creado exitosamente.`
            : `Usuario ${payload.primer_nombre} ${payload.apellido} actualizado correctamente.`
        });
        await cargarUsuarios();
        window.dispatchEvent(new CustomEvent('catalogos-actualizados'));
        setTimeout(() => {
          setUsuarioEditando(null);
          setModoCreacion(false);
        }, 1200);
      } else {
        setMensajeFeedback({
          tipo: 'error',
          texto: res?.error || (modoCreacion ? 'No se pudo crear el empleado.' : 'No se pudo guardar la información del usuario.')
        });
      }
    } catch (err) {
      console.error('Error al guardar usuario:', err);
      setMensajeFeedback({
        tipo: 'error',
        texto: 'Error de red o comunicación al guardar el usuario.'
      });
    } finally {
      setGuardando(false);
    }
  };

  // Estimación en tiempo real de valor día para el modal (sueldo / 30 según columna generada de PostgreSQL)
  const estimacionDiaOficina = useMemo(() => {
    const s = parseFloat(formDatos.sueldo_oficina) || 0;
    return s > 0 ? Math.round((s / 30) * 100) / 100 : 0;
  }, [formDatos.sueldo_oficina]);

  const estimacionDiaObra = useMemo(() => {
    const s = parseFloat(formDatos.sueldo_obra) || 0;
    return s > 0 ? Math.round((s / 30) * 100) / 100 : 0;
  }, [formDatos.sueldo_obra]);

  // Si no tiene permisos, mostrar aviso
  if (!puedeGestionarUsuarios(usuario)) {
    return (
      <div className="view-content" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', background: 'var(--bg-surface, #ffffff)', padding: '32px', borderRadius: '12px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: '#cc3333' }}>Acceso Restringido</h2>
          <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '14px', marginBottom: '24px' }}>
            Este módulo de empleados y sueldos está reservado para roles <strong>Admin</strong>, <strong>Sub Admin</strong> y <strong>Core</strong>.
          </p>
          <button
            type="button"
            className="btn-action-primary"
            onClick={onVolver}
            style={{
              minHeight: '44px',
              padding: '0 24px',
              backgroundColor: '#cc3333',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Volver al Inicio
          </button>
        </div>
      </div>
    );
  }

  // Contenido de la vista principal
  const contenidoPrincipal = (
    <>
      {/* Barra superior del módulo */}
      <div className="users-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="btn-back"
              onClick={onVolver}
              style={{
                minWidth: '44px',
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-input, #cbd5e1)',
                background: 'var(--bg-surface, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ← Volver
            </button>
            <h1 className="users-view-title" style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#cc3333' }}>👥</span>
              {isRpg ? 'Registro Mayor de Aventureros' : 'Módulo de Empleados'}
            </h1>
          </div>
          <p className="users-view-subtitle" style={{ margin: '4px 0 0 56px', fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>
            Listado integral de personal, área, lugar de trabajo habitual, sueldos base y última asistencia registrada.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {puedeEditar && (
            <button
              type="button"
              onClick={abrirCreacion}
              data-testid="btn-nuevo-empleado"
              style={{
                minHeight: '44px',
                padding: '0 18px',
                borderRadius: '8px',
                border: 'none',
                background: '#cc3333',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(204,51,51,0.2)'
              }}
            >
              <span>➕</span>
              {isRpg ? 'Nuevo Aventurero' : 'Nuevo Empleado'}
            </button>
          )}

          <button
            type="button"
            onClick={cargarUsuarios}
            disabled={cargando}
          style={{
            minHeight: '44px',
            padding: '0 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-input, #cbd5e1)',
            background: 'var(--bg-surface, #ffffff)',
            color: 'var(--text-primary, #0f172a)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span className={cargando ? 'spinner' : ''}>🔄</span>
          {cargando ? 'Actualizando...' : 'Refrescar'}
          </button>
        </div>
      </div>

      {/* Controles y filtros */}
      <div className="users-filters-bar">
        {/* Buscador */}
        <div style={{ flex: '1 1 280px', position: 'relative' }}>
          <input
            type="text"
            className="users-search-input"
            placeholder="Buscar por nombre, DNI, email, área o rol..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <span style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted, #94a3b8)' }}>🔍</span>
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '12px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted, #94a3b8)'
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtro Área */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>Área:</label>
          <select
            className="users-filter-select"
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
          >
            <option value="TODAS">Todas las áreas</option>
            {AREAS_SISTEMA.map(a => (
              <option key={a.codigo} value={a.codigo}>{a.etiqueta}</option>
            ))}
          </select>
        </div>

        {/* Filtro Estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>Estado:</label>
          <select
            className="users-filter-select"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <option value="TODOS">Todos</option>
            <option value="ACTIVOS">Solo Activos</option>
            <option value="INACTIVOS">Solo Inactivos</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>
          Mostrando <strong>{usuariosFiltrados.length}</strong> de <strong>{usuarios.length}</strong> usuarios
        </div>
      </div>

      {/* Tabla de usuarios con Scroll Panel Integrado */}
      <div className="users-table-panel">
        {cargando ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
            <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto 12px' }} />
            <p style={{ margin: 0 }}>Cargando catálogo de empleados desde PostgreSQL...</p>
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
            <p style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 4px' }}>No se encontraron colaboradores</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Prueba ajustando los filtros de búsqueda o área.</p>
          </div>
        ) : (
          <div className="users-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Área / Lugar Habitual</th>
                  <th>Sueldo Base y Valor Día</th>
                  <th>Última Asistencia</th>
                  <th style={{ textAlign: 'center' }}>Rol / Estado</th>
                  <th style={{ textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((u, idx) => {
                  const rolInfo = getEtiquetaRol(u);
                  const nombreCompleto = u.nombre || `${u.primer_nombre || ''} ${u.apellido || ''}`.trim() || 'Sin Nombre';
                  const iniciales = nombreCompleto.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                  const esActivo = u.activo !== false && u.activo !== 0;
                  const lugarHabitual = u.lugar_habitual || 'oficina';
                  const areaInfo = getAreaInfo(u.area);

                  return (
                    <tr key={u.id_usuario || u.id_origen || u.dni || idx}>
                      {/* Empleado */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              backgroundColor: esActivo ? '#fee2e2' : '#e2e8f0',
                              color: esActivo ? '#cc3333' : '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '12px',
                              flexShrink: 0
                            }}
                          >
                            {iniciales}
                          </div>
                          <div>
                            <div className="user-emp-name" style={{ fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>{nombreCompleto}</div>
                            <div className="user-emp-sub" style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)' }}>
                              DNI: <span className="user-emp-dni" style={{ fontFamily: 'monospace' }}>{u.dni || '-'}</span> • {u.email || u.mail || '-'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Área / Lugar Habitual */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span
                            className="area-tag-neutral"
                            style={{
                              display: 'inline-block',
                              width: 'fit-content',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: 'var(--bg-surface-hover, #f1f5f9)',
                              color: 'var(--text-primary, #334155)'
                            }}
                            title={areaInfo.nombre}
                          >
                            {areaInfo.etiqueta}
                          </span>
                          <span
                            className={`habitual-tag-${lugarHabitual}`}
                            style={{
                              display: 'inline-block',
                              width: 'fit-content',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: lugarHabitual === 'obra' ? '#ecfdf5' : '#eff6ff',
                              color: lugarHabitual === 'obra' ? '#047857' : '#1d4ed8'
                            }}
                          >
                            Habitual: {lugarHabitual === 'obra' ? 'Obra / Campo' : 'Oficina'}
                          </span>
                        </div>
                      </td>

                      {/* Sueldo Base y Valor Día */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div>
                            <span className="sueldo-label-text" style={{ color: 'var(--text-secondary, #64748b)' }}>Oficina:</span>{' '}
                            <strong className="sueldo-amount">{formatMoneda(u.sueldo_oficina || 0)}</strong>{' '}
                            <span className="sueldo-day-est" style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>({formatMoneda(u.costo_dia_ofi || (u.sueldo_oficina ? u.sueldo_oficina / 30 : 0))}/d)</span>
                          </div>
                          <div>
                            <span className="sueldo-label-text" style={{ color: 'var(--text-secondary, #64748b)' }}>Obra:</span>{' '}
                            <strong className="sueldo-amount">{formatMoneda(u.sueldo_obra || 0)}</strong>{' '}
                            <span className="sueldo-day-est" style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)' }}>({formatMoneda(u.costo_dia_obra || (u.sueldo_obra ? u.sueldo_obra / 30 : 0))}/d)</span>
                          </div>
                        </div>
                      </td>

                      {/* Última Asistencia */}
                      <td style={{ padding: '12px 16px' }}>
                        {u.ultima_asistencia_fecha ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="asist-date-text" style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary, #0f172a)' }}>
                                📅 {u.ultima_asistencia_fecha}
                              </span>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: u.ultima_asistencia_lugar === 'obra' ? '#d1fae5' : '#dbeafe',
                                  color: u.ultima_asistencia_lugar === 'obra' ? '#065f46' : '#1e40af'
                                }}
                              >
                                {u.ultima_asistencia_lugar ? (u.ultima_asistencia_lugar.charAt(0).toUpperCase() + u.ultima_asistencia_lugar.slice(1)) : 'Oficina'}
                              </span>
                            </div>
                            <div className="asist-proj-text" style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.ultima_asistencia_proyecto || ''}>
                              {u.ultima_asistencia_proyecto ? `Proyecto: ${u.ultima_asistencia_proyecto}` : (u.ultima_asistencia_estado || 'Registrado')}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted, #94a3b8)', fontStyle: 'italic', fontSize: '12px' }}>Sin registros</span>
                        )}
                      </td>

                      {/* Rol / Estado */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              backgroundColor: rolInfo.rol === 'admin' ? '#fef3c7' : (rolInfo.rol === 'sub_admin' ? '#e0e7ff' : (rolInfo.rol === 'core' ? '#f3e8ff' : '#f1f5f9')),
                              color: rolInfo.rol === 'admin' ? '#b45309' : (rolInfo.rol === 'sub_admin' ? '#4338ca' : (rolInfo.rol === 'core' ? '#6b21a8' : '#475569'))
                            }}
                          >
                            {rolInfo.badge}
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '1px 6px',
                              borderRadius: '12px',
                              fontSize: '10px',
                              fontWeight: 600,
                              backgroundColor: esActivo ? '#dcfce7' : '#f1f5f9',
                              color: esActivo ? '#15803d' : '#64748b'
                            }}
                          >
                            <span style={{ fontSize: '7px' }}>●</span>
                            {esActivo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                      </td>

                      {/* Acción */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-edit-user"
                          onClick={() => abrirEdicion(u)}
                          title={puedeEditar ? "Editar usuario y sueldo" : "Ver detalle (solo lectura)"}
                        >
                          <span>{puedeEditar ? '✏️' : '👁️'}</span> {puedeEditar ? 'Editar' : 'Ver Detalle'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );

  // Modal de Detalle y Edición de Usuario
  const modalEdicion = usuarioEditando && (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(3px)',
        padding: '16px'
      }}
    >
      <div className="users-modal-container">
        {/* Header del Modal */}
        <div className="users-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#cc3333' }}>👤</span>
              {puedeEditar && !(soySubAdmin && usuarioEditando?.rol_app === 'admin') ? 'Detalle y Edición de Empleado' : 'Detalle de Empleado (Solo Lectura)'}
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)', marginTop: '2px' }}>
              {usuarioEditando.nombre || `${usuarioEditando.primer_nombre || ''} ${usuarioEditando.apellido || ''}`} • DNI: {usuarioEditando.dni}
              {usuarioEditando.ultima_asistencia_fecha && (
                <span style={{ marginLeft: '8px', color: '#0369a1' }}>
                  • Última asistencia: {usuarioEditando.ultima_asistencia_fecha} ({usuarioEditando.ultima_asistencia_lugar || 'Oficina'})
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUsuarioEditando(null)}
            disabled={guardando}
            style={{
              minWidth: '44px',
              minHeight: '44px',
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--text-muted, #94a3b8)'
            }}
          >
            ✕
          </button>
        </div>

        {mensajeFeedback && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '18px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: mensajeFeedback.tipo === 'exito' ? '#dcfce7' : '#fee2e2',
              color: mensajeFeedback.tipo === 'exito' ? '#15803d' : '#991b1b',
              border: `1px solid ${mensajeFeedback.tipo === 'exito' ? '#bbf7d0' : '#fecaca'}`
            }}
          >
            {mensajeFeedback.texto}
          </div>
        )}

        <form onSubmit={handleGuardarUsuario}>
          {!puedeEditar && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#e0e7ff', color: '#3730a3', fontSize: '13px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>👁️</span> Modo Solo Lectura (Rol Core). No posee permisos para modificar usuarios ni sueldos.
            </div>
          )}
          {soySubAdmin && usuarioEditando?.rol_app === 'admin' && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '13px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔒</span> Esta cuenta posee rol Administrador. Solo un Administrador puede modificarla.
            </div>
          )}
          {/* Sección 1: Datos Personales */}
          <div style={{ marginBottom: '22px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #334155)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              1. Datos Personales y de Acceso
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Primer Nombre <span style={{ color: '#cc3333' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  className="users-modal-input"
                  value={formDatos.primer_nombre}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, primer_nombre: e.target.value }))}
                  disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Apellido <span style={{ color: '#cc3333' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  className="users-modal-input"
                  value={formDatos.apellido}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, apellido: e.target.value }))}
                  disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  DNI <span style={{ color: '#cc3333' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  className="users-modal-input"
                  value={formDatos.dni}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, dni: e.target.value }))}
                  disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Email / Correo <span style={{ color: '#cc3333' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  className="users-modal-input"
                  value={formDatos.email}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, email: e.target.value }))}
                  disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                />
              </div>
            </div>
          </div>

          {/* Sección 2: Perfil Operativo y RBAC */}
          <div style={{ marginBottom: '22px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #334155)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              2. Perfil Operativo y Rol
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Área
                </label>
                <select
                  className="users-modal-select"
                  value={formDatos.area}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, area: e.target.value }))}
                  disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                >
                  {AREAS_SISTEMA.map(a => (
                    <option key={a.codigo} value={a.codigo}>{a.etiqueta}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Rol en Aplicación
                </label>
                <select
                  className="users-modal-select"
                  value={formDatos.rol_app}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, rol_app: e.target.value }))}
                  disabled={guardando || !soyAdmin}
                  title={!soyAdmin ? "Solo un Administrador puede modificar los roles de usuario" : "Asignar rol"}
                >
                  <option value="user_1">User 1 (Técnico Campo)</option>
                  <option value="user_2">User 2 (Técnico Oficina)</option>
                  <option value="core">Core (Supervisión / Auditoría)</option>
                  <option value="sub_admin">Sub Admin (Gestión RRHH)</option>
                  <option value="admin" disabled={!soyAdmin}>Admin (Control Total)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Estado en el Sistema
                </label>
                <div style={{ height: '44px', display: 'flex', alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={formDatos.activo}
                      onChange={(e) => setFormDatos(prev => ({ ...prev, activo: e.target.checked }))}
                      disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                      style={{ width: '18px', height: '18px', accentColor: '#cc3333' }}
                    />
                    <span>{formDatos.activo ? 'Colaborador Activo' : 'Inactivo / Baja'}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Sección 3: Sueldo Base y Costos Diarios (app_rrhh.a_1_sueldos_base) */}
          <div className="users-modal-sueldos-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#cc3333', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                3. Sueldo Base Mensual y Valor Día
              </h4>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)' }}>app_rrhh.a_1_sueldos_base</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Sueldo Oficina ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0.00"
                  className="users-modal-input"
                  style={{ fontWeight: 700 }}
                  value={formDatos.sueldo_oficina}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, sueldo_oficina: e.target.value }))}
                  disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', marginTop: '4px' }}>
                  Valor día est.: <strong>{formatMoneda(estimacionDiaOficina)}</strong>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Sueldo Obra ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0.00"
                  className="users-modal-input"
                  style={{ fontWeight: 700 }}
                  value={formDatos.sueldo_obra}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, sueldo_obra: e.target.value }))}
                  disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', marginTop: '4px' }}>
                  Valor día est.: <strong>{formatMoneda(estimacionDiaObra)}</strong>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Modalidad de Liquidación
                </label>
                <select
                  className="users-modal-select"
                  value={formDatos.modalidad_calculo || 'base_30'}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, modalidad_calculo: e.target.value }))}
                  disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                >
                  <option value="base_30">Base 30 días (Sueldo mensual fijo)</option>
                  <option value="por_dia">Por día individual (Calendario real)</option>
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', marginTop: '4px' }}>
                  Cálculo mensual
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Lugar Habitual
                </label>
                <select
                  className="users-modal-select"
                  value={formDatos.lugar_habitual}
                  onChange={(e) => setFormDatos(prev => ({ ...prev, lugar_habitual: e.target.value }))}
                  disabled={guardando || !puedeEditar || (soySubAdmin && usuarioEditando?.rol_app === "admin")}
                >
                  <option value="oficina">Oficina</option>
                  <option value="obra">Obra / Campo</option>
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', marginTop: '4px' }}>
                  Modalidad preferente
                </div>
              </div>
            </div>

            <div className="users-modal-info-box">
              ℹ️ Al guardar, PostgreSQL actualiza automáticamente <code>costo_dia_ofi</code> y <code>costo_dia_obra</code> mediante columnas generadas e impacta los cálculos de liquidación.
            </div>
          </div>

          {/* Botones de acción */}
          <div className="users-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-subtle, #e2e8f0)', paddingTop: '16px' }}>
            <button
              type="button"
              onClick={() => setUsuarioEditando(null)}
              disabled={guardando}
              style={{
                minHeight: '44px',
                padding: '0 20px',
                borderRadius: '8px',
                border: '1px solid var(--border-input, #cbd5e1)',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Cancelar
            </button>
            {puedeEditar && !(soySubAdmin && usuarioEditando?.rol_app === 'admin') ? (
              <button
                type="submit"
                disabled={guardando}
                style={{
                  minHeight: '44px',
                  padding: '0 24px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#cc3333',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {guardando ? (modoCreacion ? 'Creando empleado...' : 'Guardando cambios...') : (modoCreacion ? 'Crear Empleado' : 'Guardar Cambios')}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );

  // Render condicional según tema RPG vs Light/Dark
  if (isRpg) {
    return (
      <div className="rpg-board-viewport rpg-other-history-viewport users-management-rpg-viewport">
        <div className="rpg-notice-board">
          <div className="rpg-iron-bracket top-left" />
          <div className="rpg-iron-bracket top-right" />
          <div className="rpg-iron-bracket bottom-left" />
          <div className="rpg-iron-bracket bottom-right" />

          <div className="rpg-curved-banner">
            <div className="rpg-banner-scroll-roll left" />
            <div className="rpg-banner-body">
              <div className="rpg-banner-heading-wrap">
                <div className="rpg-illuminated-box">👥</div>
                <h1 className="rpg-banner-main-title">REGISTRO MAYOR DE AVENTUREROS • GREMIO INGEAP</h1>
              </div>
              <span className="rpg-banner-subtitle">
                ROSTER DE PERSONAL • SOLDADAS, ASIGNACIONES Y RANGOS
              </span>
            </div>
            <div className="rpg-banner-scroll-roll right" />
          </div>

          <div className="view-content users-management-view rpg-other-history-content">
            {contenidoPrincipal}
          </div>
        </div>
        {modalEdicion}
      </div>
    );
  }

  return (
    <div className={`view-content users-management-view ${isDark ? 'dark-theme' : ''}`}>
      {contenidoPrincipal}
      {modalEdicion}
    </div>
  );
}
