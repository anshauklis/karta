# Q3 Enterprise + Monetization — Design

## Scope

9 features (Usage Analytics merged into existing analytics module):

1. License system (JWT feature gates)
2. Audit log
3. Advanced RBAC (roles, teams)
4. SSO: SAML + OIDC + LDAP
5. Multi-tenant (schema per tenant)
6. White-label (logo, colors, app name)
7. Pricing page + Stripe billing
8. Enterprise landing page
9. Managed cloud (Karta Cloud)

Architecture decision: **single binary, feature flags via `KARTA_LICENSE` JWT**.

---

## 1. License System

`KARTA_LICENSE` env var = RS256-signed JWT. Public key embedded in code.

### JWT Claims

```json
{
  "org": "acme-corp",
  "features": ["sso", "audit", "rbac", "whitelabel", "multitenant"],
  "tier": "team",
  "max_users": 100,
  "exp": 1756684800
}
```

### Files

| File | Description |
|------|-------------|
| `api/license.py` | `parse_license()`, `has_feature(name)`, `get_tier()`, `get_max_users()`, `require_feature(name)` dependency |
| `api/license_keys.py` | Embedded RS256 public key (gitignored private key for signing) |
| `GET /api/license` | Returns tier + features list (no secrets) for frontend |
| Frontend | `useLicense()` hook, conditional UI rendering |

### Behavior

- No license → full open-source, enterprise endpoints return 403
- Expired license → grace period 7 days, then degrade to OSS
- Invalid signature → treat as no license
- `require_feature("sso")` FastAPI dependency for enterprise endpoints

---

## 2. Audit Log

### Table: `audit_log`

```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   INTEGER,
    user_id     INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id INTEGER,
    details     JSONB DEFAULT '{}',
    ip_address  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time
    ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user
    ON audit_log(user_id, created_at DESC);
```

### Actions

`login`, `logout`, `create`, `update`, `delete`, `execute`, `export`, `share`, `restore`.

### Resources

`dashboard`, `chart`, `connection`, `dataset`, `user`, `report`, `alert`, `rls_rule`, `filter`, `version`.

### Implementation

- `api/audit.py` — `log_action(user_id, action, resource_type, resource_id, details, ip)` async helper
- FastAPI middleware captures IP from request
- Sprinkle `log_action()` calls in existing routers (create/update/delete endpoints)
- Admin UI: `/admin/audit` — filterable table (user, action, resource, date range)
- Enterprise feature: `require_feature("audit")`

---

## 3. Advanced RBAC

### Current model

`users.is_admin` boolean. Two roles: admin, user.

### New model

#### Roles

| Role | Permissions |
|------|------------|
| `viewer` | Read dashboards, charts, datasets. Execute charts. |
| `editor` | Viewer + create/edit/delete own resources. |
| `admin` | Editor + manage users, connections, RLS, alerts, reports. |
| `owner` | Admin + billing, SSO config, tenant settings. |

#### Tables

```sql
-- Teams
CREATE TABLE IF NOT EXISTS teams (
    id          SERIAL PRIMARY KEY,
    tenant_id   INTEGER,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Team membership with role
CREATE TABLE IF NOT EXISTS team_members (
    id       SERIAL PRIMARY KEY,
    team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role     TEXT NOT NULL DEFAULT 'viewer',
    UNIQUE(team_id, user_id)
);

-- Resource ownership
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);
ALTER TABLE connections ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
```

#### Authorization flow

1. User authenticates → JWT contains `user_id`
2. On resource access: check `team_members` for user's role in resource's team
3. `is_public = true` resources visible to all users in tenant
4. Global role from `users.role` column (replaces `is_admin`)

#### Files

| File | Description |
|------|-------------|
| `api/rbac.py` | `check_permission(user_id, resource_type, resource_id, action)`, `require_role("editor")` dependency |
| `api/teams/router.py` | CRUD for teams + membership |
| Frontend | `/admin/teams` page, team selector in resource creation |

Enterprise feature: teams + granular roles behind `require_feature("rbac")`. Without license, classic admin/user model remains.

---

## 4. SSO: SAML + OIDC + LDAP

### OIDC

next-auth natively supports generic OIDC provider. Configuration stored in DB:

```sql
CREATE TABLE IF NOT EXISTS sso_providers (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER,
    provider_type   TEXT NOT NULL,  -- 'oidc', 'saml', 'ldap'
    name            TEXT NOT NULL,
    config          JSONB NOT NULL, -- provider-specific config (encrypted secrets)
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

OIDC config: `{issuer, client_id, client_secret, scopes, user_mapping}`.

### SAML

Use `@boxyhq/saml-jackson` — open-source SAML-to-OIDC bridge (used by Cal.com, Dub.co). Runs as sidecar service in docker-compose. Karta treats it as an OIDC provider.

Alternative: `python3-saml` in FastAPI directly (no sidecar, but more code).

Recommended: **saml-jackson sidecar** — battle-tested, minimal code in Karta.

SAML config: `{metadata_url, entity_id, acs_url}`.

### LDAP

Python `ldap3` package. Backend-only auth provider (no next-auth involvement).

Flow: user enters credentials → API calls LDAP bind → on success, create/update local user → issue JWT.

LDAP config: `{host, port, bind_dn, bind_password, search_base, user_filter, email_attr, name_attr, use_tls}`.

### Admin UI

`/admin/sso` — list providers, add/edit/delete. Test connection button. Per-provider toggle (active/inactive).

Enterprise feature: `require_feature("sso")`.

---

## 5. Multi-tenant (Schema per tenant)

### Architecture

- `public` schema: `users`, `tenants`, `sso_providers`, `audit_log`, `licenses` (shared)
- `tenant_<id>` schemas: `dashboards`, `charts`, `connections`, `datasets`, `reports`, `alerts`, `dashboard_filters`, `dashboard_tabs`, `dashboard_versions`, `teams`, `team_members` (isolated)

### Table: `tenants`

```sql
CREATE TABLE IF NOT EXISTS tenants (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    schema_name TEXT UNIQUE NOT NULL,
    settings    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    is_active   BOOLEAN DEFAULT TRUE
);
```

`users` gets `tenant_id` column. User belongs to exactly one tenant.

### Middleware

1. Determine tenant from: JWT claim `tenant_id` OR subdomain (`acme.karta.app`)
2. `SET search_path = tenant_<id>, public` on each DB connection
3. All queries automatically scoped to tenant's schema

### Tenant lifecycle

- Create: `CREATE SCHEMA tenant_<id>`, run DDL (same `SCHEMA_SQL` but in new schema)
- Delete: `DROP SCHEMA tenant_<id> CASCADE` (with confirmation)
- Default: `tenant_1` created on first startup (migration from single-tenant)

### Files

| File | Description |
|------|-------------|
| `api/tenants/router.py` | CRUD for tenants (owner-only) |
| `api/tenant_middleware.py` | Request middleware: resolve tenant, set search_path |
| `api/database.py` | `ensure_tenant_schema(tenant_id)` |

Enterprise feature: `require_feature("multitenant")`. Without it, single implicit tenant.

---

## 6. White-label

### Tenant settings (in `tenants.settings` JSONB)

```json
{
  "app_name": "Acme Analytics",
  "logo_url": "/api/tenant/logo",
  "favicon_url": "/api/tenant/favicon",
  "primary_color": "#2563eb",
  "accent_color": "#7c3aed",
  "custom_css": ""
}
```

### Implementation

- `GET /api/tenant/settings` — returns white-label config (public, no auth)
- `PUT /api/tenant/settings` — update (owner-only)
- `POST /api/tenant/logo` — upload logo file (stored in `data/tenant/<id>/`)
- Frontend: `useTenantSettings()` hook → inject CSS variables, replace logo/favicon/title

Enterprise feature: `require_feature("whitelabel")`.

---

## 7. Pricing Page + Stripe Billing

### Stripe integration

- `stripe` Python package for backend (webhooks, customer management)
- Checkout: user clicks "Upgrade" → Stripe Checkout session → redirect to Stripe → webhook confirms payment → update license

### Tables

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER REFERENCES tenants(id),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    tier            TEXT NOT NULL DEFAULT 'community',
    status          TEXT NOT NULL DEFAULT 'active',
    current_period_end TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Endpoints

- `POST /api/billing/checkout` — create Stripe Checkout session
- `POST /api/billing/webhook` — Stripe webhook handler (subscription created/updated/cancelled)
- `GET /api/billing/status` — current subscription status
- `POST /api/billing/portal` — redirect to Stripe Customer Portal (manage subscription)

### Frontend

- `/pricing` — public pricing page (3 tiers, feature comparison)
- `/admin/billing` — current plan, usage, invoices, manage subscription button

---

## 8. Enterprise Landing Page

Static marketing page at `/enterprise` route:
- Hero: "Karta for Enterprise"
- Feature highlights: SSO, audit, RBAC, white-label, multi-tenant
- Comparison table (Community vs Team vs Enterprise)
- Customer logos / testimonials (placeholder initially)
- CTA: "Contact Sales" form → sends email via SMTP or stores in DB

Simple implementation: Next.js static page, no dynamic data.

---

## 9. Managed Cloud (Karta Cloud)

MVP approach: **manual provisioning** with API scaffolding.

### Flow

1. Customer signs up on pricing page → Stripe payment
2. Webhook triggers tenant creation (schema + initial admin user)
3. Customer gets `<slug>.karta.app` subdomain
4. DNS: wildcard `*.karta.app` → nginx → tenant middleware resolves schema

### Infrastructure (later, not in initial code)

- Docker Compose on single VPS initially (all tenants share one instance)
- Auto-scaling: Kubernetes migration when >50 tenants
- Monitoring: health checks, per-tenant resource limits

### Initial scope

- Tenant provisioning API (create schema + admin user)
- Subdomain routing in nginx + middleware
- Automated onboarding flow (signup → payment → provision → welcome email)

---

## Implementation Order

| # | Feature | Risk | Dependencies | Effort |
|---|---------|------|-------------|--------|
| 1 | License system | Low | — | S |
| 2 | Audit log | Low | License | M |
| 3 | Advanced RBAC | High | License | L |
| 4 | Multi-tenant | High | RBAC | XL |
| 5 | SSO (OIDC + SAML + LDAP) | Medium | Multi-tenant, License | L |
| 6 | White-label | Low | Multi-tenant | M |
| 7 | Stripe billing | Medium | Multi-tenant, License | L |
| 8 | Enterprise landing page | Low | — | S |
| 9 | Managed cloud | High | All above | L |

Features 1-3 can be implemented without multi-tenant (single-tenant mode). Multi-tenant (4) is the foundation for cloud. SSO (5) needs tenant context for per-tenant provider config.

Recommended order: 1 → 8 → 2 → 3 → 4 → 5 → 6 → 7 → 9.
