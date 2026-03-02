# API Overview

Karta exposes a REST API at `/api/*`. All endpoints (except health check and shared links) require JWT authentication.

## Authentication

1. Obtain a token:

```
POST /api/auth/login
Content-Type: application/json

{"email": "user@example.com", "password": "your-password"}
```

Response:

```json
{"access_token": "eyJ...", "token_type": "bearer"}
```

2. Use the token in all subsequent requests:

```
Authorization: Bearer eyJ...
```

Tokens are valid for 24 hours.

## Base URL

| Environment | Base URL |
|-------------|----------|
| Docker (default) | `http://localhost:8090/api` |
| Development | `http://localhost:8000/api` |
| Production | `https://your-domain.com/api` |

## Endpoint Groups

| Group | Prefix | Description |
|-------|--------|-------------|
| **Auth** | `/api/auth` | Login, register, user profile |
| **Dashboards** | `/api/dashboards` | Dashboard CRUD and layout |
| **Charts** | `/api/charts` | Chart CRUD, execute, and preview |
| **Connections** | `/api/connections` | Database connections and schema introspection |
| **Datasets** | `/api/datasets` | Virtual and physical datasets |
| **Filters** | `/api/filters` | Dashboard filters |
| **SQL Lab** | `/api/sql` | Ad-hoc SQL execution |
| **Alerts** | `/api/alerts` | Alert rules and history |
| **Reports** | `/api/reports` | Scheduled reports |
| **Stories** | `/api/stories` | Narrative presentations |
| **AI** | `/api/ai` | Chat, SQL generation, insights |
| **Semantic** | `/api/semantic` | Models, measures, dimensions, joins |
| **Bookmarks** | `/api/bookmarks` | Saved filter states |
| **Annotations** | `/api/annotations` | Chart annotations |
| **Favorites** | `/api/favorites` | User favorites |
| **Templates** | `/api/templates` | Chart templates |
| **Export** | `/api/export` | Dashboard share links |
| **Tabs** | `/api/tabs` | Dashboard tabs |
| **SQL Tabs** | `/api/sql-tabs` | SQL Lab tabs |
| **Drafts** | `/api/drafts` | Chart auto-save drafts |
| **History** | `/api/history` | Entity change history |
| **Lineage** | `/api/lineage` | Data lineage graph |
| **Analytics** | `/api/analytics` | Usage analytics (admin) |

### Enterprise Endpoints

| Group | Prefix | License Feature |
|-------|--------|----------------|
| **Teams** | `/api/teams` | — |
| **Audit** | `/api/audit` | `audit` |
| **SSO** | `/api/sso` | `sso` |
| **White-Label** | `/api/tenant` | `whitelabel` |
| **Tenants** | `/api/tenants` | `multitenant` |
| **Billing** | `/api/billing` | — (Stripe config) |
| **Cloud** | `/api/cloud` | — |

## Common Patterns

### Pagination

List endpoints support `page` and `per_page` query parameters:

```
GET /api/audit?page=2&per_page=50
```

### Error Responses

All errors return JSON:

```json
{"detail": "Not found"}
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| `400` | Bad request (validation error) |
| `401` | Not authenticated |
| `403` | Forbidden (insufficient permissions or missing license) |
| `404` | Resource not found |
| `422` | Validation error (Pydantic) |
| `503` | Service unavailable (AI/billing not configured) |

### Admin Endpoints

Endpoints under `/api/admin/*` require admin role. Returns `403` for non-admin users.

## Interactive Docs

When `DISABLE_DOCS=false` is set in `.env`, Swagger UI is available at:

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
- **OpenAPI JSON**: `http://localhost:8000/openapi.json`

:::{tip}
In Docker, API docs are disabled by default. Set `DISABLE_DOCS=false` in `.env` and rebuild to enable.
:::

For the full auto-generated API reference with all request/response models, see [API Reference](../api/README.md).
