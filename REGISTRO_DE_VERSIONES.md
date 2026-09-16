# Registro de Versiones (Changelog) - Check Diario Ingeap

Historial cronológico de cambios, nuevas características y mejoras aplicadas al sistema **Check Diario Ingeap**.

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
