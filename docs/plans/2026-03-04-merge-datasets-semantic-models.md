# Merge Datasets & Semantic Models Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend datasets with measures and dimensions, then remove the separate semantic models system entirely.

**Architecture:** Add `dataset_measures` and `dataset_dimensions` tables as children of `datasets`. Add CRUD endpoints nested under `/api/datasets/{id}/measures` and `/api/datasets/{id}/dimensions`. Migrate existing semantic model data into datasets, then drop the 4 old semantic tables. Frontend: add tabs to the dataset editor dialog, remove the Metrics page/nav/components.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy (raw SQL), Pydantic; Next.js 16, React 19, TanStack Query 5, shadcn/ui

---

### Task 1: Backend — Add database tables and Pydantic models

**Files:**
- Modify: `api/database.py` (lines 430–480 and 834–884)
- Modify: `api/models.py` (after line ~410)
- Test: `api/tests/test_dataset_measures_models.py`

**Step 1: Write failing test for Pydantic models**

Create `api/tests/test_dataset_measures_models.py`:

```python
"""Tests for dataset measures/dimensions Pydantic models."""
import pytest
from api.models import (
    DatasetMeasureCreate,
    DatasetMeasureUpdate,
    DatasetMeasureResponse,
    DatasetDimensionCreate,
    DatasetDimensionUpdate,
    DatasetDimensionResponse,
)


def test_measure_create_valid():
    m = DatasetMeasureCreate(
        name="revenue", label="Revenue", expression="amount", agg_type="sum"
    )
    assert m.name == "revenue"
    assert m.format == ""
    assert m.filters == []
    assert m.sort_order == 0


def test_measure_create_requires_fields():
    with pytest.raises(Exception):
        DatasetMeasureCreate(name="x")  # missing label, expression, agg_type


def test_measure_update_all_optional():
    m = DatasetMeasureUpdate()
    assert m.name is None
    assert m.label is None


def test_measure_response():
    m = DatasetMeasureResponse(
        id=1, dataset_id=10, name="rev", label="Revenue",
        expression="amount", agg_type="sum",
    )
    assert m.id == 1
    assert m.dataset_id == 10


def test_dimension_create_valid():
    d = DatasetDimensionCreate(
        name="region", label="Region", column_name="region",
    )
    assert d.dimension_type == "categorical"
    assert d.time_grain is None


def test_dimension_create_time():
    d = DatasetDimensionCreate(
        name="order_date", label="Order Date", column_name="order_date",
        dimension_type="time", time_grain="month",
    )
    assert d.dimension_type == "time"
    assert d.time_grain == "month"


def test_dimension_update_all_optional():
    d = DatasetDimensionUpdate()
    assert d.name is None


def test_dimension_response():
    d = DatasetDimensionResponse(
        id=1, dataset_id=10, name="region", label="Region",
        column_name="region", dimension_type="categorical",
    )
    assert d.id == 1
```

**Step 2: Run test to verify it fails**

Run: `cd api && uv run pytest tests/test_dataset_measures_models.py -v`
Expected: FAIL with ImportError (models don't exist yet)

**Step 3: Add Pydantic models to `api/models.py`**

Add after the `DatasetResponse` class (~line 410):

```python
# ---------- Dataset Measures ----------

class DatasetMeasureCreate(BaseModel):
    name: str
    label: str
    description: str = ""
    expression: str
    agg_type: str
    format: str = ""
    filters: list = []
    sort_order: int = 0


class DatasetMeasureUpdate(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    expression: Optional[str] = None
    agg_type: Optional[str] = None
    format: Optional[str] = None
    filters: Optional[list] = None
    sort_order: Optional[int] = None


class DatasetMeasureResponse(BaseModel):
    id: int
    dataset_id: int
    name: str
    label: str
    description: str = ""
    expression: str
    agg_type: str
    format: str = ""
    filters: list = []
    sort_order: int = 0
    model_config = ConfigDict(from_attributes=True)


# ---------- Dataset Dimensions ----------

class DatasetDimensionCreate(BaseModel):
    name: str
    label: str
    description: str = ""
    column_name: str
    dimension_type: str = "categorical"
    time_grain: Optional[str] = None
    format: str = ""
    sort_order: int = 0


class DatasetDimensionUpdate(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    column_name: Optional[str] = None
    dimension_type: Optional[str] = None
    time_grain: Optional[str] = None
    format: Optional[str] = None
    sort_order: Optional[int] = None


class DatasetDimensionResponse(BaseModel):
    id: int
    dataset_id: int
    name: str
    label: str
    description: str = ""
    column_name: str
    dimension_type: str = "categorical"
    time_grain: Optional[str] = None
    format: str = ""
    sort_order: int = 0
    model_config = ConfigDict(from_attributes=True)
```

**Step 4: Add CREATE TABLE statements to `api/database.py`**

Replace the semantic table DDL blocks at lines 430–480 and 834–884 with the new `dataset_measures` and `dataset_dimensions` tables. The old `semantic_models`, `model_measures`, `model_dimensions`, `model_joins` CREATE TABLE statements should be replaced with:

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

Do this replacement in **both** locations (lines ~430 and ~834). Remove all 4 old tables (`semantic_models`, `model_measures`, `model_dimensions`, `model_joins`) from both blocks.

Also add DROP TABLE statements at the end of SCHEMA_SQL (before the closing `"""`):

```sql
DROP TABLE IF EXISTS model_joins;
DROP TABLE IF EXISTS model_measures;
DROP TABLE IF EXISTS model_dimensions;
DROP TABLE IF EXISTS semantic_models;
```

**Step 5: Run test to verify it passes**

Run: `cd api && uv run pytest tests/test_dataset_measures_models.py -v`
Expected: All 8 tests PASS

**Step 6: Commit**

```bash
git add api/models.py api/database.py api/tests/test_dataset_measures_models.py
git commit -m "feat: add dataset_measures/dimensions tables and Pydantic models"
```

---

### Task 2: Backend — CRUD endpoints for dataset measures

**Files:**
- Modify: `api/datasets/router.py` (add after `get_dataset_columns` function, ~line 280)
- Test: `api/tests/test_dataset_measures_api.py`

**Step 1: Write failing tests**

Create `api/tests/test_dataset_measures_api.py`:

```python
"""Tests for dataset measures CRUD endpoints."""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

HEADERS = {"Authorization": "Bearer test-token"}
MOCK_USER = {"id": 1, "email": "test@test.com", "is_admin": False}


@pytest.fixture(autouse=True)
def mock_auth():
    with patch("api.auth.get_current_user", return_value=MOCK_USER):
        yield


@pytest.fixture
def mock_db():
    with patch("api.datasets.router.engine") as mock_engine:
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = MagicMock(return_value=False)
        yield mock_conn


def test_list_measures_empty(mock_db):
    mock_db.execute.return_value.mappings.return_value.fetchall.return_value = []
    resp = client.get("/api/datasets/1/measures", headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_measure(mock_db):
    mock_db.execute.return_value.mappings.return_value.fetchone.return_value = {
        "id": 1, "dataset_id": 1, "name": "revenue", "label": "Revenue",
        "description": "", "expression": "amount", "agg_type": "sum",
        "format": "", "filters": [], "sort_order": 0,
    }
    resp = client.post("/api/datasets/1/measures", headers=HEADERS, json={
        "name": "revenue", "label": "Revenue", "expression": "amount", "agg_type": "sum",
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "revenue"


def test_update_measure(mock_db):
    mock_db.execute.return_value.mappings.return_value.fetchone.return_value = {
        "id": 1, "dataset_id": 1, "name": "revenue", "label": "Total Revenue",
        "description": "", "expression": "amount", "agg_type": "sum",
        "format": "$", "filters": [], "sort_order": 0,
    }
    resp = client.put("/api/datasets/1/measures/1", headers=HEADERS, json={
        "label": "Total Revenue", "format": "$",
    })
    assert resp.status_code == 200
    assert resp.json()["label"] == "Total Revenue"


def test_delete_measure(mock_db):
    mock_db.execute.return_value.rowcount = 1
    resp = client.delete("/api/datasets/1/measures/1", headers=HEADERS)
    assert resp.status_code == 200
```

**Step 2: Run tests to verify they fail**

Run: `cd api && uv run pytest tests/test_dataset_measures_api.py -v`
Expected: FAIL (404 — routes don't exist)

**Step 3: Implement measure endpoints in `api/datasets/router.py`**

Add after the `get_dataset_columns` function:

```python
from api.models import (
    DatasetMeasureCreate, DatasetMeasureUpdate, DatasetMeasureResponse,
    DatasetDimensionCreate, DatasetDimensionUpdate, DatasetDimensionResponse,
)

# ---------- Measures ----------

@router.get("/{dataset_id}/measures")
def list_measures(dataset_id: int, user=Depends(get_current_user)):
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM dataset_measures WHERE dataset_id = :did ORDER BY sort_order"),
            {"did": dataset_id},
        ).mappings().fetchall()
        return [dict(r) for r in rows]


@router.post("/{dataset_id}/measures")
def create_measure(dataset_id: int, req: DatasetMeasureCreate, user=Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                INSERT INTO dataset_measures (dataset_id, name, label, description, expression, agg_type, format, filters, sort_order)
                VALUES (:did, :name, :label, :desc, :expr, :agg, :fmt, :filters::jsonb, :sort)
                RETURNING *
            """),
            {"did": dataset_id, "name": req.name, "label": req.label,
             "desc": req.description, "expr": req.expression, "agg": req.agg_type,
             "fmt": req.format, "filters": json.dumps(req.filters), "sort": req.sort_order},
        ).mappings().fetchone()
        conn.commit()
        return dict(row)


@router.put("/{dataset_id}/measures/{measure_id}")
def update_measure(dataset_id: int, measure_id: int, req: DatasetMeasureUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "filters" in updates:
        updates["filters"] = json.dumps(updates["filters"])
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["mid"] = measure_id
    updates["did"] = dataset_id
    with engine.connect() as conn:
        row = conn.execute(
            text(f"UPDATE dataset_measures SET {set_clause} WHERE id = :mid AND dataset_id = :did RETURNING *"),
            updates,
        ).mappings().fetchone()
        conn.commit()
        if not row:
            raise HTTPException(404, "Measure not found")
        return dict(row)


@router.delete("/{dataset_id}/measures/{measure_id}")
def delete_measure(dataset_id: int, measure_id: int, user=Depends(get_current_user)):
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM dataset_measures WHERE id = :mid AND dataset_id = :did"),
            {"mid": measure_id, "did": dataset_id},
        )
        conn.commit()
        return {"ok": True}
```

Note: make sure `import json` is at the top of the file. Also import `HTTPException` if not already imported.

**Step 4: Run tests to verify they pass**

Run: `cd api && uv run pytest tests/test_dataset_measures_api.py -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add api/datasets/router.py api/tests/test_dataset_measures_api.py
git commit -m "feat: add CRUD endpoints for dataset measures"
```

---

### Task 3: Backend — CRUD endpoints for dataset dimensions

**Files:**
- Modify: `api/datasets/router.py` (add after measure endpoints)
- Test: `api/tests/test_dataset_dimensions_api.py`

**Step 1: Write failing tests**

Create `api/tests/test_dataset_dimensions_api.py`:

```python
"""Tests for dataset dimensions CRUD endpoints."""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

HEADERS = {"Authorization": "Bearer test-token"}
MOCK_USER = {"id": 1, "email": "test@test.com", "is_admin": False}


@pytest.fixture(autouse=True)
def mock_auth():
    with patch("api.auth.get_current_user", return_value=MOCK_USER):
        yield


@pytest.fixture
def mock_db():
    with patch("api.datasets.router.engine") as mock_engine:
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = MagicMock(return_value=False)
        yield mock_conn


def test_list_dimensions_empty(mock_db):
    mock_db.execute.return_value.mappings.return_value.fetchall.return_value = []
    resp = client.get("/api/datasets/1/dimensions", headers=HEADERS)
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_dimension(mock_db):
    mock_db.execute.return_value.mappings.return_value.fetchone.return_value = {
        "id": 1, "dataset_id": 1, "name": "region", "label": "Region",
        "description": "", "column_name": "region",
        "dimension_type": "categorical", "time_grain": None,
        "format": "", "sort_order": 0,
    }
    resp = client.post("/api/datasets/1/dimensions", headers=HEADERS, json={
        "name": "region", "label": "Region", "column_name": "region",
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "region"
    assert resp.json()["dimension_type"] == "categorical"


def test_create_time_dimension(mock_db):
    mock_db.execute.return_value.mappings.return_value.fetchone.return_value = {
        "id": 2, "dataset_id": 1, "name": "order_date", "label": "Order Date",
        "description": "", "column_name": "order_date",
        "dimension_type": "time", "time_grain": "month",
        "format": "", "sort_order": 0,
    }
    resp = client.post("/api/datasets/1/dimensions", headers=HEADERS, json={
        "name": "order_date", "label": "Order Date", "column_name": "order_date",
        "dimension_type": "time", "time_grain": "month",
    })
    assert resp.status_code == 200
    assert resp.json()["time_grain"] == "month"


def test_update_dimension(mock_db):
    mock_db.execute.return_value.mappings.return_value.fetchone.return_value = {
        "id": 1, "dataset_id": 1, "name": "region", "label": "Sales Region",
        "description": "Geographic region", "column_name": "region",
        "dimension_type": "categorical", "time_grain": None,
        "format": "", "sort_order": 0,
    }
    resp = client.put("/api/datasets/1/dimensions/1", headers=HEADERS, json={
        "label": "Sales Region", "description": "Geographic region",
    })
    assert resp.status_code == 200
    assert resp.json()["label"] == "Sales Region"


def test_delete_dimension(mock_db):
    mock_db.execute.return_value.rowcount = 1
    resp = client.delete("/api/datasets/1/dimensions/1", headers=HEADERS)
    assert resp.status_code == 200
```

**Step 2: Run tests to verify they fail**

Run: `cd api && uv run pytest tests/test_dataset_dimensions_api.py -v`
Expected: FAIL (404)

**Step 3: Implement dimension endpoints in `api/datasets/router.py`**

Add after the measure endpoints:

```python
# ---------- Dimensions ----------

@router.get("/{dataset_id}/dimensions")
def list_dimensions(dataset_id: int, user=Depends(get_current_user)):
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM dataset_dimensions WHERE dataset_id = :did ORDER BY sort_order"),
            {"did": dataset_id},
        ).mappings().fetchall()
        return [dict(r) for r in rows]


@router.post("/{dataset_id}/dimensions")
def create_dimension(dataset_id: int, req: DatasetDimensionCreate, user=Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                INSERT INTO dataset_dimensions (dataset_id, name, label, description, column_name, dimension_type, time_grain, format, sort_order)
                VALUES (:did, :name, :label, :desc, :col, :dtype, :tgrain, :fmt, :sort)
                RETURNING *
            """),
            {"did": dataset_id, "name": req.name, "label": req.label,
             "desc": req.description, "col": req.column_name, "dtype": req.dimension_type,
             "tgrain": req.time_grain, "fmt": req.format, "sort": req.sort_order},
        ).mappings().fetchone()
        conn.commit()
        return dict(row)


@router.put("/{dataset_id}/dimensions/{dimension_id}")
def update_dimension(dataset_id: int, dimension_id: int, req: DatasetDimensionUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["did"] = dataset_id
    updates["dimid"] = dimension_id
    with engine.connect() as conn:
        row = conn.execute(
            text(f"UPDATE dataset_dimensions SET {set_clause} WHERE id = :dimid AND dataset_id = :did RETURNING *"),
            updates,
        ).mappings().fetchone()
        conn.commit()
        if not row:
            raise HTTPException(404, "Dimension not found")
        return dict(row)


@router.delete("/{dataset_id}/dimensions/{dimension_id}")
def delete_dimension(dataset_id: int, dimension_id: int, user=Depends(get_current_user)):
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM dataset_dimensions WHERE id = :dimid AND dataset_id = :did"),
            {"dimid": dimension_id, "did": dataset_id},
        )
        conn.commit()
        return {"ok": True}
```

**Step 4: Run tests to verify they pass**

Run: `cd api && uv run pytest tests/test_dataset_dimensions_api.py -v`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add api/datasets/router.py api/tests/test_dataset_dimensions_api.py
git commit -m "feat: add CRUD endpoints for dataset dimensions"
```

---

### Task 4: Backend — Remove semantic models module and AI tools

**Files:**
- Delete: `api/semantic/router.py`, `api/semantic/query_builder.py`, `api/semantic/__init__.py`
- Modify: `api/main.py` (lines 158, 194)
- Modify: `api/ai/tools.py` (remove `list_semantic_models`, `semantic_query_tool`, their schemas and dispatch map entries)
- Modify: `api/ai/prompts.py` (remove semantic model context injection, ~lines 155–170)
- Modify: `api/ai/agents.py` (remove `list_semantic_models`, `semantic_query` from agent tool allowlists, lines 35–36, 60–61)
- Test: verify existing tests still pass

**Step 1: Delete `api/semantic/` directory**

```bash
rm -rf api/semantic/
```

**Step 2: Remove semantic router from `api/main.py`**

Remove these two lines:
- Line 158: `from api.semantic.router import router as semantic_router`
- Line 194: `app.include_router(semantic_router)`

**Step 3: Remove semantic AI tools from `api/ai/tools.py`**

Remove:
1. Function `list_semantic_models` (~line 688–714)
2. Function `semantic_query_tool` (~line 716–758)
3. Tool schema objects for `"list_semantic_models"` (~line 1098–1112) and `"semantic_query"` (~line 1114–1135)
4. Dispatch map entries at ~line 1176–1177: `"list_semantic_models": list_semantic_models,` and `"semantic_query": semantic_query_tool,`

**Step 4: Remove semantic context from `api/ai/prompts.py`**

Remove the semantic context block (~lines 155–170) that queries `SELECT id, name, description FROM semantic_models` and appends "## Semantic Models" to the prompt. Also remove line ~427 mentioning semantic models in the prompt text.

**Step 5: Remove semantic tools from `api/ai/agents.py`**

Remove `"list_semantic_models"` and `"semantic_query"` from the two agent tool allowlists at lines 35–36 and 60–61. Also remove the mention at line 117 about "semantic queries".

**Step 6: Run all existing tests to verify nothing broke**

Run: `cd api && uv run pytest tests/ -v --ignore=tests/integration`
Expected: All tests PASS (some tests related to semantic may now fail — if so, delete them)

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove semantic models module, AI tools, and prompt references"
```

---

### Task 5: Frontend — Add hooks for dataset measures and dimensions

**Files:**
- Modify: `frontend/src/hooks/use-datasets.ts` (add new hooks)
- No separate test needed (hooks are thin TanStack Query wrappers)

**Step 1: Read existing `use-datasets.ts` to understand patterns**

Check existing hooks like `useDatasets`, `useCreateDataset`, `useDeleteDataset` for the query key and mutation patterns used.

**Step 2: Add measure hooks to `frontend/src/hooks/use-datasets.ts`**

```typescript
// ---------- Dataset Measures ----------

export interface DatasetMeasure {
  id: number;
  dataset_id: number;
  name: string;
  label: string;
  description: string;
  expression: string;
  agg_type: string;
  format: string;
  filters: unknown[];
  sort_order: number;
}

export function useDatasetMeasures(datasetId: number | null) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useQuery({
    queryKey: ["datasets", datasetId, "measures"],
    queryFn: () => api.get<DatasetMeasure[]>(`/api/datasets/${datasetId}/measures`, token),
    enabled: !!token && datasetId !== null,
  });
}

export function useCreateDatasetMeasure() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useMutation({
    mutationFn: ({ datasetId, data }: { datasetId: number; data: Omit<DatasetMeasure, "id" | "dataset_id"> }) =>
      api.post<DatasetMeasure>(`/api/datasets/${datasetId}/measures`, data, token),
    onSuccess: (_, { datasetId }) => {
      qc.invalidateQueries({ queryKey: ["datasets", datasetId, "measures"] });
    },
  });
}

export function useUpdateDatasetMeasure() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useMutation({
    mutationFn: ({ datasetId, measureId, data }: { datasetId: number; measureId: number; data: Partial<DatasetMeasure> }) =>
      api.put<DatasetMeasure>(`/api/datasets/${datasetId}/measures/${measureId}`, data, token),
    onSuccess: (_, { datasetId }) => {
      qc.invalidateQueries({ queryKey: ["datasets", datasetId, "measures"] });
    },
  });
}

export function useDeleteDatasetMeasure() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useMutation({
    mutationFn: ({ datasetId, measureId }: { datasetId: number; measureId: number }) =>
      api.del(`/api/datasets/${datasetId}/measures/${measureId}`, token),
    onSuccess: (_, { datasetId }) => {
      qc.invalidateQueries({ queryKey: ["datasets", datasetId, "measures"] });
    },
  });
}
```

**Step 3: Add dimension hooks**

Same pattern as measures — types and hooks for `DatasetDimension`:

```typescript
// ---------- Dataset Dimensions ----------

export interface DatasetDimension {
  id: number;
  dataset_id: number;
  name: string;
  label: string;
  description: string;
  column_name: string;
  dimension_type: string;
  time_grain: string | null;
  format: string;
  sort_order: number;
}

export function useDatasetDimensions(datasetId: number | null) {
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useQuery({
    queryKey: ["datasets", datasetId, "dimensions"],
    queryFn: () => api.get<DatasetDimension[]>(`/api/datasets/${datasetId}/dimensions`, token),
    enabled: !!token && datasetId !== null,
  });
}

export function useCreateDatasetDimension() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useMutation({
    mutationFn: ({ datasetId, data }: { datasetId: number; data: Omit<DatasetDimension, "id" | "dataset_id"> }) =>
      api.post<DatasetDimension>(`/api/datasets/${datasetId}/dimensions`, data, token),
    onSuccess: (_, { datasetId }) => {
      qc.invalidateQueries({ queryKey: ["datasets", datasetId, "dimensions"] });
    },
  });
}

export function useUpdateDatasetDimension() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useMutation({
    mutationFn: ({ datasetId, dimensionId, data }: { datasetId: number; dimensionId: number; data: Partial<DatasetDimension> }) =>
      api.put<DatasetDimension>(`/api/datasets/${datasetId}/dimensions/${dimensionId}`, data, token),
    onSuccess: (_, { datasetId }) => {
      qc.invalidateQueries({ queryKey: ["datasets", datasetId, "dimensions"] });
    },
  });
}

export function useDeleteDatasetDimension() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useMutation({
    mutationFn: ({ datasetId, dimensionId }: { datasetId: number; dimensionId: number }) =>
      api.del(`/api/datasets/${datasetId}/dimensions/${dimensionId}`, token),
    onSuccess: (_, { datasetId }) => {
      qc.invalidateQueries({ queryKey: ["datasets", datasetId, "dimensions"] });
    },
  });
}
```

**Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds (new hooks are unused but valid)

**Step 5: Commit**

```bash
git add frontend/src/hooks/use-datasets.ts
git commit -m "feat: add frontend hooks for dataset measures and dimensions"
```

---

### Task 6: Frontend — Add tabs to dataset editor dialog

**Files:**
- Modify: `frontend/src/app/(dashboard)/datasets/page.tsx` (the `DatasetEditorDialog` component)
- Modify: `frontend/messages/en.json` (add i18n keys under `datasets`)
- Modify: `frontend/messages/ru.json` (same)

**Step 1: Add i18n keys**

Add to `datasets` namespace in **both** `en.json` and `ru.json`:

English:
```json
"general": "General",
"measures": "Measures",
"dimensions": "Dimensions",
"addMeasure": "Add measure",
"addDimension": "Add dimension",
"measureName": "Name",
"measureLabel": "Label",
"measureExpression": "Expression",
"measureAggType": "Aggregation",
"measureFormat": "Format",
"measureDescription": "Description",
"dimensionName": "Name",
"dimensionLabel": "Label",
"dimensionColumn": "Column",
"dimensionType": "Type",
"dimensionTimeGrain": "Time grain",
"dimensionFormat": "Format",
"dimensionDescription": "Description",
"categorical": "Categorical",
"time": "Time",
"noMeasures": "No measures defined yet",
"noDimensions": "No dimensions defined yet",
"confirmDeleteMeasure": "Delete this measure?",
"confirmDeleteDimension": "Delete this dimension?",
"aggSum": "Sum",
"aggCount": "Count",
"aggAvg": "Average",
"aggMin": "Min",
"aggMax": "Max",
"aggCountDistinct": "Count Distinct",
"saveMeasure": "Save measure",
"saveDimension": "Save dimension"
```

Russian:
```json
"general": "Общие",
"measures": "Меры",
"dimensions": "Измерения",
"addMeasure": "Добавить меру",
"addDimension": "Добавить измерение",
"measureName": "Имя",
"measureLabel": "Метка",
"measureExpression": "Выражение",
"measureAggType": "Агрегация",
"measureFormat": "Формат",
"measureDescription": "Описание",
"dimensionName": "Имя",
"dimensionLabel": "Метка",
"dimensionColumn": "Колонка",
"dimensionType": "Тип",
"dimensionTimeGrain": "Гранулярность",
"dimensionFormat": "Формат",
"dimensionDescription": "Описание",
"categorical": "Категориальный",
"time": "Временной",
"noMeasures": "Меры не заданы",
"noDimensions": "Измерения не заданы",
"confirmDeleteMeasure": "Удалить эту меру?",
"confirmDeleteDimension": "Удалить это измерение?",
"aggSum": "Сумма",
"aggCount": "Количество",
"aggAvg": "Среднее",
"aggMin": "Минимум",
"aggMax": "Максимум",
"aggCountDistinct": "Уникальные",
"saveMeasure": "Сохранить меру",
"saveDimension": "Сохранить измерение"
```

**Step 2: Modify `DatasetEditorDialog` in `datasets/page.tsx`**

The dialog currently renders form fields directly. Wrap the existing form in a `<Tabs>` component:

1. Import `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs`
2. Import measure/dimension hooks from `@/hooks/use-datasets`
3. Wrap the existing form fields in `<TabsContent value="general">`
4. Add `<TabsContent value="measures">` with a measure list table + add/edit inline form
5. Add `<TabsContent value="dimensions">` with a dimension list table + add/edit inline form

**Measures tab content** — a table listing existing measures with edit/delete buttons, and an "Add measure" form:
- Name (Input), Label (Input), Expression (Input), Aggregation (Select: sum/count/avg/min/max/count_distinct), Format (Input)
- Save button calls `useCreateDatasetMeasure` or `useUpdateDatasetMeasure`
- Delete button with confirmation calls `useDeleteDatasetMeasure`

**Dimensions tab content** — similar table with:
- Name (Input), Label (Input), Column (Input or combobox from dataset columns), Type (Select: categorical/time), Time grain (Select, shown only when type=time), Format (Input)
- Same CRUD pattern

**Important:** Only show the Measures/Dimensions tabs when **editing** an existing dataset (not when creating — you need the dataset ID first).

**Step 3: Verify frontend builds and test in browser**

Run: `cd frontend && npm run build`
Expected: Build succeeds

Then test manually:
1. Open datasets page
2. Click edit on an existing dataset
3. Verify 3 tabs appear: General, Measures, Dimensions
4. Add a measure, verify it appears in the list
5. Edit the measure, verify changes persist
6. Delete the measure

**Step 4: Commit**

```bash
git add frontend/src/app/\\(dashboard\\)/datasets/page.tsx frontend/messages/en.json frontend/messages/ru.json
git commit -m "feat: add measures/dimensions tabs to dataset editor"
```

---

### Task 7: Frontend — Remove Metrics page, components, hooks, and navigation

**Files:**
- Delete: `frontend/src/app/(dashboard)/metrics/page.tsx`
- Delete: `frontend/src/components/metrics/` (entire directory: dimension-form.tsx, join-editor.tsx, measure-form.tsx, metrics-browser.tsx, model-editor.tsx)
- Delete: `frontend/src/hooks/use-semantic.ts`
- Modify: `frontend/src/components/layout/app-header.tsx` (remove metrics from `PRIMARY_NAV_ITEMS`)
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/page.tsx` (remove MetricsBrowser tab, ~lines 90, 204–211, 307, 735–737, 825–827)
- Modify: `frontend/messages/en.json` (remove `metrics` namespace)
- Modify: `frontend/messages/ru.json` (remove `metrics` namespace)

**Step 1: Delete files**

```bash
rm -rf frontend/src/app/\(dashboard\)/metrics/
rm -rf frontend/src/components/metrics/
rm frontend/src/hooks/use-semantic.ts
```

**Step 2: Remove metrics from navigation in `app-header.tsx`**

Remove this line from `PRIMARY_NAV_ITEMS`:
```typescript
{ href: "/metrics", icon: Layers, labelKey: "metrics" },
```

Also remove the `Layers` import from lucide-react if it's no longer used elsewhere.

**Step 3: Remove MetricsBrowser from chart editor page**

In `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/page.tsx`:

1. Remove import: `import { MetricsBrowser } from "@/components/metrics/metrics-browser";` (line 90)
2. Remove the `hasMetrics` state logic and the `useEffect`/derived state that checks for semantic models (~lines 204–211)
3. Remove the drag handler branch for metrics browser (~line 307: `// Dragged from metrics browser`)
4. Remove the metrics `TabsTrigger` (~line 735–737)
5. Remove the metrics `TabsContent` (~lines 825–827)
6. Remove any unused imports (`useSemanticModels`, etc.)

**Step 4: Remove `metrics` i18n namespace from both locale files**

In `en.json` and `ru.json`, delete the entire `"metrics": { ... }` block. Keep the new `datasets` keys added in Task 6.

**Step 5: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Metrics page, components, hooks, and navigation"
```

---

### Task 8: Full stack verification

**Files:** None (verification only)

**Step 1: Run all API tests**

```bash
cd api && uv run pytest tests/ -v --ignore=tests/integration
```

Expected: All tests PASS. If any test references `semantic_models` or `/api/semantic/`, delete that test file.

**Step 2: Run frontend build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds

**Step 3: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: No errors

**Step 4: Run API lint**

```bash
cd api && uv run ruff check .
```

Expected: No errors

**Step 5: Docker full rebuild and verify**

```bash
docker compose up --build -d
```

Wait for all containers healthy. Then:
- Open the app in browser
- Verify datasets page loads
- Verify metrics page returns 404
- Verify no "Metrics" in navigation
- Edit a dataset, verify tabs (General, Measures, Dimensions)
- Add a measure, verify persistence
- Add a dimension, verify persistence
- Open chart editor, verify no metrics tab in sidebar

**Step 6: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup after datasets/semantic models merge"
```
