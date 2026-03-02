"""SSO provider management and LDAP login endpoints."""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import require_admin
from api.auth.jwt import encode_token
from api.license import require_feature
from api.sso.ldap_auth import authenticate_ldap

logger = logging.getLogger("karta.sso")

router = APIRouter(tags=["sso"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SSOProviderCreate(BaseModel):
    provider_type: str
    name: str
    config: dict = {}


class SSOProviderUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None
    is_active: bool | None = None


class LDAPLoginRequest(BaseModel):
    username: str
    password: str


# ---------------------------------------------------------------------------
# Admin CRUD — requires "sso" feature license + admin role
# ---------------------------------------------------------------------------

@router.get(
    "/api/sso/providers",
    summary="List SSO providers",
    dependencies=[Depends(require_feature("sso")), Depends(require_admin)],
)
def list_providers(current_user: dict = Depends(require_admin)):
    """List SSO providers for the current tenant."""
    tenant_id = current_user.get("tenant_id", 1)
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, tenant_id, provider_type, name, config, is_active, created_at
                FROM sso_providers
                WHERE tenant_id = :tid
                ORDER BY id
            """),
            {"tid": tenant_id},
        )
        return [dict(r) for r in rows.mappings().all()]


@router.post(
    "/api/sso/providers",
    summary="Create SSO provider",
    status_code=201,
    dependencies=[Depends(require_feature("sso")), Depends(require_admin)],
)
def create_provider(body: SSOProviderCreate, current_user: dict = Depends(require_admin)):
    """Create a new SSO provider (oidc, saml, or ldap)."""
    valid_types = {"oidc", "saml", "ldap"}
    if body.provider_type not in valid_types:
        raise HTTPException(400, f"Invalid provider_type. Must be one of: {valid_types}")

    tenant_id = current_user.get("tenant_id", 1)
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                INSERT INTO sso_providers (tenant_id, provider_type, name, config)
                VALUES (:tid, :ptype, :name, :config::jsonb)
                RETURNING id, tenant_id, provider_type, name, config, is_active, created_at
            """),
            {
                "tid": tenant_id,
                "ptype": body.provider_type,
                "name": body.name,
                "config": __import__("json").dumps(body.config),
            },
        )
        conn.commit()
        return dict(row.mappings().fetchone())


@router.put(
    "/api/sso/providers/{provider_id}",
    summary="Update SSO provider",
    dependencies=[Depends(require_feature("sso")), Depends(require_admin)],
)
def update_provider(provider_id: int, body: SSOProviderUpdate, current_user: dict = Depends(require_admin)):
    """Update an existing SSO provider."""
    tenant_id = current_user.get("tenant_id", 1)
    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM sso_providers WHERE id = :id AND tenant_id = :tid"),
            {"id": provider_id, "tid": tenant_id},
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Provider not found")

        fields = {}
        if body.name is not None:
            fields["name"] = body.name
        if body.config is not None:
            fields["config"] = __import__("json").dumps(body.config)
        if body.is_active is not None:
            fields["is_active"] = body.is_active

        if not fields:
            raise HTTPException(400, "No fields to update")

        set_parts = []
        for k in fields:
            if k == "config":
                set_parts.append(f"{k} = :{k}::jsonb")
            else:
                set_parts.append(f"{k} = :{k}")
        set_clause = ", ".join(set_parts)
        fields["id"] = provider_id
        fields["tid"] = tenant_id

        row = conn.execute(
            text(f"""
                UPDATE sso_providers SET {set_clause}
                WHERE id = :id AND tenant_id = :tid
                RETURNING id, tenant_id, provider_type, name, config, is_active, created_at
            """),
            fields,
        )
        conn.commit()
        return dict(row.mappings().fetchone())


@router.delete(
    "/api/sso/providers/{provider_id}",
    summary="Delete SSO provider",
    status_code=204,
    dependencies=[Depends(require_feature("sso")), Depends(require_admin)],
)
def delete_provider(provider_id: int, current_user: dict = Depends(require_admin)):
    """Delete an SSO provider."""
    tenant_id = current_user.get("tenant_id", 1)
    with engine.connect() as conn:
        result = conn.execute(
            text("DELETE FROM sso_providers WHERE id = :id AND tenant_id = :tid RETURNING id"),
            {"id": provider_id, "tid": tenant_id},
        )
        if not result.fetchone():
            raise HTTPException(404, "Provider not found")
        conn.commit()


@router.post(
    "/api/sso/providers/{provider_id}/test",
    summary="Test SSO provider connection",
    dependencies=[Depends(require_feature("sso")), Depends(require_admin)],
)
def test_provider(provider_id: int, current_user: dict = Depends(require_admin)):
    """Test connectivity for an SSO provider."""
    tenant_id = current_user.get("tenant_id", 1)
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT provider_type, config
                FROM sso_providers
                WHERE id = :id AND tenant_id = :tid
            """),
            {"id": provider_id, "tid": tenant_id},
        ).mappings().fetchone()
        if not row:
            raise HTTPException(404, "Provider not found")

    ptype = row["provider_type"]
    config = row["config"] if isinstance(row["config"], dict) else __import__("json").loads(row["config"])

    if ptype == "ldap":
        return _test_ldap(config)
    elif ptype == "oidc":
        return _test_oidc(config)
    elif ptype == "saml":
        return {"success": True, "message": "SAML provider saved. Verify metadata URL is accessible."}
    else:
        return {"success": False, "message": f"Unknown provider type: {ptype}"}


def _test_ldap(config: dict) -> dict:
    from ldap3 import Server, Connection, ALL
    host = config.get("host", "localhost")
    port = config.get("port", 389)
    use_tls = config.get("use_tls", False)
    bind_dn = config.get("bind_dn", "")
    bind_password = config.get("bind_password", "")
    try:
        server = Server(host, port=port, use_ssl=use_tls, get_info=ALL)
        conn = Connection(server, user=bind_dn, password=bind_password, auto_bind=True)
        conn.unbind()
        return {"success": True, "message": "LDAP bind successful"}
    except Exception as e:
        return {"success": False, "message": f"LDAP bind failed: {e}"}


def _test_oidc(config: dict) -> dict:
    issuer = config.get("issuer", "").rstrip("/")
    if not issuer:
        return {"success": False, "message": "Issuer URL is required"}
    well_known = f"{issuer}/.well-known/openid-configuration"
    try:
        resp = httpx.get(well_known, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "success": True,
                "message": f"OIDC discovery OK. Authorization endpoint: {data.get('authorization_endpoint', 'N/A')}",
            }
        return {"success": False, "message": f"HTTP {resp.status_code} from {well_known}"}
    except Exception as e:
        return {"success": False, "message": f"Failed to fetch OIDC discovery: {e}"}


# ---------------------------------------------------------------------------
# LDAP login — NOT behind require_feature, checks provider existence
# ---------------------------------------------------------------------------

@router.post("/api/auth/ldap", summary="LDAP login")
def ldap_login(body: LDAPLoginRequest, request: Request):
    """Authenticate via LDAP. Finds active LDAP provider, authenticates, and returns JWT."""
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT id, config FROM sso_providers
                WHERE provider_type = 'ldap' AND is_active = true
                ORDER BY id LIMIT 1
            """),
        ).mappings().fetchone()

        if not row:
            raise HTTPException(404, "No active LDAP provider configured")

        config = row["config"] if isinstance(row["config"], dict) else __import__("json").loads(row["config"])
        result = authenticate_ldap(body.username, body.password, config)
        if not result:
            raise HTTPException(401, "LDAP authentication failed")

        email = result["email"]
        name = result["name"]

        # Find or create user
        user = conn.execute(
            text("SELECT id, email, name, is_admin FROM users WHERE email = :email"),
            {"email": email},
        ).mappings().fetchone()

        if not user:
            # Create new user from LDAP
            user = conn.execute(
                text("""
                    INSERT INTO users (email, name, password_hash, is_admin)
                    VALUES (:email, :name, :password_hash, false)
                    RETURNING id, email, name, is_admin
                """),
                {"email": email, "name": name, "password_hash": "!ldap"},
            ).mappings().fetchone()
            # Assign default roles
            for role in ("viewer",):
                conn.execute(
                    text("INSERT INTO user_roles (user_id, role) VALUES (:uid, :role)"),
                    {"uid": user["id"], "role": role},
                )
            conn.commit()

        # Fetch roles
        roles_result = conn.execute(
            text("SELECT role FROM user_roles WHERE user_id = :uid"),
            {"uid": user["id"]},
        )
        role_list = [r[0] for r in roles_result.fetchall()]

    token = encode_token({
        "sub": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "is_admin": "admin" in role_list,
        "roles": role_list,
    })
    return {"access_token": token}
