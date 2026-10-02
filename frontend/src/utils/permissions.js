// [MOD-04] Control de Permisos y Roles de Usuario (RBAC)

export const normalizar = (texto) =>
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

export const esAreaAplicaciones = (usuario) => {
  if (!usuario) return false;
  const area = (usuario.area || '').toUpperCase().trim();
  return area === 'A' || area === 'APLICACIONES' || esIvanValentin(usuario);
};

// =========================================================================
// [FN-04.11] SISTEMA DE ROLES RBAC Y CAPACIDADES
// =========================================================================

/**
 * Normaliza y extrae el rol asignado al usuario (admin, sub_admin, core, user_1, user_2)
 */
export const getRolUsuario = (usuario) => {
  if (!usuario) return 'user_2';

  // 1. Garantía determinista por identidad de administradores y gestión clave
  if (esIvanValentin(usuario)) return 'admin';
  if (esJustinaBertolozzi(usuario)) return 'sub_admin';

  // 2. Extracción y normalización de rol_app explícito
  const raw = (usuario.rol_app || '').toString().trim().toLowerCase().replace(/\s+/g, '_');
  if (raw === 'admin' || raw === 'administrador' || raw === 'admin_general') return 'admin';
  if (raw === 'sub_admin' || raw === 'subadmin' || raw === 'rrhh' || raw === 'gestion') return 'sub_admin';
  if (raw === 'core' || raw === 'nucleo' || raw === 'direccion') return 'core';
  if (raw === 'user_1' || raw === 'user1' || raw === 'campo') return 'user_1';
  if (raw === 'user_2' || raw === 'user2' || raw === 'oficina') return 'user_2';

  // 3. Fallbacks retrocompatibles por área histórica
  if (esAreaRRHH(usuario)) return 'sub_admin';
  if (esAreaNucleo(usuario)) return 'core';
  const area = (usuario.area || '').toUpperCase().trim();
  if (area === 'S' || area === 'SIG' || normalizar(usuario.nombre).includes('llovio')) {
    return 'user_2';
  }
  return 'user_1';
};

export const esAdmin = (usuario) => getRolUsuario(usuario) === 'admin';
export const esSubAdmin = (usuario) => getRolUsuario(usuario) === 'sub_admin';
export const esCore = (usuario) => getRolUsuario(usuario) === 'core';
export const esUser1 = (usuario) => getRolUsuario(usuario) === 'user_1';
export const esUser2 = (usuario) => getRolUsuario(usuario) === 'user_2';

/**
 * 1. Campo:
 * - Los miembros de core, user_1, sub_admin y admin pueden registrar "campo".
 * - user_2 no puede elegir "campo" al registrar por sí mismo.
 * - admin y sub_admin pueden registrar días de "campo" para user_2 (carga delegada).
 */
export const puedeCargarCampo = (usuarioSesion, usuarioDestino = null) => {
  const rolSesion = getRolUsuario(usuarioSesion);
  // admin y sub_admin tienen facultad total para registrar campo (para sí mismos y para cualquier otro, incluido user_2)
  if (rolSesion === 'admin' || rolSesion === 'sub_admin') {
    return true;
  }
  // Si no es admin ni sub_admin, no puede delegar carga; evalúa su propio rol:
  return rolSesion === 'core' || rolSesion === 'user_1';
};

/**
 * 2. Rango de Fechas:
 * - Únicamente admin y sub_admin pueden utilizar "rango de fechas" en cualquier tipo de registro.
 */
export const puedeUsarRangoFechas = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin';
};

/**
 * 3. Subtipos de Franco:
 * - user_1 y user_2 no pueden ver los diferentes tipos de franco (obra, trabajados). Eso lo gestionan admin y sub_admin.
 */
export const puedeGestionarSubtiposFranco = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin';
};

/**
 * 4. Carga Delegada para Otro Empleado:
 * - Exclusivo admin y sub_admin.
 */
export const puedeCargarParaOtro = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin';
};

/**
 * 5. Historial de Otros Empleados:
 * - admin, sub_admin y core.
 */
export const puedeVerHistorialOtros = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin' || rol === 'core';
};

/**
 * 6. Edición y Eliminación en Historial de Otros:
 * - admin y sub_admin. (core tiene acceso de SOLO LECTURA).
 */
export const puedeModificarHistorialOtros = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin';
};

/**
 * 7. Roster y Guardias Operativas:
 * - admin y sub_admin.
 */
export const puedeAccederRoster = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin';
};

/**
 * 8. Calculadora de Liquidación Salarial:
 * - Exclusivo admin y sub_admin.
 */
export const puedeVerCalculadoraLiquidacion = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin';
};

/**
 * 9. Revisión y Notificaciones de Modificaciones:
 * - admin y sub_admin.
 */
export const puedeVerModificaciones = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin';
};

/**
 * 10. Módulo de Actividad de Ayer:
 * - admin, sub_admin y core.
 */
export const puedeVerActividadAyer = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin' || rol === 'core';
};

/**
 * 11. Gestión de Tipo de Costo (Masivo):
 * - admin y sub_admin.
 */
export const puedeGestionarTipoCosto = (usuario) => {
  const rol = getRolUsuario(usuario);
  return rol === 'admin' || rol === 'sub_admin';
};

/**
 * 12. Modificar o Eliminar un Registro Específico:
 * - Si es propio del usuario: permitido para cualquier rol.
 * - Si es de otro colaborador: requiere puedeModificarHistorialOtros (admin o sub_admin).
 */
export const puedeModificarRegistro = (usuario, registro) => {
  if (!usuario || !registro) return false;

  if (puedeModificarHistorialOtros(usuario)) {
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

/**
 * Información de presentación visual del rol
 */
export const getEtiquetaRol = (usuario) => {
  const rol = getRolUsuario(usuario);
  switch (rol) {
    case 'admin':
      return { rol: 'admin', nombre: 'Administrador', badge: '👑 Admin', clase: 'badge-rol-admin' };
    case 'sub_admin':
      return { rol: 'sub_admin', nombre: 'Gestión RRHH', badge: '⭐ Sub Admin', clase: 'badge-rol-subadmin' };
    case 'core':
      return { rol: 'core', nombre: 'Núcleo / Supervisión', badge: '👁️ Core', clase: 'badge-rol-core' };
    case 'user_1':
      return { rol: 'user_1', nombre: 'Técnico de Campo', badge: '🌲 User Campo', clase: 'badge-rol-user1' };
    case 'user_2':
      return { rol: 'user_2', nombre: 'Técnico de Oficina', badge: '🏢 User Oficina', clase: 'badge-rol-user2' };
    default:
      return { rol: 'user_1', nombre: 'Colaborador', badge: '👤 Colaborador', clase: 'badge-rol-user1' };
  }
};


