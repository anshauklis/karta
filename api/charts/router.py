import asyncio
import api.json_util as json
import hashlib
import re
import pandas as pd
from fastapi import APIRouter, HTTPException, Depends, Body, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from api.database import engine
from api.models import (
    ChartCreate, ChartUpdate, ChartResponse, LayoutUpdate,
    ChartPreviewRequest, ChartExecuteRequest, ChartExecuteResponse,
    QuickChartCreate, BulkDeleteRequest, ChartCloneRequest,
    ChartConfigValidateRequest, ChartConfigValidateResponse,
)
from api.auth.dependencies import get_current_user, check_ownership, require_role
from api.executor import build_visual_chart, build_pivot_table, execute_chart_code
from api.audit import log_action

router = APIRouter(tags=["charts"])


def _classify_error(error: str | Exception) -> dict:
    """Classify a chart execution error into a structured response.

    Returns a dict with:
      - code: machine-readable error code
      - message: user-friendly message (safe to show in UI)
      - detail: original error text for debugging (optional)
      - column / field / suggestion: extra context when available
    """
    msg = str(error)
    msg_lower = msg.lower()

    # --- Connection timeout ---
    if any(kw in msg_lower for kw in (
        "connection timed out", "connect timeout", "server closed the connection unexpectedly",
        "canceling statement due to statement timeout", "statement_timeout",
    )):
        return {
            "code": "CONNECTION_TIMEOUT",
            "message": "Database is not responding. Check your connection settings.",
            "detail": msg,
        }

    # --- Connection refused / unreachable ---
    if any(kw in msg_lower for kw in (
        "connection refused", "could not connect", "connection reset",
        "no route to host", "network is unreachable", "name or service not known",
        "could not translate host name",
    )):
        return {
            "code": "CONNECTION_REFUSED",
            "message": "Cannot connect to database. Verify host and port.",
            "detail": msg,
        }

    # --- Permission denied ---
    if "permission denied" in msg_lower or "access denied" in msg_lower or "insufficient privilege" in msg_lower:
        return {
            "code": "PERMISSION_DENIED",
            "message": "Access denied. Contact your administrator.",
            "detail": msg,
        }

    # --- Column not found ---
    if "column" in msg_lower and ("not found" in msg_lower or "does not exist" in msg_lower or "not in index" in msg_lower):
        match = re.search(r'column "([^"]+)"', msg) or re.search(r"column '([^']+)'", msg) or re.search(r'Key(?:Error)?: ["\']([^"\']+)', msg)
        field = None
        if "x_column" in msg_lower or "x column" in msg_lower:
            field = "x_column"
        elif "y_column" in msg_lower:
            field = "y_columns"
        col_name = match.group(1) if match else None
        friendly = f'Column "{col_name}" not found.' if col_name else "Column not found."
        return {
            "code": "COLUMN_NOT_FOUND",
            "message": friendly,
            "detail": msg,
            "column": col_name,
            "field": field,
        }

    # --- SQL syntax error ---
    if "syntax error" in msg_lower:
        # Try to extract the relevant fragment near the syntax error
        line_match = re.search(r'(?:at or near|near) "([^"]+)"', msg) or re.search(r"(?:at or near|near) '([^']+)'", msg)
        fragment = line_match.group(1) if line_match else None
        friendly = f'SQL syntax error near "{fragment}".' if fragment else "SQL syntax error in query."
        return {
            "code": "SQL_SYNTAX",
            "message": friendly,
            "detail": msg,
        }

    # --- Division by zero ---
    if "division by zero" in msg_lower or "divide by zero" in msg_lower:
        return {
            "code": "DIVISION_BY_ZERO",
            "message": "Division by zero in query.",
            "detail": msg,
        }

    # --- Data type mismatch ---
    if any(kw in msg_lower for kw in (
        "invalid input syntax for type", "cannot cast", "type mismatch",
        "operator does not exist", "could not convert", "incompatible types",
    )):
        return {
            "code": "TYPE_MISMATCH",
            "message": "Data type mismatch. Check column types.",
            "detail": msg,
        }

    # --- Out of memory / resource limit ---
    if any(kw in msg_lower for kw in (
        "out of memory", "oom", "resource limit", "memory limit",
        "too many rows", "result set too large", "exceeded memory",
        "cannot allocate memory",
    )):
        return {
            "code": "OUT_OF_MEMORY",
            "message": "Query returns too much data. Try adding filters to reduce the result set.",
            "detail": msg,
        }

    # --- General SQL execution errors (relation missing, etc.) ---
    if any(kw in msg_lower for kw in ("relation", "does not exist", "query execution failed")):
        return {
            "code": "SQL_EXECUTION_ERROR",
            "message": msg,
        }

    # --- General timeout (query ran too long) ---
    if "timeout" in msg_lower or "timed out" in msg_lower:
        return {
            "code": "CONNECTION_TIMEOUT",
            "message": "Database is not responding. Check your connection settings.",
            "detail": msg,
        }

    # --- Missing config ---
    if "missing" in msg_lower and ("config" in msg_lower or "column" in msg_lower or "required" in msg_lower):
        return {
            "code": "MISSING_CONFIG",
            "message": msg,
        }

    # --- Empty data ---
    if "empty" in msg_lower or "no data" in msg_lower or "no rows" in msg_lower:
        return {
            "code": "EMPTY_DATA",
            "message": msg,
        }

    # --- Code execution errors (Python code mode) ---
    if any(kw in msg_lower for kw in ("nameerror", "typeerror", "valueerror", "attributeerror", "indentationerror", "syntaxerror")):
        return {
            "code": "CODE_EXECUTION_ERROR",
            "message": msg,
        }

    # --- Generic fallback ---
    return {
        "code": "EXECUTION_ERROR",
        "message": msg,
    }


def _sanitize_rows(df: pd.DataFrame) -> list:
    """Convert DataFrame rows to JSON-safe Python types (no numpy).
    Converts per column dtype (O(columns) type checks) instead of per cell."""
    import numpy as np
    cols = []
    for col in df.columns:
        series = df[col]
        dtype = series.dtype
        # Use pandas dtype predicates (not np.issubdtype) so pandas extension
        # dtypes — e.g. StringDtype/Int64 returned by DuckDB's fetchdf() — don't
        # raise "Cannot interpret '<StringDtype>' as a data type".
        if pd.api.types.is_integer_dtype(dtype):
            cols.append([int(v) if pd.notna(v) else None for v in series])
        elif pd.api.types.is_float_dtype(dtype):
            cols.append([float(v) if pd.notna(v) else None for v in series])
        elif pd.api.types.is_bool_dtype(dtype):
            cols.append([bool(v) if pd.notna(v) else None for v in series])
        else:
            out = []
            for v in series:
                if isinstance(v, np.ndarray):
                    out.append(v.tolist())
                elif v is None or v is pd.NA or (np.isscalar(v) and pd.isna(v)):
                    out.append(None)
                else:
                    out.append(v)
            cols.append(out)
    if not cols:
        return []
    n = len(cols[0])
    return [[cols[c][r] for c in range(len(cols))] for r in range(n)]


def _sanitize_figure(figure) -> dict | None:
    """Convert Plotly figure to a plain JSON-safe dict (no numpy arrays)."""
    if figure is None:
        return None
    # Plotly Figure objects have .to_plotly_json()
    if hasattr(figure, "to_plotly_json"):
        return figure.to_plotly_json()
    # Already a dict — deep-convert numpy arrays via json round-trip
    import numpy as np
    return json.loads(json.dumps(figure, default=lambda o: o.tolist() if isinstance(o, np.ndarray) else str(o)))


def _coerce_numeric_columns(df: pd.DataFrame):
    """Try converting object columns to numeric (pandas 3.0 compatible).
    Skips columns that look like dates or have too many non-numeric values."""
    for col in df.columns:
        if df[col].dtype == object:
            # Cheap date check first — avoids expensive pd.to_numeric on date columns
            sample = df[col].dropna().head(5)
            if sample.astype(str).str.match(r"^\d{4}-\d{2}").any():
                continue
            converted = pd.to_numeric(df[col], errors="coerce")
            if converted.notna().sum() >= df[col].notna().sum() * 0.5:
                df[col] = converted

def _deep_merge(base: dict, overlay: dict) -> dict:
    """Recursively merge overlay into base. None values delete keys."""
    result = base.copy()
    for key, value in overlay.items():
        if value is None:
            result.pop(key, None)  # None = delete key
        elif isinstance(result.get(key), dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


_CHART_COLS = """id, dashboard_id, connection_id, dataset_id, title, description, mode,
    chart_type, chart_config, chart_code, sql_query, position_order,
    COALESCE(grid_x, 0) as grid_x, COALESCE(grid_y, 0) as grid_y,
    COALESCE(grid_w, 6) as grid_w, COALESCE(grid_h, 224) as grid_h,
    tab_id, variables, created_by, created_at, updated_at"""


@router.get("/api/charts", summary="List all charts")
def list_all_charts(
    q: str | None = None,
    dashboard_id: int | None = None,
    chart_type: str | None = None,
    connection_id: int | None = None,
    limit: int | None = None,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """List all charts across all dashboards with basic info.

    Supports optional search (q), entity filters (dashboard_id, chart_type, connection_id),
    and pagination (limit, offset). When limit or q is provided, returns paginated results
    with X-Total-Count header. Without these params, returns all charts (backward-compatible).
    """
    use_pagination = q is not None or limit is not None

    conditions = []
    params: dict = {}

    if q is not None:
        conditions.append("(c.title ILIKE :q OR c.description ILIKE :q OR c.sql_query ILIKE :q)")
        params["q"] = f"%{q}%"
    if dashboard_id is not None:
        conditions.append("c.dashboard_id = :dashboard_id")
        params["dashboard_id"] = dashboard_id
    if chart_type is not None:
        conditions.append("c.chart_type = :chart_type")
        params["chart_type"] = chart_type
    if connection_id is not None:
        conditions.append("c.connection_id = :connection_id")
        params["connection_id"] = connection_id

    where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    base_query = f"""
        SELECT c.id, c.dashboard_id, c.title, c.chart_type, c.mode,
               c.connection_id, c.dataset_id, c.created_by, c.created_at, c.updated_at,
               d.title as dashboard_title, d.url_slug as dashboard_slug
        FROM charts c
        LEFT JOIN dashboards d ON d.id = c.dashboard_id
        {where_clause}
        ORDER BY c.updated_at DESC
    """

    with engine.connect() as conn:
        if use_pagination:
            effective_limit = min(limit or 50, 200)
            params["lim"] = effective_limit
            params["off"] = offset
            paginated_query = f"""
                SELECT *, COUNT(*) OVER() as _total FROM (
                    {base_query}
                ) _q LIMIT :lim OFFSET :off
            """
            rows = [dict(row) for row in conn.execute(text(paginated_query), params).mappings().all()]
            total = rows[0]["_total"] if rows else 0
            for r in rows:
                del r["_total"]
            content = json.loads(json.dumps(rows, default=str))
            return JSONResponse(content=content, headers={"X-Total-Count": str(total)})
        else:
            result = conn.execute(text(base_query), params)
            return [dict(row) for row in result.mappings().all()]


@router.get("/api/dashboards/{dashboard_id}/charts", summary="List dashboard charts", response_model=list[ChartResponse])
def list_charts(dashboard_id: int, current_user: dict = Depends(get_current_user)):
    """List all charts belonging to a specific dashboard."""
    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT {_CHART_COLS} FROM charts WHERE dashboard_id = :dashboard_id ORDER BY position_order"),
            {"dashboard_id": dashboard_id}
        )
        return [dict(row) for row in result.mappings().all()]


def _next_grid_position(conn, dashboard_id: int, tab_id: int | None = None) -> tuple[int, int]:
    """Return (grid_x, grid_y) for next chart slot on dashboard."""
    tab_filter = "AND tab_id = :tab_id" if tab_id else ""
    params: dict = {"did": dashboard_id}
    if tab_id:
        params["tab_id"] = tab_id
    row = conn.execute(text(f"""
        SELECT COALESCE(MAX(COALESCE(grid_y, 0) + COALESCE(grid_h, 224)), 0) AS next_y
        FROM charts WHERE dashboard_id = :did {tab_filter}
    """), params).fetchone()
    return 0, row[0] if row else 0


def _resolve_dataset_fields(conn, req: ChartCreate):
    """Auto-resolve connection_id and sql_query from dataset if not provided."""
    connection_id = req.connection_id
    sql_query = req.sql_query
    if req.dataset_id and (not connection_id or not sql_query):
        ds = conn.execute(
            text("SELECT connection_id, sql_query FROM datasets WHERE id = :id"),
            {"id": req.dataset_id},
        ).mappings().fetchone()
        if ds:
            if not connection_id:
                connection_id = ds["connection_id"]
            if not sql_query:
                sql_query = ds["sql_query"]
    return connection_id, sql_query


@router.post("/api/dashboards/{dashboard_id}/charts", summary="Create chart on dashboard", response_model=ChartResponse, status_code=201)
async def create_chart(dashboard_id: int, req: ChartCreate, request: Request, current_user: dict = require_role("editor", "admin")):
    """Create a new chart and add it to a dashboard.

    If dataset_id is provided, connection_id and sql_query are auto-resolved from the dataset.
    """
    user_id = int(current_user["sub"])

    with engine.connect() as conn:
        connection_id, sql_query = _resolve_dataset_fields(conn, req)

        max_order = conn.execute(
            text("SELECT COALESCE(MAX(position_order), -1) FROM charts WHERE dashboard_id = :dashboard_id"),
            {"dashboard_id": dashboard_id}
        ).scalar()

        tab_id = req.tab_id
        if tab_id is None:
            tab_id = conn.execute(
                text("SELECT id FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order LIMIT 1"),
                {"did": dashboard_id},
            ).scalar()

        grid_x, grid_y = _next_grid_position(conn, dashboard_id, tab_id)

        result = conn.execute(
            text(f"""
                INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, description, mode,
                    chart_type, chart_config, chart_code, sql_query, position_order,
                    grid_x, grid_y, tab_id, variables, created_by)
                VALUES (:dashboard_id, :connection_id, :dataset_id, :title, :description, :mode,
                    :chart_type, CAST(:chart_config AS jsonb), :chart_code, :sql_query, :position_order,
                    :grid_x, :grid_y, :tab_id, CAST(:variables AS jsonb), :created_by)
                RETURNING {_CHART_COLS}
            """),
            {
                "dashboard_id": dashboard_id,
                "connection_id": connection_id,
                "dataset_id": req.dataset_id,
                "title": req.title,
                "description": req.description,
                "mode": req.mode,
                "chart_type": req.chart_type,
                "chart_config": json.dumps(req.chart_config),
                "chart_code": req.chart_code,
                "sql_query": sql_query,
                "position_order": max_order + 1,
                "grid_x": grid_x,
                "grid_y": grid_y,
                "tab_id": tab_id,
                "variables": json.dumps(req.variables),
                "created_by": user_id,
            }
        )
        chart = dict(result.mappings().fetchone())
        conn.commit()

    await log_action(user_id, "create", "chart", chart["id"],
                     details={"title": req.title}, ip_address=request.client.host if request.client else None)

    return chart


@router.post("/api/charts", summary="Create standalone chart", response_model=ChartResponse, status_code=201)
def create_standalone_chart(req: ChartCreate, current_user: dict = require_role("editor", "admin")):
    """Create a chart without attaching it to a dashboard.

    If dataset_id is provided, connection_id and sql_query are auto-resolved from the dataset.
    """
    user_id = int(current_user["sub"])
    dashboard_id = req.dashboard_id

    with engine.connect() as conn:
        connection_id, sql_query = _resolve_dataset_fields(conn, req)

        position_order = 0
        if dashboard_id:
            max_order = conn.execute(
                text("SELECT COALESCE(MAX(position_order), -1) FROM charts WHERE dashboard_id = :did"),
                {"did": dashboard_id},
            ).scalar()
            position_order = max_order + 1

        tab_id = req.tab_id
        if tab_id is None and dashboard_id:
            tab_id = conn.execute(
                text("SELECT id FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order LIMIT 1"),
                {"did": dashboard_id},
            ).scalar()

        result = conn.execute(
            text(f"""
                INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, description, mode,
                    chart_type, chart_config, chart_code, sql_query, position_order, tab_id, variables, created_by)
                VALUES (:dashboard_id, :connection_id, :dataset_id, :title, :description, :mode,
                    :chart_type, CAST(:chart_config AS jsonb), :chart_code, :sql_query, :position_order, :tab_id, CAST(:variables AS jsonb), :created_by)
                RETURNING {_CHART_COLS}
            """),
            {
                "dashboard_id": dashboard_id,
                "connection_id": connection_id,
                "dataset_id": req.dataset_id,
                "title": req.title,
                "description": req.description,
                "mode": req.mode,
                "chart_type": req.chart_type,
                "chart_config": json.dumps(req.chart_config),
                "chart_code": req.chart_code,
                "sql_query": sql_query,
                "position_order": position_order,
                "tab_id": tab_id,
                "variables": json.dumps(req.variables),
                "created_by": user_id,
            },
        )
        chart = dict(result.mappings().fetchone())
        conn.commit()

    return chart


def _auto_detect_columns(connection_id: int, sql_query: str) -> dict:
    """Detect column types from SQL and suggest chart config fields."""
    from api.connections.router import _get_connection_with_password, get_engine_for_connection

    c = _get_connection_with_password(connection_id)

    if c["db_type"] == "duckdb":
        import duckdb
        duck = duckdb.connect(c["database_name"], read_only=True)
        try:
            result = duck.execute(f"SELECT * FROM ({sql_query}) _t LIMIT 0")
            col_info = [(desc[0], str(desc[1]).lower()) for desc in result.description]
        finally:
            duck.close()
    else:
        ext_engine, _spec = get_engine_for_connection(c)
        with ext_engine.connect() as conn:
            result = conn.execute(text(f"SELECT * FROM ({sql_query}) _t LIMIT 0"))
            # Use cursor.description to get actual column types (type_code → PG OID)
            cursor_desc = result.cursor.description if hasattr(result, 'cursor') and result.cursor else None
            if cursor_desc:
                # Map PG OIDs to type names for classification
                _PG_NUMERIC_OIDS = {20, 21, 23, 26, 700, 701, 790, 1700}  # int2/4/8, oid, float4/8, money, numeric
                _PG_DATE_OIDS = {1082, 1083, 1114, 1184, 1266}  # date, time, timestamp, timestamptz, timetz
                col_info = []
                for desc in cursor_desc:
                    oid = desc[1] if len(desc) > 1 else None
                    if oid in _PG_NUMERIC_OIDS:
                        col_info.append((desc[0], "numeric"))
                    elif oid in _PG_DATE_OIDS:
                        col_info.append((desc[0], "date"))
                    else:
                        col_info.append((desc[0], "text"))
            else:
                col_info = [(k, "unknown") for k in result.keys()]

    # Classify columns
    date_cols = []
    numeric_cols = []
    string_cols = []

    for name, dtype in col_info:
        dtype_lower = dtype.lower()
        if any(t in dtype_lower for t in ("date", "time", "timestamp")):
            date_cols.append(name)
        elif any(t in dtype_lower for t in ("int", "float", "double", "decimal", "numeric", "bigint", "real", "number")):
            numeric_cols.append(name)
        else:
            string_cols.append(name)

    suggestion = {}
    # Date -> x_column
    if date_cols:
        suggestion["x_column"] = date_cols[0]
    elif string_cols:
        suggestion["x_column"] = string_cols[0]

    # Numeric -> y_columns
    if numeric_cols:
        suggestion["y_columns"] = numeric_cols[:3]  # Max 3 metrics

    # Second string column -> color_column
    if len(string_cols) > 1:
        x_used = suggestion.get("x_column")
        remaining_strings = [s for s in string_cols if s != x_used]
        if remaining_strings:
            suggestion["color_column"] = remaining_strings[0]

    return suggestion


@router.post("/api/charts/quick", summary="One-shot chart creation", status_code=201)
def quick_create_chart(req: QuickChartCreate, current_user: dict = require_role("editor", "admin")):
    """Create dataset + chart in one call. Provide SQL, title, and chart_type.

    Auto-creates a virtual dataset from the SQL query, then creates a chart on it.
    Returns both dataset_id and chart details. Optionally adds the chart to a dashboard.
    """
    user_id = int(current_user["sub"])

    # Use local variables so we don't mutate the Pydantic model
    x_column = req.x_column
    y_columns = req.y_columns
    color_column = req.color_column

    # Auto-detect columns when both x_column and y_columns are absent
    if not x_column and not y_columns:
        try:
            detected = _auto_detect_columns(req.connection_id, req.sql_query)
            x_column = detected.get("x_column")
            y_columns = detected.get("y_columns")
            if not color_column:
                color_column = detected.get("color_column")
        except Exception:
            pass  # Non-critical: fall back to no auto-config

    # Build chart_config from simplified params
    config = {
        "show_legend": True,
        "show_values": False,
        "color_palette": "default",
        "sort_order": "none",
        "number_format": "",
    }
    if x_column:
        config["x_column"] = x_column
    if y_columns:
        config["y_columns"] = y_columns
    if color_column:
        config["color_column"] = color_column
    if y_columns and req.aggregate:
        config["metrics"] = [
            {"column": col, "aggregate": req.aggregate, "label": f"{req.aggregate}({col})"}
            for col in y_columns
        ]
    if req.chart_type == "bar":
        config["stack_mode"] = "none"

    dataset_name = req.dataset_name or f"ds_{req.title[:40]}"

    with engine.connect() as conn:
        # Create dataset
        ds = conn.execute(
            text("""
                INSERT INTO datasets (connection_id, name, sql_query, dataset_type, created_by)
                VALUES (:cid, :name, :sql, 'virtual', :uid)
                RETURNING id
            """),
            {"cid": req.connection_id, "name": dataset_name, "sql": req.sql_query, "uid": user_id},
        ).mappings().fetchone()
        dataset_id = ds["id"]

        # Resolve position and tab
        dashboard_id = req.dashboard_id
        position_order = 0
        tab_id = None
        grid_x, grid_y = 0, 0
        if dashboard_id:
            max_order = conn.execute(
                text("SELECT COALESCE(MAX(position_order), -1) FROM charts WHERE dashboard_id = :did"),
                {"did": dashboard_id},
            ).scalar()
            position_order = max_order + 1
            tab_id = conn.execute(
                text("SELECT id FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order LIMIT 1"),
                {"did": dashboard_id},
            ).scalar()
            grid_x, grid_y = _next_grid_position(conn, dashboard_id, tab_id)

        # Create chart
        chart = conn.execute(
            text(f"""
                INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, mode,
                    chart_type, chart_config, sql_query, position_order,
                    grid_x, grid_y, tab_id, created_by)
                VALUES (:did, :cid, :dsid, :title, 'visual',
                    :ctype, CAST(:config AS jsonb), :sql, :pos,
                    :gx, :gy, :tid, :uid)
                RETURNING {_CHART_COLS}
            """),
            {
                "did": dashboard_id, "cid": req.connection_id, "dsid": dataset_id,
                "title": req.title, "ctype": req.chart_type,
                "config": json.dumps(config), "sql": req.sql_query,
                "pos": position_order, "gx": grid_x, "gy": grid_y,
                "tid": tab_id, "uid": user_id,
            },
        ).mappings().fetchone()
        conn.commit()

    result = dict(chart)
    result["dataset_id"] = dataset_id
    return result


@router.post("/api/charts/bulk-delete", summary="Bulk delete charts")
def bulk_delete_charts(req: BulkDeleteRequest, current_user: dict = require_role("editor", "admin")):
    """Delete multiple charts at once."""
    if not req.ids:
        return {"deleted": 0}
    # Build parameterized IN clause
    placeholders = ", ".join(f":id_{i}" for i in range(len(req.ids)))
    params = {f"id_{i}": cid for i, cid in enumerate(req.ids)}
    with engine.connect() as conn:
        result = conn.execute(
            text(f"DELETE FROM charts WHERE id IN ({placeholders})"),
            params,
        )
        conn.commit()
    return {"deleted": result.rowcount}


@router.post("/api/charts/validate-config", summary="Validate chart config")
def validate_chart_config(req: ChartConfigValidateRequest, current_user: dict = Depends(get_current_user)):
    """Validate chart_config against the schema for a given chart_type."""
    from api.meta.router import CHART_TYPE_SCHEMAS

    schema = CHART_TYPE_SCHEMAS.get(req.chart_type)
    if not schema:
        return ChartConfigValidateResponse(
            valid=False,
            errors=[{"field": "chart_type", "message": f"Unknown chart type: {req.chart_type}. Valid types: {', '.join(CHART_TYPE_SCHEMAS.keys())}"}],
        )

    errors = []
    warnings = []
    config = req.chart_config
    fields = schema.get("fields", {})

    # Check required fields
    for field_name, field_def in fields.items():
        if field_def.get("required") and field_name not in config:
            errors.append({"field": field_name, "message": f"Required field '{field_name}' is missing"})

    # Check enum values
    for field_name, value in config.items():
        if field_name in fields:
            field_def = fields[field_name]
            if field_def.get("type") == "enum" and "values" in field_def:
                if value not in field_def["values"]:
                    errors.append({
                        "field": field_name,
                        "message": f"Invalid value '{value}' for {field_name}. Valid values: {field_def['values']}",
                    })
            if field_def.get("type") == "boolean" and not isinstance(value, bool):
                warnings.append({
                    "field": field_name,
                    "message": f"Field '{field_name}' should be a boolean, got {type(value).__name__}",
                })
        else:
            # Unknown field — just warn
            if field_name not in ("metrics", "chart_filters", "calculated_columns", "row_limit",
                                   "time_column", "time_grain", "time_range", "conditional_formatting",
                                   "transforms", "statistical_overlays"):
                warnings.append({"field": field_name, "message": f"Unknown field '{field_name}' for chart type '{req.chart_type}'"})

    return ChartConfigValidateResponse(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
    )


def _is_admin_user(current_user: dict) -> bool:
    return bool(current_user.get("is_admin")) or "admin" in current_user.get("roles", [])


def _assert_chart_access(conn, chart: dict, current_user: dict) -> None:
    """Authorize read/execute of a chart.

    A chart bound to a dashboard inherits that dashboard's visibility, so a chart
    on a restricted dashboard can't be read directly by id. Standalone charts
    (dashboard_id IS NULL) remain shared assets (existing behavior). Admins and the
    chart's creator always pass.
    """
    if _is_admin_user(current_user):
        return
    if chart.get("created_by") == int(current_user["sub"]):
        return
    dashboard_id = chart.get("dashboard_id")
    if dashboard_id is None:
        return
    from api.dashboards.router import user_can_access_dashboard
    if not user_can_access_dashboard(conn, dashboard_id, current_user):
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/api/charts/{chart_id}", summary="Get chart", response_model=ChartResponse)
def get_chart(chart_id: int, current_user: dict = Depends(get_current_user)):
    """Get chart details including config, SQL, and grid position."""
    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT {_CHART_COLS} FROM charts WHERE id = :id"),
            {"id": chart_id}
        )
        row = result.mappings().fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Chart not found")
        chart = dict(row)
        _assert_chart_access(conn, chart, current_user)

    return chart


@router.put("/api/charts/{chart_id}", summary="Update chart", response_model=ChartResponse)
async def update_chart(chart_id: int, req: ChartUpdate, request: Request, current_user: dict = require_role("editor", "admin")):
    """Update chart title, type, config, SQL, or grid position."""
    from api.history import record_change, compute_diff

    with engine.connect() as conn:
        check_ownership(conn, "charts", chart_id, current_user)

    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Track changes
    old_chart = get_chart(chart_id, current_user)
    diff = compute_diff(old_chart, updates, list(updates.keys()))
    if diff:
        record_change("chart", chart_id, int(current_user["sub"]), "updated", diff)

    # Handle JSONB casts for chart_config and variables
    _jsonb_fields = {"chart_config", "variables"}
    for jf in _jsonb_fields:
        if jf in updates:
            updates[jf] = json.dumps(updates[jf])
    if _jsonb_fields & updates.keys():
        set_clauses = ", ".join(
            f"{k} = CAST(:{k} AS jsonb)" if k in _jsonb_fields else f"{k} = :{k}"
            for k in updates
        )
    else:
        set_clauses = ", ".join(f"{k} = :{k}" for k in updates)

    updates["id"] = chart_id

    with engine.connect() as conn:
        conn.execute(
            text(f"UPDATE charts SET {set_clauses}, updated_at = NOW() WHERE id = :id"),
            updates
        )
        conn.commit()

    # Invalidate full-result cache for this chart
    from api.cache import delete_pattern
    delete_pattern(f"chart_exec:{chart_id}:*")

    await log_action(int(current_user["sub"]), "update", "chart", chart_id,
                     ip_address=request.client.host if request.client else None)

    return get_chart(chart_id, current_user)


@router.patch("/api/charts/{chart_id}/config", summary="Partial chart config update")
def patch_chart_config(chart_id: int, config_updates: dict, current_user: dict = require_role("editor", "admin")):
    """Merge partial updates into chart_config. Set a key to null to delete it.

    Performs a recursive deep merge: nested dicts are merged, not replaced.
    """
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT chart_config FROM charts WHERE id = :id"),
            {"id": chart_id},
        ).mappings().fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Chart not found")
        existing = row["chart_config"] if row["chart_config"] else {}
        merged = _deep_merge(existing, config_updates)
        conn.execute(
            text("""
                UPDATE charts SET chart_config = CAST(:config AS jsonb), updated_at = NOW()
                WHERE id = :id
            """),
            {"id": chart_id, "config": json.dumps(merged)},
        )
        conn.commit()

    # Invalidate full-result cache for this chart
    from api.cache import delete_pattern
    delete_pattern(f"chart_exec:{chart_id}:*")

    return get_chart(chart_id, current_user)


@router.delete("/api/charts/{chart_id}", summary="Delete chart", status_code=204)
async def delete_chart(chart_id: int, request: Request, current_user: dict = require_role("editor", "admin")):
    """Delete a chart permanently."""
    with engine.connect() as conn:
        check_ownership(conn, "charts", chart_id, current_user)
        conn.execute(text("DELETE FROM charts WHERE id = :id"), {"id": chart_id})
        conn.commit()
    await log_action(int(current_user["sub"]), "delete", "chart", chart_id,
                     ip_address=request.client.host if request.client else None)


@router.post("/api/charts/{chart_id}/duplicate", summary="Duplicate chart", response_model=ChartResponse, status_code=201)
def duplicate_chart(chart_id: int, req: ChartCloneRequest | None = Body(None), current_user: dict = require_role("editor", "admin")):
    """Create a copy of a chart, optionally into a different dashboard/tab."""
    with engine.connect() as conn:
        original = conn.execute(text(
            f"SELECT {_CHART_COLS} FROM charts WHERE id = :id"
        ), {"id": chart_id}).mappings().first()

        if not original:
            raise HTTPException(404, "Chart not found")

        target_did = (req.target_dashboard_id if req else None) or original["dashboard_id"]
        target_tab = req.target_tab_id if req else None
        title = (req.title if req else None) or (original["title"] + " (Copy)")

        if target_tab is None and target_did:
            target_tab = conn.execute(
                text("SELECT id FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order LIMIT 1"),
                {"did": target_did},
            ).scalar()

        grid_x, grid_y = _next_grid_position(conn, target_did, target_tab) if target_did else (0, 0)

        max_pos = conn.execute(text(
            "SELECT COALESCE(MAX(position_order), 0) FROM charts WHERE dashboard_id = :did"
        ), {"did": target_did}).scalar() if target_did else 0

        result = conn.execute(text(f"""
            INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, description, mode,
                chart_type, chart_config, chart_code, sql_query, position_order,
                grid_x, grid_y, grid_w, grid_h, tab_id, variables, created_by)
            VALUES (:did, :cid, :dsid, :title, :desc, :mode,
                :chart_type, :chart_config, :chart_code, :sql_query, :pos,
                :grid_x, :grid_y, :grid_w, :grid_h, :tab_id, CAST(:variables AS jsonb), :uid)
            RETURNING {_CHART_COLS}
        """), {
            "did": target_did,
            "cid": original["connection_id"],
            "dsid": original["dataset_id"],
            "title": title,
            "desc": original["description"],
            "mode": original["mode"],
            "chart_type": original["chart_type"],
            "chart_config": json.dumps(original["chart_config"]) if original["chart_config"] else "{}",
            "chart_code": original["chart_code"],
            "sql_query": original["sql_query"],
            "pos": max_pos + 1,
            "grid_x": grid_x,
            "grid_y": grid_y,
            "grid_w": original["grid_w"],
            "grid_h": original["grid_h"],
            "tab_id": target_tab,
            "variables": json.dumps(original["variables"]) if original.get("variables") else "[]",
            "uid": int(current_user["sub"]),
        })
        conn.commit()
        return dict(result.mappings().first())


@router.post("/api/dashboards/{dashboard_id}/import-chart/{chart_id}", summary="Import chart to dashboard", response_model=ChartResponse, status_code=201)
def import_chart_to_dashboard(dashboard_id: int, chart_id: int, current_user: dict = require_role("editor", "admin")):
    """Copy an existing chart to another dashboard."""
    with engine.connect() as conn:
        original = conn.execute(text(
            f"SELECT {_CHART_COLS} FROM charts WHERE id = :id"
        ), {"id": chart_id}).mappings().first()

        if not original:
            raise HTTPException(404, "Chart not found")

        max_pos = conn.execute(text(
            "SELECT COALESCE(MAX(position_order), 0) FROM charts WHERE dashboard_id = :did"
        ), {"did": dashboard_id}).scalar()

        # Use first tab for imported chart
        first_tab_id = conn.execute(
            text("SELECT id FROM dashboard_tabs WHERE dashboard_id = :did ORDER BY position_order LIMIT 1"),
            {"did": dashboard_id},
        ).scalar()
        grid_x, grid_y = _next_grid_position(conn, dashboard_id, first_tab_id)

        result = conn.execute(text(f"""
            INSERT INTO charts (dashboard_id, connection_id, dataset_id, title, description, mode,
                chart_type, chart_config, chart_code, sql_query, position_order,
                grid_x, grid_y, grid_w, grid_h, variables, created_by)
            VALUES (:did, :cid, :dsid, :title, :desc, :mode,
                :chart_type, :chart_config, :chart_code, :sql_query, :pos,
                :grid_x, :grid_y, :grid_w, :grid_h, CAST(:variables AS jsonb), :uid)
            RETURNING {_CHART_COLS}
        """), {
            "did": dashboard_id,
            "cid": original["connection_id"],
            "dsid": original["dataset_id"],
            "title": original["title"],
            "desc": original["description"],
            "mode": original["mode"],
            "chart_type": original["chart_type"],
            "chart_config": json.dumps(original["chart_config"]) if original["chart_config"] else "{}",
            "chart_code": original["chart_code"],
            "sql_query": original["sql_query"],
            "pos": max_pos + 1,
            "grid_x": grid_x,
            "grid_y": grid_y,
            "grid_w": original["grid_w"],
            "grid_h": original["grid_h"],
            "variables": json.dumps(original["variables"]) if original.get("variables") else "[]",
            "uid": int(current_user["sub"]),
        })
        conn.commit()
        return dict(result.mappings().first())


@router.put("/api/dashboards/{dashboard_id}/layout", summary="Update layout")
def update_layout(dashboard_id: int, req: LayoutUpdate, current_user: dict = require_role("editor", "admin")):
    """Update grid positions (x, y, w, h) for all charts on a dashboard."""
    with engine.connect() as conn:
        for item in req.items:
            conn.execute(
                text("""
                    UPDATE charts
                    SET grid_x = :grid_x, grid_y = :grid_y, grid_w = :grid_w, grid_h = :grid_h,
                        updated_at = NOW()
                    WHERE id = :id AND dashboard_id = :dashboard_id
                """),
                {
                    "id": item.id,
                    "grid_x": item.grid_x,
                    "grid_y": item.grid_y,
                    "grid_w": item.grid_w,
                    "grid_h": item.grid_h,
                    "dashboard_id": dashboard_id,
                }
            )
        conn.commit()

    # Auto-version (best-effort)
    try:
        from api.versions.router import create_auto_version
        create_auto_version(dashboard_id, int(current_user["sub"]))
    except Exception:
        pass

    return {"status": "ok"}


@router.get("/api/charts/{chart_id}/dashboards", summary="Get dashboards containing this chart")
def get_chart_dashboards(chart_id: int, current_user: dict = Depends(get_current_user)):
    """Get the dashboard(s) that contain this chart."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT d.id, d.title, d.url_slug, d.icon
            FROM dashboards d
            JOIN charts c ON c.dashboard_id = d.id
            WHERE c.id = :cid AND d.is_archived = FALSE
        """), {"cid": chart_id})
        return [dict(row) for row in result.mappings().all()]


def _resolve_chart_sql(chart: dict) -> tuple[int | None, str]:
    """Resolve SQL query and connection_id, loading from dataset if needed."""
    connection_id = chart.get("connection_id")
    sql_query = chart.get("sql_query", "")

    dataset_id = chart.get("dataset_id")
    if dataset_id:
        with engine.connect() as conn:
            ds = conn.execute(
                text("SELECT connection_id, sql_query FROM datasets WHERE id = :id"),
                {"id": dataset_id}
            ).mappings().fetchone()
            if ds:
                connection_id = ds["connection_id"]
                sql_query = ds["sql_query"]

    return connection_id, sql_query


def _has_custom_sql(config: dict) -> bool:
    """Check if any config element uses custom SQL expressions with non-empty values."""
    if config.get("x_expression_type") == "custom_sql" and config.get("x_custom_sql", "").strip():
        return True
    if config.get("color_expression_type") == "custom_sql" and config.get("color_custom_sql", "").strip():
        return True
    for m in config.get("metrics", []):
        if m.get("expressionType") == "custom_sql" and m.get("sqlExpression", "").strip():
            return True
    for f in config.get("chart_filters", []):
        if f.get("expressionType") == "custom_sql" and f.get("sqlExpression", "").strip():
            return True
    return False


def _build_custom_sql_query(base_sql: str, config: dict) -> tuple[str, bool]:
    """Build aggregation query wrapping base SQL when custom SQL expressions are used.

    Returns (sql_query, has_aggregation) tuple.
    has_aggregation=True means the result is already aggregated (skip pandas metrics).
    """
    from api.sql_validator import validate_sql_expression

    def _qi(name: str) -> str:
        """Quote an identifier/alias, doubling embedded quotes to block injection."""
        return '"' + str(name).replace('"', '""') + '"'

    _ALLOWED_AGG = {"SUM", "AVG", "COUNT", "MIN", "MAX"}

    select_parts = []
    group_by_parts = []
    where_parts = []
    has_metrics = bool(config.get("metrics"))

    # X-axis
    x_expr_type = config.get("x_expression_type", "simple")
    x_col = config.get("x_column", "")
    if x_expr_type == "custom_sql":
        x_sql = validate_sql_expression(config.get("x_custom_sql", ""))
        alias = (x_col or "").strip() or "x"
        select_parts.append(f'{x_sql} AS {_qi(alias)}')
        group_by_parts.append(x_sql)
    elif x_col:
        select_parts.append(_qi(x_col))
        group_by_parts.append(_qi(x_col))

    # Color
    color_expr_type = config.get("color_expression_type", "simple")
    color_col = config.get("color_column", "")
    if color_expr_type == "custom_sql":
        color_sql = validate_sql_expression(config.get("color_custom_sql", ""))
        alias = (color_col or "").strip() or "color"
        select_parts.append(f'{color_sql} AS {_qi(alias)}')
        group_by_parts.append(color_sql)
    elif color_col and has_metrics:
        select_parts.append(_qi(color_col))
        group_by_parts.append(_qi(color_col))

    # Metrics
    metrics = config.get("metrics", [])
    for idx, m in enumerate(metrics):
        if m.get("expressionType") == "custom_sql":
            sql_expr = m.get("sqlExpression", "").strip()
            if not sql_expr:
                continue  # skip metrics with empty expressions
            expr = validate_sql_expression(sql_expr)
            label = m.get("label", "").strip() or f"metric_{idx}"
            select_parts.append(f'{expr} AS {_qi(label)}')
        else:
            col = m.get("column", "")
            agg = m.get("aggregate", "SUM").upper()
            label = m.get("label", f"{agg}({col})")
            if agg == "COUNT" and col == "*":
                select_parts.append(f'COUNT(*) AS {_qi(label)}')
            elif col:
                if agg == "COUNT_DISTINCT":
                    select_parts.append(f'COUNT(DISTINCT {_qi(col)}) AS {_qi(label)}')
                else:
                    safe_agg = agg if agg in _ALLOWED_AGG else "SUM"
                    select_parts.append(f'{safe_agg}({_qi(col)}) AS {_qi(label)}')

    # Filters
    filters = config.get("chart_filters", [])
    for f in filters:
        if f.get("expressionType") == "custom_sql":
            sql_expr = f.get("sqlExpression", "").strip()
            if not sql_expr:
                continue  # skip filters with empty expressions
            expr = validate_sql_expression(sql_expr)
            where_parts.append(f"({expr})")
        # Simple filters handled in pandas pipeline as before

    # Only build SQL query if we have something custom to do
    if not select_parts and not where_parts:
        return base_sql, False

    has_any_metrics = bool(metrics)

    if not select_parts:
        select_parts.append("*")
    elif not has_any_metrics:
        # No metrics — include y_columns explicitly to avoid _t.* duplicate column conflicts
        existing_aliases = set()
        for part in select_parts:
            if " AS " in part:
                alias = part.split(" AS ")[-1].strip().strip('"')
                existing_aliases.add(alias)
        for yc in config.get("y_columns", []):
            if yc and yc not in existing_aliases:
                select_parts.append(f'"{yc}"')
                existing_aliases.add(yc)

    sql = f"SELECT {', '.join(select_parts)} FROM ({base_sql}) AS _t"

    if where_parts:
        sql += f" WHERE {' AND '.join(where_parts)}"

    if group_by_parts and has_any_metrics:
        sql += f" GROUP BY {', '.join(group_by_parts)}"

    return sql, has_any_metrics


def _has_pivot_custom_sql(config: dict) -> bool:
    """Check if pivot config has custom SQL expressions or duplicate value columns."""
    if config.get("pivot_custom_sql"):
        return True
    for v in config.get("pivot_values", []):
        if re.match(r'^.+__\d+$', v):
            return True
    return False


_AGG_FUNC_RE = re.compile(
    r'\b(SUM|COUNT|AVG|MIN|MAX|STDDEV|VARIANCE|ARRAY_AGG|STRING_AGG|BOOL_AND|BOOL_OR|EVERY)\s*\(',
    re.IGNORECASE,
)


def _build_pivot_custom_sql_query(base_sql: str, config: dict) -> str:
    """Wrap base SQL with computed columns for pivot table custom expressions and duplicates.

    Row-level expressions use _pcs_ prefix to avoid duplicate column conflicts with _t.*.
    Aggregate expressions (SUM, COUNT, ...) are skipped here — handled post-pivot in build_pivot_table.
    Caller must rename _pcs_X → X after execution (see _rename_pivot_custom_cols).
    """
    from api.sql_validator import validate_sql_expression

    pivot_custom_sql = config.get("pivot_custom_sql", {}) or {}
    select_parts = ["_t.*"]

    # Custom SQL expressions: use _pcs_ prefix to avoid clashing with original columns
    for alias, expression in pivot_custom_sql.items():
        if not expression.strip():
            continue
        expr = validate_sql_expression(expression)
        # Skip aggregate expressions — they are evaluated post-pivot in build_pivot_table
        if _AGG_FUNC_RE.search(expr):
            continue
        select_parts.append(f'{expr} AS "_pcs_{alias}"')

    # Duplicate value column aliases (items with __N suffix)
    for v in config.get("pivot_values", []):
        if v in pivot_custom_sql:
            continue  # already handled above
        match = re.match(r'^(.+)__(\d+)$', v)
        if match:
            base_col = match.group(1)
            select_parts.append(f'_t."{base_col}" AS "{v}"')

    if len(select_parts) <= 1:
        return base_sql  # no changes needed

    return f"SELECT {', '.join(select_parts)} FROM ({base_sql}) AS _t"


def _rename_pivot_custom_cols(df, config: dict):
    """Rename _pcs_ prefixed columns back to their intended names after SQL execution."""
    pivot_custom_sql = config.get("pivot_custom_sql") or {}
    if not pivot_custom_sql:
        return df
    renames = {}
    drops = []
    for alias in pivot_custom_sql:
        pcs_col = f"_pcs_{alias}"
        if pcs_col in df.columns:
            if alias in df.columns:
                drops.append(alias)
            renames[pcs_col] = alias
    if drops:
        df = df.drop(columns=drops)
    if renames:
        df = df.rename(columns=renames)
    return df


def _execute_chart_full(
    connection_id: int,
    base_sql: str,
    chart_config: dict,
    filters: dict | None = None,
    user_id: int | None = None,
    skip_metrics: bool = False,
    cache_ttl: int | None = None,
    include_rows: bool = True,
) -> tuple[list, list, pd.DataFrame, str | None]:
    """Execute chart via DuckDB pipeline: Parquet cache → CTE chain → small DataFrame.

    Returns (columns, rows, df, parquet_path). When include_rows is False, rows is
    returned empty to skip a full df.values.tolist() copy of the result — callers
    that render from df directly (the chart UI: execute/preview/thumbnail/insights)
    don't need it, only data-export callers (alerts/reports/export) do.
    """
    import duckdb
    from api.sql_validator import validate_sql, SQLValidationError
    from api.connections.router import _get_connection_with_password, get_engine_for_connection
    from api.rls.router import get_rls_filters
    import api.parquet_cache as parquet_cache
    import api.pipeline_sql as pipeline_sql

    try:
        clean_sql = validate_sql(base_sql, max_limit=0)
    except SQLValidationError as e:
        raise ValueError(f"SQL validation error: {e}")

    c = _get_connection_with_password(connection_id)
    db_type = c["db_type"]

    # --- Get or populate Parquet cache ---
    pq_path = None
    if db_type != "duckdb":
        ext_engine, _spec = get_engine_for_connection(c)
        pq_path = parquet_cache.get_or_populate(
            connection_id, clean_sql, db_type, ext_engine, ttl=cache_ttl, spec=_spec,
        )

    # --- Column metadata for time_grain ---
    col_meta = pipeline_sql.get_column_meta(parquet_path=pq_path) if pq_path else {}

    # --- Build RLS conditions with $param placeholders (DuckDB syntax) ---
    rls_conditions = []
    rls_params = {}
    if user_id:
        rls = get_rls_filters(connection_id, user_id)
        if rls:
            for ri, (col, vals) in enumerate(rls.items()):
                if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
                    continue
                if len(vals) == 1:
                    p = f"_rls_{ri}"
                    rls_params[p] = vals[0]
                    rls_conditions.append(f'"{col}" = ${p}')
                else:
                    placeholders = ", ".join(f"$_rls_{ri}_{j}" for j in range(len(vals)))
                    rls_conditions.append(f'"{col}" IN ({placeholders})')
                    for j, v in enumerate(vals):
                        rls_params[f"_rls_{ri}_{j}"] = v

    # --- Build dashboard filter conditions ---
    dash_where = ""
    dash_params = {}
    if filters:
        conditions = []
        for i, (col, val) in enumerate(filters.items()):
            if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', col):
                continue
            pname = f"_df_{i}"
            if isinstance(val, dict) and "__contains" in val:
                contains_val = val["__contains"]
                if isinstance(contains_val, list):
                    or_parts = []
                    for j, v in enumerate(contains_val):
                        p = f"_df_{i}_c{j}"
                        dash_params[p] = f"%{v}%"
                        or_parts.append(f'CAST("{col}" AS TEXT) LIKE ${p}')
                    if or_parts:
                        conditions.append(f'({" OR ".join(or_parts)})')
                else:
                    dash_params[pname] = f"%{contains_val}%"
                    conditions.append(f'CAST("{col}" AS TEXT) LIKE ${pname}')
            elif isinstance(val, list):
                placeholders = ", ".join(f"$_df_{i}_{j}" for j in range(len(val)))
                conditions.append(f'"{col}" IN ({placeholders})')
                for j, v in enumerate(val):
                    dash_params[f"_df_{i}_{j}"] = v
            elif isinstance(val, dict):
                range_from = val.get("from") or val.get("min")
                range_to = val.get("to") or val.get("max")
                if range_from is not None and str(range_from).strip():
                    p = f"_df_{i}_from"
                    dash_params[p] = range_from
                    conditions.append(f'"{col}" >= ${p}')
                if range_to is not None and str(range_to).strip():
                    p = f"_df_{i}_to"
                    dash_params[p] = range_to
                    conditions.append(f'"{col}" <= ${p}')
            else:
                dash_params[pname] = val
                conditions.append(f'"{col}" = ${pname}')
        dash_where = " AND ".join(conditions)

    # --- Build pipeline SQL ---
    if db_type == "duckdb":
        source = f"({clean_sql})"
    else:
        source = f"read_parquet('{pq_path}')"

    sql, params = pipeline_sql.build_pipeline_sql(
        source=source,
        config=chart_config,
        rls_conditions=rls_conditions if rls_conditions else None,
        rls_params=rls_params,
        dash_where=dash_where,
        dash_params=dash_params,
        column_meta=col_meta,
        skip_metrics=skip_metrics,
    )

    # --- Execute via DuckDB ---
    if db_type == "duckdb":
        con = duckdb.connect(c["database_name"], read_only=True)
    else:
        con = duckdb.connect()  # in-memory

    try:
        if params:
            df = con.execute(sql, params).fetchdf()
        else:
            df = con.execute(sql).fetchdf()
    finally:
        con.close()

    # Update y_columns to match metric labels (same as _apply_pipeline)
    if not skip_metrics and chart_config.get("metrics"):
        metric_labels = [m.get("label", f"{m.get('aggregate', 'SUM')}({m.get('column', '')})")
                         for m in chart_config["metrics"]]
        chart_config["y_columns"] = metric_labels

    _coerce_numeric_columns(df)
    columns = list(df.columns)
    rows = df.values.tolist() if include_rows else []

    return columns, rows, df, pq_path


async def _run_chart_pipeline(
    *,
    connection_id: int,
    sql_query: str,
    chart_config: dict,
    mode: str,
    chart_type: str,
    chart_code: str | None,
    variables: list | None,
    variable_values: dict | None,
    filters: dict | None,
    uid: int,
    pq_ttl: int | None,
) -> ChartExecuteResponse:
    """Shared execute/preview pipeline.

    Substitute {{ variable }} values -> build custom-SQL / pivot-custom-SQL wrappers
    -> run the DuckDB pipeline -> render (visual/pivot/code) -> ChartExecuteResponse.
    Auth, view-tracking and result caching are the callers' responsibility.
    """
    from api.sql_params import extract_variables, substitute as var_substitute

    # Substitute {{ variable }} placeholders with literal values
    vars_ = variables or []
    var_defaults = {v["name"]: v.get("default") for v in vars_ if v.get("name")}
    var_types = {v["name"]: v.get("type", "text") for v in vars_ if v.get("name")}
    if extract_variables(sql_query):
        try:
            sql_query = var_substitute(sql_query, variable_values or {}, var_defaults, var_types)
        except ValueError as e:
            return ChartExecuteResponse(error=_classify_error(e))

    # Build custom SQL wrapper if config uses custom SQL expressions
    skip_metrics = False
    if _has_custom_sql(chart_config):
        try:
            sql_query, skip_metrics = _build_custom_sql_query(sql_query, chart_config)
        except Exception as e:
            return ChartExecuteResponse(error=_classify_error(e))

    # Build pivot custom SQL wrapper (computed columns + duplicate value aliases)
    if _has_pivot_custom_sql(chart_config):
        try:
            sql_query = _build_pivot_custom_sql_query(sql_query, chart_config)
        except Exception as e:
            return ChartExecuteResponse(error=_classify_error(e))

    # Execute full pipeline via DuckDB (IO-bound — run in thread pool)
    try:
        columns, _rows, df, pq_path = await asyncio.to_thread(
            _execute_chart_full, connection_id, sql_query, chart_config,
            filters, uid, skip_metrics, pq_ttl, include_rows=False)
    except Exception as e:
        return ChartExecuteResponse(error=_classify_error(e))

    # Rename pivot custom SQL columns (_pcs_ prefix → original names)
    df = _rename_pivot_custom_cols(df, chart_config)
    columns = list(df.columns)
    row_count = len(df)

    # Render
    figure = None
    error = None
    try:
        if mode == "visual" and chart_type == "pivot":
            pivot_result = build_pivot_table(chart_config, df)
            return ChartExecuteResponse(
                figure=None,
                columns=pivot_result["columns"],
                rows=pivot_result["rows"],
                row_count=pivot_result["row_count"],
                error=None,
                formatting=pivot_result["formatting"],
                pivot_header_levels=pivot_result["pivot_header_levels"],
                pivot_row_index_count=pivot_result["pivot_row_index_count"],
                pivot_cond_format_meta=pivot_result.get("pivot_cond_format_meta"),
            )
        elif mode == "visual":
            figure = build_visual_chart(chart_type, chart_config, df)
        elif mode == "code":
            code_result = execute_chart_code(chart_code, df, parquet_path=pq_path)
            # Table/pivot mode: code returned data instead of figure
            if isinstance(code_result, dict) and code_result.get("_table"):
                return ChartExecuteResponse(
                    figure=None,
                    columns=[str(c) for c in code_result["columns"]],
                    rows=[list(r) for r in code_result["rows"][:500]],
                    row_count=code_result["row_count"],
                    error=None,
                    pivot_header_levels=code_result.get("pivot_header_levels"),
                    pivot_row_index_count=code_result.get("pivot_row_index_count"),
                )
            figure = code_result
    except Exception as e:
        error = _classify_error(e)

    # Extract conditional formatting for table-type charts
    formatting = chart_config.get("conditional_formatting", []) if chart_config else []

    return ChartExecuteResponse(
        figure=_sanitize_figure(figure),
        columns=[str(c) for c in columns],
        rows=_sanitize_rows(df.head(200)),
        row_count=row_count,
        error=error,
        formatting=formatting,
    )


@router.post("/api/charts/{chart_id}/execute", summary="Execute chart", response_model=ChartExecuteResponse)
async def execute_chart(chart_id: int, req: ChartExecuteRequest | None = None, current_user: dict = Depends(get_current_user)):
    """Execute a saved chart with optional runtime filters. Returns Plotly figure or table data."""
    from api.analytics.router import track_view

    chart = await asyncio.to_thread(get_chart, chart_id, current_user)

    # Record the view off the event loop (only after access is authorized above).
    await asyncio.to_thread(track_view, int(current_user["sub"]), "chart", chart_id)

    # Text blocks don't need execution
    if chart.get("chart_type") == "text":
        return ChartExecuteResponse(
            figure=None, columns=[], rows=[], row_count=0, error=None
        )

    # --- Full-result cache: compute key ---
    from api.cache import chart_exec_key, get_cached, set_cached, CACHE_TTL

    _config_hash_raw = json.dumps({
        "ct": chart.get("chart_type"),
        "sq": chart.get("sql_query", ""),
        "cc": chart.get("chart_config", {}),
        "code": chart.get("chart_code", ""),
        "m": chart.get("mode"),
        "u": str(chart.get("updated_at", "")),
        "vv": (req.variable_values if req else None) or {},
    }, sort_keys=True)
    _config_hash = hashlib.sha256(_config_hash_raw.encode()).hexdigest()[:16]

    force = req.force if req else False
    filters = req.filters if req else None
    uid = int(current_user["sub"])
    _exec_key = chart_exec_key(chart_id, filters, _config_hash, user_id=uid)

    if not force:
        _cached = get_cached(_exec_key)
        if _cached:
            return ChartExecuteResponse(**_cached)

    # --- Resolve TTL (fetch dataset cache_ttl once, reuse for Parquet too) ---
    chart_config = chart.get("chart_config", {}) or {}
    _ds_cache_ttl = None
    _ttl = chart_config.get("cache_ttl")
    if _ttl is None and chart.get("dataset_id"):
        with engine.connect() as conn:
            _ds = conn.execute(
                text("SELECT cache_ttl FROM datasets WHERE id = :id"),
                {"id": chart["dataset_id"]}
            ).mappings().fetchone()
            if _ds:
                _ds_cache_ttl = _ds["cache_ttl"]
                _ttl = _ds_cache_ttl
    if _ttl is None:
        _ttl = CACHE_TTL
    _ttl = int(_ttl)

    # --- Execute chart ---
    connection_id, sql_query = _resolve_chart_sql(chart)

    if not sql_query or not connection_id:
        return ChartExecuteResponse(error={"code": "MISSING_CONFIG", "message": "Chart has no SQL query or connection"})

    resp = await _run_chart_pipeline(
        connection_id=connection_id,
        sql_query=sql_query,
        chart_config=chart_config,
        mode=chart["mode"],
        chart_type=chart["chart_type"],
        chart_code=chart.get("chart_code"),
        variables=chart.get("variables"),
        variable_values=(req.variable_values if req else None),
        filters=filters,
        uid=uid,
        pq_ttl=_ds_cache_ttl,
    )
    # Cache only successful results.
    if _ttl > 0 and not resp.error:
        try:
            set_cached(_exec_key, resp.model_dump(), ttl=_ttl)
        except Exception:
            pass
    return resp


@router.post("/api/charts/preview", summary="Preview chart", response_model=ChartExecuteResponse)
async def preview_chart(req: ChartPreviewRequest, current_user: dict = Depends(get_current_user)):
    """Execute an ad-hoc chart configuration without saving. Use for testing before creation."""
    connection_id = req.connection_id
    sql_query = req.sql_query

    # Resolve dataset if provided
    _pq_ttl = None
    if req.dataset_id:
        with engine.connect() as conn:
            ds = conn.execute(
                text("SELECT connection_id, sql_query, cache_ttl FROM datasets WHERE id = :id"),
                {"id": req.dataset_id}
            ).mappings().fetchone()
            if ds:
                connection_id = ds["connection_id"]
                sql_query = ds["sql_query"]
                _pq_ttl = ds["cache_ttl"]

    if not sql_query or not connection_id:
        return ChartExecuteResponse(error={"code": "MISSING_CONFIG", "message": "SQL query and connection are required"})

    return await _run_chart_pipeline(
        connection_id=connection_id,
        sql_query=sql_query,
        chart_config=req.chart_config or {},
        mode=req.mode,
        chart_type=req.chart_type,
        chart_code=req.chart_code,
        variables=req.variables,
        variable_values=req.variable_values,
        filters=req.filters,
        uid=int(current_user["sub"]),
        pq_ttl=_pq_ttl,
    )


@router.get("/api/charts/{chart_id}/thumbnail", summary="Chart PNG thumbnail")
async def chart_thumbnail(
    chart_id: int,
    width: int = 600,
    height: int = 400,
    current_user: dict = Depends(get_current_user),
):
    """Render a chart as a PNG image. Only works for visual/code charts with Plotly figures."""
    from fastapi.responses import Response
    import plotly.graph_objects as go

    chart = await asyncio.to_thread(get_chart, chart_id, current_user)

    # Table/pivot/text don't produce figures
    if chart.get("chart_type") in ("table", "pivot", "text"):
        raise HTTPException(status_code=400, detail=f"Chart type '{chart['chart_type']}' does not support thumbnails")

    connection_id, sql_query = _resolve_chart_sql(chart)
    if not sql_query or not connection_id:
        raise HTTPException(status_code=400, detail="Chart has no SQL query or connection")

    # Substitute {{ variable }} placeholders with literal values (defaults only for thumbnails)
    from api.sql_params import extract_variables, substitute as var_substitute
    chart_vars = chart.get("variables") or []
    var_defaults = {v["name"]: v.get("default") for v in chart_vars if v.get("name")}
    var_types = {v["name"]: v.get("type", "text") for v in chart_vars if v.get("name")}
    if extract_variables(sql_query):
        try:
            sql_query = var_substitute(sql_query, {}, var_defaults, var_types)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Variable substitution error: {str(e)}")

    chart_config = chart.get("chart_config", {}) or {}

    # Build custom SQL wrapper if config uses custom SQL expressions
    _skip_metrics = False
    if _has_custom_sql(chart_config):
        try:
            sql_query, _skip_metrics = _build_custom_sql_query(sql_query, chart_config)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Custom SQL expression error: {str(e)}")

    # Execute full pipeline via DuckDB (IO-bound — run in thread pool)
    uid = int(current_user["sub"])
    try:
        columns, _rows, df, pq_path = await asyncio.to_thread(
            _execute_chart_full, connection_id, sql_query, chart_config,
            None, uid, _skip_metrics, include_rows=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SQL execution failed: {str(e)}")

    figure = None
    try:
        if chart["mode"] == "visual":
            figure = build_visual_chart(chart["chart_type"], chart_config, df)
        elif chart["mode"] == "code":
            code_result = execute_chart_code(chart["chart_code"], df, parquet_path=pq_path)
            if isinstance(code_result, dict) and code_result.get("_table"):
                raise HTTPException(status_code=400, detail="Code mode returned table data, not a figure")
            figure = code_result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Chart rendering failed: {str(e)}")

    if figure is None:
        raise HTTPException(status_code=400, detail="Chart produced no figure")

    # Convert to Plotly Figure object if it's a dict
    if isinstance(figure, dict):
        fig = go.Figure(figure)
    else:
        fig = figure

    try:
        import kaleido  # noqa: F401
    except ImportError:
        raise HTTPException(status_code=501, detail="kaleido is not installed — thumbnail rendering unavailable")

    try:
        png_bytes = await asyncio.to_thread(fig.to_image, format="png", width=width, height=height, engine="kaleido")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image rendering failed: {str(e)}")

    return Response(content=png_bytes, media_type="image/png")


@router.get("/api/charts/{chart_id}/insights", summary="Get chart insights")
async def get_chart_insights(chart_id: int, current_user: dict = Depends(get_current_user)):
    """Get automated statistical insights for a chart's data."""
    from api.ai.insights import detect_insights

    chart = await asyncio.to_thread(get_chart, chart_id, current_user)

    # Non-data chart types have no insights
    if chart.get("chart_type") in ("text", "divider", "header", "spacer", "tabs"):
        return {"insights": []}

    chart_config = chart.get("chart_config", {}) or {}

    # --- Resolve SQL and connection ---
    connection_id, sql_query = _resolve_chart_sql(chart)
    if not sql_query or not connection_id:
        return {"insights": []}

    # --- Execute chart to get DataFrame ---
    try:
        _columns, _rows, df, _pq_path = await asyncio.to_thread(
            _execute_chart_full, connection_id, sql_query, chart_config,
            None, int(current_user["sub"]), include_rows=False,
        )
    except Exception:
        return {"insights": []}

    # --- Run statistical analysis ---
    try:
        insights = detect_insights(df, chart_config)
    except Exception:
        insights = []

    return {"insights": insights}