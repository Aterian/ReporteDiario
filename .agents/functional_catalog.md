# Catálogo Funcional del Sistema

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

