# Expanded Integration Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add integration tests for the 5 core API areas (dashboards, connections, datasets, charts, sql-lab), bringing total integration test count from 6 to ~41.

**Architecture:** Session-scoped fixtures provide admin auth and a shared DuckDB connection. Each test creates its own entities via async helper functions for isolation. Tests use httpx AsyncClient with ASGITransport (in-process, no network).

**Tech Stack:** pytest + pytest-asyncio + httpx (async tests), starlette TestClient (sync session fixtures)

---

### Task 1: Expand integration conftest with shared fixtures and helpers

**Files:**
- Modify: `api/tests/integration/conftest.py`

**Step 1: Add session-scoped sync fixtures and async helpers**

Replace the entire `api/tests/integration/conftest.py` with:

```python
import os
import uuid
import pytest

# Skip all integration tests if no test database is available
_db_url = os.environ.get("TEST_DATABASE_URL", "")
if not _db_url and "CI" in os.environ:
    pytest.skip("No TEST_DATABASE_URL in CI", allow_module_level=True)

# Override DATABASE_URL for integration tests
if _db_url:
    os.environ["DATABASE_URL"] = _db_url

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-testing")
os.environ.setdefault("CONNECTION_SECRET", "test-connection-secret-32chars!!")

from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient

# Import app AFTER setting env vars
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from main import app
from database import ensure_schema


# ---------------------------------------------------------------------------
# Session-scoped fixtures (created once, shared across all integration tests)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create schema once for the test session."""
    ensure_schema()


@pytest.fixture(scope="session")
def sync_client():
    """Synchronous test client for session-scoped setup."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="session")
def admin_token(sync_client):
    """Register first user (auto-admin) and return JWT token."""
    email = "admin-integration@test.com"
    password = "AdminTest123!"
    resp = sync_client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "name": "Admin Integration",
    })
    if resp.status_code == 200:
        return resp.json()["access_token"]
    # Already exists from previous run — login
    resp = sync_client.post("/api/auth/login", json={
        "email": email,
        "password": password,
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    """Auth headers with admin JWT."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def connection_id(sync_client, admin_headers):
    """Get or create a DuckDB connection for testing."""
    # Try to find existing DuckDB connection (system or otherwise)
    resp = sync_client.get("/api/connections", headers=admin_headers)
    if resp.status_code == 200:
        for c in resp.json():
            if c.get("db_type") == "duckdb":
                return c["id"]
    # Create a DuckDB connection
    resp = sync_client.post("/api/connections", json={
        "name": f"Test DuckDB {uuid.uuid4().hex[:6]}",
        "db_type": "duckdb",
    }, headers=admin_headers)
    assert resp.status_code == 201, f"Failed to create DuckDB connection: {resp.text}"
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Function-scoped fixtures (per-test)
# ---------------------------------------------------------------------------

@pytest.fixture
async def client():
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_token(client: AsyncClient):
    """Register a regular (non-admin) test user and return auth token."""
    email = f"test-{uuid.uuid4().hex[:8]}@test.com"
    resp = await client.post("/api/auth/register", json={
        "email": email,
        "password": "TestPassword123!",
        "name": "Test User",
    })
    if resp.status_code == 200:
        return resp.json()["access_token"]
    resp = await client.post("/api/auth/login", json={
        "email": email,
        "password": "TestPassword123!",
    })
    return resp.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token: str):
    return {"Authorization": f"Bearer {auth_token}"}


# ---------------------------------------------------------------------------
# Async helper functions for creating test entities
# ---------------------------------------------------------------------------

async def create_dashboard(client: AsyncClient, headers: dict, **overrides) -> dict:
    """Create a dashboard and return its response dict."""
    data = {"title": f"Test Dashboard {uuid.uuid4().hex[:8]}", **overrides}
    resp = await client.post("/api/dashboards", json=data, headers=headers)
    assert resp.status_code == 201, f"create_dashboard failed: {resp.text}"
    return resp.json()


async def create_dataset(client: AsyncClient, headers: dict, conn_id: int, **overrides) -> dict:
    """Create a virtual dataset and return its response dict."""
    data = {
        "connection_id": conn_id,
        "name": f"test_dataset_{uuid.uuid4().hex[:8]}",
        "sql_query": "SELECT 1 AS id, 'hello' AS name",
        **overrides,
    }
    resp = await client.post("/api/datasets", json=data, headers=headers)
    assert resp.status_code == 201, f"create_dataset failed: {resp.text}"
    return resp.json()


async def create_chart(client: AsyncClient, headers: dict, **overrides) -> dict:
    """Create a standalone chart and return its response dict."""
    data = {"title": f"Test Chart {uuid.uuid4().hex[:8]}", **overrides}
    resp = await client.post("/api/charts", json=data, headers=headers)
    assert resp.status_code == 201, f"create_chart failed: {resp.text}"
    return resp.json()
```

**Step 2: Run existing auth tests to verify conftest changes don't break them**

Run: `cd api && uv run pytest tests/integration/test_auth.py -v`
Expected: 6 tests PASS

**Step 3: Commit**

```bash
git add api/tests/integration/conftest.py
git commit -m "test: expand integration conftest with admin fixtures and helpers"
```

---

### Task 2: Dashboard integration tests

**Files:**
- Create: `api/tests/integration/test_dashboards.py`

**Step 1: Write the tests**

Create `api/tests/integration/test_dashboards.py`:

```python
import pytest
from tests.integration.conftest import create_dashboard


@pytest.mark.asyncio
class TestDashboardEndpoints:
    async def test_create_dashboard(self, client, admin_headers):
        resp = await client.post("/api/dashboards", json={
            "title": "My Test Dashboard",
            "description": "A test dashboard",
            "icon": "🧪",
        }, headers=admin_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "My Test Dashboard"
        assert data["description"] == "A test dashboard"
        assert data["icon"] == "🧪"
        assert "id" in data
        assert "url_slug" in data
        assert data["chart_count"] == 0

    async def test_get_dashboard_by_id(self, client, admin_headers):
        dashboard = await create_dashboard(client, admin_headers)
        resp = await client.get(
            f"/api/dashboards/{dashboard['id']}", headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == dashboard["id"]
        assert resp.json()["title"] == dashboard["title"]

    async def test_get_dashboard_by_slug(self, client, admin_headers):
        dashboard = await create_dashboard(client, admin_headers, title="Slug Lookup Test")
        slug = dashboard["url_slug"]
        resp = await client.get(
            f"/api/dashboards/by-slug/{slug}", headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["url_slug"] == slug

    async def test_list_dashboards(self, client, admin_headers):
        await create_dashboard(client, admin_headers)
        resp = await client.get("/api/dashboards", headers=admin_headers)
        assert resp.status_code == 200
        dashboards = resp.json()
        assert isinstance(dashboards, list)
        assert len(dashboards) >= 1

    async def test_update_dashboard(self, client, admin_headers):
        dashboard = await create_dashboard(client, admin_headers)
        resp = await client.put(
            f"/api/dashboards/{dashboard['id']}",
            json={"title": "Updated Title", "description": "Updated desc"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Updated Title"
        assert data["description"] == "Updated desc"

    async def test_clone_dashboard(self, client, admin_headers):
        dashboard = await create_dashboard(client, admin_headers, title="Original")
        resp = await client.post(
            f"/api/dashboards/{dashboard['id']}/clone", headers=admin_headers,
        )
        assert resp.status_code == 200
        clone = resp.json()
        assert clone["id"] != dashboard["id"]
        assert "Copy of Original" in clone["title"]

    async def test_delete_dashboard(self, client, admin_headers):
        dashboard = await create_dashboard(client, admin_headers)
        resp = await client.delete(
            f"/api/dashboards/{dashboard['id']}", headers=admin_headers,
        )
        assert resp.status_code == 204
        # Verify it's gone (soft-deleted, should return 404)
        resp = await client.get(
            f"/api/dashboards/{dashboard['id']}", headers=admin_headers,
        )
        assert resp.status_code == 404

    async def test_get_nonexistent_dashboard(self, client, admin_headers):
        resp = await client.get("/api/dashboards/999999", headers=admin_headers)
        assert resp.status_code == 404
```

**Step 2: Run the tests**

Run: `cd api && uv run pytest tests/integration/test_dashboards.py -v`
Expected: 8 tests PASS

**Step 3: Commit**

```bash
git add api/tests/integration/test_dashboards.py
git commit -m "test: add dashboard integration tests (8 tests)"
```

---

### Task 3: Connection integration tests

**Files:**
- Create: `api/tests/integration/test_connections.py`

**Step 1: Write the tests**

Create `api/tests/integration/test_connections.py`:

```python
import uuid
import pytest


@pytest.mark.asyncio
class TestConnectionEndpoints:
    async def test_list_engine_specs(self, client, admin_headers):
        resp = await client.get("/api/connections/engine-specs", headers=admin_headers)
        assert resp.status_code == 200
        specs = resp.json()
        assert isinstance(specs, list)
        assert len(specs) >= 1
        # Every spec should have db_type and display_name
        for spec in specs:
            assert "db_type" in spec
            assert "display_name" in spec

    async def test_create_connection_requires_admin(self, client, auth_headers):
        """Regular user cannot create connections."""
        resp = await client.post("/api/connections", json={
            "name": "Should Fail",
            "db_type": "postgresql",
        }, headers=auth_headers)
        assert resp.status_code == 403

    async def test_create_connection(self, client, admin_headers):
        name = f"Test Conn {uuid.uuid4().hex[:6]}"
        resp = await client.post("/api/connections", json={
            "name": name,
            "db_type": "duckdb",
        }, headers=admin_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == name
        assert data["db_type"] == "duckdb"
        assert "id" in data

    async def test_list_connections(self, client, admin_headers):
        resp = await client.get("/api/connections", headers=admin_headers)
        assert resp.status_code == 200
        connections = resp.json()
        assert isinstance(connections, list)
        assert len(connections) >= 1

    async def test_delete_connection(self, client, admin_headers):
        # Create a connection to delete
        resp = await client.post("/api/connections", json={
            "name": f"To Delete {uuid.uuid4().hex[:6]}",
            "db_type": "duckdb",
        }, headers=admin_headers)
        assert resp.status_code == 201
        conn_id = resp.json()["id"]

        resp = await client.delete(
            f"/api/connections/{conn_id}", headers=admin_headers,
        )
        assert resp.status_code == 204

    async def test_delete_system_connection_forbidden(self, client, admin_headers):
        """System connections cannot be deleted."""
        # Find a system connection
        resp = await client.get("/api/connections", headers=admin_headers)
        system_conns = [c for c in resp.json() if c.get("is_system")]
        if not system_conns:
            pytest.skip("No system connection found")
        resp = await client.delete(
            f"/api/connections/{system_conns[0]['id']}", headers=admin_headers,
        )
        assert resp.status_code == 403
```

**Step 2: Run the tests**

Run: `cd api && uv run pytest tests/integration/test_connections.py -v`
Expected: 6 tests PASS (or 5 + 1 skip if no system connection)

**Step 3: Commit**

```bash
git add api/tests/integration/test_connections.py
git commit -m "test: add connection integration tests (6 tests)"
```

---

### Task 4: Dataset integration tests

**Files:**
- Create: `api/tests/integration/test_datasets.py`

**Step 1: Write the tests**

Create `api/tests/integration/test_datasets.py`:

```python
import uuid
import pytest
from tests.integration.conftest import create_dataset


@pytest.mark.asyncio
class TestDatasetEndpoints:
    async def test_create_virtual_dataset(self, client, admin_headers, connection_id):
        name = f"test_ds_{uuid.uuid4().hex[:8]}"
        resp = await client.post("/api/datasets", json={
            "connection_id": connection_id,
            "name": name,
            "sql_query": "SELECT 1 AS id, 'hello' AS name",
        }, headers=admin_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == name
        assert data["connection_id"] == connection_id
        assert "id" in data

    async def test_get_dataset(self, client, admin_headers, connection_id):
        dataset = await create_dataset(client, admin_headers, connection_id)
        resp = await client.get(
            f"/api/datasets/{dataset['id']}", headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == dataset["id"]
        assert resp.json()["name"] == dataset["name"]

    async def test_list_datasets(self, client, admin_headers, connection_id):
        await create_dataset(client, admin_headers, connection_id)
        resp = await client.get("/api/datasets", headers=admin_headers)
        assert resp.status_code == 200
        datasets = resp.json()
        assert isinstance(datasets, list)
        assert len(datasets) >= 1

    async def test_update_dataset(self, client, admin_headers, connection_id):
        dataset = await create_dataset(client, admin_headers, connection_id)
        resp = await client.put(
            f"/api/datasets/{dataset['id']}",
            json={"name": f"updated_{uuid.uuid4().hex[:8]}"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["name"].startswith("updated_")

    async def test_preview_dataset(self, client, admin_headers, connection_id):
        dataset = await create_dataset(
            client, admin_headers, connection_id,
            sql_query="SELECT 42 AS answer",
        )
        resp = await client.post(
            f"/api/datasets/{dataset['id']}/preview", headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "columns" in data
        assert "rows" in data
        assert data["row_count"] >= 1

    async def test_get_dataset_columns(self, client, admin_headers, connection_id):
        dataset = await create_dataset(
            client, admin_headers, connection_id,
            sql_query="SELECT 1 AS col_a, 'text' AS col_b",
        )
        resp = await client.get(
            f"/api/datasets/{dataset['id']}/columns", headers=admin_headers,
        )
        assert resp.status_code == 200
        columns = resp.json()["columns"]
        col_names = [c["name"] for c in columns]
        assert "col_a" in col_names
        assert "col_b" in col_names

    async def test_create_duplicate_name_fails(self, client, admin_headers, connection_id):
        name = f"unique_ds_{uuid.uuid4().hex[:8]}"
        await create_dataset(client, admin_headers, connection_id, name=name)
        # Second dataset with same name should fail
        resp = await client.post("/api/datasets", json={
            "connection_id": connection_id,
            "name": name,
            "sql_query": "SELECT 1",
        }, headers=admin_headers)
        assert resp.status_code in (400, 409, 500)  # DB unique constraint
```

**Step 2: Run the tests**

Run: `cd api && uv run pytest tests/integration/test_datasets.py -v`
Expected: 7 tests PASS

**Step 3: Commit**

```bash
git add api/tests/integration/test_datasets.py
git commit -m "test: add dataset integration tests (7 tests)"
```

---

### Task 5: Chart integration tests

**Files:**
- Create: `api/tests/integration/test_charts.py`

**Step 1: Write the tests**

Create `api/tests/integration/test_charts.py`:

```python
import uuid
import pytest
from tests.integration.conftest import create_dashboard, create_chart


@pytest.mark.asyncio
class TestChartEndpoints:
    async def test_create_standalone_chart(self, client, admin_headers):
        resp = await client.post("/api/charts", json={
            "title": f"Standalone {uuid.uuid4().hex[:6]}",
        }, headers=admin_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["dashboard_id"] is None

    async def test_create_chart_on_dashboard(self, client, admin_headers):
        dashboard = await create_dashboard(client, admin_headers)
        resp = await client.post(
            f"/api/dashboards/{dashboard['id']}/charts",
            json={"title": f"On Dash {uuid.uuid4().hex[:6]}"},
            headers=admin_headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["dashboard_id"] == dashboard["id"]

    async def test_get_chart(self, client, admin_headers):
        chart = await create_chart(client, admin_headers)
        resp = await client.get(
            f"/api/charts/{chart['id']}", headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == chart["id"]

    async def test_update_chart(self, client, admin_headers):
        chart = await create_chart(client, admin_headers)
        resp = await client.put(
            f"/api/charts/{chart['id']}",
            json={"title": "Updated Chart Title"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Chart Title"

    async def test_list_all_charts(self, client, admin_headers):
        await create_chart(client, admin_headers)
        resp = await client.get("/api/charts", headers=admin_headers)
        assert resp.status_code == 200
        charts = resp.json()
        assert isinstance(charts, list)
        assert len(charts) >= 1

    async def test_execute_chart(self, client, admin_headers, connection_id):
        chart = await create_chart(client, admin_headers,
            connection_id=connection_id,
            sql_query="SELECT 1 AS value, 2 AS count",
            chart_type="table",
            mode="visual",
        )
        resp = await client.post(
            f"/api/charts/{chart['id']}/execute",
            json={"force": True},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("error") is None, f"Chart execute error: {data.get('error')}"
        assert data["row_count"] >= 1

    async def test_preview_chart(self, client, admin_headers, connection_id):
        resp = await client.post("/api/charts/preview", json={
            "connection_id": connection_id,
            "sql_query": "SELECT 1 AS x, 2 AS y",
            "chart_type": "table",
            "mode": "visual",
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("error") is None, f"Preview error: {data.get('error')}"
        assert data["row_count"] >= 1

    async def test_duplicate_chart(self, client, admin_headers):
        chart = await create_chart(client, admin_headers, title="Original Chart")
        resp = await client.post(
            f"/api/charts/{chart['id']}/duplicate",
            headers=admin_headers,
        )
        assert resp.status_code == 201
        clone = resp.json()
        assert clone["id"] != chart["id"]
        assert "Original Chart" in clone["title"]

    async def test_delete_chart(self, client, admin_headers):
        chart = await create_chart(client, admin_headers)
        resp = await client.delete(
            f"/api/charts/{chart['id']}", headers=admin_headers,
        )
        assert resp.status_code == 204
        # Verify it's gone
        resp = await client.get(
            f"/api/charts/{chart['id']}", headers=admin_headers,
        )
        assert resp.status_code == 404

    async def test_bulk_delete_charts(self, client, admin_headers):
        c1 = await create_chart(client, admin_headers)
        c2 = await create_chart(client, admin_headers)
        resp = await client.post("/api/charts/bulk-delete", json={
            "ids": [c1["id"], c2["id"]],
        }, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["deleted"] == 2
```

**Step 2: Run the tests**

Run: `cd api && uv run pytest tests/integration/test_charts.py -v`
Expected: 10 tests PASS

**Step 3: Commit**

```bash
git add api/tests/integration/test_charts.py
git commit -m "test: add chart integration tests (10 tests)"
```

---

### Task 6: SQL Lab integration tests

**Files:**
- Create: `api/tests/integration/test_sql_lab.py`

**Step 1: Write the tests**

Create `api/tests/integration/test_sql_lab.py`:

```python
import pytest


@pytest.mark.asyncio
class TestSQLLabEndpoints:
    async def test_execute_valid_sql(self, client, admin_headers, connection_id):
        resp = await client.post("/api/sql/execute", json={
            "connection_id": connection_id,
            "sql": "SELECT 42 AS answer, 'hello' AS greeting",
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "columns" in data
        assert "rows" in data
        assert data["row_count"] == 1
        assert 42 in data["rows"][0]

    async def test_execute_invalid_sql_blocked(self, client, admin_headers, connection_id):
        """Non-SELECT statements should be blocked by validator."""
        resp = await client.post("/api/sql/execute", json={
            "connection_id": connection_id,
            "sql": "DROP TABLE users",
        }, headers=admin_headers)
        assert resp.status_code == 400

    async def test_validate_sql_endpoint(self, client, admin_headers, connection_id):
        resp = await client.post("/api/sql/validate", json={
            "connection_id": connection_id,
            "sql": "SELECT 1 AS id",
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["error"] is None

    async def test_validate_invalid_sql(self, client, admin_headers, connection_id):
        resp = await client.post("/api/sql/validate", json={
            "connection_id": connection_id,
            "sql": "INSERT INTO x VALUES (1)",
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert data["error"] is not None
```

**Step 2: Run the tests**

Run: `cd api && uv run pytest tests/integration/test_sql_lab.py -v`
Expected: 4 tests PASS

**Step 3: Commit**

```bash
git add api/tests/integration/test_sql_lab.py
git commit -m "test: add SQL Lab integration tests (4 tests)"
```

---

### Task 7: Run all tests and verify

**Step 1: Run all backend unit tests**

Run: `cd api && uv run pytest tests/ -v --tb=short --ignore=tests/integration`
Expected: ~69 unit tests PASS

**Step 2: Run all integration tests**

Run: `cd api && uv run pytest tests/integration/ -v --tb=short`
Expected: ~41 integration tests PASS (6 auth + 8 dashboard + 6 connection + 7 dataset + 10 chart + 4 sql-lab)

**Step 3: Run everything together**

Run: `cd api && uv run pytest tests/ -v --tb=short`
Expected: ~110 tests PASS

**Step 4: Commit docs update**

```bash
git add -A
git commit -m "test: verify expanded integration test suite (35 new tests)"
```

---

## Summary

| Task | Area | Tests | What |
|------|------|-------|------|
| 1 | Infra | 0 | Expand conftest with admin fixtures + helpers |
| 2 | Dashboards | 8 | CRUD + clone + slug lookup + 404 |
| 3 | Connections | 6 | Engine specs + CRUD + admin-only + system protection |
| 4 | Datasets | 7 | CRUD + preview + columns + unique constraint |
| 5 | Charts | 10 | CRUD + execute + preview + duplicate + bulk-delete |
| 6 | SQL Lab | 4 | Execute + validate + blocked SQL |
| 7 | Verify | 0 | Run all ~110 tests |

**Total new: ~35 integration tests, bringing total backend tests to ~110**
