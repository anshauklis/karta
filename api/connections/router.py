import ipaddress
import api.json_util as json
import re as _re
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text, inspect

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
    ssl_enabled, is_system, sqlalchemy_uri, extra_params, created_by, created_at, updated_at"""




def get_engine_for_connection(c: dict):
    """Central engine resolver. Returns (engine, spec).

    Uses engine spec registry to build URL and create engine.
    For DuckDB, engine is still created via SQLAlchemy but test/schema use native API.
    """
    from api.engine_specs import get_spec
    from api.engine_specs.base import BaseEngineSpec

    spec = get_spec(c["db_type"]) or BaseEngineSpec()

    if c.get("sqlalchemy_uri"):
        # Path A — raw URI
        url = c["sqlalchemy_uri"]
    else:
        # Path B — spec builds URL from fields
        params = {
            "host": c.get("host", ""),
            "port": c.get("port", 0),
            "username": c.get("username", ""),
            "password": c.get("password", ""),
            "database_name": c.get("database_name", ""),
            "ssl_enabled": c.get("ssl_enabled", False),
            **(c.get("extra_params") or {}),
        }
        url = spec.build_url(params)

    engine = spec.create_engine(url, c.get("id"))
    return engine, spec


def _get_connection_with_password(conn_id: int):
    """Get connection details including decrypted password."""
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT id, name, db_type, host, port, database_name, username, "
            "password_encrypted, ssl_enabled, sqlalchemy_uri, extra_params "
            "FROM connections WHERE id = :id"
        ), {"id": conn_id})
        row = result.mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    row = dict(row)
    row["password"] = decrypt_password_safe(row["password_encrypted"])
    if row.get("sqlalchemy_uri"):
        row["sqlalchemy_uri"] = decrypt_password_safe(row["sqlalchemy_uri"])
    if row.get("extra_params"):
        from api.engine_specs import get_spec
        spec = get_spec(row["db_type"])
        if spec:
            for field in spec.encrypted_fields:
                if field in row["extra_params"] and field != "password":
                    try:
                        row["extra_params"][field] = decrypt_password_safe(row["extra_params"][field])
                    except Exception:
                        pass  # field may not be encrypted (legacy data)
    return row


def _get_connections_with_password(conn_ids: list[int]) -> dict[int, dict]:
    """Batch fetch connection details including decrypted password.
    Returns a dict keyed by connection id."""
    if not conn_ids:
        return {}
    placeholders = ", ".join(f":id{i}" for i in range(len(conn_ids)))
    params = {f"id{i}": cid for i, cid in enumerate(conn_ids)}
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT id, name, db_type, host, port, database_name, username, "
            "password_encrypted, ssl_enabled, sqlalchemy_uri, extra_params "
            f"FROM connections WHERE id IN ({placeholders})"
        ), params)
        rows = result.mappings().all()
    from api.engine_specs import get_spec
    out = {}
    for row in rows:
        r = dict(row)
        r["password"] = decrypt_password_safe(r["password_encrypted"])
        if r.get("sqlalchemy_uri"):
            r["sqlalchemy_uri"] = decrypt_password_safe(r["sqlalchemy_uri"])
        if r.get("extra_params"):
            spec = get_spec(r["db_type"])
            if spec:
                for field in spec.encrypted_fields:
                    if field in r["extra_params"] and field != "password":
                        try:
                            r["extra_params"][field] = decrypt_password_safe(r["extra_params"][field])
                        except Exception:
                            pass  # field may not be encrypted (legacy data)
        out[r["id"]] = r
    return out



@router.get("/engine-specs", summary="List available engine specs")
def list_engine_specs(current_user: dict = Depends(get_current_user)):
    """Return all registered engine specs with their form field definitions."""
    from dataclasses import asdict
    from api.engine_specs import get_all_specs
    result = []
    for _db_type, spec in get_all_specs().items():
        result.append({
            "db_type": spec.db_type,
            "display_name": spec.display_name,
            "icon": spec.icon,
            "sqlalchemy_uri_placeholder": spec.sqlalchemy_uri_placeholder,
            "connection_fields": [asdict(f) for f in spec.connection_fields],
        })
    # Ensure _sqlalchemy is always last
    result.sort(key=lambda x: (x["db_type"] == "_sqlalchemy", x["display_name"]))
    return result


@router.get("/plugins", summary="List installed connector plugins")
def list_plugins(current_user: dict = Depends(require_admin)):
    """Return installed connector plugins with source info. Admin only."""
    from api.engine_specs import get_all_specs
    from importlib.metadata import entry_points

    # Map external entry_points to package info
    external = {}
    for ep in entry_points(group="karta.engine_specs"):
        try:
            external[ep.name] = {
                "package": ep.dist.name if ep.dist else ep.value,
                "version": ep.dist.metadata["Version"] if ep.dist else "unknown",
            }
        except Exception:
            external[ep.name] = {"package": ep.value, "version": "unknown"}

    result = []
    for db_type, spec in get_all_specs().items():
        info = external.get(db_type)
        result.append({
            "db_type": spec.db_type,
            "display_name": spec.display_name,
            "type": "connector",
            "source": f"{info['package']} {info['version']}" if info else "built-in",
            "status": "active",
        })
    result.sort(key=lambda x: (x["source"] != "built-in", x["display_name"]))
    return result


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


@router.post("", summary="Create connection", response_model=ConnectionResponse, status_code=201)
def create_connection(req: ConnectionCreate, current_user: dict = Depends(require_admin)):
    """Create a new database connection. Admin only. Password is encrypted with AES-256-GCM."""
    if req.host:
        _validate_connection_host(req.host)
    user_id = int(current_user["sub"])
    password_encrypted = encrypt_password_safe(req.password) if req.password else ""
    uri_encrypted = encrypt_password_safe(req.sqlalchemy_uri) if req.sqlalchemy_uri else None
    extra_params = dict(req.extra_params) if req.extra_params else {}
    if extra_params:
        from api.engine_specs import get_spec
        spec = get_spec(req.db_type)
        if spec:
            for field in spec.encrypted_fields:
                if field in extra_params and field != "password":
                    extra_params[field] = encrypt_password_safe(extra_params[field])
    extra = json.dumps(extra_params)

    with engine.connect() as conn:
        result = conn.execute(
            text(f"""
                INSERT INTO connections (name, db_type, host, port, database_name,
                    username, password_encrypted, ssl_enabled, sqlalchemy_uri, extra_params, created_by)
                VALUES (:name, :db_type, :host, :port, :database_name,
                    :username, :password_encrypted, :ssl_enabled, :sqlalchemy_uri, :extra_params::jsonb, :created_by)
                RETURNING {_CONN_COLS}
            """),
            {
                "name": req.name, "db_type": req.db_type, "host": req.host,
                "port": req.port, "database_name": req.database_name,
                "username": req.username, "password_encrypted": password_encrypted,
                "ssl_enabled": req.ssl_enabled, "sqlalchemy_uri": uri_encrypted,
                "extra_params": extra, "created_by": user_id,
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
    if "sqlalchemy_uri" in updates:
        updates["sqlalchemy_uri"] = encrypt_password_safe(updates["sqlalchemy_uri"])
    if "extra_params" in updates and updates["extra_params"]:
        from api.engine_specs import get_spec
        with engine.connect() as conn2:
            db_type_row = conn2.execute(
                text("SELECT db_type FROM connections WHERE id = :id"), {"id": conn_id}
            ).fetchone()
        if db_type_row:
            spec = get_spec(db_type_row[0])
            if spec:
                for field in spec.encrypted_fields:
                    if field in updates["extra_params"] and field != "password":
                        updates["extra_params"][field] = encrypt_password_safe(updates["extra_params"][field])
    if "extra_params" in updates:
        updates["extra_params"] = json.dumps(updates["extra_params"])

    set_parts = []
    for k in updates:
        if k == "extra_params":
            set_parts.append(f"{k} = :{k}::jsonb")
        else:
            set_parts.append(f"{k} = :{k}")
    set_clauses = ", ".join(set_parts)
    updates["id"] = conn_id

    with engine.connect() as conn:
        conn.execute(
            text(f"UPDATE connections SET {set_clauses}, updated_at = NOW() WHERE id = :id"),
            updates
        )
        conn.commit()

    from api.engine_cache import invalidate
    invalidate(conn_id)
    from api.parquet_cache import invalidate_connection
    invalidate_connection(conn_id)

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
    from api.parquet_cache import invalidate_connection
    invalidate_connection(conn_id)


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
        eng, spec = get_engine_for_connection(c)
        spec.test_connection(eng)
        if hasattr(eng, 'dispose'):
            eng.dispose()
        return ConnectionTestResult(success=True, message="Connection successful")
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger("karta.connections").exception("Connection test failed for conn_id=%s", conn_id)
        msg = str(e)
        if "://" in msg:
            msg = msg.split("://")[0] + "://<redacted>"
        return ConnectionTestResult(success=False, message=msg)


@router.get("/{conn_id}/schemas", summary="List schemas", response_model=list[str])
def get_schemas(conn_id: int, current_user: dict = Depends(get_current_user)):
    """List available database schemas for a connection."""
    c = _get_connection_with_password(conn_id)
    eng, spec = get_engine_for_connection(c)
    return spec.get_schemas(eng)


@router.get("/{conn_id}/schema", summary="Get schema", response_model=list[SchemaTable])
def get_schema(conn_id: int, schema: str | None = None, current_user: dict = Depends(get_current_user)):
    """Get all tables and their columns with data types."""
    c = _get_connection_with_password(conn_id)
    eng, spec = get_engine_for_connection(c)
    raw = spec.get_schema(eng, schema)
    return [
        SchemaTable(
            table_name=t["table_name"],
            columns=[SchemaColumn(name=col["name"], type=col["type"], nullable=col["nullable"]) for col in t["columns"]]
        )
        for t in raw
    ]


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
    engine, spec = get_engine_for_connection(c)

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

    # Validate table name against actual tables
    inspector = inspect(engine)
    valid_tables = inspector.get_table_names()
    if table_name not in valid_tables:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    with engine.connect() as conn:
        spec.set_timeout(conn, 10)
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
    engine, spec = get_engine_for_connection(c)

    with engine.connect() as conn:
        spec.set_timeout(conn, 15)

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
        db_columns = inspect(engine).get_columns(table_name)
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
