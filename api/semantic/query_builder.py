"""
Semantic query builder — generates SQL from semantic model definitions.

Loads model metadata (measures, dimensions, joins) from the database and
constructs a SELECT … GROUP BY … query that can be executed against the
model's underlying connection.
"""

import re
import logging

from sqlalchemy import text

from api.database import engine

logger = logging.getLogger(__name__)

# Operators allowed in filters.  Keys are normalised to uppercase.
_FILTER_OPS = {
    "=", "!=", ">", "<", ">=", "<=",
    "IN", "NOT IN",
    "IS NULL", "IS NOT NULL",
    "LIKE", "NOT LIKE",
}

# Simple identifier pattern — used to validate column / table names that we
# interpolate into SQL.  Allows dotted paths like ``schema.table``.
_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_.]*$")


def _validate_identifier(name: str, label: str = "identifier") -> str:
    """Raise if *name* doesn't look like a safe SQL identifier."""
    if not name or not _IDENT_RE.match(name):
        raise ValueError(f"Invalid {label}: {name!r}")
    return name


def _load_model(conn, model_id: int) -> dict:
    """Fetch semantic model row or raise."""
    row = conn.execute(
        text(
            "SELECT id, connection_id, name, source_type, source_table, source_sql "
            "FROM semantic_models WHERE id = :id"
        ),
        {"id": model_id},
    ).mappings().first()
    if not row:
        raise ValueError(f"Semantic model {model_id} not found")
    return dict(row)


def _load_measures(conn, model_id: int) -> list[dict]:
    return [
        dict(r)
        for r in conn.execute(
            text(
                "SELECT name, expression, agg_type "
                "FROM model_measures WHERE model_id = :mid ORDER BY sort_order, id"
            ),
            {"mid": model_id},
        ).mappings().all()
    ]


def _load_dimensions(conn, model_id: int) -> list[dict]:
    return [
        dict(r)
        for r in conn.execute(
            text(
                "SELECT name, column_name, dimension_type, time_grain "
                "FROM model_dimensions WHERE model_id = :mid ORDER BY sort_order, id"
            ),
            {"mid": model_id},
        ).mappings().all()
    ]


def _load_joins(conn, model_id: int) -> list[dict]:
    return [
        dict(r)
        for r in conn.execute(
            text(
                "SELECT j.join_type, j.from_column, j.to_column, "
                "       sm.source_type AS to_source_type, "
                "       sm.source_table AS to_source_table, "
                "       sm.source_sql AS to_source_sql, "
                "       sm.name AS to_model_name "
                "FROM model_joins j "
                "JOIN semantic_models sm ON sm.id = j.to_model_id "
                "WHERE j.from_model_id = :mid ORDER BY j.id"
            ),
            {"mid": model_id},
        ).mappings().all()
    ]


# ------------------------------------------------------------------
# Source resolution helpers
# ------------------------------------------------------------------

def _source_fragment(source_type: str, source_table: str | None,
                     source_sql: str | None, alias: str) -> str:
    """Return ``table AS alias`` or ``(sql) AS alias``."""
    if source_type == "sql":
        if not source_sql:
            raise ValueError("source_type is 'sql' but source_sql is empty")
        return f"({source_sql}) AS {alias}"
    # default: table
    tbl = _validate_identifier(source_table or "", "source_table")
    return f"{tbl} AS {alias}"


# ------------------------------------------------------------------
# Dimension / measure column helpers
# ------------------------------------------------------------------

def _dim_select_expr(dim: dict, table_alias: str = "_base") -> str:
    """Build the SELECT expression for one dimension.

    For temporal dimensions with a time_grain, wraps in DATE_TRUNC.
    """
    col = dim["column_name"]
    grain = dim.get("time_grain")
    if dim.get("dimension_type") == "temporal" and grain:
        return f"DATE_TRUNC('{grain}', {table_alias}.{col})"
    return f"{table_alias}.{col}"


def _measure_select_expr(measure: dict, table_alias: str = "_base") -> str:
    """Build the aggregated SELECT expression for one measure.

    ``expression`` is the raw column or expression (e.g. ``price``),
    ``agg_type`` is the SQL aggregation (SUM, COUNT, AVG, …).
    """
    expr = measure["expression"]
    agg = measure["agg_type"].upper()

    # Special-case: count(*) or count_distinct
    if agg == "COUNT_DISTINCT":
        return f"COUNT(DISTINCT {expr})"
    if agg == "COUNT" and expr == "*":
        return "COUNT(*)"
    return f"{agg}({expr})"


# ------------------------------------------------------------------
# Filter helpers
# ------------------------------------------------------------------

def _build_where_clause(filters: list[dict], table_alias: str = "_base") -> str:
    """Build a WHERE clause from a list of filter dicts.

    Each filter: ``{"dimension": "col", "operator": "=", "value": ...}``
    """
    if not filters:
        return ""

    parts: list[str] = []
    for f in filters:
        dim_name = f.get("dimension", "")
        op = (f.get("operator") or "=").upper().strip()
        value = f.get("value")

        if op not in _FILTER_OPS:
            raise ValueError(f"Unsupported filter operator: {op!r}")

        col = f"{table_alias}.{dim_name}"

        if op in ("IS NULL", "IS NOT NULL"):
            parts.append(f"{col} {op}")
        elif op == "IN":
            if not isinstance(value, list) or len(value) == 0:
                raise ValueError("IN filter requires a non-empty list value")
            placeholders = ", ".join(_quote_value(v) for v in value)
            parts.append(f"{col} IN ({placeholders})")
        elif op == "NOT IN":
            if not isinstance(value, list) or len(value) == 0:
                raise ValueError("NOT IN filter requires a non-empty list value")
            placeholders = ", ".join(_quote_value(v) for v in value)
            parts.append(f"{col} NOT IN ({placeholders})")
        else:
            parts.append(f"{col} {op} {_quote_value(value)}")

    return "WHERE " + " AND ".join(parts)


def _quote_value(v) -> str:
    """Return a SQL-safe literal for a scalar value."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    # String — escape single quotes
    escaped = str(v).replace("'", "''")
    return f"'{escaped}'"


# ------------------------------------------------------------------
# Main builder
# ------------------------------------------------------------------

def build_semantic_query(
    model_id: int,
    measure_names: list[str],
    dimension_names: list[str],
    filters: list[dict] | None = None,
    order_by: str | None = None,
    limit: int | None = None,
) -> str:
    """Generate a SQL SELECT from semantic model definitions.

    Parameters
    ----------
    model_id : int
        Primary key in ``semantic_models``.
    measure_names : list[str]
        Names of measures to include (must exist in ``model_measures``).
    dimension_names : list[str]
        Names of dimensions to include (must exist in ``model_dimensions``).
    filters : list[dict] | None
        Optional list of ``{"dimension", "operator", "value"}`` dicts.
    order_by : str | None
        Column / alias to ORDER BY.  Defaults to first measure DESC.
    limit : int | None
        Optional LIMIT.

    Returns
    -------
    str
        Ready-to-execute SQL query.
    """
    with engine.connect() as conn:
        model = _load_model(conn, model_id)
        all_measures = _load_measures(conn, model_id)
        all_dimensions = _load_dimensions(conn, model_id)
        joins = _load_joins(conn, model_id)

    # --- Resolve requested measures / dimensions ---------------------------

    measures_by_name = {m["name"]: m for m in all_measures}
    dims_by_name = {d["name"]: d for d in all_dimensions}

    selected_measures: list[dict] = []
    for name in measure_names:
        if name not in measures_by_name:
            raise ValueError(f"Unknown measure: {name!r}")
        selected_measures.append(measures_by_name[name])

    selected_dims: list[dict] = []
    for name in dimension_names:
        if name not in dims_by_name:
            raise ValueError(f"Unknown dimension: {name!r}")
        selected_dims.append(dims_by_name[name])

    if not selected_measures and not selected_dims:
        raise ValueError("At least one measure or dimension must be requested")

    # --- FROM clause -------------------------------------------------------

    from_clause = _source_fragment(
        model["source_type"],
        model.get("source_table"),
        model.get("source_sql"),
        "_base",
    )

    # --- JOIN clauses ------------------------------------------------------

    join_clauses: list[str] = []
    for j in joins:
        jtype = (j["join_type"] or "LEFT").upper()
        to_alias = f"_{j['to_model_name']}"
        to_src = _source_fragment(
            j["to_source_type"],
            j.get("to_source_table"),
            j.get("to_source_sql"),
            to_alias,
        )
        on = f"_base.{j['from_column']} = {to_alias}.{j['to_column']}"
        join_clauses.append(f"{jtype} JOIN {to_src} ON {on}")

    # --- SELECT columns ----------------------------------------------------

    select_parts: list[str] = []
    group_by_parts: list[str] = []

    for dim in selected_dims:
        expr = _dim_select_expr(dim)
        alias = dim["name"]
        select_parts.append(f"{expr} AS {alias}")
        group_by_parts.append(expr)

    for m in selected_measures:
        expr = _measure_select_expr(m)
        alias = m["name"]
        select_parts.append(f"{expr} AS {alias}")

    # --- WHERE clause ------------------------------------------------------

    where_clause = _build_where_clause(filters or [])

    # --- ORDER BY ----------------------------------------------------------

    if order_by:
        order_clause = f"ORDER BY {order_by}"
    elif selected_measures:
        order_clause = f"ORDER BY {selected_measures[0]['name']} DESC"
    else:
        order_clause = ""

    # --- LIMIT -------------------------------------------------------------

    limit_clause = f"LIMIT {int(limit)}" if limit else ""

    # --- Assemble ----------------------------------------------------------

    parts = [
        "SELECT",
        ",\n       ".join(select_parts),
        f"FROM {from_clause}",
    ]
    if join_clauses:
        parts.append("\n".join(join_clauses))
    if where_clause:
        parts.append(where_clause)
    if group_by_parts:
        parts.append("GROUP BY " + ", ".join(group_by_parts))
    if order_clause:
        parts.append(order_clause)
    if limit_clause:
        parts.append(limit_clause)

    sql = "\n".join(parts)
    logger.debug("Semantic query for model %d:\n%s", model_id, sql)
    return sql
