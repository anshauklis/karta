from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional

from api.database import engine
from api.auth.dependencies import get_current_user, check_ownership, require_role
from api.scheduler import add_report_job, remove_report_job

router = APIRouter(tags=["reports"])


class ReportCreate(BaseModel):
    name: str
    chart_id: int
    channel_id: Optional[int] = None
    schedule: str  # cron expression
    timezone: str = "Europe/Moscow"
    is_active: bool = True
    format: str = "excel"  # "excel", "png", or "pdf"


class ReportUpdate(BaseModel):
    name: Optional[str] = None
    chart_id: Optional[int] = None
    channel_id: Optional[int] = None
    schedule: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None
    format: Optional[str] = None


_REPORT_COLS = """r.id, r.name, r.chart_id, r.channel_id, r.schedule, r.timezone,
    r.is_active, r.last_run_at, r.created_by, r.created_at,
    COALESCE(r.format, 'excel') as format,
    c.title as chart_title, ch.name as channel_name"""

_REPORT_JOIN = """scheduled_reports r
    LEFT JOIN charts c ON c.id = r.chart_id
    LEFT JOIN notification_channels ch ON ch.id = r.channel_id"""


@router.get("/api/reports", summary="List reports")
def list_reports(current_user: dict = Depends(get_current_user)):
    """Return all scheduled reports with linked chart and channel names."""
    with engine.connect() as conn:
        rows = conn.execute(
            text(f"SELECT {_REPORT_COLS} FROM {_REPORT_JOIN} ORDER BY r.created_at DESC")
        ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/api/reports", status_code=201, summary="Create report")
def create_report(req: ReportCreate, current_user: dict = require_role("editor", "admin")):
    """Create a new scheduled report and register it with the scheduler if active."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                INSERT INTO scheduled_reports (name, chart_id, channel_id, schedule, timezone, is_active, format, created_by)
                VALUES (:name, :chart_id, :channel_id, :schedule, :timezone, :is_active, :format, :created_by)
                RETURNING id, name, chart_id, channel_id, schedule, timezone, is_active,
                    last_run_at, created_by, created_at, format
            """),
            {
                "name": req.name, "chart_id": req.chart_id,
                "channel_id": req.channel_id, "schedule": req.schedule,
                "timezone": req.timezone, "is_active": req.is_active,
                "format": req.format, "created_by": user_id,
            },
        ).mappings().fetchone()
        conn.commit()

    report = dict(row)
    if report["is_active"]:
        add_report_job(report["id"], report["schedule"], report["timezone"])

    return report


@router.get("/api/reports/{report_id}", summary="Get report")
def get_report(report_id: int, current_user: dict = Depends(get_current_user)):
    """Return a single scheduled report by ID with chart and channel details."""
    with engine.connect() as conn:
        row = conn.execute(
            text(f"SELECT {_REPORT_COLS} FROM {_REPORT_JOIN} WHERE r.id = :id"),
            {"id": report_id},
        ).mappings().fetchone()
    if not row:
        raise HTTPException(404, "Report not found")
    return dict(row)


@router.put("/api/reports/{report_id}", summary="Update report")
def update_report(report_id: int, req: ReportUpdate, current_user: dict = require_role("editor", "admin")):
    """Update a scheduled report and reschedule or unschedule it accordingly."""
    with engine.connect() as conn:
        check_ownership(conn, "scheduled_reports", report_id, current_user)

    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = report_id
    with engine.connect() as conn:
        conn.execute(
            text(f"UPDATE scheduled_reports SET {set_clauses} WHERE id = :id"), updates
        )
        conn.commit()

    report = get_report(report_id, current_user)

    # Update scheduler
    if report.get("is_active"):
        add_report_job(report["id"], report["schedule"], report.get("timezone", "Europe/Moscow"))
    else:
        remove_report_job(report["id"])

    return report


@router.delete("/api/reports/{report_id}", status_code=204, summary="Delete report")
def delete_report(report_id: int, current_user: dict = require_role("editor", "admin")):
    """Delete a scheduled report and remove its scheduled job."""
    with engine.connect() as conn:
        check_ownership(conn, "scheduled_reports", report_id, current_user)
    remove_report_job(report_id)
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM scheduled_reports WHERE id = :id"), {"id": report_id})
        conn.commit()


@router.post("/api/reports/{report_id}/send", summary="Run report now")
async def send_report_now(report_id: int, current_user: dict = require_role("editor", "admin")):
    """Manually trigger a report execution and delivery outside its schedule."""
    from api.reports.executor import execute_report
    try:
        result = await execute_report(report_id)
        return {"success": True, **result}
    except Exception as e:
        return {"success": False, "error": str(e)}
