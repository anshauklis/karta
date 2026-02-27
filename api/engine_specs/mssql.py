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
