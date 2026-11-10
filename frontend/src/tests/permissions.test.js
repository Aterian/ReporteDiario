// [FN-04.11] Pruebas Unitarias de Permisos y Roles RBAC (Vitest)
import { describe, it, expect } from 'vitest';
import {
  getRolUsuario,
  esAdmin,
  esSubAdmin,
  esCore,
  esUser1,
  esUser2,
  puedeGestionarUsuarios,
  puedeEditarUsuarios,
  puedeCargarCampo,
  puedeUsarRangoFechas,
  puedeGestionarSubtiposFranco,
  puedeCargarParaOtro,
  puedeVerHistorialOtros,
  puedeModificarHistorialOtros,
  puedeAccederRoster,
  puedeVerCalculadoraLiquidacion,
  puedeVerModificaciones,
  puedeModificarRegistro,
  puedeGestionarProyectos
} from '../utils/permissions';

describe('RBAC - Control de Roles y Capacidades', () => {
  const adminUser = { id_usuario: '111', nombre: 'Admin Master', rol_app: 'admin' };
  const subAdminUser = { id_usuario: '222', nombre: 'Justina Bertolozzi', rol_app: 'sub_admin' };
  const coreUser = { id_usuario: '333', nombre: 'Supervisor Core', rol_app: 'core' };
  const user1 = { id_usuario: '444', nombre: 'Tecnico Campo', rol_app: 'user_1' };
  const user2 = { id_usuario: '555', nombre: 'Tecnico Oficina', rol_app: 'user_2' };
  const unknownUser = { id_usuario: '999', nombre: 'Desconocido', rol_app: 'invitado' };

  describe('Identificación de Roles Canónicos', () => {
    it('normaliza roles correctamente o recurre a user_1 por defecto', () => {
      expect(getRolUsuario(adminUser)).toBe('admin');
      expect(getRolUsuario(subAdminUser)).toBe('sub_admin');
      expect(getRolUsuario(coreUser)).toBe('core');
      expect(getRolUsuario(user1)).toBe('user_1');
      expect(getRolUsuario(user2)).toBe('user_2');
      expect(getRolUsuario(unknownUser)).toBe('user_1');
      expect(getRolUsuario(null)).toBe('user_1');
    });

    it('identifica correctamente las banderas booleanas de rol', () => {
      expect(esAdmin(adminUser)).toBe(true);
      expect(esAdmin(coreUser)).toBe(false);

      expect(esSubAdmin(subAdminUser)).toBe(true);
      expect(esSubAdmin(user1)).toBe(false);

      expect(esCore(coreUser)).toBe(true);
      expect(esCore(adminUser)).toBe(false);

      expect(esUser1(user1)).toBe(true);
      expect(esUser2(user2)).toBe(true);
    });
  });

  describe('Blindaje contra Autoelevación y Gestión de Usuarios (Punto 2)', () => {
    it('permite ver gestión a admin, sub_admin y core', () => {
      expect(puedeGestionarUsuarios(adminUser)).toBe(true);
      expect(puedeGestionarUsuarios(subAdminUser)).toBe(true);
      expect(puedeGestionarUsuarios(coreUser)).toBe(true);
      expect(puedeGestionarUsuarios(user1)).toBe(false);
      expect(puedeGestionarUsuarios(user2)).toBe(false);
    });

    it('prohíbe edición y autoelevación salarial a usuarios core (sólo admin y sub_admin)', () => {
      expect(puedeEditarUsuarios(adminUser)).toBe(true);
      expect(puedeEditarUsuarios(subAdminUser)).toBe(true);
      expect(puedeEditarUsuarios(coreUser)).toBe(false);
      expect(puedeEditarUsuarios(user1)).toBe(false);
      expect(puedeEditarUsuarios(user2)).toBe(false);
    });
  });

  describe('Capacidades Operativas por Rol', () => {
    it('controla acceso a registro de Campo según el rol', () => {
      expect(puedeCargarCampo(adminUser)).toBe(true);
      expect(puedeCargarCampo(subAdminUser)).toBe(true);
      expect(puedeCargarCampo(coreUser)).toBe(true);
      expect(puedeCargarCampo(user1)).toBe(true);
      expect(puedeCargarCampo(user2)).toBe(false);
    });

    it('limita rango de fechas exclusivamente a admin y sub_admin', () => {
      expect(puedeUsarRangoFechas(adminUser)).toBe(true);
      expect(puedeUsarRangoFechas(subAdminUser)).toBe(true);
      expect(puedeUsarRangoFechas(coreUser)).toBe(false);
      expect(puedeUsarRangoFechas(user1)).toBe(false);
    });

    it('restringe subtipos de franco a roles de gestión', () => {
      expect(puedeGestionarSubtiposFranco(adminUser)).toBe(true);
      expect(puedeGestionarSubtiposFranco(subAdminUser)).toBe(true);
      expect(puedeGestionarSubtiposFranco(user1)).toBe(false);
    });

    it('limita carga delegada para terceros a roles de gestión', () => {
      expect(puedeCargarParaOtro(adminUser)).toBe(true);
      expect(puedeCargarParaOtro(subAdminUser)).toBe(true);
      expect(puedeCargarParaOtro(user1)).toBe(false);
    });
  });

  describe('Supervisión, Auditoría y Roster', () => {
    it('permite acceso al módulo de Roster solo a roles autorizados', () => {
      expect(puedeAccederRoster(adminUser)).toBe(true);
      expect(puedeAccederRoster(subAdminUser)).toBe(true);
      expect(puedeAccederRoster(coreUser)).toBe(false);
      expect(puedeAccederRoster(user1)).toBe(false);
    });

    it('permite auditoría y visualización de modificaciones a admin y sub_admin', () => {
      expect(puedeVerModificaciones(adminUser)).toBe(true);
      expect(puedeVerModificaciones(subAdminUser)).toBe(true);
      expect(puedeVerModificaciones(user1)).toBe(false);
    });

    it('permite ver liquidaciones exclusivamente a admin y sub_admin', () => {
      expect(puedeVerCalculadoraLiquidacion(adminUser)).toBe(true);
      expect(puedeVerCalculadoraLiquidacion(subAdminUser)).toBe(true);
      expect(puedeVerCalculadoraLiquidacion(user1)).toBe(false);
    });

    it('permite gestionar proyectos exclusivamente al rol admin', () => {
      expect(puedeGestionarProyectos(adminUser)).toBe(true);
      expect(puedeGestionarProyectos(subAdminUser)).toBe(false);
      expect(puedeGestionarProyectos(coreUser)).toBe(false);
      expect(puedeGestionarProyectos(user1)).toBe(false);
      expect(puedeGestionarProyectos(user2)).toBe(false);
      expect(puedeGestionarProyectos(null)).toBe(false);
    });

    it('permite ver historial de otros empleados sólo a roles autorizados', () => {
      expect(puedeVerHistorialOtros(adminUser)).toBe(true);
      expect(puedeVerHistorialOtros(subAdminUser)).toBe(true);
      expect(puedeVerHistorialOtros(coreUser)).toBe(true);
      expect(puedeVerHistorialOtros(user1)).toBe(false);
      expect(puedeVerHistorialOtros(user2)).toBe(false);
    });

    it('permite modificar historial de otros exclusivamente a admin y sub_admin', () => {
      expect(puedeModificarHistorialOtros(adminUser)).toBe(true);
      expect(puedeModificarHistorialOtros(subAdminUser)).toBe(true);
      expect(puedeModificarHistorialOtros(coreUser)).toBe(false);
      expect(puedeModificarHistorialOtros(user1)).toBe(false);
    });
  });

  describe('Modificación de Registros Propios vs Terceros', () => {
    it('permite a un usuario operativo editar sus propios registros', () => {
      const registroPropio = {
        id_asistencia: 'ast-1',
        id_empleado: '444',
        empleado: 'Tecnico Campo'
      };
      expect(puedeModificarRegistro(user1, registroPropio)).toBe(true);
    });

    it('deniega a un usuario operativo editar registros ajenos', () => {
      const registroAjeno = {
        id_asistencia: 'ast-2',
        id_empleado: '555',
        empleado: 'Tecnico Oficina'
      };
      expect(puedeModificarRegistro(user1, registroAjeno)).toBe(false);
    });

    it('permite a administradores editar registros ajenos', () => {
      const registroAjeno = {
        id_asistencia: 'ast-2',
        id_empleado: '555',
        empleado: 'Tecnico Oficina'
      };
      expect(puedeModificarRegistro(adminUser, registroAjeno)).toBe(true);
      expect(puedeModificarRegistro(subAdminUser, registroAjeno)).toBe(true);
    });
  });
});

