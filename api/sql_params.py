"""SQL parameter/variable substitution.

Supports Jinja-like {{ variable_name }} syntax with safe substitution.
Variables are replaced with type-aware quoted literal values before SQL execution,
so the resulting SQL works with any database engine (PostgreSQL, MySQL, DuckDB, etc.).
"""
import re
from typing import Any

_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def extract_variables(sql: str) -> list[str]:
    """Return unique variable names found in SQL."""
    return list(dict.fromkeys(_VAR_RE.findall(sql)))


def _quote_value(val: Any, var_type: str = "text") -> str:
    """Quote a variable value for safe SQL embedding."""
    if val is None:
        return "NULL"
    s = str(val)
    if var_type == "number":
        # Validate numeric — strip and check
        s = s.strip()
        try:
            float(s)
        except ValueError:
            raise ValueError(f"Variable value '{s}' is not a valid number")
        return s
    # text and date — single-quote with escaping
    return "'" + s.replace("'", "''") + "'"


def substitute(
    sql: str,
    values: dict[str, Any],
    defaults: dict[str, Any] | None = None,
    var_types: dict[str, str] | None = None,
) -> str:
    """Replace {{ var }} with quoted literal values. Returns substituted SQL string."""
    defaults = defaults or {}
    var_types = var_types or {}

    def _replace(m: re.Match) -> str:
        name = m.group(1)
        val = values.get(name, defaults.get(name))
        if val is None:
            raise ValueError(f"Variable '{name}' has no value and no default")
        vtype = var_types.get(name, "text")
        return _quote_value(val, vtype)

    return _VAR_RE.sub(_replace, sql)
