import { describe, it, expect } from "vitest";
import { buildDraftPayload } from "../chart-draft";

describe("buildDraftPayload", () => {
  const base = {
    chartId: "new",
    isStandalone: false,
    selectedDashboardId: 9 as number | null,
    dashboardId: 4 as number | undefined,
    connectionId: 7 as number | undefined,
    datasetId: undefined as number | undefined,
    title: "My chart",
    description: "desc",
    mode: "visual",
    chartType: "bar",
    chartConfig: { x_column: "category" },
    chartCode: "fig = px.bar(df)",
    sqlQuery: "SELECT 1",
    variables: [] as Array<Record<string, unknown>>,
  };

  it("maps editor state to the draft payload (dashboard chart)", () => {
    expect(buildDraftPayload(base)).toEqual({
      chartId: "new",
      dashboard_id: 4,
      connection_id: 7,
      dataset_id: null,
      title: "My chart",
      description: "desc",
      mode: "visual",
      chart_type: "bar",
      chart_config: { x_column: "category" },
      chart_code: "fig = px.bar(df)",
      sql_query: "SELECT 1",
      variables: null,
    });
  });

  it("standalone uses selectedDashboardId for dashboard_id", () => {
    expect(buildDraftPayload({ ...base, isStandalone: true }).dashboard_id).toBe(9);
  });

  it("null-coalesces missing connection/dataset ids", () => {
    const p = buildDraftPayload({ ...base, connectionId: undefined, datasetId: 3 });
    expect(p.connection_id).toBeNull();
    expect(p.dataset_id).toBe(3);
  });

  it("includes variables only when non-empty (else null)", () => {
    expect(buildDraftPayload(base).variables).toBeNull();
    const vars = [{ name: "region", default: "EU" }];
    expect(buildDraftPayload({ ...base, variables: vars }).variables).toEqual(vars);
  });
});
