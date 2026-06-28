import { describe, it, expect } from "vitest";
import { canPreviewChart, buildPreviewRequest, mergePreviewResult } from "../chart-preview-logic";

describe("canPreviewChart", () => {
  it("dataset source: needs a datasetId", () => {
    expect(canPreviewChart({ dataSource: "dataset", datasetId: 5, connectionId: undefined, sqlQuery: "" })).toBe(true);
    expect(canPreviewChart({ dataSource: "dataset", datasetId: undefined, connectionId: 1, sqlQuery: "SELECT 1" })).toBe(false);
  });

  it("sql source: needs a connection AND a non-blank query", () => {
    expect(canPreviewChart({ dataSource: "sql", datasetId: undefined, connectionId: 1, sqlQuery: "SELECT 1" })).toBe(true);
    expect(canPreviewChart({ dataSource: "sql", datasetId: undefined, connectionId: undefined, sqlQuery: "SELECT 1" })).toBe(false);
    expect(canPreviewChart({ dataSource: "sql", datasetId: undefined, connectionId: 1, sqlQuery: "" })).toBe(false);
    expect(canPreviewChart({ dataSource: "sql", datasetId: undefined, connectionId: 1, sqlQuery: "   " })).toBe(false);
  });
});

describe("buildPreviewRequest", () => {
  const base = {
    dataSource: "sql",
    connectionId: 7,
    datasetId: undefined as number | undefined,
    sqlQuery: "SELECT 1",
    isCodeMode: false,
    chartType: "bar",
    chartConfig: { x_column: "category" },
    chartCode: "fig = px.bar(df)",
    variables: [] as Array<Record<string, unknown>>,
  };

  it("visual + sql source: connection set, dataset undefined, no code, no variables", () => {
    expect(buildPreviewRequest(base)).toEqual({
      connection_id: 7,
      dataset_id: undefined,
      sql_query: "SELECT 1",
      mode: "visual",
      chart_type: "bar",
      chart_config: { x_column: "category" },
    });
  });

  it("dataset source: dataset set, connection undefined", () => {
    const r = buildPreviewRequest({ ...base, dataSource: "dataset", datasetId: 3 });
    expect(r.connection_id).toBeUndefined();
    expect(r.dataset_id).toBe(3);
  });

  it("code mode: mode=code and chart_code included", () => {
    const r = buildPreviewRequest({ ...base, isCodeMode: true });
    expect(r.mode).toBe("code");
    expect(r.chart_code).toBe("fig = px.bar(df)");
  });

  it("visual mode omits chart_code", () => {
    expect(buildPreviewRequest(base)).not.toHaveProperty("chart_code");
  });

  it("includes variables only when present", () => {
    expect(buildPreviewRequest(base)).not.toHaveProperty("variables");
    const vars = [{ name: "region", default: "EU" }];
    expect(buildPreviewRequest({ ...base, variables: vars }).variables).toEqual(vars);
  });
});

describe("mergePreviewResult", () => {
  const ok = { figure: {}, columns: ["a", "b"], rows: [], row_count: 0, error: null };
  const errNoCols = { figure: null, columns: [], rows: [], row_count: 0, error: "boom" };

  it("keeps previous columns when the new result errored with no columns", () => {
    const prev = { figure: null, columns: ["a", "b"], rows: [], row_count: 0, error: null };
    expect(mergePreviewResult(prev, errNoCols).columns).toEqual(["a", "b"]);
  });

  it("returns the new result unchanged when it has no error", () => {
    expect(mergePreviewResult(undefined, ok)).toBe(ok);
  });

  it("returns the errored result as-is when it carries its own columns", () => {
    const errWithCols = { ...errNoCols, columns: ["x"] };
    expect(mergePreviewResult({ columns: ["a"] }, errWithCols)).toBe(errWithCols);
  });

  it("returns the new result when there are no previous columns", () => {
    expect(mergePreviewResult(undefined, errNoCols)).toBe(errNoCols);
  });
});
