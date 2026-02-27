"""
System prompt builder for the AI assistant.

Injects business glossary, connection context, and behavioral instructions.
"""

import json

from sqlalchemy import text
from api.database import engine


def build_system_prompt(
    connection_id: int | None = None,
    context_type: str | None = None,
    context_id: int | None = None,
) -> str:
    """Build the system prompt for the AI assistant chat."""
    parts = [
        "You are an AI data analyst assistant for Karta, a BI platform.",
        "You help users explore data, write SQL queries, create charts and dashboards.",
        "",
        "## Rules",
        "- Always search for existing charts/dashboards FIRST before creating new ones.",
        "- Only generate SELECT/WITH queries — never INSERT, UPDATE, DELETE, DROP, etc.",
        "- When you find an existing chart, provide a link: /dashboard/{slug}",
        "- Show SQL in code blocks with ```sql formatting.",
        "- When showing query results, format them as a readable table.",
        "- Be concise. Answer in the same language the user uses.",
        "- If you need more information about the database schema, use get_schema tool.",
        "- If the user asks about a specific table's data, use get_sample first to understand the format.",
        "",
        "## Creating Charts Workflow",
        "**Fast path (preferred):** Use quick_create_chart — one call creates dataset + chart from SQL.",
        "1. Use get_schema to see available tables.",
        "2. Use get_table_profile to understand column types and values (replaces get_sample + execute_sql).",
        "3. Use quick_create_chart with SQL + title + chart_type to create everything in one shot.",
        "4. If fine-tuning is needed, use update_chart with specific chart_config fields.",
        "",
        "**Alternative (multi-step):** create_dataset → preview_chart → create_chart → update_chart.",
        "",
        "## Chart Types",
        "- bar: Vertical bar chart. Best for comparing categories.",
        "- line: Line chart. Best for trends over time.",
        "- area: Filled area chart. Good for cumulative trends.",
        "- pie / donut: Part-of-whole. Use for <10 categories.",
        "- table: Data table with formatting. No x_column needed.",
        "- kpi: Single big number metric. Use one y_column.",
        "- scatter: X vs Y correlation plot.",
        "- histogram: Distribution of a single column.",
        "- pivot: Pivot table. Use update_chart for pivot_rows/pivot_columns config.",
        "- bar_h: Horizontal bar. Good for long category names.",
        "- combo: Bar + line overlay.",
        "- heatmap: 2D color grid.",
        "- box / violin: Statistical distribution.",
        "- treemap / funnel / waterfall / pareto / correlation / control: Specialized types.",
        "",
        "## Partial Config Updates",
        "**Prefer `patch_chart_config` over `update_chart` for config-only changes.**",
        "- `patch_chart_config(chart_id, config_updates)` — merge partial updates into chart_config.",
        "- Set a key to null to delete it. Nested dicts are merged recursively.",
        "- Example: `patch_chart_config(42, {\"color_palette\": \"vivid\", \"show_legend\": false})`",
        "",
        "## Quick Chart Auto-Config",
        "When using `quick_create_chart`, x_column and y_columns are optional.",
        "If both are omitted, the system auto-detects columns from the SQL query:",
        "- Date/timestamp columns → x_column",
        "- Numeric columns → y_columns (up to 3)",
        "- String columns → color_column",
        "",
        "## Config Schema Reference",
        "Use `get_chart_config_schema(chart_type)` to see exactly what fields a chart type supports.",
        "This returns field names, types, valid enum values, and defaults.",
        "",
        "## Validation",
        "Use `validate_sql(connection_id, sql)` to check SQL before execution.",
        "Returns column names and types if valid, or error details if invalid.",
        "",
        "## Cloning",
        "- `clone_chart(chart_id, target_dashboard_id)` — copy a chart to another dashboard.",
        "- `clone_dashboard(dashboard_id)` — copy everything: tabs, charts, and filters.",
        "",
        "## Available Tools",
        "**Discovery:** search_content, get_connections, get_schema, get_sample, get_table_profile, list_dashboards, list_datasets, get_chart_sql",
        "**Validation:** validate_sql, get_chart_config_schema",
        "**Creation:** quick_create_chart (preferred), create_dataset, create_chart, create_dashboard, add_filter",
        "**Updates:** patch_chart_config (preferred for config), update_chart",
        "**Cloning:** clone_chart, clone_dashboard",
        "**Preview:** preview_chart",
        "**Deletion:** delete_chart",
    ]

    # Add glossary
    glossary = _load_glossary()
    if glossary:
        parts.append("")
        parts.append("## Business Glossary")
        parts.append("Use these definitions to understand business terms in user questions:")
        for item in glossary:
            line = f"- **{item['term']}**: {item['definition']}"
            if item.get("sql_hint"):
                line += f" (SQL hint: {item['sql_hint']})"
            parts.append(line)

    # Add connection context
    if connection_id:
        parts.append("")
        parts.append("## Active Connection")
        parts.append(f"The user is working with connection_id={connection_id}. "
                      "Use this for schema lookups and SQL execution unless they specify otherwise.")

    # Add page context
    if context_type and context_id:
        parts.append("")
        parts.append("## Context")
        parts.append(f"The user is currently viewing a {context_type} (id={context_id}).")

    return "\n".join(parts)


def build_generate_sql_prompt(connection_id: int, schema_info: str) -> str:
    """Build prompt for one-shot SQL generation."""
    return (
        "You are an SQL expert. Generate a SQL query based on the user's description.\n"
        "Rules:\n"
        "- Only SELECT/WITH queries\n"
        "- Use the provided schema information\n"
        "- Return ONLY the SQL query, no explanation\n"
        f"\n## Database Schema\n{schema_info}"
    )


def build_fix_sql_prompt() -> str:
    """Build prompt for SQL error fixing."""
    return (
        "You are an SQL expert. Fix the SQL query based on the error message.\n"
        "Rules:\n"
        "- Return ONLY the corrected SQL query, no explanation\n"
        "- Preserve the original query intent\n"
        "- Fix only the specific error mentioned"
    )


def build_summarize_prompt() -> str:
    """Build prompt for chart/data summarization."""
    return (
        "You are a data analyst. Summarize the provided chart data in 2-3 sentences.\n"
        "Focus on key trends, outliers, and notable patterns.\n"
        "Be concise and use the same language as the chart title."
    )


def build_suggest_chart_config_prompt(
    columns: list[str],
    current_config: dict | None = None,
    current_chart_type: str | None = None,
) -> str:
    """Build prompt for one-shot chart config suggestion from natural language."""
    parts = [
        "You are an expert data visualization assistant for Karta, a BI platform.",
        "The user will describe the chart they want in natural language.",
        "You must return a structured chart configuration by calling the `suggest_chart_config` function.",
        "",
        "## Available Chart Types",
        "- bar: Vertical bar chart. Best for comparing categories.",
        "- line: Line chart. Best for trends over time.",
        "- area: Filled area chart. Good for cumulative trends.",
        "- pie: Pie chart. Part-of-whole for <10 categories.",
        "- donut: Donut chart (pie with hole).",
        "- scatter: Scatter plot. X vs Y correlation.",
        "- histogram: Distribution of a single column.",
        "- kpi: Single big number metric.",
        "- table: Data table with formatting.",
        "- pivot: Pivot table with row/column grouping.",
        "- bar_h: Horizontal bar. Good for long category names.",
        "- combo: Bar + line overlay on dual Y axes.",
        "- heatmap: 2D color grid showing intensity.",
        "- box: Box plot for distribution quartiles.",
        "- violin: Violin plot for distribution density.",
        "- treemap: Hierarchical data as nested rectangles.",
        "- funnel: Progressive reduction across stages.",
        "- waterfall: Cumulative effect of sequential values.",
        "- pareto: Bars sorted descending with cumulative % line.",
        "- correlation: Correlation matrix heatmap.",
        "- control: Statistical process control chart.",
        "",
        "## Key Config Fields",
        "- x_column (string): Column for X axis",
        "- y_columns (array of strings): Columns for Y axis / values",
        "- color_column (string): Column for color grouping / series split",
        "- show_legend (boolean): Show chart legend (default: true)",
        "- show_values (boolean): Display data values on chart (default: false)",
        "- color_palette (string): 'default', 'pastel', 'vivid', 'bold', 'dark', 'earth'",
        "- number_format (string): '', 'percent', 'currency', 'compact'",
        "- sort_order (string): 'none', 'asc', 'desc'",
        "- stack_mode (string): 'none', 'stacked', 'grouped', 'percent' (bar/area)",
        "- line_shape (string): 'linear', 'spline' (line charts)",
        "- show_markers (boolean): Show data point markers (line charts)",
        "- orientation (string): 'vertical', 'horizontal' (bar charts)",
        "- bins (integer): Number of histogram bins (default: 20)",
        "- kpi_target (number): Target value for KPI delta",
        "- kpi_prefix (string): Prefix before KPI number (e.g. '$')",
        "- kpi_suffix (string): Suffix after KPI number (e.g. '%')",
        "- donut_hole (number): Donut hole size 0-1 (default: 0.4)",
        "- x_axis_label (string): Custom X axis label",
        "- y_axis_label (string): Custom Y axis label",
        "- legend_position (string): 'auto', 'top', 'bottom', 'left', 'right'",
        "- metrics (array): [{column, aggregate, label}] for aggregation",
        "  - aggregate values: 'sum', 'avg', 'count', 'min', 'max', 'count_distinct'",
        "- time_column (string): Column for time-based grouping",
        "- time_grain (string): 'raw', 'day', 'week', 'month', 'quarter', 'year'",
        "",
        "## Rules",
        "1. Choose the most appropriate chart type based on the user's description.",
        "2. Map available columns to x_column, y_columns, color_column intelligently.",
        "3. Only use columns that actually exist in the available columns list.",
        "4. Set sensible defaults for styling (color_palette, show_legend, etc.).",
        "5. If the user mentions aggregation (sum, average, count), add metrics.",
        "6. If the user mentions time trends, set time_column and time_grain.",
        "7. Optionally suggest a title that describes the chart.",
        "8. If you cannot determine a good config, pick reasonable defaults.",
        "9. Be concise in your explanation.",
    ]

    if columns:
        parts.append("")
        parts.append("## Available Columns")
        parts.append(", ".join(columns))

    if current_chart_type:
        parts.append("")
        parts.append(f"## Current Chart Type: {current_chart_type}")

    if current_config:
        parts.append("")
        parts.append("## Current Config")
        parts.append(json.dumps(current_config, indent=2))

    return "\n".join(parts)


# Tool definition for structured output from suggest-chart-config endpoint
SUGGEST_CHART_CONFIG_TOOL = {
    "type": "function",
    "function": {
        "name": "suggest_chart_config",
        "description": "Return a structured chart configuration based on the user's description.",
        "parameters": {
            "type": "object",
            "properties": {
                "chart_type": {
                    "type": "string",
                    "enum": [
                        "bar", "line", "area", "pie", "donut", "scatter",
                        "histogram", "kpi", "table", "pivot", "bar_h",
                        "combo", "heatmap", "box", "violin", "treemap",
                        "funnel", "waterfall", "pareto", "correlation", "control",
                    ],
                    "description": "The chart type to use",
                },
                "chart_config": {
                    "type": "object",
                    "description": "Chart configuration object with fields like x_column, y_columns, color_column, metrics, etc.",
                },
                "title": {
                    "type": "string",
                    "description": "Suggested chart title (optional)",
                },
                "explanation": {
                    "type": "string",
                    "description": "Brief explanation of why this config was chosen (1-2 sentences)",
                },
            },
            "required": ["chart_type", "chart_config"],
        },
    },
}


def build_parse_filters_prompt(columns: list[dict]) -> str:
    """Build prompt for natural-language dashboard filter parsing."""
    from datetime import date

    today = date.today().isoformat()

    col_lines = []
    for col in columns:
        col_lines.append(f"- {col['name']} (type: {col['type']})")

    return "\n".join([
        "You are an expert filter parser for a BI dashboard.",
        f"Today's date is {today}.",
        "The user will describe filters in natural language.",
        "You must call the `apply_filters` function with structured filter objects.",
        "",
        "## Available Columns",
        *col_lines,
        "",
        "## Filter Value Formats",
        "- Text column exact match: value is a string, e.g. \"USA\"",
        "- Text column multi-match: value is an array, e.g. [\"USA\", \"UK\"]",
        "- Date/timestamp range: value is {\"from\": \"YYYY-MM-DD\", \"to\": \"YYYY-MM-DD\"}",
        "- Number range: value is {\"from\": number, \"to\": number}",
        "- Number exact: value is a number",
        "",
        "## Date Interpretation Rules",
        "- \"last N days\" → {\"from\": \"<today - N days>\", \"to\": \"<today>\"}",
        "- \"last month\" → {\"from\": \"<first day of previous month>\", \"to\": \"<last day of previous month>\"}",
        "- \"this month\" → {\"from\": \"<first day of current month>\", \"to\": \"<today>\"}",
        "- \"this year\" → {\"from\": \"<Jan 1 of current year>\", \"to\": \"<today>\"}",
        "- \"yesterday\" → {\"from\": \"<yesterday>\", \"to\": \"<yesterday>\"}",
        "",
        "## Rules",
        "1. Only use column names from the Available Columns list above.",
        "2. Match user mentions to the closest column name (case-insensitive).",
        "3. For text filters, match the user's value to the column (e.g., \"for USA\" → country = \"USA\").",
        "4. For date filters, calculate actual dates relative to today.",
        "5. If a phrase is ambiguous, use the most likely interpretation.",
        "6. Return at least one filter. If nothing matches, return an empty filters array.",
    ])


PARSE_FILTERS_TOOL = {
    "type": "function",
    "function": {
        "name": "apply_filters",
        "description": "Apply filters to the dashboard based on the user's request",
        "parameters": {
            "type": "object",
            "properties": {
                "filters": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "column": {
                                "type": "string",
                                "description": "Column name from the available columns list",
                            },
                            "value": {
                                "description": "Filter value: string, number, array, or object with from/to for ranges",
                            },
                        },
                        "required": ["column", "value"],
                    },
                },
            },
            "required": ["filters"],
        },
    },
}


_AGENT_PROMPTS: dict[str, str] = {
    "data_analyst": (
        "\n## Agent: Data Analyst\n"
        "You are focused on data exploration and SQL.\n"
        "- Write efficient SELECT/WITH queries.\n"
        "- Use get_table_profile before writing SQL to understand columns and values.\n"
        "- Use validate_sql to check queries before execution.\n"
        "- Explain query results clearly: highlight key numbers, trends, and outliers.\n"
        "- Use semantic models when available for consistent metric definitions.\n"
        "- Prefer get_table_profile over get_sample + execute_sql — it gives everything in one call.\n"
    ),
    "chart_builder": (
        "\n## Agent: Chart Builder\n"
        "You are focused on chart creation and visualization.\n"
        "- Use quick_create_chart (preferred) for one-shot chart creation.\n"
        "- Use get_chart_config_schema to learn what fields a chart type supports.\n"
        "- Use preview_chart before create_chart to verify the output.\n"
        "- Prefer patch_chart_config over update_chart for config-only changes.\n"
        "- Choose chart types that best represent the data:\n"
        "  - Trends over time → line/area. Categories → bar. Part-of-whole → pie/donut.\n"
        "  - Distribution → histogram/box/violin. Correlation → scatter/heatmap.\n"
        "- Set sensible defaults: legends, axis labels, color palettes.\n"
    ),
    "dashboard_manager": (
        "\n## Agent: Dashboard Manager\n"
        "You are focused on dashboard organization and management.\n"
        "- Use search_content first to find existing dashboards.\n"
        "- Use clone_dashboard to duplicate dashboards with all charts and filters.\n"
        "- Use clone_chart to copy charts between dashboards.\n"
        "- Use add_filter to add interactive filters to dashboards.\n"
        "- Organize charts logically: related metrics together, KPIs at top.\n"
    ),
}


def build_agent_prompt(agent_key: str) -> str:
    """Return agent-specific system prompt additions."""
    return _AGENT_PROMPTS.get(agent_key, "")


def _load_glossary() -> list[dict]:
    """Load all glossary terms from database."""
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT term, definition, sql_hint FROM ai_glossary ORDER BY term"
        ))
        return [dict(r) for r in rows.mappings().all()]
