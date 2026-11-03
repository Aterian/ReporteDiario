-- ============================================================================
-- REVERSIÓN MIGRACIÓN 007: Revertir corrección de id_sueldo en fn_recalcular_liquidacion_mes
-- Proyecto: Check Diario / Reporte Diario (Ingeap)
-- ============================================================================

-- Reversión de fn_recalcular_liquidacion_mes manteniendo el contrato previo si fuese necesario.
-- Nota: La migración 007 corrige una omisión de columna crítica (id_sueldo NOT NULL).
-- La reversión restaura la versión anterior de la migración 006.

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
          AND eliminado_en IS NULL
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

    IF v_modalidad_calculo = 'base_30' AND (v_total_dias_reales >= v_dias_calendario OR v_total_dias_reales > 30) THEN
        v_ajuste := 30 - v_total_dias_reales;
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
      AND TO_CHAR(fecha, 'YYYY-MM') = p_ciclo_cobro
      AND eliminado_en IS NULL;

    v_total_real := GREATEST(0.00, v_suma_costo_dia + (v_delta_ofi * v_dia_ofi) + (v_delta_obra * v_dia_obra));

    INSERT INTO app_rrhh.a_1_calculo_sueldo (
        id_usuario, ciclo_cobro, cant_dias_ofi, cant_dias_obra,
        subtotal_ofi, subtotal_obra, total_real, total_adicionales, actualizado_en
    ) VALUES (
        p_id_usuario, p_ciclo_cobro, v_cant_ofi_final, v_cant_obra_final,
        ROUND(v_cant_ofi_final * v_dia_ofi, 2), ROUND(v_cant_obra_final * v_dia_obra, 2),
        v_total_real, 0.00, CURRENT_TIMESTAMP
    )
    ON CONFLICT (id_usuario, ciclo_cobro) DO UPDATE SET
        cant_dias_ofi = EXCLUDED.cant_dias_ofi,
        cant_dias_obra = EXCLUDED.cant_dias_obra,
        subtotal_ofi = EXCLUDED.subtotal_ofi,
        subtotal_obra = EXCLUDED.subtotal_obra,
        total_real = EXCLUDED.total_real,
        actualizado_en = CURRENT_TIMESTAMP;
END;
$function$;

