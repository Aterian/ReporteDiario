# [FN-00.01] Unit Tests for Database Engine & SQLite WAL Concurrency
import os
import sys
import tempfile
import unittest

# Asegurar path de importación hacia backend/
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import database


class TestDatabaseInitAndPragmas(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_ruta_db = database.RUTA_DB
        self.test_db_path = os.path.join(self.temp_dir.name, "test_check_diario.db")
        database.RUTA_DB = self.test_db_path

    def tearDown(self):
        database.RUTA_DB = self.original_ruta_db
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def test_inicializar_bd_crea_tablas_principales(self):
        database.inicializar_bd()
        self.assertTrue(os.path.exists(self.test_db_path))

        with database.obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tablas = {fila["name"] for fila in cursor.fetchall()}

        tablas_esperadas = {
            "historial",
            "rosters",
            "modificaciones_realizadas",
            "usuarios_cache",
            "proyectos_cache",
            "sesion",
            "no_laborales_cache",
            "perfiles_empleados",
        }

        for t in tablas_esperadas:
            self.assertIn(t, tablas, f"La tabla requerida '{t}' no fue creada en la inicialización.")

    def test_sqlite_wal_pragmas(self):
        database.inicializar_bd()
        with database.obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode;")
            journal_mode = cursor.fetchone()[0]
            cursor.execute("PRAGMA busy_timeout;")
            busy_timeout = cursor.fetchone()[0]

        self.assertEqual(journal_mode.lower(), "wal")
        self.assertEqual(busy_timeout, 30000)

    def test_normalizar_fecha_iso(self):
        self.assertEqual(database.normalizar_fecha_iso("2026-10-13"), "2026-10-13")
        self.assertEqual(database.normalizar_fecha_iso("13/10/2026"), "2026-10-13")
        self.assertEqual(database.normalizar_fecha_iso(""), "")

    def test_cache_usuarios_y_servicios(self):
        database.inicializar_bd()
        usuarios_mock = [
            {"nombre": "Iván Valentin", "email": "ivan@ingeap.com", "costo_dia_ofi": 50000.0, "costo_dia_obra": 80000.0, "dni": "12345678"},
            {"nombre": "Justina Bertolozzi", "email": "justina@ingeap.com", "costo_dia_ofi": 60000.0, "costo_dia_obra": 90000.0, "dni": "87654321"},
        ]
        database.guardar_usuarios_cache(usuarios_mock)
        recuperados = database.obtener_usuarios_cache()
        self.assertEqual(len(recuperados), 2)
        nombres = [u["nombre"] for u in recuperados]
        self.assertIn("Iván Valentin", nombres)



if __name__ == "__main__":
    unittest.main()
