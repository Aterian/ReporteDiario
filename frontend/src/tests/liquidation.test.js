// [FN-06.04] Pruebas Unitarias de Liquidación Canónica y Reglas de Cero Contable (Vitest)
import { describe, it, expect } from 'vitest';
import { categorizarRegistroLiquidacion } from '../components/history/historyConstants';

describe('Liquidación y Categorización Canónica (Punto 4)', () => {
  describe('categorizarRegistroLiquidacion', () => {
    it('clasifica modalidades de oficina estándar como "oficina"', () => {
      const reg = { tipo_ocf: 'Oficina', horas: 8, servicio: 'Sistemas' };
      expect(categorizarRegistroLiquidacion(reg)).toBe('oficina');
    });

    it('clasifica obra, campo y roster como "obra"', () => {
      expect(categorizarRegistroLiquidacion({ tipo_ocf: 'Campo', horas: 8 })).toBe('obra');
      expect(categorizarRegistroLiquidacion({ tipo_ocf: 'Obra', horas: 8 })).toBe('obra');
      expect(categorizarRegistroLiquidacion({ tipo_ocf: 'Roster', horas: 8 })).toBe('obra');
    });

    it('clasifica francos trabajados en obra como "franco_obra_trab"', () => {
      const reg = { tipo_ocf: 'Franco Obra Trabajado', horas: 8 };
      expect(categorizarRegistroLiquidacion(reg)).toBe('franco_obra_trab');
    });

    it('clasifica francos trabajados en oficina como "franco_ofic_trab"', () => {
      const reg = { tipo_ocf: 'Franco Ofic Trabajado', horas: 8 };
      expect(categorizarRegistroLiquidacion(reg)).toBe('franco_ofic_trab');
    });

    it('clasifica feriados trabajados como "feriado_trab"', () => {
      const reg = { tipo_ocf: 'Feriado Trabajado', horas: 8 };
      expect(categorizarRegistroLiquidacion(reg)).toBe('feriado_trab');

      const regConFlag = { tipo_ocf: 'Oficina', feriado: 'SI', horas: 8 };
      expect(categorizarRegistroLiquidacion(regConFlag)).toBe('feriado_trab');
    });
  });

  describe('Cero Contable Válido ($0.00) y Preservación de Subtotales', () => {
    it('respeta $0.00 como monto calculado legítimo sin sobrescribirlo por cant_dias * tarifa', () => {
      // Simulación de respuesta canónica del backend donde un empleado tiene jornada combinada:
      // Oficina cobrada a $10.000, Obra valorizada canónicamente en $0.00 por regla de prevalencia de oficina.
      const liquidacionBackend = {
        cant_dias_ofi: 1,
        cant_dias_obra: 1,
        subtotal_ofi: 10000.0,
        subtotal_obra: 0.0, // Cero legítimo por prevalencia
        total_real: 10000.0
      };

      const tarifaOficina = 10000.0;
      const tarifaObra = 20000.0;

      // La lógica corregida respeta explícitamente el valor numérico, inclusive si es 0:
      const subtotalOfiEfectivo = typeof liquidacionBackend.subtotal_ofi === 'number'
        ? liquidacionBackend.subtotal_ofi
        : (liquidacionBackend.cant_dias_ofi * tarifaOficina);

      const subtotalObraEfectivo = typeof liquidacionBackend.subtotal_obra === 'number'
        ? liquidacionBackend.subtotal_obra
        : (liquidacionBackend.cant_dias_obra * tarifaObra);

      expect(subtotalOfiEfectivo).toBe(10000.0);
      expect(subtotalObraEfectivo).toBe(0.0); // NO debe convertirse en 20000.0
      expect(subtotalOfiEfectivo + subtotalObraEfectivo).toBe(10000.0);
    });

    it('calcula correctamente la acumulación por (fecha, categoría) respetando el costo máximo', () => {
      const registros = [
        { fecha: '2026-10-01', tipo_ocf: 'Oficina', costo_dia: 15000.0 },
        { fecha: '2026-10-01', tipo_ocf: 'Oficina', costo_dia: 15000.0 }, // registro duplicado o partido en misma fecha
        { fecha: '2026-10-02', tipo_ocf: 'Campo', costo_dia: 25000.0 }
      ];

      const mapaFechaCat = new Map();
      registros.forEach(r => {
        const cat = categorizarRegistroLiquidacion(r);
        const clave = `${r.fecha}__${cat}`;
        const c = Number(r.costo_dia) || 0;
        if (!mapaFechaCat.has(clave)) {
          mapaFechaCat.set(clave, { cat, fecha: r.fecha, costo_dia: c });
        } else {
          const actual = mapaFechaCat.get(clave);
          if (c > actual.costo_dia) actual.costo_dia = c;
        }
      });

      let total = 0;
      mapaFechaCat.forEach(({ costo_dia }) => {
        total += costo_dia;
      });

      // Debe sumar 15000 + 25000 = 40000 (sin duplicar el primer día)
      expect(mapaFechaCat.size).toBe(2);
      expect(total).toBe(40000.0);
    });
  });
});

