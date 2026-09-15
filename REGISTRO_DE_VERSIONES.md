# Registro de Versiones (Changelog) - Check Diario Ingeap

Historial cronológico de cambios, nuevas características y mejoras aplicadas al sistema **Check Diario Ingeap**.

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
