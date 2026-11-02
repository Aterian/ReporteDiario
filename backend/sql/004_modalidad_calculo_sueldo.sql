-- [MOD-07] [FN-07.20] Migración: Modalidad de Cálculo Salarial ('por_dia' vs 'base_30')

DO $$ BEGIN
    CREATE TYPE app_rrhh.tipo_modalidad_calculo AS ENUM ('por_dia', 'base_30');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE app_rrhh.a_1_sueldos_base
    ADD COLUMN IF NOT EXISTS modalidad_calculo app_rrhh.tipo_modalidad_calculo NOT NULL DEFAULT 'base_30';

-- [FN-07.20] Recalcular liquidación mensual con soporte de base_30 y días mixtos
CREATE OR REPLACE FUNCTION app_rrhh.fn_recalcular_liquidacion_mes(p_id_usuario uuid, p_ciclo_cobro character varying)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_id_sueldo UUID;
    v_dia_ofi NUMERIC(12, 2);
    v_dia_obra NUMERIC(12, 2);
    v_lugar_habitual app_rrhh.tipo_lugar_habitual;
    v_modalidad_calculo app_rrhh.tipo_modalidad_calculo;
    v_cant_ofi INTEGER := 0;
    v_cant_obra INTEGER := 0;
    v_cant_ofi_final INTEGER := 0;
    v_cant_obra_final INTEGER := 0;
    v_total_dias_reales INTEGER := 0;
    v_dias_calendario INTEGER := 30;
    v_ajuste INTEGER := 0;
    v_delta_ofi INTEGER := 0;
    v_delta_obra INTEGER := 0;
    v_suma_costo_dia NUMERIC(12, 2) := 0.00;
    v_total_real NUMERIC(12, 2) := 0.00;
BEGIN
    SELECT id_sueldo, dia_oficina, dia_obra,
           COALESCE(lugar_habitual, 'oficina'),
           COALESCE(modalidad_calculo, 'base_30')
    INTO v_id_sueldo, v_dia_ofi, v_dia_obra, v_lugar_habitual, v_modalidad_calculo
    FROM app_rrhh.a_1_sueldos_base
    WHERE id_usuario = p_id_usuario;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Calcular días calendario del mes específico (ej: 28/29 en feb, 30 en abr, 31 en oct)
    v_dias_calendario := EXTRACT(
        DAY FROM (TO_DATE(p_ciclo_cobro || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')
    )::INTEGER;

    WITH clasificacion_por_dia AS (
        SELECT
            fecha,
            BOOL_OR(lugar = 'oficina') AS tiene_oficina,
            BOOL_OR(lugar IN ('obra', 'roster')) AS tiene_obra
        FROM app_rrhh.b_1_asistencias
        WHERE id_usuario = p_id_usuario
          AND TO_CHAR(fecha, 'YYYY-MM') = p_ciclo_cobro
        GROUP BY fecha
    )
    SELECT
        COALESCE(COUNT(*) FILTER (WHERE tiene_oficina = TRUE), 0),
        COALESCE(COUNT(*) FILTER (WHERE tiene_oficina = FALSE AND tiene_obra = TRUE), 0)
    INTO v_cant_ofi, v_cant_obra
    FROM clasificacion_por_dia;

    v_total_dias_reales := v_cant_ofi + v_cant_obra;
    v_cant_ofi_final := v_cant_ofi;
    v_cant_obra_final := v_cant_obra;

    -- Regla de Meses Incompletos: Solo compensar a 30 si completó el mes calendario o superó 30 días
    IF v_modalidad_calculo = 'base_30' AND (v_total_dias_reales >= v_dias_calendario OR v_total_dias_reales > 30) THEN
        v_ajuste := 30 - v_total_dias_reales;
        -- Regla de Días Mixtos: El ajuste se aplica al contador de lugar_habitual
        IF v_lugar_habitual = 'oficina' THEN
            IF v_cant_ofi + v_ajuste >= 0 THEN
                v_cant_ofi_final := v_cant_ofi + v_ajuste;
            ELSE
                v_cant_ofi_final := 0;
                v_cant_obra_final := GREATEST(0, v_cant_obra + (v_cant_ofi + v_ajuste));
            END IF;
        ELSE
            IF v_cant_obra + v_ajuste >= 0 THEN
                v_cant_obra_final := v_cant_obra + v_ajuste;
            ELSE
                v_cant_obra_final := 0;
                v_cant_ofi_final := GREATEST(0, v_cant_ofi + (v_cant_obra + v_ajuste));
            END IF;
        END IF;
    END IF;

    v_delta_ofi := v_cant_ofi_final - v_cant_ofi;
    v_delta_obra := v_cant_obra_final - v_cant_obra;

    SELECT COALESCE(SUM(costo_dia), 0.00)
    INTO v_suma_costo_dia
    FROM app_rrhh.b_1_asistencias
    WHERE id_usuario = p_id_usuario
      AND TO_CHAR(fecha, 'YYYY-MM') = p_ciclo_cobro;

    -- Preservación de recargos: los pluses por feriado/franco/costo manual se conservan intactos
    v_total_real := GREATEST(
        0.00,
        ROUND(v_suma_costo_dia + (v_delta_ofi * v_dia_ofi) + (v_delta_obra * v_dia_obra), 2)
    );

    INSERT INTO app_rrhh.a_1_calculo_sueldo (
        id_sueldo, id_usuario, ciclo_cobro, cant_dias_ofi, cant_dias_obra,
        subtotal_ofi, subtotal_obra, total_real, actualizado_en
    ) VALUES (
        v_id_sueldo, p_id_usuario, p_ciclo_cobro, v_cant_ofi_final, v_cant_obra_final,
        ROUND(v_cant_ofi_final * v_dia_ofi, 2),
        ROUND(v_cant_obra_final * v_dia_obra, 2),
        v_total_real, CURRENT_TIMESTAMP
    )
    ON CONFLICT (id_usuario, ciclo_cobro)
    DO UPDATE SET
        id_sueldo = EXCLUDED.id_sueldo,
        cant_dias_ofi = EXCLUDED.cant_dias_ofi,
        cant_dias_obra = EXCLUDED.cant_dias_obra,
        subtotal_ofi = EXCLUDED.subtotal_ofi,
        subtotal_obra = EXCLUDED.subtotal_obra,
        total_real = EXCLUDED.total_real,
        actualizado_en = CURRENT_TIMESTAMP;
END;
$function$;

-- [FN-07.20] Trigger para disparar recálculo mensual ante cambios de sueldo o modalidad
CREATE OR REPLACE FUNCTION app_rrhh.fn_trigger_recalcular_por_config_sueldo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    r_ciclo RECORD;
BEGIN
    IF TG_OP = 'INSERT' OR
       OLD.modalidad_calculo IS DISTINCT FROM NEW.modalidad_calculo OR
       OLD.lugar_habitual IS DISTINCT FROM NEW.lugar_habitual OR
       OLD.sueldo_oficina IS DISTINCT FROM NEW.sueldo_oficina OR
       OLD.sueldo_obra IS DISTINCT FROM NEW.sueldo_obra THEN
        FOR r_ciclo IN (
            SELECT DISTINCT ciclo_cobro
            FROM app_rrhh.a_1_calculo_sueldo
            WHERE id_usuario = NEW.id_usuario AND cerrado IS NOT TRUE
            UNION
            SELECT DISTINCT TO_CHAR(fecha, 'YYYY-MM') AS ciclo_cobro
            FROM app_rrhh.b_1_asistencias
            WHERE id_usuario = NEW.id_usuario
        ) LOOP
            IF r_ciclo.ciclo_cobro IS NOT NULL THEN
                PERFORM app_rrhh.fn_recalcular_liquidacion_mes(NEW.id_usuario, r_ciclo.ciclo_cobro);
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recalcular_liquidacion_config_sueldo ON app_rrhh.a_1_sueldos_base;
CREATE TRIGGER trg_recalcular_liquidacion_config_sueldo
    AFTER INSERT OR UPDATE OF modalidad_calculo, lugar_habitual, sueldo_oficina, sueldo_obra
    ON app_rrhh.a_1_sueldos_base
    FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_trigger_recalcular_por_config_sueldo();

