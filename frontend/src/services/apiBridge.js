// Purgar inmediatamente cualquier dato simulado residual de versiones anteriores
try {
  localStorage.removeItem('ingeap_rosters_mock');
  localStorage.removeItem('ingeap_historial_mock');
} catch (e) {
  // Ignorar en entornos sin acceso a localStorage
}

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
    const dniNormalizado = dni.trim();
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
  guardar_check_diario: async (datos) => ({ exito: true, mensaje: 'Registro guardado (simulado).' }),
  obtener_historial: async () => ([]),
  verificar_registro_hoy: async () => ({ registrado: false }),
  verificar_actualizacion: async () => ({ actualizacion_disponible: false }),
  aplicar_actualizacion: async () => ({ exito: true }),
  guardar_roster: async (datos) => ({ exito: true, id: datos.id || 'mock-' + Date.now() }),
  obtener_rosters: async (desde, hasta) => ([]),
  eliminar_roster: async (id) => ({ exito: true }),
  purgar_rosters_locales: async () => ({ exito: true }),
  exportar_roster_excel: async (anio, mes, proyecto = '') => {
    alert(`[Modo Simulado] Se exportaría el Excel para "${proyecto || 'Todos'}" del mes ${mes}/${anio}.`);
    return { exito: true, mensaje: 'Excel generado (modo simulado).' };
  },
  redimensionar_ventana: async () => ({ exito: true }),
  maximizar_ventana: async () => ({ exito: true }),
  restaurar_ventana: async () => ({ exito: true }),
  refrescar_catalogos_sheets: async () => ({ exito: true, mensaje: 'Catálogos actualizados (simulado).' }),
  obtener_historial_otros_empleados: async (filtroEmpleado = '') => ([]),
  eliminar_registro_asistencia: async (idRegistro) => ({ exito: true, mensaje: 'Registro eliminado (simulado).' }),
  obtener_todos_registros_empleado: async (empleado, mesAnio = '') => ([]),
  obtener_todos_usuarios: async (area = null) => []
};

let cachedApi = null;

async function getApi() {
  if (cachedApi && cachedApi !== mockApi) return cachedApi;

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

    // Fallback tras 3.5 segundos si no estamos dentro de pywebview
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (window.pywebview && window.pywebview.api) {
          cachedApi = window.pywebview.api;
          resolve(cachedApi);
        } else {
          console.info('[apiBridge] Corriendo en modo navegador web con datos simulados.');
          // NO bloquear permanentemente cachedApi con mockApi para permitir reintento
          resolve(mockApi);
        }
      }
    }, 3500);
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

  async guardarRosterMultiple(listaDatos) {
    const bridge = await getApi();
    if (bridge.guardar_roster_multiple) {
      return await bridge.guardar_roster_multiple(listaDatos);
    }
    const res = [];
    for (const d of listaDatos) {
      res.push(await this.guardarRoster(d));
    }
    return { exito: res.every(r => r && r.exito), resultados: res };
  },

  async deduplicarSheets() {
    const bridge = await getApi();
    if (bridge.deduplicar_sheets) {
      return await bridge.deduplicar_sheets();
    }
    return { exito: false, error: 'Función no disponible' };
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
  },

  async refrescarCatalogos() {
    const bridge = await getApi();
    if (bridge.refrescar_catalogos_sheets) {
      return await bridge.refrescar_catalogos_sheets();
    }
    return { exito: true };
  },

  async obtenerHistorialOtrosEmpleados(filtroEmpleado = '') {
    const bridge = await getApi();
    if (bridge.obtener_historial_otros_empleados) {
      return await bridge.obtener_historial_otros_empleados(filtroEmpleado);
    }
    return [];
  },

  async eliminarRegistroAsistencia(idRegistro) {
    const bridge = await getApi();
    if (bridge.eliminar_registro_asistencia) {
      return await bridge.eliminar_registro_asistencia(idRegistro);
    }
    return { exito: false };
  },

  async obtenerTodosRegistrosEmpleado(empleado, mesAnio = '') {
    const bridge = await getApi();
    if (bridge.obtener_todos_registros_empleado) {
      return await bridge.obtener_todos_registros_empleado(empleado, mesAnio);
    }
    return [];
  },

  async purgarRostersLocales() {
    const bridge = await getApi();
    if (bridge.purgar_rosters_locales) {
      return await bridge.purgar_rosters_locales();
    }
    return { exito: true };
  }
};


