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
