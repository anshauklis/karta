# Chart Types Reference

## Standard Charts

| Type | Key | Best For |
|------|-----|----------|
| Bar | `bar` | Comparing categories |
| Horizontal Bar | `bar_h` | Long category labels |
| Line | `line` | Trends over time |
| Area | `area` | Volume over time |
| Pie | `pie` | Part-of-whole (few categories) |
| Donut | `donut` | Part-of-whole with center label |
| Scatter | `scatter` | Correlations between variables |
| Histogram | `histogram` | Value distributions |
| Heatmap | `heatmap` | Two-dimensional patterns |
| Box Plot | `box` | Statistical distributions |
| Treemap | `treemap` | Hierarchical proportions |
| Funnel | `funnel` | Conversion pipelines |
| Waterfall | `waterfall` | Cumulative effect of values |
| Combo | `combo` | Mixed bar + line on dual axes |
| KPI Card | `kpi` | Single metric with target |

## Advanced Charts

| Type | Key | Best For |
|------|-----|----------|
| Correlation Matrix | `correlation` | Variable relationships |
| Violin | `violin` | Distribution shape comparison |
| Pareto | `pareto` | 80/20 analysis |
| Control Chart (SPC) | `control` | Process control with UCL/LCL |

## Data Views

| Type | Key | Best For |
|------|-----|----------|
| Pivot Table | `pivot` | Cross-tabulation with aggregation |
| Data Table | `table` | Raw data with sorting and formatting |

## Feature Support Matrix

| Feature | Supported Chart Types |
|---------|----------------------|
| **Color By** | bar, bar_h, line, area, scatter, histogram, heatmap, box, treemap, violin |
| **Stack Mode** | bar, bar_h, area |
| **Sort Order** | bar, bar_h, scatter, line, funnel, pareto |
| **Statistical Overlays** | line, bar, area, scatter, combo |
| **Conditional Formatting** | pivot, table |
| **Column Formatting** | pivot, table |
| **Excel Export** | All chart types with table data |
| **CSV Export** | All chart types |
| **Fullscreen** | All chart types |
| **Duplicate** | All chart types |
