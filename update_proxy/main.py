# [FN-03.08] Aplicación FastAPI para distribución segura de actualizaciones desde repo privado
from contextlib import asynccontextmanager
import os
import re

import asyncpg
import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import RedirectResponse

from update_proxy.service import ProxyError, UpdateProxyService

_SQL_CONSUMIR_TOKEN = """
UPDATE app_rrhh.b_1_tokens_actualizacion t
SET consumido_en = TIMEZONE('utc', NOW())
FROM app_rrhh.a_1_usuarios u
WHERE t.id_usuario = u.id_usuario
  AND t.token_hash = $1
  AND t.proposito = $2
  AND t.consumido_en IS NULL
  AND t.expira_en > TIMEZONE('utc', NOW())
  AND u.activo IS TRUE
RETURNING u.id_usuario::text AS id_usuario, LOWER(COALESCE(u.rol_app, 'user_1')) AS rol_app;
"""


def _extraer_bearer(authorization: str | None) -> str:
    valor = str(authorization or "").strip()
    if not valor.lower().startswith("bearer "):
        return ""
    return valor[7:].strip()


def _validar_repo(repo: str) -> str:
    limpio = str(repo or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", limpio):
        raise RuntimeError("GITHUB_REPO debe tener formato owner/repo.")
    return limpio


def _resolver_base_url(request: Request) -> str:
    configurada = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if configurada:
        return configurada
    esquema = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip() or "https"
    host = request.headers.get("x-forwarded-host", request.headers.get("host", "")).split(",")[0].strip()
    if host:
        return f"{esquema}://{host}"
    return str(request.base_url).rstrip("/")


def crear_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        dsn = os.environ.get("DATABASE_URL", "").strip()
        github_token = os.environ.get("GITHUB_TOKEN", "").strip()
        github_repo = _validar_repo(os.environ.get("GITHUB_REPO", "Aterian/ReporteDiario"))
        cache_ttl = float(os.environ.get("RELEASES_CACHE_TTL", "300"))
        if not dsn:
            raise RuntimeError("Falta variable de entorno DATABASE_URL.")
        if not github_token:
            raise RuntimeError("Falta variable de entorno GITHUB_TOKEN.")

        pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=5, command_timeout=10)
        http = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0), follow_redirects=False)

        async def consume_token(token_hash: str, proposito: str) -> dict | None:
            async with pool.acquire() as conn:
                fila = await conn.fetchrow(_SQL_CONSUMIR_TOKEN, token_hash, proposito)
                return dict(fila) if fila else None

        async def fetch_releases() -> list[dict]:
            url = f"https://api.github.com/repos/{github_repo}/releases?per_page=15"
            resp = await http.get(
                url,
                headers={
                    "Authorization": f"Bearer {github_token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "User-Agent": "CheckDiario-UpdateProxy/1.0",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []

        async def resolve_asset_redirect(asset_id: int) -> str:
            url = f"https://api.github.com/repos/{github_repo}/releases/assets/{asset_id}"
            resp = await http.get(
                url,
                headers={
                    "Authorization": f"Bearer {github_token}",
                    "Accept": "application/octet-stream",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "User-Agent": "CheckDiario-UpdateProxy/1.0",
                },
            )
            if resp.status_code not in (301, 302, 303, 307, 308):
                raise ProxyError(502, f"GitHub respondió estado inesperado ({resp.status_code}) al resolver el asset.")
            location = resp.headers.get("location", "").strip()
            if not location:
                raise ProxyError(502, "GitHub no devolvió ubicación firmada para el asset.")
            return location

        app.state.pool = pool
        app.state.http = http
        app.state.service = UpdateProxyService(
            consume_token=consume_token,
            fetch_releases=fetch_releases,
            resolve_asset_redirect=resolve_asset_redirect,
            cache_ttl_seconds=cache_ttl,
        )
        try:
            yield
        finally:
            await http.aclose()
            await pool.close()

    app = FastAPI(title="Check Diario Update Proxy", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/v1/updates/check")
    async def check_updates(
        request: Request,
        edition: str = Query(default="operativa", pattern="^(operativa|gestion)$"),
        version: str = Query(default="0.0.0", pattern=r"^\d+\.\d+\.\d+$"),
        force: bool = Query(default=False),
        authorization: str | None = Header(default=None),
    ):
        try:
            return await app.state.service.verificar_actualizacion(
                token_bruto=_extraer_bearer(authorization),
                edicion_instalada=edition,
                version_instalada=version,
                base_url=_resolver_base_url(request),
                forzar_cache=force,
            )
        except ProxyError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from None

    @app.get("/v1/updates/assets/{asset_id}")
    async def download_asset(
        asset_id: int,
        authorization: str | None = Header(default=None),
    ):
        if asset_id <= 0:
            raise HTTPException(status_code=400, detail="Identificador de asset inválido.")
        try:
            location = await app.state.service.resolver_descarga_asset(
                token_bruto=_extraer_bearer(authorization),
                asset_id=asset_id,
            )
            return RedirectResponse(url=location, status_code=302, headers={"Cache-Control": "no-store"})
        except ProxyError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from None

    return app


app = crear_app()
