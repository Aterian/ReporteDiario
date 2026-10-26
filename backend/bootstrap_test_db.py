# [MOD-07] Entorno PostgreSQL aislado con estructura sin datos operativos
import os
from pathlib import Path
from uuid import uuid4

import psycopg2
from dotenv import load_dotenv
from psycopg2 import sql
from psycopg2.extensions import make_dsn, parse_dsn

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ("app_rrhh", "app_proyectos")


# [FN-07.10] Obtener exclusivamente metadatos de las tablas de la aplicación
def exportar_estructura(conn):
    sentencias = [sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(s)).as_string(conn) for s in SCHEMAS]
    with conn.cursor() as cur:
        cur.execute("""SELECT n.nspname,t.typname,array_agg(e.enumlabel ORDER BY e.enumsortorder)
            FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
            WHERE n.nspname=ANY(%s) GROUP BY n.nspname,t.typname ORDER BY 1,2""",(list(SCHEMAS),))
        for esquema,nombre,valores in cur.fetchall():
            sentencias.append(sql.SQL("CREATE TYPE {}.{} AS ENUM ({})").format(sql.Identifier(esquema),sql.Identifier(nombre),
                sql.SQL(",").join(sql.Literal(v) for v in valores)).as_string(conn))
        cur.execute("""SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=ANY(%s) AND c.relkind='r' ORDER BY n.nspname,c.relname""",(list(SCHEMAS),))
        tablas = cur.fetchall()
        for oid,esquema,nombre in tablas:
            cur.execute("""SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,
                pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                WHERE a.attrelid=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum""",(oid,))
            columnas = []
            for columna,tipo,no_nulo,generada,defecto in cur.fetchall():
                texto = sql.SQL("{} {}").format(sql.Identifier(columna),sql.SQL(tipo)).as_string(conn)
                if generada:
                    texto += f" GENERATED ALWAYS AS ({defecto}) STORED"
                elif defecto:
                    texto += f" DEFAULT {defecto}"
                if no_nulo:
                    texto += " NOT NULL"
                columnas.append(texto)
            sentencias.append(sql.SQL("CREATE TABLE {}.{} ({})").format(sql.Identifier(esquema),sql.Identifier(nombre),sql.SQL(",\n".join(columnas))).as_string(conn))
        cur.execute("""SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid)
            FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=ANY(%s) AND k.contype IN ('p','u','c','f')
            ORDER BY CASE WHEN k.contype='f' THEN 1 ELSE 0 END,n.nspname,c.relname,k.conname""",(list(SCHEMAS),))
        for esquema,tabla,nombre,definicion in cur.fetchall():
            sentencias.append(sql.SQL("ALTER TABLE {}.{} ADD CONSTRAINT {} {}").format(sql.Identifier(esquema),sql.Identifier(tabla),sql.Identifier(nombre),sql.SQL(definicion)).as_string(conn))
        cur.execute("""SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_constraint k ON k.conindid=i.indexrelid
            WHERE n.nspname=ANY(%s) AND k.oid IS NULL ORDER BY i.indexrelid""",(list(SCHEMAS),))
        sentencias.extend(f[0] for f in cur.fetchall())
        cur.execute("SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY(%s) AND p.prokind='f' ORDER BY p.proname",(list(SCHEMAS),))
        sentencias.extend(f[0] for f in cur.fetchall())
        cur.execute("""SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(%s) AND NOT t.tgisinternal ORDER BY t.tgname""",(list(SCHEMAS),))
        sentencias.extend(f[0] for f in cur.fetchall())
    return ";\n\n".join(s.rstrip(";\n") for s in sentencias)+";\n"


# [FN-07.10] Crear una base nueva y cerrar su acceso público
def main():
    load_dotenv(ROOT/".env",override=False)
    load_dotenv(ROOT/"backend"/".env",override=False)
    origen = os.environ["DATABASE_URL"]
    with psycopg2.connect(origen,connect_timeout=8) as conn:
        conn.set_session(readonly=True)
        estructura = exportar_estructura(conn)
    nombre = "codex_check_diario_test_"+uuid4().hex[:10]
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
        with conn.cursor() as cur:
            cur.execute(estructura)
            correccion = ROOT/"backend"/"sql"/"002_corregir_prioridad_oficina.sql"
            if correccion.exists():
                cur.execute(correccion.read_text(encoding="utf-8"))
    fixture = ROOT/"backend"/"tests"/"fixtures"/"postgres_schema.sql"
    fixture.parent.mkdir(parents=True,exist_ok=True)
    fixture.write_text("-- [FN-07.10] Estructura introspectada para pruebas aisladas; no contiene datos\n"+estructura.replace("\r\n","\n"),encoding="utf-8",newline="\n")
    (ROOT/".env.test").write_text("TEST_DATABASE_URL="+repr(destino)+"\n",encoding="utf-8")
    print("Base de pruebas creada:",nombre)
    print("Conexión guardada en .env.test (ignorado por Git); estructura sin datos operativos.")


if __name__ == "__main__":
    main()
