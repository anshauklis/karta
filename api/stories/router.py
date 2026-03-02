import api.json_util as json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user, check_ownership, require_role
from api.models import (
    StoryCreate, StoryUpdate, StoryResponse, StoryDetailResponse,
    StorySlideCreate, StorySlideUpdate, StorySlideResponse,
    FilterReorderRequest,
)

router = APIRouter(tags=["stories"])


@router.get("/api/stories", response_model=list[StoryResponse], summary="List stories")
def list_stories(current_user: dict = Depends(get_current_user)):
    """Return all stories with their slide counts, ordered by last update."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT s.*, COALESCE(sc.cnt, 0) as slide_count
            FROM stories s
            LEFT JOIN (SELECT story_id, COUNT(*) as cnt FROM story_slides GROUP BY story_id) sc ON sc.story_id = s.id
            ORDER BY s.updated_at DESC
        """))
        return [dict(r) for r in rows.mappings().all()]


@router.post("/api/stories", response_model=StoryResponse, summary="Create story")
def create_story(body: StoryCreate, current_user: dict = require_role("editor", "admin")):
    """Create a new story (narrative presentation linked to a dashboard)."""
    uid = int(current_user["sub"])
    with engine.connect() as conn:
        row = conn.execute(text("""
            INSERT INTO stories (title, description, dashboard_id, created_by)
            VALUES (:title, :desc, :did, :uid)
            RETURNING *
        """), {"title": body.title, "desc": body.description, "did": body.dashboard_id, "uid": uid})
        conn.commit()
        result = dict(row.mappings().first())
        result["slide_count"] = 0
        return result


@router.get("/api/stories/{story_id}", response_model=StoryDetailResponse, summary="Get story")
def get_story(story_id: int, current_user: dict = Depends(get_current_user)):
    """Return a single story with all its slides ordered by slide_order."""
    with engine.connect() as conn:
        story = conn.execute(text("SELECT * FROM stories WHERE id = :id"), {"id": story_id}).mappings().first()
        if not story:
            raise HTTPException(404, "Story not found")
        slides = conn.execute(text("""
            SELECT * FROM story_slides WHERE story_id = :sid ORDER BY slide_order
        """), {"sid": story_id}).mappings().all()
        result = dict(story)
        result["slides"] = [dict(s) for s in slides]
        result["slide_count"] = len(slides)
        return result


@router.put("/api/stories/{story_id}", response_model=StoryResponse, summary="Update story")
def update_story(story_id: int, body: StoryUpdate, current_user: dict = require_role("editor", "admin")):
    """Update story metadata (title, description, dashboard link)."""
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not updates:
        raise HTTPException(400, "No fields to update")
    set_parts = [f"{k} = :{k}" for k in updates]
    set_parts.append("updated_at = NOW()")
    updates["id"] = story_id
    with engine.connect() as conn:
        conn.execute(text(f"UPDATE stories SET {', '.join(set_parts)} WHERE id = :id"), updates)
        conn.commit()
        row = conn.execute(text("""
            SELECT s.*, COALESCE(sc.cnt, 0) as slide_count
            FROM stories s
            LEFT JOIN (SELECT story_id, COUNT(*) as cnt FROM story_slides GROUP BY story_id) sc ON sc.story_id = s.id
            WHERE s.id = :id
        """), {"id": story_id}).mappings().first()
        return dict(row)


@router.delete("/api/stories/{story_id}", summary="Delete story")
def delete_story(story_id: int, current_user: dict = require_role("editor", "admin")):
    """Delete a story and all its slides."""
    with engine.connect() as conn:
        check_ownership(conn, "stories", story_id, current_user)
        conn.execute(text("DELETE FROM stories WHERE id = :id"), {"id": story_id})
        conn.commit()
    return {"ok": True}


# --- Slides ---

@router.post("/api/stories/{story_id}/slides", response_model=StorySlideResponse, summary="Create slide")
def create_slide(story_id: int, body: StorySlideCreate, current_user: dict = require_role("editor", "admin")):
    """Add a new slide to a story, automatically placed at the end."""
    with engine.connect() as conn:
        # Get next slide_order
        max_order = conn.execute(text(
            "SELECT COALESCE(MAX(slide_order), -1) + 1 as next_order FROM story_slides WHERE story_id = :sid"
        ), {"sid": story_id}).scalar()
        row = conn.execute(text("""
            INSERT INTO story_slides (story_id, slide_order, chart_id, title, narrative, filter_state, config)
            VALUES (:sid, :ord, :cid, :title, :narr, :fs::jsonb, :cfg::jsonb)
            RETURNING *
        """), {
            "sid": story_id, "ord": max_order, "cid": body.chart_id,
            "title": body.title, "narr": body.narrative,
            "fs": json.dumps(body.filter_state) if body.filter_state else "{}",
            "cfg": json.dumps(body.config) if body.config else "{}",
        })
        conn.commit()
        return dict(row.mappings().first())


@router.put("/api/stories/slides/{slide_id}", response_model=StorySlideResponse, summary="Update slide")
def update_slide(slide_id: int, body: StorySlideUpdate, current_user: dict = require_role("editor", "admin")):
    """Update a slide's chart, title, narrative, filters, or config."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(400, "No fields to update")
    set_parts = []
    params = {"id": slide_id}
    for k, v in updates.items():
        if k in ("filter_state", "config"):
            set_parts.append(f"{k} = :{k}::jsonb")
            import json
            params[k] = json.dumps(v) if v else "{}"
        else:
            set_parts.append(f"{k} = :{k}")
            params[k] = v
    with engine.connect() as conn:
        conn.execute(text(f"UPDATE story_slides SET {', '.join(set_parts)} WHERE id = :id"), params)
        conn.commit()
        row = conn.execute(text("SELECT * FROM story_slides WHERE id = :id"), {"id": slide_id}).mappings().first()
        return dict(row)


@router.put("/api/stories/{story_id}/slides/reorder", summary="Reorder slides")
def reorder_slides(story_id: int, req: FilterReorderRequest, current_user: dict = require_role("editor", "admin")):
    """Bulk-update slide_order for all slides in a story."""
    with engine.connect() as conn:
        for item in req.items:
            conn.execute(
                text("UPDATE story_slides SET slide_order = :sort_order WHERE id = :id AND story_id = :story_id"),
                {"sort_order": item.sort_order, "id": item.id, "story_id": story_id},
            )
        conn.commit()
    return {"status": "ok"}


@router.delete("/api/stories/slides/{slide_id}", summary="Delete slide")
def delete_slide(slide_id: int, current_user: dict = require_role("editor", "admin")):
    """Remove a slide from its story."""
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM story_slides WHERE id = :id"), {"id": slide_id})
        conn.commit()
    return {"ok": True}
