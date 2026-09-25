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

## [FN-03.04] Sincronización Confiable de Lotes y Rangos en Google Sheets
- **Módulo**: [MOD-03] Sincronización Remota Google Sheets
- **Flujo Operativo**: Procesa registros pendientes de forma atómica en Google Sheets, garantizando que rangos de fechas y jornadas con múltiples proyectos se inserten íntegramente sin sobreescrituras ni omisiones de filas.
- **Tablas afectadas**: `historial`, hoja remota `1_asistencia_informada`.
- **Reglas de negocio e invariantes**:
  1. Cada registro con nuevo UUID se clasifica inequívocamente como inserción en `append_rows()`.
  2. Prohibido usar `(empleado, fecha)` para actualizar registros nuevos o preasignar filas no confirmadas en la hoja.
  3. Marcado en SQLite (`sincronizado = 1`) únicamente tras confirmación exitosa de Google Sheets.
  4. Deduplicación remota evalúa la terna `(empleado, fecha, servicio)` evitando el borrado de jornadas multiproyecto.
