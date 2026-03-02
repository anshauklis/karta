import os
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

# Import app AFTER setting env vars
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from main import app
from database import ensure_schema


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create schema once for the test session."""
    ensure_schema()


@pytest.fixture
async def client():
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_token(client: AsyncClient):
    """Register a test user and return auth token."""
    import uuid
    email = f"test-{uuid.uuid4().hex[:8]}@test.com"
    resp = await client.post("/api/auth/register", json={
        "email": email,
        "password": "TestPassword123!",
        "name": "Test User",
    })
    if resp.status_code == 200:
        return resp.json()["access_token"]
    # If registration failed, try login
    resp = await client.post("/api/auth/login", json={
        "email": email,
        "password": "TestPassword123!",
    })
    return resp.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token: str):
    return {"Authorization": f"Bearer {auth_token}"}
