"""Meta endpoints — public chart configuration schemas and metadata.

These endpoints help LLMs and external tools discover what config fields
each chart type supports, without needing authentication.
"""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/meta", tags=["Meta"])

# ---------------------------------------------------------------------------
# Shared field definitions
# ---------------------------------------------------------------------------

_PIPELINE_FIELDS = {
    "time_column": {
        "type": "string",
        "description": "Column used for time-based grouping (optional)",
    },
    "time_grain": {
        "type": "enum",
        "values": ["raw", "day", "week", "month", "quarter", "year"],
        "description": "Time granularity for grouping when time_column is set",
    },
    "time_range": {
        "type": "enum",
        "values": ["7d", "30d", "90d", "1y", "all"],
        "description": "Pre-defined time range filter",
    },
    "metrics": {
        "type": "array",
        "items": {
            "type": "object",
            "fields": {
                "column": {"type": "string"},
                "aggregate": {
                    "type": "enum",
                    "values": ["sum", "avg", "count", "min", "max", "count_distinct"],
                },
                "label": {"type": "string", "description": "Display label for the metric"},
            },
        },
        "description": "Aggregation metrics applied during the data pipeline",
    },
    "chart_filters": {
        "type": "array",
        "items": {
            "type": "object",
            "fields": {
                "column": {"type": "string"},
                "operator": {
                    "type": "enum",
                    "values": ["=", "!=", ">", ">=", "<", "<=", "IN", "NOT IN", "LIKE", "IS NULL", "IS NOT NULL"],
                },
                "value": {"type": "any", "description": "Filter value (string, number, or array for IN)"},
            },
        },
        "description": "Filters applied to the dataset before chart rendering",
    },
    "calculated_columns": {
        "type": "array",
        "items": {
            "type": "object",
            "fields": {
                "name": {"type": "string", "description": "Name of the new column"},
                "expression": {"type": "string", "description": "SQL expression for the column"},
            },
        },
        "description": "Computed columns added via SQL expressions",
    },
    "row_limit": {
        "type": "integer",
        "description": "Max rows returned after aggregation (optional, no limit by default)",
    },
}

_VISUAL_COMMON = {
    "x_column": {"type": "string", "description": "Column mapped to the X axis"},
    "y_columns": {
        "type": "array[string]",
        "description": "One or more columns mapped to the Y axis (metrics / values)",
    },
    "color_column": {
        "type": "string",
        "description": "Column used for color grouping / series split (optional)",
    },
    "show_legend": {"type": "boolean", "default": True, "description": "Show chart legend"},
    "show_values": {
        "type": "boolean",
        "default": False,
        "description": "Display data values directly on the chart",
    },
    "color_palette": {
        "type": "enum",
        "values": ["default", "pastel", "vivid", "bold", "dark", "earth"],
        "description": "Color palette for the chart series",
    },
    "number_format": {
        "type": "enum",
        "values": ["", "percent", "currency", "compact"],
        "description": "Number formatting for displayed values (empty string = raw number)",
    },
    "sort_order": {
        "type": "enum",
        "values": ["none", "asc", "desc"],
        "description": "Sort data by the first Y column",
    },
    "legend_position": {
        "type": "enum",
        "values": ["auto", "top", "bottom", "left", "right"],
        "description": "Position of the legend on the chart",
    },
    "x_axis_label": {"type": "string", "description": "Custom X axis label (optional)"},
    "y_axis_label": {"type": "string", "description": "Custom Y axis label (optional)"},
}

# ---------------------------------------------------------------------------
# Per-chart-type schemas
# ---------------------------------------------------------------------------

CHART_TYPE_SCHEMAS: dict[str, dict] = {
    "bar": {
        "description": "Vertical or horizontal bar chart with optional stacking",
        "fields": {
            **_VISUAL_COMMON,
            "stack_mode": {
                "type": "enum",
                "values": ["none", "stacked", "grouped", "percent"],
                "default": "none",
                "description": "Bar stacking mode",
            },
            "orientation": {
                "type": "enum",
                "values": ["vertical", "horizontal"],
                "default": "vertical",
                "description": "Bar orientation",
            },
        },
    },
    "line": {
        "description": "Line chart with optional spline interpolation and markers",
        "fields": {
            **_VISUAL_COMMON,
            "line_shape": {
                "type": "enum",
                "values": ["linear", "spline"],
                "default": "linear",
                "description": "Line interpolation shape",
            },
            "show_markers": {
                "type": "boolean",
                "default": False,
                "description": "Show data point markers on lines",
            },
        },
    },
    "area": {
        "description": "Area chart (filled line) with optional stacking",
        "fields": {
            **_VISUAL_COMMON,
            "stack_mode": {
                "type": "enum",
                "values": ["none", "stacked", "percent"],
                "default": "none",
                "description": "Area stacking mode",
            },
        },
    },
    "scatter": {
        "description": "Scatter plot with optional size encoding and trendline",
        "fields": {
            **_VISUAL_COMMON,
            "size_column": {
                "type": "string",
                "description": "Column used for bubble size (optional)",
            },
            "trendline": {
                "type": "boolean",
                "default": False,
                "description": "Show linear trendline",
            },
        },
    },
    "pie": {
        "description": "Pie chart showing proportions",
        "fields": {
            "x_column": {"type": "string", "description": "Column for slice labels (names)"},
            "y_columns": {
                "type": "array[string]",
                "description": "Column for slice values (first element used)",
            },
            "color_column": {
                "type": "string",
                "description": "Optional grouping column",
            },
            "show_values": {
                "type": "boolean",
                "default": False,
                "description": "Show label, percent, and value on slices",
            },
            "color_palette": {
                "type": "enum",
                "values": ["default", "pastel", "vivid", "bold", "dark", "earth"],
            },
            "number_format": {
                "type": "enum",
                "values": ["", "percent", "currency", "compact"],
            },
        },
    },
    "donut": {
        "description": "Donut chart (pie with hole). Rendered as pie with donut_hole > 0.",
        "fields": {
            "x_column": {"type": "string", "description": "Column for slice labels (names)"},
            "y_columns": {
                "type": "array[string]",
                "description": "Column for slice values (first element used)",
            },
            "color_column": {"type": "string", "description": "Optional grouping column"},
            "show_values": {
                "type": "boolean",
                "default": False,
                "description": "Show label, percent, and value on slices",
            },
            "color_palette": {
                "type": "enum",
                "values": ["default", "pastel", "vivid", "bold", "dark", "earth"],
            },
            "number_format": {
                "type": "enum",
                "values": ["", "percent", "currency", "compact"],
            },
            "donut_hole": {
                "type": "number",
                "default": 0.4,
                "description": "Size of the donut hole (0 = pie, 0.4 = default donut)",
            },
        },
    },
    "kpi": {
        "description": "Single KPI number indicator with optional target delta",
        "fields": {
            "y_columns": {
                "type": "array[string]",
                "description": "Column to aggregate as the KPI value (first element used, summed)",
            },
            "kpi_target": {
                "type": "number",
                "description": "Target value — shows delta when set (optional)",
            },
            "kpi_prefix": {
                "type": "string",
                "default": "",
                "description": "Prefix before the KPI number (e.g. '$')",
            },
            "kpi_suffix": {
                "type": "string",
                "default": "",
                "description": "Suffix after the KPI number (e.g. '%')",
            },
            "number_format": {
                "type": "enum",
                "values": ["", "percent", "currency", "compact"],
            },
            "x_column": {
                "type": "string",
                "description": "Used as the KPI title if x_axis_label is not set (optional)",
            },
            "x_axis_label": {
                "type": "string",
                "description": "Custom title for the KPI indicator (optional)",
            },
        },
    },
    "table": {
        "description": "Data table with optional conditional formatting. No Plotly figure — data rendered as HTML table.",
        "fields": {
            "conditional_formatting": {
                "type": "array",
                "items": {
                    "type": "object",
                    "fields": {
                        "column": {"type": "string"},
                        "operator": {
                            "type": "enum",
                            "values": [">", ">=", "<", "<=", "=", "!=", "between"],
                        },
                        "value": {"type": "any"},
                        "color": {"type": "string", "description": "CSS color for matching cells"},
                    },
                },
                "description": "Conditional formatting rules for table cells",
            },
            "show_values": {
                "type": "boolean",
                "default": True,
                "description": "Show values (always true for tables)",
            },
        },
    },
    "histogram": {
        "description": "Histogram showing frequency distribution of a column",
        "fields": {
            "x_column": {"type": "string", "description": "Column to compute distribution for"},
            "y_columns": {
                "type": "array[string]",
                "description": "Optional column for weighted histogram (histfunc=sum)",
            },
            "color_column": {"type": "string", "description": "Optional grouping column"},
            "bins": {
                "type": "integer",
                "default": 20,
                "description": "Number of histogram bins",
            },
            "color_palette": {
                "type": "enum",
                "values": ["default", "pastel", "vivid", "bold", "dark", "earth"],
            },
            "show_values": {"type": "boolean", "default": False},
        },
    },
    "pivot": {
        "description": "Pivot table with row/column grouping, aggregation, and optional subtotals",
        "fields": {
            "pivot_rows": {
                "type": "array[string]",
                "description": "Columns used as row groups in the pivot table",
            },
            "pivot_columns": {
                "type": "array[string]",
                "description": "Columns used as column headers in the pivot table",
            },
            "pivot_values": {
                "type": "array",
                "items": {
                    "type": "object",
                    "fields": {
                        "column": {"type": "string"},
                        "aggregate": {
                            "type": "enum",
                            "values": ["sum", "avg", "count", "min", "max"],
                        },
                    },
                },
                "description": "Value columns with aggregation functions",
            },
            "show_subtotals": {
                "type": "boolean",
                "default": False,
                "description": "Show subtotal rows in the pivot table",
            },
            "column_limit": {
                "type": "integer",
                "description": "Max number of pivot columns to display (optional)",
            },
        },
    },
    "bar_h": {
        "description": "Horizontal bar chart (alias for bar with orientation=horizontal)",
        "fields": {
            **_VISUAL_COMMON,
            "stack_mode": {
                "type": "enum",
                "values": ["none", "stacked", "grouped", "percent"],
                "default": "none",
                "description": "Bar stacking mode",
            },
        },
        "note": "Internally converted to bar with orientation='horizontal'",
    },
    "combo": {
        "description": "Combination chart — first y_column as bars, remaining as lines on secondary Y axis",
        "fields": {
            **_VISUAL_COMMON,
            "combo_types": {
                "type": "array",
                "items": {"type": "enum", "values": ["bar", "line"]},
                "description": "Per-series chart type (default: first = bar, rest = line)",
            },
        },
    },
    "heatmap": {
        "description": "Heatmap with color intensity representing values",
        "fields": {
            "x_column": {"type": "string", "description": "Column for X axis categories"},
            "y_columns": {
                "type": "array[string]",
                "description": "Value column(s) — first element used for cell values",
            },
            "color_column": {
                "type": "string",
                "description": "Column for Y axis categories (rows of the heatmap)",
            },
            "color_palette": {
                "type": "enum",
                "values": ["default", "pastel", "vivid", "bold", "dark", "earth"],
            },
            "show_values": {
                "type": "boolean",
                "default": False,
                "description": "Show numeric values in heatmap cells",
            },
        },
    },
    "box": {
        "description": "Box plot showing distribution quartiles",
        "fields": {
            "x_column": {"type": "string", "description": "Grouping column for X axis (optional)"},
            "y_columns": {
                "type": "array[string]",
                "description": "Numeric column(s) to show distribution for",
            },
            "color_column": {
                "type": "string",
                "description": "Additional grouping column for color split (optional)",
            },
        },
    },
    "violin": {
        "description": "Violin plot showing distribution density with embedded box plot",
        "fields": {
            "x_column": {"type": "string", "description": "Grouping column for X axis (optional)"},
            "y_columns": {
                "type": "array[string]",
                "description": "Numeric column(s) to show distribution for",
            },
            "color_column": {
                "type": "string",
                "description": "Additional grouping column for color split (optional)",
            },
        },
    },
    "treemap": {
        "description": "Treemap showing hierarchical data as nested rectangles",
        "fields": {
            "x_column": {
                "type": "string",
                "description": "Primary hierarchy column (category labels)",
            },
            "y_columns": {
                "type": "array[string]",
                "description": "Size column — first element determines rectangle area",
            },
            "color_column": {
                "type": "string",
                "description": "Secondary hierarchy level (optional)",
            },
        },
    },
    "funnel": {
        "description": "Funnel chart showing progressive reduction across stages",
        "fields": {
            "x_column": {"type": "string", "description": "Column with stage names"},
            "y_columns": {
                "type": "array[string]",
                "description": "Column with stage values (first element used)",
            },
            "show_values": {
                "type": "boolean",
                "default": False,
                "description": "Show value and percent of initial on each stage",
            },
        },
    },
    "waterfall": {
        "description": "Waterfall chart showing cumulative effect of sequential values",
        "fields": {
            "x_column": {"type": "string", "description": "Column with category labels"},
            "y_columns": {
                "type": "array[string]",
                "description": "Column with values (positive = increase, negative = decrease)",
            },
            "show_values": {
                "type": "boolean",
                "default": False,
                "description": "Show values outside each bar",
            },
        },
    },
    "pareto": {
        "description": "Pareto chart — bars sorted descending with cumulative percentage line",
        "fields": {
            "x_column": {"type": "string", "description": "Column with category labels"},
            "y_columns": {
                "type": "array[string]",
                "description": "Column with values (first element used, sorted descending)",
            },
        },
    },
    "correlation": {
        "description": "Correlation matrix heatmap for numeric columns",
        "fields": {
            "y_columns": {
                "type": "array[string]",
                "description": "Numeric columns to include in the correlation matrix (if empty, all numeric columns are used)",
            },
        },
    },
    "control": {
        "description": "Statistical process control chart with mean, UCL, and LCL lines",
        "fields": {
            "x_column": {
                "type": "string",
                "description": "Time or sequence column for X axis",
            },
            "y_columns": {
                "type": "array[string]",
                "description": "Metric column to monitor (first element used)",
            },
        },
    },
    "text": {
        "description": "Text/markdown card — no data pipeline, just rendered content",
        "fields": {
            "text_content": {
                "type": "string",
                "description": "Text or markdown content to display",
            },
            "markdown": {
                "type": "boolean",
                "default": True,
                "description": "Render content as markdown",
            },
        },
        "no_pipeline": True,
    },
}

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/chart-types",
    summary="List all supported chart types",
    description=(
        "Returns a list of all chart types with their descriptions. "
        "Use the `type` value as path parameter for `/chart-config-schema/{chart_type}`."
    ),
)
def list_chart_types():
    """Return every supported chart type with a short description."""
    return [
        {"type": ct, "description": schema["description"]}
        for ct, schema in CHART_TYPE_SCHEMAS.items()
    ]


@router.get(
    "/chart-config-schema/{chart_type}",
    summary="Get config schema for a chart type",
    description=(
        "Returns the full configuration schema for a given chart type, "
        "including type-specific fields and the shared data-pipeline fields."
    ),
)
def get_chart_config_schema(chart_type: str):
    """Return the detailed config schema for *chart_type*.

    Includes:
    - **fields** — chart-type-specific visual config fields
    - **pipeline** — shared data pipeline fields (filters, metrics, time, etc.)
    """
    schema = CHART_TYPE_SCHEMAS.get(chart_type)
    if schema is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown chart type '{chart_type}'. Use GET /api/meta/chart-types to list available types.",
        )

    result: dict = {
        "chart_type": chart_type,
        "description": schema["description"],
        "fields": schema["fields"],
    }

    # Text charts have no data pipeline
    if schema.get("no_pipeline"):
        result["pipeline"] = None
    else:
        result["pipeline"] = _PIPELINE_FIELDS

    # Pass through any extra keys (e.g. "note")
    for key in ("note",):
        if key in schema:
            result[key] = schema[key]

    return result


@router.get(
    "/chart-capabilities",
    summary="Chart type capabilities map",
    description=(
        "Returns a mapping of chart type → capability flags. "
        "Used by the frontend to dynamically show/hide UI controls."
    ),
)
def get_chart_capabilities():
    """Return capability flags for every chart type (including table/pivot/text)."""
    from api.renderers import get_capabilities

    caps = get_capabilities()

    # Special types not backed by renderers
    caps["table"] = {
        "needs_x": False, "needs_y": False, "supports_color": False,
        "supports_stack": False, "supports_sort": False, "supports_overlays": False,
        "supports_styling": False, "supports_cond_format": True,
    }
    caps["pivot"] = {
        "needs_x": False, "needs_y": False, "supports_color": False,
        "supports_stack": False, "supports_sort": False, "supports_overlays": False,
        "supports_styling": False, "supports_cond_format": True,
    }
    caps["text"] = {
        "needs_x": False, "needs_y": False, "supports_color": False,
        "supports_stack": False, "supports_sort": False, "supports_overlays": False,
        "supports_styling": False, "supports_cond_format": False,
    }

    return caps
