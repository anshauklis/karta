"""Fast JSON helpers backed by orjson.

Drop-in replacements for stdlib json.dumps / json.loads:
  - dumps() returns str (not bytes) for compatibility with PostgreSQL text columns and Redis.
  - loads() accepts both str and bytes.
"""

import orjson

OPT_SORT = orjson.OPT_SORT_KEYS


def dumps(obj, *, default=None, sort_keys: bool = False) -> str:
    opts = OPT_SORT if sort_keys else 0
    return orjson.dumps(obj, default=default, option=opts).decode()


def loads(s):
    return orjson.loads(s)
