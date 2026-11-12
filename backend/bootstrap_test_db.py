# [MOD-07] Entorno PostgreSQL aislado con estructura sin datos operativos
import os
from pathlib import Path
from uuid import uuid4

import psycopg2
from dotenv import load_dotenv
from psycopg2 import sql
from psycopg2.extensions import make_dsn, parse_dsn

ROOT = Path(__file__).resolve().parent.parent
PREFIJO_PRUEBAS = "codex_check_diario_test_"


# [FN-07.10] Ejecutar solo el esquema de pruebas versionado y revisable
def leer_estructura_pruebas():
    fixture = ROOT / "backend" / "tests" / "fixtures" / "postgres_schema.sql"
    return fixture.read_text(encoding="utf-8")


# [FN-07.10] Crear una base nueva y cerrar su acceso público
def main():
    load_dotenv(ROOT/".env",override=False)
    load_dotenv(ROOT/"backend"/".env",override=False)
    origen = os.environ["DATABASE_URL"]
    estructura = leer_estructura_pruebas()
    nombre = PREFIJO_PRUEBAS+uuid4().hex[:10]
    administrador = psycopg2.connect(origen,connect_timeout=8)
    administrador.autocommit = True
    try:
        with administrador.cursor() as cur:
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(nombre)))
            cur.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(sql.Identifier(nombre)))
    finally:
        administrador.close()
    parametros = parse_dsn(origen)
    parametros["dbname"] = nombre
    destino = make_dsn(**parametros)
    with psycopg2.connect(destino,connect_timeout=8) as conn:
        if conn.info.dbname != nombre or not conn.info.dbname.startswith(PREFIJO_PRUEBAS):
            raise RuntimeError("El esquema solo puede ejecutarse en la base aislada recién creada.")
        with conn.cursor() as cur:
            cur.execute(estructura)
            correccion = ROOT/"backend"/"sql"/"002_corregir_prioridad_oficina.sql"
            if correccion.exists():
                cur.execute(correccion.read_text(encoding="utf-8"))
            blindaje = ROOT/"backend"/"sql"/"003_blindar_triggers_liquidacion_y_roster.sql"
            if blindaje.exists():
                cur.execute(blindaje.read_text(encoding="utf-8"))
            modalidad = ROOT/"backend"/"sql"/"004_modalidad_calculo_sueldo.sql"
            if modalidad.exists():
                cur.execute(modalidad.read_text(encoding="utf-8"))
            errores_y_proy = ROOT/"backend"/"sql"/"005_errores_remotos_y_gestion_proyectos.sql"
            if errores_y_proy.exists():
                cur.execute(errores_y_proy.read_text(encoding="utf-8"))
            borrado_logico = ROOT/"backend"/"sql"/"006_borrado_logico_asistencias_y_roster.sql"
            if borrado_logico.exists():
                cur.execute(borrado_logico.read_text(encoding="utf-8"))
            corr_id_sueldo = ROOT/"backend"/"sql"/"007_corregir_id_sueldo_recalcular_liquidacion.sql"
            if corr_id_sueldo.exists():
                cur.execute(corr_id_sueldo.read_text(encoding="utf-8"))
            corr_edicion_roster = ROOT/"backend"/"sql"/"008_corregir_edicion_eliminacion_roster_y_asistencias.sql"
            if corr_edicion_roster.exists():
                cur.execute(corr_edicion_roster.read_text(encoding="utf-8"))
    (ROOT/".env.test").write_text("TEST_DATABASE_URL="+repr(destino)+"\n",encoding="utf-8")
    print("Base de pruebas creada:",nombre)
    print("Conexión guardada en .env.test (ignorado por Git); esquema local versionado, sin datos operativos.")


if __name__ == "__main__":
    main()
