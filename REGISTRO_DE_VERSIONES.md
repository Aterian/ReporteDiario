# Registro de Versiones (Changelog) - Check Diario Ingeap

Historial cronológico de cambios, nuevas características y mejoras aplicadas al sistema **Check Diario Ingeap**.

## [2.10.0] - 2026-11-02

### ✨ Nuevas Características
- **Auditoría de Errores Remotos (`[FN-07.21]`)**:
  - Telemetría automática en backend y frontend para captura de excepciones y fallos de persistencia.
  - Almacenamiento seguro en `app_rrhh.b_1_errores_remotos`.
  - Panel y modal `RemoteErrorsModal` exclusivo para usuarios `admin` con detalle técnico / stack trace y resolución de incidentes individual o por lote.
- **Alta de Nuevos Empleados (`[FN-04.14]`)**:
  - Botón `+ Nuevo Empleado` en `UsersManagementView` para roles `admin` y `sub_admin`.
  - Creación atómica de usuario y sueldo base con validación de DNI y blindaje contra elevación de privilegios no autorizada.
- **Gestión Centralizada de Proyectos (`[FN-07.22]`)**:
  - Nueva vista exclusiva `ProjectsManagementView` para administradores.
  - Administración de obras, número de servicio (`n_serv`), codificación, responsable, área y estado activo/inactivo.
  - Integración de acceso directo en `HomeView` y `RpgTavernBoard`.
- **Alerta de Cierre de Mes por Días sin Cargar (`[FN-07.23]`)**:
  - Detección en el último día del mes (28, 29, 30 o 31) de días pendientes de registro.
  - Banner destacado con detalle de fechas faltantes y botones para carga inmediata y consulta de historial.
- **Buzón de Sugerencias / Participación y Consulta (`[FN-06.10]`)**:
  - Nuevo botón en menú inicial para todos los usuarios con notificación informativa 'Próximamente.'.

### 🛠️ Correcciones y Mejoras Técnicas
- Corrección de sintaxis en imports de repositorios y normalización de firmas en `postgres_bridge.py`.
- Integración de migración `005_errores_remotos_y_gestion_proyectos.sql` en PostgreSQL Railway.
- Pruebas automatizadas de contrato RBAC en `test_postgres_contract.py` y permisos en `permissions.test.js`.

## [2.9.0] - 2026-11-02

### ⚖️ Modalidad Dual de Cálculo Salarial ('base_30' vs 'por_dia') y Ajuste de Días Mixtos (`[FN-07.20]`)
- **Persistencia y Triggers en PostgreSQL (`[FN-07.20]`)**:
  - Creado el tipo ENUM `app_rrhh.tipo_modalidad_calculo` (`'por_dia'`, `'base_30'`) e incorporada la columna `modalidad_calculo` en `app_rrhh.a_1_sueldos_base` con valor por defecto `'base_30'`.
  - Actualizada la función `app_rrhh.fn_recalcular_liquidacion_mes`:
    - En `'base_30'`, calcula el ajuste delta (30 - total_dias_reales) aplicando el ajuste exclusivamente sobre el contador correspondiente al `lugar_habitual` del empleado (`cant_dias_ofi` si es `'oficina'` o `cant_dias_obra` si es `'obra'`), sin modificar los días de la otra modalidad.
    - Regla de meses incompletos: la compensación automática a 30 días SOLO se activa si total_dias_reales >= dias_mes (28, 29, 30 o 31) o si supera 30. En meses incompletos (ingreso a mitad de mes o ausencias), se liquidan únicamente los días reales registrados sin sumar ni restar días de ajuste.
    - Preservación de recargos: los montos adicionales por feriado trabajado, franco trabajado y adicionales de sueldo permanecen intactos.
    - En `'por_dia'`, liquida exactamente la cantidad real de días registrados en cada modalidad sin aplicar ajustes a 30.
  - Creado el trigger `trg_recalcular_liquidacion_config_sueldo` en `app_rrhh.a_1_sueldos_base` para disparar el recálculo mensual automático de todos los periodos abiertos cuando se actualiza `modalidad_calculo` o `lugar_habitual`.
- **Backend y Puente de Escritorio (`[FN-07.02]` / `[FN-07.20]`)**:
  - Incorporado en `postgres_bridge.py` el método `actualizar_configuracion_sueldo_usuario(datos)`, con control de acceso estricto RBAC (restringido a `admin` y `sub_admin`) y emisión del evento `catalogos-actualizados` hacia la interfaz.
  - Actualizadas las consultas de lectura en `postgres_repository.py` (`obtener_liquidacion`, `obtener_usuarios_cache`, `perfil_esquema`) para exponer siempre `modalidad_calculo` y `lugar_habitual`.
- **Frontend y Experiencia de Usuario (`[FN-06.04]` / `[FN-07.20]`)**:
  - En `OtherEmployeesHistoryView.jsx`, incorporado selector reactivo para `modalidad_calculo` ('base_30' / 'por_dia') y `lugar_habitual` ('oficina' / 'obra') para usuarios `admin` y `sub_admin`.
  - En `HistoryLiquidationCard.jsx`, incorporado distintivo visual `data-testid="badge-modalidad-calculo"` indicando en tiempo real si el mes se liquidó bajo "Base 30 días" o "Por día individual".
  - En `UsersManagementView.jsx`, incorporado el campo de selección de modalidad en el modal de edición de usuarios.
- **Calidad y Cobertura de Pruebas**:
  - Añadidos tests de contrato en `backend/tests/test_postgres_contract.py` (42/42 superados).
  - Añadida prueba de integración en `backend/tests/test_postgres_integration.py` validando meses de 31 días, 28 días (febrero) e incompletos de 15 días con recargos de feriado intactos.
  - Añadida suite unitaria en `frontend/src/tests/modalidadCalculo.test.js` (34/34 tests superados en vitest).

## [2.8.1] - 2026-10-30

### 🔌 Resiliencia del Pool PostgreSQL, Paridad de Esquema en Auditoría y Sincronización de Triggers (`[FN-07.01]` / `[FN-07.16]`)
- **Compatibilidad de Esquema en Consultas de Auditoría (`[FN-07.01]` / `[FN-07.16]`)**:
  - En `backend/postgres_repository.py`, `perfil_esquema()` expone ahora `nombre_cargador` (`NULLIF(concat_ws(' ', uc.nombre, uc.apellido), '')`) y `nombre_modificador` (`NULLIF(concat_ws(' ', um.nombre, um.apellido), '')`), corrigiendo el `UndefinedColumn: column um.nombre_completo does not exist` en `consultar_asistencias()` y el `UndefinedTable: missing FROM-clause entry for table "uc"` en `obtener_modificaciones_recientes()` y `obtener_notificaciones_modificaciones()` cuando `app_rrhh.a_1_usuarios` utiliza `nombre` y `apellido` con `b_1_modificaciones_realizadas` activa.
  - Se incorporó `_enriquecer_modificacion_auditoria()` para normalizar etiquetas de modalidad antes/después, nombres de proyectos y banderas de revisión (`revisado = 1 | 0`) requeridas por `OtherEmployeesHistoryView.jsx`.
- **Resiliencia del Pool de Conexiones hacia Railway (`[FN-07.01]`)**:
  - En `backend/postgres_db.py`, se configuraron parámetros TCP Keepalive (`keepalives=1`, `keepalives_idle=30`, `keepalives_interval=10`, `keepalives_count=5`) en `ThreadedConnectionPool`, descarte automático (`putconn(..., close=True)`) de conexiones cerradas por el proxy de Railway y trazabilidad detallada en `loguru` ante errores de PostgreSQL (`pgcode`).
- **Paridad de Esquema y Triggers en Producción y Entorno de Pruebas (`[FN-07.10]` / `[FN-07.12]`)**:
  - Aplicada la migración `003_blindar_triggers_liquidacion_y_roster.sql` en Railway (`DATABASE_URL`) y en la base aislada (`TEST_DATABASE_URL`).
  - Incorporada la estructura completa de `app_rrhh.b_1_modificaciones_realizadas` y `trg_auditar_modificaciones_asistencia` en `backend/tests/fixtures/postgres_schema.sql`.

## [2.8.0] - 2026-10-30

### 🧪 Suite Vitest Automatizada, Blindaje de React Hooks y Tipado Global (`[FN-07.17]` / `[FN-04.11]`)
- **Cumplimiento Estricto de Reglas de React Hooks (`[FN-04.11]`)**:
  - Configurado `'react-hooks/rules-of-hooks': 'error'` en `frontend/eslint.config.js`.
  - En `OtherEmployeesHistoryView.jsx`, `UsersManagementView.jsx` y `RosterHistoryView.jsx`, se eliminaron los retornos anticipados antes de hooks (`useState`, `useEffect`, `useMemo`), reubicando las pantallas de restricción de acceso al final del flujo del componente para garantizar un orden de ejecución inmutable en cada renderizado.
- **Tipado y Cobertura Global en TypeScript (`[FN-07.03]`)**:
  - En `frontend/tsconfig.json`, se expandió el bloque `include` a `"src/**/*"`, permitiendo que `tsc --noEmit` analice la totalidad de archivos y rutas de importación de la aplicación.
- **Suite de Pruebas Unitarias Frontend con Vitest (`[FN-07.17]`)**:
  - Integrado `vitest` en `frontend/package.json` con scripts `"test": "vitest run"` y `"test:watch": "vitest"`.
  - Implementada suite en `frontend/src/tests/permissions.test.js`: verificación exhaustiva de la matriz RBAC, prohibición de autoelevación salarial para usuarios `core`, control de acceso a Roster, carga delegada y rango de fechas.
  - Implementada suite en `frontend/src/tests/liquidation.test.js`: verificación de `categorizarRegistroLiquidacion`, agregación de costos por `(fecha, categoria)` y respeto de subtotales canónicos de `$0.00` sin sustitución arbitraria.
- **Validación del 100% de Candados Pre-Commit**:
  - 38/38 tests de contrato backend en `pytest` superados.
  - 12/12 tests de integración PostgreSQL en `pytest` superados.
  - 23/23 tests unitarios frontend en `vitest` superados.
  - 0 errores en `eslint .` y 0 errores en `tsc --noEmit`.
  - Empaquetado de producción de Vite (`npm run build`) validado en `backend/dist/`.

## [2.7.0] - 2026-10-30

### 🛡️ Idempotencia en Migrador Excel y Blindaje Anti-Recursión en Triggers SQL (`[FN-07.12]` / `[FN-07.15]`)
- **Idempotencia Estricta y Simulación por Defecto en `migrar_excel_a_postgres.py` (`[FN-07.15]`)**:
  - `MODO_SIMULACION_DRY_RUN` activado por defecto (`"--commit" not in sys.argv`), exigiendo autorización explícita mediante el flag de línea de comando `--commit` para impactar la base de datos operativa.
  - Implementada la función `generar_uuid_asistencia_estable`: las filas de Excel que carecen de UUID nativo reciben un UUIDv5 determinista (`uuid.uuid5(uuid.NAMESPACE_OID, semilla)`) calculado a partir de la tupla `(id_usuario, fecha_iso, activo_franco, lugar, id_proyecto, hora_inicio, hora_fin, horas_dedicadas, ocurrencia_en_dia)`. Rellenar o reejecutar la migración jamás duplicará filas ni alterará identificadores previos.
- **Blindaje contra Recursión Infinita en Liquidación (`[FN-07.12]`)**:
  - En `002_corregir_prioridad_oficina.sql`, `003_blindar_triggers_liquidacion_y_roster.sql` y `postgres_schema.sql`, se endureció la guarda del trigger `fn_trigger_sincronizar_liquidacion` a `IF pg_trigger_depth() = 1 AND (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN`.
  - Se elimina definitivamente el riesgo de bucles recursivos o desbordes de pila (`stack depth limit exceeded`) cuando los colaboradores poseen tarifa `$0.00` o cuando coexisten registros de oficina y obra en la misma jornada.
- **Preservación In-Memory JSONB de Costos Manuales al Editar Turnos de Roster (`[FN-07.12]`)**:
  - En `fn_sincronizar_asistencias_desde_roster`, al ejecutarse un `UPDATE` sobre `app_rrhh.b_1_roster`, se respaldan en una variable de memoria `JSONB` todas las asistencias con `costo_manual = TRUE` cuyas fechas permanezcan dentro del rango `[NEW.fecha_inicio, NEW.fecha_fin]`.
  - Tras la regeneración del bloque diario por el trigger, se restauran atómicamente el costo manual (`costo_manual`, `costo_dia`), la clasificación especial de jornada (`tipo_dia`), los horarios y las horas dedicadas.

## [2.6.0] - 2026-10-29

### ⚡ Concurrencia Transaccional, Paginación de Historial y Eliminación de Race Conditions (`[FN-07.06]` / `[FN-07.04]` / `[FN-02.03]` / `[FN-07.02]`)
- **Lectura de Liquidación sin Bloqueo de Escritura (`[FN-07.06]`)**:
  - En `postgres_repository.py` (`obtener_liquidacion`), se desacopló la consulta de liquidación mensual eliminando el `SELECT ... FOR UPDATE` y la ejecución forzada de `fn_recalcular_liquidacion_mes` en lecturas habituales.
  - La consulta lee directamente de `app_rrhh.a_1_calculo_sueldo` (mantenida actualizada por triggers), permitiendo consultas concurrentes instantáneas sin competir con capturas ni ediciones. Se reserva el recálculo transaccional exclusivo para cuando la fila no existe o se indica `forzar_recalculo = True`.
- **Cerrojos de Roster Aislados por Empleado (`[FN-07.04]` / `[FN-07.15]`)**:
  - Reemplazado el bloqueo global `"checkdiario.roster"` en `guardar_rosters_atomicos` y `crear_rosters_desde_asistencias` por cerrojos transaccionales a nivel de colaborador `checkdiario.roster.<uuid>`, adquiridos en orden determinista de UUID junto al bloqueo de fila `a_1_usuarios FOR UPDATE`.
  - Operadores administrando colaboradores distintos ya no sufren esperas ni bloqueos cruzados entre sí.
- **Paginación en Base de Datos y Renderizado Progresivo en Frontend (`[FN-07.03]` / `[FN-02.03]`)**:
  - En `postgres_repository.py` (`consultar_asistencias`), incorporado soporte de `limite` y `offset` con cláusulas parametrizadas `LIMIT %s OFFSET %s`.
  - En `HistoryRecordsList.jsx`, implementado renderizado progresivo (bloques iniciales de 50 tarjetas) con botón extensible `"Mostrar más registros"`, previniendo sobrecarga en el DOM ante miles de registros acumulados.
- **Eliminación de Carreras de Peticiones (Race Conditions) y Sincronización de Caché (`[FN-02.03]` / `[FN-07.02]`)**:
  - En `OtherEmployeesHistoryView.jsx`, incorporado contador secuencial `requestSeqRef` para `cargarAuditoriaEmpleado`, descartando automáticamente respuestas obsoletas al alternar rápidamente entre colaboradores o meses.
  - Actualizado el listener `catalogos-actualizados` mediante referencias mutables para eliminar problemas de *stale closures*.
  - En `postgres_repository.py`, el invalidador de caché purga simultáneamente ambas variantes `('usuarios', False)` y `('usuarios', True)` en todas las mutaciones operativas.

## [2.5.0] - 2026-10-29

### 🔄 Preservación en Roster, Auditoría Forense PostgreSQL y Blindaje de Vigencia Salarial (`[FN-07.15]` / `[FN-07.16]` / `[FN-04.12]`)
- **Preservación de Datos Originales en Consolidación de Roster (`[FN-07.15]`)**:
  - En `postgres_repository.py` (`crear_rosters_desde_asistencias`), implementada la consulta previa de asistencias huérfanas en el rango del turno.
  - Se validan incompatibilidades operativas rechazando con `ValidacionError` explícito si existen registros con jornada de Oficina (`lugar == 'oficina'`) o ausencias remuneradas (`vacaciones`, `licencia`).
  - Se respaldan y agregan por fecha los atributos cargados: horarios (`hora_inicio`, `hora_fin`), `horas_dedicadas` (acumuladas en caso de múltiples imputaciones), clasificaciones especiales (`tipo_dia`), y banderas de `costo_manual` con su respectivo `costo_dia`.
  - Tras la inserción del bloque en `b_1_roster` (que dispara `trg_generar_asistencias_roster`), se actualizan atómicamente las asistencias generadas restaurando los atributos preservados sin pérdida de información forense.
- **Integración de Auditoría Real en PostgreSQL y Trazabilidad de Motivo (`[FN-07.16]` / `[FN-07.03]`)**:
  - Detección activa en `perfil_esquema()` de la tabla `app_rrhh.b_1_modificaciones_realizadas`.
  - En `postgres_repository.py`, implementadas las consultas canónicas de auditoría: `obtener_resumen_modificaciones()`, `obtener_modificaciones_recientes(limite)`, `obtener_notificaciones_modificaciones()`, `marcar_modificacion_revisada()`, `marcar_modificacion_por_asistencia_revisada()` y `marcar_todas_modificaciones_revisadas()`.
  - En `postgres_bridge.py`, conectados los métodos puente hacia la base de datos eliminando listas vacías y respuestas mock.
  - En `actualizar_costo_dia_manual()`, se asigna el UUID del operador a `cargado_por` en `b_1_asistencias` (lo que propaga automáticamente el autor hacia `b_1_modificaciones_realizadas` vía trigger) y se anexa el motivo explícito `[Motivo: ...]` al campo `detalle_cambio`.
  - En `consultar_asistencias()`, se correlacionan las modificaciones de cada asistencia, exponiendo `modificacion_pendiente`, `modificacion_revisada` y el array `modificaciones` para activar el panel comparativo de RRHH.
  - En `App.jsx` y `OtherEmployeesHistoryView.jsx`, se condiciona la actualización optimista y los mensajes de éxito a la confirmación exitosa del backend (`res?.exito !== false`).
- **Protección de Vigencia Salarial ante Cambios de Perfil (`[FN-04.12]`)**:
  - En `actualizar_usuario_y_sueldo()`, se consulta previamente el registro en `app_rrhh.a_1_sueldos_base`.
  - Si los montos (`sueldo_oficina`, `sueldo_obra`) y el `lugar_habitual` no han variado, se omite el `INSERT ... ON CONFLICT DO UPDATE` y se omite la invocación a `fn_recalcular_liquidacion_mes`, conservando intacta la fecha `vigente_desde` original y evitando falsas entradas en `a_1_historial_sueldos`.
  - Cuando existe un cambio salarial efectivo, se admite una fecha `vigente_desde` personalizada o se fija `CURRENT_DATE`, ejecutando el recálculo mensual de forma controlada.

## [2.4.0] - 2026-10-29

### 📊 Exactitud Contable en Liquidación, Respeto de Costo $0 y Exportación Roster en 3 Hojas (`[FN-07.09]` / `[FN-07.04]`)
- **Respeto Canónico de Subtotales $0.00 en Liquidación (`[FN-07.09]`)**:
  - En `OtherEmployeesHistoryView.jsx`, corregida la condición que sustituía sumas de costo `$0.00` por `días × tarifa`, permitiendo que los días de Obra coetáneos con Oficina (remunerados legítimamente en `$0.00` según la regla de jornada única de PostgreSQL) se reflejen fidedignamente sin inflar los haberes.
  - Sincronizados los subtotales con los valores reales computados por la base de datos y respetando únicamente los overrides manuales cuando el auditor los define explícitamente.
- **Conciliación Aritmética en Excel de Liquidación (`[FN-07.09]`)**:
  - En `liquidacion_export.py`, garantizado que la suma de subtotales por concepto y los adicionales aprobados (`a_1_adicionales_sueldo`) sea idéntica al `TOTAL A LIQUIDAR`.
  - Insertada fila explícita para `"Adicionales aprobados del mes"` cuando existen registros en `a_1_adicionales_sueldo`, cerrando la discrepancia entre el desglose y el sueldo total oficial.
- **Exportación de Roster en 3 Hojas Reglamentarias (`[FN-07.09]`)**:
  - En `postgres_exports.py` y `roster_export.py`, implementada la generación de las 3 hojas canónicas estipuladas en `AGENTS.md`:
    1. `"Ciclo Completo"`: turnos consolidados con viáticos integrales.
    2. `"1ra Quincena (1 al 15)"`: desglose acotado a los primeros 15 días con cómputo de días normales, domingos, bajada/subida y adicionales proporcionales.
    3. `"2da Quincena (16 al Fin)"`: cómputo del tramo restante hasta el último día del mes.
- **Gantt de Roster Dinámico por Catálogo y Período (`[FN-07.04]`)**:
  - En `RosterView.jsx`, ampliada la construcción de `empleadosEnGantt` para integrar tanto la lista canónica de Ingeniería como a cualquier nuevo colaborador del área `'I'` activo en catálogo o con turnos registrados en el mes, evitando la exclusión visual de colaboradores seleccionables en el formulario.

### 🛡️ Blindaje de Autenticación, RBAC, Catálogo Mínimo y Actualizador Seguro (`[FN-07.02]` / `[FN-04.12]` / `[FN-03.06]`)
- **Autenticación Estricta Nombre + DNI (`[FN-07.02]`)**:
  - Implementada función `autenticar_usuario(nombre, dni)` en `postgres_repository.py` separada de `resolver_usuario()`.
  - Exige DNI numérico (mínimo 6 dígitos) y coincidencia estricta y simultánea contra `u.dni` y `u.nombre`, bloqueando el bypass de login con el nombre en el campo DNI.
- **Separación de Privilegios y Bloqueo de Escalada de Roles (`[FN-04.12]`)**:
  - En `postgres_bridge.py`: `actualizar_usuario_y_sueldo` restringido exclusivamente a `admin` y `sub_admin`. El rol `core` queda bloqueado en el backend con `PermisoDenegadoError`.
  - En `postgres_repository.py`: Validación atómica con `FOR UPDATE`. Se prohíbe que `sub_admin` modifique cuentas `admin`, se autopromueva a `admin` o cambie el `rol_app` de usuarios.
  - En `UsersManagementView.jsx`: Modo solo lectura para `core`, selector de roles restringido a `admin` y bloqueo visual de cuentas `admin` ante usuarios `sub_admin`.
- **Protección contra Inyección de Costo Manual Anidado (`[FN-07.03]`)**:
  - `preparar_asistencias` y `guardar_check_diario` desarman y bloquean cualquier `costo_manual` o `costo_dia` inyectado dentro de la lista de proyectos por usuarios no administradores.
- **Minimización de Catálogo Público (`[FN-07.02]`)**:
  - `obtener_todos_usuarios` proyecta exclusivamente campos públicos (`id_usuario`, `nombre`, `area`, `lugar_habitual`, `activo`) para roles operativos (`user_1`, `user_2`), eliminando DNI, correos, roles y última actividad del payload.
- **Blindaje y Reparación del Actualizador de Escritorio (`[FN-03.06]`)**:
  - Eliminado el `NameError` de `cargar_configuracion()`, leyendo el repositorio GitHub desde `os.environ.get("GITHUB_REPO")` y distinguiendo errores de red de "sin actualizaciones".
  - `ejecutar_descarga_y_reinicio` valida que la URL sea HTTPS oficial de GitHub, verifica la cabecera PE ejecutable de Windows (`MZ`) y rechaza binarios corruptos o URLs arbitrarias.

## [2.3.0] - 2026-10-29

### 📐 Optimización Estructural de Interfaz, Adaptabilidad de Zoom y Contraste RPG (`[FN-04.08]` / `[FN-02.03]`)
- **Adaptabilidad de Viewport ante Escala de Zoom (80% - 130%)**:
  - Inyección reactiva de la variable `--ui-zoom` (`zoom / 100`) y cálculo compensatorio `--vh-full: calc(100vh / var(--ui-zoom, 1))` en `:root`.
  - Reemplazo de alturas fijas rígidas `calc(100vh - 65px)` en `.roster-view-container`, `.history-split-viewport` y `.other-history-container` por `calc(var(--vh-full, 100vh) - ...)`, eliminando franjas blancas inferiores en zoom `< 100%` y desbordes en zoom `> 100%`.
  - Ancho adaptable `max-width: min(760px, 94vw)` en formularios y distribución vertical uniforme en `.calendar-grid` y `.audit-calendar-grid` (`grid-auto-rows: minmax(64px, 1fr)`).
- **Estandarización y Espaciado de Botoneras**:
  - Incorporada la clase corporativa `.btn-action-primary` (`#cc3333`, `height: 36px`, `border-radius: 8px`), corrigiendo el botón `+ Nuevo Check` en `HistoryView` y unificando el botón `Cargar Tarifas` en `RosterView`.
  - Reestructurado `RosterEmployeeChecklist` con chips `Todos` / `Ninguno`, evitando rupturas de línea y truncamiento de nombres en la grilla.
  - Reemplazado UUID crudo en `RosterShiftForm` por el badge corporativo `✓ Tarifa Activa`.
  - Mejorados los tamaños táctiles de stepper horario (28x28px en `CheckForm`), zoom de días (26x26px en Gantt) y botones de auditoría (32px).
- **Legibilidad y Contraste Integral en Modo RPG**:
  - Desacoplado el `<select>` de `"Aventurero a auditar"` en `HistoryAuditCalendar` con `min-width: 220px`, impidiendo que el chip RPG colapse el menú a 24px.
  - Ámbito semántico de tinta oscura sobre pergamino (`--text-primary: #2b1d0c`, `--text-secondary: #5c381e`), restaurando la visibilidad de títulos, meses del calendario, fechas de asistencia, proyectos, horas y leyendas.
  - Título `.users-view-title` ajustado a dorado claro `#fef3c7` sobre la madera oscura del tablón, y fechas/proyectos de la tabla de empleados fijados con alto contraste sobre el pergamino.
  - Fondo `#fbf2dc` y texto `#2b1d0c` asegurados en todas las etiquetas `select`, `option` y `optgroup` en Modo RPG.

### 🎨 Rediseño Corporativo del Modal Interactivo de Consolidación de Roster (`[FN-07.15]`)
- **Aislamiento DOM y Portales (`[MOD-02]` / `[MOD-07]`)**:
  - Encapsulamiento del modal en `ReactDOM.createPortal(..., document.body)` para evitar colisiones de contexto de apilamiento (*stacking context*), *transforms* o recortes de contenedores padre en `OtherEmployeesHistoryView`.
  - Backdrop desenfocado (`backdrop-blur-md bg-slate-900/65`) con cierre por tecla `Escape` y clic exterior seguro.
- **Jerarquía Visual y Tipografía Corporativa Ingeap (`[Rule FRONT-BRAND-01]`)**:
  - Incorporada cabecera con contenedor de icono SVG corporativo, tipografía semi-bold de 16px, pill badge del colaborador auditado y botón de cierre accesible (`44x44px`).
  - Tarjeta de controles superiores (`.modal-roster-config-card`) para alcance y proyecto por defecto con focus ring corporativo (`#cc3333`).
  - Métricas de auditoría estructuradas con tags semánticos (asistencias huérfanas en ámbar, vinculadas en esmeralda y resumen de bloques en rojo Ingeap).
- **Resolución de Truncamiento en Tabla de Turnos (`[FN-07.15]`)**:
  - Eliminado el corte de texto en selectores de "Tipo Turno" (`Franc`/`Camp` -> pastillas completas `🏕️ Campo` y `🏠 Franco` con min-width 135px).
  - Inputs de fecha (`.modal-roster-date-input`) con tipografía nítida y alineación consistente.
  - Footer con resumen explicativo del lote contable y botón de confirmación con estado de carga interactivo (`.modal-roster-confirm-btn`).

### ⚡ Blindaje de Concurrencia y Suite de Pruebas de Carga Masiva (`[FN-07.16]`)
- **Blindaje del Pool de Conexiones (`[MOD-07]`)**:
  - Ampliado `PG_POOL_MAX` de 8 a 20 conexiones en `backend/postgres_db.py` para soportar ráfagas concurrentes sin rechazo por semáforo.
  - Timeout de adquisición de conexión configurable mediante `PG_POOL_ACQUIRE_TIMEOUT` (15 segundos por defecto).
- **Serialización Pesimista y Prevención de Deadlocks (`[MOD-07]`)**:
  - Adquisición de `SELECT id_usuario FROM app_rrhh.a_1_usuarios WHERE id_usuario = %s FOR UPDATE` en `obtener_liquidacion` previo al recálculo de `fn_recalcular_liquidacion_mes`, eliminando carreras e inversiones de bloqueo con inserciones concurrentes.
- **Suite Automatizada de Carga Masiva (20 Usuarios Simultáneos) (`[FN-07.16]`)**:
  - Implementado `backend/tests/test_postgres_concurrency_load.py` con sembrado reversible de 20 usuarios sintéticos, 5 proyectos y tarifas de Roster en base aislada.
  - Evaluación de 4 escenarios de concurrencia:
    1. Ráfaga multi-registro simultánea (120 registros procesados en paralelo, 0 deadlocks, liquidación cuadra al centavo).
    2. Colisiones en misma fecha validando prevalencia de Oficina sobre Obra (100% de cumplimiento del costo único diario).
    3. Contención intra-usuario (doble submit, auditoría salarial y consulta simultánea bajo serialización `FOR UPDATE`).
    4. Responsable de RRHH cargando múltiples turnos de Roster en lote (8 turnos y 84 asistencias autogeneradas concurrentes con 16 colaboradores activos).
- **Runner CLI de Telemetría (`backend/stress_test_runner.py`)**:
  - Medición automatizada de latencias (mínimo, promedio, p50, p95, p99, máximo), throughput y auditoría SQL de invariantes contables con 0 violaciones detectadas.

## [2.2.0] - 2026-10-28

### 🚀 Módulo Integral de Empleados, Accesibilidad, Liquidación y Refinamiento Visual
- **Erradicación de Google Sheets (`[MOD-01]` / `[MOD-07]`)**: Eliminación total del botón de refresco y sondeos periódicos hacia Google Sheets, operando 100% nativo sobre PostgreSQL en Railway.
- **Módulo de Empleados con RBAC extendido (`[MOD-08]`)**:
  - Incorporada la tarjeta de acceso a **Módulo de Empleados** en el panel principal (`HomeView` y `RpgTavernBoard`) para los roles `admin`, `sub_admin` y `core`.
  - Visualización completa con scroll vertical fluido, filtros por área canónica (`I`, `A`, `M`, `RRHH`, `N`, `VyM`, `S`) y estado, mostrando sueldo base, valor día generado por PostgreSQL, último registro de jornada y cumpleaños.
  - Soporte y adaptación visual completa en Modo Claro, Modo Oscuro y Modo RPG Pergamino Taberna.
- **Zoom Dinámico Accesible (`[MOD-01]`)**:
  - Implementado ajuste de escala global mediante `Ctrl + Scroll` del ratón (80% a 130%) con bloqueo de comportamiento nativo del navegador, sincronizado con el indicador de porcentaje del header y atajos `Ctrl + +`, `Ctrl + -`, `Ctrl + 0`.
- **Calculadora de Liquidación y Auditoría Salarial (`[MOD-07]`)**:
  - Restauración canónica de las 5 celdas individuales en `OtherEmployeesHistoryView` (*Día de oficina*, *Día de obra*, *Franco de obra trab.*, *Franco de ofic. trab.*, *Feriado trabajado*), con breakpoint responsive adaptado a `<= 1100px`.
  - Asignación y edición manual de costo diario (`admin` / `sub_admin`) en el calendario mensual y tarjetas laterales mediante `HistoryCostDayModal`.
- **Fines de Semana a Franco de Oficina (`[MOD-02]` / `[MOD-07]`)**:
  - Carga asistida de sábados y domingos estrictamente como **Franco de Oficina** con **valor de oficina** (`dia_oficina`), independientemente del rol del usuario.
  - Resolución canónica en `francoUtils.js` de códigos cortos de áreas internas (`A`, `I`, `M`, `RRHH`, `N`, `VyM`, `S`), previniendo catalogación errónea como *Franco de Obra*.
- **Resolución de Autor en `cargado_por` (`[MOD-02]` / `[MOD-07]`)**:
  - Cruce relacional en PostgreSQL (`LEFT JOIN a_1_usuarios uc ON uc.id_usuario = a.cargado_por`), proyectando el nombre real del operador en lugar de UUIDs alfanuméricos.
  - Función defensiva `resolverNombreCargador` en cliente y etiquetado preciso de autoría (`✓ Cargado por mí` en historial propio sin falsos indicadores de RRHH).
- **Refinamiento Visual y Maquetación de Tarjetas (`[MOD-07]`)**:
  - Estructuración flexbox de `.other-record-card`: avatar circular con iniciales, separación limpia entre nombre y autor, pills de costo/estado sin solapamiento y botones de acción unificados (altura uniforme de 29px en fila horizontal).
- **Exportación de Informe de Liquidación y Creación de Roster desde Historial (`[FN-07.09]` / `[FN-07.15]`)**:
  - Resolución flexible de ciclo mensual (`ciclo_cobro`, `mes` o `nombre_mes`) y respaldo de liquidación en `exportar_informe_liquidacion`, incorporando hoja ejecutiva `Resumen Liquidación` en Excel.
  - Nuevo modal interactivo `HistoryCreateRosterModal` en Historial de Otros Empleados (`📅 Crear Roster`) que detecta bloques contiguos de asistencias sin vincular (`id_roster IS NULL`) y los consolida atómicamente en `app_rrhh.b_1_roster` sin duplicar asistencias.

## [2.1.0] - 2026-10-26

### 💰 Restauración de Calculadora Canónica de Liquidación (`[FN-02.03]`)
- **Interfaz interactiva canónica**: Restaurada la presentación en 5 columnas/conceptos (*Día de oficina*, *Día de obra*, *Franco de obra trab.*, *Franco de ofic. trab.*, *Feriado trabajado*), con badges de conteo automático detectado, inputs directos para edición de días manuales (step 0.5 con botón `↺ Auto`), tarifas unitarias editables, subtotales reactivos y banner consolidado de total a liquidar.
- **Sincronización con perfil salarial**: Precarga automática de tarifas unitarias a partir de `costo_dia_ofi` y `costo_dia_obra` del usuario seleccionado en PostgreSQL.
- **Exportación oficial en Excel**: Generación de planilla detallada de liquidación con detalle por proyecto y jornada.

### ⚙️ Carga y Gestión de Tarifas de Roster (`[FN-07.11]`)
- **Modal de tarifas de roster**: Implementado `RosterTarifaModal` accesible desde la barra de herramientas de `RosterView`. Presenta selector desplegable para seleccionar el proyecto y campos para las tarifas respectivas.
- **Campos obligatorios y opcionales**: Únicos campos obligatorios: `dia_normal` y `dia_domingo` ($\ge 0$). Campos opcionales: `subida`, `bajada` y `adicional_turno` (con valor por defecto 0).
- **Persistencia en PostgreSQL**: Integración con `app_rrhh.b_1_tarifas_roster`, activando automáticamente la nueva tarifa y desactivando tarifas precedentes mediante el trigger nativo de base de datos.

### 👥 Módulo de Administración de Usuarios y Sueldos Base (`[FN-07.12]`)
- **Módulo con control RBAC**: Vista `UsersManagementView` y acceso en header/menú principal restringido exclusivamente a roles `admin` y `sub_admin` (`puedeGestionarUsuarios`).
- **Lista integral y filtrado**: Visualización completa de todos los usuarios (activos e inactivos), con buscador por texto, filtro por área y estado, badges de rol RBAC y sueldos base mensual de oficina y obra.
- **Modal de edición y recálculo salarial**: Permite modificar datos personales (nombre, apellido, DNI, email), área, rol de aplicación, estado activo/baja y sueldos base (`sueldo_oficina`, `sueldo_obra`, `lugar_habitual`). Al persistir en `app_rrhh.a_1_sueldos_base`, PostgreSQL recalcula de inmediato los costos diarios `costo_dia_ofi` y `costo_dia_obra`.

## [2.0.0] - 2026-10-26

- [MOD-07] Migración de persistencia SQLite/Google Sheets a PostgreSQL mediante psycopg2, pool transaccional y consultas parametrizadas; conserva todas las firmas públicas de ApiPuente.
- Introspección del esquema real y adaptación a nombre/apellido/correo y codificacion_serv. Roles exclusivamente desde rol_app, sin elevación por identidad.
- Roster individual/múltiple atómico: solo escribe b_1_roster; triggers generan asistencias y viáticos. Joins históricos por id_tarifa, Gantt con total_viaticos, Bajada último Campo y Subida último Franco.
- Vacaciones/Licencia admiten Oficina/Obra y costo manual incluido cero. Liquidación mensual y adicionales se leen del servidor; tarjeta TypeScript estricta y TanStack Query, exportaciones sin recálculos.
- Se retiran sincronización, cachés operativas y limpieza Sheets. El usuario decidió bloquear eliminaciones hasta disponer de borrado lógico. Capacidades sin columnas de destino se informan como no disponibles.
- Se creó una base PostgreSQL de pruebas separada, sin datos operativos y con transacciones revertidas. El defecto de reentrada salarial del trigger se reprodujo allí, se corrigió y se aplicó al operativo con autorización explícita; se conserva reversión SQL.
- Versión mayor por cambio de almacenamiento, reinicio de sesión al abrir y nuevo formato de exportación canónica. No se importaron registros históricos de SQLite/Sheets.
- Verificación: 45 pruebas de contrato e integración PostgreSQL, comprobación TypeScript, build a backend/dist sin errores y revisión de interfaz con datos sintéticos en escritorio/móvil. Detalles en POSTGRESQL_MIGRACION.md.

## [1.19.0] - 2026-10-14

### 🛡️ Arquitectura Robusta de Manejo Centralizado de Errores y Logging (`[FN-00.03]`)
- **Logging Estructurado y Diagnóstico con Loguru**:
  - Incorporación de `backend/error_handler.py` con configuración centralizada de `loguru`: salida enriquecida en consola y archivo rotativo en `logs/app_errors.log` (rotación 10 MB, retención 10 días, compresión zip, diagnóstico y backtrace habilitados).
- **Persistencia Transaccional y Traducción Granular de Excepciones**:
  - Implementación del context manager `transaccion_db(conn)` que asegura `commit` automático o `rollback` inmediato, eliminando conexiones *idle in transaction*.
  - Captura granular y traducción semántica de violaciones de PostgreSQL (`psycopg2` / `psycopg`) y SQLite (`UniqueViolation` a `RegistroDuplicadoError`, `ForeignKeyViolation` a `ValidacionError`, `OperationalError` a `DatabaseTransactionError`).
- **Decorador Unificado y Contrato Canónico de API**:
  - Decorador `@manejar_errores_api` con soporte para funciones síncronas y asíncronas.
  - Captura y formateo amigable de errores de validación de Pydantic (`ValidationError`), excepciones de dominio y captura de excepciones no controladas con `logger.exception()`.
  - Estandarización del contrato de salida: `{"exito": bool, "datos": any, "error": str | None, "codigo_error": str | None}`.
- **Frontend Resiliente y Notificaciones Elegantes con Sonner**:
  - Creación del componente `frontend/src/components/ErrorFallback.jsx` integrado con `react-error-boundary` y cumplimiento estricto de accesibilidad WCAG 2.2 (`touch-target` >= 44px).
  - Actualización de `frontend/src/services/apiBridge.js` mediante un `Proxy` interceptor que detecta automáticamente `if (!respuesta.exito)` y dispara `toast.error(respuesta.error)` de `sonner`, eliminando diálogos `alert()` nativos bloqueantes.
  - Montaje de `<Toaster />` corporativo en la raíz de `frontend/src/App.jsx`.

## [1.18.1] - 2026-10-14

### 💰 Corrección de Cálculo Salarial en Días Feriados No Trabajados (`[FN-06.04]`)
- **Neutralización de Recargo en Feriados No Trabajados**:
  - Corrección de `calcular_costo_dia_asistencia` en `backend/main.py` y `backend/sheets_service.py`: cuando `tipo_ocf` corresponde a días no laborados (`Franco`, `Licencia`, `Vacaciones`), la presencia de `feriado = "SI"` NO multiplica el valor por `2.0`, preservando su tarifa salarial base (`costo_dia_obra` para Francos de Campo/Roster, `costo_dia_ofi` para Francos de Oficina, y `0.0` para Licencias/Vacaciones).
  - El multiplicador por feriado trabajado (`x2.0`) se aplica exclusivamente a jornadas efectivamente laboradas (`Campo`, `Roster`, `Oficina`, `Franco Trabajado`, etc.).
  - Actualización defensiva en `_guardar_roster_interno` (`backend/main.py`) para invocar el cálculo con `feriado = "NO"` en turnos de Franco y Licencia/Vacaciones.
- **Saneamiento Automático en Base de Datos y Replicación a Google Sheets**:
  - Actualización de `reparar_costos_salariales_historial` en `backend/database.py` para contrastar en memoria las jornadas con `feriado = "SI"` bajo modalidades no trabajadas. Si el valor en `costo_dia` registra el recargo duplicado anterior, se normaliza al costo base y se estampa `sincronizado = 0` para su replicación automática a la hoja remota `1_asistencia_informada`.
  - Reubicación de la llamada de saneamiento al finalizar la transacción de `inicializar_bd` para garantizar visibilidad atómica de tablas sin advertencias de bloqueo en bases de datos nuevas.

## [1.18.0] - 2026-10-13

### 🎨 Sistema de Diseño Ingeap y Accesibilidad WCAG 2.2 (`[FN-07.01]`)
- **Centralización de Tokens Semánticos Corporativos**:
  - Declaración de variables oficiales en `:root` y `[data-theme='dark']` en `frontend/src/index.css`:
    - Color Primario: `--brand-red: #cc3333;`, `--brand-red-hover: #b32a2a;`, `--brand-red-active: #992424;`
    - Color Secundario: `--brand-gray: #999999;`, `--brand-gray-light: #e5e7eb;`, `--brand-gray-border: #cbd5e1;`
    - Escalas cromáticas y auras semánticas unificadas con `--primary: var(--brand-red)`.
- **Accesibilidad Operativa en Campo (WCAG 2.2 Target Size)**:
  - Fijación de área táctil mínima de 44px (`--touch-min-size: 44px`) para garantizar operatividad con guantes y pantallas táctiles en campo.
  - Aplicación de `min-height: var(--touch-min-size)` a todos los controles interactivos primarios: botones de envío (`.btn-submit`), navegación (`.tab-btn`, `.btn-back`), opciones de formulario (`.form-input`, `.form-select`, `.jornada-btn`, `.location-btn`, `.division-mode-btn`), selectores de Roster (`.roster-input`, `.roster-select`, `.btn-type-pill`) y acciones modales (`.btn-modal-confirm`, `.btn-modal-cancel`, `.btn-modal-delete`).
- **Saneamiento de Especificidad CSS y Utilidades de Alto Contraste**:
  - Eliminación de reglas desbalanceadas con `!important` en el layout corporativo (ej. `.home-container max-width`).
  - Creación de utilidades reutilizables: `.touch-target`, `.high-contrast-field`, `.btn-brand-primary`, `.btn-brand-secondary` y badges cromáticos (`.brand-badge-red`, `.brand-badge-gray`) optimizados para visualización bajo luz solar directa.

## [1.17.4] - 2026-10-13

### 🚜 Roster: Cómputo de Francos en Modalidad Campo y Persistencia Local de Tarifas (`[FN-03.11]`)
- **Turnos de Franco de Roster como Modalidad Campo**:
  - Al cargar un turno de modalidad 'Franco' en Roster, el valor guardado en `tipo_costo` (`tipo_dia`) se fija determinísticamente en `'Campo'` y `costo_dia` adopta el valor de jornada de campo del empleado (`costo_dia_obra`), no el valor de oficina.
  - Actualización de `_guardar_roster_interno` en `backend/main.py` para invocar `calcular_costo_dia_asistencia(..., tipo_costo="Campo")` cuando `tipo_norm == "Franco"`.
  - Normalización defensiva en `backend/database.py`: las rutinas de inicio excluyen los francos de Roster de la reasignación de fin de semana y la rutina `reparar_costos_salariales_historial` actualiza a `'Campo'` con `costo_dia_obra` cualquier jornada de franco asociada a turnos de Roster.
- **Persistencia Local Exclusiva de Tarifas de Roster en Ventana de Modificación**:
  - En la ventana modal de edición/modificación de turnos en el diagrama Gantt (`RosterGanttChart`), el botón de asignación de tarifas oficiales guarda inmediatamente `precio_dia` y `precio_domingo` en la base de datos local SQLite (`rosters` table) mediante el endpoint `aplicar_tarifa_local_roster`.
  - Se garantiza que esta operación no muta la tabla de asistencias (`historial`) ni envía peticiones de sincronización a Google Sheets, permitiendo la reactividad inmediata del Gantt y la correcta exportación del archivo `.xlsx` oficial por proyecto.

## [1.17.3] - 2026-10-13

### 🧩 Modularización de Frontend: Descomposición de OtherEmployeesHistoryView (`[FN-02.03]`)
- **Descomposición Modular de OtherEmployeesHistoryView**:
  - `OtherEmployeesHistoryView.jsx` pasa de 3,426 líneas a ~680 líneas, estructurándose como un orquestador limpio y desacoplado.
  - Creación de `frontend/src/components/history/historyConstants.js`: Centraliza listas de modalidades (`LUGARES_OPCIONES`), áreas corporativas (`LISTADO_AREAS_CORPORATIVAS`), tipos de licencia, utilidades de badge (`getBadgeClassLugar`), iniciales de usuario y la función canónica de categorización de liquidación (`categorizarRegistroLiquidacion`).
  - Creación de `frontend/src/components/history/HistoryTopBar.jsx`: Barra superior con navegación, estado de sincronización automática en segundo plano y acciones de actualización/limpieza.
  - Creación de `frontend/src/components/history/HistoryRecordsList.jsx`: Panel izquierdo con filtros de búsqueda, selección por empleado/mes visible, asignación masiva de costos y tarjetas de registros interactivos.
  - Creación de `frontend/src/components/history/HistoryAuditCalendar.jsx`: Panel interactivo de auditoría mensual con selector de colaborador, grilla de días, insignias de estado/modificación, barra flotante de asignación de costos y referencias cromáticas.
  - Creación de `frontend/src/components/history/HistoryLiquidationCard.jsx`: Calculadora de liquidación para RRHH con detección automática de días, soporte para modificaciones manuales en incrementos de 0.5 días, cálculo de subtotales/totales y exportación oficial a Excel.
  - Creación de subcomponentes modales dedicados en `frontend/src/components/history/`:
    - `HistoryDayRecordsModal.jsx`: Modal de desglose de múltiples registros por día.
    - `HistoryEditRecordModal.jsx`: Modal de modificación con lógica condicional de modalidad y servicio.
    - `HistoryDeleteRecordModal.jsx`: Modal de confirmación destructiva.
    - `HistoryDiffModal.jsx`: Panel flotante comparativo dividido (*split-view*) antes/después con historial de modificaciones y acción de "Marcar como Revisado".
    - `HistoryCostDayModal.jsx`: Modal exclusivo e independiente para la edición manual del `costo_dia`.
- **Preservación Estricta de Compatibilidad y Arquitectura**:
  - Se mantiene la re-exportación de `categorizarRegistroLiquidacion` desde `OtherEmployeesHistoryView.jsx`.
  - Integridad de todos los flujos nativos con SQLite WAL, `ApiPuente` y sincronización en segundo plano con Google Sheets sin alteraciones a la capa backend.

## [1.17.2] - 2026-10-13

### 🧩 Modularización de Frontend: RosterView y Asignación de Tarifas en Gantt (`[FN-03.10]`)
- **Descomposición Modular de RosterView**:
  - `RosterView.jsx` pasa de 1,885 líneas a ~470 líneas, actuando como un orquestador limpio de estado y comunicación.
  - Creación de `frontend/src/components/roster/rosterConstants.js`: Centraliza lista canónica de colaboradores de Ingeniería, normalizador de texto y función de búsqueda de tarifas.
  - Creación de `frontend/src/components/roster/RosterEmployeeChecklist.jsx`: Componente visual para selección múltiple de colaboradores con botones de acción rápida.
  - Creación de `frontend/src/components/roster/RosterShiftForm.jsx`: Componente para la carga continua de turnos, proyectos y visualización de tarifas reglamentarias.
  - Creación de `frontend/src/components/roster/RosterGanttChart.jsx`: Componente especializado para el diagrama Gantt, navegación de meses, zoom de columnas y modales.
- **Asignación Rápida de Tarifas en Modal de Edición Gantt**:
  - Incorporación del botón `⚡ Asignar tarifas oficiales al turno` en la ventana de detalle/modificación de turnos del Gantt.
  - Carga reactiva de las tarifas vigentes del proyecto (`1_2_tarifas_roster`) en los campos de edición en memoria, **sin crear nuevos registros en la base de datos**. Los valores se persisten únicamente cuando el operador pulsa "Guardar Modificación".
- **Corrección de Footers de Modales**:
  - Corrección del modal de exportación a Excel, desacoplándolo de acciones de eliminación o modificación accidental.

## [1.17.1] - 2026-10-09

### 🐛 Desacoplamiento de Tarifas de Roster y Protección de 'costo_dia' (`[FN-03.08]`, `[FN-06.04]`)
- **Separación Estricta de Costo Salarial y Viáticos de Proyecto**:
  - Corrección de la persistencia al asignar Roster en `backend/main.py`: la columna `costo_dia` de la tabla remota `1_asistencia_informada` (Google Sheets) y de la tabla local `historial` (SQLite) refleja **exclusivamente el sueldo diario del empleado** según sus tarifas base:
    - `costo_dia_obra` para jornadas en 'Campo' (Roster).
    - `costo_dia_ofi` para jornadas en 'Oficina' o 'Franco'.
    - 0.0 para 'Licencia' o 'Vacaciones'.
    - Multiplicadores salariales oficiales (Feriado x2.0, Franco trabajado x1.5).
  - Prohibición estricta de asentar viáticos o tarifas de proyecto (`1_2_tarifas_roster`: subida, bajada, domingo, día normal, adicionales) en la columna `costo_dia` de asistencias.
- **Confinamiento de Viáticos Operativos a SQLite y Exportación**:
  - Las tarifas operativas de `1_2_tarifas_roster` se persisten exclusivamente en la tabla local SQLite `rosters` (`precio_dia`, `precio_domingo`) y en `tarifas_roster_cache` para consumo de la UI (`RosterView`) y la exportación de liquidación en Excel (`.xlsx` vía `openpyxl`).
- **Autosaneamiento de Historial Preexistente**:
  - Incorporación de la rutina `reparar_costos_salariales_historial()` en `backend/database.py` y `ApiPuente` para normalizar registros preexistentes de Roster que hayan sido contaminados con viáticos de proyecto, marcándolos para sincronización limpia con Google Sheets.

## [1.17.0] - 2026-10-09

### 🏢 Área Dirección (D): Nueva Área y Control de Acceso RBAC (`[FN-01.12]`)
- **Incorporación del Área Dirección (`'D'` / `'Dirección'`)**:
  - Incorporación del identificador `'D'` y denominación `'Dirección'` en el mapeo de áreas corporativas (`MAPA_AREAS`).
- **Control Estricto de Visibilidad por Rol**:
  - La opción de área `'Dirección'` es visible exclusivamente para colaboradores con roles de gestión y supervisión (`admin`, `sub_admin`, `core`).
  - Ocultamiento estricto e inaccesibilidad para roles técnicos y operativos estándar (`user_1`, `user_2`) en todos los selectores del formulario de reporte diario.
- **Normalización Canónica de Servicio Imputado**:
  - Al seleccionar Dirección y registrar el reporte, el servicio se asienta exactamente bajo la cadena: `'Dedicado al area - Dirección'` para la sincronización con Google Sheets y almacenamiento local en SQLite.
- **Actualización de Rol de Usuario**:
  - Asignación de rol `core` para el colaborador Alejandro Maglianesi en el padrón de empleados autorizados.
- **Compilación de Binarios PE e Instalador**:
  - Empaquetado de la aplicación de escritorio (`CheckDiarioIngeap.exe`) e instalador monobloque (`Instalador_CheckDiario_Ingeap.exe`) actualizados a versión v1.17.0.

## [1.16.1] - 2026-10-08

### 💰 Liquidación: Regla de Registro Único Diario por Categoría (`[FN-06.05]`)
- **Imputación No Fraccionada y Registro Único por Día**:
  - En la generación del informe y archivo Excel de liquidación (`handleDescargarInformeLiquidacion`), se computa **un único (1) registro por día y categoría** en caso de que existan múltiples registros del mismo tipo en una misma fecha (ej. dos jornadas de oficina).
  - Eliminación definitiva del fraccionamiento proporcional de costos entre proyectos (`tarifa * hrs / totHrs`). El costo asignado es íntegro por día para la categoría, independiente de los proyectos registrados.
  - En jornadas donde coexisten modalidades de oficina y campo en el mismo día, cada modalidad computa su día con su respectivo valor y **los importes diarios se suman**.

### 📊 Gráfico Gantt de Roster: Exclusividad Canónica de 10 Colaboradores (`[FN-03.09]`)
- **Restricción a Colaboradores Autorizados de Ingeniería**:
  - La grilla del gráfico Gantt limita su universo de colaboradores exclusivamente a los 10 colaboradores autorizados:
    1. Gabriel Juarez
    2. Maximiliano Kromm
    3. Fernando Aimar
    4. Norberto José Luis Botto
    5. Ivan Emanuel Altamirano
    6. Alejo Ferrero
    7. Facundo Ezequiel Calgaro
    8. Rodolfo Julian Lescano
    9. Agustina Ferrante
    10. José María Zufiaurre
- **Filtrado Reactivo por Proyecto en el Gantt**:
  - Al seleccionar un proyecto específico en el selector del Gantt (`filtroProyectoGantt !== 'TODOS'`), la lista filtra dinámicamente para mostrar **únicamente a los colaboradores que tengan registros asignados a ese proyecto** en el período visualizado.

### 📋 Carga de Roster: Búsqueda Exacta de Tarifas por ID y Denominación (`[FN-03.08]`)
- **Vinculación Oficial de Tarifas con `1_2_tarifas_roster`**:
  - Búsqueda exacta y prioritaria en la tabla `1_2_tarifas_roster` mediante `buscarTarifaRoster`, emparejando de forma concurrente el `id_proyecto` y la denominación del proyecto seleccionado tanto en el formulario de creación como en la edición de turnos.

## [1.16.0] - 2026-10-08

### 🐛 Corrección Crítica: Fines de Semana a Franco (`[FN-01.11]`)
- **Imputación Estricta de Costo de Oficina en Fines de Semana**:
  - Corrección de la acción "Fines de semana a franco" en `frontend/src/components/HistoryView.jsx` y `backend/main.py`: los sábados y domingos convertidos a franco se guardan estrictamente con `tipo_costo = 'Oficina'` y `costo_dia = costo_dia_ofi` (o tarifa de oficina correspondiente al colaborador).
  - Persistencia asegurada en base de datos local SQLite (`historial`) y sincronización remota hacia Google Sheets (`1_asistencia_informada`).
  - Migración correctiva defensiva en `backend/database.py` para reparar registros preexistentes de fines de semana franco guardados erróneamente como 'Campo'.

### 📋 Módulo de Roster e Integración con `1_2_tarifas_roster` (`[FN-03.08]`)
- **Depuración de Navegación**:
  - Ocultamiento de accesos obsoletos a "Historial de Roster" en `HomeView.jsx` y `RpgTavernBoard.jsx` por encontrarse en desuso.
- **Sincronización y Enlace de Tarifas Roster**:
  - Lectura e introspección de la tabla `1_2_tarifas_roster` en Google Sheets (`sheets_service.py`) y persistencia en caché local `tarifas_roster_cache` con índices optimizados en SQLite (`database.py`).
  - Vinculación automática de tarifas al guardar rangos de Roster mediante `id_proyecto`:
    - **Modalidad Campo**: El primer día (`fecha_desde`) toma tarifa de `subida` sumando el concepto de `adicionales` (aplicado exactamente 1 vez por rango cargado). Los domingos toman la tarifa de `domingo` y los días hábiles toman la tarifa de `dia_normal`.
    - **Modalidad Franco**: El primer día (`fecha_desde`) toma tarifa de `bajada`. Los días restantes toman la tarifa de descanso correspondiente.
  - Persistencia de los valores calculados en las columnas canónicas `costo_dia` y `tipo_costo` sin alterar el esquema de columnas de `1_asistencia_informada`.
- **Vista Gantt con Distintivos Destacados**:
  - Identificadores visuales resaltados y badges específicos para días de **Subida** (`.bar-subida`, `⬆S`) y **Bajada** (`.bar-bajada`, `⬇B`) con leyenda explicativa interactiva.

### 💰 Historial de Empleados, Edición de Costo y Calculadora de Liquidación (`[FN-06.06]`, `[FN-06.07]`)
- **Visualización Diaria de Costo en Calendario (`[FN-06.07]`)**:
  - Despliegue del valor acumulado de `costo_dia` en cada celda diaria interactiva del calendario de auditoría de otros empleados.
  - Distintivos cromáticos (`.cell-costo-dia-badge`) indicando valores positivos y días sin costo computado.
- **Modal Independiente y Exclusivo de Edición de `costo_dia` (`[FN-06.07]`)**:
  - Modal separado de la edición integral de la jornada, permitiendo ajustar directamente el monto de `costo_dia`, elegir el registro específico si hay jornadas mixtas, aplicar tarifas sugeridas del empleado y registrar observaciones.
  - Impacto directo en SQLite local, Google Sheets (`1_asistencia_informada`) y registro de auditoría (`modificaciones_realizadas`).
- **Calculadora de Liquidación por `costo_dia` Asentado (`[FN-06.06]`)**:
  - Cálculo automático de subtotales y total a liquidar fundamentado **únicamente en los valores asentados en la columna `costo_dia`** de los registros seleccionados.
  - Preservación íntegra de la sobreescritura manual de días y tarifas para excepciones operativas de RRHH.

### 🛠️ Correcciones de Estabilidad en Roster y Liquidación (`[FN-03.08]`, `[FN-03.09]`, `[FN-06.06]`, `[FN-06.07]`)
- **Tarifas de Roster en Modo Solo Lectura (`[FN-03.08]`)**:
  - Eliminación total de inputs de edición manual de tarifas (`precioDia`, `precioDomingo`) tanto en el formulario principal como en el modal de edición de turnos del Gantt.
  - Enlace automático contra `1_2_tarifas_roster` por `id_proyecto` y denominación, y presentación mediante tarjeta informativa de solo lectura (`.tariffs-readonly-card`).
- **Filtrado Exclusivo de Colaboradores en Gantt (`[FN-03.09]`)**:
  - Filtrado riguroso antes de renderizar la grilla: solo se listan quienes pertenezcan al Área de Ingeniería (`'I'`, `'Ingeniería'`, `'Ingenieria'`) o tengan turnos activos en el mes visualizado.
  - Ocultamiento de colaboradores de otras áreas sin actividad planificada en el período.
- **Deduplicación de `costo_dia` en Jornadas Multiproyecto (`[FN-06.06]`)**:
  - Agrupación por clave `(fecha, categoría)` en el cómputo de la calculadora de liquidación y en el badge numérico de las celdas del calendario para computar el costo del día exactamente una vez por categoría, impidiendo sumas duplicadas cuando un colaborador registra múltiples proyectos en un mismo día.
- **Reactividad Inmediata al Editar `costo_dia` en el Calendario (`[FN-06.07]`)**:
  - Actualización optimista instantánea de los estados `registros`, `registrosEmpleadoAuditar` y `diaSeleccionadoAuditoria` tras resolver `actualizar_costo_dia_manual` / `guardar_costo_dia`, reflejando el nuevo valor en la celda del calendario de forma inmediata y cerrando el modal sin requerir recargar la vista.

### 📦 Empaquetado y Distribución de Ejecutables v1.16.0 (`[FN-00.01]`)
- **Recompilación Integral de la Aplicación y del Instalador Autónomo**:
  - Generación del ejecutable principal `instalador/CheckDiarioIngeap.exe` (27.6 MB) que incluye los bundles compilados de producción de React + Vite en `backend/dist`.
  - Generación del instalador monobloque autónomo `instalador/Instalador_CheckDiario_Ingeap.exe` (35.8 MB) con extracción a `LocalAppData\Ingeap\CheckDiario`, creación de accesos directos e inicio automático.
- **Estandarización de Metadatos de Versión Windows PE**:
  - Creación de `backend/file_version_info.txt` para estampar la versión `1.16.0.0` y metadatos de producto de Ingeap directamente en las propiedades de archivo de Windows de ambos ejecutables.
  - Actualización de diálogos de confirmación (`INSTALLER_VERSION = '1.16.0'`) en `backend/installer_app.py`, script `compilar_instalador.bat`, `LEEME_INSTALACION.txt` y `Instalar_Acceso_Directo.ps1`.

---

### 📝 Auditoría de Modificaciones Revisadas con 'OK' en Google Sheets y Desactivación Remota (`[FN-02.01]`, `[FN-02.02]`)
- **Extensión del Esquema Remoto en Google Sheets (`backend/sheets_service.py`)**:
  - Incorporación de la columna `revisado` como 11ª columna en `COLUMNAS_MODIFICACIONES` de la pestaña `1_1_modificaciones_realizadas`.
  - Detección defensiva de la columna `revisado` al inspeccionar encabezados remotos e inserción automática si estuviera ausente.
- **Sincronización de Marcado 'OK' al Marcar Modificaciones (`backend/sheets_service.py`, `backend/main.py`)**:
  - Implementación de `actualizar_revisado_en_sheets(ids_modificacion)` utilizando actualizaciones en lote `batch_update` para escribir `'OK'` en la celda de la columna `revisado` correspondiente al ID de modificación auditado.
  - Despacho en segundo plano asíncrono (`threading.Thread`) desde `marcar_modificacion_revisada`, `marcar_modificacion_por_asistencia_revisada` y `marcar_todas_modificaciones_revisadas` en `backend/main.py` para garantizar fluidez en la interfaz de usuario.
  - Incorporación del valor `'OK'` (o vacío `""`) al insertar nuevas modificaciones pendientes en `sincronizar_modificaciones_pendientes`.
- **Desactivación Automática de Notificaciones para el Resto de los Administradores (`backend/sheets_service.py`, `backend/main.py`)**:
  - Actualización de `descargar_modificaciones_desde_sheets`: al descargar modificaciones periódicamente (o en refresco de catálogos), si una modificación existente registra `'OK'` remotamente, se actualiza la base local SQLite a `revisado = 1`.
  - Como el endpoint `obtener_notificaciones_modificaciones` filtra exclusivamente registros con `revisado = 0`, la alerta y banner desaparece automáticamente de las sesiones de los demás administradores.
- **Persistencia y Resiliencia Offline en SQLite (`backend/database.py`)**:
  - Migración defensiva de la columna `revisado_sincronizado INTEGER DEFAULT 1` en la tabla `modificaciones_realizadas`.
  - Helpers `obtener_modificaciones_pendientes_revisado` y `marcar_modificaciones_revisado_sincronizadas` para reintentar la subida a Google Sheets en ciclos de sincronización subsecuentes en caso de intermitencia de red.

---

## [1.15.0] - 2026-10-07

### 📅 Asignación Asistida de Fines de Semana a Franco en Historial Propio para Todos los Roles (`[FN-01.11]`)
- **Apertura Universal de la Acción en Historial Personal (`frontend/src/components/HistoryView.jsx`)**:
  - Habilitación del botón "Fines de Semana a Franco" para todos los roles activos (`admin`, `sub_admin`, `core`, `user_1`, `user_2`) en la vista de historial propio.
  - Eliminación de la restricción de visibilidad `esRRHHoAplicaciones` que limitaba la funcionalidad exclusivamente a personal de RRHH y Aplicaciones.
- **Resolución Determinista y Dinámica de Área (`[FN-01.11]`)**:
  - Implementación del diccionario semántico `MAPA_AREAS` en `HistoryView.jsx` contemplando códigos abreviados y denominaciones oficiales (`A` -> Aplicaciones, `N` -> Núcleo, `I` -> Ingeniería, `M` -> Mensura, `S` -> SIG, `RRHH` -> RRHH, `VYM` -> Ventas y Marketing).
  - Imputación fiel del área de adscripción del colaborador en el modal informativo y en el payload del reporte (0 hs computadas a su respectiva área).
- **Habilitación de Carga Asistida en Backend (`backend/main.py`)**:
  - Adaptación de la validación de rangos de fechas en `guardar_check_diario` para autorizar la inserción en lote de múltiples fechas cuando correspondan a fines de semana (sábados y domingos) bajo modalidad `Franco` para el propio usuario en sesión.
  - Preservación estricta de barreras de seguridad RBAC: bloqueo de rangos arbitrarios para días de semana en modalidades `Campo`, `Oficina`, `Vacaciones` o `Licencia` a roles sin facultades administrativas, e imposibilidad de mutar registros de otros colaboradores.
  - Forzado transparente de modalidad `Franco de Oficina` (0.0 hs) para roles estándar (`core`, `user_1`, `user_2`), persistencia atómica en SQLite con `sincronizado = 0` y sincronización asíncrona hacia Google Sheets.

---

## [1.14.1] - 2026-10-06

### 🛠️ Concurrencia SQLite WAL, Timeouts Defensivos y Manejo de Bloqueos en Roster (`[FN-03.06]`, `[FN-03.07]`)
- **Modo WAL y Pragma Busy Timeout en SQLite (`[FN-03.06]`)**:
  - Habilitación de `PRAGMA journal_mode = WAL;` y `PRAGMA synchronous = NORMAL;` en `obtener_conexion()` (`backend/database.py`), desacoplando lectores de escritores y permitiendo lecturas concurrentes sin colisionar con operaciones de escritura.
  - Configuración de `timeout = 30.0` en la llamada a `sqlite3.connect` y asignación de `PRAGMA busy_timeout = 30000;`, otorgando hasta 30 segundos de espera pasiva en cola nativa de SQLite antes de abortar transacciones.
- **Mecanismo Defensivo de Reintentos con Backoff Exponencial (`[FN-03.07]`)**:
  - Implementación de `ejecutar_con_reintentos_db` en `backend/database.py` para reintentar operaciones de escritura con retroceso exponencial ante excepciones transitorias `OperationalError: database is locked`.
  - Encapsulación de `guardar_roster` (`_guardar_roster_interno`) y `eliminar_roster` (`_operacion_eliminar`) bajo `ejecutar_con_reintentos_db` en `backend/main.py`.
- **Segmentación de Transacciones en Sincronización Remota (`backend/sheets_service.py`)**:
  - Incorporación de commits intermedios por lotes de 150 registros en `sincronizar_desde_sheets_hacia_local`, liberando bloqueos exclusivos de escritura y evitando retención prolongada del cerrojo de base de datos durante sincronizaciones voluminosas.
- **Normalización de Avisos en Interfaz de Roster (`frontend/src/components/RosterView.jsx`)**:
  - Manejo de excepciones amigable para el operador de RRHH ante contención de base de datos, evitando alertas crudas del motor SQLite.

---

## [1.14.0] - 2026-10-02

### 🛡️ Sistema de Control de Acceso y Roles de Usuario RBAC (`[FN-04.11]`)
- **Implementación de Roles de Aplicación (`0_usuarios.rol_app`)**:
  - Incorporación y sincronización de la columna `rol_app` desde la hoja `0_usuarios` de Google Sheets hacia la caché local SQLite (`usuarios_cache`, `sesion` y `perfiles_empleados`).
  - Normalización determinista de roles con fallbacks defensivos por área o identidad histórica.
- **Definición de Roles y Reglas de Visualización**:
  - **`admin`**: Acceso integral y sin restricciones a todos los módulos del sistema (registro diario propio y delegado, historial personal y global, Roster, calculadora salarial, revisión de modificaciones, gestión de tipos de costo y rangos de fechas).
  - **`sub_admin`**: Acceso a registro diario e historial personal, visualización de actividad de ayer y gestión completa de RRHH (planificación de Roster, calculadora de liquidación salarial, historial de otros colaboradores con edición y eliminación, y revisión de modificaciones).
  - **`core`**: Acceso a registro diario e historial personal con facultad para elegir "Campo", widget de actividad de ayer y acceso de **solo lectura** al historial de otros colaboradores (sin edición, sin eliminación, sin calculadora salarial, sin gestión de tipos de costo ni revisión de modificaciones).
  - **`user_1`**: Acceso a registro diario e historial personal con facultad para seleccionar jornada de "Campo". Los días "Franco" se computan y guardan automáticamente como franco de oficina (0 hs imputadas al área), ocultando subtipos avanzados.
  - **`user_2`**: Acceso a registro diario e historial personal restringido estrictamente a modalidades de "Oficina" y "Franco" (**sin posibilidad de seleccionar "Campo"**). Los días "Franco" se computan y guardan automáticamente como franco de oficina (0 hs), ocultando subtipos avanzados.
- **Validaciones de Seguridad en Backend (`backend/main.py`)**:
  - `guardar_check_diario`: denegación inmediata si `user_2` intenta registrar "Campo", forzado automático de Franco de Oficina para roles sin privilegios administrativos, y bloqueo de rangos de fechas o cargas delegadas no autorizadas.
  - Sincronización en caliente: `refrescar_catalogos_sheets` actualiza el rol en la sesión activa al detectar cambios de `rol_app` en Google Sheets.
- **Correcciones de Interfaz y Estabilidad (`[FN-04.11-FIX]`)**:
  - Corrección de `ReferenceError: esRRHH is not defined` en `CheckForm.jsx` reemplazando llamadas obsoletas por `puedeDelegarCarga` y `esAdminOSubAdmin`.
  - Garantía de Precedencia Determinista: la resolución de roles en frontend (`permissions.js`) y backend (`main.py`, `database.py`, `sheets_service.py`) evalúa primero la identidad de los administradores y gestores (`esIvanValentin` -> `admin`, `esJustinaBertolozzi` -> `sub_admin`), evitando que sesiones locales preexistentes con valor por defecto `'user_1'` degraden la visualización completa de los módulos de la aplicación.
  - Sincronización bidireccional en `guardar_usuarios_cache` que actualiza automáticamente `sesion.rol_app` y `perfiles_empleados.rol_app`.
  - Habilitación de modalidades completas (`LUGARES_OPCIONES`) para `admin` y `sub_admin` en el modal de edición de `HistoryView.jsx`.

---

## [1.13.0] - 2026-10-01

### ⚖️ Unificación de Vistas de Historial y Cómputo de Costos en Calculadora de Liquidación
- **Sincronización Total del Historial Personal (`[FN-06.06]`)**:
  - Corrección en `obtener_ultimos_registros` (`backend/database.py` y `backend/main.py`): el límite anterior de 35 registros truncaba los días anteriores de colaboradores activos con múltiples registros diarios o historial extendido, provocando que días del mes en curso (como los primeros días de septiembre) no aparecieran en el calendario personal de `HistoryView.jsx` mientras sí se visualizaban en la auditoría de `OtherEmployeesHistoryView.jsx`.
  - Se amplió el límite a 5000 registros, se ordenó estrictamente por `fecha DESC, id DESC` y se integró el enriquecimiento de auditoría de modificaciones (`_enriquecer_registros_con_modificaciones`), garantizando paridad exacta de datos entre vistas.
- **Regla Estricta de Liquidación por Tipo y Día (`[FN-06.06]`)**:
  - Se unificó el cálculo de la Calculadora de Liquidación para cumplir con la regla de negocio:
    - *Mismo tipo en el mismo día*: múltiples registros con la misma modalidad o tipo de costo (ej. 2 proyectos de oficina como Inventario y Aplicaciones) computan como **1 solo día** de esa categoría para el cálculo salarial.
    - *Tipos distintos en el mismo día*: si coexisten registros de modalidades combinadas (ej. oficina y campo en la misma jornada), **se computan ambos conceptos** de manera independiente para la liquidación.
  - Corrección del modo automático: se eliminó la sobreescritura errónea que sumaba de forma lineal la columna `costo_dia` de registros fragmentados duplicando costos diarios. Ahora los subtotales reflejan rigurosamente `cant_dias * tarifa_diaria`.
- **Distribución Proporcional de Costos en Exportación Excel (`[FN-06.05]`)**:
  - En la generación del informe de Excel (`handleDescargarInformeLiquidacion` y `liquidacion_export.py`), cuando un colaborador imputa horas a múltiples proyectos dentro de la misma categoría en un mismo día, la tarifa diaria se distribuye proporcionalmente entre los proyectos en función de las horas trabajadas.
  - Se garantiza cuadratura matemática perfecta entre la tabla de conceptos generales, el total a liquidar, el monto imputado por proyecto y el detalle cronológico diario.
- **Asignación Proporcional en Registro Multiproyecto (`[FN-01.09]`)**:
  - En `guardar_check_diario` (`backend/main.py`), al guardar reportes diarios con múltiples proyectos en un solo paso, la columna `costo_dia` se almacena repartida proporcionalmente según las horas de cada proyecto sin inflar el importe del día.

---

## [1.12.0] - 2026-10-01

### 📑 Informes de Liquidación Ejecutivos, Fracciones de 0.5 Días, Francos Discriminados y Selector Enum de Servicios
- **Deduplicación Estricta por `id_asistencia` en Sincronización Remota (`[FN-03.05]`)**:
  - Corrección en la deduplicación remota de `sheets_service.py` (`deduplicar_hoja_remota`): anteriormente agrupaba por tuplas `(empleado, fecha, servicio)`, descartando registros legítimos de jornadas divididas en el mismo proyecto (ej. 4 hs turno mañana y 4 hs turno tarde).
  - La deduplicación ahora se basa estrictamente en el `id_asistencia` único. Se restauró el registro vespertino de 4 hs de Sergio Juarez tanto en Google Sheets como en la base de datos local SQLite.
- **Edición en Historial con Selector Enum de Servicios (`[FN-02.04]`)**:
  - En los modales de edición del historial personal (`HistoryView.jsx`) y de otros colaboradores (`OtherEmployeesHistoryView.jsx`), el campo de Servicio dejó de ser un input libre de texto y pasó a ser un `<select>` restringido y ordenado con las mismas opciones tipificadas del formulario de carga (proyectos activos, áreas internas y tipos de licencia).
- **Calculadora de Liquidación: Incrementos de 0.5 Días y Desglose de Francos Trabajados (`[FN-04.10]`)**:
  - Soporte para asignación manual con incrementos decimales de `0.5` (`step="0.5"`, ej. 6.5 días de oficina), recalculando de manera inmediata los costos y subtotales proporcionales.
  - Se dividió la ventana de "Franco trabajado" en dos conceptos de costo independientes y precisos:
    - *Franco de Obra Trabajado*: aplica tarifa al 150% del día de obra/campo (`costo_dia_obra * 1.5`).
    - *Franco de Oficina Trabajado*: aplica tarifa al 150% del día de oficina (`costo_dia_ofi * 1.5`).
- **Exportación de Informe de Liquidación para RRHH (`[FN-06.05]`)**:
  - Se añadió el botón *"Descargar Informe"* en la cabecera de la calculadora de liquidación para que los responsables de RRHH (`Justina Bertolozzi` e `Iván Valentin`) puedan generar y guardar un archivo de Excel `.xlsx` corporativo estilizado con la paleta Ingeap (`#C81E2B`).
  - El archivo incluye dos hojas:
    1. *Resumen Liquidación*: Encabezado institucional, datos del colaborador (nombre, DNI, área, email), período, desglose de las 5 categorías computadas con tarifas y subtotales, importe total a liquidar y tabla de proyectos/tareas imputadas con días, horas y montos acumulados.
    2. *Detalle Diario*: Auditoría cronológica completa del mes día por día (fecha, día de semana, modalidad, servicio, horas, tipo de costo e importe).

---

## [1.11.0] - 2026-10-01

### 🛡️ Restricción de Permisos de Liquidación, Asignación Manual Uniproyecto, Modo RPG Medieval para Aplicaciones y Catálogo Unificado I+M
- **Permisos de Calculadora de Liquidación (`[FN-04.09]`)**:
  - Restringida la visualización y operación de la Calculadora de Liquidación salarial exclusivamente a `Justina Bertolozzi` e `Iván Valentin`.
  - La tarjeta de liquidación y los subtítulos orientativos se ocultan por completo para cualquier otro perfil o rol de usuario en el historial.
- **Asignación Manual de Horas en Proyecto Único (`[FN-01.09]`)**:
  - En el formulario de registro diario (`CheckForm.jsx`), al seleccionar un único proyecto ahora se habilita la barra de alternancia de jornada (`Jornada estándar` vs `Asignar horas manuales`).
  - Permite a los colaboradores definir jornadas personalizadas con fracciones de hora (ej: 4 hs, 6 hs, etc.) para un solo proyecto sin forzar 8 hs fijas.
- **Modo RPG Medieval Exclusivo para el Área de Aplicaciones (`[FN-05.02]`)**:
  - Se adaptaron al estilo RPG Medieval las vistas del Historial de Otros Empleados (`OtherEmployeesHistoryView.jsx`), Roster de Guardias (`RosterView.jsx`) e Historial de Roster (`RosterHistoryView.jsx`), envolviéndolas en el Tablón de Madera de la Taberna con herrajes de hierro forjado, estandarte curvado de pergamino, títulos honoríficos dinámicos (`getTituloRpg`) y tipografía Cinzel.
  - La paleta y texturas de pergamino iluminado se extienden a la calculadora de liquidación y tablas de auditoría/Gantt.
  - Restricción estricta de tema: El tema RPG queda habilitado exclusivamente para el personal del Área de Aplicaciones (`A`) e Iván Valentin. Para cualquier otro usuario que intente seleccionarlo o lo tenga persistido, se sanitiza automáticamente a modo oscuro (`dark`).
  - Navegación bidireccional desde el Tablón de la Taberna (`RpgTavernBoard.jsx`) hacia Crónicas de Compañeros y Decreto de Guardias.
- **Catálogo Unificado de Proyectos para Ingeniería y Mensura (`[FN-01.10]`)**:
  - Al cargar o registrar reportes diarios para colaboradores de Ingeniería (`I`) o Mensura (`M`), el catálogo de proyectos activos retorna conjuntamente los proyectos de ambas áreas (`I` y `M`), facilitando la imputación de horas en proyectos donde ambos equipos trabajan de manera coordinada.
  - El selector de proyectos en el cliente categoriza el grupo bajo la etiqueta descriptiva *"📁 Proyectos Activos (Ingeniería y Mensura)"*.

---

## [1.10.0] - 2026-10-01

### 💼 Modificaciones visuales menores y ajustes para RRHH
- **Integración con Hoja 'CÁLCULO DE SUELDOS' y Mapeo de Costos Diarios (`[FN-01.08]`)**:
  - Conexión e introspección a la hoja de Google Sheets adicional `"CALCULO DE SUELDOS"` (ID: `1rBLHa44JeBlqtkUfKg6WO1EFdiChhvgUTng8GpZQdJo`, tabla: `sueldos_empleados`).
  - Mapeo relacional entre colaboradores (`0_usuarios`) y tarifas salariales mediante la clave de enlace `id_origen`.
  - Almacenamiento y persistencia en caché local SQLite (`usuarios_cache`) de las tarifas diarias `costo_dia_ofi` (oficina) y `costo_dia_obra` (campo/obra).
- **Reglas Estrictas de Negocio y Liquidación de `costo_dia` (`[FN-06.04]`)**:
  - Incorporación de la columna `costo_dia` (columna 18 / R en `1_asistencia_informada` y en tabla local `historial`).
  - Cálculo algorítmico automatizado en backend y frontend para altas y modificaciones según 7 reglas de asignación:
    1. *Día Ordinario de Oficina*: `tipo_costo = 'Oficina'`, `costo_dia = costo_dia_ofi`.
    2. *Día Ordinario de Campo*: `tipo_costo = 'Campo'`, `costo_dia = costo_dia_obra`.
    3. *Franco de Oficina*: `tipo_ocf == 'Franco'` y servicio interno (`vym`, `aplicaciones`, `administracion`, etc.) ➔ `tipo_costo = 'Oficina'`, `costo_dia = costo_dia_ofi`.
    4. *Franco de Obra*: `tipo_ocf == 'Franco'` y servicio u obra ➔ `tipo_costo = 'Campo'`, `costo_dia = costo_dia_obra`.
    5. *Franco de Oficina Trabajado*: `tipo_ocf == 'Franco Ofic Trabajado'` ➔ `tipo_costo = 'Oficina'`, recargo +50% (`costo_dia_ofi * 1.5`).
    6. *Franco de Obra Trabajado*: `tipo_ocf == 'Franco Obra Trabajado'` ➔ `tipo_costo = 'Campo'`, recargo +50% (`costo_dia_obra * 1.5`).
    7. *Feriado Trabajado*: `feriado == 'SI'` ➔ recargo +100% (`costo_base * 2.0`) sobre la tarifa base de oficina o de obra correspondiente.
  - Precisión numérica con redondeo a 2 decimales para sincronización bidireccional limpia con Google Sheets.
- **Segregación de Permisos y Control de Acceso (`[FN-04.06]`)**:
  - *Auditoría y Alertas de Modificaciones (`1_1_modificaciones_realizadas`)*: Visualización, panel comparativo, banners y consultas restringidas de forma exclusiva a `Justina Bertolozzi` e `Iván Valentin`. Bloqueo tanto a nivel frontend como en endpoints backend con validación de credenciales.
  - *Área Núcleo (Permisos de Solo Lectura)*: Colaboradores del Área Núcleo (`"N"`) acceden al historial de otros empleados exclusivamente con permisos de visualización/lectura, eliminando botones de edición, borrado y asignación masiva de costos.
  - *Módulo 'Actividad de ayer'*: Visibilidad y consulta del widget en el menú principal restringido a colaboradores del Área Núcleo (`"N"`), Área de Aplicaciones (`"A"`) y `Justina Bertolozzi`.
- **Mejoras en la Experiencia de Usuario e Interfaz React (`[FN-04.07]`)**:
  - *Login*: Actualizado placeholder del campo DNI a `"99999999"`.
  - *Control de Zoom Accesible*: Incorporado selector de escalado visual (`A-`, nivel porcentual interactivo, `A+`) en el encabezado general con rangos `90%`, `100%`, `110%` y `120%`, aplicando CSS nativo sobre `document.documentElement.style.zoom` y persistencia en `localStorage`.
- **Calculadora de Liquidación de RRHH Mejorada (`[FN-04.08]`)**:
  - La calculadora suma de forma directa y nativa los importes registrados en `costo_dia` para el período seleccionado.
  - Conserva intacto el modo de asignación manual de días y valores para excepciones y recálculos personalizados, con botón para restablecer a cálculo automático por costo día.

---

## [1.9.0] - 2026-09-30

### 📅 Libertad de Selección de Fechas en Registro Diario
- **Eliminación de la Restricción Semanal (`[FN-01.06]`)**:
  - Se eliminó el límite que restringía a los colaboradores a cargar o modificar reportes únicamente dentro de la semana activa en curso.
  - Todos los empleados tienen ahora total libertad para seleccionar y cargar reportes de cualquier fecha requerida sin bloqueos en el formulario ni en la edición.
  - Removidas las validaciones de fecha mínima tanto en el cliente (`CheckForm.jsx`) como en el servidor (`guardar_check_diario` y `modificar_registro` en `main.py`).

---

## [1.8.0] - 2026-09-30

### 🛡️ Panel Comparativo de Modificaciones, Restricción de Costos y Sincronización Proactiva
- **Panel Flotante Dividido Comparativo de Modificaciones (`[FN-02.04]`)**:
  - Diseñado panel modal panorámico dividido (split view) que confronta lado a lado los datos del registro:
    - **Lado Izquierdo (Anterior)**: Modalidad previa (`tipo_antes`), carga horaria (`horas_antes`) y proyecto/área (`servicio_antes`).
    - **Divisor Central**: Flecha de transformación con delta métrico de horas calculadas (`+hs`, `-hs` o `0 hs`).
    - **Lado Derecho (Posterior)**: Modalidad modificada (`tipo_despues`), jornada actualizada (`horas_despues`) y proyecto reasignado (`servicio_despues`), con etiquetas de alerta en cada campo que haya sufrido alteraciones.
  - Trazabilidad y auditoría de la tabla `1_1_modificaciones_realizadas`: muestra colaborador responsable de la modificación, fecha/hora exacta, historial de iteraciones mediante chips de línea de tiempo y resumen ejecutivo de cambios.
  - Accesos directos integrados: botón **"⚖️ Comparativa"** en tarjetas de la lista izquierda, botón en el modal del día de calendario y apertura automática al hacer clic en las notificaciones del banner superior.
  - Acciones directas dentro del panel: **"✓ Marcar como Revisado por RRHH"** y **"✏️ Editar Registro"**.
- **Restricción de Tipo de Costo (Exclusivo RRHH y Aplicaciones - `[FN-04.05]`)**:
  - En el Panel de Control de Empleados (`OtherEmployeesHistoryView`), solo el personal con rol de RRHH (Justina Bertolozzi) o Área de Aplicaciones / Admin (Iván Valentin) tiene permiso para visualizar y editar el tipo de costo.
  - Ocultamiento condicional de:
    - Barra flotante de asignación masiva de costo sobre el calendario (`calendar-floating-cost-toolbar`).
    - Checkboxes de selección por día en las celdas del calendario.
    - Barra de selección masiva en la columna izquierda (`bulk-selection-toolbar`).
    - Checkboxes de selección en las tarjetas individuales de la columna izquierda.
    - Badges informativos de costo (`badge-costo-campo` / `badge-costo-oficina`).
    - Campo selector de `tipo_costo` en el formulario de edición de asistencia.
  - Protección de seguridad en backend: validación estricta de credenciales en `actualizar_tipo_costo_masivo`.
- **Opción de Marcar como "Revisado" para RRHH**:
  - Incorporado botón interactivo **"✓ Marcar como Revisado"** tanto en el modal de detalle diario como en las tarjetas y el panel comparativo.
  - Al marcar como revisado, se actualiza `revisado = 1` en la tabla `modificaciones_realizadas` y se dispara el evento reactivo `catalogos-actualizados`, descartando la alerta en la vista activa, en el banner global y en la tarjeta de `HomeView`.
  - Distinción visual dual en calendario y eventos:
    - **Modificaciones pendientes**: indicador ámbar parpadeante (`✏️ MOD`).
    - **Modificaciones revisadas**: etiqueta y badge verde suave (`✓ REV`).
- **Transparencia y Tiempo de Espera en Sincronización con Google Sheets (`[FN-01.07]`)**:
  - Al cargar o modificar un reporte en `CheckForm`, se muestra una tarjeta de progreso con cuenta regresiva animada (~4 seg): *"Sincronizando con Google Sheets... No es necesario presionar 'Subir'"*, evitando clics repetitivos innecesarios.
  - En la barra de herramientas de `HistoryView` y `OtherEmployeesHistoryView`, cuando existen registros con `sincronizado = 0`, se incorpora un indicador visual de fondo (`sync-dot-pulse` y texto explicativo) informando que la sincronización automática está activa.
  - Al concluir la subida en segundo plano en el hilo demonio, el backend despacha automáticamente el evento `catalogos-actualizados`, refrescando la interfaz y cambiando el estado a "Sincronizado" sin recarga manual.

---

## [1.7.0] - 2026-09-30

### 🔔 Notificaciones de Modificaciones para RRHH y Distinción Visual en Calendario
- **Aviso y Notificación de Modificaciones para RRHH (`1_1_modificaciones_realizadas`)**:
  - Incorporada descarga remota en segundo plano desde la hoja `1_1_modificaciones_realizadas` de Google Sheets hacia la base de datos local SQLite para asegurar que el responsable de RRHH detecte cambios realizados por colaboradores desde cualquier equipo.
  - Implementado banner interactivo de notificación superior en la aplicación (`rrhh-notification-banner`) y tarjeta dedicada de avisos en `HomeView` (`home-modificaciones-card`) con conteo de modificaciones pendientes de revisión, detalle del colaborador, fecha y resumen comparativo (`tipo_antes` ➔ `tipo_despues`).
  - Acción directa **"Ver cambio en calendario"**: con un solo clic, redirige inmediatamente a la ventana de `OtherEmployeesHistoryView`, preselecciona al colaborador, navega el calendario al año y mes correspondiente, resalta la celda con pulso cromático y abre el desglose del día modificado.
  - Opciones de descarte rápido para marcar modificaciones individuales o colectivas como revisadas (`revisado = 1`).
- **Distinción Visual en el Calendario de Otros Empleados (`OtherEmployeesHistoryView`)**:
  - Marcador distintivo en las celdas de calendario (`.cell-has-modified` y `.cell-mod-badge` con icono ✏️) para aquellos días que registran modificaciones.
  - Resalte visual destacado en las pastillas de eventos (`.cell-event-pill.cell-event-modified`) con borde ámbar de alto contraste, icono ✏️ y etiqueta `MOD`.
  - Tooltips descriptivos y bloque de detalle en el modal del día (`.dia-modal-mod-callout`) que explicitan quién modificó el registro, en qué fecha/hora y qué valores cambiaron (tipo de lugar y horas).
- **Corrección en Asignación Masiva de Tipo de Costo**:
  - Habilitada recepción polimórfica en `actualizar_tipo_costo_masivo` (backend y bridge frontend) para admitir tanto llamadas por lista de IDs como por diccionario empaquetado, resolviendo el error `Error al comunicarse con la aplicación.` al interactuar con la barra flotante.
- **Sincronización Total entre Listado de Registros y Calendario**:
  - Ampliado el límite de consulta de historial a 5000 registros para evitar el truncamiento de meses históricos en la base local.
  - Sincronización bidireccional inmediata: seleccionar un colaborador en el listado o en el encabezado de auditoría actualiza ambos componentes al unísono.
  - Añadido filtro opcional "Solo mes visible" para visualizar en la lista exactamente las jornadas del mes desplegado en el calendario.
  - Incorporado botón "📅 Calendario" en cada tarjeta del listado para enfocar y abrir la celda correspondiente en el calendario con un solo clic.

---

## [1.6.0] - 2026-09-30

### 🚀 Actualización Remota Desacoplada, Selección Multidía en Calendario y Optimización de Interfaz
- **Actualización de Identidad Operativa**:
  - Actualizado el correo electrónico de Iván Valentin a `ivangvalentin97@gmail.com` en catálogo de autorizados, permisos del frontend y migraciones automáticas de base de datos.
- **Calculadora de Liquidación Estricta (4 Categorías)**:
  - Reducción y estandarización a exactamente 4 categorías de liquidación: `"Día de oficina"`, `"Día de obra"`, `"Franco trabajado"` y `"Feriado trabajado"`.
  - Eliminada la categoría residual "Franco ordinario" / "Francos no trabajados" tanto del cálculo como de la interfaz.
- **Restricción de Fechas en Registro Diario**:
  - Empleados regulares limitados a registrar únicamente fechas dentro de la semana activa en curso (desde el lunes de la semana actual hasta hoy).
  - Exención de restricción para perfiles de RRHH, Núcleo e Iván Valentin para permitir cargas retroactivas.
- **Selección Multidía en Calendario de Auditoría y Listado Completo**:
  - Casillas de selección en la esquina superior derecha de cada celda del calendario mensual para seleccionar múltiples días auditados.
  - Barra de herramientas flotante contextual que aparece cuando hay 1 o más días seleccionados, permitiendo imputar masivamente `Costo Oficina`, `Costo Campo` o `Sin Asignar`.
  - Panel izquierdo renombrado a **"Listado de registros"** con visualización completa de asistencias y selector desplegable para filtrar por colaborador específico.
- **Control de Actividad de Ayer en Pantalla Principal**:
  - Widget reposicionado directamente debajo de las opciones de RRHH en `HomeView`.
  - Rediseñado bajo el patrón de **"Usuarios Conectados"** (avatar con iniciales, nombre, área y punto de estado verde/gris consultando en SQLite si enviaron su registro ayer).
- **Menú Inicial Compacto sin Desplazamiento**:
  - Optimización de espaciados, paddings y encabezados en `HomeView` para permitir visualización panorámica en dos columnas sin barra de desplazamiento vertical.
- **Mecanismo de Actualización Remota Resistente a Windows 11**:
  - Modo desacoplado `--updater` con parámetros CLI explícitos (`--parent-pid`, `--target-dir`, `--update-file`) que prescinde de introspección dinámica de procesos y variables de entorno del bootloader de PyInstaller.
  - Sincronización nativa con la API de Windows (`OpenProcess` + `WaitForSingleObject`), reemplazo robusto en bucle con desbloqueo de SmartScreen (`Unblock-File`) y reinicio independiente en `DETACHED_PROCESS`.
  - Restablecida la comprobación periódica y manual de releases contra el repositorio oficial de GitHub (`Aterian/ReporteDiario`).

---

## [1.5.0] - 2026-09-29

### 📊 Esquema de 17 Columnas, Auditoría de Modificaciones y Control Diario RRHH
- **Esquema de 17 Columnas en `1_asistencia_informada`**:
  - Incorporadas columnas: `hora_inicio`, `hora_fin`, `instrumental` (vacío por diseño) y `tipo_costo` ('Oficina' | 'Campo' | sin asignar).
  - Migración automática en SQLite y sincronización bidireccional mediante mapeo posicional dinámico en Google Sheets.
- **Hoja y Tabla de Auditoría `1_1_modificaciones_realizadas`**:
  - Creación automática de la hoja `1_1_modificaciones_realizadas` en Google Sheets y tabla en SQLite.
  - Registro auditable de cualquier edición de registros con 10 columnas: `id_modificacion`, `id_asistencia`, `tipo_antes`, `tipo_despues`, `horas_antes`, `horas_despues`, `servicio_antes`, `servicio_despues`, `fecha_hora_modificaciones`, `quien_modifica`.
  - Sincronización automática de modificaciones pendientes hacia Google Sheets.
- **Normalización de 'Campo' y Cálculo Automático de Horas**:
  - Normalización estricta de "campaña" o "campo" guardándose exclusivamente como `"Campo"`.
  - Despliegue dinámico de selectores `hora_inicio` y `hora_fin` (mínimo 44px de alto para inputs táctiles) al seleccionar Campo.
  - Cálculo automático de `horas_totales = hora_fin - hora_inicio` en formato decimal sin límite de jornada.
- **Criterio de Clasificación de Francos (Franco de Obra)**:
  - En vistas de historial se muestra la etiqueta `"Franco de obra"` cuando `tipo_ocf == 'Franco'` y tiene un proyecto/servicio de obra asignado.
  - En la Calculadora de Liquidación de RRHH: los Francos de obra computan como **Días de Campo**, mientras que los Francos asignados a áreas internas computan como **Días de Oficina**.
- **Calculadora de Liquidación con Edición Flexible**:
  - Habilitada la edición manual de cantidad de días para todas las categorías (Oficina, Campo, Francos Ordinarios, Francos Trabajados, Feriados Trabajados), con botón `↺ Auto` para restablecer el cómputo calculado.
- **Asignación Masiva de Tipo de Costo (RRHH)**:
  - Casillas de selección múltiple en `OtherEmployeesHistoryView` con barra de acciones flotante para imputar masivamente `tipo_costo` (`Oficina`, `Campo` o Sin Asignar).
  - Actualización atómica en base de datos local y propagación a Google Sheets.
- **Widget de Control de Estado Diario (RRHH / Aplicaciones)**:
  - Nuevo componente `DailyStatusWidget` integrado en la pantalla de inicio (`HomeView`) para perfiles con permisos de gestión.
  - Monitoreo en tiempo real del estado de envío de asistencia del día con barra de progreso, filtros rápidos (Todos, Pendientes, Enviados) y buscador.
  - Banner y modal de alerta de modificaciones recientes para auditoría inmediata.
- **Comportamiento Nativo de Ventana en Windows (PyWebView)**:
  - Minimizar (`_`): comportamiento nativo de Windows permaneciendo en la barra de tareas (no se esconde en la bandeja).
  - Cerrar (`X`): interceptado con `window.hide()` manteniéndose en segundo plano en el System Tray.

---

## [1.4.0] - 2026-09-29

### 👥 Mejoras y Controles en Módulos de RRHH (Roster y Asistencia)
- **Carga de Roster con Licencia y Vacaciones**:
  - Habilitadas las opciones de tipo de jornada **"Licencia"** y **"Vacaciones"** en la creación y edición de Roster.
  - Al seleccionar Licencia o Vacaciones, se omiten tarifas de obra y se asignan 0 horas.
  - Soporte visual en Gantt (`L` en rojo y `V` en ámbar), en tarjetas de estado y en exportación Excel oficial en 3 hojas.
- **Eliminación de Turnos de Roster**:
  - Incorporado botón de **"Eliminar Turno"** en el modal de edición de Roster en la vista Gantt.
  - Las rutinas de eliminación y purga ahora limpian apropiadamente los registros asociados en `historial` y Google Sheets para los 4 tipos de jornada (`Roster`, `Franco`, `Licencia`, `Vacaciones`).
- **Eliminación de Auto-rellenado no Deseado**:
  - Desactivada la función de reconciliación automática que generaba filas sintéticas en `historial` y provocaba superposición involuntaria con licencias en Google Sheets. Solo los usuarios pueden crear registros.
- **Botón "Limpiar" para Roster e Historial de Otros Empleados**:
  - Añadido botón **"Limpiar"** en las vistas de Roster (`RosterView`) y de Historial de Otros Empleados (`OtherEmployeesHistoryView`).
  - Purga la base de datos local y vuelve a descargar la información oficial directamente desde Google Sheets, previniendo duplicados o discrepancias por modificaciones externas.
- **Sincronización Completa de Empleado en Asistencia**:
  - Al modificar el empleado de un registro de asistencia en `OtherEmployeesHistoryView`, se actualizan sincrónicamente el **email** (`usuario_mail`) y el **id del empleado** (`id_empleado`) tanto en la base local como en Google Sheets `1_asistencia_informada`.
- **Filtro por Empleado en Historial de Roster**:
  - Incorporado selector desplegable para filtrar por empleado específico en `RosterHistoryView`.

---

## [1.3.9] - 2026-09-25

### 🗺️ Soporte, Permisos y Reglas de Negocio para Área SIG ("S")
- **Integración de Nuevos Usuarios de SIG**:
  - Incorporados a la base y catálogo los colaboradores **Gabriel Canavesio** y **Renzo Polo** (área `S`).
- **Permisos de Interfaz y Vistas**:
  - Navegación acotada exclusivamente a **Registro Diario** e **Historial Propio** (sin acceso a Roster ni a Historial de Otros Empleados).
- **Modalidades Operativas**:
  - Restricción estricta a modalidades **Oficina** y **Franco** (oculta opciones de Campo y subtipos de franco).
  - Cómputo automático de **Franco de Oficina** con 0 hs y servicio asignado directamente al área (`SIG`).
- **Proyectos y Dedicación de Horas**:
  - Filtro automático de proyectos que integra tanto el área **"S"** (SIG) como el área **"A"** (Aplicaciones).
  - Selector disponible para imputar tiempo de trabajo a cualquiera de las 12 áreas corporativas internas.
- **Vista RPG y Título Honorífico**:
  - Acceso al tema medieval y vista de Tablón RPG habilitado para **Gabriel Canavesio**.
  - Título honorífico asignado en interfaz y perfil: **"📜 Erudito Deambulante"**.

---

## [1.3.8] - 2026-09-25

### ☕ Franco Directo de Oficina para el Área de Mensura
- **Simplificación Operativa para Mensura (`M`)**:
  - Se eliminó el selector de categorías de franco (`Franco de obra`, `Franco obra trabajado`, `Franco ofic. trabajado`) para colaboradores del área de Mensura.
  - Al seleccionar la modalidad **Franco**, se registra y computa automáticamente como **Franco de Oficina** con 0 hs y servicio asignado a su área (`Mensura`), guardándose fielmente en Google Sheets como `Franco` (col D) y `Mensura` (col E).
  - En la vista de edición del historial (`HistoryView`), se acotan las opciones de modalidad para Mensura a `['Oficina', 'Campo', 'Franco', 'Vacaciones', 'Licencia']`, asignando automáticamente `Mensura` al seleccionar Franco.

---

## [1.3.7] - 2026-09-25

### 🌾 Habilitación de Modalidad "Campo" para Mensura
- **Restauración de Opciones de Terreno en Mensura**:
  - Se eliminó la restricción que limitaba al área de Mensura (`M`) únicamente a Oficina y Franco de Oficina.
  - Habilitada nuevamente la modalidad **Campo / Campaña**, permitiendo además la carga mediante **Rango de Fechas** para jornadas de campo en Mensura tanto en `CheckForm` como en la edición desde `HistoryView`.
  - Se mantiene la exclusividad de oficina únicamente para el perfil de Camila Llovio (Ingeniería).

### 🔄 Corrección Integral de Sincronización con Google Sheets (Carga por Rango y Lote)
- **Prevención de Omisiones y Sobreescrituras Accidentales**:
  - Corrección en `sincronizar_pendientes()`: Se desvinculó la clave compuesta no unívoca `(empleado, fecha)` de la creación de registros nuevos. Ahora cada registro generado con UUID nuevo se envía inequívocamente como inserción (`filas_a_insertar`).
  - Se eliminó el bug de colisión interna en el lote que intentaba actualizar filas inexistentes fuera de los límites de la hoja cuando existían múltiples proyectos en una misma jornada o fechas coincidentes.
  - Sincronización atómica: los identificadores locales (`sincronizado = 1`) únicamente se marcan tras la confirmación exitosa de inserción en Google Sheets por parte de `ws.append_rows()`.
  - Corrección de deduplicación remota: `deduplicar_hoja_remota()` ahora discrimina por `(empleado, fecha, servicio)`, protegiendo registros legítimos de colaboradores que trabajan en más de un proyecto el mismo día.
  - Eliminación concurrente segura: `eliminar_registro_remoto()` y eliminaciones por rango de roster ahora respetan el mutex `_sync_lock` y procesan bajas secuencialmente sin colisiones de índice en la hoja.

---

## [1.3.6] - 2026-09-25

### 🔒 Control de Acceso y Visibilidad por Roles y Usuarios
- **Carga e Historial de Roster**:
  - Acceso y gestión restringidos exclusivamente a **Justina Bertolozzi** (Responsable de RRHH) e **Iván Valentin** (Desarrollador).
  - Ocultamiento completo de tarjetas en el menú principal (`HomeView`), guardias de redirección en `App.jsx` y bloqueo directo a nivel backend API.
- **Historial de Otros Empleados**:
  - Habilitada la visualización para **RRHH**, personal de **Núcleo (área N)** y el desarrollador **Iván Valentin**.
  - Visualización adaptativa de títulos en el panel de inicio y acceso desde el historial personal.
- **Restricción de Modificaciones y Bajas**:
  - Las modificaciones y eliminaciones de registros pertenecientes a otros colaboradores solo pueden ser realizadas por **Justina Bertolozzi** e **Iván Valentin**.
  - El resto del personal mantiene permiso exclusivo para modificar sus **propios registros**.
  - Si un usuario no autorizado visualiza registros ajenos, se reemplazan los botones de acción por la etiqueta distintiva `🔒 Solo lectura`.
- **Doble Capa de Seguridad**:
  - Validación en interfaz React (UI) y validación transaccional en el backend Python (`modificar_registro`, `eliminar_registro_asistencia`, `guardar_roster`, etc.).

---

## [1.3.5] - 2026-09-24

### ⚡ Carga Asistida de Fines de Semana y Restricciones de Área
- **Asistente de Fines de Semana**:
  - Botón asistido en el historial para registrar automáticamente sábados y domingos pendientes como Franco para RRHH y Aplicaciones.
- **Filtros por Área**:
  - Restricción de selección de modalidades a Oficina y Franco de Oficina para Mensura y perfiles específicos.

---

## [1.3.4] - 2026-09-24

### 👤 Trazabilidad, Auditoría y Control Multi-PC (Columna N `cargado_por`)
- **Columna N en Google Sheets (`1_asistencia_informada`)**:
  - Incorporación oficial de la columna 14 (`cargado_por`) en la hoja remota de Google Sheets.
  - Sincronización bidireccional completa: sube el autor real del registro (`A:N`) y al descargar registros en cualquier otra PC recupera fehacientemente quién dio de alta la fila.
  - Manejo defensivo y retrocompatible para registros históricos sin autor: se asigna automáticamente al titular de la jornada sin romper estados.
- **Identificadores Visuales en el Historial del Empleado**:
  - **Vista Unificada**: El empleado mantiene la visualización del 100% de su mes en una sola pantalla sin necesidad de cambiar de pestañas ni fragmentar su información.
  - **Badges de Autoría**: Cada jornada cuenta con un distintivo cromático claro:
    - 🟢 `✓ Cargado por mí`: cuando el registro fue cargado por el propio empleado.
    - 🟣 `🏢 Cargado por RRHH` (o el nombre de quien lo cargó): cuando fue cargado por otra persona (ej. turnos de Roster).
  - **Indicador en Celdas del Calendario**: Pequeño chip `• RRHH` visible directamente en la celda del calendario mensual para identificar al instante qué turnos fueron planificados por RRHH.
  - **Banner en Modal de Detalle/Edición**: Muestra de forma destacada el origen de la carga con icono, autor y fecha/hora exacta de registración.
  - **Filtro de Origen Rápido**: Selector en la barra de herramientas para filtrar fácilmente entre *Todos los orígenes*, *Cargados por mí* y *Cargados por RRHH*.

### 🏗️ Normalización de Franco de Obra
- Cuando un usuario selecciona *"Franco de obra"*, en la columna `tipo_ocf` se guarda como **`"Franco"`** (con 0 hs), asignando el proyecto seleccionado en la columna `servicio` y `id_proyecto`.

---

## [1.3.3] - 2026-09-24

### 🛡️ Corrección Crítica de Sincronización y Purga de Registros
- **Eliminación de Purgas Destructivas en Consultas de Auditoría**:
  - Se eliminó el borrado de registros (`purgar_todo=True`) que se disparaba erróneamente al consultar el historial de auditoría o de otros empleados en `ApiPuente`. Las funciones de lectura ya no modifican ni borran datos de la base local.
  - Se protegió `depurar_registros_eliminados`: ahora exige de forma estricta `WHERE sincronizado = 1`, garantizando que ningún registro pendiente de sincronización pueda ser eliminado localmente.
- **Recuperación y Reconciliación de Jornadas de Roster**:
  - Nueva función `reconciliar_rosters_con_historial` que audita periódicamente la tabla `rosters` y regenera cualquier jornada individual faltante en `historial`, resolviendo definitivamente la inconsistencia donde los turnos figuraban en el Gantt pero no en el calendario individual del empleado ni en Google Sheets.
  - Se recuperaron y sincronizaron con éxito los registros de agosto de Maximiliano Kromm.

### ⚡ Prevención de Duplicados y Concurrencia Segura con Google Sheets
- **Mutex y Bloqueo de Sincronización**:
  - Implementación de `_sync_lock = threading.Lock()` en `sheets_service.py` para impedir condiciones de carrera y ejecuciones concurrentes de `sincronizar_pendientes`.
- **Sincronización Idempotente**:
  - `sincronizar_pendientes` ahora coteja filas existentes remotas por `id_asistencia` y por la tupla `(empleado, fecha)`, realizando actualizaciones *in-place* en lugar de crear filas duplicadas.
- **Guardado Atómico de Múltiples Empleados**:
  - Nueva función `guardar_roster_multiple` que procesa la selección múltiple en una única transacción local y un solo hilo de sincronización, reemplazando el `Promise.all` descontrolado del frontend.
- **Deduplicador Remoto de Google Sheets**:
  - Nueva herramienta `deduplicar_hoja_remota` ejecutada con éxito, depurando 22 registros duplicados históricos en la hoja corporativa `1_asistencia_informada`.

### 🏷️ Unificación de Vocabulario: Modalidad "Campo"
- Se reemplazó la opción "Campaña / Campo" por **"Campo"** en `CheckForm.jsx`, botones, leyendas, selectores y `RpgTavernBoard.jsx`.
- Compatibilidad retroactiva completa con registros cargados bajo la denominación previa.

### 📊 Integración Arquitectónica con Noodles (Call Graph y Flujo de Funciones)
- Se incorporó la suite **Noodles** (`unslop-xyz/noodles`) en el backend.
- Análisis estático del repositorio generando grafos de llamadas (208 funciones, 142 conexiones), diagramas Mermaid por función y visor interactivo navegable en `diagrams/noodles_analysis/viewer.html`.

---

## [1.3.2] - 2026-09-23

### 🔄 Sincronización y Purga en Botón Refrescar
- **Depuración de Registros de Asistencia Inexistentes**:
  - El botón **Refrescar** ahora compara de forma síncrona y exhaustiva la base local contra la tabla corporativa `1_asistencia_informada` de Google Sheets.
  - Elimina de la base local cualquier registro que haya sido borrado de la hoja de cálculo remota para evitar confusiones y discrepancias.
  - Actualiza registros existentes con sus datos remotos vigentes e inserta los nuevos registros.
- **Purga Integral de Rosters Huérfanos**:
  - Google Sheets es la única fuente de verdad: los registros de la tabla local `rosters` que ya no cuenten con asistencias correspondientes en `1_asistencia_informada` son purgados automáticamente al refrescar o consultar la vista.
  - Se eliminó la persistencia de datos mock en `localStorage` (`ingeap_rosters_mock`) que causaba la aparición de registros borrados al cambiar de ventana.
  - Se añadió el botón **Refrescar** en la barra superior de `RosterView` e `RosterHistoryView` para sincronización directa e instantánea con Google Sheets.

### 🚀 Reconciliación Automática en Nuevas Instalaciones
- **Chequeo Inicial Post-Instalación**:
  - Al instalar o actualizar a una nueva versión (`CheckDiarioIngeap.exe` con flag `--post-install` o detección de versión en `meta_app`), el sistema realiza automáticamente una reconciliación completa contra Google Sheets.
  - Actualiza la nómina de empleados (`0_usuarios`), el catálogo de proyectos (`0_proyectos`), días no laborales y los registros de asistencias realizados (`1_asistencia_informada`).

### 🖥️ Pantalla Completa: Dos Bloques Verticales en Paralelo
- **Distribución Responsiva para RRHH**:
  - Cuando la ventana está maximizada o en pantalla completa, la interfaz organiza las acciones en **dos bloques verticales contiguos**:
    - **Bloque Izquierdo**: Registro propio del usuario (*Cargar Nuevo Reporte* y *Ver Historial de Registros*).
    - **Bloque Derecho**: Gestión de RRHH (*Cargar Nuevo Roster*, *Historial de Roster* e *Historial de otros empleados*).
  - La tarjeta de bienvenida y perfil se adapta a un diseño horizontal compacto.
  - Elimina completamente la necesidad de hacer scroll vertical con el mouse en resoluciones de pantalla estándar.

---

## [1.3.1] - 2026-09-17

### 🛠️ Corrección Crítica del Auto-Updater en Windows 11
- **Fijación de Bootloader en PyInstaller 6.22.0**:
  - Solución definitiva al error `Security validation failure: failed to obtain executable path for parent proces!` introducido por la verificación restrictiva de proceso padre de PyInstaller 6.22.1/6.22.2 en Windows 11.
  - Saneamiento riguroso de todas las variables de entorno de PyInstaller (`_MEIPASS`, `_MEIPASS2`, `_PYI_*`) antes de reiniciar la aplicación y en el instalador.

### 📋 Mejoras en la Gestión de Rosters para RRHH
- **Modificación de Registros Cargados**:
  - Habilitación de botón y modal interactivo para modificar turnos de Roster existentes tanto desde la tabla de historial como haciendo clic sobre cualquier celda/turno en el diagrama Gantt.
  - Sincronización automática de las modificaciones con la base local y Google Sheets.
- **Carga Múltiple de Empleados**:
  - Selector multi-selección visual con chips clicables y checkboxes que permite asignar turnos simultáneamente a 2 o más empleados para el mismo proyecto, rango de fechas y condiciones.
  - Acciones rápidas de *"Seleccionar todos"* y *"Limpiar"*.

### 🎮 Modo Aventura RPG: Mini Calendario Mensual
- **Sustitución de la Ventana de EXP por Mini Calendario**:
  - En la pantalla principal de la taberna (Pergamino 3), la antigua barra de EXP se sustituye por un mini calendario medieval del mes en curso.
  - Resalta visualmente con un sello verde los días que el usuario ya tiene registrados.
  - Contador destacado con el total de días registrados en el mes actual (`⚔️ X días registrados este mes`).

---

## [1.3.0] - 2026-09-17

### 📅 Módulo de Carga y Gestión de Rosters para RRHH
- **Carga de Roster Dividida y Ágil**:
  - Pantalla completa optimizada para Recursos Humanos (RRHH).
  - Formulario en panel izquierdo para registrar turnos de Campo y Franco por empleado y proyecto con asignación de rango de fechas (calendario de inicio y fin).
  - Campos dedicados para valor de día estándar y valor de día domingo.
  - Flujo continuo de carga sin cierre abrupto ni retorno al menú principal al guardar.

- **Filtro Exclusivo de Ingeniería**:
  - Catálogo de proyectos y nómina de empleados restringidos exclusivamente al Área de Ingeniería (`I`).

- **Calendario Gantt Interactivo**:
  - Vista mensual detallada con distinción cromática por proyecto asignado.
  - Días domingo resaltados con indicador visual y leyenda de tarifa especial.
  - Ajuste manual de ancho de columnas por arrastre (`drag-to-resize`) y controles de zoom (`-`, `+`, `Reset`).

- **Exportación Mensual Oficial a Excel**:
  - Generación de libro Excel (`.xlsx`) por proyecto individual para el mes seleccionado.
  - Dividido en 3 hojas de cálculo formateadas profesionalmente: *Ciclo Completo*, *1ra Quincena (1 al 15)* y *2da Quincena (16 a fin de mes)*.
  - Resumen automático de días de campo trabajados, domingos en obra y días de descanso/franco.

- **Sincronización con Google Sheets**:
  - Registro automático de cada jornada del ciclo en la hoja corporativa `1_asistencia_informada` bajo la modalidad `"Roster"`.

---

## [1.2.0] - 2026-09-16

### 📦 Instalador de Archivo Único Autónomo
- **Instalador de 1 Solo Archivo (`Instalador_CheckDiario_Ingeap.exe`)**:
  - Se elimina la necesidad de distribuir carpetas completas con archivos `.bat`, `.ps1` y guías `.txt`.
  - El usuario únicamente recibe y ejecuta **1 solo archivo `.exe`**.
  - Ubica la aplicación automáticamente en la ruta estándar y segura de usuario `%LOCALAPPDATA%\Ingeap\CheckDiario\CheckDiarioIngeap.exe` (inmune a restricciones de permisos o carpetas temporales).
  - Genera accesos directos en el **Escritorio** y en el **Menú Inicio de Windows** con el icono institucional.
  - Registra el inicio automático con Windows (`HKCU\Run`) y abre la aplicación inmediatamente.

### 🛡️ Persistencia y Confiabilidad de Sesión
- **Persistencia en Reinicio de PC**:
  - Almacenamiento definitivo de SQLite fijado en `%LOCALAPPDATA%\Ingeap\CheckDiario\registro_local.db` para evitar pérdidas de sesión al reiniciar el equipo debido a la limpieza de temporales de Windows.
  - Creación automática de archivo espejo en `sesion_activa.json` en AppData para autorecuperación transparente de la sesión.

### ⚡ Estabilidad y Resiliencia de Interfaz
- **Corrección de Pantalla en Blanco**:
  - Corrección de inicialización de variables de roles y áreas en el formulario de registro (`Temporal Dead Zone`).
  - Implementación de `ErrorBoundary` global en React con tarjeta amigable de recuperación y botones de navegación ante cualquier error imprevisto.

### 🎨 Rediseño Ergonómico del Formulario de Registro
- **Selector de Modalidad Segmentado**:
  - Reemplazo de botones pesados y amontonados por una botonera compacta y moderna: `[ 🏢 Oficina ] [ 💻 Home Office ] [ 🌲 Campaña ] [ ☕ Franco ]`.
- **Flujo Directo para Días de Franco**:
  - Al seleccionar `Franco`, se ocultan automáticamente los bloques de actividades y proyectos, ofreciendo un registro limpio en un solo paso.
- **Simplificación de Jornada Habitual**:
  - Tarjeta serena y predeterminada de 8.0 horas para tareas del área que permite guardar el reporte en 2 clics.
- **Distribución de Horas Inteligente**:
  - Stepper compacto (`-` / `+`) y pastillas de distribución para múltiples actividades (`⚖️ Dividir equitativo` o `✏️ Ajustar por ítem`).

### 🏢 Dedicación a Múltiples Áreas Corporativas
- **Soporte Multi-área para 'A' (Aplicaciones), 'N' (Núcleo) y 'RRHH'**:
  - Posibilidad de seleccionar y combinar en un mismo día tareas dedicadas a diferentes áreas corporativas (ej: 4 hs a Ingeniería y 4 hs a Administración).
  - Nuevo grupo `🏢 Dedicación a Áreas Internas` en el desplegable de actividades y botón rápido `+ Sumar otra área`.

### ⚔️ Modo Aventura RPG: Tablón de Misiones de Taberna Medieval
- **Diseño Inmersivo "The Adventurer's Daily Log"**:
  - Estructura inspirada fielmente en el tablón de anuncios de una taberna de aventureros.
  - Marco de madera de roble oscuro con esquineros de hierro forjado y remaches metálicos.
  - Banner superior curvado en pergamino antiguo con caligrafía gótica y drop-cap iluminado.
  - Pergaminos envejecidos clavados con tachuelas metálicas:
    - **Misiones de Hoy (*Today's Quests*)**: Registro activo de tareas de jornada y gremios, notas de campo manuscritas y botón de sellado.
    - **Hazañas Recientes (*Recent Achievements*)**: Crónicas y logros completados con casillas de verificación.
    - **Recompensas y Botín (*Rewards & Notes*)**: Medidor visual de EXP, nivel de aventurero y monedas de oro.
  - Viga de madera inferior tallada con medallones y botones de navegación rápida.

---

## [1.1.1] - 2026-09-15

### 🚀 Nuevas Funcionalidades y Mejoras de Interfaz
- **Tema Oscuro (Dark Mode)**:
  - Selector de modo oscuro / claro incorporado en la barra superior (Header) con íconos sol ☀️ y luna 🌙.
  - Paleta Slate moderna con fondo pizarra oscuro (`#0b0f19` / `#151d2f`), alto contraste, bordes refinados y toques en rojo corporativo luminoso.
  - Persistencia de la preferencia del tema en `localStorage`.
- **Combinación Total de Proyectos y Tiempo al Área**:
  - Se removió el bloque estático superior para integrar la selección de "Dedicado al área" directamente dentro de la lista de actividades.
  - Permite combinar en la misma jornada uno o varios proyectos específicos junto con tiempo dedicado al área (ej: 5 hs a proyecto de Ingeniería y 3 hs a tareas del área).
  - Selector contextual de área corporativa de destino para empleados de áreas especiales (`N`, `RRHH` y `A`).
- **Selección Dinámica de Proyectos para RRHH**:
  - Al cargar un reporte a nombre de otro colaborador, el listado de proyectos se actualiza dinámicamente según el área a la que pertenece dicho colaborador (ej: si se selecciona a un empleado de Ingeniería, se cargan sus proyectos de ingeniería).
  - Nueva casilla "Ver proyectos de todas las áreas" que permite a RRHH asignar cualquier proyecto activo de la empresa.
- **Clarificación de Nomenclatura de Áreas**:
  - Se estandarizó y documentó que **`A`** corresponde a **Aplicaciones** y **`N`** corresponde a **Núcleo**.
  - En los desplegables de selección de empleados se muestra el nombre descriptivo completo (ej: `Sergio Juarez (Núcleo)`, `Nicolás Parajón (Ingeniería)`, `Iván Valentin (Aplicaciones)`).
- **Diagnóstico y Soporte para Autoupdate**:
  - Documentación del mecanismo de notificación automática para versiones previas mediante GitHub Releases públicas con tag de versión y ejecutable adjunto.

---

## [1.1.0] - 2026-09-15

### ✨ Nuevas Características y Funcionalidades
- **Detección Automática de Día de la Semana**:
  - Se calcula automáticamente el día de la semana en español en minúsculas (ej: `lunes`, `martes`, `miércoles`, etc.) a partir de la fecha de la jornada seleccionada.
  - Se almacena en la nueva columna `dia_semana` de la hoja `1_asistencia_informada` y en la base de datos local.
- **Cotejo con Días No Laborales y Feriados**:
  - Integración con la tabla `0_no_laborales` de Google Sheets.
  - Detección automática para determinar si la jornada informada corresponde a un feriado nacional o día no laborable, marcando `SI` o `NO` en la nueva columna `feriado`.
  - Mecanismo de caché local en SQLite (`no_laborales_cache`) para garantizar funcionamiento sin conexión.
- **Flexibilización Total de Horas**:
  - Eliminado el límite restrictivo de 8 horas máximas por jornada. Los empleados ahora pueden registrar horas extraordinarias o jornadas extendidas (ej: 9, 10, 12 hs) sin restricciones en el modo personalizado.
- **Opción "Dedicado al Área" en Proyectos**:
  - Incorporada la opción de cargar tiempo dedicado a tareas generales del área al trabajar en múltiples proyectos (ej: 4 hs a Proyecto A, 2 hs a Proyecto B y 2 hs a Dedicado al área).
- **Sub-áreas Específicas para Personal de 'N', 'RRHH' y 'A'**:
  - Los usuarios pertenecientes a las áreas Núcleo (`N`), Recursos Humanos (`RRHH`) y Administración (`A`) ahora pueden desglosar y seleccionar a cuál de las 12 áreas de la empresa le dedicaron tiempo:
    - *Administración, RRHH, CyF, Marketing, Ingeniería, Mensura, Aplicaciones, Inventario, SIG, I+D, Ventas, CD*.
  - El registro se guarda especificando el área de destino (ej: `Dedicado al área - Marketing`).
- **Modificación de Registros Anteriores desde el Historial**:
  - Botón "Editar" interactivo en cada tarjeta de reporte de la pestaña de Historial.
  - Ventana modal que permite corregir fecha, modalidad/ubicación, proyecto/área y horas.
  - Sincronización in-place en Google Sheets: actualiza la fila existente utilizando su `id_asistencia` en lugar de crear duplicados.
- **Carga Delegada para RRHH**:
  - Sección exclusiva para usuarios del área `RRHH` que permite cargar reportes a nombre de cualquier empleado de la empresa.
  - Carga masiva por rango de fechas cuando la modalidad es `Campaña / Campo`: genera e inserta automáticamente una fila individual por cada día del rango establecido, computando el día de la semana y feriado correspondiente.

### 🛠️ Mantenimiento y Arquitectura
- Esquema ampliado a 11 columnas en `COLUMNAS_ESQUEMA`:
  `[id_asistencia, empleado, fecha, tipo_ocf, servicio, horas, instrumental, usuario_mail, fecha_hora, dia_semana, feriado]`.
- Migraciones defensivas automáticas en la base de datos local SQLite para usuarios con instalaciones previas.
- Actualización de endpoints en el puente `apiBridge.js` y `ApiBridge` en Python.

---

## [1.0.1] - 2026-09-14

### ✨ Mejoras
- Nuevos íconos corporativos oficiales de Ingeap integrados en el ejecutable, ventana de PyWebView y bandeja del sistema (System Tray).
- Ajustes en la interfaz visual con paleta corporativa refinada y tipografía Montserrat.
- Creación de script automatizado `compilar_instalador.bat` para recompilación integral en un solo paso.
- Soporte para desinstalación limpia con `Desinstalar.bat` y `Desinstalar.ps1`.
- Acceso directo automático en el Menú de Inicio de Windows (`Programs`) además del Escritorio.

---

## [1.0.0] - 2026-09-11

### 🚀 Lanzamiento Inicial
- Aplicación de escritorio nativa para Windows desarrollada con Python (PyWebView, System Tray) y React (Vite).
- Inicio de sesión por DNI y nombre contra la base de datos de empleados (`0_usuarios`).
- Carga de reporte diario con modalidades: Oficina, Campaña/Campo, Home Office y Franco.
- Selección de proyectos asignados según el área del usuario (`0_proyectos`).
- Almacenamiento local seguro en SQLite (`%LOCALAPPDATA%\Ingeap\CheckDiario\registro_local.db`).
- Sincronización asíncrona en segundo plano con Google Sheets (`1_asistencia_informada`).
- Notificaciones en la bandeja del sistema y comprobador de actualización automática contra GitHub Releases.
