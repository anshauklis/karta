import { describe, it, expect } from "vitest";
import { computeSelectedColumns } from "../chart-columns";

describe("computeSelectedColumns", () => {
  it("pivot: rows + columns + values (in order, blanks dropped)", () => {
    const cfg = {
      pivot_rows: ["category", ""],
      pivot_columns: ["region"],
      pivot_values: ["amount"],
    };
    expect(computeSelectedColumns("pivot", cfg)).toEqual(["category", "region", "amount"]);
  });

  it("table: just y_columns (blanks dropped)", () => {
    expect(computeSelectedColumns("table", { y_columns: ["a", "", "b"] })).toEqual(["a", "b"]);
  });

  it("default: x_column + y_columns + color_column", () => {
    const cfg = { x_column: "category", y_columns: ["amount"], color_column: "region" };
    expect(computeSelectedColumns("bar", cfg)).toEqual(["category", "amount", "region"]);
  });

  it("default: omits unset x/color", () => {
    expect(computeSelectedColumns("line", { y_columns: ["amount"] })).toEqual(["amount"]);
  });

  it("empty config -> empty list", () => {
    expect(computeSelectedColumns("bar", {})).toEqual([]);
  });
});
