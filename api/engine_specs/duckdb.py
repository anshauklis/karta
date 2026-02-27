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
    encrypted_fields = []

    def build_url(self, params: dict) -> str:
        return f"duckdb:///{params['database_name']}?access_mode=read_only"

    def create_engine(self, url: str, connection_id: int | None = None) -> Engine:
        return create_engine(url, poolclass=NullPool)

    def test_connection(self, engine: Engine) -> bool:
        db_path = self._extract_path(engine)
        con = _duckdb.connect(db_path, read_only=True)
        try:
            con.execute("SELECT 1")
        finally:
            con.close()
        return True

    def get_schemas(self, engine: Engine) -> list[str]:
        db_path = self._extract_path(engine)
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
        db_path = self._extract_path(engine)
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

    @staticmethod
    def _extract_path(engine: Engine) -> str:
        """Extract file path from DuckDB engine URL."""
        url_str = str(engine.url)
        path = url_str.replace("duckdb:///", "").split("?")[0]
        return path
