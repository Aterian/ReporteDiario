-- [MOD-08] [FN-08.02] Reversión Migración 009: Porcentaje de costo empresa y total empresa
-- Base de datos: PostgreSQL 14+ (Railway / Test DB)

BEGIN;

ALTER TABLE app_rrhh.a_1_sueldos_base
    DROP COLUMN IF EXISTS costo_total_empresa;

ALTER TABLE app_rrhh.a_1_sueldos_base
    DROP CONSTRAINT IF EXISTS a_1_sueldos_base_porcentaje_costo_empresa_check;

ALTER TABLE app_rrhh.a_1_sueldos_base
    DROP COLUMN IF EXISTS porcentaje_costo_empresa;

COMMIT;
