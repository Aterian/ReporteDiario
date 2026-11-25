// [FN-00.13] Configuración de edición y versión compilada (operativa vs gestion)
export const APP_EDITION =
  typeof __APP_EDITION__ !== 'undefined' && __APP_EDITION__ === 'operativa'
    ? 'operativa'
    : 'gestion';

export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__
    ? String(__APP_VERSION__).trim()
    : '0.0.0';

export const ES_EDICION_GESTION = APP_EDITION === 'gestion';
export const ES_EDICION_OPERATIVA = APP_EDITION === 'operativa';

export const esRolGestion = (rol) =>
  ['admin', 'sub_admin', 'core'].includes(String(rol || '').trim().toLowerCase());

export const formatearLeyendaVersion = (version = APP_VERSION, edicion = APP_EDITION) => {
  const ver = String(version || APP_VERSION || '0.0.0').trim().replace(/^v/i, '');
  const edNorm = String(edicion || APP_EDITION || 'gestion').trim().toLowerCase();
  const etiqueta = edNorm === 'operativa' ? 'Operativa' : 'Gestión';
  return `v${ver} · ${etiqueta}`;
};
