# Charts

Charts are the building blocks of dashboards. Each chart has a SQL query, a visualization type, and a configuration.

## Creating a Chart

1. From a dashboard in edit mode, click **New Chart**
2. The chart editor opens with three areas:
   - **Left panel** — configuration (connection, SQL, chart type, visual options)
   - **Right panel** — preview (chart or table output)
   - **Top bar** — title, undo/redo, templates, actions (preview, save, save & close)

## Chart Editor Workflow

1. **Select a connection** — choose which database to query
2. **Write SQL** — enter your query in the Monaco editor
3. **Preview** — click Preview (or press {kbd}`Cmd+Enter`) to run the query and see results
4. **Choose chart type** — select from the 21 available chart types
5. **Configure** — map columns to axes, set colors, labels, and styling
6. **Save** — click Save ({kbd}`Cmd+S`) or Save & Close ({kbd}`Cmd+Shift+S`)

## Visual Builder

The visual builder provides point-and-click configuration for your charts. Available options depend on the selected chart type.

### Axis Mapping

| Option | Description | Available For |
|--------|-------------|---------------|
| **X Axis** | Column for the horizontal axis or category | Most chart types |
| **Y Axis** | One or more columns for values. Click to toggle selection. | Most chart types |
| **Color By** | Groups data by this column, assigning each unique value a different color | Bar, line, area, scatter, histogram, heatmap, box, treemap, violin |

### Styling Options

| Option | Description |
|--------|-------------|
| **Color Palette** | Choose from 6 built-in palettes: Default, Pastel, Vivid, Bold, Dark, Earth |
| **Show Legend** | Toggle the chart legend on/off |
| **Show Values** | Display data values directly on the chart |
| **X Axis Label** | Custom label for the X axis |
| **Y Axis Label** | Custom label for the Y axis |
| **Number Format** | Format string for numeric values |

### Stack & Sort

| Option | Description | Available For |
|--------|-------------|---------------|
| **Stack Mode** | None, Stacked, or Stacked 100% | Bar, horizontal bar, area |
| **Sort Order** | None, Ascending, or Descending by value | Bar, horizontal bar, scatter, line, funnel, pareto |

### KPI Card Options

| Option | Description |
|--------|-------------|
| **Target** | Target value to compare against |
| **Prefix** | Text before the value (e.g., "$") |
| **Suffix** | Text after the value (e.g., "%") |

### Histogram Options

| Option | Description |
|--------|-------------|
| **Bins** | Number of histogram bins (default: 20) |

### Pivot Table Options

| Option | Description |
|--------|-------------|
| **Rows** | Columns to use as row headers |
| **Columns** | Columns to spread horizontally (optional) |
| **Values** | Columns to aggregate |
| **Aggregation** | Sum, Average, Count, Min, or Max |

## Code Charts

Code charts give you full control by writing Python code that produces a Plotly figure.

### How It Works

1. In the chart editor, switch to **Code** mode
2. Write Python code in the Monaco editor
3. Available variables:
   - `df` — pandas DataFrame with your query results
   - `pd` — pandas library
   - `px` — plotly.express
   - `go` — plotly.graph_objects
   - `np` — numpy
4. Your code must produce a variable named `fig` (a Plotly figure)

### Example

```python
# Available: df (DataFrame), pd, px, go, np
# Must produce a 'fig' variable

fig = px.bar(df, x=df.columns[0], y=df.columns[1])
fig.update_layout(title="My Custom Chart")
```

### Advanced Example

```python
import plotly.graph_objects as go

fig = go.Figure()
fig.add_trace(go.Scatter(
    x=df["date"],
    y=df["revenue"],
    mode="lines+markers",
    name="Revenue",
    line=dict(color="#636EFA", width=2)
))
fig.add_trace(go.Bar(
    x=df["date"],
    y=df["costs"],
    name="Costs",
    marker_color="#EF553B",
    opacity=0.7
))
fig.update_layout(
    barmode="overlay",
    xaxis_title="Date",
    yaxis_title="Amount ($)"
)
```

### Security

Code charts execute in a restricted Python sandbox. The following are not available:
- File system access
- Network access
- System commands
- Module imports beyond the pre-loaded libraries

## Chart Templates

Templates let you save and reuse chart configurations without column-specific bindings.

### Saving a Template

1. Configure a chart with the desired type, styling, and options
2. In the toolbar, click **Save Template**
3. Enter a name for the template
4. The template saves: chart type, color palette, stack mode, sort order, formatting — but not column mappings (X axis, Y columns, Color By)

### Loading a Template

1. In the chart editor toolbar, open the **Templates** dropdown
2. Select a template — it applies the saved chart type and configuration
3. Map your columns as needed for the current dataset

Templates are stored in your browser's localStorage and are available across all dashboards.

## Undo / Redo

All chart configuration changes are tracked with a full undo/redo history:

- {kbd}`Cmd+Z` / {kbd}`Ctrl+Z` — undo the last configuration change
- {kbd}`Cmd+Shift+Z` / {kbd}`Ctrl+Shift+Z` — redo
- Toolbar buttons: **Undo** and **Redo** (with disabled state when history is empty)
- History tracks up to 50 configuration states

## Auto-Save Drafts

The chart editor automatically saves a draft to localStorage every 30 seconds.

- If the editor closes unexpectedly, a recovery banner appears on reopen: "Unsaved draft found"
- Click **Restore** to recover your unsaved changes
- Click **Dismiss** to discard the draft
- Drafts expire after 1 hour
- Drafts are cleared automatically on successful save
