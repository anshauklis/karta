"""Per-column number formats (column_formats) must reach the chart itself.

Regression: column_formats was applied only to the data table. On the chart the
value axis and the show-values data labels used Plotly's default `text_auto`
(e.g. "51.53165k") instead of the column's currency/percent/number format.
"""
import pandas as pd

from api.executor import build_visual_chart


def _bar(config):
    df = pd.DataFrame({"category": ["A", "B"], "amount": [28100, 51531.65]})
    return build_visual_chart("bar", config, df)


def test_currency_format_applies_to_value_axis_and_labels():
    fig = _bar({
        "x_column": "category",
        "y_columns": ["amount"],
        "show_values": True,
        "column_formats": {"amount": {"type": "currency", "decimals": 2, "prefix": "$"}},
    })
    yaxis = fig["layout"]["yaxis"]
    assert yaxis["tickprefix"] == "$"
    assert yaxis["tickformat"] == ",.2f"
    for tr in fig["data"]:
        assert tr["texttemplate"] == "$%{y:,.2f}"


def test_percent_format_applies():
    df = pd.DataFrame({"category": ["A", "B"], "rate": [0.12, 0.34]})
    fig = build_visual_chart("bar", {
        "x_column": "category",
        "y_columns": ["rate"],
        "show_values": True,
        "column_formats": {"rate": {"type": "percent", "decimals": 1}},
    }, df)
    assert fig["layout"]["yaxis"]["tickformat"] == ",.1%"
    assert fig["data"][0]["texttemplate"] == "%{y:,.1%}"


def test_horizontal_bar_formats_value_axis_x():
    fig = build_visual_chart("bar", {
        "x_column": "category",
        "y_columns": ["amount"],
        "orientation": "horizontal",
        "show_values": True,
        "column_formats": {"amount": {"type": "currency", "decimals": 0, "prefix": "$"}},
    }, pd.DataFrame({"category": ["A", "B"], "amount": [28100, 51531]}))
    assert fig["layout"]["xaxis"]["tickprefix"] == "$"
    assert fig["layout"]["xaxis"]["tickformat"] == ",.0f"
    assert fig["data"][0]["texttemplate"] == "$%{x:,.0f}"


def test_no_column_format_leaves_labels_default():
    fig = _bar({
        "x_column": "category",
        "y_columns": ["amount"],
        "show_values": True,
    })
    # No per-column/global format → leave px's default text_auto template ("%{y}")
    # untouched; in particular don't inject a currency/number format.
    for tr in fig["data"]:
        assert tr.get("texttemplate") == "%{y}"


def test_global_number_format_d3_string_applies():
    # The Number Format selector sends a raw d3 string (not a legacy key).
    fig = _bar({
        "x_column": "category",
        "y_columns": ["amount"],
        "show_values": True,
        "number_format": "$,.2f",
    })
    assert fig["layout"]["yaxis"]["tickformat"] == "$,.2f"
    assert fig["data"][0]["texttemplate"] == "%{y:$,.2f}"


def test_legacy_number_format_key_still_maps():
    fig = _bar({
        "x_column": "category",
        "y_columns": ["amount"],
        "show_values": True,
        "number_format": "compact",
    })
    assert fig["layout"]["yaxis"]["tickformat"] == "~s"
    assert fig["data"][0]["texttemplate"] == "%{y:~s}"
