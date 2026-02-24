import json
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text

from api.database import engine
from api.models import BookmarkCreate, BookmarkResponse
from api.auth.dependencies import get_current_user

router = APIRouter(tags=["bookmarks"])

_BM_COLS = "id, user_id, dashboard_id, name, filter_state, created_at"


@router.get("/api/dashboards/{dashboard_id}/bookmarks", response_model=list[BookmarkResponse], summary="List saved filter states")
def list_bookmarks(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Return all bookmarks (saved filter configurations) for a dashboard."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT {_BM_COLS} FROM bookmarks WHERE dashboard_id = :did AND user_id = :uid ORDER BY name"),
            {"did": dashboard_id, "uid": user_id},
        )
        return [dict(row) for row in result.mappings().all()]


@router.post("/api/dashboards/{dashboard_id}/bookmarks", response_model=BookmarkResponse, status_code=201, summary="Save current filter state as bookmark")
def create_bookmark(dashboard_id: int, req: BookmarkCreate, current_user: dict = Depends(get_current_user)):
    """Create a bookmark that saves the current filter selections for quick recall."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        result = conn.execute(
            text(f"""
                INSERT INTO bookmarks (user_id, dashboard_id, name, filter_state)
                VALUES (:uid, :did, :name, CAST(:fs AS jsonb))
                ON CONFLICT (user_id, dashboard_id, name) DO UPDATE SET filter_state = CAST(:fs AS jsonb)
                RETURNING {_BM_COLS}
            """),
            {"uid": user_id, "did": dashboard_id, "name": req.name, "fs": json.dumps(req.filter_state)},
        )
        bookmark = dict(result.mappings().fetchone())
        conn.commit()
    return bookmark


@router.delete("/api/bookmarks/{bookmark_id}", status_code=204, summary="Delete bookmark")
def delete_bookmark(bookmark_id: int, current_user: dict = Depends(get_current_user)):
    """Permanently remove a saved filter state."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM bookmarks WHERE id = :id AND user_id = :uid"),
            {"id": bookmark_id, "uid": user_id},
        )
        conn.commit()
