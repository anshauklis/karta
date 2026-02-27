"""SQL parameter/variable substitution.

Supports Jinja-like {{ variable_name }} syntax with safe substitution.
Variables are replaced with $param DuckDB placeholders before SQL execution.
"""
import re
from typing import Any

_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def extract_variables(sql: str) -> list[str]:
    """Return unique variable names found in SQL."""
    return list(dict.fromkeys(_VAR_RE.findall(sql)))


def substitute(
    sql: str,
    values: dict[str, Any],
    defaults: dict[str, Any] | None = None,
) -> tuple[str, dict]:
    """Replace {{ var }} with $var DuckDB placeholders. Returns (sql, params).

    Merges runtime values over defaults. Raises ValueError if a variable
    has no value and no default.
    """
    defaults = defaults or {}
    params: dict[str, Any] = {}

    def _replace(m: re.Match) -> str:
        name = m.group(1)
        val = values.get(name, defaults.get(name))
        if val is None:
            raise ValueError(f"Variable '{name}' has no value and no default")
        params[f"_var_{name}"] = val
        return f"$_var_{name}"

    result = _VAR_RE.sub(_replace, sql)
    return result, params
