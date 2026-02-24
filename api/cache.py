"""Optional Redis query cache. Silently skips if Redis is unavailable."""

import os
import json
import hashlib
import logging

log = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
CACHE_TTL = int(os.environ.get("CACHE_TTL", "300"))  # 5 minutes default

_redis = None
_disabled = False


def _get_redis():
    global _redis, _disabled
    if _disabled:
        return None
    if _redis is None:
        try:
            import redis
            _redis = redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=2)
            _redis.ping()
        except Exception as e:
            log.warning("Redis unavailable, caching disabled: %s", e)
            _disabled = True
            _redis = None
    return _redis


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


def chart_exec_key(chart_id: int, filters: dict | None, config_hash: str) -> str:
    """Cache key for full chart execution result.
    Format: chart_exec:{chart_id}:{hash} — allows pattern-based invalidation."""
    raw = f"{json.dumps(filters or {}, sort_keys=True)}:{config_hash}"
    return f"chart_exec:{chart_id}:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"
