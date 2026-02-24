import type { ColumnFormat } from "@/types";

/**
 * Convert a date pattern (DD.MM.YYYY etc.) to Python strftime format.
 */
function datePatternToStrftime(pattern: string): string {
  return pattern
    .replace(/YYYY/g, "%Y")
    .replace(/YY/g, "%y")
    .replace(/DD/g, "%d")
    .replace(/MM/g, "%m")
    .replace(/Mon/g, "%b");
}

/**
 * Generate Python/Plotly code from a visual chart configuration.
 * Pure function — no React hooks.
 */
export function generateCodeFromVisual(
  cfg: Record<string, unknown>,
  type: string,
  colorCol?: string
): string {
  const xCol = (cfg.x_column as string) || "df.columns[0]";
  const yCols = (cfg.y_columns as string[]) || [];
  const yCol = yCols.length > 0 ? yCols[0] : "df.columns[1]";
  const xRef = xCol === "df.columns[0]" ? xCol : `"${xCol}"`;
  const yRef = yCol === "df.columns[1]" ? yCol : `"${yCol}"`;
  const color = (cfg.color_column as string) || colorCol || "";
  const colorArg = color ? `, color="${color}"` : "";

  let code = `# Available: df (DataFrame), pd, px, go, np\n# Must produce a 'fig' variable\n\n`;

  // --- Special types (early returns) ---

  // Table
  if (type === "table") {
    code += `# Table mode — pd is pre-imported\n\n`;

    const timeCol = cfg.time_column as string | undefined;
    const timeGrain = cfg.time_grain as string | undefined;
    const timeRange = cfg.time_range as string | undefined;
    const sortCol = cfg.sort_column as string | undefined;
    const sortDir = cfg.sort_direction as string | undefined;

    // Start from full df
    code += `df_display = df.copy()\n\n`;

    // Time grain truncation + aggregation
    if (timeCol && timeGrain && timeGrain !== "raw") {
      const periodMap: Record<string, string> = { day: "D", week: "W", month: "M", quarter: "Q", year: "Y" };
      const period = periodMap[timeGrain] || "D";
      code += `# Time grain: ${timeGrain}\n`;
      code += `df_display["${timeCol}"] = pd.to_datetime(df_display["${timeCol}"], errors="coerce")\n`;
      code += `df_display = df_display.dropna(subset=["${timeCol}"])\n`;
      code += `df_display["${timeCol}"] = df_display["${timeCol}"].dt.to_period("${period}").dt.start_time\n`;
      // Aggregate: group by time_col, sum numeric, first for rest
      code += `numeric_cols = df_display.select_dtypes("number").columns.tolist()\n`;
      code += `agg = {c: "sum" if c in numeric_cols else "first" for c in df_display.columns if c != "${timeCol}"}\n`;
      code += `df_display = df_display.groupby("${timeCol}", sort=True, dropna=False).agg(agg).reset_index()\n\n`;
    }

    // Time range filter
    if (timeCol && timeRange && timeRange !== "all") {
      const rangeMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
      const days = rangeMap[timeRange];
      if (days) {
        code += `# Time range: ${timeRange}\n`;
        code += `_max_date = df_display["${timeCol}"].max()\n`;
        code += `df_display = df_display[df_display["${timeCol}"] >= _max_date - pd.Timedelta(days=${days})]\n\n`;
      }
    }

    // Column selection
    if (yCols.length > 0) {
      code += `columns = ${JSON.stringify(yCols)}\n`;
      code += `df_display = df_display[columns]\n\n`;
    }

    // Sort
    if (sortCol) {
      const asc = sortDir === "asc" ? "True" : "False";
      code += `df_display = df_display.sort_values("${sortCol}", ascending=${asc})\n\n`;
    } else if (timeCol) {
      code += `df_display = df_display.sort_values("${timeCol}")\n\n`;
    }

    // Column formatting
    const formats = (cfg.column_formats as Record<string, ColumnFormat>) || {};
    for (const [col, fmt] of Object.entries(formats)) {
      if (fmt.type === "date" && fmt.date_pattern) {
        const pyPattern = datePatternToStrftime(fmt.date_pattern);
        code += `df_display["${col}"] = pd.to_datetime(df_display["${col}"], errors="coerce").dt.strftime("${pyPattern}")\n`;
      } else if (fmt.type === "number" || fmt.type === "currency" || fmt.type === "percent") {
        const dec = fmt.decimals ?? 0;
        const prefix = fmt.prefix || (fmt.type === "currency" ? "$" : "");
        const suffix = fmt.suffix || (fmt.type === "percent" ? "%" : "");
        const thousands = fmt.thousands !== false ? "," : "";
        code += `df_display["${col}"] = df_display["${col}"].map(lambda x: f"${prefix}{x:${thousands}.${dec}f}${suffix}" if pd.notna(x) else "")\n`;
      }
    }
    code += `\nfig = None  # Table rendered from df_display\n`;
    return code;
  }

  // Pivot
  if (type === "pivot") {
    const pivotRows = (cfg.pivot_rows as string[]) || [];
    const pivotCols = (cfg.pivot_columns as string[]) || [];
    let pivotVals = (cfg.pivot_values as string[]) || [];
    const aggfuncs = (cfg.pivot_aggfuncs as Record<string, string>) || {};
    const valueLabels = (cfg.pivot_value_labels as Record<string, string>) || {};
    const valuesVisible = (cfg.pivot_values_visible as string[]) || [];
    const sortColumns = (cfg.sort_columns as string) || "none";
    const sortRows = (cfg.sort_rows as string) || "none";

    // Filter to visible values only
    if (valuesVisible.length > 0) {
      pivotVals = pivotVals.filter((v) => valuesVisible.includes(v));
    }

    code += `# Pivot Table — rendered server-side\n`;
    if (pivotRows.length > 0 && pivotVals.length > 0) {
      const aggMap: Record<string, string> = {
        sum: "sum", avg: "mean", count: "count", min: "min", max: "max",
        median: "median", count_distinct: "nunique", std: "std", var: "var",
        first: "first", last: "last",
      };
      const aggDict = pivotVals.map(
        (col) => `"${col}": "${aggMap[aggfuncs[col] || "sum"] || "sum"}"`
      ).join(", ");

      const colLimit = cfg.pivot_column_limit as number | undefined;
      if (colLimit && colLimit > 0 && pivotCols.length > 0) {
        code += `# Limit pivot columns to top ${colLimit}\n`;
        code += `_col = df.groupby("${pivotCols[0]}")["${pivotVals[0]}"].sum().nlargest(${colLimit}).index\n`;
        code += `df.loc[~df["${pivotCols[0]}"].isin(_col), "${pivotCols[0]}"] = "Other"\n`;
      }

      code += `pivot = df.pivot_table(\n`;
      code += `    index=${JSON.stringify(pivotRows)},\n`;
      if (pivotCols.length > 0) code += `    columns=${JSON.stringify(pivotCols)},\n`;
      code += `    values=${JSON.stringify(pivotVals)},\n`;
      code += `    aggfunc={${aggDict}},\n`;
      code += `    fill_value=0\n`;
      code += `)\n`;

      // Rename value metrics
      const activeLabels = Object.entries(valueLabels).filter(
        ([k, v]) => v && pivotVals.includes(k)
      );
      if (activeLabels.length > 0) {
        const renameDict = activeLabels.map(([k, v]) => `"${k}": "${v}"`).join(", ");
        code += `pivot = pivot.rename(columns={${renameDict}}, level=0)\n`;
      }

      if (sortColumns !== "none") {
        if (sortColumns === "key_asc") {
          code += `pivot = pivot.sort_index(axis=1)\n`;
        } else if (sortColumns === "key_desc") {
          code += `pivot = pivot.sort_index(axis=1, ascending=False)\n`;
        } else if (sortColumns === "value_asc") {
          code += `pivot = pivot[pivot.sum().sort_values().index]\n`;
        } else if (sortColumns === "value_desc") {
          code += `pivot = pivot[pivot.sum().sort_values(ascending=False).index]\n`;
        }
      }
      if (sortRows !== "none") {
        if (sortRows === "key_asc") {
          code += `pivot = pivot.sort_index(axis=0)\n`;
        } else if (sortRows === "key_desc") {
          code += `pivot = pivot.sort_index(axis=0, ascending=False)\n`;
        } else if (sortRows === "value_asc") {
          code += `pivot = pivot.loc[pivot.sum(axis=1).sort_values().index]\n`;
        } else if (sortRows === "value_desc") {
          code += `pivot = pivot.loc[pivot.sum(axis=1).sort_values(ascending=False).index]\n`;
        }
      }

      // Percentage mode — per-column overrides
      const pctModeGlobal = cfg.pivot_pct_mode as string | undefined;
      const pctModesPerCol = cfg.pivot_pct_modes as Record<string, string | null> | undefined;

      if (pctModesPerCol && Object.keys(pctModesPerCol).length > 0) {
        // Per-column: group columns by their effective mode
        const modeGroups: Record<string, string[]> = {};
        for (const val of pivotVals) {
          const mode = val in pctModesPerCol ? (pctModesPerCol[val] ?? undefined) : pctModeGlobal;
          if (mode) {
            (modeGroups[mode] ??= []).push(val);
          }
        }
        for (const [mode, cols] of Object.entries(modeGroups)) {
          const colList = cols.map((c) => `"${c}"`).join(", ");
          if (pivotCols.length > 0) {
            code += `_pct_cols = [c for c in pivot.columns if c[0] in [${colList}]]\n`;
          } else {
            code += `_pct_cols = [c for c in pivot.columns if c in [${colList}]]\n`;
          }
          if (mode === "row") {
            code += `pivot[_pct_cols] = pivot[_pct_cols].div(pivot[_pct_cols].sum(axis=1), axis=0) * 100\n`;
          } else if (mode === "column") {
            code += `pivot[_pct_cols] = pivot[_pct_cols].div(pivot[_pct_cols].sum(axis=0), axis=1) * 100\n`;
          } else if (mode === "total") {
            code += `pivot[_pct_cols] = pivot[_pct_cols] / pivot[_pct_cols].sum().sum() * 100\n`;
          }
        }
      } else if (pctModeGlobal === "row") {
        code += `pivot = pivot.div(pivot.sum(axis=1), axis=0) * 100\n`;
      } else if (pctModeGlobal === "column") {
        code += `pivot = pivot.div(pivot.sum(axis=0), axis=1) * 100\n`;
      } else if (pctModeGlobal === "total") {
        code += `pivot = pivot / pivot.sum().sum() * 100\n`;
      }

      // Row filtering
      const rowFilter = (cfg.pivot_row_filter as string[]) || [];
      if (rowFilter.length > 0) {
        const rowVals = rowFilter.map((v) => `"${v}"`).join(", ");
        code += `pivot = pivot.loc[pivot.index.isin([${rowVals}])]\n`;
      }

      // Column filtering
      const colFilter = (cfg.pivot_col_filter as string[]) || [];
      if (colFilter.length > 0) {
        const colVals = colFilter.map((v) => `"${v}"`).join(", ");
        if (pivotCols.length > 0) {
          code += `pivot = pivot.loc[:, pivot.columns.get_level_values(0).isin([${colVals}])]\n`;
        } else {
          code += `pivot = pivot.loc[:, pivot.columns.isin([${colVals}])]\n`;
        }
      }

      // Subtotal config as @pivot_config comments (survives code editing)
      const rowSub = cfg.row_subtotals as string | undefined;
      const colSub = cfg.col_subtotals as string | undefined;
      const grandTotal = cfg.show_grand_total as boolean | undefined;
      const subFuncs = (cfg.pivot_subtotal_funcs as Record<string, string>) || {};
      const subFormulas = (cfg.pivot_subtotal_formulas as Record<string, string>) || {};
      const hasPivotConfig = (rowSub && rowSub !== "none") || (colSub && colSub !== "none") || grandTotal || Object.keys(subFuncs).length > 0 || Object.keys(subFormulas).length > 0;
      if (hasPivotConfig) {
        code += `\n`;
        if (rowSub && rowSub !== "none") code += `# @pivot_config: row_subtotals=${rowSub}\n`;
        if (colSub && colSub !== "none") code += `# @pivot_config: col_subtotals=${colSub}\n`;
        if (grandTotal) code += `# @pivot_config: show_grand_total=true\n`;
        for (const [metric, func] of Object.entries(subFuncs)) {
          if (func && func !== "sum") code += `# @pivot_config: subtotal_func:${metric}=${func}\n`;
        }
        for (const [metric, formula] of Object.entries(subFormulas)) {
          if (formula) code += `# @pivot_config: subtotal_formula:${metric}=${formula}\n`;
        }
      }
    }
    code += `fig = None\n`;
    return code;
  }

  // KPI
  if (type === "kpi") {
    const prefix = (cfg.kpi_prefix as string) || "";
    const suffix = (cfg.kpi_suffix as string) || "";
    const target = cfg.kpi_target;
    code += `value = pd.to_numeric(df[${yRef}], errors="coerce").sum()\n`;
    code += `fig = go.Figure(go.Indicator(\n`;
    code += `    mode="number${target != null ? "+delta" : ""}",\n`;
    code += `    value=float(value),\n`;
    if (target != null) {
      code += `    delta={"reference": ${target}},\n`;
    }
    if (prefix || suffix) {
      code += `    number={"prefix": "${prefix}", "suffix": "${suffix}"},\n`;
    }
    code += `))\n`;
    return code;
  }

  // Waterfall
  if (type === "waterfall") {
    code += `fig = go.Figure(go.Waterfall(\n`;
    code += `    x=df[${xRef}].tolist(),\n`;
    code += `    y=df[${yRef}].tolist(),\n`;
    code += `    connector={"line": {"color": "rgb(63, 63, 63)"}},\n`;
    code += `))\n`;
    return code;
  }

  // Correlation
  if (type === "correlation") {
    if (yCols.length > 0) {
      code += `corr = df[${JSON.stringify(yCols)}].corr()\n`;
    } else {
      code += `corr = df.select_dtypes("number").corr()\n`;
    }
    code += `fig = px.imshow(corr, text_auto=".2f", color_continuous_scale="RdBu_r", zmin=-1, zmax=1)\n`;
    return code;
  }

  // Pareto
  if (type === "pareto") {
    code += `# make_subplots is pre-imported\n`;
    code += `sorted_df = df.sort_values(${yRef}, ascending=False)\n`;
    code += `cumulative = sorted_df[${yRef}].cumsum() / sorted_df[${yRef}].sum() * 100\n`;
    code += `fig = make_subplots(specs=[[{"secondary_y": True}]])\n`;
    code += `fig.add_trace(go.Bar(x=sorted_df[${xRef}], y=sorted_df[${yRef}], name=str(${yRef})), secondary_y=False)\n`;
    code += `fig.add_trace(go.Scatter(x=sorted_df[${xRef}], y=cumulative, name="Cumulative %", mode="lines+markers"), secondary_y=True)\n`;
    return code;
  }

  // Control (SPC)
  if (type === "control") {
    code += `y_data = df[${yRef}]\n`;
    code += `mean_val = y_data.mean()\n`;
    code += `std_val = y_data.std()\n`;
    code += `ucl = mean_val + 3 * std_val\n`;
    code += `lcl = mean_val - 3 * std_val\n`;
    code += `fig = go.Figure()\n`;
    code += `fig.add_trace(go.Scatter(x=df[${xRef}], y=y_data, mode="lines+markers", name=str(${yRef})))\n`;
    code += `fig.add_hline(y=mean_val, line_color="green", annotation_text=f"Mean={mean_val:.2f}")\n`;
    code += `fig.add_hline(y=ucl, line_color="red", line_dash="dash", annotation_text=f"UCL={ucl:.2f}")\n`;
    code += `fig.add_hline(y=lcl, line_color="red", line_dash="dash", annotation_text=f"LCL={lcl:.2f}")\n`;
    return code;
  }

  // Treemap
  if (type === "treemap") {
    const pathCols = color ? `[${xRef}, "${color}"]` : `[${xRef}]`;
    code += `fig = px.treemap(df, path=${pathCols}, values=${yRef})\n`;
    return code;
  }

  // Histogram bins
  if (type === "histogram") {
    const bins = (cfg.bins as number) || 20;
    code += `fig = px.histogram(df, x=${xRef}${colorArg}, nbins=${bins})\n`;
  } else {
    // --- Generic px-based types ---
    const typeMap: Record<string, string> = {
      bar: "bar", bar_h: "bar", line: "line", area: "area",
      scatter: "scatter", pie: "pie",
      donut: "pie", box: "box", funnel: "funnel", heatmap: "density_heatmap",
      violin: "violin",
    };
    const pxType = typeMap[type] || "bar";

    // Stack mode for bar/area
    const stackMode = cfg.stack_mode as string | undefined;
    const barmodeArg = stackMode === "stack" ? `, barmode="stack"` : stackMode === "100%" ? `, barmode="relative"` : "";

    if (type === "pie" || type === "donut") {
      code += `fig = px.pie(df, names=${xRef}, values=${yRef}`;
      if (type === "donut") code += `, hole=0.4`;
      code += `)\n`;
    } else if (type === "bar_h") {
      code += `fig = px.bar(df, x=${yRef}, y=${xRef}, orientation="h"${colorArg})\n`;
    } else if (type === "combo" && yCols.length > 1) {
      code += `fig = go.Figure()\n`;
      code += `fig.add_trace(go.Bar(x=df[${xRef}], y=df["${yCols[0]}"], name="${yCols[0]}"))\n`;
      for (let i = 1; i < yCols.length; i++) {
        code += `fig.add_trace(go.Scatter(x=df[${xRef}], y=df["${yCols[i]}"], name="${yCols[i]}", yaxis="y2"))\n`;
      }
      code += `fig.update_layout(yaxis2=dict(overlaying="y", side="right"))\n`;
    } else if (type === "combo" && yCols.length === 1) {
      code += `fig = px.bar(df, x=${xRef}, y=${yRef}${colorArg})\n`;
    } else if (yCols.length > 1) {
      code += `df_melted = df.melt(id_vars=[${xRef}], value_vars=[${yCols.map(c => `"${c}"`).join(", ")}], var_name="series", value_name="value")\n`;
      code += `fig = px.${pxType}(df_melted, x=${xRef}, y="value", color="series")\n`;
    } else {
      code += `fig = px.${pxType}(df, x=${xRef}, y=${yRef}${colorArg})\n`;
    }

    // Stack mode for bar charts
    if (barmodeArg && (type === "bar" || type === "bar_h")) {
      code += `fig.update_layout(${barmodeArg.slice(2)})\n`;
    }
    // Percent stacking for area charts
    if (type === "area" && stackMode === "100%") {
      code += `fig.update_traces(groupnorm="percent")\n`;
    }
  }

  // --- Layout / styling options ---
  const layoutOpts: string[] = [];

  // Show values
  if (cfg.show_values) {
    code += `fig.update_traces(textposition="auto", texttemplate="%{y}")\n`;
  }

  // Legend
  const showLegend = cfg.show_legend;
  if (showLegend === false) {
    layoutOpts.push(`showlegend=False`);
  }
  const legendPos = cfg.legend_position as string | undefined;
  if (legendPos && legendPos !== "auto" && showLegend !== false) {
    const legendMap: Record<string, string> = {
      top: `legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)`,
      bottom: `legend=dict(orientation="h", yanchor="top", y=-0.15, xanchor="center", x=0.5)`,
      left: `legend=dict(yanchor="middle", y=0.5, xanchor="right", x=-0.05)`,
      right: `legend=dict(yanchor="middle", y=0.5, xanchor="left", x=1.05)`,
    };
    if (legendMap[legendPos]) layoutOpts.push(legendMap[legendPos]);
  }

  // Axis labels
  const xLabel = cfg.x_axis_label as string | undefined;
  const yLabel = cfg.y_axis_label as string | undefined;
  if (xLabel) layoutOpts.push(`xaxis_title="${xLabel}"`);
  if (yLabel) layoutOpts.push(`yaxis_title="${yLabel}"`);

  // Number format on y-axis
  const numFmt = cfg.number_format as string | undefined;
  if (numFmt && numFmt !== "auto") {
    const fmtStr = numFmt === "_custom_" ? (cfg.custom_number_format as string || "") : numFmt;
    if (fmtStr) layoutOpts.push(`yaxis_tickformat="${fmtStr}"`);
  }

  if (layoutOpts.length > 0) {
    code += `fig.update_layout(${layoutOpts.join(", ")})\n`;
  }

  return code;
}
