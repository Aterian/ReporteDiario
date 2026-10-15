# [FN-00.03] Testing de Integridad Roster, Reglas Salariales y Sincronizacion Sheets
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import database
from database import (
    inicializar_bd,
    obtener_conexion,
    guardar_usuarios_cache,
    guardar_registro_asistencia,
)
import sheets_service
from sheets_service import (
    calcular_costo_dia_asistencia,
    sincronizar_pendientes,
)


class TestIntegridadRosterSheets(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_ruta_db = database.RUTA_DB
        self.test_db_path = os.path.join(self.temp_dir.name, "test_integridad.db")
        database.RUTA_DB = self.test_db_path
        inicializar_bd()

        # Cargar usuarios de prueba con salarios base
        self.usuarios_test = [
            {
                "nombre": "Iván Valentin",
                "email": "ivan@ingeap.com",
                "dni": "40158951",
                "area": "A",
                "costo_dia_ofi": 50000.0,
                "costo_dia_obra": 80000.0,
            },
            {
                "nombre": "Justina Bertolozzi",
                "email": "rrhh@ingeap.com",
                "dni": "45411162",
                "area": "RRHH",
                "costo_dia_ofi": 60000.0,
                "costo_dia_obra": 90000.0,
            }
        ]
        guardar_usuarios_cache(self.usuarios_test)

    def tearDown(self):
        database.RUTA_DB = self.original_ruta_db
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    @patch("sheets_service.sincronizar_modificaciones_pendientes")
    @patch("sheets_service.obtener_no_laborales_remotos")
    @patch("sheets_service.cargar_configuracion")
    @patch("sheets_service.obtener_hoja_trabajo")
    def test_prevencion_duplicados_multi_pc_actualiza_in_place(
        self,
        mock_obtener_hoja,
        mock_cargar_config,
        mock_no_laborales,
        mock_sync_mod
    ):
        """
        Requerimiento: Simular carga desde PC 1 (UUID_A) y modificación desde PC 2 (UUID_B)
        para el mismo (empleado, fecha).
        Verificar que sincronizar_pendientes() ejecute ws.update in-place en la fila remota
        y NO duplique filas usando ws.append_rows.
        """
        mock_cargar_config.return_value = {"spreadsheet_id": "sp_mock_123"}
        mock_no_laborales.return_value = []
        mock_sync_mod.return_value = {"exito": True, "cantidad": 0}

        headers = [
            "id_asistencia", "empleado", "fecha", "tipo_ocf", "servicio",
            "hora_inicio", "hora_fin", "horas", "instrumental", "usuario_mail",
            "fecha_hora", "dia_semana", "feriado", "id_empleado", "id_proyecto",
            "cargado_por", "tipo_costo", "costo_dia"
        ]
        # Fila previa en Google Sheets creada por PC 1 en fila 2
        fila_remota_pc1 = [
            "UUID_A", "Justina Bertolozzi", "2026-10-15", "Oficina", "Oficina Central",
            "08:00", "16:00", "8.0", "PC", "rrhh@ingeap.com",
            "2026-10-15 08:00:00", "Jueves", "NO", "45411162", "PROY-001",
            "Justina Bertolozzi", "Oficina", "60000.0"
        ]

        mock_ws = MagicMock()
        mock_ws.get_all_values.return_value = [headers, fila_remota_pc1]
        mock_ws.update = MagicMock()
        mock_ws.append_rows = MagicMock()
        mock_obtener_hoja.return_value = (MagicMock(), mock_ws)

        # Modificación en PC 2 para la misma persona y fecha pero con nuevo UUID local
        guardar_registro_asistencia(
            id_asistencia="UUID_B",
            empleado="Justina Bertolozzi",
            fecha="2026-10-15",
            horas=9.0,
            servicio="Oficina Central",
            tipo_ocf="Oficina",
            hora_inicio="08:00",
            hora_fin="17:00",
            tipo_costo="Oficina",
            costo_dia=60000.0,
            feriado="NO",
            usuario_mail="rrhh@ingeap.com",
            id_empleado="45411162",
            sincronizado=False
        )

        # Ejecutar sincronización
        res_sync = sincronizar_pendientes()

        self.assertTrue(res_sync.get("exito"))
        self.assertEqual(res_sync.get("cantidad"), 1)

        # Verificación 1: Se actualizó in-place en la fila 2 de Sheets
        self.assertTrue(mock_ws.update.called, "ws.update debió ser invocado para actualizar in-place.")
        call_args = mock_ws.update.call_args[1]
        self.assertIn("A2:", call_args.get("range_name", ""))

        # Verificación 2: NO se llamó a append_rows (evitando fila duplicada)
        self.assertFalse(mock_ws.append_rows.called, "ws.append_rows NO debe ser llamado si ya existía la fila.")

        # Verificación 3: Registro en SQLite local marcado como sincronizado
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT sincronizado FROM historial WHERE id_asistencia = ?", ("UUID_B",))
            row = cursor.fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row["sincronizado"], 1)

    def test_reglas_salariales_costo_dia_guarda_sueldo_base_y_no_viaticos_roster(self):
        """
        Requerimiento: Verificar que costo_dia guarde estrictamente el sueldo base
        del colaborador y NO los viáticos de 1_2_tarifas_roster.
        """
        # Sueldo base oficina: 50000.0, obra: 80000.0
        # Aunque el proyecto de campo tenga viáticos mayores en 1_2_tarifas_roster (ej. $150.000)
        tipo_c_campo, costo_campo = calcular_costo_dia_asistencia(
            tipo_ocf="Campo",
            servicio="Gasoducto Norte",
            feriado="NO",
            empleado="Iván Valentin",
            tipo_costo="Campo"
        )
        self.assertEqual(tipo_c_campo, "Campo")
        self.assertEqual(costo_campo, 80000.0, "costo_dia de campo debe ser costo_dia_obra base.")

        tipo_c_ofi, costo_ofi = calcular_costo_dia_asistencia(
            tipo_ocf="Oficina",
            servicio="Administración Central",
            feriado="NO",
            empleado="Iván Valentin",
            tipo_costo="Oficina"
        )
        self.assertEqual(tipo_c_ofi, "Oficina")
        self.assertEqual(costo_ofi, 50000.0, "costo_dia de oficina debe ser costo_dia_ofi base.")

    def test_reglas_salariales_feriado_no_duplica_costo_en_dias_no_trabajados(self):
        """
        Requerimiento: Verificar que si tipo_ocf es Franco, Licencia o Vacaciones
        y feriado == 'SI', NO se multiplique el costo por 2.0.
        """
        # 1. Franco de Campo en Feriado: mantiene 80000.0 (NO 160000.0)
        _, costo_franco_campo = calcular_costo_dia_asistencia(
            tipo_ocf="Franco",
            servicio="Roster Operativo",
            feriado="SI",
            empleado="Iván Valentin",
            tipo_costo="Campo"
        )
        self.assertEqual(costo_franco_campo, 80000.0, "Franco en campo durante feriado NO debe duplicar costo.")

        # 2. Franco de Oficina en Feriado: mantiene 50000.0 (NO 100000.0)
        _, costo_franco_ofi = calcular_costo_dia_asistencia(
            tipo_ocf="Franco",
            servicio="Sede Central",
            feriado="SI",
            empleado="Iván Valentin",
            tipo_costo="Oficina"
        )
        self.assertEqual(costo_franco_ofi, 50000.0, "Franco de oficina durante feriado NO debe duplicar costo.")

        # 3. Licencia en Feriado: estrictamente 0.0
        _, costo_licencia = calcular_costo_dia_asistencia(
            tipo_ocf="Licencia",
            servicio="Sede Central",
            feriado="SI",
            empleado="Iván Valentin"
        )
        self.assertEqual(costo_licencia, 0.0, "Licencia en feriado debe computar 0.0 de costo_dia.")

        # 4. Vacaciones en Feriado: estrictamente 0.0
        _, costo_vacaciones = calcular_costo_dia_asistencia(
            tipo_ocf="Vacaciones",
            servicio="Sede Central",
            feriado="SI",
            empleado="Iván Valentin"
        )
        self.assertEqual(costo_vacaciones, 0.0, "Vacaciones en feriado debe computar 0.0 de costo_dia.")

        # 5. Día de trabajo ACTIVO en Feriado: SÍ duplica por 2.0
        _, costo_trabajo_feriado = calcular_costo_dia_asistencia(
            tipo_ocf="Campo",
            servicio="Gasoducto Norte",
            feriado="SI",
            empleado="Iván Valentin",
            tipo_costo="Campo"
        )
        self.assertEqual(costo_trabajo_feriado, 160000.0, "Jornada activa en feriado SÍ debe duplicar tarifa x2.0.")

    @patch("sheets_service.sincronizar_modificaciones_pendientes")
    @patch("sheets_service.obtener_no_laborales_remotos")
    @patch("sheets_service.cargar_configuracion")
    @patch("sheets_service.obtener_hoja_trabajo")
    def test_resiliencia_ante_cortes_de_red_mantiene_sincronizado_cero(
        self,
        mock_obtener_hoja,
        mock_cargar_config,
        mock_no_laborales,
        mock_sync_mod
    ):
        """
        Requerimiento: Simular excepción de red al sincronizar con Sheets
        y comprobar que los registros locales mantengan sincronizado = 0.
        """
        mock_cargar_config.return_value = {"spreadsheet_id": "sp_mock_123"}
        mock_no_laborales.return_value = []
        mock_sync_mod.return_value = {"exito": True, "cantidad": 0}

        # Simular falla de conexión o timeout de red hacia Google Sheets
        mock_obtener_hoja.side_effect = ConnectionError("Error de socket: Conexión rechazada o timeout con Google APIs")

        # Insertar registro local con sincronizado = 0
        guardar_registro_asistencia(
            id_asistencia="UUID_OFFLINE_001",
            empleado="Iván Valentin",
            fecha="2026-10-15",
            horas=8.0,
            servicio="Proyecto Piloto",
            tipo_ocf="Campo",
            tipo_costo="Campo",
            costo_dia=80000.0,
            feriado="NO",
            usuario_mail="ivan@ingeap.com",
            sincronizado=False
        )

        # Ejecutar sincronización que fallará por corte de red
        res_sync = sincronizar_pendientes()

        # Debe retornar status de fallo sin lanzar excepción no capturada
        self.assertFalse(res_sync.get("exito"))
        self.assertIn("Error de socket", res_sync.get("error", ""))

        # Verificar que el registro local en SQLite mantiene estrictamente sincronizado = 0
        with obtener_conexion() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT sincronizado FROM historial WHERE id_asistencia = ?", ("UUID_OFFLINE_001",))
            row = cursor.fetchone()

        self.assertIsNotNone(row)
        self.assertEqual(row["sincronizado"], 0, "El registro local DEBE conservar sincronizado = 0 ante corte de red.")


if __name__ == "__main__":
    unittest.main()
