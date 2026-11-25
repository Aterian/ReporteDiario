# Avance de implementación — Inicio liviano de Windows

Versión candidata: 2.14.0. Base: b91cbf8 (2.13.2). Fecha: 12/11/2026.
Parche aplicado al proyecto original sobre la rama feat/buzon-sugerencias. Referencia de desarrollo: ff7c660, en fix/inicio-windows-liviano de scratch/inicio-windows.

## Resultado actual

La aplicación se construye como onedir y se instala en app/ con sus dependencias. El instalador y el migrador siguen siendo autocontenidos para admitir clientes anteriores. La configuración, las sesiones, el inicio con Windows y los logs permanecen fuera de la carpeta que se sustituye al actualizar.

Se conservan los cambios de la primera candidata: inicio diferido, bandeja sin WebView2 hasta abrir, conexión asíncrona, revalidación de sesión, recordatorios y vistas cargadas bajo demanda.

## Cambios de esta etapa

- Entorno limpio de construcción con 22 distribuciones de ejecución y 29 de construcción fijadas; archivos verificados contra RECORD. Sin NumPy, pandas ni pytest en el runtime.
- Paquete ZIP con manifiesto de versión/arquitectura, tamaños y SHA-256 de cada archivo. Se rechazan rutas inseguras, enlaces, duplicados y contenido corrupto.
- Instalación en staging y promoción con journal y copia recuperable. Bloqueo para impedir dos instalaciones sobre la misma carpeta.
- Confirmación local de bandeja mediante token, versión y PID, independiente de Railway. Si falla, se conserva una versión anterior utilizable.
- Captura y restauración de accesos, tarea de inicio, Run, preferencias y lanzador anterior.
- Migrador que entiende directamente los argumentos de los clientes 2.13.2/2.13.3; lanzador para accesos anclados y desinstalador de accesos incluido.
- Construcciones en carpetas nuevas, evitando mezclar archivos con una compilación anterior bloqueada.
- Corregida la comprobación que mostró una ventana de error: ahora admite las tres hojas principales de roster y la hoja Roster heredada. Un fallo del chequeo devuelve código 1 sin excepción gráfica no controlada.
- Revisados los 18 avisos Snyk: rutas de sesión/instalación restringidas, procesos sin shell, esquema de pruebas local y mensajes/tooltips como texto. Detalle por identificador y límites de verificación en REVISION_SNYK.md.

## Evidencia

| Comprobación | Resultado |
| --- | --- |
| Backend | 195 aprobadas, 25 omitidas |
| Frontend | 63 aprobadas; TypeScript correcto |
| Build React | Correcto; bundle principal de 378,34 kB |
| Paquete instalado | Aproximadamente 54,2 MiB; archivos verificados por el manifiesto |
| Extracción del exe de la aplicación | 0 entradas extraíbles en su archivo PyInstaller |
| NumPy en el paquete | Ausente |
| CLI --verify-install | Salida 0: hashes, exportaciones e icono correctos |
| Migrador --validate-package-only | Salida 0 |
| Recursos embebidos | Paquete y lanzador coinciden con la compilación actual |
| Código congelado | Comparado con las fuentes antes de ejecutar las comprobaciones |
| Sintaxis PowerShell | Validada |

Las 25 omisiones corresponden a 24 pruebas PostgreSQL cuya base aislada sigue inaccesible y una omisión previa de asyncio en Windows/Python 3.14. No se afirma que la integración completa esté aprobada.

La verificación del paquete corregido pasó sin mostrar el diálogo de error reportado. Se mantiene la exportación existente; no se modificaron cálculos salariales, triggers ni datos operativos.

## Comparación local de arranque del proceso

Tres ejecuciones de --help por versión:

| Versión | Tiempos (s) | Mediana |
| --- | --- | --- |
| Onefile 2.13.3 | 7,330; 5,981; 8,035 | 7,330 s |
| Onedir 2.14.0 | 0,741; 0,637; 0,821 | 0,741 s |

Esto mide el inicio y salida del CLI en este equipo. No mide el arranque de Windows, la ventana ni PostgreSQL. Los reinicios comparables del piloto siguen pendientes.

## Estado del plan

| Tareas | Estado |
| --- | --- |
| T01, T03 | Rama, versión, instrumentación y protección de pruebas implementadas |
| T02 | Pendiente: reinicios y mediciones en equipos afectados |
| T04 | Bloqueada: conectividad de la base aislada |
| T05–T07 | Implementadas y probadas con dobles; pendiente ensayo nativo completo |
| T08–T10 | Código listo; pendiente Task Scheduler/notificaciones con usuario estándar |
| T11–T13 | Implementadas y probadas |
| T14 | Revalidación implementada; consulta por id pendiente de evaluación con esquema real |
| T15–T17 | Construcción aislada, onedir y reducción de dependencias comprobados |
| T18–T22 | Migración, instalación, recuperación y compatibilidad implementadas y probadas de forma aislada; falta piloto real |
| T23 | Carga diferida implementada y medida |
| T24–T25 | Implementadas; pendiente prueba visual/nativa completa |
| T26 | Perfil persistente diferido: se conserva la política actual hasta medir beneficio |
| T27–T28 | Pruebas ampliadas; binarios comprobados; integración y matriz nativa pendientes |
| T29–T30 | Piloto y publicación pendientes |

La validación visual volvió a fallar por la sesión del navegador de pruebas. El servidor de ensayo se cerró; no se cambiaron protecciones de red.

## Artefactos y revisión

- instalador/Instalador_CheckDiario_Ingeap.exe: instalador de prueba.
- instalador/CheckDiarioIngeap.exe: migrador compatible para actualización.
- instalador/ultima_compilacion.json: ruta del runtime onedir completo de la última construcción.
- output/verificacion_onedir.json y output/benchmark_inicio_cli.json: resultados de comprobación.
- DISTRIBUCION_WINDOWS.md: construcción, entrega, instalación y recuperación.

El parche completo con la revisión de seguridad está en output/inicio_windows_2_14_0_con_seguridad.patch y se aplicó al proyecto original. Se verificaron los 56 archivos aplicados contra la referencia ff7c660 y se repitieron pytest, Vitest, TypeScript y el build en esta ubicación. Los dos archivos de evidencia ISO que ya estaban presentes conservan sus hashes.

El catálogo interno .agents/functional_catalog.md quedó fuera de la aplicación porque el entorno protege ese directorio contra escritura. El código y la documentación restante están actualizados. La publicación de la versión y la instalación en una computadora operativa siguen pendientes.
