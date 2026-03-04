"""Tests for dataset measures CRUD endpoints."""
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from api.main import app
from api.auth.dependencies import get_current_user

HEADERS = {"Authorization": "Bearer test-token"}
MOCK_USER = {"id": 1, "email": "test@test.com", "is_admin": False}


@pytest.fixture(autouse=True)
def mock_auth():
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def mock_db():
    with patch("api.datasets.router.engine") as mock_engine:
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = MagicMock(return_value=False)
        yield mock_conn


client = TestClient(app)


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
