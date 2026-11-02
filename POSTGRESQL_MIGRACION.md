# Persistencia PostgreSQL — versión 2.0.0

La aplicación de escritorio conserva `window.pywebview.api` y las firmas públicas anteriores. `backend/main.py` usa `postgres_bridge.ApiPuente`; `database.py` es una fachada sin SQLite. Google Sheets, sus credenciales y sus hilos de sincronización salen del flujo operativo y del empaquetado.

`postgres_db.py` carga `DATABASE_URL` desde el entorno o desde `.env` junto al proyecto/ejecutable. `PG_POOL_MIN` y `PG_POOL_MAX` limitan el pool. Cada operación devuelve su conexión; las escrituras confirman o revierten y las lecturas terminan mediante rollback. `.env.example` no contiene credenciales. El archivo `.env` debe configurarse por instalación y no se incorpora al ejecutable.

La introspección real confirmó `a_1_usuarios.nombre/apellido/correo` y `b_1_proyectos_servicios.codificacion_serv`. El adaptador admite también los nombres del esquema adjunto, seleccionando únicamente expresiones predefinidas después de consultar metadatos. No crea columnas, roles ni tablas al arrancar. Los permisos provienen exclusivamente de `rol_app`; el usuario agregó esa columna durante la migración. Si falta, las operaciones administrativas se deniegan. Los catálogos sin columna `area` se muestran sin inventar filtros por área.

Los turnos individuales y múltiples escriben exclusivamente `app_rrhh.b_1_roster`. PostgreSQL selecciona la tarifa, calcula `total_viaticos` y genera asistencias. El lote es atómico, rechaza superposiciones y serializa escrituras de roster para evitar carreras. Las consultas usan la referencia histórica `r.id_tarifa`. Los precios que envía el cliente no se usan para calcular importes.

Las asistencias traducen estado, modalidad y clasificación; aceptan Vacaciones/Licencia en Oficina u Obra, con costo automático o un costo manual explícito, incluido cero. El operador se obtiene de la sesión revalidada. El modo automático omite `costo_dia` del INSERT. Las columnas generadas y liquidaciones no se escriben desde Python.

La tarjeta mensual consulta `a_1_calculo_sueldo` y sus adicionales en una sola instantánea. TanStack Query gestiona esa consulta. El formulario y calendario existentes permanecen en JSX; la tarjeta y sus contratos nuevos usan TypeScript estricto. La selección parcial de días no modifica el total mensual. La exportación vuelve a consultar PostgreSQL e ignora totales enviados por React.

El Gantt suma los viáticos de turnos completos que intersectan el mes: no prorratea bloques que cruzan meses. La exportación de roster lista esos mismos bloques y sus importes, sin reconstruir quincenas ni multiplicar tarifas. Bajada corresponde al último día de Campo y Subida al último día de Franco.

Las eliminaciones están bloqueadas por decisión del usuario mientras las tablas no tengan borrado lógico. El esquema actual tampoco ofrece almacenamiento de avatares, motivos/tipos de licencia, instrumental ni auditoría histórica de modificaciones. Esas capacidades no se simulan como persistidas; la sesión de escritorio vive en memoria y requiere ingreso al reiniciar. Los datos históricos de los archivos SQLite y de Sheets no se importaron a PostgreSQL.

Las pruebas de integración detectaron una reentrada del trigger de liquidación que restauraba el costo de Obra durante una inserción de Oficina. `backend/sql/002_corregir_prioridad_oficina.sql` se verificó primero en una base separada y se aplicó a la base operativa el 2026-10-26 con autorización explícita. La definición anterior está en `002_revertir_prioridad_oficina.sql`. No se modificaron registros operativos al aplicar esa función.

El entorno de pruebas es una base independiente en el mismo servidor, con acceso de PUBLIC revocado y estructura copiada sin datos operativos. `.env.test`, ignorado por Git, guarda la conexión. Las fixtures comprueban el nombre de la base y revierten los datos sintéticos. El procedimiento reproducible está en [.agents/skills/postgres-test-environment/SKILL.md](.agents/skills/postgres-test-environment/SKILL.md).

Validación: 45 pruebas pytest sobre PostgreSQL aislado, TypeScript estricto y compilación Vite a `backend/dist/`. La revisión de interfaz usa `frontend/tests/browser-harness.html` con datos sintéticos; Antigravity Browser no está disponible y se utilizó el navegador integrado. El harness no forma parte del bundle de producción.
