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
