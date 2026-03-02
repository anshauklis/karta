import pytest


@pytest.mark.asyncio
class TestAuthEndpoints:
    async def test_setup_status(self, client):
        resp = await client.get("/api/auth/setup-status")
        assert resp.status_code == 200
        data = resp.json()
        assert "needs_setup" in data

    async def test_register_returns_token(self, client):
        import uuid
        email = f"reg-{uuid.uuid4().hex[:8]}@test.com"
        resp = await client.post("/api/auth/register", json={
            "email": email,
            "password": "StrongPass123!",
            "name": "New User",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data

    async def test_login_with_valid_credentials(self, client):
        import uuid
        email = f"login-{uuid.uuid4().hex[:8]}@test.com"
        # Register first
        await client.post("/api/auth/register", json={
            "email": email,
            "password": "TestPass123!",
            "name": "Login Test",
        })
        # Then login
        resp = await client.post("/api/auth/login", json={
            "email": email,
            "password": "TestPass123!",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_login_with_wrong_password(self, client):
        import uuid
        email = f"wrongpw-{uuid.uuid4().hex[:8]}@test.com"
        await client.post("/api/auth/register", json={
            "email": email,
            "password": "CorrectPass1!",
            "name": "Wrong PW",
        })
        resp = await client.post("/api/auth/login", json={
            "email": email,
            "password": "WrongPassword!",
        })
        assert resp.status_code == 401

    async def test_me_requires_auth(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    async def test_me_returns_user_info(self, client, auth_headers):
        resp = await client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data
        assert "id" in data
