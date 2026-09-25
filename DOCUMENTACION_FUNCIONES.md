# Documentación de Funciones y Arquitectura - Check Diario Ingeap

Este documento describe detalladamente la arquitectura de software, responsabilidades y cada una de las funciones implementadas en los módulos de Backend (`main.py`, `database.py`, `sheets_service.py`) y los servicios de Frontend.

---

## 1. Módulo Principal: `backend/main.py`

Punto de entrada de la aplicación de escritorio. Administra la ventana de PyWebView, el ícono en la bandeja del sistema (System Tray con `pystray`), el bucle de notificaciones en segundo plano, la actualización automática y el puente de comunicación expuesto a JavaScript.

### Clase `ApiBridge`
Expone métodos invocables desde el frontend de React a través del objeto global `window.pywebview.api`.

- **`obtener_estado_sesion(self)`**:
  Consulta la base SQLite para determinar si existe un usuario logueado en la máquina. Retorna un diccionario con `{ "logueado": bool, "usuario": dict | None }`.
- **`iniciar_sesion(self, nombre: str, dni: str)`**:
  Valida las credenciales ingresadas. Primero coteja en la caché local de usuarios autorizados; si no se encuentra o no hay red, consulta remotamente la hoja `0_usuarios` de Google Sheets. Al autenticar con éxito, guarda la sesión persistente y precarga proyectos y avatares.
- **`cerrar_sesion(self)`**:
  Elimina el registro de la sesión activa en SQLite sin borrar el historial ni los perfiles guardados.
- **`obtener_servicios(self, area: str = None)`**:
  Retorna la lista de proyectos disponibles aplicando las reglas de negocio de Ingeap:
  - Si se proporciona el parámetro `area` (por ej. cuando RRHH carga para otro empleado), filtra por dicha área.
  - Usuarios del área Núcleo (`N`), Recursos Humanos (`RRHH`), o solicitudes con `area='TODOS'` obtienen **todos** los proyectos activos.
  - Usuarios de otras áreas específicas (`I` - Ingeniería, `A` - Aplicaciones, `M` - Mensura, `VYM`, etc.) ven únicamente los proyectos pertenecientes a su área correspondiente. Para el área `S` (SIG), se incluyen proyectos tanto de su área (`S`) como del área de Aplicaciones (`A`), junto con la opción de imputar tiempo a otras áreas corporativas.
- **`guardar_check_diario(self, datos: dict)`**:
  Procesa y persiste el reporte diario:
  - **Soporte de RRHH**: Permite al personal de RRHH cargar reportes a nombre de otro empleado.
  - **Rango de Fechas**: Si la modalidad es `Campaña / Campo` y se seleccionó un rango, genera e inserta una fila por cada día del intervalo.
  - **Día de la semana y Feriado**: Computa el día (`lunes`, `martes`, etc.) y marca `SI`/`NO` según el calendario de `0_no_laborales`.
  - Dispara la sincronización en segundo plano con Google Sheets.
- **`modificar_registro(self, datos: dict)`**:
  Actualiza un reporte previamente registrado en el historial (fecha, modalidad, proyecto/servicio, horas), recalculando día de semana y feriado, y reprogramando la sincronización in-place en Google Sheets.
- **`obtener_historial(self)`**:
  Recupera los últimos reportes del usuario activo. Comprueba contra Google Sheets y depura registros que hayan sido borrados de la hoja remota para evitar inconsistencias.
- **`obtener_todos_usuarios(self)`**:
  Devuelve la lista completa de empleados registrados para la selección delegada en el panel de RRHH.
- **`minimizar_a_bandeja(self)`**:
  Oculta la ventana principal y la minimiza en el área de notificación (System Tray junto al reloj de Windows).
- **`guardar_avatar(self, avatar_base64: str)`**:
  Almacena la fotografía de perfil del usuario en formato Base64 asociándola a su DNI de forma permanente en SQLite.
- **`sincronizar_sheets(self)`**:
  Dispara manualmente la sincronización de filas pendientes contra Google Sheets.
- **`probar_conexion_sheets(self, spreadsheet_id: str)`**:
  Verifica las credenciales y conectividad contra el libro de cálculo seleccionado.
- **`guardar_config_sheets(self, spreadsheet_id: str)`**:
  Actualiza el ID de la hoja de cálculo en la configuración del usuario (`AppData`).
- **`verificar_registro_hoy(self)`**:
  Indica al frontend si el empleado ya completó su reporte del día actual para mostrar alertas o estado en el Home.
- **`verificar_actualizacion(self)`**:
  Consulta la API de GitHub Releases para comprobar si existe una versión superior al `APP_VERSION` actual.
- **`aplicar_actualizacion(self, url_descarga: str)`**:
  Descarga en segundo plano el nuevo `.exe`, genera un script `.bat` temporal para reemplazar el binario actual y relanza la aplicación automáticamente.

### Funciones de Ciclo de Vida y Sistema
- **`recurso_path(ruta_relativa: str) -> str`**:
  Resuelve rutas absolutas a archivos empaquetados (`_MEIPASS` de PyInstaller) o rutas locales de desarrollo.
- **`obtener_icono_tray()`**:
  Carga el ícono oficial corporativo (`app.ico` o `icon.png`) o dibuja un ícono de respaldo programáticamente con Pillow.
- **`asegurar_instancia_unica()`**:
  Crea un Mutex nombrado en Windows (`Local\\CheckDiarioIngeap_SingleInstance_Mutex`) para impedir múltiples ventanas duplicadas. Si ya hay una instancia abierta, la trae al frente y cierra la nueva.
- **`asegurar_inicio_automatico()`**:
  Registra la clave en el Registro de Windows (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) para arrancar minimizado al iniciar sesión. Limpia accesos obsoletos de la carpeta `Startup`.
- **`verificar_actualizacion_github() -> dict`**:
  Consulta el repositorio GitHub configurado en `config.json` buscando el último release publicado.
- **`ejecutar_descarga_y_reinicio(url_descarga: str) -> dict`**:
  Maneja la descarga y sustitución en caliente del archivo ejecutable.
- **`crear_bandeja_sistema(window)`**:
  Inicializa el menú de bandeja de Windows con opciones para Abrir Ventana, Sincronizar y Salir.
- **`hilo_recordatorio_diario(window)`**:
  Hilo demonio en segundo plano que comprueba periódicamente si el empleado no registró su jornada laboral, enviando notificaciones y restaurando la ventana.
- **`main()`**:
  Punto de entrada: inicializa la base de datos, carga cachés en segundo plano, lanza el hilo de System Tray y abre la ventana WebView principal.

---

## 2. Módulo de Base de Datos: `backend/database.py`

Encapsula la interacción con SQLite en `%LOCALAPPDATA%\Ingeap\CheckDiario\registro_local.db` garantizando funcionamiento 100% offline.

- **`obtener_directorio_datos() -> str`**:
  Retorna el directorio seguro de datos persistentes del usuario en Windows.
- **`obtener_conexion()`**:
  Abre una conexión SQLite con `row_factory = sqlite3.Row` para acceso por nombre de columna.
- **`inicializar_bd()`**:
  Crea las tablas `sesion`, `perfiles_empleados`, `proyectos_cache`, `usuarios_cache`, `historial` y `no_laborales_cache`. Realiza migraciones defensivas (`ALTER TABLE ADD COLUMN`) para asegurar compatibilidad con versiones previas.
- **`normalizar_fecha_iso(fecha_str: str) -> str`**:
  Convierte cualquier formato de fecha (`DD/MM/YYYY` o `YYYY-MM-DD`) al estándar ISO `YYYY-MM-DD`.
- **`calcular_dia_semana(fecha_str: str) -> str`**:
  Calcula el día de la semana en español en minúsculas (`lunes`, `martes`, etc.) a partir de una fecha.
- **`guardar_no_laborales_cache(dias: list)`**:
  Almacena en la tabla `no_laborales_cache` los días festivos obtenidos de `0_no_laborales`.
- **`obtener_no_laborales_cache() -> list`**:
  Devuelve la lista de feriados guardados localmente.
- **`es_fecha_feriado(fecha_str: str, fechas_feriados: set = None) -> str`**:
  Verifica si una fecha coincide con algún día no laborable. Retorna `"SI"` o `"NO"`.
- **`obtener_avatar_por_dni(dni: str) -> str`**:
  Recupera el avatar en Base64 asociado al DNI.
- **`guardar_avatar_empleado(dni: str, avatar_base64: str, nombre: str, mail: str)`**:
  Inserta o actualiza el avatar de un empleado de manera persistente.
- **`obtener_area_por_dni(dni: str) -> str`**:
  Consulta el área corporativa asignada al DNI.
- **`guardar_usuarios_cache(usuarios: list)` / `obtener_usuarios_cache() -> list`**:
  Administra la caché local de empleados autorizados sincronizados desde `0_usuarios`.
- **`guardar_proyectos_cache(proyectos: list)` / `obtener_proyectos_cache() -> list`**:
  Administra la caché local de proyectos activos sincronizados desde `0_proyectos`.
- **`depurar_registros_eliminados(ids_remotos: set) -> int`**:
  Elimina de la base local aquellos registros sincronizados cuyo `id_asistencia` fue borrado directamente en Google Sheets.
- **`obtener_sesion_activa() -> dict | None`**:
  Recupera la sesión del usuario actual restaurando avatar y área correspondientes.
- **`guardar_sesion_activa(nombre: str, dni: str, mail: str, avatar: str, area: str)`**:
  Guarda la sesión del usuario en la tabla `sesion` (ID=1) y en `perfiles_empleados`.
- **`actualizar_avatar_sesion(avatar_base64: str)`**:
  Actualiza el avatar en la sesión actual y en el perfil permanente.
- **`borrar_sesion()`**:
  Cierra la sesión activa actual.
- **`guardar_registro_asistencia(...) -> str`**:
  Inserta un nuevo registro en `historial` con las 11 columnas completas (`dia_semana`, `feriado`, `modificado=0`, `sincronizado=0`).
- **`actualizar_registro_asistencia(id_registro: int, fecha: str, tipo_ocf: str, servicio: str, horas: float) -> bool`**:
  Modifica un registro existente en `historial` y establece las banderas `modificado = 1` y `sincronizado = 0`.
- **`obtener_pendientes_sincronizacion() -> list`**:
  Retorna todas las filas locales que tengan `sincronizado = 0` para subirlas a la hoja remota.
- **`marcar_como_sincronizados(ids_asistencia: list)`**:
  Marca los registros indicados como `sincronizado = 1` y `modificado = 0`.
- **`obtener_ultimos_registros(empleado: str, usuario_mail: str, limite: int = 30) -> list`**:
  Recupera los reportes ordenados en forma descendente filtrados por el empleado actual.
- **`usuario_registro_hoy(empleado: str, usuario_mail: str) -> bool`**:
  Comprueba si el usuario tiene al menos un registro en la fecha actual.

---

## 3. Módulo de Integración: `backend/sheets_service.py`

Gestiona la conexión con Google Cloud Platform y Google Sheets mediante la biblioteca `gspread` y cuentas de servicio (`Service Account`).

- **`cargar_configuracion() -> dict`**:
  Lee `config.json` desde `AppData` o desde los archivos empaquetados del backend.
- **`guardar_configuracion(config: dict)`**:
  Persiste modificaciones de configuración en `AppData`.
- **`extraer_spreadsheet_id(texto_o_url: str) -> str`**:
  Extrae el ID único del Google Sheet a partir de una URL completa o una clave directa.
- **`buscar_archivo_credenciales(nombre_sugerido: str) -> str`**:
  Ubica el archivo JSON de clave privada de la cuenta de servicio de Google Cloud.
- **`obtener_cliente()`**:
  Instancia y autentica un cliente `gspread.Client` con alcances de Drive y Spreadsheets.
- **`obtener_hoja_trabajo(spreadsheet_id: str, sheet_name: str)`**:
  Abre el libro y la pestaña requerida; inicializa los 11 encabezados si la hoja está vacía.
- **`probar_conexion(spreadsheet_id: str) -> dict`**:
  Testea la comunicación y cuenta de filas con Google Sheets.
- **`obtener_no_laborales_remotos(spreadsheet_id: str) -> list`**:
  Lee la tabla `0_no_laborales` (o `0_no_laborables`), extrae fechas y motivos festivos, y actualiza la caché SQLite local.
- **`sincronizar_pendientes() -> dict`**:
  Lee los registros con `sincronizado = 0`.
  - Si el registro fue modificado (`modificado = 1`), busca su fila por `id_asistencia` en Google Sheets y actualiza las columnas A a K in-place con `ws.update`.
  - Si es nuevo, inserta las filas en lote con `ws.append_rows`.
  - Marca los registros sincronizados en SQLite.
- **`obtener_proyectos_remotos(spreadsheet_id: str) -> list`**:
  Descarga la lista de proyectos de `0_proyectos` y actualiza la caché local.
- **`obtener_usuarios_remotos(spreadsheet_id: str) -> list`**:
  Descarga la nómina de empleados de `0_usuarios` y actualiza la caché local.
- **`obtener_ids_asistencia_remotos(spreadsheet_id: str) -> set`**:
  Obtiene el conjunto de todos los `id_asistencia` existentes en la columna A para depurar registros borrados.

---

## 4. Componentes de Frontend (`frontend/src/`)

- **`services/apiBridge.js`**:
  Capa de abstracción que comunica los componentes de React con `window.pywebview.api`, incluyendo simulación en memoria (`mockApi`) para desarrollo web en navegador.
- **`components/CheckForm.jsx`**:
  Formulario de carga de reporte diario:
  - Carga delegada para RRHH.
  - Selección de rango de fechas para modalidad Campaña / Campo.
  - Asignación de horas libres sin límite restrictivo de 8 horas.
  - Opción "Dedicado al área" como ítem de proyecto y sub-áreas corporativas para usuarios N, RRHH y A.
- **`components/HistoryView.jsx`**:
  Visualización de reportes pasados con botón "Editar" y modal interactivo para modificar registros anteriores y sincronizarlos in-place con Google Sheets.
- **`components/HomeView.jsx`**:
  Pantalla principal que muestra el estado de registro del día, accesos rápidos a Cargar y Ver Historial, y sincronización manual.
- **`components/LoginView.jsx`**:
  Pantalla de inicio de sesión por nombre y DNI con validación en línea y carga de perfil.
