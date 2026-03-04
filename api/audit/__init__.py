"""Audit logging helper. Logs user actions to audit_log table."""

import json
import logging
from sqlalchemy import text
from api.database import engine

logger = logging.getLogger("karta.audit")


async def log_action(
    user_id: int | None,
    action: str,
    resource_type: str,
    resource_id: int | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
    tenant_id: int | None = None,
):
    """Log an audit event. Fire-and-forget -- never blocks the request."""
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id, details, ip_address)
                VALUES (:tenant_id, :user_id, :action, :resource_type, :resource_id, :details, :ip_address)
            """), {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "details": json.dumps(details or {}),
                "ip_address": ip_address,
            })
            conn.commit()
    except Exception as e:
        logger.error("Audit log failed: %s", e)
