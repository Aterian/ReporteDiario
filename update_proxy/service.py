# [FN-03.08] Orquestación asíncrona con caché SingleFlight para el proxy de actualizaciones
import asyncio
import time
from collections.abc import Awaitable, Callable

from update_proxy.logic import (
    asset_autorizado_para_rol,
    hash_token,
    seleccionar_actualizacion_proxy,
    validar_destino_redirect_github,
)


class ProxyError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class UpdateProxyService:
    """Gestiona caché SingleFlight de releases, validación de tokens y redirects 302."""

    def __init__(
        self,
        *,
        consume_token: Callable[[str, str], Awaitable[dict | None]],
        fetch_releases: Callable[[], Awaitable[list[dict]]],
        resolve_asset_redirect: Callable[[int], Awaitable[str]],
        cache_ttl_seconds: float = 300.0,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._consume_token = consume_token
        self._fetch_releases = fetch_releases
        self._resolve_asset_redirect = resolve_asset_redirect
        self._cache_ttl = max(5.0, float(cache_ttl_seconds))
        self._clock = clock
        self._lock = asyncio.Lock()
        self._releases_cache: list[dict] | None = None
        self._cache_ts: float = 0.0

    async def _obtener_releases(self, *, forzar: bool = False) -> list[dict]:
        ahora = self._clock()
        if not forzar and self._releases_cache is not None and (ahora - self._cache_ts) < self._cache_ttl:
            return self._releases_cache

        async with self._lock:
            ahora = self._clock()
            if not forzar and self._releases_cache is not None and (ahora - self._cache_ts) < self._cache_ttl:
                return self._releases_cache
            try:
                releases = await self._fetch_releases()
            except Exception as exc:
                raise ProxyError(502, "No se pudo consultar el repositorio remoto de versiones.") from exc
            self._releases_cache = releases if isinstance(releases, list) else []
            self._cache_ts = self._clock()
            return self._releases_cache

    async def _validar_y_consumir_token(self, token_bruto: str, proposito: str) -> dict:
        token = str(token_bruto or "").strip()
        if len(token) < 16:
            raise ProxyError(401, "Token de autorización ausente o inválido.")
        usuario = await self._consume_token(hash_token(token), proposito)
        if not usuario:
            raise ProxyError(401, "Token inválido, expirado o ya consumido.")
        return usuario

    async def verificar_actualizacion(
        self,
        *,
        token_bruto: str,
        edicion_instalada: str,
        version_instalada: str,
        base_url: str,
        forzar_cache: bool = False,
    ) -> dict:
        usuario = await self._validar_y_consumir_token(token_bruto, "check")
        releases = await self._obtener_releases(forzar=forzar_cache)
        return seleccionar_actualizacion_proxy(
            releases,
            rol_usuario=usuario.get("rol_app"),
            edicion_instalada=edicion_instalada,
            version_instalada=version_instalada,
            base_url=base_url,
        )

    async def resolver_descarga_asset(self, *, token_bruto: str, asset_id: int) -> str:
        usuario = await self._validar_y_consumir_token(token_bruto, "download")
        releases = await self._obtener_releases(forzar=False)
        if not asset_autorizado_para_rol(releases, asset_id, usuario.get("rol_app")):
            releases = await self._obtener_releases(forzar=True)
            if not asset_autorizado_para_rol(releases, asset_id, usuario.get("rol_app")):
                raise ProxyError(403, "El paquete solicitado no está autorizado para el rol activo.")
        try:
            location = await self._resolve_asset_redirect(asset_id)
            return validar_destino_redirect_github(location)
        except ProxyError:
            raise
        except Exception as exc:
            raise ProxyError(502, "No se pudo resolver la descarga firmada desde GitHub.") from exc
