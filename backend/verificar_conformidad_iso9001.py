"""
[MOD-00 / MOD-07] Script de Verificación y Evidencia de Conformidad ISO 9001:2026
Calcula la eficacia del cambio tomando TODOS LOS DÍAS CORRIDOS CALENDARIO desde
el 01/10/2026 hasta hoy (incluyendo días trabajados y francos obligatorios).
"""

import os
import json
from datetime import date, datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Cargar variables de entorno (DATABASE_URL) desde backend/.env
load_dotenv()

# ==============================================================================
# PARÁMETROS CONFIGURABLES (Ajustables para esta o futuras apps migradas)
# ==============================================================================
FECHA_INICIO_MEDICION = date(2026, 10, 1)  # 01/10/2026: Inicio de medición
ARCHIVO_REPORTE_SALIDA = "reporte_evidencia_iso9001.json"


def contar_dias_corridos(fecha_inicio: date, fecha_fin: date) -> int:
    """
    Calcula el total de días calendario corridos (lunes a domingo) entre
    fecha_inicio y fecha_fin (ambos inclusive), dado que los colaboradores
    también deben registrar sus días de franco en la aplicación.
    """
    if fecha_fin < fecha_inicio:
        return 0
    return max(1, (fecha_fin - fecha_inicio).days + 1)


def ejecutar_auditoria_iso9001():
    """
    Consulta en PostgreSQL las métricas de uso sobre días corridos desde el
    01/10/2026, audita roles RBAC, triggers de integridad y errores remotos,
    y exporta un archivo JSON como evidencia documental ISO 9001:2026.
    """
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ ERROR: No se encontró la variable DATABASE_URL en el archivo .env")
        return

    fecha_hoy = date.today()
    dias_corridos_periodo = contar_dias_corridos(FECHA_INICIO_MEDICION, fecha_hoy)

    print("=" * 78)
    print("📋 AUDITORÍA TÉCNICA DE CONFORMIDAD ISO 9001:2026 - CHECK DIARIO (INGEAP)")
    print(f"📅 Período evaluado: {FECHA_INICIO_MEDICION.strftime('%d/%m/%Y')} al {fecha_hoy.strftime('%d/%m/%Y')} "
          f"({dias_corridos_periodo} días corridos calendario)")
    print("=" * 78)

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:

            # ------------------------------------------------------------------
            # 1. EFICACIA DEL CAMBIO (ISO 9001:2026 - 6.3 f, g)
            # Evalúa todos los días corridos (activos + francos + licencias)
            # ------------------------------------------------------------------
            cursor.execute("""
                SELECT 
                    COUNT(DISTINCT u.id_usuario) AS total_usuarios_activos,
                    COUNT(DISTINCT a.id_usuario) AS usuarios_con_registros,
                    COUNT(a.id_asistencia) AS total_registros_cargados,
                    COUNT(DISTINCT (a.id_usuario, a.fecha)) AS total_dias_unicos_cubiertos,
                    COUNT(a.id_asistencia) FILTER (WHERE a.activo_franco = 'franco') AS total_francos_cargados
                FROM app_rrhh.a_1_usuarios u
                LEFT JOIN app_rrhh.b_1_asistencias a 
                    ON u.id_usuario = a.id_usuario 
                    AND a.fecha >= %s
                    AND a.fecha <= %s
                    AND a.eliminado_en IS NULL
                WHERE u.activo = TRUE;
            """, (FECHA_INICIO_MEDICION, fecha_hoy))
            metricas_uso = cursor.fetchone()

            total_activos = metricas_uso["total_usuarios_activos"] or 0
            usuarios_usando = metricas_uso["usuarios_con_registros"] or 0
            dias_unicos_cubiertos = metricas_uso["total_dias_unicos_cubiertos"] or 0
            francos_cargados = metricas_uso["total_francos_cargados"] or 0

            # Porcentaje de usuarios activos que están utilizando la aplicación
            porcentaje_adopcion_usuarios = round(
                (usuarios_usando / total_activos * 100.0), 2
            ) if total_activos > 0 else 0.0

            # Total de días calendario que deberían estar cubiertos entre todos los usuarios activos
            dias_totales_esperados_empresa = total_activos * dias_corridos_periodo
            porcentaje_uso_dias_corridos = round(
                min(100.0, (dias_unicos_cubiertos / dias_totales_esperados_empresa * 100.0)), 2
            ) if dias_totales_esperados_empresa > 0 else 0.0

            # Desglose de cobertura de días corridos por cada empleado activo
            cursor.execute("""
                SELECT 
                    TRIM(CONCAT(u.nombre, ' ', u.apellido)) AS empleado,
                    u.area,
                    COUNT(DISTINCT a.fecha) AS dias_cargados
                FROM app_rrhh.a_1_usuarios u
                LEFT JOIN app_rrhh.b_1_asistencias a 
                    ON u.id_usuario = a.id_usuario 
                    AND a.fecha >= %s
                    AND a.fecha <= %s
                    AND a.eliminado_en IS NULL
                WHERE u.activo = TRUE
                GROUP BY u.id_usuario, u.nombre, u.apellido, u.area
                ORDER BY dias_cargados DESC, empleado ASC;
            """, (FECHA_INICIO_MEDICION, fecha_hoy))
            detalle_por_empleado = []
            for emp in cursor.fetchall():
                dias_emp = emp["dias_cargados"] or 0
                pct_emp = round(min(100.0, (dias_emp / dias_corridos_periodo * 100.0)), 1)
                detalle_por_empleado.append({
                    "empleado": emp["empleado"],
                    "area": emp["area"],
                    "dias_cargados": dias_emp,
                    "dias_corridos_esperados": dias_corridos_periodo,
                    "porcentaje_cumplimiento": f"{pct_emp}%"
                })

            # ------------------------------------------------------------------
            # 2. ASIGNACIÓN DE RESPONSABILIDADES (ISO 9001:2026 - 5.3 y 6.3 d)
            # ------------------------------------------------------------------
            cursor.execute("""
                SELECT 
                    COALESCE(rol_app, 'SIN_ROL') AS rol,
                    COUNT(*) AS cantidad_usuarios
                FROM app_rrhh.a_1_usuarios
                WHERE activo = TRUE
                GROUP BY COALESCE(rol_app, 'SIN_ROL')
                ORDER BY cantidad_usuarios DESC;
            """)
            distribucion_roles = cursor.fetchall()

            # ------------------------------------------------------------------
            # 3. INTEGRIDAD DEL SISTEMA (ISO 9001:2026 - 5.3 f, 6.3 b y 7.5.3)
            # ------------------------------------------------------------------
            cursor.execute("""
                SELECT tgname AS nombre_trigger
                FROM pg_trigger t
                JOIN pg_class c ON t.tgrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = 'app_rrhh'
                  AND NOT t.tgisinternal
                ORDER BY tgname;
            """)
            triggers_activos = [fila["nombre_trigger"] for fila in cursor.fetchall()]

            cursor.execute("""
                SELECT 
                    COUNT(*) AS total_modificaciones_auditadas,
                    COUNT(*) FILTER (WHERE revisado = TRUE) AS modificaciones_revisadas
                FROM app_rrhh.b_1_modificaciones_realizadas;
            """)
            auditoria_cambios = cursor.fetchone()

            # ------------------------------------------------------------------
            # 4. GESTIÓN DE RIESGOS Y ERRORES REMOTOS (ISO 9001:2026 - 6.1.2)
            # ------------------------------------------------------------------
            cursor.execute("""
                SELECT 
                    COUNT(*) AS total_errores,
                    COUNT(*) FILTER (WHERE resuelto = TRUE) AS errores_resueltos,
                    COUNT(*) FILTER (WHERE resuelto = FALSE) AS errores_pendientes
                FROM app_rrhh.b_1_errores_remotos;
            """)
            estado_errores = cursor.fetchone()

            # Armar el reporte JSON de evidencia
            reporte = {
                "norma_referencia": "ISO 9001:2026 (Sexta edicion)",
                "fecha_generacion_evidencia": datetime.now().isoformat(),
                "1_eficacia_del_cambio_dias_corridos_desde_2026_10_01": {
                    "fecha_inicio_medicion": FECHA_INICIO_MEDICION.isoformat(),
                    "fecha_corte_medicion": fecha_hoy.isoformat(),
                    "dias_corridos_calendario": dias_corridos_periodo,
                    "usuarios_activos_totales": total_activos,
                    "usuarios_con_registros_en_periodo": usuarios_usando,
                    "porcentaje_adopcion_plantilla": f"{porcentaje_adopcion_usuarios}%",
                    "dias_calendario_esperados_empresa": dias_totales_esperados_empresa,
                    "dias_unicos_cubiertos_empresa": dias_unicos_cubiertos,
                    "registros_de_franco_cargados": francos_cargados,
                    "total_registros_asistencia": metricas_uso["total_registros_cargados"],
                    "porcentaje_uso_sobre_dias_corridos": f"{porcentaje_uso_dias_corridos}%",
                    "detalle_cumplimiento_por_empleado": detalle_por_empleado
                },
                "2_asignacion_responsabilidades_rbac": [
                    {"rol_app": r["rol"], "usuarios_activos": r["cantidad_usuarios"]}
                    for r in distribucion_roles
                ],
                "3_integridad_sistema_calidad": {
                    "cantidad_triggers_activos_en_bd": len(triggers_activos),
                    "lista_triggers_verificados": triggers_activos,
                    "auditoria_jsonb_modificaciones_totales": auditoria_cambios["total_modificaciones_auditadas"],
                    "auditoria_jsonb_modificaciones_revisadas_rrhh": auditoria_cambios["modificaciones_revisadas"]
                },
                "4_monitoreo_riesgos_errores_remotos": {
                    "incidentes_registrados": estado_errores["total_errores"],
                    "incidentes_resueltos": estado_errores["errores_resueltos"],
                    "incidentes_pendientes": estado_errores["errores_pendientes"]
                }
            }

            # Imprimir resumen en consola
            print(f"\n✅ 1. EFICACIA DEL CAMBIO (Días corridos desde {FECHA_INICIO_MEDICION.strftime('%d/%m/%Y')}):")
            print(f"   • Empleados utilizando la app:  {usuarios_usando}/{total_activos} ({porcentaje_adopcion_usuarios}%)")
            print(f"   • Cobertura de días corridos:   {dias_unicos_cubiertos}/{dias_totales_esperados_empresa} días "
                  f"({porcentaje_uso_dias_corridos}% del total calendario incluyendo francos)")
            print(f"   • Francos registrados en el período: {francos_cargados} registros")

            print("\n✅ 2. ASIGNACIÓN DE RESPONSABILIDADES (Roles RBAC en Código):")
            for r in distribucion_roles:
                print(f"   • Rol '{r['rol']}': {r['cantidad_usuarios']} usuario(s)")

            print("\n✅ 3. INTEGRIDAD DEL SISTEMA DE CALIDAD:")
            print(f"   • Triggers activos en PostgreSQL: {len(triggers_activos)}")
            print(f"   • Cambios auditados en JSONB:     {auditoria_cambios['total_modificaciones_auditadas']} "
                  f"(Revisados: {auditoria_cambios['modificaciones_revisadas']})")

            print("\n✅ 4. CONTROL DE RIESGOS TÉCNICOS (Errores Remotos):")
            print(f"   • Total: {estado_errores['total_errores']} | "
                  f"Resueltos: {estado_errores['errores_resueltos']} | "
                  f"Pendientes: {estado_errores['errores_pendientes']}")

            with open(ARCHIVO_REPORTE_SALIDA, "w", encoding="utf-8") as f:
                json.dump(reporte, f, indent=2, ensure_ascii=False)

            print(f"\n📄 Archivo de evidencia guardado en: backend/{ARCHIVO_REPORTE_SALIDA}")

    except Exception as e:
        print(f"\n❌ Error durante la verificación: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    ejecutar_auditoria_iso9001()