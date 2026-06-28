// Metric label resolution for the chart editor.
//
// Design: a metric's OUTPUT column is named after its SOURCE column (what the
// user actually sees and drops), e.g. dropping `amount` -> output column
// `amount` -> generated code `y="amount"`. When the same column is aggregated by
// more than one metric, those collide, so they fall back to the `AGG(column)`
// form to stay distinct. Custom-SQL metrics keep their user-typed label.

export type EditorMetric = {
  column?: string;
  aggregate?: string;
  label?: string;
  expressionType?: string;
  sqlExpression?: string;
};

/**
 * The output-column label for a single (Simple) metric, given all metrics so
 * collisions on the same source column can be disambiguated.
 */
export function metricOutputLabel(m: EditorMetric, all: EditorMetric[]): string {
  if ((m.expressionType || "simple") === "custom_sql") {
    return m.label || m.sqlExpression || "";
  }
  const col = m.column || "";
  if (!col) return "";
  const agg = (m.aggregate || "SUM").toUpperCase();
  if (col === "*") return `${agg}(*)`; // can't name a column "*"
  const sameColumn = all.filter(
    (x) => (x.expressionType || "simple") !== "custom_sql" && x.column === col,
  );
  // Multiple metrics on the same column -> qualify with the aggregate.
  return sameColumn.length > 1 ? `${agg}(${col})` : col;
}

/**
 * Resolve every metric's label (Simple metrics get the source-column name with
 * collision disambiguation; custom-SQL metrics keep theirs) and derive the
 * matching y_columns list. Single source of truth consumed by the backend
 * pipeline (output column name) and by generate-code (the `y` reference).
 */
export function resolveMetricLabels(metrics: EditorMetric[]): {
  metrics: EditorMetric[];
  yColumns: string[];
} {
  const resolved = metrics.map((m) =>
    (m.expressionType || "simple") === "custom_sql"
      ? m
      : { ...m, label: metricOutputLabel(m, metrics) },
  );
  const yColumns = resolved.map((m) =>
    (m.expressionType || "simple") === "custom_sql"
      ? m.label || m.sqlExpression || ""
      : m.label || "",
  );
  return { metrics: resolved, yColumns };
}
