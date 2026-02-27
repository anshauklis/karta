"""
Tools available to the LLM via function calling.

Each tool is a plain async function that takes typed parameters and returns
a JSON-serializable dict. The TOOL_DEFINITIONS list provides the OpenAI
function-calling schema sent with chat requests.
"""

import json
import logging
import re

from sqlalchemy import text

from api.database import engine
from api.connections.router import (
    _get_connection_with_password,
    get_engine_for_connection,
)
from api.sql_validator import validate_sql, SQLValidationError

logger = logging.getLogger(__name__)


def _build_chart_config(
    chart_type: str,
    x_column: str | None = None,
    y_columns: list[str] | None = None,
    color_column: str | None = None,
    aggregate: str = "SUM",
    time_column: str | None = None,
    time_grain: str | None = None,
) -> dict:
    """Build chart_config from simplified parameters with sensible defaults."""
    config = {
        "show_legend": True,
        "legend_position": "auto",
        "show_values": False,
        "color_palette": "default",
        "number_format": "",
        "sort_order": "none",
    }
    if x_column:
        config["x_column"] = x_column
    if y_columns:
        config["y_columns"] = y_columns
    if color_column:
        config["color_column"] = color_column
    if time_column:
        config["time_column"] = time_column
        config["time_grain"] = time_grain or "month"
        config["time_range"] = "all"
    if y_columns and aggregate:
        config["metrics"] = [
            {"column": col, "aggregate": aggregate, "label": f"{aggregate}({col})"}
            for col in y_columns
        ]
    if chart_type == "bar":
        config["stack_mode"] = "none"
    elif chart_type == "bar_h":
        config["stack_mode"] = "none"
        config["orientation"] = "horizontal"
    elif chart_type in ("area",):
        config["stack_mode"] = "stacked"
    elif chart_type == "donut":
        config["donut_hole"] = 0.4
    elif chart_type == "histogram":
        config["bins"] = 20
    return config


# --- Tool implementations ---

async def search_content(query: str, user_id: int) -> dict:
    """Full-text search across charts and dashboards."""
    pattern = f"%{query}%"
    with engine.connect() as conn:
        rows = conn.execute(text("""
            (SELECT 'chart' AS type, c.id, c.title, c.description,
                    c.sql_query, d.url_slug AS dashboard_slug, d.title AS dashboard_title
             FROM charts c
             LEFT JOIN dashboards d ON d.id = c.dashboard_id
             WHERE c.title ILIKE :q OR c.description ILIKE :q OR c.sql_query ILIKE :q
             LIMIT 10)
            UNION ALL
            (SELECT 'dashboard' AS type, d.id, d.title, d.description,
                    '' AS sql_query, d.url_slug AS dashboard_slug, '' AS dashboard_title
             FROM dashboards d
             WHERE d.title ILIKE :q OR d.description ILIKE :q
             LIMIT 10)
        """), {"q": pattern})
        results = [dict(r) for r in rows.mappings().all()]
    return {"results": results, "count": len(results)}


async def get_connections(user_id: int) -> dict:
    """List available DB connections."""
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, name, db_type, host, port, database_name "
            "FROM connections ORDER BY name"
        ))
        items = [dict(r) for r in rows.mappings().all()]
    return {"connections": items}


async def get_schema(connection_id: int) -> dict:
    """Get tables and columns with types for a connection."""
    row = _get_connection_with_password(connection_id)
    eng, spec = get_engine_for_connection(row)
    tables = spec.get_schema(eng)
    return {"tables": [
        {"table_name": t["table_name"],
         "columns": [{"name": c["name"], "type": c["type"]} for c in t["columns"]]}
        for t in tables
    ]}


async def get_sample(connection_id: int, table_name: str, limit: int = 10) -> dict:
    """Get first N rows of a table."""
    limit = min(limit, 50)
    row = _get_connection_with_password(connection_id)

    # Validate table_name: alphanumeric + underscore only
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_.]*$', table_name):
        return {"error": "Invalid table name"}

    sql = f'SELECT * FROM "{table_name}" LIMIT {limit}'
    eng, spec = get_engine_for_connection(row)

    if row["db_type"] == "duckdb":
        df = spec.execute_native(row["database_name"], sql)
        return {
            "columns": df.columns.tolist(),
            "rows": df.values.tolist()[:limit],
            "row_count": len(df),
        }
    else:
        with eng.connect() as conn:
            result = conn.execute(text(sql))
            columns = list(result.keys())
            rows = [list(r) for r in result.fetchall()]
            return {"columns": columns, "rows": rows, "row_count": len(rows)}


async def get_table_profile(connection_id: int, table_name: str) -> dict:
    """Get column types, sample values, and distinct counts for a table.

    Returns everything needed to write correct SQL in one call.
    """
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_.]*$', table_name):
        return {"error": "Invalid table name"}

    row = _get_connection_with_password(connection_id)
    ext_engine, spec = get_engine_for_connection(row)

    with ext_engine.connect() as conn:
        from sqlalchemy import inspect as sa_inspect

        # Row count
        try:
            cnt = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar()
        except Exception:
            cnt = None

        # Sample rows
        sample_result = conn.execute(text(f'SELECT * FROM "{table_name}" LIMIT 3'))
        col_names = list(sample_result.keys())
        sample_rows = [
            {col_names[i]: (str(v) if v is not None and not isinstance(v, (str, bool, int, float)) else v)
             for i, v in enumerate(r)}
            for r in sample_result.fetchall()
        ]

        # Column types
        db_columns = sa_inspect(ext_engine).get_columns(table_name)
        col_info = [{"name": c["name"], "type": str(c["type"])} for c in db_columns]

        # Distinct values for string columns
        distinct_values = {}
        for ci in col_info:
            type_str = ci["type"].upper()
            if any(t in type_str for t in ("CHAR", "TEXT", "VARCHAR", "BOOL", "ENUM")):
                try:
                    dv = conn.execute(
                        text(f'SELECT "{ci["name"]}", COUNT(*) as cnt FROM "{table_name}" GROUP BY "{ci["name"]}" ORDER BY cnt DESC LIMIT 10')
                    )
                    distinct_values[ci["name"]] = [
                        {"value": str(r[0]) if r[0] is not None else None, "count": r[1]}
                        for r in dv.fetchall()
                    ]
                except Exception:
                    pass

    return {
        "table_name": table_name,
        "row_count": cnt,
        "columns": col_info,
        "sample_rows": sample_rows,
        "distinct_values": distinct_values,
    }


async def quick_create_chart(
    connection_id: int,
    sql_query: str,
    title: str,
    chart_type: str = "bar",
    x_column: str | None = None,
    y_columns: list[str] | None = None,
    color_column: str | None = None,
    aggregate: str = "SUM",
    dashboard_id: int | None = None,
    user_id: int = 0,
) -> dict:
    """One-shot chart creation: auto-creates dataset from SQL, then chart."""
    config = _build_chart_config(
        chart_type, x_column, y_columns, color_column, aggregate,
    )
    dataset_name = f"ds_{title[:40]}"

    with engine.connect() as conn:
        ds = conn.execute(text(
            "INSERT INTO datasets (connection_id, name, sql_query, dataset_type, created_by) "
            "VALUES (:cid, :name, :sql, 'virtual', :uid) RETURNING id"
        ), {"cid": connection_id, "name": dataset_name, "sql": sql_query, "uid": user_id}).mappings().fetchone()

        chart = conn.execute(text(
            "INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, mode, "
            "chart_type, chart_config, sql_query, created_by) "
            "VALUES (:did, :cid, :dsid, :title, 'visual', :ctype, :config, :sql, :uid) "
            "RETURNING id, title, dashboard_id"
        ), {
            "did": dashboard_id, "cid": connection_id, "dsid": ds["id"],
            "title": title, "ctype": chart_type,
            "config": json.dumps(config), "sql": sql_query, "uid": user_id,
        }).mappings().fetchone()
        conn.commit()

    result = dict(chart)
    result["dataset_id"] = ds["id"]
    return result


async def execute_sql(connection_id: int, sql: str) -> dict:
    """Execute a SELECT query and return results (max 200 rows)."""
    try:
        validated = validate_sql(sql, max_limit=200)
    except SQLValidationError as e:
        return {"error": str(e)}

    row = _get_connection_with_password(connection_id)
    eng, spec = get_engine_for_connection(row)

    try:
        if row["db_type"] == "duckdb":
            df = spec.execute_native(row["database_name"], validated)
            return {
                "columns": df.columns.tolist(),
                "rows": df.values.tolist(),
                "row_count": len(df),
            }
        else:
            with eng.connect() as conn:
                result = conn.execute(text(validated))
                columns = list(result.keys())
                rows = [list(r) for r in result.fetchall()]
                return {"columns": columns, "rows": rows, "row_count": len(rows)}
    except Exception as e:
        return {"error": str(e)}


async def list_dashboards() -> dict:
    """List dashboards with their chart counts."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT d.id, d.title, d.url_slug, d.description,
                   COUNT(c.id) AS chart_count
            FROM dashboards d
            LEFT JOIN charts c ON c.dashboard_id = d.id
            WHERE d.is_archived = FALSE
            GROUP BY d.id
            ORDER BY d.title
        """))
        items = [dict(r) for r in rows.mappings().all()]
    return {"dashboards": items}


async def get_chart_sql(chart_id: int) -> dict:
    """Get SQL query of a specific chart."""
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT id, title, sql_query, chart_type, mode, dashboard_id "
            "FROM charts WHERE id = :id"
        ), {"id": chart_id}).mappings().fetchone()
        if not row:
            return {"error": f"Chart {chart_id} not found"}
        return dict(row)


async def list_datasets() -> dict:
    """List all datasets."""
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, name, description, connection_id, dataset_type "
            "FROM datasets ORDER BY name"
        ))
        return {"datasets": [dict(r) for r in rows.mappings().all()]}


async def create_dataset(connection_id: int, name: str, sql_query: str, description: str = "", user_id: int = 0) -> dict:
    """Create a virtual dataset from SQL."""
    with engine.connect() as conn:
        row = conn.execute(text(
            "INSERT INTO datasets (connection_id, name, description, sql_query, dataset_type, created_by) "
            "VALUES (:cid, :name, :desc, :sql, 'virtual', :uid) "
            "RETURNING id, name"
        ), {"cid": connection_id, "name": name, "desc": description, "sql": sql_query, "uid": user_id})
        conn.commit()
        result = dict(row.mappings().fetchone())
    return result


async def create_chart(
    dataset_id: int,
    title: str,
    chart_type: str,
    x_column: str | None = None,
    y_columns: list[str] | None = None,
    color_column: str | None = None,
    aggregate: str = "SUM",
    time_column: str | None = None,
    time_grain: str | None = None,
    dashboard_id: int | None = None,
    sql_query: str | None = None,
    user_id: int = 0,
) -> dict:
    """Create a chart with simplified parameters."""
    config = _build_chart_config(
        chart_type, x_column, y_columns, color_column,
        aggregate, time_column, time_grain,
    )
    with engine.connect() as conn:
        # Resolve connection_id from dataset
        ds = conn.execute(text(
            "SELECT connection_id, sql_query FROM datasets WHERE id = :id"
        ), {"id": dataset_id}).mappings().fetchone()
        if not ds:
            return {"error": f"Dataset {dataset_id} not found"}

        connection_id = ds["connection_id"]
        final_sql = sql_query or ds["sql_query"]

        row = conn.execute(text(
            "INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, mode, "
            "chart_type, chart_config, sql_query, created_by) "
            "VALUES (:did, :cid, :dsid, :title, 'visual', :ctype, :config, :sql, :uid) "
            "RETURNING id, title, dashboard_id"
        ), {
            "did": dashboard_id, "cid": connection_id, "dsid": dataset_id,
            "title": title, "ctype": chart_type,
            "config": json.dumps(config), "sql": final_sql, "uid": user_id,
        })
        conn.commit()
        result = dict(row.mappings().fetchone())
    return result


async def update_chart(
    chart_id: int,
    title: str | None = None,
    chart_type: str | None = None,
    chart_config: dict | None = None,
    sql_query: str | None = None,
) -> dict:
    """Update an existing chart."""
    updates = {}
    if title is not None:
        updates["title"] = title
    if chart_type is not None:
        updates["chart_type"] = chart_type
    if chart_config is not None:
        updates["chart_config"] = json.dumps(chart_config)
    if sql_query is not None:
        updates["sql_query"] = sql_query
    if not updates:
        return {"error": "Nothing to update"}

    set_parts = [f"{k} = :{k}" for k in updates]
    set_parts.append("updated_at = NOW()")
    updates["id"] = chart_id

    with engine.connect() as conn:
        row = conn.execute(text(
            f"UPDATE charts SET {', '.join(set_parts)} WHERE id = :id "
            "RETURNING id, title"
        ), updates)
        conn.commit()
        result = row.mappings().fetchone()
        if not result:
            return {"error": f"Chart {chart_id} not found"}
        return dict(result)


async def delete_chart(chart_id: int) -> dict:
    """Delete a chart."""
    with engine.connect() as conn:
        result = conn.execute(text("DELETE FROM charts WHERE id = :id"), {"id": chart_id})
        conn.commit()
        if result.rowcount == 0:
            return {"error": f"Chart {chart_id} not found"}
    return {"deleted": True, "chart_id": chart_id}


async def preview_chart(
    dataset_id: int,
    chart_type: str,
    x_column: str | None = None,
    y_columns: list[str] | None = None,
    color_column: str | None = None,
    aggregate: str = "SUM",
    time_column: str | None = None,
    time_grain: str | None = None,
    sql_query: str | None = None,
    user_id: int = 0,
) -> dict:
    """Preview a chart without saving — returns data and figure."""
    import httpx

    config = _build_chart_config(
        chart_type, x_column, y_columns, color_column,
        aggregate, time_column, time_grain,
    )
    payload = {
        "dataset_id": dataset_id,
        "chart_type": chart_type,
        "chart_config": config,
        "mode": "visual",
    }
    if sql_query:
        payload["sql_query"] = sql_query

    # Call internal API for preview (reuses full execution pipeline)
    try:
        from api.ai.llm_client import _get_internal_token
        token = _get_internal_token(user_id)
        async with httpx.AsyncClient(base_url="http://localhost:8000", timeout=30.0) as c:
            resp = await c.post(
                "/api/charts/preview",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            result = resp.json()
    except Exception as e:
        return {"error": str(e)}

    if "rows" in result and len(result["rows"]) > 30:
        result["rows"] = result["rows"][:30]
        result["rows_truncated"] = True
    return result


async def create_dashboard(title: str, description: str = "", icon: str = "\U0001f4ca", user_id: int = 0) -> dict:
    """Create a new dashboard."""
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')

    with engine.connect() as conn:
        # Ensure unique slug
        existing = conn.execute(text(
            "SELECT COUNT(*) FROM dashboards WHERE url_slug = :slug"
        ), {"slug": slug}).scalar()
        if existing:
            slug = f"{slug}-{existing + 1}"

        row = conn.execute(text(
            "INSERT INTO dashboards (title, description, icon, url_slug, created_by) "
            "VALUES (:title, :desc, :icon, :slug, :uid) "
            "RETURNING id, title, url_slug"
        ), {"title": title, "desc": description, "icon": icon, "slug": slug, "uid": user_id})
        conn.commit()
        result = dict(row.mappings().fetchone())
    return result


async def add_filter(
    dashboard_id: int,
    label: str,
    column: str,
    dataset_id: int,
    filter_type: str = "select",
) -> dict:
    """Add a filter to a dashboard."""
    config = json.dumps({"dataset_id": dataset_id, "column": column})
    with engine.connect() as conn:
        max_order = conn.execute(text(
            "SELECT COALESCE(MAX(sort_order), -1) FROM dashboard_filters WHERE dashboard_id = :did"
        ), {"did": dashboard_id}).scalar()

        row = conn.execute(text(
            "INSERT INTO dashboard_filters (dashboard_id, label, filter_type, target_column, sort_order, config) "
            "VALUES (:did, :label, :ftype, :col, :order, :config) "
            "RETURNING id, label"
        ), {
            "did": dashboard_id, "label": label, "ftype": filter_type,
            "col": column, "order": max_order + 1, "config": config,
        })
        conn.commit()
        result = dict(row.mappings().fetchone())
    return result


async def patch_chart_config(chart_id: int, config_updates: dict) -> dict:
    """Partially update chart config. Set keys to null to delete them."""
    with engine.connect() as conn:
        row = conn.execute(text("SELECT chart_config FROM charts WHERE id = :id"), {"id": chart_id}).mappings().fetchone()
        if not row:
            return {"error": f"Chart {chart_id} not found"}
        existing = row["chart_config"] if row["chart_config"] else {}

        # Deep merge
        def _merge(base, overlay):
            result = base.copy()
            for k, v in overlay.items():
                if v is None:
                    result.pop(k, None)
                elif isinstance(result.get(k), dict) and isinstance(v, dict):
                    result[k] = _merge(result[k], v)
                else:
                    result[k] = v
            return result

        merged = _merge(existing, config_updates)
        conn.execute(text("""
            UPDATE charts SET chart_config = CAST(:config AS jsonb), updated_at = NOW() WHERE id = :id
        """), {"id": chart_id, "config": json.dumps(merged)})
        conn.commit()
        return {"chart_id": chart_id, "config": merged}


async def get_chart_config_schema(chart_type: str) -> dict:
    """Get config schema for a chart type."""
    from api.meta.router import CHART_TYPE_SCHEMAS
    schema = CHART_TYPE_SCHEMAS.get(chart_type)
    if not schema:
        return {"error": f"Unknown chart type: {chart_type}", "valid_types": list(CHART_TYPE_SCHEMAS.keys())}
    return {"chart_type": chart_type, **schema}


async def clone_chart(chart_id: int, target_dashboard_id: int | None = None, title: str | None = None) -> dict:
    """Clone a chart, optionally to a different dashboard."""
    with engine.connect() as conn:
        original = conn.execute(text(
            "SELECT id, title, dashboard_id, connection_id, dataset_id, mode, "
            "chart_type, chart_config, chart_code, sql_query, grid_w, grid_h, tab_id "
            "FROM charts WHERE id = :id"
        ), {"id": chart_id}).mappings().fetchone()
        if not original:
            return {"error": f"Chart {chart_id} not found"}

        target_did = target_dashboard_id or original["dashboard_id"]
        new_title = title or f"{original['title']} (Copy)"

        new_chart = conn.execute(text(
            "INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, mode, "
            "chart_type, chart_config, chart_code, sql_query, grid_w, grid_h, created_by) "
            "VALUES (:did, :cid, :dsid, :title, :mode, :ctype, :config, :code, :sql, :gw, :gh, 0) "
            "RETURNING id, title, dashboard_id"
        ), {
            "did": target_did, "cid": original["connection_id"],
            "dsid": original["dataset_id"], "title": new_title,
            "mode": original["mode"], "ctype": original["chart_type"],
            "config": json.dumps(original["chart_config"]) if original["chart_config"] else "{}",
            "code": original["chart_code"], "sql": original["sql_query"],
            "gw": original["grid_w"], "gh": original["grid_h"],
        })
        conn.commit()
        return dict(new_chart.mappings().fetchone())


async def validate_sql_tool(connection_id: int, sql: str) -> dict:
    """Validate SQL query without executing. Returns column info if valid."""
    try:
        clean = validate_sql(sql, max_limit=0)
    except SQLValidationError as e:
        return {"valid": False, "error": str(e)}

    try:
        row = _get_connection_with_password(connection_id)
        eng, spec = get_engine_for_connection(row)
        if row["db_type"] == "duckdb":
            df = spec.execute_native(row["database_name"], f"SELECT * FROM ({clean}) _t LIMIT 0")
            columns = [{"name": col, "type": str(df[col].dtype)} for col in df.columns]
        else:
            with eng.connect() as conn:
                result = conn.execute(text(f"SELECT * FROM ({clean}) _t LIMIT 0"))
                columns = [{"name": k, "type": "unknown"} for k in result.keys()]
        return {"valid": True, "columns": columns}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def clone_dashboard_tool(dashboard_id: int) -> dict:
    """Clone a dashboard with all charts, tabs, and filters."""
    with engine.connect() as conn:
        original = conn.execute(text(
            "SELECT id, title, description, icon, filter_layout, color_scheme FROM dashboards WHERE id = :id"
        ), {"id": dashboard_id}).mappings().fetchone()
        if not original:
            return {"error": f"Dashboard {dashboard_id} not found"}

        new_title = f"Copy of {original['title']}"
        slug = re.sub(r'[^a-z0-9]+', '-', new_title.lower()).strip('-')
        existing = conn.execute(text("SELECT COUNT(*) FROM dashboards WHERE url_slug LIKE :s"), {"s": f"{slug}%"}).scalar()
        if existing > 0:
            slug = f"{slug}-{existing + 1}"

        new_dash = conn.execute(text("""
            INSERT INTO dashboards (title, description, icon, url_slug, filter_layout, color_scheme, created_by)
            VALUES (:title, :desc, :icon, :slug, :fl, :cs, 0)
            RETURNING id, title, url_slug
        """), {
            "title": new_title, "desc": original["description"],
            "icon": original["icon"], "slug": slug,
            "fl": json.dumps(original["filter_layout"]) if original["filter_layout"] else "{}",
            "cs": original.get("color_scheme"),
        }).mappings().fetchone()

        new_id = new_dash["id"]

        # Copy tabs
        tab_map = {}
        for tab in conn.execute(text(
            "SELECT id, title, position_order FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order"
        ), {"did": dashboard_id}).mappings().all():
            new_tab = conn.execute(text(
                "INSERT INTO dashboard_tabs (dashboard_id, title, position_order) VALUES (:did, :t, :p) RETURNING id"
            ), {"did": new_id, "t": tab["title"], "p": tab["position_order"]}).mappings().fetchone()
            tab_map[tab["id"]] = new_tab["id"]

        if not tab_map:
            conn.execute(text("INSERT INTO dashboard_tabs (dashboard_id, title, position_order) VALUES (:did, 'Main', 0)"), {"did": new_id})

        # Copy charts
        for chart in conn.execute(text(
            "SELECT connection_id, dataset_id, title, description, mode, chart_type, chart_config, "
            "chart_code, sql_query, position_order, grid_x, grid_y, grid_w, grid_h, tab_id "
            "FROM charts WHERE dashboard_id = :did"
        ), {"did": dashboard_id}).mappings().all():
            conn.execute(text("""
                INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, description, mode,
                    chart_type, chart_config, chart_code, sql_query, position_order,
                    grid_x, grid_y, grid_w, grid_h, tab_id, created_by)
                VALUES (:did, :cid, :dsid, :title, :desc, :mode, :ctype,
                    CAST(:config AS jsonb), :code, :sql, :pos, :gx, :gy, :gw, :gh, :tid, 0)
            """), {
                "did": new_id, "cid": chart["connection_id"], "dsid": chart["dataset_id"],
                "title": chart["title"], "desc": chart["description"], "mode": chart["mode"],
                "ctype": chart["chart_type"],
                "config": json.dumps(chart["chart_config"]) if chart["chart_config"] else "{}",
                "code": chart["chart_code"], "sql": chart["sql_query"],
                "pos": chart["position_order"],
                "gx": chart["grid_x"], "gy": chart["grid_y"],
                "gw": chart["grid_w"], "gh": chart["grid_h"],
                "tid": tab_map.get(chart["tab_id"]) if chart["tab_id"] else None,
            })

        # Copy filters
        for f in conn.execute(text(
            "SELECT label, filter_type, target_column, default_value, sort_order, config, group_name "
            "FROM dashboard_filters WHERE dashboard_id = :did"
        ), {"did": dashboard_id}).mappings().all():
            conn.execute(text("""
                INSERT INTO dashboard_filters (dashboard_id, label, filter_type, target_column,
                    default_value, sort_order, config, group_name)
                VALUES (:did, :label, :ftype, :col, :dv, :order, CAST(:config AS jsonb), :grp)
            """), {
                "did": new_id, "label": f["label"], "ftype": f["filter_type"],
                "col": f["target_column"], "dv": f["default_value"], "order": f["sort_order"],
                "config": json.dumps(f["config"]) if f["config"] else "{}",
                "grp": f["group_name"],
            })

        conn.commit()
        return dict(new_dash)


async def list_semantic_models(connection_id: int | None = None) -> dict:
    """List available semantic models with their measures and dimensions."""
    with engine.connect() as conn:
        if connection_id:
            models = conn.execute(text(
                "SELECT id, name, description FROM semantic_models WHERE connection_id = :cid"
            ), {"cid": connection_id}).mappings().all()
        else:
            models = conn.execute(text(
                "SELECT id, name, description, connection_id FROM semantic_models"
            )).mappings().all()

        result = []
        for m in models:
            measures = conn.execute(text(
                "SELECT name, label, agg_type FROM model_measures WHERE model_id = :mid ORDER BY sort_order"
            ), {"mid": m["id"]}).mappings().all()
            dimensions = conn.execute(text(
                "SELECT name, label, dimension_type FROM model_dimensions WHERE model_id = :mid ORDER BY sort_order"
            ), {"mid": m["id"]}).mappings().all()
            result.append({
                **dict(m),
                "measures": [dict(r) for r in measures],
                "dimensions": [dict(r) for r in dimensions],
            })
        return {"models": result}


async def semantic_query_tool(
    model_id: int,
    measures: list[str],
    dimensions: list[str] | None = None,
    filters: list[dict] | None = None,
    limit: int | None = 100,
) -> dict:
    """Execute a semantic query and return results."""
    from api.semantic.query_builder import build_semantic_query
    try:
        sql = build_semantic_query(
            model_id=model_id,
            measure_names=measures,
            dimension_names=dimensions or [],
            filters=filters,
            limit=limit,
        )
    except (ValueError, Exception) as e:
        return {"error": str(e)}

    # Get connection_id from the model
    with engine.connect() as conn:
        model = conn.execute(text(
            "SELECT connection_id FROM semantic_models WHERE id = :id"
        ), {"id": model_id}).mappings().first()
        if not model:
            return {"error": f"Model {model_id} not found"}

    result = await execute_sql(model["connection_id"], sql)
    result["generated_sql"] = sql
    return result


# --- Tool definitions for OpenAI function calling ---

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "search_content",
            "description": "Search existing charts and dashboards by title, description, or SQL query. Use this FIRST to check if a relevant chart already exists before generating new SQL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query — keywords from the user's question",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_connections",
            "description": "List available database connections with their names and types.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_schema",
            "description": "Get all tables and their columns with data types for a database connection. Use this to understand the data model before writing SQL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "connection_id": {
                        "type": "integer",
                        "description": "Database connection ID",
                    }
                },
                "required": ["connection_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_sample",
            "description": "Get first N rows of a table to understand data format and values.",
            "parameters": {
                "type": "object",
                "properties": {
                    "connection_id": {"type": "integer", "description": "Database connection ID"},
                    "table_name": {"type": "string", "description": "Table name"},
                    "limit": {"type": "integer", "description": "Number of rows (default 10, max 50)"},
                },
                "required": ["connection_id", "table_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_table_profile",
            "description": "Get column types, sample values, row count, and distinct values for categorical columns. Use instead of get_sample + execute_sql — gives everything needed to write correct SQL in one call.",
            "parameters": {
                "type": "object",
                "properties": {
                    "connection_id": {"type": "integer", "description": "Database connection ID"},
                    "table_name": {"type": "string", "description": "Table name to profile"},
                },
                "required": ["connection_id", "table_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "quick_create_chart",
            "description": "One-shot chart creation: provide SQL + title + chart_type and get a complete chart. Auto-creates a dataset from the SQL query. This is the fastest way to create a chart.",
            "parameters": {
                "type": "object",
                "properties": {
                    "connection_id": {"type": "integer", "description": "Database connection ID"},
                    "sql_query": {"type": "string", "description": "SELECT query for chart data"},
                    "title": {"type": "string", "description": "Chart title"},
                    "chart_type": {"type": "string", "enum": ["bar", "line", "area", "pie", "donut", "table", "kpi", "scatter", "histogram", "pivot", "bar_h", "combo", "heatmap", "box", "violin", "treemap", "funnel", "waterfall", "pareto", "correlation", "control"], "description": "Chart type"},
                    "x_column": {"type": "string", "description": "X-axis column name"},
                    "y_columns": {"type": "array", "items": {"type": "string"}, "description": "Y-axis column names"},
                    "color_column": {"type": "string", "description": "Column to group/color by"},
                    "aggregate": {"type": "string", "enum": ["SUM", "AVG", "COUNT", "MIN", "MAX", "COUNT_DISTINCT"], "description": "Aggregation function (default SUM)"},
                    "dashboard_id": {"type": "integer", "description": "Dashboard ID to add chart to (optional)"},
                },
                "required": ["connection_id", "sql_query", "title", "chart_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_sql",
            "description": "Execute a SELECT SQL query on a database connection and return results. Only SELECT/WITH queries are allowed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "connection_id": {"type": "integer", "description": "Database connection ID"},
                    "sql": {"type": "string", "description": "SQL SELECT query to execute"},
                },
                "required": ["connection_id", "sql"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_dashboards",
            "description": "List all dashboards with their chart counts and slugs.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chart_sql",
            "description": "Get the SQL query and metadata of a specific saved chart.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_id": {"type": "integer", "description": "Chart ID"},
                },
                "required": ["chart_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_datasets",
            "description": "List all datasets with their names, types, and connection info.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_dataset",
            "description": "Create a virtual dataset from a SQL query. Use this to save a reusable data source.",
            "parameters": {
                "type": "object",
                "properties": {
                    "connection_id": {"type": "integer", "description": "Database connection ID"},
                    "name": {"type": "string", "description": "Human-readable dataset name"},
                    "sql_query": {"type": "string", "description": "SELECT query defining the dataset"},
                    "description": {"type": "string", "description": "Optional description"},
                },
                "required": ["connection_id", "name", "sql_query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_chart",
            "description": "Create a chart with simplified parameters. Available types: bar, line, area, pie, donut, table, kpi, scatter, histogram, pivot, bar_h, combo, heatmap, box, violin, treemap, funnel, waterfall, pareto, correlation, control. Use preview_chart first to verify.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "integer", "description": "Dataset ID for data source"},
                    "title": {"type": "string", "description": "Chart title"},
                    "chart_type": {"type": "string", "enum": ["bar", "line", "area", "pie", "donut", "table", "kpi", "scatter", "histogram", "pivot", "bar_h", "combo", "heatmap", "box", "violin", "treemap", "funnel", "waterfall", "pareto", "correlation", "control"], "description": "Chart type"},
                    "x_column": {"type": "string", "description": "X-axis column name"},
                    "y_columns": {"type": "array", "items": {"type": "string"}, "description": "Y-axis column names"},
                    "color_column": {"type": "string", "description": "Column to group/color by"},
                    "aggregate": {"type": "string", "enum": ["SUM", "AVG", "COUNT", "MIN", "MAX", "COUNT_DISTINCT"], "description": "Aggregation function (default SUM)"},
                    "time_column": {"type": "string", "description": "Column for time-based grouping"},
                    "time_grain": {"type": "string", "enum": ["raw", "day", "week", "month", "quarter", "year"], "description": "Time granularity"},
                    "dashboard_id": {"type": "integer", "description": "Dashboard ID to add chart to (omit for standalone)"},
                    "sql_query": {"type": "string", "description": "Custom SQL override"},
                },
                "required": ["dataset_id", "title", "chart_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_chart",
            "description": "Update an existing chart. Use for fine-tuning chart_config after create_chart.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_id": {"type": "integer", "description": "Chart ID to update"},
                    "title": {"type": "string", "description": "New title"},
                    "chart_type": {"type": "string", "description": "New chart type"},
                    "chart_config": {"type": "object", "description": "Full chart_config for advanced settings"},
                    "sql_query": {"type": "string", "description": "New SQL query"},
                },
                "required": ["chart_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_chart",
            "description": "Delete a chart permanently.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_id": {"type": "integer", "description": "Chart ID to delete"},
                },
                "required": ["chart_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "preview_chart",
            "description": "Preview a chart without saving. Returns data and Plotly figure. Use BEFORE create_chart to verify.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {"type": "integer", "description": "Dataset ID for data source"},
                    "chart_type": {"type": "string", "description": "Chart type"},
                    "x_column": {"type": "string", "description": "X-axis column"},
                    "y_columns": {"type": "array", "items": {"type": "string"}, "description": "Y-axis columns"},
                    "color_column": {"type": "string", "description": "Color/group column"},
                    "aggregate": {"type": "string", "enum": ["SUM", "AVG", "COUNT", "MIN", "MAX", "COUNT_DISTINCT"], "description": "Aggregation (default SUM)"},
                    "time_column": {"type": "string", "description": "Time column"},
                    "time_grain": {"type": "string", "enum": ["raw", "day", "week", "month", "quarter", "year"], "description": "Time grain"},
                    "sql_query": {"type": "string", "description": "Custom SQL override"},
                },
                "required": ["dataset_id", "chart_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_dashboard",
            "description": "Create a new empty dashboard.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Dashboard title"},
                    "description": {"type": "string", "description": "Optional description"},
                    "icon": {"type": "string", "description": "Emoji icon (default \U0001f4ca)"},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_filter",
            "description": "Add a filter to a dashboard.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dashboard_id": {"type": "integer", "description": "Dashboard ID"},
                    "label": {"type": "string", "description": "Filter label shown in UI"},
                    "column": {"type": "string", "description": "Column name to filter on"},
                    "dataset_id": {"type": "integer", "description": "Dataset ID for filter values"},
                    "filter_type": {"type": "string", "enum": ["select", "multi_select", "date_range", "number_range"], "description": "Filter type (default select)"},
                },
                "required": ["dashboard_id", "label", "column", "dataset_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "patch_chart_config",
            "description": "Partially update chart config. Only send the keys you want to change. Set a key to null to delete it. Preferred over update_chart for config-only changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_id": {"type": "integer", "description": "Chart ID"},
                    "config_updates": {"type": "object", "description": "Config keys to update. Set value to null to delete a key."},
                },
                "required": ["chart_id", "config_updates"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chart_config_schema",
            "description": "Get the config schema for a chart type. Shows what fields are available, their types, and valid values.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_type": {"type": "string", "description": "Chart type (bar, line, pie, etc.)"},
                },
                "required": ["chart_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clone_chart",
            "description": "Clone a chart, optionally to a different dashboard.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chart_id": {"type": "integer", "description": "Source chart ID to clone"},
                    "target_dashboard_id": {"type": "integer", "description": "Target dashboard (omit to clone in same dashboard)"},
                    "title": {"type": "string", "description": "Title for the cloned chart (default: original title + ' (Copy)')"},
                },
                "required": ["chart_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "validate_sql",
            "description": "Validate a SQL query without executing. Checks syntax and verifies tables/columns exist. Returns column info if valid.",
            "parameters": {
                "type": "object",
                "properties": {
                    "connection_id": {"type": "integer", "description": "Database connection ID"},
                    "sql": {"type": "string", "description": "SQL query to validate"},
                },
                "required": ["connection_id", "sql"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clone_dashboard",
            "description": "Clone an entire dashboard including all tabs, charts, and filters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dashboard_id": {"type": "integer", "description": "Dashboard ID to clone"},
                },
                "required": ["dashboard_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_semantic_models",
            "description": "List available semantic models (metrics/dimensions). Each model has named measures (aggregations like SUM, COUNT) and dimensions (columns to group/filter by). Use this to discover what pre-defined metrics are available before writing raw SQL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "connection_id": {
                        "type": "integer",
                        "description": "Optional: filter models by connection ID",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "semantic_query",
            "description": "Execute a query using semantic model definitions. Specify measures (what to calculate) and dimensions (how to group). The system generates optimized SQL with proper JOINs, GROUP BY, and aggregations. Prefer this over raw SQL when a semantic model exists for the data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "model_id": {"type": "integer", "description": "Semantic model ID"},
                    "measures": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Measure names to calculate (e.g. ['total_revenue', 'order_count'])",
                    },
                    "dimensions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Dimension names to group by (e.g. ['region', 'order_date'])",
                    },
                    "filters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "dimension": {"type": "string"},
                                "operator": {"type": "string", "enum": ["=", "!=", ">", "<", ">=", "<=", "IN", "IS NULL", "IS NOT NULL"]},
                                "value": {},
                            },
                            "required": ["dimension", "operator", "value"],
                        },
                        "description": "Optional filters",
                    },
                    "limit": {"type": "integer", "description": "Max rows to return (default 100)"},
                },
                "required": ["model_id", "measures"],
            },
        },
    },
]

# Map function names to callables
TOOL_MAP = {
    "search_content": search_content,
    "get_connections": get_connections,
    "get_schema": get_schema,
    "get_sample": get_sample,
    "get_table_profile": get_table_profile,
    "execute_sql": execute_sql,
    "quick_create_chart": quick_create_chart,
    "list_dashboards": list_dashboards,
    "get_chart_sql": get_chart_sql,
    # Write tools
    "list_datasets": list_datasets,
    "create_dataset": create_dataset,
    "create_chart": create_chart,
    "update_chart": update_chart,
    "delete_chart": delete_chart,
    "preview_chart": preview_chart,
    "create_dashboard": create_dashboard,
    "add_filter": add_filter,
    "patch_chart_config": patch_chart_config,
    "get_chart_config_schema": get_chart_config_schema,
    "clone_chart": clone_chart,
    "validate_sql": validate_sql_tool,
    "clone_dashboard": clone_dashboard_tool,
    "list_semantic_models": list_semantic_models,
    "semantic_query": semantic_query_tool,
}
