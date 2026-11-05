# [MOD-07] Pruebas de Carga Masiva y Concurrencia (20 Usuarios Simultáneos)
import concurrent.futures
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
import os
from pathlib import Path
import sys
import threading
import time
from uuid import uuid4

from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
load_dotenv(ROOT / ".env.test", override=False)

import postgres_repository as db
from postgres_models import AsistenciaCreate, AsistenciaUpdate


# [FN-07.16] Entorno de Carga Concurrente Aislado para 20 Usuarios
class EntornoCarga20Usuarios:
    def __init__(self, dsn):
        self.dsn = dsn
        self.usuarios = []
        self.proyectos = []
        self.tarifas = []
        self.pool = None
        self._slots = None

    def __enter__(self):
        conn_verif = psycopg2.connect(self.dsn, connect_timeout=8)
        dbname = conn_verif.info.dbname
        conn_verif.close()
        if not dbname.startswith("codex_check_diario_test_"):
            raise RuntimeError(f"Base de pruebas insegura: {dbname}. Debe iniciar con 'codex_check_diario_test_'.")

        self.pool = ThreadedConnectionPool(
            5, 30, dsn=self.dsn, connect_timeout=15,
            application_name="CheckDiario_StressTest",
            options="-c statement_timeout=30000 -c lock_timeout=15000",
        )
        self._slots = threading.BoundedSemaphore(30)

        # Sembrado transaccional de 20 usuarios y 5 proyectos
        admin_conn = psycopg2.connect(self.dsn)
        admin_conn.autocommit = False
        try:
            with admin_conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 1. 20 Usuarios sintéticos
                for i in range(1, 21):
                    uid = str(uuid4())
                    dni = f"DNI_LOAD_{i:04d}_{uuid4().hex[:6]}"
                    nombre = f"TestLoadUser_{i:02d}"
                    apellido = "Concurrente"
                    correo = f"user_load_{i:02d}_{uuid4().hex[:6]}@ingeap.test"
                    area = ["I", "M", "A", "RRHH"][i % 4]
                    rol = "admin" if i == 1 else "user_1"

                    cur.execute("""INSERT INTO app_rrhh.a_1_usuarios (id_usuario, dni, nombre, apellido, correo, area, rol_app)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)""", (uid, dni, nombre, apellido, correo, area, rol))

                    # Sueldos deterministas: dia_oficina = 10000, dia_obra = 20000
                    cur.execute("""INSERT INTO app_rrhh.a_1_sueldos_base (id_usuario, sueldo_oficina, sueldo_obra, lugar_habitual)
                        VALUES (%s, %s, %s, 'oficina')""", (uid, Decimal("300000.00"), Decimal("600000.00")))

                    self.usuarios.append({
                        "id_usuario": uid,
                        "dni": dni,
                        "nombre": nombre,
                        "apellido": apellido,
                        "nombre_completo": f"{nombre} {apellido}",
                        "correo": correo,
                        "area": area,
                        "rol_app": rol,
                        "dia_oficina": Decimal("10000.00"),
                        "dia_obra": Decimal("20000.00"),
                    })

                # 2. 5 Proyectos sintéticos
                for j in range(1, 6):
                    pid = str(uuid4())
                    cod = f"PRY-STRESS-{j:02d}-{uuid4().hex[:6]}"
                    cur.execute("INSERT INTO app_proyectos.b_1_proyectos_servicios (id_proyecto, codificacion_serv) VALUES (%s, %s)", (pid, cod))

                    cur.execute("""INSERT INTO app_rrhh.b_1_tarifas_roster
                        (id_proyecto, dia_normal, dia_domingo, subida, bajada, adicional_turno, es_activa)
                        VALUES (%s, %s, %s, %s, %s, %s, TRUE) RETURNING id_tarifa""",
                        (pid, Decimal("50000.00"), Decimal("75000.00"), Decimal("25000.00"), Decimal("25000.00"), Decimal("10000.00")))
                    tid = str(cur.fetchone()["id_tarifa"])

                    self.proyectos.append({"id_proyecto": pid, "denominacion": cod})
                    self.tarifas.append({"id_tarifa": tid, "id_proyecto": pid})

            admin_conn.commit()
        except Exception:
            admin_conn.rollback()
            raise
        finally:
            admin_conn.close()

        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.pool:
            try:
                self.pool.closeall()
            except Exception:
                pass

        # Limpieza de registros creados en el test
        clean_conn = psycopg2.connect(self.dsn)
        clean_conn.autocommit = True
        try:
            with clean_conn.cursor() as cur:
                uids = [u["id_usuario"] for u in self.usuarios]
                pids = [p["id_proyecto"] for p in self.proyectos]
                if uids:
                    cur.execute("DELETE FROM app_rrhh.b_1_asistencias WHERE id_usuario = ANY(%s::uuid[])", (uids,))
                    cur.execute("DELETE FROM app_rrhh.b_1_roster WHERE id_usuario = ANY(%s::uuid[])", (uids,))
                    cur.execute("DELETE FROM app_rrhh.a_1_calculo_sueldo WHERE id_usuario = ANY(%s::uuid[])", (uids,))
                    cur.execute("DELETE FROM app_rrhh.a_1_sueldos_base WHERE id_usuario = ANY(%s::uuid[])", (uids,))
                    cur.execute("DELETE FROM app_rrhh.a_1_usuarios WHERE id_usuario = ANY(%s::uuid[])", (uids,))
                if pids:
                    cur.execute("DELETE FROM app_rrhh.b_1_tarifas_roster WHERE id_proyecto = ANY(%s::uuid[])", (pids,))
                    cur.execute("DELETE FROM app_proyectos.b_1_proyectos_servicios WHERE id_proyecto = ANY(%s::uuid[])", (pids,))
        finally:
            clean_conn.close()

    def purgar_operacionales(self):
        clean_conn = psycopg2.connect(self.dsn)
        clean_conn.autocommit = True
        try:
            with clean_conn.cursor() as cur:
                uids = [u["id_usuario"] for u in self.usuarios]
                if uids:
                    cur.execute("DELETE FROM app_rrhh.b_1_asistencias WHERE id_usuario = ANY(%s::uuid[])", (uids,))
                    cur.execute("DELETE FROM app_rrhh.b_1_roster WHERE id_usuario = ANY(%s::uuid[])", (uids,))
                    cur.execute("DELETE FROM app_rrhh.a_1_calculo_sueldo WHERE id_usuario = ANY(%s::uuid[])", (uids,))
        finally:
            clean_conn.close()

    @contextmanager
    def cursor_concurrente(self, commit=False):
        if not self._slots.acquire(timeout=25):
            raise RuntimeError("Timeout adquiriendo slot de conexión en EntornoCarga20Usuarios")
        conn = None
        descartar = False
        try:
            conn = self.pool.getconn()
            conn.set_session(readonly=not commit, autocommit=False)
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                yield cur
            if commit:
                conn.commit()
            else:
                conn.rollback()
        except Exception:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    descartar = True
            raise
        finally:
            try:
                if conn:
                    self.pool.putconn(conn, close=descartar or bool(conn.closed))
            finally:
                self._slots.release()


@pytest.fixture(scope="module")
def entorno_20_usuarios():
    dsn = os.getenv("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("TEST_DATABASE_URL no configurado; ejecute bootstrap_test_db.py")
    try:
        with EntornoCarga20Usuarios(dsn) as env:
            yield env
    except psycopg2.OperationalError as exc:
        pytest.skip(f"Base de pruebas no accesible ({exc}).")


@pytest.fixture(autouse=True)
def preparar_repositorio_concurrente(entorno_20_usuarios, monkeypatch):
    monkeypatch.setattr(db, "obtener_cursor_pg", entorno_20_usuarios.cursor_concurrente)
    db.perfil_esquema.cache_clear()
    entorno_20_usuarios.purgar_operacionales()
    yield
    entorno_20_usuarios.purgar_operacionales()


# [FN-07.16] 1. Verificar sembrado de 20 usuarios y catálogos de soporte
def test_sembrado_20_usuarios_y_catalogos(entorno_20_usuarios):
    assert len(entorno_20_usuarios.usuarios) == 20
    assert len(entorno_20_usuarios.proyectos) == 5
    assert len(entorno_20_usuarios.tarifas) == 5

    def consultar_usuario(u):
        with entorno_20_usuarios.cursor_concurrente() as cur:
            cur.execute("""SELECT u.id_usuario, u.nombre, s.sueldo_oficina, s.dia_oficina, s.dia_obra
                FROM app_rrhh.a_1_usuarios u
                JOIN app_rrhh.a_1_sueldos_base s ON s.id_usuario = u.id_usuario
                WHERE u.id_usuario = %s""", (u["id_usuario"],))
            return cur.fetchone()

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        resultados = list(executor.map(consultar_usuario, entorno_20_usuarios.usuarios))

    assert len(resultados) == 20
    for fila in resultados:
        assert fila is not None
        assert Decimal(fila["sueldo_oficina"]) == Decimal("300000.00")
        assert Decimal(fila["dia_oficina"]) == Decimal("10000.00")
        assert Decimal(fila["dia_obra"]) == Decimal("20000.00")


# [FN-07.16] 2. Escenario 1: Ráfaga Multi-Registro Simultánea (20 Usuarios x 6 Registros = 120 Filas)
def test_carga_masiva_20_usuarios_simultaneos(entorno_20_usuarios):
    barrier = threading.Barrier(20)
    ciclo = "2026-11"
    proyecto = entorno_20_usuarios.proyectos[0]["id_proyecto"]

    def tarea_usuario(u):
        # 6 registros por usuario en fechas distintas:
        # 3 oficina normal ($10.000 c/u) = $30.000
        # 1 obra normal ($20.000 c/u) = $20.000
        # 1 oficina franco trabajado ($10.000 * 1.5) = $15.000
        # 1 oficina feriado trabajado ($10.000 * 2.0) = $20.000
        # Total esperado del mes: $85.000,00
        lote = [
            AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-02", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8),
            AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-03", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8),
            AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-04", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8),
            AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-05", activo_franco="activo", lugar="obra", tipo_dia="dia_normal", dedicado_a="proyectos", id_proyecto=proyecto, horas_dedicadas=8),
            AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-07", activo_franco="activo", lugar="oficina", tipo_dia="franco_trabajado", dedicado_a="areas", horas_dedicadas=8),
            AsistenciaCreate(id_usuario=u["id_usuario"], fecha="2026-11-08", activo_franco="activo", lugar="oficina", tipo_dia="feriado_trabajado", dedicado_a="areas", horas_dedicadas=8),
        ]
        barrier.wait(timeout=15)
        t0 = time.perf_counter()
        res = db.guardar_asistencias_atomicas(lote, u["id_usuario"])
        latencia = time.perf_counter() - t0
        return {"id_usuario": u["id_usuario"], "guardados": len(res), "latencia": latencia}

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futuros = [executor.submit(tarea_usuario, u) for u in entorno_20_usuarios.usuarios]
        resultados = [f.result() for f in futuros]

    assert len(resultados) == 20
    for r in resultados:
        assert r["guardados"] == 6

    # Auditoría de Invariantes SQL en la base de datos
    with entorno_20_usuarios.cursor_concurrente() as cur:
        # Total de asistencias creadas: 120
        cur.execute("SELECT count(*) FROM app_rrhh.b_1_asistencias WHERE id_usuario = ANY(%s::uuid[])",
                    ([u["id_usuario"] for u in entorno_20_usuarios.usuarios],))
        assert cur.fetchone()["count"] == 120

        # Para cada uno de los 20 usuarios, verificar cálculo de sueldo generado por triggers
        for u in entorno_20_usuarios.usuarios:
            liq = db.obtener_liquidacion(u["id_usuario"], ciclo)
            assert liq is not None
            assert liq["cant_dias_ofi"] == 5
            assert liq["cant_dias_obra"] == 1
            assert Decimal(liq["subtotal_ofi"]) == Decimal("50000.00")
            assert Decimal(liq["subtotal_obra"]) == Decimal("20000.00")
            assert Decimal(liq["total_real"]) == Decimal("85000.00")
            assert Decimal(liq["sueldo_total"]) == Decimal("85000.00")


# [FN-07.16] 3. Escenario 2: Colisión en Misma Fecha y Prevalencia de Oficina sobre Obra
def test_concurrencia_colision_misma_fecha_prioridad_oficina(entorno_20_usuarios):
    barrier = threading.Barrier(20)
    fecha_colision = "2026-11-12"
    proy_a = entorno_20_usuarios.proyectos[0]["id_proyecto"]
    proy_b = entorno_20_usuarios.proyectos[1]["id_proyecto"]

    def tarea_colision(u):
        # 3 registros en la misma fecha: 2 de obra y 1 de oficina
        lote = [
            AsistenciaCreate(id_usuario=u["id_usuario"], fecha=fecha_colision, activo_franco="activo", lugar="obra", tipo_dia="dia_normal", dedicado_a="proyectos", id_proyecto=proy_a, horas_dedicadas=4),
            AsistenciaCreate(id_usuario=u["id_usuario"], fecha=fecha_colision, activo_franco="activo", lugar="obra", tipo_dia="dia_normal", dedicado_a="proyectos", id_proyecto=proy_b, horas_dedicadas=2),
            AsistenciaCreate(id_usuario=u["id_usuario"], fecha=fecha_colision, activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=2),
        ]
        barrier.wait(timeout=15)
        res = db.guardar_asistencias_atomicas(lote, u["id_usuario"])
        return len(res)

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futuros = [executor.submit(tarea_colision, u) for u in entorno_20_usuarios.usuarios]
        resultados = [f.result() for f in futuros]

    assert all(r == 3 for r in resultados)

    with entorno_20_usuarios.cursor_concurrente() as cur:
        # Invariante 1: Ningún usuario tiene más de 1 registro con costo_dia > 0 en esa fecha
        cur.execute("""SELECT id_usuario, count(*) as pagados
            FROM app_rrhh.b_1_asistencias
            WHERE fecha = %s AND id_usuario = ANY(%s::uuid[]) AND costo_dia > 0
            GROUP BY id_usuario HAVING count(*) > 1""",
            (fecha_colision, [u["id_usuario"] for u in entorno_20_usuarios.usuarios]))
        assert cur.fetchall() == []

        # Invariante 2: El registro de oficina cobra dia_oficina ($10.000) y los de obra quedan en $0.00
        cur.execute("""SELECT id_usuario, lugar, costo_dia
            FROM app_rrhh.b_1_asistencias
            WHERE fecha = %s AND id_usuario = ANY(%s::uuid[])
            ORDER BY id_usuario, lugar""",
            (fecha_colision, [u["id_usuario"] for u in entorno_20_usuarios.usuarios]))
        filas = cur.fetchall()

    por_usuario = {}
    for f in filas:
        por_usuario.setdefault(f["id_usuario"], []).append(f)

    for uid, registros in por_usuario.items():
        ofis = [r for r in registros if r["lugar"] == "oficina"]
        obras = [r for r in registros if r["lugar"] == "obra"]
        assert len(ofis) == 1
        assert len(obras) == 2
        assert Decimal(ofis[0]["costo_dia"]) == Decimal("10000.00")
        assert all(Decimal(o["costo_dia"]) == Decimal("0.00") for o in obras)


# [FN-07.16] 4. Escenario 3: Contención Intra-Usuario y Auditoría Concurrente
def test_contencion_intra_usuario_sin_deadlocks(entorno_20_usuarios):
    # 20 hilos operan concurrentemente sobre 4 empleados (5 hilos por empleado)
    barrier = threading.Barrier(20)
    grupo = entorno_20_usuarios.usuarios[:4]

    def operacion_concurrente(idx):
        u = grupo[idx % 4]
        barrier.wait(timeout=15)
        modo = idx // 4
        if modo == 0:
            # Inserción
            dia_f = 15 + (idx % 14)
            lote = [AsistenciaCreate(id_usuario=u["id_usuario"], fecha=f"2026-11-{dia_f:02d}", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8)]
            return ("insertar", db.guardar_asistencias_atomicas(lote, u["id_usuario"]))
        elif modo == 1:
            # Recálculo de liquidación con FOR UPDATE unificado
            return ("liquidacion", db.obtener_liquidacion(u["id_usuario"], "2026-11"))
        elif modo == 2:
            # Modificación de costo día manual
            with entorno_20_usuarios.cursor_concurrente() as cur:
                cur.execute("SELECT id_asistencia FROM app_rrhh.b_1_asistencias WHERE id_usuario = %s LIMIT 1", (u["id_usuario"],))
                fila = cur.fetchone()
            if fila:
                return ("costo_manual", db.actualizar_costo_dia_manual(fila["id_asistencia"], Decimal("15000.00"), u["id_usuario"]))
            return ("costo_manual_skip", None)
        elif modo == 3:
            # Consulta concurrente de asistencias
            return ("consultar", db.consultar_asistencias(u["id_usuario"], "2026-11"))
        else:
            # Segunda inserción
            dia_f = 16 + (idx % 14)
            lote = [AsistenciaCreate(id_usuario=u["id_usuario"], fecha=f"2026-11-{dia_f:02d}", activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8)]
            return ("insertar_2", db.guardar_asistencias_atomicas(lote, u["id_usuario"]))

    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futuros = [executor.submit(operacion_concurrente, i) for i in range(20)]
        resultados = [f.result() for f in futuros]

    assert len(resultados) == 20
    # Cero excepciones arrojadas, confirmando serialización sin deadlocks


# [FN-07.16] 5. Escenario 4 (Agregado): Responsable de RRHH Cargando Múltiples Turnos de Roster en Lote y en Concurrencia
def test_rrhh_cargando_varios_turnos_roster_concurrente(entorno_20_usuarios):
    rrhh_admin = entorno_20_usuarios.usuarios[0]  # Admin
    empleados_ingenieria = entorno_20_usuarios.usuarios[1:5]  # 4 colaboradores
    proyecto = entorno_20_usuarios.proyectos[0]["id_proyecto"]
    barrier = threading.Barrier(17)  # 1 hilo RRHH + 16 hilos de colaboradores

    # Lote de 8 turnos de Roster preparados por RRHH (2 turnos consecutivos por colaborador: 1 Campo + 1 Franco)
    lote_rosters = []
    for emp in empleados_ingenieria:
        lote_rosters.append({
            "empleado": emp["id_usuario"],
            "proyecto": proyecto,
            "fecha_inicio": "2026-11-01",
            "fecha_fin": "2026-11-14",
            "tipo": "Campo"
        })
        lote_rosters.append({
            "empleado": emp["id_usuario"],
            "proyecto": proyecto,
            "fecha_inicio": "2026-11-15",
            "fecha_fin": "2026-11-21",
            "tipo": "Franco"
        })

    def tarea_rrhh():
        barrier.wait(timeout=15)
        t0 = time.perf_counter()
        creados = db.guardar_rosters_atomicos(lote_rosters, rrhh_admin["id_usuario"])
        latencia = time.perf_counter() - t0
        return ("rrhh", creados, latencia)

    def tarea_colaborador(u, idx):
        barrier.wait(timeout=15)
        # Los colaboradores registran asistencias fuera del rango de Roster o consultan liquidación
        fecha = f"2026-11-{22 + (idx % 8):02d}"
        lote = [AsistenciaCreate(id_usuario=u["id_usuario"], fecha=fecha, activo_franco="activo", lugar="oficina", tipo_dia="dia_normal", dedicado_a="areas", horas_dedicadas=8)]
        res = db.guardar_asistencias_atomicas(lote, u["id_usuario"])
        return ("colaborador", len(res))

    with concurrent.futures.ThreadPoolExecutor(max_workers=17) as executor:
        f_rrhh = executor.submit(tarea_rrhh)
        f_colabs = [executor.submit(tarea_colaborador, u, i) for i, u in enumerate(entorno_20_usuarios.usuarios[4:20])]

        tipo, turnos_creados, lat_rrhh = f_rrhh.result()
        res_colabs = [f.result() for f in f_colabs]

    assert len(turnos_creados) == 8
    assert all(r[1] == 1 for r in res_colabs)

    # Verificaciones en Base de Datos de los turnos y asistencias generadas por triggers
    with entorno_20_usuarios.cursor_concurrente() as cur:
        # 1. 8 turnos en app_rrhh.b_1_roster con total_viaticos computados por trigger
        cur.execute("SELECT id_roster, id_usuario, tipo_turno, total_viaticos, fecha_inicio, fecha_fin FROM app_rrhh.b_1_roster WHERE cargado_por = %s", (rrhh_admin["id_usuario"],))
        filas_roster = cur.fetchall()
        assert len(filas_roster) == 8
        for r in filas_roster:
            assert Decimal(r["total_viaticos"]) > 0

        # 2. Las asistencias de los turnos fueron generadas automáticamente por trg_generar_asistencias_roster
        cur.execute("""SELECT count(*) FROM app_rrhh.b_1_asistencias
            WHERE id_roster IS NOT NULL AND id_usuario = ANY(%s::uuid[])""",
            ([e["id_usuario"] for e in empleados_ingenieria],))
        # 4 colaboradores x (14 días Campo + 7 días Franco = 21 días) = 84 asistencias generadas
        total_asist_roster = cur.fetchone()["count"]
        assert total_asist_roster == 84

        # 3. Invariante de liquidación mensual sincronizada automáticamente
        for emp in empleados_ingenieria:
            cur.execute("""SELECT cant_dias_obra, total_real
                FROM app_rrhh.a_1_calculo_sueldo
                WHERE id_usuario = %s AND ciclo_cobro = '2026-11'""", (emp["id_usuario"],))
            liq = cur.fetchone()
            assert liq is not None
            # 21 días de turnos en roster generados por los bloques de Campo + Franco
            assert liq["cant_dias_obra"] == 21
