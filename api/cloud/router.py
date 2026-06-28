"""Karta Cloud: tenant provisioning and onboarding."""

import hmac
import logging
import os
import re

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import text

from api.database import engine, ensure_tenant_schema

logger = logging.getLogger("karta.cloud")
router = APIRouter(prefix="/api/cloud", tags=["cloud"])

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{1,62}[a-z0-9]$")


def _require_provision_secret(x_provision_secret: str | None = Header(default=None)) -> None:
    """Authorize tenant provisioning with a control-plane shared secret.

    Provisioning creates a tenant plus a fully privileged admin user, so it must
    never be open. The secret is supplied out-of-band to the control plane via the
    CLOUD_PROVISION_SECRET env var. When the env var is unset the endpoint is
    disabled entirely (safe by default). Comparison is constant-time.
    """
    expected = os.environ.get("CLOUD_PROVISION_SECRET", "")
    if not expected:
        raise HTTPException(503, "Tenant provisioning is disabled")
    if not x_provision_secret or not hmac.compare_digest(x_provision_secret, expected):
        raise HTTPException(403, "Invalid provisioning credentials")


def _hash_password(password: str) -> str:
    """Hash password with bcrypt (same method as auth/router.py)."""
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


class ProvisionRequest(BaseModel):
    org_name: str
    slug: str
    admin_email: EmailStr
    admin_name: str
    admin_password: str


class ProvisionResponse(BaseModel):
    tenant_id: int
    slug: str
    url: str


@router.post("/provision", response_model=ProvisionResponse)
async def provision_tenant(
    body: ProvisionRequest,
    _auth: None = Depends(_require_provision_secret),
):
    """Create a new tenant with schema and admin user.

    Authorized via the CLOUD_PROVISION_SECRET control-plane shared secret
    (X-Provision-Secret header); disabled when the secret is not configured.
    """
    slug = body.slug.lower().strip()
    if not _SLUG_RE.match(slug):
        raise HTTPException(
            400,
            "Slug must be 3-64 lowercase alphanumeric characters or hyphens, "
            "starting and ending with a letter or digit.",
        )

    with engine.connect() as conn:
        # Check slug uniqueness
        exists = conn.execute(
            text("SELECT 1 FROM tenants WHERE slug = :slug"),
            {"slug": slug},
        ).fetchone()
        if exists:
            raise HTTPException(409, "Slug already taken")

        # Create tenant
        schema_name = f"tenant_{slug.replace('-', '_')}"
        row = conn.execute(
            text("""
                INSERT INTO tenants (name, slug, schema_name, settings)
                VALUES (:name, :slug, :schema, '{}')
                RETURNING id
            """),
            {"name": body.org_name, "slug": slug, "schema": schema_name},
        ).fetchone()
        tenant_id = row[0]
        conn.commit()

    # Provision schema (creates tables in tenant schema)
    ensure_tenant_schema(tenant_id)

    # Create admin user with bcrypt-hashed password
    password_hash = _hash_password(body.admin_password)
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO users (email, name, password_hash, is_admin, tenant_id)
                VALUES (:email, :name, :hash, true, :tid)
            """),
            {
                "email": body.admin_email,
                "name": body.admin_name,
                "hash": password_hash,
                "tid": tenant_id,
            },
        )
        # Assign all roles to the admin user
        user_row = conn.execute(
            text("SELECT id FROM users WHERE email = :email AND tenant_id = :tid"),
            {"email": body.admin_email, "tid": tenant_id},
        ).fetchone()
        if user_row:
            for role in ("admin", "editor", "viewer", "sql_lab"):
                conn.execute(
                    text("INSERT INTO user_roles (user_id, role) VALUES (:uid, :role)"),
                    {"uid": user_row[0], "role": role},
                )
        conn.commit()

    domain = os.environ.get("DOMAIN", "karta.app")
    return ProvisionResponse(
        tenant_id=tenant_id,
        slug=slug,
        url=f"https://{slug}.{domain}",
    )


@router.get("/health")
async def cloud_health():
    """Cloud service health check."""
    with engine.connect() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) FROM tenants WHERE is_active = true")
        ).fetchone()
        return {"status": "ok", "active_tenants": count[0] if count else 0}
