# Connector Plugin System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all hardcoded if/elif database connector logic with a registry-based plugin system so new connectors can be added via pip packages without touching Karta core.

**Architecture:** Two-path model — Path A: raw SQLAlchemy URI (any DB, zero code), Path B: `BaseEngineSpec` subclasses (improved UX for popular DBs). Built-in specs for Postgres, MySQL, MSSQL, ClickHouse, DuckDB. External specs discovered at startup via Python `entry_points`. Inspired by Apache Superset's `db_engine_spec`.

**Tech Stack:** Python 3.13 (dataclasses, importlib.metadata), FastAPI, SQLAlchemy 2.x, Next.js 16 + shadcn/ui, TanStack Query 5.

**Design doc:** `docs/plans/2026-02-27-connector-plugins-design.md`

---

## Task 1: Create BaseEngineSpec + FieldDef

**Files:**
- Create: `api/engine_specs/__init__.py`
- Create: `api/engine_specs/base.py`

**Context:** This is the foundation module. The registry pattern should mirror `api/renderers/__init__.py` (which uses `_REGISTRY: dict[str, BaseRenderer]` with `register()` / `get_renderer()`). `FieldDef` is a dataclass for connection form fields. `BaseEngineSpec` provides default implementations that individual specs override.

**Step 1: Create `api/engine_specs/base.py`**

```python
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool


@dataclass
class FieldDef:
    """Definition of a single connection form field."""
    name: str
    label: str
    type: str = "text"  # "text", "password", "number", "boolean"
    required: bool = True
    default: Any = None
    placeholder: str = ""


# Standard form fields reused by most specs
DEFAULT_FIELDS: list[FieldDef] = [
    FieldDef("host", "Host", required=True, default="localhost"),
    FieldDef("port", "Port", type="number", required=True, default=5432),
    FieldDef("username", "Username", required=True),
    FieldDef("password", "Password", type="password", required=True),
    FieldDef("database_name", "Database", required=True),
    FieldDef("ssl_enabled", "SSL Enabled", type="boolean", required=False, default=False),
]


class BaseEngineSpec:
    """Base class for database engine specifications.

    Subclass this to add support for a new database type.
    Override only the methods that differ from the defaults.
    """

    db_type: str = ""
    display_name: str = ""
    icon: str = "database"
    sqlalchemy_uri_placeholder: str = "dialect+driver://user:pass@host:port/dbname"

    connection_fields: list[FieldDef] = DEFAULT_FIELDS
    encrypted_fields: list[str] = ["password"]

    def build_url(self, params: dict) -> str:
        """Build SQLAlchemy URI from form field values.

        Override in subclass if the URL format differs from standard
        ``driver://user:pass@host:port/db`` pattern.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement build_url()"
        )

    def create_engine(self, url: str, connection_id: int | None = None) -> Engine:
        """Create a SQLAlchemy engine. Uses engine cache for persistent connections."""
        if connection_id is not None:
            from api.engine_cache import get_engine
            return get_engine(connection_id, url, self.db_type)
        return create_engine(url, pool_pre_ping=True)

    def set_timeout(self, conn, timeout_sec: int) -> None:
        """Execute a SET statement to limit query execution time. Default: no-op."""
        pass

    def get_schemas(self, engine: Engine) -> list[str]:
        """List available schemas/databases. Default: SQLAlchemy inspector."""
        insp = inspect(engine)
        return sorted(insp.get_schema_names())

    def get_schema(self, engine: Engine, schema: str | None = None) -> list[dict]:
        """Get tables and columns. Default: SQLAlchemy inspector.

        Returns list of dicts: [{"table_name": str, "columns": [{"name", "type", "nullable"}]}]
        """
        inspector = inspect(engine)
        tables = []
        for table_name in inspector.get_table_names(schema=schema):
            columns = []
            for col in inspector.get_columns(table_name, schema=schema):
                columns.append({
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                })
            tables.append({"table_name": table_name, "columns": columns})
        return tables

    def test_connection(self, engine: Engine) -> bool:
        """Test connectivity. Default: SELECT 1."""
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True

    def time_range_expression(self, column: str, days: int) -> str | None:
        """Return a SQL expression for ``MAX(col) - N days``.

        Used by ``_build_time_range_sql`` in charts/router.py.
        Return None if the dialect doesn't support it (fallback to pandas filter).
        """
        return None

    def execute_query(self, connection: dict, sql: str, timeout_sec: int = 30):
        """Execute SQL and return a pandas DataFrame.

        Default implementation builds URL → creates engine → sets timeout → runs query.
        DuckDB overrides entirely (native API). Override for special connection logic.
        """
        import pandas as pd

        url = self.build_url(connection)
        engine = self.create_engine(url, connection.get("id"))
        with engine.connect() as conn:
            self.set_timeout(conn, timeout_sec)
            return pd.read_sql(text(sql), conn)
```

**Step 2: Create `api/engine_specs/__init__.py`**

```python
"""Engine spec registry.

Mirrors the pattern in api/renderers/__init__.py.
"""
from __future__ import annotations

from api.engine_specs.base import BaseEngineSpec, FieldDef, DEFAULT_FIELDS

_REGISTRY: dict[str, BaseEngineSpec] = {}


def register(spec: BaseEngineSpec) -> None:
    """Register a spec instance by its db_type."""
    _REGISTRY[spec.db_type] = spec


def get_spec(db_type: str) -> BaseEngineSpec | None:
    """Look up spec by db_type. Returns None if not found."""
    return _REGISTRY.get(db_type)


def get_all_specs() -> dict[str, BaseEngineSpec]:
    """Return all registered specs (copy)."""
    return dict(_REGISTRY)


__all__ = [
    "BaseEngineSpec", "FieldDef", "DEFAULT_FIELDS",
    "register", "get_spec", "get_all_specs",
]
```

**Step 3: Verify module imports**

Run: `cd /Users/ansha/projects/opencharts && python -c "from api.engine_specs import BaseEngineSpec, FieldDef, register, get_spec, get_all_specs; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add api/engine_specs/__init__.py api/engine_specs/base.py
git commit -m "feat: add BaseEngineSpec and engine specs registry"
```

---

## Task 2: Create PostgreSQL Engine Spec

**Files:**
- Create: `api/engine_specs/postgres.py`

**Context:** PostgreSQL is the most-used spec. It overrides:
- `build_url()` — `postgresql://user:pass@host:port/db?sslmode=require`
- `set_timeout()` — `SET statement_timeout = {ms}`
- `get_schemas()` — filters out `pg_catalog`, `pg_toast`, `information_schema`
- `get_schema()` — uses `information_schema.columns` (faster than SQLAlchemy inspector)
- `time_range_expression()` — `INTERVAL '{days} days'`

Current logic lives in `api/connections/router.py`:
- `_build_url()` lines 59-60 (`driver = "postgresql"`, ssl → `?sslmode=require`)
- `get_schemas()` lines 367-377 (information_schema query)
- `get_schema()` lines 405-420 (information_schema.columns query)
- `is_postgres()` line 91-92
- Timeout: `SET statement_timeout = 30000` in charts/router.py:1102-1103, sql_lab/router.py:113-114, filters/router.py:385-386

**Step 1: Create `api/engine_specs/postgres.py`**

```python
from sqlalchemy import text

from api.engine_specs.base import BaseEngineSpec, FieldDef


class PostgresSpec(BaseEngineSpec):
    db_type = "postgres"
    display_name = "PostgreSQL"
    icon = "postgres"
    sqlalchemy_uri_placeholder = "postgresql://user:pass@host:5432/dbname"

    connection_fields = [
        FieldDef("host", "Host", required=True, default="localhost"),
        FieldDef("port", "Port", type="number", required=True, default=5432),
        FieldDef("username", "Username", required=True),
        FieldDef("password", "Password", type="password", required=True),
        FieldDef("database_name", "Database", required=True),
        FieldDef("ssl_enabled", "SSL Enabled", type="boolean", required=False, default=False),
    ]

    def build_url(self, params: dict) -> str:
        url = (
            f"postgresql://{params['username']}:{params['password']}"
            f"@{params['host']}:{params['port']}/{params['database_name']}"
        )
        if params.get("ssl_enabled"):
            url += "?sslmode=require"
        return url

    def set_timeout(self, conn, timeout_sec: int) -> None:
        conn.execute(text(f"SET statement_timeout = {timeout_sec * 1000}"))

    def get_schemas(self, engine) -> list[str]:
        with engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') "
                "AND schema_name NOT LIKE 'pg_temp%' "
                "AND schema_name NOT LIKE 'pg_toast_temp%' "
                "ORDER BY schema_name"
            )).fetchall()
            return [r[0] for r in rows]

    def get_schema(self, engine, schema: str | None = None) -> list[dict]:
        schema_filter = schema or "public"
        with engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT table_name, column_name, data_type, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema = :schema "
                "ORDER BY table_name, ordinal_position"
            ), {"schema": schema_filter}).fetchall()

        tables_map: dict[str, list[dict]] = {}
        for tname, cname, ctype, nullable in rows:
            tables_map.setdefault(tname, []).append({
                "name": cname, "type": ctype, "nullable": nullable == "YES"
            })
        return [{"table_name": t, "columns": cols} for t, cols in tables_map.items()]

    def time_range_expression(self, column: str, days: int) -> str:
        return f"MAX({column}) - INTERVAL '{days} days'"
```

**Step 2: Verify import**

Run: `cd /Users/ansha/projects/opencharts && python -c "from api.engine_specs.postgres import PostgresSpec; s = PostgresSpec(); print(s.db_type, s.display_name)"`
Expected: `postgres PostgreSQL`

**Step 3: Commit**

```bash
git add api/engine_specs/postgres.py
git commit -m "feat: add PostgreSQL engine spec"
```

---

## Task 3: Create MySQL Engine Spec

**Files:**
- Create: `api/engine_specs/mysql.py`

**Context:** MySQL overrides:
- `build_url()` — `mysql+pymysql://user:pass@host:port/db`
- `set_timeout()` — `SET max_execution_time = {ms}`
- `get_schemas()` — `SHOW DATABASES` filtering system DBs
- `time_range_expression()` — `DATE_SUB(MAX(col), INTERVAL N DAY)`

Current logic: `_build_url()` line 62 (`driver = "mysql+pymysql"`), `get_schemas()` lines 379-381.

**Step 1: Create `api/engine_specs/mysql.py`**

```python
from sqlalchemy import text

from api.engine_specs.base import BaseEngineSpec, FieldDef


class MySQLSpec(BaseEngineSpec):
    db_type = "mysql"
    display_name = "MySQL"
    icon = "mysql"
    sqlalchemy_uri_placeholder = "mysql+pymysql://user:pass@host:3306/dbname"

    connection_fields = [
        FieldDef("host", "Host", required=True, default="localhost"),
        FieldDef("port", "Port", type="number", required=True, default=3306),
        FieldDef("username", "Username", required=True),
        FieldDef("password", "Password", type="password", required=True),
        FieldDef("database_name", "Database", required=True),
        FieldDef("ssl_enabled", "SSL Enabled", type="boolean", required=False, default=False),
    ]

    def build_url(self, params: dict) -> str:
        return (
            f"mysql+pymysql://{params['username']}:{params['password']}"
            f"@{params['host']}:{params['port']}/{params['database_name']}"
        )

    def set_timeout(self, conn, timeout_sec: int) -> None:
        conn.execute(text(f"SET max_execution_time = {timeout_sec * 1000}"))

    def get_schemas(self, engine) -> list[str]:
        with engine.connect() as conn:
            rows = conn.execute(text("SHOW DATABASES")).fetchall()
            return [r[0] for r in rows
                    if r[0] not in ("information_schema", "performance_schema", "mysql", "sys")]

    def time_range_expression(self, column: str, days: int) -> str:
        return f"DATE_SUB(MAX({column}), INTERVAL {days} DAY)"
```

**Step 2: Verify import**

Run: `cd /Users/ansha/projects/opencharts && python -c "from api.engine_specs.mysql import MySQLSpec; s = MySQLSpec(); print(s.db_type, s.display_name)"`
Expected: `mysql MySQL`

**Step 3: Commit**

```bash
git add api/engine_specs/mysql.py
git commit -m "feat: add MySQL engine spec"
```

---

## Task 4: Create ClickHouse Engine Spec

**Files:**
- Create: `api/engine_specs/clickhouse.py`

**Context:** ClickHouse overrides:
- `build_url()` — `clickhouse+http://user:pass@host:port/db`, SSL → `?protocol=https`
- `set_timeout()` — `SET max_execution_time = {sec}`
- `get_schemas()` — `SELECT name FROM system.databases`
- `time_range_expression()` — `subtractDays(MAX(col), N)`

Current logic: `_build_url()` line 64 (`driver = "clickhouse+http"`), ssl line 77, `get_schemas()` lines 383-385.

**Step 1: Create `api/engine_specs/clickhouse.py`**

```python
from sqlalchemy import text

from api.engine_specs.base import BaseEngineSpec, FieldDef


class ClickHouseSpec(BaseEngineSpec):
    db_type = "clickhouse"
    display_name = "ClickHouse"
    icon = "clickhouse"
    sqlalchemy_uri_placeholder = "clickhouse+http://user:pass@host:8123/dbname"

    connection_fields = [
        FieldDef("host", "Host", required=True, default="localhost"),
        FieldDef("port", "Port", type="number", required=True, default=8123),
        FieldDef("username", "Username", required=True, default="default"),
        FieldDef("password", "Password", type="password", required=True),
        FieldDef("database_name", "Database", required=True, default="default"),
        FieldDef("ssl_enabled", "SSL Enabled", type="boolean", required=False, default=False),
    ]

    def build_url(self, params: dict) -> str:
        url = (
            f"clickhouse+http://{params['username']}:{params['password']}"
            f"@{params['host']}:{params['port']}/{params['database_name']}"
        )
        if params.get("ssl_enabled"):
            url += "?protocol=https"
        return url

    def set_timeout(self, conn, timeout_sec: int) -> None:
        conn.execute(text(f"SET max_execution_time = {timeout_sec}"))

    def get_schemas(self, engine) -> list[str]:
        with engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT name FROM system.databases ORDER BY name"
            )).fetchall()
            return [r[0] for r in rows
                    if r[0] not in ("system", "information_schema", "INFORMATION_SCHEMA")]

    def time_range_expression(self, column: str, days: int) -> str:
        return f"subtractDays(MAX({column}), {days})"
```

**Step 2: Verify import**

Run: `cd /Users/ansha/projects/opencharts && python -c "from api.engine_specs.clickhouse import ClickHouseSpec; s = ClickHouseSpec(); print(s.db_type, s.display_name)"`
Expected: `clickhouse ClickHouse`

**Step 3: Commit**

```bash
git add api/engine_specs/clickhouse.py
git commit -m "feat: add ClickHouse engine spec"
```

---

## Task 5: Create MSSQL Engine Spec

**Files:**
- Create: `api/engine_specs/mssql.py`

**Context:** MSSQL overrides:
- `build_url()` — `mssql+pymssql://user:pass@host:port/db`
- `set_timeout()` — `SET LOCK_TIMEOUT {ms}` (MSSQL doesn't have statement_timeout)
- `time_range_expression()` — `DATEADD(day, -N, MAX(col))`
- Default `get_schemas()` / `get_schema()` via SQLAlchemy inspector (current behavior)

Current logic: `_build_url()` line 66 (`driver = "mssql+pymssql"`), timeout in sql_lab/router.py:117.

**Step 1: Create `api/engine_specs/mssql.py`**

```python
from sqlalchemy import text

from api.engine_specs.base import BaseEngineSpec, FieldDef


class MSSQLSpec(BaseEngineSpec):
    db_type = "mssql"
    display_name = "MS SQL Server"
    icon = "mssql"
    sqlalchemy_uri_placeholder = "mssql+pymssql://user:pass@host:1433/dbname"

    connection_fields = [
        FieldDef("host", "Host", required=True, default="localhost"),
        FieldDef("port", "Port", type="number", required=True, default=1433),
        FieldDef("username", "Username", required=True),
        FieldDef("password", "Password", type="password", required=True),
        FieldDef("database_name", "Database", required=True),
        FieldDef("ssl_enabled", "SSL Enabled", type="boolean", required=False, default=False),
    ]

    def build_url(self, params: dict) -> str:
        return (
            f"mssql+pymssql://{params['username']}:{params['password']}"
            f"@{params['host']}:{params['port']}/{params['database_name']}"
        )

    def set_timeout(self, conn, timeout_sec: int) -> None:
        conn.execute(text(f"SET LOCK_TIMEOUT {timeout_sec * 1000}"))

    def time_range_expression(self, column: str, days: int) -> str:
        return f"DATEADD(day, -{days}, MAX({column}))"
```

**Step 2: Verify import**

Run: `cd /Users/ansha/projects/opencharts && python -c "from api.engine_specs.mssql import MSSQLSpec; s = MSSQLSpec(); print(s.db_type, s.display_name)"`
Expected: `mssql MS SQL Server`

**Step 3: Commit**

```bash
git add api/engine_specs/mssql.py
git commit -m "feat: add MSSQL engine spec"
```

---

## Task 6: Create DuckDB Engine Spec

**Files:**
- Create: `api/engine_specs/duckdb.py`

**Context:** DuckDB is the most different spec. It uses native `duckdb.connect()` instead of SQLAlchemy for most operations. It overrides almost everything:
- `build_url()` — `duckdb:///{path}?access_mode=read_only`
- `create_engine()` — `NullPool` (no connection pooling)
- `set_timeout()` — no-op (DuckDB doesn't support statement_timeout)
- `test_connection()` — native `duckdb.connect()` + `SELECT 1`
- `get_schemas()` — native API `information_schema.tables`
- `get_schema()` — native API `information_schema.columns`
- `time_range_expression()` — same as Postgres (`INTERVAL '{days} days'`)
- `execute_query()` — native `duckdb.connect(db, read_only=True)`

Current logic spread across: `connections/router.py` (`_build_url` line 69, `_create_ext_engine` line 83, `test_connection` lines 292-298, `get_schemas` lines 356-364, `_get_duckdb_schema` lines 317-343), plus DuckDB branches in charts/router.py, filters/router.py, sql_lab/router.py, datasets/router.py, ai/tools.py.

**Step 1: Create `api/engine_specs/duckdb.py`**

```python
import duckdb as _duckdb
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.pool import NullPool

from api.engine_specs.base import BaseEngineSpec, FieldDef


class DuckDBSpec(BaseEngineSpec):
    db_type = "duckdb"
    display_name = "DuckDB"
    icon = "duckdb"
    sqlalchemy_uri_placeholder = "duckdb:///path/to/database.duckdb"

    connection_fields = [
        FieldDef("database_name", "File Path", required=True, placeholder="/data/my.duckdb"),
    ]
    encrypted_fields = []  # no password

    def build_url(self, params: dict) -> str:
        return f"duckdb:///{params['database_name']}?access_mode=read_only"

    def create_engine(self, url: str, connection_id: int | None = None) -> Engine:
        return create_engine(url, poolclass=NullPool)

    def test_connection(self, engine: Engine) -> bool:
        """Use native DuckDB API to test connection."""
        # Extract path from engine URL
        db_path = str(engine.url).replace("duckdb:///", "").split("?")[0]
        con = _duckdb.connect(db_path, read_only=True)
        try:
            con.execute("SELECT 1")
        finally:
            con.close()
        return True

    def get_schemas(self, engine: Engine) -> list[str]:
        db_path = str(engine.url).replace("duckdb:///", "").split("?")[0]
        con = _duckdb.connect(db_path, read_only=True)
        try:
            rows = con.execute(
                "SELECT DISTINCT table_schema FROM information_schema.tables "
                "ORDER BY table_schema"
            ).fetchall()
            return [r[0] for r in rows]
        finally:
            con.close()

    def get_schema(self, engine: Engine, schema: str | None = None) -> list[dict]:
        db_path = str(engine.url).replace("duckdb:///", "").split("?")[0]
        schema_filter = schema or "main"
        con = _duckdb.connect(db_path, read_only=True)
        try:
            table_rows = con.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
                [schema_filter],
            ).fetchall()
            tables = []
            for (tname,) in table_rows:
                col_rows = con.execute(
                    "SELECT column_name, data_type, is_nullable "
                    "FROM information_schema.columns "
                    "WHERE table_schema = ? AND table_name = ? "
                    "ORDER BY ordinal_position",
                    [schema_filter, tname],
                ).fetchall()
                columns = [
                    {"name": cname, "type": ctype, "nullable": nullable == "YES"}
                    for cname, ctype, nullable in col_rows
                ]
                tables.append({"table_name": tname, "columns": columns})
            return tables
        finally:
            con.close()

    def time_range_expression(self, column: str, days: int) -> str:
        return f"MAX({column}) - INTERVAL '{days} days'"

    def execute_native(self, db_path: str, sql: str):
        """Execute SQL via native DuckDB API and return a pandas DataFrame."""
        con = _duckdb.connect(db_path, read_only=True)
        try:
            return con.execute(sql).fetchdf()
        finally:
            con.close()
```

**Step 2: Verify import**

Run: `cd /Users/ansha/projects/opencharts && python -c "from api.engine_specs.duckdb import DuckDBSpec; s = DuckDBSpec(); print(s.db_type, s.display_name)"`
Expected: `duckdb DuckDB`

**Step 3: Commit**

```bash
git add api/engine_specs/duckdb.py
git commit -m "feat: add DuckDB engine spec"
```

---

## Task 7: Create SQLAlchemy URI Spec + Register All Specs

**Files:**
- Create: `api/engine_specs/sqlalchemy_uri.py`
- Modify: `api/engine_specs/__init__.py`
- Modify: `api/main.py`

**Context:** The "Other (SQLAlchemy URI)" pseudo-spec lets users connect any DB by providing a raw URI. It has a single field (`sqlalchemy_uri`). Registration happens in `__init__.py` for built-in specs and in `main.py` lifespan for entry_points discovery. The `_sqlalchemy` type is always last in the UI.

**Step 1: Create `api/engine_specs/sqlalchemy_uri.py`**

```python
from api.engine_specs.base import BaseEngineSpec, FieldDef


class SQLAlchemyURISpec(BaseEngineSpec):
    """Pseudo-spec for raw SQLAlchemy URI connections.

    Users can connect any database that has a SQLAlchemy dialect installed
    by providing a full connection URI.
    """

    db_type = "_sqlalchemy"
    display_name = "Other (SQLAlchemy URI)"
    icon = "database"
    sqlalchemy_uri_placeholder = "dialect+driver://user:pass@host:port/dbname"

    connection_fields = [
        FieldDef(
            "sqlalchemy_uri", "SQLAlchemy URI", required=True,
            placeholder="dialect+driver://user:pass@host:port/dbname",
        ),
    ]
    encrypted_fields = ["sqlalchemy_uri"]  # URI contains credentials

    def build_url(self, params: dict) -> str:
        return params["sqlalchemy_uri"]
```

**Step 2: Update `api/engine_specs/__init__.py` — add built-in registration**

Replace the entire file with:

```python
"""Engine spec registry.

Mirrors the pattern in api/renderers/__init__.py.
"""
from __future__ import annotations

from api.engine_specs.base import BaseEngineSpec, FieldDef, DEFAULT_FIELDS

_REGISTRY: dict[str, BaseEngineSpec] = {}


def register(spec: BaseEngineSpec) -> None:
    """Register a spec instance by its db_type."""
    _REGISTRY[spec.db_type] = spec


def get_spec(db_type: str) -> BaseEngineSpec | None:
    """Look up spec by db_type. Returns None if not found."""
    # Handle "postgresql" alias for "postgres"
    if db_type == "postgresql":
        db_type = "postgres"
    return _REGISTRY.get(db_type)


def get_all_specs() -> dict[str, BaseEngineSpec]:
    """Return all registered specs (copy)."""
    return dict(_REGISTRY)


def discover_and_register() -> None:
    """Register built-in specs and discover external specs via entry_points."""
    # Built-in specs
    from api.engine_specs.postgres import PostgresSpec
    from api.engine_specs.mysql import MySQLSpec
    from api.engine_specs.clickhouse import ClickHouseSpec
    from api.engine_specs.mssql import MSSQLSpec
    from api.engine_specs.duckdb import DuckDBSpec
    from api.engine_specs.sqlalchemy_uri import SQLAlchemyURISpec

    for spec_cls in [PostgresSpec, MySQLSpec, ClickHouseSpec, MSSQLSpec, DuckDBSpec, SQLAlchemyURISpec]:
        register(spec_cls())

    # External specs via entry_points
    import logging
    from importlib.metadata import entry_points

    log = logging.getLogger("karta.engine_specs")
    for ep in entry_points(group="karta.engine_specs"):
        try:
            spec_cls = ep.load()
            spec = spec_cls()
            register(spec)
            log.info("Registered external engine spec: %s (%s)", spec.db_type, ep.value)
        except Exception:
            log.exception("Failed to load engine spec entry_point: %s", ep.name)


__all__ = [
    "BaseEngineSpec", "FieldDef", "DEFAULT_FIELDS",
    "register", "get_spec", "get_all_specs", "discover_and_register",
]
```

**Step 3: Call `discover_and_register()` in `api/main.py` lifespan**

In `api/main.py`, inside the `lifespan()` function, add after `ensure_system_connections()` (line 35):

```python
    from api.engine_specs import discover_and_register
    discover_and_register()
```

The lifespan function should become:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ... existing secret checks ...
    ensure_schema()
    ensure_migrations()
    ensure_system_connections()
    from api.engine_specs import discover_and_register
    discover_and_register()
    start_scheduler()
    yield
    shutdown_scheduler()
```

**Step 4: Verify full registration**

Run: `cd /Users/ansha/projects/opencharts && python -c "from api.engine_specs import discover_and_register, get_all_specs; discover_and_register(); specs = get_all_specs(); print(list(specs.keys()))"`
Expected: `['postgres', 'mysql', 'clickhouse', 'mssql', 'duckdb', '_sqlalchemy']`

**Step 5: Commit**

```bash
git add api/engine_specs/sqlalchemy_uri.py api/engine_specs/__init__.py api/main.py
git commit -m "feat: register all built-in engine specs and add entry_points discovery"
```

---

## Task 8: Add DB Schema Columns + Helper Functions

**Files:**
- Modify: `api/database.py` — add `sqlalchemy_uri` and `extra_params` columns
- Modify: `api/connections/router.py` — add `get_engine_for_connection()` helper

**Context:** Two new columns on `connections` table: `sqlalchemy_uri TEXT` (for raw URI connections) and `extra_params JSONB DEFAULT '{}'` (for plugin-specific fields like region, warehouse). Also add a central `get_engine_for_connection()` function that all files will use instead of calling `_build_url` + `_create_ext_engine` directly.

**Step 1: Add columns in `api/database.py`**

Add after the existing `ALTER TABLE connections ADD COLUMN IF NOT EXISTS is_system` line:

```sql
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sqlalchemy_uri TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS extra_params JSONB DEFAULT '{}';
```

**Step 2: Update `_CONN_COLS` in `api/connections/router.py`**

The `_CONN_COLS` constant lists columns selected in queries. Add `sqlalchemy_uri` and `extra_params` to it.

**Step 3: Add `get_engine_for_connection()` function in `api/connections/router.py`**

Add after the `is_mssql()` function (line ~100):

```python
def get_engine_for_connection(c: dict) -> tuple:
    """Central engine resolver. Returns (engine_or_native, spec).

    For DuckDB, returns (None, DuckDBSpec) — callers use spec.execute_native().
    For all others, returns (SQLAlchemy Engine, spec).
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
```

**Step 4: Update `_get_connection_with_password()` to include new columns**

The SELECT in `_get_connection_with_password()` should also retrieve `sqlalchemy_uri` and `extra_params`. Update the `_CONN_COLS` or the raw SQL string to include these columns.

**Step 5: Commit**

```bash
git add api/database.py api/connections/router.py
git commit -m "feat: add sqlalchemy_uri/extra_params columns and get_engine_for_connection()"
```

---

## Task 9: Refactor connections/router.py — Replace _build_url, _create_ext_engine, is_*

**Files:**
- Modify: `api/connections/router.py`

**Context:** This is the core refactor of the most impacted file. Replace:
- `_build_url()` (lines 56-78) → delete, replaced by `spec.build_url()`
- `_create_ext_engine()` (lines 81-88) → delete, replaced by `spec.create_engine()`
- `is_postgres()` (lines 91-92) → delete
- `is_clickhouse()` (lines 95-96) → delete
- `is_mssql()` (lines 99-100) → delete
- `test_connection()` (lines 286-314) → use `get_engine_for_connection()` + `spec.test_connection()`
- `get_schemas()` (lines 346-387) → use `get_engine_for_connection()` + `spec.get_schemas()`
- `get_schema()` (lines 390-432) → use `get_engine_for_connection()` + `spec.get_schema()`
- `_get_duckdb_schema()` (lines 317-343) → delete (logic now in DuckDBSpec)

**Important:** Keep `get_engine_for_connection()`, `_get_connection_with_password()`, `_get_connections_with_password()`, and all CRUD endpoints unchanged.

**Step 1: Refactor `test_connection()`**

Replace the function body to use spec:

```python
@router.post("/{conn_id}/test", summary="Test connection", response_model=ConnectionTestResult)
def test_connection(conn_id: int, current_user: dict = Depends(get_current_user)):
    """Test a database connection by executing a simple query."""
    try:
        c = _get_connection_with_password(conn_id)
        engine, spec = get_engine_for_connection(c)
        spec.test_connection(engine)
        if hasattr(engine, 'dispose'):
            engine.dispose()
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
```

**Step 2: Refactor `get_schemas()`**

```python
@router.get("/{conn_id}/schemas", summary="List schemas", response_model=list[str])
def get_schemas(conn_id: int, current_user: dict = Depends(get_current_user)):
    """List available database schemas for a connection."""
    c = _get_connection_with_password(conn_id)
    engine, spec = get_engine_for_connection(c)
    return spec.get_schemas(engine)
```

**Step 3: Refactor `get_schema()`**

```python
@router.get("/{conn_id}/schema", summary="Get schema", response_model=list[SchemaTable])
def get_schema(conn_id: int, schema: str | None = None, current_user: dict = Depends(get_current_user)):
    """Get all tables and their columns with data types."""
    c = _get_connection_with_password(conn_id)
    engine, spec = get_engine_for_connection(c)
    raw = spec.get_schema(engine, schema)
    return [
        SchemaTable(
            table_name=t["table_name"],
            columns=[SchemaColumn(name=col["name"], type=col["type"], nullable=col["nullable"]) for col in t["columns"]]
        )
        for t in raw
    ]
```

**Step 4: Delete old functions**

Delete `_build_url`, `_create_ext_engine`, `is_postgres`, `is_clickhouse`, `is_mssql`, `_get_duckdb_schema`.

**Step 5: Keep backward-compatible exports**

Other files import `_build_url`, `_create_ext_engine`, `is_postgres`, `is_clickhouse`, `is_mssql` from this module. After Task 10-13 refactor those imports, these can be fully removed. For now, keep thin wrappers or handle both in one task. **Recommendation:** Do Tasks 10-13 first (refactor consumers), then come back and delete. OR do it all in one go since we're replacing all call sites anyway.

**Step 6: Commit**

```bash
git add api/connections/router.py
git commit -m "refactor: use engine specs in connections/router.py endpoints"
```

---

## Task 10: Refactor charts/router.py — Eliminate db_type Branches

**Files:**
- Modify: `api/charts/router.py`

**Context:** charts/router.py has ~10 db_type branch points. Key locations:
- **Line 469-480**: DuckDB vs other — chart preview query execution
- **Line 968**: Import of `_build_url, _create_ext_engine, is_postgres, is_clickhouse, is_mssql`
- **Lines 1074-1106**: `_execute_chart_full()` — DuckDB branch, timeout if/elif chain
- **Lines 1253-1288**: `_build_time_range_sql()` — db_type switch for date expressions
- **Lines 1755-1866**: `_execute_chart_full()` continued — DuckDB parquet pipeline

Changes:
1. Replace import line 968: import `get_engine_for_connection` and `get_spec` instead
2. Replace DuckDB special case at lines 469-480 with `spec.execute_native()` or `get_engine_for_connection()`
3. Replace timeout chain at lines 1102-1106 with `spec.set_timeout(conn, timeout_sec)`
4. Replace `_build_time_range_sql()` to use `spec.time_range_expression()`
5. In `_execute_chart_full()` — replace DuckDB branches with spec-based dispatch

**Step 1: Update imports**

Replace:
```python
from api.connections.router import _get_connection_with_password, _build_url, _create_ext_engine, is_postgres, is_clickhouse, is_mssql
```
With:
```python
from api.connections.router import _get_connection_with_password, get_engine_for_connection
from api.engine_specs import get_spec
```

**Step 2: Replace timeout chain**

Replace:
```python
if is_postgres(c["db_type"]):
    conn.execute(text("SET statement_timeout = 30000"))
elif is_clickhouse(c["db_type"]):
    conn.execute(text("SET max_execution_time = 10"))
elif is_mssql(c["db_type"]):
    conn.execute(text("SET LOCK_TIMEOUT 30000"))
```
With:
```python
spec = get_spec(c["db_type"])
if spec:
    spec.set_timeout(conn, 30)
```

**Step 3: Refactor `_build_time_range_sql()`**

Replace the db_type switch with:
```python
def _build_time_range_sql(base_sql: str, config: dict, db_type: str) -> str | None:
    time_col = config.get("time_column")
    time_range = config.get("time_range", "all")
    if not time_col or time_range == "all":
        return None
    days = _TIME_RANGE_DAYS.get(time_range)
    if days is None:
        return None
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_ ]*$', time_col):
        return None

    col = f'"{time_col}"'
    spec = get_spec(db_type)
    if spec:
        date_expr = spec.time_range_expression(col, days)
    else:
        return None
    if date_expr is None:
        return None
    return f"SELECT * FROM ({base_sql}) _tr WHERE {col} >= (SELECT {date_expr} FROM ({base_sql}) _tr_max)"
```

**Step 4: Refactor DuckDB branches in execute/preview**

Replace:
```python
if c["db_type"] == "duckdb":
    import duckdb
    duck = duckdb.connect(c["database_name"], read_only=True)
    ...
else:
    url = _build_url(...)
    ext_engine = _create_ext_engine(...)
```
With:
```python
engine, spec = get_engine_for_connection(c)
if c["db_type"] == "duckdb":
    # DuckDB: use native API via spec
    from api.engine_specs.duckdb import DuckDBSpec
    assert isinstance(spec, DuckDBSpec)
    df = spec.execute_native(c["database_name"], sql)
else:
    with engine.connect() as conn:
        spec.set_timeout(conn, timeout_sec)
        df = pd.read_sql(text(sql), conn)
```

**Note:** The DuckDB branches in the parquet cache pipeline (`_execute_chart_full()` lines 1846-1866) are more complex. These handle the parquet caching + CTE chain. Keep the DuckDB check there but use `spec` for engine creation.

**Step 5: Commit**

```bash
git add api/charts/router.py
git commit -m "refactor: use engine specs in charts/router.py"
```

---

## Task 11: Refactor filters/router.py — Eliminate db_type Branches

**Files:**
- Modify: `api/filters/router.py`

**Context:** filters/router.py has 8 db_type branch points. Three main patterns:
1. Lines 158-169: DuckDB vs other in `get_charts_columns()` — column type discovery
2. Lines 223-238: DuckDB vs other in `get_dashboard_columns_typed()` — column type discovery
3. Lines 362-387: DuckDB vs other in filter value queries + timeout chain

All follow same pattern: DuckDB native → else build URL → create engine → optional timeout.

**Step 1: Update imports**

Replace:
```python
from api.connections.router import _get_connection_with_password, _get_connections_with_password, _build_url, _create_ext_engine, is_postgres, is_clickhouse
```
With:
```python
from api.connections.router import _get_connection_with_password, _get_connections_with_password, get_engine_for_connection
from api.engine_specs import get_spec
```

**Step 2: Replace all three DuckDB/other patterns with spec-based dispatch**

Each location follows the same refactored pattern:

```python
engine, spec = get_engine_for_connection(c)
if c["db_type"] == "duckdb":
    from api.engine_specs.duckdb import DuckDBSpec
    df = spec.execute_native(c["database_name"], sql)
else:
    with engine.connect() as conn:
        spec.set_timeout(conn, 30)
        df = pd.read_sql(text(sql), conn)
```

**Step 3: Commit**

```bash
git add api/filters/router.py
git commit -m "refactor: use engine specs in filters/router.py"
```

---

## Task 12: Refactor sql_lab/router.py — Eliminate db_type Branches

**Files:**
- Modify: `api/sql_lab/router.py`

**Context:** sql_lab/router.py has 7 db_type branch points. Two main functions:
1. `execute_sql()` (line ~20) — schema discovery (DuckDB vs other)
2. `run_sql()` (line ~70) — SQL execution with timeout chain

Same pattern as charts and filters.

**Step 1: Update imports**

Replace:
```python
from api.connections.router import _get_connection_with_password, _build_url, _create_ext_engine, is_postgres, is_clickhouse, is_mssql
```
With:
```python
from api.connections.router import _get_connection_with_password, get_engine_for_connection
from api.engine_specs import get_spec
```

**Step 2: Refactor both functions**

Same pattern as Task 10-11.

**Step 3: Commit**

```bash
git add api/sql_lab/router.py
git commit -m "refactor: use engine specs in sql_lab/router.py"
```

---

## Task 13: Refactor datasets/router.py + ai/tools.py + parquet_cache.py

**Files:**
- Modify: `api/datasets/router.py` (6 branch points)
- Modify: `api/ai/tools.py` (9 branch points)
- Modify: `api/parquet_cache.py` (5 branch points)

**Context:** These files all follow the same DuckDB-vs-other pattern. Refactor them to use engine specs.

**datasets/router.py:**
- Line 229-240: DuckDB vs other in preview query
- Line 185-195: DuckDB CSV upload path check
- Line 246: postgresql cursor_desc check

**ai/tools.py:**
- Lines 126-153: `_run_sql_tool()` — DuckDB native vs engine
- Lines 177-199: `_get_schema_tool()` — DuckDB native vs engine
- Lines 315-332: `_get_data_for_chart()` — DuckDB native vs engine
- Lines 659-669: `_get_data_for_export()` — DuckDB native vs engine

**parquet_cache.py:**
- Line 64: DuckDB check (skip caching for DuckDB)
- Line 170: db_type used for parameter binding style

**Step 1: Refactor each file**

Same spec-based pattern as Tasks 10-12.

**Step 2: Commit**

```bash
git add api/datasets/router.py api/ai/tools.py api/parquet_cache.py
git commit -m "refactor: use engine specs in datasets, ai/tools, and parquet_cache"
```

---

## Task 14: Delete Old Functions + Clean Up Imports

**Files:**
- Modify: `api/connections/router.py` — delete `_build_url`, `_create_ext_engine`, `is_postgres`, `is_clickhouse`, `is_mssql`, `_get_duckdb_schema`
- Modify: All files that imported these functions

**Context:** After Tasks 9-13, no file should import the old helper functions. Delete them and verify no references remain.

**Step 1: Delete functions from `connections/router.py`**

Remove:
- `_build_url()` (lines 56-78)
- `_create_ext_engine()` (lines 81-88)
- `is_postgres()` (lines 91-92)
- `is_clickhouse()` (lines 95-96)
- `is_mssql()` (lines 99-100)
- `_get_duckdb_schema()` (lines 317-343)

**Step 2: Verify no references**

Run: `cd /Users/ansha/projects/opencharts && grep -rn "_build_url\|_create_ext_engine\|is_postgres\|is_clickhouse\|is_mssql\|_get_duckdb_schema" api/ --include="*.py"`
Expected: No matches (or only the deleted file itself if grep is cached)

**Step 3: Run ruff check**

Run: `cd /Users/ansha/projects/opencharts/api && uv run ruff check .`
Expected: All checks passed!

**Step 4: Commit**

```bash
git add api/
git commit -m "refactor: delete old _build_url, _create_ext_engine, is_* helpers"
```

---

## Task 15: Add API Endpoints for Engine Specs

**Files:**
- Modify: `api/connections/router.py` — add `GET /api/connections/engine-specs` and `GET /api/connections/plugins`
- Modify: `api/main.py` — add openapi tag (if needed)

**Context:** Frontend needs to fetch available engine specs to render the dynamic connection form. Admin plugins page needs metadata about installed specs.

**Step 1: Add `GET /api/connections/engine-specs` endpoint**

```python
from dataclasses import asdict

@router.get("/engine-specs", summary="List available engine specs")
def list_engine_specs(current_user: dict = Depends(get_current_user)):
    """Return all registered engine specs with their form field definitions."""
    from api.engine_specs import get_all_specs
    result = []
    for db_type, spec in get_all_specs().items():
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
```

**Step 2: Add `GET /api/connections/plugins` endpoint**

```python
@router.get("/plugins", summary="List installed connector plugins")
def list_plugins(current_user: dict = Depends(require_admin)):
    """Return installed connector plugins with source info. Admin only."""
    from api.engine_specs import get_all_specs
    from importlib.metadata import entry_points, metadata as pkg_metadata
    import logging

    # Map external entry_points to package info
    external = {}
    for ep in entry_points(group="karta.engine_specs"):
        try:
            md = pkg_metadata(ep.dist.name)
            external[ep.name] = {
                "package": ep.dist.name,
                "version": md["Version"],
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
```

**Step 3: Commit**

```bash
git add api/connections/router.py
git commit -m "feat: add GET /engine-specs and GET /plugins API endpoints"
```

---

## Task 16: Update Connection CRUD — Support sqlalchemy_uri + extra_params

**Files:**
- Modify: `api/connections/router.py` — update `create_connection()` and `update_connection()`
- Modify: `api/models.py` — update `ConnectionCreate` and `ConnectionUpdate` Pydantic models

**Context:** The `create_connection` and `update_connection` endpoints need to accept and store `sqlalchemy_uri` and `extra_params`. For `_sqlalchemy` type connections, only `sqlalchemy_uri` is required. For spec-based connections, the standard fields are used. `extra_params` stores plugin-specific fields.

**Step 1: Update Pydantic models in `api/models.py`**

Add optional fields to `ConnectionCreate`:
```python
sqlalchemy_uri: str | None = None
extra_params: dict | None = None
```

**Step 2: Update `create_connection()` INSERT to include new columns**

**Step 3: Update `update_connection()` UPDATE to include new columns**

**Step 4: Encrypt `sqlalchemy_uri` if present (it contains credentials)**

Use the same `encrypt_password` / `decrypt_password_safe` from `api/crypto.py`. Store in a new column `sqlalchemy_uri_encrypted` or reuse the same encryption pattern.

**Step 5: Commit**

```bash
git add api/connections/router.py api/models.py
git commit -m "feat: support sqlalchemy_uri and extra_params in connection CRUD"
```

---

## Task 17: Frontend — Dynamic Connection Form

**Files:**
- Modify: `frontend/src/app/(dashboard)/connections/page.tsx`
- Modify: `frontend/src/hooks/use-connections.ts` — add `useEngineSpecs()` hook
- Modify: `frontend/src/types/index.ts` — add `EngineSpec` and `FieldDef` types

**Context:** Replace the hardcoded `DB_TYPES`, `NEEDS_HOST_PORT`, and `INITIAL_FORM` with a dynamic form driven by `GET /api/connections/engine-specs`. On form open, fetch specs. On type change, rebuild form fields from spec's `connection_fields`.

**Step 1: Add types in `frontend/src/types/index.ts`**

```typescript
export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "boolean";
  required: boolean;
  default: unknown;
  placeholder: string;
}

export interface EngineSpec {
  db_type: string;
  display_name: string;
  icon: string;
  sqlalchemy_uri_placeholder: string;
  connection_fields: FieldDef[];
}
```

**Step 2: Add `useEngineSpecs()` hook in `frontend/src/hooks/use-connections.ts`**

```typescript
export function useEngineSpecs() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  return useQuery({
    queryKey: ["engine-specs"],
    queryFn: () => api.get<EngineSpec[]>("/api/connections/engine-specs", token),
    enabled: !!token,
    staleTime: Infinity, // specs don't change at runtime
  });
}
```

**Step 3: Refactor ConnectionDialog in `connections/page.tsx`**

1. Replace `DB_TYPES` constant with `useEngineSpecs()` hook data
2. Remove `NEEDS_HOST_PORT` constant
3. Dynamic form: iterate `spec.connection_fields` to render inputs
4. On type change: reset form fields to spec defaults
5. Support `type: "boolean"` as Switch, `type: "password"` as password Input, `type: "number"` as number Input

**Step 4: Update `ConnectionCreate` type to include optional `sqlalchemy_uri` and `extra_params`**

**Step 5: Update i18n keys**

Add new keys to `frontend/messages/en.json` and `frontend/messages/ru.json`:
```json
"connection": {
  ...existing keys...
  "sqlalchemyUri": "SQLAlchemy URI",
  "otherDatabase": "Other (SQLAlchemy URI)",
  "filePath": "File Path",
  "extraParams": "Additional Parameters"
}
```

**Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/hooks/use-connections.ts frontend/src/app/\(dashboard\)/connections/page.tsx frontend/messages/en.json frontend/messages/ru.json
git commit -m "feat: dynamic connection form driven by engine specs API"
```

---

## Task 18: Build, Test End-to-End, Fix Issues

**Files:**
- All modified files

**Context:** Full stack rebuild and manual verification. This task catches integration issues.

**Step 1: Run ruff check**

Run: `cd /Users/ansha/projects/opencharts/api && uv run ruff check .`
Expected: All checks passed!

**Step 2: Run frontend lint**

Run: `cd /Users/ansha/projects/opencharts/frontend && npm run lint`
Expected: No errors

**Step 3: Build and start stack**

Run: `docker compose up --build -d`
Wait for services to be healthy.

**Step 4: Verify API endpoint**

Run: `curl -s http://localhost/api/connections/engine-specs -H "Authorization: Bearer $TOKEN" | python -m json.tool`
Expected: JSON array with 6 specs (postgres, mysql, clickhouse, mssql, duckdb, _sqlalchemy)

**Step 5: Verify existing connections still work**

Test with existing connections — they should work without any migration since `sqlalchemy_uri` defaults to NULL and `extra_params` defaults to `{}`.

**Step 6: Fix any issues found**

**Step 7: Commit fixes**

```bash
git add -A
git commit -m "fix: integration fixes for connector plugin system"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | BaseEngineSpec + FieldDef + Registry | `api/engine_specs/__init__.py`, `api/engine_specs/base.py` |
| 2 | PostgreSQL spec | `api/engine_specs/postgres.py` |
| 3 | MySQL spec | `api/engine_specs/mysql.py` |
| 4 | ClickHouse spec | `api/engine_specs/clickhouse.py` |
| 5 | MSSQL spec | `api/engine_specs/mssql.py` |
| 6 | DuckDB spec | `api/engine_specs/duckdb.py` |
| 7 | SQLAlchemy URI spec + registration + entry_points | `api/engine_specs/sqlalchemy_uri.py`, `__init__.py`, `main.py` |
| 8 | DB columns + get_engine_for_connection() | `api/database.py`, `api/connections/router.py` |
| 9 | Refactor connections/router.py | `api/connections/router.py` |
| 10 | Refactor charts/router.py | `api/charts/router.py` |
| 11 | Refactor filters/router.py | `api/filters/router.py` |
| 12 | Refactor sql_lab/router.py | `api/sql_lab/router.py` |
| 13 | Refactor datasets + ai/tools + parquet_cache | `api/datasets/router.py`, `api/ai/tools.py`, `api/parquet_cache.py` |
| 14 | Delete old helpers + clean imports | All consumer files |
| 15 | API endpoints (/engine-specs, /plugins) | `api/connections/router.py` |
| 16 | Connection CRUD — support new fields | `api/connections/router.py`, `api/models.py` |
| 17 | Frontend — dynamic connection form | `connections/page.tsx`, `use-connections.ts`, `types/index.ts`, i18n |
| 18 | Build + E2E test + fix | All |
