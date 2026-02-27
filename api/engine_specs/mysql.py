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
