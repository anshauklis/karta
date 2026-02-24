import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from api.database import engine
from api.auth.dependencies import get_current_user
from api.models import AnnotationCreate, AnnotationResponse

router = APIRouter(tags=["annotations"])


@router.get("/api/charts/{chart_id}/annotations", response_model=list[AnnotationResponse], summary="List chart annotations")
def list_chart_annotations(chart_id: int, current_user: dict = Depends(get_current_user)):
    """Return all annotations added to a specific chart."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT a.*, u.name as user_name
            FROM annotations a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.chart_id = :cid
            ORDER BY a.created_at DESC
        """), {"cid": chart_id})
        return [dict(r) for r in rows.mappings().all()]


@router.post("/api/charts/{chart_id}/annotations", response_model=AnnotationResponse, summary="Add annotation to chart")
def create_chart_annotation(chart_id: int, body: AnnotationCreate, current_user: dict = Depends(get_current_user)):
    """Create an annotation on a chart at a specific data point or range."""
    uid = int(current_user["sub"])
    with engine.connect() as conn:
        row = conn.execute(text("""
            INSERT INTO annotations (chart_id, user_id, annotation_type, content, x_value, y_value, config)
            VALUES (:cid, :uid, :atype, :content, :xval, :yval, :cfg)
            RETURNING *
        """), {
            "cid": chart_id, "uid": uid, "atype": body.annotation_type,
            "content": body.content, "xval": body.x_value, "yval": body.y_value,
            "cfg": json.dumps(body.config) if body.config else "{}",
        })
        conn.commit()
        result = dict(row.mappings().first())
        # Fetch user name
        user = conn.execute(text("SELECT name FROM users WHERE id = :uid"), {"uid": uid}).mappings().first()
        result["user_name"] = user["name"] if user else None
        return result


@router.get("/api/dashboards/{dashboard_id}/annotations", response_model=list[AnnotationResponse], summary="List dashboard annotations")
def list_dashboard_annotations(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Return all annotations across all charts in a dashboard."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT a.*, u.name as user_name
            FROM annotations a
            LEFT JOIN users u ON u.id = a.user_id
            WHERE a.dashboard_id = :did
            ORDER BY a.created_at DESC
        """), {"did": dashboard_id})
        return [dict(r) for r in rows.mappings().all()]


@router.post("/api/dashboards/{dashboard_id}/annotations", response_model=AnnotationResponse, summary="Add annotation to dashboard")
def create_dashboard_annotation(dashboard_id: int, body: AnnotationCreate, current_user: dict = Depends(get_current_user)):
    """Create a dashboard-level annotation."""
    uid = int(current_user["sub"])
    with engine.connect() as conn:
        row = conn.execute(text("""
            INSERT INTO annotations (dashboard_id, user_id, annotation_type, content, x_value, y_value, config)
            VALUES (:did, :uid, :atype, :content, :xval, :yval, :cfg)
            RETURNING *
        """), {
            "did": dashboard_id, "uid": uid, "atype": body.annotation_type,
            "content": body.content, "xval": body.x_value, "yval": body.y_value,
            "cfg": json.dumps(body.config) if body.config else "{}",
        })
        conn.commit()
        result = dict(row.mappings().first())
        user = conn.execute(text("SELECT name FROM users WHERE id = :uid"), {"uid": uid}).mappings().first()
        result["user_name"] = user["name"] if user else None
        return result


@router.delete("/api/annotations/{annotation_id}", summary="Delete annotation")
def delete_annotation(annotation_id: int, current_user: dict = Depends(get_current_user)):
    """Permanently remove an annotation."""
    uid = int(current_user["sub"])
    with engine.connect() as conn:
        row = conn.execute(text("SELECT user_id FROM annotations WHERE id = :id"), {"id": annotation_id}).mappings().first()
        if not row:
            raise HTTPException(404, "Annotation not found")
        if row["user_id"] != uid:
            raise HTTPException(403, "Can only delete your own annotations")
        conn.execute(text("DELETE FROM annotations WHERE id = :id"), {"id": annotation_id})
        conn.commit()
    return {"ok": True}
