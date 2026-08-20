"""Per-column / global number formats must reach the chart uniformly: value
axis ticks, data labels (show_values), and the hover tooltip — across every
chart type where a value field exists.

Regression: formats reached only the data table; the chart axis, labels and
hover used Plotly defaults (e.g. "51.53165k").
"""
import pandas as pd

from api.executor import build_visual_chart


def _bar(config):
    df = pd.DataFrame({"category": ["A", "B"], "amount": [28100, 51531.65]})
    return build_visual_chart("bar", config, df)


# --- Cartesian: axis ticks + hover + labels ---

def test_currency_column_format_inlines_dollar_everywhere():
    fig = _bar({
        "x_column": "category",
        "y_columns": ["amount"],
        "show_values": True,
        "column_formats": {"amount": {"type": "currency", "decimals": 2, "prefix": "$"}},
    })
    yaxis = fig["layout"]["yaxis"]
    assert yaxis["tickformat"] == "$,.2f"
    assert yaxis["hoverformat"] == "$,.2f"
    for tr in fig["data"]:
        assert tr["texttemplate"] == "%{y:$,.2f}"


def test_percent_format_applies_with_hover():
    df = pd.DataFrame({"category": ["A", "B"], "rate": [0.12, 0.34]})
    fig = build_visual_chart("bar", {
        "x_column": "category",
        "y_columns": ["rate"],
        "show_values": True,
        "column_formats": {"rate": {"type": "percent", "decimals": 1}},
    }, df)
    assert fig["layout"]["yaxis"]["tickformat"] == ",.1%"
    assert fig["layout"]["yaxis"]["hoverformat"] == ",.1%"
    assert fig["data"][0]["texttemplate"] == "%{y:,.1%}"


def test_non_dollar_currency_uses_axis_prefix():
    fig = _bar({
        "x_column": "category",
        "y_columns": ["amount"],
        "show_values": True,
        "column_formats": {"amount": {"type": "currency", "decimals": 0, "prefix": "€"}},
    })
    yaxis = fig["layout"]["yaxis"]
    assert yaxis["tickformat"] == ",.0f"
    assert yaxis["tickprefix"] == "€"
    assert fig["data"][0]["texttemplate"] == "€%{y:,.0f}"


def test_horizontal_bar_formats_value_axis_x():
    fig = build_visual_chart("bar", {
        "x_column": "category",
        "y_columns": ["amount"],
        "orientation": "horizontal",
        "show_values": True,
        "column_formats": {"amount": {"type": "currency", "decimals": 0, "prefix": "$"}},
    }, pd.DataFrame({"category": ["A", "B"], "amount": [28100, 51531]}))
    assert fig["layout"]["xaxis"]["tickformat"] == "$,.0f"
    assert fig["layout"]["xaxis"]["hoverformat"] == "$,.0f"
    assert fig["data"][0]["texttemplate"] == "%{x:$,.0f}"


def test_no_format_leaves_labels_default():
    fig = _bar({"x_column": "category", "y_columns": ["amount"], "show_values": True})
    for tr in fig["data"]:
        assert tr.get("texttemplate") == "%{y}"


def test_global_number_format_d3_string_applies():
    fig = _bar({
        "x_column": "category", "y_columns": ["amount"], "show_values": True,
        "number_format": "$,.2f",
    })
    assert fig["layout"]["yaxis"]["tickformat"] == "$,.2f"
    assert fig["layout"]["yaxis"]["hoverformat"] == "$,.2f"
    assert fig["data"][0]["texttemplate"] == "%{y:$,.2f}"


def test_legacy_number_format_key_still_maps():
    fig = _bar({
        "x_column": "category", "y_columns": ["amount"], "show_values": True,
        "number_format": "compact",
    })
    assert fig["layout"]["yaxis"]["tickformat"] == "~s"
    assert fig["data"][0]["texttemplate"] == "%{y:~s}"


# --- Other chart types: format reaches labels/hover where a value exists ---

_NF = {"number_format": "$,.2f", "show_values": True}


def test_combo_formats_both_value_axes():
    df = pd.DataFrame({"category": ["A", "B"], "amount": [100, 200], "rate": [1.5, 2.5]})
    fig = build_visual_chart("combo", {"x_column": "category", "y_columns": ["amount", "rate"], **_NF}, df)
    assert fig["layout"]["yaxis"]["hoverformat"] == "$,.2f"
    assert fig["layout"]["yaxis2"]["hoverformat"] == "$,.2f"
    assert any(tr.get("texttemplate") == "%{y:$,.2f}" for tr in fig["data"])


def test_funnel_formats_value_axis_and_labels():
    df = pd.DataFrame({"stage": ["Visit", "Signup", "Pay"], "count": [1000, 400, 120]})
    fig = build_visual_chart("funnel", {"x_column": "stage", "y_columns": ["count"], **_NF}, df)
    assert fig["layout"]["xaxis"]["hoverformat"] == "$,.2f"
    assert fig["data"][0]["texttemplate"].startswith("%{value:$,.2f}")


def test_waterfall_formats_value_axis_and_labels():
    df = pd.DataFrame({"step": ["Start", "Up", "Down"], "delta": [100, 50, -30]})
    fig = build_visual_chart("waterfall", {"x_column": "step", "y_columns": ["delta"], **_NF}, df)
    assert fig["layout"]["yaxis"]["hoverformat"] == "$,.2f"
    assert fig["data"][0]["texttemplate"] == "%{y:$,.2f}"


def test_pie_formats_value_in_label_and_hover():
    df = pd.DataFrame({"category": ["A", "B"], "amount": [60, 40]})
    fig = build_visual_chart("pie", {"x_column": "category", "y_columns": ["amount"], **_NF}, df)
    tr = fig["data"][0]
    assert "%{value:$,.2f}" in tr["texttemplate"]
    assert "%{value:$,.2f}" in tr["hovertemplate"]


def test_treemap_formats_value_in_label_and_hover():
    df = pd.DataFrame({"category": ["A", "B"], "amount": [60, 40]})
    fig = build_visual_chart("treemap", {"x_column": "category", "y_columns": ["amount"], **_NF}, df)
    tr = fig["data"][0]
    assert "%{value:$,.2f}" in tr["texttemplate"]
    assert "%{value:$,.2f}" in tr["hovertemplate"]


def test_heatmap_formats_cell_values():
    df = pd.DataFrame({
        "x": ["A", "A", "B", "B"],
        "region": ["EU", "US", "EU", "US"],
        "amount": [10, 20, 30, 40],
    })
    fig = build_visual_chart("heatmap", {
        "x_column": "x", "y_columns": ["amount"], "color_column": "region", **_NF,
    }, df)
    tr = fig["data"][0]
    assert "%{z:$,.2f}" in tr["texttemplate"]
