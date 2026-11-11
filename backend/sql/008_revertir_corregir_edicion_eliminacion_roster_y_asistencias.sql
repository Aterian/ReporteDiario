-- [MOD-02] [FN-02.08] Reversión: Corrección de triggers de edición/eliminación de Roster y auditoría de asistencias

DROP TRIGGER IF EXISTS trg_generar_asistencias_roster ON app_rrhh.b_1_roster;
CREATE TRIGGER trg_generar_asistencias_roster
    AFTER INSERT OR UPDATE OF id_usuario, id_proyecto, fecha_inicio, fecha_fin, tipo_turno
    ON app_rrhh.b_1_roster
    FOR EACH ROW EXECUTE FUNCTION app_rrhh.fn_sincronizar_asistencias_desde_roster();

