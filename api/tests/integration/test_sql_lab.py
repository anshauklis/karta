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
