-- [MOD-07] [FN-07.20] Revertir Migración: Modalidad de Cálculo Salarial

DROP TRIGGER IF EXISTS trg_recalcular_liquidacion_config_sueldo ON app_rrhh.a_1_sueldos_base;
DROP FUNCTION IF EXISTS app_rrhh.fn_trigger_recalcular_por_config_sueldo();

ALTER TABLE app_rrhh.a_1_sueldos_base
    DROP COLUMN IF EXISTS modalidad_calculo;

DROP TYPE IF EXISTS app_rrhh.tipo_modalidad_calculo;

-- Restaurar versión original de fn_recalcular_liquidacion_mes
CREATE OR REPLACE FUNCTION app_rrhh.fn_recalcular_liquidacion_mes(p_id_usuario uuid, p_ciclo_cobro character varying)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_id_sueldo UUID;
    v_dia_ofi NUMERIC(12, 2);
    v_dia_obra NUMERIC(12, 2);
    v_cant_ofi INTEGER := 0;
    v_cant_obra INTEGER := 0;
    v_total_real NUMERIC(12, 2) := 0.00;
BEGIN
    SELECT id_sueldo, dia_oficina, dia_obra
    INTO v_id_sueldo, v_dia_ofi, v_dia_obra
    FROM app_rrhh.a_1_sueldos_base
    WHERE id_usuario = p_id_usuario;

    IF NOT FOUND THEN
        RETURN;
    END IF;

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
        COUNT(*) FILTER (WHERE tiene_oficina = TRUE),
        COUNT(*) FILTER (WHERE tiene_oficina = FALSE AND tiene_obra = TRUE)
    INTO v_cant_ofi, v_cant_obra
    FROM clasificacion_por_dia;

    SELECT COALESCE(SUM(costo_dia), 0.00)
    INTO v_total_real
    FROM app_rrhh.b_1_asistencias
    WHERE id_usuario = p_id_usuario
      AND TO_CHAR(fecha, 'YYYY-MM') = p_ciclo_cobro;

    INSERT INTO app_rrhh.a_1_calculo_sueldo (
        id_sueldo, id_usuario, ciclo_cobro, cant_dias_ofi, cant_dias_obra,
        subtotal_ofi, subtotal_obra, total_real, actualizado_en
    ) VALUES (
        v_id_sueldo, p_id_usuario, p_ciclo_cobro, COALESCE(v_cant_ofi, 0), COALESCE(v_cant_obra, 0),
        ROUND(COALESCE(v_cant_ofi, 0) * v_dia_ofi, 2),
        ROUND(COALESCE(v_cant_obra, 0) * v_dia_obra, 2),
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

