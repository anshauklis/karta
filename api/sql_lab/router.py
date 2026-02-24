import time
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import create_engine, text

from api.models import SQLExecuteRequest, SQLExecuteResponse, SQLValidateRequest, SQLValidateResponse
from api.sql_validator import validate_sql, SQLValidationError
from api.connections.router import _get_connection_with_password, _build_url, _create_ext_engine, is_postgres, is_clickhouse, is_mssql
from api.cache import cache_key, get_cached, set_cached
from api.auth.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/sql", tags=["sql_lab"])


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

        if c["db_type"] == "duckdb":
            import duckdb
            duck = duckdb.connect(c["database_name"], read_only=True)
            try:
                result = duck.execute(f"SELECT * FROM ({clean_sql}) _t LIMIT 0")
                columns = [{"name": desc[0], "type": str(desc[1]).lower()} for desc in result.description]
            finally:
                duck.close()
        else:
            url = _build_url(c["db_type"], c["host"], c["port"], c["database_name"],
                            c["username"], c["password"], c["ssl_enabled"])
            ext_engine = _create_ext_engine(url, c["db_type"], c["id"])
            with ext_engine.connect() as conn:
                result = conn.execute(text(f"SELECT * FROM ({clean_sql}) _t LIMIT 0"))
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

    # Get connection
    c = _get_connection_with_password(req.connection_id)
    max_fetch = min(getattr(req, "limit", 1000), 10_000)

    # DuckDB fast path: native API avoids SQLAlchemy overhead
    if c["db_type"] == "duckdb":
        import duckdb
        import numbers
        try:
            start = time.time()
            duck = duckdb.connect(c["database_name"], read_only=True)
            try:
                result = duck.execute(clean_sql)
                columns = [desc[0] for desc in result.description]
                rows = [list(row) for row in result.fetchmany(max_fetch)]
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
            finally:
                duck.close()
            elapsed = int((time.time() - start) * 1000)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Query execution failed: {str(e)}")
    else:
        url = _build_url(c["db_type"], c["host"], c["port"], c["database_name"],
                         c["username"], c["password"], c["ssl_enabled"])

        ext_engine = _create_ext_engine(url, c["db_type"], c["id"])
        try:
            start = time.time()
            with ext_engine.connect() as conn:
                # Set statement timeout (30s)
                if is_postgres(c["db_type"]):
                    conn.execute(text("SET statement_timeout = 30000"))
                elif is_clickhouse(c["db_type"]):
                    conn.execute(text("SET max_execution_time = 30"))
                elif is_mssql(c["db_type"]):
                    conn.execute(text("SET LOCK_TIMEOUT 30000"))
                result = conn.execute(text(clean_sql))
                columns = list(result.keys())
                rows = [list(row) for row in result.fetchmany(max_fetch)]
                # Convert non-serializable types to JSON-safe Python primitives
                from decimal import Decimal
                import numbers
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
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Query execution failed: {str(e)}")

    # Store in cache
    set_cached(key, {"columns": columns, "rows": rows})

    return SQLExecuteResponse(
        columns=columns,
        rows=rows[:req.limit],
        row_count=len(rows),
        execution_time_ms=elapsed,
    )
