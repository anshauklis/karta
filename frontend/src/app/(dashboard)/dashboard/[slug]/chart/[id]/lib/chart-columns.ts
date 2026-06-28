// Pure column-selection logic for the chart editor, extracted from a useMemo in
// the god-hook so it can be unit-tested.

/**
 * The columns "in use" by the current chart config — drives Customize-tab
 * filtering. Pivot uses its row/column/value buckets; table uses y_columns;
 * everything else uses x + y + color.
 */
export function computeSelectedColumns(
  chartType: string,
  cfg: Record<string, unknown>,
): string[] {
  if (chartType === "pivot") {
    return [
      ...((cfg.pivot_rows as string[]) || []),
      ...((cfg.pivot_columns as string[]) || []),
      ...((cfg.pivot_values as string[]) || []),
    ].filter(Boolean);
  }
  if (chartType === "table") {
    return ((cfg.y_columns as string[]) || []).filter(Boolean);
  }
  const cols: string[] = [];
  if (cfg.x_column) cols.push(cfg.x_column as string);
  if (cfg.y_columns) cols.push(...((cfg.y_columns as string[]) || []));
  if (cfg.color_column) cols.push(cfg.color_column as string);
  return cols.filter(Boolean);
}
