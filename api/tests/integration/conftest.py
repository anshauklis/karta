import os
import uuid
import pytest
import pytest_asyncio

# Skip all integration tests if no test database is available
_db_url = os.environ.get("TEST_DATABASE_URL", "")
if not _db_url and "CI" in os.environ:
    pytest.skip("No TEST_DATABASE_URL in CI", allow_module_level=True)

# Override DATABASE_URL for integration tests
# The root tests/conftest.py sets DATABASE_URL=sqlite:// for unit tests,
# so we must explicitly set a PostgreSQL URL for integration tests.
_default_pg = "postgresql://karta:karta@localhost:5432/karta"
os.environ["DATABASE_URL"] = _db_url or _default_pg

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-testing")
os.environ.setdefault("CONNECTION_SECRET", "test-connection-secret-32chars!!")

from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient

# Import app AFTER setting env vars
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from main import app
from database import engine, ensure_schema
from auth.router import _hash_password
from sqlalchemy import text


# ---------------------------------------------------------------------------
# Session-scoped fixtures (created once, shared across all integration tests)
# ---------------------------------------------------------------------------

_ADMIN_EMAIL = "admin-integration@test.com"
_ADMIN_PASSWORD = "AdminTest123!"


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create schema once for the test session."""
    ensure_schema()
    # Ensure admin user exists (insert directly to avoid race with register endpoint)
    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": _ADMIN_EMAIL},
        ).fetchone()
        if not existing:
            password_hash = _hash_password(_ADMIN_PASSWORD)
            conn.execute(
                text("""
                    INSERT INTO users (email, name, password_hash, is_admin)
                    VALUES (:email, :name, :hash, TRUE)
                """),
                {"email": _ADMIN_EMAIL, "name": "Admin Integration", "hash": password_hash},
            )
            # Get the user id
            user_id = conn.execute(
                text("SELECT id FROM users WHERE email = :email"),
                {"email": _ADMIN_EMAIL},
            ).scalar()
            for role in ("admin", "editor", "viewer", "sql_lab"):
                conn.execute(
                    text("INSERT INTO user_roles (user_id, role) VALUES (:uid, :role)"),
                    {"uid": user_id, "role": role},
                )
            conn.commit()


@pytest.fixture(scope="session")
def sync_client():
    """Synchronous test client for session-scoped setup."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="session")
def admin_token(sync_client):
    """Login as the pre-created admin user and return JWT token."""
    resp = sync_client.post("/api/auth/login", json={
        "email": _ADMIN_EMAIL,
        "password": _ADMIN_PASSWORD,
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

@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_token(client: AsyncClient, admin_token: str):
    """Create a regular (non-admin) test user via admin API and return auth token."""
    email = f"test-{uuid.uuid4().hex[:8]}@test.com"
    password = "TestPassword123!"
    # Create user via admin endpoint
    resp = await client.post("/api/admin/users", json={
        "email": email,
        "password": password,
        "name": "Test User",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 201, f"Failed to create test user: {resp.text}"
    # Login as the new user to get their token
    resp = await client.post("/api/auth/login", json={
        "email": email,
        "password": password,
    })
    assert resp.status_code == 200, f"Failed to login test user: {resp.text}"
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
