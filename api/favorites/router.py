from fastapi import APIRouter, Depends
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/favorites", tags=["favorites"])


@router.get("", summary="List user favorites")
def list_favorites(current_user: dict = Depends(get_current_user)):
    """Return all favorited entities for the current user, most recent first."""
    uid = int(current_user["sub"])
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT entity_type, entity_id FROM favorites WHERE user_id = :uid ORDER BY created_at DESC"),
            {"uid": uid},
        )
        return [dict(r) for r in result.mappings().all()]


@router.post("/toggle", summary="Toggle favorite")
def toggle_favorite(
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    """Add or remove a favorite for the current user. Returns the new favorited state."""
    uid = int(current_user["sub"])
    entity_type = body["entity_type"]
    entity_id = int(body["entity_id"])

    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM favorites WHERE user_id = :uid AND entity_type = :et AND entity_id = :eid"),
            {"uid": uid, "et": entity_type, "eid": entity_id},
        ).fetchone()

        if existing:
            conn.execute(text("DELETE FROM favorites WHERE id = :id"), {"id": existing[0]})
            conn.commit()
            return {"favorited": False}
        else:
            conn.execute(
                text("INSERT INTO favorites (user_id, entity_type, entity_id) VALUES (:uid, :et, :eid)"),
                {"uid": uid, "et": entity_type, "eid": entity_id},
            )
            conn.commit()
            return {"favorited": True}
