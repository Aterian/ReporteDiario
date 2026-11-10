# Catálogo Funcional del Sistema

## [FN-07.27] Persistencia de Sesión Activa en Disco Local y Restauración Post-Reinicio
- **Módulo**: [MOD-07] Sesión y Persistencia Local
- **Flujo Operativo**: Almacena de forma segura la sesión del usuario en `%LOCALAPPDATA%\Ingeap\CheckDiario\sesion_activa.json` al iniciar sesión; al arrancar la aplicación tras un reinicio de la PC, restaura la identidad desde el archivo local y revalida su estado contra PostgreSQL; en caso de falta temporal de red al encender Windows, preserva la sesión local sin forzar deslogueo; y al cerrar sesión explícitamente elimina el archivo físico.
- **Tablas afectadas**: app_rrhh.a_1_usuarios (lectura de revalidación en caché).
- **Reglas de negocio e invariantes**: Exclusión estricta de disco en ejecución de tests automatizados (`PYTEST_CURRENT_TEST`); cerrojo thread-safe `_sesion_lock` en todas las lecturas y escrituras; si PostgreSQL confirma que el usuario fue dado de baja se purga la sesión de disco; si hay error transitorio de red al iniciar la PC se mantiene la sesión.

## [FN-01.05] Bloqueo Anti-Duplicados de 30s, Redirección por Rol y Confirmación Visual
- **Módulo**: [MOD-01] Registro Diario de Asistencia
- **Flujo Operativo**: Protege el envío de reportes diarios deshabilitando el botón durante 30 segundos con cuenta regresiva reactiva y bloqueo síncrono con `useRef` para impedir dobles clics accidentales; redirige automáticamente al inicio a empleados no-administradores tras 1200ms con notificación Toast; y reemplaza el spinner pulsante del banner de confirmación por un ícono de verificación verde esmeralda.
- **Tablas afectadas**: Ninguna (Capa de cliente React y experiencia de usuario en CheckForm).
- **Reglas de negocio e invariantes**: Roles no-administradores (`user_1`, `user_2`, `core`, nulo) activan redirección automática a los 1.2s; administradores (`admin`, `sub_admin`) permanecen en el formulario; el bloqueo síncrono impide reenvíos en el mismo tick de eventos; si el guardado falla, el cooldown se resetea a 0 para permitir reintento inmediato.

## [FN-07.26] Selección y Revisión Múltiple de Modificaciones en Calendario de Historial
- **Módulo**: [MOD-07] Historial, Auditoría y Liquidación
- **Flujo Operativo**: Permite a roles admin y sub_admin seleccionar múltiples días con modificaciones pendientes en el calendario mensual de auditoría mediante un botón de acceso rápido o checkboxes en cada celda, y marcarlas como revisadas en un solo lote atómico desde la barra flotante o desde el modal de registros diarios.
- **Tablas afectadas**: app_rrhh.b_1_modificaciones_realizadas, app_rrhh.b_1_asistencias.
- **Reglas de negocio e invariantes**: Restringido exclusivamente a roles `admin` y `sub_admin`; actualización en lote en una única transacción PostgreSQL mediante `UPDATE ... WHERE id_asistencia = ANY(%s::uuid[]) AND revisado IS NOT TRUE`; actualización optimista instantánea del estado en cliente y emisión de evento reactivo `catalogos-actualizados`.

## [FN-07.25] Reciclaje de Conexiones Caídas, Reintento Transparente y Prevención de Pantallas en Blanco
- **Módulo**: [MOD-07] Persistencia y Conexiones PostgreSQL
- **Flujo Operativo**: Valida el estado de inactividad de las conexiones en el pool antes de cederlas y purga automáticamente sockets cerrados por el proxy/host; aplica reintento transparente con backoff en backend para consultas y exportaciones de lectura ante fallos de conexión, PoolError o saturación; detecta y recrea pools cerrados; y blinda el frontend con ErrorBoundary raíz en main.jsx y fallbacks defensivos en todas las colecciones para erradicar pantallas en blanco.
- **Tablas afectadas**: Todas las tablas de app_rrhh y app_proyectos (Capa de persistencia relacional, puente y frontend).
- **Reglas de negocio e invariantes**: Conexiones con timestamp nulo o inactividad >=15s ejecutan sonda `SELECT 1` bajo autocommit temporal sin abrir transacciones; reintentos confinados exclusivamente a consultas y exportaciones de lectura (`es_operacion_lectura`); las mutaciones fallan inmediatamente para preservar atomicidad; métodos de catálogo y verificación en apiBridge retornan arreglos y objetos seguros ante errores de base de datos.

## [FN-07.24] Resiliencia de Pool PostgreSQL, SingleFlight y Proyectos Compartidos I+M
- **Módulo**: [MOD-07] Persistencia y Conexiones PostgreSQL
- **Flujo Operativo**: Mitiga saturación de conexiones elevando el pool a 20 slots y aplicando el patrón SingleFlight en caché para impedir ráfagas simultáneas ante eventos de actualización; desacopla telemetría de errores cuando el pool se satura; desanida cursores transaccionales y añade debounce de 200 ms en frontend; unifica catálogos activos de Ingeniería y Mensura para colaboradores de ambas áreas en registros diarios.
- **Tablas afectadas**: app_rrhh.b_1_asistencias, app_rrhh.b_1_errores_remotos, app_proyectos.b_1_proyectos_servicios.
- **Reglas de negocio e invariantes**: PG_POOL_MAX=20 con timeout de 25s; SingleFlight con double-checked locking ejecuta generadores una única vez por clave; ante es_saturacion_pool=True se suprime la escritura recursiva en b_1_errores_remotos; colaboradores con área I o M acceden al universo completo de proyectos activos de ambas áreas.

## [FN-07.19] Verificación Integral de Calidad, Blindaje de React Hooks y Testing Vitest
- **Módulo**: [MOD-07] Pruebas Automatizadas y Calidad Frontend
- **Flujo Operativo**: Ejecuta suites automatizadas unitarias en frontend con Vitest para validar reglas RBAC y liquidación canónica; expande TypeScript a todo el árbol de fuentes; y refuerza ESLint con error estricto en reglas de hooks, eliminando retornos condicionales antes de hooks en vistas principales.
- **Tablas afectadas**: Ninguna (Capa de testing, build y frontend).
- **Reglas de negocio e invariantes**: 100% de tests de backend (pytest) y frontend (vitest) deben pasar antes de cualquier commit; orden de invocación de React Hooks invariable; los permisos RBAC impiden autoelevación a usuarios core.

## [FN-07.18] Liquidación Canónica con Cero Válido y Exportación Quincenal de Roster
- **Módulo**: [MOD-07] Persistencia y Exportaciones
- **Flujo Operativo**: Liquida haberes respetando el valor `$0.00` derivado de la regla de prioridad de Oficina sobre Obra en PostgreSQL; concilia aritméticamente el informe Excel asegurando que subtotales y adicionales sumen exactamente el total a liquidar; exporta turnos de Roster en 3 hojas (`Ciclo Completo`, `1ra Quincena` y `2da Quincena`) computando días normales, domingos, subida, bajada y adicionales por tramo; e incorpora dinámicamente al Gantt a todos los colaboradores de Ingeniería activos o con turnos en el período.
- **Tablas afectadas**: app_rrhh.b_1_asistencias; app_rrhh.a_1_calculo_sueldo; app_rrhh.a_1_adicionales_sueldo; app_rrhh.b_1_roster; app_rrhh.b_1_tarifas_roster.
- **Reglas de negocio e invariantes**: El valor `$0.00` de un jornal por jornada única no debe sobreescribirse con tarifa teórica; cuadre exacto de filas en hoja de resumen; Subida computada el último día de franco y Bajada el último día de campo; todo empleado con turnos en el mes es visible en el Gantt.

## [FN-07.17] Autenticación Estricta, RBAC Seguro y Minimización de Datos
- **Módulo**: [MOD-07] Persistencia PostgreSQL y RBAC
- **Flujo Operativo**: Autentica usuarios validando coincidencia numérica estricta del DNI y nombre exacto; restringe edición de usuarios y sueldos exclusivamente a `admin` y `sub_admin` impidiendo autopromoción o alteración de roles por `sub_admin`; desarma costos manuales inyectados en colecciones por roles operativos; minimiza el catálogo público suprimiendo DNI, email y salarios a roles no autorizados; y valida la autenticidad y cabecera ejecutable PE de las actualizaciones de escritorio.
- **Tablas afectadas**: app_rrhh.a_1_usuarios; app_rrhh.a_1_sueldos_base; app_rrhh.b_1_asistencias.
- **Reglas de negocio e invariantes**: DNI obligatorio de al menos 6 dígitos numéricos; rol `core` restringido a solo lectura; `sub_admin` no puede modificar cuentas `admin` ni asignar rol `admin`; usuarios no administradores no pueden persistir `costo_manual = TRUE`; descargas de actualización confinadas a HTTPS oficial y ejecutables con cabecera `MZ`.

## [FN-07.16] Suite de Pruebas de Carga Masiva y Concurrencia en PostgreSQL
- **Módulo**: [MOD-07] Persistencia PostgreSQL
- **Flujo Operativo**: Infraestructura y runner automatizado de pruebas de carga concurrente multi-hilo (20 usuarios simultáneos) sobre entorno aislado, evaluando ráfagas multi-registro, colisiones en misma fecha con prioridad de oficina, contención pesimista intra-usuario y carga masiva de turnos de Roster por RRHH con autogeneración de asistencias.
- **Tablas afectadas**: app_rrhh.a_1_usuarios; app_rrhh.a_1_sueldos_base; app_rrhh.b_1_asistencias; app_rrhh.b_1_roster; app_rrhh.b_1_tarifas_roster; app_rrhh.a_1_calculo_sueldo; app_proyectos.b_1_proyectos_servicios.
- **Reglas de negocio e invariantes**: Conexión exclusiva a base con prefijo `codex_check_diario_test_`; semáforo de pool `PG_POOL_MAX = 20`; 0 violaciones del invariante de costo único por fecha; 0 deadlocks entre `pg_advisory_xact_lock` y bloqueos pesimistas `SELECT ... FOR UPDATE`; cuadre al centavo de liquidaciones mensuales generadas por triggers.

## [FN-07.15] Consolidación de Asistencias Diarias en Turnos de Roster
- **Módulo**: [MOD-07] Historial y Auditoría
- **Flujo Operativo**: Modal interactivo accesible desde Historial de Otros Empleados (`📅 Crear Roster`) para el empleado seleccionado. Agrupa jornadas contiguas sin vincular (`id_roster IS NULL`) en bloques de Campo y Franco, permitiendo editar proyecto, fechas, tipos y excluir bloques antes de insertar transaccionalmente en `app_rrhh.b_1_roster` y vincular las asistencias existentes sin duplicar registros.
- **Tablas afectadas**: app_rrhh.b_1_roster; app_rrhh.b_1_asistencias; app_rrhh.b_1_tarifas_roster; app_proyectos.b_1_proyectos_servicios.
- **Reglas de negocio e invariantes**: Restricción a roles `admin` y `sub_admin`; inserción atómica por bloque vinculando `id_tarifa` activa; preservación de `id_asistencia` preexistentes asignando `id_roster`; recálculo de viáticos delegado a triggers de PostgreSQL.

## [FN-07.13] Módulo de Empleados con Acceso RBAC y Auditoría Salarial
- **Módulo**: [MOD-08] Gestión de Empleados
- **Flujo Operativo**: Panel accesible desde el menú principal para roles `admin`, `sub_admin` y `core`, listando el personal completo con filtros por texto, área y estado, visualizando lugar habitual, sueldos base oficina/obra, costo día generado por PostgreSQL, última asistencia registrada y cumpleaños, con modal de edición y recálculo instantáneo.
- **Tablas afectadas**: app_rrhh.a_1_usuarios; app_rrhh.a_1_sueldos_base; app_rrhh.b_1_asistencias; app_proyectos.b_1_proyectos_servicios.
- **Reglas de negocio e invariantes**: Restricción estricta por rol RBAC; compatibilidad completa en modos Claro, Oscuro y RPG; cálculo de costo día delegado a columnas generadas en PostgreSQL (`sueldo / 30`).

## [FN-07.14] Resolución de Autoría, Fines de Semana a Franco de Oficina y Refinamiento Visual
- **Módulo**: [MOD-07] Historial y Auditoría
- **Flujo Operativo**: Resuelve el nombre real del operador en `cargado_por` mediante join relacional contra `a_1_usuarios`, carga fines de semana asistidos como Franco de Oficina con valor de oficina, y presenta tarjetas de auditoría con avatar circular, separación de campos y botones de acción unificados (29px).
- **Tablas afectadas**: app_rrhh.b_1_asistencias; app_rrhh.a_1_usuarios; app_rrhh.a_1_calculo_sueldo.
- **Reglas de negocio e invariantes**: Prohibida la exposición de UUIDs crudos en UI; las áreas internas canónicas (`A`, `I`, `M`, `RRHH`, `N`, `VyM`, `S`) se catalogan como área/oficina; fines de semana a franco no multiplican costo y toman valor de oficina.

## [FN-07.11] Carga y actualización de tarifas de roster
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Formulario modal accesible desde RosterView con desplegable de proyectos; captura obligatoria de dia_normal y dia_domingo, y opcionales subida, bajada y adicional_turno. Persiste la tarifa en PostgreSQL y refresca el catálogo.
- **Tablas afectadas**: app_rrhh.b_1_tarifas_roster.
- **Reglas de negocio e invariantes**: El trigger nativo fn_desactivar_tarifas_anteriores desactiva automáticamente cualquier tarifa previa del mismo proyecto; los valores negativos son rechazados por validación Pydantic.

## [FN-07.12] Administración de usuarios y sueldos base
- **Módulo**: [MOD-06] Gestión de Usuarios
- **Flujo Operativo**: Panel exclusivo para roles admin y sub_admin que lista usuarios (activos e inactivos), permite filtrar por texto, área y estado, y desplegar un modal de edición integral para actualizar datos personales, rol de app, estado y sueldos base de oficina y obra.
- **Tablas afectadas**: app_rrhh.a_1_usuarios; app_rrhh.a_1_sueldos_base.
- **Reglas de negocio e invariantes**: Restricción estricta por rol RBAC; campos salariales no se exponen a roles operativos; al persistir sueldo_oficina y sueldo_obra, PostgreSQL computa costo_dia_ofi y costo_dia_obra en tiempo real.

## [FN-07.01] Pool PostgreSQL y retiro de persistencia local
- **Módulo**: [MOD-07] Persistencia PostgreSQL
- **Flujo Operativo**: Carga DATABASE_URL desde entorno/.env, introspecta columnas y presta conexiones ThreadedConnectionPool con RealDictCursor. Retira SQLite y sincronización Sheets del flujo operativo.
- **Tablas afectadas**: information_schema.columns; app_rrhh.*; app_proyectos.b_1_proyectos_servicios.
- **Reglas de negocio e invariantes**: Commit o rollback y devolución garantizada; lecturas sin transacciones abiertas; secretos fuera de código y ejecutables; ninguna creación de tablas en arranque.

## [FN-07.02] Sesión y permisos desde PostgreSQL
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Valida nombre/DNI de usuario activo y revalida rol_app en cada operación del puente. Mantiene las firmas públicas de pywebview.
- **Tablas afectadas**: app_rrhh.a_1_usuarios; app_rrhh.a_1_sueldos_base.
- **Reglas de negocio e invariantes**: Sin roles elevados por nombre/área; sesión en memoria; operador tomado de sesión; funciones no representadas por el esquema devuelven no disponibilidad.

## [FN-07.03] Asistencia parametrizada y modalidad de ausencias
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Traduce modalidades React a enums, valida DTOs y guarda lotes atómicos. RRHH selecciona Oficina/Obra o costo manual para Vacaciones/Licencia.
- **Tablas afectadas**: app_rrhh.b_1_asistencias; app_rrhh.a_1_calculo_sueldo por triggers.
- **Reglas de negocio e invariantes**: Automático omite costo_dia; costo manual finito no negativo admite cero; registros de roster se editan desde su turno; auditoría de operador proviene de sesión.

## [FN-07.04] Roster transaccional y Gantt canónico
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Guarda exclusivamente b_1_roster y deja generación diaria/viáticos a triggers. Consulta joins históricos y muestra total_viaticos y marcas finales en Gantt.
- **Tablas afectadas**: app_rrhh.b_1_roster; app_rrhh.b_1_tarifas_roster; app_rrhh.b_1_asistencias por triggers; app_proyectos.b_1_proyectos_servicios.
- **Reglas de negocio e invariantes**: Campo↔activo; lote atómico sin superposición; consulta por r.id_tarifa; Bajada último Campo y Subida último Franco; no prorratear turnos entre meses.

## [FN-07.05] Bloqueo de eliminación operativa
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Devuelve BORRADO_LOGICO_PENDIENTE al solicitar eliminación de rosters o asistencias.
- **Tablas afectadas**: app_rrhh.b_1_roster; app_rrhh.b_1_asistencias.
- **Reglas de negocio e invariantes**: No ejecutar DELETE FROM en la aplicación; mantener bloqueo hasta disponer de borrado lógico, conforme a decisión del usuario.

## [FN-07.06] Liquidación mensual desde columnas y triggers
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Consulta liquidación y adicionales en una instantánea; tarjeta TypeScript con TanStack Query muestra estimado, real, adicionales y sueldo total.
- **Tablas afectadas**: app_rrhh.a_1_calculo_sueldo; app_rrhh.a_1_adicionales_sueldo.
- **Reglas de negocio e invariantes**: Sin fórmulas salariales en Python/React; selección parcial del calendario no altera el ciclo mensual; ausencia de liquidación no se convierte en importe cero ficticio.

## [FN-07.07] Actividad diaria desde asistencias PostgreSQL
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Consulta estado diario y actividad anterior con modalidad y horas agregadas en PostgreSQL para los widgets existentes.
- **Tablas afectadas**: app_rrhh.a_1_usuarios; app_rrhh.b_1_asistencias.
- **Reglas de negocio e invariantes**: Mantener campos enviado/registrado y conteos de usuarios activos; ninguna cola de sincronización ni cálculo salarial.

## [FN-07.08] Compatibilidad explícita de funciones retiradas
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Mantiene las firmas del puente; refresco lee PostgreSQL y las funciones de limpieza, avatares y auditoría no representadas por el esquema informan no disponibilidad.
- **Tablas afectadas**: Ninguna adicional.
- **Reglas de negocio e invariantes**: No reactivar Google Sheets ni SQLite; no confirmar como persistidos datos sin columnas de destino.

## [FN-07.09] Exportaciones de importes del servidor
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Exporta turnos completos y liquidación mensual, con adicionales y asistencias, a Excel consultando PostgreSQL.
- **Tablas afectadas**: app_rrhh.b_1_roster; app_rrhh.b_1_asistencias; app_rrhh.a_1_calculo_sueldo; app_rrhh.a_1_adicionales_sueldo.
- **Reglas de negocio e invariantes**: Ignorar totales de cliente; no multiplicar tarifas; no reconstruir quincenas; cadenas de usuario no se convierten en fórmulas Excel.

## [FN-07.10] PostgreSQL aislado para integración
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Crea base de pruebas independiente con estructura introspectada sin datos operativos; guarda conexión fuera de Git y ejecuta fixtures reversibles.
- **Tablas afectadas**: Estructura app_rrhh y app_proyectos en base codex_check_diario_test_*.
- **Reglas de negocio e invariantes**: Acceso PUBLIC revocado; prefijo obligatorio; datos sintéticos con rollback; no eliminar bases automáticamente; procedimiento en .agents/skills/postgres-test-environment/SKILL.md.

## [FN-07.11] Prioridad de Oficina sin reentrada salarial
- **Módulo**: [MOD-07]
- **Flujo Operativo**: Corrige fn_trigger_sincronizar_liquidacion para no restaurar el costo de Obra durante una actualización anidada de costo iniciada por el trigger de prioridad.
- **Tablas afectadas**: app_rrhh.b_1_asistencias; app_rrhh.a_1_calculo_sueldo por triggers.
- **Reglas de negocio e invariantes**: Una fecha mixta conserva un único costo con prioridad Oficina; reparación normal y recálculo de ciclos se mantienen; correctivo probado en entorno aislado y aplicado con autorización explícita.

## [FN-00.03] Arquitectura Robusta de Manejo Centralizado de Errores y Logging
- **Módulo**: [MOD-00] Arquitectura Base y Confiabilidad
- **Flujo Operativo**: Centraliza la captura de excepciones mediante decorador `@manejar_errores_api`, valida esquemas con Pydantic, canaliza transacciones SQL con rollback garantizado vía `transaccion_db`, registra trazas con Loguru en `logs/app_errors.log` y previene caídas visuales en React mediante `ErrorFallback` y notificaciones `sonner`.
- **Tablas afectadas**: Transversal a todas las tablas (`historial`, `rosters`, `sesion`, `perfiles_empleados`, etc.).
- **Reglas de negocio e invariantes**:
  1. Toda transacción de escritura debe asegurar rollback inmediato ante fallos para evitar bloqueos *idle in transaction*.
  2. Los errores de clave única o unicidad se traducen a `RegistroDuplicadoError` con mensajes comprensibles de negocio, sin exponer queries SQL ni stacktraces crudos al usuario final.
  3. Las respuestas de API hacia el frontend satisfacen determinísticamente el contrato `{"exito": bool, "datos": any, "error": str | None, "codigo_error": str | None}`.
  4. Los errores visuales de React son contenidos por `react-error-boundary`, permitiendo la recuperación o recarga de la vista sin pérdida de sesión.

## [FN-06.04] Reglas de Liquidación de Feriados No Trabajados y Saneamiento Salarial
- **Módulo**: [MOD-06] Liquidación y Costos Salariales
- **Flujo Operativo**: Calcula `costo_dia` neutralizando el recargo `x2.0` cuando `feriado = "SI"` en jornadas no trabajadas (Franco, Licencia, Vacaciones), manteniendo su costo salarial base ordinario, y provee saneamiento reactivo en SQLite (`historial`) marcando `sincronizado = 0` para actualizar la hoja `1_asistencia_informada`.
- **Tablas afectadas**: `historial`, `1_asistencia_informada`, `usuarios_cache`, `rosters`.
- **Reglas de negocio e invariantes**:
  1. Si `tipo_ocf` es 'Franco', 'Licencia' o 'Vacaciones', el empleado no laboró; por tanto, aunque `feriado` sea 'SI', `costo_dia` no se duplica.
  2. El recargo por feriado (`x2.0`) aplica exclusivamente a jornadas efectivamente laboradas ('Campo', 'Roster', 'Oficina', 'Franco Trabajado').
  3. Francos en Roster de Campo computan su base como `costo_dia_obra` sin recargo por feriado; Francos de Oficina computan `costo_dia_ofi`. Licencias y Vacaciones computan `0.0`.
  4. La rutina `reparar_costos_salariales_historial` opera íntegramente en memoria sin bloqueos SQLite y estampa `sincronizado = 0` ante cualquier corrección salarial.

## [FN-00.01] Empaquetado y Generación de Ejecutables para Distribución
- **Módulo**: [MOD-00] Compilación y Despliegue de Escritorio
- **Flujo Operativo**: Pipeline automatizado que compila la SPA React con Vite hacia `backend/dist`, empaqueta el backend Python/pywebview con PyInstaller en `CheckDiarioIngeap.exe` con metadatos PE v1.16.0, y genera el instalador autónomo monobloque `Instalador_CheckDiario_Ingeap.exe` configurando accesos directos y registro de Windows.
- **Tablas afectadas**: Ninguna (Herramientas de empaquetado y scripts de sistema).
- **Reglas de negocio e invariantes**:
  1. Frontend genera bundles optimizados en `backend/dist` vía `vite.config.js`.
  2. PyInstaller estampa `backend/file_version_info.txt` con versión `1.16.0.0` y metadatos de Ingeap.
  3. El instalador autónomo despliega en `%LOCALAPPDATA%\Ingeap\CheckDiario`, elimina restricciones SmartScreen (`Zone.Identifier`), genera accesos directos y registra autoarranque en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

## [FN-02.03] Descomposición Modular de OtherEmployeesHistoryView
- **Módulo**: [MOD-02] Auditoría y Gestión de Asistencia de Colaboradores
- **Flujo Operativo**: Arquitectura modularizada que descompone la vista de 3,400 líneas en un orquestador ligero y 9 subcomponentes especializados (`HistoryTopBar`, `HistoryRecordsList`, `HistoryAuditCalendar`, `HistoryLiquidationCard` y 5 modales dedicados), desacoplando la renderización sin alterar el estado global, APIs ni las llamadas nativas de confirmación.
- **Tablas afectadas**: `historial`, `1_asistencia_informada`, `modificaciones_realizadas`.
- **Reglas de negocio e invariantes**:
  1. La función canónica `categorizarRegistroLiquidacion` permanece exportada para preservar compatibilidad retroactiva.
  2. Los diálogos nativos (`alert()`, `confirm()`) y los endpoints de `ApiPuente` mantienen intactos sus contratos.
  3. Desglose estricto en subcomponentes ubicados en `frontend/src/components/history/`.

## [FN-03.10] Modularización de RosterView y Asignación de Tarifas en Gantt
- **Módulo**: [MOD-03] Módulo de Roster y Tarifas
- **Flujo Operativo**: Descompone la vista de Roster en orquestador y subcomponentes (`RosterShiftForm`, `RosterGanttChart`, `RosterEmployeeChecklist`), e incorpora la asignación en memoria de tarifas oficiales del proyecto en el modal de edición de turnos sin persistencia prematura en base de datos.
- **Tablas afectadas**: `rosters`, `1_2_tarifas_roster`, `tarifas_roster_cache`.
- **Reglas de negocio e invariantes**:
  1. Asignación reactiva de tarifas oficiales en memoria sin crear registros DB hasta confirmación del usuario.
  2. Subcomponentes desacoplados en `frontend/src/components/roster/`.

## [FN-01.11] Asignación Asistida de Fines de Semana a Franco en Historial Propio
- **Módulo**: [MOD-01] Registro de Asistencia Diaria
- **Flujo Operativo**: Permite a cualquier usuario logueado en su historial personal cargar automáticamente todos los sábados y domingos pendientes del mes en curso como Franco (Franco de Oficina, 0 hs) imputados a su área respectiva, guardando localmente en SQLite y disparando la sincronización remota hacia Google Sheets.
- **Tablas afectadas**: `historial`, hoja remota `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. Disponible universalmente para todos los roles activos (`admin`, `sub_admin`, `core`, `user_1`, `user_2`) exclusivamente en historial personal.
  2. Los roles no administrativos computan invariablemente `tipo_ocf = 'Franco'`, `tipo_franco = 'Franco de Oficina'`, `horas = 0.0`.
  3. Los fines de semana convertidos a franco se guardan estrictamente con `tipo_costo = 'Oficina'` y `costo_dia = costo_dia_ofi` correspondiente al empleado, tanto en SQLite local (`historial`) como en Google Sheets (`1_asistencia_informada`).
  4. El área de servicio se mapea dinámicamente (`MAPA_AREAS`) según el área del colaborador autenticado (`Mensura`, `SIG`, `Ingeniería`, `Núcleo`, `RRHH`, `Aplicaciones`, `Ventas y Marketing`).
  5. Los fines de semana con registros preexistentes se preservan sin modificaciones.
  6. En el backend, las cargas masivas con múltiples fechas solo se permiten a roles estándar si todas las fechas corresponden a sábados y domingos bajo modalidad Franco para su propio usuario.

## [FN-01.12] Selección de Área Dirección (D) y Control de Visibilidad por Rol
- **Módulo**: [MOD-01] Registro de Asistencia Diaria
- **Flujo Operativo**: Permite a colaboradores autorizados (`admin`, `sub_admin`, `core`) imputar su jornada al área 'Dirección' (D), asentando el servicio con la denominación canónica 'Dedicado al area - Dirección' para su sincronización con Google Sheets.
- **Tablas afectadas**: `historial`, hoja remota `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. La opción de selección de Dirección (D) está reservada exclusivamente para roles `admin`, `sub_admin` y `core`.
  2. Los roles estándar (`user_1` y `user_2`) no tienen acceso visual ni interactivo a la opción en ningún selector del formulario.
  3. Al registrarse, el campo `servicio` se asienta estrictamente como `'Dedicado al area - Dirección'`.
  4. La asignación del colaborador Alejandro Maglianesi opera bajo rol `core` para acceso a Dirección y supervisión general.

## [FN-03.08] Integración de Tarifas Roster (1_2_tarifas_roster) y Distintivos Gantt
- **Módulo**: [MOD-03] Módulo de Roster y Tarifas
- **Flujo Operativo**: Vincula la tabla remota `1_2_tarifas_roster` contrastando tanto `id_proyecto` como denominación para asociar los viáticos de proyecto en la tabla local SQLite `rosters` y vista Gantt, asegurando que `costo_dia` en `1_asistencia_informada` guarde exclusivamente el salario del colaborador.
- **Tablas afectadas**: `1_2_tarifas_roster`, `tarifas_roster_cache`, `rosters`, `historial`, `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. Búsqueda de tarifa exacta emparejando de forma combinada `id_proyecto` y `proyecto` (denominación) con la entrada de `1_2_tarifas_roster`.
  2. Desacoplamiento estricto: Las tarifas de proyecto (`dia_normal`, `domingo`, `subida`, `bajada`, `adicionales`) son viáticos operativos que se almacenan EXCLUSIVAMENTE en SQLite local (`rosters` y `tarifas_roster_cache`) para la UI y exportación Excel (.xlsx).
  3. La columna `costo_dia` en `historial` y `1_asistencia_informada` refleja EXCLUSIVAMENTE el salario base del empleado (`costo_dia_obra` en Campo, `costo_dia_ofi` en Franco/Oficina). Bajo ninguna circunstancia se escribe una tarifa de `1_2_tarifas_roster` en Google Sheets.
  4. La vista Gantt destaca Subida (`.bar-subida`, `⬆S`) y Bajada (`.bar-bajada`, `⬇B`).
  5. En el formulario y modal de Gantt, las tarifas se presentan en tarjetas de solo lectura vinculadas automáticamente a `1_2_tarifas_roster`.

## [FN-03.09] Restricción Exclusiva y Filtrado de Colaboradores en Vista Gantt de Roster
- **Módulo**: [MOD-03] Módulo de Roster y Tarifas
- **Flujo Operativo**: Restringe la visualización del gráfico Gantt exclusivamente al conjunto canónico de los 10 colaboradores autorizados de Ingeniería, y filtra reactivamente por proyecto para mostrar únicamente a quienes tengan turnos asignados a dicho proyecto.
- **Tablas afectadas**: `rosters`.
- **Reglas de negocio e invariantes**:
  1. Conjunto canónico de colaboradores: Gabriel Juarez, Maximiliano Kromm, Fernando Aimar, Norberto José Luis Botto, Ivan Emanuel Altamirano, Alejo Ferrero, Facundo Ezequiel Calgaro, Rodolfo Julian Lescano, Agustina Ferrante y José María Zufiaurre.
  2. Cuando el selector de proyecto en el Gantt está en `'TODOS'`, se listan los 10 colaboradores canónicos.
  3. Cuando se selecciona un proyecto específico (`filtroProyectoGantt !== 'TODOS'`), la lista muestra exclusivamente a aquellos colaboradores (del grupo de los 10) que registren turnos en dicho proyecto en el período visualizado.

## [FN-06.05] Desglose y Liquidación con Registro Único Diario por Categoría
- **Módulo**: [MOD-06] Gestión de Nómina y Liquidación
- **Flujo Operativo**: Genera el informe de liquidación y archivo Excel oficial computando estrictamente un único registro por día para una misma categoría sin fraccionar el costo entre proyectos, y sumando importes diarios independientes si coexisten oficina y campo en la misma jornada.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. En jornadas con múltiples registros del mismo tipo (ej. 2 de oficina), se computa un único (1) registro con la tarifa completa del día (`tarifaCat`), seleccionando el de mayor carga horaria como representativo.
  2. Prohibido fraccionar o prorratear el costo diario entre proyectos registrados.
  3. En jornadas mixtas donde coinciden oficina y campo en una misma fecha, cada categoría genera su línea de liquidación y los importes diarios se suman en el total.

## [FN-06.06] Calculadora de Liquidación Basada en Costo Día Asentado
- **Módulo**: [MOD-06] Gestión de Nómina y Liquidación
- **Flujo Operativo**: Suma y liquida los importes de colaboradores seleccionados basándose únicamente en los valores reales asentados en la columna `costo_dia` de los registros seleccionados, preservando la capacidad de sobreescritura manual para excepciones operativas.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. En modo automático (`!hayModoManual`), los subtotales de cada categoría provienen directamente de la sumatoria de `costo_dia` de los registros filtrados.
  2. Permite excepciones manuales por categoría con ajuste de días y tarifas personalizadas sin alterar la base de datos hasta que el usuario decida.

## [FN-06.07] Visualización y Edición Manual Exclusiva de Costo Día en Calendario
- **Módulo**: [MOD-06] Gestión de Nómina y Liquidación
- **Flujo Operativo**: Muestra el valor de `costo_dia` en cada celda del calendario mensual de otros empleados y provee un modal independiente y exclusivo para su edición manual por parte de RRHH/Administración.
- **Tablas afectadas**: `historial`, `modificaciones_realizadas`, `1_asistencia_informada`, `1_1_modificaciones_realizadas`.
- **Reglas de negocio e invariantes**:
  1. Visualización interactiva en cada celda (`💰 $monto`) con distintivo cromático.
  2. Modal desacoplado de la edición general de la jornada: actualiza `costo_dia` en SQLite local, en Google Sheets y asienta registro en la auditoría `modificaciones_realizadas`.
  3. Selección de registro específico en caso de jornadas con múltiples proyectos en un mismo día.

## [FN-03.06] Obtener Conexión SQLite con Modo WAL y Timeout Concurrente
- **Módulo**: [MOD-03] Sincronización y Persistencia Local
- **Flujo Operativo**: Configura la apertura de conexiones SQLite aplicando journal_mode WAL, busy_timeout de 30 segundos y synchronous NORMAL para prevenir bloqueos por concurrencia entre hilos de interfaz y sincronización de fondo.
- **Tablas afectadas**: Todas las tablas locales SQLite (`historial`, `rosters`, `sesion`, `perfiles_empleados`, etc.).
- **Reglas de negocio e invariantes**:
  1. Conexión instanciada siempre con `timeout = 30.0`.
  2. Pragma `journal_mode = WAL;` para permitir lecturas concurrentes sin bloquear escrituras.
  3. Pragma `busy_timeout = 30000;` para espera activa de cerrojos a nivel de driver C de SQLite.
  4. Pragma `synchronous = NORMAL;` para optimizar I/O transaccional manteniendo integridad.

## [FN-03.07] Reintento Defensivo para Operaciones con la Base de Datos
- **Módulo**: [MOD-03] Sincronización y Persistencia Local
- **Flujo Operativo**: Intercepta excepciones de tipo `sqlite3.OperationalError` que contengan "locked", ejecutando hasta 5 reintentos con backoff exponencial antes de propagar el error.
- **Tablas afectadas**: `rosters`, `historial`.
- **Reglas de negocio e invariantes**:
  1. Solo reintenta ante excepciones operacionales con causa de bloqueo ("locked").
  2. Aplica retardo progresivo `delay_base * (2 ** intento)` (máx. 5 intentos).
  3. Envuelve las operaciones críticas de guardado y eliminación en Roster.

## [FN-04.11] Sistema de Roles de Usuario RBAC y Matriz de Acceso
- **Módulo**: [MOD-04] Control de Permisos y Roles
- **Flujo Operativo**: Controla la visibilidad y operación de módulos mediante la columna `rol_app` (`admin`, `sub_admin`, `core`, `user_1`, `user_2`) sincronizada desde `0_usuarios`.
- **Tablas afectadas**: `0_usuarios`, `usuarios_cache`, `sesion`, `perfiles_empleados`, `historial`, `rosters`.
- **Reglas de negocio e invariantes**:
  1. `admin`: acceso completo e irrestricto a toda la aplicación (propio y delegado, rosters, calculadora, auditoría, rangos).
  2. `sub_admin`: registro propio e historial, actividad de ayer y gestión completa de RRHH (roster, calculadora, auditoría y modificación de otros).
  3. `core`: registro propio e historial con Campo habilitado, actividad de ayer y acceso de **solo lectura** a historial de otros (sin edición, ni calculadora, ni rosters).
  4. `user_1`: registro propio e historial con Campo habilitado. Francos automáticos de oficina sin opciones avanzadas.
  5. `user_2`: registro propio e historial estrictamente sin Campo (solo Oficina y Franco). Francos automáticos de oficina sin opciones avanzadas.
  6. Rango de fechas, carga delegada y tipos avanzados de franco reservados exclusivamente para `admin` y `sub_admin`.

## [FN-04.01] Control de Acceso y Visibilidad por Roles y Usuarios
- **Módulo**: [MOD-04] Control de Permisos y Roles
- **Flujo Operativo**: Restringe la visualización y carga de Roster exclusivamente a Justina Bertolozzi e Iván Valentin. Habilita la vista de historial de otros empleados para RRHH, Núcleo (área N) e Iván Valentin. Restringe la edición y eliminación de registros ajenos en el historial exclusivamente a Justina Bertolozzi e Iván Valentin.
- **Tablas afectadas**: `rosters`, `historial`, `sesion`.
- **Reglas de negocio e invariantes**:
  1. Carga e historial de Roster: Exclusivo para Justina Bertolozzi (`45411162` / `rrhh@ingeap.com`) e Iván Valentin (`40158951` / `sge@ingeap.com`).
  2. Historial de otros colaboradores: Accesible para personal de RRHH, empleados de Núcleo (área `N`) y desarrollador Iván Valentin.
  3. Modificación y eliminación en modo historial: Justina Bertolozzi e Iván Valentin pueden modificar/eliminar cualquier registro. El resto del personal solo puede modificar y eliminar sus registros propios (`empleado == usuario.nombre`).
  4. Doble validación cliente (React UI guards) y servidor (PyWebView backend API).

## [FN-01.03] Habilitación de Modalidad Campo para Mensura
- **Módulo**: [MOD-01] Registro de Asistencia Diaria
- **Flujo Operativo**: Permite a los colaboradores del área de Mensura (`M`) seleccionar la modalidad Campo / Campaña e ingresar reportes de campo tanto de forma individual como mediante rangos múltiples de fechas.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. Área `M` (Mensura) puede seleccionar cualquier modalidad base (`Oficina`, `Campo`, `Franco`, etc.).
  2. La restricción de oficina exclusiva se mantiene estrictamente para Camila Llovio (Ingeniería).
  3. Carga por rango habilitada para Mensura en modalidad Campo o cuando RRHH realiza la carga delegada.
  4. Los francos de Mensura se computan directamente como Franco de Oficina con 0 hs y servicio asignado a su área.

## [FN-01.04] Cómputo Directo de Franco de Oficina para Mensura
- **Módulo**: [MOD-01] Registro de Asistencia Diaria
- **Flujo Operativo**: Oculta el selector de categorías de franco para el área de Mensura (`M`), computando automáticamente `tipo_ocf = 'Franco'`, `servicio = 'Mensura'`, `horas = 0.0`.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. Personal de Mensura (`M`) no visualiza subcategorías de franco en el formulario ni en la edición.
  2. Al guardar un franco, se asigna `servicio = 'Mensura'` y 0 hs en Google Sheets y en base local.

## [FN-03.04] Sincronización Confiable de Lotes y Rangos en Google Sheets
- **Módulo**: [MOD-03] Sincronización Remota Google Sheets
- **Flujo Operativo**: Procesa registros pendientes de forma atómica en Google Sheets, garantizando que rangos de fechas y jornadas con múltiples proyectos se inserten íntegramente sin sobreescrituras ni omisiones de filas.
- **Tablas afectadas**: `historial`, hoja remota `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. Cada registro con nuevo UUID se clasifica inequívocamente como inserción en `append_rows()`.
  2. Prohibido usar `(empleado, fecha)` para actualizar registros nuevos o preasignar filas no confirmadas en la hoja.
  3. Marcado en SQLite (`sincronizado = 1`) únicamente tras confirmación exitosa de Google Sheets.
  4. Deduplicación remota evalúa la terna `(empleado, fecha, servicio)` evitando el borrado de jornadas multiproyecto.

## [FN-04.04] Permisos y Reglas de Negocio para Área SIG ("S")
- **Módulo**: [MOD-04] Control de Permisos y Roles
- **Flujo Operativo**: Restringe la navegación a registro diario e historial propio. Limita las modalidades operativas a únicamente Oficina y Franco (con cómputo automático de franco de oficina). Filtra los proyectos disponibles a los pertenecientes a las áreas "S" (SIG) y "A" (Aplicaciones), permitiendo además la asignación horaria a otras áreas corporativas.
- **Tablas afectadas**: `historial`, `0_proyectos`, `0_usuarios`.
- **Reglas de negocio e invariantes**:
  1. Vistas visibles: Exclusivamente Formulario Diario e Historial Propio (sin acceso a Roster ni a Historial de Otros Empleados).
  2. Modalidades operativas: Exclusivamente `Oficina` y `Franco` (oculta Campo/Campaña y subtipos de franco).
  3. Franco directo de oficina: Computa `tipo_ocf = 'Franco'`, `servicio = 'SIG'`, `horas = 0.0`.
  4. Catálogo de proyectos: Proyectos de área `S` y área `A`, con selector para imputar tiempo a cualquiera de las 12 áreas corporativas.

## [FN-05.01] Acceso a Vista RPG y Título Erudito Deambulante para Gabriel Canavesio
- **Módulo**: [MOD-05] Modo Aventura RPG
- **Flujo Operativo**: Habilita el selector de tema medieval RPG para Gabriel Canavesio y le asigna el título honorífico de "Erudito Deambulante" en el encabezado, perfil y tablón de misiones.
- **Tablas afectadas**: `sesion`.
- **Reglas de negocio e invariantes**:
  1. Acceso a vista RPG permitido para Área A, Iván Valentin y Gabriel Canavesio (`45059000`).
  2. Título honorífico asignado: `📜 Erudito Deambulante`.

## [FN-06.01] Controles de RRHH: Roster, Asistencia y Depuración
- **Módulo**: [MOD-06] Gestión de Roster y Asistencia RRHH
- **Flujo Operativo**: Permite cargar Licencia y Vacaciones en Roster, eliminar turnos y filtrar por empleado en el historial. Actualiza id_empleado y usuario_mail al cambiar de empleado en la edición de asistencia. Añade botón Limpiar para depurar la base local y descargar desde Google Sheets sin autollenado.
- **Tablas afectadas**: `rosters`, `historial`, `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. Tipos válidos de Roster: `Campo`, `Franco`, `Licencia`, `Vacaciones`. Licencia y Vacaciones computan 0 hs y tarifas en 0.
  2. Al modificar el empleado de una asistencia, se actualizan obligatoriamente `empleado`, `id_empleado` y `usuario_mail` en local y Sheets.
  3. Desactivado todo autollenado sintético de filas en Sheets (`reconciliar_rosters_con_historial` inerte). Solo los usuarios crean registros.
  4. Botón Limpiar ejecuta borrado local transaccional y descarga completa desde Google Sheets.

## [FN-01.05] Normalización de Campo y Horas de Inicio y Fin
- **Módulo**: [MOD-01] Registro de Asistencia Diaria
- **Flujo Operativo**: Despliega selectores táctiles de hora_inicio y hora_fin al marcar modalidad Campo, calculando automáticamente las horas totales en formato decimal. Normaliza cualquier selección de campo a estrictamente 'Campo' en almacenamiento.
- **Tablas afectadas**: `historial`, `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. 'campaña' o 'campo' se persiste invariablemente como 'Campo'.
  2. Horas en campo calculadas como decimal: `hora_fin - hora_inicio` (soporta cruces de medianoche).
  3. hora_inicio y hora_fin obligatorias solo en Campo; vacías en Oficina y Franco.
  4. Inputs con área táctil mínima de 44px conforme directiva mobile-first.

## [FN-02.01] Auditoría de Modificaciones de Asistencia
- **Módulo**: [MOD-02] Auditoría y Trazabilidad
- **Flujo Operativo**: Detecta cambios sustantivos (tipo, horas, servicio) al editar registros de asistencia e inserta un evento de auditoría en tabla local y en la hoja remota `1_1_modificaciones_realizadas`. Expone indicador visual de modificaciones para RRHH.
- **Tablas afectadas**: `modificaciones_realizadas`, `1_1_modificaciones_realizadas`.
- **Reglas de negocio e invariantes**:
  1. Registra 10 atributos de auditoría incluyendo UUID, valores previos/posteriores, timestamp ISO y usuario autor.
  2. Sincronización automática de eventos de auditoría pendientes hacia Google Sheets durante ciclos de sync.
  3. Resumen de auditoría accesible en widget de inicio para RRHH y perfiles de gestión.

## [FN-06.02] Control de Estado Diario, Costos Masivos y Liquidación Flexible
- **Módulo**: [MOD-06] Gestión de Roster y Asistencia RRHH
- **Flujo Operativo**: Monitorea en el inicio el cumplimiento de registro diario por empleado en tiempo real. Permite asignación masiva de tipo_costo (Oficina/Campo) en el historial de colaboradores y edición flexible de días en la calculadora de liquidación.
- **Tablas afectadas**: `historial`, `1_asistencia_informada`, `0_usuarios`.
- **Reglas de negocio e invariantes**:
  1. Franco con servicio de obra computa como Día de Campo en liquidación y muestra etiqueta 'Franco de obra'.
  2. Franco con área interna computa como Día de Oficina en liquidación.
  3. Asignación masiva actualiza tipo_costo en SQLite y Google Sheets en columna Q.
  4. Calculadora de liquidación permite sobreescritura manual en todas las categorías con opción de reset automático.

## [FN-06.03] Selección Multidía en Calendario y Liquidación de 4 Categorías
- **Módulo**: [MOD-06] Gestión de Roster y Asistencia RRHH
- **Flujo Operativo**: Permite tildar casillas en días del calendario mensual y aplicar tipo de costo masivo mediante barra flotante. Estandariza la calculadora a exactamente 4 categorías y renombra el panel izquierdo a listado completo con filtro de colaborador.
- **Tablas afectadas**: `historial`, `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. Exactamente 4 categorías de liquidación: Día de oficina, Día de obra, Franco trabajado, Feriado trabajado.
  2. Barra flotante de asignación aparece únicamente cuando hay 1 o más días tildados en el calendario.
  3. Panel izquierdo muestra todos los registros con filtro interactivo por empleado.
  4. Empleados regulares restringidos a registrar únicamente fechas de la semana activa en curso.

## [FN-07.01] Actualizador Remoto Desacoplado para Windows 11
- **Módulo**: [MOD-07] Distribución y Actualizaciones
- **Flujo Operativo**: Comprueba releases en GitHub (`Aterian/ReporteDiario`), descarga el ejecutable y ejecuta el modo desacoplado `--updater` que espera la salida del proceso padre vía Windows API, reemplaza el binario y reinicia la aplicación.
- **Tablas afectadas**: N/A.
- **Reglas de negocio e invariantes**:
  1. Parámetros CLI `--parent-pid`, `--target-dir` y `--update-file` eliminan dependencia de variables de entorno de PyInstaller que causan fallas de seguridad en Windows 11.
  2. Espera determinista mediante `OpenProcess` y `WaitForSingleObject`.
  3. Desbloqueo de SmartScreen mediante `Unblock-File` de PowerShell previo al relanzamiento.


## [FN-02.03] Notificaciones de Modificaciones para RRHH y Distinción Visual en Calendario
- **Módulo**: [MOD-02] Auditoría y Trazabilidad
- **Flujo Operativo**: Detecta y sincroniza filas agregadas en `1_1_modificaciones_realizadas` de Google Sheets hacia la base local. Emite aviso y banner interactivo a RRHH con botón para saltar de inmediato al calendario del colaborador en el mes del evento. Distingue visualmente los días y turnos modificados en el calendario de otros empleados.
- **Tablas afectadas**: `modificaciones_realizadas`, `1_1_modificaciones_realizadas`, `historial`.
- **Reglas de negocio e invariantes**:
  1. Notificaciones visibles en banner global y en tarjeta interactiva de inicio para roles de RRHH / gestión.
  2. Al pulsar "Ver cambio en calendario", navega automáticamente a la vista de otros empleados, selecciona al colaborador, desplaza el calendario al mes del cambio, resalta la celda y abre el detalle del día.
  3. Celdas y pastillas con modificaciones previas exhiben indicador ✏️, badge 'MOD' y tooltip explicativo.
  4. Estado de revisión (`revisado = 1`) permite descartar o marcar como leída la notificación de modificación.

## [FN-02.04] Panel Flotante Dividido Comparativo de Modificaciones y Gestión de Revisión RRHH
- **Módulo**: [MOD-02] Auditoría y Trazabilidad
- **Flujo Operativo**: Presenta un panel flotante dividido comparativo (split view) que confronta lado a lado los datos del registro anteriores a la modificación (lado izquierdo) y posteriores (lado derecho), utilizando la tabla `1_1_modificaciones_realizadas`. Permite auditar diferencias de modalidad, horas y proyectos, seleccionar iteraciones históricas y marcar el cambio como revisado.
- **Tablas afectadas**: `modificaciones_realizadas`, `1_1_modificaciones_realizadas`, `historial`.
- **Reglas de negocio e invariantes**:
  1. Panel dividido: lado izquierdo datos previos (`tipo_antes`, `horas_antes`, `servicio_antes`) vs. lado derecho datos actuales (`tipo_despues`, `horas_despues`, `servicio_despues`).
  2. Divisor central con flecha direccional y delta de horas computadas (`+hs`, `-hs` o `0 hs`).
  3. Resumen ejecutivo de cambios e historial de versiones por chips en caso de modificaciones múltiples sobre una misma asistencia.
  4. Botón "✓ Marcar como Revisado por RRHH" persiste `revisado = 1` y actualiza reactivamente el banner superior y el calendario.

## [FN-04.05] Restricción de Permisos para Tipo de Costo (RRHH y Aplicaciones)
- **Módulo**: [MOD-04] Control de Permisos y Roles
- **Flujo Operativo**: Restringe la visualización y edición del Tipo de Costo en el Panel de Control de Empleados exclusivamente al personal de Recursos Humanos (Justina Bertolozzi) y Área de Aplicaciones / Administrador (Iván Valentin).
- **Tablas afectadas**: `historial`, `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. Usuarios con roles operativos o de Núcleo (`N`) no visualizan botones flotantes de costo, checkboxes de selección masiva, badges de costo ni el campo selector en el modal de edición.
  2. Barra flotante de asignación (`calendar-floating-cost-toolbar`) y checkboxes del calendario (`calendar-day-checkbox`) condicionados a `puedeGestionarTipoCosto(usuario)`.
  3. Endpoint del backend `actualizar_tipo_costo_masivo` valida y rechaza peticiones de usuarios sin permiso correspondiente.

## [FN-01.06] Libertad de Selección de Fechas para Registro Diario
- **Módulo**: [MOD-01] Registro de Asistencia Diaria
- **Flujo Operativo**: Otorga libertad total a todos los colaboradores para seleccionar y registrar la fecha de asistencia requerida sin restricciones de semana activa.
- **Tablas afectadas**: `historial`, `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. Todos los empleados pueden cargar o editar asistencias de cualquier fecha sin bloqueos por inicio de semana (lunes).
  2. Removidos los atributos `min` y `max` restrictivos del selector de fechas en `CheckForm`.
  3. Eliminadas las validaciones de límite temporal en los métodos `guardar_check_diario` y `modificar_registro` del backend.

## [FN-01.08] Integración con Cálculo de Sueldos y Mapeo de Costos
- **Módulo**: [MOD-01] Registro de Asistencia Diaria
- **Flujo Operativo**: Conecta a la hoja 'CALCULO DE SUELDOS' (`1rBLHa44JeBlqtkUfKg6WO1EFdiChhvgUTng8GpZQdJo`, tabla `sueldos_empleados`) y vincula a cada colaborador por `id_origen` con `0_usuarios`, persistiendo `costo_dia_ofi` y `costo_dia_obra` en caché SQLite (`usuarios_cache`).
- **Tablas afectadas**: `usuarios_cache`, `sueldos_empleados`, `0_usuarios`.
- **Reglas de negocio e invariantes**:
  1. Relación obligatoria por `id_origen` entre `0_usuarios` y `sueldos_empleados`.
  2. Parseo robusto de importes con símbolos de moneda y separadores de miles/decimales.
  3. Valores por defecto 0.0 si un usuario no cuenta con registro salarial en la hoja.

## [FN-06.04] Reglas de Negocio y Cálculo de 'costo_dia'
- **Módulo**: [MOD-06] Gestión de Roster y Asistencia RRHH
- **Flujo Operativo**: Calcula de manera automatizada el valor de `costo_dia` (columna 18 / R de `1_asistencia_informada` y SQLite `historial`) al registrar o modificar asistencias y en asignaciones de lote.
- **Tablas afectadas**: `historial`, `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. Oficina: `costo_dia = costo_dia_ofi`. Campo: `costo_dia = costo_dia_obra`.
  2. Franco con área interna: `tipo_costo = 'Oficina'`, `costo_dia = costo_dia_ofi`. Franco con obra: `tipo_costo = 'Campo'`, `costo_dia = costo_dia_obra`.
  3. Franco Oficina Trabajado: `tipo_costo = 'Oficina'`, `costo_dia = costo_dia_ofi * 1.5`. Franco Obra Trabajado: `tipo_costo = 'Campo'`, `costo_dia = costo_dia_obra * 1.5`.
  4. Feriado Trabajado (`feriado == 'SI'`): duplica la tarifa base correspondiente (`costo_base * 2.0`). Redondeo estricto a 2 decimales.

## [FN-04.06] Segregación de Permisos para Auditoría, Núcleo y Actividad de Ayer
- **Módulo**: [MOD-04] Control de Permisos y Roles
- **Flujo Operativo**: Aplica restricciones de seguridad tanto en backend (FastAPI) como en frontend (React) según el rol y área del usuario autenticado.
- **Tablas afectadas**: `1_1_modificaciones_realizadas`, `modificaciones_realizadas`, `historial`.
- **Reglas de negocio e invariantes**:
  1. Auditoría y alertas de modificaciones (`1_1_modificaciones_realizadas`) exclusivas para Justina Bertolozzi e Iván Valentin.
  2. Área Núcleo (`"N"`) posee acceso de solo lectura en historial de otros empleados (sin botones de edición, borrado ni asignación masiva de costo).
  3. Módulo "Actividad de ayer" visible y ejecutable únicamente para Área Núcleo (`"N"`), Área Aplicaciones (`"A"`) y Justina Bertolozzi.

## [FN-04.07] Controles Visuales de Zoom y Placeholder DNI
- **Módulo**: [MOD-04] Control de Permisos y Roles
- **Flujo Operativo**: Agrega control de escalado dinámico en la cabecera (90% a 120%) con persistencia local y actualiza el texto instructivo en la pantalla de autenticación.
- **Tablas afectadas**: N/A.
- **Reglas de negocio e invariantes**:
  1. Placeholder de DNI establecido en "99999999".
  2. Escalado CSS global vía `document.documentElement.style.zoom` conservado en `localStorage`.

## [FN-04.08] Liquidación Automatizada por 'costo_dia' para RRHH
- **Módulo**: [MOD-06] Gestión de Roster y Asistencia RRHH
- **Flujo Operativo**: La calculadora de liquidación suma directamente los importes calculados en la columna `costo_dia` de los registros seleccionados, manteniendo la capacidad de sobreescritura manual para excepciones.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. Modo automático calcula el total sumando `costo_dia` de los registros seleccionados del colaborador.
  2. Modo manual disponible para ajustar días/tarifas de excepciones con botón de reinicio al cálculo automático.

## [FN-04.09] Permisos Exclusivos de Calculadora de Liquidación
- **Módulo**: [MOD-04] Control de Permisos y Roles
- **Flujo Operativo**: Restringe la visibilidad y operación de la calculadora de liquidación salarial dentro del historial de colaboradores únicamente a Justina Bertolozzi e Iván Valentin.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. Acceso a calculadora condicionado estrictamente a `esJustinaBertolozzi(usuario) || esIvanValentin(usuario)`.
  2. Ocultamiento total del componente y textos asociados para cualquier otro perfil de usuario.

## [FN-01.09] Asignación Manual de Horas en Proyecto Único
- **Módulo**: [MOD-01] Registro de Asistencia Diaria
- **Flujo Operativo**: Permite alternar a jornada personalizada y ajustar manualmente las horas imputadas aun cuando el usuario selecciona un único proyecto en el formulario diario.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. La barra de división de jornada se muestra activa desde `proyectosSeleccionados.length >= 1`.
  2. En modo personalizado para 1 proyecto, se envían y persisten las horas manuales configuradas sin forzar 8 hs fijas.

## [FN-05.02] Modo RPG Medieval Exclusivo para Área de Aplicaciones
- **Módulo**: [MOD-05] Modo Aventura RPG
- **Flujo Operativo**: Adapta la interfaz de Historial de Otros Empleados, Roster e Historial de Roster con marcos de tablón de madera, herrajes de hierro forjado, estandarte de pergamino y tipografía Cinzel, restringiendo el modo RPG exclusivamente al Área de Aplicaciones.
- **Tablas afectadas**: `sesion`.
- **Reglas de negocio e invariantes**:
  1. Acceso y conmutación al tema RPG reservado exclusivamente para colaboradores con `area === 'A'` o `esIvanValentin(usuario)`.
  2. Sanitización automática a tema oscuro (`dark`) para cualquier otro usuario.
  3. Navegación directa en el Tablón de la Taberna hacia Crónicas de Compañeros y Decreto de Guardias.

## [FN-01.10] Catálogo Conjunto de Proyectos para Ingeniería y Mensura
- **Módulo**: [MOD-01] Registro de Asistencia Diaria
- **Flujo Operativo**: Retorna en el catálogo de proyectos activos los proyectos pertenecientes tanto a Ingeniería como a Mensura cuando un colaborador de cualquiera de estas dos áreas registra su check diario.
- **Tablas afectadas**: `0_proyectos`, `proyectos_cache`.
- **Reglas de negocio e invariantes**:
  1. Solicitudes con `area = 'I'` o `area = 'M'` retornan la unión de proyectos activos de áreas `I` y `M`.
  2. Facilita la imputación en proyectos de colaboración conjunta sin requerir cambio de filtro manual.

## [FN-03.05] Deduplicación Remota Estricta por Identificador Único
- **Módulo**: [MOD-03] Sincronización Remota Google Sheets
- **Flujo Operativo**: La rutina de depuración y deduplicación remota valida la unicidad de filas basándose exclusivamente en el `id_asistencia` único, preservando registros válidos de jornadas fragmentadas en el mismo proyecto.
- **Tablas afectadas**: `historial`, hoja remota `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. No se consideran duplicados registros con igual `(empleado, fecha, servicio)` si poseen distinto `id_asistencia`.
  2. Permite jornadas multi-turno en el mismo proyecto (ej. 4 hs mañana y 4 hs tarde).

## [FN-02.04] Edición en Historial con Selector Enum de Servicios
- **Módulo**: [MOD-02] Historial y Auditoría
- **Flujo Operativo**: Sustituye la entrada abierta de texto por selectores enum desplegables sincronizados con los catálogos oficiales de proyectos y áreas corporativas en los modales de edición del historial.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. Licencias: opciones limitadas a tipos oficiales (`Médica`, `Examen`, etc.).
  2. Modalidad Campo / Roster / Franco Obra: selector exclusivo de proyectos activos.
  3. Modalidad Oficina / Franco / Vacaciones: selector ordenado de áreas corporativas y proyectos.

## [FN-04.10] Liquidación con Fracciones de 0.5 Días y Desglose de Francos
- **Módulo**: [MOD-04] Control de Permisos y Roles
- **Flujo Operativo**: Habilita incrementos decimales de 0.5 días en la asignación manual de RRHH y desglosa el cálculo de francos trabajados entre Franco de Obra y Franco de Oficina.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. Incrementos manuales en pasos de `0.5` (`step="0.5"`) para todas las categorías.
  2. Franco de Obra Trabajado: tasa del 150% del día de obra/campo (`costo_dia_obra * 1.5`).
  3. Franco de Oficina Trabajado: tasa del 150% del día de oficina (`costo_dia_ofi * 1.5`).

## [FN-06.05] Exportación de Informe de Liquidación en Excel
- **Módulo**: [MOD-06] Gestión de Roster y Asistencia RRHH
- **Flujo Operativo**: Permite a los responsables de RRHH generar y descargar un archivo Excel institucional con el informe detallado de liquidación salarial del empleado auditado.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. Exclusivo para Justina Bertolozzi e Iván Valentin (`puedeVerCalculadoraLiquidacion`).
  2. Hoja 'Resumen Liquidación': datos de colaborador, desglose de las 5 categorías, total general y tabla de proyectos imputados.
  3. Hoja 'Detalle Diario': cronograma detallado día a día de las jornadas del mes.

## [FN-06.06] Unificación de Cómputo de Liquidación y Sincronización Completa de Historial
- **Módulo**: [MOD-06] Gestión de Roster y Asistencia RRHH
- **Flujo Operativo**: Sincroniza la totalidad de registros históricos personales sin truncamiento de límite y unifica la calculadora de liquidación para computar 1 registro por día para un mismo tipo (e.g. 2 registros de oficina) y computar ambos tipos si coexisten oficina y campo en la misma jornada.
- **Tablas afectadas**: `historial`.
- **Reglas de negocio e invariantes**:
  1. `obtener_ultimos_registros` ampliado a límite 5000 ordenado por `fecha DESC, id DESC` con enriquecimiento de modificaciones, eliminando discrepancias con la vista de supervisión.
  2. Mismo tipo en el mismo día (e.g. 2 proyectos de oficina): computa como 1 solo día de esa categoría para el cálculo de costo.
  3. Tipos distintos en el mismo día (e.g. oficina y campo): se computan ambos conceptos íntegros en la liquidación.
  4. En exportación a Excel, los costos diarios compartidos por proyectos del mismo tipo se distribuyen proporcionalmente según horas trabajadas, garantizando cuadratura contable exacta.

## [FN-04.11] Sistema de Control de Acceso y Roles de Usuario (RBAC)
- **Módulo**: [MOD-04] Control de Permisos y Roles
- **Flujo Operativo**: Regula la visibilidad de módulos y facultades operativas según el rol del usuario (`admin`, `sub_admin`, `core`, `user_1`, `user_2`) sincronizado desde la columna `rol_app` de Google Sheets `0_usuarios` con respaldo defensivo en base local.
- **Tablas afectadas**: `sesion`, `perfiles_empleados`, `usuarios_cache`, `0_usuarios`.
- **Reglas de negocio e invariantes**:
  1. `admin`: Visibilidad total de todos los módulos (carga delegada, rangos de fechas, historial global con edición/eliminación, roster, calculadora salarial y revisión de modificaciones). Iván Valentín posee precedencia determinista a `admin`.
  2. `sub_admin`: Módulos de RRHH completos (roster, calculadora, historial global mutable, revisión de modificaciones, carga delegada y rangos de fechas). Justina Bertolozzi posee precedencia determinista a `sub_admin`.
  3. `core`: Actividad de ayer, selector de Campo habilitado y acceso de **solo lectura** al historial de otros colaboradores.
  4. `user_1`: Registro propio y personal con selector de Campo habilitado. Francos computan y guardan automáticamente como franco de oficina (0 hs).
## [FN-02.01] Auditoría y Esquema Remoto de Modificaciones Realizadas
- **Módulo**: [MOD-02] Auditoría y Trazabilidad de Modificaciones
- **Flujo Operativo**: Registra deltas de cambios en asistencias tanto localmente como en la hoja remota Google Sheets `1_1_modificaciones_realizadas` bajo un esquema de 11 columnas con auditoría de estado.
- **Tablas afectadas**: `modificaciones_realizadas`, hoja Google Sheets `1_1_modificaciones_realizadas`.
- **Reglas de negocio e invariantes**:
  1. Cada mutación sobre una jornada genera un UUID de auditoría con valores antes/después y responsable.
  2. El esquema de 11 columnas incluye la columna `revisado` al final de la fila.
  3. Toda nueva modificación inicia con `revisado = 0` y `revisado_sincronizado = 1` si fue insertada remotamente.

## [FN-02.02] Sincronización de Modificaciones Revisadas ('OK') y Desactivación Remota
- **Módulo**: [MOD-02] Auditoría y Trazabilidad de Modificaciones
- **Flujo Operativo**: Cuando un administrador marca una modificación como revisada, se persiste `revisado = 1` en SQLite y se escribe 'OK' en la columna `revisado` de Google Sheets. El resto de los administradores detecta el 'OK' en el ciclo periódico y suprime la alerta automáticamente.
- **Tablas afectadas**: `modificaciones_realizadas`, hoja Google Sheets `1_1_modificaciones_realizadas`.
- **Reglas de negocio e invariantes**:
  1. Acceso de revisión exclusivo para Justina Bertolozzi e Iván Valentin (`puedeVerModificaciones`).
  2. La subida de 'OK' se ejecuta en lote asíncrono hacia Google Sheets con fallback celda por celda.
  3. `descargar_modificaciones_desde_sheets` actualiza filas existentes con valor remoto 'OK', sincronizando el apagado del banner de notificación entre administradores.

## [FN-03.10] Modularización de RosterView y Asignación de Tarifas en Modal de Edición Gantt
- **Módulo**: [MOD-03] Módulo de Roster y Tarifas
- **Flujo Operativo**: Descompone `RosterView` en subcomponentes (`RosterShiftForm`, `RosterGanttChart`, `RosterEmployeeChecklist`, `rosterConstants`) e incorpora un botón en el modal de edición de turnos de Gantt para asignar las tarifas oficiales vigentes del proyecto en memoria sin crear registros adicionales en la base de datos.
- **Tablas afectadas**: `rosters`, `tarifas_roster_cache`.
- **Reglas de negocio e invariantes**:
  1. El botón `⚡ Asignar tarifas oficiales al turno` recupera la tarifa oficial de `1_2_tarifas_roster` para el proyecto del turno y puebla `editPrecioDia` y `editPrecioDomingo` en memoria.
  2. No genera nuevas filas ni muta la base de datos hasta que el operador pulse explícitamente "Guardar Modificación".
  3. Preserva compatibilidad con exportaciones y selección exclusiva de colaboradores de Ingeniería.

## [FN-03.11] Persistencia Local de Tarifas Roster y Francos de Obra en Modalidad Campo
- **Módulo**: [MOD-03] Módulo de Roster y Tarifas
- **Flujo Operativo**: Al cargar un turno de franco en Roster, asigna automáticamente `tipo_costo = 'Campo'` y el sueldo de campo del empleado (`costo_dia_obra`) en `historial` y `1_asistencia_informada`. Al asignar la tarifa de roster en la ventana de modificación de un turno en Gantt, la persiste inmediatamente en la tabla local `rosters` sin alterar `historial` ni invocar a Google Sheets, permitiendo la correcta visualización reactiva y exportación del archivo `.xlsx`.
- **Tablas afectadas**: `rosters`, `historial`.
- **Reglas de negocio e invariantes**:
  1. Todo turno de Roster con tipo 'Franco' se considera franco de obra (`tipo_costo = 'Campo'`) y liquida con `costo_dia_obra` del colaborador.
  2. La asignación de tarifas de proyecto en la ventana de modificación de turnos actualiza exclusivamente las columnas `precio_dia` y `precio_domingo` de la tabla SQLite `rosters`.
  3. No se tocan salarios en `historial` ni se desencadenan sincronizaciones remotas a Google Sheets durante dicha asignación local.

## [FN-07.01] Sistema de Diseño Ingeap y Accesibilidad Operativa WCAG 2.2
- **Módulo**: [MOD-07] Sistema de Diseño y UI
- **Flujo Operativo**: Estandariza la paleta cromática corporativa oficial (`#cc3333`, `#999999`) y fija áreas táctiles mínimas de 44x44 px (`--touch-min-size: 44px`) en todos los controles interactivos para operatividad táctil en campo y con guantes de protección.
- **Tablas afectadas**: Ninguna (capa puramente visual y de accesibilidad CSS).
- **Reglas de negocio e invariantes**:
  1. Los controles interactivos (botones, selectores, campos de texto, pills de turnos y modales) respetan un área táctil mínima de 44px conforme a WCAG 2.2.
  2. Los tokens corporativos oficiales (`--brand-red: #cc3333`, `--brand-gray: #999999`) gobiernan la variable `--primary` garantizando sincronización determinista en temas Light, Dark y RPG.
  3. Se depuran reglas desbalanceadas con `!important` en el layout corporativo asegurando especificidad limpia en la cascada CSS.

## [FN-07.15] Consolidación de Asistencias en Turnos de Roster con Preservación Forense
- **Módulo**: [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Permite a usuarios `admin` y `sub_admin` desde `OtherEmployeesHistoryView` agrupar asistencias diarias huérfanas mediante Gaps-and-Islands y consolidarlas atómicamente en `app_rrhh.b_1_roster`, preservando horarios, horas, tipo de día y costos manuales.
- **Tablas afectadas**: `app_rrhh.b_1_roster`, `app_rrhh.b_1_asistencias`, `app_rrhh.a_1_calculo_sueldo`.
- **Reglas de negocio e invariantes**:
  1. Validación de compatibilidad: rechaza con `ValidacionError` si el empleado registra en el rango asistencias con `lugar = 'oficina'` o ausencias justificadas (`vacaciones`, `licencia`).
  2. Preservación forense: respalda horarios (`hora_inicio`, `hora_fin`), acumula `horas_dedicadas`, mantiene `tipo_dia` especial y costos manuales fijados previamente.
  3. Tras la regeneración por el trigger `trg_generar_asistencias_roster`, actualiza atómicamente las asistencias con los atributos originales preservados.

## [FN-07.16] Auditoría y Trazabilidad Forense de Modificaciones en PostgreSQL
- **Módulo**: [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Gestiona el ciclo de vida de revisiones de modificaciones y eliminaciones registradas en `app_rrhh.b_1_modificaciones_realizadas` disparadas por `trg_auditar_modificaciones_asistencia`, con soporte para resumen ejecutivo, listado reciente, alertas y marcado de revisión.
- **Tablas afectadas**: `app_rrhh.b_1_modificaciones_realizadas`, `app_rrhh.b_1_asistencias`.
- **Reglas de negocio e invariantes**:
  1. Toda edición manual de costo diario (`actualizar_costo_dia_manual`) asocia el UUID del operador a `cargado_por` y anexa el motivo a `detalle_cambio`.
  2. Consultas de asistencias correlacionan modificaciones por fila para activar comparativas antes/después y banderas `modificacion_pendiente` / `modificacion_revisada`.
  3. Las operaciones de marcado como revisado (`revisado = TRUE`) registran `revisado_por` y `fecha_hora_revision`, actualizando la UI únicamente ante respuesta confirmada (`res.exito === true`).

## [FN-07.19] Concurrencia Transaccional en Roster y Liquidación
- **Módulo**: [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Desacopla la lectura de liquidación de los bloqueos de escritura y reemplaza cerrojos globales por advisory locks por empleado en orden determinista, optimizando el rendimiento de lotes concurrentes.
- **Tablas afectadas**: `app_rrhh.b_1_roster`, `app_rrhh.a_1_calculo_sueldo`, `app_rrhh.a_1_usuarios`.
- **Reglas de negocio e invariantes**:
  1. `obtener_liquidacion` ejecuta lecturas limpias sin `FOR UPDATE` contra `a_1_calculo_sueldo`. El recálculo y bloqueo de fila se reserva solo cuando la fila no existe o ante `forzar_recalculo = TRUE`.
  2. `guardar_rosters_atomicos` y `crear_rosters_desde_asistencias` adquieren cerrojos advisory `checkdiario.roster.<uuid>` ordenados deterministamente por UUID, eliminando contención cruzada entre colaboradores distintos.
  3. `consultar_asistencias` soporta paginación parametrizada `LIMIT` y `OFFSET`, y el frontend implementa renderizado progresivo de a 50 tarjetas para listas masivas.

## [FN-07.12] Blindaje Anti-Recursión en Liquidación e Idempotencia de Migración
- **Módulo**: [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Previene desbordes de pila en triggers de PostgreSQL ante tarifas en cero, preserva costos manuales al editar turnos de Roster en SQL y garantiza migración idempotente desde Excel mediante UUIDv5.
- **Tablas afectadas**: `app_rrhh.b_1_asistencias`, `app_rrhh.b_1_roster`, `app_rrhh.a_1_calculo_sueldo`.
- **Reglas de negocio e invariantes**:
  1. `fn_trigger_sincronizar_liquidacion` restringe la promoción de jornada a `pg_trigger_depth() = 1`, eliminando recursión infinita cuando `costo_dia` es `$0.00`.
  2. `fn_sincronizar_asistencias_desde_roster` almacena temporalmente en memoria (`JSONB`) los registros con `costo_manual = TRUE` en `[NEW.fecha_inicio, NEW.fecha_fin]` y los restaura tras la inserción en bloque.
  3. `migrar_excel_a_postgres.py` ejecuta por defecto en modo simulación (`MODO_SIMULACION_DRY_RUN = True`) y asigna UUIDv5 deterministas basados en tupla natural para evitar duplicaciones al repetir la importación.

## [FN-07.17] Suite de Verificación Automatizada y Resiliencia de Esquema PostgreSQL
- **Módulo**: [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Garantiza paridad entre el esquema real en Railway (`nombre` + `apellido` + `b_1_modificaciones_realizadas`) y el entorno de pruebas aislado, manteniendo conexiones resilientes mediante TCP Keepalives y validando permisos y liquidación mediante Vitest y Pytest.
- **Tablas afectadas**: `app_rrhh.a_1_usuarios`, `app_rrhh.b_1_asistencias`, `app_rrhh.b_1_modificaciones_realizadas`.
- **Reglas de negocio e invariantes**:
  1. `perfil_esquema()` resuelve expresiones dinámicas independientes por alias SQL (`u`, `uc`, `um`) envueltas en `NULLIF(concat_ws(...), '')`.
  2. `obtener_cursor_pg()` descarta automáticamente conexiones caídas (`close=True`) en `ThreadedConnectionPool` y registra el código SQLSTATE antes de elevar `DatabaseTransactionError`.
  3. El candado pre-commit exige 100% de aprobación en `pytest` (contrato + integración con auditoría activa), `vitest`, `eslint` (`rules-of-hooks: error`) y `tsc --noEmit`.

## [FN-07.20] Modalidad Dual de Cálculo Salarial ('base_30' vs 'por_dia')
- **Módulo**: [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Permite a RRHH configurar la liquidación mensual de cada colaborador bajo dos modalidades: 'base_30' (sueldo fijo mensual con ajuste proporcional de días mixtos) o 'por_dia' (liquidación por días reales de calendario), recalculando en tiempo real mediante triggers y funciones de PostgreSQL.
- **Tablas afectadas**: `app_rrhh.a_1_sueldos_base`, `app_rrhh.a_1_calculo_sueldo`, `app_rrhh.b_1_asistencias`.
- **Reglas de negocio e invariantes**:
  1. En modalidad 'base_30', el ajuste delta (30 - total_dias_reales) se aplica exclusivamente sobre el contador correspondiente a `lugar_habitual` ('oficina' u 'obra'), preservando intactos los días computados en la otra modalidad.
  2. La compensación automática a 30 días SOLO se activa si la suma total de días registrados en el mes es mayor o igual a los días calendario del mes (28, 29, 30 o 31) o superior a 30. En meses incompletos (ingreso a mitad de mes o ausencias), se liquidan únicamente los días reales registrados sin ajuste.
  3. Los montos adicionales por `feriado_trabajado`, `franco_trabajado` y `a_1_adicionales_sueldo` se preservan intactos sin verse reducidos por el ajuste a 30 días.
  4. Al modificar `modalidad_calculo` o `lugar_habitual` en `a_1_sueldos_base`, el trigger `trg_recalcular_liquidacion_config_sueldo` dispara automáticamente `fn_recalcular_liquidacion_mes` para todos los ciclos de cobro abiertos del usuario.


## [FN-07.21] Sistema de Telemetría y Auditoría de Errores Remotos
- **Módulo**: [MOD-00] / [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Captura excepciones no controladas de frontend (`ErrorBoundary`, `window.onerror`, `unhandledrejection`) y backend, persistiendo en `app_rrhh.b_1_errores_remotos`. Los administradores pueden visualizar errores pendientes en tiempo real, inspeccionar trazas técnicas y resolverlos individual o masivamente.
- **Tablas afectadas**: `app_rrhh.b_1_errores_remotos`.
- **Reglas de negocio e invariantes**:
  1. El registro de errores es no bloqueante y aislado de las transacciones principales del usuario; los métodos de telemetría son silenciosos en el cliente.
  2. Los usuarios no autenticados registran errores con `id_usuario = NULL` y `nombre_usuario = 'Sesión no iniciada'`.
  3. La consulta y resolución de errores remotos está estrictamente reservada a usuarios con `rol_app = 'admin'`.

## [FN-07.22] Catálogo y Gestión Centralizada de Proyectos
- **Módulo**: [MOD-04] / [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Vista exclusiva `ProjectsManagementView` para administradores que permite auditar, crear y editar obras y servicios con filtros por área y estado (`activo`), buscador en tiempo real y métricas resumidas.
- **Tablas afectadas**: `app_proyectos.b_1_proyectos_servicios`.
- **Reglas de negocio e invariantes**:
  1. `id_servicio` es la clave primaria UUID autogenerada (`DEFAULT gen_random_uuid()`), mientras que `id_proyecto` es el identificador UUID canónico ingresado por el Administrador.
  2. La creación y edición de proyectos invalida automáticamente la caché de catálogo (`proyectos` y `tarifas_roster`).
  3. Acceso estrictamente restringido a usuarios con `rol_app = 'admin'`.

## [FN-07.23] Alerta Temprana de Cierre de Mes por Días sin Cargar
- **Módulo**: [MOD-01] / [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Detección dinámica en el último día calendario del mes (28, 29, 30 o 31) de las fechas pendientes de registro del colaborador en `b_1_asistencias`, presentando un banner destacado con accesos directos a "Cargar Ahora" y "Ver Mi Historial".
- **Tablas afectadas**: `app_rrhh.b_1_asistencias`.
- **Reglas de negocio e invariantes**:
  1. El cálculo se ejecuta dinámicamente con `calendar.monthrange(año, mes)[1]`.
  2. La alerta se activa únicamente si la fecha actual es el último día del mes calendario y `cantidad_faltantes > 0`.
  3. Se recalcula automáticamente tras guardar un nuevo registro en `CheckForm`.

## [FN-06.10] Buzón de Sugerencias, Participación y Consulta
- **Módulo**: [MOD-01] / [MOD-06] Interfaz de Usuario y Experiencia Colaborativa
- **Flujo Operativo**: Los usuarios autenticados pueden enviar una sugerencia desde Inicio. Los roles `core`, `sub_admin` y `admin` acceden a la bandeja debajo de Empleados para consultar y actualizar estado, prioridad y respuesta.
- **Tablas afectadas**: `app_rrhh.b_2_participacion_consulta`.
- **Reglas de negocio e invariantes**: Nombre opcional, descripción obligatoria y categoría Aplicaciones disponible. PostgreSQL asigna el estado y la prioridad iniciales y mantiene la fecha de resolución. El puente valida el rol y rechaza actualizaciones sobre datos que ya cambiaron.

## [FN-07.24] Borrado Lógico en PostgreSQL (Soft-Delete Asistencias y Roster)
- **Módulo**: [MOD-07] Persistencia Relacional PostgreSQL y Auditoría RRHH
- **Flujo Operativo**: Permite eliminar asistencias y turnos de Roster marcando `eliminado_en = TIMEZONE('utc', NOW())` y `eliminado_por`, ocultando los registros de la interfaz y recalculando automáticamente la liquidación mensual mediante triggers sin destruir datos históricos.
- **Tablas afectadas**: `app_rrhh.b_1_asistencias`, `app_rrhh.b_1_roster`, `app_rrhh.a_1_calculo_sueldo`, `app_rrhh.b_1_modificaciones_realizadas`.
- **Reglas de negocio e invariantes**:
  1. Índices parciales con `WHERE eliminado_en IS NULL` sobre `b_1_asistencias` y `b_1_roster` para optimizar consultas de registros activos.
  2. `fn_recalcular_liquidacion_mes` computa días y salarios únicamente para registros con `eliminado_en IS NULL`.
  3. `fn_trigger_sincronizar_liquidacion` se activa ante mutaciones de `eliminado_en` para recalcular el mes afectado.
  4. La eliminación de un turno de Roster marca en cascada como eliminadas sus asistencias diarias asociadas (`id_roster = NEW.id_roster`).
  5. `fn_registrar_modificacion_asistencia` audita la eliminación lógica registrando un evento `tipo_operacion = 'ELIMINACION'` en `b_1_modificaciones_realizadas`.

## [FN-07.25] Módulo Panorámico y Exportación de Errores Remotos
- **Módulo**: [MOD-00] / [MOD-07] Supervisión Técnica y Resiliencia
- **Flujo Operativo**: Vista exclusiva `RemoteErrorsView` para administradores con dashboard de KPIs en tiempo real (total, pendientes, resueltos, tasa de éxito), filtros por estado, origen y código, modal de detalle técnico con stack trace monoespaciado y botón de copiado, resolución individual y masiva, y exportación descargable a archivo JSON.
- **Tablas afectadas**: `app_rrhh.b_1_errores_remotos`.
- **Reglas de negocio e invariantes**:
  1. Acceso restringido exclusivamente a usuarios con `rol_app = 'admin'`.
  2. La exportación a archivo JSON se genera en el navegador del cliente mediante Blob descargable sin sobrecargar el backend.
  3. La resolución masiva (`marcar_todos_errores_remotos_resueltos`) actualiza atómicamente todos los registros pendientes asignando `resuelto = TRUE` y `resuelto_por = id_admin`.
