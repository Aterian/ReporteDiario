import React, { useState, useEffect, useRef } from 'react';
import { api } from './services/apiBridge';
import { queryClient } from './services/queryClient';
import logoIngeap from './assets/Logo_Ingeap1.png';
import LoginView from './components/LoginView';
import HomeView from './components/HomeView';
import CheckForm from './components/CheckForm';
import HistoryView from './components/HistoryView';
import OtherEmployeesHistoryView from './components/OtherEmployeesHistoryView';
import RosterView from './components/RosterView';
import RosterHistoryView from './components/RosterHistoryView';
import UsersManagementView from './components/UsersManagementView';
import ProjectsManagementView from './components/ProjectsManagementView';
import SuggestionForm from './components/SuggestionForm';
import SuggestionsManagementView from './components/SuggestionsManagementView';
import RemoteErrorsView from './components/RemoteErrorsView';
import RemoteErrorsModal from './components/RemoteErrorsModal';
import { ErrorBoundary } from 'react-error-boundary';
import ErrorFallback from './components/ErrorFallback';
import { Toaster, toast } from 'sonner';
import { puedeAccederRoster, puedeVerHistorialOtros, puedeVerModificaciones, esAreaAplicaciones, puedeGestionarUsuarios, puedeGestionarProyectos, puedeGestionarSugerencias, esAdmin } from './utils/permissions';
import { SUGGESTIONS_QUERY_KEY } from './types/suggestions';
import './components/suggestions.css';

// [MOD-00] App Principal
export default function App() {
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [usuario, setUsuario] = useState(null);
  const [vistaActiva, setVistaActiva] = useState('home'); // 'home' | 'check' | 'historial' | 'historial-otros' | 'roster' | 'historial-roster' | 'usuarios' | 'proyectos'
  const [recordatorioPendiente, setRecordatorioPendiente] = useState(null);
  const [recordatorioFinMes, setRecordatorioFinMes] = useState(null);
  const [erroresRemotos, setErroresRemotos] = useState([]);
  const [modalErroresAbierto, setModalErroresAbierto] = useState(false);
  const [cargandoErrores, setCargandoErrores] = useState(false);
  const [notificacionesModificaciones, setNotificacionesModificaciones] = useState([]);
  const [navegacionAuditoria, setNavegacionAuditoria] = useState(null);
  const [actualizacion, setActualizacion] = useState(null);
  const [actualizando, setActualizando] = useState(false);
  const fileInputRef = useRef(null);

  const [tema, setTema] = useState(() => {
    return localStorage.getItem('ingeap_theme') || 'light';
  });

  // [FN-04.08] Control de Zoom y persistencia local (Escala 80% - 130%)
  const MIN_ZOOM = 80;
  const MAX_ZOOM = 130;

  const [zoom, setZoom] = useState(() => {
    const guardado = localStorage.getItem('ingeap_zoom');
    const valor = guardado ? Number(guardado) : 100;
    return isNaN(valor) ? 100 : Math.min(Math.max(valor, MIN_ZOOM), MAX_ZOOM);
  });

  useEffect(() => {
    const factor = zoom / 100;
    document.documentElement.style.zoom = `${zoom}%`;
    document.documentElement.style.setProperty('--ui-zoom', String(factor));
    localStorage.setItem('ingeap_zoom', String(zoom));
  }, [zoom]);

  const aumentarZoom = () => {
    setZoom(prev => Math.min(prev + 10, MAX_ZOOM));
  };
  const disminuirZoom = () => {
    setZoom(prev => Math.max(prev - 10, MIN_ZOOM));
  };

  // [FN-04.09] Atajo Ctrl + Wheel y teclado para ajuste de Zoom fluido
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 5 : -5;
        setZoom(prev => Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM));
      }
    };

    const handleKeyDown = (e) => {
      if (e.ctrlKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setZoom(prev => Math.min(prev + 5, MAX_ZOOM));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setZoom(prev => Math.max(prev - 5, MIN_ZOOM));
        } else if (e.key === '0') {
          e.preventDefault();
          setZoom(100);
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // [FN-07.21] Captura global de excepciones no controladas de ventana y promesas rechazadas
  useEffect(() => {
    const handleWindowError = (event) => {
      try {
        api.reportarErrorCliente({
          origen: 'frontend_window',
          accion_metodo: 'window.onerror',
          mensaje_error: event.message || 'Error no capturado en interfaz',
          detalle_tecnico: event.error?.stack || `${event.filename || 'app'}:${event.lineno || 0}:${event.colno || 0}`,
          codigo_error: 'ERROR_VENTANA_CLIENTE'
        });
      } catch (_err) {
        // Silenciar fallos de telemetria
      }
    };

    const handleUnhandledRejection = (event) => {
      try {
        api.reportarErrorCliente({
          origen: 'frontend_promise',
          accion_metodo: 'unhandledrejection',
          mensaje_error: event.reason?.message || String(event.reason || 'Promesa rechazada no controlada'),
          detalle_tecnico: event.reason?.stack || String(event.reason || ''),
          codigo_error: 'PROMISE_REJECTION'
        });
      } catch (_err) {
        // Silenciar fallos de telemetria
      }
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('ingeap_theme', tema);
  }, [tema]);

  const esAplicaciones = esAreaAplicaciones(usuario);

  // [FN-04.05] Mantener modo RPG EXCLUSIVAMENTE para el Área de Aplicaciones
  useEffect(() => {
    if (usuario && !esAplicaciones && tema === 'rpg') {
      setTema('dark');
    }
  }, [usuario, esAplicaciones, tema]);

  const toggleTema = () => {
    if (esAplicaciones) {
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

  // [FN-07.23] Verificar si el usuario completó el registro de hoy y alerta de fin de mes
  const chequearRegistroHoy = async () => {
    if (!usuario) return;
    try {
      const res = await api.verificarRegistroHoy();
      if (res) {
        if (!res.registrado) {
          setRecordatorioPendiente({
            tipo: 'inicio',
            mensaje: 'Buenos días, ¡recordá registrar tu jornada antes de que finalice el día!'
          });
        } else {
          setRecordatorioPendiente(null);
        }

        if (res.es_ultimo_dia_mes && res.cantidad_faltantes > 0) {
          setRecordatorioFinMes({
            diasFaltantes: res.dias_faltantes || [],
            cantidadFaltantes: res.cantidad_faltantes,
            ultimoDia: res.ultimo_dia
          });
        } else {
          setRecordatorioFinMes(null);
        }
      }
    } catch (err) {
      console.error('Error al chequear registro de hoy:', err);
    }
  };

  useEffect(() => {
    chequearRegistroHoy();
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

  // [FN-02.02] Monitoreo y carga de notificaciones de modificaciones (Exclusivo Justina Bertolozzi e Iván Valentin)
  useEffect(() => {
    if (!usuario || !puedeVerModificaciones(usuario)) {
      setNotificacionesModificaciones([]);
      return;
    }
    let activo = true;

    const cargarNotifs = async () => {
      try {
        const lista = await api.obtenerNotificacionesModificaciones(true);
        if (activo && Array.isArray(lista)) {
          setNotificacionesModificaciones(lista);
        }
      } catch (err) {
        console.error('Error al cargar notificaciones de modificaciones:', err);
      }
    };

    cargarNotifs();

    // Verificación periódica cada 60 segundos de notificaciones de auditoría
    const intervalo = setInterval(() => {
      cargarNotifs();
    }, 60000);

    let debounceTimer = null;
    const handleCatalogos = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        cargarNotifs();
      }, 200);
    };
    window.addEventListener('catalogos-actualizados', handleCatalogos);

    return () => {
      activo = false;
      clearInterval(intervalo);
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('catalogos-actualizados', handleCatalogos);
    };
  }, [usuario]);

  // [FN-07.21] Carga y polling de errores remotos del sistema (Exclusivo Administrador)
  const cargarErroresRemotos = async () => {
    if (!usuario || !esAdmin(usuario)) return;
    try {
      const lista = await api.obtenerErroresRemotos(true);
      if (Array.isArray(lista)) {
        setErroresRemotos(lista);
      }
    } catch (err) {
      console.error('Error al cargar errores remotos:', err);
    }
  };

  useEffect(() => {
    if (!usuario || !esAdmin(usuario)) {
      setErroresRemotos([]);
      return;
    }
    cargarErroresRemotos();
    const intervalErr = setInterval(cargarErroresRemotos, 60000);
    return () => clearInterval(intervalErr);
  }, [usuario]);

  const handleMarcarErrorResuelto = async (idError) => {
    setCargandoErrores(true);
    try {
      const res = await api.marcarErrorRemotoResuelto(idError);
      if (res && res.exito) {
        toast.success('Error marcado como resuelto.');
        setErroresRemotos(prev => prev.filter(e => e.id_error !== idError));
      } else {
        toast.error(res?.error || 'No se pudo resolver el error.');
      }
    } catch (e) {
      toast.error('Fallo de comunicación al resolver error.');
    } finally {
      setCargandoErrores(false);
    }
  };

  const handleMarcarTodosErroresResueltos = async () => {
    setCargandoErrores(true);
    try {
      const res = await api.marcarErrorRemotoResuelto(null, true);
      if (res && res.exito) {
        toast.success(`Se marcaron ${res.afectados || 'todos los'} errores como resueltos.`);
        setErroresRemotos([]);
      } else {
        toast.error(res?.error || 'No se pudieron resolver los errores.');
      }
    } catch (e) {
      toast.error('Fallo de comunicación al resolver errores.');
    } finally {
      setCargandoErrores(false);
    }
  };

  // Guardia de navegación por permisos y roles
  useEffect(() => {
    if (!usuario) return;
    if ((vistaActiva === 'roster' || vistaActiva === 'historial-roster') && !puedeAccederRoster(usuario)) {
      setVistaActiva('home');
    }
    if (vistaActiva === 'historial-otros' && !puedeVerHistorialOtros(usuario)) {
      setVistaActiva('home');
    }
    if (vistaActiva === 'usuarios' && !puedeGestionarUsuarios(usuario)) {
      setVistaActiva('home');
    }
    if (vistaActiva === 'proyectos' && !puedeGestionarProyectos(usuario)) {
      setVistaActiva('home');
    }
    if (vistaActiva === 'sugerencias-gestion' && !puedeGestionarSugerencias(usuario)) {
      setVistaActiva('home');
    }
  }, [vistaActiva, usuario]);

  // [FN-03.06] Comprobar si hay actualizaciones disponibles en segundo plano desde GitHub Releases
  const comprobarUpdate = async () => {
    try {
      const res = await api.verificarActualizacion();
      if (res && res.actualizacion_disponible) {
        setActualizacion(res);
      }
    } catch (err) {
      // Silencioso si no hay conexión o no está configurado
    }
  };

  useEffect(() => {
    comprobarUpdate();
    const intervalUpdate = setInterval(comprobarUpdate, 15 * 60 * 1000);
    return () => clearInterval(intervalUpdate);
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

  const handleIrACalendarioModificacion = (notif) => {
    if (!notif) return;
    setNavegacionAuditoria({
      empleado: notif.empleado,
      fecha: notif.fecha,
      idAsistencia: notif.id_asistencia,
      idModificacion: notif.id_modificacion,
      ts: Date.now()
    });
    setVistaActiva('historial-otros');
  };

  const handleDescartarNotificacion = async (idModificacion) => {
    const notifEliminada = notificacionesModificaciones.find(n => n.id_modificacion === idModificacion);
    setNotificacionesModificaciones(prev => prev.filter(n => n.id_modificacion !== idModificacion));
    try {
      const res = await api.marcarModificacionRevisada(idModificacion);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudo descartar la notificación');
        if (notifEliminada) {
          setNotificacionesModificaciones(prev => [notifEliminada, ...prev]);
        }
        return;
      }
      toast.success('Modificación marcada como revisada.');
      const actualizadas = await api.obtenerNotificacionesModificaciones(true);
      if (Array.isArray(actualizadas)) {
        setNotificacionesModificaciones(actualizadas);
      }
    } catch (e) {
      console.error(e);
      toast.error('Error de comunicación al descartar la notificación');
      if (notifEliminada) {
        setNotificacionesModificaciones(prev => [notifEliminada, ...prev]);
      }
    }
  };

  const handleDescartarNotificacionesLote = async (idsModificacion) => {
    if (!idsModificacion || idsModificacion.length === 0) return;
    const idsSet = new Set(idsModificacion);
    const eliminadas = notificacionesModificaciones.filter(n => idsSet.has(n.id_modificacion));
    setNotificacionesModificaciones(prev => prev.filter(n => !idsSet.has(n.id_modificacion)));
    try {
      const res = await api.marcarModificacionesRevisadasLote(idsModificacion);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron descartar las modificaciones');
        setNotificacionesModificaciones(prev => [...eliminadas, ...prev]);
        return;
      }
      toast.success(`${res.afectados || idsModificacion.length} modificación(es) marcada(s) como revisada(s).`);
      const actualizadas = await api.obtenerNotificacionesModificaciones(true);
      if (Array.isArray(actualizadas)) {
        setNotificacionesModificaciones(actualizadas);
      }
    } catch (e) {
      console.error(e);
      toast.error('Error de comunicación al descartar notificaciones');
      setNotificacionesModificaciones(prev => [...eliminadas, ...prev]);
    }
  };

  const handleMarcarTodasModificacionesRevisadas = async () => {
    const previas = [...notificacionesModificaciones];
    setNotificacionesModificaciones([]);
    try {
      const res = await api.marcarTodasModificacionesRevisadas();
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron marcar todas las modificaciones como revisadas');
        setNotificacionesModificaciones(previas);
        return;
      }
      toast.success(`Se marcaron ${res.actualizados || 'todas las'} modificaciones como revisadas.`);
      const actualizadas = await api.obtenerNotificacionesModificaciones(true);
      if (Array.isArray(actualizadas)) {
        setNotificacionesModificaciones(actualizadas);
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al marcar todas las modificaciones como revisadas');
      setNotificacionesModificaciones(previas);
    }
  };



  const handleCerrarSesion = async () => {
    try {
      await api.cerrarSesion();
      queryClient.removeQueries({ queryKey: SUGGESTIONS_QUERY_KEY });
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
    <div className={`app-container ${['roster', 'historial-roster', 'historial', 'historial-otros', 'usuarios', 'proyectos', 'sugerencias-gestion'].includes(vistaActiva) ? 'app-panoramic' : ''}`}>
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
          {/* Botón selector de Tema (Claro / Oscuro / RPG Quest para Área A) */}
          <button
            type="button"
            className={`btn-header-icon ${tema === 'rpg' ? 'btn-header-rpg' : ''}`}
            onClick={toggleTema}
            title={
              tema === 'light'
                ? 'Cambiar a Tema Oscuro'
                : tema === 'dark'
                ? (esAplicaciones ? 'Cambiar a Modo Aventura RPG (Quest)' : 'Cambiar a Tema Claro')
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

          {/* [FN-04.08] Control de Zoom Accesible */}
          <div className="header-zoom-group" title="Ajustar zoom de pantalla (Ctrl + Rueda del ratón)">
            <button
              type="button"
              className="btn-zoom"
              onClick={disminuirZoom}
              disabled={zoom <= MIN_ZOOM}
              title="Reducir zoom (A- o Ctrl + -)"
              aria-label="Reducir zoom"
            >
              A-
            </button>
            <span
              className="zoom-indicator"
              onClick={() => setZoom(100)}
              title="Restablecer zoom al 100% (Ctrl + 0)"
            >
              {zoom}%
            </span>
            <button
              type="button"
              className="btn-zoom"
              onClick={aumentarZoom}
              disabled={zoom >= MAX_ZOOM}
              title="Aumentar zoom (A+ o Ctrl + +)"
              aria-label="Aumentar zoom"
            >
              A+
            </button>
          </div>

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

      {/* Cartel de Actualización Disponible */}
      {actualizacion && (
        <div className="update-banner">
          <div className="update-content">
            <div className="update-title">
              <span>🚀</span> Actualización disponible: v{actualizacion.version_nueva}
            </div>
            <div className="update-notes">
              {actualizacion.notas || 'Nueva versión con mejoras y correcciones disponible.'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-update"
              disabled={actualizando}
              onClick={handleActualizar}
            >
              {actualizando ? 'Descargando...' : 'Actualizar ahora'}
            </button>
            <button
              type="button"
              className="reminder-close"
              onClick={() => setActualizacion(null)}
              title="Ignorar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}



      {/* Cartel / Pop-up de Notificación para RRHH sobre Modificaciones en Registros */}
      {puedeVerModificaciones(usuario) && notificacionesModificaciones.length > 0 && vistaActiva !== 'historial-otros' && (
        <div className="rrhh-notification-banner">
          <div className="rrhh-notif-icon">
            <span style={{ fontSize: '18px' }}>🔔</span>
          </div>
          <div className="rrhh-notif-body">
            <div className="rrhh-notif-title-row">
              <span className="rrhh-notif-title">Modificación en Registro Diario</span>
              {notificacionesModificaciones.length > 1 && (
                <span className="rrhh-notif-count-badge">+{notificacionesModificaciones.length - 1} más</span>
              )}
            </div>
            <div className="rrhh-notif-desc">
              <strong>{notificacionesModificaciones[0].empleado}</strong> modificó el registro del{' '}
              <strong>{notificacionesModificaciones[0].fecha}</strong>{' '}
              <span className="rrhh-notif-diff">
                ({notificacionesModificaciones[0].tipo_antes || 'Sin asignar'} ➔ {notificacionesModificaciones[0].tipo_despues})
              </span>
              {notificacionesModificaciones[0].quien_modifica && (
                <span className="rrhh-notif-author"> • Por {notificacionesModificaciones[0].quien_modifica}</span>
              )}
            </div>
          </div>
          <div className="rrhh-notif-actions">
            <button
              type="button"
              className="btn-rrhh-goto"
              onClick={() => handleIrACalendarioModificacion(notificacionesModificaciones[0])}
              title="Ir directo al calendario del empleado para ver el cambio"
            >
              📅 Ver cambio en calendario
            </button>
            <button
              type="button"
              className="btn-rrhh-mark-all"
              onClick={handleMarcarTodasModificacionesRevisadas}
              title="Marcar todas las modificaciones pendientes como revisadas"
            >
              ✓ Marcar todas
            </button>
            <button
              type="button"
              className="btn-rrhh-dismiss"
              onClick={() => handleDescartarNotificacion(notificacionesModificaciones[0].id_modificacion)}
              title="Marcar como revisada esta notificación"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* [FN-07.23] Cartel / Banner de Recordatorio de Cierre de Mes */}
      {recordatorioFinMes && vistaActiva !== 'check' && (
        <div className="reminder-banner reminder-cierre-mes">
          <div className="reminder-text">
            <span className="reminder-icon">⚠️</span>
            <span>
              ¡Atención! Hoy es el último día del mes y tenés{' '}
              <b>{recordatorioFinMes.cantidadFaltantes} día{recordatorioFinMes.cantidadFaltantes > 1 ? 's' : ''} sin cargar</b>{' '}
              (días: {recordatorioFinMes.diasFaltantes.join(', ')}). Completá tus registros para el cierre mensual.
            </span>
          </div>
          <div className="reminder-actions">
            <button
              type="button"
              className="reminder-btn"
              onClick={() => {
                setVistaActiva('check');
              }}
            >
              Cargar Ahora
            </button>
            <button
              type="button"
              className="reminder-btn"
              style={{ background: '#475569' }}
              onClick={() => {
                setVistaActiva('historial');
              }}
            >
              Ver Mi Historial
            </button>
            <button
              type="button"
              className="reminder-close"
              onClick={() => setRecordatorioFinMes(null)}
              title="Cerrar recordatorio"
            >
              ✕
            </button>
          </div>
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

      {/* Sistema centralizado de notificaciones Toast */}
      <Toaster position="top-right" richColors closeButton expand={false} duration={4000} theme={tema} />

      {/* Navegación por vistas protegida con react-error-boundary */}
      <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => setVistaActiva('home')}>
        {vistaActiva === 'home' && (
          <HomeView
            usuario={usuario}
            tema={tema}
            onNuevoReporte={() => setVistaActiva('check')}
            onVerHistorial={() => setVistaActiva('historial')}
            onNuevoRoster={() => setVistaActiva('roster')}
            onHistorialRoster={() => setVistaActiva('historial-roster')}
            onHistorialOtrosEmpleados={() => setVistaActiva('historial-otros')}
            onGestionUsuarios={() => setVistaActiva('usuarios')}
            onNuevaSugerencia={() => setVistaActiva('sugerencia-nueva')}
            onGestionSugerencias={() => setVistaActiva('sugerencias-gestion')}
            onGestionProyectos={() => setVistaActiva('proyectos')}
            erroresRemotos={erroresRemotos}
            onVerErroresRemotos={() => setVistaActiva('errores-remotos')}
            onAvatarClick={handleTriggerAvatar}
            notificacionesModificaciones={notificacionesModificaciones}
            onIrACalendarioModificacion={handleIrACalendarioModificacion}
            onDescartarNotificacion={handleDescartarNotificacion}
            onDescartarNotificacionesLote={handleDescartarNotificacionesLote}
            onMarcarTodasModificacionesRevisadas={handleMarcarTodasModificacionesRevisadas}
          />
        )}

        {vistaActiva === 'check' && (
          <CheckForm
            tema={tema}
            onRegistroGuardado={() => {
              setRecordatorioPendiente(null);
              chequearRegistroHoy();
            }}
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

        {vistaActiva === 'historial-otros' && puedeVerHistorialOtros(usuario) && (
          <OtherEmployeesHistoryView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
            onVerMiHistorial={() => setVistaActiva('historial')}
            onNuevoReporte={() => setVistaActiva('check')}
            navegacionAuditoria={navegacionAuditoria}
            onConsumirNavegacion={() => setNavegacionAuditoria(null)}
          />
        )}

        {vistaActiva === 'roster' && puedeAccederRoster(usuario) && (
          <RosterView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
          />
        )}

        {vistaActiva === 'historial-roster' && puedeAccederRoster(usuario) && (
          <RosterHistoryView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
            onNuevoRoster={() => setVistaActiva('roster')}
          />
        )}

        {vistaActiva === 'usuarios' && puedeGestionarUsuarios(usuario) && (
          <UsersManagementView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
          />
        )}

        {vistaActiva === 'proyectos' && puedeGestionarProyectos(usuario) && (
          <ProjectsManagementView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
          />
        )}

        {vistaActiva === 'sugerencia-nueva' && (
          <SuggestionForm onVolver={() => setVistaActiva('home')} />
        )}

        {vistaActiva === 'sugerencias-gestion' && puedeGestionarSugerencias(usuario) && (
          <SuggestionsManagementView
            sessionKey={`${usuario.id_usuario}:${usuario.rol_app}`}
            onVolver={() => setVistaActiva('home')}
          />
        )}

        {vistaActiva === 'errores-remotos' && esAdmin(usuario) && (
          <RemoteErrorsView
            usuario={usuario}
            tema={tema}
            onVolver={() => setVistaActiva('home')}
          />
        )}
      </ErrorBoundary>

      {/* [FN-07.21] Modal de Auditoría de Errores Remotos para Administradores */}
      {esAdmin(usuario) && (
        <RemoteErrorsModal
          isOpen={modalErroresAbierto}
          onClose={() => setModalErroresAbierto(false)}
          errores={erroresRemotos}
          onMarcarResuelto={handleMarcarErrorResuelto}
          onMarcarTodosResueltos={handleMarcarTodosErroresResueltos}
          cargando={cargandoErrores}
        />
      )}
    </div>
  );
}
