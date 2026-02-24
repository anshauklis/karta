import type { ColumnFormat } from "@/types";

/**
 * Convert a Python strftime pattern to a display date pattern.
 * E.g. "%d.%m.%Y" -> "DD.MM.YYYY"
 */
function strftimeToDatePattern(s: string): string {
  return s
    .replace(/%d/g, "DD")
    .replace(/%m/g, "MM")
    .replace(/%Y/g, "YYYY")
    .replace(/%y/g, "YY")
    .replace(/%b/g, "Mon");
}

/**
 * Parse a Python list literal like ["a", "b", 'c'] into a string array.
 */
function parsePythonList(listStr: string): string[] {
  const items = listStr.match(/["']([^"']*)["']/g);
  if (!items) return [];
  return items.map((s) => s.replace(/^["']|["']$/g, ""));
}

/**
 * Parse Python lambda format expressions to extract column formatting info.
 * Handles patterns like: lambda x: f"${x:,.2f}"  or  lambda x: f"{x:.1%}"
 */
function parseLambdaFormat(lambdaStr: string): Partial<ColumnFormat> | null {
  // Match f-string with optional prefix, format spec, optional suffix
  // e.g. f"${x:,.2f}" -> prefix=$, thousands=true, decimals=2, type=number
  // e.g. f"{x:.1%}" -> decimals=1, type=percent
  const fmtMatch = lambdaStr.match(
    /f["']([^{]*)?\{x:([^}]+)\}([^"']*)["']/
  );
  if (!fmtMatch) return null;

  const prefix = fmtMatch[1] || "";
  const spec = fmtMatch[2];
  const suffix = fmtMatch[3] || "";

  const result: Partial<ColumnFormat> = {};

  if (prefix) result.prefix = prefix;
  if (suffix) result.suffix = suffix;

  // Check for thousands separator
  if (spec.includes(",")) {
    result.thousands = true;
  }

  // Check for percent
  if (spec.endsWith("%")) {
    result.type = "percent";
    const decMatch = spec.match(/\.(\d+)%/);
    if (decMatch) result.decimals = parseInt(decMatch[1], 10);
    return result;
  }

  // Check for float format (f)
  if (spec.endsWith("f")) {
    // Determine type from prefix/suffix context
    if (suffix === "%" || prefix === "%") {
      result.type = "percent";
    } else if (prefix === "$" || prefix === "€" || prefix === "£" || prefix === "¥" || prefix === "₽") {
      result.type = "currency";
    } else {
      result.type = "number";
    }
    const decMatch = spec.match(/\.(\d+)f/);
    if (decMatch) result.decimals = parseInt(decMatch[1], 10);
    return result;
  }

  // Check for decimal (d) — integer
  if (spec.endsWith("d")) {
    result.type = "number";
    result.decimals = 0;
    return result;
  }

  // Fallback: if we matched something, treat as number
  result.type = "number";
  return result;
}

/**
 * Parse pivot table parameters from code.
 * Extracts index, columns, values, and aggfunc from pd.pivot_table(...) calls.
 */
function parsePivotParams(code: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Parse index=[...]
  const indexMatch = code.match(/index\s*=\s*\[([^\]]+)\]/);
  if (indexMatch) {
    result.pivot_rows = parsePythonList(indexMatch[1]);
  } else {
    // Single value: index="col"
    const indexSingle = code.match(/index\s*=\s*["']([^"']+)["']/);
    if (indexSingle) result.pivot_rows = [indexSingle[1]];
  }

  // Parse columns=[...]
  const colsMatch = code.match(/columns\s*=\s*\[([^\]]+)\]/);
  if (colsMatch) {
    result.pivot_columns = parsePythonList(colsMatch[1]);
  } else {
    const colsSingle = code.match(/columns\s*=\s*["']([^"']+)["']/);
    if (colsSingle) result.pivot_columns = [colsSingle[1]];
  }

  // Parse values=[...]
  const valsMatch = code.match(/values\s*=\s*\[([^\]]+)\]/);
  if (valsMatch) {
    result.pivot_values = parsePythonList(valsMatch[1]);
  } else {
    const valsSingle = code.match(/values\s*=\s*["']([^"']+)["']/);
    if (valsSingle) result.pivot_values = [valsSingle[1]];
  }

  // Parse aggfunc (dict form): aggfunc={"col": "func", ...}
  const aggDictMatch = code.match(/aggfunc\s*=\s*\{([^}]+)\}/);
  if (aggDictMatch) {
    const aggfuncs: Record<string, string> = {};
    const funcRevMap: Record<string, string> = {
      sum: "sum", mean: "avg", count: "count", min: "min", max: "max",
      median: "median", nunique: "count_distinct", std: "std", var: "var",
      first: "first", last: "last",
    };
    const pairs = aggDictMatch[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g);
    for (const m of pairs) {
      aggfuncs[m[1]] = funcRevMap[m[2]] || m[2];
    }
    if (Object.keys(aggfuncs).length > 0) {
      result.pivot_aggfuncs = aggfuncs;
    }
  } else {
    // Parse aggfunc (string form): aggfunc="sum"
    const aggMatch = code.match(/aggfunc\s*=\s*["']([^"']+)["']/);
    if (aggMatch) {
      result.pivot_aggfunc = aggMatch[1];
    }
  }

  // Parse sort_columns: sort_index(axis=1) / column sort_values
  if (/sort_index\(axis=1\)/.test(code) && !/sort_index\(axis=1,\s*ascending=False\)/.test(code)) {
    result.sort_columns = "key_asc";
  } else if (/sort_index\(axis=1,\s*ascending=False\)/.test(code)) {
    result.sort_columns = "key_desc";
  } else if (/pivot\.sum\(\)\.sort_values\(\)\.index/.test(code)) {
    result.sort_columns = "value_asc";
  } else if (/pivot\.sum\(\)\.sort_values\(ascending=False\)\.index/.test(code)) {
    result.sort_columns = "value_desc";
  }

  // Parse sort_rows
  if (/sort_index\(axis=0\)/.test(code) && !/sort_index\(axis=0,\s*ascending=False\)/.test(code)) {
    result.sort_rows = "key_asc";
  } else if (/sort_index\(axis=0,\s*ascending=False\)/.test(code)) {
    result.sort_rows = "key_desc";
  } else if (/pivot\.sum\(axis=1\)\.sort_values\(\)\.index/.test(code)) {
    result.sort_rows = "value_asc";
  } else if (/pivot\.sum\(axis=1\)\.sort_values\(ascending=False\)\.index/.test(code)) {
    result.sort_rows = "value_desc";
  }

  // Parse column limit
  const colLimitMatch = code.match(/\.nlargest\((\d+)\)\.index/);
  if (colLimitMatch) {
    result.pivot_column_limit = parseInt(colLimitMatch[1], 10);
  }

  // Parse value labels: pivot.rename(columns={"old": "new", ...}, level=0)
  const renameMatch = code.match(/\.rename\(columns=\{([^}]+)\},\s*level=0\)/);
  if (renameMatch) {
    const labels: Record<string, string> = {};
    const pairs = renameMatch[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g);
    for (const m of pairs) {
      labels[m[1]] = m[2];
    }
    if (Object.keys(labels).length > 0) {
      result.pivot_value_labels = labels;
    }
  }

  // Parse percentage mode — per-column or global
  const perColPctMatches = [...code.matchAll(/_pct_cols\s*=\s*\[c for c in pivot\.columns if c(?:\[0\])? in \[([^\]]+)\]\]/g)];
  if (perColPctMatches.length > 0) {
    const pctModes: Record<string, string | null> = {};
    for (const m of perColPctMatches) {
      const cols = parsePythonList(m[1]);
      const afterMatch = code.slice(m.index! + m[0].length, m.index! + m[0].length + 200);
      let mode: string | null = null;
      if (/\.div\(pivot\[_pct_cols\]\.sum\(axis=1\),\s*axis=0\)\s*\*\s*100/.test(afterMatch)) {
        mode = "row";
      } else if (/\.div\(pivot\[_pct_cols\]\.sum\(axis=0\),\s*axis=1\)\s*\*\s*100/.test(afterMatch)) {
        mode = "column";
      } else if (/pivot\[_pct_cols\]\s*\/\s*pivot\[_pct_cols\]\.sum\(\)\.sum\(\)\s*\*\s*100/.test(afterMatch)) {
        mode = "total";
      }
      if (mode) {
        for (const col of cols) {
          pctModes[col] = mode;
        }
      }
    }
    if (Object.keys(pctModes).length > 0) {
      result.pivot_pct_modes = pctModes;
    }
  } else if (/\.div\(pivot\.sum\(axis=1\),\s*axis=0\)\s*\*\s*100/.test(code)) {
    result.pivot_pct_mode = "row";
  } else if (/\.div\(pivot\.sum\(axis=0\),\s*axis=1\)\s*\*\s*100/.test(code)) {
    result.pivot_pct_mode = "column";
  } else if (/pivot\s*\/\s*pivot\.sum\(\)\.sum\(\)\s*\*\s*100/.test(code)) {
    result.pivot_pct_mode = "total";
  }

  // Parse row filtering: pivot.loc[pivot.index.isin([...])]
  const rowFilterMatch = code.match(/pivot\.index\.isin\(\[([^\]]+)\]\)/);
  if (rowFilterMatch) {
    result.pivot_row_filter = parsePythonList(rowFilterMatch[1]);
  }

  // Parse column filtering: pivot.columns.isin([...]) or pivot.columns.get_level_values(0).isin([...])
  const colFilterMatch = code.match(/pivot\.columns(?:\.get_level_values\(\d+\))?\.isin\(\[([^\]]+)\]\)/);
  if (colFilterMatch) {
    result.pivot_col_filter = parsePythonList(colFilterMatch[1]);
  }

  // Parse @pivot_config comments for subtotal settings
  const pivotConfigLines = code.match(/^# @pivot_config:\s*(.+)$/gm);
  if (pivotConfigLines) {
    const subFuncs: Record<string, string> = {};
    const subFormulas: Record<string, string> = {};
    for (const line of pivotConfigLines) {
      const m = line.match(/^# @pivot_config:\s*(.+)$/);
      if (!m) continue;
      const payload = m[1].trim();
      if (payload.startsWith("row_subtotals=")) {
        result.row_subtotals = payload.slice("row_subtotals=".length);
      } else if (payload.startsWith("col_subtotals=")) {
        result.col_subtotals = payload.slice("col_subtotals=".length);
      } else if (payload.startsWith("show_grand_total=")) {
        result.show_grand_total = payload.slice("show_grand_total=".length) === "true";
      } else if (payload.startsWith("subtotal_func:")) {
        const rest = payload.slice("subtotal_func:".length);
        const eqIdx = rest.indexOf("=");
        if (eqIdx > 0) subFuncs[rest.slice(0, eqIdx)] = rest.slice(eqIdx + 1);
      } else if (payload.startsWith("subtotal_formula:")) {
        const rest = payload.slice("subtotal_formula:".length);
        const eqIdx = rest.indexOf("=");
        if (eqIdx > 0) subFormulas[rest.slice(0, eqIdx)] = rest.slice(eqIdx + 1);
      }
    }
    if (Object.keys(subFuncs).length > 0) result.pivot_subtotal_funcs = subFuncs;
    if (Object.keys(subFormulas).length > 0) result.pivot_subtotal_formulas = subFormulas;
  }

  return result;
}

/**
 * Parse table-specific parameters from code.
 * Extracts column selections, date formatting, and lambda number formatting.
 * Handles both df["col"] and df_display["col"] variable names.
 */
function parseTableParams(code: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Parse time grain: .dt.to_period("W").dt.start_time
  const periodMatch = code.match(/\.dt\.to_period\(["']([A-Z])["']\)/);
  if (periodMatch) {
    const periodRev: Record<string, string> = { D: "day", W: "week", M: "month", Q: "quarter", Y: "year" };
    const grain = periodRev[periodMatch[1]];
    if (grain) result.time_grain = grain;

    // Extract time_column from the to_period line context
    const timeColMatch = code.match(/\w+\[["']([^"']+)["']\]\s*=.*?\.dt\.to_period/);
    if (timeColMatch) result.time_column = timeColMatch[1];
  }

  // Parse time range: >= _max_date - pd.Timedelta(days=N)
  const rangeMatch = code.match(/pd\.Timedelta\(days=(\d+)\)/);
  if (rangeMatch) {
    const daysRev: Record<string, string> = { "7": "7d", "30": "30d", "90": "90d", "365": "1y" };
    const range = daysRev[rangeMatch[1]];
    if (range) result.time_range = range;
  }

  // Parse columns = [...] (explicit column selection)
  const colsMatch = code.match(/columns\s*=\s*\[([^\]]+)\]/);
  if (colsMatch) {
    result.y_columns = parsePythonList(colsMatch[1]);
  }

  // Parse sort: .sort_values("col", ascending=True/False)
  const sortMatch = code.match(/\.sort_values\(["']([^"']+)["'](?:,\s*ascending=(True|False))?\)/);
  if (sortMatch) {
    result.sort_column = sortMatch[1];
    result.sort_direction = sortMatch[2] === "False" ? "desc" : "asc";
  }

  // Parse .dt.strftime("pattern") for date formatting
  const columnFormats: Record<string, ColumnFormat> = {};
  const strftimeRegex =
    /(?:\w+)\[["']([^"']+)["']\].*?\.dt\.strftime\(["']([^"']+)["']\)/g;
  let strftimeMatch;
  while ((strftimeMatch = strftimeRegex.exec(code)) !== null) {
    const col = strftimeMatch[1];
    const pattern = strftimeMatch[2];
    columnFormats[col] = {
      type: "date",
      date_pattern: strftimeToDatePattern(pattern),
    };
  }

  // Parse lambda formatting
  const lambdaRegex =
    /\w+\[["']([^"']+)["']\].*?\.(?:apply|map)\s*\(\s*(lambda\s+x\s*:\s*f["'][^"']+["'])/g;
  let lambdaMatch;
  while ((lambdaMatch = lambdaRegex.exec(code)) !== null) {
    const col = lambdaMatch[1];
    const lambdaStr = lambdaMatch[2];
    const parsed = parseLambdaFormat(lambdaStr);
    if (parsed && col) {
      columnFormats[col] = { type: "number", ...parsed } as ColumnFormat;
    }
  }

  if (Object.keys(columnFormats).length > 0) {
    result.column_formats = columnFormats;
  }

  return result;
}

/**
 * Parse Python/Plotly chart code to extract visual configuration.
 * Returns an object with _chartType and relevant config fields,
 * or null if parsing fails.
 *
 * Pure function -- no React hooks.
 */
export function parseCodeToVisual(
  code: string
): { _chartType?: string; [key: string]: unknown } | null {
  try {
    const result: Record<string, unknown> = {};

    // --- Detect special types first ---

    // KPI: go.Indicator
    if (/go\.Indicator\s*\(/.test(code)) {
      result._chartType = "kpi";
      const yMatch = code.match(/df\[(?:"([^"]+)"|'([^']+)')\]/);
      if (yMatch) result.y_columns = [yMatch[1] || yMatch[2]];
      // Parse prefix/suffix from number={"prefix": "...", "suffix": "..."}
      const prefixMatch = code.match(/"prefix"\s*:\s*"([^"]*)"/);
      if (prefixMatch) result.kpi_prefix = prefixMatch[1];
      const suffixMatch = code.match(/"suffix"\s*:\s*"([^"]*)"/);
      if (suffixMatch) result.kpi_suffix = suffixMatch[1];
      // Parse target from delta={"reference": N}
      const targetMatch = code.match(/"reference"\s*:\s*([\d.]+)/);
      if (targetMatch) result.kpi_target = parseFloat(targetMatch[1]);
      return result;
    }

    // Waterfall: go.Waterfall
    if (/go\.Waterfall\s*\(/.test(code)) {
      result._chartType = "waterfall";
      const xMatch = code.match(
        /x\s*=\s*df\[(?:"([^"]+)"|'([^']+)')\]/
      );
      if (xMatch) result.x_column = xMatch[1] || xMatch[2];
      const yMatch = code.match(
        /y\s*=\s*df\[(?:"([^"]+)"|'([^']+)')\]/
      );
      if (yMatch) result.y_columns = [yMatch[1] || yMatch[2]];
      return result;
    }

    // Control chart: UCL/LCL
    if (/UCL|LCL|control_limits/.test(code)) {
      result._chartType = "control";
      const xMatch = code.match(
        /x\s*=\s*df\[(?:"([^"]+)"|'([^']+)')\]/
      );
      if (xMatch) result.x_column = xMatch[1] || xMatch[2];
      const yMatch = code.match(
        /y_data\s*=\s*df\[(?:"([^"]+)"|'([^']+)')\]/
      );
      if (yMatch) result.y_columns = [yMatch[1] || yMatch[2]];
      return result;
    }

    // Correlation: .corr()
    if (/\.corr\(\)/.test(code)) {
      result._chartType = "correlation";
      const colsMatch = code.match(/df\[(\[.+?\])\]\.corr/);
      if (colsMatch) {
        try {
          const cols = JSON.parse(colsMatch[1].replace(/'/g, '"'));
          if (Array.isArray(cols)) result.y_columns = cols;
        } catch {
          // ignore parse errors
        }
      }
      return result;
    }

    // Pareto: make_subplots + cumsum
    if (/make_subplots/.test(code) && /cumsum|[Cc]umulative/.test(code)) {
      result._chartType = "pareto";
      const xMatch = code.match(
        /x\s*=\s*(?:sorted_df|df)\[(?:"([^"]+)"|'([^']+)')\]/
      );
      if (xMatch) result.x_column = xMatch[1] || xMatch[2];
      const yMatch = code.match(
        /y\s*=\s*(?:sorted_df|df)\[(?:"([^"]+)"|'([^']+)')\]/
      );
      if (yMatch) result.y_columns = [yMatch[1] || yMatch[2]];
      return result;
    }

    // Combo: (make_subplots or yaxis2 dual-axis) + go.Bar (no cumsum)
    if ((/make_subplots/.test(code) || /yaxis2/.test(code)) && /go\.Bar/.test(code)) {
      result._chartType = "combo";
      const barY = code.match(
        /go\.Bar\([\s\S]*?y\s*=\s*df\[(?:"([^"]+)"|'([^']+)')\]/
      );
      const scatterYs = [
        ...code.matchAll(
          /go\.Scatter\([\s\S]*?y\s*=\s*df\[(?:"([^"]+)"|'([^']+)')\]/g
        ),
      ];
      const yCols: string[] = [];
      if (barY) yCols.push(barY[1] || barY[2]);
      for (const m of scatterYs) yCols.push(m[1] || m[2]);
      if (yCols.length > 0) result.y_columns = yCols;
      const xMatch = code.match(
        /x\s*=\s*df\[(?:"([^"]+)"|'([^']+)')\]/
      );
      if (xMatch) result.x_column = xMatch[1] || xMatch[2];
      return result;
    }

    // Table/Pivot: fig = None
    if (/fig\s*=\s*None/.test(code)) {
      if (/pivot/i.test(code)) {
        result._chartType = "pivot";
        Object.assign(result, parsePivotParams(code));
      } else {
        result._chartType = "table";
        Object.assign(result, parseTableParams(code));
      }
      return result;
    }

    // --- px-based types ---
    const pxMatch = code.match(/px\.(\w+)\s*\(/);
    if (!pxMatch) return null;

    let pxType = pxMatch[1];
    if (pxType === "bar" && /orientation\s*=\s*["']h["']/.test(code))
      pxType = "bar_h";
    if (pxType === "pie" && /hole\s*=/.test(code)) pxType = "donut";
    if (pxType === "density_heatmap") pxType = "heatmap";
    if (pxType === "imshow" && /corr/i.test(code)) pxType = "correlation";

    const reverseMap: Record<string, string> = {
      bar: "bar",
      line: "line",
      area: "area",
      scatter: "scatter",
      histogram: "histogram",
      pie: "pie",
      box: "box",
      funnel: "funnel",
      bar_h: "bar_h",
      donut: "donut",
      heatmap: "heatmap",
      treemap: "treemap",
      violin: "violin",
    };
    if (reverseMap[pxType]) result._chartType = reverseMap[pxType];

    // Extract x/names/path column
    const xMatch = code.match(
      /(?:x|names|path)\s*=\s*(?:"([^"]+)"|'([^']+)')/
    );
    if (xMatch) result.x_column = xMatch[1] || xMatch[2];

    // Extract y/values column
    const yMatch = code.match(
      /(?:y|values)\s*=\s*(?:"([^"]+)"|'([^']+)')/
    );
    if (yMatch) result.y_columns = [yMatch[1] || yMatch[2]];

    // Extract color
    const colorMatch = code.match(/color\s*=\s*["']([^"']+)["']/);
    if (colorMatch) result.color_column = colorMatch[1];

    // Extract melt value_vars for multi-series
    const meltMatch = code.match(/value_vars\s*=\s*\[([^\]]+)\]/);
    if (meltMatch) {
      const cols = meltMatch[1].match(/["']([^"']+)["']/g);
      if (cols) result.y_columns = cols.map((c) => c.replace(/["']/g, ""));
    }

    // Histogram bins
    if (pxType === "histogram") {
      const binsMatch = code.match(/nbins\s*=\s*(\d+)/);
      if (binsMatch) result.bins = parseInt(binsMatch[1], 10);
    }

    // Stack mode: barmode="stack" or barmode="relative" or groupnorm="percent"
    const barmodeMatch = code.match(/barmode\s*=\s*["'](stack|relative|group)["']/);
    if (barmodeMatch) {
      result.stack_mode = barmodeMatch[1] === "relative" ? "100%" : barmodeMatch[1] === "stack" ? "stack" : "none";
    } else if (/groupnorm\s*=\s*["']percent["']/.test(code)) {
      result.stack_mode = "100%";
    }

    // --- Parse layout options ---
    // showlegend
    if (/showlegend\s*=\s*False/.test(code)) {
      result.show_legend = false;
    }

    // Legend position
    const legendOrient = code.match(/legend\s*=\s*dict\([^)]*orientation\s*=\s*["']h["']/);
    if (legendOrient) {
      if (/y=1/.test(code)) result.legend_position = "top";
      else if (/y=-/.test(code)) result.legend_position = "bottom";
    } else {
      const legendX = code.match(/legend\s*=\s*dict\([^)]*x=(-?[\d.]+)/);
      if (legendX) {
        result.legend_position = parseFloat(legendX[1]) < 0 ? "left" : "right";
      }
    }

    // Axis labels
    const xTitleMatch = code.match(/xaxis_title\s*=\s*["']([^"']+)["']/);
    if (xTitleMatch) result.x_axis_label = xTitleMatch[1];
    const yTitleMatch = code.match(/yaxis_title\s*=\s*["']([^"']+)["']/);
    if (yTitleMatch) result.y_axis_label = yTitleMatch[1];

    // Number format
    const tickFmtMatch = code.match(/yaxis_tickformat\s*=\s*["']([^"']+)["']/);
    if (tickFmtMatch) result.number_format = tickFmtMatch[1];

    // Show values (textposition)
    if (/textposition\s*=\s*["']auto["']/.test(code)) {
      result.show_values = true;
    }

    return result;
  } catch {
    return null;
  }
}
