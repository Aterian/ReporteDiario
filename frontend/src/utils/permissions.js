// [MOD-04] Control de Permisos y Roles de Usuario

const normalizar = (texto) =>
  (texto || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const esIvanValentin = (usuario) => {
  if (!usuario) return false;
  const nombre = normalizar(usuario.nombre);
  const email = normalizar(usuario.email || usuario.mail);
  const dni = String(usuario.dni || '').trim();

  return (
    (nombre.includes('valentin') && (nombre.includes('ivan') || nombre.includes('iván'))) ||
    email === 'ivangvalentin97@gmail.com' ||
    email === 'sge@ingeap.com' ||
    dni === '40158951'
  );
};

export const esJustinaBertolozzi = (usuario) => {
  if (!usuario) return false;
  const nombre = normalizar(usuario.nombre);
  const email = normalizar(usuario.email || usuario.mail);
  const dni = String(usuario.dni || '').trim();

  return (
    (nombre.includes('justina') && nombre.includes('bertolozzi')) ||
    email === 'rrhh@ingeap.com' ||
    dni === '45411162'
  );
};

export const esAreaRRHH = (usuario) => {
  if (!usuario) return false;
  const area = (usuario.area || '').toUpperCase().trim();
  return area === 'RRHH' || esJustinaBertolozzi(usuario);
};

export const esAreaNucleo = (usuario) => {
  if (!usuario) return false;
  const area = (usuario.area || '').toUpperCase().trim();
  return area === 'N';
};

// [FN-04.01] Carga e Historial de Roster (Exclusivo Justina Bertolozzi e Iván Valentin)
export const puedeAccederRoster = (usuario) => {
  return esJustinaBertolozzi(usuario) || esIvanValentin(usuario);
};

// [FN-04.02] Visualización Historial Otros Empleados (RRHH, Núcleo e Iván Valentin)
export const puedeVerHistorialOtros = (usuario) => {
  return esAreaRRHH(usuario) || esAreaNucleo(usuario) || esIvanValentin(usuario);
};

// [FN-04.03] Modificación y Eliminación de Registros de Historial
export const puedeModificarRegistro = (usuario, registro) => {
  if (!usuario || !registro) return false;

  if (esJustinaBertolozzi(usuario) || esIvanValentin(usuario)) {
    return true;
  }

  const nombreUsuario = normalizar(usuario.nombre);
  const nombreEmpleado = normalizar(registro.empleado);
  const dniUsuario = String(usuario.dni || '').trim();
  const idEmpleado = String(registro.id_empleado || '').trim();
  const idUsuario = String(usuario.id_usuario || usuario.id_origen || '').trim();

  const esPropio =
    (nombreEmpleado && nombreUsuario && nombreEmpleado === nombreUsuario) ||
    (idEmpleado && idUsuario && idEmpleado === idUsuario) ||
    (idEmpleado && dniUsuario && idEmpleado === dniUsuario);

  return Boolean(esPropio);
};

// [FN-04.05] Permisos de Aplicaciones
export const esAreaAplicaciones = (usuario) => {
  if (!usuario) return false;
  const area = (usuario.area || '').toUpperCase().trim();
  return area === 'A' || area === 'APLICACIONES' || esIvanValentin(usuario);
};

// [FN-04.05] Gestión de Tipo de Costo (Exclusivo RRHH y Aplicaciones)
export const puedeGestionarTipoCosto = (usuario) => {
  return esAreaRRHH(usuario) || esAreaAplicaciones(usuario);
};

// [FN-04.06] Visualización de auditoría y notificaciones de modificaciones (Justina Bertolozzi e Iván Valentin)
export const puedeVerModificaciones = (usuario) => {
  return esJustinaBertolozzi(usuario) || esIvanValentin(usuario);
};

// [FN-04.07] Acceso al módulo de Actividad de ayer (Núcleo, Aplicaciones y Justina Bertolozzi)
export const puedeVerActividadAyer = (usuario) => {
  return esAreaNucleo(usuario) || esAreaAplicaciones(usuario) || esJustinaBertolozzi(usuario);
};

// [FN-04.09] Permisos de Calculadora de Liquidación (Exclusivo Justina Bertolozzi e Iván Valentin)
export const puedeVerCalculadoraLiquidacion = (usuario) => {
  return esJustinaBertolozzi(usuario) || esIvanValentin(usuario);
};


