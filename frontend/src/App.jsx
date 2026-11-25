import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { api } from './services/apiBridge';
import { queryClient } from './services/queryClient';
import { APP_EDITION, APP_VERSION, ES_EDICION_GESTION, formatearLeyendaVersion } from './config/edition';
import logoIngeap from './assets/Logo_Ingeap1.png';
import LoginView from './components/layout/LoginView';
import HomeView from './components/layout/HomeView';
const CheckForm = lazy(() => import('./components/check/CheckForm'));
const HistoryView = lazy(() => import('./components/history/HistoryView'));
const SuggestionForm = lazy(() => import('./components/suggestions/SuggestionForm'));
const OtherEmployeesHistoryView = __APP_EDITION__ === 'gestion' ? lazy(() => import('./components/history/OtherEmployeesHistoryView')) : null;
const RosterView = __APP_EDITION__ === 'gestion' ? lazy(() => import('./components/roster/RosterView')) : null;
const RosterHistoryView = __APP_EDITION__ === 'gestion' ? lazy(() => import('./components/roster/RosterHistoryView')) : null;
const UsersManagementView = __APP_EDITION__ === 'gestion' ? lazy(() => import('./components/admin/UsersManagementView')) : null;
const ProjectsManagementView = __APP_EDITION__ === 'gestion' ? lazy(() => import('./components/admin/ProjectsManagementView')) : null;
const SuggestionsManagementView = __APP_EDITION__ === 'gestion' ? lazy(() => import('./components/suggestions/SuggestionsManagementView')) : null;
const RemoteErrorsView = __APP_EDITION__ === 'gestion' ? lazy(() => import('./components/admin/RemoteErrorsView')) : null;
const RemoteErrorsModal = __APP_EDITION__ === 'gestion' ? lazy(() => import('./components/admin/RemoteErrorsModal')) : null;
const UsageStatsView = __APP_EDITION__ === 'gestion' ? lazy(() => import('./components/stats/UsageStatsView')) : null;
import { ErrorBoundary } from 'react-error-boundary';
import ErrorFallback from './components/layout/ErrorFallback';
import { Toaster, toast } from 'sonner';
import { puedeAccederRoster, puedeVerHistorialOtros, puedeVerModificaciones, esAreaAplicaciones, puedeGestionarUsuarios, puedeGestionarProyectos, puedeGestionarSugerencias, puedeVerEstadisticasUso, esAdmin } from './utils/permissions';
import { SUGGESTIONS_QUERY_KEY } from './types/suggestions';
import './css/suggestions.css';

import { useDesktopState } from './hooks/useDesktopState';
import { DesktopActivityContext } from './services/desktopState';
import ConnectionScreen from './components/layout/ConnectionScreen';

// [MOD-00] App Principal
export default function App() {
  const { conexion, visible } = useDesktopState();
  const disponible = conexion.estado === 'disponible';
  const updateEnCurso = useRef(false);
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
  const [zoomHudVisible, setZoomHudVisible] = useState(false);
  const zoomHudTimerRef = useRef(null);

  const mostrarHudZoom = useCallback(() => {
    setZoomHudVisible(true);
    if (zoomHudTimerRef.current) {
      clearTimeout(zoomHudTimerRef.current);
    }
    zoomHudTimerRef.current = setTimeout(() => {
      setZoomHudVisible(false);
    }, 1400);
  }, []);

  useEffect(() => {
    const factor = zoom / 100;
    document.documentElement.style.zoom = `${zoom}%`;
    document.documentElement.style.setProperty('--ui-zoom', String(factor));
    localStorage.setItem('ingeap_zoom', String(zoom));
  }, [zoom]);

  useEffect(() => {
    return () => {
      if (zoomHudTimerRef.current) {
        clearTimeout(zoomHudTimerRef.current);
      }
    };
  }, []);

  // [FN-04.09] Atajo Ctrl + Wheel y teclado para ajuste de Zoom fluido con indicador momentáneo
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 5 : -5;
        setZoom(prev => Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM));
        mostrarHudZoom();
      }
    };

    const handleKeyDown = (e) => {
      if (e.ctrlKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setZoom(prev => Math.min(prev + 5, MAX_ZOOM));
          mostrarHudZoom();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setZoom(prev => Math.max(prev - 5, MIN_ZOOM));
          mostrarHudZoom();
        } else if (e.key === '0') {
          e.preventDefault();
          setZoom(100);
          mostrarHudZoom();
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mostrarHudZoom]);

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
    setCargandoSesion(true);
    setUsuario(null);
    if (!disponible) return;
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
  }, [disponible, conexion.revision]);

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
    if (!ES_EDICION_GESTION || !usuario || !visible || !disponible || !puedeVerModificaciones(usuario)) {
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
  }, [usuario, visible, disponible]);

  // [FN-07.21] Carga y polling de errores remotos del sistema (Exclusivo Administrador)
  const cargarErroresRemotos = async () => {
    if (!ES_EDICION_GESTION || !usuario || !esAdmin(usuario)) return;
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
    if (!ES_EDICION_GESTION || !usuario || !visible || !disponible || !esAdmin(usuario)) {
      setErroresRemotos([]);
      return;
    }
    cargarErroresRemotos();
    const intervalErr = setInterval(cargarErroresRemotos, 60000);
    return () => clearInterval(intervalErr);
  }, [usuario, visible, disponible]);

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

  // Guardia de navegación por permisos, edición y roles
  useEffect(() => {
    if (!usuario) return;
    if (
      !ES_EDICION_GESTION &&
      ['roster', 'historial-roster', 'historial-otros', 'usuarios', 'proyectos', 'sugerencias-gestion', 'estadisticas-uso', 'errores-remotos'].includes(vistaActiva)
    ) {
      setVistaActiva('home');
      return;
    }
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
    if (vistaActiva === 'estadisticas-uso' && !puedeVerEstadisticasUso(usuario)) {
      setVistaActiva('home');
    }
    if (vistaActiva === 'errores-remotos' && !esAdmin(usuario)) {
      setVistaActiva('home');
    }
  }, [vistaActiva, usuario]);

  // [FN-03.06] Comprobar si hay actualizaciones disponibles por canal de rol y edición
  const comprobarUpdate = useCallback(async (forzar = false) => {
    if (updateEnCurso.current) return;
    updateEnCurso.current = true;
    try {
      const res = await api.verificarActualizacion(forzar);
      if (res && res.actualizacion_disponible) {
        setActualizacion(res);
      } else if (forzar) {
        setActualizacion(null);
      }
    } catch (_err) {
      // Silencioso si no hay conexión o no está configurado
    } finally {
      updateEnCurso.current = false;
    }
  }, []);

  useEffect(() => {
    if (!disponible || !visible) return;
    const primerUpdate = setTimeout(() => comprobarUpdate(false), 30000);
    const intervalUpdate = setInterval(() => comprobarUpdate(false), 15 * 60 * 1000);
    return () => { clearTimeout(primerUpdate); clearInterval(intervalUpdate); };
  }, [disponible, visible, comprobarUpdate]);

  useEffect(() => {
    if (!disponible || !visible || !usuario?.id_usuario) return;
    comprobarUpdate(true);
  }, [disponible, visible, usuario?.id_usuario, usuario?.rol_app, comprobarUpdate]);

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
      setActualizacion(null);
      setRecordatorioPendiente(null);
      setVistaActiva('home');
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
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

  const leyendaVersion = formatearLeyendaVersion(
    conexion?.version_app || APP_VERSION,
    conexion?.edicion || APP_EDITION
  );

  const zoomHud = zoomHudVisible ? (
    <div className="zoom-hud-toast" role="status" aria-live="polite" data-testid="zoom-hud">
      <span className="zoom-hud-value">Zoom {zoom}%</span>
      {zoom !== 100 && <span className="zoom-hud-hint">Ctrl+0</span>}
    </div>
  ) : null;

  if (!disponible) {
    return (
      <>
        {zoomHud}
        <ConnectionScreen conexion={conexion} />
        <span className="app-corner-version" data-testid="app-version-badge">{leyendaVersion}</span>
      </>
    );
  }

  if (cargandoSesion) {
    return (
      <div className="app-container">
        {zoomHud}
        <div className="loading-screen">
          <div className="spinner" style={{ width: '32px', height: '32px' }} />
          <p>Iniciando Check Diario...</p>
        </div>
        <span className="app-corner-version" data-testid="app-version-badge">{leyendaVersion}</span>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div className="app-container">
        {zoomHud}
        <LoginView onLoginSuccess={(u) => { setUsuario(u); setVistaActiva('home'); }} tema={tema} onToggleTema={toggleTema} />
        <span className="app-corner-version" data-testid="app-version-badge">{leyendaVersion}</span>
      </div>
    );
  }

  return (
    <div className={`app-container ${['roster', 'historial-roster', 'historial', 'historial-otros', 'usuarios', 'proyectos', 'sugerencias-gestion', 'estadisticas-uso'].includes(vistaActiva) ? 'app-panoramic' : ''}`}>
      {zoomHud}
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
        <img
          src={logoIngeap}
          alt="Ingeap"
          className="header-brand-logo"
          onClick={() => setVistaActiva('home')}
          title="Ir al Inicio"
        />

        <div className="header-right-group">
          <div className="user-profile">
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

          <button
            type="button"
            className="btn-logout-icon"
            onClick={handleCerrarSesion}
            title="Cerrar sesión de este equipo"
            aria-label="Cerrar sesión"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
              <polyline points="15 16 20 12 15 8" />
              <line x1="20" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Cartel de Actualización Disponible */}
      {actualizacion && (
        <div className="update-banner">
          <div className="update-content">
            <div className="update-title">
              <span>{actualizacion.cambio_edicion ? '⚡' : '🚀'}</span>{' '}
              {actualizacion.cambio_edicion
                ? `Edición Gestión disponible: v${actualizacion.version_nueva}`
                : `Actualización disponible: v${actualizacion.version_nueva}`}
            </div>
            <div className="update-notes">
              {actualizacion.cambio_edicion
                ? `Tu perfil (${usuario?.rol_app || 'gestión'}) requiere Check Diario Edición Gestión para habilitar los módulos de RRHH, supervisión y reportes.`
                : (actualizacion.notas || 'Nueva versión con mejoras y correcciones disponible.')}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-update"
              disabled={actualizando}
              onClick={handleActualizar}
            >
              {actualizando
                ? 'Descargando...'
                : (actualizacion.cambio_edicion ? 'Instalar Edición Gestión' : 'Actualizar ahora')}
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
      <DesktopActivityContext.Provider value={visible && disponible}>
        <Suspense fallback={<div className="loading-screen">Cargando vista...</div>}>
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
                onEstadisticasUso={() => setVistaActiva('estadisticas-uso')}
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

            {ES_EDICION_GESTION && OtherEmployeesHistoryView && vistaActiva === 'historial-otros' && puedeVerHistorialOtros(usuario) && (
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

            {ES_EDICION_GESTION && RosterView && vistaActiva === 'roster' && puedeAccederRoster(usuario) && (
              <RosterView
                usuario={usuario}
                tema={tema}
                onVolver={() => setVistaActiva('home')}
              />
            )}

            {ES_EDICION_GESTION && RosterHistoryView && vistaActiva === 'historial-roster' && puedeAccederRoster(usuario) && (
              <RosterHistoryView
                usuario={usuario}
                tema={tema}
                onVolver={() => setVistaActiva('home')}
                onNuevoRoster={() => setVistaActiva('roster')}
              />
            )}

            {ES_EDICION_GESTION && UsersManagementView && vistaActiva === 'usuarios' && puedeGestionarUsuarios(usuario) && (
              <UsersManagementView
                usuario={usuario}
                tema={tema}
                onVolver={() => setVistaActiva('home')}
              />
            )}

            {ES_EDICION_GESTION && ProjectsManagementView && vistaActiva === 'proyectos' && puedeGestionarProyectos(usuario) && (
              <ProjectsManagementView
                usuario={usuario}
                tema={tema}
                onVolver={() => setVistaActiva('home')}
              />
            )}

            {vistaActiva === 'sugerencia-nueva' && (
              <SuggestionForm onVolver={() => setVistaActiva('home')} />
            )}

            {ES_EDICION_GESTION && SuggestionsManagementView && vistaActiva === 'sugerencias-gestion' && puedeGestionarSugerencias(usuario) && (
              <SuggestionsManagementView
                sessionKey={`${usuario.id_usuario}:${usuario.rol_app}`}
                onVolver={() => setVistaActiva('home')}
              />
            )}

            {ES_EDICION_GESTION && UsageStatsView && vistaActiva === 'estadisticas-uso' && puedeVerEstadisticasUso(usuario) && (
              <UsageStatsView
                usuario={usuario}
                tema={tema}
                onVolver={() => setVistaActiva('home')}
              />
            )}

            {ES_EDICION_GESTION && RemoteErrorsView && vistaActiva === 'errores-remotos' && esAdmin(usuario) && (
              <RemoteErrorsView
                usuario={usuario}
                tema={tema}
                onVolver={() => setVistaActiva('home')}
              />
            )}
          </ErrorBoundary>
        </Suspense>
      </DesktopActivityContext.Provider>

      {/* [FN-07.21] Modal de Auditoría de Errores Remotos para Administradores */}
      {ES_EDICION_GESTION && RemoteErrorsModal && esAdmin(usuario) && modalErroresAbierto && (
        <Suspense fallback={null}>
          <RemoteErrorsModal
            isOpen={modalErroresAbierto}
            onClose={() => setModalErroresAbierto(false)}
            errores={erroresRemotos}
            onMarcarResuelto={handleMarcarErrorResuelto}
            onMarcarTodosResueltos={handleMarcarTodosErroresResueltos}
            cargando={cargandoErrores}
          />
        </Suspense>
      )}

      {/* Leyenda persistente de versión en esquina inferior izquierda */}
      <span className="app-corner-version" data-testid="app-version-badge">
        {leyendaVersion}
      </span>

      {/* Selector discreto de tema (Claro / Oscuro / RPG) en esquina inferior derecha */}
      <button
        type="button"
        className={`app-corner-theme-btn ${tema === 'rpg' ? 'btn-header-rpg' : ''}`}
        onClick={toggleTema}
        title={
          tema === 'light'
            ? 'Cambiar a Tema Oscuro'
            : tema === 'dark'
              ? (esAplicaciones ? 'Cambiar a Modo Aventura RPG (Quest)' : 'Cambiar a Tema Claro')
              : 'Cambiar a Tema Claro'
        }
        aria-label="Cambiar tema visual"
      >
        {tema === 'rpg' ? (
          <span style={{ fontSize: '15px', lineHeight: 1 }} title="Modo Aventura RPG">⚔️</span>
        ) : tema === 'dark' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
    </div>
  );
}
