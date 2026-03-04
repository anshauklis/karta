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
