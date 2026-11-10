import { toast } from 'sonner';

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
    if (['S', 'SIG'].includes(area.toUpperCase())) {
      const filtradosSig = todos.filter(t => t.includes('-S-') || t.includes('-A-'));
      return filtradosSig.length > 0 ? filtradosSig : todos;
    }
    if (['I', 'INGENIERIA', 'INGENIERÍA', 'M', 'MENSURA'].includes(area.toUpperCase())) {
      const filtradosIM = todos.filter(t => t.includes('-I-') || t.includes('-M-'));
      return filtradosIM.length > 0 ? filtradosIM : todos;
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
  crear_rosters_desde_asistencias: async (lista) => ({ exito: true, guardados: (lista || []).length, absorbidos: 0, resultados: [] }),
  aplicar_tarifa_local_roster: async (datos) => ({
    exito: true,
    mensaje: 'Tarifa local asignada con éxito (modo simulado).',
    precio_dia: Number(datos.precio_dia) || 0,
    precio_domingo: Number(datos.precio_domingo) || 0
  }),
  obtener_rosters: async (desde, hasta) => ([]),
  eliminar_roster: async (id) => ({ exito: true }),
  purgar_rosters_locales: async () => ({ exito: true }),
  exportar_roster_excel: async (anio, mes, proyecto = '') => {
    alert(`[Modo Simulado] Se exportaría el Excel para "${proyecto || 'Todos'}" del mes ${mes}/${anio}.`);
    return { exito: true, mensaje: 'Excel generado (modo simulado).' };
  },
  exportar_informe_liquidacion: async (datosInforme) => {
    alert(`[Modo Simulado] Se exportaría el Informe de Liquidación para "${datosInforme?.empleado || 'Colaborador'}".`);
    return { exito: true, mensaje: 'Informe de liquidación generado (modo simulado).' };
  },
  redimensionar_ventana: async () => ({ exito: true }),
  maximizar_ventana: async () => ({ exito: true }),
  restaurar_ventana: async () => ({ exito: true }),
  refrescar_catalogos_sheets: async () => ({ exito: true, mensaje: 'Catálogos actualizados (simulado).' }),
  obtener_historial_otros_empleados: async (filtroEmpleado = '') => ([]),
  eliminar_registro_asistencia: async (idRegistro) => ({ exito: true, mensaje: 'Registro eliminado (simulado).' }),
  obtener_todos_registros_empleado: async (empleado, mesAnio = '') => ([]),
  obtener_todos_usuarios: async (area = null) => [],
  obtener_estado_diario_empleados: async (fecha = '') => ({
    fecha: fecha || new Date().toISOString().slice(0, 10),
    total_empleados: 0,
    registrados: 0,
    pendientes: 0,
    lista: []
  }),
  obtener_resumen_modificaciones: async () => ({
    total_modificaciones: 0,
    ultimas_24h: 0,
    no_sincronizadas: 0,
    ultima_modificacion: null
  }),
  obtener_modificaciones_recientes: async (limite = 30) => [],
  marcar_modificacion_por_asistencia_revisada: async (idAsistencia) => ({ exito: true }),
  marcar_modificaciones_por_asistencias_lote: async (ids) => ({ exito: true, afectados: (ids || []).length }),
  actualizar_tipo_costo_masivo: async (idsAsistencia = [], tipoCosto = '') => ({
    exito: true,
    actualizados: idsAsistencia.length
  }),
  obtener_actividad_dia_anterior: async () => ({
    fecha: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    total: 0,
    enviados: 0,
    pendientes: 0,
    usuarios: []
  }),
  obtener_tarifas_roster: async () => [],
  guardar_tarifa_roster: async (datos) => ({ exito: true, id_tarifa: 'mock-tarifa-' + Date.now() }),
  actualizar_usuario_y_sueldo: async (datos) => ({ exito: true, id_usuario: datos.id_usuario }),
  obtener_liquidacion: async () => ({ exito: true, liquidacion: null }),
  actualizar_costo_dia_manual: async (datos) => ({ exito: true, mensaje: 'Costo actualizado (simulado).' })
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
          resolve(import.meta.env.DEV ? mockApi : new Proxy({}, { get: (_target, key) => key === 'then' ? undefined : async () => ({ exito: false, error: 'El puente de escritorio no está disponible.', codigo_error: 'PUENTE_NO_DISPONIBLE' }) }));
        }
      }
    }, 3500);
  });
}

// [FN-06.10] Invocar el puente de sugerencias
async function invocarSugerencias(metodo, datos) {
  const bridge = await getApi();
  if (!bridge[metodo]) {
    return {
      exito: false,
      datos: null,
      error: 'El puente de escritorio no admite el buzón de sugerencias.',
      codigo_error: 'PUENTE_NO_DISPONIBLE'
    };
  }
  return await bridge[metodo](datos);
}

const apiBase = {
  /**
   * @param {import('../types/suggestions').SugerenciaCreate} datos
   * @returns {Promise<import('../types/suggestions').RespuestaSugerencias<import('../types/suggestions').ComprobanteSugerencia>>}
   */
  async crearSugerencia(datos) {
    return invocarSugerencias('crear_sugerencia', datos);
  },

  /**
   * @param {import('../types/suggestions').FiltrosSugerencias} filtros
   * @returns {Promise<import('../types/suggestions').RespuestaSugerencias<import('../types/suggestions').BandejaSugerencias>>}
   */
  async obtenerSugerencias(filtros) {
    return invocarSugerencias('obtener_sugerencias', filtros);
  },

  /**
   * @param {import('../types/suggestions').SugerenciaUpdate} datos
   * @returns {Promise<import('../types/suggestions').RespuestaSugerencias<import('../types/suggestions').Sugerencia>>}
   */
  async actualizarSugerencia(datos) {
    return invocarSugerencias('actualizar_sugerencia', datos);
  },

  async obtenerLiquidacion(empleado, cicloCobro, forzarRecalculo = false) {
    const bridge = await getApi();
    if (!bridge.obtener_liquidacion) return { exito: false, error: 'El puente no admite consultas de liquidación.' };
    return await bridge.obtener_liquidacion(empleado, cicloCobro, forzarRecalculo);
  },
  async obtenerEstadoSesion() {
    const bridge = await getApi();
    if (bridge.obtener_estado_sesion) {
      const res = await bridge.obtener_estado_sesion();
      if (res && res.exito === false) {
        return { logueado: false, usuario: null, error: res.error };
      }
      return res || { logueado: false, usuario: null };
    }
    return { logueado: false, usuario: null };
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
      const res = await bridge.obtener_servicios(area);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron consultar los servicios en PostgreSQL.', {
          description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
          duration: 4500
        });
        return [];
      }
      return Array.isArray(res) ? res : [];
    }
    return [];
  },

  async guardarCheckDiario(datos) {
    const bridge = await getApi();
    return await bridge.guardar_check_diario(datos);
  },

  async obtenerHistorial() {
    const bridge = await getApi();
    if (bridge.obtener_historial) {
      const res = await bridge.obtener_historial();
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudo cargar el historial en PostgreSQL.', {
          description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
          duration: 4500
        });
        return [];
      }
      return Array.isArray(res) ? res : [];
    }
    return [];
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
    const fallback = { registrado: false, es_ultimo_dia_mes: false, cantidad_faltantes: 0 };
    const bridge = await getApi();
    if (bridge.verificar_registro_hoy) {
      const res = await bridge.verificar_registro_hoy();
      if (res && res.exito === false) {
        return fallback;
      }
      return res || fallback;
    }
    return fallback;
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

  async obtenerNotificacionesModificaciones(soloNoRevisadas = true) {
    const bridge = await getApi();
    if (bridge.obtener_notificaciones_modificaciones) {
      const res = await bridge.obtener_notificaciones_modificaciones(soloNoRevisadas);
      if (res && res.exito === false) {
        return [];
      }
      return Array.isArray(res) ? res : [];
    }
    return [];
  },

  async marcarModificacionRevisada(idModificacion) {
    const bridge = await getApi();
    if (bridge.marcar_modificacion_revisada) {
      return await bridge.marcar_modificacion_revisada(idModificacion);
    }
    return { exito: true };
  },

  async marcarModificacionPorAsistenciaRevisada(idAsistencia) {
    const bridge = await getApi();
    if (bridge.marcar_modificacion_por_asistencia_revisada) {
      return await bridge.marcar_modificacion_por_asistencia_revisada(idAsistencia);
    }
    return { exito: true };
  },

  // [FN-07.16] Marcar modificaciones de múltiples asistencias como revisadas en lote
  async marcarModificacionesPorAsistenciasLote(idsAsistencia) {
    if (!idsAsistencia || idsAsistencia.length === 0) {
      return { exito: true, afectados: 0 };
    }
    const bridge = await getApi();
    if (bridge.marcar_modificaciones_por_asistencias_lote) {
      return await bridge.marcar_modificaciones_por_asistencias_lote(idsAsistencia);
    }
    let afectados = 0;
    for (const id of idsAsistencia) {
      const r = await this.marcarModificacionPorAsistenciaRevisada(id);
      if (r && r.exito) afectados += (r.afectados || 1);
    }
    return { exito: true, afectados };
  },

  async marcarTodasModificacionesRevisadas() {
    const bridge = await getApi();
    if (bridge.marcar_todas_modificaciones_revisadas) {
      return await bridge.marcar_todas_modificaciones_revisadas();
    }
    return { exito: true };
  },

  async verificarNuevasModificacionesSheets() {
    const bridge = await getApi();
    if (bridge.verificar_nuevas_modificaciones_sheets) {
      return await bridge.verificar_nuevas_modificaciones_sheets();
    }
    return { exito: true, nuevas: 0 };
  },

  async obtenerTodosUsuarios(area = null, incluirInactivos = false) {
    const bridge = await getApi();
    if (bridge.obtener_todos_usuarios) {
      const res = await bridge.obtener_todos_usuarios(area, incluirInactivos);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudo cargar la nómina de colaboradores en PostgreSQL.', {
          description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
          duration: 4500
        });
        return [];
      }
      return Array.isArray(res) ? res : [];
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

  async crearRostersDesdeAsistencias(listaDatos) {
    const bridge = await getApi();
    if (bridge.crear_rosters_desde_asistencias) {
      return await bridge.crear_rosters_desde_asistencias(listaDatos);
    }
    return await this.guardarRosterMultiple(listaDatos);
  },

  async deduplicarSheets() {
    const bridge = await getApi();
    if (bridge.deduplicar_sheets) {
      return await bridge.deduplicar_sheets();
    }
    return { exito: false, error: 'Función no disponible' };
  },

  async limpiarYDescargarSheets() {
    const bridge = await getApi();
    if (bridge.limpiar_y_descargar_sheets) {
      return await bridge.limpiar_y_descargar_sheets();
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
      const res = await bridge.obtener_rosters(fechaDesde, fechaHasta);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron consultar los turnos de roster en PostgreSQL.', {
          description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
          duration: 4500
        });
        return [];
      }
      return Array.isArray(res) ? res : [];
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

  async aplicarTarifaLocalRoster(datos) {
    const bridge = await getApi();
    if (bridge.aplicar_tarifa_local_roster) {
      return await bridge.aplicar_tarifa_local_roster(datos);
    }
    return {
      exito: true,
      mensaje: 'Tarifa guardada localmente.',
      precio_dia: Number(datos.precio_dia) || 0,
      precio_domingo: Number(datos.precio_domingo) || 0
    };
  },

  async exportarInformeLiquidacion(datosInforme) {
    const bridge = await getApi();
    if (bridge.exportar_informe_liquidacion) {
      return await bridge.exportar_informe_liquidacion(datosInforme);
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

  async obtenerHistorialOtrosEmpleados(filtroEmpleado = '', mesAnio = '', limite = null, offset = 0) {
    const bridge = await getApi();
    if (bridge.obtener_historial_otros_empleados) {
      const res = await bridge.obtener_historial_otros_empleados(filtroEmpleado, mesAnio, limite, offset);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudo consultar el historial en PostgreSQL.', {
          description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
          duration: 4500
        });
        return [];
      }
      return Array.isArray(res) ? res : [];
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

  async obtenerTodosRegistrosEmpleado(empleado, mesAnio = '', limite = null, offset = 0) {
    const bridge = await getApi();
    if (bridge.obtener_todos_registros_empleado) {
      const res = await bridge.obtener_todos_registros_empleado(empleado, mesAnio, limite, offset);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron consultar los registros del colaborador en PostgreSQL.', {
          description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
          duration: 4500
        });
        return [];
      }
      return Array.isArray(res) ? res : [];
    }
    return [];
  },

  async purgarRostersLocales() {
    const bridge = await getApi();
    if (bridge.purgar_rosters_locales) {
      return await bridge.purgar_rosters_locales();
    }
    return { exito: true };
  },

  async obtenerEstadoDiarioEmpleados(fecha = '') {
    const bridge = await getApi();
    if (bridge.obtener_estado_diario_empleados) {
      return await bridge.obtener_estado_diario_empleados(fecha);
    }
    return { fecha: fecha || new Date().toISOString().slice(0, 10), total_empleados: 0, registrados: 0, pendientes: 0, lista: [] };
  },

  async obtenerResumenModificaciones() {
    const fallback = { total_modificaciones: 0, ultimas_24h: 0, no_sincronizadas: 0, ultima_modificacion: null };
    const bridge = await getApi();
    if (bridge.obtener_resumen_modificaciones) {
      const res = await bridge.obtener_resumen_modificaciones();
      if (res && res.exito === false) {
        return fallback;
      }
      return res || fallback;
    }
    return fallback;
  },

  async obtenerModificacionesRecientes(limite = 30) {
    const bridge = await getApi();
    if (bridge.obtener_modificaciones_recientes) {
      const res = await bridge.obtener_modificaciones_recientes(limite);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron consultar las modificaciones en PostgreSQL.', {
          description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
          duration: 4500
        });
        return [];
      }
      return Array.isArray(res) ? res : [];
    }
    return [];
  },

  async actualizarTipoCostoMasivo(idsAsistencia, tipoCosto) {
    const bridge = await getApi();
    if (bridge.actualizar_tipo_costo_masivo) {
      try {
        return await bridge.actualizar_tipo_costo_masivo(idsAsistencia, tipoCosto);
      } catch (err) {
        return await bridge.actualizar_tipo_costo_masivo({
          ids: idsAsistencia,
          tipo_costo: tipoCosto
        });
      }
    }
    return { exito: true, actualizados: (idsAsistencia || []).length };
  },

  async obtenerActividadDiaAnterior() {
    const fallback = {
      fecha: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      total: 0,
      enviados: 0,
      pendientes: 0,
      usuarios: []
    };
    const bridge = await getApi();
    if (bridge.obtener_actividad_dia_anterior) {
      const res = await bridge.obtener_actividad_dia_anterior();
      if (res && res.exito === false) {
        return fallback;
      }
      return res || fallback;
    }
    return fallback;
  },

  async obtenerTarifasRoster() {
    const bridge = await getApi();
    if (bridge.obtener_tarifas_roster) {
      const res = await bridge.obtener_tarifas_roster();
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron consultar las tarifas de roster en PostgreSQL.', {
          description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
          duration: 4500
        });
        return [];
      }
      return Array.isArray(res) ? res : [];
    }
    return [];
  },

  async guardarTarifaRoster(datos) {
    const bridge = await getApi();
    if (bridge.guardar_tarifa_roster) {
      return await bridge.guardar_tarifa_roster(datos);
    }
    return { exito: false, error: 'Función no disponible en este entorno.' };
  },

  async actualizarUsuarioYSueldo(datos) {
    const bridge = await getApi();
    if (bridge.actualizar_usuario_y_sueldo) {
      return await bridge.actualizar_usuario_y_sueldo(datos);
    }
    return { exito: false, error: 'Función no disponible en este entorno.' };
  },

  async actualizarConfiguracionSueldoUsuario(datos) {
    const bridge = await getApi();
    if (bridge.actualizar_configuracion_sueldo_usuario) {
      return await bridge.actualizar_configuracion_sueldo_usuario(datos);
    }
    return { exito: false, error: 'Función no disponible en este entorno.' };
  },

  async actualizarCostoDiaManual(datos) {
    const bridge = await getApi();
    if (bridge.actualizar_costo_dia_manual) {
      return await bridge.actualizar_costo_dia_manual(datos);
    }
    if (bridge.guardar_costo_dia) {
      return await bridge.guardar_costo_dia(datos);
    }
    return { exito: false, error: 'El puente no admite la actualización de costos.' };
  },

  // [FN-06.07] Guardar costo del día directamente
  async guardarCostoDia(datos) {
    const bridge = await getApi();
    if (bridge.guardar_costo_dia) {
      return await bridge.guardar_costo_dia(datos);
    }
    return await this.actualizarCostoDiaManual(datos);
  },

  // [FN-07.21] Telemetría y captura de errores remotos
  async reportarErrorCliente(datos) {
    try {
      const bridge = await getApi();
      if (bridge.reportar_error_cliente) {
        return await bridge.reportar_error_cliente(datos);
      }
    } catch {
      // Silencioso para evitar bucles
    }
    return { exito: false };
  },

  async obtenerErroresRemotos(soloPendientes = true, limite = 50) {
    const bridge = await getApi();
    if (bridge.obtener_errores_remotos) {
      const res = await bridge.obtener_errores_remotos(soloPendientes, limite);
      if (res && res.exito === false) {
        return [];
      }
      return Array.isArray(res) ? res : (res?.datos || []);
    }
    return [];
  },

  async marcarErrorRemotoResuelto(idError = null, todos = false) {
    const bridge = await getApi();
    if (bridge.marcar_error_remoto_resuelto) {
      return await bridge.marcar_error_remoto_resuelto(idError, todos);
    }
    return { exito: false, error: 'Función no disponible en el puente.' };
  },

  // [FN-04.14] Alta de nuevo empleado y sueldo base
  async crearUsuarioYSueldo(datos) {
    const bridge = await getApi();
    if (bridge.crear_usuario_y_sueldo) {
      return await bridge.crear_usuario_y_sueldo(datos);
    }
    return { exito: false, error: 'Función no disponible en el puente.' };
  },

  // [FN-07.22] Gestión integral de proyectos para administradores
  async obtenerProyectosAdmin(incluirInactivos = true) {
    const bridge = await getApi();
    if (bridge.obtener_proyectos_admin) {
      const res = await bridge.obtener_proyectos_admin(incluirInactivos);
      if (res && res.exito === false) {
        toast.error(res.error || 'No se pudieron consultar los proyectos en PostgreSQL.', {
          description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
          duration: 4500
        });
        return [];
      }
      return Array.isArray(res) ? res : [];
    }
    return [];
  },

  async crearProyecto(datos) {
    const bridge = await getApi();
    if (bridge.crear_proyecto) {
      return await bridge.crear_proyecto(datos);
    }
    return { exito: false, error: 'Función no disponible en el puente.' };
  },

  async actualizarProyecto(datos) {
    const bridge = await getApi();
    if (bridge.actualizar_proyecto) {
      return await bridge.actualizar_proyecto(datos);
    }
    return { exito: false, error: 'Función no disponible en el puente.' };
  },

  async exportarErroresRemotos(soloPendientes = false) {
    const bridge = await getApi();
    if (bridge.exportar_errores_remotos) {
      return await bridge.exportar_errores_remotos(soloPendientes);
    }
    return { exito: false, error: 'Función no disponible en el puente.' };
  }
};

/**
 * [FN-00.03] Interceptor centralizado para métodos de la API.
 * Captura excepciones y valida automáticamente el contrato canónico.
 * Si !respuesta.exito, dispara un toast.error() elegante sin bloquear el hilo.
 */
function envolverLlamadaApi(nombreMetodo, fn) {
  return async function (...args) {
    try {
      const res = await fn(...args);

      if (res && typeof res === 'object') {
        // Métodos de verificación o polling en segundo plano no deben molestar con toasts de error
        const metodosSilenciosos = ['verificarRegistroHoy', 'verificarActualizacion', 'obtenerEstadoSesion', 'obtenerServicios', 'reportarErrorCliente', 'obtenerErroresRemotos', 'crearSugerencia', 'obtenerSugerencias', 'actualizarSugerencia'];

        if (res.exito === false && res.error && !metodosSilenciosos.includes(nombreMetodo)) {
          toast.error(res.error, {
            description: res.codigo_error ? `Código: ${res.codigo_error}` : undefined,
            duration: 4500
          });
        }
      }

      return res;
    } catch (error) {
      console.error(`[apiBridge] Error al invocar ${nombreMetodo}:`, error);
      const mensaje = error?.message || 'Error de comunicación con el sistema.';
      toast.error(mensaje, {
        description: 'Verifique la conexión interna con el servidor.',
        duration: 5000
      });
      return {
        exito: false,
        datos: null,
        error: mensaje,
        codigo_error: 'ERROR_CONEXION_PUENTE'
      };
    }
  };
}

// Proxificamos apiBase para interceptar transparentemente todas las llamadas
export const api = new Proxy(apiBase, {
  get(target, prop, receiver) {
    const orig = Reflect.get(target, prop, receiver);
    if (typeof orig === 'function') {
      return envolverLlamadaApi(prop, orig.bind(target));
    }
    return orig;
  }
});

export { toast };



