# Catálogo Funcional del Sistema

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

