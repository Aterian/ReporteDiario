# 🤖 AGENTS.MD — Manual de Arquitectura, Contexto y Protocolos de Seguridad
**Proyecto:** Check Diario / Reporte Diario (Ingeap)  
**Arquitectura:** Aplicación Híbrida de Escritorio (Python `pywebview` + React 19 / Vite + PostgreSQL en Railway)

> **INSTRUCCIÓN CRÍTICA PARA AGENTES DE IA:**  
> Lee este documento completo antes de proponer planes de implementación, refactorizar código o modificar consultas de base de datos. Cualquier cambio debe respetar estrictamente los contratos de interfaz, la delegación de lógica en PostgreSQL y los protocolos de seguridad aquí definidos.

---

## 1. Visión General y Stack Tecnológico

El sistema **Check Diario (Ingeap)** gestiona el registro diario de asistencias, la planificación visual de turnos de obra (Calendario Gantt de Roster), la auditoría de modificaciones y la liquidación mensual de sueldos y viáticos del personal.

### Stack Activo
* **Frontend (`frontend/`):** React 19 empaquetado con Vite.
  * **Manejo de Errores y UI:** `react-error-boundary` para protección de vistas y `sonner` para notificaciones flotantes (*toasts*).
  * **Compilación:** El comando `npm run build` genera los archivos estáticos de producción directamente en `../backend/dist/`.
* **Backend (`backend/`):** Python 3.11+ con `pywebview` (motor WebView2 / Microsoft Edge en Windows).
  * **Controlador Puente:** La clase `ApiPuente` en `backend/main.py` expone los métodos hacia JavaScript a través de `window.pywebview.api`.
  * **Logging y Validación:** `loguru` (archivos rotativos en `logs/errores_sistema.log`), `pydantic` y el decorador `@manejar_errores_api` en `backend/error_handler.py`.
* **Base de Datos Principal:** PostgreSQL 14+ alojado en Railway.
  * **Conector:** `psycopg2` utilizando `ThreadedConnectionPool` y `RealDictCursor` a través del módulo `backend/postgres_db.py`.
* **Tecnologías Deprecadas (NO UTILIZAR):**
  * La sincronización con **Google Sheets** (`sheets_service.py`) y la base local **SQLite** (`database.py`) han sido reemplazadas por **PostgreSQL**. No reintroducir hilos de sincronización en segundo plano hacia hojas de cálculo.

---

## 2. Módulos y Funcionalidades del Sistema

### 2.1 Módulo de Asistencias Diarias (`CheckForm.jsx` / `b_1_asistencias`)
* Permite a los colaboradores y responsables registrar la jornada diaria indicando estado (`activo`, `franco`, `vacaciones`, `licencia`), modalidad (`oficina`, `obra`, `roster`), clasificación del día (`dia_normal`, `franco_trabajado`, `feriado_trabajado`), proyecto o área asignada y horas dedicadas.
* **Regla de RRHH para Vacaciones y Licencias:** El responsable de RRHH puede elegir si el registro de `vacaciones` o `licencia` se liquida como `oficina` o como `obra`, o bien activar `costo_manual = TRUE` para fijar un importe personalizado.

### 2.2 Módulo de Roster y Gantt de Ingeniería (`RosterView.jsx` / `b_1_roster`)
* Exclusivo para usuarios autorizados de RRHH/Administración. Gestiona los bloques de turnos de los colaboradores canónicos del área de Ingeniería (`I`).
* **Independencia Contable:** Los viáticos de Roster (`total_viaticos`) son **exclusivos para los reportes y la exportación a Excel** (3 hojas: Ciclo Completo, 1ra Quincena y 2da Quincena). **NUNCA** se suman al sueldo en `a_1_calculo_sueldo`.
* **Regla de Subida y Bajada:**
  * **Bajada (`⬇B`):** Corresponde al **último día de Campo** (`tipo_turno = 'activo'` y `fecha == fecha_fin`). Su monto reemplaza el valor de `dia_normal` / `dia_domingo` de ese día.
  * **Subida (`⬆S`):** Corresponde al **último día de Franco** (`tipo_turno = 'franco'` y `fecha == fecha_fin`). Su monto reemplaza el valor de ese día.

### 2.3 Módulo de Historial, Auditoría y Liquidación (`OtherEmployeesHistoryView.jsx`)
* Permite a RRHH auditar los registros de todos los empleados, revisar el historial de cambios en `b_1_modificaciones_realizadas` (marcando `revisado = TRUE`), cargar adicionales por fecha (`a_1_adicionales_sueldo`) y consultar la liquidación mensual en tiempo real (`a_1_calculo_sueldo`).

---

## 3. Esquema de Base de Datos PostgreSQL y Lógica Automatizada

> **REGLA DE ORO PARA EL BACKEND PYTHON:**  
> Gran parte de la lógica contable y de integridad reside dentro de PostgreSQL mediante **Columnas Generadas (`GENERATED ALWAYS AS ... STORED`)** y **Triggers**. Python **NO** debe recalcular sueldos por día, ni dividir por 30, ni desglosar días de Roster en bucles manuales.

### 3.1 Esquema `app_proyectos`
* **`app_proyectos.b_1_proyectos_servicios`**:
  * Columnas: `id_proyecto` (UUID PK/UNIQUE), `denominacion` (VARCHAR), `area` (VARCHAR), `activo` (BOOLEAN).

### 3.2 Esquema `app_rrhh` — Tipos ENUM
* `app_rrhh.tipo_lugar_habitual`: `'oficina'`, `'obra'`
* `app_rrhh.estado_asistencia`: `'activo'`, `'franco'`, `'vacaciones'`, `'licencia'`
* `app_rrhh.modalidad_lugar`: `'oficina'`, `'obra'`, `'roster'`
* `app_rrhh.clasificacion_dia`: `'dia_normal'`, `'franco_trabajado'`, `'feriado_trabajado'`
* `app_rrhh.tipo_dedicacion`: `'areas'`, `'proyectos'`
* `app_rrhh.tipo_operacion_auditoria`: `'MODIFICACION'`, `'ELIMINACION'`

### 3.3 Esquema `app_rrhh` — Tablas y Triggers Activos

1. **`a_1_usuarios`**:
   * `id_usuario` (UUID PK), `dni` (VARCHAR UNIQUE), `nombre_completo`, `email`, `area`, `rol_app`, `activo`, `creado_en`.

2. **`a_1_sueldos_base`** y **`a_1_historial_sueldos`**:
   * En `a_1_sueldos_base`, las columnas `dia_oficina` y `dia_obra` son **GENERADAS** automáticamente ($\text{sueldo} \div 30$). **Nunca** incluirlas en sentencias `INSERT` o `UPDATE`.
   * **Trigger `trg_guardar_historial_sueldo`:** Al actualizar `sueldo_oficina` o `sueldo_obra`, archiva automáticamente el registro anterior en `a_1_historial_sueldos`.

3. **`b_1_tarifas_roster`**:
   * Columnas: `id_tarifa` (UUID PK), `id_proyecto` (UUID FK), `dia_normal`, `dia_domingo`, `subida`, `bajada`, `adicional_turno`, `es_activa` (BOOLEAN).
   * **Trigger `trg_unica_tarifa_activa`:** Al insertar o activar una nueva tarifa (`es_activa = TRUE`) para un proyecto, desactiva automáticamente las tarifas anteriores de ese mismo proyecto (`es_activa = FALSE`) sin alterar los turnos históricos ya guardados en `b_1_roster`.

4. **`b_1_roster`**:
   * Columnas: `id_roster` (UUID PK), `id_proyecto` (UUID FK), `id_usuario` (UUID FK), `id_tarifa` (UUID FK), `fecha_inicio` (DATE), `fecha_fin` (DATE), `tipo_turno` (`estado_asistencia`), `total_viaticos` (NUMERIC), `cargado_por` (UUID FK).
   * **Trigger `trg_calcular_viaticos_roster`:** Vincula automáticamente la tarifa activa (`id_tarifa`) al crear el turno y calcula `total_viaticos`:
     * Si `tipo_turno = 'activo'`: Cuenta días normales y domingos desde `fecha_inicio` hasta `fecha_fin - 1`, suma `bajada` por el último día y suma `adicional_turno`.
     * Si `tipo_turno = 'franco'`: Asigna el valor de `subida` (último día de franco).
   * **Trigger `trg_generar_asistencias_roster`:** Al insertar o editar en `b_1_roster`, genera o actualiza automáticamente todas las filas diarias en `b_1_asistencias` con su `id_roster`. Si se elimina el turno en `b_1_roster`, `ON DELETE CASCADE` borra sus asistencias asociadas.

5. **`b_1_asistencias`**:
   * Columnas: `id_asistencia` (UUID PK), `id_usuario` (UUID FK), `fecha` (DATE), `activo_franco` (`estado_asistencia`), `lugar` (`modalidad_lugar`), `tipo_dia` (`clasificacion_dia`), `dedicado_a` (`tipo_dedicacion`), `hora_inicio`, `hora_fin`, `horas_dedicadas`, `id_proyecto`, `id_roster`, `costo_dia`, `costo_manual`, `cargado_por`.
   * **Trigger `trg_calcular_costo_asistencia`:**
     * Si `costo_manual = TRUE`, respeta el valor enviado.
     * Aplica la **Regla de RRHH de costo único por fecha**: Solo se paga un jornal diario por fecha. Si en la misma fecha se registran un turno de `oficina` y uno de `obra`, prevalece **`oficina`** (se asigna `dia_oficina` al de oficina y `$0.00` al de obra).
     * Los recargos por `feriado_trabajado` ($\times 2.0$) y `franco_trabajado` ($\times 1.5$) **solo** se aplican cuando `activo_franco = 'activo'`. Los días de `franco`, `vacaciones` o `licencia` jamás multiplican su costo en feriados.

6. **`a_1_calculo_sueldo`** y **`a_1_adicionales_sueldo`**:
   * En `a_1_calculo_sueldo`, las columnas `subtotal_estimado` (`subtotal_ofi + subtotal_obra`) y `sueldo_total` (`total_real + total_adicionales`) son **GENERADAS**.
   * **Trigger `trg_sincronizar_liquidacion_mensual`:** Recalcula automáticamente `cant_dias_ofi`, `cant_dias_obra`, `subtotal_ofi`, `subtotal_obra` y `total_real` ante cualquier cambio en `b_1_asistencias` (sin bloquear por la columna `cerrado`). Si un día tiene registros de oficina y de obra, suma `1` en `cant_dias_ofi` y `0` en `cant_dias_obra`.
   * **Trigger `trg_actualizar_total_adicionales`:** Suma los montos de `a_1_adicionales_sueldo` (que incluyen `fecha` y `descripcion`) y actualiza `total_adicionales`.

7. **`b_1_modificaciones_realizadas`**:
   * **Trigger `trg_auditar_modificaciones_asistencia`:** Registra automáticamente toda `MODIFICACION` (`UPDATE`) o `ELIMINACION` (`DELETE`) sobre `b_1_asistencias`, guardando el resumen en `detalle_cambio` y el respaldo completo en `valores_anteriores` y `valores_nuevos` (`JSONB`).

---

## 4. Protocolos de Seguridad y Desarrollo (Obligatorios)

### 4.1 Seguridad de Credenciales y Consultas SQL
1. **Prohibido Hardcodear Credenciales:** La cadena de conexión `DATABASE_URL` hacia Railway debe leerse exclusivamente desde variables de entorno mediante `python-dotenv` (`backend/.env`). El archivo `.env` jamás debe subirse al repositorio Git.
2. **Prevención de Inyección SQL:** Todas las consultas en `psycopg2` deben usar parámetros enlazados (`%s`) pasados como tuplas o diccionarios. Está terminantemente prohibido concatenar variables de usuario con *f-strings* dentro de sentencias SQL.
3. **Gestión del Pool de Conexiones:** Toda interacción con PostgreSQL debe utilizar el *context manager* `with obtener_cursor_pg(commit=...) as cursor:` definido en `backend/postgres_db.py`, garantizando `rollback()` automático ante excepciones y la devolución inmediata de la conexión al pool (`putconn`).

### 4.2 Preservación del Puente `pywebview` y Caché
1. **No Romper `ApiPuente`:** `pywebview` expone los métodos de la instancia `ApiPuente` directamente a `window.pywebview.api`. Si se modulariza la lógica en servicios auxiliares, los métodos públicos y sus firmas en `ApiPuente` deben mantenerse intactos.
2. **Estandarización de Respuestas API:** Todo método expuesto al frontend debe estar decorado con `@manejar_errores_api` y retornar siempre un diccionario con la estructura:
   `{"exito": bool, "datos": any, "error": str | None, "codigo_error": str | None}`.
3. **Sincronización del Build de React (`backend/dist`):** Cada vez que se modifique un archivo `.jsx` o `.css` en `frontend/`, es **obligatorio** ejecutar `npm run build` dentro de `frontend/` para actualizar `backend/dist/` antes de probar en `pywebview` o compilar el instalador `.exe`.

### 4.3 Protocolo de Testing y Candado Pre-Commit
Antes de dar por finalizada cualquier tarea o realizar un `git commit`, el agente debe verificar que pasen el 100% de las pruebas automatizadas:
1. **Pruebas de Backend (`pytest`):** Ejecutar en `backend/` usando Simulacros (*Mocks*) o base de pruebas aislada, sin alterar jamás los datos reales de producción en Railway.
2. **Pruebas de Frontend (`vitest`):** Ejecutar `npm run test -- --run` y `npm run build` en `frontend/` para confirmar cero errores de renderizado o empaquetado.