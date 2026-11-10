// [FN-01.05] Pruebas Unitarias de Bloqueo Anti-Duplicados y Redirección por Rol (Vitest)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { esAdmin, esSubAdmin } from '../utils/permissions';

describe('[FN-01.05] Guardado de Check Diario: Cooldown 30s y Redirección por Rol', () => {
  const SEGUNDOS_BLOQUEO_GUARDADO = 30;
  const DELAY_REDIRECCION_NO_ADMIN_MS = 1200;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Reglas de Redirección Automática por Rol', () => {
    const rolesNoAdmin = [
      { id_usuario: '1', nombre: 'Operador Campo', rol_app: 'user_1' },
      { id_usuario: '2', nombre: 'Operador Oficina', rol_app: 'user_2' },
      { id_usuario: '3', nombre: 'Supervisor Core', rol_app: 'core' },
      { id_usuario: '4', nombre: 'Sin Rol Asignado', rol_app: null }
    ];

    const rolesAdmin = [
      { id_usuario: '10', nombre: 'Admin General', rol_app: 'admin' },
      { id_usuario: '11', nombre: 'Sub Administrador', rol_app: 'sub_admin' }
    ];

    rolesNoAdmin.forEach(usuario => {
      it(`redirige automáticamente tras ${DELAY_REDIRECCION_NO_ADMIN_MS}ms para el rol '${usuario.rol_app || 'nulo'}'`, () => {
        const onVolver = vi.fn();
        const toastSuccess = vi.fn();
        const esAdminOSubAdmin = esAdmin(usuario) || esSubAdmin(usuario);

        expect(esAdminOSubAdmin).toBe(false);

        // Simulación del flujo de éxito en CheckForm
        const respuestaApi = { exito: true, mensaje: '¡Check diario guardado con éxito!' };
        if (respuestaApi.exito && !esAdminOSubAdmin) {
          toastSuccess(respuestaApi.mensaje);
          setTimeout(() => {
            onVolver();
          }, DELAY_REDIRECCION_NO_ADMIN_MS);
        }

        expect(toastSuccess).toHaveBeenCalledWith('¡Check diario guardado con éxito!');
        expect(onVolver).not.toHaveBeenCalled();

        // Avanzar el temporizador hasta el umbral de redirección
        vi.advanceTimersByTime(DELAY_REDIRECCION_NO_ADMIN_MS);
        expect(onVolver).toHaveBeenCalledTimes(1);
      });
    });

    rolesAdmin.forEach(usuario => {
      it(`mantiene en el formulario sin redirección automática para el rol '${usuario.rol_app}'`, () => {
        const onVolver = vi.fn();
        const toastSuccess = vi.fn();
        const esAdminOSubAdmin = esAdmin(usuario) || esSubAdmin(usuario);

        expect(esAdminOSubAdmin).toBe(true);

        const respuestaApi = { exito: true, mensaje: '¡Check diario guardado con éxito!' };
        if (respuestaApi.exito && !esAdminOSubAdmin) {
          toastSuccess(respuestaApi.mensaje);
          setTimeout(() => {
            onVolver();
          }, DELAY_REDIRECCION_NO_ADMIN_MS);
        }

        // Avanzar tiempo suficiente para comprobar que jamás se activa onVolver
        vi.advanceTimersByTime(DELAY_REDIRECCION_NO_ADMIN_MS * 2);
        expect(onVolver).not.toHaveBeenCalled();
        expect(toastSuccess).not.toHaveBeenCalled();
      });
    });
  });

  describe('Candado Anti-Duplicados (Cooldown 30 Segundos)', () => {
    it('bloquea reenvíos inmediatos mientras cooldownSegundos > 0 o bloqueoEnvioRef esté activo', () => {
      let cooldownSegundos = 0;
      const bloqueoEnvioRef = { current: false };
      let enviando = false;
      const mockApiGuardar = vi.fn().mockResolvedValue({ exito: true });

      const intentarEnvio = async () => {
        if (enviando || cooldownSegundos > 0 || bloqueoEnvioRef.current) {
          return { bloqueado: true };
        }
        bloqueoEnvioRef.current = true;
        cooldownSegundos = SEGUNDOS_BLOQUEO_GUARDADO;
        enviando = true;
        try {
          const res = await mockApiGuardar();
          return { bloqueado: false, res };
        } finally {
          enviando = false;
        }
      };

      // Primer intento: debe proceder y activar cooldown
      intentarEnvio();
      expect(mockApiGuardar).toHaveBeenCalledTimes(1);
      expect(cooldownSegundos).toBe(30);
      expect(bloqueoEnvioRef.current).toBe(true);

      // Segundo intento inmediato (doble clic accidental): debe ser rechazado
      intentarEnvio().then(res => {
        expect(res.bloqueado).toBe(true);
      });
      expect(mockApiGuardar).toHaveBeenCalledTimes(1);
    });

    it('libera el bloqueo automáticamente tras transcurrir los 30 segundos', () => {
      let cooldownSegundos = SEGUNDOS_BLOQUEO_GUARDADO;
      const bloqueoEnvioRef = { current: true };

      // Simulación del efecto regresivo cada 1000ms
      const interval = setInterval(() => {
        if (cooldownSegundos <= 1) {
          cooldownSegundos = 0;
          bloqueoEnvioRef.current = false;
          clearInterval(interval);
        } else {
          cooldownSegundos -= 1;
        }
      }, 1000);

      // A los 15 segundos el botón continúa bloqueado
      vi.advanceTimersByTime(15000);
      expect(cooldownSegundos).toBe(15);
      expect(bloqueoEnvioRef.current).toBe(true);

      // A los 30 segundos el candado se libera
      vi.advanceTimersByTime(15000);
      expect(cooldownSegundos).toBe(0);
      expect(bloqueoEnvioRef.current).toBe(false);
    });

    it('resetea el cooldown si la API retorna error para permitir corrección inmediata', async () => {
      let cooldownSegundos = 0;
      const bloqueoEnvioRef = { current: false };
      let enviando = false;
      const mockApiFallo = vi.fn().mockResolvedValue({ exito: false, error: 'Dato inválido' });

      const intentarEnvio = async () => {
        if (enviando || cooldownSegundos > 0 || bloqueoEnvioRef.current) return;
        bloqueoEnvioRef.current = true;
        cooldownSegundos = SEGUNDOS_BLOQUEO_GUARDADO;
        enviando = true;
        try {
          const res = await mockApiFallo();
          if (!res.exito) {
            bloqueoEnvioRef.current = false;
            cooldownSegundos = 0;
          }
        } finally {
          enviando = false;
        }
      };

      await intentarEnvio();
      expect(mockApiFallo).toHaveBeenCalledTimes(1);
      expect(cooldownSegundos).toBe(0);
      expect(bloqueoEnvioRef.current).toBe(false);
    });
  });
});

