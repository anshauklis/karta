"""Color palette must actually recolor chart traces.

Regression: `_apply_styling` only set layout `colorway`, which Plotly ignores once
px assigns explicit per-trace colors. The selected palette therefore had no effect
on multi-series (or even single-series) px charts.
"""
import pandas as pd

from api.executor import build_visual_chart, PALETTES


def _marker_colors(fig: dict) -> list:
    return [t["marker"]["color"] for t in fig["data"]]


def test_palette_applies_to_multi_series_bar():
    df = pd.DataFrame(
        {"x": ["a", "b", "a", "b"], "cat": ["p", "p", "q", "q"], "v": [1, 2, 3, 4]}
    )
    config = {
        "x_column": "x",
        "y_columns": ["v"],
        "color_column": "cat",
        "color_palette": "vivid",
    }
    fig = build_visual_chart("bar", config, df)
    colors = _marker_colors(fig)
    assert colors[0] == PALETTES["vivid"][0]
    assert colors[1] == PALETTES["vivid"][1]


def test_palette_applies_to_single_series_bar():
    df = pd.DataFrame({"x": ["a", "b", "c"], "v": [1, 2, 3]})
    config = {"x_column": "x", "y_columns": ["v"], "color_palette": "bold"}
    fig = build_visual_chart("bar", config, df)
    assert _marker_colors(fig)[0] == PALETTES["bold"][0]


def test_default_palette_is_plotly_default():
    df = pd.DataFrame({"x": ["a", "b"], "cat": ["p", "q"], "v": [1, 2]})
    config = {"x_column": "x", "y_columns": ["v"], "color_column": "cat"}
    fig = build_visual_chart("bar", config, df)
    assert _marker_colors(fig)[0] == PALETTES["default"][0]
