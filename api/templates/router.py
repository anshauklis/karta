import json
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user

router = APIRouter(prefix="/api/templates", tags=["templates"])

_COLS = "id, user_id, name, chart_type, config, created_at"


@router.get("", summary="List chart templates")
def list_templates(current_user: dict = Depends(get_current_user)):
    """Return all saved chart templates for the current user, ordered by creation date."""
    uid = int(current_user["sub"])
    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT {_COLS} FROM chart_templates WHERE user_id = :uid ORDER BY created_at DESC"),
            {"uid": uid},
        )
        return [dict(r) for r in result.mappings().all()]


@router.post("", status_code=201, summary="Create chart template")
def create_template(body: dict, current_user: dict = Depends(get_current_user)):
    """Save a chart configuration as a reusable template."""
    uid = int(current_user["sub"])
    with engine.connect() as conn:
        result = conn.execute(
            text(f"""
                INSERT INTO chart_templates (user_id, name, chart_type, config)
                VALUES (:uid, :name, :chart_type, :config::jsonb)
                RETURNING {_COLS}
            """),
            {
                "uid": uid,
                "name": body["name"],
                "chart_type": body["chart_type"],
                "config": json.dumps(body.get("config", {})),
            },
        )
        row = result.mappings().fetchone()
        conn.commit()
    return dict(row)


@router.delete("/{template_id}", status_code=204, summary="Delete chart template")
def delete_template(template_id: int, current_user: dict = Depends(get_current_user)):
    """Permanently remove a saved chart template."""
    uid = int(current_user["sub"])
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM chart_templates WHERE id = :id AND user_id = :uid"),
            {"id": template_id, "uid": uid},
        )
        conn.commit()
