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
        assert resp.status_code == 201
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
