# Connector Plugin System — Design

## Goal

Replace hardcoded if/elif database connector logic with a registry-based plugin system. Users can add new database connectors by installing a pip package — no code changes to Karta core.

## Architecture

Two paths to connect a database:

**Path A — Raw SQLAlchemy URI** (zero code, any database)
User selects "Other (SQLAlchemy)" in UI, enters a URI like `snowflake://user:pass@account/db`. Karta does `create_engine(uri)` and uses standard SQLAlchemy inspector. Works with any database that has a SQLAlchemy dialect installed.

**Path B — Engine Spec** (improved UX for popular databases)
A `BaseEngineSpec` subclass that defines:
- Connection form fields (host/port/user/pass or custom like region/s3_staging_dir)
- URL construction from form fields
- Timeout commands, schema introspection overrides
- Icon, display name

Engine specs are **fully optional** — without one, the database still works via raw SQLAlchemy URI. Specs just improve UX.

Built-in specs: PostgreSQL, MySQL, MSSQL, ClickHouse, DuckDB (current 5).
External specs: pip packages with Python entry_points, auto-discovered at startup.

Inspired by [Apache Superset's db_engine_spec](https://github.com/apache/superset/blob/master/superset/db_engine_specs/README.md) architecture.

---

## BaseEngineSpec

```python
# api/engine_specs/base.py

class FieldDef:
    name: str           # "host", "s3_staging_dir"
    label: str          # "Host", "S3 Staging Directory"
    type: str           # "text", "password", "number", "boolean"
    required: bool
    default: Any
    placeholder: str

class BaseEngineSpec:
    db_type: str                    # "postgres", "athena"
    display_name: str               # "PostgreSQL", "Amazon Athena"
    icon: str                       # "postgres" (frontend maps to icon)
    sqlalchemy_uri_placeholder: str # "postgresql://user:pass@host:5432/db"

    # Form fields. Default: host/port/user/pass/db/ssl
    connection_fields: list[FieldDef] = DEFAULT_FIELDS

    # Which fields to encrypt in DB
    encrypted_fields: list[str] = ["password"]

    def build_url(self, params: dict) -> str:
        """Build SQLAlchemy URI from form fields."""

    def create_engine(self, url: str, connection_id: int) -> Engine:
        """Create SQLAlchemy engine. DuckDB overrides (NullPool, native)."""

    def set_timeout(self, conn, timeout_sec: int):
        """SET statement_timeout / SET max_execution_time / etc. Default: no-op."""

    def get_schemas(self, engine) -> list[str]:
        """List schemas/databases. Default: SQLAlchemy inspector."""

    def get_schema(self, engine, schema: str) -> list[dict]:
        """Tables + columns. Default: inspector. Postgres overrides via information_schema."""

    def test_connection(self, engine) -> bool:
        """SELECT 1. DuckDB overrides."""
```

Built-in specs inherit and override only what differs. Example: `PostgresSpec` overrides `set_timeout()` and `get_schema()`. `MySQLSpec` overrides only `set_timeout()`. DuckDB overrides almost everything (native API, NullPool, file paths).

---

## Registry + Discovery

```python
# api/engine_specs/__init__.py

_REGISTRY: dict[str, BaseEngineSpec] = {}

def register(spec: BaseEngineSpec) -> None:
    _REGISTRY[spec.db_type] = spec

def get_spec(db_type: str) -> BaseEngineSpec | None:
    return _REGISTRY.get(db_type)

def get_all_specs() -> dict[str, BaseEngineSpec]:
    return dict(_REGISTRY)
```

**Startup (main.py):**

```python
# 1. Built-in specs
from api.engine_specs.postgres import PostgresSpec
from api.engine_specs.mysql import MySQLSpec
# ...
register(PostgresSpec())
register(MySQLSpec())

# 2. External specs via entry_points
from importlib.metadata import entry_points
for ep in entry_points(group="karta.engine_specs"):
    spec_cls = ep.load()
    register(spec_cls())
```

**External package** (e.g. `karta-connector-snowflake`) registers in its `pyproject.toml`:

```toml
[project.entry-points."karta.engine_specs"]
snowflake = "karta_connector_snowflake:SnowflakeSpec"
```

User does `uv add karta-connector-snowflake`, restarts — Snowflake appears in UI.

---

## Database Changes

Two new columns on `connections`:

```sql
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sqlalchemy_uri TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS extra_params JSONB DEFAULT '{}';
```

| Scenario | host/port/user/pass | sqlalchemy_uri | extra_params |
|----------|-------------------|----------------|--------------|
| Postgres (built-in spec) | filled | NULL | `{}` |
| Athena (plugin with custom fields) | NULL | NULL | `{"region": "us-east-1", "s3_staging_dir": "s3://..."}` |
| Other / Raw SQLAlchemy | NULL | `snowflake://user:pass@account/db` | `{}` |

**Engine resolution:**

```python
def get_engine_for_connection(conn: dict) -> Engine:
    spec = get_spec(conn["db_type"]) or BaseEngineSpec()

    if conn.get("sqlalchemy_uri"):
        # Path A — raw URI
        url = conn["sqlalchemy_uri"]
    else:
        # Path B — spec builds URL from fields
        params = {
            "host": conn["host"], "port": conn["port"],
            "username": conn["username"], "password": conn["password"],
            "database_name": conn["database_name"],
            "ssl_enabled": conn["ssl_enabled"],
            **conn.get("extra_params", {}),
        }
        url = spec.build_url(params)

    return spec.create_engine(url, conn["id"])
```

Existing connections work without migration — `sqlalchemy_uri` = NULL, `extra_params` = `{}`, spec determined by `db_type`.

Passwords in `extra_params` encrypted per `spec.encrypted_fields` on save.

---

## Refactor: Eliminating if/elif

**Before** (scattered across 6+ files):
```python
if c["db_type"] == "duckdb":
    duck = duckdb.connect(c["database_name"], read_only=True)
else:
    url = _build_url(c["db_type"], c["host"], ...)
    ext_engine = _create_ext_engine(url, c["db_type"], c["id"])
    if is_postgres(c["db_type"]):
        conn.execute(text("SET statement_timeout = 30000"))
    elif is_clickhouse(c["db_type"]):
        conn.execute(text("SET max_execution_time = 10"))
```

**After** (uniform everywhere):
```python
spec = get_spec(c["db_type"]) or BaseEngineSpec()
engine = get_engine_for_connection(c)
with engine.connect() as conn:
    spec.set_timeout(conn, timeout_sec=30)
    result = conn.execute(text(sql))
```

**Deleted:**
- `_build_url()` → logic moves to `spec.build_url()`
- `_create_ext_engine()` → `spec.create_engine()`
- `is_postgres()`, `is_clickhouse()`, `is_mssql()` → not needed
- All if/elif on db_type in: `charts/router.py`, `filters/router.py`, `datasets/router.py`, `sql_lab/router.py`, `parquet_cache.py`, `connections/router.py`

**Kept in connections/router.py:**
- CRUD endpoints (create/update/delete/list)
- `_get_connection_with_password()` / `_get_connections_with_password()` — DB reads + decryption
- `get_engine_for_connection()` — new single entry point

---

## Frontend

### Dynamic connection form

**API endpoint:**

```
GET /api/engine-specs
→ [
    {
      "db_type": "postgres",
      "display_name": "PostgreSQL",
      "icon": "postgres",
      "connection_fields": [
        {"name": "host", "label": "Host", "type": "text", "required": true, "default": "localhost"},
        {"name": "port", "label": "Port", "type": "number", "required": true, "default": 5432},
        ...
      ]
    },
    {
      "db_type": "_sqlalchemy",
      "display_name": "Other (SQLAlchemy URI)",
      "icon": "database",
      "connection_fields": [
        {"name": "sqlalchemy_uri", "label": "SQLAlchemy URI", "type": "text", "required": true,
         "placeholder": "dialect+driver://user:pass@host:port/dbname"}
      ]
    }
  ]
```

**Connection form (connection-form.tsx):**

1. Fetch `GET /api/engine-specs` on form open
2. db_type select rendered from specs list (with icons and display_name)
3. On type change — form rebuilds from that spec's `connection_fields`
4. "Other (SQLAlchemy URI)" always last — single URI field

Form generated dynamically: iterate `connection_fields`, render `Input` / `Select` / `Switch` per `type`. No hardcoded fields.

### Admin plugins page (`/admin/plugins`)

Read-only table:

| Name | Type | Source | Status |
|------|------|--------|--------|
| PostgreSQL | connector | built-in | active |
| Snowflake | connector | karta-connector-snowflake 0.2.1 | active |
| Other (SQLAlchemy) | connector | built-in | active |

Data from `GET /api/plugins` — returns registered specs with package version (if external).

---

## Example External Plugin — Snowflake

**Package structure:**

```
karta-connector-snowflake/
├── pyproject.toml
└── karta_connector_snowflake/
    └── __init__.py
```

**pyproject.toml:**

```toml
[project]
name = "karta-connector-snowflake"
version = "0.1.0"
dependencies = ["snowflake-sqlalchemy>=1.5.0"]

[project.entry-points."karta.engine_specs"]
snowflake = "karta_connector_snowflake:SnowflakeSpec"
```

**\_\_init\_\_.py:**

```python
from api.engine_specs.base import BaseEngineSpec, FieldDef

class SnowflakeSpec(BaseEngineSpec):
    db_type = "snowflake"
    display_name = "Snowflake"
    icon = "snowflake"
    sqlalchemy_uri_placeholder = "snowflake://user:pass@account/db/schema"

    connection_fields = [
        FieldDef("account", "Account", "text", required=True, placeholder="xy12345.us-east-1"),
        FieldDef("username", "Username", "text", required=True),
        FieldDef("password", "Password", "password", required=True),
        FieldDef("database_name", "Database", "text", required=True),
        FieldDef("schema", "Schema", "text", required=False, default="PUBLIC"),
        FieldDef("warehouse", "Warehouse", "text", required=False),
        FieldDef("role", "Role", "text", required=False),
    ]
    encrypted_fields = ["password"]

    def build_url(self, params: dict) -> str:
        url = f"snowflake://{params['username']}:{params['password']}@{params['account']}/{params['database_name']}"
        if params.get("schema"):
            url += f"/{params['schema']}"
        qs = []
        if params.get("warehouse"):
            qs.append(f"warehouse={params['warehouse']}")
        if params.get("role"):
            qs.append(f"role={params['role']}")
        if qs:
            url += "?" + "&".join(qs)
        return url

    def set_timeout(self, conn, timeout_sec: int):
        from sqlalchemy import text
        conn.execute(text(f"ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = {timeout_sec}"))
```

**Installation:**
```bash
uv add karta-connector-snowflake
docker compose up --build -d
```
