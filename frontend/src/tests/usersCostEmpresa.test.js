// [MOD-08] [FN-08.02] Pruebas unitarias de Costo Total Empresa provisorio en Módulo de Empleados
import { describe, it, expect } from 'vitest';
import { calcularCostoEmpresa } from '../utils/costoEmpresa';

describe('Cálculo de Costo Total Empresa Provisorio ([FN-08.02])', () => {
  it('calcula 1625000 cuando la liquidación es 1250000 y el porcentaje complementario es 30%', () => {
    const res = calcularCostoEmpresa({
      liquidacionActual: 1250000,
      sueldoOficina: 1000000,
      sueldoObra: 1400000,
      lugarHabitual: 'oficina',
      porcentajeCostoEmpresa: 30
    });

    expect(res.origen).toBe('liquidacion');
    expect(res.baseMonto).toBe(1250000);
    expect(res.porcentaje).toBe(30);
    expect(res.montoComplementario).toBe(375000);
    expect(res.costoTotal).toBe(1625000);
  });

  it('usa el sueldo base habitual como respaldo si no existe liquidación vigente', () => {
    const resObra = calcularCostoEmpresa({
      liquidacionActual: null,
      sueldoOficina: 1000000,
      sueldoObra: 2000000,
      lugarHabitual: 'obra',
      porcentajeCostoEmpresa: 25
    });

    expect(resObra.origen).toBe('sueldo_base');
    expect(resObra.baseMonto).toBe(2000000);
    expect(resObra.montoComplementario).toBe(500000);
    expect(resObra.costoTotal).toBe(2500000);

    const resOfi = calcularCostoEmpresa({
      liquidacionActual: 0,
      sueldoOficina: 1250000,
      sueldoObra: 2000000,
      lugarHabitual: 'oficina',
      porcentajeCostoEmpresa: 30
    });

    expect(resOfi.origen).toBe('sueldo_base');
    expect(resOfi.baseMonto).toBe(1250000);
    expect(resOfi.costoTotal).toBe(1625000);
  });

  it('prioriza el sueldo del formulario cuando preferirSueldoForm está activo durante edición salarial', () => {
    const res = calcularCostoEmpresa({
      liquidacionActual: 900000,
      sueldoOficina: 1250000,
      sueldoObra: 1800000,
      lugarHabitual: 'oficina',
      porcentajeCostoEmpresa: 30,
      preferirSueldoForm: true
    });

    expect(res.origen).toBe('sueldo_base');
    expect(res.baseMonto).toBe(1250000);
    expect(res.costoTotal).toBe(1625000);
  });

  it('maneja porcentaje 0, decimales y límites seguros sin NaN', () => {
    const resCero = calcularCostoEmpresa({
      liquidacionActual: 1250000,
      porcentajeCostoEmpresa: 0
    });
    expect(resCero.montoComplementario).toBe(0);
    expect(resCero.costoTotal).toBe(1250000);

    const resDec = calcularCostoEmpresa({
      liquidacionActual: 1000000,
      porcentajeCostoEmpresa: 32.5
    });
    expect(resDec.montoComplementario).toBe(325000);
    expect(resDec.costoTotal).toBe(1325000);

    const resInvalido = calcularCostoEmpresa({
      liquidacionActual: 1000000,
      porcentajeCostoEmpresa: -15
    });
    expect(resInvalido.porcentaje).toBe(0);
    expect(resInvalido.costoTotal).toBe(1000000);
  });
});
