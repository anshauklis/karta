// Pure logic extracted from the chart editor's preview/execute path so it can be
// unit-tested independently of React state and TanStack Query.

/** Whether the current data source is complete enough to run a preview. */
export function canPreviewChart(s: {
  dataSource: string;
  datasetId: number | undefined;
  connectionId: number | undefined;
  sqlQuery: string;
}): boolean {
  if (s.dataSource === "dataset") return !!s.datasetId;
  return !!s.connectionId && !!s.sqlQuery.trim();
}

export interface PreviewRequest<V = Record<string, unknown>> {
  connection_id: number | undefined;
  dataset_id: number | undefined;
  sql_query: string;
  mode: "visual" | "code";
  chart_type: string;
  chart_config: Record<string, unknown>;
  chart_code?: string;
  variables?: V[];
}

/** Build the /preview (and /execute) API payload from editor state. */
export function buildPreviewRequest<V = Record<string, unknown>>(s: {
  dataSource: string;
  connectionId: number | undefined;
  datasetId: number | undefined;
  sqlQuery: string;
  isCodeMode: boolean;
  chartType: string;
  chartConfig: Record<string, unknown>;
  chartCode: string;
  variables: V[];
}): PreviewRequest<V> {
  const isDataset = s.dataSource === "dataset";
  return {
    connection_id: isDataset ? undefined : s.connectionId,
    dataset_id: isDataset ? s.datasetId : undefined,
    sql_query: s.sqlQuery,
    mode: s.isCodeMode ? "code" : "visual",
    chart_type: s.chartType,
    chart_config: s.chartConfig,
    ...(s.isCodeMode ? { chart_code: s.chartCode } : {}),
    ...(s.variables.length > 0 ? { variables: s.variables } : {}),
  };
}

/**
 * Merge a new preview result with the previous one: when the new result errored
 * and returned no columns, keep the previous columns so the column browser /
 * layout don't collapse on a transient error. Otherwise return the new result.
 */
export function mergePreviewResult<T extends { error?: unknown; columns?: unknown[] }>(
  prev: { columns?: unknown[] } | undefined | null,
  res: T,
): T {
  if (res.error && (!res.columns || res.columns.length === 0) && prev?.columns?.length) {
    return { ...res, columns: prev.columns };
  }
  return res;
}
