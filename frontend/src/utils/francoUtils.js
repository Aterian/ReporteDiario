// [MOD-02] francoUtils.js

const AREAS_INTERNAS = [
  'a',
  'i',
  'm',
  'n',
  's',
  'vym',
  'rrhh',
  'ingeniería (i)',
  'ingenieria (i)',
  'aplicaciones (a)',
  'mensura (m)',
  'núcleo (n)',
  'nucleo (n)',
  'ventas y marketing (vym)',
  'sistema de información geográfica (s)',
  'sistema de informacion geografica (s)',
  'ventas',
  'marketing',
  'aplicaciones',
  'administracion',
  'administración',
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
  'of.tecnica',
  'franco de oficina',
  'franco oficina',
  'descanso'
];

// [FN-02.02] Validar si un servicio o imputación corresponde a un área interna
export function esServicioAreaInterna(servicio) {
  if (!servicio) return true;
  const s = String(servicio).trim().toLowerCase();
  if (s.startsWith('dedicado al área') || s.startsWith('dedicado al area')) return true;
  if (s.startsWith('franco de oficina') || s.startsWith('franco oficina') || s === 'franco') return true;
  if (AREAS_INTERNAS.includes(s)) return true;
  return AREAS_INTERNAS.some(a => s === a || s === `área ${a}` || s === `area ${a}`);
}

// [FN-02.03] Determinar si un registro califica como franco de obra
export function esFrancoDeObra(registro) {
  if (!registro) return false;
  const lug = (registro.tipo_ocf || registro.lugar || '').trim().toLowerCase();
  const mod = (registro.modalidad || registro.tipo_costo || '').trim().toLowerCase();
  const sub = (registro.sub_franco || registro.tipo_franco || '').trim().toLowerCase();

  // Si la modalidad, tipo de costo o subtipo es explícitamente oficina, NUNCA es franco de obra
  if (mod === 'oficina' || mod === 'ofic' || sub.includes('oficina')) return false;

  if (lug === 'franco obra' || lug === 'franco de obra') return true;
  if (lug !== 'franco') return false;

  // Si la modalidad es obra/campo/roster, se considera franco de obra
  if (mod === 'obra' || mod === 'campo' || mod === 'roster') return true;

  const srv = (registro.servicio || '').trim();
  if (!srv) return false;
  return !esServicioAreaInterna(srv);
}

// [FN-02.04] Obtener etiqueta visual canónica de modalidad de la jornada
export function obtenerEtiquetaModalidad(registro) {
  if (!registro) return 'Oficina';
  const lug = (registro.tipo_ocf || registro.lugar || 'Oficina').trim();
  const lugLower = lug.toLowerCase();
  const mod = (registro.modalidad || registro.tipo_costo || '').trim().toLowerCase();
  const sub = (registro.sub_franco || registro.tipo_franco || '').trim().toLowerCase();
  const srv = (registro.servicio || '').trim();

  if (lugLower === 'franco') {
    if (mod === 'oficina' || mod === 'ofic' || sub.includes('oficina')) {
      return 'Franco';
    }
    if (mod === 'obra' || mod === 'campo' || mod === 'roster') {
      return 'Franco de obra';
    }
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

// [FN-02.05] Resolver el nombre legible del autor que cargó el registro
export function resolverNombreCargador(item, usuario = null, listaUsuarios = []) {
  const cpor = (item?.cargado_por || '').trim();
  if (!cpor) return item?.empleado || '';

  const idUsuario = (usuario?.id_usuario || usuario?.id_origen || '').toLowerCase();
  const idEmp = (item?.id_empleado || item?.id_usuario || '').toLowerCase();
  const cporLower = cpor.toLowerCase();

  if (idUsuario && cporLower === idUsuario) {
    return usuario?.nombre || usuario?.nombre_completo || item?.empleado || 'Mí';
  }

  if (idEmp && cporLower === idEmp) {
    return item?.empleado || 'Colaborador';
  }

  const esUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cpor);
  if (esUUID) {
    if (Array.isArray(listaUsuarios) && listaUsuarios.length > 0) {
      const u = listaUsuarios.find(usr =>
        (usr.id_usuario && usr.id_usuario.toLowerCase() === cporLower) ||
        (usr.id_origen && usr.id_origen.toLowerCase() === cporLower)
      );
      if (u && (u.nombre || u.nombre_completo)) {
        return u.nombre || u.nombre_completo;
      }
    }
    return item?.empleado || 'Colaborador';
  }

  return cpor;
}
