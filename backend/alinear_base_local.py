"""
Script de Alineación Local - Check Diario Ingeap
Descarga los registros oficiales de Google Sheets y purga de la base
local SQLite cualquier fila que haya sido eliminada manualmente en la nube.
"""

import sys

try:
    from database import inicializar_bd, reconstruir_rosters_desde_historial
    from sheets_service import sincronizar_desde_sheets_hacia_local, probar_conexion
except ImportError as error_importacion:
    print(f"[ERROR] No se pudieron cargar los módulos del sistema: {error_importacion}")
    print("Asegúrate de ejecutar este script con el entorno virtual (venv) activado.")
    sys.exit(1)


def ejecutar_alineacion():
    print("=" * 65)
    print("   SINCRONIZANDO BASE LOCAL CON HOJA LIMPIA DE GOOGLE SHEETS")
    print("=" * 65)

    # 1. Asegurar estructura de SQLite local
    print("\n[Paso 1/3] Verificando base de datos local SQLite...")
    try:
        inicializar_bd()
        print(" -> Base de datos local verificada.")
    except Exception as e_bd:
        print(f" -> Aviso en inicialización: {e_bd}")

    # 2. Verificar conexión con Google Sheets
    print("\n[Paso 2/3] Comprobando conexión con Google Sheets...")
    conexion = probar_conexion()
    if not conexion.get("exito"):
        print(f" -> Error de comunicación: {conexion.get('error')}")
        print(" -> Abortando alineación para proteger la base local.")
        return

    print(f" -> Conexión exitosa con: '{conexion.get('libro_titulo')}'")

    # 3. Descargar filas de Sheets y purgar registros locales eliminados
    print("\n[Paso 3/3] Descargando registros vigentes y purgando duplicados locales...")
    resultado = sincronizar_desde_sheets_hacia_local()

    if resultado.get("exito"):
        insertados = resultado.get("insertados", 0)
        actualizados = resultado.get("actualizados", 0)
        purgados = resultado.get("eliminados", 0)
        total_hoja = resultado.get("total", 0)

        print("\n -> ¡Sincronización completada con éxito!")
        print(f"    - Registros vigentes en Google Sheets: {total_hoja}")
        print(f"    - Registros locales actualizados:     {actualizados}")
        print(f"    - Registros locales insertados:       {insertados}")
        print(f"    - Duplicados/eliminados purgados:     {purgados}")
    else:
        print(f" -> Ocurrió un error al sincronizar: {resultado.get('error')}")

    # 4. Reconstruir turnos de Roster en memoria local
    try:
        reconstruir_rosters_desde_historial()
        print(" -> Turnos de Roster locales reconstruidos y validados.")
    except Exception as e_rec:
        print(f" -> Aviso al reconstruir turnos de roster: {e_rec}")

    print("\n" + "=" * 65)
    print("   BASE LOCAL ALINEADA: LISTO PARA INICIAR LA APLICACIÓN")
    print("=" * 65)


if __name__ == "__main__":
    ejecutar_alineacion()