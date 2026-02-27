"""Automated chart data insights — statistical analysis.

Pure statistical analysis module. No LLM dependency — fast and deterministic.
Analyzes chart DataFrames and produces structured insights (trends, anomalies, info).
"""

import pandas as pd
import numpy as np


def detect_insights(df: pd.DataFrame, chart_config: dict) -> list[dict]:
    """Analyze chart data and return insights.

    Returns list of insight dicts:
        {
            "type": "trend" | "anomaly" | "info",
            "severity": "positive" | "negative" | "neutral",
            "title": "Revenue up 23%",
            "detail": "Compared to previous period",
        }
    """
    if df.empty or len(df) < 2:
        return []

    insights: list[dict] = []

    # Determine which columns to analyze based on chart config
    y_cols = _resolve_y_columns(df, chart_config)

    for y_col in y_cols:
        if y_col not in df.columns:
            continue
        series = pd.to_numeric(df[y_col], errors="coerce").dropna()
        if len(series) < 2:
            continue

        label = _short_label(y_col)

        # 1. Trend: compare last value vs previous
        _add_period_trend(insights, series, label)

        # 2. Anomaly: Z-score on latest value
        _add_anomaly(insights, series, label)

        # 3. Overall trend direction (linear regression slope)
        _add_overall_trend(insights, series, label)

    # Deduplicate and limit to top 5
    return insights[:5]


def _resolve_y_columns(df: pd.DataFrame, config: dict) -> list[str]:
    """Resolve which columns to analyze from chart config."""
    y_cols = config.get("y_columns") or []
    if isinstance(y_cols, str):
        y_cols = [y_cols]

    # Also check metrics — executor rewrites y_columns to metric labels
    if not y_cols and config.get("metrics"):
        y_cols = [
            m.get("label", f"{m.get('aggregate', 'SUM')}({m.get('column', '')})")
            for m in config["metrics"]
        ]

    # Fallback: pick all numeric columns except x_column
    if not y_cols:
        x_col = config.get("x_column", "")
        y_cols = [
            c for c in df.columns
            if c != x_col and pd.api.types.is_numeric_dtype(df[c])
        ]

    return y_cols


def _short_label(col_name: str) -> str:
    """Shorten a column name for display in insight titles."""
    if len(col_name) > 30:
        return col_name[:27] + "..."
    return col_name


def _fmt(val: float) -> str:
    """Format a number for display — use K/M suffixes for large values."""
    abs_val = abs(val)
    if abs_val >= 1_000_000:
        return f"{val / 1_000_000:,.1f}M"
    if abs_val >= 10_000:
        return f"{val / 1_000:,.1f}K"
    if abs_val >= 1:
        return f"{val:,.0f}"
    return f"{val:,.2f}"


def _add_period_trend(insights: list[dict], series: pd.Series, label: str) -> None:
    """Compare last value vs previous value — percentage change."""
    last = float(series.iloc[-1])
    prev = float(series.iloc[-2])
    if prev == 0:
        return

    pct_change = ((last - prev) / abs(prev)) * 100
    if abs(pct_change) < 5:
        return  # Below significance threshold

    direction = "up" if pct_change > 0 else "down"
    arrow = "\u2191" if pct_change > 0 else "\u2193"  # ↑ or ↓
    severity = "positive" if pct_change > 0 else "negative"

    insights.append({
        "type": "trend",
        "severity": severity,
        "title": f"{arrow} {label} {direction} {abs(pct_change):.0f}%",
        "detail": f"{_fmt(prev)} \u2192 {_fmt(last)}",
    })


def _add_anomaly(insights: list[dict], series: pd.Series, label: str) -> None:
    """Detect anomaly using Z-score on latest value."""
    if len(series) < 5:
        return

    last = float(series.iloc[-1])
    mean = float(series.mean())
    std = float(series.std())
    if std == 0:
        return

    z_score = abs((last - mean) / std)
    if z_score < 2.5:
        return

    insights.append({
        "type": "anomaly",
        "severity": "negative",
        "title": f"Anomaly in {label}",
        "detail": f"Value {_fmt(last)} is {z_score:.1f}\u03c3 from mean",
    })


def _add_overall_trend(insights: list[dict], series: pd.Series, label: str) -> None:
    """Detect overall trend direction via linear regression slope."""
    if len(series) < 5:
        return

    x = np.arange(len(series), dtype=float)
    try:
        slope = float(np.polyfit(x, series.values.astype(float), 1)[0])
    except (np.linalg.LinAlgError, ValueError):
        return

    std = float(series.std())
    if std == 0 or abs(slope) < std * 0.1:
        return  # Slope not meaningful relative to data spread

    direction = "upward" if slope > 0 else "downward"
    severity = "positive" if slope > 0 else "negative"

    insights.append({
        "type": "info",
        "severity": severity,
        "title": f"{label}: {direction} trend",
        "detail": f"Average change: {_fmt(slope)} per period",
    })
