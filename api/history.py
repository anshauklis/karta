"""Shared change history helpers."""

import json
from sqlalchemy import text
from api.database import engine


def record_change(entity_type: str, entity_id: int, user_id: int, action: str, changes: dict):
    """Insert a change history record."""
    try:
        with engine.connect() as conn:
            conn.execute(
                text("""
                    INSERT INTO change_history (entity_type, entity_id, user_id, action, changes)
                    VALUES (:et, :eid, :uid, :action, CAST(:changes AS jsonb))
                """),
                {"et": entity_type, "eid": entity_id, "uid": user_id,
                 "action": action, "changes": json.dumps(changes, default=str)},
            )
            conn.commit()
    except Exception:
        pass  # Don't break the request


def compute_diff(old: dict, new: dict, fields: list[str]) -> dict:
    """Compute diff for specified fields, returning only changed ones."""
    diff = {}
    for f in fields:
        old_val = old.get(f)
        new_val = new.get(f)
        if old_val != new_val:
            diff[f] = {"old": old_val, "new": new_val}
    return diff
