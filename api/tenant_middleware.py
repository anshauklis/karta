"""Tenant middleware: resolve tenant and set search_path.

For the initial release, defaults to tenant_id=1 (single-tenant backward
compatibility). In the future, tenant_id will be resolved from the JWT
claim or subdomain.
"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("karta.tenant")


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Default tenant for backward compatibility.
        # Future: resolve from JWT claim or subdomain.
        tenant_id = getattr(request.state, "tenant_id", None) or 1
        request.state.tenant_id = tenant_id
        request.state.tenant_schema = f"tenant_{tenant_id}"
        response = await call_next(request)
        return response
