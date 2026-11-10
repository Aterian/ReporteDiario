from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from psycopg2.errors import CheckViolation

from error_handler import AppBaseException, RegistroNoEncontradoError


# [FN-06.10] Preparar el buzón en la transacción aislada
@pytest.fixture
def repositorio_sugerencias(pg_repository, pg_connection):
    repositorio, _ = pg_repository
    with pg_connection.cursor() as cursor:
        cursor.execute("SELECT to_regclass(%s)", ("app_rrhh.b_2_participacion_consulta",))
        if cursor.fetchone()[0] is None:
            esquema = (Path(__file__).parent / "fixtures" / "postgres_schema.sql").read_text(encoding="utf-8")
            _, inicio, bloque = esquema.partition("-- [FN-06.10] Inicio de participación y consulta\n")
            ddl, fin, _ = bloque.partition("-- [FN-06.10] Fin de participación y consulta")
            assert inicio and fin, "Falta el bloque de participación y consulta en el esquema de pruebas."
            cursor.execute(ddl)
    return repositorio


# [FN-06.10] Construir una edición desde la versión leída
def _edicion(registro, **cambios):
    original = {campo: registro[campo] for campo in ("estado_revision", "nivel_urgencia", "respuesta")}
    return {"id_participacion": registro["id_participacion"], "original": original, **original, **cambios}


# [FN-06.10] Guardar aportes y consultar páginas con filtros
def test_crear_sugerencias_y_consultar_bandeja(repositorio_sugerencias):
    db = repositorio_sugerencias
    marca = f"Integración {uuid4()}"
    antes = db.obtener_sugerencias({"limite": 1})["contadores"]
    anonima = db.crear_sugerencia({
        "nombre": "   ",
        "tipo_sugerencia": "Aplicaciones",
        "descripcion_sugerencia": f" {marca} · Mejorar el formulario  ",
    })["id_participacion"]
    identificada = db.crear_sugerencia({
        "nombre": " Colaborador sintético ",
        "descripcion_sugerencia": f"{marca} · Revisar la inducción",
    })["id_participacion"]

    filtros = {"busqueda": marca, "estado_revision": "nueva", "nivel_urgencia": "con tiempo", "limite": 1}
    primera = db.obtener_sugerencias(filtros)
    segunda = db.obtener_sugerencias({**filtros, "pagina": 2})
    assert primera["total"] == segunda["total"] == 2
    assert len(primera["sugerencias"]) == len(segunda["sugerencias"]) == 1
    registros = {fila["id_participacion"]: fila for fila in primera["sugerencias"] + segunda["sugerencias"]}
    assert set(registros) == {anonima, identificada}
    assert registros[anonima]["nombre"] == "Anonimo"
    assert registros[anonima]["tipo_sugerencia"] == "Aplicaciones"
    assert registros[anonima]["descripcion_sugerencia"] == f"{marca} · Mejorar el formulario"
    assert registros[identificada]["nombre"] == "Colaborador sintético"
    assert registros[identificada]["tipo_sugerencia"] == "Otro"
    assert registros[anonima]["estado_revision"] == "nueva"
    assert registros[anonima]["nivel_urgencia"] == "con tiempo"
    assert registros[anonima]["respuesta"] is None
    assert registros[anonima]["fecha_hora_resolucion"] is None
    assert datetime.fromisoformat(registros[anonima]["fecha_hora_registro"]).tzinfo is not None
    assert primera["contadores"] == {**antes, "nuevas": antes["nuevas"] + 2}
    sin_urgentes = db.obtener_sugerencias({**filtros, "nivel_urgencia": "urgente"})
    assert sin_urgentes["total"] == 0
    assert sin_urgentes["sugerencias"] == []
    assert sin_urgentes["contadores"] == primera["contadores"]
    for nombre_anonimo in ("Anónimo", "Anonimo"):
        por_nombre = db.obtener_sugerencias({**filtros, "busqueda": nombre_anonimo, "limite": 100})
        assert anonima in {fila["id_participacion"] for fila in por_nombre["sugerencias"]}


# [FN-06.10] Resolver, conservar el cierre y reabrir
def test_trigger_fecha_resolucion_y_reapertura(repositorio_sugerencias):
    db = repositorio_sugerencias
    marca = f"Resolver {uuid4()}"
    referencia = db.crear_sugerencia({"descripcion_sugerencia": marca})["id_participacion"]
    inicial = db.obtener_sugerencias({"busqueda": marca})["sugerencias"][0]

    cerrada = db.actualizar_sugerencia(_edicion(inicial, estado_revision="resuelta", nivel_urgencia="urgente"))
    assert cerrada["estado_revision"] == "resuelta"
    assert cerrada["nivel_urgencia"] == "urgente"
    assert datetime.fromisoformat(cerrada["fecha_hora_resolucion"]).tzinfo is not None

    fecha_historica = datetime(2026, 1, 15, 10, 30, tzinfo=timezone.utc)
    with db.obtener_cursor_pg(commit=True) as cursor:
        cursor.execute(
            "UPDATE app_rrhh.b_2_participacion_consulta SET fecha_hora_resolucion = %s WHERE id_participacion = %s",
            (fecha_historica, referencia),
        )
    respondida = db.actualizar_sugerencia(_edicion(cerrada, respuesta=" Revisión completada. "))
    assert respondida["respuesta"] == "Revisión completada."
    assert datetime.fromisoformat(respondida["fecha_hora_resolucion"]) == fecha_historica

    reabierta = db.actualizar_sugerencia(_edicion(respondida, estado_revision="para aplicar", respuesta=None))
    assert reabierta["estado_revision"] == "para aplicar"
    assert reabierta["fecha_hora_resolucion"] is None
    assert reabierta["respuesta"] is None
    assert db.obtener_sugerencias({"busqueda": marca, "estado_revision": "resuelta"})["total"] == 0


# [FN-06.10] Rechazar un guardado obsoleto sin sobrescribir la respuesta
def test_guardado_obsoleto_y_referencia_inexistente(repositorio_sugerencias):
    db = repositorio_sugerencias
    marca = f"Edición simultánea {uuid4()}"
    db.crear_sugerencia({"descripcion_sugerencia": marca})
    inicial = db.obtener_sugerencias({"busqueda": marca})["sugerencias"][0]

    vigente = db.actualizar_sugerencia(_edicion(inicial, respuesta="Primera revisión"))
    with pytest.raises(AppBaseException) as conflicto:
        db.actualizar_sugerencia(_edicion(inicial, estado_revision="resuelta", respuesta="Edición obsoleta"))
    assert conflicto.value.codigo_error == "ERROR_CONCURRENCIA"
    with pytest.raises(RegistroNoEncontradoError):
        db.actualizar_sugerencia({**_edicion(vigente, estado_revision="vista"), "id_participacion": str(uuid4())})

    assert db.obtener_sugerencias({"busqueda": marca})["sugerencias"] == [vigente]


# [FN-06.10] Revertir la escritura ante una restricción PostgreSQL
def test_descripcion_vacia_revierte_transaccion(repositorio_sugerencias):
    db = repositorio_sugerencias
    marca = f"Reversión {uuid4()}"
    insertar = """INSERT INTO app_rrhh.b_2_participacion_consulta (tipo_sugerencia, descripcion_sugerencia)
        VALUES (%s, %s)"""

    with pytest.raises(CheckViolation):
        with db.obtener_cursor_pg(commit=True) as cursor:
            cursor.execute(insertar, ("Aplicaciones", marca))
            cursor.execute(insertar, ("Aplicaciones", "   "))

    assert db.obtener_sugerencias({"busqueda": marca})["total"] == 0
