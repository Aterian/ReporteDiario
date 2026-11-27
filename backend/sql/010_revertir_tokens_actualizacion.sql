-- [MOD-07] [FN-03.08] Reversión migración 010: Eliminar tabla de tokens efímeros de actualización

BEGIN;

DROP TABLE IF EXISTS app_rrhh.b_1_tokens_actualizacion;

COMMIT;
