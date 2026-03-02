from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text

from api.database import engine
from api.models import RLSRuleCreate, RLSRuleUpdate, RLSRuleResponse
from api.auth.dependencies import require_admin

router = APIRouter(prefix="/api/rls", tags=["rls"])

_RLS_COLS = "id, connection_id, table_name, column_name, user_id, group_name, filter_value, created_at"


@router.get("", response_model=list[RLSRuleResponse], summary="List RLS rules")
def list_rls_rules(current_user: dict = Depends(require_admin)):
    """Return all row-level security rules ordered by connection and table (admin only)."""
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT {_RLS_COLS} FROM rls_rules ORDER BY connection_id, table_name"))
        return [dict(row) for row in result.mappings().all()]


@router.post("", response_model=RLSRuleResponse, status_code=201, summary="Create RLS rule")
def create_rls_rule(req: RLSRuleCreate, current_user: dict = Depends(require_admin)):
    """Create a new row-level security filter rule and invalidate the RLS cache (admin only)."""
    with engine.connect() as conn:
        result = conn.execute(
            text(f"""
                INSERT INTO rls_rules (connection_id, table_name, column_name, user_id, group_name, filter_value)
                VALUES (:connection_id, :table_name, :column_name, :user_id, :group_name, :filter_value)
                RETURNING {_RLS_COLS}
            """),
            {
                "connection_id": req.connection_id,
                "table_name": req.table_name,
                "column_name": req.column_name,
                "user_id": req.user_id,
                "group_name": req.group_name,
                "filter_value": req.filter_value,
            },
        )
        rule = dict(result.mappings().fetchone())
        conn.commit()
    _invalidate_rls_cache(req.connection_id, req.user_id)
    return rule


@router.put("/{rule_id}", response_model=RLSRuleResponse, summary="Update RLS rule")
def update_rls_rule(rule_id: int, req: RLSRuleUpdate, current_user: dict = Depends(require_admin)):
    """Update a row-level security rule and invalidate affected RLS caches (admin only)."""
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Fetch old rule for cache invalidation
    with engine.connect() as conn:
        old = conn.execute(text("SELECT connection_id, user_id FROM rls_rules WHERE id = :id"), {"id": rule_id}).mappings().fetchone()
    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = rule_id
    with engine.connect() as conn:
        conn.execute(text(f"UPDATE rls_rules SET {set_clauses} WHERE id = :id"), updates)
        conn.commit()
        result = conn.execute(text(f"SELECT {_RLS_COLS} FROM rls_rules WHERE id = :id"), {"id": rule_id})
        row = result.mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    if old:
        _invalidate_rls_cache(old["connection_id"], old["user_id"])
    _invalidate_rls_cache(row["connection_id"], row["user_id"])
    return dict(row)


@router.delete("/{rule_id}", status_code=204, summary="Delete RLS rule")
def delete_rls_rule(rule_id: int, current_user: dict = Depends(require_admin)):
    """Delete a row-level security rule and invalidate the RLS cache (admin only)."""
    with engine.connect() as conn:
        old = conn.execute(text("SELECT connection_id, user_id FROM rls_rules WHERE id = :id"), {"id": rule_id}).mappings().fetchone()
        conn.execute(text("DELETE FROM rls_rules WHERE id = :id"), {"id": rule_id})
        conn.commit()
    if old:
        _invalidate_rls_cache(old["connection_id"], old["user_id"])


def _invalidate_rls_cache(connection_id: int, user_id: int | None):
    """Invalidate RLS cache for a specific connection+user pair.
    If user_id is None (group rule), invalidate all cached entries for this connection."""
    from api.cache import rls_cache_key, delete_cached, delete_pattern
    if user_id is None:
        # Group-based rule — invalidate all users for this connection
        delete_pattern(f"rls:{connection_id}:*")
    else:
        delete_cached(rls_cache_key(connection_id, user_id))


def get_rls_filters(connection_id: int, user_id: int) -> dict[str, list[str]]:
    """Get RLS filters for a user on a connection. Cached in Redis for 1h.
    Matches rules by user_id directly OR by group_name membership.
    Cache is event-invalidated on RLS rule create/update/delete."""
    from api.cache import rls_cache_key, get_cached, set_cached

    key = rls_cache_key(connection_id, user_id)
    cached = get_cached(key)
    if cached is not None:
        return cached

    with engine.connect() as conn:
        # Get user's groups
        user_row = conn.execute(
            text("SELECT COALESCE(groups, '') as groups FROM users WHERE id = :uid"),
            {"uid": user_id},
        ).mappings().fetchone()
        user_groups = [
            g.strip() for g in (user_row["groups"] if user_row else "").split(",") if g.strip()
        ]

        if user_groups:
            result = conn.execute(
                text("""
                    SELECT column_name, filter_value FROM rls_rules
                    WHERE connection_id = :cid
                      AND (user_id = :uid OR group_name = ANY(:groups))
                """),
                {"cid": connection_id, "uid": user_id, "groups": user_groups},
            )
        else:
            result = conn.execute(
                text("""
                    SELECT column_name, filter_value FROM rls_rules
                    WHERE connection_id = :cid AND user_id = :uid
                """),
                {"cid": connection_id, "uid": user_id},
            )

        filters: dict[str, list[str]] = {}
        for row in result.mappings().all():
            col = row["column_name"]
            filters.setdefault(col, []).append(row["filter_value"])

    set_cached(key, filters, ttl=3600)
    return filters
