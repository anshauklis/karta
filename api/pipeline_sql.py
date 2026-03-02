"""Pipeline SQL: generate DuckDB CTE chain from chart config.

Replaces the pandas-based _apply_pipeline with SQL executed by DuckDB.
CTE order: _base → _rls → _dash → _cf → _tr → _tg → _calc → _met → _limit
"""

import re

import pyarrow.parquet as pq


def build_pipeline_sql(
    source: str,
    config: dict,
    rls_conditions: list[str] | None = None,
    rls_params: dict | None = None,
    dash_where: str = "",
    dash_params: dict | None = None,
    column_meta: dict | None = None,
    skip_metrics: bool = False,
) -> tuple[str, dict]:
    """Build a CTE chain that applies the full chart pipeline in DuckDB.

    Args:
        source: DuckDB source expression, e.g. "read_parquet('/path')" or "(SELECT ...)"
        config: chart_config dict
        rls_conditions: list of RLS WHERE fragments with $param placeholders
        rls_params: parameter values for RLS conditions
        dash_where: dashboard filter WHERE fragment with $param placeholders
        dash_params: parameter values for dashboard filters
        column_meta: {"col": "numeric"|"text"|"timestamp"} for time_grain aggregation
        skip_metrics: True when custom SQL already aggregated

    Returns:
        (sql, params) tuple ready for DuckDB execute()
    """
    params = {}
    if rls_params:
        params.update(rls_params)
    if dash_params:
        params.update(dash_params)

    ctes = []
    prev = "_base"
    ctes.append(f"_base AS (\n    SELECT * FROM {source}\n)")

    # RLS
    if rls_conditions:
        cte = f"_rls AS (\n    SELECT * FROM {prev}\n    WHERE {' AND '.join(rls_conditions)}\n)"
        ctes.append(cte)
        prev = "_rls"

    # Dashboard filters
    if dash_where:
        cte = f"_dash AS (\n    SELECT * FROM {prev}\n    WHERE {dash_where}\n)"
        ctes.append(cte)
        prev = "_dash"

    # Chart filters
    cf_result = _chart_filters_cte(config, prev, skip_metrics)
    if cf_result:
        cte, cf_params = cf_result
        ctes.append(cte)
        params.update(cf_params)
        prev = "_cf"

    # Time range
    tr_cte = _time_range_cte(config, prev)
    if tr_cte:
        ctes.append(tr_cte)
        prev = "_tr"

    # Time grain
    tg_cte = _time_grain_cte(config, prev, column_meta or {})
    if tg_cte:
        ctes.append(tg_cte)
        prev = "_tg"

    # Calculated columns
    if not skip_metrics:
        calc_cte = _calculated_columns_cte(config, prev)
        if calc_cte:
            ctes.append(calc_cte)
            prev = "_calc"

    # Metrics
    if not skip_metrics:
        met_result = _metrics_cte(config, prev)
        if met_result:
            ctes.append(met_result)
            prev = "_met"

    # Row limit
    limit_cte = _row_limit_cte(config, prev)
    if limit_cte:
        ctes.append(limit_cte)
        prev = "_limit"

    sql = "WITH " + ",\n".join(ctes) + f"\nSELECT * FROM {prev}"
    return sql, params


def get_column_meta(parquet_path: str | None = None) -> dict:
    """Get column type classification from Parquet schema.

    Returns {"col": "numeric"|"text"|"timestamp"}.
    """
    if not parquet_path:
        return {}

    schema = pq.read_schema(parquet_path)
    meta = {}
    for i in range(len(schema)):
        field = schema.field(i)
        name = field.name
        t = field.type

        if (
            pa_is_integer(t) or pa_is_float(t) or pa_is_decimal(t)
        ):
            meta[name] = "numeric"
        elif pa_is_timestamp(t) or pa_is_date(t):
            meta[name] = "timestamp"
        else:
            meta[name] = "text"

    return meta


def pa_is_integer(t) -> bool:
    import pyarrow as pa
    return pa.types.is_integer(t)


def pa_is_float(t) -> bool:
    import pyarrow as pa
    return pa.types.is_floating(t)


def pa_is_decimal(t) -> bool:
    import pyarrow as pa
    return pa.types.is_decimal(t)


def pa_is_timestamp(t) -> bool:
    import pyarrow as pa
    return pa.types.is_timestamp(t)


def pa_is_date(t) -> bool:
    import pyarrow as pa
    return pa.types.is_date(t)


# ---------------------------------------------------------------------------
# Internal CTE builders
# ---------------------------------------------------------------------------

_TIME_RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90, "1y": 365}

_SAFE_EXPR = re.compile(r'^[\w\s\+\-\*/\(\)\.\,\>\<\=\!\&\|\~\%]+$')
_BLOCKED_TOKENS = {"import", "__", "lambda", "def ", "class ", "exec", "eval", "open", "compile"}


def _chart_filters_cte(config: dict, prev: str, skip_metrics: bool) -> tuple[str, dict] | None:
    """Build CTE for chart-level filters."""
    if skip_metrics:
        return None

    filters = config.get("chart_filters", [])
    if not filters:
        return None

    COL_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_ ]*$')
    conditions = []
    params = {}

    for i, f in enumerate(filters):
        # Custom SQL expressions — inject directly (validated by DuckDB)
        if f.get("expressionType") == "custom_sql":
            expr = f.get("sqlExpression", "")
            if expr:
                conditions.append(f"({expr})")
            continue

        col = f.get("column", "")
        op = f.get("operator", "=")
        val = f.get("value")

        if not COL_RE.match(col):
            continue

        pname = f"_pcf_{i}"

        if op in ("IS NULL", "IS NOT NULL"):
            conditions.append(f'"{col}" {op}')
            continue

        if val is None:
            continue

        if op == "=" :
            params[pname] = val
            conditions.append(f'"{col}" = ${pname}')
        elif op == "!=":
            params[pname] = val
            conditions.append(f'"{col}" != ${pname}')
        elif op in (">", ">=", "<", "<="):
            try:
                params[pname] = float(val)
            except (ValueError, TypeError):
                params[pname] = val
            conditions.append(f'"{col}" {op} ${pname}')
        elif op in ("IN", "NOT IN"):
            vals = [v.strip() for v in str(val).split(",")]
            placeholders = []
            for j, v in enumerate(vals):
                p = f"_pcf_{i}_{j}"
                params[p] = v
                placeholders.append(f"${p}")
            conditions.append(f'CAST("{col}" AS TEXT) {op} ({", ".join(placeholders)})')
        elif op == "LIKE":
            params[pname] = f"%{val}%"
            conditions.append(f'CAST("{col}" AS TEXT) LIKE ${pname}')

    if not conditions:
        return None

    where = " AND ".join(conditions)
    cte = f'_cf AS (\n    SELECT * FROM {prev}\n    WHERE {where}\n)'
    return cte, params


def _time_range_cte(config: dict, prev: str) -> str | None:
    """Build CTE for time range filtering using MAX(col) as reference."""
    time_col = config.get("time_column")
    time_range = config.get("time_range", "all")
    if not time_col or time_range == "all":
        return None

    days = _TIME_RANGE_DAYS.get(time_range)
    if days is None:
        return None

    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_ ]*$', time_col):
        return None

    col = f'"{time_col}"'
    return (
        f"_tr AS (\n"
        f"    SELECT * FROM {prev}\n"
        f"    WHERE {col} >= (SELECT MAX({col}) - INTERVAL '{days} days' FROM {prev})\n"
        f")"
    )


def _time_grain_cte(config: dict, prev: str, column_meta: dict) -> str | None:
    """Build CTE for time grain truncation + aggregation.

    Uses column_meta to decide SUM (numeric) vs ANY_VALUE (text/other).
    """
    time_col = config.get("time_column")
    time_grain = config.get("time_grain")
    if not time_col or not time_grain or time_grain == "raw":
        return None

    valid_grains = {"day", "week", "month", "quarter", "year"}
    if time_grain not in valid_grains:
        return None

    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_ ]*$', time_col):
        return None

    col = f'"{time_col}"'

    # Group-by columns: time + x_column + color_column
    group_cols = [time_col]
    for key in ("x_column", "color_column"):
        c = config.get(key)
        if c and c != time_col and re.match(r'^[a-zA-Z_][a-zA-Z0-9_ ]*$', c):
            group_cols.append(c)

    # Build SELECT: truncated time, group cols, aggregated rest
    # We use a two-pass approach: known columns from meta get SUM/ANY_VALUE,
    # but since we don't know all columns at SQL generation time for Parquet,
    # we use COLUMNS() with EXCLUDE for DuckDB.
    # Simpler approach: explicit SELECT with known columns from meta.

    if not column_meta:
        # Without meta, fall back to simpler approach
        group_refs = ", ".join(f'"{c}"' for c in group_cols)
        return (
            f"_tg AS (\n"
            f"    SELECT date_trunc('{time_grain}', {col}) AS {col}, "
            f"{', '.join('\"' + c + '\"' for c in group_cols if c != time_col)}"
            f"{', ' if len(group_cols) > 1 else ''}"
            f"{'*' if len(group_cols) <= 1 else ''}"
            f"\n    FROM {prev}\n"
            f"    GROUP BY ALL\n"
            f"    ORDER BY 1\n"
            f")"
        )

    # Build explicit aggregation per column
    select_parts = [f"date_trunc('{time_grain}', {col}) AS {col}"]
    for c in group_cols:
        if c != time_col:
            select_parts.append(f'"{c}"')

    group_set = set(group_cols)
    for cname, ctype in column_meta.items():
        if cname in group_set:
            continue
        qname = f'"{cname}"'
        if ctype == "numeric":
            select_parts.append(f"SUM({qname}) AS {qname}")
        else:
            select_parts.append(f"ANY_VALUE({qname}) AS {qname}")

    select_str = ",\n           ".join(select_parts)
    group_refs = ", ".join(str(i + 1) for i in range(len(group_cols)))

    return (
        f"_tg AS (\n"
        f"    SELECT {select_str}\n"
        f"    FROM {prev}\n"
        f"    GROUP BY {group_refs}\n"
        f"    ORDER BY 1\n"
        f")"
    )


def _calculated_columns_cte(config: dict, prev: str) -> str | None:
    """Build CTE for calculated columns."""
    calc_cols = config.get("calculated_columns", [])
    if not calc_cols:
        return None

    expressions = []
    for cc in calc_cols:
        name = cc.get("name", "")
        expr = cc.get("expression", "")
        if not name or not expr:
            continue
        if not _SAFE_EXPR.match(expr):
            continue
        expr_lower = expr.lower()
        if any(tok in expr_lower for tok in _BLOCKED_TOKENS):
            continue
        expressions.append(f'({expr}) AS "{name}"')

    if not expressions:
        return None

    extra = ", ".join(expressions)
    return f"_calc AS (\n    SELECT *, {extra}\n    FROM {prev}\n)"


def _metrics_cte(config: dict, prev: str) -> str | None:
    """Build CTE for metrics aggregation."""
    metrics = config.get("metrics", [])
    if not metrics:
        return None

    # Determine group-by columns
    group_cols = []
    x_col = config.get("x_column")
    color_col = config.get("color_column")
    if x_col:
        group_cols.append(x_col)
    if color_col:
        group_cols.append(color_col)

    agg_map = {
        "SUM": "SUM", "AVG": "AVG", "COUNT": "COUNT",
        "MIN": "MIN", "MAX": "MAX", "COUNT_DISTINCT": "COUNT_DISTINCT",
    }

    select_parts = [f'"{c}"' for c in group_cols]
    has_any = False

    for idx, m in enumerate(metrics):
        # Skip custom SQL metrics — handled by _build_custom_sql_query before cache
        if m.get("expressionType") == "custom_sql":
            continue

        col = m.get("column", "")
        agg = m.get("aggregate", "SUM").upper()
        label = m.get("label", f"{agg}({col})")

        if agg == "COUNT" and col == "*":
            select_parts.append(f'COUNT(*) AS "{label}"')
            has_any = True
        elif col:
            if agg == "COUNT_DISTINCT":
                select_parts.append(f'COUNT(DISTINCT "{col}") AS "{label}"')
            elif agg in agg_map:
                select_parts.append(f'{agg}("{col}") AS "{label}"')
            else:
                select_parts.append(f'SUM("{col}") AS "{label}"')
            has_any = True

    if not has_any:
        return None

    select_str = ", ".join(select_parts)

    if group_cols:
        group_str = ", ".join(f'"{c}"' for c in group_cols)
        return (
            f"_met AS (\n"
            f"    SELECT {select_str}\n"
            f"    FROM {prev}\n"
            f"    GROUP BY {group_str}\n"
            f"    ORDER BY {group_str}\n"
            f")"
        )
    else:
        return (
            f"_met AS (\n"
            f"    SELECT {select_str}\n"
            f"    FROM {prev}\n"
            f")"
        )


def _row_limit_cte(config: dict, prev: str) -> str | None:
    """Build CTE for row limit."""
    row_limit = config.get("row_limit")
    if row_limit and isinstance(row_limit, int) and row_limit > 0:
        return f"_limit AS (\n    SELECT * FROM {prev}\n    LIMIT {row_limit}\n)"
    return None
