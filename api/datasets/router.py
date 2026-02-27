import api.json_util as json
import os
import re

import duckdb
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text

from api.database import engine
from api.models import DatasetCreate, DatasetUpdate, DatasetResponse, SQLExecuteRequest, SQLExecuteResponse
from api.auth.dependencies import get_current_user, check_ownership, require_role
from api.sql_lab.router import execute_sql

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

_DATASET_COLS = """id, connection_id, name, description, sql_query, cache_ttl,
    dataset_type, table_name, schema_name,
    created_by, created_at, updated_at"""


@router.get("", summary="List datasets", response_model=list[DatasetResponse])
def list_datasets(
    q: str | None = None,
    connection_id: int | None = None,
    limit: int | None = None,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """List all datasets (virtual and physical).

    Supports optional search (q), filter by connection_id, and pagination (limit, offset).
    When limit or q is provided, returns paginated results with X-Total-Count header.
    Without these params, returns all datasets (backward-compatible).
    """
    use_pagination = q is not None or limit is not None

    conditions = []
    params: dict = {}

    if q is not None:
        conditions.append("(name ILIKE :q OR description ILIKE :q)")
        params["q"] = f"%{q}%"
    if connection_id is not None:
        conditions.append("connection_id = :connection_id")
        params["connection_id"] = connection_id

    where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    base_query = f"SELECT {_DATASET_COLS} FROM datasets{where_clause} ORDER BY name"

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


@router.post("", summary="Create dataset", response_model=DatasetResponse, status_code=201)
def create_dataset(req: DatasetCreate, current_user: dict = require_role("editor", "admin")):
    """Create a dataset. Virtual datasets use a SQL query, physical datasets wrap a database table."""
    user_id = int(current_user["sub"])

    # Physical dataset: generate sql_query from table_name/schema_name
    if req.dataset_type == "physical":
        if not req.table_name:
            raise HTTPException(status_code=400, detail="table_name is required for physical datasets")
        if req.schema_name:
            sql_query = f'SELECT * FROM "{req.schema_name}"."{req.table_name}"'
        else:
            sql_query = f'SELECT * FROM "{req.table_name}"'
    else:
        if not req.sql_query:
            raise HTTPException(status_code=400, detail="sql_query is required for virtual datasets")
        sql_query = req.sql_query

    with engine.connect() as conn:
        result = conn.execute(
            text(f"""
                INSERT INTO datasets (connection_id, name, description, sql_query, cache_ttl,
                    dataset_type, table_name, schema_name, created_by)
                VALUES (:connection_id, :name, :description, :sql_query, :cache_ttl,
                    :dataset_type, :table_name, :schema_name, :created_by)
                RETURNING {_DATASET_COLS}
            """),
            {
                "connection_id": req.connection_id, "name": req.name,
                "description": req.description, "sql_query": sql_query,
                "cache_ttl": req.cache_ttl, "dataset_type": req.dataset_type,
                "table_name": req.table_name, "schema_name": req.schema_name,
                "created_by": user_id,
            }
        )
        dataset = dict(result.mappings().fetchone())
        conn.commit()
    return dataset


@router.get("/{dataset_id}", summary="Get dataset", response_model=DatasetResponse)
def get_dataset(dataset_id: int, current_user: dict = Depends(get_current_user)):
    """Get dataset details including SQL query and connection info."""
    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT {_DATASET_COLS} FROM datasets WHERE id = :id"),
            {"id": dataset_id}
        )
        row = result.mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dict(row)


@router.get("/{dataset_id}/charts", summary="List charts using this dataset")
def list_dataset_charts(dataset_id: int, current_user: dict = Depends(get_current_user)):
    """List all charts that use a specific dataset."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT c.id, c.title, c.chart_type, c.mode, c.dashboard_id,
                   d.title as dashboard_title, d.url_slug as dashboard_slug
            FROM charts c
            LEFT JOIN dashboards d ON d.id = c.dashboard_id
            WHERE c.dataset_id = :did
            ORDER BY c.title
        """), {"did": dataset_id})
        return [dict(row) for row in result.mappings().all()]


@router.put("/{dataset_id}", summary="Update dataset", response_model=DatasetResponse)
def update_dataset(dataset_id: int, req: DatasetUpdate, current_user: dict = require_role("editor", "admin")):
    """Update dataset name, description, SQL query, or cache TTL."""
    with engine.connect() as conn:
        check_ownership(conn, "datasets", dataset_id, current_user)

    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = dataset_id

    with engine.connect() as conn:
        conn.execute(
            text(f"UPDATE datasets SET {set_clauses}, updated_at = NOW() WHERE id = :id"),
            updates
        )
        conn.commit()
    return get_dataset(dataset_id, current_user)


@router.delete("/{dataset_id}", summary="Delete dataset", status_code=204)
def delete_dataset(dataset_id: int, current_user: dict = require_role("editor", "admin")):
    """Delete a dataset. Physical DuckDB datasets also drop the underlying table."""
    with engine.connect() as conn:
        check_ownership(conn, "datasets", dataset_id, current_user)

        # Look up dataset and its connection
        ds = conn.execute(
            text("SELECT connection_id, sql_query FROM datasets WHERE id = :id"),
            {"id": dataset_id},
        ).mappings().fetchone()

        if not ds:
            raise HTTPException(status_code=404, detail="Dataset not found")

        connection_id = ds["connection_id"]
        sql_query = ds["sql_query"] or ""

        # If this is a DuckDB connection, drop the table from DuckDB
        if connection_id:
            c = conn.execute(
                text("SELECT db_type, database_name FROM connections WHERE id = :id"),
                {"id": connection_id},
            ).mappings().fetchone()
            if c and c["db_type"] == "duckdb" and c["database_name"]:
                db_path = c["database_name"]
                # Extract table name from SQL: SELECT * FROM "table_name"
                m = re.search(r'FROM\s+"([^"]+)"', sql_query)
                if m and os.path.exists(db_path):
                    table_name = m.group(1)
                    try:
                        duck = duckdb.connect(db_path)
                        duck.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                        duck.close()
                    except Exception:
                        pass  # Non-critical — table might already be gone

        conn.execute(text("DELETE FROM datasets WHERE id = :id"), {"id": dataset_id})
        conn.commit()


@router.post("/{dataset_id}/preview", summary="Preview dataset", response_model=SQLExecuteResponse)
def preview_dataset(dataset_id: int, current_user: dict = Depends(get_current_user)):
    """Execute the dataset SQL query and return sample data (first 200 rows)."""
    ds = get_dataset(dataset_id, current_user)
    req = SQLExecuteRequest(
        connection_id=ds["connection_id"],
        sql=ds["sql_query"],
        limit=100,
    )
    return execute_sql(req, current_user)


@router.get("/{dataset_id}/columns", summary="Get dataset columns")
def get_dataset_columns(dataset_id: int, current_user: dict = Depends(get_current_user)):
    """Get column names and data types by executing the dataset SQL."""
    ds = get_dataset(dataset_id, current_user)
    connection_id = ds["connection_id"]
    sql_query = ds["sql_query"]
    if not connection_id or not sql_query:
        return {"columns": []}

    from api.connections.router import _get_connection_with_password, get_engine_for_connection
    c = _get_connection_with_password(connection_id)
    ext_engine, spec = get_engine_for_connection(c)

    if c["db_type"] == "duckdb":
        df = spec.execute_native(c["database_name"], f"SELECT * FROM ({sql_query}) _t LIMIT 0")
        columns = [{"name": col, "type": str(df[col].dtype)} for col in df.columns]
        return {"columns": columns}

    with ext_engine.connect() as ext_conn:
        from api.sql_validator import validate_sql
        clean = validate_sql(sql_query)
        result = ext_conn.execute(text(f"SELECT * FROM ({clean}) _t LIMIT 0"))
        cursor_desc = result.cursor.description
        if c["db_type"] in ("postgresql", "postgres") and cursor_desc:
            oids = [d.type_code for d in cursor_desc]
            type_rows = ext_conn.execute(
                text("SELECT oid, typname FROM pg_type WHERE oid = ANY(:oids)"),
                {"oids": oids},
            )
            oid_map = {row[0]: row[1] for row in type_rows}
            columns = [{"name": d.name, "type": oid_map.get(d.type_code, "unknown")} for d in cursor_desc]
        else:
            columns = [{"name": k, "type": "unknown"} for k in result.keys()]
    return {"columns": columns}
