from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy import text
import bcrypt as _bcrypt
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.database import engine
from api.models import (
    RegisterRequest, LoginRequest, TokenResponse, UserResponse, SetupStatus,
    UserCreate, UserUpdate, RoleUpdate,
)
from api.auth.jwt import encode_token
from api.auth.dependencies import get_current_user, require_admin


def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def _verify_password(password: str, password_hash: str) -> bool:
    return _bcrypt.checkpw(password.encode(), password_hash.encode())

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api", tags=["auth"])


@router.get("/setup/status", response_model=SetupStatus, summary="Check setup status")
def setup_status():
    """Check if initial admin setup is needed. Returns true if no users exist."""
    with engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM users"))
        count = result.scalar()
    return SetupStatus(needs_setup=count == 0)


@router.post("/auth/register", response_model=TokenResponse, summary="Register first admin")
@limiter.limit("5/minute")
def register(req: RegisterRequest, request: Request):
    """Register the initial admin user. Only works when no users exist in the system."""
    password_hash = _hash_password(req.password)
    with engine.connect() as conn:
        # Atomic insert: only succeeds if no users exist (prevents race condition)
        result = conn.execute(
            text("""
                INSERT INTO users (email, name, password_hash, is_admin)
                SELECT :email, :name, :password_hash, TRUE
                WHERE NOT EXISTS (SELECT 1 FROM users)
                RETURNING id, email, name, is_admin
            """),
            {"email": req.email, "name": req.name, "password_hash": password_hash}
        )
        user = result.mappings().fetchone()
        if not user:
            raise HTTPException(status_code=403, detail="Setup already completed")

        # First admin gets all 4 roles
        role_list = ["admin", "editor", "viewer", "sql_lab"]
        for role in role_list:
            conn.execute(
                text("INSERT INTO user_roles (user_id, role) VALUES (:uid, :role)"),
                {"uid": user["id"], "role": role}
            )
        conn.commit()

    token = encode_token({
        "sub": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "is_admin": True,
        "roles": role_list,
    })
    return TokenResponse(access_token=token)


@router.post("/auth/login", response_model=TokenResponse, summary="Login")
@limiter.limit("10/minute")
def login(req: LoginRequest, request: Request):
    """Authenticate with email and password. Returns a JWT access token valid for 24 hours."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, email, name, password_hash, is_admin FROM users WHERE email = :email"),
            {"email": req.email}
        )
        user = result.mappings().fetchone()

        if not user or not _verify_password(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Fetch roles from user_roles table
        roles_result = conn.execute(
            text("SELECT role FROM user_roles WHERE user_id = :uid"),
            {"uid": user["id"]}
        )
        role_list = [r[0] for r in roles_result.fetchall()]

    token = encode_token({
        "sub": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "is_admin": "admin" in role_list,
        "roles": role_list,
    })
    return TokenResponse(access_token=token)


@router.get("/auth/me", response_model=UserResponse, summary="Get current user")
def me(current_user: dict = Depends(get_current_user)):
    """Get the profile of the currently authenticated user."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, email, name, is_admin, COALESCE(groups, '') as groups, created_at FROM users WHERE id = :id"),
            {"id": int(current_user["sub"])}
        )
        user = result.mappings().fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user = dict(user)

        roles_result = conn.execute(
            text("SELECT role FROM user_roles WHERE user_id = :uid"),
            {"uid": user["id"]}
        )
        user["roles"] = sorted([r[0] for r in roles_result.fetchall()])
    return user


# --- User listing (non-admin, for multi-select pickers) ---


@router.get("/users/list", summary="List users (basic)")
def list_users_basic(current_user: dict = Depends(get_current_user)):
    """List all users with basic info (id, name, email). Available to all authenticated users."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, email, name FROM users ORDER BY name")
        )
        return [dict(u) for u in result.mappings().all()]


# --- Admin user management ---


@router.get("/admin/users", response_model=list[UserResponse], summary="List users (admin)")
def list_users(current_user: dict = Depends(require_admin)):
    """List all users with full details. Admin only."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, email, name, is_admin, COALESCE(groups, '') as groups, created_at FROM users ORDER BY id")
        )
        users = [dict(u) for u in result.mappings().fetchall()]

        if users:
            user_ids = [u["id"] for u in users]
            roles_result = conn.execute(
                text("SELECT user_id, role FROM user_roles WHERE user_id = ANY(:ids)"),
                {"ids": user_ids}
            )
            roles_by_user = {}
            for r in roles_result.mappings().all():
                roles_by_user.setdefault(r["user_id"], []).append(r["role"])
            for u in users:
                u["roles"] = sorted(roles_by_user.get(u["id"], []))
    return users


@router.post("/admin/users", response_model=UserResponse, status_code=201, summary="Create user")
def create_user(req: UserCreate, current_user: dict = Depends(require_admin)):
    """Create a new user account. Admin only."""
    password_hash = _hash_password(req.password)
    with engine.connect() as conn:
        # Check for duplicate email
        existing = conn.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": req.email}
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        # Determine is_admin from roles if provided, otherwise from req.is_admin
        _VALID_ROLES = {"admin", "editor", "viewer", "sql_lab"}
        role_list = req.roles if req.roles is not None else (
            ["admin", "editor", "viewer", "sql_lab"] if req.is_admin else ["editor", "viewer", "sql_lab"]
        )
        if not set(role_list) <= _VALID_ROLES:
            raise HTTPException(400, f"Invalid roles. Valid: {_VALID_ROLES}")
        is_admin = "admin" in role_list

        result = conn.execute(
            text("""
                INSERT INTO users (email, name, password_hash, is_admin, groups)
                VALUES (:email, :name, :password_hash, :is_admin, :groups)
                RETURNING id, email, name, is_admin, COALESCE(groups, '') as groups, created_at
            """),
            {
                "email": req.email,
                "name": req.name,
                "password_hash": password_hash,
                "is_admin": is_admin,
                "groups": req.groups,
            }
        )
        user = dict(result.mappings().fetchone())

        # Insert roles into user_roles
        for role in set(role_list):
            conn.execute(
                text("INSERT INTO user_roles (user_id, role) VALUES (:uid, :role)"),
                {"uid": user["id"], "role": role}
            )

        conn.commit()
        user["roles"] = sorted(role_list)
    return user


@router.put("/admin/users/{user_id}", response_model=UserResponse, summary="Update user")
def update_user(user_id: int, req: UserUpdate, current_user: dict = Depends(require_admin)):
    """Update user details (name, email, password, admin status, roles). Admin only."""
    with engine.connect() as conn:
        # Verify user exists
        existing = conn.execute(
            text("SELECT id FROM users WHERE id = :id"),
            {"id": user_id}
        ).mappings().fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        # Build SET clause dynamically from provided fields
        fields = {}
        if req.name is not None:
            fields["name"] = req.name
        if req.email is not None:
            fields["email"] = req.email
        if req.password is not None:
            fields["password_hash"] = _hash_password(req.password)
        if req.is_admin is not None:
            fields["is_admin"] = req.is_admin
        if req.groups is not None:
            fields["groups"] = req.groups

        # If roles provided, validate and sync is_admin from roles
        if req.roles is not None:
            _VALID_ROLES = {"admin", "editor", "viewer", "sql_lab"}
            if not set(req.roles) <= _VALID_ROLES:
                raise HTTPException(400, f"Invalid roles. Valid: {_VALID_ROLES}")
            if str(user_id) == current_user["sub"] and "admin" not in req.roles:
                raise HTTPException(400, "Cannot remove your own admin role")
            fields["is_admin"] = "admin" in req.roles

        if not fields and req.roles is None:
            raise HTTPException(status_code=400, detail="No fields to update")

        if fields:
            # Only allow known column names (defense-in-depth)
            _ALLOWED_USER_FIELDS = {"name", "email", "password_hash", "is_admin", "groups"}
            if not fields.keys() <= _ALLOWED_USER_FIELDS:
                raise HTTPException(status_code=400, detail="Invalid fields")

            set_clause = ", ".join(f"{k} = :{k}" for k in fields)
            fields["id"] = user_id

            conn.execute(
                text(f"UPDATE users SET {set_clause} WHERE id = :id"),
                fields
            )

        # Handle role updates
        if req.roles is not None:
            conn.execute(text("DELETE FROM user_roles WHERE user_id = :uid"), {"uid": user_id})
            for role in set(req.roles):
                conn.execute(
                    text("INSERT INTO user_roles (user_id, role) VALUES (:uid, :role)"),
                    {"uid": user_id, "role": role}
                )

        # Fetch updated user with roles
        result = conn.execute(
            text("SELECT id, email, name, is_admin, COALESCE(groups, '') as groups, created_at FROM users WHERE id = :id"),
            {"id": user_id}
        )
        user = dict(result.mappings().fetchone())

        roles_result = conn.execute(
            text("SELECT role FROM user_roles WHERE user_id = :uid"),
            {"uid": user_id}
        )
        user["roles"] = sorted([r[0] for r in roles_result.fetchall()])

        conn.commit()
    return user


@router.get("/admin/users/{user_id}/roles", summary="Get user roles")
def get_user_roles(user_id: int, current_user: dict = Depends(require_admin)):
    """Get roles for a specific user. Admin only."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT role FROM user_roles WHERE user_id = :uid"),
            {"uid": user_id}
        )
        return {"roles": sorted([r[0] for r in result.fetchall()])}


@router.put("/admin/users/{user_id}/roles", summary="Set user roles")
def set_user_roles(user_id: int, body: RoleUpdate, current_user: dict = Depends(require_admin)):
    """Replace all roles for a specific user. Admin only."""
    valid = {"admin", "editor", "viewer", "sql_lab"}
    if not set(body.roles) <= valid:
        raise HTTPException(400, f"Invalid roles. Valid: {valid}")

    # Block admin from removing own admin role
    if str(user_id) == current_user["sub"] and "admin" not in body.roles:
        raise HTTPException(400, "Cannot remove your own admin role")

    with engine.connect() as conn:
        conn.execute(text("DELETE FROM user_roles WHERE user_id = :uid"), {"uid": user_id})
        for role in set(body.roles):
            conn.execute(
                text("INSERT INTO user_roles (user_id, role) VALUES (:uid, :role)"),
                {"uid": user_id, "role": role}
            )
        # Sync is_admin column
        conn.execute(
            text("UPDATE users SET is_admin = :is_admin WHERE id = :uid"),
            {"uid": user_id, "is_admin": "admin" in body.roles}
        )
        conn.commit()
    return {"roles": sorted(body.roles)}


@router.delete("/admin/users/{user_id}", status_code=204, summary="Delete user")
def delete_user(user_id: int, current_user: dict = Depends(require_admin)):
    """Delete a user account. Admin only."""
    if str(user_id) == current_user["sub"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    with engine.connect() as conn:
        result = conn.execute(
            text("DELETE FROM users WHERE id = :id RETURNING id"),
            {"id": user_id}
        )
        deleted = result.fetchone()
        if not deleted:
            raise HTTPException(status_code=404, detail="User not found")
        conn.commit()
