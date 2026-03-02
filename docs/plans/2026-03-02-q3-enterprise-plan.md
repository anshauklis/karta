# Q3 Enterprise + Monetization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add enterprise features (license gates, audit, RBAC, SSO, multi-tenancy, white-label, billing) to enable paid tiers.

**Architecture:** Single binary with JWT-based license gates. Schema-per-tenant isolation. SAML via BoxyHQ sidecar. Stripe for billing. All enterprise endpoints return 403 without valid license.

**Tech Stack:** FastAPI, PostgreSQL (schemas), next-auth (OIDC), @boxyhq/saml-jackson (SAML), ldap3 (LDAP), stripe (billing), PyJWT + RS256 (license)

**Design doc:** `docs/plans/2026-03-02-q3-enterprise-design.md`

**Order:** License → Landing Page → Audit → RBAC → Multi-tenant → SSO → White-label → Billing → Cloud

---

## Task 1: License System

**Files:**
- Create: `api/license.py`
- Create: `api/license_keys.py`
- Modify: `api/main.py` (add license endpoint + startup parse)
- Modify: `api/database.py` (no schema changes — license is env var only)
- Modify: `api/pyproject.toml` (add `PyJWT`, `cryptography`)
- Create: `frontend/src/hooks/use-license.ts`
- Modify: `frontend/src/types/index.ts` (add LicenseInfo type)

**Step 1: Add dependencies**

```bash
cd api && uv add PyJWT cryptography
```

**Step 2: Create `api/license_keys.py`**

Embedded RS256 public key for verifying license JWTs. Generate a keypair for development:

```python
"""RS256 public key for license JWT verification.

DO NOT commit the private key. It lives only on the license-signing server.
Generate keypair: openssl genrsa -out license_private.pem 2048
                  openssl rsa -in license_private.pem -pubout -out license_public.pem
"""

# Development/testing public key — replace with production key before launch
PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xfn/ygWe
REPLACE_WITH_REAL_KEY_BEFORE_PRODUCTION
-----END PUBLIC KEY-----"""
```

For dev/testing, also create a `scripts/generate_license.py` that signs JWTs with the private key (gitignored).

**Step 3: Create `api/license.py`**

```python
"""License system: JWT-based feature gates.

KARTA_LICENSE env var contains RS256-signed JWT with claims:
  org, features[], tier, max_users, exp
"""

import os
import time
import logging
from functools import lru_cache

import jwt
from fastapi import HTTPException

from api.license_keys import PUBLIC_KEY

logger = logging.getLogger("karta.license")

_GRACE_PERIOD = 7 * 86400  # 7 days after expiry

@lru_cache(maxsize=1)
def _parse_license() -> dict | None:
    """Parse and verify KARTA_LICENSE JWT. Cached for process lifetime."""
    token = os.environ.get("KARTA_LICENSE", "").strip()
    if not token:
        return None
    try:
        claims = jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"])
        return claims
    except jwt.ExpiredSignatureError:
        # Check grace period
        try:
            claims = jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"],
                                options={"verify_exp": False})
            exp = claims.get("exp", 0)
            if time.time() - exp < _GRACE_PERIOD:
                logger.warning("License expired but within grace period")
                claims["_grace"] = True
                return claims
        except Exception:
            pass
        logger.error("License expired beyond grace period")
        return None
    except Exception as e:
        logger.error(f"Invalid license: {e}")
        return None


def get_license() -> dict | None:
    """Get parsed license claims or None."""
    return _parse_license()


def get_tier() -> str:
    """Get license tier: 'community', 'team', or 'enterprise'."""
    lic = get_license()
    if not lic:
        return "community"
    return lic.get("tier", "community")


def get_features() -> list[str]:
    """Get list of licensed features."""
    lic = get_license()
    if not lic:
        return []
    return lic.get("features", [])


def has_feature(name: str) -> bool:
    """Check if a feature is licensed."""
    return name in get_features()


def get_max_users() -> int:
    """Get max users allowed. 0 = unlimited."""
    lic = get_license()
    if not lic:
        return 0  # community = unlimited (self-hosted)
    return lic.get("max_users", 0)


def require_feature(name: str):
    """FastAPI dependency: raises 403 if feature not licensed."""
    def _check():
        if not has_feature(name):
            raise HTTPException(status_code=403, detail=f"Feature '{name}' requires an enterprise license")
    return _check
```

**Step 4: Add license endpoint to `api/main.py`**

Add after existing imports:

```python
from api.license import get_license, get_tier, get_features

@app.get("/api/license")
async def license_info():
    lic = get_license()
    return {
        "tier": get_tier(),
        "features": get_features(),
        "org": lic.get("org") if lic else None,
        "max_users": lic.get("max_users", 0) if lic else 0,
        "grace": lic.get("_grace", False) if lic else False,
    }
```

**Step 5: Create `scripts/generate_license.py`**

```python
#!/usr/bin/env python3
"""Generate a KARTA_LICENSE JWT for development/testing.

Usage: python scripts/generate_license.py > .env.license
Requires: pip install PyJWT cryptography
"""

import sys
import time
import jwt

PRIVATE_KEY_PATH = "scripts/license_private.pem"

def generate(tier="enterprise", features=None, org="dev", max_users=100, days=365):
    if features is None:
        features = ["sso", "audit", "rbac", "whitelabel", "multitenant"]

    with open(PRIVATE_KEY_PATH) as f:
        private_key = f.read()

    claims = {
        "org": org,
        "tier": tier,
        "features": features,
        "max_users": max_users,
        "exp": int(time.time()) + days * 86400,
        "iat": int(time.time()),
    }

    token = jwt.encode(claims, private_key, algorithm="RS256")
    print(f"KARTA_LICENSE={token}")

if __name__ == "__main__":
    generate()
```

**Step 6: Frontend hook**

Create `frontend/src/hooks/use-license.ts`:

```typescript
"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type SessionWithToken = { accessToken?: string } | null;

interface LicenseInfo {
  tier: "community" | "team" | "enterprise";
  features: string[];
  org: string | null;
  max_users: number;
  grace: boolean;
}

export function useLicense() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["license"],
    queryFn: () => api.get<LicenseInfo>("/api/license", token),
    enabled: !!token,
    staleTime: Infinity,
  });
}

export function useHasFeature(feature: string): boolean {
  const { data } = useLicense();
  return data?.features?.includes(feature) ?? false;
}
```

Add `LicenseInfo` to `frontend/src/types/index.ts`.

**Step 7: Verify**

```bash
cd api && uv run ruff check .
cd frontend && npm run build
```

**Step 8: Commit**

```bash
git add api/license.py api/license_keys.py api/main.py api/pyproject.toml api/uv.lock \
  scripts/generate_license.py frontend/src/hooks/use-license.ts frontend/src/types/index.ts
git commit -m "feat: add JWT license system with feature gates"
```

---

## Task 2: Enterprise Landing Page

**Files:**
- Create: `frontend/src/app/(dashboard)/enterprise/page.tsx`
- Modify: `frontend/messages/en.json` (add enterprise namespace)
- Modify: `frontend/messages/ru.json` (add enterprise namespace)

**Step 1: Create landing page**

Simple static page at `/enterprise`:
- Hero section with title + description
- Feature grid (6 cards: SSO, Audit, RBAC, White-label, Multi-tenant, Priority Support)
- Pricing comparison table (Community vs Team vs Enterprise)
- CTA: "Contact Sales" button → mailto or form
- Use shadcn Card, Badge, Button components
- Responsive: 3-col grid on desktop, 1-col on mobile

**Step 2: Add i18n keys**

`enterprise` namespace with: title, subtitle, description, features (sso, audit, rbac, whitelabel, multitenant, support), pricing section, contactSales, community, team, enterprise tier names + descriptions.

**Step 3: Verify and commit**

```bash
cd frontend && npm run build
git add frontend/src/app/\(dashboard\)/enterprise/ frontend/messages/
git commit -m "feat: add enterprise landing page with pricing"
```

---

## Task 3: Audit Log

**Files:**
- Create: `api/audit.py`
- Create: `api/audit/router.py`
- Create: `api/audit/__init__.py`
- Modify: `api/database.py` (add audit_log table to SCHEMA_SQL)
- Modify: `api/main.py` (register audit router)
- Modify: `api/dashboards/router.py` (sprinkle log_action calls)
- Modify: `api/charts/router.py` (sprinkle log_action calls)
- Modify: `api/connections/router.py` (sprinkle log_action calls)
- Modify: `api/datasets/router.py` (sprinkle log_action calls)
- Create: `frontend/src/hooks/use-audit.ts`
- Create: `frontend/src/app/(dashboard)/admin/audit/page.tsx`
- Modify: `frontend/src/components/layout/app-header.tsx` (nav link)
- Modify: `frontend/messages/en.json` + `ru.json`

**Step 1: Add audit_log table to `api/database.py`**

Add to SCHEMA_SQL:

```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   INTEGER,
    user_id     INTEGER,
    action      TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id INTEGER,
    details     JSONB DEFAULT '{}',
    ip_address  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
```

**Step 2: Create `api/audit.py`**

```python
"""Audit logging helper. Logs user actions to audit_log table."""

import logging
from sqlalchemy import text
from api.database import engine

logger = logging.getLogger("karta.audit")

async def log_action(
    user_id: int | None,
    action: str,
    resource_type: str,
    resource_id: int | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
    tenant_id: int | None = None,
):
    """Log an audit event. Fire-and-forget — never blocks the request."""
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id, details, ip_address)
                VALUES (:tenant_id, :user_id, :action, :resource_type, :resource_id, :details, :ip_address)
            """), {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "details": __import__("json").dumps(details or {}),
                "ip_address": ip_address,
            })
            conn.commit()
    except Exception as e:
        logger.error(f"Audit log failed: {e}")
```

**Step 3: Create `api/audit/router.py`**

Endpoints:
- `GET /api/audit` — list audit events with pagination + filters (user_id, action, resource_type, date range). Admin-only + require_feature("audit").
- `GET /api/audit/stats` — aggregate counts by action/resource for dashboard.

**Step 4: Sprinkle `log_action()` calls**

Add to key mutation endpoints in:
- `api/dashboards/router.py` — create, update, delete dashboard
- `api/charts/router.py` — create, update, delete chart, execute chart
- `api/connections/router.py` — create, update, delete connection
- `api/datasets/router.py` — create, delete dataset

Pattern (after successful DB operation):
```python
await log_action(current_user["id"], "create", "dashboard", dashboard_id,
                 details={"title": body.title}, ip_address=request.client.host)
```

**Step 5: Frontend — audit hook + page**

`use-audit.ts`: `useAuditLog(filters)` query with pagination.
`admin/audit/page.tsx`: Filterable table (user, action, resource type, date range picker). Use shadcn Table + Select + DatePicker.

**Step 6: Nav link + i18n**

Add "Audit Log" to admin nav in app-header.tsx. Add `audit` namespace to en.json + ru.json.

**Step 7: Verify and commit**

```bash
cd api && uv run ruff check .
cd frontend && npm run build
git add api/audit.py api/audit/ api/database.py api/main.py \
  api/dashboards/router.py api/charts/router.py api/connections/router.py api/datasets/router.py \
  frontend/src/hooks/use-audit.ts frontend/src/app/\(dashboard\)/admin/audit/ \
  frontend/src/components/layout/app-header.tsx frontend/messages/
git commit -m "feat: add audit log — track all user actions"
```

---

## Task 4: Advanced RBAC

**Files:**
- Modify: `api/database.py` (add teams, team_members tables; add team_id to resources; add role to users)
- Create: `api/rbac.py`
- Create: `api/teams/router.py`
- Create: `api/teams/__init__.py`
- Modify: `api/main.py` (register teams router)
- Modify: `api/auth/dependencies.py` (update role checks)
- Modify: `api/dashboards/router.py` (team scoping)
- Modify: `api/connections/router.py` (team scoping)
- Modify: `api/datasets/router.py` (team scoping)
- Create: `frontend/src/hooks/use-teams.ts`
- Create: `frontend/src/app/(dashboard)/admin/teams/page.tsx`
- Modify: `frontend/messages/en.json` + `ru.json`

**Step 1: Schema changes**

Add to `api/database.py` SCHEMA_SQL:

```sql
-- User roles (replaces is_admin)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'editor';

-- Teams
CREATE TABLE IF NOT EXISTS teams (
    id          SERIAL PRIMARY KEY,
    tenant_id   INTEGER,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
    id       SERIAL PRIMARY KEY,
    team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role     TEXT NOT NULL DEFAULT 'viewer',
    UNIQUE(team_id, user_id)
);

-- Resource ownership
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS team_id INTEGER;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS team_id INTEGER;
```

Note: `is_public DEFAULT TRUE` for backward compat — existing resources visible to all.

**Step 2: Create `api/rbac.py`**

Authorization helpers:
- `get_user_role(user_id)` — returns global role from users table
- `get_team_role(user_id, team_id)` — returns role in specific team
- `can_access_resource(user_id, resource_type, resource_id)` — checks team membership or is_public
- `require_role(*roles)` — FastAPI dependency (replaces `require_admin`)

**Step 3: Create `api/teams/router.py`**

CRUD: create team, list teams, update team, delete team, add member, remove member, update member role.

**Step 4: Update resource routers**

Add team_id filter to list queries: user sees resources where `is_public = true` OR user is in resource's team. Admin/owner sees all.

**Step 5: Migrate `is_admin` to `role`**

In `api/database.py` ensure_schema, add migration:
```sql
UPDATE users SET role = 'admin' WHERE is_admin = true AND role = 'editor';
```

Update `api/auth/dependencies.py`: `require_admin` checks `role IN ('admin', 'owner')`.

**Step 6: Frontend**

`use-teams.ts`: CRUD hooks for teams + members.
`admin/teams/page.tsx`: Teams list, create dialog, member management.
Team selector dropdown in dashboard/connection/dataset create forms.

**Step 7: Verify and commit**

```bash
cd api && uv run ruff check .
cd frontend && npm run build
git commit -m "feat: add RBAC with teams, roles, and resource scoping"
```

---

## Task 5: Multi-tenant (Schema per tenant)

**Files:**
- Modify: `api/database.py` (tenants table, tenant schema DDL, search_path)
- Create: `api/tenants/router.py`
- Create: `api/tenants/__init__.py`
- Create: `api/tenant_middleware.py`
- Modify: `api/main.py` (add middleware, register router)
- Modify: `api/database.py` (ensure_tenant_schema function)
- Modify: `api/auth/dependencies.py` (add tenant_id to user context)

**Step 1: Add tenants table (in public schema)**

```sql
CREATE TABLE IF NOT EXISTS tenants (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    schema_name TEXT UNIQUE NOT NULL,
    settings    JSONB DEFAULT '{}',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT 1;
```

**Step 2: Create `api/tenant_middleware.py`**

FastAPI middleware:
1. Extract tenant from JWT claim `tenant_id` (or from subdomain for cloud)
2. Store in request state: `request.state.tenant_id`
3. For DB queries: wrap engine to `SET search_path = tenant_<id>, public`

**Step 3: Create tenant schema management in `api/database.py`**

```python
def ensure_tenant_schema(tenant_id: int):
    """Create tenant schema and run DDL."""
    schema = f"tenant_{tenant_id}"
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        # Run table DDL in tenant schema
        conn.execute(text(f"SET search_path = {schema}, public"))
        for stmt in TENANT_SCHEMA_SQL.split(";"):
            if stmt.strip():
                conn.execute(text(stmt))
        conn.commit()
```

`TENANT_SCHEMA_SQL` contains all per-tenant tables (dashboards, charts, connections, datasets, etc.) — extracted from existing SCHEMA_SQL.

**Step 4: Default tenant migration**

On startup: if no tenants exist, create `tenant_1` (slug: "default"), migrate all existing data into `tenant_1` schema. This ensures seamless upgrade for existing single-tenant installations.

**Step 5: Create `api/tenants/router.py`**

Owner-only endpoints: create tenant, list tenants, update tenant, delete tenant (with CASCADE).

**Step 6: Verify and commit**

```bash
cd api && uv run ruff check .
git commit -m "feat: add schema-per-tenant multi-tenancy"
```

---

## Task 6: SSO — OIDC + SAML + LDAP

**Files:**
- Modify: `api/database.py` (sso_providers table)
- Create: `api/sso/router.py`
- Create: `api/sso/__init__.py`
- Create: `api/sso/ldap_auth.py`
- Modify: `api/main.py` (register SSO router)
- Modify: `api/pyproject.toml` (add ldap3)
- Modify: `docker-compose.yml` (add saml-jackson sidecar)
- Create: `frontend/src/hooks/use-sso.ts`
- Create: `frontend/src/app/(dashboard)/admin/sso/page.tsx`
- Modify: `frontend/src/lib/auth.ts` (dynamic OIDC provider)
- Modify: `frontend/messages/en.json` + `ru.json`

**Step 1: Add sso_providers table**

```sql
CREATE TABLE IF NOT EXISTS sso_providers (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER,
    provider_type   TEXT NOT NULL,
    name            TEXT NOT NULL,
    config          JSONB NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Step 2: OIDC**

next-auth supports dynamic OIDC providers. On login page, fetch active OIDC providers from API → render "Sign in with {provider}" buttons. next-auth config dynamically adds providers from DB.

**Step 3: SAML via BoxyHQ**

Add `jackson` service to docker-compose.yml:
```yaml
jackson:
  image: boxyhq/jackson:latest
  ports: ["5225:5225"]
  environment:
    JACKSON_URL: http://jackson:5225
    DB_ENGINE: sql
    DB_TYPE: postgres
    DB_URL: postgresql://karta:${POSTGRES_PASSWORD}@postgres:5432/karta
  profiles: ["enterprise"]
```

SAML config stored in jackson. Karta treats jackson as an OIDC provider (jackson converts SAML → OIDC).

**Step 4: LDAP**

```bash
cd api && uv add ldap3
```

Create `api/sso/ldap_auth.py`:
- `authenticate_ldap(username, password, ldap_config)` — bind to LDAP, search user, return user info
- Called from a custom login endpoint `/api/auth/ldap`

**Step 5: Admin SSO config page**

`admin/sso/page.tsx`: list providers, add/edit dialog per type (OIDC fields: issuer/client_id/secret, SAML fields: metadata_url, LDAP fields: host/port/bind_dn/search_base).

**Step 6: Verify and commit**

```bash
cd api && uv run ruff check .
cd frontend && npm run build
git commit -m "feat: add SSO — OIDC, SAML (BoxyHQ), LDAP"
```

---

## Task 7: White-label

**Files:**
- Create: `api/whitelabel/router.py`
- Create: `api/whitelabel/__init__.py`
- Modify: `api/main.py`
- Create: `frontend/src/hooks/use-whitelabel.ts`
- Modify: `frontend/src/components/providers.tsx` (inject CSS vars)
- Modify: `frontend/src/components/layout/app-header.tsx` (dynamic logo/name)
- Modify: `frontend/messages/en.json` + `ru.json`

**Step 1: API endpoints**

- `GET /api/tenant/settings` — returns white-label config (public)
- `PUT /api/tenant/settings` — update settings (owner-only, require_feature("whitelabel"))
- `POST /api/tenant/logo` — upload logo file
- `POST /api/tenant/favicon` — upload favicon file

Settings stored in `tenants.settings` JSONB (from Task 5).

**Step 2: Frontend integration**

`use-whitelabel.ts`: fetch tenant settings on app load.
In `providers.tsx`: inject CSS custom properties from settings:
```typescript
document.documentElement.style.setProperty('--primary', settings.primary_color);
```

In `app-header.tsx`: replace "Karta" with `settings.app_name`, logo with `settings.logo_url`.

**Step 3: Verify and commit**

```bash
cd frontend && npm run build
git commit -m "feat: add white-label — custom logo, colors, app name"
```

---

## Task 8: Stripe Billing

**Files:**
- Modify: `api/database.py` (subscriptions table)
- Create: `api/billing/router.py`
- Create: `api/billing/__init__.py`
- Modify: `api/main.py`
- Modify: `api/pyproject.toml` (add stripe)
- Create: `frontend/src/hooks/use-billing.ts`
- Create: `frontend/src/app/(dashboard)/admin/billing/page.tsx`
- Create: `frontend/src/app/(dashboard)/pricing/page.tsx`
- Modify: `frontend/messages/en.json` + `ru.json`

**Step 1: Add stripe dependency**

```bash
cd api && uv add stripe
```

**Step 2: Subscriptions table**

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      SERIAL PRIMARY KEY,
    tenant_id               INTEGER REFERENCES tenants(id),
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    tier                    TEXT NOT NULL DEFAULT 'community',
    status                  TEXT NOT NULL DEFAULT 'active',
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);
```

**Step 3: Create `api/billing/router.py`**

- `POST /api/billing/checkout` — create Stripe Checkout session
- `POST /api/billing/webhook` — handle Stripe webhooks (subscription.created, updated, deleted)
- `GET /api/billing/status` — current subscription
- `POST /api/billing/portal` — Stripe Customer Portal URL

Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_TEAM`, `STRIPE_PRICE_ENTERPRISE`.

**Step 4: Webhook → license update**

On successful payment: generate license JWT for tenant, store in DB or update tenant settings.

**Step 5: Frontend**

`/pricing` page: public pricing table with "Get Started" / "Upgrade" buttons.
`/admin/billing` page: current plan, next billing date, manage subscription, invoices.

**Step 6: Verify and commit**

```bash
cd api && uv run ruff check .
cd frontend && npm run build
git commit -m "feat: add Stripe billing — checkout, webhooks, subscription management"
```

---

## Task 9: Managed Cloud (Karta Cloud)

**Files:**
- Modify: `docker-compose.yml` (add cloud profile)
- Modify: `nginx.conf` (wildcard subdomain routing)
- Create: `api/cloud/router.py`
- Create: `api/cloud/__init__.py`
- Modify: `api/main.py`
- Modify: `api/tenant_middleware.py` (subdomain → tenant resolution)

**Step 1: Subdomain routing**

Update `nginx.conf` to route `*.karta.app` to the same backend. Tenant resolved from subdomain in middleware.

**Step 2: Tenant provisioning API**

`POST /api/cloud/provision`:
1. Create Stripe customer
2. Create tenant (schema)
3. Create admin user
4. Send welcome email

**Step 3: Signup flow**

`/signup` page: email, password, org name → calls provision API → redirect to `<slug>.karta.app`.

**Step 4: Verify and commit**

```bash
cd api && uv run ruff check .
cd frontend && npm run build
git commit -m "feat: add Karta Cloud — tenant provisioning, subdomain routing"
```

---

## Verification Checklist (after all tasks)

1. `docker compose up --build -d` — all services start
2. `GET /api/license` — returns community tier (no license)
3. `GET /api/audit` — returns 403 (no license)
4. Set `KARTA_LICENSE` with generated JWT → restart
5. `GET /api/license` — returns enterprise tier
6. `GET /api/audit` — returns empty list (200)
7. Create dashboard → audit log entry appears
8. Create team, add member → team visible
9. SSO config page loads
10. `/enterprise` page renders
11. `/pricing` page renders
12. White-label settings save and apply
13. `cd api && uv run ruff check .` — clean
14. `cd frontend && npm run build` — clean
