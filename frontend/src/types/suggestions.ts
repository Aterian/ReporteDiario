// [FN-06.10] Contratos de sugerencias
export const SUGGESTIONS_QUERY_KEY = ['sugerencias'] as const;
export const LIMITE_NOMBRE = 150;
export const LIMITE_DESCRIPCION = 1000;

export const TIPOS_SUGERENCIA = [
  'Peligros y riesgos de su trabajo',
  'Controles y medidas de prevención',
  'Capacitación necesaria',
  'Incidentes e investigaciones',
  'Cambios que afecten la seguridad',
  'Aplicaciones',
  'Otro',
] as const;

export const ESTADOS_SUGERENCIA = {
  nueva: 'Nueva',
  vista: 'Vista',
  'para aplicar': 'Para aplicar',
  resuelta: 'Resuelta',
} as const;

export const PRIORIDADES_SUGERENCIA = {
  urgente: 'Urgente',
  'con tiempo': 'Con tiempo',
} as const;

export type TipoSugerencia = typeof TIPOS_SUGERENCIA[number];
export type EstadoSugerencia = keyof typeof ESTADOS_SUGERENCIA;
export type PrioridadSugerencia = keyof typeof PRIORIDADES_SUGERENCIA;

export interface SugerenciaCreate {
  nombre: string | null;
  tipo_sugerencia: TipoSugerencia;
  descripcion_sugerencia: string;
}

export interface SugerenciaEditable {
  estado_revision: EstadoSugerencia;
  nivel_urgencia: PrioridadSugerencia;
  respuesta: string | null;
}

export interface SugerenciaUpdate extends SugerenciaEditable {
  id_participacion: string;
  original: SugerenciaEditable;
}

export interface ComprobanteSugerencia {
  id_participacion: string;
}

export interface Sugerencia extends ComprobanteSugerencia, SugerenciaEditable {
  nombre: string;
  tipo_sugerencia: string;
  descripcion_sugerencia: string;
  fecha_hora_registro: string;
  fecha_hora_resolucion: string | null;
}

export interface FiltrosSugerencias {
  busqueda: string;
  estado_revision: EstadoSugerencia | null;
  nivel_urgencia: PrioridadSugerencia | null;
  pagina: number;
  limite: number;
}

export interface ContadoresSugerencias {
  nuevas: number;
  urgentes_abiertas: number;
  para_aplicar: number;
  resueltas: number;
}

export interface BandejaSugerencias {
  sugerencias: Sugerencia[];
  total: number;
  contadores: ContadoresSugerencias;
}

export interface RespuestaSugerencias<T> {
  exito: boolean;
  datos: T | null;
  error: string | null;
  codigo_error: string | null;
}

export class ErrorSugerencias extends Error {
  constructor(mensaje: string, readonly codigo: string | null) {
    super(mensaje);
  }
}

export function obtenerDatosSugerencias<T>(respuesta: RespuestaSugerencias<T>, mensaje: string): T {
  if (respuesta.exito && respuesta.datos != null) return respuesta.datos;
  throw new ErrorSugerencias(respuesta.error || mensaje, respuesta.codigo_error);
}

export function prepararSugerencia(
  nombre: string,
  tipo: TipoSugerencia | '',
  descripcion: string,
): SugerenciaCreate {
  const texto = descripcion.trim();
  if (!texto) throw new Error('Escribí tu sugerencia antes de enviarla.');
  return {
    nombre: nombre.trim() || null,
    tipo_sugerencia: tipo || 'Otro',
    descripcion_sugerencia: texto,
  };
}

export function actualizarSugerenciaEnBandeja(
  bandeja: BandejaSugerencias,
  id: string,
  cambios: SugerenciaEditable,
): BandejaSugerencias {
  const actual = bandeja.sugerencias.find(sugerencia => sugerencia.id_participacion === id);
  if (!actual) return bandeja;

  const actualizada = { ...actual, ...cambios };
  const diferencia = (aplica: (sugerencia: Sugerencia) => boolean) =>
    Number(aplica(actualizada)) - Number(aplica(actual));
  return {
    ...bandeja,
    sugerencias: bandeja.sugerencias.map(sugerencia =>
      sugerencia.id_participacion === id ? actualizada : sugerencia,
    ),
    contadores: {
      nuevas: bandeja.contadores.nuevas + diferencia(sugerencia => sugerencia.estado_revision === 'nueva'),
      urgentes_abiertas: bandeja.contadores.urgentes_abiertas + diferencia(sugerencia =>
        sugerencia.nivel_urgencia === 'urgente' && sugerencia.estado_revision !== 'resuelta',
      ),
      para_aplicar: bandeja.contadores.para_aplicar + diferencia(sugerencia => sugerencia.estado_revision === 'para aplicar'),
      resueltas: bandeja.contadores.resueltas + diferencia(sugerencia => sugerencia.estado_revision === 'resuelta'),
    },
  };
}
