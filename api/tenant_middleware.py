"""Tenant middleware: resolve tenant and set search_path.

Resolves tenant_id from:
1. Existing request.state.tenant_id (e.g. set by JWT claim)
2. X-Tenant-Slug header (subdomain-based routing via nginx)
3. Falls back to tenant_id=1 (single-tenant backward compatibility)
"""

import logging

from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from api.database import engine

logger = logging.getLogger("karta.tenant")


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        tenant_id = getattr(request.state, "tenant_id", None)

        # Resolve tenant from X-Tenant-Slug header (set by nginx for *.karta.app)
        if not tenant_id:
            tenant_slug = request.headers.get("x-tenant-slug")
            if tenant_slug:
                with engine.connect() as conn:
                    row = conn.execute(
                        text(
                            "SELECT id FROM tenants WHERE slug = :slug AND is_active = true"
                        ),
                        {"slug": tenant_slug},
                    ).fetchone()
                    if row:
                        tenant_id = row[0]
                    else:
                        logger.warning("Unknown tenant slug: %s", tenant_slug)

        # Default tenant for backward compatibility
        if not tenant_id:
            tenant_id = 1

        request.state.tenant_id = tenant_id
        request.state.tenant_schema = f"tenant_{tenant_id}"
        response = await call_next(request)
        return response
