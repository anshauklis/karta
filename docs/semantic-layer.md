# Semantic Layer

The semantic layer lets you define reusable **models**, **measures**, and **dimensions** on top of your database tables or custom SQL. Once defined, you can query them through the API or the AI copilot without writing SQL.

## Concepts

| Concept | Description | Example |
|---------|-------------|---------|
| **Model** | A logical dataset backed by a table or SQL query | `orders` model → `public.orders` table |
| **Measure** | An aggregated metric | `revenue` → `SUM(amount)` |
| **Dimension** | A column used for grouping or filtering | `region` → `customer_region` column |
| **Join** | A relationship between two models | `orders.customer_id` → `customers.id` |

## Data Model

```
semantic_models
 ├── model_measures    (1:N)
 ├── model_dimensions  (1:N)
 └── model_joins       (1:N, to another semantic_model)
```

Each model is scoped to a **connection** (`connection_id`). Measures and dimensions belong to exactly one model. All child entities cascade-delete with the parent model.

---

## API Reference

All endpoints require `Authorization: Bearer <token>`. Prefix: `/api/semantic`.

### Models

#### List models

```
GET /api/semantic/models?connection_id=1
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `connection_id` | int | No | Filter by connection |

**Response:** `200` — array of model objects.

#### Create model

```
POST /api/semantic/models
```

```json
{
  "connection_id": 1,
  "name": "orders",
  "description": "All completed orders",
  "source_type": "table",
  "source_table": "public.orders"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `connection_id` | int | Yes | Database connection |
| `name` | string | Yes | Unique name within the connection |
| `description` | string | No | Human-readable description |
| `source_type` | `"table"` \| `"sql"` | No | Default: `"table"` |
| `source_table` | string | If `source_type=table` | Table name (e.g. `public.orders`) |
| `source_sql` | string | If `source_type=sql` | Custom SQL subquery |

**Response:** `201` — created model.

#### Get model (with children)

```
GET /api/semantic/models/{id}
```

**Response:** `200` — model object with nested `measures`, `dimensions`, and `joins` arrays.

#### Update model

```
PUT /api/semantic/models/{id}
```

Body: any subset of `name`, `description`, `source_type`, `source_table`, `source_sql`, `connection_id`.

**Response:** `200` — updated model.

#### Delete model

```
DELETE /api/semantic/models/{id}
```

**Response:** `204` — no content. Cascades to all measures, dimensions, and joins.

---

### Measures

#### Create measure

```
POST /api/semantic/models/{model_id}/measures
```

```json
{
  "name": "revenue",
  "label": "Total Revenue",
  "expression": "amount",
  "agg_type": "sum",
  "description": "Sum of order amounts",
  "format": "$,.2f",
  "sort_order": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier within the model |
| `label` | string | Yes | Display name |
| `expression` | string | Yes | SQL expression (column name or calculation) |
| `agg_type` | string | Yes | Aggregation function (see below) |
| `description` | string | No | |
| `format` | string | No | Display format string |
| `filters` | array | No | Pre-filters applied to this measure |
| `sort_order` | int | No | Display ordering (default 0) |

**Supported `agg_type` values:**

| Value | Generated SQL |
|-------|---------------|
| `sum` | `SUM(expression)` |
| `count` | `COUNT(expression)` or `COUNT(*)` if expression is `*` |
| `count_distinct` | `COUNT(DISTINCT expression)` |
| `avg` | `AVG(expression)` |
| `min` | `MIN(expression)` |
| `max` | `MAX(expression)` |
| `custom` | Expression used as-is |

**Response:** `201` — created measure.

#### Update measure

```
PUT /api/semantic/measures/{measure_id}
```

Body: any subset of measure fields.

**Response:** `200` — updated measure.

#### Delete measure

```
DELETE /api/semantic/measures/{measure_id}
```

**Response:** `204`.

---

### Dimensions

#### Create dimension

```
POST /api/semantic/models/{model_id}/dimensions
```

```json
{
  "name": "order_month",
  "label": "Order Month",
  "column_name": "order_date",
  "dimension_type": "temporal",
  "time_grain": "month",
  "format": "",
  "sort_order": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier within the model |
| `label` | string | Yes | Display name |
| `column_name` | string | Yes | Actual column in the source table/query |
| `dimension_type` | string | No | `categorical` (default), `temporal`, or `numeric` |
| `time_grain` | string | No | For temporal: `day`, `week`, `month`, `quarter`, `year` |
| `format` | string | No | Display format string |
| `sort_order` | int | No | Display ordering |

When `dimension_type` is `temporal` and `time_grain` is set, the query builder wraps the column in `DATE_TRUNC('grain', column)`.

**Response:** `201` — created dimension.

#### Update dimension

```
PUT /api/semantic/dimensions/{dimension_id}
```

**Response:** `200` — updated dimension.

#### Delete dimension

```
DELETE /api/semantic/dimensions/{dimension_id}
```

**Response:** `204`.

---

### Joins

#### Create join

```
POST /api/semantic/models/{model_id}/joins
```

```json
{
  "to_model_id": 2,
  "join_type": "left",
  "from_column": "customer_id",
  "to_column": "id"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to_model_id` | int | Yes | Target model ID |
| `join_type` | string | No | `inner`, `left` (default), `right`, `full` |
| `from_column` | string | Yes | Column in the source model |
| `to_column` | string | Yes | Column in the target model |

**Response:** `201` — created join. One join per model pair (unique constraint).

#### Delete join

```
DELETE /api/semantic/joins/{join_id}
```

**Response:** `204`.

---

### Semantic Query

Execute a query defined by measure and dimension names — the system generates the SQL automatically.

```
POST /api/semantic/query
```

```json
{
  "model_id": 1,
  "measures": ["revenue", "order_count"],
  "dimensions": ["region", "order_month"],
  "filters": [
    {"dimension": "region", "operator": "=", "value": "US"},
    {"dimension": "order_date", "operator": ">=", "value": "2025-01-01"}
  ],
  "order_by": "revenue DESC",
  "limit": 100
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model_id` | int | Yes | Semantic model to query |
| `measures` | string[] | No* | Measure names to select |
| `dimensions` | string[] | No* | Dimension names to group by |
| `filters` | array | No | Filter conditions |
| `order_by` | string | No | ORDER BY clause (default: first measure DESC) |
| `limit` | int | No | Max rows to return |

*At least one measure or dimension is required.

#### Filter operators

| Operator | Example | Notes |
|----------|---------|-------|
| `=`, `!=`, `>`, `<`, `>=`, `<=` | `{"dimension": "amount", "operator": ">", "value": 100}` | |
| `IN` | `{"dimension": "region", "operator": "IN", "value": ["US", "EU"]}` | Value must be a non-empty array |
| `NOT IN` | Same as IN | |
| `IS NULL` | `{"dimension": "email", "operator": "IS NULL"}` | No `value` needed |
| `IS NOT NULL` | Same as IS NULL | |
| `LIKE`, `NOT LIKE` | `{"dimension": "name", "operator": "LIKE", "value": "%Corp%"}` | |

**Response:**

```json
{
  "sql": "SELECT ... FROM ... GROUP BY ... ORDER BY ...",
  "data": {
    "columns": ["region", "order_month", "revenue", "order_count"],
    "rows": [
      ["US", "2025-01-01T00:00:00", 150000, 1200],
      ["EU", "2025-01-01T00:00:00", 95000, 800]
    ],
    "row_count": 2
  }
}
```

The `sql` field contains the generated query for inspection/debugging.

#### Generated SQL example

For this request:
```json
{
  "model_id": 1,
  "measures": ["revenue"],
  "dimensions": ["region", "order_month"]
}
```

Where model `orders` has:
- source: `public.orders` table
- measure `revenue`: expression `amount`, agg `sum`
- dimension `region`: column `customer_region`, type `categorical`
- dimension `order_month`: column `order_date`, type `temporal`, grain `month`

The query builder generates:

```sql
SELECT
  _base.customer_region AS region,
  DATE_TRUNC('month', _base.order_date) AS order_month,
  SUM(amount) AS revenue
FROM public.orders AS _base
GROUP BY _base.customer_region, DATE_TRUNC('month', _base.order_date)
ORDER BY revenue DESC
```

---

## AI Integration

The AI copilot has two built-in tools for the semantic layer:

| Tool | Description |
|------|-------------|
| `list_semantic_models` | Lists available models with their measures and dimensions for the current connection |
| `semantic_query` | Executes a semantic query by model ID, measure/dimension names, and optional filters |

When a user asks something like *"which region brings the most revenue?"*, the Data Analyst agent:
1. Calls `list_semantic_models` to discover available models
2. Finds a model with a `revenue` measure and `region` dimension
3. Calls `semantic_query` with the appropriate parameters
4. Returns the result as a table in the chat

If no semantic models are configured, the agent falls back to raw SQL via `execute_sql`.

---

## Frontend

### Metrics Management (`/metrics`)

Full CRUD interface for managing semantic models, measures, dimensions, and joins. Accessible from the main navigation (Layers icon).

### Chart Editor — Metrics Tab

When semantic models exist for the current connection, a **Metrics** tab appears in the chart editor sidebar. It shows an expandable tree of models with their measures and dimensions. Items are draggable:

- **Measures** → drop on Y-axis zone → adds to `y_columns`
- **Dimensions** → drop on X-axis zone → sets `x_column`; drop on Color zone → sets `color_column`

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS semantic_models (
    id              SERIAL PRIMARY KEY,
    connection_id   INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    source_type     TEXT NOT NULL DEFAULT 'table',  -- 'table' | 'sql'
    source_table    TEXT,
    source_sql      TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(connection_id, name)
);

CREATE TABLE IF NOT EXISTS model_measures (
    id              SERIAL PRIMARY KEY,
    model_id        INTEGER NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    expression      TEXT NOT NULL,
    agg_type        TEXT NOT NULL,
    format          TEXT DEFAULT '',
    filters         JSONB DEFAULT '[]',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(model_id, name)
);

CREATE TABLE IF NOT EXISTS model_dimensions (
    id              SERIAL PRIMARY KEY,
    model_id        INTEGER NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    column_name     TEXT NOT NULL,
    dimension_type  TEXT NOT NULL DEFAULT 'categorical',
    time_grain      TEXT,
    format          TEXT DEFAULT '',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(model_id, name)
);

CREATE TABLE IF NOT EXISTS model_joins (
    id              SERIAL PRIMARY KEY,
    from_model_id   INTEGER NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    to_model_id     INTEGER NOT NULL REFERENCES semantic_models(id) ON DELETE CASCADE,
    join_type       TEXT NOT NULL DEFAULT 'left',
    from_column     TEXT NOT NULL,
    to_column       TEXT NOT NULL,
    UNIQUE(from_model_id, to_model_id)
);
```
