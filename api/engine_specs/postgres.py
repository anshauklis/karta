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
