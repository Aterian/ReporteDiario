# Distribución de Check Diario 2.14.0

Estado: candidata para piloto. Requiere completar las pruebas nativas y la integración PostgreSQL antes de publicar.

## Archivos que produce la compilación

| Archivo | Uso |
| --- | --- |
| CheckDiarioIngeap.exe | Migrador autocontenido que consumen también los clientes antiguos. Debe conservar este nombre exacto en Releases. |
| Instalador_CheckDiario_Ingeap.exe | El mismo migrador, con nombre explícito para instalación manual. |
| CheckDiarioIngeap-win64.zip | Aplicación completa con manifiesto y hashes. Se incluye dentro del migrador. |
| app/ | Runtime onedir completo, para revisión y pruebas. No distribuir su exe aislado. |
| CheckDiarioLauncher.exe | Lanzador pequeño que se instala en la ubicación anterior para conservar accesos anclados. |

Cada construcción usa una carpeta nueva en instalador/releases/. instalador/ultima_compilacion.json identifica la construcción completa más reciente. Los dos instaladores y el ZIP se copian también a instalador/ para mantener los nombres de entrega.

## Preparar una construcción

Entorno probado: Windows x64 y Python 3.14.0.

1. Preparar un venv de construcción con backend/requirements-build.lock.
2. Mantener backend/.env disponible únicamente en el entorno privado de construcción.
3. Ejecutar backend/build_release.py --clean-env desde ese venv. La opción construye un segundo entorno aislado con las distribuciones fijadas y verifica sus archivos contra RECORD.
4. Revisar output/build-frontend.log, build-onedir.log, build-launcher.log y build-migrator.log.
5. Ejecutar las pruebas y la verificación del paquete antes de distribuir.

Desde la raíz del proyecto, iniciar la construcción con el entorno preparado:

~~~powershell
.\backend\venv\Scripts\python.exe backend\build_release.py --clean-env
~~~

Las dependencias de ejecución están en requirements-runtime.lock; la construcción agrega PyInstaller y sus herramientas. NumPy y pandas quedan excluidos del paquete. La verificación del binario comprueba exportaciones reales de liquidación y roster, conservando la hoja adicional Roster de compatibilidad.

## Instalación y migración

El instalador autocontenido extrae y valida el paquete completo, conserva la configuración y la sesión existentes, inicia el nuevo runtime y espera una confirmación de bandeja por token, versión y PID.

La instalación queda en %LOCALAPPDATA%/Ingeap/CheckDiario:

| Ruta | Contenido |
| --- | --- |
| app/ | Exe y _internal de la versión activa |
| .env, sesion_activa.json, logs/ | Configuración y datos persistentes |
| updates/ | Staging, versión anterior, confirmaciones y copias de recuperación |
| CheckDiarioIngeap.exe | Lanzador compatible con accesos antiguos |
| Desinstalar.ps1 | Retiro de accesos e inicio automático, conservando archivos y datos |

La apertura normal apunta directamente a app/CheckDiarioIngeap.exe. La extracción onefile solo corresponde al instalador/migrador y al lanzador de compatibilidad, no al runtime del inicio automático.

El protocolo antiguo sigue aceptando --updater --parent-pid --target-dir --update-file. El migrador usa su paquete embebido; no copia un exe de onedir sin sus dependencias. Los clientes que salten una versión intermedia siguen recibiendo el migrador compatible.

## Recuperación

- La promoción se registra en updates/pending.json.
- Si el nuevo proceso no confirma su arranque o falla la configuración, se detiene únicamente el hijo iniciado por el instalador y se restaura la carpeta anterior y su configuración.
- Se conservan los archivos de una operación interrumpida. Una instalación posterior puede recuperar la transacción; la app debe estar cerrada.
- Para una reversión manual, cerrar Check Diario desde la bandeja y ejecutar el migrador con --rollback y, si corresponde, --target-dir. La restauración conserva credenciales y sesiones.
- La reversión de una migración desde onefile recupera también el ejecutable anterior y los accesos capturados.

El script Desinstalar.ps1 conserva la semántica previa: retira inicio automático y accesos, preservando los archivos locales. No usarlo como prueba sobre una instalación operativa.

## Comprobaciones sin modificar el inicio de Windows

~~~powershell
# Sobre el runtime onedir de la última construcción:
app\CheckDiarioIngeap.exe --verify-install

# Sobre el migrador:
CheckDiarioIngeap.exe --validate-package-only
~~~

La primera comprobación valida hashes, exportaciones Excel e icono sin abrir la interfaz ni consultar la base de datos. La segunda verifica el paquete embebido sin instalarlo. Los fallos se comunican mediante el código de salida.

La comparación de tiempos registrada en output/benchmark_inicio_cli.json usa --help en ambas versiones. No representa el tiempo hasta escritorio utilizable ni sustituye los reinicios del piloto.

## Antes de publicar

Completar la conexión a la base aislada, la instalación con usuario estándar, el caso de autoarranque deshabilitado, las notificaciones, el ciclo de ocultar/mostrar y al menos tres reinicios por condición en equipos afectados. Conservar los paquetes anteriores. No publicar solamente app/CheckDiarioIngeap.exe como asset de actualización.
