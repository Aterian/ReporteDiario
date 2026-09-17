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
  obtener_servicios: async (area = null) => {
    const todos = [
      "175-SF-A-504-APP Partes diarios Milicic Veladero",
      "228-SF-I-626-Servicio de informe mensual - Planta de residuos",
      "287-SF-A-813-Aplicación y asesoramientos en procesos",
      "301-SF-A-853-App Taller Almendra",
      "318-SF-I-932-SM VMOS - Río Negro - Milicic",
      "350-SF-M-1088- MENSURA CASA CUNA RINCON",
      "352-SF-I-1084-Rel Limp Canales Centro-Sta Fe-MEM"
    ];
    if (!area || ['N', 'RRHH', 'TODOS'].includes(area.toUpperCase())) {
      return todos;
    }
    const cod = `-${area.toUpperCase()}-`;
    const filtrados = todos.filter(t => t.includes(cod));
    return filtrados.length > 0 ? filtrados : todos;
  },
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
  aplicar_actualizacion: async () => ({ exito: true }),
  guardar_roster: async (datos) => {
    const raw = localStorage.getItem('ingeap_rosters_mock') || '[]';
    const lista = JSON.parse(raw);
    const id = datos.id || 'mock-' + Math.random().toString(36).substring(2, 9);
    const nuevo = { ...datos, id, creado_en: new Date().toISOString() };
    const idx = lista.findIndex(r => r.id === id);
    if (idx >= 0) {
      lista[idx] = nuevo;
    } else {
      lista.push(nuevo);
    }
    localStorage.setItem('ingeap_rosters_mock', JSON.stringify(lista));
    return { exito: true, id };
  },
  obtener_rosters: async (desde, hasta) => {
    const raw = localStorage.getItem('ingeap_rosters_mock') || '[]';
    const lista = JSON.parse(raw);
    if (!desde || !hasta) return lista;
    return lista.filter(r => r.fecha_inicio <= hasta && r.fecha_fin >= desde);
  },
  eliminar_roster: async (id) => {
    const raw = localStorage.getItem('ingeap_rosters_mock') || '[]';
    let lista = JSON.parse(raw);
    lista = lista.filter(r => r.id !== id);
    localStorage.setItem('ingeap_rosters_mock', JSON.stringify(lista));
    return { exito: true };
  },
  exportar_roster_excel: async (anio, mes, proyecto = '') => {
    alert(`[Modo Simulado] Se exportaría el Excel para el proyecto "${proyecto || 'Todos'}" del mes ${mes}/${anio} con 3 hojas.`);
    return { exito: true, mensaje: `Excel generado en modo simulado para ${proyecto || 'Ingeap'}.` };
  },
  redimensionar_ventana: async () => ({ exito: true }),
  maximizar_ventana: async () => ({ exito: true }),
  restaurar_ventana: async () => ({ exito: true }),
  obtener_todos_usuarios: async (area = null) => {
    const mockUsers = [
      { id: 1, nombre: 'Gabriel Juarez', area: 'I', mail: 'gabriel.juarez@ingeap.com' },
      { id: 2, nombre: 'Fernando Aimar', area: 'I', mail: 'fernando.aimar@ingeap.com' },
      { id: 3, nombre: 'Maximiliano Kromm', area: 'I', mail: 'maximiliano.kromm@ingeap.com' },
      { id: 4, nombre: 'Santiago Suarez', area: 'I', mail: 'santiago.suarez@ingeap.com' },
      { id: 5, nombre: 'Ivan Emanuel Altamirano', area: 'I', mail: 'ivan.altamirano@ingeap.com' },
      { id: 6, nombre: 'Agustina Ferrante', area: 'I', mail: 'agustina.ferrante@ingeap.com' },
      { id: 7, nombre: 'Camila Llovio', area: 'I', mail: 'camila.llovio@ingeap.com' },
      { id: 8, nombre: 'Facundo Ezequiel Calgaro', area: 'I', mail: 'facundo.calgaro@ingeap.com' },
      { id: 9, nombre: 'Alejo Ferrero', area: 'I', mail: 'alejo.ferrero@ingeap.com' },
      { id: 10, nombre: 'José María Zufiaurre', area: 'I', mail: 'jose.zufiaurre@ingeap.com' },
      { id: 11, nombre: 'Nicolás Parajón', area: 'I', mail: 'nicolas.parajon@ingeap.com' },
      { id: 12, nombre: 'Norberto José Luis Botto', area: 'I', mail: 'norberto.botto@ingeap.com' },
      { id: 13, nombre: 'Pablo Zanor', area: 'I', mail: 'pablo.zanor@ingeap.com' },
      { id: 14, nombre: 'Rodolfo Julian Lescano', area: 'I', mail: 'rodolfo.lescano@ingeap.com' },
      { id: 15, nombre: 'Usuario Admin', area: 'N', mail: 'admin@ingeap.com' },
      { id: 16, nombre: 'Usuario RRHH', area: 'RRHH', mail: 'rrhh@ingeap.com' }
    ];
    if (area && area !== 'TODOS') {
      return mockUsers.filter(u => (u.area || '').toUpperCase() === area.toUpperCase());
    }
    return mockUsers;
  }
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

  async obtenerServicios(area = null) {
    const bridge = await getApi();
    if (bridge.obtener_servicios) {
      return await bridge.obtener_servicios(area);
    }
    return [];
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
  },

  async modificarRegistro(datos) {
    const bridge = await getApi();
    if (bridge.modificar_registro) {
      return await bridge.modificar_registro(datos);
    }
    return { exito: false, error: 'Función no disponible' };
  },

  async obtenerTodosUsuarios(area = null) {
    const bridge = await getApi();
    if (bridge.obtener_todos_usuarios) {
      return await bridge.obtener_todos_usuarios(area);
    }
    return [];
  },

  async guardarRoster(datos) {
    const bridge = await getApi();
    if (bridge.guardar_roster) {
      return await bridge.guardar_roster(datos);
    }
    return { exito: false, error: 'Función no disponible' };
  },

  async obtenerRosters(fechaDesde = null, fechaHasta = null) {
    const bridge = await getApi();
    if (bridge.obtener_rosters) {
      return await bridge.obtener_rosters(fechaDesde, fechaHasta);
    }
    return [];
  },

  async eliminarRoster(idRoster) {
    const bridge = await getApi();
    if (bridge.eliminar_roster) {
      return await bridge.eliminar_roster(idRoster);
    }
    return { exito: false };
  },

  async exportarRosterExcel(anio, mes, proyecto = '') {
    const bridge = await getApi();
    if (bridge.exportar_roster_excel) {
      return await bridge.exportar_roster_excel(anio, mes, proyecto);
    }
    return { exito: false, error: 'Función no disponible' };
  },

  async redimensionarVentana(ancho, alto) {
    const bridge = await getApi();
    if (bridge.redimensionar_ventana) {
      return await bridge.redimensionar_ventana(ancho, alto);
    }
    return { exito: true };
  },

  async maximizarVentana() {
    const bridge = await getApi();
    if (bridge.maximizar_ventana) {
      return await bridge.maximizar_ventana();
    }
    return { exito: true };
  },

  async restaurarVentana() {
    const bridge = await getApi();
    if (bridge.restaurar_ventana) {
      return await bridge.restaurar_ventana();
    }
    return { exito: true };
  }
};

