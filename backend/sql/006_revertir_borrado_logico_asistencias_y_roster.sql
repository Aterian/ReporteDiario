-- [MOD-07] [FN-07.17] Revertir Migración 006: Borrado Lógico en Asistencias y Roster

DROP INDEX IF EXISTS app_rrhh.idx_asistencias_activas_usuario_fecha;
DROP INDEX IF EXISTS app_rrhh.idx_asistencias_activas_roster;
DROP INDEX IF EXISTS app_rrhh.idx_roster_activos_usuario_fechas;

ALTER TABLE app_rrhh.b_1_asistencias
    DROP COLUMN IF EXISTS eliminado_en,
    DROP COLUMN IF EXISTS eliminado_por;

ALTER TABLE app_rrhh.b_1_roster
    DROP COLUMN IF EXISTS eliminado_en,
    DROP COLUMN IF EXISTS eliminado_por;

