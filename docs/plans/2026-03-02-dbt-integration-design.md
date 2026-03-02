# dbt Integration — Design

## Goal

Import dbt models as Karta datasets. Users upload a `manifest.json` file, pick which models to import, and get ready-to-use datasets with column metadata.

## Approach: Upload manifest.json (MVP)

Simplest path — no dbt Cloud API, no filesystem access, works with dbt Core and dbt Cloud alike. User runs `dbt compile` or `dbt docs generate`, then uploads the artifact.

**Why not dbt Cloud API?** Adds OAuth complexity, requires dbt Cloud account. manifest.json works universally.

## manifest.json → Datasets Mapping

A dbt model node in `manifest.json` has:

```json
{
  "unique_id": "model.my_project.orders",
  "name": "orders",
  "schema": "analytics",
  "database": "warehouse",
  "relation_name": "\"warehouse\".\"analytics\".\"orders\"",
  "resource_type": "model",
  "description": "Cleaned order data with customer info",
  "columns": {
    "order_id": { "name": "order_id", "description": "Primary key", "data_type": "integer" },
    "customer_id": { "name": "customer_id", "description": "FK to customers", "data_type": "integer" },
    "total": { "name": "total", "description": "Order total in USD", "data_type": "numeric" }
  },
  "tags": ["core", "finance"],
  "config": { "materialized": "table" }
}
```

**Mapping:**

| dbt field | Karta dataset field |
|-----------|-------------------|
| `name` | `name` |
| `description` | `description` |
| `relation_name` | SQL: `SELECT * FROM {relation_name}` |
| `columns` | `columns` JSON (name, description, type) |
| `tags` | stored in dataset `metadata.dbt_tags` |
| `unique_id` | stored in dataset `metadata.dbt_unique_id` (for re-import dedup) |

**Scope for MVP:** Only `resource_type == "model"`. Skip sources, seeds, tests, snapshots, macros.

## UI Flow

1. User goes to Datasets page → "Import from dbt" button
2. Dialog opens:
   - Step 1: Select connection (which DB has the dbt models materialized)
   - Step 2: Upload `manifest.json` file
   - Step 3: Preview table of models (name, schema, description, columns count, tags). Checkboxes to select which to import. "Select All" toggle.
   - Step 4: Click "Import" → creates datasets
3. Success: redirect to Datasets page, new datasets visible

**Re-import:** If a dataset with matching `metadata.dbt_unique_id` already exists, update it instead of creating a duplicate.

## API

### `POST /api/datasets/import-dbt`

Multipart form:
- `manifest` — manifest.json file
- `connection_id` — target connection ID

Response:
```json
{
  "imported": 12,
  "updated": 3,
  "skipped": 0,
  "datasets": [
    { "id": 45, "name": "orders", "action": "created" },
    { "id": 46, "name": "customers", "action": "updated" }
  ]
}
```

### `POST /api/datasets/preview-dbt`

Same inputs, but dry-run — returns parsed models without creating anything:
```json
{
  "models": [
    {
      "unique_id": "model.my_project.orders",
      "name": "orders",
      "schema": "analytics",
      "description": "...",
      "columns_count": 8,
      "tags": ["core"],
      "materialized": "table",
      "exists_in_karta": false
    }
  ]
}
```

## Backend Implementation

### New file: `api/dbt/router.py`

```python
router = APIRouter(prefix="/api/datasets", tags=["dbt"])

@router.post("/preview-dbt")
async def preview_dbt(manifest: UploadFile, connection_id: int):
    """Parse manifest.json, return model list for preview."""

@router.post("/import-dbt")
async def import_dbt(manifest: UploadFile, connection_id: int):
    """Parse manifest, create/update datasets."""
```

### Parsing logic: `api/dbt/parser.py`

```python
def parse_manifest(data: dict) -> list[DbtModel]:
    """Extract models from manifest.json nodes."""
    models = []
    for node_id, node in data.get("nodes", {}).items():
        if node.get("resource_type") != "model":
            continue
        models.append(DbtModel(
            unique_id=node["unique_id"],
            name=node["name"],
            schema=node.get("schema", "public"),
            database=node.get("database"),
            relation_name=node.get("relation_name", f'"{node["schema"]}"."{node["name"]}"'),
            description=node.get("description", ""),
            columns=_parse_columns(node.get("columns", {})),
            tags=node.get("tags", []),
            materialized=node.get("config", {}).get("materialized", "view"),
        ))
    return models
```

### Dataset creation

For each selected model:
```sql
INSERT INTO datasets (name, description, connection_id, sql_query, columns, metadata, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT ... DO UPDATE  -- based on metadata->>'dbt_unique_id'
```

Where `sql_query` = `SELECT * FROM {relation_name}`.

## Database Changes

Add to `datasets` table (if not exists):
```sql
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
```

`metadata` stores: `{"dbt_unique_id": "model.proj.orders", "dbt_tags": ["core"], "dbt_materialized": "table", "imported_at": "2026-03-02T..."}`

## Frontend Files

| File | Description |
|------|-------------|
| `frontend/src/components/datasets/import-dbt-dialog.tsx` | Multi-step import dialog |
| `frontend/src/hooks/use-datasets.ts` | Add `usePreviewDbt()` and `useImportDbt()` mutations |
| `frontend/messages/en.json` / `ru.json` | i18n keys under `dbt` namespace |

## Not in MVP

- dbt Cloud API integration (periodic sync)
- dbt sources / seeds / snapshots
- Column lineage from dbt
- dbt metrics → Karta metrics mapping
- Auto-refresh on `dbt run` completion
