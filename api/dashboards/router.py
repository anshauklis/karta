import json
import re
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text

from api.database import engine
from api.models import DashboardCreate, DashboardUpdate, DashboardResponse
from api.auth.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return slug or "dashboard"


_DASHBOARD_COLS = """d.id, d.title, d.description, d.icon, d.url_slug, d.sort_order,
    d.created_by, d.created_at, d.updated_at, d.is_archived, d.filter_layout, d.color_scheme"""

_DASHBOARD_QUERY = f"""
    SELECT {_DASHBOARD_COLS},
           COALESCE(c.chart_count, 0) as chart_count
    FROM dashboards d
    LEFT JOIN (
        SELECT dashboard_id, COUNT(*) as chart_count
        FROM charts GROUP BY dashboard_id
    ) c ON c.dashboard_id = d.id
"""


def _get_dashboard_owners(conn, dashboard_id: int) -> list[dict]:
    result = conn.execute(text("""
        SELECT u.id, u.email, u.name
        FROM dashboard_owners do_
        JOIN users u ON u.id = do_.user_id
        WHERE do_.dashboard_id = :did
        ORDER BY u.name
    """), {"did": dashboard_id})
    return [dict(r) for r in result.mappings().all()]


def _get_dashboard_roles(conn, dashboard_id: int) -> list[str]:
    result = conn.execute(text("""
        SELECT group_name FROM dashboard_roles
        WHERE dashboard_id = :did ORDER BY group_name
    """), {"did": dashboard_id})
    return [r["group_name"] for r in result.mappings().all()]


def _set_dashboard_owners(conn, dashboard_id: int, owner_ids: list[int]):
    conn.execute(text("DELETE FROM dashboard_owners WHERE dashboard_id = :did"), {"did": dashboard_id})
    for uid in owner_ids:
        conn.execute(text(
            "INSERT INTO dashboard_owners (dashboard_id, user_id) VALUES (:did, :uid)"
        ), {"did": dashboard_id, "uid": uid})


def _set_dashboard_roles(conn, dashboard_id: int, roles: list[str]):
    conn.execute(text("DELETE FROM dashboard_roles WHERE dashboard_id = :did"), {"did": dashboard_id})
    for role in roles:
        if role.strip():
            conn.execute(text(
                "INSERT INTO dashboard_roles (dashboard_id, group_name) VALUES (:did, :gn)"
            ), {"did": dashboard_id, "gn": role.strip()})


def _enrich_dashboard(conn, dashboard: dict) -> dict:
    did = dashboard["id"]
    dashboard["owners"] = _get_dashboard_owners(conn, did)
    dashboard["roles"] = _get_dashboard_roles(conn, did)
    return dashboard


def _enrich_dashboards(conn, dashboards: list[dict]) -> list[dict]:
    if not dashboards:
        return dashboards
    dids = [d["id"] for d in dashboards]
    placeholders = ", ".join(f":d{i}" for i in range(len(dids)))
    params = {f"d{i}": did for i, did in enumerate(dids)}

    # Batch fetch owners
    owners_result = conn.execute(text(f"""
        SELECT do_.dashboard_id, u.id, u.email, u.name
        FROM dashboard_owners do_
        JOIN users u ON u.id = do_.user_id
        WHERE do_.dashboard_id IN ({placeholders})
    """), params)
    owners_by_did: dict[int, list[dict]] = {}
    for r in owners_result.mappings().all():
        owners_by_did.setdefault(r["dashboard_id"], []).append(
            {"id": r["id"], "email": r["email"], "name": r["name"]}
        )

    # Batch fetch roles
    roles_result = conn.execute(text(f"""
        SELECT dashboard_id, group_name FROM dashboard_roles
        WHERE dashboard_id IN ({placeholders})
    """), params)
    roles_by_did: dict[int, list[str]] = {}
    for r in roles_result.mappings().all():
        roles_by_did.setdefault(r["dashboard_id"], []).append(r["group_name"])

    for d in dashboards:
        d["owners"] = owners_by_did.get(d["id"], [])
        d["roles"] = sorted(roles_by_did.get(d["id"], []))
    return dashboards


def _user_can_see_dashboard(dashboard: dict, user_id: int, user_groups: list[str], is_admin: bool) -> bool:
    """Check if a user can see a dashboard based on roles/owners.
    If no roles are set, everyone can see it (backward-compatible).
    """
    if is_admin:
        return True
    if not dashboard.get("roles"):
        return True
    # Check if user is an owner
    if any(o["id"] == user_id for o in dashboard.get("owners", [])):
        return True
    # Check if user has a matching group
    for role in dashboard["roles"]:
        if role in user_groups:
            return True
    return False


def _get_user_groups(user_id: int) -> list[str]:
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT COALESCE(groups, '') as groups FROM users WHERE id = :id"),
            {"id": user_id}
        )
        row = result.mappings().fetchone()
    if not row or not row["groups"]:
        return []
    return [g.strip() for g in row["groups"].split(",") if g.strip()]


@router.get("/groups", summary="List dashboard groups")
def list_groups(current_user: dict = Depends(get_current_user)):
    """List all unique group names used by dashboards."""
    with engine.connect() as conn:
        result = conn.execute(text("SELECT DISTINCT groups FROM users WHERE groups IS NOT NULL AND groups != ''"))
        all_groups: set[str] = set()
        for row in result.mappings().all():
            for g in row["groups"].split(","):
                g = g.strip()
                if g:
                    all_groups.add(g)
    return sorted(all_groups)


@router.get("", response_model=list[DashboardResponse], summary="List dashboards")
def list_dashboards(
    q: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """List all non-archived dashboards with chart counts and owner info.

    Supports optional search (q) and pagination (limit, offset). When limit or q is
    provided, returns paginated results with X-Total-Count header. Access control
    (roles/owners) is always enforced. Without these params, returns all dashboards
    (backward-compatible).
    """
    user_id = int(current_user["sub"])
    is_admin = current_user.get("is_admin", False)
    user_groups = _get_user_groups(user_id)
    use_pagination = q is not None or limit is not None

    conditions = ["d.is_archived = FALSE"]
    params: dict = {}

    if q is not None:
        conditions.append("(d.title ILIKE :q OR d.description ILIKE :q)")
        params["q"] = f"%{q}%"

    where_clause = " WHERE " + " AND ".join(conditions)

    with engine.connect() as conn:
        result = conn.execute(text(f"""
            {_DASHBOARD_QUERY}
            {where_clause}
            ORDER BY d.sort_order, d.created_at
        """), params)
        dashboards = [dict(row) for row in result.mappings().all()]
        dashboards = _enrich_dashboards(conn, dashboards)

    # Filter by access control (must happen in Python after enrichment)
    visible = [d for d in dashboards if _user_can_see_dashboard(d, user_id, user_groups, is_admin)]

    if use_pagination:
        total = len(visible)
        effective_limit = min(limit or 50, 200)
        page = visible[offset:offset + effective_limit]
        content = json.loads(json.dumps(page, default=str))
        return JSONResponse(content=content, headers={"X-Total-Count": str(total)})

    return visible


@router.get("/by-slug/{slug}", response_model=DashboardResponse, summary="Get dashboard by slug")
def get_dashboard_by_slug(slug: str, current_user: dict = Depends(get_current_user)):
    """Get a dashboard by its URL slug."""
    with engine.connect() as conn:
        result = conn.execute(text(f"""
            {_DASHBOARD_QUERY}
            WHERE d.url_slug = :slug AND d.is_archived = FALSE
        """), {"slug": slug})
        row = result.mappings().fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Dashboard not found")

        dashboard = dict(row)
        dashboard = _enrich_dashboard(conn, dashboard)

    # Access control check
    user_id = int(current_user["sub"])
    is_admin = current_user.get("is_admin", False)
    user_groups = _get_user_groups(user_id)
    if not _user_can_see_dashboard(dashboard, user_id, user_groups, is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    # Track view
    from api.analytics.router import track_view
    track_view(user_id, "dashboard", dashboard["id"])

    return dashboard


@router.post("", response_model=DashboardResponse, status_code=201, summary="Create dashboard")
def create_dashboard(req: DashboardCreate, current_user: dict = require_role("editor", "admin")):
    """Create a new dashboard. Auto-generates a URL slug from the title."""
    user_id = int(current_user["sub"])
    slug = _slugify(req.title)

    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT COUNT(*) FROM dashboards WHERE url_slug LIKE :slug"),
            {"slug": f"{slug}%"}
        ).scalar()
        if existing > 0:
            slug = f"{slug}-{existing + 1}"

        max_order = conn.execute(text("SELECT COALESCE(MAX(sort_order), -1) FROM dashboards")).scalar()

        result = conn.execute(
            text("""
                INSERT INTO dashboards (title, description, icon, url_slug, sort_order, created_by)
                VALUES (:title, :description, :icon, :slug, :sort_order, :created_by)
                RETURNING id, title, description, icon, url_slug, sort_order, created_by,
                          created_at, updated_at, is_archived, filter_layout, color_scheme
            """),
            {
                "title": req.title,
                "description": req.description,
                "icon": req.icon,
                "slug": slug,
                "sort_order": max_order + 1,
                "created_by": user_id,
            }
        )
        dashboard = dict(result.mappings().fetchone())
        dashboard["chart_count"] = 0

        # Auto-add creator as owner
        conn.execute(text(
            "INSERT INTO dashboard_owners (dashboard_id, user_id) VALUES (:did, :uid)"
        ), {"did": dashboard["id"], "uid": user_id})

        # Auto-create default tab
        conn.execute(
            text("INSERT INTO dashboard_tabs (dashboard_id, title, position_order) VALUES (:did, 'Main', 0)"),
            {"did": dashboard["id"]},
        )
        conn.commit()

        dashboard = _enrich_dashboard(conn, dashboard)

    return dashboard


@router.get("/{dashboard_id}", response_model=DashboardResponse, summary="Get dashboard")
def get_dashboard(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Get a dashboard by ID."""
    user_id = int(current_user["sub"])
    is_admin = current_user.get("is_admin", False)

    with engine.connect() as conn:
        result = conn.execute(text(f"""
            {_DASHBOARD_QUERY}
            WHERE d.id = :id AND d.is_archived = FALSE
        """), {"id": dashboard_id})
        row = result.mappings().fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Dashboard not found")

        dashboard = dict(row)
        dashboard = _enrich_dashboard(conn, dashboard)

    user_groups = _get_user_groups(user_id)
    if not _user_can_see_dashboard(dashboard, user_id, user_groups, is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    return dashboard


@router.put("/{dashboard_id}", response_model=DashboardResponse, summary="Update dashboard")
def update_dashboard(dashboard_id: int, req: DashboardUpdate, current_user: dict = require_role("editor", "admin")):
    """Update dashboard title, description, icon, slug, color scheme, owners, or roles."""
    from api.history import record_change, compute_diff

    updates = req.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Track changes
    old_dashboard = get_dashboard(dashboard_id, current_user)
    diff = compute_diff(old_dashboard, updates, list(updates.keys()))
    if diff:
        record_change("dashboard", dashboard_id, int(current_user["sub"]), "updated", diff)

    # Handle junction tables separately — these can be None (unset) or a list
    owner_ids = updates.pop("owner_ids", None)
    roles = updates.pop("roles", None)

    # Handle url_slug update with validation
    if "url_slug" in updates:
        new_slug = updates["url_slug"]
        if not re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", new_slug):
            raise HTTPException(status_code=400, detail="Invalid slug format. Use lowercase letters, numbers, and hyphens.")
        with engine.connect() as conn:
            existing = conn.execute(text(
                "SELECT id FROM dashboards WHERE url_slug = :slug AND id != :id"
            ), {"slug": new_slug, "id": dashboard_id}).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="This URL slug is already taken")

    # Build SET clause for dashboard columns
    if updates:
        if "filter_layout" in updates:
            import json
            updates["filter_layout"] = json.dumps(updates["filter_layout"])
        set_clauses = ", ".join(
            f"{k} = CAST(:{k} AS jsonb)" if k == "filter_layout" else f"{k} = :{k}"
            for k in updates
        )
        updates["id"] = dashboard_id

        with engine.connect() as conn:
            conn.execute(
                text(f"UPDATE dashboards SET {set_clauses}, updated_at = NOW() WHERE id = :id"),
                updates
            )
            conn.commit()

    # Update owners and roles
    if owner_ids is not None or roles is not None:
        with engine.connect() as conn:
            if owner_ids is not None:
                _set_dashboard_owners(conn, dashboard_id, owner_ids)
            if roles is not None:
                _set_dashboard_roles(conn, dashboard_id, roles)
            conn.commit()

    return get_dashboard(dashboard_id, current_user)


@router.delete("/{dashboard_id}", status_code=204, summary="Delete dashboard")
def delete_dashboard(dashboard_id: int, current_user: dict = require_role("editor", "admin")):
    """Soft-delete a dashboard by setting is_archived=true."""
    with engine.connect() as conn:
        conn.execute(
            text("UPDATE dashboards SET is_archived = TRUE, updated_at = NOW() WHERE id = :id"),
            {"id": dashboard_id}
        )
        conn.commit()


@router.post("/{dashboard_id}/clone", response_model=DashboardResponse, status_code=201, summary="Clone dashboard")
def clone_dashboard(dashboard_id: int, current_user: dict = require_role("editor", "admin")):
    """Create a complete copy of a dashboard including tabs, charts, and filters."""
    user_id = int(current_user["sub"])

    with engine.connect() as conn:
        # 1. Get original dashboard
        original = conn.execute(text(f"""
            {_DASHBOARD_QUERY}
            WHERE d.id = :id
        """), {"id": dashboard_id}).mappings().fetchone()
        if not original:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        original = dict(original)

        # 2. Create new dashboard with "Copy of" title and unique slug
        new_title = f"Copy of {original['title']}"
        new_slug = _slugify(new_title)
        existing = conn.execute(
            text("SELECT COUNT(*) FROM dashboards WHERE url_slug LIKE :slug"),
            {"slug": f"{new_slug}%"}
        ).scalar()
        if existing > 0:
            new_slug = f"{new_slug}-{existing + 1}"

        max_order = conn.execute(text("SELECT COALESCE(MAX(sort_order), -1) FROM dashboards")).scalar()

        new_dash = conn.execute(text("""
            INSERT INTO dashboards (title, description, icon, url_slug, sort_order, created_by, filter_layout, color_scheme)
            VALUES (:title, :desc, :icon, :slug, :sort_order, :uid, :filter_layout, :color_scheme)
            RETURNING id, title, description, icon, url_slug, sort_order, created_by,
                      created_at, updated_at, is_archived, filter_layout, color_scheme
        """), {
            "title": new_title,
            "desc": original["description"],
            "icon": original["icon"],
            "slug": new_slug,
            "sort_order": max_order + 1,
            "uid": user_id,
            "filter_layout": json.dumps(original["filter_layout"]) if original.get("filter_layout") else "{}",
            "color_scheme": original.get("color_scheme"),
        }).mappings().fetchone()
        new_dash_id = new_dash["id"]

        # Add creator as owner
        conn.execute(text(
            "INSERT INTO dashboard_owners (dashboard_id, user_id) VALUES (:did, :uid)"
        ), {"did": new_dash_id, "uid": user_id})

        # 3. Copy tabs -> build old_tab_id -> new_tab_id map
        tab_map = {}  # old_id -> new_id
        tabs = conn.execute(text(
            "SELECT id, title, position_order FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order"
        ), {"did": dashboard_id}).mappings().all()

        for tab in tabs:
            new_tab = conn.execute(text("""
                INSERT INTO dashboard_tabs (dashboard_id, title, position_order)
                VALUES (:did, :title, :pos) RETURNING id
            """), {"did": new_dash_id, "title": tab["title"], "pos": tab["position_order"]}).mappings().fetchone()
            tab_map[tab["id"]] = new_tab["id"]

        # If no tabs were copied, create a default tab
        if not tabs:
            conn.execute(text(
                "INSERT INTO dashboard_tabs (dashboard_id, title, position_order) VALUES (:did, 'Main', 0)"
            ), {"did": new_dash_id})

        # 4. Copy charts -> remap dashboard_id and tab_id
        charts = conn.execute(text("""
            SELECT connection_id, dataset_id, title, description, mode,
                   chart_type, chart_config, chart_code, sql_query, position_order,
                   grid_x, grid_y, grid_w, grid_h, tab_id
            FROM charts WHERE dashboard_id = :did ORDER BY position_order
        """), {"did": dashboard_id}).mappings().all()

        for chart in charts:
            new_tab_id = tab_map.get(chart["tab_id"]) if chart["tab_id"] else None
            config_json = json.dumps(chart["chart_config"]) if chart["chart_config"] else "{}"
            conn.execute(text("""
                INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, description, mode,
                    chart_type, chart_config, chart_code, sql_query, position_order,
                    grid_x, grid_y, grid_w, grid_h, tab_id, created_by)
                VALUES (:did, :cid, :dsid, :title, :desc, :mode,
                    :ctype, CAST(:config AS jsonb), :code, :sql, :pos,
                    :gx, :gy, :gw, :gh, :tid, :uid)
            """), {
                "did": new_dash_id,
                "cid": chart["connection_id"],
                "dsid": chart["dataset_id"],
                "title": chart["title"],
                "desc": chart["description"],
                "mode": chart["mode"],
                "ctype": chart["chart_type"],
                "config": config_json,
                "code": chart["chart_code"],
                "sql": chart["sql_query"],
                "pos": chart["position_order"],
                "gx": chart["grid_x"],
                "gy": chart["grid_y"],
                "gw": chart["grid_w"],
                "gh": chart["grid_h"],
                "tid": new_tab_id,
                "uid": user_id,
            })

        # 5. Copy filters -> remap dashboard_id
        filters = conn.execute(text("""
            SELECT label, filter_type, target_column, default_value, sort_order, config, group_name
            FROM dashboard_filters WHERE dashboard_id = :did ORDER BY sort_order
        """), {"did": dashboard_id}).mappings().all()

        for f in filters:
            filter_config = json.dumps(f["config"]) if f["config"] else "{}"
            conn.execute(text("""
                INSERT INTO dashboard_filters (dashboard_id, label, filter_type, target_column,
                    default_value, sort_order, config, group_name)
                VALUES (:did, :label, :ftype, :col, :default, :order, CAST(:config AS jsonb), :group)
            """), {
                "did": new_dash_id,
                "label": f["label"],
                "ftype": f["filter_type"],
                "col": f["target_column"],
                "default": f["default_value"],
                "order": f["sort_order"],
                "config": filter_config,
                "group": f["group_name"],
            })

        conn.commit()

    # Return the new dashboard via get_dashboard
    return get_dashboard(new_dash_id, current_user)
