"""Audit log endpoints. Admin-only, requires 'audit' feature license."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user, require_admin
from api.license import require_feature

router = APIRouter(
    prefix="/api/audit",
    tags=["audit"],
    dependencies=[
        Depends(get_current_user),
        Depends(require_admin),
        Depends(require_feature("audit")),
    ],
)


@router.get("", summary="List audit events")
def list_audit_events(
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Return paginated audit log entries with optional filters."""
    conditions = []
    params: dict = {}

    if user_id is not None:
        conditions.append("a.user_id = :user_id")
        params["user_id"] = user_id
    if action:
        conditions.append("a.action = :action")
        params["action"] = action
    if resource_type:
        conditions.append("a.resource_type = :resource_type")
        params["resource_type"] = resource_type
    if from_date:
        conditions.append("a.created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        conditions.append("a.created_at <= :to_date")
        params["to_date"] = to_date

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    offset = (page - 1) * per_page
    params["limit"] = per_page
    params["offset"] = offset

    with engine.connect() as conn:
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM audit_log a {where}"),
            params,
        ).scalar()

        rows = conn.execute(
            text(f"""
                SELECT a.id, a.user_id, u.name AS user_name, a.action,
                       a.resource_type, a.resource_id, a.details,
                       a.ip_address, a.created_at
                FROM audit_log a
                LEFT JOIN users u ON u.id = a.user_id
                {where}
                ORDER BY a.created_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params,
        ).mappings().all()

    return {
        "items": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/stats", summary="Audit stats")
def audit_stats():
    """Aggregate action counts for the last 30 days."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT action, COUNT(*) AS count
            FROM audit_log
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY action
            ORDER BY count DESC
        """)).mappings().all()
    return [dict(r) for r in rows]
