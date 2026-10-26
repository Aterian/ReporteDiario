# [MOD-07] Fixtures transaccionales PostgreSQL
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import psycopg2
import pytest
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"backend"))
load_dotenv(ROOT/".env.test",override=False)


# [FN-07.10] Conectar exclusivamente a la base de pruebas
@pytest.fixture
def pg_connection():
    dsn = os.getenv("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Configure TEST_DATABASE_URL o ejecute backend/bootstrap_test_db.py.")
    conn = psycopg2.connect(dsn,connect_timeout=8)
    if not conn.info.dbname.startswith("codex_check_diario_test_"):
        conn.close()
        pytest.fail("Las pruebas requieren una base cuyo nombre comience con codex_check_diario_test_.")
    try:
        yield conn
    finally:
        conn.rollback()
        conn.close()


# [FN-07.10] Mantener cada prueba dentro de una transacción reversible
@pytest.fixture
def pg_repository(pg_connection,monkeypatch):
    import postgres_repository as db

    @contextmanager
    def cursor_prueba(commit=False):
        with pg_connection.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SAVEPOINT prueba_repositorio")
            try:
                yield cur
                cur.execute("RELEASE SAVEPOINT prueba_repositorio")
            except BaseException:
                cur.execute("ROLLBACK TO SAVEPOINT prueba_repositorio")
                cur.execute("RELEASE SAVEPOINT prueba_repositorio")
                raise

    monkeypatch.setattr(db,"obtener_cursor_pg",cursor_prueba)
    db.perfil_esquema.cache_clear()
    db.borrar_sesion()
    with cursor_prueba(True) as cur:
        usuario,proyecto = str(uuid4()),str(uuid4())
        cur.execute("""INSERT INTO app_rrhh.a_1_usuarios (id_usuario,dni,nombre,apellido,correo,area,rol_app)
            VALUES (%s,%s,%s,%s,%s,%s,%s)""",(usuario,uuid4().hex[:8],"Empleado","Sintético",uuid4().hex+"@example.test","I","admin"))
        cur.execute("INSERT INTO app_proyectos.b_1_proyectos_servicios (id_proyecto,codificacion_serv) VALUES (%s,%s)",(proyecto,"Proyecto Sintético "+uuid4().hex[:8]))
        cur.execute("INSERT INTO app_rrhh.a_1_sueldos_base (id_usuario,sueldo_oficina,sueldo_obra) VALUES (%s,%s,%s)",(usuario,300000,600000))
        cur.execute("""INSERT INTO app_rrhh.b_1_tarifas_roster
            (id_proyecto,dia_normal,dia_domingo,subida,bajada,adicional_turno) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id_tarifa""",
            (proyecto,100,200,30,40,50))
        tarifa = str(cur.fetchone()["id_tarifa"])
    yield db,{"usuario":usuario,"proyecto":proyecto,"tarifa":tarifa}
    db.perfil_esquema.cache_clear()
    db.borrar_sesion()
