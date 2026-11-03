-- [FN-07.10] Estructura introspectada para pruebas aisladas; no contiene datos
CREATE SCHEMA "app_rrhh";

CREATE SCHEMA "app_proyectos";

CREATE TYPE "app_rrhh"."clasificacion_dia" AS ENUM ('dia_normal','franco_trabajado','feriado_trabajado');

CREATE TYPE "app_rrhh"."estado_asistencia" AS ENUM ('activo','franco','vacaciones','licencia');

CREATE TYPE "app_rrhh"."modalidad_lugar" AS ENUM ('oficina','obra','roster');

CREATE TYPE "app_rrhh"."tipo_dedicacion" AS ENUM ('areas','proyectos');

CREATE TYPE "app_rrhh"."tipo_lugar_habitual" AS ENUM ('oficina','obra');

CREATE TYPE "app_rrhh"."tipo_modalidad_calculo" AS ENUM ('por_dia','base_30');

CREATE TYPE "app_rrhh"."tipo_operacion_auditoria" AS ENUM ('MODIFICACION','ELIMINACION');

CREATE TABLE "app_proyectos"."b_1_proyectos_servicios" ("id_servicio" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_proyecto" uuid,
"responsable_des" character varying(60),
"n_serv" numeric(10,0),
"codificacion_serv" character varying(100),
"url_des" character varying(100));

CREATE TABLE "app_rrhh"."a_1_adicionales_sueldo" ("id_adicional" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_calculo_sueldo" uuid NOT NULL,
"fecha" date DEFAULT CURRENT_DATE NOT NULL,
"cantidad_adicional" numeric(12,2) DEFAULT 0.00 NOT NULL,
"descripcion" character varying(255) NOT NULL,
"creado_en" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
"eliminado_en" timestamp with time zone DEFAULT NULL,
"eliminado_por" uuid);

CREATE TABLE "app_rrhh"."a_1_calculo_sueldo" ("id_calculo_sueldo" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_sueldo" uuid NOT NULL,
"id_usuario" uuid NOT NULL,
"ciclo_cobro" character varying(7) NOT NULL,
"cant_dias_ofi" integer DEFAULT 0 NOT NULL,
"cant_dias_obra" integer DEFAULT 0 NOT NULL,
"subtotal_ofi" numeric(12,2) DEFAULT 0.00 NOT NULL,
"subtotal_obra" numeric(12,2) DEFAULT 0.00 NOT NULL,
"subtotal_estimado" numeric(12,2) GENERATED ALWAYS AS ((subtotal_ofi + subtotal_obra)) STORED,
"total_real" numeric(12,2) DEFAULT 0.00 NOT NULL,
"total_adicionales" numeric(12,2) DEFAULT 0.00 NOT NULL,
"sueldo_total" numeric(12,2) GENERATED ALWAYS AS ((total_real + total_adicionales)) STORED,
"cerrado" boolean DEFAULT false NOT NULL,
"actualizado_en" timestamp with time zone DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE "app_rrhh"."a_1_historial_sueldos" ("id_historial_sueldo" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_sueldo_origen" uuid NOT NULL,
"id_usuario" uuid NOT NULL,
"sueldo_oficina" numeric(12,2) NOT NULL,
"sueldo_obra" numeric(12,2) NOT NULL,
"dia_oficina" numeric(12,2) NOT NULL,
"dia_obra" numeric(12,2) NOT NULL,
"lugar_habitual" app_rrhh.tipo_lugar_habitual NOT NULL,
"vigente_desde" date NOT NULL,
"vigente_hasta" date DEFAULT CURRENT_DATE NOT NULL,
"registrado_en" timestamp with time zone DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE "app_rrhh"."a_1_sueldos_base" ("id_sueldo" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_usuario" uuid NOT NULL,
"sueldo_oficina" numeric(12,2) DEFAULT 0.00 NOT NULL,
"sueldo_obra" numeric(12,2) DEFAULT 0.00 NOT NULL,
"dia_oficina" numeric(12,2) GENERATED ALWAYS AS (round((sueldo_oficina / 30.0), 2)) STORED,
"dia_obra" numeric(12,2) GENERATED ALWAYS AS (round((sueldo_obra / 30.0), 2)) STORED,
"lugar_habitual" app_rrhh.tipo_lugar_habitual DEFAULT 'oficina'::app_rrhh.tipo_lugar_habitual NOT NULL,
"modalidad_calculo" app_rrhh.tipo_modalidad_calculo DEFAULT 'base_30'::app_rrhh.tipo_modalidad_calculo NOT NULL,
"vigente_desde" date DEFAULT CURRENT_DATE NOT NULL,
"actualizado_en" timestamp with time zone DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE "app_rrhh"."a_1_usuarios" ("id_usuario" uuid DEFAULT gen_random_uuid() NOT NULL,
"dni" character varying(20) NOT NULL,
"nombre" character varying(100) NOT NULL,
"apellido" character varying(100) NOT NULL,
"correo" character varying(150) NOT NULL,
"area" character varying(50) NOT NULL,
"activo" boolean DEFAULT true NOT NULL,
"creado_en" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"rol_app" character varying);

CREATE TABLE "app_rrhh"."b_1_asistencias" ("id_asistencia" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_usuario" uuid NOT NULL,
"fecha" date NOT NULL,
"activo_franco" app_rrhh.estado_asistencia DEFAULT 'activo'::app_rrhh.estado_asistencia NOT NULL,
"lugar" app_rrhh.modalidad_lugar DEFAULT 'oficina'::app_rrhh.modalidad_lugar NOT NULL,
"tipo_dia" app_rrhh.clasificacion_dia DEFAULT 'dia_normal'::app_rrhh.clasificacion_dia NOT NULL,
"dedicado_a" app_rrhh.tipo_dedicacion DEFAULT 'proyectos'::app_rrhh.tipo_dedicacion NOT NULL,
"hora_inicio" time without time zone,
"hora_fin" time without time zone,
"horas_dedicadas" numeric(4,2) DEFAULT 0.00 NOT NULL,
"id_proyecto" uuid,
"id_roster" uuid,
"costo_dia" numeric(12,2) DEFAULT 0.00 NOT NULL,
"costo_manual" boolean DEFAULT false NOT NULL,
"cargado_por" uuid,
"fecha_hora_carga" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
"eliminado_en" timestamp with time zone DEFAULT NULL,
"eliminado_por" uuid);

CREATE TABLE "app_rrhh"."b_1_roster" ("id_roster" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_proyecto" uuid NOT NULL,
"id_usuario" uuid NOT NULL,
"id_tarifa" uuid,
"fecha_inicio" date NOT NULL,
"fecha_fin" date NOT NULL,
"tipo_turno" app_rrhh.estado_asistencia DEFAULT 'activo'::app_rrhh.estado_asistencia NOT NULL,
"total_viaticos" numeric(12,2) DEFAULT 0.00 NOT NULL,
"cargado_por" uuid,
"creado_en" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
"eliminado_en" timestamp with time zone DEFAULT NULL,
"eliminado_por" uuid);

CREATE TABLE "app_rrhh"."b_1_tarifas_roster" ("id_tarifa" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_proyecto" uuid NOT NULL,
"dia_normal" numeric(12,2) DEFAULT 0.00 NOT NULL,
"dia_domingo" numeric(12,2) DEFAULT 0.00 NOT NULL,
"subida" numeric(12,2) DEFAULT 0.00 NOT NULL,
"bajada" numeric(12,2) DEFAULT 0.00 NOT NULL,
"adicional_turno" numeric(12,2) DEFAULT 0.00 NOT NULL,
"es_activa" boolean DEFAULT true NOT NULL,
"creado_en" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
"eliminado_en" timestamp with time zone DEFAULT NULL,
"eliminado_por" uuid);

CREATE TABLE "app_rrhh"."b_1_modificaciones_realizadas" ("id_modificacion" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_asistencia" uuid NOT NULL,
"id_usuario" uuid NOT NULL,
"fecha_asistencia" date NOT NULL,
"tipo_operacion" app_rrhh.tipo_operacion_auditoria NOT NULL,
"detalle_cambio" text NOT NULL,
"valores_anteriores" jsonb NOT NULL,
"valores_nuevos" jsonb,
"modificado_por" uuid,
"fecha_hora_modificacion" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
"revisado" boolean DEFAULT false NOT NULL,
"revisado_por" uuid,
"fecha_hora_revision" timestamp with time zone);
ALTER TABLE "app_rrhh"."b_1_modificaciones_realizadas" ADD CONSTRAINT "b_1_modificaciones_realizadas_pkey" PRIMARY KEY (id_modificacion);
ALTER TABLE "app_rrhh"."b_1_modificaciones_realizadas" ADD CONSTRAINT "b_1_modificaciones_realizadas_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE RESTRICT;
ALTER TABLE "app_rrhh"."b_1_modificaciones_realizadas" ADD CONSTRAINT "b_1_modificaciones_realizadas_modificado_por_fkey" FOREIGN KEY (modificado_por) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL;
ALTER TABLE "app_rrhh"."b_1_modificaciones_realizadas" ADD CONSTRAINT "b_1_modificaciones_realizadas_revisado_por_fkey" FOREIGN KEY (revisado_por) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL;
CREATE INDEX idx_modificaciones_asistencia ON app_rrhh.b_1_modificaciones_realizadas USING btree (id_asistencia);
CREATE INDEX idx_modificaciones_revisado ON app_rrhh.b_1_modificaciones_realizadas USING btree (revisado, fecha_hora_modificacion DESC);

ALTER TABLE "app_proyectos"."b_1_proyectos_servicios" ADD CONSTRAINT "b_1_proyectos_servicios_pkey" PRIMARY KEY (id_servicio);

ALTER TABLE "app_proyectos"."b_1_proyectos_servicios" ADD CONSTRAINT "uq_b_1_proyectos_servicios_id_proyecto" UNIQUE (id_proyecto);

ALTER TABLE "app_rrhh"."a_1_adicionales_sueldo" ADD CONSTRAINT "a_1_adicionales_sueldo_pkey" PRIMARY KEY (id_adicional);

ALTER TABLE "app_rrhh"."a_1_calculo_sueldo" ADD CONSTRAINT "a_1_calculo_sueldo_cant_dias_obra_check" CHECK ((cant_dias_obra >= 0));

ALTER TABLE "app_rrhh"."a_1_calculo_sueldo" ADD CONSTRAINT "a_1_calculo_sueldo_cant_dias_ofi_check" CHECK ((cant_dias_ofi >= 0));

ALTER TABLE "app_rrhh"."a_1_calculo_sueldo" ADD CONSTRAINT "a_1_calculo_sueldo_ciclo_cobro_check" CHECK (((ciclo_cobro)::text ~ '^\d{4}-(0[1-9]|1[0-2])$'::text));

ALTER TABLE "app_rrhh"."a_1_calculo_sueldo" ADD CONSTRAINT "a_1_calculo_sueldo_pkey" PRIMARY KEY (id_calculo_sueldo);

ALTER TABLE "app_rrhh"."a_1_calculo_sueldo" ADD CONSTRAINT "uq_usuario_ciclo" UNIQUE (id_usuario, ciclo_cobro);

ALTER TABLE "app_rrhh"."a_1_historial_sueldos" ADD CONSTRAINT "a_1_historial_sueldos_pkey" PRIMARY KEY (id_historial_sueldo);

ALTER TABLE "app_rrhh"."a_1_sueldos_base" ADD CONSTRAINT "a_1_sueldos_base_id_usuario_key" UNIQUE (id_usuario);

ALTER TABLE "app_rrhh"."a_1_sueldos_base" ADD CONSTRAINT "a_1_sueldos_base_pkey" PRIMARY KEY (id_sueldo);

ALTER TABLE "app_rrhh"."a_1_sueldos_base" ADD CONSTRAINT "a_1_sueldos_base_sueldo_obra_check" CHECK ((sueldo_obra >= (0)::numeric));

ALTER TABLE "app_rrhh"."a_1_sueldos_base" ADD CONSTRAINT "a_1_sueldos_base_sueldo_oficina_check" CHECK ((sueldo_oficina >= (0)::numeric));

ALTER TABLE "app_rrhh"."a_1_usuarios" ADD CONSTRAINT "a_1_usuarios_correo_key" UNIQUE (correo);

ALTER TABLE "app_rrhh"."a_1_usuarios" ADD CONSTRAINT "a_1_usuarios_dni_key" UNIQUE (dni);

ALTER TABLE "app_rrhh"."a_1_usuarios" ADD CONSTRAINT "a_1_usuarios_pkey" PRIMARY KEY (id_usuario);

ALTER TABLE "app_rrhh"."b_1_asistencias" ADD CONSTRAINT "b_1_asistencias_costo_dia_check" CHECK ((costo_dia >= (0)::numeric));

ALTER TABLE "app_rrhh"."b_1_asistencias" ADD CONSTRAINT "b_1_asistencias_horas_dedicadas_check" CHECK (((horas_dedicadas >= (0)::numeric) AND (horas_dedicadas <= (24)::numeric)));

ALTER TABLE "app_rrhh"."b_1_asistencias" ADD CONSTRAINT "b_1_asistencias_pkey" PRIMARY KEY (id_asistencia);

ALTER TABLE "app_rrhh"."b_1_asistencias" ADD CONSTRAINT "chk_coherencia_dia_no_trabajado" CHECK (((activo_franco = 'activo'::app_rrhh.estado_asistencia) OR (tipo_dia = 'dia_normal'::app_rrhh.clasificacion_dia)));

ALTER TABLE "app_rrhh"."b_1_roster" ADD CONSTRAINT "b_1_roster_pkey" PRIMARY KEY (id_roster);

ALTER TABLE "app_rrhh"."b_1_roster" ADD CONSTRAINT "b_1_roster_total_viaticos_check" CHECK ((total_viaticos >= (0)::numeric));

ALTER TABLE "app_rrhh"."b_1_roster" ADD CONSTRAINT "chk_rango_fechas_roster" CHECK ((fecha_fin >= fecha_inicio));

ALTER TABLE "app_rrhh"."b_1_tarifas_roster" ADD CONSTRAINT "b_1_tarifas_roster_adicional_turno_check" CHECK ((adicional_turno >= (0)::numeric));

ALTER TABLE "app_rrhh"."b_1_tarifas_roster" ADD CONSTRAINT "b_1_tarifas_roster_bajada_check" CHECK ((bajada >= (0)::numeric));

ALTER TABLE "app_rrhh"."b_1_tarifas_roster" ADD CONSTRAINT "b_1_tarifas_roster_dia_domingo_check" CHECK ((dia_domingo >= (0)::numeric));

ALTER TABLE "app_rrhh"."b_1_tarifas_roster" ADD CONSTRAINT "b_1_tarifas_roster_dia_normal_check" CHECK ((dia_normal >= (0)::numeric));

ALTER TABLE "app_rrhh"."b_1_tarifas_roster" ADD CONSTRAINT "b_1_tarifas_roster_pkey" PRIMARY KEY (id_tarifa);

ALTER TABLE "app_rrhh"."b_1_tarifas_roster" ADD CONSTRAINT "b_1_tarifas_roster_subida_check" CHECK ((subida >= (0)::numeric));

ALTER TABLE "app_rrhh"."a_1_adicionales_sueldo" ADD CONSTRAINT "a_1_adicionales_sueldo_id_calculo_sueldo_fkey" FOREIGN KEY (id_calculo_sueldo) REFERENCES app_rrhh.a_1_calculo_sueldo(id_calculo_sueldo) ON DELETE CASCADE;

ALTER TABLE "app_rrhh"."a_1_calculo_sueldo" ADD CONSTRAINT "a_1_calculo_sueldo_id_sueldo_fkey" FOREIGN KEY (id_sueldo) REFERENCES app_rrhh.a_1_sueldos_base(id_sueldo) ON DELETE RESTRICT;

ALTER TABLE "app_rrhh"."a_1_calculo_sueldo" ADD CONSTRAINT "a_1_calculo_sueldo_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE RESTRICT;

ALTER TABLE "app_rrhh"."a_1_historial_sueldos" ADD CONSTRAINT "a_1_historial_sueldos_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE RESTRICT;

ALTER TABLE "app_rrhh"."a_1_sueldos_base" ADD CONSTRAINT "a_1_sueldos_base_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE RESTRICT;

ALTER TABLE "app_rrhh"."b_1_asistencias" ADD CONSTRAINT "b_1_asistencias_cargado_por_fkey" FOREIGN KEY (cargado_por) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE "app_rrhh"."b_1_asistencias" ADD CONSTRAINT "b_1_asistencias_id_proyecto_fkey" FOREIGN KEY (id_proyecto) REFERENCES app_proyectos.b_1_proyectos_servicios(id_proyecto) ON DELETE SET NULL;

ALTER TABLE "app_rrhh"."b_1_asistencias" ADD CONSTRAINT "b_1_asistencias_id_roster_fkey" FOREIGN KEY (id_roster) REFERENCES app_rrhh.b_1_roster(id_roster) ON DELETE CASCADE;

ALTER TABLE "app_rrhh"."b_1_asistencias" ADD CONSTRAINT "b_1_asistencias_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE RESTRICT;

ALTER TABLE "app_rrhh"."b_1_roster" ADD CONSTRAINT "b_1_roster_cargado_por_fkey" FOREIGN KEY (cargado_por) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL;

ALTER TABLE "app_rrhh"."b_1_roster" ADD CONSTRAINT "b_1_roster_id_proyecto_fkey" FOREIGN KEY (id_proyecto) REFERENCES app_proyectos.b_1_proyectos_servicios(id_proyecto) ON DELETE RESTRICT;

ALTER TABLE "app_rrhh"."b_1_roster" ADD CONSTRAINT "b_1_roster_id_tarifa_fkey" FOREIGN KEY (id_tarifa) REFERENCES app_rrhh.b_1_tarifas_roster(id_tarifa) ON DELETE RESTRICT;

ALTER TABLE "app_rrhh"."b_1_roster" ADD CONSTRAINT "b_1_roster_id_usuario_fkey" FOREIGN KEY (id_usuario) REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE RESTRICT;

ALTER TABLE "app_rrhh"."b_1_tarifas_roster" ADD CONSTRAINT "b_1_tarifas_roster_id_proyecto_fkey" FOREIGN KEY (id_proyecto) REFERENCES app_proyectos.b_1_proyectos_servicios(id_proyecto) ON DELETE CASCADE;

CREATE INDEX idx_adicionales_calculo_fecha ON app_rrhh.a_1_adicionales_sueldo USING btree (id_calculo_sueldo, fecha);

CREATE UNIQUE INDEX idx_unica_tarifa_activa_proyecto ON app_rrhh.b_1_tarifas_roster USING btree (id_proyecto) WHERE (es_activa = true);

CREATE INDEX idx_roster_fechas ON app_rrhh.b_1_roster USING btree (fecha_inicio, fecha_fin);

CREATE INDEX idx_roster_usuario ON app_rrhh.b_1_roster USING btree (id_usuario, fecha_inicio);

CREATE INDEX idx_asistencias_usuario_fecha ON app_rrhh.b_1_asistencias USING btree (id_usuario, fecha);

CREATE INDEX idx_asistencias_id_roster ON app_rrhh.b_1_asistencias USING btree (id_roster);

CREATE OR REPLACE FUNCTION app_rrhh.fn_archivar_historial_sueldo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

BEGIN

    IF (OLD.sueldo_oficina IS DISTINCT FROM NEW.sueldo_oficina) OR

       (OLD.sueldo_obra IS DISTINCT FROM NEW.sueldo_obra) THEN

        INSERT INTO app_rrhh.a_1_historial_sueldos (

            id_sueldo_origen, id_usuario, sueldo_oficina, sueldo_obra,

            dia_oficina, dia_obra, lugar_habitual, vigente_desde, vigente_hasta

        ) VALUES (

            OLD.id_sueldo, OLD.id_usuario, OLD.sueldo_oficina, OLD.sueldo_obra,

            OLD.dia_oficina, OLD.dia_obra, OLD.lugar_habitual, OLD.vigente_desde, CURRENT_DATE

        );

        NEW.vigente_desde := CURRENT_DATE;

        NEW.actualizado_en := CURRENT_TIMESTAMP;

    END IF;

    RETURN NEW;

END;

$function$;

CREATE OR REPLACE FUNCTION app_rrhh.fn_calcular_costo_asistencia()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

DECLARE

    v_dia_ofi NUMERIC(12, 2);

    v_dia_obra NUMERIC(12, 2);

    v_costo_base NUMERIC(12, 2);

    v_existe_oficina_con_costo BOOLEAN;

    v_existe_obra_con_costo BOOLEAN;

BEGIN

    IF NEW.hora_inicio IS NOT NULL AND NEW.hora_fin IS NOT NULL AND (NEW.horas_dedicadas IS NULL OR NEW.horas_dedicadas = 0) THEN

        NEW.horas_dedicadas := ROUND(EXTRACT(EPOCH FROM (NEW.hora_fin - NEW.hora_inicio)) / 3600.0, 2);

    END IF;

    IF NEW.costo_manual = TRUE THEN

        RETURN NEW;

    END IF;

    SELECT dia_oficina, dia_obra INTO v_dia_ofi, v_dia_obra

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

        ),

        EXISTS (

            SELECT 1 FROM app_rrhh.b_1_asistencias a

            WHERE a.id_usuario = NEW.id_usuario

              AND a.fecha = NEW.fecha

              AND a.id_asistencia IS DISTINCT FROM NEW.id_asistencia

              AND a.lugar IN ('obra', 'roster')

              AND a.costo_dia > 0

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

              AND costo_dia > 0;

            v_costo_base := v_dia_ofi;

        ELSE

            NEW.costo_dia := 0.00;

            RETURN NEW;

        END IF;

    ELSE

        IF NEW.lugar = 'oficina' THEN

            v_costo_base := v_dia_ofi;

        ELSE

            v_costo_base := v_dia_obra;

        END IF;

    END IF;

    IF NEW.activo_franco = 'activo' AND NEW.tipo_dia = 'feriado_trabajado' THEN

        NEW.costo_dia := ROUND(v_costo_base * 2.0, 2);

    ELSIF NEW.activo_franco = 'activo' AND NEW.tipo_dia = 'franco_trabajado' THEN

        NEW.costo_dia := ROUND(v_costo_base * 1.5, 2);

    ELSE

        NEW.costo_dia := v_costo_base;

    END IF;

    RETURN NEW;

END;

$function$;

CREATE OR REPLACE FUNCTION app_rrhh.fn_calcular_viaticos_roster()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

DECLARE

    v_id_tarifa UUID;

    v_dia_normal NUMERIC(12, 2) := 0.00;

    v_dia_domingo NUMERIC(12, 2) := 0.00;

    v_subida NUMERIC(12, 2) := 0.00;

    v_bajada NUMERIC(12, 2) := 0.00;

    v_adicional NUMERIC(12, 2) := 0.00;

    v_cant_normales INTEGER := 0;

    v_cant_domingos INTEGER := 0;

BEGIN

    IF NEW.id_tarifa IS NULL OR (TG_OP = 'UPDATE' AND OLD.id_proyecto IS DISTINCT FROM NEW.id_proyecto) THEN

        SELECT id_tarifa, dia_normal, dia_domingo, subida, bajada, adicional_turno

        INTO v_id_tarifa, v_dia_normal, v_dia_domingo, v_subida, v_bajada, v_adicional

        FROM app_rrhh.b_1_tarifas_roster

        WHERE id_proyecto = NEW.id_proyecto

          AND es_activa = TRUE

        LIMIT 1;

        NEW.id_tarifa := v_id_tarifa;

    ELSE

        SELECT dia_normal, dia_domingo, subida, bajada, adicional_turno

        INTO v_dia_normal, v_dia_domingo, v_subida, v_bajada, v_adicional

        FROM app_rrhh.b_1_tarifas_roster

        WHERE id_tarifa = NEW.id_tarifa;

    END IF;

    v_dia_normal := COALESCE(v_dia_normal, 0.00);

    v_dia_domingo := COALESCE(v_dia_domingo, 0.00);

    v_subida := COALESCE(v_subida, 0.00);

    v_bajada := COALESCE(v_bajada, 0.00);

    v_adicional := COALESCE(v_adicional, 0.00);

    IF NEW.tipo_turno = 'activo' THEN

        IF NEW.fecha_fin > NEW.fecha_inicio THEN

            SELECT

                COUNT(*) FILTER (WHERE EXTRACT(DOW FROM d) <> 0),

                COUNT(*) FILTER (WHERE EXTRACT(DOW FROM d) = 0)

            INTO v_cant_normales, v_cant_domingos

            FROM generate_series(NEW.fecha_inicio, NEW.fecha_fin - INTERVAL '1 day', '1 day'::interval) AS d;

        ELSE

            v_cant_normales := 0;

            v_cant_domingos := 0;

        END IF;

        NEW.total_viaticos := ROUND(

            (v_cant_normales * v_dia_normal) +

            (v_cant_domingos * v_dia_domingo) +

            v_bajada +

            v_adicional,

            2

        );

    ELSIF NEW.tipo_turno = 'franco' THEN

        NEW.total_viaticos := ROUND(v_subida, 2);

    ELSE

        NEW.total_viaticos := 0.00;

    END IF;

    RETURN NEW;

END;

$function$;

CREATE OR REPLACE FUNCTION app_rrhh.fn_desactivar_tarifas_anteriores()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

BEGIN

    IF NEW.es_activa = TRUE THEN

        UPDATE app_rrhh.b_1_tarifas_roster

        SET es_activa = FALSE

        WHERE id_proyecto = NEW.id_proyecto

          AND id_tarifa IS DISTINCT FROM NEW.id_tarifa

          AND es_activa = TRUE;

    END IF;

    RETURN NEW;

END;

$function$;

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

CREATE OR REPLACE FUNCTION app_rrhh.fn_sincronizar_total_adicionales()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

DECLARE

    v_id_calc UUID;

BEGIN

    v_id_calc := COALESCE(NEW.id_calculo_sueldo, OLD.id_calculo_sueldo);

    UPDATE app_rrhh.a_1_calculo_sueldo

    SET total_adicionales = COALESCE((

            SELECT SUM(cantidad_adicional)

            FROM app_rrhh.a_1_adicionales_sueldo

            WHERE id_calculo_sueldo = v_id_calc

        ), 0.00),

        actualizado_en = CURRENT_TIMESTAMP

    WHERE id_calculo_sueldo = v_id_calc;

    RETURN NULL;

END;

$function$;

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

CREATE OR REPLACE FUNCTION app_rrhh.fn_registrar_modificacion_asistencia()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_cambios TEXT[] := ARRAY[]::TEXT[];
    v_detalle TEXT;
    v_autor UUID;
BEGIN
    IF TG_OP = 'UPDATE' THEN
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
            'Registro eliminado (Fecha: %s | Estado: %s | Modalidad: %s | Horas: %s | Costo: $%s)',
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

CREATE TRIGGER trg_actualizar_total_adicionales AFTER INSERT OR DELETE OR UPDATE ON app_rrhh.a_1_adicionales_sueldo FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_sincronizar_total_adicionales();

CREATE TRIGGER trg_auditar_modificaciones_asistencia AFTER DELETE OR UPDATE ON app_rrhh.b_1_asistencias FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_registrar_modificacion_asistencia();

CREATE TRIGGER trg_calcular_costo_asistencia BEFORE INSERT OR UPDATE OF id_usuario, fecha, activo_franco, lugar, tipo_dia, costo_manual ON app_rrhh.b_1_asistencias FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_calcular_costo_asistencia();

CREATE TRIGGER trg_calcular_viaticos_roster BEFORE INSERT OR UPDATE OF id_proyecto, id_tarifa, fecha_inicio, fecha_fin, tipo_turno ON app_rrhh.b_1_roster FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_calcular_viaticos_roster();

CREATE TRIGGER trg_generar_asistencias_roster AFTER INSERT OR UPDATE OF id_usuario, id_proyecto, fecha_inicio, fecha_fin, tipo_turno ON app_rrhh.b_1_roster FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_sincronizar_asistencias_desde_roster();

CREATE TRIGGER trg_guardar_historial_sueldo BEFORE UPDATE ON app_rrhh.a_1_sueldos_base FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_archivar_historial_sueldo();

CREATE TRIGGER trg_sincronizar_liquidacion_mensual AFTER INSERT OR DELETE OR UPDATE ON app_rrhh.b_1_asistencias FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_trigger_sincronizar_liquidacion();

CREATE TRIGGER trg_unica_tarifa_activa BEFORE INSERT OR UPDATE OF es_activa ON app_rrhh.b_1_tarifas_roster FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_desactivar_tarifas_anteriores();

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

CREATE TABLE "app_rrhh"."b_1_errores_remotos" (
"id_error" uuid DEFAULT gen_random_uuid() NOT NULL,
"id_usuario" uuid,
"nombre_usuario" character varying(150) DEFAULT 'Sesión no iniciada' NOT NULL,
"rol_usuario" character varying(30),
"origen" character varying(40) DEFAULT 'backend' NOT NULL,
"accion_metodo" character varying(120),
"codigo_error" character varying(60) DEFAULT 'ERROR_INTERNO' NOT NULL,
"mensaje_error" text NOT NULL,
"detalle_tecnico" text,
"equipo_info" character varying(150),
"resuelto" boolean DEFAULT false NOT NULL,
"resuelto_por" uuid,
"fecha_hora" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL);

ALTER TABLE "app_rrhh"."b_1_errores_remotos" ADD CONSTRAINT "b_1_errores_remotos_pkey" PRIMARY KEY ("id_error");
ALTER TABLE "app_rrhh"."b_1_errores_remotos" ADD CONSTRAINT "b_1_errores_remotos_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "app_rrhh"."a_1_usuarios"("id_usuario") ON DELETE SET NULL;
ALTER TABLE "app_rrhh"."b_1_errores_remotos" ADD CONSTRAINT "b_1_errores_remotos_resuelto_por_fkey" FOREIGN KEY ("resuelto_por") REFERENCES "app_rrhh"."a_1_usuarios"("id_usuario") ON DELETE SET NULL;
CREATE INDEX "idx_errores_remotos_pendientes" ON "app_rrhh"."b_1_errores_remotos" ("fecha_hora" DESC) WHERE ("resuelto" IS FALSE);
