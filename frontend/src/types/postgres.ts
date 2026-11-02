// [MOD-07] Contratos de respuestas PostgreSQL
export type EstadoAsistencia = 'activo' | 'franco' | 'vacaciones' | 'licencia';
export type ModalidadLugar = 'oficina' | 'obra' | 'roster';
export type Importe = string;

export interface AdicionalResponse {
  id_adicional: string;
  fecha: string;
  cantidad_adicional: Importe;
  descripcion: string;
}

export interface LiquidacionResponse {
  id_calculo_sueldo: string;
  id_usuario: string;
  ciclo_cobro: string;
  cant_dias_ofi: number;
  cant_dias_obra: number;
  subtotal_ofi: Importe;
  subtotal_obra: Importe;
  subtotal_estimado: Importe | null;
  total_real: Importe;
  total_adicionales: Importe;
  sueldo_total: Importe | null;
  cerrado: boolean;
  modalidad_calculo?: 'por_dia' | 'base_30';
  lugar_habitual?: 'oficina' | 'obra';
  adicionales: AdicionalResponse[];
}

export interface RespuestaLiquidacion {
  exito: boolean;
  liquidacion?: LiquidacionResponse | null;
  error?: string;
}
