"""Tenants CRUD: multi-tenant management (enterprise feature)."""

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from api.database import engine, ensure_tenant_schema
from api.auth.dependencies import get_current_user, require_admin
from api.license import require_feature

router = APIRouter(tags=["tenants"])

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{1,62}[a-z0-9]$")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class TenantCreate(BaseModel):
    name: str
    slug: str
    settings: dict | None = None


class TenantUpdate(BaseModel):
    name: str | None = None
    settings: dict | None = None


class TenantResponse(BaseModel):
    id: int
    name: str
    slug: str
    schema_name: str
    settings: dict | None = None
    is_active: bool = True
    created_at: str | None = None


# ---------------------------------------------------------------------------
# Endpoints (admin-only, requires 'multitenant' feature license)
# ---------------------------------------------------------------------------

@router.get(
    "/api/tenants/current",
    response_model=TenantResponse,
    summary="Get current tenant info",
)
def get_current_tenant(current_user: dict = Depends(get_current_user)):
    """Return the tenant associated with the current user.

    Falls back to the default tenant (id=1) when tenant_id is not set.
    """
    tenant_id = current_user.get("tenant_id", 1) or 1
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT * FROM tenants WHERE id = :id"),
            {"id": tenant_id},
        ).mappings().first()
    if not row:
        raise HTTPException(404, "Tenant not found")
    return dict(row)


@router.get(
    "/api/tenants",
    response_model=list[TenantResponse],
    summary="List all tenants",
    dependencies=[
        Depends(require_admin),
        Depends(require_feature("multitenant")),
    ],
)
def list_tenants(current_user: dict = Depends(get_current_user)):
    """List all tenants (admin-only, requires multitenant license)."""
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT * FROM tenants ORDER BY id"
        )).mappings().all()
    return [dict(r) for r in rows]


@router.post(
    "/api/tenants",
    response_model=TenantResponse,
    summary="Create tenant",
    dependencies=[
        Depends(require_admin),
        Depends(require_feature("multitenant")),
    ],
)
def create_tenant(
    body: TenantCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new tenant and provision its schema (admin-only)."""
    slug = body.slug.lower().strip()
    if not _SLUG_RE.match(slug):
        raise HTTPException(
            400,
            "Slug must be 3-64 lowercase alphanumeric characters or hyphens, "
            "starting and ending with a letter or digit.",
        )

    schema_name = f"tenant_{slug}"

    with engine.connect() as conn:
        # Check uniqueness
        existing = conn.execute(
            text("SELECT id FROM tenants WHERE slug = :slug"),
            {"slug": slug},
        ).fetchone()
        if existing:
            raise HTTPException(409, "Tenant with this slug already exists")

        row = conn.execute(
            text("""
                INSERT INTO tenants (name, slug, schema_name, settings)
                VALUES (:name, :slug, :schema_name, :settings)
                RETURNING *
            """),
            {
                "name": body.name,
                "slug": slug,
                "schema_name": schema_name,
                "settings": "{}" if body.settings is None else str(body.settings),
            },
        )
        conn.commit()
        tenant = dict(row.mappings().first())

    # Provision the tenant schema (creates tables in tenant_<slug> schema)
    ensure_tenant_schema(tenant["id"])
    return tenant


@router.put(
    "/api/tenants/{tenant_id}",
    response_model=TenantResponse,
    summary="Update tenant",
    dependencies=[
        Depends(require_admin),
        Depends(require_feature("multitenant")),
    ],
)
def update_tenant(
    tenant_id: int,
    body: TenantUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update tenant name or settings (admin-only)."""
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(400, "No fields to update")

    # Serialize settings to JSON string for the query
    if "settings" in updates and updates["settings"] is not None:
        import json
        updates["settings"] = json.dumps(updates["settings"])

    set_parts = [f"{k} = :{k}" for k in updates]
    updates["id"] = tenant_id

    with engine.connect() as conn:
        result = conn.execute(
            text(f"UPDATE tenants SET {', '.join(set_parts)} WHERE id = :id"),
            updates,
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Tenant not found")
        conn.commit()

        row = conn.execute(
            text("SELECT * FROM tenants WHERE id = :id"),
            {"id": tenant_id},
        ).mappings().first()
    return dict(row)


@router.delete(
    "/api/tenants/{tenant_id}",
    summary="Deactivate tenant",
    dependencies=[
        Depends(require_admin),
        Depends(require_feature("multitenant")),
    ],
)
def deactivate_tenant(
    tenant_id: int,
    current_user: dict = Depends(get_current_user),
):
    """Soft-delete a tenant by setting is_active=false (admin-only).

    The default tenant (id=1) cannot be deactivated.
    """
    if tenant_id == 1:
        raise HTTPException(400, "Cannot deactivate the default tenant")

    with engine.connect() as conn:
        result = conn.execute(
            text("UPDATE tenants SET is_active = false WHERE id = :id"),
            {"id": tenant_id},
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Tenant not found")
        conn.commit()
    return {"ok": True}
