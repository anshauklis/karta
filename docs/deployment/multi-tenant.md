# Multi-Tenant Deployment

Karta supports schema-per-tenant isolation for SaaS deployments.

## How It Works

Each tenant gets:

- A row in the `tenants` table (public schema)
- A dedicated PostgreSQL schema (`tenant_<id>`) with all Karta tables
- Isolated data --- dashboards, charts, connections, datasets, users

The default tenant (ID=1) is created automatically on first startup for backward
compatibility with single-tenant installations.

## Tenant Middleware

The `TenantMiddleware` resolves the current tenant for every request:

1. **JWT claim** --- if the user's JWT contains a `tenant_id` claim, that tenant is used
2. **{kbd}`X-Tenant-Slug` header** --- for managed cloud deployments, nginx passes this
   header based on subdomain
3. **Default** --- falls back to tenant ID 1

The resolved tenant sets `request.state.tenant_id` and `request.state.tenant_schema`
for all downstream queries.

## Managing Tenants

### API Endpoints

- `GET /api/tenants/current` --- current tenant info (any authenticated user)
- `GET /api/tenants` --- list all tenants (admin, requires `multitenant` feature)
- `POST /api/tenants` --- create tenant (admin). Creates DB row + schema with all tables.
- `PUT /api/tenants/{id}` --- update tenant (admin)
- `DELETE /api/tenants/{id}` --- soft-delete tenant (admin)

### Tenant Fields

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `slug` | URL-safe identifier (used for subdomains) |
| `is_active` | Whether the tenant is operational |
| `settings` | JSONB for tenant-specific configuration |

Slug validation: lowercase letters, numbers, hyphens. 3--50 characters. Must start
with a letter.

## Managed Cloud

For cloud deployments with wildcard subdomains:

1. Configure DNS: `*.karta.app` -> your server
2. nginx routes `<slug>.karta.app` requests with `X-Tenant-Slug: <slug>` header
3. `TenantMiddleware` looks up the tenant by slug
4. New tenants can self-provision via `POST /api/cloud/provision`

Provisioning creates: tenant record, schema with all tables, admin user account.

:::{warning}
Deleting a tenant does **NOT** drop the PostgreSQL schema. This is a safety measure
to prevent accidental data loss. Drop schemas manually if needed:

```sql
DROP SCHEMA tenant_42 CASCADE;
```
:::

:::{tip}
Multi-tenancy requires an enterprise license with the `multitenant` feature enabled.
Set `KARTA_LICENSE` in your `.env` file.
:::
