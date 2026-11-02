-- [FN-07.21] Reversión de Migración 005: Registro de Errores Remotos y Gestión de Proyectos

BEGIN;

DROP TABLE IF EXISTS app_rrhh.b_1_errores_remotos CASCADE;

ALTER TABLE app_proyectos.b_1_proyectos_servicios
    DROP COLUMN IF EXISTS area,
    DROP COLUMN IF EXISTS activo;

COMMIT;

