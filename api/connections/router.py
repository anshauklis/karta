import ipaddress
import json
import re as _re
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.pool import NullPool

from api.database import engine
from api.models import (
    ConnectionCreate, ConnectionUpdate, ConnectionResponse,
    ConnectionTestResult, SchemaTable, SchemaColumn,
)
from api.auth.dependencies import get_current_user, require_admin
from api.crypto import encrypt_password_safe, decrypt_password_safe

router = APIRouter(prefix="/api/connections", tags=["connections"])

# Internal hostnames that should never be accessible via connections
_BLOCKED_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0",
                  "postgres", "redis", "api", "frontend", "nginx", "mcp",
                  "metadata.google.internal", "metadata.aws.internal"}


def _is_private_ip(host: str) -> bool:
    """Check if a host resolves to a private/reserved IP range."""
    try:
        addr = ipaddress.ip_address(host)
        return addr.is_private or addr.is_reserved or addr.is_loopback or addr.is_link_local
    except ValueError:
        return False


def _validate_connection_host(host: str) -> None:
    """Block SSRF: reject connections to internal/private hosts."""
    if not host:
        return
    host_lower = host.lower().strip()
    if host_lower in _BLOCKED_HOSTS:
        raise HTTPException(400, f"Connection to '{host}' is not allowed")
    if _is_private_ip(host_lower):
        raise HTTPException(400, "Connection to private/internal IP addresses is not allowed")


_SAFE_IDENTIFIER_RE = _re.compile(r'^[a-zA-Z_][a-zA-Z0-9_.]*$')


def _validate_identifier(name: str, label: str = "identifier") -> None:
    """Validate a SQL identifier (table name, column name) to prevent injection."""
    if not name or not _SAFE_IDENTIFIER_RE.match(name):
        raise HTTPException(400, f"Invalid {label}: {name!r}")

_CONN_COLS = """id, name, db_type, host, port, database_name, username,
    ssl_enabled, is_system, created_by, created_at, updated_at"""


def _build_url(db_type: str, host: str, port: int, database_name: str,
               username: str, password: str, ssl_enabled: bool) -> str:
    """Build SQLAlchemy connection URL from connection params."""
    if db_type in ("postgres", "postgresql"):
        driver = "postgresql"
    elif db_type == "mysql":
        driver = "mysql+pymysql"
    elif db_type == "clickhouse":
        driver = "clickhouse+http"
    elif db_type == "mssql":
        driver = "mssql+pymssql"
    elif db_type == "duckdb":
        # DuckDB uses file path; read_only allows concurrent access
        return f"duckdb:///{database_name}?access_mode=read_only"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported db_type: {db_type}")

    url = f"{driver}://{username}:{password}@{host}:{port}/{database_name}"
    if ssl_enabled and db_type in ("postgres", "postgresql"):
        url += "?sslmode=require"
    elif ssl_enabled and db_type == "clickhouse":
        url += "?protocol=https"
    return url


def _create_ext_engine(url: str, db_type: str, connection_id: int | None = None):
    """Get engine from cache (or create uncached for DuckDB/one-off)."""
    if db_type == "duckdb":
        return create_engine(url, poolclass=NullPool)
    if connection_id is not None:
        from api.engine_cache import get_engine
        return get_engine(connection_id, url, db_type)
    return create_engine(url, pool_pre_ping=True)


def is_postgres(db_type: str) -> bool:
    return db_type in ("postgres", "postgresql")


def is_clickhouse(db_type: str) -> bool:
    return db_type == "clickhouse"


def is_mssql(db_type: str) -> bool:
    return db_type == "mssql"


def _get_connection_with_password(conn_id: int):
    """Get connection details including decrypted password."""
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT id, name, db_type, host, port, database_name, username, "
            "password_encrypted, ssl_enabled FROM connections WHERE id = :id"
        ), {"id": conn_id})
        row = result.mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    row = dict(row)
    row["password"] = decrypt_password_safe(row["password_encrypted"])
    return row


@router.get("", summary="List connections", response_model=list[ConnectionResponse])
def list_connections(
    q: str | None = None,
    limit: int | None = None,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """List all database connections. Passwords are never returned.

    Supports optional search (q) and pagination (limit, offset). When limit or q is
    provided, returns paginated results with X-Total-Count header. Without these params,
    returns all connections (backward-compatible).
    """
    use_pagination = q is not None or limit is not None

    conditions = []
    params: dict = {}

    if q is not None:
        conditions.append("(name ILIKE :q OR host ILIKE :q OR database_name ILIKE :q)")
        params["q"] = f"%{q}%"

    where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    base_query = f"SELECT {_CONN_COLS} FROM connections{where_clause} ORDER BY is_system DESC, name"

    with engine.connect() as conn:
        if use_pagination:
            total = conn.execute(
                text(f"SELECT COUNT(*) FROM connections{where_clause}"), params
            ).scalar()

            effective_limit = min(limit or 50, 200)
            params["lim"] = effective_limit
            params["off"] = offset
            result = conn.execute(text(base_query + " LIMIT :lim OFFSET :off"), params)
            items = [dict(row) for row in result.mappings().all()]
            content = json.loads(json.dumps(items, default=str))
            return JSONResponse(content=content, headers={"X-Total-Count": str(total)})
        else:
            result = conn.execute(text(base_query), params)
            return [dict(row) for row in result.mappings().all()]


@router.post("", summary="Create connection", response_model=ConnectionResponse, status_code=201)
def create_connection(req: ConnectionCreate, current_user: dict = Depends(require_admin)):
    """Create a new database connection. Admin only. Password is encrypted with AES-256-GCM."""
    _validate_connection_host(req.host)
    user_id = int(current_user["sub"])
    password_encrypted = encrypt_password_safe(req.password)

    with engine.connect() as conn:
        result = conn.execute(
            text(f"""
                INSERT INTO connections (name, db_type, host, port, database_name,
                    username, password_encrypted, ssl_enabled, created_by)
                VALUES (:name, :db_type, :host, :port, :database_name,
                    :username, :password_encrypted, :ssl_enabled, :created_by)
                RETURNING {_CONN_COLS}
            """),
            {
                "name": req.name, "db_type": req.db_type, "host": req.host,
                "port": req.port, "database_name": req.database_name,
                "username": req.username, "password_encrypted": password_encrypted,
                "ssl_enabled": req.ssl_enabled, "created_by": user_id,
            }
        )
        connection = dict(result.mappings().fetchone())
        conn.commit()
    return connection


@router.put("/{conn_id}", summary="Update connection", response_model=ConnectionResponse)
def update_connection(conn_id: int, req: ConnectionUpdate, current_user: dict = Depends(require_admin)):
    """Update connection details. Admin only. Password is re-encrypted if changed."""
    if req.host:
        _validate_connection_host(req.host)
    # Prevent editing system connections
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT is_system FROM connections WHERE id = :id"), {"id": conn_id}
        ).fetchone()
        if row and row[0]:
            raise HTTPException(status_code=403, detail="System connections cannot be edited")

    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "password" in updates:
        updates["password_encrypted"] = encrypt_password_safe(updates.pop("password"))

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = conn_id

    with engine.connect() as conn:
        conn.execute(
            text(f"UPDATE connections SET {set_clauses}, updated_at = NOW() WHERE id = :id"),
            updates
        )
        conn.commit()

    from api.engine_cache import invalidate
    invalidate(conn_id)

    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT {_CONN_COLS} FROM connections WHERE id = :id"), {"id": conn_id})
        row = result.mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    return dict(row)


@router.delete("/{conn_id}", summary="Delete connection", status_code=204)
def delete_connection(conn_id: int, current_user: dict = Depends(require_admin)):
    """Delete a database connection. Admin only. System connections cannot be deleted."""
    with engine.connect() as conn:
        # Prevent deleting system connections
        row = conn.execute(
            text("SELECT is_system FROM connections WHERE id = :id"), {"id": conn_id}
        ).fetchone()
        if row and row[0]:
            raise HTTPException(status_code=403, detail="System connections cannot be deleted")
        conn.execute(text("DELETE FROM connections WHERE id = :id"), {"id": conn_id})
        conn.commit()
    from api.engine_cache import invalidate
    invalidate(conn_id)


@router.get("/{conn_id}/datasets", summary="List datasets using this connection")
def list_connection_datasets(conn_id: int, current_user: dict = Depends(get_current_user)):
    """List all datasets that use a specific connection."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT id, name, description, dataset_type, sql_query
            FROM datasets WHERE connection_id = :cid ORDER BY name
        """), {"cid": conn_id})
        return [dict(row) for row in result.mappings().all()]


@router.post("/{conn_id}/test", summary="Test connection", response_model=ConnectionTestResult)
def test_connection(conn_id: int, current_user: dict = Depends(get_current_user)):
    """Test a database connection by executing a simple query."""
    try:
        c = _get_connection_with_password(conn_id)
        # DuckDB: use native API to stay consistent (no mixed access)
        if c["db_type"] == "duckdb":
            import duckdb
            duck = duckdb.connect(c["database_name"], read_only=True)
            duck.execute("SELECT 1")
            duck.close()
            return ConnectionTestResult(success=True, message="Connection successful")
        url = _build_url(c["db_type"], c["host"], c["port"], c["database_name"],
                         c["username"], c["password"], c["ssl_enabled"])
        test_engine = _create_ext_engine(url, c["db_type"])
        with test_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        test_engine.dispose()
        return ConnectionTestResult(success=True, message="Connection successful")
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger("karta.connections").exception("Connection test failed for conn_id=%s", conn_id)
        msg = str(e)
        # Strip connection URLs and credentials from error messages
        if "://" in msg:
            msg = msg.split("://")[0] + "://<redacted>"
        return ConnectionTestResult(success=False, message=msg)


def _get_duckdb_schema(db_path: str, schema: str | None = None) -> list[SchemaTable]:
    """Get schema from DuckDB using native API."""
    import duckdb
    conn = duckdb.connect(db_path, read_only=True)
    schema_filter = schema or "main"
    try:
        table_rows = conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
            [schema_filter],
        ).fetchall()
        tables = []
        for (tname,) in table_rows:
            col_rows = conn.execute(
                "SELECT column_name, data_type, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema = ? AND table_name = ? "
                "ORDER BY ordinal_position",
                [schema_filter, tname],
            ).fetchall()
            columns = [
                SchemaColumn(name=cname, type=ctype, nullable=(nullable == "YES"))
                for cname, ctype, nullable in col_rows
            ]
            tables.append(SchemaTable(table_name=tname, columns=columns))
        return tables
    finally:
        conn.close()


@router.get("/{conn_id}/schemas", summary="List schemas", response_model=list[str])
def get_schemas(conn_id: int, current_user: dict = Depends(get_current_user)):
    """List available database schemas for a connection."""
    c = _get_connection_with_password(conn_id)

    if c["db_type"] == "duckdb":
        import duckdb
        duck = duckdb.connect(c["database_name"], read_only=True)
        try:
            rows = duck.execute(
                "SELECT DISTINCT table_schema FROM information_schema.tables ORDER BY table_schema"
            ).fetchall()
            return [r[0] for r in rows]
        finally:
            duck.close()

    url = _build_url(c["db_type"], c["host"], c["port"], c["database_name"],
                     c["username"], c["password"], c["ssl_enabled"])
    ext_engine = _create_ext_engine(url, c["db_type"], c["id"])

    if is_postgres(c["db_type"]):
        with ext_engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') "
                "AND schema_name NOT LIKE 'pg_temp%' "
                "AND schema_name NOT LIKE 'pg_toast_temp%' "
                "ORDER BY schema_name"
            )).fetchall()
            return [r[0] for r in rows]
    elif c["db_type"] == "mysql":
        with ext_engine.connect() as conn:
            rows = conn.execute(text("SHOW DATABASES")).fetchall()
            return [r[0] for r in rows if r[0] not in ("information_schema", "performance_schema", "mysql", "sys")]
    elif is_clickhouse(c["db_type"]):
        with ext_engine.connect() as conn:
            rows = conn.execute(text("SELECT name FROM system.databases ORDER BY name")).fetchall()
            return [r[0] for r in rows if r[0] not in ("system", "information_schema", "INFORMATION_SCHEMA")]
    else:
        # MSSQL or unknown — use SQLAlchemy inspector
        insp = inspect(ext_engine)
        return sorted(insp.get_schema_names())


@router.get("/{conn_id}/schema", summary="Get schema", response_model=list[SchemaTable])
def get_schema(conn_id: int, schema: str | None = None, current_user: dict = Depends(get_current_user)):
    """Get all tables and their columns with data types."""
    c = _get_connection_with_password(conn_id)

    # DuckDB: use native API instead of SQLAlchemy inspector
    if c["db_type"] == "duckdb":
        return _get_duckdb_schema(c["database_name"], schema)

    url = _build_url(c["db_type"], c["host"], c["port"], c["database_name"],
                     c["username"], c["password"], c["ssl_enabled"])
    ext_engine = _create_ext_engine(url, c["db_type"], c["id"])

    # Use a single information_schema query for PostgreSQL (much faster than inspector)
    if is_postgres(c["db_type"]):
        schema_filter = schema or "public"
        with ext_engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT table_name, column_name, data_type, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema = :schema "
                "ORDER BY table_name, ordinal_position"
            ), {"schema": schema_filter}).fetchall()
        tables_map: dict[str, list[SchemaColumn]] = {}
        for tname, cname, ctype, nullable in rows:
            tables_map.setdefault(tname, []).append(
                SchemaColumn(name=cname, type=ctype, nullable=(nullable == "YES"))
            )
        return [SchemaTable(table_name=t, columns=cols) for t, cols in tables_map.items()]

    # Fallback: SQLAlchemy inspector for MySQL, MSSQL, ClickHouse
    inspector = inspect(ext_engine)
    tables = []
    for table_name in inspector.get_table_names(schema=schema):
        columns = []
        for col in inspector.get_columns(table_name, schema=schema):
            columns.append(SchemaColumn(
                name=col["name"],
                type=str(col["type"]),
                nullable=col.get("nullable", True),
            ))
        tables.append(SchemaTable(table_name=table_name, columns=columns))
    return tables


import os

_SAMPLE_ROWS_MAX = int(os.environ.get("SAMPLE_ROWS_MAX", "50"))


@router.get("/{conn_id}/schema/{table_name}/sample", summary="Get table sample")
def get_table_sample(
    conn_id: int,
    table_name: str,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Get first N rows from a table to understand data format."""
    _validate_identifier(table_name, "table name")
    import numbers
    limit = max(1, min(limit, _SAMPLE_ROWS_MAX))

    c = _get_connection_with_password(conn_id)

    # DuckDB: use native API for performance
    if c["db_type"] == "duckdb":
        import duckdb
        duck = duckdb.connect(c["database_name"], read_only=True)
        try:
            valid_tables = [r[0] for r in duck.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
            ).fetchall()]
            if table_name not in valid_tables:
                raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
            result = duck.execute(f'SELECT * FROM "{table_name}" LIMIT ?', [limit])
            columns = [desc[0] for desc in result.description]
            rows = [list(row) for row in result.fetchall()]
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
            return {"columns": columns, "rows": rows, "row_count": len(rows)}
        finally:
            duck.close()

    url = _build_url(c["db_type"], c["host"], c["port"], c["database_name"],
                     c["username"], c["password"], c["ssl_enabled"])
    ext_engine = _create_ext_engine(url, c["db_type"], c["id"])

    # Validate table name against actual tables
    inspector = inspect(ext_engine)
    valid_tables = inspector.get_table_names()
    if table_name not in valid_tables:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    with ext_engine.connect() as conn:
        if is_postgres(c["db_type"]):
            conn.execute(text("SET statement_timeout = 10000"))
        elif is_clickhouse(c["db_type"]):
            conn.execute(text("SET max_execution_time = 10"))
        elif is_mssql(c["db_type"]):
            conn.execute(text("SET LOCK_TIMEOUT 10000"))
        # Use quoted identifier to prevent SQL injection
        result = conn.execute(text(f'SELECT * FROM "{table_name}" LIMIT :limit'), {"limit": limit})
        columns = list(result.keys())
        rows = [list(row) for row in result.fetchall()]
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

    return {"columns": columns, "rows": rows, "row_count": len(rows)}


@router.get("/{conn_id}/schema/{table_name}/profile", summary="Get table profile")
def get_table_profile(
    conn_id: int,
    table_name: str,
    current_user: dict = Depends(get_current_user),
):
    """Get column types, sample values, and distinct counts for a table.

    Returns everything an LLM needs to write correct SQL in a single call:
    columns with types, 3 sample rows, row count, and top distinct values per column.
    """
    _validate_identifier(table_name, "table name")
    c = _get_connection_with_password(conn_id)
    url = _build_url(c["db_type"], c["host"], c["port"], c["database_name"],
                     c["username"], c["password"], c["ssl_enabled"])
    ext_engine = _create_ext_engine(url, c["db_type"], c["id"])

    with ext_engine.connect() as conn:
        if is_postgres(c["db_type"]):
            conn.execute(text("SET statement_timeout = 15000"))

        # Row count
        try:
            cnt = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar()
        except Exception:
            cnt = None

        # Sample rows
        sample_result = conn.execute(text(f'SELECT * FROM "{table_name}" LIMIT 3'))
        col_names = list(sample_result.keys())
        sample_rows = []
        for row in sample_result.fetchall():
            sample_rows.append({
                col_names[i]: str(v) if v is not None and not isinstance(v, (str, bool, int, float)) else v
                for i, v in enumerate(row)
            })

        # Column types
        db_columns = inspect(ext_engine).get_columns(table_name)
        col_info = [{"name": c_meta["name"], "type": str(c_meta["type"])} for c_meta in db_columns]

        # Distinct values for string/categorical columns (top 10)
        distinct_values = {}
        for ci in col_info:
            col_name = ci["name"]
            type_str = ci["type"].upper()
            if any(t in type_str for t in ("CHAR", "TEXT", "VARCHAR", "BOOL", "ENUM")):
                try:
                    dv = conn.execute(
                        text(f'SELECT "{col_name}", COUNT(*) as cnt FROM "{table_name}" GROUP BY "{col_name}" ORDER BY cnt DESC LIMIT 10')
                    )
                    distinct_values[col_name] = [
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
