# Data Analysis

## Statistical Overlays

Add statistical analysis directly onto your charts. Available for line, bar, area, scatter, and combo charts.

### Trendlines

| Type | Description |
|------|-------------|
| **Linear** | Straight line of best fit (y = ax + b) |
| **Polynomial** | Curved fit with configurable degree (2-5) |
| **Exponential** | Exponential growth/decay fit |

### Moving Averages

| Type | Description |
|------|-------------|
| **Simple Moving Average (SMA)** | Average over a rolling window |
| **Exponential Moving Average (EMA)** | Weighted average giving more weight to recent data |

Configure the **window size** (number of periods) for both SMA and EMA.

### Confidence Bands

Display confidence intervals around your data. Shows the statistical range within which values are expected to fall.

### Anomaly Detection

Automatically highlight data points that deviate significantly from the expected pattern. Uses z-score based detection with configurable sensitivity.

### How to Add Overlays

1. Open a chart in the editor
2. Scroll down to the **Statistics** section in the left panel
3. Toggle on the desired overlay
4. Configure parameters (window size, degree, etc.)
5. Click **Preview** to see the overlay applied

## Data Transforms

Transforms create new computed columns from your data before visualization.

| Transform | Description | Use Case |
|-----------|-------------|----------|
| **Moving Average** | Rolling average over N periods | Smoothing noisy data |
| **Year-over-Year** | Percentage change vs. same period last year | Growth analysis |
| **Cumulative Sum** | Running total | Tracking accumulated values |
| **Z-Score** | Standard deviations from mean | Normalizing different scales |
| **Forecast** | Holt-Winters exponential smoothing | Predicting future values |

### How to Add Transforms

1. Open a chart in the editor
2. Scroll to the **Transforms** section
3. Click **Add Transform**
4. Select the transform type and configure parameters
5. The transform creates a new column available for axis mapping

## Column Formatting

Control how values are displayed in tables, pivot tables, and exports.

### Format Types

| Type | Example | Description |
|------|---------|-------------|
| **Number** | 1,234.56 | Decimal numbers with thousands separator |
| **Percent** | 45.2% | Percentage display |
| **Currency** | $1,234.00 | Currency with symbol |
| **Date** | 2026-02-10 | Date formatting with custom pattern |
| **Text** | ABC | Plain text (no formatting) |

### Format Options

| Option | Description |
|--------|-------------|
| **Decimals** | Number of decimal places (0-10) |
| **Prefix** | Text before the value (e.g., "$", "EUR ") |
| **Suffix** | Text after the value (e.g., "%", " units") |
| **Thousands Separator** | Toggle thousands grouping (1,234 vs 1234) |
| **Date Pattern** | Custom date format string |

### Bulk Formatting

1. In the chart editor, scroll to **Column Formats**
2. Select multiple columns using the checkboxes
3. Configure the format once — it applies to all selected columns
4. Formatting is applied in: chart tables, pivot tables, CSV export, and Excel export

## Conditional Formatting

Apply colors to cells based on their values. Available for table and pivot table chart types.

### Threshold Rules

Define rules like "if value > 100, color green":

1. Add a conditional formatting rule
2. Select one or more target columns
3. Choose **Threshold** type
4. Add sub-rules:
   - **Operator**: `>`, `>=`, `<`, `<=`, `=`, `!=`
   - **Value**: the threshold number
   - **Background Color**: cell background
   - **Text Color**: cell text color (optional)
5. Multiple sub-rules are evaluated top to bottom; first match wins

### Color Scales

Apply a gradient between two colors based on value range:

1. Add a conditional formatting rule
2. Select target columns
3. Choose **Color Scale** type
4. Set min color and max color
5. Values are mapped linearly between the min and max of the column

### Multi-Column Rules

A single rule can apply to multiple columns. Select columns as chips in the column selector — click to add/remove.
