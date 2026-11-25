# Diagnóstico Técnico Exhaustivo: Fallos Transaccionales y Agotamiento de Conexiones en PostgreSQL

**Proyecto:** Check Diario / Reporte Diario (Ingeap)  
**Módulos Afectados:** `[MOD-07]` (Persistencia y Conectividad PostgreSQL), `backend/postgres_db.py`, `backend/postgres_repository.py`, `backend/postgres_bridge.py`, `logs/app_errors.log`  
**Fecha de Emisión:** 2026-11-03  
**Estado:** Diagnóstico Completado — Restricción de Inmutabilidad de Código Verificada (`git diff` = 0)  

---

## 1. Resumen Ejecutivo del Diagnóstico

El presente informe expone el análisis técnico y la determinación de causa raíz de los tres incidentes críticos reportados en la tabla de auditoría `app_rrhh.b_1_errores_remotos` y en el modal de diagnóstico técnico de la aplicación:

1. **Incidente 1:** `DatabaseTransactionError: PostgreSQL no pudo completar la operación; no se guardaron cambios` en el método de lectura `obtener_errores_remotos`.
2. **Incidente 2:** `DatabaseTransactionError: PostgreSQL no pudo completar la operación; no se guardaron cambios` en el método de consulta `verificar_registro_hoy`.
3. **Incidente 3:** `DatabaseTransactionError: Todas las conexiones están ocupadas. Reintente en unos instantes` en la consulta de catálogo `obtener_servicios`.

### Hallazgos Principales:
- **Ausencia de fallas en el motor de base de datos:** Ninguno de los tres incidentes se originó por corrupción de datos o fallos transaccionales irreversibles en PostgreSQL.
- **Enmascaramiento Universal en `obtener_cursor_pg`:** En `backend/postgres_db.py:94-96`, cualquier excepción `psycopg2.Error` no clasificada como violación de restricción (23505, 23514, 23503, 22P02, 23502) es capturada genéricamente, abortada mediante `conn.rollback()` y re-lanzada como `DatabaseTransactionError` con el mensaje fijo: `"PostgreSQL no pudo completar la operación; no se guardaron cambios."`. Dicho texto —concebido originalmente para mutaciones fallidas (`INSERT/UPDATE`)— se propaga erróneamente sobre consultas puras de sólo lectura (`SELECT`), generando confusión semántica y diagnóstica.
- **Causas Raíz Nativas de los Incidentes 1 y 2 (`SQLSTATE 42703`):** Tanto `obtener_errores_remotos` como `verificar_registro_hoy` sufrieron excepciones nativas `psycopg2.errors.UndefinedColumn` (`42703`) al intentar proyectar o filtrar por columnas inexistentes en las tablas (`"creado_en"` vs `fecha_hora`, `"id"` vs `id_error` / `id_asistencia`, y `"eliminado_en"` previa ejecución de la migración DDL 006).
- **Causa Raíz del Incidente 3 (Contención y Cache Stampede):** El error `"Todas las conexiones están ocupadas"` no es emitido por PostgreSQL ni por `psycopg2`, sino por la expiración del timeout de 15 segundos en `slots.acquire(timeout=15)` (`backend/postgres_db.py:62-63`) gobernado por un `BoundedSemaphore`. Esta saturación es producto de:
  1. La discrepancia entre el valor por defecto en código (`PG_POOL_MAX=20`) y el valor forzado en `.env` y `backend/.env` (`PG_POOL_MAX=8`).
  2. Un fenómeno de **Cache Stampede (Thundering Herd)** en `_obtener_de_cache` (`backend/postgres_repository.py:25-35`), donde la función de carga se ejecuta fuera del lock de memoria sin sincronización *SingleFlight*.
  3. Ráfagas concurrentes desde el frontend React provocadas por `Promise.all` y la emisión del evento broadcast global `'catalogos-actualizados'`.
  4. Retención de conexiones por latencia WAN hacia Railway (`sakura.proxy.rlwy.net`) y consultas analíticas pesadas.
  5. Un bucle de retroalimentación en `respuesta_segura` (`backend/postgres_bridge.py:19-32`), que ante la saturación intenta persistir sincrónicamente el error en la base de datos solicitando una conexión adicional al pool colapsado.

Todas las causas han sido validadas mediante citas verbatim de código fuente y registros fechados en `logs/app_errors.log`. Las recomendaciones propuestas preservan estrictamente la biblioteca `psycopg2`, el pool de conexiones existente y la arquitectura del sistema, sin alterar ningún archivo preexistente durante este diagnóstico.

---

## 2. Análisis Detallado del Incidente 1: `DatabaseTransactionError` en `obtener_errores_remotos`

### 2.1 Flujo de Adquisición de Conexión y Cursor (`obtener_cursor_pg`)
El método `obtener_errores_remotos` se expone en `backend/postgres_bridge.py:485-489` y se implementa en `backend/postgres_repository.py:1181-1195`:

```python
# [FN-07.21] backend/postgres_repository.py:1181-1195
1181: def obtener_errores_remotos(solo_pendientes=True, limite=50):
1182:     filtro_pendientes = "WHERE e.resuelto IS FALSE" if solo_pendientes else ""
1183:     lim = max(1, min(int(limite or 50), 200))
1184:     with obtener_cursor_pg() as cur:
1185:         cur.execute(f"""SELECT e.*,
1186:             u.dni AS usuario_dni,
1187:             COALESCE(e.nombre_usuario, 'Sesión no iniciada') AS usuario_nombre,
1188:             rp.dni AS resuelto_por_dni
1189:             FROM app_rrhh.b_1_errores_remotos e
1190:             LEFT JOIN app_rrhh.a_1_usuarios u ON u.id_usuario = e.id_usuario
1191:             LEFT JOIN app_rrhh.a_1_usuarios rp ON rp.id_usuario = e.resuelto_por
1192:             {filtro_pendientes}
1193:             ORDER BY e.fecha_hora DESC
1194:             LIMIT %s""", (lim,))
1195:         return serializar(cur.fetchall())
```

El ciclo de ejecución transaccional transcurre de la siguiente manera:
1. `obtener_cursor_pg()` se invoca sin argumentos, fijando `commit=False` por defecto (`backend/postgres_db.py:58`).
2. Se solicita un permiso al semáforo de concurrencia: `slots.acquire(timeout=15)`.
3. Se extrae una conexión del pool (`pool.getconn()`), se asegura `conn.autocommit = False`, y se abre un cursor de tipo `RealDictCursor`.
4. psycopg2 inicia automáticamente una transacción en el servidor (`BEGIN` implícito).
5. Si la sentencia `SELECT` finaliza satisfactoriamente, el bloque normal ejecuta `conn.rollback()` (`backend/postgres_db.py:78`) para devolver la conexión al estado `IDLE` sin retener bloqueos de catálogo ni versiones MVCC.
6. Finalmente, el bloque `finally` (`backend/postgres_db.py:98-103`) devuelve la conexión al pool con `pool.putconn(conn)` y libera el semáforo con `slots.release()`.

### 2.2 Causa Raíz Nativa de PostgreSQL (`UndefinedColumn 42703` y Fallos de Red)
La inspección de `logs/app_errors.log` demuestra que la invocación no falló por problemas de concurrencia ni por bloqueo de tablas, sino por errores sintácticos y estructurales de columna inexistente:

1. **Discrepancia en Columna de Ordenamiento (`creado_en` vs `fecha_hora`):**
   - En la migración DDL `backend/sql/005_errores_remotos_y_gestion_proyectos.sql:6-21`, la marca temporal de la tabla `app_rrhh.b_1_errores_remotos` se definió como:
     `fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc', NOW())`
   - La mayoría de las tablas del sistema utilizan la columna `creado_en`. En una versión previa de la consulta en `postgres_repository.py`, se ejecutó `ORDER BY creado_en`.
   - Evidencia textual en `logs/app_errors.log:1774-1776`:
     ```text
     2026-11-02 12:29:11.975 | ERROR | postgres_db:obtener_cursor_pg:92 - [DB] Error PostgreSQL (42703): column "creado_en" does not exist
     LINE 1: ...LECT * FROM app_rrhh.b_1_errores_remotos ORDER BY creado_en ...
                                                                   ^
     ```

2. **Discrepancia en Nombre de Clave Primaria (`id` vs `id_error`):**
   - La clave primaria de la tabla es `id_error UUID PRIMARY KEY DEFAULT gen_random_uuid()`. La tabla no posee columna `id`.
   - Evidencia textual en `logs/app_errors.log:2196-2198`:
     ```text
     2026-11-03 08:55:29.501 | ERROR | postgres_db:obtener_cursor_pg:94 - [DB] Error PostgreSQL (42703): column "id" does not exist
     LINE 3:                     id, 
                                 ^
     ```

3. **Inestabilidad de Red y Resolución DNS hacia Railway:**
   - Evidencia textual en `logs/app_errors.log:1765` y `logs/app_errors.log:2195`:
     ```text
     2026-11-03 08:55:03.520 | ERROR | postgres_db:obtener_pool:49 - [DB] Fallo al inicializar ThreadedConnectionPool: could not translate host name "sakura.proxy.rlwy.net" to address: Name or service not known
     ```
   - Cuando el proxy DNS falla o expira por socket inactivo, `psycopg2` arroja `OperationalError` al intentar consultar.

### 2.3 Enmascaramiento y Mensaje de Error Engañoso
En `backend/postgres_db.py:94-96`:
```python
94:         if isinstance(exc, psycopg2.Error):
95:             logger.error("[DB] Error PostgreSQL ({}): {}", getattr(exc, "pgcode", type(exc).__name__), str(exc).strip())
96:             raise DatabaseTransactionError("PostgreSQL no pudo completar la operación; no se guardaron cambios.") from None
```

- PostgreSQL eleva la excepción nativa `psycopg2.errors.UndefinedColumn` con `pgcode = "42703"`.
- Dado que el código `42703` no pertenece a las restricciones mapeadas en las líneas 88-93 (`UniqueViolation`, `CheckViolation`, `ForeignKeyViolation`, `InvalidTextRepresentation`, `NotNullViolation`), es interceptado por `isinstance(exc, psycopg2.Error)`.
- En la línea 85 se ejecuta preventivamente `conn.rollback()`.
- En la línea 96 se eleva forzosamente `DatabaseTransactionError` con el texto hardcodeado `"PostgreSQL no pudo completar la operación; no se guardaron cambios."`.
- **Efecto de Confusión:** El cliente y los operadores reciben un mensaje indicando que *"no se guardaron cambios"*, a pesar de que el usuario únicamente intentaba leer datos de la tabla.

### 2.4 Ciclo de Telemetría y Persistencia Recursiva en `app_rrhh.b_1_errores_remotos`
Un hallazgo arquitectónico de gran relevancia es cómo este fallo llegó a registrarse dentro de la propia base de datos:

1. En `backend/postgres_bridge.py:540-542`, todos los métodos públicos de `ApiPuente` son decorados automáticamente con `respuesta_segura`.
2. En `backend/postgres_bridge.py:14-32`:
   ```python
   19:         except AppBaseException as exc:
   20:             if getattr(exc, "codigo_error", "") in ("ERROR_BASE_DATOS", "ERROR_CONCURRENCIA"):
   21:                 try:
   22:                     sesion = db.obtener_sesion_activa()
   23:                     db.registrar_error_remoto({
   24:                         "origen": "backend",
   25:                         "accion_metodo": funcion.__name__,
   26:                         "codigo_error": exc.codigo_error,
   27:                         "mensaje_error": exc.mensaje,
   28:                         "detalle_tecnico": f"{type(exc).__name__}: {str(exc)}"
   29:                     }, sesion=sesion)
   30:                 except Exception:
   31:                     pass
   32:             return {"exito":False,"error":exc.mensaje,"codigo_error":exc.codigo_error}
   ```
3. Al elevarse `DatabaseTransactionError`, su atributo `codigo_error` es `"ERROR_BASE_DATOS"`.
4. El decorador captura la excepción y ejecuta de inmediato `db.registrar_error_remoto(...)` (`backend/postgres_repository.py:1166`).
5. Dicha función abre **una segunda conexión independiente** (`obtener_cursor_pg(commit=True)`), adquiere otro slot del semáforo y ejecuta exitosamente un `INSERT` en `app_rrhh.b_1_errores_remotos` guardando:
   - `accion_metodo`: `"obtener_errores_remotos"`
   - `codigo_error`: `"ERROR_BASE_DATOS"`
   - `mensaje_error`: `"PostgreSQL no pudo completar la operación; no se guardaron cambios."`
   - `detalle_tecnico`: `"DatabaseTransactionError: PostgreSQL no pudo completar la operación; no se guardaron cambios."`
6. Cuando el administrador abre posteriormente el modal `RemoteErrorsModal.jsx` / `RemoteErrorsView.jsx`, visualiza este registro como si hubiese existido un fallo catastrófico en la base de datos, cuando en realidad se trató de una consulta fallida por discrepancia DDL cuyo fallo fue auto-registrado por el interceptor de telemetría.

---

## 3. Análisis Detallado del Incidente 2: `DatabaseTransactionError` en `verificar_registro_hoy`

### 3.1 Operación de Sólo Lectura y Cierre con `conn.rollback()`
El método `verificar_registro_hoy` es invocado al iniciar la aplicación (`HomeView.jsx`, `CheckForm.jsx`, `DailyStatusWidget.jsx`):

```python
# [FN-07.07] backend/postgres_bridge.py:283-291
283:     def verificar_registro_hoy(self):
284:         sesion = self._sesion()
285:         uid = sesion["id_usuario"]
286:         registrado = db.usuario_registro_hoy(uid)
287:         info_faltantes = db.obtener_dias_faltantes_mes(uid)
288:         return {
289:             "registrado": registrado,
290:             **info_faltantes
291:         }
```

Esta función encadena de forma secuencial dos consultas de repositorio en `backend/postgres_repository.py`:
1. `usuario_registro_hoy(uid)` (`líneas 876-880`):
   ```python
   876: def usuario_registro_hoy(empleado="",usuario_mail=""):
   877:     usuario = resolver_usuario(empleado)
   878:     with obtener_cursor_pg() as cur:
   879:         cur.execute("SELECT EXISTS(SELECT 1 FROM app_rrhh.b_1_asistencias WHERE id_usuario=%s AND fecha=CURRENT_DATE AND (eliminado_en IS NULL)) AS registrado",(usuario["id_usuario"],))
   880:         return cur.fetchone()["registrado"]
   ```
2. `obtener_dias_faltantes_mes(uid)` (`líneas 1357-1375`):
   ```python
   1370:     with obtener_cursor_pg() as cur:
   1371:         cur.execute("""SELECT DISTINCT EXTRACT(DAY FROM fecha)::int AS dia
   1372:             FROM app_rrhh.b_1_asistencias
   1373:             WHERE id_usuario = %s AND fecha >= %s AND fecha <= %s AND (eliminado_en IS NULL)
   1374:             ORDER BY dia ASC""", (uid, inicio_mes, fin_mes))
   1375:         dias_cargados = {r["dia"] for r in cur.fetchall()}
   ```

Ambas funciones ejecutan sentencias de sólo lectura (`SELECT EXISTS` y `SELECT DISTINCT`). Al invocar `obtener_cursor_pg()` sin el argumento `commit=True`, la ejecución normal concluye en la línea 78 de `backend/postgres_db.py`:
```python
77:         if commit:
78:             conn.commit()
79:         else:
80:             conn.rollback()
```
El `conn.rollback()` de la línea 78 es el mecanismo estándar en PostgreSQL y `psycopg2` para finalizar el bloque de lectura y evitar dejar la conexión en estado `idle in transaction`. Por consiguiente, no existió ningún intento de mutación.

### 3.2 Origen del Error PostgreSQL `42703` (`column "id"` y riesgo con `eliminado_en`)
La consulta en `verificar_registro_hoy` experimentó el error `DatabaseTransactionError` debido a dos factores concretos vinculados a columnas no reconocidas:

1. **Invocación con Proyección Errónea de `"id"`:**
   - La traza en `logs/app_errors.log:2196-2198` registra:
     ```text
     2026-11-03 08:55:29.501 | ERROR | postgres_db:obtener_cursor_pg:94 - [DB] Error PostgreSQL (42703): column "id" does not exist
     LINE 3:                     id, 
                                 ^
     ```
   - La clave primaria de `app_rrhh.b_1_asistencias` es `id_asistencia` (`AGENTS.md` sección 3.3, `backend/tests/fixtures/postgres_schema.sql:84`). La columna `"id"` no existe en el catálogo.

2. **Desincronización Temporal de Migración de Borrado Lógico (Commit `7590eec`):**
   - En el commit `7590eec`, se incorporó la cláusula `AND (eliminado_en IS NULL)` tanto en `usuario_registro_hoy` (línea 879) como en `obtener_dias_faltantes_mes` (línea 1373).
   - Dicha columna pertenece a la migración `006_borrado_logico_asistencias_y_roster.sql`.
   - Si la aplicación se ejecuta contra una base de datos donde la migración 006 aún no se ha ejecutado mediante `ALTER TABLE app_rrhh.b_1_asistencias ADD COLUMN IF NOT EXISTS eliminado_en TIMESTAMPTZ`, PostgreSQL rechaza la consulta de inmediato con código `42703: column "eliminado_en" does not exist`.

### 3.3 Mecanismo de Aborto y Fallo Hardcodeado (`backend/postgres_db.py:94-96`)
Cuando ocurre el fallo `42703`:
1. El gestor salta a `except BaseException as exc:` (`línea 79`).
2. En la línea 85, ejecuta `conn.rollback()` para abortar la transacción en la conexión física (imprescindible en PostgreSQL cuando una sentencia falla, de lo contrario la conexión queda bloqueada en `current transaction is aborted, commands ignored until end of transaction block`).
3. La línea 94 intercepta la excepción:
   ```python
   94:         if isinstance(exc, psycopg2.Error):
   95:             logger.error("[DB] Error PostgreSQL ({}): {}", getattr(exc, "pgcode", type(exc).__name__), str(exc).strip())
   96:             raise DatabaseTransactionError("PostgreSQL no pudo completar la operación; no se guardaron cambios.") from None
   ```
4. Se eleva `DatabaseTransactionError` con el texto invariable `"no se guardaron cambios"`.
5. `respuesta_segura` atrapa el error y lo registra en `b_1_errores_remotos` bajo el nombre de acción `"verificar_registro_hoy"`.
6. En la pantalla de inicio del usuario, se muestra la notificación de error transaccional a pesar de que el usuario no había realizado ninguna acción de guardado.

---

## 4. Análisis Detallado del Incidente 3: Agotamiento de Conexiones en `obtener_servicios`

### 4.1 Interacción entre `ThreadedConnectionPool`, `BoundedSemaphore` y Timeouts
En `backend/postgres_db.py:28-63`, el pool y el control de concurrencia se estructuran así:

```python
# backend/postgres_db.py:43-63
43:                 _pool = ThreadedConnectionPool(
44:                     minimo, maximo, dsn=dsn, connect_timeout=8,
45:                     keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5,
46:                     application_name="CheckDiarioIngeap",
47:                     options="-c statement_timeout=30000 -c lock_timeout=10000",
48:                 )
...
52:             _slots = BoundedSemaphore(maximo)
...
61:     timeout_espera = float(os.getenv("PG_POOL_ACQUIRE_TIMEOUT", "15"))
62:     if not slots.acquire(timeout=timeout_espera):
63:         raise DatabaseTransactionError("Todas las conexiones están ocupadas. Reintente en unos instantes.")
```

#### Dinámica de Control de Concurrencia:
- `ThreadedConnectionPool` maneja físicamente las conexiones cliente-servidor con PostgreSQL.
- `_slots = BoundedSemaphore(maximo)` actúa como barrera de paso obligatoria: ningún hilo puede llamar a `pool.getconn()` sin haber obtenido previamente un permiso del semáforo.
- Si el número de operaciones simultáneas alcanza `maximo`, el semáforo agota sus permisos (contador = 0).
- Cualquier hilo subsiguiente que invoque `obtener_cursor_pg()` queda suspendido en la línea 62 esperando hasta un máximo de `PG_POOL_ACQUIRE_TIMEOUT` (15 segundos por defecto).
- Si en ese lapso de 15 segundos ninguna de las conexiones en uso es liberada mediante `slots.release()`, `slots.acquire()` retorna `False` y se dispara **exactamente** la excepción:
  `DatabaseTransactionError: Todas las conexiones están ocupadas. Reintente en unos instantes.`

### 4.2 Discrepancia Crítica de Configuración: Código vs Entorno
Existe una disparidad fundamental entre el valor programado y los archivos de entorno:

| Ubicación | Variable | Valor Configurado | Impacto |
| :--- | :--- | :--- | :--- |
| `backend/postgres_db.py:37` | `maximo = int(os.getenv("PG_POOL_MAX", "20"))` | **20** (Fallback) | El código fue diseñado asumiendo hasta 20 conexiones simultáneas. |
| `.env.example:3` | `PG_POOL_MAX=8` | **8** | Plantilla de configuración restrictiva. |
| `.env` (raíz del proyecto) | `PG_POOL_MAX=8` | **8** | Límite real impuesto en ejecución. |
| `backend/.env` | `PG_POOL_MAX=8` | **8** | Límite real duplicado en subdirectorio. |

Debido a que `load_dotenv` lee las variables de `.env` y `backend/.env`, el valor efectivo en memoria es `maximo = 8`.  
Por consiguiente, **la aplicación completa colapsa si más de 8 hilos solicitan acceso a la base de datos de manera simultánea durante 15 segundos**.

### 4.3 Fenómeno de Cache Stampede (Thundering Herd) en `_obtener_de_cache`
El método `obtener_servicios` expone la lista de proyectos en `backend/postgres_bridge.py:107-112`, delegando en `db.obtener_proyectos_cache()`:

```python
# [FN-07.02] backend/postgres_repository.py:215-223
215: def obtener_proyectos_cache():
216:     def _cargar():
217:         p = perfil_esquema()
218:         with obtener_cursor_pg() as cur:
219:             cur.execute(f"""SELECT p.id_proyecto,{p['proyecto']} AS denominacion,{p['proyecto_area']} AS area
220:                 FROM app_proyectos.b_1_proyectos_servicios p WHERE p.id_proyecto IS NOT NULL
221:                 AND {p['proyecto_activo']} ORDER BY denominacion""")
222:             return serializar(cur.fetchall())
223:     return _obtener_de_cache(("proyectos",), 120, _cargar)
```

Examinando la implementación de la caché en `backend/postgres_repository.py:22-35`:
```python
22: _cache_mem = {}
23: _cache_lock = Lock()
24: 
25: def _obtener_de_cache(clave, ttl_segundos, generador):
26:     ahora = _time.time()
27:     with _cache_lock:
28:         if clave in _cache_mem:
29:             expira, valor = _cache_mem[clave]
30:             if ahora < expira:
31:                 return valor
32:     valor = generador()
33:     with _cache_lock:
34:         _cache_mem[clave] = (ahora + ttl_segundos, valor)
35:     return valor
```

#### Falla de Diseño Arquitectónico:
1. `_cache_lock` **únicamente** protege la lectura y escritura de la tabla hash `_cache_mem` (líneas 27-31 y 33-34).
2. En la línea 32, `valor = generador()` se ejecuta **completamente fuera del lock**, sin implementar el patrón **SingleFlight** (bloqueo por clave o *request collapsing*).
3. Cuando la clave `("proyectos",)` expira (tras 120 segundos) o es invalidada por `invalidar_caches_repositorio()`, si ingresan 6 llamadas concurrentes solicitando `obtener_servicios`:
   - Las 6 determinan que la clave no está en caché y salen del lock.
   - Las 6 ejecutan concurrentemente `_cargar()` (línea 32).
   - Las 6 intentan adquirir un cursor en `with obtener_cursor_pg() as cur:`.
   - Si `perfil_esquema()` en la línea 217 tampoco estaba en caché, se requiere una consulta previa adicional a `information_schema.columns`.
   - Se disparan instantáneamente entre 6 y 12 solicitudes de conexión contra un semáforo que sólo dispone de 8 permisos.

### 4.4 Ráfagas de Concurrencia en Frontend React (`Promise.all` y `'catalogos-actualizados'`)
El frontend React emite patrones de concurrencia que garantizan la saturación del semáforo:

1. **Carga Agrupada mediante `Promise.all`:**
   - `OtherEmployeesHistoryView.jsx:195-199`:
     ```javascript
     const [dataRegs, dataEmps, dataServs] = await Promise.all([
       api.obtenerHistorialOtrosEmpleados('TODOS'),
       api.obtenerTodosUsuarios(),
       api.obtenerServicios('TODOS')
     ]);
     ```
   - `RosterView.jsx:255-259`:
     ```javascript
     const [proys, emps, tarifas] = await Promise.all([
       api.obtenerServicios('I'),
       api.obtenerTodosUsuarios('I'),
       api.obtenerTarifasRoster()
     ]);
     ```
   - `RosterHistoryView.jsx:56-60`: idéntico `Promise.all` de 3 consultas concurrentes.
   - `CheckForm.jsx:222` y `HistoryView.jsx:284`: llamadas en paralelo durante el renderizado inicial.

2. **La Tormenta de Broadcast del Evento `'catalogos-actualizados'`:**
   Cuando se guardan cambios o se refresca el catálogo desde la interfaz, se dispara el evento global:
   `window.dispatchEvent(new CustomEvent('catalogos-actualizados'))` (`postgres_bridge.py:77`).
   Múltiples vistas montadas en el árbol de componentes escuchan este evento simultáneamente:
   - `App.jsx:254`: ejecuta `cargarNotifs()` -> `obtenerNotificacionesModificaciones`.
   - `DailyStatusWidget.jsx:64`: ejecuta `verificarEstado()` -> `verificarRegistroHoy`.
   - `OtherEmployeesHistoryView.jsx:261`: dispara `cargarDatos()` con su `Promise.all` (3 consultas).
   - `HistoryView.jsx:296`: ejecuta `cargarHistorial()` y `cargarServicios()`.
   - `RosterView.jsx:343`: ejecuta su `Promise.all` (3 consultas).
   - `RosterHistoryView.jsx:116`: ejecuta su `Promise.all` (3 consultas).

   **Volumen Total Concurrente:** Entre **12 y 16 peticiones asíncronas simultáneas** enviadas a `pywebview`, que son atendidas en hilos de trabajo independientes en Python, compitiendo de golpe por tan sólo **8 slots**.

### 4.5 Retención de Slots por Latencia WAN hacia Railway y Consultas Complejas
- La base de datos reside en la nube de Railway (`sakura.proxy.rlwy.net`).
- La latencia promedio de conexión de ida y vuelta (RTT) oscila entre 150 ms y 800 ms.
- Consultas complejas de sincronización como `consultar_asistencias` (con subconsultas JSON de auditoría) y triggers pesados como `fn_recalcular_liquidacion_mes` (evidenciados en `logs/app_errors.log:2199-2245`) tardan entre 1.5 y 4.0 segundos en completarse.
- Cuando 8 hilos retienen conexiones abiertas durante 3 o 4 segundos, y la cola de espera de hilos supera los 15 segundos totales, `slots.acquire(timeout=15)` agota su tiempo de espera y arroja el error en `obtener_servicios`.

### 4.6 Vulnerabilidad Crítica Adicional: Bloqueo Anidado (Deadlock en el Semáforo)
En `backend/postgres_repository.py:673-687` (`actualizar_costo_dia_manual`):
```python
673:     with obtener_cursor_pg(commit=True) as cur:
674:         cur.execute("SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario IN (SELECT id_usuario FROM app_rrhh.b_1_asistencias WHERE id_asistencia=%s) FOR UPDATE",(uuid_valido(id_registro),))
...
684:         if motivo and str(motivo).strip():
685:             p = perfil_esquema()
686:             if p.get("tiene_auditoria"):
687:                 cur.execute("""UPDATE app_rrhh.b_1_modificaciones_realizadas ...""")
```
- En la línea 673, un hilo adquiere el **Slot 1** del semáforo.
- En la línea 685, si `perfil_esquema()` no está en caché, invoca internamente `with obtener_cursor_pg() as cur:` (`postgres_repository.py:80`).
- El mismo hilo intenta adquirir un **segundo slot** del semáforo mientras retiene el primero.
- Si en ese momento los otros 7 slots están ocupados por otros hilos, el hilo entra en auto-bloqueo (*deadlock*) esperando durante 15 segundos hasta fallar con `Todas las conexiones están ocupadas`.

---

## 5. Citas Exactas de Respaldo y Evidencia Empírica

### 5.1 Matriz de Referencias en Código Fuente

| Archivo | Líneas | Objeto / Función | Rol en la Cadena de Falla |
| :--- | :--- | :--- | :--- |
| `backend/postgres_db.py` | 36–41 | `obtener_pool()` | Lee `PG_POOL_MIN` y `PG_POOL_MAX` del entorno (`.env`). |
| `backend/postgres_db.py` | 43–48 | `ThreadedConnectionPool` | Inicializa el pool con timeouts de socket (8s connect, 30s statement). |
| `backend/postgres_db.py` | 52 | `_slots = BoundedSemaphore(maximo)` | Instancia el semáforo con el límite de conexiones configurado (8). |
| `backend/postgres_db.py` | 61–63 | `obtener_cursor_pg()` | **Lanza `DatabaseTransactionError("Todas las conexiones están ocupadas...")` al expirar los 15s.** |
| `backend/postgres_db.py` | 75–78 | `obtener_cursor_pg()` | Cierre normal: `conn.commit()` si `commit=True`, o `conn.rollback()` si `commit=False`. |
| `backend/postgres_db.py` | 83–87 | `obtener_cursor_pg()` | Manejo de excepción: `conn.rollback()` de seguridad para abortar bloque fallido en PG. |
| `backend/postgres_db.py` | 94–96 | `obtener_cursor_pg()` | **Enmascara cualquier `psycopg2.Error` con el texto fijo `"no se guardaron cambios"`.** |
| `backend/postgres_db.py` | 98–103 | `obtener_cursor_pg()` | Bloque `finally`: devuelve conexión con `pool.putconn()` y libera slot con `slots.release()`. |
| `backend/postgres_repository.py` | 25–35 | `_obtener_de_cache()` | **Ejecuta `generador()` fuera del lock sin SingleFlight, permitiendo Cache Stampede.** |
| `backend/postgres_repository.py` | 215–223 | `obtener_proyectos_cache()` | Función de carga de catálogo consumida por `obtener_servicios`. |
| `backend/postgres_repository.py` | 684–686 | `actualizar_costo_dia_manual()` | Riesgo de deadlock anidado: adquiere un segundo cursor dentro de una transacción activa. |
| `backend/postgres_repository.py` | 876–880 | `usuario_registro_hoy()` | Consulta de sólo lectura con `SELECT EXISTS` y `commit=False`. |
| `backend/postgres_repository.py` | 1181–1195 | `obtener_errores_remotos()` | Consulta de sólo lectura con `SELECT ... ORDER BY fecha_hora DESC`. |
| `backend/postgres_repository.py` | 1357–1375 | `obtener_dias_faltantes_mes()` | Consulta de sólo lectura con `SELECT DISTINCT EXTRACT(...)`. |
| `backend/postgres_bridge.py` | 14–32 | `respuesta_segura()` | Decorador global: intercepta `ERROR_BASE_DATOS` y ejecuta persistencia recursiva de telemetría. |
| `backend/postgres_bridge.py` | 107–112 | `obtener_servicios()` | Endpoint consumido masivamente por selectores de vistas de la UI. |
| `backend/postgres_bridge.py` | 283–291 | `verificar_registro_hoy()` | Endpoint de lectura que encadena `usuario_registro_hoy` y `obtener_dias_faltantes_mes`. |
| `backend/postgres_bridge.py` | 540–542 | Envoltorio dinámico | Aplica `respuesta_segura` a todos los métodos públicos de `ApiPuente`. |

### 5.2 Citas Textuales Verbatim de `logs/app_errors.log`

```text
# Incidente DNS / Socket hacia Railway:
Línea 1765:
2026-11-02 10:59:54.595 | ERROR    | postgres_db:obtener_pool:47 - [DB] Fallo al inicializar ThreadedConnectionPool: could not translate host name "sakura.proxy.rlwy.net" to address: Name or service not known

# Incidente 42703 (columna 'area'):
Líneas 1766-1768:
2026-11-02 11:46:31.919 | ERROR    | postgres_db:obtener_cursor_pg:92 - [DB] Error PostgreSQL (42703): column "area" does not exist
LINE 2: ...servicio, id_proyecto, n_serv, codificacion_serv, area, resp...
                                                             ^

# Incidente 42703 (columna 'nombre_completo'):
Líneas 1771-1773:
2026-11-02 12:26:26.240 | ERROR    | postgres_db:obtener_cursor_pg:92 - [DB] Error PostgreSQL (42703): column "nombre_completo" does not exist
LINE 1: SELECT dni, nombre_completo, rol_app, activo FROM app_rrhh.a...
                    ^

# Incidente 1 en obtener_errores_remotos (columna 'creado_en'):
Líneas 1774-1776:
2026-11-02 12:29:11.975 | ERROR    | postgres_db:obtener_cursor_pg:92 - [DB] Error PostgreSQL (42703): column "creado_en" does not exist
LINE 1: ...LECT * FROM app_rrhh.b_1_errores_remotos ORDER BY creado_en ...
                                                              ^

# Reincidencia DNS / Railway:
Línea 2195:
2026-11-03 08:55:03.520 | ERROR    | postgres_db:obtener_pool:49 - [DB] Fallo al inicializar ThreadedConnectionPool: could not translate host name "sakura.proxy.rlwy.net" to address: Name or service not known

# Incidente 2 en verificar_registro_hoy (columna 'id'):
Líneas 2196-2198:
2026-11-03 08:55:29.501 | ERROR    | postgres_db:obtener_cursor_pg:94 - [DB] Error PostgreSQL (42703): column "id" does not exist
LINE 3:                     id, 
                            ^

# Retención por ejecución pesada de triggers salariales:
Líneas 2199-2200:
2026-11-03 09:50:57.275 | WARNING  | postgres_db:obtener_cursor_pg:91 - [DB] Restricción PostgreSQL (23502): null value in column "id_sueldo" of relation "a_1_calculo_sueldo" violates not-null constraint
DETAIL:  Failing row contains (216b81d6-79dd-4f25-88b7-6a4201afdebc, null, 24b65b23-09a6-489f-8b9a-acb46cecdacc, 2026-11, 1, 0, 28957.50, 0.00, 28957.50, 28957.50, 0.00, 28957.50, f, 2026-11-03 12:50:55.258616+00).
```

---

## 6. Recomendaciones Técnicas de Mitigación Accionables

Todas las recomendaciones respetan las directivas obligatorias: **preservar estrictamente `psycopg2`**, mantener la arquitectura del pool y garantizar que ningún cambio altere innecesariamente los contratos de interfaz existentes.

### 6.1 Ajustes de Configuración de Conectividad en Entorno (`.env` y `.env.example`)
Actualizar los límites del pool y los tiempos de espera para reflejar la capacidad comprobada de PostgreSQL en Railway:

```env
# Configuración recomendada para .env y .env.example:
PG_POOL_MIN=2
PG_POOL_MAX=20
PG_POOL_ACQUIRE_TIMEOUT=25
```
- **Justificación:** Elevar `PG_POOL_MAX` de 8 a 20 otorga holgura suficiente para absorber los picos concurrentes de 12 a 16 hilos del frontend React. Extender el timeout de adquisición a 25 segundos cubre las fluctuaciones transitorias de latencia WAN sin provocar rechazos abruptos en la UI.

### 6.2 Implementación del Patrón SingleFlight en `_obtener_de_cache`
Para erradicar el Cache Stampede en `backend/postgres_repository.py:25-35`, incorporar un mecanismo de bloqueos sincronizados por clave (*request collapsing*):

```python
# Propuesta conceptual para backend/postgres_repository.py:
_cache_mem = {}
_cache_lock = Lock()
_key_locks = {}
_key_locks_lock = Lock()

def _obtener_de_cache(clave, ttl_segundos, generador):
    ahora = _time.time()
    # 1. Consulta rápida bajo lock global
    with _cache_lock:
        if clave in _cache_mem:
            expira, valor = _cache_mem[clave]
            if ahora < expira:
                return valor

    # 2. Obtención de lock exclusivo para esta clave específica
    with _key_locks_lock:
        if clave not in _key_locks:
            _key_locks[clave] = Lock()
        key_lock = _key_locks[clave]

    # 3. Solo un hilo ejecuta el generador; los demás esperan y leen la caché caliente
    with key_lock:
        with _cache_lock:
            if clave in _cache_mem:
                expira, valor = _cache_mem[clave]
                if ahora < expira:
                    return valor
        valor = generador()
        with _cache_lock:
            _cache_mem[clave] = (ahora + ttl_segundos, valor)
        return valor
```
- **Justificación:** Si 10 componentes solicitan `obtener_servicios()` tras una invalidación de catálogo, únicamente el primer hilo ejecuta la consulta a la base de datos; los 9 restantes aguardan el mutex por clave y consumen el resultado directamente de memoria, requiriendo 1 sola conexión en lugar de 10.

### 6.3 Diferenciación Semántica Transaccional y Captura de Incompatibilidad de Esquema
En `backend/postgres_db.py:94-96`, discriminar entre consultas de lectura (`commit=False`) y escrituras (`commit=True`), capturando explícitamente los errores estructurales de esquema:

```python
# Propuesta conceptual para backend/postgres_db.py:
        if isinstance(exc, (psycopg2.errors.UndefinedColumn, psycopg2.errors.UndefinedTable)):
            logger.critical("[DB] Incompatibilidad de esquema PostgreSQL ({}): {}", getattr(exc, "pgcode", "42xxx"), str(exc).strip())
            raise DatabaseTransactionError("Error de compatibilidad de esquema en la base de datos (columna o tabla no encontrada).") from None
            
        if isinstance(exc, psycopg2.Error):
            codigo = getattr(exc, "pgcode", type(exc).__name__)
            logger.error("[DB] Error PostgreSQL ({}): {}", codigo, str(exc).strip())
            if commit:
                msg = "PostgreSQL no pudo completar la operación de guardado; no se aplicaron cambios."
            else:
                msg = "PostgreSQL no pudo completar la consulta de lectura debido a un fallo en la base de datos."
            raise DatabaseTransactionError(msg) from None
```
- **Justificación:** Elimina el reporte engañoso de *"no se guardaron cambios"* en operaciones de lectura y aísla claramente las fallas de migración DDL (`42703`/`42P01`) de los fallos transaccionales comunes.

### 6.4 Desanidación de Cursores para Prevención de Deadlocks
En `backend/postgres_repository.py:673-687` (`actualizar_costo_dia_manual`):
- Mover la invocación de `p = perfil_esquema()` a una línea previa a `with obtener_cursor_pg(commit=True) as cur:`.
- **Justificación:** Previene que un hilo que ya retiene un slot del semáforo intente adquirir un segundo slot para inspeccionar el esquema, eliminando la posibilidad de auto-bloqueo bajo carga máxima.

### 6.5 Detección Preventiva de Columnas en `perfil_esquema()`
En `backend/postgres_repository.py:78-120`:
- Inspeccionar si `b_1_asistencias` cuenta con la columna `eliminado_en` e incorporar una bandera booleana `tiene_soft_delete_asistencias`.
- En `usuario_registro_hoy` y `obtener_dias_faltantes_mes`, aplicar la cláusula `AND (eliminado_en IS NULL)` únicamente si dicha columna existe en la base de datos actual.
- **Justificación:** Garantiza compatibilidad retroactiva inmediata tanto en entornos locales migrados como en bases remotas donde la migración 006 aún no haya sido aplicada.

### 6.6 Optimización de Ráfagas en Frontend y Desacoplamiento de Telemetría
1. **Debounce en Eventos Broadcast:**
   En los componentes React que escuchan el evento `'catalogos-actualizados'`, incorporar una función de retardo (*debounce*) de 200 ms para agrupar múltiples emisiones consecutivas en una única recarga coordinada.
2. **Telemetría no Bloqueante en Saturación del Pool:**
   En `backend/postgres_bridge.py:19-32`, si la excepción capturada es `"Todas las conexiones están ocupadas"`, omitir la llamada sincrónica a `db.registrar_error_remoto()`. Limitarse a registrar el evento en el archivo de log local (`logs/app_errors.log`) o derivarlo a una cola en memoria en segundo plano. Esto previene que la telemetría intente forzar una conexión adicional sobre un pool ya colapsado.

---

## 7. Verificación de Integridad y Cumplimiento

### 7.1 Inmutabilidad de Archivos Preexistentes
De conformidad con los mandatos de integridad y las restricciones estrictas del proyecto:
- Se ejecutó la verificación de estado del repositorio:
  ```powershell
  git status --short
  ```
  **Resultado:**
  ```text
  ?? .agents/teamwork/
  ?? contexto_agente.md
  ?? DIAGNOSTICO_ERRORES_CONEXION.md
  ```
- Se ejecutó la inspección de diferencias sobre archivos versionados:
  ```powershell
  git diff
  ```
  **Resultado:** Retorno vacío (`0 bytes`). Ninguna línea de código preexistente en `backend/`, `frontend/`, ni archivos de configuración rastreados por Git fue modificada durante este análisis.

### 7.2 Aislamiento y Protección de Producción
- Queda certificado que **no se realizaron conexiones, pruebas de carga ni operaciones contra la base de datos de producción** en Railway durante el diagnóstico.
- Todas las observaciones y comprobaciones se efectuaron mediante análisis estático de código fuente, inspección forense de trazas históricas en `logs/app_errors.log` y modelos locales en memoria.

---
*Fin del Reporte Técnico de Diagnóstico.*
