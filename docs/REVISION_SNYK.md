# Revisión de los hallazgos Snyk — 12/11/2026

Fuentes examinadas: proyecto original 2.13.2 (b91cbf8) y candidata 2.14.0. Las correcciones quedaron en ff7c660 y su parche completo se aplicó al proyecto original. En esta ubicación se repitieron las 195 pruebas backend y 63 frontend aprobadas, TypeScript y el build.

Las líneas del informe coinciden con la versión 2.13.2. Once avisos apuntan a código de arranque, descarga e instalación sustituido al implementar 2.14.0. Esto explica su ausencia en la candidata; no constituye una confirmación de cierre por parte de Snyk.

## Resultado por hallazgo

| Finding ID | Archivo/línea del informe | Evaluación y acción en la candidata |
| --- | --- | --- |
| 7308cdf6-9e99-4b38-a08d-4e6647418b17 | main.py:101 | Retirada la eliminación ordinaria del acceso de Inicio basada en APPDATA. La migración explícita resuelve esa carpeta mediante la API de Windows. |
| 977c84b2-0f94-45fd-907b-8ddb8013cf29 | installer_app.py:40 | Retirada la copia del exe aislado. Paquete completo validado; destino oficial obtenido mediante API de Windows. |
| 98a115a7-87e4-43a8-be7a-3a9c2cbb11f3 | main.py:320 | Retirada la lectura desde TEMP. Descarga en updates/ de la instalación oficial y ruta generada por la aplicación. |
| 9585cf68-5082-4dc4-abbb-6927be795398 | main.py:317 | Retirada la escritura desde TEMP. El archivo de descarga se crea de forma exclusiva dentro de updates/. |
| e63e967e-d6fa-4d55-a13e-a3a473d352e4 | postgres_repository.py:210 | Eliminada la selección de cualquier archivo mediante CHECK_DIARIO_SESSION_FILE. Las pruebas inyectan la dependencia con mocks. |
| d23819ae-eba2-44b6-92e2-f501ce563cab | postgres_repository.py:214 | LOCALAPPDATA ya no elige la ruta de sesión. Nombre fijo bajo la carpeta conocida de Windows; rechazo de enlaces existentes. |
| 70ae1475-df19-4dc2-984c-e6d1ed6f85ad | bootstrap_test_db.py:83 | Retirado el flujo metadatos remotos → DDL → execute. Se usa el esquema local versionado y se verifica el nombre exacto de la base aislada antes de ejecutarlo. |
| bf04701a-4be3-49a0-89c6-219c43d9ffe5 | main.py:266 | Retirada la eliminación del archivo recibido mediante --update-file. El argumento legado se conserva por compatibilidad, sin usarlo para leer, copiar o borrar archivos. |
| 9733eee5-f90f-4ad8-bbc9-f5d9fc443cda | main.py:225 | Retirada la copia desde --update-file. El migrador utiliza su paquete embebido. |
| 56f61506-fea9-44c6-ac3f-032c482dfeb6 | main.py:323 | Retirada la eliminación de la ruta de descarga basada en TEMP. |
| 01410397-295d-43d4-b339-c8d264a1680f | installer_app.py:46 | Retirada la sobrescritura del .env existente. La primera copia se limita al destino oficial; la configuración se conserva al actualizar. |
| adc7d180-4c7d-497a-a3ac-a21f3f7c85fb | main.py:283 | Flujo antiguo sustituido. Destino de instalación restringido; proceso con ejecutable absoluto, argumentos separados y shell=False. |
| 9358593b-2baa-48be-8c02-8784e912cb50 | viewer.html:309 | Corregida la inserción directa de err.message mediante innerHTML. Mensaje y nombre de diagrama se muestran mediante textContent. |
| d540bfbe-85ff-47f1-b130-63b4771ec52d | main.py:354 | Flujo antiguo de TEMP sustituido por descarga propia bajo updates/. Sin comandos PowerShell interpolados con esa ruta. |
| ec459cb2-a839-4de0-ac2c-7d9c0c1c6108 | viewer.html:402 | El contexto de texto original ya escapaba etiquetas. Se sustituyeron todos los tooltips por nodos de texto y se limitaron las clases de badges a valores conocidos. |
| 67a4b483-69ac-4d9a-8619-cc670ce0d7a6 | installer_app.py:93 | Flujo antiguo sustituido. Directorio oficial, ejecución sin shell y PowerShell estático que recibe rutas mediante JSON. |
| 3954d55f-8dfa-48ad-8edc-8d7876e305fc | RemoteErrorsView.jsx:171 | No se confirmó XSS: los registros se serializaban como application/json, sin interpretarlos como HTML. Se simplificó la descarga con un enlace separado del documento y liberación garantizada de la URL. |
| ce530db7-f39f-42ae-9981-a39d513f01fa | viewer.html:441 | El texto original estaba escapado. Se reemplazó por textContent para eliminar la necesidad de construir HTML. |

## Cambios y alcance

- app_paths.py consulta FOLDERID_LocalAppData mediante SHGetKnownFolderPath; no acepta LOCALAPPDATA/USERPROFILE como destino de instalación. Si Windows no devuelve una ubicación válida, falla de forma controlada.
- El parámetro legado --target-dir solo admite la ubicación oficial por usuario. Se rechazan destinos relativos, ajenos o con componentes de recorrido. Se conserva el nombre y la forma del protocolo, pero se restringen los valores aceptados.
- La sesión usa exclusivamente sesion_activa.json dentro de esa ubicación. CHECK_DIARIO_SESSION_FILE deja de estar soportada en ejecución normal; los tests usan mocks explícitos.
- Los procesos se lanzan con listas de argumentos y shell=False. Las rutas con apóstrofos y metacaracteres se transmiten como datos JSON a los scripts PowerShell, sin concatenarlas en su código.
- El visor auxiliar mantiene la salida SVG del renderer Mermaid en modo strict. Los errores, nombres y tooltips usan nodos de texto; sus datos embebidos se conservaron sin regenerarlos.
- El bootstrap administrativo usa backend/tests/fixtures/postgres_schema.sql y las migraciones locales existentes. El esquema de pruebas debe actualizarse y revisarse en Git cuando cambie la estructura; ya no se clona ni se ejecuta automáticamente DDL del servidor remoto. Los cálculos y triggers de negocio siguen en PostgreSQL.
- No se agregaron exclusiones de reglas o archivos de código para ocultar los hallazgos.
- La verificación del paquete detectó metadatos mutables del Explorador incluidos en el inventario. Se excluyen de la distribución desktop.ini y Thumbs.db; los binarios, recursos y sus hashes siguen verificados.

## Validación realizada

| Comprobación | Resultado |
| --- | --- |
| Backend completo | 195 aprobadas, 25 omitidas |
| Frontend completo | 63 aprobadas |
| TypeScript | Correcto |
| Build React | Correcto; bundle principal 378,34 kB |
| Pruebas adversarias backend | Ruta de sesión inyectada, destino CLI ajeno, enlace existente, argumentos con metacaracteres, JSON para PowerShell y base SQL inesperada |
| Pruebas adversarias frontend | Errores, nombres, badges y aristas con etiquetas maliciosas; descarga JSON con contenido HTML y limpieza ante fallos |
| Datos embebidos del visor | Conservados byte a byte tras normalizar únicamente saltos de línea |
| Paquete recompilado | --verify-install y --validate-package-only con salida 0; código congelado y recursos comparados con las fuentes |
| Datos operativos | Ninguna modificación; conexiones de pruebas simuladas o restringidas a base aislada |

Las 25 omisiones son 24 pruebas PostgreSQL bloqueadas por DNS de la base aislada y una omisión previa de asyncio en Windows/Python 3.14.

## Nuevo análisis Snyk

Se intentó repetir el análisis con Snyk CLI 1.1308.4 sobre una copia de 124 archivos de fuentes de backend, frontend y diagramas de la candidata. Se excluyeron del material copiado las credenciales, sesiones, datos operativos, dependencias instaladas y binarios; no se ocultaron archivos de código de la aplicación.

El CLI terminó con código 2 y SNYK-CLI-0017: no pudo resolver api.snyk.io. El análisis no se completó y no hay un resultado posterior que confirme cero hallazgos. El registro está en output/snyk-verificacion.log; el estado, en output/snyk_estado.json.

Desde la copia corregida, repetir cuando haya conectividad:

~~~powershell
snyk code test --json-file-output=output/snyk-seguridad.json
~~~

El proyecto original ya contiene las correcciones del parche; el siguiente análisis debe ejecutarse desde esta raíz actualizada. Comparar reglas, archivos y recorridos de datos; los identificadores o números de línea pueden cambiar tras una modificación.

La integración PostgreSQL y las pruebas de instalación/inicio de sesión del piloto continúan pendientes. Las comprobaciones unitarias y de empaquetado no sustituyen esa aceptación.

## Entrega de los cambios

Los parches se guardaron en output/ del proyecto principal:

- seguridad_snyk_2_14_0.patch: revisión de seguridad sobre el commit local f0ac7d6.
- inicio_windows_2_14_0_con_seguridad.patch: cambios completos de inicio liviano y seguridad sobre b91cbf8, para el proyecto original 2.13.2. Se comprobó con git apply --check.

La copia de referencia conserva la rama fix/inicio-windows-liviano. El proyecto original tiene aplicados los 56 archivos de código y documentación del parche; el catálogo interno .agents/functional_catalog.md está pendiente por protección de escritura del entorno. Las validaciones no instalaron la aplicación ni registraron tareas de Windows.

## Referencias primarias

- [Microsoft: SHGetKnownFolderPath](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shgetknownfolderpath).
- [MDN: textContent y diferencia frente a innerHTML](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent).
- [Psycopg: composición de SQL e identificadores](https://www.psycopg.org/docs/sql).
- [PostgreSQL: advertencia sobre restaurar SQL de un servidor de origen](https://www.postgresql.org/docs/current/app-pgdump.html).
- [Snyk: code test y salidas JSON](https://docs.snyk.io/developer-tools/snyk-cli/commands/code-test).
