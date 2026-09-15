/**
 * Puente de comunicación entre React y el backend en Python (pywebview).
 * Incluye un fallback para pruebas directas en navegadores convencionales.
 */

const mockApi = {
  obtener_estado_sesion: async () => {
    const sesionLocal = localStorage.getItem('ingeap_sesion_mock');
    if (sesionLocal) {
      try {
        return { logueado: true, usuario: JSON.parse(sesionLocal) };
      } catch {
        // Ignorar error de parseo
      }
    }
    return { logueado: false, usuario: null };
  },
  iniciar_sesion: async (nombre, dni) => {
    const nombreNormalizado = nombre.trim().toLowerCase();
    const dniNormalizado = dni.trim();
    
    // Simulación con algunos usuarios válidos de prueba
    if (dniNormalizado.length >= 7) {
      const areaSimulada = dniNormalizado === '33357062' ? 'N' : dniNormalizado.endsWith('4') ? 'I' : 'A';
      const usuario = { nombre: nombre.trim(), dni: dniNormalizado, area: areaSimulada };
      localStorage.setItem('ingeap_sesion_mock', JSON.stringify(usuario));
      return { exito: true, usuario };
    }
    return { exito: false, error: 'Los datos ingresados no coinciden con ningún empleado registrado.' };
  },
  cerrar_sesion: async () => {
    localStorage.removeItem('ingeap_sesion_mock');
    return { exito: true };
  },
  obtener_servicios: async () => [
    "175-SF-A-504-OT8",
    "287-SF-A-813-OT1",
    "301-SF-A-853-OT1",
    "355-SF-A-1054-OT1"
  ],
  guardar_check_diario: async (datos) => {
    const sesionLocal = localStorage.getItem('ingeap_sesion_mock');
    const sesion = sesionLocal ? JSON.parse(sesionLocal) : null;
    const historialRaw = localStorage.getItem('ingeap_historial_mock') || '[]';
    const historial = JSON.parse(historialRaw);
    historial.unshift({
      id: Date.now(),
      empleado: sesion?.nombre || 'Empleado',
      usuario_mail: sesion?.mail || '',
      ...datos,
      sincronizado: 1,
      creado_en: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
    localStorage.setItem('ingeap_historial_mock', JSON.stringify(historial));
    return { exito: true, mensaje: 'Registro guardado correctamente.' };
  },
  obtener_historial: async () => {
    const sesionLocal = localStorage.getItem('ingeap_sesion_mock');
    const sesion = sesionLocal ? JSON.parse(sesionLocal) : null;
    const historialRaw = localStorage.getItem('ingeap_historial_mock');
    if (historialRaw) {
      const items = JSON.parse(historialRaw);
      if (!sesion) return items;
      return items.filter((i) => {
        const mailMatch = i.usuario_mail && sesion.mail && i.usuario_mail.toLowerCase() === sesion.mail.toLowerCase();
        const nomMatch = i.empleado && sesion.nombre && i.empleado.toLowerCase() === sesion.nombre.toLowerCase();
        return mailMatch || nomMatch;
      });
    }
    return [];
  },
  verificar_registro_hoy: async () => {
    const sesionLocal = localStorage.getItem('ingeap_sesion_mock');
    const sesion = sesionLocal ? JSON.parse(sesionLocal) : null;
    const historialRaw = localStorage.getItem('ingeap_historial_mock');
    if (!sesion || !historialRaw) return { registrado: false };
    const hoy = new Date().toISOString().split('T')[0];
    const items = JSON.parse(historialRaw);
    const registrado = items.some(
      (i) => i.fecha === hoy && (i.usuario_mail === sesion.mail || i.empleado === sesion.nombre)
    );
    return { registrado };
  },
  verificar_actualizacion: async () => ({ actualizacion_disponible: false }),
  aplicar_actualizacion: async () => ({ exito: true })
};


let cachedApi = null;

async function getApi() {
  if (cachedApi) return cachedApi;

  if (window.pywebview && window.pywebview.api) {
    cachedApi = window.pywebview.api;
    return cachedApi;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const handleReady = () => {
      if (!resolved && window.pywebview && window.pywebview.api) {
        resolved = true;
        cachedApi = window.pywebview.api;
        resolve(cachedApi);
      }
    };

    window.addEventListener('pywebviewready', handleReady, { once: true });

    // Fallback tras 1.2 segundos si no estamos dentro de pywebview
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (window.pywebview && window.pywebview.api) {
          cachedApi = window.pywebview.api;
        } else {
          console.info('[apiBridge] Corriendo en modo navegador web con datos simulados.');
          cachedApi = mockApi;
        }
        resolve(cachedApi);
      }
    }, 1200);
  });
}

export const api = {
  async obtenerEstadoSesion() {
    const bridge = await getApi();
    return await bridge.obtener_estado_sesion();
  },

  async iniciarSesion(nombre, dni) {
    const bridge = await getApi();
    return await bridge.iniciar_sesion(nombre, dni);
  },

  async cerrarSesion() {
    const bridge = await getApi();
    return await bridge.cerrar_sesion();
  },

  async obtenerServicios() {
    const bridge = await getApi();
    return await bridge.obtener_servicios();
  },

  async guardarCheckDiario(datos) {
    const bridge = await getApi();
    return await bridge.guardar_check_diario(datos);
  },

  async obtenerHistorial() {
    const bridge = await getApi();
    return await bridge.obtener_historial();
  },

  async minimizar() {
    const bridge = await getApi();
    if (bridge.minimizar_a_bandeja) {
      return await bridge.minimizar_a_bandeja();
    }
    return { exito: true };
  },

  async guardarAvatar(avatarBase64) {
    const bridge = await getApi();
    if (bridge.guardar_avatar) {
      return await bridge.guardar_avatar(avatarBase64);
    }
    return { exito: true };
  },

  async sincronizarSheets() {
    const bridge = await getApi();
    if (bridge.sincronizar_sheets) {
      return await bridge.sincronizar_sheets();
    }
    return { exito: true, mensaje: 'Modo simulado' };
  },

  async probarConexionSheets(spreadsheetId) {
    const bridge = await getApi();
    if (bridge.probar_conexion_sheets) {
      return await bridge.probar_conexion_sheets(spreadsheetId || '');
    }
    return { exito: true };
  },

  async guardarConfigSheets(spreadsheetId) {
    const bridge = await getApi();
    if (bridge.guardar_config_sheets) {
      return await bridge.guardar_config_sheets(spreadsheetId);
    }
    return { exito: true };
  },

  async verificarRegistroHoy() {
    const bridge = await getApi();
    if (bridge.verificar_registro_hoy) {
      return await bridge.verificar_registro_hoy();
    }
    return { registrado: false };
  },

  async verificarActualizacion() {
    const bridge = await getApi();
    if (bridge.verificar_actualizacion) {
      return await bridge.verificar_actualizacion();
    }
    return { actualizacion_disponible: false };
  },

  async aplicarActualizacion(urlDescarga) {
    const bridge = await getApi();
    if (bridge.aplicar_actualizacion) {
      return await bridge.aplicar_actualizacion(urlDescarga);
    }
    return { exito: false, error: 'Función no disponible' };
  }
};

