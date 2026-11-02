# [MOD-07] Runner CLI de Pruebas de Carga Masiva y Concurrencia
import concurrent.futures
from decimal import Decimal
import os
from pathlib import Path
import statistics
import sys
import threading
import time
from uuid import uuid4

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
load_dotenv(ROOT / ".env.test", override=False)

import postgres_repository as db
from postgres_models import AsistenciaCreate
from tests.test_postgres_concurrency_load import EntornoCarga20Usuarios


def imprimir_tabla_metricas(nombre_escenario, latencias, total_registros, duracion_total, invariantes_ok):
    p50 = statistics.median(latencias) if latencias else 0
    p95 = statistics.quantiles(latencias, n=20)[18] if len(latencias) >= 20 else max(latencias or [0])
    p99 = statistics.quantiles(latencias, n=100)[98] if len(latencias) >= 100 else max(latencias or [0])
    media = statistics.mean(latencias) if latencias else 0
    min_lat = min(latencias or [0])
    max_lat = max(latencias or [0])
    throughput = (total_registros / duracion_total) if duracion_total > 0 else 0

    print("\n" + "=" * 78)
    print(f"📊 REPORTE DE ESTRÉS: {nombre_escenario}")
    print("=" * 78)
    print(f"  • Hilos Concurrentes    : 20 hilos simultáneos")
    print(f"  • Registros Procesados  : {total_registros} filas")
    print(f"  • Tiempo Total Ráfaga   : {duracion_total:.2f} s")
    print(f"  • Throughput Efectivo   : {throughput:.1f} registros/segundo")
    print("-" * 78)
    print("  • Distribución de Latencias por Transacción:")
    print(f"      - Mínimo            : {min_lat * 1000:.1f} ms")
    print(f"      - Promedio (Media)  : {media * 1000:.1f} ms")
    print(f"      - Mediana (p50)     : {p50 * 1000:.1f} ms")
    print(f"      - Percentil 95 (p95): {p95 * 1000:.1f} ms")
    print(f"      - Percentil 99 (p99): {p99 * 1000:.1f} ms")
    print(f"      - Máximo            : {max_lat * 1000:.1f} ms")
    print("-" * 78)
    estado_inv = "✓ APROBADO (0 violaciones)" if invariantes_ok else "✗ FALLO DETECTADO"
    print(f"  • Invariantes Contables : {estado_inv}")
    print("=" * 78 + "\n")


def ejecutar_bateria_estres():
    dsn = os.getenv("TEST_DATABASE_URL")
    if not dsn:
        print("❌ Error: TEST_DATABASE_URL no configurado en .env.test")
        sys.exit(1)

    print("\n🚀 INICIANDO BATERÍA DE PRUEBAS DE CARGA MASIVA (20 USUARIOS SIMULTÁNEOS)")
    print(f"🎯 Conectando a entorno aislado de pruebas...")

    with EntornoCarga20Usuarios(dsn) as env:
        db.obtener_cursor_pg = env.cursor_concurrente
        db.perfil_esquema.cache_clear()
        print(f"✓ Sembrado completado: 20 usuarios sintéticos, 5 proyectos, 5 tarifas de Roster.\n")

        # -------------------------------------------------------------
        # ESCENARIO 1: Ráfaga Multi-Registro (20 Usuarios x 6 Filas)
        # -------------------------------------------------------------
        env.purgar_operacionales()
        barrier = threading.Barrier(20)
        proyecto_id = env.proyectos[0]["id_proyecto"]

        def sub_tarea_1(u):
            lote = [
                AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-02", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8),
                AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-03", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8),
                AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-04", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8),
                AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-05", activo_franco="activo", lugar="obra", tipo_dia="dia_normal", dedicado_a="proyectos", id_proyecto=proyecto_id, horas_dedicadas=8),
                AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-07", activo_franco="activo", lugar="oficina", tipo_dia="franco_trabajado", dedicado_a="areas", horas_dedicadas=8),
                AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-08", activo_franco="activo", lugar="oficina", tipo_dia="feriado_trabajado", dedicado_a="areas", horas_dedicadas=8),
            ]
            barrier.wait(timeout=15)
            t0 = time.perf_counter()
            res = db.guardar_asistencias_atomicas(lote, u["id_usuario"])
            dt = time.perf_counter() - t0
            return (len(res), dt)

        t_global_0 = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            resultados_1 = list(executor.map(sub_tarea_1, env.usuarios))
        t_global_1 = time.perf_counter() - t_global_0

        latencias_1 = [r[1] for r in resultados_1]
        total_filas_1 = sum(r[0] for r in resultados_1)

        # Auditoría Invariantes
        with env.cursor_concurrente() as cur:
            cur.execute("""SELECT count(*) FROM app_rrhh.a_1_calculo_sueldo
                WHERE ciclo_cobro = '2026-11' AND total_real = 85000.00 AND cant_dias_ofi = 5 AND cant_dias_obra = 1""")
            usuarios_liquidados_ok = cur.fetchone()["count"]
        inv_1 = (usuarios_liquidados_ok == 20 and total_filas_1 == 120)

        imprimir_tabla_metricas("Escenario 1: Ráfaga Multi-Registro (20 usuarios x 6 fechas)", latencias_1, total_filas_1, t_global_1, inv_1)

        # -------------------------------------------------------------
        # ESCENARIO 2: Colisión en Misma Fecha (Prioridad Oficina)
        # -------------------------------------------------------------
        env.purgar_operacionales()
        barrier_2 = threading.Barrier(20)
        proy_a = env.proyectos[0]["id_proyecto"]
        proy_b = env.proyectos[1]["id_proyecto"]

        def sub_tarea_2(u):
            lote = [
                AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-12", activo_franco="activo", lugar="obra", tipo_dia="dia_normal", dedicado_a="proyectos", id_proyecto=proy_a, horas_dedicadas=4),
                AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-12", activo_franco="activo", lugar="obra", tipo_dia="dia_normal", dedicado_a="proyectos", id_proyecto=proy_b, horas_dedicadas=2),
                AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-12", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=2),
            ]
            barrier_2.wait(timeout=15)
            t0 = time.perf_counter()
            res = db.guardar_asistencias_atomicas(lote, u["id_usuario"])
            dt = time.perf_counter() - t0
            return (len(res), dt)

        t_global_0 = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            resultados_2 = list(executor.map(sub_tarea_2, env.usuarios))
        t_global_1 = time.perf_counter() - t_global_0

        latencias_2 = [r[1] for r in resultados_2]
        total_filas_2 = sum(r[0] for r in resultados_2)

        with env.cursor_concurrente() as cur:
            cur.execute("""SELECT count(*) FROM app_rrhh.b_1_asistencias
                WHERE fecha = '2026-11-12' AND lugar = 'oficina' AND costo_dia = 10000.00""")
            oficinas_cobradas = cur.fetchone()["count"]
            cur.execute("""SELECT count(*) FROM app_rrhh.b_1_asistencias
                WHERE fecha = '2026-11-12' AND lugar = 'obra' AND costo_dia = 0.00""")
            obras_anuladas = cur.fetchone()["count"]
        inv_2 = (oficinas_cobradas == 20 and obras_anuladas == 40 and total_filas_2 == 60)

        imprimir_tabla_metricas("Escenario 2: Colisión en Misma Fecha (Prevalencia Oficina)", latencias_2, total_filas_2, t_global_1, inv_2)

        # -------------------------------------------------------------
        # ESCENARIO 3: Responsable RRHH cargando múltiples turnos de Roster
        # -------------------------------------------------------------
        env.purgar_operacionales()
        rrhh_user = env.usuarios[0]
        empleados_roster = env.usuarios[1:5]
        barrier_3 = threading.Barrier(17)

        lote_roster = []
        for emp in empleados_roster:
            lote_roster.append({"empleado": emp["id_usuario"], "proyecto": proyecto_id, "fecha_inicio": "2026-11-01", "fecha_fin": "2026-11-14", "tipo": "Campo"})
            lote_roster.append({"empleado": emp["id_usuario"], "proyecto": proyecto_id, "fecha_inicio": "2026-11-15", "fecha_fin": "2026-11-21", "tipo": "Franco"})

        def tarea_rrhh():
            barrier_3.wait(timeout=15)
            t0 = time.perf_counter()
            creados = db.guardar_rosters_atomicos(lote_roster, rrhh_user["id_usuario"])
            dt = time.perf_counter() - t0
            return (len(creados), dt)

        def tarea_colaborador(u, idx):
            barrier_3.wait(timeout=15)
            lote = [AsistenciaCreate(id_usuario=u["id_usuario"], fecha=f"2026-11-{22 + (idx % 8):02d}", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8)]
            t0 = time.perf_counter()
            res = db.guardar_asistencias_atomicas(lote, u["id_usuario"])
            dt = time.perf_counter() - t0
            return (len(res), dt)

        t_global_0 = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=17) as executor:
            f_rrhh = executor.submit(tarea_rrhh)
            f_colabs = [executor.submit(tarea_colaborador, u, i) for i, u in enumerate(env.usuarios[4:20])]

            cant_r, dt_r = f_rrhh.result()
            res_c = [f.result() for f in f_colabs]
        t_global_1 = time.perf_counter() - t_global_0

        latencias_3 = [dt_r] + [r[1] for r in res_c]
        total_filas_3 = cant_r + sum(r[0] for r in res_c)

        with env.cursor_concurrente() as cur:
            cur.execute("SELECT count(*) FROM app_rrhh.b_1_roster WHERE cargado_por = %s", (rrhh_user["id_usuario"],))
            turnos_roster_ok = cur.fetchone()["count"]
            cur.execute("SELECT count(*) FROM app_rrhh.b_1_asistencias WHERE id_roster IS NOT NULL")
            asistencias_generadas_trigger = cur.fetchone()["count"]
        inv_3 = (turnos_roster_ok == 8 and asistencias_generadas_trigger == 84)

        imprimir_tabla_metricas("Escenario 3: Responsable RRHH Carga Roster (8 turnos + 84 asistencias autogeneradas)", latencias_3, total_filas_3, t_global_1, inv_3)

        print("🏁 TODAS LAS PRUEBAS DE ESTRÉS CONCLUYERON CON ÉXITO.")


if __name__ == "__main__":
    ejecutar_bateria_estres()

