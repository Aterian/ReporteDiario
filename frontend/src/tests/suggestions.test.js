// [FN-06.10] Contrato y comportamiento del buzón
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualizarSugerenciaEnBandeja,
  obtenerDatosSugerencias,
  prepararSugerencia,
  TIPOS_SUGERENCIA,
} from '../types/suggestions';

describe('Formulario de sugerencias', () => {
  it('incluye Aplicaciones y normaliza los campos opcionales', () => {
    expect(TIPOS_SUGERENCIA).toHaveLength(7);
    expect(TIPOS_SUGERENCIA).toContain('Aplicaciones');
    expect(prepararSugerencia('   ', 'Aplicaciones', '  Mejorar el buscador.  ')).toEqual({
      nombre: null,
      tipo_sugerencia: 'Aplicaciones',
      descripcion_sugerencia: 'Mejorar el buscador.',
    });
    expect(prepararSugerencia('  Marta R. ', '', 'Idea').nombre).toBe('Marta R.');
    expect(prepararSugerencia('', '', 'Idea').tipo_sugerencia).toBe('Otro');
  });

  it('rechaza una descripción vacía después de recortarla', () => {
    expect(() => prepararSugerencia('', '', '  \t\n  ')).toThrow('Escribí tu sugerencia');
  });
});

describe('Caché de la bandeja', () => {
  it('ajusta contadores sin duplicarlos al reconciliar la fecha del servidor', () => {
    const sugerencia = {
      id_participacion: 'prueba',
      estado_revision: 'nueva',
      nivel_urgencia: 'urgente',
      respuesta: null,
      fecha_hora_resolucion: null,
    };
    const anterior = {
      sugerencias: [sugerencia],
      total: 1,
      contadores: { nuevas: 1, urgentes_abiertas: 1, para_aplicar: 0, resueltas: 0 },
    };
    const cambio = { estado_revision: 'resuelta', nivel_urgencia: 'urgente', respuesta: 'Corregido' };
    const optimista = actualizarSugerenciaEnBandeja(anterior, sugerencia.id_participacion, cambio);
    const definitiva = actualizarSugerenciaEnBandeja(optimista, sugerencia.id_participacion, {
      ...cambio,
      fecha_hora_resolucion: '2026-11-10T15:00:00Z',
    });

    expect(anterior.sugerencias[0]).toBe(sugerencia);
    expect(anterior.contadores.nuevas).toBe(1);
    expect(optimista.sugerencias[0].fecha_hora_resolucion).toBeNull();
    expect(definitiva.sugerencias[0].fecha_hora_resolucion).toBe('2026-11-10T15:00:00Z');
    expect(definitiva.contadores).toEqual({ nuevas: 0, urgentes_abiertas: 0, para_aplicar: 0, resueltas: 1 });
  });
});

describe('Adaptador del puente de sugerencias', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('envía los payloads al método correspondiente y conserva los errores de dominio', async () => {
    const resultado = { exito: true, datos: { id_participacion: 'prueba' }, error: null, codigo_error: null };
    const conflicto = { exito: false, datos: null, error: 'Actualizá la bandeja.', codigo_error: 'ERROR_CONCURRENCIA' };
    const puente = {
      crear_sugerencia: vi.fn().mockResolvedValue(resultado),
      obtener_sugerencias: vi.fn().mockResolvedValue({ exito: true, datos: { sugerencias: [], total: 0 }, error: null, codigo_error: null }),
      actualizar_sugerencia: vi.fn().mockResolvedValue(conflicto),
    };
    vi.stubGlobal('window', { pywebview: { api: puente } });
    const { api } = await import('../services/apiBridge');
    const solicitud = prepararSugerencia('', 'Aplicaciones', 'Una idea');
    const filtros = { busqueda: 'idea', estado_revision: 'nueva', nivel_urgencia: null, pagina: 2, limite: 20 };
    const original = { estado_revision: 'nueva', nivel_urgencia: 'con tiempo', respuesta: '  ' };
    const cambio = { id_participacion: 'prueba', estado_revision: 'vista', nivel_urgencia: 'urgente', respuesta: null, original };

    expect(await api.crearSugerencia(solicitud)).toEqual(resultado);
    expect(puente.crear_sugerencia).toHaveBeenCalledWith(solicitud);
    expect((await api.obtenerSugerencias(filtros)).datos.total).toBe(0);
    expect(puente.obtener_sugerencias).toHaveBeenCalledWith(filtros);
    expect(await api.actualizarSugerencia(cambio)).toEqual(conflicto);
    expect(puente.actualizar_sugerencia).toHaveBeenCalledWith(cambio);
    expect(() => obtenerDatosSugerencias(conflicto, 'No disponible')).toThrow(expect.objectContaining({
      codigo: 'ERROR_CONCURRENCIA',
    }));
  });

  it('distingue un puente que no ofrece la bandeja de un resultado vacío', async () => {
    vi.stubGlobal('window', { pywebview: { api: {} } });
    const { api } = await import('../services/apiBridge');
    expect(await api.obtenerSugerencias({})).toEqual({
      exito: false,
      datos: null,
      error: 'El puente de escritorio no admite el buzón de sugerencias.',
      codigo_error: 'PUENTE_NO_DISPONIBLE',
    });
  });
});
