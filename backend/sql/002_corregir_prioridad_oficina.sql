-- [FN-07.11] Evitar restaurar el costo de Obra durante la prioridad de Oficina
CREATE OR REPLACE FUNCTION app_rrhh.fn_trigger_sincronizar_liquidacion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_ciclo_nuevo VARCHAR(7);
    v_ciclo_viejo VARCHAR(7);
BEGIN
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND (pg_trigger_depth() = 1 OR OLD.costo_dia IS NOT DISTINCT FROM NEW.costo_dia)) THEN
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
$function$
