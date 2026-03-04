"""Tests for dataset dimensions CRUD endpoints."""
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
