"""Parquet cache: stream data from external DBs → Parquet files on disk.

DuckDB reads Parquet directly without loading into Python memory.
Cache keyed by (connection_id, base_sql). RLS/filters applied at query time.
"""

import hashlib
import logging
import os
import time

import pyarrow as pa
import pyarrow.parquet as pq
from sqlalchemy import text

logger = logging.getLogger("karta.parquet_cache")

PARQUET_CACHE_DIR = "data/csv/parquet_cache"
PARQUET_CACHE_TTL = int(os.environ.get("PARQUET_CACHE_TTL", "3600"))
_BATCH_SIZE = 50_000

# In-memory index: connection_id → set of cache keys (for fast invalidation)
_conn_keys: dict[int, set[str]] = {}


def _index_register(connection_id: int, key: str) -> None:
    """Register a cache key under its connection for fast lookup."""
    _conn_keys.setdefault(connection_id, set()).add(key)


def _index_remove(connection_id: int, key: str) -> None:
    """Remove a cache key from the connection index."""
    if connection_id in _conn_keys:
        _conn_keys[connection_id].discard(key)
        if not _conn_keys[connection_id]:
            del _conn_keys[connection_id]


def cache_key(connection_id: int, base_sql: str) -> str:
    """Deterministic key from connection + SQL."""
    raw = f"{connection_id}:{base_sql}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def parquet_path(key: str) -> str:
    return os.path.join(PARQUET_CACHE_DIR, f"{key}.parquet")


def meta_path(key: str) -> str:
    return os.path.join(PARQUET_CACHE_DIR, f"{key}.meta.json")


def get_or_populate(
    connection_id: int,
    base_sql: str,
    db_type: str,
    engine,
    ttl: int | None = None,
    spec=None,
) -> str | None:
    """Return path to cached Parquet file, populating if needed.

    Returns None for DuckDB connections (direct access, no cache needed).
    """
    if (db_type or "").lower() == "duckdb":
        return None

    effective_ttl = ttl if ttl is not None else PARQUET_CACHE_TTL
    key = cache_key(connection_id, base_sql)
    path = parquet_path(key)

    # Check cache hit
    if os.path.exists(path):
        age = time.time() - os.path.getmtime(path)
        if age < effective_ttl:
            return path

    # Cache miss — stream from external DB
    os.makedirs(PARQUET_CACHE_DIR, exist_ok=True)
    _stream_to_parquet(engine, base_sql, path, db_type, connection_id, spec=spec)
    return path


def invalidate(connection_id: int, base_sql: str) -> None:
    """Remove a specific cached Parquet file."""
    key = cache_key(connection_id, base_sql)
    _remove_key(key)
    _index_remove(connection_id, key)


def invalidate_connection(connection_id: int) -> None:
    """Remove all cached Parquet files for a connection.
    Uses in-memory index for O(1) lookup; falls back to dir scan if index empty."""
    import api.json_util as json

    keys_to_remove = _conn_keys.pop(connection_id, None)

    if keys_to_remove:
        for key in keys_to_remove:
            _remove_key(key)
        logger.info(f"Invalidated {len(keys_to_remove)} Parquet files for connection {connection_id}")
        return

    # Fallback: scan directory (only on first run before index is populated)
    if not os.path.isdir(PARQUET_CACHE_DIR):
        return
    removed = 0
    for fname in os.listdir(PARQUET_CACHE_DIR):
        if not fname.endswith(".meta.json"):
            continue
        fpath = os.path.join(PARQUET_CACHE_DIR, fname)
        try:
            with open(fpath) as f:
                meta = json.loads(f.read())
            if meta.get("connection_id") == connection_id:
                key = fname.replace(".meta.json", "")
                _remove_key(key)
                removed += 1
        except Exception:
            continue
    if removed:
        logger.info(f"Invalidated {removed} Parquet files for connection {connection_id} (fallback scan)")


def cleanup_expired() -> None:
    """Delete Parquet files older than 2x TTL. Called by scheduler."""
    if not os.path.isdir(PARQUET_CACHE_DIR):
        return
    cutoff = time.time() - (PARQUET_CACHE_TTL * 2)
    removed = 0
    for fname in os.listdir(PARQUET_CACHE_DIR):
        if not fname.endswith(".parquet"):
            continue
        fpath = os.path.join(PARQUET_CACHE_DIR, fname)
        try:
            if os.path.getmtime(fpath) < cutoff:
                key = fname.replace(".parquet", "")
                _remove_key(key)
                removed += 1
        except Exception:
            continue
    if removed:
        logger.info(f"Cleaned up {removed} expired Parquet files")


def _remove_key(key: str) -> None:
    """Remove Parquet + metadata files for a key."""
    for path in (parquet_path(key), meta_path(key)):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass


def _stream_to_parquet(engine, sql: str, dest_path: str, db_type: str, connection_id: int, spec=None) -> None:
    """Stream query results to Parquet file in batches.

    Memory per batch: ~8 MB (50K rows × 20 cols × 8 bytes).
    Uses atomic write (tmp file → rename) to avoid partial reads.
    """
    import api.json_util as json

    tmp_path = dest_path + ".tmp"
    writer = None
    columns = None
    total_rows = 0

    try:
        with engine.connect() as conn:
            # Set query timeouts (5 min for full scan)
            if spec is not None:
                spec.set_timeout(conn, 300)
            else:
                db = (db_type or "").lower()
                if db in ("postgresql", "postgres"):
                    conn.execute(text("SET statement_timeout = 300000"))
                elif db == "clickhouse":
                    conn.execute(text("SET max_execution_time = 300"))
                elif db == "mssql":
                    conn.execute(text("SET LOCK_TIMEOUT 300000"))

            # Execute with server-side cursor for streaming (PostgreSQL)
            db = (db_type or "").lower()
            exec_opts = {}
            if db in ("postgresql", "postgres"):
                exec_opts["stream_results"] = True

            result = conn.execution_options(**exec_opts).execute(text(sql))
            columns = list(result.keys())

            while True:
                rows = result.fetchmany(_BATCH_SIZE)
                if not rows:
                    break

                # Build columnar dict for PyArrow
                batch_dict = {col: [] for col in columns}
                for row in rows:
                    for i, col in enumerate(columns):
                        batch_dict[col].append(row[i])

                table = pa.table(batch_dict)
                if writer is None:
                    writer = pq.ParquetWriter(tmp_path, table.schema)
                writer.write_table(table)
                total_rows += len(rows)

        if writer:
            writer.close()
            writer = None
            os.replace(tmp_path, dest_path)
        else:
            # Empty result — write empty Parquet
            if columns:
                table = pa.table({col: [] for col in columns})
                pq.write_table(table, tmp_path)
                os.replace(tmp_path, dest_path)
            else:
                return

        # Write metadata sidecar
        key = cache_key(connection_id, sql)
        meta = {
            "created_at": time.time(),
            "columns": columns,
            "connection_id": connection_id,
            "row_count": total_rows,
        }
        with open(meta_path(key), "w") as f:
            f.write(json.dumps(meta))

        # Register in connection index for fast invalidation
        _index_register(connection_id, key)

        logger.info(f"Cached {total_rows} rows to {dest_path}")

    except Exception:
        # Clean up tmp file on error
        if writer:
            try:
                writer.close()
            except Exception:
                pass
        try:
            os.remove(tmp_path)
        except FileNotFoundError:
            pass
        raise
