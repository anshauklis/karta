"""Karta Cloud: tenant provisioning and onboarding."""

import logging
import os
import re

import bcrypt as _bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import text

from api.database import engine, ensure_tenant_schema

logger = logging.getLogger("karta.cloud")
router = APIRouter(prefix="/api/cloud", tags=["cloud"])

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{1,62}[a-z0-9]$")


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
async def provision_tenant(body: ProvisionRequest):
    """Create a new tenant with schema and admin user."""
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
