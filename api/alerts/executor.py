import asyncio
import json
import logging
import operator
from sqlalchemy import text

from api.database import engine
from api.charts.router import _execute_chart_sql
from api.notifications.dispatcher import send_message
from api.alerts.baseline import check_anomaly

logger = logging.getLogger("karta.alerts")

OPERATORS = {
    ">": operator.gt, "<": operator.lt,
    ">=": operator.ge, "<=": operator.le,
    "=": operator.eq, "!=": operator.ne,
}


async def execute_alert(alert_id: int) -> dict | None:
    """Execute an alert check. Returns alert details if triggered, None otherwise."""
    rule, result = await asyncio.to_thread(_run_alert_check, alert_id)

    if result:
        await _send_and_log(rule, result)

    return result


def _run_alert_check(alert_id: int) -> tuple[dict | None, dict | None]:
    """Sync: fetch rule, execute SQL, check condition, update last_run."""
    with engine.connect() as conn:
        rule = conn.execute(
            text("SELECT * FROM alert_rules WHERE id = :id"), {"id": alert_id}
        ).mappings().fetchone()

    if not rule:
        logger.warning(f"Alert rule {alert_id} not found")
        return None, None

    try:
        columns, rows, df = _execute_chart_sql(rule["connection_id"], rule["sql_query"])
    except Exception as e:
        logger.error(f"Alert {alert_id} SQL failed: {e}")
        return None, None

    result = None
    if rule["alert_type"] == "threshold":
        result = _check_threshold(rule, df)
    elif rule["alert_type"] == "anomaly":
        result = _check_anomaly(rule, df)

    with engine.connect() as conn:
        conn.execute(
            text("UPDATE alert_rules SET last_run_at = NOW(), last_value = :val WHERE id = :id"),
            {"id": alert_id, "val": result["current_value"] if result else None},
        )
        conn.commit()

    return dict(rule), result


def _check_threshold(rule, df) -> dict | None:
    col = rule["condition_column"]
    op_str = rule["condition_operator"]
    threshold = rule["condition_value"]

    if col not in df.columns:
        logger.warning(f"Column '{col}' not in query result")
        return None

    value = float(df[col].iloc[0])
    op_fn = OPERATORS.get(op_str)
    if not op_fn:
        return None

    if op_fn(value, threshold):
        severity = rule.get("severity", "warning") or "warning"
        return {
            "severity": severity,
            "current_value": value,
            "threshold_value": threshold,
            "message": f"Alert '{rule['name']}': {col} = {value} {op_str} {threshold}",
            "details": {"column": col, "operator": op_str, "threshold": threshold},
        }
    return None


def _check_anomaly(rule, df) -> dict | None:
    config = rule.get("anomaly_config") or {}
    result = check_anomaly(df, config)

    if result.is_anomaly:
        return {
            "severity": result.severity,
            "current_value": result.current_value,
            "threshold_value": None,
            "message": f"Alert '{rule['name']}': {result.message}",
            "details": result.details,
        }
    return None


async def _send_and_log(rule, result: dict):
    """Send notification and write to alert_history."""
    def _write_history():
        with engine.connect() as conn:
            conn.execute(
                text("""
                    INSERT INTO alert_history (alert_rule_id, severity, current_value,
                        threshold_value, message, details, notification_sent)
                    VALUES (:rule_id, :severity, :current_value, :threshold_value,
                        :message, CAST(:details AS jsonb), :sent)
                """),
                {
                    "rule_id": rule["id"],
                    "severity": result["severity"],
                    "current_value": result["current_value"],
                    "threshold_value": result.get("threshold_value"),
                    "message": result["message"],
                    "details": json.dumps(result.get("details", {})),
                    "sent": False,
                },
            )
            conn.commit()

    await asyncio.to_thread(_write_history)

    if rule.get("channel_id"):
        def _fetch_channel():
            with engine.connect() as conn:
                return conn.execute(
                    text("SELECT channel_type, config FROM notification_channels WHERE id = :id"),
                    {"id": rule["channel_id"]},
                ).mappings().fetchone()

        channel = await asyncio.to_thread(_fetch_channel)
        if channel:
            from api.notifications.router import _decrypt_config
            channel_config = _decrypt_config(channel["config"])
            severity_emoji = {"critical": "🔴", "warning": "🟡", "info": "🔵"}.get(result["severity"], "⚪")
            text_msg = f"{severity_emoji} {result['message']}"
            try:
                await send_message(channel["channel_type"], channel_config, text_msg)
                def _mark_sent():
                    with engine.connect() as conn:
                        conn.execute(
                            text("""
                                UPDATE alert_history SET notification_sent = TRUE
                                WHERE alert_rule_id = :rule_id
                                ORDER BY triggered_at DESC LIMIT 1
                            """),
                            {"rule_id": rule["id"]},
                        )
                        conn.commit()
                await asyncio.to_thread(_mark_sent)
            except Exception as e:
                logger.error(f"Failed to send alert notification: {e}")
