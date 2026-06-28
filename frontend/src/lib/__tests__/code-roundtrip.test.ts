import { describe, it, expect } from "vitest";
import { generateCodeFromVisual } from "../generate-code";
import { parseCodeToVisual } from "../parse-code";

// ── generateCodeFromVisual ──────────────────────────────────────────────

describe("generateCodeFromVisual", () => {
  it("bar chart code contains px.bar", () => {
    const code = generateCodeFromVisual(
      { x_column: "category", y_columns: ["sales"] },
      "bar",
    );
    expect(code).toContain("px.bar");
  });

  it("line chart code contains px.line", () => {
    const code = generateCodeFromVisual(
      { x_column: "date", y_columns: ["revenue"] },
      "line",
    );
    expect(code).toContain("px.line");
  });

  it("uses the metric label for y (not df.columns[1]) when a Color/Group column is set", () => {
    // x + color both set, y_columns empty, one metric -> the metric shifts to a
    // later column position, so df.columns[1] would wrongly point at the group col.
    const code = generateCodeFromVisual(
      {
        x_column: "category",
        color_column: "category",
        metrics: [{ column: "amount", aggregate: "SUM", label: "Total Amount" }],
      },
      "bar",
    );
    expect(code).toContain('y="Total Amount"');
    expect(code).not.toContain("df.columns[1]");
  });

  it("falls back to AGG(col) label when the metric has no explicit label", () => {
    const code = generateCodeFromVisual(
      { x_column: "category", metrics: [{ column: "amount", aggregate: "sum" }] },
      "bar",
    );
    expect(code).toContain('y="SUM(amount)"');
  });

  it("metric label wins over a raw y_column that was aggregated away", () => {
    // Image #3 case: raw "amount" sits in Y but the pipeline output column is the
    // metric label "Total Amount", so y="amount" would error at execution.
    const code = generateCodeFromVisual(
      {
        x_column: "category",
        y_columns: ["amount"],
        metrics: [{ column: "amount", aggregate: "SUM", label: "Total Amount" }],
      },
      "bar",
    );
    expect(code).toContain('y="Total Amount"');
    expect(code).not.toContain('y="amount"');
  });

  it("pie chart code contains px.pie", () => {
    const code = generateCodeFromVisual(
      { x_column: "region", y_columns: ["count"] },
      "pie",
    );
    expect(code).toContain("px.pie");
  });

  it("scatter chart code contains px.scatter", () => {
    const code = generateCodeFromVisual(
      { x_column: "height", y_columns: ["weight"] },
      "scatter",
    );
    expect(code).toContain("px.scatter");
  });

  it("KPI chart code contains go.Indicator", () => {
    const code = generateCodeFromVisual(
      { x_column: "id", y_columns: ["total"] },
      "kpi",
    );
    expect(code).toContain("go.Indicator");
  });
});

// ── parseCodeToVisual ───────────────────────────────────────────────────

describe("parseCodeToVisual", () => {
  it('parses px.bar call to _chartType = "bar"', () => {
    const result = parseCodeToVisual(
      `fig = px.bar(df, x="cat", y="val")`,
    );
    expect(result).not.toBeNull();
    expect(result!._chartType).toBe("bar");
  });

  it('parses px.line call to _chartType = "line"', () => {
    const result = parseCodeToVisual(
      `fig = px.line(df, x="date", y="value")`,
    );
    expect(result).not.toBeNull();
    expect(result!._chartType).toBe("line");
  });

  it('detects donut from pie with hole parameter', () => {
    const result = parseCodeToVisual(
      `fig = px.pie(df, names="category", values="amount", hole=0.4)`,
    );
    expect(result).not.toBeNull();
    expect(result!._chartType).toBe("donut");
  });

  it('detects bar_h from horizontal orientation', () => {
    const result = parseCodeToVisual(
      `fig = px.bar(df, x="value", y="category", orientation="h")`,
    );
    expect(result).not.toBeNull();
    expect(result!._chartType).toBe("bar_h");
  });

  it("returns null for unparseable code", () => {
    const result = parseCodeToVisual(`print("hello world")`);
    expect(result).toBeNull();
  });
});

// ── Roundtrip: generate -> parse -> verify _chartType ───────────────────

describe("roundtrip generate->parse", () => {
  const roundtripCases: Array<{ type: string; expected: string }> = [
    { type: "bar", expected: "bar" },
    { type: "line", expected: "line" },
    { type: "area", expected: "area" },
    { type: "scatter", expected: "scatter" },
    { type: "histogram", expected: "histogram" },
  ];

  for (const { type, expected } of roundtripCases) {
    it(`${type}: generate then parse yields _chartType = "${expected}"`, () => {
      const code = generateCodeFromVisual(
        { x_column: "x", y_columns: ["y"] },
        type,
      );
      const parsed = parseCodeToVisual(code);
      expect(parsed).not.toBeNull();
      expect(parsed!._chartType).toBe(expected);
    });
  }
});

// ── Value-level roundtrip: config VALUES must survive generate->parse ────

describe("value-level roundtrip", () => {
  it("preserves chart_type, x_column, y_columns, color_column (single series)", () => {
    const cfg = { x_column: "category", y_columns: ["sales"], color_column: "region" };
    const parsed = parseCodeToVisual(generateCodeFromVisual(cfg, "bar"));
    expect(parsed).not.toBeNull();
    expect(parsed!._chartType).toBe("bar");
    expect(parsed!.x_column).toBe("category");
    expect(parsed!.y_columns).toEqual(["sales"]);
    expect(parsed!.color_column).toBe("region");
  });

  it("preserves color_palette", () => {
    const cfg = { x_column: "x", y_columns: ["y"], color_palette: "vivid" };
    const parsed = parseCodeToVisual(generateCodeFromVisual(cfg, "bar"));
    expect(parsed).not.toBeNull();
    expect(parsed!.color_palette).toBe("vivid");
  });

  it("preserves sort_order", () => {
    const cfg = { x_column: "x", y_columns: ["y"], sort_order: "asc" };
    const parsed = parseCodeToVisual(generateCodeFromVisual(cfg, "bar"));
    expect(parsed).not.toBeNull();
    expect(parsed!.sort_order).toBe("asc");
  });

  it("preserves a positive KPI target", () => {
    const cfg = { x_column: "id", y_columns: ["total"], kpi_target: 100 };
    const parsed = parseCodeToVisual(generateCodeFromVisual(cfg, "kpi"));
    expect(parsed).not.toBeNull();
    expect(parsed!.kpi_target).toBe(100);
  });

  it("preserves a NEGATIVE KPI target", () => {
    const cfg = { x_column: "id", y_columns: ["total"], kpi_target: -50 };
    const parsed = parseCodeToVisual(generateCodeFromVisual(cfg, "kpi"));
    expect(parsed).not.toBeNull();
    expect(parsed!.kpi_target).toBe(-50);
  });

  it.each(["top", "bottom", "left", "right"] as const)(
    "preserves legend_position = %s",
    (pos) => {
      const cfg = { x_column: "x", y_columns: ["y"], legend_position: pos };
      const parsed = parseCodeToVisual(generateCodeFromVisual(cfg, "bar"));
      expect(parsed).not.toBeNull();
      expect(parsed!.legend_position).toBe(pos);
    },
  );

  it("does NOT set color_column from a synthetic melt color=\"series\"", () => {
    // Multi-series with no explicit color_column produces a melt with color="series"
    const cfg = { x_column: "month", y_columns: ["sales", "profit"] };
    const code = generateCodeFromVisual(cfg, "line");
    expect(code).toContain('color="series"'); // sanity: melt path taken
    const parsed = parseCodeToVisual(code);
    expect(parsed).not.toBeNull();
    // The synthetic "series" column must not pollute color_column
    expect(parsed!.color_column).not.toBe("series");
    // Multi-series y_columns must still be recovered
    expect(parsed!.y_columns).toEqual(["sales", "profit"]);
  });
});
