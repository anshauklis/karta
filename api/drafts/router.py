import api.json_util as json
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text

from api.database import engine
from api.models import ChartDraftUpsert, ChartDraftResponse
from api.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/drafts/charts", tags=["chart_drafts"])

_DRAFT_COLS = """id, user_id, chart_id, dashboard_id, connection_id, dataset_id,
    title, description, mode, chart_type, chart_config, chart_code, sql_query, variables, updated_at"""


@router.get("/{chart_id}", response_model=ChartDraftResponse, summary="Get chart draft")
def get_draft(chart_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve the auto-saved draft for a chart. Use chart_id='new' for unsaved new charts."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        if chart_id == "new":
            result = conn.execute(
                text(f"SELECT {_DRAFT_COLS} FROM chart_drafts WHERE user_id = :uid AND chart_id IS NULL"),
                {"uid": user_id},
            )
        else:
            result = conn.execute(
                text(f"SELECT {_DRAFT_COLS} FROM chart_drafts WHERE user_id = :uid AND chart_id = :cid"),
                {"uid": user_id, "cid": int(chart_id)},
            )
        row = result.mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="No draft found")
    return dict(row)


@router.put("/{chart_id}", response_model=ChartDraftResponse, summary="Save chart draft")
def upsert_draft(chart_id: str, req: ChartDraftUpsert, current_user: dict = Depends(get_current_user)):
    """Create or update an auto-saved draft for a chart editor session."""
    user_id = int(current_user["sub"])
    cid = None if chart_id == "new" else int(chart_id)

    with engine.connect() as conn:
        if cid is None:
            existing = conn.execute(
                text("SELECT id FROM chart_drafts WHERE user_id = :uid AND chart_id IS NULL"),
                {"uid": user_id},
            ).fetchone()
        else:
            existing = conn.execute(
                text("SELECT id FROM chart_drafts WHERE user_id = :uid AND chart_id = :cid"),
                {"uid": user_id, "cid": cid},
            ).fetchone()

        config_json = json.dumps(req.chart_config)

        if existing:
            conn.execute(
                text("""
                    UPDATE chart_drafts SET
                        dashboard_id = :dashboard_id, connection_id = :connection_id,
                        dataset_id = :dataset_id, title = :title, description = :description,
                        mode = :mode, chart_type = :chart_type,
                        chart_config = CAST(:chart_config AS jsonb),
                        chart_code = :chart_code, sql_query = :sql_query,
                        variables = CAST(:variables AS jsonb),
                        updated_at = NOW()
                    WHERE id = :id
                """),
                {
                    "id": existing[0],
                    "dashboard_id": req.dashboard_id,
                    "connection_id": req.connection_id,
                    "dataset_id": req.dataset_id,
                    "title": req.title,
                    "description": req.description,
                    "mode": req.mode,
                    "chart_type": req.chart_type,
                    "chart_config": config_json,
                    "chart_code": req.chart_code,
                    "sql_query": req.sql_query,
                    "variables": json.dumps(req.variables) if req.variables else None,
                },
            )
            draft_id = existing[0]
        else:
            result = conn.execute(
                text("""
                    INSERT INTO chart_drafts (user_id, chart_id, dashboard_id, connection_id,
                        dataset_id, title, description, mode, chart_type,
                        chart_config, chart_code, sql_query, variables)
                    VALUES (:uid, :cid, :dashboard_id, :connection_id,
                        :dataset_id, :title, :description, :mode, :chart_type,
                        CAST(:chart_config AS jsonb), :chart_code, :sql_query,
                        CAST(:variables AS jsonb))
                    RETURNING id
                """),
                {
                    "uid": user_id,
                    "cid": cid,
                    "dashboard_id": req.dashboard_id,
                    "connection_id": req.connection_id,
                    "dataset_id": req.dataset_id,
                    "title": req.title,
                    "description": req.description,
                    "mode": req.mode,
                    "chart_type": req.chart_type,
                    "chart_config": config_json,
                    "chart_code": req.chart_code,
                    "sql_query": req.sql_query,
                    "variables": json.dumps(req.variables) if req.variables else None,
                },
            )
            draft_id = result.scalar()

        conn.commit()

        result = conn.execute(
            text(f"SELECT {_DRAFT_COLS} FROM chart_drafts WHERE id = :id"),
            {"id": draft_id},
        )
        return dict(result.mappings().fetchone())


@router.delete("/{chart_id}", status_code=204, summary="Delete chart draft")
def delete_draft(chart_id: str, current_user: dict = Depends(get_current_user)):
    """Remove the auto-saved draft for a chart, typically called after a successful save."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        if chart_id == "new":
            conn.execute(
                text("DELETE FROM chart_drafts WHERE user_id = :uid AND chart_id IS NULL"),
                {"uid": user_id},
            )
        else:
            conn.execute(
                text("DELETE FROM chart_drafts WHERE user_id = :uid AND chart_id = :cid"),
                {"uid": user_id, "cid": int(chart_id)},
            )
        conn.commit()
