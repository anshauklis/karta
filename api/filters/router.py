import api.json_util as json
import re
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text

from api.database import engine
from api.models import DashboardFilterCreate, DashboardFilterUpdate, DashboardFilterResponse, FilterReorderRequest
from api.auth.dependencies import get_current_user
from api.connections.router import _get_connection_with_password, _get_connections_with_password, get_engine_for_connection

router = APIRouter(tags=["filters"])

_FILTER_COLS = """id, dashboard_id, label, filter_type, target_column,
    default_value, sort_order, config, group_name, created_at"""


@router.get("/api/dashboards/{dashboard_id}/filters", response_model=list[DashboardFilterResponse], summary="List filters for a dashboard")
def list_filters(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Return all filters configured for the given dashboard, ordered by sort_order."""
    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT {_FILTER_COLS} FROM dashboard_filters WHERE dashboard_id = :dashboard_id ORDER BY sort_order"),
            {"dashboard_id": dashboard_id}
        )
        return [dict(row) for row in result.mappings().all()]


@router.post("/api/dashboards/{dashboard_id}/filters", response_model=DashboardFilterResponse, status_code=201, summary="Create a filter")
def create_filter(dashboard_id: int, req: DashboardFilterCreate, current_user: dict = Depends(get_current_user)):
    """Add a new filter to the dashboard. Supports types: select, multi_select, date_range, number_range."""
    with engine.connect() as conn:
        result = conn.execute(
            text(f"""
                INSERT INTO dashboard_filters (dashboard_id, label, filter_type, target_column,
                    default_value, sort_order, config, group_name)
                VALUES (:dashboard_id, :label, :filter_type, :target_column,
                    :default_value, :sort_order, CAST(:config AS jsonb), :group_name)
                RETURNING {_FILTER_COLS}
            """),
            {
                "dashboard_id": dashboard_id,
                "label": req.label,
                "filter_type": req.filter_type,
                "target_column": req.target_column,
                "default_value": req.default_value,
                "sort_order": req.sort_order,
                "config": json.dumps(req.config),
                "group_name": req.group_name,
            }
        )
        row = dict(result.mappings().fetchone())
        conn.commit()
    return row


@router.put("/api/filters/{filter_id}", response_model=DashboardFilterResponse, summary="Update filter config")
def update_filter(filter_id: int, req: DashboardFilterUpdate, current_user: dict = Depends(get_current_user)):
    """Update filter properties including label, target column, type, config, and scoped chart IDs."""
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "config" in updates:
        updates["config"] = json.dumps(updates["config"])
        set_clauses = ", ".join(
            f"{k} = CAST(:{k} AS jsonb)" if k == "config" else f"{k} = :{k}"
            for k in updates
        )
    else:
        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)

    updates["id"] = filter_id

    with engine.connect() as conn:
        conn.execute(
            text(f"UPDATE dashboard_filters SET {set_clauses} WHERE id = :id"),
            updates
        )
        conn.commit()
        result = conn.execute(
            text(f"SELECT {_FILTER_COLS} FROM dashboard_filters WHERE id = :id"),
            {"id": filter_id}
        )
        row = result.mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Filter not found")
    return dict(row)


@router.delete("/api/filters/{filter_id}", status_code=204, summary="Delete a filter")
def delete_filter(filter_id: int, current_user: dict = Depends(get_current_user)):
    """Permanently remove a filter from its dashboard."""
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM dashboard_filters WHERE id = :id"), {"id": filter_id})
        conn.commit()


@router.put("/api/dashboards/{dashboard_id}/filters/reorder", summary="Reorder filters")
def reorder_filters(dashboard_id: int, req: FilterReorderRequest, current_user: dict = Depends(get_current_user)):
    """Update the sort order of all filters for a dashboard."""
    if not req.items:
        return {"status": "ok"}
    cases = " ".join(f"WHEN :id{i} THEN :sort{i}" for i in range(len(req.items)))
    ids = ", ".join(f":id{i}" for i in range(len(req.items)))
    params: dict = {"dashboard_id": dashboard_id}
    for i, item in enumerate(req.items):
        params[f"id{i}"] = item.id
        params[f"sort{i}"] = item.sort_order
    with engine.connect() as conn:
        conn.execute(
            text(f"UPDATE dashboard_filters SET sort_order = CASE id {cases} END "
                 f"WHERE dashboard_id = :dashboard_id AND id IN ({ids})"),
            params
        )
        conn.commit()
    return {"status": "ok"}


@router.get("/api/dashboards/{dashboard_id}/charts-columns", summary="Get columns for each chart")
def get_charts_columns(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Return column names per chart for filter scoping configuration."""
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT c.id, c.dataset_id, c.connection_id, c.sql_query,
                       d.connection_id AS ds_connection_id, d.sql_query AS ds_sql_query
                FROM charts c
                LEFT JOIN datasets d ON d.id = c.dataset_id
                WHERE c.dashboard_id = :dashboard_id
            """),
            {"dashboard_id": dashboard_id},
        ).mappings().all()

    # Group by (connection_id, sql_query) to deduplicate
    query_map: dict[tuple, list[int]] = {}
    for row in rows:
        cid = row["ds_connection_id"] or row["connection_id"]
        sql = row["ds_sql_query"] or row["sql_query"]
        if not cid or not sql:
            continue
        key = (cid, sql)
        query_map.setdefault(key, []).append(row["id"])

    # Batch fetch all connections in one query
    unique_conn_ids = list({k[0] for k in query_map})
    conn_map = _get_connections_with_password(unique_conn_ids)

    result: dict[str, list[str]] = {}

    for (connection_id, sql_query), chart_ids in query_map.items():
        try:
            c = conn_map.get(connection_id)
            if not c:
                for chart_id in chart_ids:
                    result[str(chart_id)] = []
                continue
            ext_engine, spec = get_engine_for_connection(c)
            with ext_engine.connect() as ext_conn:
                res = ext_conn.execute(text(f"SELECT * FROM ({sql_query}) _t LIMIT 0"))
                cols = list(res.keys())
            for chart_id in chart_ids:
                result[str(chart_id)] = cols
        except Exception:
            for chart_id in chart_ids:
                result[str(chart_id)] = []

    return result


@router.get("/api/dashboards/{dashboard_id}/columns-typed", summary="Get typed columns for dashboard charts")
def get_dashboard_columns_typed(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Return deduplicated column names with types across all charts in the dashboard.

    Used by the NL filter bar to provide column context to the AI.
    Returns: [{ name: str, type: str }]
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT c.id, c.dataset_id, c.connection_id, c.sql_query,
                       d.connection_id AS ds_connection_id, d.sql_query AS ds_sql_query
                FROM charts c
                LEFT JOIN datasets d ON d.id = c.dataset_id
                WHERE c.dashboard_id = :dashboard_id
                  AND c.chart_type NOT IN ('text', 'divider', 'header', 'spacer', 'tabs')
            """),
            {"dashboard_id": dashboard_id},
        ).mappings().all()

    # Group by (connection_id, sql_query) to deduplicate
    query_map: dict[tuple, list[int]] = {}
    for row in rows:
        cid = row["ds_connection_id"] or row["connection_id"]
        sql = row["ds_sql_query"] or row["sql_query"]
        if not cid or not sql:
            continue
        key = (cid, sql)
        query_map.setdefault(key, []).append(row["id"])

    # Batch fetch all connections in one query
    unique_conn_ids = list({k[0] for k in query_map})
    conn_map = _get_connections_with_password(unique_conn_ids)

    seen: dict[str, str] = {}  # column_name -> type

    for (connection_id, sql_query), _chart_ids in query_map.items():
        try:
            c = conn_map.get(connection_id)
            if not c:
                continue
            ext_engine, spec = get_engine_for_connection(c)
            with ext_engine.connect() as ext_conn:
                res = ext_conn.execute(text(f"SELECT * FROM ({sql_query}) _t LIMIT 0"))
                cursor = res.cursor
                if cursor and hasattr(cursor, "description") and cursor.description:
                    for desc in cursor.description:
                        col_name = desc[0]
                        col_type = _normalize_type(str(desc[1]) if desc[1] else "text")
                        if col_name not in seen:
                            seen[col_name] = col_type
                else:
                    for col_name in res.keys():
                        if col_name not in seen:
                            seen[col_name] = "text"
        except Exception:
            pass

    return [{"name": name, "type": typ} for name, typ in seen.items()]


def _normalize_type(raw: str) -> str:
    """Map database type names to simplified type categories."""
    r = raw.lower()
    if any(kw in r for kw in ("int", "serial", "bigint", "smallint")):
        return "integer"
    if any(kw in r for kw in ("float", "double", "decimal", "numeric", "real", "number")):
        return "number"
    if any(kw in r for kw in ("timestamp", "datetime")):
        return "timestamp"
    if "date" in r:
        return "date"
    if "time" in r:
        return "time"
    if "bool" in r:
        return "boolean"
    return "text"


@router.get("/api/dashboards/{dashboard_id}/filter-datasets", summary="List datasets used by dashboard charts")
def get_dashboard_datasets(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """Return datasets referenced by charts in this dashboard, useful for filter configuration."""
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT DISTINCT d.id, d.name, d.connection_id
                FROM charts c
                JOIN datasets d ON d.id = c.dataset_id
                WHERE c.dashboard_id = :dashboard_id AND c.dataset_id IS NOT NULL
                ORDER BY d.name
            """),
            {"dashboard_id": dashboard_id}
        )
        return [dict(row) for row in result.mappings().all()]


@router.get("/api/filters/{filter_id}/values", summary="Get distinct filter values")
def get_filter_values(filter_id: int, parent_value: str = None, current_user: dict = Depends(get_current_user)):
    """Return distinct values for the filter's target column. Supports cascading via parent_value parameter."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT config, target_column FROM dashboard_filters WHERE id = :id"),
            {"id": filter_id}
        )
        row = result.mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Filter not found")

    config = row["config"] if isinstance(row["config"], dict) else {}
    dataset_id = config.get("dataset_id")
    column = config.get("column") or row["target_column"]

    if not dataset_id or not column:
        # Legacy fallback: static values
        return {"values": config.get("values", [])}

    sort_values = config.get("sort_values", True)
    depends_on_filter_id = config.get("depends_on_filter_id")

    # Resolve parent filter column for cascading
    parent_column = None
    if depends_on_filter_id and parent_value is not None:
        with engine.connect() as conn:
            parent_row = conn.execute(
                text("SELECT config, target_column FROM dashboard_filters WHERE id = :id"),
                {"id": depends_on_filter_id}
            ).mappings().fetchone()
        if parent_row:
            parent_config = parent_row["config"] if isinstance(parent_row["config"], dict) else {}
            parent_column = parent_config.get("column") or parent_row["target_column"]
            if parent_column and not re.match(r'^[a-zA-Z_][a-zA-Z0-9_ ]*$', parent_column):
                raise HTTPException(status_code=400, detail="Invalid parent column name")

    # Load dataset
    with engine.connect() as conn:
        ds = conn.execute(
            text("SELECT connection_id, sql_query FROM datasets WHERE id = :id"),
            {"id": dataset_id}
        ).mappings().fetchone()

    if not ds or not ds["connection_id"] or not ds["sql_query"]:
        return {"values": []}

    connection_id = ds["connection_id"]
    base_sql = ds["sql_query"]
    delimiter = config.get("delimiter")

    # Validate column name
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_ ]*$', column):
        raise HTTPException(status_code=400, detail="Invalid column name")

    # Build WHERE clause
    where_parts = [f'"{column}" IS NOT NULL']
    if parent_column and parent_value is not None:
        where_parts.append(f'"{parent_column}" = :parent_value')
    where_clause = " AND ".join(where_parts)

    # Build ORDER BY clause
    order_clause = " ORDER BY 1" if sort_values else ""

    distinct_sql = f'SELECT DISTINCT "{column}" FROM ({base_sql}) _t WHERE {where_clause}{order_clause} LIMIT 5000'

    c = _get_connection_with_password(connection_id)

    if c["db_type"] == "duckdb":
        import duckdb
        # DuckDB uses positional params (?)
        if parent_column and parent_value is not None:
            duck_sql = distinct_sql.replace(":parent_value", "?")
            params = [parent_value]
        else:
            duck_sql = distinct_sql
            params = []
        duck = duckdb.connect(c["database_name"], read_only=True)
        try:
            rows = duck.execute(duck_sql, params).fetchall()
            values = [str(r[0]) for r in rows]
        finally:
            duck.close()
    else:
        ext_engine, spec = get_engine_for_connection(c)
        sql_params = {}
        if parent_column and parent_value is not None:
            sql_params["parent_value"] = parent_value
        with ext_engine.connect() as ext_conn:
            spec.set_timeout(ext_conn, 10)
            result = ext_conn.execute(text(distinct_sql), sql_params)
            values = [str(r[0]) for r in result.fetchall()]

    # Split by delimiter and deduplicate
    if delimiter:
        split_values = set()
        for v in values:
            for part in v.split(delimiter):
                part = part.strip()
                if part:
                    split_values.add(part)
        values = sorted(split_values) if sort_values else list(split_values)

    return {"values": values}
