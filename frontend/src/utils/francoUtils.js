// [MOD-02] francoUtils.js

const AREAS_INTERNAS = [
  'vym',
  'ventas',
  'marketing',
  'aplicaciones',
  'administracion',
  'administración',
  'rrhh',
  'cyf',
  'inventario',
  'i+d',
  'general',
  'cd',
  'núcleo',
  'nucleo',
  'sig',
  'ingeniería',
  'ingenieria',
  'mensura',
  'oficina',
  'of.tecnica'
];

export function esServicioAreaInterna(servicio) {
  if (!servicio) return true;
  const s = String(servicio).trim().toLowerCase();
  if (s.startsWith('dedicado al área') || s.startsWith('dedicado al area')) return true;
  if (s.startsWith('franco de oficina') || s === 'franco') return true;
  return AREAS_INTERNAS.some(a => s === a || s === `área ${a}` || s === `area ${a}`);
}

export function esFrancoDeObra(registro) {
  const lug = (registro.tipo_ocf || registro.lugar || '').trim().toLowerCase();
  if (lug !== 'franco' && lug !== 'franco obra' && lug !== 'franco de obra') return false;
  if (lug === 'franco obra' || lug === 'franco de obra') return true;
  const srv = (registro.servicio || '').trim();
  if (!srv) return false;
  return !esServicioAreaInterna(srv);
}

export function obtenerEtiquetaModalidad(registro) {
  const lug = (registro.tipo_ocf || registro.lugar || 'Oficina').trim();
  const lugLower = lug.toLowerCase();
  const srv = (registro.servicio || '').trim();

  if (lugLower === 'franco') {
    if (srv && !esServicioAreaInterna(srv)) {
      return 'Franco de obra';
    }
    return 'Franco';
  }

  if (lugLower === 'franco obra' || lugLower === 'franco de obra') {
    return 'Franco de obra';
  }

  if (lugLower === 'campaña / campo') {
    return 'Campo';
  }

  return lug;
}
