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
    if db_type == "postgresql":
        db_type = "postgres"
    return _REGISTRY.get(db_type)


def get_all_specs() -> dict[str, BaseEngineSpec]:
    """Return all registered specs (copy)."""
    return dict(_REGISTRY)


def discover_and_register() -> None:
    """Register built-in specs and discover external specs via entry_points."""
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
