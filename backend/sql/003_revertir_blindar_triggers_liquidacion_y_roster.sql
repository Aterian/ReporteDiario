-- [FN-07.12] Revertir funciones de liquidación y asistencias de Roster
CREATE OR REPLACE FUNCTION app_rrhh.fn_trigger_sincronizar_liquidacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_ciclo_nuevo VARCHAR(7);
    v_ciclo_viejo VARCHAR(7);
BEGIN
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
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

CREATE OR REPLACE FUNCTION app_rrhh.fn_sincronizar_asistencias_desde_roster()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_lugar app_rrhh.modalidad_lugar;
    v_horas NUMERIC(4, 2);
BEGIN
    IF TG_OP = 'UPDATE' THEN
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

    RETURN NULL;
END;
$function$;

