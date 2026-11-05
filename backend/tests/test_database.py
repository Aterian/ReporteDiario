# [MOD-07] Pruebas del pool PostgreSQL
import time
from threading import BoundedSemaphore
from unittest.mock import MagicMock
import pytest
import psycopg2
import postgres_db as pg
from error_handler import DatabaseTransactionError, RegistroDuplicadoError


# [FN-07.01] Prestar una conexión falsa controlada por prueba
@pytest.fixture
def pool(monkeypatch):
    conn = MagicMock()
    conn.closed = False
    conn._ultimo_uso_monotonic = time.monotonic()
    pool = MagicMock()
    pool.getconn.return_value = conn
    monkeypatch.setattr(pg,"obtener_pool",lambda:pool)
    monkeypatch.setattr(pg,"_slots",BoundedSemaphore(1))
    return pool,conn


# [FN-07.01] Confirmar escritura y devolver conexión
def test_commit_devuelve_conexion(pool):
    p,c = pool
    with pg.obtener_cursor_pg(commit=True):
        pass
    c.commit.assert_called_once()
    c.rollback.assert_not_called()
    p.putconn.assert_called_once_with(c,close=False)


# [FN-07.01] Terminar lecturas sin transacciones abiertas
def test_lectura_hace_rollback(pool):
    p,c = pool
    with pg.obtener_cursor_pg():
        pass
    c.rollback.assert_called_once()
    c.commit.assert_not_called()


# [FN-07.01] Devolver conexión incluso ante fallo de commit
def test_error_commit_rollback(pool):
    p,c = pool
    c.commit.side_effect = psycopg2.OperationalError("fallo")
    with pytest.raises(DatabaseTransactionError):
        with pg.obtener_cursor_pg(commit=True):
            pass
    c.rollback.assert_called_once()
    p.putconn.assert_called_once()


# [FN-07.01] Traducir duplicados sin exponer SQL
def test_error_unicidad(pool):
    p,c = pool
    with pytest.raises(RegistroDuplicadoError):
        with pg.obtener_cursor_pg(commit=True):
            raise psycopg2.errors.UniqueViolation("detalle privado")
    c.rollback.assert_called_once()
    p.putconn.assert_called_once()


# [FN-07.01] Descartar conexiones con rollback fallido
def test_rollback_fallido_descarta(pool):
    p,c = pool
    c.rollback.side_effect = psycopg2.OperationalError("conexión cerrada")
    with pytest.raises(ValueError):
        with pg.obtener_cursor_pg():
            raise ValueError("dato inválido")
    p.putconn.assert_called_once_with(c,close=True)


# [FN-07.01] Liberar el cupo cuando falla la creación del cursor
def test_cursor_falla_libera_cupo(pool):
    p,c = pool
    c.cursor.side_effect = psycopg2.OperationalError("fallo")
    with pytest.raises(DatabaseTransactionError):
        with pg.obtener_cursor_pg():
            pass
    assert pg._slots.acquire(blocking=False)
    pg._slots.release()
    p.putconn.assert_called_once()
