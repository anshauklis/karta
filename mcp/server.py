import os
import json
from fastmcp import FastMCP
import api_client as api

mcp = FastMCP("Karta")


def _build_chart_config(
    chart_type: str,
    x_column: str | None = None,
    y_columns: list[str] | None = None,
    color_column: str | None = None,
    aggregate: str = "SUM",
    time_column: str | None = None,
    time_grain: str | None = None,
) -> dict:
    """Build chart_config from simplified parameters with sensible defaults."""
    config = {
        "show_legend": True,
        "legend_position": "auto",
        "show_values": False,
        "color_palette": "default",
        "number_format": "",
        "sort_order": "none",
    }
    if x_column:
        config["x_column"] = x_column
    if y_columns:
        config["y_columns"] = y_columns
    if color_column:
        config["color_column"] = color_column
    if time_column:
        config["time_column"] = time_column
        config["time_grain"] = time_grain or "month"
        config["time_range"] = "all"
    if y_columns and aggregate:
        config["metrics"] = [
            {"column": col, "aggregate": aggregate, "label": f"{aggregate}({col})"}
            for col in y_columns
        ]
    if chart_type == "bar":
        config["stack_mode"] = "none"
    elif chart_type == "bar_h":
        config["stack_mode"] = "none"
        config["orientation"] = "horizontal"
    elif chart_type in ("area",):
        config["stack_mode"] = "stacked"
    elif chart_type == "donut":
        config["donut_hole"] = 0.4
    elif chart_type == "histogram":
        config["bins"] = 20
    return config


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool
async def list_dashboards() -> str:
    """List all dashboards with id, title, slug, and icon."""
    dashboards = await api.get("/api/dashboards")
    items = [
        {"id": d["id"], "title": d["title"], "slug": d["url_slug"], "icon": d["icon"],
         "charts": d.get("chart_count", 0)}
        for d in dashboards
    ]
    return json.dumps(items, ensure_ascii=False)


@mcp.tool
async def get_dashboard(slug: str) -> str:
    """Get dashboard details and its charts by URL slug."""
    dashboard = await api.get(f"/api/dashboards/by-slug/{slug}")
    charts = await api.get(f"/api/dashboards/{dashboard['id']}/charts")
    chart_summaries = [
        {"id": c["id"], "title": c["title"], "type": c.get("chart_type"),
         "mode": c["mode"], "sql_query": c.get("sql_query", ""),
         "description": c.get("description", "")}
        for c in charts
    ]
    result = {
        "id": dashboard["id"],
        "title": dashboard["title"],
        "description": dashboard.get("description", ""),
        "icon": dashboard["icon"],
        "charts": chart_summaries,
    }
    return json.dumps(result, ensure_ascii=False)


@mcp.tool
async def list_connections() -> str:
    """List all database connections with id, name, type, host, and database."""
    connections = await api.get("/api/connections")
    items = [
        {"id": c["id"], "name": c["name"], "db_type": c["db_type"],
         "host": c["host"], "port": c["port"], "database": c["database_name"]}
        for c in connections
    ]
    return json.dumps(items, ensure_ascii=False)


@mcp.tool
async def get_schema(connection_id: int) -> str:
    """Get all tables and their columns for a database connection.

    Args:
        connection_id: The database connection ID.
    """
    tables = await api.get(f"/api/connections/{connection_id}/schema")
    return json.dumps(tables, ensure_ascii=False)


@mcp.tool
async def get_table_sample(connection_id: int, table_name: str, limit: int = 10) -> str:
    """Get first N rows from a table to understand data format.

    Args:
        connection_id: The database connection ID.
        table_name: Name of the table to sample.
        limit: Number of rows to return (default 10, max 50).
    """
    result = await api.get(
        f"/api/connections/{connection_id}/schema/{table_name}/sample",
        limit=limit,
    )
    return json.dumps(result, ensure_ascii=False)


@mcp.tool
async def get_table_profile(connection_id: int, table_name: str) -> str:
    """Get column types, sample values, and distinct counts for a table.

    Returns everything needed to write correct SQL: columns with types,
    3 sample rows, row count, and top distinct values per string column.

    Args:
        connection_id: The database connection ID.
        table_name: Name of the table to profile.
    """
    result = await api.get(
        f"/api/connections/{connection_id}/schema/{table_name}/profile",
    )
    return json.dumps(result, ensure_ascii=False)


@mcp.tool
async def quick_create_chart(
    connection_id: int,
    sql_query: str,
    title: str,
    chart_type: str = "bar",
    x_column: str | None = None,
    y_columns: list[str] | None = None,
    color_column: str | None = None,
    aggregate: str = "SUM",
    dashboard_id: int | None = None,
) -> str:
    """Create a chart in one shot: auto-creates dataset from SQL, then chart.

    This is the fastest way to create a chart — no need to create a dataset first.

    Args:
        connection_id: Database connection ID.
        sql_query: SELECT query for the chart data.
        title: Chart title.
        chart_type: Chart type (bar, line, pie, table, kpi, etc).
        x_column: X-axis column name.
        y_columns: List of Y-axis column names.
        color_column: Column to group/color by.
        aggregate: Aggregation: SUM, AVG, COUNT, MIN, MAX.
        dashboard_id: Dashboard ID to add chart to (optional).
    """
    payload = {
        "connection_id": connection_id,
        "sql_query": sql_query,
        "title": title,
        "chart_type": chart_type,
    }
    if x_column:
        payload["x_column"] = x_column
    if y_columns:
        payload["y_columns"] = y_columns
    if color_column:
        payload["color_column"] = color_column
    if aggregate:
        payload["aggregate"] = aggregate
    if dashboard_id:
        payload["dashboard_id"] = dashboard_id

    result = await api.post("/api/charts/quick", payload)
    return json.dumps(
        {"id": result["id"], "title": result["title"], "dataset_id": result.get("dataset_id"),
         "dashboard_id": result.get("dashboard_id")},
        ensure_ascii=False,
    )


@mcp.tool
async def execute_sql(connection_id: int, sql: str, limit: int = 100) -> str:
    """Execute a SQL query on a database connection and return results.

    Args:
        connection_id: The database connection ID.
        sql: The SQL query to execute (SELECT only).
        limit: Maximum number of rows to return (default 100).
    """
    result = await api.post("/api/sql/execute", {
        "connection_id": connection_id,
        "sql": sql,
        "limit": limit,
    })
    return json.dumps(result, ensure_ascii=False)


@mcp.tool
async def execute_chart(chart_id: int) -> str:
    """Execute a saved chart and return its data and figure.

    Args:
        chart_id: The chart ID to execute.
    """
    result = await api.post(f"/api/charts/{chart_id}/execute")
    # Truncate rows for readability
    if "rows" in result and len(result["rows"]) > 50:
        result["rows"] = result["rows"][:50]
        result["rows_truncated"] = True
    return json.dumps(result, ensure_ascii=False)


@mcp.tool
async def list_alerts() -> str:
    """List all alert rules with their status."""
    alerts = await api.get("/api/alerts")
    items = [
        {"id": a["id"], "name": a["name"], "alert_type": a["alert_type"],
         "severity": a["severity"], "is_active": a["is_active"],
         "schedule": a.get("schedule", "")}
        for a in alerts
    ]
    return json.dumps(items, ensure_ascii=False)


@mcp.tool
async def get_alert_history(limit: int = 20) -> str:
    """Get recent alert trigger history.

    Args:
        limit: Number of recent alerts to return (default 20).
    """
    history = await api.get("/api/alert-history", limit=limit)
    return json.dumps(history, ensure_ascii=False)


@mcp.tool
async def list_datasets() -> str:
    """List all datasets with id, name, type, and connection info."""
    datasets = await api.get("/api/datasets")
    items = [
        {"id": d["id"], "name": d["name"], "dataset_type": d.get("dataset_type", "virtual"),
         "connection_id": d.get("connection_id"), "description": d.get("description", "")}
        for d in datasets
    ]
    return json.dumps(items, ensure_ascii=False)


@mcp.tool
async def create_dataset(
    connection_id: int,
    name: str,
    sql_query: str,
    description: str = "",
) -> str:
    """Create a virtual dataset from a SQL query.

    Args:
        connection_id: Database connection ID.
        name: Human-readable dataset name.
        sql_query: SELECT query that defines the dataset.
        description: Optional description.
    """
    result = await api.post("/api/datasets", {
        "connection_id": connection_id,
        "name": name,
        "sql_query": sql_query,
        "description": description,
        "dataset_type": "virtual",
    })
    return json.dumps({"id": result["id"], "name": result["name"]}, ensure_ascii=False)


@mcp.tool
async def create_chart(
    dataset_id: int,
    title: str,
    chart_type: str,
    x_column: str | None = None,
    y_columns: list[str] | None = None,
    color_column: str | None = None,
    aggregate: str = "SUM",
    time_column: str | None = None,
    time_grain: str | None = None,
    dashboard_id: int | None = None,
    sql_query: str | None = None,
) -> str:
    """Create a chart with simplified parameters. Builds chart_config automatically.

    Available chart types: bar, line, area, pie, donut, table, kpi, scatter,
    histogram, pivot, bar_h, combo, heatmap, box, violin, treemap, funnel,
    waterfall, pareto, correlation, control.

    Args:
        dataset_id: Dataset ID to use as data source.
        title: Chart title.
        chart_type: Chart type (bar, line, pie, table, kpi, scatter, area, etc).
        x_column: X-axis column name.
        y_columns: List of Y-axis column names (metrics).
        color_column: Column to group/color by.
        aggregate: Aggregation function: SUM, AVG, COUNT, MIN, MAX, COUNT_DISTINCT.
        time_column: Column for time-based grouping.
        time_grain: Time granularity: raw, day, week, month, quarter, year.
        dashboard_id: Dashboard ID to add chart to. Omit for standalone chart.
        sql_query: Custom SQL query. Overrides dataset's default query.
    """
    config = _build_chart_config(
        chart_type, x_column, y_columns, color_column,
        aggregate, time_column, time_grain,
    )
    payload = {
        "title": title,
        "dataset_id": dataset_id,
        "chart_type": chart_type,
        "chart_config": config,
        "mode": "visual",
    }
    if sql_query:
        payload["sql_query"] = sql_query
    if dashboard_id:
        payload["dashboard_id"] = dashboard_id

    if dashboard_id:
        result = await api.post(f"/api/dashboards/{dashboard_id}/charts", payload)
    else:
        result = await api.post("/api/charts", payload)

    return json.dumps(
        {"id": result["id"], "title": result["title"], "dashboard_id": result.get("dashboard_id")},
        ensure_ascii=False,
    )


@mcp.tool
async def update_chart(
    chart_id: int,
    title: str | None = None,
    chart_type: str | None = None,
    chart_config: dict | None = None,
    sql_query: str | None = None,
) -> str:
    """Update an existing chart. Use for fine-tuning after create_chart.

    Args:
        chart_id: Chart ID to update.
        title: New chart title.
        chart_type: New chart type.
        chart_config: Full chart_config dict for advanced configuration.
        sql_query: New SQL query.
    """
    payload = {}
    if title is not None:
        payload["title"] = title
    if chart_type is not None:
        payload["chart_type"] = chart_type
    if chart_config is not None:
        payload["chart_config"] = chart_config
    if sql_query is not None:
        payload["sql_query"] = sql_query
    result = await api.put(f"/api/charts/{chart_id}", payload)
    return json.dumps({"id": result["id"], "title": result["title"]}, ensure_ascii=False)


@mcp.tool
async def delete_chart(chart_id: int) -> str:
    """Delete a chart.

    Args:
        chart_id: Chart ID to delete.
    """
    await api.delete(f"/api/charts/{chart_id}")
    return json.dumps({"deleted": True, "chart_id": chart_id})


@mcp.tool
async def preview_chart(
    dataset_id: int,
    chart_type: str,
    x_column: str | None = None,
    y_columns: list[str] | None = None,
    color_column: str | None = None,
    aggregate: str = "SUM",
    time_column: str | None = None,
    time_grain: str | None = None,
    sql_query: str | None = None,
) -> str:
    """Preview a chart without saving. Use to verify data before creating.

    Args:
        dataset_id: Dataset ID to use as data source.
        chart_type: Chart type (bar, line, pie, table, kpi, etc).
        x_column: X-axis column name.
        y_columns: List of Y-axis column names (metrics).
        color_column: Column to group/color by.
        aggregate: Aggregation function: SUM, AVG, COUNT, MIN, MAX, COUNT_DISTINCT.
        time_column: Column for time-based grouping.
        time_grain: Time granularity: raw, day, week, month, quarter, year.
        sql_query: Custom SQL query. Overrides dataset's default query.
    """
    config = _build_chart_config(
        chart_type, x_column, y_columns, color_column,
        aggregate, time_column, time_grain,
    )
    payload = {
        "dataset_id": dataset_id,
        "chart_type": chart_type,
        "chart_config": config,
        "mode": "visual",
    }
    if sql_query:
        payload["sql_query"] = sql_query
    result = await api.post("/api/charts/preview", payload)
    if "rows" in result and len(result["rows"]) > 30:
        result["rows"] = result["rows"][:30]
        result["rows_truncated"] = True
    return json.dumps(result, ensure_ascii=False, default=str)


@mcp.tool
async def create_dashboard(
    title: str,
    description: str = "",
    icon: str = "📊",
) -> str:
    """Create a new dashboard.

    Args:
        title: Dashboard title.
        description: Optional description.
        icon: Emoji icon for the dashboard.
    """
    result = await api.post("/api/dashboards", {
        "title": title,
        "description": description,
        "icon": icon,
    })
    return json.dumps(
        {"id": result["id"], "title": result["title"], "slug": result["url_slug"]},
        ensure_ascii=False,
    )


@mcp.tool
async def add_filter(
    dashboard_id: int,
    label: str,
    column: str,
    dataset_id: int,
    filter_type: str = "select",
) -> str:
    """Add a filter to a dashboard.

    Args:
        dashboard_id: Dashboard ID.
        label: Filter label shown in UI.
        column: Column name to filter on.
        dataset_id: Dataset ID for filter values.
        filter_type: Filter type: select, multi_select, date_range, number_range.
    """
    result = await api.post(f"/api/dashboards/{dashboard_id}/filters", {
        "label": label,
        "target_column": column,
        "filter_type": filter_type,
        "config": {"dataset_id": dataset_id, "column": column},
    })
    return json.dumps(
        {"id": result["id"], "label": result["label"]},
        ensure_ascii=False,
    )


@mcp.tool
async def patch_chart_config(chart_id: int, config_updates: dict) -> str:
    """Partially update chart config. Set keys to null to delete them.
    Preferred over update_chart for incremental config changes.

    Args:
        chart_id: Chart ID to update.
        config_updates: Config keys to change. Null values delete the key.
    """
    result = await api.patch(f"/api/charts/{chart_id}/config", config_updates)
    return json.dumps({"id": result["id"], "title": result["title"], "chart_config": result.get("chart_config")}, ensure_ascii=False)


@mcp.tool
async def get_chart_config_schema(chart_type: str) -> str:
    """Get config schema for a chart type. Shows available fields, types, and valid values.

    Args:
        chart_type: Chart type (bar, line, pie, table, kpi, scatter, etc).
    """
    result = await api.get(f"/api/meta/chart-config-schema/{chart_type}")
    return json.dumps(result, ensure_ascii=False)


@mcp.tool
async def clone_chart(chart_id: int, target_dashboard_id: int | None = None, title: str | None = None) -> str:
    """Clone a chart, optionally to a different dashboard.

    Args:
        chart_id: Source chart ID to clone.
        target_dashboard_id: Target dashboard. Omit to clone in same dashboard.
        title: Title for the clone. Default: original + ' (Copy)'.
    """
    payload = {}
    if target_dashboard_id is not None:
        payload["target_dashboard_id"] = target_dashboard_id
    if title is not None:
        payload["title"] = title
    result = await api.post(f"/api/charts/{chart_id}/duplicate", payload if payload else None)
    return json.dumps({"id": result["id"], "title": result["title"], "dashboard_id": result.get("dashboard_id")}, ensure_ascii=False)


@mcp.tool
async def validate_sql(connection_id: int, sql: str) -> str:
    """Validate SQL without executing. Returns column info if valid.

    Args:
        connection_id: Database connection ID.
        sql: SQL query to validate.
    """
    result = await api.post("/api/sql/validate", {"connection_id": connection_id, "sql": sql})
    return json.dumps(result, ensure_ascii=False)


@mcp.tool
async def clone_dashboard(dashboard_id: int) -> str:
    """Clone an entire dashboard with all tabs, charts, and filters.

    Args:
        dashboard_id: Dashboard ID to clone.
    """
    result = await api.post(f"/api/dashboards/{dashboard_id}/clone")
    return json.dumps({"id": result["id"], "title": result["title"], "slug": result.get("url_slug")}, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("MCP_PORT", "8811"))
    mcp.run(transport="http", host="0.0.0.0", port=port)
