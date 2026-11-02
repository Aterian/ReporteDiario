// [FN-07.20] Pruebas Unitarias de Modalidad de Cálculo Salarial y Reglas de Base 30 (Vitest)
import { describe, it, expect } from 'vitest';
import { esAdmin, esSubAdmin } from '../utils/permissions';
import { api } from '../services/apiBridge';

describe('Modalidad de Cálculo Salarial (Base 30 vs Por Día) - [FN-07.20]', () => {
  // Función auxiliar pura que replica la lógica canónica de ajusteBase30 de OtherEmployeesHistoryView
  const calcularAjusteBase30 = ({
    modalidadCalculo,
    lugarHabitual,
    diasOficina,
    diasObra,
    diasEnMesCalendario
  }) => {
    if (modalidadCalculo !== 'base_30') return { deltaOfi: 0, deltaObra: 0, activo: false };
    const totalReales = diasOficina + diasObra;
    if (totalReales < diasEnMesCalendario && totalReales <= 30) {
      return { deltaOfi: 0, deltaObra: 0, activo: false };
    }
    const deltaTotal = 30 - totalReales;
    if (lugarHabitual === 'oficina') {
      const ofiFinal = diasOficina + deltaTotal;
      if (ofiFinal >= 0) {
        return { deltaOfi: deltaTotal, deltaObra: 0, activo: true };
      }
      return { deltaOfi: -diasOficina, deltaObra: Math.max(0, diasObra + ofiFinal), activo: true };
    } else {
      const obraFinal = diasObra + deltaTotal;
      if (obraFinal >= 0) {
        return { deltaOfi: 0, deltaObra: deltaTotal, activo: true };
      }
      return { deltaOfi: Math.max(0, diasOficina + obraFinal), deltaObra: -diasObra, activo: true };
    }
  };

  describe('1. Regla de Meses Incompletos', () => {
    it('no aplica compensación si el empleado registró menos días que el total del mes (15 días en mes de 31)', () => {
      const ajuste = calcularAjusteBase30({
        modalidadCalculo: 'base_30',
        lugarHabitual: 'oficina',
        diasOficina: 15,
        diasObra: 0,
        diasEnMesCalendario: 31
      });

      expect(ajuste.activo).toBe(false);
      expect(ajuste.deltaOfi).toBe(0);
      expect(ajuste.deltaObra).toBe(0);
    });

    it('no aplica ajuste si el empleado registró 20 días en febrero (28 días)', () => {
      const ajuste = calcularAjusteBase30({
        modalidadCalculo: 'base_30',
        lugarHabitual: 'obra',
        diasOficina: 5,
        diasObra: 15,
        diasEnMesCalendario: 28
      });

      expect(ajuste.activo).toBe(false);
      expect(ajuste.deltaOfi).toBe(0);
      expect(ajuste.deltaObra).toBe(0);
    });
  });

  describe('2. Regla de Días Mixtos y Ajuste a 30 días en Meses Completos', () => {
    it('en mes de 31 días completo con lugar_habitual oficina, descuenta 1 día de oficina', () => {
      const ajuste = calcularAjusteBase30({
        modalidadCalculo: 'base_30',
        lugarHabitual: 'oficina',
        diasOficina: 21,
        diasObra: 10,
        diasEnMesCalendario: 31
      });

      expect(ajuste.activo).toBe(true);
      expect(ajuste.deltaOfi).toBe(-1); // 30 - 31 = -1 sobre oficina
      expect(ajuste.deltaObra).toBe(0); // Obra queda intacta
    });

    it('en mes de 31 días completo con lugar_habitual obra, descuenta 1 día de obra', () => {
      const ajuste = calcularAjusteBase30({
        modalidadCalculo: 'base_30',
        lugarHabitual: 'obra',
        diasOficina: 10,
        diasObra: 21,
        diasEnMesCalendario: 31
      });

      expect(ajuste.activo).toBe(true);
      expect(ajuste.deltaOfi).toBe(0);
      expect(ajuste.deltaObra).toBe(-1); // 30 - 31 = -1 sobre obra
    });

    it('en febrero (28 días) completo con lugar_habitual oficina, compensa +2 días a oficina', () => {
      const ajuste = calcularAjusteBase30({
        modalidadCalculo: 'base_30',
        lugarHabitual: 'oficina',
        diasOficina: 20,
        diasObra: 8,
        diasEnMesCalendario: 28
      });

      expect(ajuste.activo).toBe(true);
      expect(ajuste.deltaOfi).toBe(2); // 30 - 28 = +2 sobre oficina
      expect(ajuste.deltaObra).toBe(0);
    });

    it('en febrero (28 días) completo con lugar_habitual obra, compensa +2 días a obra', () => {
      const ajuste = calcularAjusteBase30({
        modalidadCalculo: 'base_30',
        lugarHabitual: 'obra',
        diasOficina: 8,
        diasObra: 20,
        diasEnMesCalendario: 28
      });

      expect(ajuste.activo).toBe(true);
      expect(ajuste.deltaOfi).toBe(0);
      expect(ajuste.deltaObra).toBe(2); // 30 - 28 = +2 sobre obra
    });
  });

  describe('3. Modalidad por_dia', () => {
    it('no aplica ningún ajuste en meses de 31 días cuando la modalidad es por_dia', () => {
      const ajuste = calcularAjusteBase30({
        modalidadCalculo: 'por_dia',
        lugarHabitual: 'oficina',
        diasOficina: 31,
        diasObra: 0,
        diasEnMesCalendario: 31
      });

      expect(ajuste.activo).toBe(false);
      expect(ajuste.deltaOfi).toBe(0);
      expect(ajuste.deltaObra).toBe(0);
    });

    it('no aplica ningún ajuste en febrero (28 días) cuando la modalidad es por_dia', () => {
      const ajuste = calcularAjusteBase30({
        modalidadCalculo: 'por_dia',
        lugarHabitual: 'obra',
        diasOficina: 0,
        diasObra: 28,
        diasEnMesCalendario: 28
      });

      expect(ajuste.activo).toBe(false);
      expect(ajuste.deltaOfi).toBe(0);
      expect(ajuste.deltaObra).toBe(0);
    });
  });

  describe('4. Permisos RBAC para Modificar Configuración Salarial', () => {
    const admin = { id_usuario: '1', rol_app: 'admin' };
    const subAdmin = { id_usuario: '2', rol_app: 'sub_admin' };
    const core = { id_usuario: '3', rol_app: 'core' };
    const user1 = { id_usuario: '4', rol_app: 'user_1' };
    const user2 = { id_usuario: '5', rol_app: 'user_2' };

    const puedeModificar = (usr) => esAdmin(usr) || esSubAdmin(usr);

    it('permite modificar modalidad a admin y sub_admin', () => {
      expect(puedeModificar(admin)).toBe(true);
      expect(puedeModificar(subAdmin)).toBe(true);
    });

    it('bloquea la modificación a core, user_1 y user_2', () => {
      expect(puedeModificar(core)).toBe(false);
      expect(puedeModificar(user1)).toBe(false);
      expect(puedeModificar(user2)).toBe(false);
    });
  });

  describe('5. Interfaz apiBridge para actualizarConfiguracionSueldoUsuario', () => {
    it('expone el método en el objeto api', () => {
      expect(typeof api.actualizarConfiguracionSueldoUsuario).toBe('function');
    });
  });
});
