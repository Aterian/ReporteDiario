-- [FN-07.12] Blindar triggers de liquidación contra recursión infinita
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
        ) THEN
            UPDATE app_rrhh.b_1_asistencias
            SET fecha = fecha
            WHERE id_asistencia = (
                SELECT id_asistencia FROM app_rrhh.b_1_asistencias
                WHERE id_usuario = OLD.id_usuario
                  AND fecha = OLD.fecha
                  AND costo_manual = FALSE
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
       (TG_OP = 'UPDATE' AND (OLD.id_usuario IS DISTINCT FROM NEW.id_usuario OR TO_CHAR(OLD.fecha, 'YYYY-MM') IS DISTINCT FROM v_ciclo_nuevo)) THEN
        v_ciclo_viejo := TO_CHAR(OLD.fecha, 'YYYY-MM');
        PERFORM app_rrhh.fn_recalcular_liquidacion_mes(OLD.id_usuario, v_ciclo_viejo);
    END IF;
    RETURN NULL;
END;
$function$;

-- [FN-07.12] Preservar costos manuales y atributos al sincronizar turnos de Roster
CREATE OR REPLACE FUNCTION app_rrhh.fn_sincronizar_asistencias_desde_roster()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_lugar app_rrhh.modalidad_lugar;
    v_horas NUMERIC(4, 2);
    v_preservados JSONB;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'fecha', fecha,
            'costo_manual', costo_manual,
            'costo_dia', costo_dia,
            'tipo_dia', tipo_dia::text,
            'hora_inicio', hora_inicio,
            'hora_fin', hora_fin,
            'horas_dedicadas', horas_dedicadas
        )), '[]'::jsonb)
        INTO v_preservados
        FROM app_rrhh.b_1_asistencias
        WHERE id_roster = NEW.id_roster
          AND costo_manual = TRUE
          AND fecha >= NEW.fecha_inicio
          AND fecha <= NEW.fecha_fin;

        DELETE FROM app_rrhh.b_1_asistencias WHERE id_roster = NEW.id_roster;
    END IF;

    IF NEW.tipo_turno = 'activo' THEN
        v_lugar := 'roster';
        v_horas := 8.00;
    ELSE
        v_lugar := 'roster';
        v_horas := 0.00;
    END IF;

    INSERT INTO app_rrhh.b_1_asistencias (
        id_usuario, fecha, activo_franco, lugar, tipo_dia,
        dedicado_a, horas_dedicadas, id_proyecto, id_roster, cargado_por
    )
    SELECT
        NEW.id_usuario,
        d::DATE,
        NEW.tipo_turno,
        v_lugar,
        'dia_normal',
        'proyectos',
        v_horas,
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

