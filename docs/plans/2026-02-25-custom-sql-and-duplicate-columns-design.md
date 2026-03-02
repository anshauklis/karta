# Custom SQL Expressions + Duplicate Columns — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Superset-style Custom SQL expressions for metrics, dimensions, and filters in the chart editor, plus allow duplicate columns in Y-axis/metrics.

**Architecture:** Custom SQL expressions are stored in `chart_config` alongside existing simple fields. When any custom SQL expression is present, the backend wraps the base query as a subquery and builds a proper aggregation SQL query executed on the database. Simple metrics without custom SQL continue using the existing pandas-based pipeline.

**Tech Stack:** Next.js 16 (frontend), FastAPI (backend), shadcn/ui, SQLAlchemy text() queries, pandas

---

## Task 1: Update TypeScript types

**Files:**
- Modify: `frontend/src/types/index.ts:210-214`

**Step 1: Extend ChartMetric interface**

Replace lines 210-214 in `frontend/src/types/index.ts`:

```typescript
export interface ChartMetric {
  column: string;
  aggregate: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "COUNT_DISTINCT";
  label: string;
  expressionType?: "simple" | "custom_sql";
  sqlExpression?: string;
}
```

The new fields are optional — existing charts remain compatible.

**Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: extend ChartMetric type with custom SQL fields"
```

---

## Task 2: Update Metrics UI — add Simple/Custom SQL tabs

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/data-tab.tsx:568-650`

**Step 1: Add expressionType to new metric default**

In the "+ Add Metric" button onClick (line 576), change the default metric:

```typescript
{ column: "", aggregate: "SUM", label: "", expressionType: "simple" }
```

**Step 2: Add tab switcher and Custom SQL mode to each metric row**

Replace the metric row rendering (lines 591-647) with a new version that includes:

1. A `Simple | Custom SQL` tab switcher at the top of each metric
2. When `expressionType === "simple"`: show existing aggregate + column dropdowns (no changes)
3. When `expressionType === "custom_sql"`: show a monospace text input for `sqlExpression` and a required label input
4. When switching from simple to custom_sql: auto-populate `sqlExpression` with `{aggregate}({column})` if both are set
5. When switching from custom_sql to simple: keep existing column/aggregate values

The metric row should look like this:

```tsx
<div key={idx} className="space-y-1.5 rounded-md border border-border/50 p-2">
  {/* Tab switcher */}
  <div className="flex items-center justify-between">
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      <button
        onClick={() => { /* set expressionType to "simple" */ }}
        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
          (m.expressionType || "simple") === "simple"
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Simple
      </button>
      <button
        onClick={() => { /* set expressionType to "custom_sql", auto-fill sqlExpression */ }}
        className={/* same pattern */}
      >
        Custom SQL
      </button>
    </div>
    <button onClick={() => { /* delete metric */ }} className="text-red-400 hover:text-red-600">
      <Trash2 className="h-3 w-3" />
    </button>
  </div>

  {/* Simple mode: existing aggregate + column dropdowns */}
  {(m.expressionType || "simple") === "simple" && (
    <div className="flex items-center gap-1">
      {/* Existing aggregate Select */}
      {/* Existing column Select */}
    </div>
  )}

  {/* Custom SQL mode: expression input + label input */}
  {m.expressionType === "custom_sql" && (
    <div className="space-y-1.5">
      <Input
        className="h-7 text-[11px] font-mono"
        placeholder="SUM(amount) / COUNT(DISTINCT user_id)"
        value={m.sqlExpression || ""}
        onChange={(e) => { /* update sqlExpression */ }}
      />
      <Input
        className="h-7 text-[11px]"
        placeholder="Label (required)"
        value={m.label || ""}
        onChange={(e) => { /* update label, sync y_columns */ }}
      />
    </div>
  )}
</div>
```

**Step 3: Update y_columns sync logic**

When updating metrics, the `y_columns` sync needs to handle custom SQL metrics:

```typescript
const labels = updated.map(mm => {
  if (mm.expressionType === "custom_sql") return mm.label || mm.sqlExpression || "";
  return mm.label || `${mm.aggregate}(${mm.column})`;
});
updateConfig("y_columns", labels);
```

**Step 4: Commit**

```bash
git add frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/data-tab.tsx
git commit -m "feat: add Simple/Custom SQL tabs to metric configuration"
```

---

## Task 3: Update X-axis and Color UI — add Custom SQL toggle

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/data-tab.tsx:444-495`
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/page.tsx` (handleDragEnd for x/color)

**Step 1: Add Custom SQL toggle for X-axis**

Below the X-axis DropZone (line 454), add a toggle that switches between:
- **Simple mode** (default): the existing DropZone for column selection
- **Custom SQL mode**: a text input for SQL expression + label input

When `x_expression_type === "custom_sql"`:
- Hide the DropZone
- Show a monospace Input for `x_custom_sql` expression
- Show a Label input for the display name (stored back in `x_column` as alias)

```tsx
{showXAxis && (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-medium text-muted-foreground">
        {isHistogram ? "Column to bin" : "X Axis"}
      </span>
      <div className="flex gap-0.5 rounded-md border border-border p-0.5">
        <button onClick={() => updateConfig("x_expression_type", "simple")}
          className={/* toggle styles */}>Simple</button>
        <button onClick={() => updateConfig("x_expression_type", "custom_sql")}
          className={/* toggle styles */}>SQL</button>
      </div>
    </div>
    {(chartConfig.x_expression_type || "simple") === "simple" ? (
      <DropZone id="zone-x" /* existing props */ />
    ) : (
      <div className="space-y-1">
        <Input className="h-7 text-[11px] font-mono"
          placeholder="DATE_TRUNC('month', created_at)"
          value={(chartConfig.x_custom_sql as string) || ""}
          onChange={(e) => updateConfig("x_custom_sql", e.target.value)} />
        <Input className="h-7 text-[11px]"
          placeholder="Label (e.g. month)"
          value={(chartConfig.x_column as string) || ""}
          onChange={(e) => updateConfig("x_column", e.target.value)} />
      </div>
    )}
  </div>
)}
```

**Step 2: Same pattern for Color/Group**

Apply same toggle pattern for the Color DropZone (lines 485-495). Fields: `color_expression_type`, `color_custom_sql`, `color_column` (as alias).

**Step 3: Commit**

```bash
git add frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/data-tab.tsx
git add frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/page.tsx
git commit -m "feat: add Custom SQL toggle for X-axis and Color dimensions"
```

---

## Task 4: Update Filters UI — add Custom SQL option

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/data-tab.tsx:654-730`

**Step 1: Add expressionType to new filter default**

Change the "+ Add Filter" default (line 661):

```typescript
{ column: "", operator: "=", value: "", expressionType: "simple" }
```

**Step 2: Add toggle to each filter row**

Each filter row gets a Simple/SQL toggle:

- **Simple** (default): existing column + operator + value
- **Custom SQL**: single text input for raw SQL WHERE expression (e.g. `revenue / units > 100`)

```tsx
<div key={idx} className="space-y-1">
  <div className="flex items-center gap-1">
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      <button onClick={() => { /* set expressionType to "simple" */ }}
        className={/* toggle styles */}>Simple</button>
      <button onClick={() => { /* set expressionType to "custom_sql" */ }}
        className={/* toggle styles */}>SQL</button>
    </div>
    <button onClick={() => /* delete */} className="text-red-400 hover:text-red-600 ml-auto">
      <Trash2 className="h-3 w-3" />
    </button>
  </div>
  {(f.expressionType || "simple") === "simple" ? (
    <div className="flex items-center gap-1">
      {/* Existing column + operator + value selects */}
    </div>
  ) : (
    <Input className="h-7 text-[11px] font-mono"
      placeholder="revenue / units > 100"
      value={f.sqlExpression || ""}
      onChange={(e) => { /* update sqlExpression */ }} />
  )}
</div>
```

**Step 3: Commit**

```bash
git add frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/components/data-tab.tsx
git commit -m "feat: add Custom SQL option to chart filters"
```

---

## Task 5: Allow duplicate columns in Y-axis/metrics

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/page.tsx` (handleDragEnd, handleYColumnsChange)

**Step 1: Find and remove duplicate prevention logic**

In `page.tsx`, the `handleDragEnd` function for zone-y likely checks if the column already exists in `y_columns` and skips it. Remove this check to allow duplicates.

Similarly, the `handleYColumnsChange` function may toggle columns (add if missing, remove if present). Change it to always add (never check for existing).

The metrics array already uses index-based keys (`key={idx}`) so duplicates don't cause React key issues.

**Step 2: Handle duplicate column names in pandas aggregation**

In the backend `_apply_metrics_df` (line 1243-1260), when two metrics use the same column with different aggregations (e.g., `SUM(revenue)` and `AVG(revenue)`), the current `agg_dict[col] = pd_agg` overwrites the first. Fix by using pandas `NamedAgg`:

```python
# Instead of: agg_dict[col] = pd_agg
# Use named aggregation:
agg_specs = {}
for m in metrics:
    col = m.get("column", "")
    agg = m.get("aggregate", "SUM").upper()
    label = m.get("label", f"{agg}({col})")

    if agg == "COUNT" and col == "*":
        count_col = next((c for c in df.columns if c not in group_cols), group_cols[0])
        agg_specs[label] = pd.NamedAgg(column=count_col, aggfunc="count")
    elif col in df.columns:
        agg_map = {"SUM": "sum", "AVG": "mean", "COUNT": "count",
                   "MIN": "min", "MAX": "max", "COUNT_DISTINCT": "nunique"}
        pd_agg = agg_map.get(agg, "sum")
        agg_specs[label] = pd.NamedAgg(column=col, aggfunc=pd_agg)

result = df.groupby(group_cols, sort=True, dropna=False).agg(**agg_specs).reset_index()
```

This eliminates the rename step and handles duplicate columns natively.

**Step 3: Commit**

```bash
git add frontend/src/app/(dashboard)/dashboard/[slug]/chart/[id]/page.tsx
git add api/charts/router.py
git commit -m "feat: allow duplicate columns in Y-axis and fix aggregation"
```

---

## Task 6: Backend — handle Custom SQL expressions

**Files:**
- Modify: `api/charts/router.py:1138-1294` (_apply_chart_filters_df, _apply_metrics_df, _apply_pipeline)
- Modify: `api/sql_validator.py` (add `validate_sql_expression` function)

**Step 1: Add expression validator to sql_validator.py**

Add a new function `validate_sql_expression()` for validating SQL fragments (not full queries):

```python
def validate_sql_expression(expr: str) -> str:
    """Validate a SQL expression fragment (for use in SELECT/WHERE/GROUP BY).

    Unlike validate_sql(), this doesn't require SELECT prefix or add LIMIT.
    It only checks for dangerous keywords/functions and subqueries.
    """
    expr = expr.strip()
    if not expr:
        raise SQLValidationError("Empty expression")

    stripped = _strip_sql_comments(expr)
    check_str = _strip_string_literals(stripped)

    # Block semicolons
    if ";" in check_str:
        raise SQLValidationError("Semicolons are not allowed in expressions")

    # Block forbidden keywords
    match = _FORBIDDEN_RE.search(check_str)
    if match:
        raise SQLValidationError(f"Forbidden keyword: {match.group().upper()}")

    # Block subqueries (SELECT inside expression)
    if re.search(r'\bSELECT\b', check_str, re.IGNORECASE):
        raise SQLValidationError("Subqueries are not allowed in expressions")

    return expr
```

**Step 2: Update `_apply_metrics_df` to handle custom SQL metrics**

When a metric has `expressionType == "custom_sql"`, it cannot be processed in pandas. Instead, skip it in the pandas pipeline and mark it for SQL execution.

Add a new function `_has_custom_sql(config)` that checks if any metric, x-axis, color, or filter uses custom SQL.

Add a new function `_build_custom_sql_query(base_sql, config)` that wraps the base query:

```python
def _build_custom_sql_query(base_sql: str, config: dict) -> str:
    """Build an aggregation query wrapping the base SQL when custom SQL expressions are used."""
    from api.sql_validator import validate_sql_expression

    select_parts = []
    group_by_parts = []
    where_parts = []

    # Handle X-axis
    x_expr_type = config.get("x_expression_type", "simple")
    x_col = config.get("x_column", "")
    if x_expr_type == "custom_sql":
        x_sql = validate_sql_expression(config.get("x_custom_sql", ""))
        alias = x_col or "x"
        select_parts.append(f'{x_sql} AS "{alias}"')
        group_by_parts.append(x_sql)
    elif x_col:
        select_parts.append(f'"{x_col}"')
        group_by_parts.append(f'"{x_col}"')

    # Handle Color
    color_expr_type = config.get("color_expression_type", "simple")
    color_col = config.get("color_column", "")
    if color_expr_type == "custom_sql":
        color_sql = validate_sql_expression(config.get("color_custom_sql", ""))
        alias = color_col or "color"
        select_parts.append(f'{color_sql} AS "{alias}"')
        group_by_parts.append(color_sql)
    elif color_col:
        select_parts.append(f'"{color_col}"')
        group_by_parts.append(f'"{color_col}"')

    # Handle Metrics
    metrics = config.get("metrics", [])
    for m in metrics:
        if m.get("expressionType") == "custom_sql":
            expr = validate_sql_expression(m.get("sqlExpression", ""))
            label = m.get("label", "metric")
            select_parts.append(f'{expr} AS "{label}"')
        else:
            col = m.get("column", "")
            agg = m.get("aggregate", "SUM").upper()
            label = m.get("label", f"{agg}({col})")
            if agg == "COUNT" and col == "*":
                select_parts.append(f'COUNT(*) AS "{label}"')
            elif col:
                agg_sql = "COUNT(DISTINCT" if agg == "COUNT_DISTINCT" else agg
                close = ")" if agg != "COUNT_DISTINCT" else ")"
                if agg == "COUNT_DISTINCT":
                    select_parts.append(f'COUNT(DISTINCT "{col}") AS "{label}"')
                else:
                    select_parts.append(f'{agg}("{col}") AS "{label}"')

    # Handle custom SQL filters
    filters = config.get("chart_filters", [])
    for f in filters:
        if f.get("expressionType") == "custom_sql":
            expr = validate_sql_expression(f.get("sqlExpression", ""))
            where_parts.append(f"({expr})")
        else:
            col = f.get("column", "")
            op = f.get("operator", "=")
            val = f.get("value", "")
            if col and val is not None:
                # Simple filter — build WHERE clause
                if op in ("IN", "NOT IN"):
                    vals = ", ".join(f"'{v.strip()}'" for v in str(val).split(","))
                    where_parts.append(f'"{col}" {op} ({vals})')
                elif op == "LIKE":
                    where_parts.append(f'"{col}" LIKE \'%{val}%\'')
                else:
                    where_parts.append(f'"{col}" {op} \'{val}\'')

    # Build final query
    if not select_parts:
        select_parts.append("*")

    sql = f"SELECT {', '.join(select_parts)} FROM ({base_sql}) AS _t"

    if where_parts:
        sql += f" WHERE {' AND '.join(where_parts)}"

    if group_by_parts and metrics:
        sql += f" GROUP BY {', '.join(group_by_parts)}"

    return sql
```

**Step 3: Update `_apply_pipeline` to use SQL path when custom SQL is present**

In `_apply_pipeline` (line 1281), add a check at the top:

```python
def _has_custom_sql(config: dict) -> bool:
    """Check if any config element uses custom SQL expressions."""
    if config.get("x_expression_type") == "custom_sql":
        return True
    if config.get("color_expression_type") == "custom_sql":
        return True
    for m in config.get("metrics", []):
        if m.get("expressionType") == "custom_sql":
            return True
    for f in config.get("chart_filters", []):
        if f.get("expressionType") == "custom_sql":
            return True
    return False
```

When `_has_custom_sql(config)` is True, instead of running the pandas pipeline, return a flag that tells the caller to use the SQL-based aggregation query. The calling function (`preview_chart`/`execute_chart`) will then use `_build_custom_sql_query()` to build and execute the query, and skip the pandas-based `_apply_pipeline()` for the metrics/filters/dimensions that were handled in SQL.

**Step 4: Commit**

```bash
git add api/sql_validator.py api/charts/router.py
git commit -m "feat: backend support for Custom SQL expressions in charts"
```

---

## Task 7: Integration — wire up preview/execute with Custom SQL

**Files:**
- Modify: `api/charts/router.py` (preview_chart, execute_chart)

**Step 1: Update preview_chart and execute_chart**

In both endpoints, after resolving the base SQL query and before calling `_apply_pipeline()`:

1. Check `_has_custom_sql(chart_config)`
2. If True: call `_build_custom_sql_query(base_sql, chart_config)` to get the aggregation query
3. Execute the aggregation query on the database instead of the base query
4. Skip `_apply_metrics_df`, `_apply_chart_filters_df` in the pipeline (already handled in SQL)
5. Still apply time range/grain, calculated columns, row limit in pandas

**Step 2: Commit**

```bash
git add api/charts/router.py
git commit -m "feat: integrate Custom SQL into chart preview and execute flow"
```

---

## Task 8: Build, test manually, verify

**Step 1: Rebuild all services**

```bash
docker compose up --build -d
```

**Step 2: Manual test scenarios**

1. Create a chart with a simple metric (SUM of a column) — verify existing behavior works
2. Switch metric to Custom SQL, type `SUM(amount) / COUNT(DISTINCT user_id)` — verify it renders
3. Add two metrics on the same column: `SUM(revenue)` and `AVG(revenue)` — verify both render
4. Switch X-axis to Custom SQL: `DATE_TRUNC('month', created_at)` — verify grouping works
5. Add a Custom SQL filter: `revenue > 1000` — verify filtering works
6. Save chart, reload page — verify all custom SQL settings persist
7. Test on existing charts — verify nothing breaks (backward compatibility)

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Custom SQL expressions and duplicate columns in chart editor"
```
