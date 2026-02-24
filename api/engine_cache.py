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
ENGINE_TTL = 300  # 5 minutes


def get_engine(connection_id: int, url: str, db_type: str):
    """Get or create a cached engine for an external connection."""
    now = time.time()
    with _lock:
        if connection_id in _cache:
            eng, created = _cache[connection_id]
            if now - created < ENGINE_TTL:
                return eng
            try:
                eng.dispose()
            except Exception:
                pass
            del _cache[connection_id]

        eng = create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=3)
        _cache[connection_id] = (eng, now)
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
