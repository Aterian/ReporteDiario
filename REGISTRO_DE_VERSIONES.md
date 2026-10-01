# Registro de Versiones (Changelog) - Check Diario Ingeap

Historial cronológico de cambios, nuevas características y mejoras aplicadas al sistema **Check Diario Ingeap**.

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
