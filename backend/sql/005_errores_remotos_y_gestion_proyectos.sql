-- [FN-07.21] Migración 005: Registro de Errores Remotos y Soporte para Gestión de Proyectos
-- Base de datos: PostgreSQL 14+ (Railway / Test DB)

BEGIN;

-- 1. Tabla de errores remotos para auditoría y visualización de administradores
CREATE TABLE IF NOT EXISTS app_rrhh.b_1_errores_remotos (
    id_error UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario UUID REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL,
    nombre_usuario VARCHAR(150) NOT NULL DEFAULT 'Sesión no iniciada',
    rol_usuario VARCHAR(30),
    origen VARCHAR(40) NOT NULL DEFAULT 'backend',
    accion_metodo VARCHAR(120),
    codigo_error VARCHAR(60) NOT NULL DEFAULT 'ERROR_INTERNO',
    mensaje_error TEXT NOT NULL,
    detalle_tecnico TEXT,
    equipo_info VARCHAR(150),
    resuelto BOOLEAN NOT NULL DEFAULT FALSE,
    resuelto_por UUID REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE SET NULL,
    fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_errores_remotos_pendientes
    ON app_rrhh.b_1_errores_remotos (fecha_hora DESC)
    WHERE resuelto IS FALSE;

-- 2. Evolucionar catálogo de proyectos de forma no destructiva
ALTER TABLE app_proyectos.b_1_proyectos_servicios
    ADD COLUMN IF NOT EXISTS area VARCHAR(20),
    ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill inicial de área a partir del 3er segmento de codificacion_serv (ej. 228-SF-I-626 -> I)
UPDATE app_proyectos.b_1_proyectos_servicios
SET area = CASE
    WHEN UPPER(split_part(codificacion_serv, '-', 3)) = 'I' THEN 'I'
    WHEN UPPER(split_part(codificacion_serv, '-', 3)) = 'A' THEN 'A'
    WHEN UPPER(split_part(codificacion_serv, '-', 3)) = 'M' THEN 'M'
    WHEN UPPER(split_part(codificacion_serv, '-', 3)) = 'S' THEN 'S'
    WHEN UPPER(split_part(codificacion_serv, '-', 3)) = 'N' THEN 'N'
    WHEN UPPER(split_part(codificacion_serv, '-', 3)) IN ('RRHH', 'R') THEN 'RRHH'
    WHEN UPPER(split_part(codificacion_serv, '-', 3)) IN ('VYM', 'V') THEN 'VyM'
    ELSE area
END
WHERE area IS NULL AND codificacion_serv IS NOT NULL;

COMMIT;

