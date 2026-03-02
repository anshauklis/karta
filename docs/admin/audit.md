# Audit Log

Tracks user actions across the platform. Every create, update, delete, login, and export operation is recorded with full context. Requires an enterprise license with the `audit` feature enabled.

:::{note}
Without an enterprise license, audit logging is disabled and the Admin > Audit Log page is hidden.
:::

## Accessing the Audit Log

Navigate to **Admin > Audit Log** in the sidebar (admin role required).

## Event Table

Each audit event contains the following fields:

| Column | Description |
|--------|-------------|
| **Timestamp** | When the action occurred (server time, displayed in the user's locale) |
| **User** | Name and ID of the user who performed the action |
| **Action** | The type of action performed |
| **Resource Type** | The kind of resource affected |
| **Resource ID** | The identifier of the affected resource |
| **IP Address** | The client IP address captured from the request |
| **Details** | JSON object with change-specific metadata |

### Actions

`login`, `logout`, `create`, `update`, `delete`, `execute`, `export`, `share`, `restore`

### Resource Types

`dashboard`, `chart`, `connection`, `dataset`, `user`, `report`, `alert`, `rls_rule`, `filter`, `version`

## Filtering

The audit log supports several filters to narrow down events:

| Filter | Control | Description |
|--------|---------|-------------|
| **Action** | Dropdown | Filter by action type (e.g., only `delete` events) |
| **Resource type** | Dropdown | Filter by resource type (e.g., only `dashboard` events) |
| **Date range** | From/to date inputs | Restrict to a specific time window |

Filters can be combined. Results are paginated with 50 events per page.

:::{tip}
To investigate a specific incident, start by filtering on the resource type and narrowing the date range. The Details column often contains the before/after values of changed fields.
:::

## Details Column

The Details JSON varies by action type:

| Action | Example Details |
|--------|----------------|
| `create` | `{"name": "Q1 Revenue Dashboard"}` |
| `update` | `{"changed_fields": ["title", "layout"], "previous": {...}}` |
| `delete` | `{"name": "Old Report", "deleted_by": "admin@example.com"}` |
| `login` | `{"method": "password"}` or `{"method": "oidc", "provider": "okta"}` |
| `export` | `{"format": "pdf", "dashboard_id": 42}` |
| `share` | `{"token": "abc123", "expires_at": "2026-04-01T00:00:00Z"}` |

## Statistics

The **Stats** tab shows a 30-day aggregate summary:

- Total events by action type (bar chart)
- Most active users
- Most modified resources

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/audit` | List audit events (paginated, filterable) | Admin |
| `GET` | `/api/audit/stats` | 30-day aggregate statistics | Admin |

### Query Parameters for `GET /api/audit`

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | Filter by action type |
| `resource_type` | string | Filter by resource type |
| `from_date` | ISO 8601 date | Start of date range |
| `to_date` | ISO 8601 date | End of date range |
| `page` | integer | Page number (default: 1) |
| `per_page` | integer | Events per page (default: 50, max: 200) |

## Important Notes

- Audit events are immutable — they cannot be edited or deleted through the UI or API
- Events are stored in the `audit_log` table with indexes on `(tenant_id, created_at)` and `(user_id, created_at)` for efficient querying
- IP addresses are captured from the `X-Forwarded-For` header (set by nginx) or the direct connection address
- High-frequency actions like `execute` (chart rendering) can generate significant volume; consider setting up log rotation for long-running instances
