from fastapi import APIRouter, Depends
from sqlalchemy import text

from api.database import engine
from api.models import PopularContentItem, UserActivityItem, DashboardStatsResponse
from api.auth.dependencies import require_admin

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def track_view(user_id: int, entity_type: str, entity_id: int):
    """Insert a view event (called from other routers)."""
    try:
        with engine.connect() as conn:
            conn.execute(
                text("INSERT INTO view_events (user_id, entity_type, entity_id) VALUES (:uid, :et, :eid)"),
                {"uid": user_id, "et": entity_type, "eid": entity_id},
            )
            conn.commit()
    except Exception:
        pass  # Don't break the request if tracking fails


@router.get("/popular", response_model=list[PopularContentItem], summary="Get popular content")
def get_popular_content(current_user: dict = Depends(require_admin)):
    """Return the most viewed dashboards and charts in the last 30 days (admin only)."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT
                v.entity_type,
                v.entity_id,
                COALESCE(d.title, c.title, '(Deleted)') as title,
                COUNT(*) as views_30d,
                COUNT(DISTINCT v.user_id) as unique_viewers,
                MAX(v.viewed_at) as last_viewed
            FROM view_events v
            LEFT JOIN dashboards d ON v.entity_type = 'dashboard' AND d.id = v.entity_id
            LEFT JOIN charts c ON v.entity_type = 'chart' AND c.id = v.entity_id
            WHERE v.viewed_at >= NOW() - INTERVAL '30 days'
              AND (d.id IS NOT NULL OR c.id IS NOT NULL)
            GROUP BY v.entity_type, v.entity_id, d.title, c.title
            ORDER BY views_30d DESC
            LIMIT 50
        """))
        return [dict(row) for row in result.mappings().all()]


@router.get("/dashboard/{dashboard_id}/stats", response_model=DashboardStatsResponse, summary="Get dashboard stats")
def get_dashboard_stats(dashboard_id: int, current_user: dict = Depends(require_admin)):
    """Return view statistics for a single dashboard over the last 30 days (admin only)."""
    with engine.connect() as conn:
        totals = conn.execute(text("""
            SELECT
                COUNT(*) as total_views,
                COUNT(DISTINCT user_id) as unique_viewers
            FROM view_events
            WHERE entity_type = 'dashboard' AND entity_id = :did
              AND viewed_at >= NOW() - INTERVAL '30 days'
        """), {"did": dashboard_id}).mappings().fetchone()

        by_day = conn.execute(text("""
            SELECT
                DATE(viewed_at) as day,
                COUNT(*) as views
            FROM view_events
            WHERE entity_type = 'dashboard' AND entity_id = :did
              AND viewed_at >= NOW() - INTERVAL '30 days'
            GROUP BY day
            ORDER BY day
        """), {"did": dashboard_id})
        views_by_day = [{"day": str(r["day"]), "views": r["views"]} for r in by_day.mappings().all()]

    return DashboardStatsResponse(
        total_views=totals["total_views"],
        unique_viewers=totals["unique_viewers"],
        views_by_day=views_by_day,
    )


@router.get("/user-activity", response_model=list[UserActivityItem], summary="Get user activity")
def get_user_activity(current_user: dict = Depends(require_admin)):
    """Return per-user view counts and last activity over the last 30 days (admin only)."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT
                u.id as user_id,
                u.name as user_name,
                u.email as user_email,
                COUNT(v.id) as total_views,
                MAX(v.viewed_at) as last_active
            FROM users u
            LEFT JOIN view_events v ON v.user_id = u.id
                AND v.viewed_at >= NOW() - INTERVAL '30 days'
            GROUP BY u.id, u.name, u.email
            ORDER BY total_views DESC
        """))
        return [dict(row) for row in result.mappings().all()]
