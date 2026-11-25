// [FN-00.13] Pruebas unitarias de edición compilada, versión y detección de roles de gestión
import { describe, it, expect } from 'vitest';
import {
  APP_EDITION,
  APP_VERSION,
  ES_EDICION_GESTION,
  ES_EDICION_OPERATIVA,
  esRolGestion,
  formatearLeyendaVersion,
} from '../config/edition';

describe('Configuración de Edición Dual ([FN-00.13])', () => {
  it('expone valores consistentes para APP_EDITION, APP_VERSION y banderas booleanas', () => {
    expect(['gestion', 'operativa']).toContain(APP_EDITION);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ES_EDICION_GESTION).toBe(APP_EDITION === 'gestion');
    expect(ES_EDICION_OPERATIVA).toBe(APP_EDITION === 'operativa');
  });

  it('clasifica correctamente roles operativos vs gestión', () => {
    expect(esRolGestion('admin')).toBe(true);
    expect(esRolGestion('sub_admin')).toBe(true);
    expect(esRolGestion('core')).toBe(true);
    expect(esRolGestion('CORE')).toBe(true);

    expect(esRolGestion('user_1')).toBe(false);
    expect(esRolGestion('user_2')).toBe(false);
    expect(esRolGestion('')).toBe(false);
    expect(esRolGestion(null)).toBe(false);
  });

  it('formatea la leyenda de versión instalada para Operativa y Gestión', () => {
    expect(formatearLeyendaVersion('2.18.0', 'operativa')).toBe('v2.18.0 · Operativa');
    expect(formatearLeyendaVersion('v2.18.1', 'gestion')).toBe('v2.18.1 · Gestión');
  });
});
