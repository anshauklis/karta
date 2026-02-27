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
    return _REGISTRY.get(db_type)


def get_all_specs() -> dict[str, BaseEngineSpec]:
    """Return all registered specs (copy)."""
    return dict(_REGISTRY)


__all__ = [
    "BaseEngineSpec", "FieldDef", "DEFAULT_FIELDS",
    "register", "get_spec", "get_all_specs",
]
