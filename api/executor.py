import json
import multiprocessing
import re
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from api.pivot_postprocessing import run_pipeline

EXEC_TIMEOUT = 30

# --- Pivot aggregate expression support ---
# Matches SQL aggregate function calls with simple column arguments:
#   sum(col), count("Column Name"), avg(col_name), etc.
_PIVOT_AGG_CALL_RE = re.compile(
    r'\b(sum|count|avg|mean|min|max|stddev|variance)\s*\(\s*("(?:[^"]+)"|[a-zA-Z_]\w*)\s*\)',
    re.IGNORECASE,
)
_PIVOT_AGG_MAP = {
    "sum": "sum", "count": "count", "avg": "mean", "mean": "mean",
    "min": "min", "max": "max", "stddev": "std", "variance": "var",
}


def _has_pivot_agg(expr: str) -> bool:
    """Check if expression contains SQL aggregate function calls."""
    return bool(_PIVOT_AGG_CALL_RE.search(expr))


def _parse_pivot_agg_expr(expr: str):
    """Parse aggregate function calls from a pivot custom SQL expression.

    Returns (calls, rewritten) where:
      calls = [(pandas_func, source_col, temp_col_name), ...]
      rewritten = expression with agg calls replaced by temp col names (for pd.eval)
    Example: "sum(is_crash)/count(is_crash)"
      → calls=[("sum","is_crash","_ptmp1"), ("count","is_crash","_ptmp2")]
      → rewritten="_ptmp1/_ptmp2"
    """
    calls = []
    seen = {}  # (func, col) → temp_name
    counter = [0]

    def replacer(match):
        func = match.group(1).lower()
        col = match.group(2).strip().strip('"')
        key = (func, col)
        if key not in seen:
            pd_func = _PIVOT_AGG_MAP.get(func, func)
            counter[0] += 1
            temp_name = f"_ptmp{counter[0]}"
            seen[key] = temp_name
            calls.append((pd_func, col, temp_name))
        return seen[key]

    rewritten = _PIVOT_AGG_CALL_RE.sub(replacer, expr)
    return calls, rewritten

# Module-level constant for code sandbox security check
_DANGEROUS_PATTERNS = (
    "__subclasses__", "__bases__", "__mro__", "__globals__",
    "__code__", "__builtins__", "__class__", "__import__",
)

# Patterns that indicate file I/O or system access attempts
_DANGEROUS_CALL_PATTERNS = (
    "read_csv", "read_excel", "read_html", "read_json", "read_sql",
    "read_parquet", "read_fwf", "read_clipboard",
    "to_csv", "to_excel", "to_parquet",
    "subprocess", "os.", "sys.", "importlib",
    "read_file", "write_file",
)

# Explicit whitelist of allowed builtins (no exec, eval, open, getattr, etc.)
_ALLOWED_BUILTINS = {
    'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'filter',
    'float', 'frozenset', 'int', 'isinstance', 'issubclass', 'len', 'list',
    'map', 'max', 'min', 'next', 'print', 'range', 'reversed',
    'round', 'set', 'slice', 'sorted', 'str', 'sum', 'tuple',
    'zip', 'True', 'False', 'None', 'complex', 'bytes', 'bytearray',
    'memoryview', 'property', 'staticmethod', 'classmethod', 'super',
    'object', 'repr', 'hash', 'id', 'callable', 'format', 'iter',
    'ord', 'chr', 'hex', 'oct', 'bin', 'pow', 'divmod',
    'ValueError', 'TypeError', 'KeyError', 'IndexError', 'StopIteration',
    'RuntimeError', 'AttributeError', 'ZeroDivisionError', 'Exception',
    'NotImplementedError', 'OverflowError', 'ArithmeticError',
}


def _safe_rows(df: pd.DataFrame) -> list[list]:
    """Convert DataFrame to JSON-serializable list of lists.
    Uses numpy .tolist() for fast C-level type conversion,
    then only scans object columns for remaining non-standard types."""
    rows = df.values.tolist()
    for col_idx in range(len(df.columns)):
        if df.iloc[:, col_idx].dtype == object:
            for row in rows:
                v = row[col_idx]
                if v is not None and not isinstance(v, (str, bool, int, float)):
                    row[col_idx] = str(v)
    return rows

# Built-in color palettes
PALETTES = {
    "default": px.colors.qualitative.Plotly,
    "pastel": px.colors.qualitative.Pastel,
    "vivid": px.colors.qualitative.Vivid,
    "bold": px.colors.qualitative.Bold,
    "dark": px.colors.qualitative.Dark24,
    "earth": px.colors.qualitative.Set2,
}

# Number format mapping for Y axis
NUMBER_FORMATS = {
    "percent": ".1%",
    "currency": "$,.0f",
    "compact": "~s",
}


def apply_transforms(df: pd.DataFrame, transforms: list[dict]) -> pd.DataFrame:
    """Apply a pipeline of data transforms to the DataFrame."""
    from api.stats import moving_average, exponential_moving_average, percent_change, cumulative_sum, z_score

    for t in transforms:
        ttype = t.get("type")
        col = t.get("column", "")
        output_col = t.get("output_column", f"{col}_{ttype}")

        if col not in df.columns:
            continue

        if ttype == "moving_average":
            window = t.get("window", 7)
            df[output_col] = moving_average(df[col], window)
        elif ttype == "ema":
            span = t.get("span", 7)
            df[output_col] = exponential_moving_average(df[col], span)
        elif ttype == "pct_change":
            df[output_col] = percent_change(df[col])
        elif ttype == "cumsum":
            df[output_col] = cumulative_sum(df[col])
        elif ttype == "z_score":
            df[output_col] = z_score(df[col])
        elif ttype == "yoy":
            periods = t.get("periods", 12)
            df[output_col] = df[col].pct_change(periods=periods) * 100
        elif ttype == "pct_of_total":
            total = df[col].sum()
            df[output_col] = (df[col] / total * 100) if total != 0 else 0
        elif ttype == "rank":
            ascending = t.get("ascending", False)
            df[output_col] = df[col].rank(ascending=ascending)
        elif ttype == "diff":
            periods = t.get("periods", 1)
            df[output_col] = df[col].diff(periods=periods)

    return df


def build_visual_chart(chart_type: str, config: dict, df: pd.DataFrame) -> dict | None:
    """Build Plotly figure from visual config. Returns figure dict or None for table type."""
    from api.renderers import get_renderer

    if chart_type == "table" or df.empty:
        return None

    # Apply data transforms before building chart
    transforms = config.get("transforms", [])
    if transforms:
        df = apply_transforms(df.copy(), transforms)

    # Registry lookup (handles aliases like bar_h, donut)
    renderer = get_renderer(chart_type)
    if renderer is None:
        return None

    # Store original type for alias handling, then pre_transform
    config = {**config, "_original_type": chart_type}
    config = renderer.pre_transform(config)

    # --- Common pre-processing ---
    x_col = config.get("x_column", "")
    y_cols = config.get("y_columns", [])
    color_col = config.get("color_column") or None
    show_legend = config.get("show_legend", True)
    x_label = config.get("x_axis_label", "")
    y_label = config.get("y_axis_label", "")
    orientation = config.get("orientation", "vertical")
    color_palette = config.get("color_palette", "default")
    number_format = config.get("number_format", "")
    sort_order = config.get("sort_order", "none")

    # Backward compat: old "stacked" boolean → new "stack_mode"
    stack_mode = config.get("stack_mode", "none")
    if stack_mode == "none" and config.get("stacked", False):
        config = {**config, "stack_mode": "stacked"}

    # Validate required columns using capabilities
    caps = renderer.capabilities
    if caps.needs_x and caps.needs_y:
        if not x_col or not y_cols:
            return None
    elif caps.needs_x and not caps.needs_y:
        # histogram: only needs x
        if not x_col:
            return None
    elif not caps.needs_x and caps.needs_y:
        # kpi: only needs y
        if not y_cols:
            return None

    # Sort data if requested
    if sort_order in ("asc", "desc") and y_cols and y_cols[0] in df.columns:
        df = df.sort_values(by=y_cols[0], ascending=(sort_order == "asc"))

    # Melt dataframe for multi-series if needed
    if len(y_cols) > 1 and x_col:
        df_melted = df.melt(id_vars=[x_col], value_vars=y_cols, var_name="series", value_name="value")
        color = "series"
        y = "value"
    else:
        df_melted = df
        color = color_col
        y = y_cols[0] if y_cols else None

    # --- Render via registry ---
    fig = renderer.render(df, x_col, y, color, config, df_melted)
    if fig is None:
        return None

    # --- Common post-processing ---
    _apply_overlays(fig, config, chart_type, df, x_col, y_cols)
    _apply_tooltips(fig, config, chart_type, df)
    _apply_reference_lines(fig, config)
    _apply_styling(fig, config, color_palette, number_format, orientation, show_legend,
                   x_label, y_label)

    return fig.to_plotly_json()


def _apply_overlays(fig, config, chart_type, df, x_col, y_cols):
    """Apply statistical overlays (trendline, MA, confidence band, anomalies, forecast)."""
    overlays = config.get("overlays", [])
    if not overlays or chart_type not in ("line", "bar", "area", "scatter", "combo"):
        return
    from api.stats import (
        linear_trendline, polynomial_trendline, moving_average,
        exponential_moving_average, confidence_band, detect_anomalies,
        linear_forecast, holt_winters_forecast,
    )
    x_vals = df[x_col]
    x_numeric = np.arange(len(x_vals))
    y_series = df[y_cols[0]] if y_cols else pd.Series()

    for overlay in overlays:
        otype = overlay.get("type")
        ocolor = overlay.get("color", "#FF6B6B")

        if otype == "trendline":
            degree = overlay.get("degree", 1)
            if degree == 1:
                y_pred, slope, r2 = linear_trendline(x_numeric, y_series.values)
                name = f"Trend (R\u00b2={r2:.3f})"
            else:
                y_pred = polynomial_trendline(x_numeric, y_series.values, degree)
                name = f"Poly-{degree} trend"
            fig.add_trace(go.Scatter(
                x=x_vals, y=y_pred, mode="lines",
                line=dict(color=ocolor, dash="dash", width=2),
                name=name, showlegend=True,
            ))

        elif otype == "moving_average":
            window = overlay.get("window", 7)
            ema = overlay.get("ema", False)
            if ema:
                ma = exponential_moving_average(y_series, span=window)
                name = f"EMA-{window}"
            else:
                ma = moving_average(y_series, window=window)
                name = f"MA-{window}"
            fig.add_trace(go.Scatter(
                x=x_vals, y=ma, mode="lines",
                line=dict(color=ocolor, width=2),
                name=name, showlegend=True,
            ))

        elif otype == "confidence_band":
            window = overlay.get("window", 7)
            n_std = overlay.get("n_std", 2.0)
            lower, upper = confidence_band(y_series, window, n_std)
            fig.add_trace(go.Scatter(
                x=x_vals, y=upper, mode="lines",
                line=dict(width=0), showlegend=False,
            ))
            hex_color = ocolor.lstrip("#")
            r_c, g_c, b_c = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            fig.add_trace(go.Scatter(
                x=x_vals, y=lower, mode="lines",
                line=dict(width=0), showlegend=False,
                fill="tonexty", fillcolor=f"rgba({r_c},{g_c},{b_c},0.15)",
            ))

        elif otype == "anomalies":
            window = overlay.get("window", 14)
            threshold = overlay.get("threshold", 2.5)
            mask = detect_anomalies(y_series, window, threshold)
            anomaly_x = x_vals[mask]
            anomaly_y = y_series[mask]
            fig.add_trace(go.Scatter(
                x=anomaly_x, y=anomaly_y, mode="markers",
                marker=dict(color=ocolor, size=10, symbol="x"),
                name="Anomaly", showlegend=True,
            ))

        elif otype == "forecast":
            periods = overlay.get("periods", 7)
            method = overlay.get("method", "linear")
            if method == "holt":
                fc = holt_winters_forecast(y_series, periods=periods)
            else:
                fc = linear_forecast(y_series, periods=periods)
            fc_x = list(range(len(x_vals), len(x_vals) + periods))
            fig.add_trace(go.Scatter(
                x=fc_x, y=fc, mode="lines",
                line=dict(color=ocolor, dash="dot", width=2),
                name=f"Forecast ({method})", showlegend=True,
            ))


def _apply_tooltips(fig, config, chart_type, df):
    """Apply custom tooltip configuration."""
    tooltip_cfg = config.get("tooltip", {})
    tooltip_cols = tooltip_cfg.get("columns", [])
    if tooltip_cols and chart_type not in ("pie", "kpi", "heatmap", "treemap"):
        valid_cols = [c for c in tooltip_cols if c in df.columns]
        if valid_cols:
            parts = []
            for i, col in enumerate(valid_cols):
                parts.append(f"<b>{col}</b>: %{{customdata[{i}]}}")
            template = "<br>".join(parts) + "<extra></extra>"
            customdata = df[valid_cols].values.tolist()
            fig.update_traces(
                customdata=customdata,
                hovertemplate=template,
            )
    elif tooltip_cfg.get("hide"):
        fig.update_traces(hoverinfo="skip", hovertemplate=None)


def _apply_reference_lines(fig, config):
    """Apply reference lines (horizontal and vertical)."""
    ref_lines = config.get("reference_lines", [])
    for rl in ref_lines:
        rl_type = rl.get("type", "horizontal")
        rl_value = rl.get("value")
        rl_label = rl.get("label", "")
        rl_color = rl.get("color", "#EF553B")
        if rl_value is None:
            continue
        annotation_args = dict(
            line_color=rl_color,
            line_dash="dash",
            annotation_text=rl_label,
            annotation_position="top right" if rl_type == "horizontal" else "top",
        )
        if rl_type == "horizontal":
            try:
                fig.add_hline(y=float(rl_value), **annotation_args)
            except (ValueError, TypeError):
                pass
        else:
            fig.add_vline(x=rl_value, **annotation_args)


def _apply_styling(fig, config, color_palette, number_format, orientation,
                   show_legend, x_label, y_label):
    """Apply color palette, number format, color map, legend, and layout."""
    # Apply color palette
    palette_colors = PALETTES.get(color_palette, PALETTES["default"])
    fig.update_layout(colorway=palette_colors)

    # Apply number format
    tick_format = NUMBER_FORMATS.get(number_format)
    if tick_format:
        if orientation == "horizontal":
            fig.update_layout(xaxis_tickformat=tick_format)
        else:
            fig.update_layout(yaxis_tickformat=tick_format)

    # Per-value color mapping
    color_map = config.get("color_map", {})
    if color_map:
        for trace in fig.data:
            if hasattr(trace, 'name') and trace.name in color_map:
                try:
                    trace.update(marker_color=color_map[trace.name])
                except Exception:
                    pass

    # Legend position
    legend_position = config.get("legend_position", "auto")
    legend_map = {
        "top": dict(orientation="h", yanchor="bottom", y=1.02, xanchor="center", x=0.5),
        "bottom": dict(orientation="h", yanchor="top", y=-0.15, xanchor="center", x=0.5),
        "left": dict(yanchor="middle", y=0.5, xanchor="right", x=-0.05),
        "right": dict(yanchor="middle", y=0.5, xanchor="left", x=1.05),
    }
    legend_kwargs = legend_map.get(legend_position, {})

    fig.update_layout(
        showlegend=show_legend,
        legend=legend_kwargs if legend_kwargs else None,
        xaxis_title=x_label or None,
        yaxis_title=y_label or None,
        margin=dict(l=40, r=20, t=30, b=40),
        template="plotly_white",
    )


def _eval_subtotal_formula(formula: str, group_df: pd.DataFrame) -> float:
    """Evaluate a subtotal formula like 'sum(clicks) / sum(impressions)'.

    Allowed functions: sum, avg, count, min, max — operate on group_df columns.
    The eval() call is safe: AST is validated to contain ONLY numeric constants
    and arithmetic operators — no names, calls, attribute access, or imports.
    All function calls like sum(col) are replaced with numeric results by regex.
    """
    import re
    import ast

    AGG_FUNCS = {
        "sum": lambda col: float(group_df[col].sum()),
        "avg": lambda col: float(group_df[col].mean()),
        "count": lambda col: float(group_df[col].count()),
        "min": lambda col: float(group_df[col].min()),
        "max": lambda col: float(group_df[col].max()),
    }

    def replacer(match):
        func_name = match.group(1)
        col_name = match.group(2).strip().strip("'\"")
        if func_name not in AGG_FUNCS:
            raise ValueError(f"Unknown function: {func_name}")
        if col_name not in group_df.columns:
            raise ValueError(f"Unknown column: {col_name}")
        return str(AGG_FUNCS[func_name](col_name))

    expr = re.sub(r'(\w+)\(([^)]+)\)', replacer, formula)

    # Validate AST: only allow numeric constants and arithmetic operators
    tree = ast.parse(expr, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp,
                                  ast.Constant, ast.Add, ast.Sub, ast.Mult,
                                  ast.Div, ast.Pow, ast.USub, ast.UAdd)):
            raise ValueError(f"Disallowed AST node: {type(node).__name__}")

    try:
        code = compile(tree, "<subtotal>", "eval")
        # Safe: AST validated above — only numeric literals and arithmetic ops
        return float(eval(code, {"__builtins__": {}}, {}))  # noqa: S307
    except (ZeroDivisionError, ValueError, TypeError):
        return float("nan")


def _compute_subtotal_value(metric: str, group_df: pd.DataFrame, subtotal_funcs: dict) -> float:
    """Compute a single subtotal value for a metric using the configured function or formula."""
    import re as _re
    # Look up func: try exact metric name first, then strip __N suffix for duplicates
    func = subtotal_funcs.get(metric)
    base_metric = metric
    if func is None:
        m = _re.match(r'^(.+)__\d+$', metric)
        if m:
            base_metric = m.group(1)
            func = subtotal_funcs.get(base_metric, "sum")
        else:
            func = "sum"
    # For aggregate expression columns (temp cols like _ptmp*), can't compute subtotal
    if metric.startswith("_ptmp"):
        return 0.0
    SIMPLE_FUNCS = {
        "sum": lambda s: float(s.sum()),
        "avg": lambda s: float(s.mean()),
        "count": lambda s: float(s.count()),
        "min": lambda s: float(s.min()),
        "max": lambda s: float(s.max()),
    }
    if func in SIMPLE_FUNCS:
        # For duplicate columns (col__N), the source data column is the base name
        col_name = metric if metric in group_df.columns else base_metric
        if col_name in group_df.columns:
            return SIMPLE_FUNCS[func](group_df[col_name])
        return 0.0
    # Formula string (contains parentheses)
    if "(" in func:
        try:
            return _eval_subtotal_formula(func, group_df)
        except (ValueError, SyntaxError):
            return float("nan")
    # Unknown func name — fallback to sum
    col_name = metric if metric in group_df.columns else base_metric
    if col_name in group_df.columns:
        return float(group_df[col_name].sum())
    return 0.0


def _detect_pivot_col_date_grain(values) -> str | None:
    """Auto-detect time grain from pivot column date values."""
    dates = []
    for v in set(str(x) for x in values):
        if v in ("Total", "Grand Total", ""):
            continue
        try:
            dt = pd.Timestamp(v)
            if pd.notna(dt):
                dates.append(dt)
        except Exception:
            return None
    if len(dates) < 2:
        return None
    # All 1st of month → month, quarter, or year
    if all(d.day == 1 for d in dates):
        months = {d.month for d in dates}
        if months <= {1}:
            return "year"
        if months <= {1, 4, 7, 10}:
            return "quarter"
        return "month"
    # All same day-of-week → week
    if len({d.dayofweek for d in dates}) == 1:
        return "week"
    return None


def _format_pivot_col_date(val, time_grain: str) -> str:
    """Format a date value for pivot column headers based on time grain."""
    import datetime
    if isinstance(val, str) and val in ("Total", "Grand Total"):
        return val
    try:
        if isinstance(val, (pd.Timestamp, datetime.datetime, datetime.date)):
            dt = pd.Timestamp(val)
        else:
            dt = pd.Timestamp(str(val))
        if pd.isna(dt):
            return str(val)
    except Exception:
        return str(val)
    if time_grain == "week":
        end = dt + pd.Timedelta(days=6)
        return f"{dt.strftime('%d.%m')}–{end.strftime('%d.%m.%Y')}"
    elif time_grain == "month":
        return dt.strftime("%m.%Y")
    elif time_grain == "quarter":
        q = (dt.month - 1) // 3 + 1
        return f"Q{q} {dt.year}"
    elif time_grain == "year":
        return str(dt.year)
    elif time_grain == "day":
        return dt.strftime("%d.%m.%Y")
    else:
        return str(val)


def build_pivot_table(config: dict, df: pd.DataFrame) -> dict:
    """Build pivot table from config. Returns dict with columns, rows, header_levels, row_index_count, formatting."""
    pivot_rows = config.get("pivot_rows", [])
    pivot_cols = config.get("pivot_columns", [])
    pivot_vals = config.get("pivot_values", [])
    value_labels = config.get("pivot_value_labels", {})  # {"original": "display"}
    values_visible = config.get("pivot_values_visible")   # list of visible vals or None=all

    # Filter to visible values only
    if values_visible and isinstance(values_visible, list):
        pivot_vals = [v for v in pivot_vals if v in values_visible]

    if not pivot_rows or not pivot_vals:
        return {"columns": [], "rows": [], "row_count": 0, "formatting": [],
                "pivot_header_levels": [], "pivot_row_index_count": 0}

    # Per-column aggfunc: {"revenue": "sum", "rating": "avg"}
    aggfuncs = config.get("pivot_aggfuncs", {})
    # Defensive: ensure all aggfunc values are strings (corrupted configs may have dicts)
    if aggfuncs and isinstance(aggfuncs, dict):
        aggfuncs = {k: v if isinstance(v, str) else "sum" for k, v in aggfuncs.items()}
    aggfunc_map = {
        "sum": "sum", "avg": "mean", "count": "count", "min": "min", "max": "max",
        "median": "median", "count_distinct": "nunique", "std": "std", "var": "var",
        "first": "first", "last": "last",
    }

    regular_vals = list(pivot_vals)

    if aggfuncs:
        agg = {col: aggfunc_map.get(aggfuncs.get(col, "sum"), "sum") for col in regular_vals}
    else:
        agg = "sum"

    # Handle aggregate custom SQL expressions (e.g., "sum(col_a)/count(col_b)")
    # These can't run in SQL (no GROUP BY), so we decompose them into individual
    # aggregations, pivot those, then compute the formula post-pivot.
    pivot_custom_sql = config.get("pivot_custom_sql") or {}
    agg_formulas = {}  # {val_name: (rewritten_formula, [temp_col_names])}
    all_temp_cols = set()

    for val_name in list(regular_vals):
        expr = pivot_custom_sql.get(val_name, "")
        if not expr or not _has_pivot_agg(expr):
            continue

        calls, rewritten = _parse_pivot_agg_expr(expr)
        # Verify all source columns exist in df
        missing = [src for _, src, _ in calls if src not in df.columns]
        if missing:
            continue  # skip — source column(s) not found

        if not all_temp_cols:
            df = df.copy()
        for pd_func, src_col, temp_name in calls:
            if temp_name not in all_temp_cols:
                df[temp_name] = df[src_col]
                all_temp_cols.add(temp_name)
                regular_vals.append(temp_name)
                if isinstance(agg, dict):
                    agg[temp_name] = pd_func

        # Remove the formula value from pivot (it will be computed post-pivot)
        regular_vals.remove(val_name)
        if isinstance(agg, dict) and val_name in agg:
            del agg[val_name]
        agg_formulas[val_name] = (rewritten, [t for _, _, t in calls])

    # If all regular_vals were replaced by formulas, we still need at least the temp cols
    if not regular_vals and not all_temp_cols:
        return {"columns": [], "rows": [], "row_count": 0, "formatting": [],
                "pivot_header_levels": [], "pivot_row_index_count": 0}
    if not regular_vals:
        regular_vals = list(all_temp_cols)

    # Limit pivot columns to top N by sum (rest → "Other")
    pivot_col_limit = config.get("pivot_column_limit", 500)
    if pivot_cols and pivot_col_limit:
        col_field = pivot_cols[0] if len(pivot_cols) == 1 else None
        if col_field and col_field in df.columns and df[col_field].nunique() > pivot_col_limit:
            first_val = regular_vals[0] if regular_vals else pivot_vals[0]
            top_values = df.groupby(col_field)[first_val].sum().nlargest(pivot_col_limit).index
            df = df.copy()
            df.loc[~df[col_field].isin(top_values), col_field] = "Other"

    pivot = pd.pivot_table(
        df,
        index=pivot_rows,
        columns=pivot_cols if pivot_cols else None,
        values=regular_vals,
        aggfunc=agg,
        margins=False,
        fill_value=0,
    )

    # Evaluate aggregate formula expressions post-pivot using pandas arithmetic
    # (pd.eval is safe here — only operates on numeric Series with temp column names,
    # no arbitrary code execution; expressions are pre-validated by sql_validator)
    if agg_formulas:
        for val_name, (formula, temp_names) in agg_formulas.items():
            try:
                if isinstance(pivot.columns, pd.MultiIndex):
                    # MultiIndex: evaluate formula per second-level column combination
                    ref_temp = temp_names[0]
                    ref_cols = [c for c in pivot.columns if c[0] == ref_temp]
                    for rc in ref_cols:
                        second = rc[1:]
                        ns = {}
                        for tn in temp_names:
                            key = (tn,) + second
                            if key in pivot.columns:
                                ns[tn] = pivot[key]
                        if ns:
                            pivot[(val_name,) + second] = pd.eval(formula, local_dict=ns)
                else:
                    ns = {tn: pivot[tn] for tn in temp_names if tn in pivot.columns}
                    if ns:
                        pivot[val_name] = pd.eval(formula, local_dict=ns)
            except Exception:
                if not isinstance(pivot.columns, pd.MultiIndex):
                    pivot[val_name] = float("nan")

        # Drop temporary columns
        if isinstance(pivot.columns, pd.MultiIndex):
            drop_cols = [c for c in pivot.columns if c[0] in all_temp_cols]
        else:
            drop_cols = [c for c in pivot.columns if c in all_temp_cols]
        if drop_cols:
            pivot = pivot.drop(columns=drop_cols)

    # Post-pivot row/column filtering (whitelist)
    row_filter = config.get("pivot_row_filter")
    if row_filter:
        if isinstance(pivot.index, pd.MultiIndex):
            mask = pivot.index.get_level_values(0).isin(row_filter)
        else:
            mask = pivot.index.isin(row_filter)
        pivot = pivot[mask]

    col_filter = config.get("pivot_col_filter")
    if col_filter:
        if isinstance(pivot.columns, pd.MultiIndex):
            mask = pivot.columns.get_level_values(0).isin(col_filter)
        else:
            mask = pivot.columns.isin(col_filter)
        pivot = pivot.loc[:, mask]

    # Post-processing pipeline (cumulative, rolling, time_compare, rank)
    pivot, cond_format_meta = run_pipeline(pivot, config)

    # Compute margins manually (much faster than margins=True for high-cardinality columns)
    subtotal_funcs = config.get("pivot_subtotal_funcs", {})
    subtotal_formulas = config.get("pivot_subtotal_formulas", {})
    # When func is "formula", replace with actual formula string
    for metric, formula in subtotal_formulas.items():
        if subtotal_funcs.get(metric) == "formula" and formula:
            subtotal_funcs[metric] = formula
    row_subtotals_cfg = config.get("row_subtotals", "none")
    col_subtotals_cfg = config.get("col_subtotals", "none")
    if row_subtotals_cfg != "none" or col_subtotals_cfg != "none":
        if col_subtotals_cfg != "none":
            # Column subtotal: sum across columns for each row (standard behavior)
            total_col = pivot.sum(axis=1)
            if isinstance(pivot.columns, pd.MultiIndex):
                n_levels = pivot.columns.nlevels
                total_label = tuple(["Total"] * n_levels)
                pivot[total_label] = total_col
            else:
                pivot["Total"] = total_col
        if row_subtotals_cfg != "none":
            # Row subtotal: per-metric aggregation using configured functions
            if subtotal_funcs:
                total_values = {}
                for col in pivot.columns:
                    # Determine the metric name from column
                    if isinstance(col, tuple):
                        metric_name = str(col[0])
                    else:
                        metric_name = str(col)
                    total_values[col] = _compute_subtotal_value(metric_name, df, subtotal_funcs)
                total_row = pd.Series(total_values, index=pivot.columns)
            else:
                total_row = pivot.sum(axis=0)
            if isinstance(pivot.index, pd.MultiIndex):
                n_levels = pivot.index.nlevels
                total_idx = tuple(["Total"] * n_levels)
                pivot.loc[total_idx] = total_row
            else:
                pivot.loc["Total"] = total_row

    # Grand Total row (always appended as last row when enabled)
    if config.get("show_grand_total"):
        if subtotal_funcs:
            grand_values = {}
            for col in pivot.columns:
                if isinstance(col, tuple):
                    metric_name = str(col[0])
                else:
                    metric_name = str(col)
                grand_values[col] = _compute_subtotal_value(metric_name, df, subtotal_funcs)
            grand_row = pd.Series(grand_values, index=pivot.columns)
        else:
            grand_row = pivot.sum(axis=0)
        if isinstance(pivot.index, pd.MultiIndex):
            n_levels = pivot.index.nlevels
            grand_idx = tuple(["Grand Total"] * n_levels)
            pivot.loc[grand_idx] = grand_row
        else:
            pivot.loc["Grand Total"] = grand_row

    # Percentage mode — applied AFTER subtotals
    # Supports both global (pivot_pct_mode) and per-column (pivot_pct_modes) overrides.
    # Priority: pivot_pct_modes[col] > pivot_pct_mode (global default)
    # pivot_pct_modes values: "row"/"column"/"total" = override, None = force absolute
    # Missing key = inherit global default
    pct_mode_global = config.get("pivot_pct_mode")
    pct_modes_per_col = config.get("pivot_pct_modes") or {}

    pivot_value_cols = config.get("pivot_values", [])

    def _get_effective_pct_mode(val_name: str) -> str | None:
        if val_name in pct_modes_per_col:
            return pct_modes_per_col[val_name]  # explicit override (str or None)
        return pct_mode_global  # global default (str or None)

    # Group numeric cols by their effective pct_mode
    mode_to_cols: dict[str | None, list] = {}
    numeric_cols = pivot.select_dtypes(include="number").columns
    for nc in numeric_cols:
        if isinstance(pivot.columns, pd.MultiIndex):
            val_name = str(nc[0]) if len(nc) > 0 else str(nc)
        else:
            val_name = str(nc)
        matched_val = None
        # Match longest prefix first to avoid "revenue" matching before "revenue__2"
        for pv in sorted(pivot_value_cols, key=len, reverse=True):
            if val_name == pv or val_name.startswith(pv):
                matched_val = pv
                break
        mode = _get_effective_pct_mode(matched_val) if matched_val else pct_mode_global
        mode_to_cols.setdefault(mode, []).append(nc)

    # Apply pct_mode per group
    special_labels = {"Total", "Grand Total"}
    if isinstance(pivot.index, pd.MultiIndex):
        data_row_mask = ~pivot.index.get_level_values(0).astype(str).isin(special_labels)
    else:
        data_row_mask = ~pivot.index.astype(str).isin(special_labels)

    for mode, cols in mode_to_cols.items():
        if not mode:
            continue  # absolute — no transformation
        col_idx = pd.Index(cols)
        if mode == "column":
            col_sums = pivot.loc[data_row_mask, col_idx].sum(axis=0)
            pivot[col_idx] = pivot[col_idx].div(col_sums.replace(0, float("nan")), axis=1) * 100
        elif mode == "row":
            if isinstance(pivot.columns, pd.MultiIndex):
                data_col_mask = ~pivot.columns.get_level_values(-1).astype(str).isin(special_labels)
                row_calc_cols = col_idx[col_idx.isin(pivot.columns[data_col_mask])]
            else:
                row_calc_cols = col_idx[~col_idx.astype(str).isin(special_labels)]
            row_sums = pivot[row_calc_cols].sum(axis=1)
            pivot[col_idx] = pivot[col_idx].div(row_sums.replace(0, float("nan")), axis=0) * 100
        elif mode == "total":
            grand_total = pivot.loc[data_row_mask, col_idx].sum().sum()
            if grand_total != 0:
                pivot[col_idx] = pivot[col_idx] / grand_total * 100
        pivot[col_idx] = pivot[col_idx].fillna(0)

    # --- Sort columns ---
    sort_cols = config.get("sort_columns", "none")
    if sort_cols != "none":
        # Exclude "Total" columns from sorting, then re-append at end
        if isinstance(pivot.columns, pd.MultiIndex):
            total_mask = pivot.columns.get_level_values(-1).astype(str) == "Total"
            if total_mask.any():
                total_col = pivot.loc[:, total_mask]
                pivot_no_total = pivot.loc[:, ~total_mask]
            else:
                total_col = None
                pivot_no_total = pivot
        elif "Total" in pivot.columns:
            total_col = pivot[["Total"]]
            pivot_no_total = pivot.drop("Total", axis=1)
        else:
            total_col = None
            pivot_no_total = pivot

        if sort_cols == "key_asc":
            pivot_no_total = pivot_no_total.sort_index(axis=1)
        elif sort_cols == "key_desc":
            pivot_no_total = pivot_no_total.sort_index(axis=1, ascending=False)
        elif sort_cols == "value_asc":
            col_sums = pivot_no_total.sum()
            pivot_no_total = pivot_no_total[col_sums.sort_values().index]
        elif sort_cols == "value_desc":
            col_sums = pivot_no_total.sum()
            pivot_no_total = pivot_no_total[col_sums.sort_values(ascending=False).index]

        if total_col is not None:
            pivot = pd.concat([pivot_no_total, total_col], axis=1)
        else:
            pivot = pivot_no_total

    # --- Sort rows ---
    sort_rows_val = config.get("sort_rows", "none")
    if sort_rows_val != "none":
        # Exclude "Total" and "Grand Total" rows from sorting, then re-append
        special_labels = {"Total", "Grand Total"}
        if isinstance(pivot.index, pd.MultiIndex):
            special_mask = pivot.index.get_level_values(0).astype(str).isin(special_labels)
            if special_mask.any():
                special_rows = pivot.loc[special_mask]
                pivot_no_total = pivot.loc[~special_mask]
            else:
                special_rows = None
                pivot_no_total = pivot
        else:
            present = [l for l in special_labels if l in pivot.index]
            if present:
                special_rows = pivot.loc[present]
                pivot_no_total = pivot.drop(present, axis=0)
            else:
                special_rows = None
                pivot_no_total = pivot

        if sort_rows_val == "key_asc":
            pivot_no_total = pivot_no_total.sort_index(axis=0)
        elif sort_rows_val == "key_desc":
            pivot_no_total = pivot_no_total.sort_index(axis=0, ascending=False)
        elif sort_rows_val == "value_asc":
            row_sums = pivot_no_total.sum(axis=1)
            pivot_no_total = pivot_no_total.loc[row_sums.sort_values().index]
        elif sort_rows_val == "value_desc":
            row_sums = pivot_no_total.sum(axis=1)
            pivot_no_total = pivot_no_total.loc[row_sums.sort_values(ascending=False).index]

        if special_rows is not None:
            pivot = pd.concat([pivot_no_total, special_rows])
        else:
            pivot = pivot_no_total

    # --- Subtotals positioning ---
    row_subtotals = config.get("row_subtotals", "none")
    col_subtotals = config.get("col_subtotals", "none")

    # Row subtotals (Total row): none=remove, top=move to top, bottom=keep default
    if isinstance(pivot.index, pd.MultiIndex):
        total_row_mask = pivot.index.get_level_values(0).astype(str) == "Total"
        has_total_row = total_row_mask.any()
    else:
        total_row_mask = None
        has_total_row = "Total" in pivot.index

    if row_subtotals == "none":
        if has_total_row:
            if total_row_mask is not None:
                pivot = pivot.loc[~total_row_mask]
            else:
                pivot = pivot.drop("Total", axis=0)
    elif row_subtotals == "top":
        if has_total_row:
            if total_row_mask is not None:
                total_row = pivot.loc[total_row_mask]
                pivot = pd.concat([total_row, pivot.loc[~total_row_mask]])
            else:
                total_row = pivot.loc[["Total"]]
                pivot = pd.concat([total_row, pivot.drop("Total", axis=0)])

    # Column subtotals (Total column): none=remove, left=move to left, right=keep default
    if col_subtotals == "none":
        if not isinstance(pivot.columns, pd.MultiIndex):
            if "Total" in pivot.columns:
                pivot = pivot.drop("Total", axis=1)
        else:
            # For MultiIndex, drop columns containing "Total"
            total_mask = pivot.columns.get_level_values(-1).astype(str) == "Total"
            if total_mask.any():
                pivot = pivot.loc[:, ~total_mask]
    elif col_subtotals == "left":
        if not isinstance(pivot.columns, pd.MultiIndex):
            if "Total" in pivot.columns:
                total_col = pivot[["Total"]]
                other_cols = pivot.drop("Total", axis=1)
                pivot = pd.concat([total_col, other_cols], axis=1)
        else:
            # For MultiIndex, move Total columns to front
            total_mask = pivot.columns.get_level_values(-1).astype(str) == "Total"
            if total_mask.any():
                total_cols = pivot.loc[:, total_mask]
                other_cols = pivot.loc[:, ~total_mask]
                pivot = pd.concat([total_cols, other_cols], axis=1)

    row_index_count = len(pivot_rows)

    # Rename value metrics in column headers
    if value_labels:
        if isinstance(pivot.columns, pd.MultiIndex):
            # Rename the values level (level 0 when values are first)
            new_levels = []
            for level_i in range(pivot.columns.nlevels):
                codes = pivot.columns.codes[level_i]
                level_values = pivot.columns.levels[level_i]
                renamed = [value_labels.get(str(v), str(v)) for v in level_values]
                new_levels.append(renamed)
            pivot.columns = pd.MultiIndex.from_arrays(
                [[new_levels[li][c] for c in pivot.columns.codes[li]] for li in range(pivot.columns.nlevels)],
                names=pivot.columns.names,
            )
        else:
            pivot.columns = [value_labels.get(str(c), str(c)) for c in pivot.columns]

    # Format dates in pivot column headers based on time_grain or auto-detection
    _time_col = config.get("time_column")
    _time_grain = config.get("time_grain")
    if _time_grain in ("raw", None, ""):
        _time_grain = None
    # Auto-detect date grain in pivot columns if not explicitly set
    if pivot_cols:
        # In MultiIndex, values occupy the first levels, pivot_cols occupy the last levels
        _n_levels = pivot.columns.nlevels if isinstance(pivot.columns, pd.MultiIndex) else 1
        _level_offset = _n_levels - len(pivot_cols)  # pivot_cols[i] → level (_level_offset + i)
        for _pi, _pc in enumerate(pivot_cols):
            _level_idx = _level_offset + _pi
            # Use explicit time_grain if time_column matches this pivot col
            _grain = _time_grain if (_time_col and _pc == _time_col) else None
            if not _grain:
                # Auto-detect from column values in the pivot
                if isinstance(pivot.columns, pd.MultiIndex):
                    _vals = list(pivot.columns.get_level_values(_level_idx))
                else:
                    _vals = list(pivot.columns)
                _grain = _detect_pivot_col_date_grain(_vals)
            if _grain:
                if isinstance(pivot.columns, pd.MultiIndex):
                    _new_arrays = []
                    for _li in range(pivot.columns.nlevels):
                        if _li == _level_idx:
                            _new_arrays.append([
                                _format_pivot_col_date(v, _grain)
                                for v in pivot.columns.get_level_values(_li)
                            ])
                        else:
                            _new_arrays.append(list(pivot.columns.get_level_values(_li)))
                    pivot.columns = pd.MultiIndex.from_arrays(_new_arrays, names=pivot.columns.names)
                else:
                    pivot.columns = [_format_pivot_col_date(v, _grain) for v in pivot.columns]
                break  # Only format one date column

    # Build header levels from MultiIndex columns before flattening
    header_levels: list[list[str]] = []
    if isinstance(pivot.columns, pd.MultiIndex):
        n_levels = pivot.columns.nlevels
        for level_i in range(n_levels):
            level_vals = [str(v) for v in pivot.columns.get_level_values(level_i)]
            header_levels.append([""] * row_index_count + level_vals)
        # Fill row index names into the last level
        for i, name in enumerate(pivot_rows):
            header_levels[-1][i] = str(name)
        # Fill row index names into first level too (for rowspan reference)
        for i, name in enumerate(pivot_rows):
            header_levels[0][i] = str(name)
        # Flatten columns for flat `columns` field
        pivot.columns = [" | ".join(str(c) for c in col).strip(" | ") for col in pivot.columns]
    else:
        # Single-level columns: one header row
        pass

    # Per-metric rounding (replaces old pivot_round)
    value_formats = config.get("pivot_value_formats", {})
    old_round = config.get("pivot_round")  # backward compat

    if value_formats or old_round is not None:
        # Collect all configured decimal values for fallback on Total columns
        all_decimals = [
            fmt.get("decimals") for fmt in value_formats.values()
            if isinstance(fmt, dict) and fmt.get("decimals") is not None
        ]
        for col in pivot.columns:
            # After MultiIndex flattening, columns are "Metric | Value" strings;
            # for single-level columns the column name is the metric itself.
            col_str = str(col)
            metric_name = col_str.split(" | ")[0]
            is_total_col = metric_name in ("Total", "Grand Total") or col_str.endswith("| Total")
            fmt = value_formats.get(metric_name, {})
            decimals = fmt.get("decimals") if fmt else None
            if decimals is None and old_round is not None:
                decimals = old_round
            # For Total columns: use old_round or the most common rounding across metrics
            if decimals is None and is_total_col and all_decimals:
                decimals = all_decimals[0]
            if decimals is not None:
                pivot[col] = pd.to_numeric(pivot[col], errors="coerce").round(int(decimals))

    pivot = pivot.reset_index()
    columns = [str(c) for c in pivot.columns]

    # If no multi-level header was built, create single level from columns
    if not header_levels:
        header_levels = [columns]

    rows = _safe_rows(pivot)

    formatting = config.get("conditional_formatting", [])

    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "formatting": formatting,
        "pivot_header_levels": header_levels,
        "pivot_row_index_count": row_index_count,
        "pivot_cond_format_meta": cond_format_meta,
    }


MAX_PIVOT_DISPLAY_COLUMNS = 500


def _serialize_pivot_from_code(pivot: pd.DataFrame, max_columns: int = MAX_PIVOT_DISPLAY_COLUMNS) -> dict:
    """Serialize a pivot DataFrame from code mode, preserving MultiIndex structure."""
    # Limit columns to prevent browser freeze on wide pivots
    if pivot.shape[1] > max_columns:
        pivot = pivot.iloc[:, :max_columns]
    row_index_count = pivot.index.nlevels if isinstance(pivot.index, pd.MultiIndex) else 1
    header_levels: list[list[str]] = []

    if isinstance(pivot.columns, pd.MultiIndex):
        n_levels = pivot.columns.nlevels
        for level_i in range(n_levels):
            level_vals = [str(v) for v in pivot.columns.get_level_values(level_i)]
            header_levels.append([""] * row_index_count + level_vals)

        # Fill index names into header levels
        index_names = list(pivot.index.names) if isinstance(pivot.index, pd.MultiIndex) else [pivot.index.name]
        for i, name in enumerate(index_names):
            if name:
                header_levels[-1][i] = str(name)
                header_levels[0][i] = str(name)

        pivot = pivot.copy()
        pivot.columns = [" | ".join(str(c) for c in col).strip(" | ") for col in pivot.columns]

    pivot = pivot.reset_index()
    columns = [str(c) for c in pivot.columns]

    if not header_levels:
        header_levels = [columns]

    rows = _safe_rows(pivot)

    return {
        "_table": True,
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "pivot_header_levels": header_levels,
        "pivot_row_index_count": row_index_count,
    }


def _code_runner(code, df_data, result_queue):
    """Target function for subprocess: runs user code in restricted namespace."""
    import sys as _sys
    _sys.setrecursionlimit(200)

    try:
        import pandas as _pd
        import numpy as _np
        import plotly.express as _px
        import plotly.graph_objects as _go
        from plotly.subplots import make_subplots as _ms

        _df = _pd.DataFrame(df_data)

        # Build whitelist builtins
        _all = (
            {k: v for k, v in __builtins__.items()}
            if isinstance(__builtins__, dict)
            else {k: getattr(__builtins__, k) for k in dir(__builtins__)}
        )
        _safe = {k: v for k, v in _all.items() if k in _ALLOWED_BUILTINS}

        _real_import = __import__
        _ok_modules = {
            "pandas", "numpy", "plotly", "plotly.express", "plotly.graph_objects",
            "plotly.subplots", "plotly.figure_factory", "math", "datetime",
            "collections", "itertools", "functools", "statistics", "json", "re",
        }

        def _si(name, *a, **kw):
            if name not in _ok_modules:
                raise ImportError(f"Import of '{name}' is not allowed")
            return _real_import(name, *a, **kw)

        _safe["__import__"] = _si

        _rg = {
            "__builtins__": _safe,
            "df": _df, "pd": _pd, "px": _px, "go": _go, "np": _np,
            "make_subplots": _ms,
        }

        exec(code, _rg)  # noqa: S102 — intentional sandboxed exec

        fig = _rg.get("fig")
        if fig is None:
            dd = _rg.get("df_display")
            if dd is not None and isinstance(dd, _pd.DataFrame):
                result_queue.put({"_table": True, "columns": list(dd.columns),
                                  "rows": dd.values.tolist(), "row_count": len(dd)})
                return
            pv = _rg.get("pivot")
            if pv is not None and isinstance(pv, _pd.DataFrame):
                result_queue.put({"_serialize_pivot": True,
                                  "data": pv.reset_index().to_dict("split"),
                                  "index_names": list(pv.index.names),
                                  "col_nlevels": pv.columns.nlevels if isinstance(pv.columns, _pd.MultiIndex) else 0,
                                  "idx_nlevels": pv.index.nlevels if isinstance(pv.index, _pd.MultiIndex) else 1})
                return
            result_queue.put({"_error": "Code must produce a 'fig' variable (or set fig = None with df_display for tables)"})
            return

        if not isinstance(fig, _go.Figure):
            result_queue.put({"_error": f"'fig' must be a plotly Figure, got {type(fig).__name__}"})
            return

        result_queue.put(fig.to_plotly_json())
    except Exception as e:
        result_queue.put({"_error": str(e)})


def execute_chart_code(code: str, df: pd.DataFrame) -> dict:
    """Execute user Python code in restricted subprocess. Returns Plotly figure dict."""
    if not code.strip():
        raise ValueError("Empty code")

    # Block access to dunder attributes that can escape sandbox
    for pat in _DANGEROUS_PATTERNS:
        if pat in code:
            raise ValueError(f"Access to '{pat}' is not allowed for security reasons")

    # Block file I/O and system access patterns
    for pat in _DANGEROUS_CALL_PATTERNS:
        if pat in code:
            raise ValueError(f"'{pat}' is not allowed for security reasons")

    # Run in subprocess for real isolation and killable timeout
    result_queue = multiprocessing.Queue()
    df_data = df.to_dict("list")
    proc = multiprocessing.Process(target=_code_runner, args=(code, df_data, result_queue))
    proc.start()
    proc.join(timeout=EXEC_TIMEOUT)

    if proc.is_alive():
        proc.terminate()
        proc.join(timeout=5)
        if proc.is_alive():
            proc.kill()
            proc.join()
        raise ValueError(f"Code execution timed out ({EXEC_TIMEOUT}s)")

    if result_queue.empty():
        raise ValueError("Code execution produced no result")

    result = result_queue.get()

    if isinstance(result, dict) and "_error" in result:
        raise ValueError(f"Code execution error: {result['_error']}")

    # Handle pivot serialization from subprocess
    if isinstance(result, dict) and result.get("_serialize_pivot"):
        pivot = pd.DataFrame(**{k: result["data"][k] for k in ("data", "index", "columns")})
        return _serialize_pivot_from_code(pivot)

    return result
