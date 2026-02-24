import os
import httpx

API_URL = os.environ.get("KARTA_API_URL", "http://api:8000")
EMAIL = os.environ.get("KARTA_EMAIL", "")
PASSWORD = os.environ.get("KARTA_PASSWORD", "")
TIMEOUT = 30.0

_token: str | None = None


async def _login() -> str:
    """Authenticate with the API and return JWT token."""
    async with httpx.AsyncClient(base_url=API_URL, timeout=TIMEOUT) as c:
        resp = await c.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        resp.raise_for_status()
        return resp.json()["access_token"]


async def _get_token() -> str:
    global _token
    if _token is None:
        _token = await _login()
    return _token


async def _request(method: str, path: str, **kwargs) -> dict | list:
    """Make an authenticated API request with auto-retry on 401."""
    global _token
    token = await _get_token()

    async with httpx.AsyncClient(base_url=API_URL, timeout=TIMEOUT) as c:
        headers = {"Authorization": f"Bearer {token}"}
        resp = await c.request(method, path, headers=headers, **kwargs)

        # Token expired — re-login and retry once
        if resp.status_code == 401:
            _token = await _login()
            headers = {"Authorization": f"Bearer {_token}"}
            resp = await c.request(method, path, headers=headers, **kwargs)

        resp.raise_for_status()
        return resp.json()


async def get(path: str, **params) -> dict | list:
    return await _request("GET", path, params=params)


async def post(path: str, data: dict | None = None) -> dict | list:
    return await _request("POST", path, json=data)


async def put(path: str, data: dict | None = None) -> dict | list:
    return await _request("PUT", path, json=data)


async def patch(path: str, data: dict | None = None) -> dict | list:
    return await _request("PATCH", path, json=data)


async def delete(path: str) -> None:
    """Delete resource. Returns None (204 No Content)."""
    global _token
    token = await _get_token()

    async with httpx.AsyncClient(base_url=API_URL, timeout=TIMEOUT) as c:
        headers = {"Authorization": f"Bearer {token}"}
        resp = await c.request("DELETE", path, headers=headers)

        if resp.status_code == 401:
            _token = await _login()
            headers = {"Authorization": f"Bearer {_token}"}
            resp = await c.request("DELETE", path, headers=headers)

        resp.raise_for_status()
