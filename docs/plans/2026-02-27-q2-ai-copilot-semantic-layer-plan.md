# Q2: AI Multi-Agent Copilot + Semantic Layer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a multi-agent AI copilot (Data Analyst, Chart Builder, Dashboard Manager) with contextual sidebar, and a full semantic layer (models, measures, dimensions, joins) with query builder and AI integration.

**Architecture:** Extends existing SSE chat (`api/ai/router.py`) with an agent routing layer. Semantic layer stored in PostgreSQL (4 new tables), exposed via CRUD API, integrated into AI tools and chart editor. Frontend adds copilot sidebar (shadcn Sheet) and metrics management page.

**Tech Stack:** FastAPI, PostgreSQL, OpenAI-compatible API (function calling), Next.js 16, TanStack Query 5, shadcn/ui, Zustand

---

## Task 1: Semantic Layer — Database Schema

**Goal:** Add 4 new tables for the semantic layer.

**Files:**
- Modify: `api/database.py:398` (append to SCHEMA_SQL before closing `"""`)

### Step 1: Add semantic tables to SCHEMA_SQL

Append these CREATE TABLE statements inside `SCHEMA_SQL` in `api/database.py`, right before the closing `"""` (after line 398):

```sql
CREATE TABLE IF NOT EXISTS semantic_models (
    id              SERIAL PRIMARY KEY,
    connection_id   INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    source_type     TEXT NOT NULL DEFAULT 'table',
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

### Step 2: Verify schema applies

Run: `docker compose up --build -d && docker compose logs -f api 2>&1 | head -50`
Expected: API starts, `ensure_schema()` creates new tables without errors.

### Step 3: Commit

```bash
git add api/database.py
git commit -m "feat: add semantic layer tables (models, measures, dimensions, joins)"
```

---

## Task 2: Semantic Layer — CRUD API

**Goal:** Full REST API for semantic models, measures, dimensions, and joins.

**Files:**
- Create: `api/semantic/__init__.py`
- Create: `api/semantic/router.py`
- Modify: `api/main.py:144-170` (add router import + include)

### Step 1: Create router

Create `api/semantic/__init__.py` (empty file).

Create `api/semantic/router.py` following existing router patterns (see `api/datasets/router.py` for reference):

```python
"""Semantic layer: models, measures, dimensions, joins."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from api.database import engine
from api.auth.utils import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/semantic", tags=["semantic"])


# --- Models CRUD ---

@router.get("/models", summary="List semantic models")
async def list_models(
    connection_id: int | None = None,
    current_user: dict = Depends(get_current_user),
):
    """List all semantic models, optionally filtered by connection."""
    with engine.connect() as conn:
        if connection_id:
            rows = conn.execute(text(
                "SELECT * FROM semantic_models WHERE connection_id = :cid ORDER BY name"
            ), {"cid": connection_id}).mappings().all()
        else:
            rows = conn.execute(text(
                "SELECT * FROM semantic_models ORDER BY name"
            )).mappings().all()
        return [dict(r) for r in rows]


@router.post("/models", summary="Create semantic model", status_code=201)
async def create_model(req: dict, current_user: dict = Depends(get_current_user)):
    """Create a new semantic model."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        row = conn.execute(text("""
            INSERT INTO semantic_models (connection_id, name, description, source_type, source_table, source_sql, created_by)
            VALUES (:connection_id, :name, :description, :source_type, :source_table, :source_sql, :user_id)
            RETURNING *
        """), {
            "connection_id": req["connection_id"],
            "name": req["name"],
            "description": req.get("description", ""),
            "source_type": req.get("source_type", "table"),
            "source_table": req.get("source_table"),
            "source_sql": req.get("source_sql"),
            "user_id": user_id,
        }).mappings().first()
        conn.commit()
        return dict(row)


@router.get("/models/{model_id}", summary="Get semantic model with children")
async def get_model(model_id: int, current_user: dict = Depends(get_current_user)):
    """Get a model with its measures, dimensions, and joins."""
    with engine.connect() as conn:
        model = conn.execute(text(
            "SELECT * FROM semantic_models WHERE id = :id"
        ), {"id": model_id}).mappings().first()
        if not model:
            raise HTTPException(404, "Model not found")

        measures = conn.execute(text(
            "SELECT * FROM model_measures WHERE model_id = :id ORDER BY sort_order, name"
        ), {"id": model_id}).mappings().all()

        dimensions = conn.execute(text(
            "SELECT * FROM model_dimensions WHERE model_id = :id ORDER BY sort_order, name"
        ), {"id": model_id}).mappings().all()

        joins = conn.execute(text("""
            SELECT j.*, sm.name as to_model_name
            FROM model_joins j
            JOIN semantic_models sm ON sm.id = j.to_model_id
            WHERE j.from_model_id = :id
        """), {"id": model_id}).mappings().all()

        return {
            **dict(model),
            "measures": [dict(m) for m in measures],
            "dimensions": [dict(d) for d in dimensions],
            "joins": [dict(j) for j in joins],
        }


@router.put("/models/{model_id}", summary="Update semantic model")
async def update_model(model_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            UPDATE semantic_models
            SET name = :name, description = :description, source_type = :source_type,
                source_table = :source_table, source_sql = :source_sql, updated_at = NOW()
            WHERE id = :id RETURNING *
        """), {
            "id": model_id,
            "name": req["name"],
            "description": req.get("description", ""),
            "source_type": req.get("source_type", "table"),
            "source_table": req.get("source_table"),
            "source_sql": req.get("source_sql"),
        }).mappings().first()
        conn.commit()
        if not row:
            raise HTTPException(404, "Model not found")
        return dict(row)


@router.delete("/models/{model_id}", summary="Delete semantic model")
async def delete_model(model_id: int, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM semantic_models WHERE id = :id"), {"id": model_id})
        conn.commit()
    return {"ok": True}


# --- Measures CRUD ---

@router.post("/models/{model_id}/measures", summary="Add measure", status_code=201)
async def create_measure(model_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            INSERT INTO model_measures (model_id, name, label, description, expression, agg_type, format, filters, sort_order)
            VALUES (:model_id, :name, :label, :description, :expression, :agg_type, :format, :filters::jsonb, :sort_order)
            RETURNING *
        """), {
            "model_id": model_id,
            "name": req["name"],
            "label": req["label"],
            "description": req.get("description", ""),
            "expression": req["expression"],
            "agg_type": req["agg_type"],
            "format": req.get("format", ""),
            "filters": "[]",
            "sort_order": req.get("sort_order", 0),
        }).mappings().first()
        conn.commit()
        return dict(row)


@router.put("/measures/{measure_id}", summary="Update measure")
async def update_measure(measure_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            UPDATE model_measures
            SET name = :name, label = :label, description = :description,
                expression = :expression, agg_type = :agg_type, format = :format, sort_order = :sort_order
            WHERE id = :id RETURNING *
        """), {
            "id": measure_id,
            "name": req["name"],
            "label": req["label"],
            "description": req.get("description", ""),
            "expression": req["expression"],
            "agg_type": req["agg_type"],
            "format": req.get("format", ""),
            "sort_order": req.get("sort_order", 0),
        }).mappings().first()
        conn.commit()
        if not row:
            raise HTTPException(404, "Measure not found")
        return dict(row)


@router.delete("/measures/{measure_id}", summary="Delete measure")
async def delete_measure(measure_id: int, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM model_measures WHERE id = :id"), {"id": measure_id})
        conn.commit()
    return {"ok": True}


# --- Dimensions CRUD ---

@router.post("/models/{model_id}/dimensions", summary="Add dimension", status_code=201)
async def create_dimension(model_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            INSERT INTO model_dimensions (model_id, name, label, description, column_name, dimension_type, time_grain, format, sort_order)
            VALUES (:model_id, :name, :label, :description, :column_name, :dimension_type, :time_grain, :format, :sort_order)
            RETURNING *
        """), {
            "model_id": model_id,
            "name": req["name"],
            "label": req["label"],
            "description": req.get("description", ""),
            "column_name": req["column_name"],
            "dimension_type": req.get("dimension_type", "categorical"),
            "time_grain": req.get("time_grain"),
            "format": req.get("format", ""),
            "sort_order": req.get("sort_order", 0),
        }).mappings().first()
        conn.commit()
        return dict(row)


@router.put("/dimensions/{dimension_id}", summary="Update dimension")
async def update_dimension(dimension_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            UPDATE model_dimensions
            SET name = :name, label = :label, description = :description,
                column_name = :column_name, dimension_type = :dimension_type,
                time_grain = :time_grain, format = :format, sort_order = :sort_order
            WHERE id = :id RETURNING *
        """), {
            "id": dimension_id,
            "name": req["name"],
            "label": req["label"],
            "description": req.get("description", ""),
            "column_name": req["column_name"],
            "dimension_type": req.get("dimension_type", "categorical"),
            "time_grain": req.get("time_grain"),
            "format": req.get("format", ""),
            "sort_order": req.get("sort_order", 0),
        }).mappings().first()
        conn.commit()
        if not row:
            raise HTTPException(404, "Dimension not found")
        return dict(row)


@router.delete("/dimensions/{dimension_id}", summary="Delete dimension")
async def delete_dimension(dimension_id: int, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM model_dimensions WHERE id = :id"), {"id": dimension_id})
        conn.commit()
    return {"ok": True}


# --- Joins CRUD ---

@router.post("/models/{model_id}/joins", summary="Add join", status_code=201)
async def create_join(model_id: int, req: dict, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            INSERT INTO model_joins (from_model_id, to_model_id, join_type, from_column, to_column)
            VALUES (:from_model_id, :to_model_id, :join_type, :from_column, :to_column)
            RETURNING *
        """), {
            "from_model_id": model_id,
            "to_model_id": req["to_model_id"],
            "join_type": req.get("join_type", "left"),
            "from_column": req["from_column"],
            "to_column": req["to_column"],
        }).mappings().first()
        conn.commit()
        return dict(row)


@router.delete("/joins/{join_id}", summary="Delete join")
async def delete_join(join_id: int, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM model_joins WHERE id = :id"), {"id": join_id})
        conn.commit()
    return {"ok": True}
```

### Step 2: Register router in main.py

In `api/main.py`, after line 143 (`from api.templates.router import router as templates_router`), add:

```python
from api.semantic.router import router as semantic_router
```

After line 170 (`app.include_router(tabs_router)`), add:

```python
app.include_router(semantic_router)
```

Also add the openapi tag in the `openapi_tags` list (after the "ai" tag):

```python
{"name": "semantic", "description": "Semantic layer: models, measures, dimensions, joins"},
```

### Step 3: Verify API starts and endpoints respond

Run: `docker compose up --build -d`

Test: `curl -s http://localhost:8001/api/semantic/models -H "Authorization: Bearer <token>" | python -m json.tool`
Expected: Empty list `[]`.

### Step 4: Commit

```bash
git add api/semantic/ api/main.py
git commit -m "feat: add semantic layer CRUD API (models, measures, dimensions, joins)"
```

---

## Task 3: Semantic Layer — Query Builder

**Goal:** Generate SQL from semantic model definitions. The `/api/semantic/query` endpoint accepts measures + dimensions + filters and produces executable SQL.

**Files:**
- Create: `api/semantic/query_builder.py`
- Modify: `api/semantic/router.py` (add query endpoint)

### Step 1: Create query builder

Create `api/semantic/query_builder.py`:

```python
"""SQL generation from semantic model definitions."""

import logging
from sqlalchemy import text
from api.database import engine

logger = logging.getLogger(__name__)


def build_semantic_query(
    model_id: int,
    measure_names: list[str],
    dimension_names: list[str],
    filters: list[dict] | None = None,
    order_by: str | None = None,
    limit: int | None = None,
) -> str:
    """Generate SQL from semantic model definitions.

    Args:
        model_id: Primary semantic model ID
        measure_names: Names of measures to include (e.g. ["total_revenue", "order_count"])
        dimension_names: Names of dimensions to group by (e.g. ["region", "order_date"])
        filters: Optional list of {"dimension": "region", "operator": "=", "value": "US"}
        order_by: Optional column/expression to order by
        limit: Optional row limit

    Returns:
        Generated SQL string ready for execution.
    """
    with engine.connect() as conn:
        # Load model
        model = conn.execute(text(
            "SELECT * FROM semantic_models WHERE id = :id"
        ), {"id": model_id}).mappings().first()
        if not model:
            raise ValueError(f"Semantic model {model_id} not found")

        # Load requested measures
        measures = []
        if measure_names:
            rows = conn.execute(text(
                "SELECT * FROM model_measures WHERE model_id = :mid AND name = ANY(:names) ORDER BY sort_order"
            ), {"mid": model_id, "names": measure_names}).mappings().all()
            measures = [dict(r) for r in rows]

        # Load requested dimensions
        dimensions = []
        if dimension_names:
            rows = conn.execute(text(
                "SELECT * FROM model_dimensions WHERE model_id = :mid AND name = ANY(:names) ORDER BY sort_order"
            ), {"mid": model_id, "names": dimension_names}).mappings().all()
            dimensions = [dict(r) for r in rows]

        # Load joins (if needed — for future multi-model queries)
        joins = conn.execute(text("""
            SELECT j.*, sm.source_type, sm.source_table, sm.source_sql, sm.name as to_model_name
            FROM model_joins j
            JOIN semantic_models sm ON sm.id = j.to_model_id
            WHERE j.from_model_id = :mid
        """), {"mid": model_id}).mappings().all()
        joins = [dict(j) for j in joins]

    # Build source expression
    if model["source_type"] == "sql":
        source = f"({model['source_sql']}) AS _base"
    else:
        source = model["source_table"]

    # Build SELECT columns
    select_parts = []
    group_by_parts = []

    for dim in dimensions:
        col = dim["column_name"]
        if dim["dimension_type"] == "temporal" and dim.get("time_grain"):
            grain = dim["time_grain"]
            # Use DATE_TRUNC for temporal dimensions
            select_parts.append(f"DATE_TRUNC('{grain}', {col}) AS {dim['name']}")
            group_by_parts.append(f"DATE_TRUNC('{grain}', {col})")
        else:
            select_parts.append(f"{col} AS {dim['name']}")
            group_by_parts.append(col)

    for m in measures:
        select_parts.append(f"{m['expression']} AS {m['name']}")

    if not select_parts:
        select_parts = ["*"]

    # Build WHERE
    where_clauses = []
    if filters:
        for f in filters:
            dim_name = f["dimension"]
            op = f.get("operator", "=")
            val = f["value"]
            # Find the actual column_name for this dimension
            dim_col = dim_name
            for d in dimensions:
                if d["name"] == dim_name:
                    dim_col = d["column_name"]
                    break
            if op.upper() == "IN":
                vals = ", ".join(f"'{v}'" for v in val) if isinstance(val, list) else f"'{val}'"
                where_clauses.append(f"{dim_col} IN ({vals})")
            elif op.upper() in ("IS NULL", "IS NOT NULL"):
                where_clauses.append(f"{dim_col} {op}")
            else:
                where_clauses.append(f"{dim_col} {op} '{val}'")

    # Build JOIN clauses
    join_clauses = []
    for j in joins:
        if j["source_type"] == "sql":
            join_src = f"({j['source_sql']}) AS {j['to_model_name']}"
        else:
            join_src = j["source_table"]
        jt = j["join_type"].upper()
        join_clauses.append(f"{jt} JOIN {join_src} ON {j['from_column']} = {j['to_column']}")

    # Assemble SQL
    sql = f"SELECT {', '.join(select_parts)}\nFROM {source}"

    if join_clauses:
        sql += "\n" + "\n".join(join_clauses)

    if where_clauses:
        sql += "\nWHERE " + " AND ".join(where_clauses)

    if group_by_parts:
        sql += "\nGROUP BY " + ", ".join(group_by_parts)

    if order_by:
        sql += f"\nORDER BY {order_by}"
    elif measures and group_by_parts:
        # Default: order by first measure DESC
        sql += f"\nORDER BY {measures[0]['name']} DESC"

    if limit:
        sql += f"\nLIMIT {limit}"

    return sql
```

### Step 2: Add query endpoint to router

Add to `api/semantic/router.py`:

```python
from api.semantic.query_builder import build_semantic_query

@router.post("/query", summary="Execute semantic query")
async def semantic_query(req: dict, current_user: dict = Depends(get_current_user)):
    """Execute a query defined by semantic model measures and dimensions."""
    model_id = req["model_id"]
    measure_names = req.get("measures", [])
    dimension_names = req.get("dimensions", [])
    filters = req.get("filters")
    order_by = req.get("order_by")
    limit = req.get("limit")

    try:
        sql = build_semantic_query(
            model_id=model_id,
            measure_names=measure_names,
            dimension_names=dimension_names,
            filters=filters,
            order_by=order_by,
            limit=limit,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Get the connection_id from the model to execute
    with engine.connect() as conn:
        model = conn.execute(text(
            "SELECT connection_id FROM semantic_models WHERE id = :id"
        ), {"id": model_id}).mappings().first()
        if not model:
            raise HTTPException(404, "Model not found")

    # Execute via existing SQL execution infrastructure
    from api.sql_lab.router import _execute_sql_on_connection
    try:
        result = await _execute_sql_on_connection(model["connection_id"], sql, int(current_user["sub"]))
        return {"sql": sql, "data": result}
    except Exception as e:
        raise HTTPException(400, f"Query execution failed: {e}")
```

Note: `_execute_sql_on_connection` reference — check `api/sql_lab/router.py` for the actual function name that executes SQL on an arbitrary connection. Adapt the import accordingly.

### Step 3: Verify

Test creating a model and querying it via the API.

### Step 4: Commit

```bash
git add api/semantic/query_builder.py api/semantic/router.py
git commit -m "feat: semantic query builder — generate and execute SQL from model definitions"
```

---

## Task 4: Semantic Layer — Frontend Hooks + Types

**Goal:** TypeScript types and TanStack Query hooks for all semantic API endpoints.

**Files:**
- Modify: `frontend/src/types/index.ts` (add semantic types)
- Create: `frontend/src/hooks/use-semantic.ts`

### Step 1: Add TypeScript types

Add to `frontend/src/types/index.ts`:

```typescript
export interface SemanticModel {
  id: number;
  connection_id: number;
  name: string;
  description: string;
  source_type: "table" | "sql";
  source_table: string | null;
  source_sql: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  measures?: ModelMeasure[];
  dimensions?: ModelDimension[];
  joins?: ModelJoin[];
}

export interface ModelMeasure {
  id: number;
  model_id: number;
  name: string;
  label: string;
  description: string;
  expression: string;
  agg_type: "sum" | "count" | "count_distinct" | "avg" | "min" | "max" | "custom";
  format: string;
  filters: unknown[];
  sort_order: number;
}

export interface ModelDimension {
  id: number;
  model_id: number;
  name: string;
  label: string;
  description: string;
  column_name: string;
  dimension_type: "categorical" | "temporal" | "numeric";
  time_grain: string | null;
  format: string;
  sort_order: number;
}

export interface ModelJoin {
  id: number;
  from_model_id: number;
  to_model_id: number;
  to_model_name?: string;
  join_type: "inner" | "left" | "right" | "full";
  from_column: string;
  to_column: string;
}

export interface SemanticQueryRequest {
  model_id: number;
  measures: string[];
  dimensions: string[];
  filters?: Array<{ dimension: string; operator: string; value: string | string[] }>;
  order_by?: string;
  limit?: number;
}

export interface SemanticQueryResult {
  sql: string;
  data: { columns: string[]; rows: unknown[][] };
}
```

### Step 2: Create hooks

Create `frontend/src/hooks/use-semantic.ts` following the pattern from `frontend/src/hooks/use-datasets.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import type {
  SemanticModel,
  ModelMeasure,
  ModelDimension,
  ModelJoin,
  SemanticQueryRequest,
  SemanticQueryResult,
} from "@/types";

export function useSemanticModels(connectionId?: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const params = connectionId ? `?connection_id=${connectionId}` : "";
  return useQuery({
    queryKey: ["semantic-models", connectionId],
    queryFn: () => api.get<SemanticModel[]>(`/api/semantic/models${params}`, token),
    enabled: !!token,
  });
}

export function useSemanticModel(modelId: number | null) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["semantic-model", modelId],
    queryFn: () => api.get<SemanticModel>(`/api/semantic/models/${modelId}`, token),
    enabled: !!token && !!modelId,
  });
}

export function useCreateSemanticModel() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SemanticModel>) => api.post<SemanticModel>("/api/semantic/models", data, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["semantic-models"] }),
  });
}

export function useUpdateSemanticModel() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<SemanticModel> & { id: number }) =>
      api.put<SemanticModel>(`/api/semantic/models/${id}`, data, token),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["semantic-models"] });
      qc.invalidateQueries({ queryKey: ["semantic-model", vars.id] });
    },
  });
}

export function useDeleteSemanticModel() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/semantic/models/${id}`, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["semantic-models"] }),
  });
}

// Measures
export function useCreateMeasure() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelId, ...data }: Partial<ModelMeasure> & { modelId: number }) =>
      api.post<ModelMeasure>(`/api/semantic/models/${modelId}/measures`, data, token),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["semantic-model", vars.modelId] }),
  });
}

export function useUpdateMeasure() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, modelId, ...data }: Partial<ModelMeasure> & { id: number; modelId: number }) =>
      api.put<ModelMeasure>(`/api/semantic/measures/${id}`, data, token),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["semantic-model", vars.modelId] }),
  });
}

export function useDeleteMeasure() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, modelId }: { id: number; modelId: number }) =>
      api.delete(`/api/semantic/measures/${id}`, token),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["semantic-model", vars.modelId] }),
  });
}

// Dimensions
export function useCreateDimension() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelId, ...data }: Partial<ModelDimension> & { modelId: number }) =>
      api.post<ModelDimension>(`/api/semantic/models/${modelId}/dimensions`, data, token),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["semantic-model", vars.modelId] }),
  });
}

export function useUpdateDimension() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, modelId, ...data }: Partial<ModelDimension> & { id: number; modelId: number }) =>
      api.put<ModelDimension>(`/api/semantic/dimensions/${id}`, data, token),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["semantic-model", vars.modelId] }),
  });
}

export function useDeleteDimension() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, modelId }: { id: number; modelId: number }) =>
      api.delete(`/api/semantic/dimensions/${id}`, token),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["semantic-model", vars.modelId] }),
  });
}

// Joins
export function useCreateJoin() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelId, ...data }: Partial<ModelJoin> & { modelId: number }) =>
      api.post<ModelJoin>(`/api/semantic/models/${modelId}/joins`, data, token),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["semantic-model", vars.modelId] }),
  });
}

export function useDeleteJoin() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, modelId }: { id: number; modelId: number }) =>
      api.delete(`/api/semantic/joins/${id}`, token),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["semantic-model", vars.modelId] }),
  });
}

// Semantic Query
export function useSemanticQuery() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useMutation({
    mutationFn: (req: SemanticQueryRequest) =>
      api.post<SemanticQueryResult>("/api/semantic/query", req, token),
  });
}
```

### Step 3: Commit

```bash
git add frontend/src/types/index.ts frontend/src/hooks/use-semantic.ts
git commit -m "feat: frontend types and hooks for semantic layer API"
```

---

## Task 5: Semantic Layer — Metrics Management UI

**Goal:** New `/metrics` page for managing semantic models, measures, and dimensions.

**Files:**
- Create: `frontend/src/app/(dashboard)/metrics/page.tsx`
- Create: `frontend/src/components/metrics/model-editor.tsx`
- Create: `frontend/src/components/metrics/measure-form.tsx`
- Create: `frontend/src/components/metrics/dimension-form.tsx`
- Create: `frontend/src/components/metrics/join-editor.tsx`
- Modify: `frontend/messages/en.json` (add i18n keys)
- Modify: `frontend/messages/ru.json` (add i18n keys)

### Step 1: Create metrics page

Build `/metrics` page following existing page patterns (see `frontend/src/app/(dashboard)/datasets/page.tsx` as reference):

- List of semantic models as cards/table
- Click to open model editor
- Create new model button
- Connection selector
- For each model: inline list of measures and dimensions

### Step 2: Create model editor

`model-editor.tsx`: Full-page or dialog editor for a single semantic model:

- Model name, description, source type (table/SQL)
- Connection selector
- Table selector (if source_type=table) or SQL editor (if source_type=sql)
- Tabs: Measures | Dimensions | Joins
- Each tab has add/edit/delete with inline forms

### Step 3: Create measure/dimension forms

Simple forms with fields matching the database columns. Use shadcn/ui `Input`, `Select`, `Textarea`.

### Step 4: Create join editor

Visual join configuration:

- Select target model
- Select join type (inner/left/right/full)
- Select from_column and to_column

### Step 5: Add i18n keys

Add to both `en.json` and `ru.json`:

```json
{
  "metrics": {
    "title": "Metrics",
    "createModel": "New Model",
    "measures": "Measures",
    "dimensions": "Dimensions",
    "joins": "Joins",
    "sourceType": "Source Type",
    "table": "Table",
    "sql": "Custom SQL",
    "expression": "Expression",
    "aggType": "Aggregation",
    "columnName": "Column",
    "dimensionType": "Type",
    "timeGrain": "Time Grain",
    "joinType": "Join Type",
    "fromColumn": "From Column",
    "toColumn": "To Column"
  }
}
```

### Step 6: Add navigation link

Add "Metrics" link in the app shell sidebar/navigation, between "Datasets" and "SQL Lab".

### Step 7: Commit

```bash
git add frontend/src/app/\\(dashboard\\)/metrics/ frontend/src/components/metrics/
git add frontend/messages/en.json frontend/messages/ru.json
git commit -m "feat: metrics management UI — models, measures, dimensions, joins"
```

---

## Task 6: AI Agent Router

**Goal:** Implement multi-agent routing — classify user intent and route to specialized agents with their own system prompts and tool sets.

**Files:**
- Create: `api/ai/agents.py`
- Modify: `api/ai/router.py:148-229` (integrate agent routing into `chat` function)
- Modify: `api/ai/prompts.py` (add per-agent system prompts)

### Step 1: Create agent definitions

Create `api/ai/agents.py`:

```python
"""Multi-agent routing for AI copilot.

Three specialized agents: Data Analyst, Chart Builder, Dashboard Manager.
A lightweight LLM call classifies user intent and routes to the appropriate agent.
"""

import json
import logging
from api.ai.llm_client import chat_completion

logger = logging.getLogger(__name__)

AGENTS = {
    "data_analyst": {
        "name": "Data Analyst",
        "description": "Analyzes data, writes SQL queries, explains results",
        "tools": [
            "search_content", "get_connections", "get_schema", "get_sample",
            "get_table_profile", "execute_sql", "list_datasets",
            "list_semantic_models", "semantic_query", "validate_sql",
        ],
    },
    "chart_builder": {
        "name": "Chart Builder",
        "description": "Creates and configures charts and visualizations",
        "tools": [
            "get_connections", "get_schema", "get_table_profile", "execute_sql",
            "quick_create_chart", "create_dataset", "create_chart",
            "update_chart", "delete_chart", "preview_chart",
            "patch_chart_config", "get_chart_config_schema", "clone_chart",
            "list_semantic_models", "semantic_query",
        ],
    },
    "dashboard_manager": {
        "name": "Dashboard Manager",
        "description": "Manages dashboards, layout, filters, cloning",
        "tools": [
            "search_content", "list_dashboards", "create_dashboard",
            "clone_dashboard", "clone_chart", "add_filter",
        ],
    },
}

ROUTING_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "route_to_agent",
            "description": "Route the user message to the most appropriate agent",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent": {
                        "type": "string",
                        "enum": ["data_analyst", "chart_builder", "dashboard_manager"],
                        "description": (
                            "data_analyst: questions about data, SQL queries, analysis. "
                            "chart_builder: create/modify/configure charts and visualizations. "
                            "dashboard_manager: create/modify dashboards, add filters, clone."
                        ),
                    },
                    "reasoning": {
                        "type": "string",
                        "description": "Brief explanation of why this agent was chosen",
                    },
                },
                "required": ["agent"],
            },
        },
    },
]


async def classify_intent(user_message: str, context: dict | None = None) -> str:
    """Classify user intent and return agent name.

    Uses a lightweight LLM call with function calling to determine
    which agent should handle the request.

    Returns: Agent key (data_analyst, chart_builder, dashboard_manager).
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are a routing assistant. Based on the user's message, determine which agent should handle it. "
                "Call the route_to_agent function with the appropriate agent."
            ),
        },
        {"role": "user", "content": user_message},
    ]

    try:
        response = await chat_completion(messages, tools=ROUTING_TOOLS, temperature=0, max_tokens=200)
        choice = response["choices"][0]
        msg = choice["message"]

        tool_calls = msg.get("tool_calls")
        if tool_calls:
            args = json.loads(tool_calls[0]["function"]["arguments"])
            agent = args.get("agent", "data_analyst")
            logger.info("Routed to %s: %s", agent, args.get("reasoning", ""))
            return agent
    except Exception:
        logger.exception("Agent classification failed, defaulting to data_analyst")

    return "data_analyst"


def get_agent_tools(agent_key: str, all_tool_definitions: list, all_tool_map: dict) -> tuple[list, dict]:
    """Filter tool definitions and map to only those available to the given agent.

    Returns: (filtered_tool_definitions, filtered_tool_map)
    """
    agent = AGENTS.get(agent_key, AGENTS["data_analyst"])
    allowed = set(agent["tools"])

    filtered_defs = [
        t for t in all_tool_definitions
        if t["function"]["name"] in allowed
    ]
    filtered_map = {
        name: fn for name, fn in all_tool_map.items()
        if name in allowed
    }

    return filtered_defs, filtered_map
```

### Step 2: Add per-agent system prompts

In `api/ai/prompts.py`, add a function that returns agent-specific instructions to append to the base system prompt:

```python
def build_agent_prompt(agent_key: str) -> str:
    """Return agent-specific system prompt additions."""
    prompts = {
        "data_analyst": (
            "\n\n## Your Role: Data Analyst\n"
            "You specialize in data exploration and analysis.\n"
            "- Write SQL queries to answer user questions about their data.\n"
            "- When a semantic model exists for the connection, prefer using semantic_query over raw SQL.\n"
            "- Explain results clearly with context and insights.\n"
            "- If results are large, summarize key findings.\n"
            "- Suggest follow-up analyses when appropriate.\n"
        ),
        "chart_builder": (
            "\n\n## Your Role: Chart Builder\n"
            "You specialize in creating and configuring data visualizations.\n"
            "- Use quick_create_chart for new charts (fastest path).\n"
            "- Use patch_chart_config for visual adjustments to existing charts.\n"
            "- Always check get_chart_config_schema for available options per chart type.\n"
            "- Suggest the most appropriate chart type for the data.\n"
            "- After creating a chart, provide the link to view it.\n"
        ),
        "dashboard_manager": (
            "\n\n## Your Role: Dashboard Manager\n"
            "You specialize in dashboard organization and management.\n"
            "- Search existing dashboards before creating new ones.\n"
            "- Use clone_dashboard to duplicate existing work.\n"
            "- Help organize charts across dashboards.\n"
            "- Add filters to make dashboards interactive.\n"
        ),
    }
    return prompts.get(agent_key, "")
```

### Step 3: Integrate into chat endpoint

Modify `api/ai/router.py` `chat` function to:

1. Call `classify_intent` before the tool-use loop
2. Filter tools based on agent
3. Append agent-specific system prompt
4. Stream agent name to frontend: `yield _sse({"type": "agent", "name": agent_key})`

### Step 4: Commit

```bash
git add api/ai/agents.py api/ai/prompts.py api/ai/router.py
git commit -m "feat: multi-agent routing — Data Analyst, Chart Builder, Dashboard Manager"
```

---

## Task 7: AI Semantic Tools

**Goal:** Add `list_semantic_models` and `semantic_query` as AI tools so agents can use the semantic layer.

**Files:**
- Modify: `api/ai/tools.py` (add 2 new tools + tool definitions)

### Step 1: Add tool functions

Add to `api/ai/tools.py`:

```python
async def list_semantic_models(connection_id: int | None = None) -> dict:
    """List available semantic models with their measures and dimensions."""
    with engine.connect() as conn:
        if connection_id:
            models = conn.execute(text(
                "SELECT id, name, description FROM semantic_models WHERE connection_id = :cid"
            ), {"cid": connection_id}).mappings().all()
        else:
            models = conn.execute(text(
                "SELECT id, name, description, connection_id FROM semantic_models"
            )).mappings().all()

        result = []
        for m in models:
            measures = conn.execute(text(
                "SELECT name, label, agg_type FROM model_measures WHERE model_id = :mid ORDER BY sort_order"
            ), {"mid": m["id"]}).mappings().all()
            dimensions = conn.execute(text(
                "SELECT name, label, dimension_type FROM model_dimensions WHERE model_id = :mid ORDER BY sort_order"
            ), {"mid": m["id"]}).mappings().all()
            result.append({
                **dict(m),
                "measures": [dict(r) for r in measures],
                "dimensions": [dict(r) for r in dimensions],
            })
        return {"models": result}


async def semantic_query_tool(
    model_id: int,
    measures: list[str],
    dimensions: list[str] | None = None,
    filters: list[dict] | None = None,
    limit: int | None = 100,
) -> dict:
    """Execute a semantic query and return results."""
    from api.semantic.query_builder import build_semantic_query
    try:
        sql = build_semantic_query(
            model_id=model_id,
            measure_names=measures,
            dimension_names=dimensions or [],
            filters=filters,
            limit=limit,
        )
    except ValueError as e:
        return {"error": str(e)}

    # Get connection_id
    with engine.connect() as conn:
        model = conn.execute(text(
            "SELECT connection_id FROM semantic_models WHERE id = :id"
        ), {"id": model_id}).mappings().first()
        if not model:
            return {"error": f"Model {model_id} not found"}

    result = await execute_sql(model["connection_id"], sql)
    result["generated_sql"] = sql
    return result
```

### Step 2: Add tool definitions and map entries

Add to `TOOL_DEFINITIONS` list and `TOOL_MAP` dict in `api/ai/tools.py`.

### Step 3: Commit

```bash
git add api/ai/tools.py
git commit -m "feat: AI tools for semantic layer — list_semantic_models + semantic_query"
```

---

## Task 8: Copilot Sidebar — Frontend

**Goal:** Persistent AI copilot sidebar on dashboard/chart pages with rich context and inline rendering.

**Files:**
- Create: `frontend/src/components/ai/copilot-sidebar.tsx`
- Create: `frontend/src/components/ai/chat-message.tsx`
- Create: `frontend/src/components/ai/suggested-questions.tsx`
- Modify: `frontend/src/components/ai/ai-chat-drawer.tsx` (reuse logic or refactor)
- Modify: `frontend/src/hooks/use-ai.ts` (add agent event handling)

### Step 1: Enhance useAIChat hook

Add handling for new SSE events:

- `"agent"` event → track which agent is active
- Expose `currentAgent` in return value
- Add `context` parameter support for richer context passing

### Step 2: Create chat-message component

`chat-message.tsx`: Enhanced message rendering that supports:

- Markdown rendering for text
- SQL code blocks with syntax highlighting
- Inline mini-tables for query results (when tool_result contains tabular data)
- Agent badge showing which agent answered

### Step 3: Create suggested-questions component

`suggested-questions.tsx`: Shows 3-4 contextual prompts when a session starts:

- On dashboard page: "What trends are visible?", "Which metric changed most?"
- On chart page: "Explain this chart", "How can I improve this visualization?"
- On SQL Lab: "Help me write a query for...", "Optimize this SQL"

### Step 4: Create copilot sidebar

`copilot-sidebar.tsx`:

- Uses shadcn `Sheet` (side="right")
- Button trigger: sparkle/AI icon in page header
- Shows session list + new session
- Chat messages with streaming
- Input with send button
- Passes page context (dashboard_id, chart_id, connection_id)

### Step 5: Integrate into layout

Add copilot trigger button to dashboard and chart pages. The sidebar mounts globally in the `(dashboard)` layout.

### Step 6: Commit

```bash
git add frontend/src/components/ai/ frontend/src/hooks/use-ai.ts
git commit -m "feat: AI copilot sidebar with inline rendering and suggested questions"
```

---

## Task 9: Context Enrichment + Conversation Summary

**Goal:** Pass richer context to AI agents and handle long conversations gracefully.

**Files:**
- Modify: `api/ai/router.py` (`_load_messages_for_llm` function)
- Modify: `api/ai/prompts.py` (`build_system_prompt` function)

### Step 1: Enrich dashboard context

When `context_type == "dashboard"` and `context_id` is set, load all charts for that dashboard and include their titles, SQL queries, and column names in the system prompt.

### Step 2: Enrich chart context

When `context_type == "chart"`, load the chart's full config and last cached result (top 5 rows).

### Step 3: Add semantic context

In `build_system_prompt`, when `connection_id` is set, load all semantic models for that connection and include their measures/dimensions as available context.

### Step 4: Conversation summary

In `_load_messages_for_llm`, if there are more than 15 messages, summarize the older messages:

1. Take messages 1 through N-10
2. Call LLM with "summarize this conversation so far in 3-5 bullet points"
3. Replace those messages with a single system message containing the summary
4. Keep the last 10 messages verbatim

This ensures the conversation stays within token limits while preserving recent context.

### Step 5: Commit

```bash
git add api/ai/router.py api/ai/prompts.py
git commit -m "feat: richer AI context — dashboard/chart data + conversation summary"
```

---

## Task 10: Chart Editor — Metrics Tab Integration

**Goal:** Add a "Metrics" tab in the chart editor sidebar that shows semantic model measures/dimensions for drag-and-drop into chart config.

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/chart-sidebar.tsx`
- Create: `frontend/src/components/metrics/metrics-browser.tsx`

### Step 1: Create metrics browser component

`metrics-browser.tsx`:

- Loads semantic models for the current connection via `useSemanticModels(connectionId)`
- Shows expandable tree: Model → Measures / Dimensions
- Each item is draggable (using existing @dnd-kit setup)
- Measures drag to y_columns area
- Dimensions drag to x_column area

### Step 2: Add tab to chart sidebar

In `chart-sidebar.tsx`, add a new tab "Metrics" (with a layer icon) alongside existing tabs (Columns, Config, etc.):

- Only shows when semantic models exist for current connection
- Contains the metrics browser component

### Step 3: Handle metric drop

When a metric is dropped into the chart config:

- If measure: set y_columns to include the measure expression, update SQL to use semantic query
- If dimension: set x_column to the dimension column_name

### Step 4: Commit

```bash
git add frontend/src/app/\\(dashboard\\)/dashboard/\\[slug\\]/chart/\\[id\\]/components/chart-sidebar.tsx
git add frontend/src/components/metrics/metrics-browser.tsx
git commit -m "feat: metrics browser tab in chart editor — drag measures/dimensions into config"
```

---

## Task 11: i18n + Polish + Integration Testing

**Goal:** Add all i18n keys, verify end-to-end flows, fix edge cases.

**Files:**
- Modify: `frontend/messages/en.json`
- Modify: `frontend/messages/ru.json`

### Step 1: Add all i18n keys

Add keys for: metrics page, copilot sidebar, agent names, semantic query errors, suggested questions.

### Step 2: Integration verification

Run full stack: `docker compose up --build -d`

Verify:
1. Create semantic model via `/metrics` page → model saves with measures/dimensions
2. Query semantic model via API → SQL generated and executed correctly
3. Open copilot on dashboard → suggested questions appear
4. Ask "which region has highest revenue" → Data Analyst agent routes, uses semantic_query if model exists
5. Ask "build a bar chart of revenue by month" → Chart Builder agent routes, creates chart
6. Metrics browser in chart editor shows models for current connection
7. All pages render in both EN and RU

### Step 3: Commit

```bash
git add frontend/messages/en.json frontend/messages/ru.json
git commit -m "feat: i18n for semantic layer and AI copilot"
```

---

## Implementation Order

| # | Task | Effort | Dependencies |
|---|------|--------|-------------|
| 1 | Semantic tables | 0.5 day | None |
| 2 | Semantic CRUD API | 1-2 days | Task 1 |
| 3 | Semantic query builder | 2-3 days | Task 2 |
| 4 | Frontend hooks + types | 1 day | Task 2 |
| 5 | Metrics management UI | 3-4 days | Task 4 |
| 6 | AI agent router | 2-3 days | None |
| 7 | AI semantic tools | 1 day | Tasks 3, 6 |
| 8 | Copilot sidebar | 3-4 days | Task 6 |
| 9 | Context enrichment | 2-3 days | Tasks 6, 7 |
| 10 | Chart editor metrics tab | 2 days | Tasks 4, 5 |
| 11 | i18n + polish | 1-2 days | All above |

**Parallel tracks:**
- Track A (Semantic): Tasks 1 → 2 → 3 → 4 → 5 → 10
- Track B (AI Copilot): Tasks 6 → 7 → 8 → 9
- Final: Task 11

**Total: ~18-25 working days.**
