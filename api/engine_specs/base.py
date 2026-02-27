from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine


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
        """Build SQLAlchemy URI from form field values."""
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
        """Return a SQL expression for MAX(col) - N days.
        Return None if the dialect doesn't support it."""
        return None
