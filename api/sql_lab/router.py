import time
from decimal import Decimal
import numbers
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from api.models import SQLExecuteRequest, SQLExecuteResponse, SQLValidateRequest, SQLValidateResponse
from api.sql_validator import validate_sql, SQLValidationError
from api.connections.router import _get_connection_with_password, get_engine_for_connection
from api.cache import cache_key, get_cached, set_cached
from api.auth.dependencies import require_role

router = APIRouter(prefix="/api/sql", tags=["sql_lab"])


def run_sql_core(connection_id: int, clean_sql: str, max_fetch: int) -> dict:
    """Synchronous SQL execution core. Worker-callable; returns JSON-serializable
    {columns, rows, execution_time_ms}. Raises on execution failure."""
    c = _get_connection_with_password(connection_id)
    engine, spec = get_engine_for_connection(c)
    start = time.time()
    if c["db_type"] == "duckdb":
        df = spec.execute_native(c["database_name"], clean_sql)
        columns = list(df.columns)
        rows = [list(row) for row in df.head(max_fetch).itertuples(index=False, name=None)]
        for i, row in enumerate(rows):
            for j, val in enumerate(row):
                if val is None or isinstance(val, (str, bool, int, float)):
                    continue
                if isinstance(val, numbers.Integral):
                    rows[i][j] = int(val)
                elif isinstance(val, numbers.Real):
                    rows[i][j] = float(val)
                else:
                    try:
                        rows[i][j] = float(val)
                    except (TypeError, ValueError):
                        rows[i][j] = str(val)
    else:
        with engine.connect() as conn:
            spec.set_timeout(conn, 30)
            result = conn.execute(text(clean_sql))
            columns = list(result.keys())
            rows = [list(row) for row in result.fetchmany(max_fetch)]
            for i, row in enumerate(rows):
                for j, val in enumerate(row):
                    if val is None or isinstance(val, (str, bool, int, float)):
                        continue
                    if isinstance(val, Decimal):
                        rows[i][j] = float(val)
                    elif isinstance(val, numbers.Integral):
                        rows[i][j] = int(val)
                    elif isinstance(val, numbers.Real):
                        rows[i][j] = float(val)
                    else:
                        try:
                            rows[i][j] = float(val)
                        except (TypeError, ValueError):
                            rows[i][j] = str(val)
    elapsed = int((time.time() - start) * 1000)
    return {"columns": columns, "rows": rows, "execution_time_ms": elapsed}


@router.post("/validate", response_model=SQLValidateResponse, summary="Validate SQL query")
def validate_sql_endpoint(req: SQLValidateRequest, current_user: dict = require_role("sql_lab", "editor", "admin")):
    """Validate a SQL query by checking syntax and executing with LIMIT 0.
    Returns column info if valid."""
    # Step 1: Syntax validation
    try:
        clean_sql = validate_sql(req.sql)
    except SQLValidationError as e:
        return SQLValidateResponse(valid=False, error=str(e))

    # Step 2: Execute with LIMIT 0 to check tables/columns exist
    try:
        c = _get_connection_with_password(req.connection_id)

        engine, spec = get_engine_for_connection(c)
        wrapped_sql = f"SELECT * FROM ({clean_sql}) _t LIMIT 0"

        if c["db_type"] == "duckdb":
            df = spec.execute_native(c["database_name"], wrapped_sql)
            columns = [{"name": col, "type": str(df[col].dtype).lower()} for col in df.columns]
        else:
            with engine.connect() as conn:
                result = conn.execute(text(wrapped_sql))
                columns = [{"name": k, "type": "unknown"} for k in result.keys()]

        return SQLValidateResponse(valid=True, columns=columns)
    except Exception as e:
        return SQLValidateResponse(valid=False, error=str(e))


@router.post("/execute", response_model=SQLExecuteResponse, summary="Execute SQL query")
def execute_sql(req: SQLExecuteRequest, current_user: dict = require_role("sql_lab", "editor", "admin")):
    """Run a read-only SQL query against a database connection and return tabular results. Enforces a 30-second timeout and caches results."""
    # Validate SQL
    try:
        clean_sql = validate_sql(req.sql)
    except SQLValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Check cache
    key = cache_key(req.connection_id, clean_sql)
    cached = get_cached(key)
    if cached:
        columns = cached["columns"]
        rows = cached["rows"]
        return SQLExecuteResponse(
            columns=columns,
            rows=rows[:req.limit],
            row_count=len(rows),
            execution_time_ms=0,
        )

    c_max_fetch = min(getattr(req, "limit", 1000), 10_000)
    from api import job_queue
    try:
        if job_queue.queue_enabled():
            from api.tasks import execute_sql_task
            try:
                core = job_queue.submit_and_wait(
                    execute_sql_task,
                    {"connection_id": req.connection_id, "clean_sql": clean_sql, "max_fetch": c_max_fetch},
                    job_timeout=120, max_wait=90)
            except job_queue.QueueBusy:
                raise HTTPException(status_code=503, detail="Server is busy, please retry shortly")
            except job_queue.QueueJobError as e:
                raise HTTPException(status_code=400, detail=f"Query execution failed: {e}")
        else:
            core = run_sql_core(req.connection_id, clean_sql, c_max_fetch)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query execution failed: {str(e)}")
    columns, rows, elapsed = core["columns"], core["rows"], core["execution_time_ms"]

    set_cached(key, {"columns": columns, "rows": rows})
    return SQLExecuteResponse(
        columns=columns,
        rows=rows[:req.limit],
        row_count=len(rows),
        execution_time_ms=elapsed,
    )
