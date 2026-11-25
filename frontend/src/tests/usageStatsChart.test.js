// [FN-11.03] Pruebas Unitarias del cálculo de series temporales de Estadísticas de Uso (Vitest)
import { describe, it, expect } from 'vitest';
import { calcularPuntosEvolucion } from '../components/stats/UsageEvolutionChart';

describe('Uso Temporal ISO 9001 - Cálculo de series para gráfico', () => {
  const detalleEmpleados = [
    {
      id_usuario: 'u1',
      empleado: 'Ana I',
      area: 'I',
      porcentaje_cumplimiento: 100,
      fechas_cubiertas: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']
    },
    {
      id_usuario: 'u2',
      empleado: 'Luis M',
      area: 'M',
      porcentaje_cumplimiento: 25,
      fechas_cubiertas: ['2026-10-01', '2026-10-02']
    }
  ];

  const serieGlobal = [
    { fecha: '2026-10-01', usuarios_cubiertos: 2, usuarios_esperados: 2, porcentaje_diario: 100, dias_acumulados_cubiertos: 2, dias_acumulados_esperados: 2, porcentaje_acumulado: 100 },
    { fecha: '2026-10-02', usuarios_cubiertos: 2, usuarios_esperados: 2, porcentaje_diario: 100, dias_acumulados_cubiertos: 4, dias_acumulados_esperados: 4, porcentaje_acumulado: 100 },
    { fecha: '2026-10-03', usuarios_cubiertos: 1, usuarios_esperados: 2, porcentaje_diario: 50, dias_acumulados_cubiertos: 5, dias_acumulados_esperados: 6, porcentaje_acumulado: 83.33 },
    { fecha: '2026-10-04', usuarios_cubiertos: 1, usuarios_esperados: 2, porcentaje_diario: 50, dias_acumulados_cubiertos: 6, dias_acumulados_esperados: 8, porcentaje_acumulado: 75 },
    { fecha: '2026-10-05', usuarios_cubiertos: 1, usuarios_esperados: 2, porcentaje_diario: 50, dias_acumulados_cubiertos: 7, dias_acumulados_esperados: 10, porcentaje_acumulado: 70 },
    { fecha: '2026-10-06', usuarios_cubiertos: 1, usuarios_esperados: 2, porcentaje_diario: 50, dias_acumulados_cubiertos: 8, dias_acumulados_esperados: 12, porcentaje_acumulado: 66.67 },
    { fecha: '2026-10-07', usuarios_cubiertos: 1, usuarios_esperados: 2, porcentaje_diario: 50, dias_acumulados_cubiertos: 9, dias_acumulados_esperados: 14, porcentaje_acumulado: 64.29 },
    { fecha: '2026-10-08', usuarios_cubiertos: 1, usuarios_esperados: 2, porcentaje_diario: 50, dias_acumulados_cubiertos: 10, dias_acumulados_esperados: 16, porcentaje_acumulado: 62.5 }
  ];

  it('conserva serie acumulada ISO global sin filtros', () => {
    const res = calcularPuntosEvolucion({ detalleEmpleados, serieGlobal, modo: 'acumulado' });
    expect(res.mostrarReferenciaGlobal).toBe(false);
    expect(res.puntos).toHaveLength(8);
    expect(res.puntos[0].valor).toBe(100);
    expect(res.puntos[7].valor).toBe(62.5);
  });

  it('recalcula curva filtrada por empleado individual frente al promedio global', () => {
    const res = calcularPuntosEvolucion({
      detalleEmpleados,
      serieGlobal,
      empleadoFiltro: 'u2',
      modo: 'acumulado'
    });
    expect(res.mostrarReferenciaGlobal).toBe(true);
    expect(res.poblacionLabel).toBe('Luis M');
    expect(res.puntos[0].valor).toBe(100);
    expect(res.puntos[7].valor).toBe(25);
    expect(res.puntos[7].valorGlobal).toBe(62.5);
  });

  it('agrupa correctamente en bloques semanales de 7 días', () => {
    const res = calcularPuntosEvolucion({
      detalleEmpleados,
      serieGlobal,
      areaFiltro: 'I',
      modo: 'semanal'
    });
    expect(res.mostrarReferenciaGlobal).toBe(true);
    expect(res.puntos).toHaveLength(2);
    expect(res.puntos[0].valor).toBe(100);
    expect(res.puntos[1].valor).toBe(100);
  });
});
