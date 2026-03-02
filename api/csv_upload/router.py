import asyncio
import os
import re
import uuid

import duckdb
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import text

from api.database import engine, SHARED_DUCKDB_PATH
from api.auth.dependencies import require_role
from api.crypto import encrypt_password_safe

router = APIRouter(prefix="/api/csv", tags=["file-upload"])

SUPPORTED_EXTENSIONS = {".csv", ".parquet"}

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "csv")
TEMP_DIR = os.path.join(DATA_DIR, "tmp")
SHARED_DB_PATH = SHARED_DUCKDB_PATH
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB

# Ensure directories exist
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)


class CSVPreviewResponse(BaseModel):
    temp_id: str
    filename: str
    columns: list[dict]  # [{"name": "col1", "type": "VARCHAR"}, ...]
    rows: list[list]
    total_rows: int


class CSVImportRequest(BaseModel):
    temp_id: str
    table_name: str
    dataset_name: str
    description: str = ""


class CSVImportResponse(BaseModel):
    dataset_id: int
    connection_id: int
    dataset_name: str
    table_name: str
    row_count: int


def _sanitize_table_name(name: str) -> str:
    """Sanitize table name: lowercase, replace non-alnum with underscore, strip."""
    sanitized = re.sub(r'[^a-z0-9_]', '_', name.lower())
    # Remove leading digits/underscores
    sanitized = sanitized.lstrip("0123456789_")
    result = sanitized[:64] or "uploaded_table"
    # Final safety check
    if not re.match(r'^[a-z][a-z0-9_]*$', result):
        return "uploaded_table"
    return result


def _get_file_ext(filename: str) -> str:
    """Return lowercase file extension including the dot."""
    return os.path.splitext(filename)[1].lower()


def _duckdb_read_fn(file_path: str) -> str:
    """Return the DuckDB read function call for the given file type."""
    ext = _get_file_ext(file_path)
    if ext == ".parquet":
        return f"read_parquet('{file_path}')"
    return f"read_csv_auto('{file_path}')"


def _get_or_create_shared_connection(user_id: int) -> int:
    """Get or create the shared DuckDB connection for file uploads."""
    with engine.connect() as db_conn:
        row = db_conn.execute(
            text("SELECT id FROM connections WHERE db_type = 'duckdb' AND database_name = :path"),
            {"path": SHARED_DB_PATH},
        ).fetchone()
        if row:
            return row[0]

        password_encrypted = encrypt_password_safe("")
        result = db_conn.execute(
            text("""
                INSERT INTO connections (name, db_type, host, port, database_name,
                    username, password_encrypted, ssl_enabled, is_system, created_by)
                VALUES ('Uploaded Files', 'duckdb', '', 0, :database_name,
                    '', :password_encrypted, false, true, :created_by)
                RETURNING id
            """),
            {
                "database_name": SHARED_DB_PATH,
                "password_encrypted": password_encrypted,
                "created_by": user_id,
            },
        )
        connection_id = result.scalar()
        db_conn.commit()
        return connection_id


@router.post("/preview", response_model=CSVPreviewResponse, summary="Upload CSV/Parquet file for preview")
async def preview_csv(
    file: UploadFile = File(...),
    current_user: dict = require_role("editor", "admin"),
):
    """Upload a CSV or Parquet file and return a preview with the first 20 rows, column types, and total row count."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    ext = _get_file_ext(file.filename)
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Accepted: {', '.join(SUPPORTED_EXTENSIONS)}")

    # Read file with size check
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 200MB limit")

    # Save to temp + DuckDB processing in thread (blocking IO)
    temp_id = str(uuid.uuid4())
    temp_path = os.path.join(TEMP_DIR, f"{temp_id}{ext}")

    def _process():
        with open(temp_path, "wb") as f:
            f.write(contents)

        conn = duckdb.connect()
        read_fn = _duckdb_read_fn(temp_path)

        result = conn.execute(f"SELECT * FROM {read_fn} LIMIT 20")
        rows = [list(row) for row in result.fetchall()]

        type_result = conn.execute(f"DESCRIBE SELECT * FROM {read_fn}")
        type_rows = type_result.fetchall()
        columns = [{"name": row[0], "type": row[1]} for row in type_rows]

        count_result = conn.execute(f"SELECT COUNT(*) FROM {read_fn}")
        total_rows = count_result.fetchone()[0]
        conn.close()

        import numbers
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

        return columns, rows, total_rows

    try:
        columns, rows, total_rows = await asyncio.to_thread(_process)
        return CSVPreviewResponse(
            temp_id=temp_id,
            filename=file.filename,
            columns=columns,
            rows=rows,
            total_rows=total_rows,
        )
    except duckdb.Error as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")


@router.post("/import", response_model=CSVImportResponse, summary="Import previewed file as dataset")
def import_csv(
    req: CSVImportRequest,
    current_user: dict = require_role("editor", "admin"),
):
    """Import a previously previewed CSV/Parquet file as a table into the shared DuckDB and create a Dataset record."""
    user_id = int(current_user["sub"])

    # Find temp file (could be .csv or .parquet)
    temp_path = None
    for ext in SUPPORTED_EXTENSIONS:
        candidate = os.path.join(TEMP_DIR, f"{req.temp_id}{ext}")
        if os.path.exists(candidate):
            temp_path = candidate
            break

    if not temp_path:
        raise HTTPException(status_code=404, detail="Preview session expired or not found")

    table_name = _sanitize_table_name(req.table_name)
    if not table_name:
        raise HTTPException(status_code=400, detail="Invalid table name")

    # Insert table into the shared DuckDB
    try:
        conn = duckdb.connect(SHARED_DB_PATH)
        read_fn = _duckdb_read_fn(temp_path)
        # Drop existing table with same name to allow re-uploads
        conn.execute(f'DROP TABLE IF EXISTS "{table_name}"')
        conn.execute(
            f'CREATE TABLE "{table_name}" AS SELECT * FROM {read_fn}'
        )
        row_count = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
        conn.close()
    except duckdb.Error as e:
        raise HTTPException(status_code=400, detail=f"Failed to import file: {e}")
    finally:
        # Clean up temp file regardless of success/failure
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

    # Get or create the shared connection
    connection_id = _get_or_create_shared_connection(user_id)

    # Create Dataset record
    sql_query = f'SELECT * FROM "{table_name}"'
    with engine.connect() as db_conn:
        result = db_conn.execute(
            text("""
                INSERT INTO datasets (connection_id, name, description, sql_query, cache_ttl, created_by)
                VALUES (:connection_id, :name, :description, :sql_query, 0, :created_by)
                RETURNING id
            """),
            {
                "connection_id": connection_id,
                "name": req.dataset_name,
                "description": req.description,
                "sql_query": sql_query,
                "created_by": user_id,
            },
        )
        dataset_id = result.scalar()
        db_conn.commit()

    # Clean up temp file
    if os.path.exists(temp_path):
        os.remove(temp_path)

    return CSVImportResponse(
        dataset_id=dataset_id,
        connection_id=connection_id,
        dataset_name=req.dataset_name,
        table_name=table_name,
        row_count=row_count,
    )
