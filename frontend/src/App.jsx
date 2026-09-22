import React, { useState, useEffect, useRef } from 'react';
import { api } from './services/apiBridge';
import logoIngeap from './assets/Logo_Ingeap1.png';
import LoginView from './components/LoginView';
import HomeView from './components/HomeView';
import CheckForm from './components/CheckForm';
import HistoryView from './components/HistoryView';
import OtherEmployeesHistoryView from './components/OtherEmployeesHistoryView';
import RosterView from './components/RosterView';
import RosterHistoryView from './components/RosterHistoryView';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [usuario, setUsuario] = useState(null);
  const [vistaActiva, setVistaActiva] = useState('home'); // 'home' | 'check' | 'historial' | 'historial-otros' | 'roster' | 'historial-roster'
  const [recordatorioPendiente, setRecordatorioPendiente] = useState(null);
  const [actualizacion, setActualizacion] = useState(null);
  const [actualizando, setActualizando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [toastRefresco, setToastRefresco] = useState(null);
  const fileInputRef = useRef(null);

  const [tema, setTema] = useState(() => {
    return localStorage.getItem('ingeap_theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('ingeap_theme', tema);
  }, [tema]);

  const esUsuarioApp = Boolean(
    usuario && (
      (usuario.area || '').trim().toUpperCase() === 'A' ||
      (usuario.nombre || '').toLowerCase().includes('iván') ||
      (usuario.nombre || '').toLowerCase().includes('ivan')
    )
  );

  const toggleTema = () => {
    if (esUsuarioApp) {
      setTema(prev => {
        if (prev === 'light') return 'dark';
        if (prev === 'dark') return 'rpg';
        return 'light';
      });
    } else {
      setTema(prev => (prev === 'dark' ? 'light' : 'dark'));
    }
  };

  useEffect(() => {
    let montado = true;
    async function verificarSesion() {
      try {
        const res = await api.obtenerEstadoSesion();
        if (montado && res && res.logueado && res.usuario) {
          setUsuario(res.usuario);
        }
      } catch (err) {
        console.error('Error verificando sesión:', err);
      } finally {
        if (montado) setCargandoSesion(false);
      }
    }
    verificarSesion();
    return () => {
      montado = false;
    };
  }, []);

  // Verificar si el usuario activo ya completó el registro de hoy al iniciar o iniciar sesión
  useEffect(() => {
    if (!usuario) return;
    let activo = true;
    async function chequearRegistroHoy() {
      try {
        const res = await api.verificarRegistroHoy();
        if (activo && res && !res.registrado) {
          setRecordatorioPendiente({
            tipo: 'inicio',
            mensaje: 'Buenos días, ¡recordá registrar tu jornada antes de que finalice el día!'
          });
        }
      } catch (err) {
        console.error('Error al chequear registro de hoy:', err);
      }
    }
    chequearRegistroHoy();
    return () => {
      activo = false;
    };
  }, [usuario]);

  // Escuchar señal de recordatorio enviada a las 16:30 desde Python
  useEffect(() => {
    window.dispararAlertaRecordatorio = (tipo) => {
      setRecordatorioPendiente({
        tipo: '16:30',
        mensaje: 'Son las 16:30 hs. ¡No olvides completar tu registro diario antes de retirarte!'
      });
    };
    return () => {
      delete window.dispararAlertaRecordatorio;
    };
  }, []);

  // Comprobar si hay actualizaciones disponibles en segundo plano
  useEffect(() => {
    let activo = true;
    async function comprobarUpdate() {
      try {
        const res = await api.verificarActualizacion();
        if (activo && res && res.actualizacion_disponible) {
          setActualizacion(res);
        }
      } catch (err) {
        // Silencioso si no hay conexión o no está configurado
      }
    }
    comprobarUpdate();
    return () => {
      activo = false;
    };
  }, []);

  const handleActualizar = async () => {
    if (!actualizacion?.url_descarga) return;
    setActualizando(true);
    try {
      const res = await api.aplicarActualizacion(actualizacion.url_descarga);
      if (res && !res.exito) {
        alert('No se pudo aplicar la actualización: ' + (res.error || 'Error desconocido'));
        setActualizando(false);
      }
    } catch (err) {
      alert('Error al actualizar: ' + err.message);
      setActualizando(false);
    }
  };

  const handleCerrarSesion = async () => {
    try {
      await api.cerrarSesion();
      setUsuario(null);
      setRecordatorioPendiente(null);
      setVistaActiva('home');
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };


  const handleMinimizar = async () => {
    try {
      await api.minimizar();
    } catch (err) {
      console.error('Error al minimizar:', err);
    }
  };

  const handleRefrescarCatalogos = async () => {
    if (refrescando) return;
    setRefrescando(true);
    setToastRefresco({ tipo: 'cargando', mensaje: 'Sincronizando información de Google Sheets...' });
    try {
      const res = await api.refrescarCatalogos();
      if (res && res.exito) {
        setToastRefresco({ tipo: 'exito', mensaje: res.mensaje || 'Información actualizada correctamente.' });
        window.dispatchEvent(new CustomEvent('catalogos-actualizados'));
      } else {
        setToastRefresco({ tipo: 'error', mensaje: res?.error || 'Error al actualizar desde Google Sheets.' });
      }
    } catch (err) {
      setToastRefresco({ tipo: 'error', mensaje: 'Error de red al actualizar desde Google Sheets.' });
    } finally {
      setRefrescando(false);
      setTimeout(() => setToastRefresco(null), 4000);
    }
  };

  // Manejo del selector de avatar
  const handleTriggerAvatar = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleAvatarFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Verificar que sea una imagen
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result;
      if (typeof base64 === 'string') {
        // Actualizar estado local inmediatamente
        setUsuario(prev => ({ ...prev, avatar: base64 }));
        // Persistir en SQLite
        try {
          await api.guardarAvatar(base64);
        } catch (err) {
          console.error('Error guardando avatar:', err);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const getIniciales = (nombre) => {
    if (!nombre) return 'IN';
    const partes = nombre.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  };

  if (cargandoSesion) {
    return (
      <div className="app-container">
        <div className="loading-screen">
          <div className="spinner" style={{ width: '32px', height: '32px' }} />
          <p>Iniciando Check Diario...</p>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="app-container">
        <LoginView onLoginSuccess={(u) => { setUsuario(u); setVistaActiva('home'); }} tema={tema} onToggleTema={toggleTema} />
      </div>
    );
  }

  return (
    <div className={`app-container ${['roster', 'historial-roster', 'historial', 'historial-otros'].includes(vistaActiva) ? 'app-panoramic' : ''}`}>
      {/* Input oculto para abrir el explorador de Windows al elegir avatar */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        style={{ display: 'none' }}
        onChange={handleAvatarFileSelected}
      />

      {/* Barra superior / Header */}
      <header className="app-header">
        <div className="user-profile">
          <img 
            src={logoIngeap} 
            alt="Ingeap" 
            className="header-brand-logo" 
            onClick={() => setVistaActiva('home')}
            style={{ cursor: 'pointer' }}
            title="Ir al Inicio"
          />

          <div 
            className="user-avatar-header" 
            onClick={handleTriggerAvatar} 
            title="Clic para cambiar tu avatar"
          >
            {usuario.avatar ? (
              <img src={usuario.avatar} alt={usuario.nombre} className="user-avatar-header-img" />
            ) : (
              <div className="user-avatar">
                {getIniciales(usuario.nombre)}
              </div>
            )}
            <div className="avatar-header-edit-icon">✎</div>
          </div>

          <div className="user-info">
            <span className="user-name">{usuario.nombre}</span>
            <span className="user-dni">
              {usuario.mail ? usuario.mail : `DNI: ${usuario.dni}`}
            </span>
          </div>
        </div>

        <div className="header-actions">
          {/* Botón Refrescar catálogos de Google Sheets */}
          <button
            type="button"
            className={`btn-header-icon ${refrescando ? 'btn-refresh-spinning' : ''}`}
            onClick={handleRefrescarCatalogos}
            disabled={refrescando}
            title="Refrescar proyectos, empleados y feriados desde Google Sheets"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>

          {/* Botón selector de Tema (Claro / Oscuro / RPG Quest para Área A) */}
          <button
            type="button"
            className={`btn-header-icon ${tema === 'rpg' ? 'btn-header-rpg' : ''}`}
            onClick={toggleTema}
            title={
              tema === 'light'
                ? 'Cambiar a Tema Oscuro'
                : tema === 'dark'
                ? (esUsuarioApp ? 'Cambiar a Modo Aventura RPG (Quest)' : 'Cambiar a Tema Claro')
                : 'Cambiar a Tema Claro'
            }
          >
            {tema === 'rpg' ? (
              <span style={{ fontSize: '13px', lineHeight: 1 }} title="Modo Aventura RPG">⚔️</span>
            ) : tema === 'dark' ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="btn-header-icon"
            onClick={handleMinimizar}
            title="Minimizar a la bandeja del sistema"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <button
            type="button"
            className="btn-logout"
            onClick={handleCerrarSesion}
            title="Cerrar sesión de este equipo"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Salir
          </button>
        </div>
      </header>

      {/* Cartel flotante de refresco de catálogos */}
      {toastRefresco && (
        <div className={`refresh-toast-banner ${toastRefresco.tipo}`}>
          <span>{toastRefresco.mensaje}</span>
          <button type="button" onClick={() => setToastRefresco(null)}>✕</button>
        </div>
      )}

      {/* Cartel de Actualización Disponible */}
      {actualizacion && (
        <div className="update-banner">
          <div className="update-content">
            <div className="update-title">
              <span>🚀</span> Actualización disponible: v{actualizacion.version_nueva}
            </div>
            <div className="update-notes">
              {actualizacion.notas || 'Nueva versión con mejoras'}
            </div>
          </div>
          <button
            type="button"
            className="btn-update"
            disabled={actualizando}
            onClick={handleActualizar}
          >
            {actualizando ? 'Descargando...' : 'Actualizar'}
          </button>
        </div>
      )}

      {/* Cartel / Pop-up de Recordatorio de Registro Diario */}
      {recordatorioPendiente && vistaActiva !== 'check' && (
        <div className={`reminder-banner ${recordatorioPendiente.tipo === '16:30' ? 'reminder-alert' : 'reminder-normal'}`}>
          <div className="reminder-text">
            <span className="reminder-icon">
              {recordatorioPendiente.tipo === '16:30' ? '⏰' : '☀️'}
            </span>
            <span>{recordatorioPendiente.mensaje}</span>
          </div>
          <div className="reminder-actions">
            <button
              type="button"
              className="reminder-btn"
              onClick={() => {
                setVistaActiva('check');
                setRecordatorioPendiente(null);
              }}
            >
              Hacer Check
            </button>
            <button
              type="button"
              className="reminder-close"
              onClick={() => setRecordatorioPendiente(null)}
              title="Cerrar recordatorio"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Navegación por vistas protegida con ErrorBoundary */}
      <ErrorBoundary onReset={() => setVistaActiva('home')}>
        {vistaActiva === 'home' && (
          <HomeView
            usuario={usuario}
            tema={tema}
            onNuevoReporte={() => setVistaActiva('check')}
            onVerHistorial={() => setVistaActiva('historial')}
            onNuevoRoster={() => setVistaActiva('roster')}
            onHistorialRoster={() => setVistaActiva('historial-roster')}
            onHistorialOtrosEmpleados={() => setVistaActiva('historial-otros')}
            onAvatarClick={handleTriggerAvatar}
          />
        )}

        {vistaActiva === 'check' && (
          <CheckForm
            tema={tema}
            onRegistroGuardado={() => setRecordatorioPendiente(null)}
            onVolver={() => setVistaActiva('home')}
          />
        )}

        {vistaActiva === 'historial' && (
          <HistoryView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
            onNuevoReporte={() => setVistaActiva('check')}
            onHistorialOtrosEmpleados={() => setVistaActiva('historial-otros')}
          />
        )}

        {vistaActiva === 'historial-otros' && (
          <OtherEmployeesHistoryView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
            onVerMiHistorial={() => setVistaActiva('historial')}
            onNuevoReporte={() => setVistaActiva('check')}
          />
        )}

        {vistaActiva === 'roster' && (
          <RosterView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
          />
        )}

        {vistaActiva === 'historial-roster' && (
          <RosterHistoryView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
            onNuevoRoster={() => setVistaActiva('roster')}
          />
        )}
      </ErrorBoundary>
    </div>
  );
}
