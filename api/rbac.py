"""Advanced RBAC: roles, teams, resource scoping."""

import logging
from sqlalchemy import text
from api.database import engine

logger = logging.getLogger("karta.rbac")

ROLES_HIERARCHY = {"viewer": 0, "editor": 1, "admin": 2, "owner": 3}


def get_user_role(user_id: int) -> str:
    """Get global role from users table."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT role FROM users WHERE id = :id"), {"id": user_id}
        ).fetchone()
        return row[0] if row else "viewer"


def get_team_role(user_id: int, team_id: int) -> str | None:
    """Get user's role in a specific team. Returns None if not a member."""
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT role FROM team_members WHERE user_id = :uid AND team_id = :tid"
            ),
            {"uid": user_id, "tid": team_id},
        ).fetchone()
        return row[0] if row else None


def can_access_resource(
    user_id: int, resource_type: str, resource_id: int
) -> bool:
    """Check if user can access a resource via team membership or is_public."""
    global_role = get_user_role(user_id)
    if ROLES_HIERARCHY.get(global_role, 0) >= ROLES_HIERARCHY["admin"]:
        return True  # admins/owners see everything

    table = {
        "dashboard": "dashboards",
        "connection": "connections",
        "dataset": "datasets",
    }.get(resource_type)
    if not table:
        return True  # unknown resource type, allow

    with engine.connect() as conn:
        # Only dashboards have is_public; connections/datasets do not (yet).
        if table == "dashboards":
            row = conn.execute(
                text(f"SELECT is_public, team_id FROM {table} WHERE id = :rid"),
                {"rid": resource_id},
            ).fetchone()
        else:
            row = conn.execute(
                text(f"SELECT TRUE AS is_public, team_id FROM {table} WHERE id = :rid"),
                {"rid": resource_id},
            ).fetchone()

        if not row:
            return False
        is_public, team_id = row[0], row[1]
        if is_public:
            return True
        if team_id is None:
            return True  # no team = public by default
        # Check team membership
        member = conn.execute(
            text(
                "SELECT 1 FROM team_members WHERE user_id = :uid AND team_id = :tid"
            ),
            {"uid": user_id, "tid": team_id},
        ).fetchone()
        return member is not None
