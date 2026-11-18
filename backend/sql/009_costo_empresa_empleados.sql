-- [MOD-08] [FN-08.02] Migración 009: Porcentaje de costo empresa y total empresa provisorio
-- Base de datos: PostgreSQL 14+ (Railway / Test DB)

BEGIN;

ALTER TABLE app_rrhh.a_1_sueldos_base
    ADD COLUMN IF NOT EXISTS porcentaje_costo_empresa NUMERIC(5,2) NOT NULL DEFAULT 0.00;

DO $$ BEGIN
    ALTER TABLE app_rrhh.a_1_sueldos_base
        ADD CONSTRAINT a_1_sueldos_base_porcentaje_costo_empresa_check
        CHECK (porcentaje_costo_empresa >= 0 AND porcentaje_costo_empresa <= 500);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'app_rrhh'
          AND table_name = 'a_1_sueldos_base'
          AND column_name = 'costo_total_empresa'
    ) THEN
        ALTER TABLE app_rrhh.a_1_sueldos_base
            ADD COLUMN costo_total_empresa NUMERIC(12,2)
            GENERATED ALWAYS AS (
                ROUND(
                    (CASE
                        WHEN lugar_habitual = 'obra'::app_rrhh.tipo_lugar_habitual THEN sueldo_obra
                        ELSE sueldo_oficina
                    END) * (1.0 + (porcentaje_costo_empresa / 100.0)),
                    2
                )
            ) STORED;
    END IF;
END $$;

COMMIT;
