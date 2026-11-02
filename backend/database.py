# [MOD-07] Fachada de compatibilidad sin SQLite
from postgres_repository import (
    inicializar_bd, obtener_sesion_activa, guardar_sesion_activa, borrar_sesion,
    obtener_usuarios_cache, obtener_proyectos_cache, obtener_tarifas_roster_cache,
    obtener_rosters, eliminar_registro_roster, eliminar_registro_asistencia,
    consultar_asistencias, obtener_liquidacion, usuario_registro_hoy,
    obtener_estado_diario_empleados, obtener_actividad_dia_anterior,
)
