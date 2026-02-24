from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text

from api.database import engine
from api.models import SQLTabCreate, SQLTabUpdate, SQLTabResponse, SQLTabReorderRequest
from api.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/sql/tabs", tags=["sql_tabs"])

_TAB_COLS = """id, user_id, label, connection_id, sql_query,
    sort_order, is_active, created_at, updated_at"""


@router.get("", response_model=list[SQLTabResponse], summary="List SQL tabs")
def list_tabs(current_user: dict = Depends(get_current_user)):
    """Return all SQL Lab tabs for the current user, ordered by sort_order. Auto-creates a default tab if none exist."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT {_TAB_COLS} FROM sql_tabs WHERE user_id = :uid ORDER BY sort_order"),
            {"uid": user_id},
        )
        tabs = [dict(row) for row in result.mappings().all()]

    # Auto-create default tab if user has none
    if not tabs:
        with engine.connect() as conn:
            result = conn.execute(
                text(f"""
                    INSERT INTO sql_tabs (user_id, label, is_active)
                    VALUES (:uid, 'Untitled', true)
                    RETURNING {_TAB_COLS}
                """),
                {"uid": user_id},
            )
            tabs = [dict(result.mappings().fetchone())]
            conn.commit()

    return tabs


@router.post("", response_model=SQLTabResponse, status_code=201, summary="Create SQL tab")
def create_tab(req: SQLTabCreate, current_user: dict = Depends(get_current_user)):
    """Create a new SQL Lab tab and set it as active. Deactivates all other tabs."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        max_order = conn.execute(
            text("SELECT COALESCE(MAX(sort_order), -1) FROM sql_tabs WHERE user_id = :uid"),
            {"uid": user_id},
        ).scalar()

        # Deactivate all other tabs
        conn.execute(
            text("UPDATE sql_tabs SET is_active = false WHERE user_id = :uid"),
            {"uid": user_id},
        )

        result = conn.execute(
            text(f"""
                INSERT INTO sql_tabs (user_id, label, connection_id, sort_order, is_active)
                VALUES (:uid, :label, :connection_id, :sort_order, true)
                RETURNING {_TAB_COLS}
            """),
            {
                "uid": user_id,
                "label": req.label or "Untitled",
                "connection_id": req.connection_id,
                "sort_order": max_order + 1,
            },
        )
        tab = dict(result.mappings().fetchone())
        conn.commit()
    return tab


@router.put("/reorder", status_code=200, summary="Reorder SQL tabs")
def reorder_tabs(req: SQLTabReorderRequest, current_user: dict = Depends(get_current_user)):
    """Update the sort order of all SQL Lab tabs for the current user."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        for item in req.items:
            conn.execute(
                text("UPDATE sql_tabs SET sort_order = :order WHERE id = :id AND user_id = :uid"),
                {"order": item.sort_order, "id": item.id, "uid": user_id},
            )
        conn.commit()
    return {"status": "ok"}


@router.put("/{tab_id}", response_model=SQLTabResponse, summary="Update SQL tab")
def update_tab(tab_id: int, req: SQLTabUpdate, current_user: dict = Depends(get_current_user)):
    """Update SQL tab properties such as label, connection, SQL content, or active state."""
    user_id = int(current_user["sub"])
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    with engine.connect() as conn:
        # If setting is_active=true, deactivate others first
        if updates.get("is_active"):
            conn.execute(
                text("UPDATE sql_tabs SET is_active = false WHERE user_id = :uid"),
                {"uid": user_id},
            )

        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
        updates["id"] = tab_id
        updates["uid"] = user_id

        conn.execute(
            text(f"UPDATE sql_tabs SET {set_clauses}, updated_at = NOW() WHERE id = :id AND user_id = :uid"),
            updates,
        )
        conn.commit()

        result = conn.execute(
            text(f"SELECT {_TAB_COLS} FROM sql_tabs WHERE id = :id AND user_id = :uid"),
            {"id": tab_id, "uid": user_id},
        )
        row = result.mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Tab not found")
    return dict(row)


@router.delete("/{tab_id}", status_code=204, summary="Delete SQL tab")
def delete_tab(tab_id: int, current_user: dict = Depends(get_current_user)):
    """Delete a SQL Lab tab. If it was active, activates the next tab. If no tabs remain, creates a default one."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        was_active = conn.execute(
            text("SELECT is_active FROM sql_tabs WHERE id = :id AND user_id = :uid"),
            {"id": tab_id, "uid": user_id},
        ).scalar()

        conn.execute(
            text("DELETE FROM sql_tabs WHERE id = :id AND user_id = :uid"),
            {"id": tab_id, "uid": user_id},
        )

        remaining = conn.execute(
            text("SELECT COUNT(*) FROM sql_tabs WHERE user_id = :uid"),
            {"uid": user_id},
        ).scalar()

        if remaining == 0:
            conn.execute(
                text("INSERT INTO sql_tabs (user_id, label, is_active) VALUES (:uid, 'Untitled', true)"),
                {"uid": user_id},
            )
        elif was_active:
            conn.execute(
                text("""
                    UPDATE sql_tabs SET is_active = true
                    WHERE id = (SELECT id FROM sql_tabs WHERE user_id = :uid ORDER BY sort_order LIMIT 1)
                """),
                {"uid": user_id},
            )

        conn.commit()
