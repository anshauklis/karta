import api.json_util as json
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text

from api.database import engine
from api.models import VersionCreate, VersionLabelUpdate, VersionListItem, VersionDetail
from api.auth.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/dashboards", tags=["dashboard_versions"])

# ---------------------------------------------------------------------------
# Snapshot builder
# ---------------------------------------------------------------------------

def _build_snapshot(conn, dashboard_id: int) -> dict:
    """Build a full JSON snapshot of a dashboard's current state."""
    # Dashboard metadata
    dash = conn.execute(text("""
        SELECT title, description, icon, filter_layout, color_scheme
        FROM dashboards WHERE id = :id
    """), {"id": dashboard_id}).mappings().first()
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    metadata = dict(dash)

    # Charts
    charts = conn.execute(text("""
        SELECT id, title, description, mode, chart_type, chart_config, chart_code,
               sql_query, connection_id, dataset_id, variables,
               grid_x, grid_y, grid_w, grid_h, tab_id, position_order
        FROM charts WHERE dashboard_id = :did ORDER BY position_order
    """), {"did": dashboard_id}).mappings().all()
    charts_list = [dict(c) for c in charts]

    # Filters
    filters = conn.execute(text("""
        SELECT id, label, filter_type, target_column, default_value,
               sort_order, config, group_name
        FROM dashboard_filters WHERE dashboard_id = :did ORDER BY sort_order
    """), {"did": dashboard_id}).mappings().all()
    filters_list = [dict(f) for f in filters]

    # Tabs
    tabs = conn.execute(text("""
        SELECT id, title, position_order
        FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order
    """), {"did": dashboard_id}).mappings().all()
    tabs_list = [dict(t) for t in tabs]

    return {
        "metadata": metadata,
        "charts": charts_list,
        "filters": filters_list,
        "tabs": tabs_list,
    }


def _next_version_number(conn, dashboard_id: int) -> int:
    row = conn.execute(text("""
        SELECT COALESCE(MAX(version_number), 0) FROM dashboard_versions
        WHERE dashboard_id = :did
    """), {"did": dashboard_id}).scalar()
    return row + 1


def _prune_auto_versions(conn, dashboard_id: int, max_auto: int = 50):
    """Delete oldest auto-versions beyond the limit."""
    conn.execute(text("""
        DELETE FROM dashboard_versions
        WHERE id IN (
            SELECT id FROM dashboard_versions
            WHERE dashboard_id = :did AND is_auto = TRUE
            ORDER BY version_number DESC
            OFFSET :keep
        )
    """), {"did": dashboard_id, "keep": max_auto})


def create_auto_version(dashboard_id: int, user_id: int) -> bool:
    """Create an auto-version if the last one is older than 5 minutes.

    Returns True if a version was created, False if skipped (debounce).
    Call this from dashboard/layout update endpoints.
    """
    with engine.connect() as conn:
        # Check debounce: last auto-version must be > 5 min ago
        last = conn.execute(text("""
            SELECT created_at FROM dashboard_versions
            WHERE dashboard_id = :did AND is_auto = TRUE
            ORDER BY version_number DESC LIMIT 1
        """), {"did": dashboard_id}).scalar()

        if last:
            from datetime import datetime, timezone, timedelta
            now = datetime.now(timezone.utc)
            if last.tzinfo is None:
                from datetime import timezone as tz
                last = last.replace(tzinfo=tz.utc)
            if (now - last) < timedelta(minutes=5):
                return False

        snapshot = _build_snapshot(conn, dashboard_id)
        version_number = _next_version_number(conn, dashboard_id)

        conn.execute(text("""
            INSERT INTO dashboard_versions (dashboard_id, version_number, label, is_auto, snapshot, created_by)
            VALUES (:did, :vn, '', TRUE, CAST(:snap AS jsonb), :uid)
        """), {
            "did": dashboard_id,
            "vn": version_number,
            "snap": json.dumps(snapshot, default=str),
            "uid": user_id,
        })

        _prune_auto_versions(conn, dashboard_id)
        conn.commit()
        return True


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

@router.get("/{dashboard_id}/versions", response_model=list[VersionListItem],
            summary="List dashboard versions")
def list_versions(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT v.id, v.dashboard_id, v.version_number, v.label, v.is_auto,
                   v.created_by, u.name AS created_by_name, v.created_at
            FROM dashboard_versions v
            LEFT JOIN users u ON v.created_by = u.id
            WHERE v.dashboard_id = :did
            ORDER BY v.version_number DESC
        """), {"did": dashboard_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{dashboard_id}/versions/{version_id}", response_model=VersionDetail,
            summary="Get version with snapshot")
def get_version(dashboard_id: int, version_id: int, current_user: dict = Depends(get_current_user)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT id, dashboard_id, version_number, label, is_auto, snapshot, created_by, created_at
            FROM dashboard_versions
            WHERE id = :vid AND dashboard_id = :did
        """), {"vid": version_id, "did": dashboard_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Version not found")
    return dict(row)


@router.post("/{dashboard_id}/versions", response_model=VersionListItem, status_code=201,
             summary="Create manual version")
def create_version(dashboard_id: int, req: VersionCreate,
                   current_user: dict = require_role("editor", "admin")):
    user_id = int(current_user["sub"])
    with engine.connect() as conn:
        snapshot = _build_snapshot(conn, dashboard_id)
        version_number = _next_version_number(conn, dashboard_id)

        row = conn.execute(text("""
            INSERT INTO dashboard_versions (dashboard_id, version_number, label, is_auto, snapshot, created_by)
            VALUES (:did, :vn, :label, FALSE, CAST(:snap AS jsonb), :uid)
            RETURNING id, dashboard_id, version_number, label, is_auto, created_by, created_at
        """), {
            "did": dashboard_id,
            "vn": version_number,
            "label": req.label,
            "snap": json.dumps(snapshot, default=str),
            "uid": user_id,
        }).mappings().first()
        conn.commit()
    return dict(row)


@router.post("/{dashboard_id}/versions/{version_id}/restore",
             summary="Restore dashboard to a version")
def restore_version(dashboard_id: int, version_id: int,
                    current_user: dict = require_role("editor", "admin")):
    user_id = int(current_user["sub"])

    with engine.connect() as conn:
        # Load the target version
        ver = conn.execute(text("""
            SELECT snapshot FROM dashboard_versions
            WHERE id = :vid AND dashboard_id = :did
        """), {"vid": version_id, "did": dashboard_id}).mappings().first()
        if not ver:
            raise HTTPException(status_code=404, detail="Version not found")

        snap = ver["snapshot"]
        if isinstance(snap, str):
            snap = json.loads(snap)

        # 1. Create a pre-restore auto-version (so restore is undoable)
        pre_snapshot = _build_snapshot(conn, dashboard_id)
        pre_vn = _next_version_number(conn, dashboard_id)
        conn.execute(text("""
            INSERT INTO dashboard_versions (dashboard_id, version_number, label, is_auto, snapshot, created_by)
            VALUES (:did, :vn, 'Before restore', TRUE, CAST(:snap AS jsonb), :uid)
        """), {
            "did": dashboard_id,
            "vn": pre_vn,
            "snap": json.dumps(pre_snapshot, default=str),
            "uid": user_id,
        })

        meta = snap["metadata"]

        # 2. Update dashboard metadata
        conn.execute(text("""
            UPDATE dashboards
            SET title = :title, description = :description, icon = :icon,
                filter_layout = CAST(:fl AS jsonb), color_scheme = :cs, updated_at = NOW()
            WHERE id = :id
        """), {
            "id": dashboard_id,
            "title": meta["title"],
            "description": meta.get("description", ""),
            "icon": meta.get("icon", "\U0001f4ca"),
            "fl": json.dumps(meta.get("filter_layout", {})),
            "cs": meta.get("color_scheme"),
        })

        # 3. Recreate tabs — delete all, re-insert, build old_id -> new_id map
        conn.execute(text(
            "UPDATE charts SET tab_id = NULL WHERE dashboard_id = :did"
        ), {"did": dashboard_id})
        conn.execute(text(
            "DELETE FROM dashboard_tabs WHERE dashboard_id = :did"
        ), {"did": dashboard_id})

        tab_map = {}  # old snapshot tab id -> new tab id
        for tab in snap.get("tabs", []):
            new_tab = conn.execute(text("""
                INSERT INTO dashboard_tabs (dashboard_id, title, position_order)
                VALUES (:did, :title, :pos) RETURNING id
            """), {
                "did": dashboard_id,
                "title": tab["title"],
                "pos": tab["position_order"],
            }).mappings().first()
            tab_map[tab["id"]] = new_tab["id"]

        # If no tabs in snapshot, create a default
        if not snap.get("tabs"):
            conn.execute(text("""
                INSERT INTO dashboard_tabs (dashboard_id, title, position_order)
                VALUES (:did, 'Main', 0) RETURNING id
            """), {"did": dashboard_id})

        # 4. Recreate charts — delete existing, re-insert from snapshot
        conn.execute(text(
            "DELETE FROM charts WHERE dashboard_id = :did"
        ), {"did": dashboard_id})

        for chart in snap.get("charts", []):
            new_tab_id = tab_map.get(chart.get("tab_id")) if chart.get("tab_id") else None
            config_json = json.dumps(chart["chart_config"]) if chart.get("chart_config") else "{}"
            variables_json = json.dumps(chart.get("variables")) if chart.get("variables") else "[]"
            conn.execute(text("""
                INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, description,
                    mode, chart_type, chart_config, chart_code, sql_query, variables,
                    position_order, grid_x, grid_y, grid_w, grid_h, tab_id, created_by)
                VALUES (:did, :cid, :dsid, :title, :desc,
                    :mode, :ctype, CAST(:config AS jsonb), :code, :sql, CAST(:vars AS jsonb),
                    :pos, :gx, :gy, :gw, :gh, :tid, :uid)
            """), {
                "did": dashboard_id,
                "cid": chart.get("connection_id"),
                "dsid": chart.get("dataset_id"),
                "title": chart["title"],
                "desc": chart.get("description", ""),
                "mode": chart.get("mode", "visual"),
                "ctype": chart.get("chart_type"),
                "config": config_json,
                "code": chart.get("chart_code", ""),
                "sql": chart.get("sql_query", ""),
                "vars": variables_json,
                "pos": chart.get("position_order", 0),
                "gx": chart.get("grid_x", 0),
                "gy": chart.get("grid_y", 0),
                "gw": chart.get("grid_w", 6),
                "gh": chart.get("grid_h", 4),
                "tid": new_tab_id,
                "uid": user_id,
            })

        # 5. Recreate filters
        conn.execute(text(
            "DELETE FROM dashboard_filters WHERE dashboard_id = :did"
        ), {"did": dashboard_id})

        for f in snap.get("filters", []):
            filter_config = json.dumps(f.get("config", {})) if f.get("config") else "{}"
            conn.execute(text("""
                INSERT INTO dashboard_filters (dashboard_id, label, filter_type, target_column,
                    default_value, sort_order, config, group_name)
                VALUES (:did, :label, :ftype, :col, :default, :order, CAST(:config AS jsonb), :group)
            """), {
                "did": dashboard_id,
                "label": f["label"],
                "ftype": f["filter_type"],
                "col": f["target_column"],
                "default": f.get("default_value"),
                "order": f.get("sort_order", 0),
                "config": filter_config,
                "group": f.get("group_name"),
            })

        conn.commit()

    return {"status": "restored", "version_id": version_id}


@router.put("/{dashboard_id}/versions/{version_id}", response_model=VersionListItem,
            summary="Update version label")
def update_version_label(dashboard_id: int, version_id: int, req: VersionLabelUpdate,
                         current_user: dict = require_role("editor", "admin")):
    with engine.connect() as conn:
        row = conn.execute(text("""
            UPDATE dashboard_versions SET label = :label
            WHERE id = :vid AND dashboard_id = :did
            RETURNING id, dashboard_id, version_number, label, is_auto, created_by, created_at
        """), {"vid": version_id, "did": dashboard_id, "label": req.label}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Version not found")
        conn.commit()
    return dict(row)


@router.delete("/{dashboard_id}/versions/{version_id}", status_code=204,
               summary="Delete a version")
def delete_version(dashboard_id: int, version_id: int,
                   current_user: dict = require_role("editor", "admin")):
    with engine.connect() as conn:
        result = conn.execute(text("""
            DELETE FROM dashboard_versions WHERE id = :vid AND dashboard_id = :did
        """), {"vid": version_id, "did": dashboard_id})
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Version not found")
        conn.commit()
