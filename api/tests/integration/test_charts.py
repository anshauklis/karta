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
