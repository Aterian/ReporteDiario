-- [MOD-07] [FN-03.08] Migración 010: Tabla de tokens efímeros para proxy de actualizaciones remotas
-- Base de datos: PostgreSQL 14+ (Railway / Test DB)

BEGIN;

CREATE TABLE IF NOT EXISTS app_rrhh.b_1_tokens_actualizacion (
    id_token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario UUID NOT NULL REFERENCES app_rrhh.a_1_usuarios(id_usuario) ON DELETE CASCADE,
    proposito VARCHAR(20) NOT NULL CHECK (proposito IN ('check', 'download')),
    token_hash CHAR(64) NOT NULL UNIQUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    expira_en TIMESTAMPTZ NOT NULL,
    consumido_en TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_actualizacion_expira
    ON app_rrhh.b_1_tokens_actualizacion (expira_en);

CREATE INDEX IF NOT EXISTS idx_tokens_actualizacion_usuario
    ON app_rrhh.b_1_tokens_actualizacion (id_usuario, creado_en DESC);

COMMIT;
