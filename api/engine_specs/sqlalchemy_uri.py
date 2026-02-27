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
    encrypted_fields = ["sqlalchemy_uri"]

    def build_url(self, params: dict) -> str:
        return params["sqlalchemy_uri"]
