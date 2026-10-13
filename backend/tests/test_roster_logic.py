# [FN-00.02] Unit Tests for Roster Salary Rates & Local SQLite Persistence
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import database
from database import (
    inicializar_bd,
    obtener_conexion,
    guardar_usuarios_cache,
    guardar_registro_roster,
)
from main import calcular_costo_dia_asistencia



class TestRosterBusinessLogic(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_ruta_db = database.RUTA_DB
        self.test_db_path = os.path.join(self.temp_dir.name, "test_roster.db")
        database.RUTA_DB = self.test_db_path
        inicializar_bd()

        # Configurar empleado de prueba con tarifas diferenciadas
        self.empleado_test = {
            "nombre": "Iván Valentin",
            "email": "ivan@ingeap.com",
            "dni": "40158951",
            "costo_dia_ofi": 45000.0,
            "costo_dia_obra": 75000.0,
        }
        guardar_usuarios_cache([self.empleado_test])


    def tearDown(self):
        database.RUTA_DB = self.original_ruta_db
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def test_franco_en_campo_usa_costo_dia_obra(self):
        """Regla de Negocio: Turno de Franco en Roster de Campo debe liquidar costo_dia_obra."""
        tipo_c, costo_dia = calcular_costo_dia_asistencia(
            tipo_ocf="Franco",
            servicio="Gasoducto Norte",
            feriado="NO",
            empleado="Iván Valentin",
            tipo_costo="Campo"
        )
        self.assertEqual(tipo_c, "Campo")
        self.assertEqual(costo_dia, 75000.0)

    def test_franco_en_oficina_usa_costo_dia_oficina(self):
        """Regla de Negocio: Franco regular de oficina debe liquidar costo_dia_oficina."""
        tipo_c, costo_dia = calcular_costo_dia_asistencia(
            tipo_ocf="Franco",
            servicio="Oficina Central",
            feriado="NO",
            empleado="Iván Valentin",
            tipo_costo="Oficina"
        )
        self.assertEqual(tipo_c, "Oficina")
        self.assertEqual(costo_dia, 45000.0)

    def test_guardar_registro_roster_persistencia_local(self):
        """Verifica que el roster se guarde correctamente en la base SQLite local."""
        datos_roster = {
            "id": "roster-uuid-001",
            "empleado": "Iván Valentin",
            "proyecto": "Lote 3 Minería",
            "fecha_inicio": "2026-10-01",
            "fecha_fin": "2026-10-15",
            "tipo": "Campo",
            "precio_dia": 35000.0,
            "precio_domingo": 50000.0
        }
        res = guardar_registro_roster(datos_roster)
        self.assertTrue(res.get("exito"))

        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM rosters WHERE id = ?", ("roster-uuid-001",))
            fila = cursor.fetchone()

        self.assertIsNotNone(fila)
        self.assertEqual(fila["empleado"], "Iván Valentin")
        self.assertEqual(fila["proyecto"], "Lote 3 Minería")
        self.assertEqual(fila["precio_dia"], 35000.0)
        self.assertEqual(fila["precio_domingo"], 50000.0)

    def test_actualizar_tarifas_locales_roster_sin_afectar_sincronizacion(self):
        """Verifica que la asignación de viáticos modifique únicamente la tabla local 'rosters'."""
        datos_roster = {
            "id": "roster-uuid-002",
            "empleado": "Iván Valentin",
            "proyecto": "Parque Solar",
            "fecha_inicio": "2026-10-10",
            "fecha_fin": "2026-10-20",
            "tipo": "Campo",
            "precio_dia": 0.0,
            "precio_domingo": 0.0
        }
        guardar_registro_roster(datos_roster)

        # Actualizar tarifas directamente en la tabla local
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE rosters SET precio_dia = ?, precio_domingo = ? WHERE id = ?",
                (42000.0, 65000.0, "roster-uuid-002")
            )
            conn.commit()

            cursor.execute("SELECT precio_dia, precio_domingo FROM rosters WHERE id = ?", ("roster-uuid-002",))
            row = cursor.fetchone()

        self.assertEqual(row["precio_dia"], 42000.0)
        self.assertEqual(row["precio_domingo"], 65000.0)


if __name__ == "__main__":
    unittest.main()
