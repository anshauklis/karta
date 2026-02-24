from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user
from api.models import TabCreate, TabUpdate, TabResponse, TabReorder, ChartMoveToTab

router = APIRouter(tags=["tabs"])


@router.get("/api/dashboards/{dashboard_id}/tabs", response_model=list[TabResponse], summary="List dashboard tabs")
def list_tabs(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Return all tabs for a dashboard, ordered by sort_order."""
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order"),
            {"did": dashboard_id},
        ).mappings().all()

        if len(rows) == 0:
            # Lazy migration: create a default tab for existing dashboards
            result = conn.execute(
                text("""
                    INSERT INTO dashboard_tabs (dashboard_id, title, position_order)
                    VALUES (:did, 'Main', 0)
                    RETURNING *
                """),
                {"did": dashboard_id},
            )
            new_tab = dict(result.mappings().fetchone())
            # Reassign orphan charts to the new tab
            conn.execute(
                text("UPDATE charts SET tab_id = :tab_id WHERE dashboard_id = :did AND tab_id IS NULL"),
                {"tab_id": new_tab["id"], "did": dashboard_id},
            )
            conn.commit()
            return [new_tab]

        return [dict(r) for r in rows]


@router.post("/api/dashboards/{dashboard_id}/tabs", response_model=TabResponse, status_code=201, summary="Create a tab")
def create_tab(dashboard_id: int, req: TabCreate, current_user: dict = Depends(get_current_user)):
    """Add a new tab to the dashboard."""
    with engine.connect() as conn:
        max_order = conn.execute(
            text("SELECT COALESCE(MAX(position_order), -1) FROM dashboard_tabs WHERE dashboard_id = :did"),
            {"did": dashboard_id},
        ).scalar()
        row = conn.execute(
            text("""
                INSERT INTO dashboard_tabs (dashboard_id, title, position_order)
                VALUES (:did, :title, :pos)
                RETURNING *
            """),
            {"did": dashboard_id, "title": req.title, "pos": max_order + 1},
        )
        tab = dict(row.mappings().fetchone())
        conn.commit()
    return tab


@router.put("/api/dashboards/{dashboard_id}/tabs/reorder", summary="Reorder tabs")
def reorder_tabs(dashboard_id: int, req: TabReorder, current_user: dict = Depends(get_current_user)):
    """Update the sort order of all tabs for a dashboard."""
    with engine.connect() as conn:
        for i, tid in enumerate(req.tab_ids):
            conn.execute(
                text("UPDATE dashboard_tabs SET position_order = :pos WHERE id = :tid AND dashboard_id = :did"),
                {"pos": i, "tid": tid, "did": dashboard_id},
            )
        conn.commit()
    return {"ok": True}


@router.put("/api/dashboards/{dashboard_id}/tabs/{tab_id}", response_model=TabResponse, summary="Update tab")
def update_tab(dashboard_id: int, tab_id: int, req: TabUpdate, current_user: dict = Depends(get_current_user)):
    """Update tab title or other properties."""
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["tab_id"] = tab_id
    updates["did"] = dashboard_id
    with engine.connect() as conn:
        result = conn.execute(
            text(f"UPDATE dashboard_tabs SET {set_clauses} WHERE id = :tab_id AND dashboard_id = :did RETURNING *"),
            updates,
        )
        row = result.mappings().fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tab not found")
        conn.commit()
    return dict(row)


@router.delete("/api/dashboards/{dashboard_id}/tabs/{tab_id}", status_code=204, summary="Delete a tab")
def delete_tab(dashboard_id: int, tab_id: int, current_user: dict = Depends(get_current_user)):
    """Remove a tab. Charts on this tab are moved to the default tab."""
    with engine.connect() as conn:
        tab_count = conn.execute(
            text("SELECT COUNT(*) FROM dashboard_tabs WHERE dashboard_id = :did"),
            {"did": dashboard_id},
        ).scalar()
        if tab_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last tab")

        # Find first remaining tab to reassign charts
        first_remaining = conn.execute(
            text("SELECT id FROM dashboard_tabs WHERE dashboard_id = :did AND id != :tab_id ORDER BY position_order LIMIT 1"),
            {"did": dashboard_id, "tab_id": tab_id},
        ).scalar()
        conn.execute(
            text("UPDATE charts SET tab_id = :new_tab_id WHERE tab_id = :tab_id"),
            {"new_tab_id": first_remaining, "tab_id": tab_id},
        )
        result = conn.execute(
            text("DELETE FROM dashboard_tabs WHERE id = :tab_id AND dashboard_id = :did"),
            {"tab_id": tab_id, "did": dashboard_id},
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Tab not found")
        conn.commit()


@router.put("/api/charts/{chart_id}/tab", summary="Move chart to a tab")
def move_chart_to_tab(chart_id: int, req: ChartMoveToTab, current_user: dict = Depends(get_current_user)):
    """Assign a chart to a different tab within its dashboard."""
    with engine.connect() as conn:
        conn.execute(
            text("UPDATE charts SET tab_id = :tab_id WHERE id = :cid"),
            {"tab_id": req.tab_id, "cid": chart_id},
        )
        conn.commit()
    return {"ok": True}
