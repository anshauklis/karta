"""Connection engine cache — reuse SQLAlchemy engines across requests.

Engines are cached by connection_id with a configurable TTL.
DuckDB engines are NOT cached (they use NullPool and native fast paths).
"""

import threading
import time
import logging
from sqlalchemy import create_engine

log = logging.getLogger(__name__)

_cache: dict[int, tuple] = {}  # {conn_id: (engine, created_at)}
_lock = threading.Lock()

# Individual pooled connections are recycled after this many seconds (graceful,
# per-connection) instead of tearing down the whole pool on a wall-clock TTL.
POOL_RECYCLE = 1800  # 30 minutes


def get_engine(connection_id: int, url: str, db_type: str):
    """Get or create a cached engine for an external connection.

    The engine is kept until the connection is updated/deleted (invalidate) or the
    process restarts. Freshness of pooled connections is handled by pool_pre_ping
    (dead-connection detection) and pool_recycle (age-based recycle) — there is no
    wall-clock dispose, which previously caused a reconnect storm every 5 minutes
    under steady load.
    """
    with _lock:
        entry = _cache.get(connection_id)
        if entry is not None:
            return entry[0]

        eng = create_engine(
            url, pool_pre_ping=True, pool_size=5, max_overflow=3,
            pool_recycle=POOL_RECYCLE,
        )
        _cache[connection_id] = (eng, time.time())
        return eng


def invalidate(connection_id: int):
    """Remove a cached engine (call on connection update/delete)."""
    with _lock:
        entry = _cache.pop(connection_id, None)
    if entry:
        try:
            entry[0].dispose()
        except Exception:
            pass


def invalidate_all():
    """Dispose all cached engines."""
    with _lock:
        for eng, _ in _cache.values():
            try:
                eng.dispose()
            except Exception:
                pass
        _cache.clear()
