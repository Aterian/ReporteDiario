// [FN-00.10] Disponibilidad del escritorio y compatibilidad del puente
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizarEstadoEscritorio } from '../services/desktopState';

describe('Disponibilidad del escritorio', () => {
  it('conserva estados permanentes y visibilidad nativa', () => {
    expect(normalizarEstadoEscritorio({
      exito: true, datos: { estado: 'esquema_incompatible', revision: 4, visible: false },
    })).toEqual({ estado: 'esquema_incompatible', revision: 4, visible: false });
  });
  it('no habilita operaciones ante un fallo de puente', () => {
    expect(normalizarEstadoEscritorio({ exito: false, error: 'No disponible' }).estado).toBe('sin_conexion');
  });
});

describe('Puente de inicialización', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { pywebview: { api: {} }, addEventListener: vi.fn() });
  });
  it('permite abrir el frontend con un backend anterior', async () => {
    const { api } = await import('../services/apiBridge');
    expect((await api.obtenerEstadoInicializacion()).estado).toBe('disponible');
  });
  it('consulta el estado local sin solicitar sesión ni datos', async () => {
    const estado = vi.fn().mockResolvedValue({ exito: true, datos: { estado: 'iniciando', revision: 1 } });
    const sesion = vi.fn();
    window.pywebview.api = { obtener_estado_inicializacion: estado, obtener_estado_sesion: sesion };
    const { api } = await import('../services/apiBridge');
    expect((await api.obtenerEstadoInicializacion()).estado).toBe('iniciando');
    expect(sesion).not.toHaveBeenCalled();
    expect(estado).toHaveBeenCalledOnce();
  });
  it('expone un reintento explícito sin enviar mutaciones', async () => {
    const reintento = vi.fn().mockResolvedValue({ exito: true, datos: { solicitado: true } });
    window.pywebview.api = { reintentar_conexion: reintento };
    const { api } = await import('../services/apiBridge');
    expect((await api.reintentarConexion()).exito).toBe(true);
    expect(reintento).toHaveBeenCalledOnce();
  });
});
