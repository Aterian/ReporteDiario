# Distribución de Check Diario (`2.20.0` — Ediciones Duales y Repositorio Privado)

Estado: distribución dual física activa sobre monorepo único (`[FN-00.13]`) con soporte para repositorio privado vía **Update Proxy en Railway** (`[FN-03.08]`) y desacoplamiento de `.env` en artefactos de Release.

## Ediciones y Archivos que Produce la Compilación

| Edición | Roles Destino | Artefactos de Release *(SIN `.env`, subir a GitHub Releases)* | Instalador Inicial Interno *(CON `.env`, solo entrega TI/RRHH)* |
| --- | --- | --- | --- |
| **Operativa** (`operativa`) | `user_1`, `user_2` *(incluido RPG liviano para Área Aplicaciones)* | `CheckDiarioIngeap.exe`, `CheckDiarioIngeap-win64.zip`, `CheckDiarioLauncher.exe`, `SHA256SUMS.txt` | `Instalador_CheckDiario_Ingeap.exe` *(NUNCA subir a Releases)* |
| **Gestión** (`gestion`) | `core`, `sub_admin`, `admin` | `CheckDiarioIngeap_Gestion.exe`, `CheckDiarioIngeap-gestion-win64.zip`, `CheckDiarioLauncher.exe`, `SHA256SUMS.txt` | `Instalador_CheckDiario_Gestion.exe` *(NUNCA subir a Releases)* |

> **Regla de Seguridad:** `CheckDiarioIngeap.exe` y `CheckDiarioIngeap_Gestion.exe` se compilan con `CHECK_DIARIO_EMBED_ENV=0` (sin `backend/.env`) para actualizaciones remotas sobre equipos ya configurados. Los ejecutables `Instalador_CheckDiario_*.exe` incluyen `backend/.env` (`CHECK_DIARIO_EMBED_ENV=1`) exclusivamente para primeras instalaciones internas y **jamás** deben adjuntarse a un Release de GitHub.

Cada construcción genera su carpeta independiente en `instalador/releases/<edicion>-<version>-<id>/`. `instalador/ultima_compilacion.json` discrimina `artefactos_release` (sin `.env`), `sha256_release` e `instalador_interno` (con `.env`).

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

# Compilar solo artefactos de Release remoto (omitiendo instaladores internos con .env):
.\backend\venv\Scripts\python.exe backend\packaging\build_release.py --edicion ambas --clean-env --sin-instalador-interno
~~~

Logs generados en `output/`: `build-frontend-<edicion>.log`, `build-onedir-<edicion>.log`, `build-launcher-<edicion>.log`, `build-migrator-<edicion>.log` y `build-installer-internal-<edicion>.log`.

## Versionado Independiente y Publicación en GitHub Releases Privado

En `backend/src/app_version.py` conviven `OPERATIVA_VERSION` y `GESTION_VERSION`:
1. **Release exclusivo de Gestión** (no notifica ni actualiza a `user_1`/`user_2`):
   - Incrementar únicamente `GESTION_VERSION`, compilar con `--edicion gestion`, crear tag anotado `gestion-vX.Y.Z` y publicar Release con `--latest=false` adjuntando **solo artefactos sin `.env`**: `CheckDiarioIngeap_Gestion.exe`, `CheckDiarioIngeap-gestion-win64.zip`, `CheckDiarioLauncher.exe` y `SHA256SUMS.txt`.
2. **Release General / Operativo** (actualiza toda la plantilla):
   - Incrementar `OPERATIVA_VERSION` y `GESTION_VERSION` al mismo número, compilar con `--edicion ambas`, crear tag anotado `vX.Y.Z` como `Latest` adjuntando **solo artefactos sin `.env`** de ambas ediciones (`CheckDiarioIngeap.exe`, `CheckDiarioIngeap-win64.zip`, `CheckDiarioIngeap_Gestion.exe`, `CheckDiarioIngeap-gestion-win64.zip`, `CheckDiarioLauncher.exe` y `SHA256SUMS.txt`).
3. **Resolución remota con repositorio privado (`[FN-03.08]`):**
   - Los clientes consultan `UPDATE_SERVICE_URL` (o `DEFAULT_UPDATE_SERVICE_URL` compilado en `update_channels.py`) autenticándose con tokens efímeros de un solo uso emitidos en `app_rrhh.b_1_tokens_actualizacion`.
   - El servicio `update_proxy` en Railway valida el rol real en PostgreSQL, consulta los releases privados con `GITHUB_TOKEN` (PAT `Contents: Read-only`) y responde un `302` hacia la URL temporal firmada de `objects.githubusercontent.com`.
   - `updater.py` despoja el header `Authorization` al cambiar de origen en la redirección y valida `MZ` + `SHA-256` (si fue informado).

## Instalación, Migración y Recuperación

- Ambas ediciones se instalan en `%LOCALAPPDATA%/Ingeap/CheckDiario` y comparten `app/`, `.env`, `sesion_activa.json`, `logs/`, `updates/` y `CheckDiarioIngeap.exe` (`CheckDiarioLauncher.exe`).
- El archivo `app/manifest.json` guarda `"formato": "check-diario/onedir-v1"`, `"version": "X.Y.Z"` y `"edicion": "operativa" | "gestion"`.
- El protocolo `--updater --parent-pid --target-dir --update-file`, la confirmación de bandeja y `--rollback` funcionan de forma idéntica y transaccional en ambas ediciones.

## Comprobaciones Locales de Paquetes

~~~powershell
# Runtime onedir de la última construcción:
instalador\releases\<carpeta>\app\CheckDiarioIngeap.exe --verify-install

# Migradores remotos (sin .env) e instaladores internos (con .env):
instalador\CheckDiarioIngeap.exe --validate-package-only
instalador\CheckDiarioIngeap_Gestion.exe --validate-package-only
instalador\Instalador_CheckDiario_Ingeap.exe --validate-package-only
instalador\Instalador_CheckDiario_Gestion.exe --validate-package-only
~~~
