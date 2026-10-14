# [FN-00.03] Unit Tests for Error Handler, Logging and Transaction Management
import os
import sys
import sqlite3
import unittest
import asyncio
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from error_handler import (
    manejar_errores_api,
    transaccion_db,
    AppBaseException,
    ValidacionError,
    RegistroDuplicadoError,
    DatabaseTransactionError,
    formatear_respuesta
)


class ModeloPruebaEntrada(BaseModel):
    nombre: str = Field(min_length=3)
    horas: float = Field(ge=0.0, le=24.0)


class TestErrorHandlerArchitecture(unittest.TestCase):

    def test_formatear_respuesta_contrato_estricto(self):
        """Verifica que el contrato exponga siempre exito, datos, error y codigo_error."""
        res_ok = formatear_respuesta(exito=True, datos={"id": 123})
        self.assertTrue(res_ok["exito"])
        self.assertEqual(res_ok["datos"], {"id": 123})
        self.assertIsNone(res_ok["error"])
        self.assertIsNone(res_ok["codigo_error"])

        res_err = formatear_respuesta(exito=False, error="Fallo", codigo_error="ERR_TEST")
        self.assertFalse(res_err["exito"])
        self.assertIsNone(res_err["datos"])
        self.assertEqual(res_err["error"], "Fallo")
        self.assertEqual(res_err["codigo_error"], "ERR_TEST")

    def test_decorador_captura_pydantic_validation_error(self):
        """El decorador debe capturar Pydantic ValidationError y retornar VALIDACION_ERROR."""
        @manejar_errores_api
        def endpoint_validado(datos):
            modelo = ModeloPruebaEntrada(**datos)
            return {"procesado": modelo.nombre}

        # Datos inválidos: horas > 24 y nombre muy corto
        res = endpoint_validado({"nombre": "A", "horas": 30.0})
        self.assertFalse(res["exito"])
        self.assertEqual(res["codigo_error"], "VALIDACION_ERROR")
        self.assertIn("Validación fallida", res["error"])

    def test_decorador_funcion_exitosa_normalizada(self):
        """El decorador debe normalizar retornos planos y diccionarios con éxito."""
        @manejar_errores_api
        def endpoint_suma(a, b):
            return a + b

        res = endpoint_suma(10, 20)
        self.assertTrue(res["exito"])
        self.assertEqual(res["datos"], 30)
        self.assertIsNone(res["error"])

    def test_decorador_captura_excepcion_dominio(self):
        """El decorador debe exponer el mensaje de negocio y el código específico."""
        @manejar_errores_api
        def endpoint_duplicado():
            raise RegistroDuplicadoError("El empleado ya cargó jornada en esta fecha.")

        res = endpoint_duplicado()
        self.assertFalse(res["exito"])
        self.assertEqual(res["codigo_error"], "REGISTRO_DUPLICADO")
        self.assertEqual(res["error"], "El empleado ya cargó jornada en esta fecha.")

    def test_decorador_captura_excepcion_inesperada(self):
        """El decorador debe ocultar el stacktrace interno al cliente retornando ERROR_INTERNO."""
        @manejar_errores_api
        def endpoint_con_bug():
            return 1 / 0

        res = endpoint_con_bug()
        self.assertFalse(res["exito"])
        self.assertEqual(res["codigo_error"], "ERROR_INTERNO")
        self.assertIn("error inesperado", res["error"].lower())

    def test_decorador_asincrono(self):
        """El decorador debe soportar corrutinas asíncronas con idéntico contrato."""
        @manejar_errores_api
        async def endpoint_async(val):
            await asyncio.sleep(0.01)
            if val < 0:
                raise ValidacionError("El valor no puede ser negativo.")
            return val * 2

        loop = asyncio.new_event_loop()
        try:
            res_ok = loop.run_until_complete(endpoint_async(5))
            self.assertTrue(res_ok["exito"])
            self.assertEqual(res_ok["datos"], 10)

            res_err = loop.run_until_complete(endpoint_async(-1))
            self.assertFalse(res_err["exito"])
            self.assertEqual(res_err["codigo_error"], "VALIDACION_ERROR")
        finally:
            loop.close()

    def test_transaccion_db_commit_exitoso(self):
        """Verifica que transaccion_db guarde los cambios en la conexión."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, valor TEXT UNIQUE)")

        with transaccion_db(conn):
            conn.execute("INSERT INTO items (valor) VALUES ('Alfa')")

        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM items")
        self.assertEqual(cursor.fetchone()[0], 1)
        conn.close()

    def test_transaccion_db_rollback_y_traduccion_unicidad(self):
        """Verifica rollback automático y traducción a RegistroDuplicadoError ante violación de unicidad."""
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE items (id INTEGER PRIMARY KEY, valor TEXT UNIQUE)")
        conn.execute("INSERT INTO items (valor) VALUES ('Beta')")
        conn.commit()

        with self.assertRaises(RegistroDuplicadoError) as ctx:
            with transaccion_db(conn):
                conn.execute("INSERT INTO items (valor) VALUES ('Nuevo Item')")
                # Esta sentencia viola la unicidad
                conn.execute("INSERT INTO items (valor) VALUES ('Beta')")

        self.assertEqual(ctx.exception.codigo_error, "REGISTRO_DUPLICADO")
        self.assertIn("ya existe", ctx.exception.mensaje)

        # Verificar que 'Nuevo Item' sufrió rollback y no fue persistido
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM items WHERE valor = 'Nuevo Item'")
        self.assertEqual(cursor.fetchone()[0], 0)
        conn.close()


if __name__ == "__main__":
    unittest.main()
