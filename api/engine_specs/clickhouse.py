from sqlalchemy import text

from api.engine_specs.base import BaseEngineSpec, FieldDef


def _group_clickhouse_columns(rows, qualified: bool) -> list[dict]:
    """Group flat (database, table, name, type) rows into the schema-browser
    shape: [{"table_name", "columns": [{"name", "type", "nullable"}]}].

    `qualified` → table_name is `database.table`; otherwise the bare table.
    A column is nullable when its CH type is wrapped in `Nullable(...)`.
    """
    tables: dict[str, list] = {}
    order: list[str] = []
    for database, table, name, col_type in rows:
        key = f"{database}.{table}" if qualified else table
        if key not in tables:
            tables[key] = []
            order.append(key)
        tables[key].append({
            "name": name,
            "type": col_type,
            "nullable": str(col_type).startswith("Nullable("),
        })
    return [{"table_name": k, "columns": tables[k]} for k in order]


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

    def get_schema(self, engine, schema: str | None = None) -> list[dict]:
        """List tables and columns from system.columns.

        ClickHouse is multi-database: with no `schema` the default SQLAlchemy
        inspector only sees the (usually empty) connection database, so the
        schema browser comes up empty. Here we list every user database and
        return fully-qualified `database.table` names (valid in CH queries),
        or just the table names when a specific `schema` is requested.
        """
        if schema:
            where = "database = :db"
            params = {"db": schema}
        else:
            where = ("database NOT IN "
                     "('system', 'information_schema', 'INFORMATION_SCHEMA')")
            params = {}
        sql = (
            "SELECT database, table, name, type FROM system.columns "
            f"WHERE {where} ORDER BY database, table, position"
        )
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
        return _group_clickhouse_columns(rows, qualified=schema is None)

    def time_range_expression(self, column: str, days: int) -> str:
        return f"subtractDays(MAX({column}), {days})"
