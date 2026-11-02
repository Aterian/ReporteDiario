---
name: postgres-test-environment
description: Crear o reutilizar la base PostgreSQL aislada de pruebas de Check Diario y verificar sus triggers sin copiar datos operativos. Usar al probar esta migración o una modificación de sus funciones SQL.
---

# Entorno PostgreSQL de Check Diario

Trabajar desde la raíz del repositorio. Reutilizar `.env.test` cuando exista; contiene secretos y está ignorado por Git. El entorno es una base separada en el mismo servidor, con acceso de PUBLIC revocado. No es una copia de sus registros ni un servidor PostgreSQL local.

Para crear un entorno nuevo autorizado, ejecutar:

```powershell
.\backend\venv\Scripts\python.exe backend/bootstrap_test_db.py
```

El script consulta metadatos con una transacción de solo lectura, crea `codex_check_diario_test_<sufijo>`, copia únicamente esquemas, enums, tablas, restricciones, índices, funciones y triggers, y aplica la corrección SQL de prioridad de Oficina en esa base. Guarda el DSN en `.env.test`; nunca mostrar ese valor. Requiere DATABASE_URL y permiso CREATEDB. No elimina ni reutiliza destructivamente bases existentes.

Ejecutar las pruebas:

```powershell
.\backend\venv\Scripts\python.exe -m pytest backend/tests -q --basetemp .pytest_tmp
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
```

`backend/tests/conftest.py` carga TEST_DATABASE_URL desde `.env.test`, exige el prefijo de base de pruebas y encapsula las operaciones en transacciones con savepoints y rollback final. No apuntar las fixtures a la base operativa ni desactivar triggers para hacer pasar pruebas. Si falla una regla salarial, revisar la definición real del trigger antes de cambiar Python: Python y React no deben calcular salarios o viáticos.

La copia de estructura de referencia está en `backend/tests/fixtures/postgres_schema.sql`. El correctivo y su reversión están en `backend/sql/002_corregir_prioridad_oficina.sql` y `002_revertir_prioridad_oficina.sql`. Para aplicar una corrección a una base operativa, verificar que la solicitud del usuario autoriza esa mutación concreta, comparar primero la función actual con la definición de origen y ejecutar el cambio en una transacción. Eliminar diferencias de saltos de línea de Windows al comparar; no ignorar cambios de tokens SQL. La autorización del 2026-10-26 cubrió la aplicación de esa corrección en esta sesión.

No purgar el entorno al terminar. Informar que la base de pruebas queda disponible; una eliminación posterior requiere autorización conforme a AGENTS.md.
