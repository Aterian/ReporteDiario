// [FN-02.03] Constantes y utilidades de cálculo para historial de empleados
import { esServicioAreaInterna, esFrancoDeObra } from '../../utils/francoUtils';

export const LUGARES_OPCIONES = [
  'Oficina',
  'Campo',
  'Roster',
  'Franco',
  'Franco Obra',
  'Franco Ofic Trabajado',
  'Franco Obra Trabajado',
  'Feriado Trabajado',
  'Vacaciones',
  'Licencia'
];

export const LISTADO_AREAS_CORPORATIVAS = [
  'Aplicaciones',
  'Ingeniería',
  'Mensura',
  'SIG',
  'Administración',
  'RRHH',
  'CyF',
  'Marketing',
  'Inventario',
  'I+D',
  'Ventas',
  'CD'
];

export const TIPOS_LICENCIA = [
  'Licencia - Médica',
  'Licencia - Examen',
  'Licencia - Fallecimiento',
  'Licencia - Paternidad / Maternidad',
  'Licencia - Mudanza',
  'Licencia - Especial',
  'Licencia - Otra'
];

export const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// [FN-06.04] Categorización de registro según las 5 categorías oficiales de liquidación de RRHH
export const categorizarRegistroLiquidacion = (r) => {
  if (!r) return 'oficina';
  const lugLower = (r.tipo_ocf || r.lugar || '').trim().toLowerCase();
  const srv = (r.servicio || '').trim();
  const srvLower = srv.toLowerCase();
  const hrs = Number(r.horas) || 0;
  const esFer = (r.feriado || '').toUpperCase() === 'SI';
  const tipoCosto = (r.tipo_costo || '').trim();

  const esFrancoObraTrab = (
    lugLower === 'franco obra trabajado' ||
    (lugLower === 'franco trabajado' && (tipoCosto === 'Campo' || esFrancoDeObra(r))) ||
    ((lugLower === 'franco' || lugLower === 'franco obra' || lugLower === 'franco de obra') && hrs > 0 && (tipoCosto === 'Campo' || esFrancoDeObra(r)))
  );

  if (esFrancoObraTrab) return 'franco_obra_trab';

  const esFrancoOficTrab = (
    lugLower === 'franco ofic trabajado' ||
    lugLower === 'franco trabajado' ||
    ((lugLower === 'franco' || lugLower === 'franco de oficina') && hrs > 0 && (srvLower.includes('trabajado') || tipoCosto === 'Oficina' || esServicioAreaInterna(srv)))
  );

  if (esFrancoOficTrab) return 'franco_ofic_trab';
  if (lugLower === 'feriado trabajado' || (esFer && hrs > 0)) return 'feriado_trab';
  if (esFrancoDeObra(r) || ['campaña / campo', 'campo', 'obra', 'roster'].includes(lugLower)) return 'obra';
  return 'oficina';
};

export const getBadgeClassLugar = (lugar, servicio = '') => {
  const l = (lugar || '').toLowerCase().trim();
  const s = (servicio || '').toLowerCase().trim();
  if (l === 'franco obra' || l === 'franco de obra' || s.includes('franco de obra') || (l === 'franco' && s && !esServicioAreaInterna(s))) {
    return 'badge-modalidad-franco-obra';
  }
  if (l === 'franco obra trabajado') {
    return 'badge-modalidad-franco-obra-trabajado';
  }
  if (l === 'franco ofic trabajado' || s === 'franco trabajado' || (l === 'franco' && s.includes('trabajado'))) {
    return 'badge-modalidad-franco-ofic-trabajado';
  }
  if (l === 'feriado trabajado' || l.includes('feriado')) {
    return 'badge-modalidad-feriado-trabajado';
  }
  if (l.includes('oficina')) return 'badge-modalidad-oficina';
  if (l.includes('campo') || l.includes('campaña') || l.includes('roster') || l.includes('obra')) return 'badge-modalidad-campo';
  if (l.includes('franco')) return 'badge-modalidad-franco';
  if (l.includes('vacaciones')) return 'badge-modalidad-vacaciones';
  if (l.includes('licencia')) return 'badge-modalidad-licencia';
  return 'badge-modalidad-oficina';
};

export const getIniciales = (nombre) => {
  if (!nombre) return 'EM';
  const partes = nombre.trim().split(' ');
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
};

export const formatMoneda = (val) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val || 0);
};
