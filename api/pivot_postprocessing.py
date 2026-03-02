"""Post-processing pipeline for pivot tables.

Each operation: (DataFrame, config) -> DataFrame
Pipeline runs after base pivoting + pct_mode + filtering, before subtotals.
"""
import pandas as pd


def apply_cumulative(pivot: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Add cumulative columns (cumsum, cumprod, cummin, cummax).

    Config: pivot_cumulative: [{"metric": "revenue", "func": "cumsum"}]
    Adds column "revenue (cumsum)" alongside original.
    """
    specs = config.get("pivot_cumulative", [])
    if not specs:
        return pivot

    func_map = {"cumsum": "cumsum", "cumprod": "cumprod", "cummin": "cummin", "cummax": "cummax"}

    for spec in specs:
        metric = spec.get("metric")
        func_name = spec.get("func", "cumsum")
        if not metric or func_name not in func_map:
            continue

        if isinstance(pivot.columns, pd.MultiIndex):
            mask = pivot.columns.get_level_values(0) == metric
            matched = pivot.loc[:, mask]
            for col in matched.columns:
                new_label = (f"{col[0]} ({func_name})",) + col[1:]
                pivot[new_label] = getattr(pd.to_numeric(pivot[col], errors="coerce"), func_name)()
        else:
            if metric in pivot.columns:
                new_col = f"{metric} ({func_name})"
                pivot[new_col] = getattr(pd.to_numeric(pivot[metric], errors="coerce"), func_name)()

    return pivot


def apply_rolling(pivot: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Add rolling window columns (mean, sum, std, min, max).

    Config: pivot_rolling: [{"metric": "revenue", "func": "mean", "window": 3}]
    Adds column "revenue (rolling mean 3)".
    """
    specs = config.get("pivot_rolling", [])
    if not specs:
        return pivot

    allowed_funcs = {"mean", "sum", "std", "min", "max"}

    for spec in specs:
        metric = spec.get("metric")
        func_name = spec.get("func", "mean")
        window = spec.get("window", 3)
        if not metric or func_name not in allowed_funcs or window < 2:
            continue

        if isinstance(pivot.columns, pd.MultiIndex):
            mask = pivot.columns.get_level_values(0) == metric
            matched = pivot.loc[:, mask]
            for col in matched.columns:
                new_label = (f"{col[0]} (rolling {func_name} {window})",) + col[1:]
                series = pd.to_numeric(pivot[col], errors="coerce")
                pivot[new_label] = getattr(series.rolling(window=window, min_periods=1), func_name)()
        else:
            if metric in pivot.columns:
                new_col = f"{metric} (rolling {func_name} {window})"
                series = pd.to_numeric(pivot[metric], errors="coerce")
                pivot[new_col] = getattr(series.rolling(window=window, min_periods=1), func_name)()

    return pivot


def apply_time_compare(pivot: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Add time comparison columns (diff, pct change, ratio vs shifted period).

    Config: pivot_time_compare: {"shift": 1, "mode": "diff"}
    Adds columns per metric: "revenue (diff vs -1)".
    """
    tc = config.get("pivot_time_compare")
    if not tc:
        return pivot

    shift = tc.get("shift", 1)
    mode = tc.get("mode", "diff")
    if shift < 1 or mode not in ("diff", "pct", "ratio"):
        return pivot

    numeric_cols = pivot.select_dtypes(include="number").columns

    for col in numeric_cols:
        current = pd.to_numeric(pivot[col], errors="coerce")
        shifted = current.shift(shift)

        if isinstance(col, tuple):
            metric = col[0]
        else:
            metric = col

        if mode == "diff":
            new_label = f"{metric} (diff vs -{shift})"
            result = current - shifted
        elif mode == "pct":
            new_label = f"{metric} (pct vs -{shift})"
            result = ((current - shifted) / shifted.replace(0, float("nan"))) * 100
        else:  # ratio
            new_label = f"{metric} (ratio vs -{shift})"
            result = current / shifted.replace(0, float("nan"))

        if isinstance(pivot.columns, pd.MultiIndex):
            if isinstance(col, tuple):
                new_col_label = (new_label,) + col[1:]
            else:
                new_col_label = new_label
            pivot[new_col_label] = result
        else:
            pivot[new_label] = result

    return pivot


def apply_rank(pivot: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Add rank columns.

    Config: pivot_rank: [{"metric": "revenue", "method": "dense"}]
    Adds column "revenue (rank)".
    """
    specs = config.get("pivot_rank", [])
    if not specs:
        return pivot

    allowed_methods = {"dense", "min", "max", "average", "first"}

    for spec in specs:
        metric = spec.get("metric")
        method = spec.get("method", "dense")
        if not metric or method not in allowed_methods:
            continue

        if isinstance(pivot.columns, pd.MultiIndex):
            mask = pivot.columns.get_level_values(0) == metric
            matched = pivot.loc[:, mask]
            for col in matched.columns:
                new_label = (f"{col[0]} (rank)",) + col[1:]
                series = pd.to_numeric(pivot[col], errors="coerce")
                pivot[new_label] = series.rank(method=method, ascending=False)
        else:
            if metric in pivot.columns:
                new_col = f"{metric} (rank)"
                series = pd.to_numeric(pivot[metric], errors="coerce")
                pivot[new_col] = series.rank(method=method, ascending=False)

    return pivot


def compute_cond_format_meta(pivot: pd.DataFrame, config: dict) -> dict | None:
    """Compute min/max/mean per metric for conditional formatting heatmaps.

    Config: pivot_cond_format: [{"metric": "revenue", "type": "heatmap", ...}]
    Returns: {"revenue": {"min": 100, "max": 9500, "mean": 2300}}
    """
    cond_fmt = config.get("pivot_cond_format", [])
    if not cond_fmt:
        return None

    meta = {}
    for rule in cond_fmt:
        metric = rule.get("metric")
        if not metric:
            continue

        if isinstance(pivot.columns, pd.MultiIndex):
            mask = pivot.columns.get_level_values(0) == metric
            vals = pivot.loc[:, mask].values.flatten()
        elif metric in pivot.columns:
            vals = pivot[metric].values
        else:
            continue

        numeric_vals = pd.to_numeric(pd.Series(vals), errors="coerce").dropna()
        if len(numeric_vals) == 0:
            continue

        meta[metric] = {
            "min": float(numeric_vals.min()),
            "max": float(numeric_vals.max()),
            "mean": float(numeric_vals.mean()),
        }

    return meta if meta else None


def run_pipeline(pivot: pd.DataFrame, config: dict) -> tuple[pd.DataFrame, dict | None]:
    """Run the full post-processing pipeline.

    Returns: (processed_pivot, cond_format_meta)

    Pipeline order: cumulative → rolling → time_compare → rank → cond_format_meta
    """
    pivot = apply_cumulative(pivot, config)
    pivot = apply_rolling(pivot, config)
    pivot = apply_time_compare(pivot, config)
    pivot = apply_rank(pivot, config)

    cond_meta = compute_cond_format_meta(pivot, config)

    return pivot, cond_meta
