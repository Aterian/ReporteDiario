import React from 'react';
import RpgTavernBoard from './RpgTavernBoard';
import { getTituloRpg } from '../utils/rpgTitles';
import { puedeAccederRoster, puedeVerHistorialOtros } from '../utils/permissions';

// [MOD-01] HomeView
export default function HomeView({
  usuario,
  tema,
  onNuevoReporte,
  onVerHistorial,
  onAvatarClick,
  onNuevoRoster,
  onHistorialRoster,
  onHistorialOtrosEmpleados
}) {
  if (tema === 'rpg') {
    return (
      <RpgTavernBoard
        usuario={usuario}
        onNuevoReporte={onNuevoReporte}
        onVerHistorial={onVerHistorial}
        onAvatarClick={onAvatarClick}
      />
    );
  }

  const isRpg = false;
  const puedeRoster = puedeAccederRoster(usuario);
  const puedeOtros = puedeVerHistorialOtros(usuario);
  const tieneModulosGestion = puedeRoster || puedeOtros;

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

              {/* Botón: Historial de Roster (Solo Justina Bertolozzi e Iván Valentin) */}
              {puedeRoster && (
                <button 
                  type="button" 
                  className="home-action-card card-roster-hist" 
                  onClick={onHistorialRoster}
                >
                  <div className="action-card-icon-box roster-hist-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <div className="action-card-content">
                    <span className="action-card-title">Historial de Roster</span>
                    <span className="action-card-desc">
                      Consultar turnos y descargar reporte .xlsx mensual en 3 hojas
                    </span>
                  </div>
                  <div className="action-card-arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              )}

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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
