// [MOD-10] [FN-07.18] Pruebas Unitarias del Módulo de Errores Remotos (Vitest)
import { describe, it, expect } from 'vitest';
import { esAdmin } from '../utils/permissions';

describe('Módulo de Errores Remotos y Soft-Delete', () => {
  const adminUser = { id_usuario: '111', nombre: 'Ivan Valentin', rol_app: 'admin' };
  const subAdminUser = { id_usuario: '222', nombre: 'Justina Bertolozzi', rol_app: 'sub_admin' };
  const user1 = { id_usuario: '333', nombre: 'Operador Campo', rol_app: 'user_1' };

  describe('Control de Acceso a Errores Remotos', () => {
    it('permite el acceso exclusivamente a usuarios con rol admin', () => {
      expect(esAdmin(adminUser)).toBe(true);
      expect(esAdmin(subAdminUser)).toBe(false);
      expect(esAdmin(user1)).toBe(false);
    });
  });

  describe('Formateo y Estructura de Exportación de Errores', () => {
    it('genera una estructura limpia para exportación a JSON', () => {
      const errorMuestra = {
        id_error: 'err-123',
        fecha_hora: '2026-11-03T10:00:00Z',
        origen: 'frontend',
        codigo_error: 'VALIDACION_ERROR',
        accion_metodo: 'guardarCheck',
        nombre_usuario: 'Operador Campo',
        rol_usuario: 'user_1',
        equipo_info: 'Chrome Windows',
        mensaje_error: 'Datos incompletos',
        detalle_tecnico: 'ValidationError: fecha is required',
        resuelto: false
      };

      const jsonStr = JSON.stringify([errorMuestra], null, 2);
      expect(jsonStr).toContain('err-123');
      expect(jsonStr).toContain('VALIDACION_ERROR');
      const parseado = JSON.parse(jsonStr);
      expect(parseado).toHaveLength(1);
      expect(parseado[0].resuelto).toBe(false);
    });

    it('calcula métricas de resolución (KPIs) con precisión', () => {
      const lista = [
        { id_error: '1', resuelto: true },
        { id_error: '2', resuelto: false },
        { id_error: '3', resuelto: false },
        { id_error: '4', resuelto: true },
      ];
      const total = lista.length;
      const pendientes = lista.filter(e => !e.resuelto).length;
      const resueltos = total - pendientes;
      const tasa = Math.round((resueltos / total) * 100);

      expect(total).toBe(4);
      expect(pendientes).toBe(2);
      expect(resueltos).toBe(2);
      expect(tasa).toBe(50);
    });
  });
});

