// Pure draft logic for the chart editor, extracted from the auto-save effect so
// it can be unit-tested without React state/timers.

export interface DraftPayload<V = Record<string, unknown>> {
  chartId: string;
  dashboard_id: number | null | undefined;
  connection_id: number | null;
  dataset_id: number | null;
  title: string;
  description: string;
  mode: string;
  chart_type: string;
  chart_config: Record<string, unknown>;
  chart_code: string;
  sql_query: string;
  variables: V[] | null;
}

/** Map the current editor state to the server draft payload. */
export function buildDraftPayload<V = Record<string, unknown>>(s: {
  chartId: string;
  isStandalone: boolean;
  selectedDashboardId: number | null;
  dashboardId: number | undefined;
  connectionId: number | undefined;
  datasetId: number | undefined;
  title: string;
  description: string;
  mode: string;
  chartType: string;
  chartConfig: Record<string, unknown>;
  chartCode: string;
  sqlQuery: string;
  variables: V[];
}): DraftPayload<V> {
  return {
    chartId: s.chartId,
    dashboard_id: s.isStandalone ? s.selectedDashboardId : s.dashboardId,
    connection_id: s.connectionId ?? null,
    dataset_id: s.datasetId ?? null,
    title: s.title,
    description: s.description,
    mode: s.mode,
    chart_type: s.chartType,
    chart_config: s.chartConfig,
    chart_code: s.chartCode,
    sql_query: s.sqlQuery,
    variables: s.variables.length > 0 ? s.variables : null,
  };
}
