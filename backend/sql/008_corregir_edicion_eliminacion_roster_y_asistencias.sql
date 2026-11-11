-- [MOD-02] [FN-02.08] Corrección de triggers de edición/eliminación de Roster y auditoría de asistencias

-- 0. Garantizar columnas de borrado lógico en b_1_asistencias y b_1_roster
ALTER TABLE app_rrhh.b_1_asistencias
    ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS eliminado_por UUID REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE app_rrhh.b_1_roster
    ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS eliminado_por UUID REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL;

-- 1. Asegurar que id_asistencia en b_1_modificaciones_realizadas permita NULL ante borrados físicos y tenga FK ON DELETE SET NULL
ALTER TABLE app_rrhh.b_1_modificaciones_realizadas
    ALTER COLUMN id_asistencia DROP NOT NULL;

UPDATE app_rrhh.b_1_modificaciones_realizadas m
SET id_asistencia = NULL
WHERE id_asistencia IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM app_rrhh.b_1_asistencias a
      WHERE a.id_asistencia = m.id_asistencia
  );

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'b_1_modificaciones_realizadas_id_asistencia_fkey'
          AND conrelid = 'app_rrhh.b_1_modificaciones_realizadas'::regclass
    ) THEN
        ALTER TABLE app_rrhh.b_1_modificaciones_realizadas
            ADD CONSTRAINT b_1_modificaciones_realizadas_id_asistencia_fkey
            FOREIGN KEY (id_asistencia)
            REFERENCES app_rrhh.b_1_asistencias(id_asistencia)
            ON DELETE SET NULL;
    END IF;
END $$;

-- 2. Actualizar fn_registrar_modificacion_asistencia para insertar id_asistencia = NULL en TG_OP = 'DELETE'
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
            NULL, OLD.id_usuario, OLD.fecha, 'ELIMINACION',
            v_detalle, to_jsonb(OLD), NULL, COALESCE(OLD.eliminado_por, OLD.cargado_por)
        );

        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$function$;

-- 3. Actualizar fn_sincronizar_asistencias_desde_roster para sincronización in-place sin DELETE destructivo
CREATE OR REPLACE FUNCTION app_rrhh.fn_sincronizar_asistencias_desde_roster()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_horas_default NUMERIC(4, 2);
BEGIN
    -- Cascada de eliminación lógica: si el turno se marca como eliminado, marcar sus asistencias activas
    IF TG_OP = 'UPDATE' AND OLD.eliminado_en IS NULL AND NEW.eliminado_en IS NOT NULL THEN
        UPDATE app_rrhh.b_1_asistencias
        SET eliminado_en = NEW.eliminado_en,
            eliminado_por = COALESCE(NEW.eliminado_por, NEW.cargado_por)
        WHERE id_roster = NEW.id_roster
          AND eliminado_en IS NULL;
        RETURN NEW;
    END IF;

    -- Si el turno sigue eliminado lógicamente, no generar asistencias
    IF NEW.eliminado_en IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_horas_default := CASE WHEN NEW.tipo_turno = 'activo' THEN 8.00 ELSE 0.00 END;

    -- Si se restaura un turno previamente eliminado lógicamente, reactivar sus asistencias dentro del rango
    IF TG_OP = 'UPDATE' AND OLD.eliminado_en IS NOT NULL AND NEW.eliminado_en IS NULL THEN
        UPDATE app_rrhh.b_1_asistencias
        SET eliminado_en = NULL,
            eliminado_por = NULL
        WHERE id_roster = NEW.id_roster
          AND fecha >= NEW.fecha_inicio
          AND fecha <= NEW.fecha_fin;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Soft-delete de asistencias que quedaron fuera del nuevo rango de fechas del turno
        UPDATE app_rrhh.b_1_asistencias
        SET eliminado_en = TIMEZONE('utc', NOW()),
            eliminado_por = COALESCE(NEW.cargado_por, OLD.cargado_por)
        WHERE id_roster = NEW.id_roster
          AND eliminado_en IS NULL
          AND (fecha < NEW.fecha_inicio OR fecha > NEW.fecha_fin);

        -- Actualizar in-place las asistencias activas existentes dentro del rango preservando id_asistencia y costos manuales
        UPDATE app_rrhh.b_1_asistencias
        SET id_usuario = NEW.id_usuario,
            id_proyecto = NEW.id_proyecto,
            activo_franco = NEW.tipo_turno,
            lugar = 'roster'::app_rrhh.modalidad_lugar,
            dedicado_a = 'proyectos'::app_rrhh.tipo_dedicacion,
            tipo_dia = CASE
                WHEN NEW.tipo_turno = 'activo' THEN tipo_dia
                ELSE 'dia_normal'::app_rrhh.clasificacion_dia
            END,
            horas_dedicadas = CASE
                WHEN NEW.tipo_turno = 'activo' THEN
                    CASE WHEN COALESCE(horas_dedicadas, 0) > 0 THEN horas_dedicadas ELSE 8.00 END
                ELSE 0.00
            END,
            cargado_por = COALESCE(NEW.cargado_por, cargado_por)
        WHERE id_roster = NEW.id_roster
          AND eliminado_en IS NULL
          AND fecha >= NEW.fecha_inicio
          AND fecha <= NEW.fecha_fin;
    END IF;

    -- Insertar únicamente los días del rango que no posean una asistencia activa para este turno
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
        d::DATE,
        NEW.tipo_turno,
        'roster'::app_rrhh.modalidad_lugar,
        'dia_normal'::app_rrhh.clasificacion_dia,
        'proyectos'::app_rrhh.tipo_dedicacion,
        NULL,
        NULL,
        v_horas_default,
        NEW.id_proyecto,
        NEW.id_roster,
        NEW.cargado_por
    FROM generate_series(NEW.fecha_inicio, NEW.fecha_fin, '1 day'::interval) AS d
    WHERE NOT EXISTS (
        SELECT 1
        FROM app_rrhh.b_1_asistencias a
        WHERE a.id_roster = NEW.id_roster
          AND a.fecha = d::DATE
          AND a.eliminado_en IS NULL
    );

    RETURN NEW;
END;
$function$;

-- 4. Recrear trg_generar_asistencias_roster incluyendo eliminado_en en las columnas monitoreadas
DROP TRIGGER IF EXISTS trg_generar_asistencias_roster ON app_rrhh.b_1_roster;
CREATE TRIGGER trg_generar_asistencias_roster
    AFTER INSERT OR UPDATE OF id_usuario, id_proyecto, fecha_inicio, fecha_fin, tipo_turno, eliminado_en
    ON app_rrhh.b_1_roster
    FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_sincronizar_asistencias_desde_roster();

-- 5. Sanear registros de asistencia de Roster activos que quedaron con lugar = 'obra' o horas 0 por la migración 006
UPDATE app_rrhh.b_1_asistencias
SET lugar = 'roster'::app_rrhh.modalidad_lugar,
    horas_dedicadas = CASE
        WHEN activo_franco = 'activo' AND COALESCE(horas_dedicadas, 0) = 0 THEN 8.00
        ELSE horas_dedicadas
    END
WHERE id_roster IS NOT NULL
  AND eliminado_en IS NULL
  AND (lugar != 'roster'::app_rrhh.modalidad_lugar OR (activo_franco = 'activo' AND COALESCE(horas_dedicadas, 0) = 0));
