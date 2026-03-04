# Merge Datasets & Semantic Models — Design

## Goal

Extend datasets with measures and dimensions (currently semantic model features), then remove the separate Metrics/Semantic Models system entirely. One unified entity: **Dataset**.

## Decisions

| Question | Answer |
|----------|--------|
| Direction | Extend datasets (not models) |
| UI for measures/dimensions | Tabs in dataset editor: General \| Measures \| Dimensions |
| Cross-model joins | Remove entirely |
| MetricsBrowser in chart editor | Remove entirely |
| Migration approach | In-place: copy data, drop old tables |

## Architecture

Datasets gain two child tables (`dataset_measures`, `dataset_dimensions`) with the same schema as the current `model_measures`/`model_dimensions` but FK'd to `datasets.id`. The 4 semantic tables (`semantic_models`, `model_measures`, `model_dimensions`, `model_joins`) are dropped after data migration. The `api/semantic/` module is removed. Frontend gets tabbed dataset editor and loses the Metrics page/nav/browser.

## Database Changes

### New Tables

```sql
CREATE TABLE IF NOT EXISTS dataset_measures (
    id              SERIAL PRIMARY KEY,
    dataset_id      INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    expression      TEXT NOT NULL,
    agg_type        TEXT NOT NULL,
    format          TEXT DEFAULT '',
    filters         JSONB DEFAULT '[]',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(dataset_id, name)
);

CREATE TABLE IF NOT EXISTS dataset_dimensions (
    id              SERIAL PRIMARY KEY,
    dataset_id      INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    label           TEXT NOT NULL,
    description     TEXT DEFAULT '',
    column_name     TEXT NOT NULL,
    dimension_type  TEXT NOT NULL DEFAULT 'categorical',
    time_grain      TEXT,
    format          TEXT DEFAULT '',
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(dataset_id, name)
);
```

### Migration

In `ensure_schema()`:
1. CREATE new tables
2. INSERT INTO dataset_measures SELECT ... FROM model_measures JOIN semantic_models → match to datasets via connection_id + source_table/table_name
3. INSERT INTO dataset_dimensions SELECT ... similarly
4. DROP TABLE model_joins, model_measures, model_dimensions, semantic_models (in order, respecting FKs)

### Dropped Tables

- `semantic_models`
- `model_measures`
- `model_dimensions`
- `model_joins`

## Backend API Changes

### New Endpoints (in `api/datasets/router.py`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/datasets/{id}/measures` | GET | List measures |
| `/api/datasets/{id}/measures` | POST | Create measure |
| `/api/datasets/{id}/measures/{mid}` | PUT | Update measure |
| `/api/datasets/{id}/measures/{mid}` | DELETE | Delete measure |
| `/api/datasets/{id}/dimensions` | GET | List dimensions |
| `/api/datasets/{id}/dimensions` | POST | Create dimension |
| `/api/datasets/{id}/dimensions/{did}` | PUT | Update dimension |
| `/api/datasets/{id}/dimensions/{did}` | DELETE | Delete dimension |

### New Pydantic Models (in `api/models.py`)

- `DatasetMeasure`, `DatasetMeasureCreate`, `DatasetMeasureUpdate`
- `DatasetDimension`, `DatasetDimensionCreate`, `DatasetDimensionUpdate`

### Removed Files

- `api/semantic/router.py` (14 endpoints)
- `api/semantic/query_builder.py`
- `api/semantic/__init__.py`

### Other Backend Changes

- Remove `include_router(semantic_router)` from `main.py`
- Remove AI tools: `list_semantic_models`, `semantic_query` from `api/ai/`

## Frontend Changes

### Dataset Editor (tabbed)

Extend existing dataset dialog/page with tabs:
- **General** — current fields (name, connection, SQL, cache TTL, etc.)
- **Measures** — CRUD table: name, label, expression, agg_type, format + add/edit/delete
- **Dimensions** — CRUD table: name, label, column_name, dimension_type, time_grain + add/edit/delete

### New Hooks

- `useDatasetMeasures(datasetId)` — query + mutations for measures
- `useDatasetDimensions(datasetId)` — query + mutations for dimensions

### Removed Files/Components

- `frontend/src/app/(dashboard)/metrics/` — entire directory
- `frontend/src/components/metrics/` — model-editor, metrics-browser, etc.
- Hooks: `useSemanticModels`, `useSemanticModel`, `useModelMeasures`, `useModelDimensions`, `useModelJoins`
- Remove "Metrics" from `PRIMARY_NAV_ITEMS` in `app-header.tsx`

### i18n

- Remove `metrics.*` keys from en.json and ru.json
- Add `datasets.measures.*`, `datasets.dimensions.*` keys

## Out of Scope

- Dataset-to-dataset joins (removed, use SQL instead)
- MetricsBrowser in chart editor (removed)
- Semantic query endpoint (removed)
