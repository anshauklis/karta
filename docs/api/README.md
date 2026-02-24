# Karta API

Karta is a self-hosted BI platform. This API provides endpoints for:

- **Dashboards** — Create and manage dashboards with grid layout
- **Charts** — 21+ chart types with visual and code modes
- **Connections** — Connect to PostgreSQL, MySQL, MSSQL, ClickHouse, DuckDB
- **Datasets** — Virtual (SQL) and physical (table) data sources
- **Filters** — Dashboard filters with cascading dependencies
- **SQL Lab** — Execute ad-hoc SQL queries
- **AI Assistant** — Chat-based data exploration with tool-use
- **Alerts & Reports** — Scheduled monitoring and reporting
- **Stories** — Narrative presentations with chart slides

## Authentication
All endpoints (except `/api/health` and `/api/shared/{token}`) require JWT authentication. Obtain a token via `POST /api/auth/login` and pass it as `Authorization: Bearer <token>`.

**Version:** 1.0.0

## auth
*Authentication and user management*

### `GET /api/setup/status`
**Check setup status**

Check if initial admin setup is needed. Returns true if no users exist.

**Responses:**

- `200`: Successful Response

---

### `POST /api/auth/register`
**Register first admin**

Register the initial admin user. Only works when no users exist in the system.

**Request Body:** `RegisterRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/auth/login`
**Login**

Authenticate with email and password. Returns a JWT access token valid for 24 hours.

**Request Body:** `LoginRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/auth/me`
**Get current user**

Get the profile of the currently authenticated user.

**Responses:**

- `200`: Successful Response

---

### `GET /api/users/list`
**List users (basic)**

List all users with basic info (id, name, email). Available to all authenticated users.

**Responses:**

- `200`: Successful Response

---

### `GET /api/admin/users`
**List users (admin)**

List all users with full details. Admin only.

**Responses:**

- `200`: Successful Response

---

### `POST /api/admin/users`
**Create user**

Create a new user account. Admin only.

**Request Body:** `UserCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `PUT /api/admin/users/{user_id}`
**Update user**

Update user details (name, email, password, admin status). Admin only.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `user_id` | path | integer | True |  |

**Request Body:** `UserUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/admin/users/{user_id}`
**Delete user**

Delete a user account. Admin only.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `user_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

## dashboards
*Dashboard CRUD and layout*

### `GET /api/dashboards/groups`
**List dashboard groups**

List all unique group names used by dashboards.

**Responses:**

- `200`: Successful Response

---

### `GET /api/dashboards`
**List dashboards**

List all non-archived dashboards with chart counts and owner info.

**Responses:**

- `200`: Successful Response

---

### `POST /api/dashboards`
**Create dashboard**

Create a new dashboard. Auto-generates a URL slug from the title.

**Request Body:** `DashboardCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `GET /api/dashboards/by-slug/{slug}`
**Get dashboard by slug**

Get a dashboard by its URL slug.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `slug` | path | string | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/dashboards/{dashboard_id}`
**Get dashboard**

Get a dashboard by ID.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/dashboards/{dashboard_id}`
**Update dashboard**

Update dashboard title, description, icon, slug, color scheme, owners, or roles.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `DashboardUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/dashboards/{dashboard_id}`
**Delete dashboard**

Soft-delete a dashboard by setting is_archived=true.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

## charts
*Chart CRUD, execute, and preview*

### `GET /api/charts`
**List all charts**

List all charts across all dashboards with basic info.

**Responses:**

- `200`: Successful Response

---

### `POST /api/charts`
**Create standalone chart**

Create a chart without attaching it to a dashboard.

**Request Body:** `ChartCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `GET /api/dashboards/{dashboard_id}/charts`
**List dashboard charts**

List all charts belonging to a specific dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/dashboards/{dashboard_id}/charts`
**Create chart on dashboard**

Create a new chart and add it to a dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `ChartCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `GET /api/charts/{chart_id}`
**Get chart**

Get chart details including config, SQL, and grid position.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/charts/{chart_id}`
**Update chart**

Update chart title, type, config, SQL, or grid position.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | integer | True |  |

**Request Body:** `ChartUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/charts/{chart_id}`
**Delete chart**

Delete a chart permanently.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

### `POST /api/charts/{chart_id}/duplicate`
**Duplicate chart**

Create a copy of a chart in the same dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | integer | True |  |

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `POST /api/dashboards/{dashboard_id}/import-chart/{chart_id}`
**Import chart to dashboard**

Copy an existing chart to another dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |
| `chart_id` | path | integer | True |  |

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `PUT /api/dashboards/{dashboard_id}/layout`
**Update layout**

Update grid positions (x, y, w, h) for all charts on a dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `LayoutUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/charts/{chart_id}/execute`
**Execute chart**

Execute a saved chart with optional runtime filters. Returns Plotly figure or table data.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/charts/preview`
**Preview chart**

Execute an ad-hoc chart configuration without saving. Use for testing before creation.

**Request Body:** `ChartPreviewRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## connections
*Database connections and schema introspection*

### `GET /api/connections`
**List connections**

List all database connections. Passwords are never returned.

**Responses:**

- `200`: Successful Response

---

### `POST /api/connections`
**Create connection**

Create a new database connection. Password is encrypted with AES-256-GCM.

**Request Body:** `ConnectionCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `PUT /api/connections/{conn_id}`
**Update connection**

Update connection details. Password is re-encrypted if changed.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `conn_id` | path | integer | True |  |

**Request Body:** `ConnectionUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/connections/{conn_id}`
**Delete connection**

Delete a database connection. System connections cannot be deleted.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `conn_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

### `POST /api/connections/{conn_id}/test`
**Test connection**

Test a database connection by executing a simple query.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `conn_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/connections/{conn_id}/schemas`
**List schemas**

List available database schemas for a connection.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `conn_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/connections/{conn_id}/schema`
**Get schema**

Get all tables and their columns with data types.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `conn_id` | path | integer | True |  |
| `schema` | query | string | False |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/connections/{conn_id}/schema/{table_name}/sample`
**Get table sample**

Get first N rows from a table to understand data format.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `conn_id` | path | integer | True |  |
| `table_name` | path | string | True |  |
| `limit` | query | integer | False |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## datasets
*Virtual and physical datasets*

### `GET /api/datasets`
**List datasets**

List all datasets (virtual and physical).

**Responses:**

- `200`: Successful Response

---

### `POST /api/datasets`
**Create dataset**

Create a dataset. Virtual datasets use a SQL query, physical datasets wrap a database table.

**Request Body:** `DatasetCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `GET /api/datasets/{dataset_id}`
**Get dataset**

Get dataset details including SQL query and connection info.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dataset_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/datasets/{dataset_id}`
**Update dataset**

Update dataset name, description, SQL query, or cache TTL.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dataset_id` | path | integer | True |  |

**Request Body:** `DatasetUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/datasets/{dataset_id}`
**Delete dataset**

Delete a dataset. Physical DuckDB datasets also drop the underlying table.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dataset_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

### `POST /api/datasets/{dataset_id}/preview`
**Preview dataset**

Execute the dataset SQL query and return sample data (first 200 rows).

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dataset_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/datasets/{dataset_id}/columns`
**Get dataset columns**

Get column names and data types by executing the dataset SQL.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dataset_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## filters
*Dashboard filters and cascading*

### `GET /api/dashboards/{dashboard_id}/filters`
**List filters for a dashboard**

Return all filters configured for the given dashboard, ordered by sort_order.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/dashboards/{dashboard_id}/filters`
**Create a filter**

Add a new filter to the dashboard. Supports types: select, multi_select, date_range, number_range.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `DashboardFilterCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `PUT /api/filters/{filter_id}`
**Update filter config**

Update filter properties including label, target column, type, config, and scoped chart IDs.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `filter_id` | path | integer | True |  |

**Request Body:** `DashboardFilterUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/filters/{filter_id}`
**Delete a filter**

Permanently remove a filter from its dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `filter_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

### `PUT /api/dashboards/{dashboard_id}/filters/reorder`
**Reorder filters**

Update the sort order of all filters for a dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `FilterReorderRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/dashboards/{dashboard_id}/charts-columns`
**Get columns for each chart**

Return column names per chart for filter scoping configuration.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/dashboards/{dashboard_id}/filter-datasets`
**List datasets used by dashboard charts**

Return datasets referenced by charts in this dashboard, useful for filter configuration.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/filters/{filter_id}/values`
**Get distinct filter values**

Return distinct values for the filter's target column. Supports cascading via parent_value parameter.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `filter_id` | path | integer | True |  |
| `parent_value` | query | string | False |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## tabs
*Dashboard tabs*

### `GET /api/dashboards/{dashboard_id}/tabs`
**List dashboard tabs**

Return all tabs for a dashboard, ordered by sort_order.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/dashboards/{dashboard_id}/tabs`
**Create a tab**

Add a new tab to the dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `TabCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `PUT /api/dashboards/{dashboard_id}/tabs/reorder`
**Reorder tabs**

Update the sort order of all tabs for a dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `TabReorder` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/dashboards/{dashboard_id}/tabs/{tab_id}`
**Update tab**

Update tab title or other properties.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |
| `tab_id` | path | integer | True |  |

**Request Body:** `TabUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/dashboards/{dashboard_id}/tabs/{tab_id}`
**Delete a tab**

Remove a tab. Charts on this tab are moved to the default tab.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |
| `tab_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

### `PUT /api/charts/{chart_id}/tab`
**Move chart to a tab**

Assign a chart to a different tab within its dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | integer | True |  |

**Request Body:** `ChartMoveToTab` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## bookmarks
*Saved filter states*

### `GET /api/dashboards/{dashboard_id}/bookmarks`
**List saved filter states**

Return all bookmarks (saved filter configurations) for a dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/dashboards/{dashboard_id}/bookmarks`
**Save current filter state as bookmark**

Create a bookmark that saves the current filter selections for quick recall.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `BookmarkCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/bookmarks/{bookmark_id}`
**Delete bookmark**

Permanently remove a saved filter state.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `bookmark_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

## annotations
*Chart and dashboard annotations*

### `GET /api/charts/{chart_id}/annotations`
**List chart annotations**

Return all annotations added to a specific chart.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/charts/{chart_id}/annotations`
**Add annotation to chart**

Create an annotation on a chart at a specific data point or range.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | integer | True |  |

**Request Body:** `AnnotationCreate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/dashboards/{dashboard_id}/annotations`
**List dashboard annotations**

Return all annotations across all charts in a dashboard.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/dashboards/{dashboard_id}/annotations`
**Add annotation to dashboard**

Create a dashboard-level annotation.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `AnnotationCreate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/annotations/{annotation_id}`
**Delete annotation**

Permanently remove an annotation.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `annotation_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## sql_lab
*Ad-hoc SQL execution*

### `POST /api/sql/execute`
**Execute SQL query**

Run a read-only SQL query against a database connection and return tabular results. Enforces a 30-second timeout and caches results.

**Request Body:** `SQLExecuteRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## sql_tabs
*SQL Lab tabs*

### `GET /api/sql/tabs`
**List SQL tabs**

Return all SQL Lab tabs for the current user, ordered by sort_order. Auto-creates a default tab if none exist.

**Responses:**

- `200`: Successful Response

---

### `POST /api/sql/tabs`
**Create SQL tab**

Create a new SQL Lab tab and set it as active. Deactivates all other tabs.

**Request Body:** `SQLTabCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `PUT /api/sql/tabs/reorder`
**Reorder SQL tabs**

Update the sort order of all SQL Lab tabs for the current user.

**Request Body:** `SQLTabReorderRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/sql/tabs/{tab_id}`
**Update SQL tab**

Update SQL tab properties such as label, connection, SQL content, or active state.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `tab_id` | path | integer | True |  |

**Request Body:** `SQLTabUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/sql/tabs/{tab_id}`
**Delete SQL tab**

Delete a SQL Lab tab. If it was active, activates the next tab. If no tabs remain, creates a default one.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `tab_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

## file-upload
*CSV/Parquet upload to DuckDB*

### `POST /api/csv/preview`
**Upload CSV/Parquet file for preview**

Upload a CSV or Parquet file and return a preview with the first 20 rows, column types, and total row count.

**Request Body:** `Body_preview_csv_api_csv_preview_post` (multipart/form-data)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/csv/import`
**Import previewed file as dataset**

Import a previously previewed CSV/Parquet file as a table into the shared DuckDB and create a Dataset record.

**Request Body:** `CSVImportRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## chart_drafts
*Auto-saved chart drafts*

### `GET /api/drafts/charts/{chart_id}`
**Get chart draft**

Retrieve the auto-saved draft for a chart. Use chart_id='new' for unsaved new charts.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | string | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/drafts/charts/{chart_id}`
**Save chart draft**

Create or update an auto-saved draft for a chart editor session.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | string | True |  |

**Request Body:** `ChartDraftUpsert` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/drafts/charts/{chart_id}`
**Delete chart draft**

Remove the auto-saved draft for a chart, typically called after a successful save.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `chart_id` | path | string | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

## templates
*Chart templates*

### `GET /api/templates`
**List chart templates**

Return all saved chart templates for the current user, ordered by creation date.

**Responses:**

- `200`: Successful Response

---

### `POST /api/templates`
**Create chart template**

Save a chart configuration as a reusable template.

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/templates/{template_id}`
**Delete chart template**

Permanently remove a saved chart template.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `template_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

## alerts
*Alert rules and history*

### `GET /api/alerts`
**List alert rules**

Return all alert rules ordered by creation date descending.

**Responses:**

- `200`: Successful Response

---

### `POST /api/alerts`
**Create alert rule**

Create a new alert rule and register it with the scheduler if active.

**Request Body:** `AlertRuleCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `GET /api/alerts/{alert_id}`
**Get alert rule**

Return a single alert rule by ID.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `alert_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/alerts/{alert_id}`
**Update alert rule**

Update an existing alert rule and reschedule or unschedule it accordingly.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `alert_id` | path | integer | True |  |

**Request Body:** `AlertRuleUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/alerts/{alert_id}`
**Delete alert rule**

Delete an alert rule and remove its scheduled job.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `alert_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

### `GET /api/alerts/{alert_id}/history`
**Get alert history**

Return the trigger history for a specific alert rule (last 100 entries).

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `alert_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/alert-history`
**Get all alert history**

Return combined trigger history across all alert rules (last 100 entries).

**Responses:**

- `200`: Successful Response

---

### `POST /api/alerts/{alert_id}/test`
**Test alert rule**

Run an alert check immediately and return whether it triggered.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `alert_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## notifications
*Notification channels (Slack, Telegram, email)*

### `GET /api/channels`
**List notification channels**

Return all notification channels (Slack, Telegram, email) ordered by creation date.

**Responses:**

- `200`: Successful Response

---

### `POST /api/channels`
**Create notification channel**

Create a new notification channel (Slack, Telegram, or email).

**Request Body:** `ChannelCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `PUT /api/channels/{channel_id}`
**Update notification channel**

Update a notification channel's name, config, or active status.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `channel_id` | path | integer | True |  |

**Request Body:** `ChannelUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/channels/{channel_id}`
**Delete notification channel**

Permanently delete a notification channel.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `channel_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

### `POST /api/channels/{channel_id}/test`
**Test notification channel**

Send a test message through the channel to verify its configuration.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `channel_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## reports
*Scheduled chart reports*

### `GET /api/reports`
**List reports**

Return all scheduled reports with linked chart and channel names.

**Responses:**

- `200`: Successful Response

---

### `POST /api/reports`
**Create report**

Create a new scheduled report and register it with the scheduler if active.

**Request Body:** `ReportCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `GET /api/reports/{report_id}`
**Get report**

Return a single scheduled report by ID with chart and channel details.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `report_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/reports/{report_id}`
**Update report**

Update a scheduled report and reschedule or unschedule it accordingly.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `report_id` | path | integer | True |  |

**Request Body:** `ReportUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/reports/{report_id}`
**Delete report**

Delete a scheduled report and remove its scheduled job.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `report_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

### `POST /api/reports/{report_id}/send`
**Run report now**

Manually trigger a report execution and delivery outside its schedule.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `report_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## stories
*Narrative presentations*

### `GET /api/stories`
**List stories**

Return all stories with their slide counts, ordered by last update.

**Responses:**

- `200`: Successful Response

---

### `POST /api/stories`
**Create story**

Create a new story (narrative presentation linked to a dashboard).

**Request Body:** `StoryCreate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/stories/{story_id}`
**Get story**

Return a single story with all its slides ordered by slide_order.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `story_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/stories/{story_id}`
**Update story**

Update story metadata (title, description, dashboard link).

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `story_id` | path | integer | True |  |

**Request Body:** `StoryUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/stories/{story_id}`
**Delete story**

Delete a story and all its slides.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `story_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/stories/{story_id}/slides`
**Create slide**

Add a new slide to a story, automatically placed at the end.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `story_id` | path | integer | True |  |

**Request Body:** `StorySlideCreate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/stories/slides/{slide_id}`
**Update slide**

Update a slide's chart, title, narrative, filters, or config.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `slide_id` | path | integer | True |  |

**Request Body:** `StorySlideUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/stories/slides/{slide_id}`
**Delete slide**

Remove a slide from its story.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `slide_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `PUT /api/stories/{story_id}/slides/reorder`
**Reorder slides**

Bulk-update slide_order for all slides in a story.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `story_id` | path | integer | True |  |

**Request Body:** `FilterReorderRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## ai
*AI assistant, SQL generation, glossary*

### `GET /api/ai/status`
**Get AI status**

Return AI configuration status (admin only). Never exposes the full API key.

**Responses:**

- `200`: Successful Response

---

### `GET /api/ai/admin/sessions`
**List all AI sessions (admin)**

List all AI chat sessions across all users with message counts (admin only).

**Responses:**

- `200`: Successful Response

---

### `GET /api/ai/sessions`
**List AI sessions**

Return the current user's AI chat sessions, most recent first (max 50).

**Responses:**

- `200`: Successful Response

---

### `GET /api/ai/sessions/{session_id}`
**Get session messages**

Return all messages in an AI session, ordered chronologically.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `session_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/ai/sessions/{session_id}`
**Delete AI session**

Delete an AI chat session and all its messages.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `session_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

### `POST /api/ai/chat`
**Chat with AI assistant**

Send a message to the AI assistant and receive an SSE stream with tool-use loop support.

**Request Body:** `AIChatRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/ai/generate-sql`
**Generate SQL from description**

Generate a SQL query from a natural-language description using schema context.

**Request Body:** `AIGenerateSQLRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/ai/fix-sql`
**Fix SQL error**

Analyze a SQL query and its error message, then return a corrected version.

**Request Body:** `AIFixSQLRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `POST /api/ai/summarize`
**Summarize chart data**

Generate a natural-language summary of chart data (uses first 50 rows).

**Request Body:** `AISummarizeRequest` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/ai/glossary`
**List glossary terms**

Return all business glossary terms sorted alphabetically.

**Responses:**

- `200`: Successful Response

---

### `POST /api/ai/glossary`
**Create glossary term**

Add a new business glossary term with definition and optional SQL hint (admin only).

**Request Body:** `AIGlossaryCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `PUT /api/ai/glossary/{term_id}`
**Update glossary term**

Update an existing glossary term's definition or SQL hint (admin only).

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `term_id` | path | integer | True |  |

**Request Body:** `AIGlossaryUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/ai/glossary/{term_id}`
**Delete glossary term**

Permanently remove a glossary term (admin only).

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `term_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

## rls
*Row-Level Security rules (admin)*

### `GET /api/rls`
**List RLS rules**

Return all row-level security rules ordered by connection and table (admin only).

**Responses:**

- `200`: Successful Response

---

### `POST /api/rls`
**Create RLS rule**

Create a new row-level security filter rule and invalidate the RLS cache (admin only).

**Request Body:** `RLSRuleCreate` (application/json)

**Responses:**

- `201`: Successful Response
- `422`: Validation Error

---

### `PUT /api/rls/{rule_id}`
**Update RLS rule**

Update a row-level security rule and invalidate affected RLS caches (admin only).

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `rule_id` | path | integer | True |  |

**Request Body:** `RLSRuleUpdate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/rls/{rule_id}`
**Delete RLS rule**

Delete a row-level security rule and invalidate the RLS cache (admin only).

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `rule_id` | path | integer | True |  |

**Responses:**

- `204`: Successful Response
- `422`: Validation Error

---

## analytics
*Usage analytics (admin)*

### `GET /api/analytics/popular`
**Get popular content**

Return the most viewed dashboards and charts in the last 30 days (admin only).

**Responses:**

- `200`: Successful Response

---

### `GET /api/analytics/dashboard/{dashboard_id}/stats`
**Get dashboard stats**

Return view statistics for a single dashboard over the last 30 days (admin only).

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/analytics/user-activity`
**Get user activity**

Return per-user view counts and last activity over the last 30 days (admin only).

**Responses:**

- `200`: Successful Response

---

## lineage
*Data lineage graph*

### `GET /api/lineage`
**Get data lineage graph**

Build and return a directed graph of connections, datasets, charts, dashboards, reports, and alerts.

**Responses:**

- `200`: Successful Response

---

## favorites
*User favorites*

### `GET /api/favorites`
**List user favorites**

Return all favorited entities for the current user, most recent first.

**Responses:**

- `200`: Successful Response

---

### `POST /api/favorites/toggle`
**Toggle favorite**

Add or remove a favorite for the current user. Returns the new favorited state.

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## export
*Dashboard share links*

### `POST /api/dashboards/{dashboard_id}/share`
**Create share link**

Generate a unique share token for a dashboard with optional expiration.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Request Body:** `SharedLinkCreate` (application/json)

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/dashboards/{dashboard_id}/shares`
**List share links**

Return all share links for a dashboard, most recent first.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `dashboard_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `DELETE /api/shares/{link_id}`
**Delete share link**

Revoke and delete a share link so it can no longer be used.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `link_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

### `GET /api/shared/{token}`
**Get shared dashboard**

Public endpoint (no auth). Resolve a share token and return the dashboard with executed charts.

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `token` | path | string | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## system

### `GET /api/health`
**Health check**

Return API health status. No authentication required.

**Responses:**

- `200`: Successful Response

---

### `GET /api/history/{entity_type}/{entity_id}`
**Get entity change history**

Return the last 50 change history entries for any entity (dashboard, chart, etc.).

**Parameters:**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `entity_type` | path | string | True |  |
| `entity_id` | path | integer | True |  |

**Responses:**

- `200`: Successful Response
- `422`: Validation Error

---

## Models

### AIChatRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | ? | No |  |
| `message` | string | Yes |  |
| `connection_id` | ? | No |  |
| `context` | ? | No |  |

### AIFixSQLRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connection_id` | integer | Yes |  |
| `sql` | string | Yes |  |
| `error` | string | Yes |  |

### AIGenerateSQLRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connection_id` | integer | Yes |  |
| `prompt` | string | Yes |  |
| `current_sql` | string | No |  |

### AIGlossaryCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `term` | string | Yes |  |
| `definition` | string | Yes |  |
| `sql_hint` | ? | No |  |

### AIGlossaryResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `term` | string | Yes |  |
| `definition` | string | Yes |  |
| `sql_hint` | ? | No |  |
| `created_by` | ? | No |  |
| `created_at` | string | Yes |  |

### AIGlossaryUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `term` | ? | No |  |
| `definition` | ? | No |  |
| `sql_hint` | ? | No |  |

### AIMessageResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `session_id` | integer | Yes |  |
| `role` | string | Yes |  |
| `content` | string | Yes |  |
| `tool_calls` | ? | No |  |
| `sql_query` | ? | No |  |
| `created_at` | string | Yes |  |

### AISessionResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `title` | string | Yes |  |
| `context_type` | ? | No |  |
| `context_id` | ? | No |  |
| `connection_id` | ? | No |  |
| `created_at` | string | Yes |  |
| `updated_at` | string | Yes |  |

### AISummarizeRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chart_type` | string | No |  |
| `title` | string | No |  |
| `columns` | array | No |  |
| `rows` | array | No |  |
| `row_count` | integer | No |  |

### AITextResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes |  |
| `sql` | ? | No |  |

### AlertRuleCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes |  |
| `connection_id` | integer | Yes |  |
| `channel_id` | ? | No |  |
| `alert_type` | string | Yes |  |
| `sql_query` | string | Yes |  |
| `condition_column` | ? | No |  |
| `condition_operator` | ? | No |  |
| `condition_value` | ? | No |  |
| `anomaly_config` | object | No |  |
| `schedule` | string | Yes |  |
| `timezone` | string | No |  |
| `severity` | string | No |  |
| `is_active` | boolean | No |  |

### AlertRuleUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | ? | No |  |
| `connection_id` | ? | No |  |
| `channel_id` | ? | No |  |
| `alert_type` | ? | No |  |
| `sql_query` | ? | No |  |
| `condition_column` | ? | No |  |
| `condition_operator` | ? | No |  |
| `condition_value` | ? | No |  |
| `anomaly_config` | ? | No |  |
| `schedule` | ? | No |  |
| `timezone` | ? | No |  |
| `severity` | ? | No |  |
| `is_active` | ? | No |  |

### AnnotationCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `annotation_type` | string | No |  |
| `content` | string | No |  |
| `x_value` | ? | No |  |
| `y_value` | ? | No |  |
| `config` | object | No |  |

### AnnotationResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `chart_id` | ? | Yes |  |
| `dashboard_id` | ? | Yes |  |
| `user_id` | integer | Yes |  |
| `user_name` | ? | No |  |
| `annotation_type` | string | Yes |  |
| `content` | string | Yes |  |
| `x_value` | ? | Yes |  |
| `y_value` | ? | Yes |  |
| `config` | object | Yes |  |
| `created_at` | string | Yes |  |

### Body_preview_csv_api_csv_preview_post

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | string | Yes |  |

### BookmarkCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes |  |
| `filter_state` | object | No |  |

### BookmarkResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `user_id` | integer | Yes |  |
| `dashboard_id` | integer | Yes |  |
| `name` | string | Yes |  |
| `filter_state` | object | Yes |  |
| `created_at` | string | Yes |  |

### CSVImportRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `temp_id` | string | Yes |  |
| `table_name` | string | Yes |  |
| `dataset_name` | string | Yes |  |
| `description` | string | No |  |

### CSVImportResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dataset_id` | integer | Yes |  |
| `connection_id` | integer | Yes |  |
| `dataset_name` | string | Yes |  |
| `table_name` | string | Yes |  |
| `row_count` | integer | Yes |  |

### CSVPreviewResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `temp_id` | string | Yes |  |
| `filename` | string | Yes |  |
| `columns` | array | Yes |  |
| `rows` | array | Yes |  |
| `total_rows` | integer | Yes |  |

### ChangeHistoryResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `entity_type` | string | Yes |  |
| `entity_id` | integer | Yes |  |
| `user_id` | ? | Yes |  |
| `user_name` | ? | No |  |
| `action` | string | Yes |  |
| `changes` | object | Yes |  |
| `created_at` | string | Yes |  |

### ChannelCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes |  |
| `channel_type` | string | Yes |  |
| `config` | object | Yes |  |

### ChannelResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `name` | string | Yes |  |
| `channel_type` | string | Yes |  |
| `config` | object | Yes |  |
| `is_active` | boolean | Yes |  |
| `created_by` | ? | Yes |  |
| `created_at` | string | Yes |  |

### ChannelUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | ? | No |  |
| `config` | ? | No |  |
| `is_active` | ? | No |  |

### ChartCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes |  |
| `description` | string | No |  |
| `dashboard_id` | ? | No |  |
| `connection_id` | ? | No |  |
| `dataset_id` | ? | No |  |
| `mode` | string | No |  |
| `chart_type` | ? | No |  |
| `chart_config` | object | No |  |
| `chart_code` | string | No |  |
| `sql_query` | string | No |  |
| `tab_id` | ? | No |  |

### ChartDraftResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `user_id` | integer | Yes |  |
| `chart_id` | ? | No |  |
| `dashboard_id` | ? | No |  |
| `connection_id` | ? | No |  |
| `dataset_id` | ? | No |  |
| `title` | string | Yes |  |
| `description` | string | Yes |  |
| `mode` | string | Yes |  |
| `chart_type` | string | Yes |  |
| `chart_config` | object | Yes |  |
| `chart_code` | string | Yes |  |
| `sql_query` | string | Yes |  |
| `updated_at` | string | Yes |  |

### ChartDraftUpsert

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dashboard_id` | ? | No |  |
| `connection_id` | ? | No |  |
| `dataset_id` | ? | No |  |
| `title` | string | No |  |
| `description` | string | No |  |
| `mode` | string | No |  |
| `chart_type` | string | No |  |
| `chart_config` | object | No |  |
| `chart_code` | string | No |  |
| `sql_query` | string | No |  |

### ChartExecuteRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filters` | ? | No |  |

### ChartExecuteResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `figure` | ? | No |  |
| `columns` | array | No |  |
| `rows` | array | No |  |
| `row_count` | integer | No |  |
| `error` | ? | No |  |
| `formatting` | array | No |  |
| `pivot_header_levels` | ? | No |  |
| `pivot_row_index_count` | ? | No |  |
| `pivot_cond_format_meta` | ? | No |  |

### ChartMoveToTab

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tab_id` | ? | No |  |

### ChartPreviewRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connection_id` | ? | No |  |
| `dataset_id` | ? | No |  |
| `sql_query` | string | No |  |
| `mode` | string | No |  |
| `chart_type` | ? | No |  |
| `chart_config` | object | No |  |
| `chart_code` | string | No |  |
| `filters` | ? | No |  |

### ChartResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `dashboard_id` | ? | No |  |
| `connection_id` | ? | Yes |  |
| `dataset_id` | ? | No |  |
| `title` | string | Yes |  |
| `description` | string | Yes |  |
| `mode` | string | Yes |  |
| `chart_type` | ? | Yes |  |
| `chart_config` | object | Yes |  |
| `chart_code` | string | Yes |  |
| `sql_query` | string | Yes |  |
| `position_order` | integer | Yes |  |
| `grid_x` | integer | Yes |  |
| `grid_y` | integer | Yes |  |
| `grid_w` | integer | Yes |  |
| `grid_h` | integer | Yes |  |
| `tab_id` | ? | No |  |
| `created_by` | ? | Yes |  |
| `created_at` | string | Yes |  |
| `updated_at` | string | Yes |  |

### ChartUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | ? | No |  |
| `description` | ? | No |  |
| `dashboard_id` | ? | No |  |
| `connection_id` | ? | No |  |
| `dataset_id` | ? | No |  |
| `mode` | ? | No |  |
| `chart_type` | ? | No |  |
| `chart_config` | ? | No |  |
| `chart_code` | ? | No |  |
| `sql_query` | ? | No |  |
| `grid_x` | ? | No |  |
| `grid_y` | ? | No |  |
| `grid_w` | ? | No |  |
| `grid_h` | ? | No |  |

### ConnectionCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes |  |
| `db_type` | string | Yes |  |
| `host` | string | Yes |  |
| `port` | integer | Yes |  |
| `database_name` | string | Yes |  |
| `username` | string | Yes |  |
| `password` | string | Yes |  |
| `ssl_enabled` | boolean | No |  |

### ConnectionResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `name` | string | Yes |  |
| `db_type` | string | Yes |  |
| `host` | string | Yes |  |
| `port` | integer | Yes |  |
| `database_name` | string | Yes |  |
| `username` | string | Yes |  |
| `ssl_enabled` | boolean | Yes |  |
| `is_system` | boolean | No |  |
| `created_by` | ? | Yes |  |
| `created_at` | string | Yes |  |
| `updated_at` | string | Yes |  |

### ConnectionTestResult

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | boolean | Yes |  |
| `message` | string | Yes |  |

### ConnectionUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | ? | No |  |
| `host` | ? | No |  |
| `port` | ? | No |  |
| `database_name` | ? | No |  |
| `username` | ? | No |  |
| `password` | ? | No |  |
| `ssl_enabled` | ? | No |  |

### DashboardCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes |  |
| `description` | string | No |  |
| `icon` | string | No |  |

### DashboardFilterCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | Yes |  |
| `filter_type` | string | No |  |
| `target_column` | string | Yes |  |
| `default_value` | ? | No |  |
| `sort_order` | integer | No |  |
| `config` | object | No |  |
| `group_name` | ? | No |  |

### DashboardFilterResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `dashboard_id` | integer | Yes |  |
| `label` | string | Yes |  |
| `filter_type` | string | Yes |  |
| `target_column` | string | Yes |  |
| `default_value` | ? | Yes |  |
| `sort_order` | integer | Yes |  |
| `config` | object | Yes |  |
| `group_name` | ? | Yes |  |
| `created_at` | string | Yes |  |

### DashboardFilterUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | ? | No |  |
| `filter_type` | ? | No |  |
| `target_column` | ? | No |  |
| `default_value` | ? | No |  |
| `sort_order` | ? | No |  |
| `config` | ? | No |  |
| `group_name` | ? | No |  |

### DashboardOwnerResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `email` | string | Yes |  |
| `name` | string | Yes |  |

### DashboardResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `title` | string | Yes |  |
| `description` | string | Yes |  |
| `icon` | string | Yes |  |
| `url_slug` | string | Yes |  |
| `sort_order` | integer | Yes |  |
| `created_by` | ? | Yes |  |
| `created_at` | string | Yes |  |
| `updated_at` | string | Yes |  |
| `is_archived` | boolean | Yes |  |
| `filter_layout` | object | No |  |
| `chart_count` | integer | No |  |
| `color_scheme` | ? | No |  |
| `owners` | array | No |  |
| `roles` | array | No |  |

### DashboardStatsResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `total_views` | integer | Yes |  |
| `unique_viewers` | integer | Yes |  |
| `views_by_day` | array | Yes |  |

### DashboardUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | ? | No |  |
| `description` | ? | No |  |
| `icon` | ? | No |  |
| `sort_order` | ? | No |  |
| `filter_layout` | ? | No |  |
| `url_slug` | ? | No |  |
| `color_scheme` | ? | No |  |
| `owner_ids` | ? | No |  |
| `roles` | ? | No |  |

### DatasetCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connection_id` | integer | Yes |  |
| `name` | string | Yes |  |
| `description` | string | No |  |
| `sql_query` | string | No |  |
| `cache_ttl` | integer | No |  |
| `dataset_type` | string | No |  |
| `table_name` | ? | No |  |
| `schema_name` | ? | No |  |

### DatasetResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `connection_id` | ? | Yes |  |
| `name` | string | Yes |  |
| `description` | string | Yes |  |
| `sql_query` | string | Yes |  |
| `cache_ttl` | integer | Yes |  |
| `dataset_type` | string | No |  |
| `table_name` | ? | No |  |
| `schema_name` | ? | No |  |
| `created_by` | ? | Yes |  |
| `created_at` | string | Yes |  |
| `updated_at` | string | Yes |  |

### DatasetUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | ? | No |  |
| `description` | ? | No |  |
| `sql_query` | ? | No |  |
| `cache_ttl` | ? | No |  |

### FilterReorderItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `sort_order` | integer | Yes |  |

### FilterReorderRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | array | Yes |  |

### HTTPValidationError

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `detail` | array | No |  |

### LayoutItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `grid_x` | integer | Yes |  |
| `grid_y` | integer | Yes |  |
| `grid_w` | integer | Yes |  |
| `grid_h` | integer | Yes |  |

### LayoutUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | array | Yes |  |

### LineageEdge

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | string | Yes |  |
| `target` | string | Yes |  |

### LineageNode

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes |  |
| `type` | string | Yes |  |
| `name` | string | Yes |  |
| `meta` | ? | No |  |

### LineageResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `nodes` | array | Yes |  |
| `edges` | array | Yes |  |

### LoginRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes |  |
| `password` | string | Yes |  |

### PopularContentItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entity_type` | string | Yes |  |
| `entity_id` | integer | Yes |  |
| `title` | ? | No |  |
| `views_30d` | integer | Yes |  |
| `unique_viewers` | integer | Yes |  |
| `last_viewed` | ? | Yes |  |

### RLSRuleCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connection_id` | integer | Yes |  |
| `table_name` | string | Yes |  |
| `column_name` | string | Yes |  |
| `user_id` | ? | No |  |
| `group_name` | ? | No |  |
| `filter_value` | string | Yes |  |

### RLSRuleResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `connection_id` | integer | Yes |  |
| `table_name` | string | Yes |  |
| `column_name` | string | Yes |  |
| `user_id` | ? | Yes |  |
| `group_name` | ? | Yes |  |
| `filter_value` | string | Yes |  |
| `created_at` | string | Yes |  |

### RLSRuleUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `table_name` | ? | No |  |
| `column_name` | ? | No |  |
| `user_id` | ? | No |  |
| `group_name` | ? | No |  |
| `filter_value` | ? | No |  |

### RegisterRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes |  |
| `email` | string | Yes |  |
| `password` | string | Yes |  |

### ReportCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes |  |
| `chart_id` | integer | Yes |  |
| `channel_id` | ? | No |  |
| `schedule` | string | Yes |  |
| `timezone` | string | No |  |
| `is_active` | boolean | No |  |

### ReportUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | ? | No |  |
| `chart_id` | ? | No |  |
| `channel_id` | ? | No |  |
| `schedule` | ? | No |  |
| `timezone` | ? | No |  |
| `is_active` | ? | No |  |

### SQLExecuteRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connection_id` | integer | Yes |  |
| `sql` | string | Yes |  |
| `limit` | integer | No |  |

### SQLExecuteResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `columns` | array | Yes |  |
| `rows` | array | Yes |  |
| `row_count` | integer | Yes |  |
| `execution_time_ms` | integer | Yes |  |

### SQLTabCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | ? | No |  |
| `connection_id` | ? | No |  |

### SQLTabReorderItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `sort_order` | integer | Yes |  |

### SQLTabReorderRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | array | Yes |  |

### SQLTabResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `user_id` | integer | Yes |  |
| `label` | string | Yes |  |
| `connection_id` | ? | No |  |
| `sql_query` | string | Yes |  |
| `sort_order` | integer | Yes |  |
| `is_active` | boolean | Yes |  |
| `created_at` | string | Yes |  |
| `updated_at` | string | Yes |  |

### SQLTabUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | ? | No |  |
| `connection_id` | ? | No |  |
| `sql_query` | ? | No |  |
| `is_active` | ? | No |  |

### SchemaColumn

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes |  |
| `type` | string | Yes |  |
| `nullable` | boolean | Yes |  |

### SchemaTable

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `table_name` | string | Yes |  |
| `columns` | array | Yes |  |

### SetupStatus

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `needs_setup` | boolean | Yes |  |

### SharedLinkCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `expires_in_hours` | ? | No |  |

### SharedLinkResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `dashboard_id` | integer | Yes |  |
| `token` | string | Yes |  |
| `created_by` | ? | Yes |  |
| `expires_at` | ? | Yes |  |
| `created_at` | string | Yes |  |

### StoryCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes |  |
| `description` | string | No |  |
| `dashboard_id` | ? | No |  |

### StoryDetailResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `title` | string | Yes |  |
| `description` | string | Yes |  |
| `dashboard_id` | ? | Yes |  |
| `created_by` | ? | Yes |  |
| `created_at` | string | Yes |  |
| `updated_at` | string | Yes |  |
| `slide_count` | integer | No |  |
| `slides` | array | No |  |

### StoryResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `title` | string | Yes |  |
| `description` | string | Yes |  |
| `dashboard_id` | ? | Yes |  |
| `created_by` | ? | Yes |  |
| `created_at` | string | Yes |  |
| `updated_at` | string | Yes |  |
| `slide_count` | integer | No |  |

### StorySlideCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chart_id` | ? | No |  |
| `title` | string | No |  |
| `narrative` | string | No |  |
| `filter_state` | object | No |  |
| `config` | object | No |  |

### StorySlideResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `story_id` | integer | Yes |  |
| `slide_order` | integer | Yes |  |
| `chart_id` | ? | Yes |  |
| `title` | string | Yes |  |
| `narrative` | string | Yes |  |
| `filter_state` | object | Yes |  |
| `config` | object | Yes |  |

### StorySlideUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chart_id` | ? | No |  |
| `title` | ? | No |  |
| `narrative` | ? | No |  |
| `slide_order` | ? | No |  |
| `filter_state` | ? | No |  |
| `config` | ? | No |  |

### StoryUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | ? | No |  |
| `description` | ? | No |  |

### TabCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No |  |
| `position_order` | integer | No |  |

### TabReorder

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tab_ids` | array | Yes |  |

### TabResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `dashboard_id` | integer | Yes |  |
| `title` | string | Yes |  |
| `position_order` | integer | Yes |  |
| `created_at` | string | Yes |  |

### TabUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | ? | No |  |
| `position_order` | ? | No |  |

### TokenResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `access_token` | string | Yes |  |
| `token_type` | string | No |  |

### UserActivityItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | integer | Yes |  |
| `user_name` | string | Yes |  |
| `user_email` | string | Yes |  |
| `total_views` | integer | Yes |  |
| `last_active` | ? | Yes |  |

### UserCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes |  |
| `email` | string | Yes |  |
| `password` | string | Yes |  |
| `is_admin` | boolean | No |  |
| `groups` | string | No |  |

### UserResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes |  |
| `email` | string | Yes |  |
| `name` | string | Yes |  |
| `is_admin` | boolean | Yes |  |
| `groups` | string | No |  |
| `created_at` | string | Yes |  |

### UserUpdate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | ? | No |  |
| `email` | ? | No |  |
| `password` | ? | No |  |
| `is_admin` | ? | No |  |
| `groups` | ? | No |  |

### ValidationError

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `loc` | array | Yes |  |
| `msg` | string | Yes |  |
| `type` | string | Yes |  |
| `input` | ? | No |  |
| `ctx` | object | No |  |

