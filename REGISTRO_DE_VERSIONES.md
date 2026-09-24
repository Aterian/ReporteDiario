# Registro de Versiones (Changelog) - Check Diario Ingeap

Historial cronológico de cambios, nuevas características y mejoras aplicadas al sistema **Check Diario Ingeap**.

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
