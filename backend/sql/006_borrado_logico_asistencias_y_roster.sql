-- [MOD-07] [FN-07.17] Migración: Borrado Lógico en Asistencias y Roster con Triggers de Liquidación y Auditoría

-- 1. Agregar columnas eliminado_en y eliminado_por a b_1_asistencias
ALTER TABLE app_rrhh.b_1_asistencias
    ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS eliminado_por UUID REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL;

-- 2. Agregar columnas eliminado_en y eliminado_por a b_1_roster
ALTER TABLE app_rrhh.b_1_roster
    ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS eliminado_por UUID REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL;

-- 3. Crear índices parciales para optimizar consultas de registros activos
CREATE INDEX IF NOT EXISTS idx_asistencias_activas_usuario_fecha
    ON app_rrhh.b_1_asistencias (id_usuario, fecha)
    WHERE eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS idx_asistencias_activas_roster
    ON app_rrhh.b_1_asistencias (id_roster)
    WHERE eliminado_en IS NULL;

CREATE INDEX IF NOT EXISTS idx_roster_activos_usuario_fechas
    ON app_rrhh.b_1_roster (id_usuario, fecha_inicio, fecha_fin)
    WHERE eliminado_en IS NULL;

-- 4. Actualizar fn_recalcular_liquidacion_mes para filtrar eliminado_en IS NULL
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

-- 5. Actualizar fn_trigger_sincronizar_liquidacion para contemplar eliminado_en
CREATE OR REPLACE FUNCTION app_rrhh.fn_trigger_sincronizar_liquidacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_ciclo_nuevo VARCHAR(7);
    v_ciclo_viejo VARCHAR(7);
BEGIN
    IF pg_trigger_depth() = 1 AND (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF NOT EXISTS (
            SELECT 1 FROM app_rrhh.b_1_asistencias
            WHERE id_usuario = OLD.id_usuario
              AND fecha = OLD.fecha
              AND costo_dia > 0
              AND eliminado_en IS NULL
        ) THEN
            UPDATE app_rrhh.b_1_asistencias
            SET fecha = fecha
            WHERE id_asistencia = (
                SELECT id_asistencia FROM app_rrhh.b_1_asistencias
                WHERE id_usuario = OLD.id_usuario
                  AND fecha = OLD.fecha
                  AND costo_manual = FALSE
                  AND eliminado_en IS NULL
                ORDER BY CASE WHEN lugar = 'oficina' THEN 1 ELSE 2 END
                LIMIT 1
            );
        END IF;
    END IF;

    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        v_ciclo_nuevo := TO_CHAR(NEW.fecha, 'YYYY-MM');
        PERFORM app_rrhh.fn_recalcular_liquidacion_mes(NEW.id_usuario, v_ciclo_nuevo);
    END IF;

    IF (TG_OP = 'DELETE') OR
       (TG_OP = 'UPDATE' AND (
           OLD.id_usuario IS DISTINCT FROM NEW.id_usuario OR
           TO_CHAR(OLD.fecha, 'YYYY-MM') IS DISTINCT FROM v_ciclo_nuevo OR
           OLD.eliminado_en IS DISTINCT FROM NEW.eliminado_en
       )) THEN
        v_ciclo_viejo := TO_CHAR(OLD.fecha, 'YYYY-MM');
        PERFORM app_rrhh.fn_recalcular_liquidacion_mes(OLD.id_usuario, v_ciclo_viejo);
    END IF;

    RETURN NULL;
END;
$function$;

-- 6. Actualizar fn_calcular_costo_asistencia para considerar solo registros activos
CREATE OR REPLACE FUNCTION app_rrhh.fn_calcular_costo_asistencia()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_sueldo_ofi NUMERIC(12, 2);
    v_sueldo_obra NUMERIC(12, 2);
    v_costo_base NUMERIC(12, 2);
    v_factor NUMERIC(4, 2) := 1.0;
    v_existe_oficina_con_costo BOOLEAN;
    v_existe_obra_con_costo BOOLEAN;
BEGIN
    IF NEW.costo_manual IS TRUE THEN
        IF NEW.costo_dia IS NULL THEN
            NEW.costo_dia := 0.00;
        END IF;
        RETURN NEW;
    END IF;

    SELECT COALESCE(dia_oficina, 0.00), COALESCE(dia_obra, 0.00)
    INTO v_sueldo_ofi, v_sueldo_obra
    FROM app_rrhh.a_1_sueldos_base
    WHERE id_usuario = NEW.id_usuario;

    IF NOT FOUND THEN
        NEW.costo_dia := 0.00;
        RETURN NEW;
    END IF;

    SELECT
        EXISTS (
            SELECT 1 FROM app_rrhh.b_1_asistencias a
            WHERE a.id_usuario = NEW.id_usuario
              AND a.fecha = NEW.fecha
              AND a.id_asistencia IS DISTINCT FROM NEW.id_asistencia
              AND a.lugar = 'oficina'
              AND a.costo_dia > 0
              AND a.eliminado_en IS NULL
        ),
        EXISTS (
            SELECT 1 FROM app_rrhh.b_1_asistencias a
            WHERE a.id_usuario = NEW.id_usuario
              AND a.fecha = NEW.fecha
              AND a.id_asistencia IS DISTINCT FROM NEW.id_asistencia
              AND a.lugar IN ('obra', 'roster')
              AND a.costo_dia > 0
              AND a.eliminado_en IS NULL
        )
    INTO v_existe_oficina_con_costo, v_existe_obra_con_costo;

    IF v_existe_oficina_con_costo THEN
        NEW.costo_dia := 0.00;
        RETURN NEW;
    ELSIF v_existe_obra_con_costo THEN
        IF NEW.lugar = 'oficina' THEN
            UPDATE app_rrhh.b_1_asistencias
            SET costo_dia = 0.00
            WHERE id_usuario = NEW.id_usuario
              AND fecha = NEW.fecha
              AND id_asistencia IS DISTINCT FROM NEW.id_asistencia
              AND lugar IN ('obra', 'roster')
              AND costo_manual = FALSE
              AND costo_dia > 0
              AND eliminado_en IS NULL;
        ELSE
            NEW.costo_dia := 0.00;
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.lugar = 'oficina' THEN
        v_costo_base := v_sueldo_ofi;
    ELSE
        v_costo_base := v_sueldo_obra;
    END IF;

    IF NEW.activo_franco = 'activo' THEN
        IF NEW.tipo_dia = 'feriado_trabajado' THEN
            v_factor := 2.0;
        ELSIF NEW.tipo_dia = 'franco_trabajado' THEN
            v_factor := 1.5;
        ELSE
            v_factor := 1.0;
        END IF;
    ELSE
        v_factor := 1.0;
    END IF;

    NEW.costo_dia := ROUND(v_costo_base * v_factor, 2);
    RETURN NEW;
END;
$function$;

-- 7. Actualizar fn_registrar_modificacion_asistencia para auditar soft-delete
CREATE OR REPLACE FUNCTION app_rrhh.fn_registrar_modificacion_asistencia()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_detalle TEXT;
    v_cambios TEXT[] := ARRAY[]::TEXT[];
    v_autor UUID;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Caso 1: Eliminación Lógica
        IF OLD.eliminado_en IS NULL AND NEW.eliminado_en IS NOT NULL THEN
            v_detalle := format(
                'Registro eliminado lógicamente (Fecha: %s | Estado: %s | Modalidad: %s | Horas: %s | Costo: $%s)',
                OLD.fecha, OLD.activo_franco, OLD.lugar, OLD.horas_dedicadas, OLD.costo_dia
            );
            v_autor := COALESCE(NEW.eliminado_por, NEW.cargado_por, OLD.cargado_por);
            INSERT INTO app_rrhh.b_1_modificaciones_realizadas (
                id_asistencia, id_usuario, fecha_asistencia, tipo_operacion,
                detalle_cambio, valores_anteriores, valores_nuevos, modificado_por
            ) VALUES (
                OLD.id_asistencia, OLD.id_usuario, OLD.fecha, 'ELIMINACION',
                v_detalle, to_jsonb(OLD), to_jsonb(NEW), v_autor
            );
            RETURN NEW;
        END IF;

        -- Caso 2: Restauración Lógica
        IF OLD.eliminado_en IS NOT NULL AND NEW.eliminado_en IS NULL THEN
            v_detalle := format('Registro restaurado a estado activo (Fecha: %s)', NEW.fecha);
            v_autor := COALESCE(NEW.cargado_por, OLD.cargado_por);
            INSERT INTO app_rrhh.b_1_modificaciones_realizadas (
                id_asistencia, id_usuario, fecha_asistencia, tipo_operacion,
                detalle_cambio, valores_anteriores, valores_nuevos, modificado_por
            ) VALUES (
                OLD.id_asistencia, OLD.id_usuario, OLD.fecha, 'MODIFICACION',
                v_detalle, to_jsonb(OLD), to_jsonb(NEW), v_autor
            );
            RETURN NEW;
        END IF;

        -- Caso 3: Modificación convencional de columnas
        IF OLD.fecha IS DISTINCT FROM NEW.fecha THEN
            v_cambios := array_append(v_cambios, format('Fecha: %s -> %s', OLD.fecha, NEW.fecha));
        END IF;
        IF OLD.activo_franco IS DISTINCT FROM NEW.activo_franco THEN
            v_cambios := array_append(v_cambios, format('Estado: %s -> %s', OLD.activo_franco, NEW.activo_franco));
        END IF;
        IF OLD.lugar IS DISTINCT FROM NEW.lugar THEN
            v_cambios := array_append(v_cambios, format('Modalidad: %s -> %s', OLD.lugar, NEW.lugar));
        END IF;
        IF OLD.tipo_dia IS DISTINCT FROM NEW.tipo_dia THEN
            v_cambios := array_append(v_cambios, format('Tipo día: %s -> %s', OLD.tipo_dia, NEW.tipo_dia));
        END IF;
        IF OLD.dedicado_a IS DISTINCT FROM NEW.dedicado_a THEN
            v_cambios := array_append(v_cambios, format('Dedicación: %s -> %s', OLD.dedicado_a, NEW.dedicado_a));
        END IF;
        IF OLD.id_proyecto IS DISTINCT FROM NEW.id_proyecto THEN
            v_cambios := array_append(v_cambios, format('Proyecto: %s -> %s', COALESCE(OLD.id_proyecto::TEXT, 'Ninguno'), COALESCE(NEW.id_proyecto::TEXT, 'Ninguno')));
        END IF;
        IF OLD.horas_dedicadas IS DISTINCT FROM NEW.horas_dedicadas THEN
            v_cambios := array_append(v_cambios, format('Horas: %s -> %s', OLD.horas_dedicadas, NEW.horas_dedicadas));
        END IF;
        IF OLD.costo_dia IS DISTINCT FROM NEW.costo_dia THEN
            v_cambios := array_append(v_cambios, format('Costo día: $%s -> $%s', OLD.costo_dia, NEW.costo_dia));
        END IF;
        IF OLD.costo_manual IS DISTINCT FROM NEW.costo_manual THEN
            v_cambios := array_append(v_cambios, format('Costo manual: %s -> %s', OLD.costo_manual, NEW.costo_manual));
        END IF;

        IF array_length(v_cambios, 1) IS NULL THEN
            RETURN NEW;
        END IF;

        v_detalle := array_to_string(v_cambios, ' | ');
        v_autor := COALESCE(NEW.cargado_por, OLD.cargado_por);

        INSERT INTO app_rrhh.b_1_modificaciones_realizadas (
            id_asistencia, id_usuario, fecha_asistencia, tipo_operacion,
            detalle_cambio, valores_anteriores, valores_nuevos, modificado_por
        ) VALUES (
            OLD.id_asistencia, OLD.id_usuario, OLD.fecha, 'MODIFICACION',
            v_detalle, to_jsonb(OLD), to_jsonb(NEW), v_autor
        );

        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        v_detalle := format(
            'Registro eliminado físicamente (Fecha: %s | Estado: %s | Modalidad: %s | Horas: %s | Costo: $%s)',
            OLD.fecha, OLD.activo_franco, OLD.lugar, OLD.horas_dedicadas, OLD.costo_dia
        );

        INSERT INTO app_rrhh.b_1_modificaciones_realizadas (
            id_asistencia, id_usuario, fecha_asistencia, tipo_operacion,
            detalle_cambio, valores_anteriores, valores_nuevos, modificado_por
        ) VALUES (
            OLD.id_asistencia, OLD.id_usuario, OLD.fecha, 'ELIMINACION',
            v_detalle, to_jsonb(OLD), NULL, OLD.cargado_por
        );

        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$function$;

-- 8. Actualizar fn_sincronizar_asistencias_desde_roster para cascada de soft-delete
CREATE OR REPLACE FUNCTION app_rrhh.fn_sincronizar_asistencias_desde_roster()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_preservados JSONB := '[]'::jsonb;
BEGIN
    -- Cascada de eliminación lógica: si el turno se marca como eliminado, marcar sus asistencias
    IF TG_OP = 'UPDATE' AND OLD.eliminado_en IS NULL AND NEW.eliminado_en IS NOT NULL THEN
        UPDATE app_rrhh.b_1_asistencias
        SET eliminado_en = NEW.eliminado_en,
            eliminado_por = NEW.eliminado_por
        WHERE id_roster = NEW.id_roster
          AND eliminado_en IS NULL;
        RETURN NEW;
    END IF;

    -- Si se restaura el turno
    IF TG_OP = 'UPDATE' AND OLD.eliminado_en IS NOT NULL AND NEW.eliminado_en IS NULL THEN
        UPDATE app_rrhh.b_1_asistencias
        SET eliminado_en = NULL,
            eliminado_por = NULL
        WHERE id_roster = NEW.id_roster;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'fecha', a.fecha,
            'costo_dia', a.costo_dia,
            'tipo_dia', a.tipo_dia,
            'hora_inicio', a.hora_inicio,
            'hora_fin', a.hora_fin,
            'horas_dedicadas', a.horas_dedicadas
        )), '[]'::jsonb)
        INTO v_preservados
        FROM app_rrhh.b_1_asistencias a
        WHERE a.id_roster = NEW.id_roster
          AND (a.costo_manual IS TRUE OR a.tipo_dia != 'dia_normal' OR a.hora_inicio IS NOT NULL OR a.hora_fin IS NOT NULL OR a.horas_dedicadas > 0);

        DELETE FROM app_rrhh.b_1_asistencias WHERE id_roster = NEW.id_roster;
    END IF;

    INSERT INTO app_rrhh.b_1_asistencias (
        id_usuario,
        fecha,
        activo_franco,
        lugar,
        tipo_dia,
        dedicado_a,
        hora_inicio,
        hora_fin,
        horas_dedicadas,
        id_proyecto,
        id_roster,
        cargado_por
    )
    SELECT
        NEW.id_usuario,
        d::date,
        NEW.tipo_turno,
        'obra'::app_rrhh.modalidad_lugar,
        'dia_normal'::app_rrhh.clasificacion_dia,
        'proyectos'::app_rrhh.tipo_dedicacion,
        NULL,
        NULL,
        0.00,
        NEW.id_proyecto,
        NEW.id_roster,
        NEW.cargado_por
    FROM generate_series(NEW.fecha_inicio, NEW.fecha_fin, '1 day'::interval) AS d;

    IF TG_OP = 'UPDATE' AND v_preservados IS NOT NULL AND jsonb_array_length(v_preservados) > 0 THEN
        UPDATE app_rrhh.b_1_asistencias a
        SET costo_manual = TRUE,
            costo_dia = (elem->>'costo_dia')::NUMERIC(12, 2),
            tipo_dia = COALESCE((elem->>'tipo_dia')::app_rrhh.clasificacion_dia, a.tipo_dia),
            hora_inicio = COALESCE((elem->>'hora_inicio')::TIME, a.hora_inicio),
            hora_fin = COALESCE((elem->>'hora_fin')::TIME, a.hora_fin),
            horas_dedicadas = CASE 
                WHEN (elem->>'horas_dedicadas')::NUMERIC > 0 THEN (elem->>'horas_dedicadas')::NUMERIC(4, 2)
                ELSE a.horas_dedicadas
            END
        FROM jsonb_array_elements(v_preservados) AS elem
        WHERE a.id_roster = NEW.id_roster
          AND a.fecha = (elem->>'fecha')::DATE;
    END IF;

    RETURN NULL;
END;
$function$;
