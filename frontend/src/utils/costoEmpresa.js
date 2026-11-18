// [MOD-08] [FN-08.02] Cálculo provisorio de Costo Total Empresa sobre liquidación o sueldo base habitual

export function calcularCostoEmpresa({
  liquidacionActual = null,
  sueldoOficina = 0,
  sueldoObra = 0,
  lugarHabitual = 'oficina',
  porcentajeCostoEmpresa = 0,
  preferirSueldoForm = false
} = {}) {
  const liqRaw = Number(liquidacionActual);
  const liqValida = Number.isFinite(liqRaw) && liqRaw > 0 ? liqRaw : 0;

  const ofiRaw = Number(sueldoOficina);
  const obraRaw = Number(sueldoObra);
  const sueldoHabitual = lugarHabitual === 'obra'
    ? (Number.isFinite(obraRaw) && obraRaw > 0 ? obraRaw : 0)
    : (Number.isFinite(ofiRaw) && ofiRaw > 0 ? ofiRaw : 0);

  const usaLiquidacion = !preferirSueldoForm && liqValida > 0;
  const baseMonto = usaLiquidacion ? liqValida : sueldoHabitual;

  const pctRaw = Number(porcentajeCostoEmpresa);
  const porcentaje = Number.isFinite(pctRaw) && pctRaw >= 0 ? Math.min(500, pctRaw) : 0;

  const montoComplementario = Math.round((baseMonto * (porcentaje / 100)) * 100) / 100;
  const costoTotal = Math.round((baseMonto * (1 + porcentaje / 100)) * 100) / 100;

  return {
    baseMonto,
    origen: usaLiquidacion ? 'liquidacion' : 'sueldo_base',
    porcentaje,
    montoComplementario,
    costoTotal
  };
}
