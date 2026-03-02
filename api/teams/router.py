"""Teams CRUD and membership management."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user, require_admin

router = APIRouter(tags=["teams"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class TeamCreate(BaseModel):
    name: str
    description: str = ""


class TeamUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class TeamResponse(BaseModel):
    id: int
    name: str
    description: str
    created_at: str | None = None
    member_count: int = 0


class MemberAdd(BaseModel):
    user_id: int
    role: str = "viewer"


class MemberUpdate(BaseModel):
    role: str


class TeamMemberResponse(BaseModel):
    id: int
    user_id: int
    team_id: int
    role: str
    user_name: str | None = None
    user_email: str | None = None


# ---------------------------------------------------------------------------
# Team CRUD
# ---------------------------------------------------------------------------

@router.get("/api/teams", response_model=list[TeamResponse], summary="List teams")
def list_teams(current_user: dict = Depends(get_current_user)):
    """List teams visible to the current user. Admins see all teams."""
    uid = int(current_user["sub"])
    is_admin = "admin" in current_user.get("roles", [])

    with engine.connect() as conn:
        if is_admin:
            rows = conn.execute(text("""
                SELECT t.*, COALESCE(mc.cnt, 0) AS member_count
                FROM teams t
                LEFT JOIN (
                    SELECT team_id, COUNT(*) AS cnt FROM team_members GROUP BY team_id
                ) mc ON mc.team_id = t.id
                ORDER BY t.name
            """))
        else:
            rows = conn.execute(text("""
                SELECT t.*, COALESCE(mc.cnt, 0) AS member_count
                FROM teams t
                INNER JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = :uid
                LEFT JOIN (
                    SELECT team_id, COUNT(*) AS cnt FROM team_members GROUP BY team_id
                ) mc ON mc.team_id = t.id
                ORDER BY t.name
            """), {"uid": uid})
        return [dict(r) for r in rows.mappings().all()]


@router.post("/api/teams", response_model=TeamResponse, summary="Create team")
def create_team(
    body: TeamCreate,
    current_user: dict = Depends(require_admin),
):
    """Create a new team (admin only)."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            INSERT INTO teams (name, description)
            VALUES (:name, :desc)
            RETURNING *
        """), {"name": body.name, "desc": body.description})
        conn.commit()
        result = dict(row.mappings().first())
        result["member_count"] = 0
        return result


@router.put("/api/teams/{team_id}", response_model=TeamResponse, summary="Update team")
def update_team(
    team_id: int,
    body: TeamUpdate,
    current_user: dict = Depends(require_admin),
):
    """Update team metadata (admin only)."""
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(400, "No fields to update")

    set_parts = [f"{k} = :{k}" for k in updates]
    updates["id"] = team_id

    with engine.connect() as conn:
        result = conn.execute(
            text(f"UPDATE teams SET {', '.join(set_parts)} WHERE id = :id"),
            updates,
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Team not found")
        conn.commit()

        row = conn.execute(text("""
            SELECT t.*, COALESCE(mc.cnt, 0) AS member_count
            FROM teams t
            LEFT JOIN (
                SELECT team_id, COUNT(*) AS cnt FROM team_members GROUP BY team_id
            ) mc ON mc.team_id = t.id
            WHERE t.id = :id
        """), {"id": team_id})
        return dict(row.mappings().first())


@router.delete("/api/teams/{team_id}", summary="Delete team")
def delete_team(
    team_id: int,
    current_user: dict = Depends(require_admin),
):
    """Delete a team and all its memberships (admin only)."""
    with engine.connect() as conn:
        result = conn.execute(
            text("DELETE FROM teams WHERE id = :id"), {"id": team_id}
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Team not found")
        conn.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

@router.get(
    "/api/teams/{team_id}/members",
    response_model=list[TeamMemberResponse],
    summary="List team members",
)
def list_members(team_id: int, current_user: dict = Depends(get_current_user)):
    """List all members of a team."""
    with engine.connect() as conn:
        # Verify team exists
        team = conn.execute(
            text("SELECT id FROM teams WHERE id = :id"), {"id": team_id}
        ).fetchone()
        if not team:
            raise HTTPException(404, "Team not found")

        rows = conn.execute(text("""
            SELECT tm.id, tm.user_id, tm.team_id, tm.role,
                   u.name AS user_name, u.email AS user_email
            FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = :tid
            ORDER BY u.name
        """), {"tid": team_id})
        return [dict(r) for r in rows.mappings().all()]


@router.post(
    "/api/teams/{team_id}/members",
    response_model=TeamMemberResponse,
    summary="Add team member",
)
def add_member(
    team_id: int,
    body: MemberAdd,
    current_user: dict = Depends(require_admin),
):
    """Add a user to a team with a given role (admin only)."""
    valid_roles = ("viewer", "editor", "admin", "owner")
    if body.role not in valid_roles:
        raise HTTPException(400, f"Invalid role. Must be one of: {', '.join(valid_roles)}")

    with engine.connect() as conn:
        # Verify team exists
        team = conn.execute(
            text("SELECT id FROM teams WHERE id = :id"), {"id": team_id}
        ).fetchone()
        if not team:
            raise HTTPException(404, "Team not found")

        # Verify user exists
        user = conn.execute(
            text("SELECT id FROM users WHERE id = :id"), {"id": body.user_id}
        ).fetchone()
        if not user:
            raise HTTPException(404, "User not found")

        try:
            row = conn.execute(text("""
                INSERT INTO team_members (team_id, user_id, role)
                VALUES (:tid, :uid, :role)
                RETURNING id, user_id, team_id, role
            """), {"tid": team_id, "uid": body.user_id, "role": body.role})
            conn.commit()
            member = dict(row.mappings().first())
        except Exception:
            raise HTTPException(409, "User is already a member of this team")

        # Fetch user info for response
        uinfo = conn.execute(
            text("SELECT name, email FROM users WHERE id = :id"),
            {"id": body.user_id},
        ).fetchone()
        member["user_name"] = uinfo[0] if uinfo else None
        member["user_email"] = uinfo[1] if uinfo else None
        return member


@router.put(
    "/api/teams/{team_id}/members/{user_id}",
    response_model=TeamMemberResponse,
    summary="Update member role",
)
def update_member_role(
    team_id: int,
    user_id: int,
    body: MemberUpdate,
    current_user: dict = Depends(require_admin),
):
    """Update a team member's role (admin only)."""
    valid_roles = ("viewer", "editor", "admin", "owner")
    if body.role not in valid_roles:
        raise HTTPException(400, f"Invalid role. Must be one of: {', '.join(valid_roles)}")

    with engine.connect() as conn:
        result = conn.execute(text("""
            UPDATE team_members SET role = :role
            WHERE team_id = :tid AND user_id = :uid
        """), {"role": body.role, "tid": team_id, "uid": user_id})
        if result.rowcount == 0:
            raise HTTPException(404, "Member not found")
        conn.commit()

        row = conn.execute(text("""
            SELECT tm.id, tm.user_id, tm.team_id, tm.role,
                   u.name AS user_name, u.email AS user_email
            FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = :tid AND tm.user_id = :uid
        """), {"tid": team_id, "uid": user_id})
        return dict(row.mappings().first())


@router.delete(
    "/api/teams/{team_id}/members/{user_id}",
    summary="Remove team member",
)
def remove_member(
    team_id: int,
    user_id: int,
    current_user: dict = Depends(require_admin),
):
    """Remove a user from a team (admin only)."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            DELETE FROM team_members WHERE team_id = :tid AND user_id = :uid
        """), {"tid": team_id, "uid": user_id})
        if result.rowcount == 0:
            raise HTTPException(404, "Member not found")
        conn.commit()
    return {"ok": True}
