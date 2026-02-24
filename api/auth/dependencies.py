"""FastAPI dependencies for authentication."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from api.auth.jwt import decode_token

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate current user from Bearer token."""
    try:
        return decode_token(credentials.credentials)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Require the current user to be an admin (via roles)."""
    if "admin" not in current_user.get("roles", []):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_role(*roles: str):
    """Dependency factory: require at least one of the given roles."""
    def dependency(current_user: dict = Depends(get_current_user)) -> dict:
        user_roles = current_user.get("roles", [])
        if not any(r in user_roles for r in roles):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return Depends(dependency)


def has_role(user: dict, role: str) -> bool:
    """Check if a user has a specific role."""
    return role in user.get("roles", [])


def check_ownership(conn, table: str, resource_id: int, user: dict, id_col: str = "id") -> None:
    """Verify the current user owns the resource or is admin. Raises 404/403."""
    from sqlalchemy import text
    row = conn.execute(
        text(f"SELECT created_by FROM {table} WHERE {id_col} = :id"),
        {"id": resource_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if row[0] != int(user["sub"]) and not has_role(user, "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
