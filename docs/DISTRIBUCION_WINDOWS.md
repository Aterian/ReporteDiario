# Distribución de Check Diario (`2.18.1` — Ediciones Duales por Rol)

Estado: distribución dual física activa sobre monorepo único (`[FN-00.13]`).

## Ediciones y Archivos que Produce la Compilación

| Edición | Roles Destino | Artefactos en `instalador/` | Alcance Funcional |
| --- | --- | --- | --- |
| **Operativa** (`operativa`) | `user_1`, `user_2` *(incluido RPG liviano para Área Aplicaciones)* | `CheckDiarioIngeap.exe`, `Instalador_CheckDiario_Ingeap.exe`, `CheckDiarioIngeap-win64.zip`, `CheckDiarioLauncher.exe` | Registro diario (`CheckForm`), historial personal (`HistoryView`), buzón de sugerencias, recordatorios locales y tema RPG sin vistas administrativas. Excluye `openpyxl`, `jspdf`, `html2canvas` y endpoints de gestión. |
| **Gestión** (`gestion`) | `core`, `sub_admin`, `admin` | `CheckDiarioIngeap_Gestion.exe`, `Instalador_CheckDiario_Gestion.exe`, `CheckDiarioIngeap-gestion-win64.zip`, `CheckDiarioLauncher.exe` | Funcionalidad completa: módulos operativos + Roster Gantt, liquidaciones Excel, supervisión de terceros, usuarios/sueldos, proyectos, estadísticas ISO 9001 PDF y errores remotos. |

Cada construcción genera su carpeta independiente en `instalador/releases/<edicion>-<version>-<id>/`. `instalador/ultima_compilacion.json` registra los metadatos de cada edición generada y las copias de entrega en `instalador/`.

## Preparar una Construcción

Entorno probado: Windows x64 y Python 3.14.0 con `backend/requirements/requirements-build.lock`.

~~~powershell
# Compilar ambas ediciones (Operativa + Gestión) para una entrega general:
.\compilar_instalador.bat ambas
# O directamente desde el venv:
.\backend\venv\Scripts\python.exe backend\packaging\build_release.py --edicion ambas --clean-env

# Compilar únicamente Edición Gestión (cambios exclusivos de RRHH/Supervisión/Admin):
.\compilar_instalador.bat gestion
.\backend\venv\Scripts\python.exe backend\packaging\build_release.py --edicion gestion --clean-env

# Compilar únicamente Edición Operativa:
.\compilar_instalador.bat operativa
~~~

Logs generados en `output/`: `build-frontend-<edicion>.log`, `build-onedir-<edicion>.log`, `build-launcher-<edicion>.log` y `build-migrator-<edicion>.log`.

## Versionado Independiente y Publicación en GitHub Releases

En `backend/src/app_version.py` conviven `OPERATIVA_VERSION` y `GESTION_VERSION`:
1. **Release exclusivo de Gestión** (no notifica ni actualiza a `user_1`/`user_2`):
   - Incrementar únicamente `GESTION_VERSION` (ej. `2.18.1`), compilar con `--edicion gestion`, crear tag `gestion-v2.18.1` y publicar Release con `--latest=false` adjuntando `CheckDiarioIngeap_Gestion.exe`, `Instalador_CheckDiario_Gestion.exe`, `CheckDiarioIngeap-gestion-win64.zip` y `CheckDiarioLauncher.exe`.
2. **Release General / Operativo** (actualiza toda la plantilla):
   - Incrementar `OPERATIVA_VERSION` y `GESTION_VERSION` al mismo número (ej. `2.19.0`), compilar con `--edicion ambas`, crear tag `v2.19.0` como `Latest` adjuntando los binarios de ambas ediciones (`CheckDiarioIngeap.exe`, `Instalador_CheckDiario_Ingeap.exe`, `CheckDiarioIngeap-win64.zip`, `CheckDiarioIngeap_Gestion.exe`, `Instalador_CheckDiario_Gestion.exe`, `CheckDiarioIngeap-gestion-win64.zip` y `CheckDiarioLauncher.exe`).
3. **Auto-Crossgrade por cambio de rol**: Si un colaborador instalado en Edición Operativa pasa a `core`, `sub_admin` o `admin` en PostgreSQL, `update_channels.py` detecta el cambio y ofrece en 1 clic descargar e instalar `CheckDiarioIngeap_Gestion.exe`, conservando `.env`, `sesion_activa.json` y accesos directos.

## Instalación, Migración y Recuperación

- Ambas ediciones se instalan en `%LOCALAPPDATA%/Ingeap/CheckDiario` y comparten `app/`, `.env`, `sesion_activa.json`, `logs/`, `updates/` y `CheckDiarioIngeap.exe` (`CheckDiarioLauncher.exe`).
- El archivo `app/manifest.json` guarda `"formato": "check-diario/onedir-v1"`, `"version": "X.Y.Z"` y `"edicion": "operativa" | "gestion"`.
- El protocolo `--updater --parent-pid --target-dir --update-file`, la confirmación de bandeja y `--rollback` funcionan de forma idéntica y transaccional en ambas ediciones.

## Comprobaciones Locales de Paquetes

~~~powershell
# Runtime onedir de la última construcción:
instalador\releases\<carpeta>\app\CheckDiarioIngeap.exe --verify-install

# Instaladores autocontenidos:
instalador\CheckDiarioIngeap.exe --validate-package-only
instalador\CheckDiarioIngeap_Gestion.exe --validate-package-only
~~~
