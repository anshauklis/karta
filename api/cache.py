"""Optional Redis query cache. Silently skips if Redis is unavailable."""

import os
import time
import api.json_util as json
import hashlib
import logging

log = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
CACHE_TTL = int(os.environ.get("CACHE_TTL", "300"))  # 5 minutes default

_redis = None
_last_failure: float = 0
_RETRY_COOLDOWN = 30  # seconds before retrying after failure


def _get_redis():
    global _redis, _last_failure
    if _redis is not None:
        return _redis
    if time.time() - _last_failure < _RETRY_COOLDOWN:
        return None
    try:
        import redis
        _redis = redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=2)
        _redis.ping()
        return _redis
    except Exception as e:
        log.warning("Redis unavailable: %s", e)
        _last_failure = time.time()
        _redis = None
        return None


def cache_key(connection_id: int, sql: str, filters: dict | None = None) -> str:
    raw = f"{connection_id}:{sql}:{json.dumps(filters or {}, sort_keys=True)}"
    return f"qcache:{hashlib.sha256(raw.encode()).hexdigest()}"


def get_cached(key: str) -> dict | None:
    r = _get_redis()
    if r is None:
        return None
    try:
        data = r.get(key)
        return json.loads(data) if data else None
    except Exception:
        return None


def rls_cache_key(connection_id: int, user_id: int) -> str:
    return f"rls:{connection_id}:{user_id}"


def delete_cached(key: str):
    r = _get_redis()
    if r is None:
        return
    try:
        r.delete(key)
    except Exception:
        pass


def delete_pattern(pattern: str):
    """Delete all keys matching a glob pattern (e.g. 'rls:5:*')."""
    r = _get_redis()
    if r is None:
        return
    try:
        keys = r.keys(pattern)
        if keys:
            r.delete(*keys)
    except Exception:
        pass


def set_cached(key: str, data: dict, ttl: int = CACHE_TTL):
    r = _get_redis()
    if r is None:
        return
    try:
        r.setex(key, ttl, json.dumps(data, default=str))
    except Exception:
        pass


def chart_exec_key(chart_id: int, filters: dict | None, config_hash: str, user_id: int = 0) -> str:
    """Cache key for full chart execution result.
    Includes user_id to isolate RLS-filtered data between users.
    Format: chart_exec:{chart_id}:{hash} — allows pattern-based invalidation."""
    raw = f"{user_id}:{json.dumps(filters or {}, sort_keys=True)}:{config_hash}"
    return f"chart_exec:{chart_id}:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"
