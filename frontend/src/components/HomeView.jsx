import React from 'react';
import RpgTavernBoard from './RpgTavernBoard';
import DailyStatusWidget from './DailyStatusWidget';
import { getTituloRpg } from '../utils/rpgTitles';
import { 
  puedeAccederRoster, 
  puedeVerHistorialOtros, 
  puedeVerModificaciones, 
  puedeVerActividadAyer, 
  getEtiquetaRol, 
  puedeGestionarUsuarios,
  puedeGestionarProyectos,
  esAdmin
} from '../utils/permissions';
import { toast } from 'sonner';

// [MOD-01] HomeView
export default function HomeView({
  usuario,
  tema,
  onNuevoReporte,
  onVerHistorial,
  onAvatarClick,
  onNuevoRoster,
  onHistorialRoster,
  onHistorialOtrosEmpleados,
  onGestionUsuarios,
  onGestionProyectos,
  erroresRemotos = [],
  onVerErroresRemotos,
  notificacionesModificaciones = [],
  onIrACalendarioModificacion,
  onDescartarNotificacion
}) {
  if (tema === 'rpg') {
    return (
      <RpgTavernBoard
        usuario={usuario}
        onNuevoReporte={onNuevoReporte}
        onVerHistorial={onVerHistorial}
        onAvatarClick={onAvatarClick}
        onHistorialOtrosEmpleados={onHistorialOtrosEmpleados}
        onNuevoRoster={onNuevoRoster}
        onHistorialRoster={onHistorialRoster}
        onGestionUsuarios={onGestionUsuarios}
        onGestionProyectos={onGestionProyectos}
      />
    );
  }

  const isRpg = false;
  const areaUpper = (usuario?.area || '').toUpperCase().trim();
  const puedeRoster = puedeAccederRoster(usuario);
  const puedeOtros = puedeVerHistorialOtros(usuario);
  const puedeVerAyer = puedeVerActividadAyer(usuario);
  const puedeVerModif = puedeVerModificaciones(usuario);
  const puedeGestionar = puedeGestionarUsuarios(usuario);
  const puedeProyectos = puedeGestionarProyectos(usuario);
  const tieneModulosGestion = puedeRoster || puedeOtros || puedeVerAyer || puedeGestionar || puedeProyectos;

  const getFechaFormateada = () => {
    const hoy = new Date();
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const str = hoy.toLocaleDateString('es-AR', opciones);
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getIniciales = (nombre) => {
    if (!nombre) return 'IN';
    const partes = nombre.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  const getNombreArea = (areaCod) => {
    if (!areaCod) return '';
    const cod = areaCod.trim().toUpperCase();
    const mapa = {
      'N': 'Núcleo (Todos los proyectos)',
      'I': 'Ingeniería',
      'M': 'Mensura',
      'A': 'Aplicaciones',
      'RRHH': 'Recursos Humanos',
      'VYM': 'Ventas y Marketing',
      'S': 'SIG'
    };
    return mapa[cod] || `Área ${cod}`;
  };

  return (
    <div className={`view-content home-container ${isRpg ? 'rpg-home' : ''}`}>
      {/* Tarjeta de bienvenida del empleado */}
      <div className="home-profile-card">
        <div className="home-profile-main">
          <div 
            className="home-avatar-wrapper" 
            onClick={onAvatarClick} 
            title="Haz clic para cambiar foto de perfil"
          >
            {usuario.avatar ? (
              <img src={usuario.avatar} alt={usuario.nombre} className="home-avatar-img" />
            ) : (
              <div className="home-avatar-placeholder">
                {getIniciales(usuario.nombre)}
              </div>
            )}
            <div className="avatar-edit-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
          </div>

          <div className="home-profile-details">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="home-welcome-text">
                {isRpg ? '⚔️ Héroe del Gremio' : 'Bienvenido'}
              </span>
              {usuario.area && (
                <span className="home-area-chip">
                  {isRpg ? `${getTituloRpg(usuario.nombre)} (Nv. 42)` : getNombreArea(usuario.area)}
                </span>
              )}
              {!isRpg && (
                <span className="home-area-chip" style={{ background: '#cc333315', color: '#cc3333', borderColor: '#cc333335', fontWeight: 600 }}>
                  {getEtiquetaRol(usuario).badge}
                </span>
              )}
            </div>
            <h2 className="home-employee-name">{usuario.nombre}</h2>
            {usuario.mail && (
              <span className="home-employee-mail">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                {usuario.mail}
              </span>
            )}
          </div>
        </div>

        <div className="home-date-chip">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {getFechaFormateada()}
        </div>
      </div>

      {/* Contenedor de módulos (registro propio y gestión/supervisión en 2 bloques verticales en pantalla completa) */}
      <div className={`home-sections-container ${tieneModulosGestion ? 'has-rrhh' : ''}`}>
        {/* Bloque 1: Registro propio del colaborador */}
        <div className="home-section-column home-column-propio">
          <div className="home-actions-title">
            {isRpg ? '¿Qué gran hazaña emprenderás hoy?' : '¿Qué deseas hacer hoy?'}
          </div>

          <div className="home-actions-grid">
            {/* Botón 1: Nuevo Reporte / Nueva Misión */}
            <button 
              type="button" 
              className="home-action-card card-primary" 
              onClick={onNuevoReporte}
            >
              <div className="action-card-icon-box">
                {isRpg ? (
                  <span style={{ fontSize: '20px' }}>📜</span>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                )}
              </div>
              <div className="action-card-content">
                <span className="action-card-title">
                  {isRpg ? '📜 Aceptar Nueva Misión Diaria' : 'Cargar Nuevo Reporte'}
                </span>
                <span className="action-card-desc">
                  {isRpg ? 'Registra tus hazañas, proyectos y horas completadas (+EXP)' : 'Registra tus proyectos activos, jornada y ubicación'}
                </span>
              </div>
              <div className="action-card-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>

            {/* Botón 2: Ver Historial / Crónicas */}
            <button 
              type="button" 
              className="home-action-card card-secondary" 
              onClick={onVerHistorial}
            >
              <div className="action-card-icon-box secondary">
                {isRpg ? (
                  <span style={{ fontSize: '20px' }}>📖</span>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 14 14" />
                  </svg>
                )}
              </div>
              <div className="action-card-content">
                <span className="action-card-title">
                  {isRpg ? '📖 Tomo de Crónicas (Historial)' : 'Ver Historial de Registros'}
                </span>
                <span className="action-card-desc">
                  {isRpg ? 'Revisa el pergamino de misiones y botines sellados' : 'Consulta los reportes y horas enviadas'}
                </span>
              </div>
              <div className="action-card-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>

            {/* [FN-06.10] Botón 3: Buzón de sugerencias / Participación y Consulta */}
            <button 
              type="button" 
              className="home-action-card card-suggestions" 
              onClick={() => {
                toast.info('Próximamente.', {
                  description: 'El módulo de Buzón de sugerencias / Participación y Consulta se encuentra en etapa de planificación.',
                  duration: 4000
                });
              }}
              style={{ borderLeft: '4px solid #a855f7' }}
            >
              <div className="action-card-icon-box" style={{ background: '#f3e8ff', color: '#9333ea' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M8 9h8M8 13h5" />
                </svg>
              </div>
              <div className="action-card-content">
                <span className="action-card-title">Buzón de sugerencias / Participación y Consulta</span>
                <span className="action-card-desc">
                  Canal de propuestas, retroalimentación e inquietudes de los colaboradores
                </span>
              </div>
              <div className="action-card-arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          </div>

          <div className="home-quick-info">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>
              {isRpg
                ? '🏆 Cada misión sellada alimenta el poder del Gremio Ingeap y aumenta tu rango.'
                : 'Al guardar un nuevo reporte, volverás automáticamente a esta pantalla.'}
            </span>
          </div>
        </div>

        {/* Bloque 2: Gestión y Supervisión (Roster exclusivo Justina e Iván; Historial de otros RRHH, Núcleo e Iván) */}
        {tieneModulosGestion && (
          <div className="home-section-column home-column-rrhh">
            <div className="home-actions-title rrhh-title-divider">
              {puedeRoster ? 'Gestión de RRHH - Rosters y Turnos' : 'Supervisión y Gestión de Equipo'}
            </div>
            <div className="home-actions-grid rrhh-actions-grid">
              {/* Botón: Cargar Nuevo Roster (Solo Justina Bertolozzi e Iván Valentin) */}
              {puedeRoster && (
                <button 
                  type="button" 
                  className="home-action-card card-roster" 
                  onClick={onNuevoRoster}
                >
                  <div className="action-card-icon-box roster-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
                    </svg>
                  </div>
                  <div className="action-card-content">
                    <span className="action-card-title">Cargar Nuevo Roster</span>
                    <span className="action-card-desc">
                      Asignación de turnos, obra, francos y tarifas con calendario Gantt
                    </span>
                  </div>
                  <div className="action-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              )}

              {/* Botón: Historial de Roster oculto por estar en desuso */}
              {/* {puedeRoster && (
                <button 
                  type="button" 
                  className="home-action-card card-roster-hist" 
                  onClick={onHistorialRoster}
                >
                  ...
                </button>
              )} */}

              {/* Botón: Historial de otros empleados (RRHH, Núcleo e Iván Valentin) */}
              {puedeOtros && (
                <button 
                  type="button" 
                  className="home-action-card card-other-hist" 
                  onClick={onHistorialOtrosEmpleados}
                >
                  <div className="action-card-icon-box other-hist-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className="action-card-content">
                    <span className="action-card-title">Historial de otros empleados</span>
                    <span className="action-card-desc">
                      Supervisión y auditoría de reportes cargados para colaboradores
                    </span>
                  </div>
                  <div className="action-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              )}

              {/* Botón: Módulo de Empleados (Solo Admin, SubAdmin y Core) */}
              {puedeGestionar && (
                <button 
                  type="button" 
                  className="home-action-card card-users-mgmt" 
                  onClick={onGestionUsuarios}
                  style={{ borderLeft: '4px solid #cc3333' }}
                >
                  <div className="action-card-icon-box" style={{ background: '#fee2e2', color: '#cc3333' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className="action-card-content">
                    <span className="action-card-title">Empleados</span>
                    <span className="action-card-desc">
                      Visualización y edición de personal, área, lugar habitual, sueldo base y última asistencia
                    </span>
                  </div>
                  <div className="action-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              )}

              {/* [FN-07.22] Botón: Módulo de Proyectos (Exclusivo Administrador) */}
              {puedeProyectos && (
                <button 
                  type="button" 
                  className="home-action-card card-projects-mgmt" 
                  onClick={onGestionProyectos}
                  style={{ borderLeft: '4px solid #0284c7' }}
                >
                  <div className="action-card-icon-box" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  <div className="action-card-content">
                    <span className="action-card-title">Proyectos</span>
                    <span className="action-card-desc">
                      Catálogo integral de obras, codificación de servicios, áreas y estados operativos
                    </span>
                  </div>
                  <div className="action-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              )}
            </div>

            {/* [FN-07.21] Alerta de Errores Remotos del Sistema (Exclusivo Administrador) */}
            {esAdmin(usuario) && erroresRemotos && erroresRemotos.length > 0 && (
              <div className="home-modificaciones-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)' }}>
                <div className="home-mod-card-header">
                  <div className="home-mod-card-title" style={{ color: '#ef4444' }}>
                    <span className="home-mod-bell">🚨</span>
                    <span>Errores Remotos Detectados</span>
                    <span className="home-mod-count-pill" style={{ background: '#ef4444', color: '#ffffff' }}>
                      {erroresRemotos.length}
                    </span>
                  </div>
                  <span className="home-mod-subtitle" style={{ color: '#f87171' }}>
                    Fallos no controlados registrados en equipos de usuarios
                  </span>
                </div>
                <div style={{ padding: '0 16px 14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                    Último reporte: <b>{erroresRemotos[0].usuario_nombre || erroresRemotos[0].nombre_usuario}</b> ({erroresRemotos[0].codigo_error || 'ERROR'})
                  </div>
                  <button
                    type="button"
                    className="btn-home-mod-view"
                    onClick={onVerErroresRemotos}
                    style={{ background: '#ef4444', color: '#ffffff', borderColor: '#dc2626' }}
                  >
                    Auditar Fallos ➔
                  </button>
                </div>
              </div>
            )}

            {/* [FN-02.02] Alerta y avisos de modificaciones pendientes (Exclusivo Justina Bertolozzi e Iván Valentin) */}
            {puedeVerModif && notificacionesModificaciones && notificacionesModificaciones.length > 0 && (
              <div className="home-modificaciones-card">
                <div className="home-mod-card-header">
                  <div className="home-mod-card-title">
                    <span className="home-mod-bell">🔔</span>
                    <span>Modificaciones pendientes de revisión</span>
                    <span className="home-mod-count-pill">{notificacionesModificaciones.length}</span>
                  </div>
                  <span className="home-mod-subtitle">Cambios realizados por colaboradores</span>
                </div>
                <div className="home-mod-items-list">
                  {notificacionesModificaciones.slice(0, 3).map((item) => (
                    <div key={item.id_modificacion} className="home-mod-item">
                      <div className="home-mod-item-main">
                        <div className="home-mod-item-top">
                          <span className="home-mod-emp">{item.empleado}</span>
                          <span className="home-mod-fecha">{item.fecha}</span>
                        </div>
                        <div className="home-mod-diff-row">
                          <span className="home-mod-diff-tag">
                            {item.tipo_antes || 'Sin asignar'} ({item.horas_antes || 0}hs) ➔ {item.tipo_despues} ({item.horas_despues || 0}hs)
                          </span>
                          {item.quien_modifica && (
                            <span className="home-mod-author">• Por {item.quien_modifica}</span>
                          )}
                        </div>
                      </div>
                      <div className="home-mod-item-actions">
                        <button
                          type="button"
                          className="btn-home-mod-view"
                          onClick={() => onIrACalendarioModificacion && onIrACalendarioModificacion(item)}
                          title="Abrir directamente en el calendario del empleado"
                        >
                          Ver en calendario ➔
                        </button>
                        <button
                          type="button"
                          className="btn-home-mod-check"
                          onClick={() => onDescartarNotificacion && onDescartarNotificacion(item.id_modificacion)}
                          title="Marcar como revisado"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* [FN-06.05] Widget de Actividad de ayer (Exclusivo Núcleo, Aplicaciones y Justina Bertolozzi) */}
            {puedeVerAyer && (
              <DailyStatusWidget usuario={usuario} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
