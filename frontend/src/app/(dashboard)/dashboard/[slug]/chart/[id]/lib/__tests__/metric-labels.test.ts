import { describe, it, expect } from "vitest";
import { metricOutputLabel, resolveMetricLabels } from "../metric-labels";

describe("metricOutputLabel", () => {
  it("uses the source column name for a lone simple metric", () => {
    const m = { column: "amount", aggregate: "SUM" };
    expect(metricOutputLabel(m, [m])).toBe("amount");
  });

  it("ignores the aggregate for naming when the column is unique", () => {
    const m = { column: "amount", aggregate: "AVG" };
    expect(metricOutputLabel(m, [m])).toBe("amount");
  });

  it("disambiguates with AGG(col) when the same column is aggregated twice", () => {
    const a = { column: "amount", aggregate: "SUM" };
    const b = { column: "amount", aggregate: "AVG" };
    expect(metricOutputLabel(a, [a, b])).toBe("SUM(amount)");
    expect(metricOutputLabel(b, [a, b])).toBe("AVG(amount)");
  });

  it("names COUNT(*) explicitly (cannot use '*' as a column)", () => {
    const m = { column: "*", aggregate: "COUNT" };
    expect(metricOutputLabel(m, [m])).toBe("COUNT(*)");
  });

  it("keeps the user-typed label for custom_sql metrics", () => {
    const m = { expressionType: "custom_sql", label: "My Ratio", sqlExpression: "a/b" };
    expect(metricOutputLabel(m, [m])).toBe("My Ratio");
  });
});

describe("resolveMetricLabels", () => {
  it("populates labels and matching y_columns", () => {
    const { metrics, yColumns } = resolveMetricLabels([
      { column: "amount", aggregate: "SUM" },
      { column: "units", aggregate: "SUM" },
    ]);
    expect(metrics.map((m) => m.label)).toEqual(["amount", "units"]);
    expect(yColumns).toEqual(["amount", "units"]);
  });

  it("disambiguates duplicate-column metrics in both labels and y_columns", () => {
    const { metrics, yColumns } = resolveMetricLabels([
      { column: "amount", aggregate: "SUM" },
      { column: "amount", aggregate: "AVG" },
    ]);
    expect(metrics.map((m) => m.label)).toEqual(["SUM(amount)", "AVG(amount)"]);
    expect(yColumns).toEqual(["SUM(amount)", "AVG(amount)"]);
  });
});
