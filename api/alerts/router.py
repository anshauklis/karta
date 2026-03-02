import api.json_util as json
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional

from api.database import engine
from api.auth.dependencies import get_current_user, check_ownership, require_role
from api.scheduler import add_alert_job, remove_alert_job

router = APIRouter(tags=["alerts"])


class AlertRuleCreate(BaseModel):
    name: str
    connection_id: int
    channel_id: Optional[int] = None
    alert_type: str  # 'threshold' | 'anomaly'
    sql_query: str
    condition_column: Optional[str] = None
    condition_operator: Optional[str] = None
    condition_value: Optional[float] = None
    anomaly_config: dict = {}
    schedule: str  # cron expression
    timezone: str = "Europe/Moscow"
    severity: str = "warning"
    is_active: bool = True


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    connection_id: Optional[int] = None
    channel_id: Optional[int] = None
    alert_type: Optional[str] = None
    sql_query: Optional[str] = None
    condition_column: Optional[str] = None
    condition_operator: Optional[str] = None
    condition_value: Optional[float] = None
    anomaly_config: Optional[dict] = None
    schedule: Optional[str] = None
    timezone: Optional[str] = None
    severity: Optional[str] = None
    is_active: Optional[bool] = None


_ALERT_COLS = """id, name, connection_id, channel_id, alert_type, sql_query,
    condition_column, condition_operator, condition_value, anomaly_config,
    schedule, timezone, severity, is_active, last_run_at, last_value,
    created_by, created_at"""


@router.get("/api/alerts", summary="List alert rules")
def list_alerts(current_user: dict = Depends(get_current_user)):
    """Return all alert rules ordered by creation date descending."""
    with engine.connect() as conn:
        rows = conn.execute(text(f"SELECT {_ALERT_COLS} FROM alert_rules ORDER BY created_at DESC")).mappings().all()
    return [dict(r) for r in rows]


@router.post("/api/alerts", status_code=201, summary="Create alert rule")
def create_alert(req: AlertRuleCreate, current_user: dict = require_role("editor", "admin")):
    """Create a new alert rule and register it with the scheduler if active."""
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        row = conn.execute(
            text(f"""
                INSERT INTO alert_rules (name, connection_id, channel_id, alert_type,
                    sql_query, condition_column, condition_operator, condition_value,
                    anomaly_config, schedule, timezone, severity, is_active, created_by)
                VALUES (:name, :connection_id, :channel_id, :alert_type,
                    :sql_query, :condition_column, :condition_operator, :condition_value,
                    CAST(:anomaly_config AS jsonb), :schedule, :timezone, :severity, :is_active, :created_by)
                RETURNING {_ALERT_COLS}
            """),
            {
                "name": req.name, "connection_id": req.connection_id,
                "channel_id": req.channel_id, "alert_type": req.alert_type,
                "sql_query": req.sql_query, "condition_column": req.condition_column,
                "condition_operator": req.condition_operator, "condition_value": req.condition_value,
                "anomaly_config": json.dumps(req.anomaly_config),
                "schedule": req.schedule, "timezone": req.timezone,
                "severity": req.severity, "is_active": req.is_active,
                "created_by": user_id,
            },
        ).mappings().fetchone()
        conn.commit()

    alert = dict(row)
    if alert["is_active"]:
        add_alert_job(alert["id"], alert["schedule"], alert["timezone"])

    return alert


@router.get("/api/alerts/{alert_id}", summary="Get alert rule")
def get_alert(alert_id: int, current_user: dict = Depends(get_current_user)):
    """Return a single alert rule by ID."""
    with engine.connect() as conn:
        row = conn.execute(
            text(f"SELECT {_ALERT_COLS} FROM alert_rules WHERE id = :id"), {"id": alert_id}
        ).mappings().fetchone()
    if not row:
        raise HTTPException(404, "Alert rule not found")
    return dict(row)


@router.put("/api/alerts/{alert_id}", summary="Update alert rule")
def update_alert(alert_id: int, req: AlertRuleUpdate, current_user: dict = require_role("editor", "admin")):
    """Update an existing alert rule and reschedule or unschedule it accordingly."""
    with engine.connect() as conn:
        check_ownership(conn, "alert_rules", alert_id, current_user)

    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    if "anomaly_config" in updates:
        updates["anomaly_config"] = json.dumps(updates["anomaly_config"])
        set_clauses = ", ".join(
            f"{k} = CAST(:{k} AS jsonb)" if k == "anomaly_config" else f"{k} = :{k}"
            for k in updates
        )
    else:
        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)

    updates["id"] = alert_id
    with engine.connect() as conn:
        conn.execute(text(f"UPDATE alert_rules SET {set_clauses} WHERE id = :id"), updates)
        conn.commit()

    alert = get_alert(alert_id, current_user)

    # Update scheduler
    if alert.get("is_active"):
        add_alert_job(alert["id"], alert["schedule"], alert.get("timezone", "Europe/Moscow"))
    else:
        remove_alert_job(alert["id"])

    return alert


@router.delete("/api/alerts/{alert_id}", status_code=204, summary="Delete alert rule")
def delete_alert(alert_id: int, current_user: dict = require_role("editor", "admin")):
    """Delete an alert rule and remove its scheduled job."""
    with engine.connect() as conn:
        check_ownership(conn, "alert_rules", alert_id, current_user)
    remove_alert_job(alert_id)
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM alert_rules WHERE id = :id"), {"id": alert_id})
        conn.commit()


@router.get("/api/alerts/{alert_id}/history", summary="Get alert history")
def alert_history(alert_id: int, current_user: dict = Depends(get_current_user)):
    """Return the trigger history for a specific alert rule (last 100 entries)."""
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT id, alert_rule_id, triggered_at, severity, current_value,
                    threshold_value, message, notification_sent, details
                FROM alert_history WHERE alert_rule_id = :id
                ORDER BY triggered_at DESC LIMIT 100
            """),
            {"id": alert_id},
        ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/api/alert-history", summary="Get all alert history")
def all_alert_history(current_user: dict = Depends(get_current_user)):
    """Return combined trigger history across all alert rules (last 100 entries)."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT h.id, h.alert_rule_id, h.triggered_at, h.severity,
                h.current_value, h.threshold_value, h.message,
                h.notification_sent, r.name as alert_name
            FROM alert_history h
            JOIN alert_rules r ON r.id = h.alert_rule_id
            ORDER BY h.triggered_at DESC LIMIT 100
        """)).mappings().all()
    return [dict(r) for r in rows]


@router.post("/api/alerts/{alert_id}/test", summary="Test alert rule")
async def test_alert(alert_id: int, current_user: dict = require_role("editor", "admin")):
    """Run an alert check immediately and return whether it triggered."""
    from api.alerts.executor import execute_alert
    try:
        result = await execute_alert(alert_id)
        if result:
            return {"triggered": True, **result}
        return {"triggered": False, "message": "No anomaly detected"}
    except Exception as e:
        return {"triggered": False, "error": str(e)}
