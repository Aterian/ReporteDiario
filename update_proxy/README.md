# Check Diario Update Proxy (`[FN-03.08]`)

Microservicio FastAPI diseñado para desplegarse en el mismo proyecto **Railway** que PostgreSQL y distribuir actualizaciones de **Check Diario** desde el repositorio privado `Aterian/ReporteDiario` sin exponer credenciales de GitHub en los equipos cliente.

## Arquitectura de Seguridad

- **`GITHUB_TOKEN`** (Fine-grained PAT con único permiso `Contents: Read-only` sobre `Aterian/ReporteDiario`) vive exclusivamente en las variables de entorno del servicio en Railway.
- **Autenticación efímera por PostgreSQL:** cada consulta o descarga desde el cliente desktop emite un token aleatorio de un solo uso (TTL 120 s, almacenado como hash `SHA-256` en `app_rrhh.b_1_tokens_actualizacion`). El proxy valida y consume atómicamente el token en red privada (`DATABASE_URL`) y lee `rol_app` directamente desde `app_rrhh.a_1_usuarios`.
- **Cero egress binario en Railway:** `/v1/updates/assets/{asset_id}` solicita a GitHub API la descarga con `Accept: application/octet-stream` sin seguir redirecciones y responde `302 Found` hacia la URL temporal firmada de `objects.githubusercontent.com` (~60 s de validez, sin `GITHUB_TOKEN`).

## Pasos de Despliegue en Railway

1. Aplicar la migración SQL en PostgreSQL de Railway:
   - Ejecutar `backend/sql/010_tokens_actualizacion.sql`.
2. Crear en GitHub un **Fine-grained Personal Access Token**:
   - Repository access: **Only select repositories** -> `Aterian/ReporteDiario`.
   - Repository permissions: **Contents -> Read-only** (ningún otro permiso).
3. En Railway (dentro del proyecto donde ya corre PostgreSQL):
   - **New Service -> GitHub Repo** (`Aterian/ReporteDiario`).
   - En **Settings -> Root Directory**: configurar `update_proxy`.
   - Railway detectará automáticamente `update_proxy/Dockerfile` y `update_proxy/railway.toml`.
   - En **Variables**, configurar:
     - `DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}` *(ajustar al nombre exacto de tu servicio PostgreSQL en Railway)*
     - `GITHUB_TOKEN=<fine-grained PAT>`
     - `GITHUB_REPO=Aterian/ReporteDiario`
     - `RELEASES_CACHE_TTL=300`
   - En **Settings -> Networking**: generar dominio público HTTPS (`https://<tu-servicio>.up.railway.app`) y verificar `GET /health` -> `{"status":"ok"}`.
4. Configurar `DEFAULT_UPDATE_SERVICE_URL` en `backend/src/update_channels.py` con esa URL HTTPS, compilar la versión puente `2.20.0` (ambas ediciones) y publicarla **antes** de pasar el repositorio a privado.
