// [MOD-09] Módulo de Gestión de Proyectos (Exclusivo Administradores)
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/apiBridge';
import { puedeGestionarProyectos } from '../utils/permissions';
import { AREAS_SISTEMA, getAreaInfo } from './UsersManagementView';

export default function ProjectsManagementView({ usuario, onVolver, tema }) {
  const isDark = tema === 'dark';
  const isRpg = tema === 'rpg';
  const esAutorizado = puedeGestionarProyectos(usuario);

  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroArea, setFiltroArea] = useState('TODAS');
  const [filtroEstado, setFiltroEstado] = useState('TODOS'); // 'TODOS' | 'ACTIVOS' | 'INACTIVOS'

  // Modal de creación / edición
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoCreacion, setModoCreacion] = useState(false);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState(null);
  const [formDatos, setFormDatos] = useState({
    id_servicio: '',
    id_proyecto: '',
    codificacion_serv: '',
    n_serv: '',
    responsable_des: '',
    area: 'I',
    url_des: '',
    activo: true
  });
  const [guardando, setGuardando] = useState(false);
  const [mensajeFeedback, setMensajeFeedback] = useState(null);

  const cargarProyectos = async () => {
    setCargando(true);
    try {
      const data = await api.obtenerProyectosAdmin(true);
      if (Array.isArray(data)) {
        setProyectos(data);
      }
    } catch (err) {
      console.error('Error al cargar proyectos:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (esAutorizado) {
      cargarProyectos();
    }
  }, [esAutorizado]);

  // Filtrado de proyectos
  const proyectosFiltrados = useMemo(() => {
    return proyectos.filter(p => {
      // Filtro de búsqueda
      if (busqueda) {
        const q = busqueda.toLowerCase().trim();
        const nom = (p.codificacion_serv || p.denominacion || '').toLowerCase();
        const resp = (p.responsable_des || '').toLowerCase();
        const nServ = String(p.n_serv || '').toLowerCase();
        const idProy = String(p.id_proyecto || '').toLowerCase();
        const area = (p.area || '').toLowerCase();
        if (!nom.includes(q) && !resp.includes(q) && !nServ.includes(q) && !idProy.includes(q) && !area.includes(q)) {
          return false;
        }
      }

      // Filtro de área
      if (filtroArea !== 'TODAS') {
        const areaInfo = getAreaInfo(p.area);
        if (areaInfo.codigo.toUpperCase() !== filtroArea.toUpperCase()) return false;
      }

      // Filtro de estado
      if (filtroEstado === 'ACTIVOS') {
        if (p.activo === false || p.activo === 0) return false;
      } else if (filtroEstado === 'INACTIVOS') {
        if (p.activo === true || p.activo === 1) return false;
      }

      return true;
    });
  }, [proyectos, busqueda, filtroArea, filtroEstado]);

  // Métricas de resumen
  const metricas = useMemo(() => {
    const total = proyectos.length;
    const activos = proyectos.filter(p => p.activo !== false && p.activo !== 0).length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [proyectos]);

  const abrirCreacion = () => {
    setModoCreacion(true);
    setProyectoSeleccionado(null);
    setFormDatos({
      id_servicio: '',
      id_proyecto: '',
      codificacion_serv: '',
      n_serv: '',
      responsable_des: '',
      area: 'I',
      url_des: '',
      activo: true
    });
    setMensajeFeedback(null);
    setModalAbierto(true);
  };

  const abrirEdicion = (p) => {
    setModoCreacion(false);
    setProyectoSeleccionado(p);
    const areaVal = getAreaInfo(p.area).codigo;
    setFormDatos({
      id_servicio: p.id_servicio || '',
      id_proyecto: p.id_proyecto || '',
      codificacion_serv: p.codificacion_serv || p.denominacion || '',
      n_serv: p.n_serv !== undefined && p.n_serv !== null ? String(p.n_serv) : '',
      responsable_des: p.responsable_des || '',
      area: areaVal !== '-' ? areaVal : 'I',
      url_des: p.url_des || '',
      activo: p.activo !== false && p.activo !== 0
    });
    setMensajeFeedback(null);
    setModalAbierto(true);
  };

  const handleGuardarProyecto = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setMensajeFeedback(null);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const idProyLimpio = formDatos.id_proyecto.trim();
    if (!uuidRegex.test(idProyLimpio)) {
      setMensajeFeedback({
        tipo: 'error',
        texto: 'El ID de Proyecto debe ser un UUID válido (ej. 10db06c6-7a6d-40a4-b168-66bca8a54e53).'
      });
      setGuardando(false);
      return;
    }

    try {
      const payload = {
        id_proyecto: idProyLimpio,
        codificacion_serv: formDatos.codificacion_serv.trim(),
        n_serv: formDatos.n_serv !== '' ? parseFloat(formDatos.n_serv) : null,
        responsable_des: formDatos.responsable_des.trim() || null,
        area: formDatos.area.trim() || null,
        url_des: formDatos.url_des.trim() || null,
        activo: Boolean(formDatos.activo)
      };

      if (!modoCreacion) {
        payload.id_servicio = formDatos.id_servicio;
      }

      const res = modoCreacion
        ? await api.crearProyecto(payload)
        : await api.actualizarProyecto(payload);

      if (res && res.exito) {
        setMensajeFeedback({
          tipo: 'exito',
          texto: modoCreacion
            ? `Proyecto "${payload.codificacion_serv}" creado exitosamente.`
            : `Proyecto "${payload.codificacion_serv}" actualizado correctamente.`
        });
        await cargarProyectos();
        window.dispatchEvent(new CustomEvent('catalogos-actualizados'));
        setTimeout(() => {
          setModalAbierto(false);
        }, 1200);
      } else {
        setMensajeFeedback({
          tipo: 'error',
          texto: res?.error || 'No se pudo guardar la información del proyecto.'
        });
      }
    } catch (err) {
      console.error('Error al procesar proyecto:', err);
      setMensajeFeedback({
        tipo: 'error',
        texto: 'Error de comunicación al procesar el proyecto.'
      });
    } finally {
      setGuardando(false);
    }
  };

  // Si no es admin, pantalla de acceso restringido
  if (!esAutorizado) {
    return (
      <div className="view-content" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', background: 'var(--bg-surface, #ffffff)', padding: '32px', borderRadius: '12px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: '#cc3333' }}>Acceso Exclusivo de Administrador</h2>
          <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '14px', marginBottom: '24px' }}>
            La gestión del catálogo de proyectos y servicios está reservada exclusivamente para el rol <strong>Admin</strong>.
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

  const contenido = (
    <>
      {/* Barra superior */}
      <div className="users-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
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
              <span style={{ color: '#cc3333' }}>📁</span>
              {isRpg ? 'Registro de Fortalezas y Misiones' : 'Módulo de Proyectos'}
            </h1>
          </div>
          <p className="users-view-subtitle" style={{ margin: '4px 0 0 56px', fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>
            Gestión de obras, servicios y proyectos corporativos (app_proyectos.b_1_proyectos_servicios).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={abrirCreacion}
            data-testid="btn-nuevo-proyecto"
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
            {isRpg ? 'Nueva Misión de Obra' : 'Nuevo Proyecto'}
          </button>

          <button
            type="button"
            onClick={cargarProyectos}
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

      {/* Tarjetas de Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--bg-surface, #ffffff)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase' }}>Total Proyectos</div>
          <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary, #0f172a)' }}>{metricas.total}</div>
        </div>
        <div style={{ background: 'var(--bg-surface, #ffffff)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border-subtle, #e2e8f0)', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#059669', textTransform: 'uppercase' }}>Proyectos Activos</div>
          <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: '#059669' }}>{metricas.activos}</div>
        </div>
        <div style={{ background: 'var(--bg-surface, #ffffff)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border-subtle, #e2e8f0)', borderLeft: '4px solid #94a3b8' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase' }}>Proyectos Inactivos</div>
          <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '4px', color: 'var(--text-secondary, #64748b)' }}>{metricas.inactivos}</div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="users-filters-bar" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '20px', background: 'var(--bg-surface, #ffffff)', padding: '14px 18px', borderRadius: '10px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
        <div style={{ flex: '1 1 280px' }}>
          <input
            type="text"
            className="users-search-input"
            placeholder="Buscar por código, denominación, responsable o ID..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ width: '100%', minHeight: '44px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--border-input, #cbd5e1)', background: 'var(--bg-input, #f8fafc)', color: 'inherit' }}
          />
        </div>

        <div style={{ flex: '0 0 180px' }}>
          <select
            className="users-filter-select"
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
            style={{ width: '100%', minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border-input, #cbd5e1)', background: 'var(--bg-input, #f8fafc)', color: 'inherit' }}
          >
            <option value="TODAS">Todas las Áreas</option>
            {AREAS_SISTEMA.map(a => (
              <option key={a.codigo} value={a.codigo}>{a.etiqueta}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '0 0 160px' }}>
          <select
            className="users-filter-select"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{ width: '100%', minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border-input, #cbd5e1)', background: 'var(--bg-input, #f8fafc)', color: 'inherit' }}
          >
            <option value="TODOS">Todos los Estados</option>
            <option value="ACTIVOS">Solo Activos</option>
            <option value="INACTIVOS">Solo Inactivos</option>
          </select>
        </div>
      </div>

      {/* Grilla / Listado de Proyectos */}
      {cargando ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px', width: '32px', height: '32px' }} />
          Cargando catálogo de proyectos...
        </div>
      ) : proyectosFiltrados.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', background: 'var(--bg-surface, #ffffff)', borderRadius: '10px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
          <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-secondary, #64748b)' }}>
            No se encontraron proyectos con los criterios de búsqueda seleccionados.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--bg-surface, #ffffff)', borderRadius: '10px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle, #f8fafc)', borderBottom: '1px solid var(--border-subtle, #e2e8f0)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '80px' }}>N° Serv</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Denominación / Codificación</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '110px' }}>Área</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '180px' }}>Responsable</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '100px' }}>Estado</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '100px', textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {proyectosFiltrados.map((p) => {
                const areaInfo = getAreaInfo(p.area);
                const esActivo = p.activo !== false && p.activo !== 0;
                return (
                  <tr key={p.id_servicio} style={{ borderBottom: '1px solid var(--border-subtle, #e2e8f0)', opacity: esActivo ? 1 : 0.65 }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-secondary, #64748b)' }}>
                      {p.n_serv ? `#${p.n_serv}` : '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                        {p.codificacion_serv || p.denominacion || 'Sin denominación'}
                      </div>
                      <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary, #64748b)', marginTop: '2px' }}>
                        ID: {p.id_proyecto}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#cc333315',
                        color: '#cc3333'
                      }}>
                        {areaInfo.etiqueta}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary, #475569)' }}>
                      {p.responsable_des || '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: esActivo ? '#dcfce7' : '#f1f5f9',
                        color: esActivo ? '#166534' : '#64748b'
                      }}>
                        {esActivo ? '✓ Activo' : '✕ Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => abrirEdicion(p)}
                        style={{
                          minHeight: '34px',
                          padding: '0 14px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-input, #cbd5e1)',
                          background: 'var(--bg-surface, #ffffff)',
                          color: 'var(--text-primary, #0f172a)',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Creación / Edición */}
      {modalAbierto && (
        <div className="users-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '640px', background: 'var(--bg-surface, #ffffff)', borderRadius: '12px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                {modoCreacion ? '➕ Alta de Nuevo Proyecto' : '✏️ Editar Proyecto'}
              </h3>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                disabled={guardando}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary, #64748b)' }}
              >
                ✕
              </button>
            </div>

            {mensajeFeedback && (
              <div style={{
                padding: '12px 14px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '13px',
                fontWeight: 600,
                background: mensajeFeedback.tipo === 'exito' ? '#dcfce7' : '#fee2e2',
                color: mensajeFeedback.tipo === 'exito' ? '#166534' : '#991b1b',
                border: `1px solid ${mensajeFeedback.tipo === 'exito' ? '#bbf7d0' : '#fecaca'}`
              }}>
                {mensajeFeedback.texto}
              </div>
            )}

            <form onSubmit={handleGuardarProyecto}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    ID de Proyecto (UUID Canónico) <span style={{ color: '#cc3333' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="users-modal-input"
                    style={{ width: '100%', minHeight: '40px', padding: '0 12px', borderRadius: '6px', border: '1px solid var(--border-input, #cbd5e1)', fontFamily: 'monospace', fontSize: '12px' }}
                    value={formDatos.id_proyecto}
                    onChange={(e) => setFormDatos(prev => ({ ...prev, id_proyecto: e.target.value }))}
                    disabled={guardando}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', marginTop: '4px' }}>
                    Identificador único establecido por el administrador para vincular con turnos y asistencias.
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Denominación / Codificación del Servicio <span style={{ color: '#cc3333' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. 318-SF-I-932-SM VMOS - Río Negro - Milicic"
                    className="users-modal-input"
                    style={{ width: '100%', minHeight: '40px', padding: '0 12px', borderRadius: '6px', border: '1px solid var(--border-input, #cbd5e1)' }}
                    value={formDatos.codificacion_serv}
                    onChange={(e) => setFormDatos(prev => ({ ...prev, codificacion_serv: e.target.value }))}
                    disabled={guardando}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Número de Servicio (n_serv)
                  </label>
                  <input
                    type="number"
                    placeholder="Ej. 318"
                    className="users-modal-input"
                    style={{ width: '100%', minHeight: '40px', padding: '0 12px', borderRadius: '6px', border: '1px solid var(--border-input, #cbd5e1)' }}
                    value={formDatos.n_serv}
                    onChange={(e) => setFormDatos(prev => ({ ...prev, n_serv: e.target.value }))}
                    disabled={guardando}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Área Asignada
                  </label>
                  <select
                    className="users-modal-select"
                    style={{ width: '100%', minHeight: '40px', padding: '0 12px', borderRadius: '6px', border: '1px solid var(--border-input, #cbd5e1)', background: 'var(--bg-input, #f8fafc)' }}
                    value={formDatos.area}
                    onChange={(e) => setFormDatos(prev => ({ ...prev, area: e.target.value }))}
                    disabled={guardando}
                  >
                    {AREAS_SISTEMA.map(a => (
                      <option key={a.codigo} value={a.codigo}>{a.etiqueta}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Responsable del Proyecto
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Sergio Juarez"
                    className="users-modal-input"
                    style={{ width: '100%', minHeight: '40px', padding: '0 12px', borderRadius: '6px', border: '1px solid var(--border-input, #cbd5e1)' }}
                    value={formDatos.responsable_des}
                    onChange={(e) => setFormDatos(prev => ({ ...prev, responsable_des: e.target.value }))}
                    disabled={guardando}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    URL Documentación / Sistema
                  </label>
                  <input
                    type="text"
                    placeholder="https://..."
                    className="users-modal-input"
                    style={{ width: '100%', minHeight: '40px', padding: '0 12px', borderRadius: '6px', border: '1px solid var(--border-input, #cbd5e1)' }}
                    value={formDatos.url_des}
                    onChange={(e) => setFormDatos(prev => ({ ...prev, url_des: e.target.value }))}
                    disabled={guardando}
                  />
                </div>

                <div style={{ gridColumn: 'span 2', marginTop: '6px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={formDatos.activo}
                      onChange={(e) => setFormDatos(prev => ({ ...prev, activo: e.target.checked }))}
                      disabled={guardando}
                      style={{ width: '18px', height: '18px', accentColor: '#cc3333' }}
                    />
                    <span>Proyecto Activo (Disponible para imputación de horas)</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-subtle, #e2e8f0)', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  disabled={guardando}
                  style={{
                    minHeight: '44px',
                    padding: '0 20px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-input, #cbd5e1)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
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
                  {guardando ? 'Guardando...' : (modoCreacion ? 'Crear Proyecto' : 'Guardar Cambios')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

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
                <div className="rpg-illuminated-box">📁</div>
                <h1 className="rpg-banner-main-title">REGISTRO DE MISIONES Y FORTALEZAS (PROYECTOS)</h1>
              </div>
              <span className="rpg-banner-subtitle">CATÁLOGO Y ASIGNACIÓN DE OBRAS DEL GREMIO</span>
            </div>
            <div className="rpg-banner-scroll-roll right" />
          </div>
          <div className="view-content users-management-view rpg-other-history-content">
            {contenido}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-content users-management-view" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {contenido}
    </div>
  );
}

