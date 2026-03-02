import { describe, it, expect } from "vitest";
import { formatCellValue } from "../format";

describe("formatCellValue", () => {
  it("returns empty string for null and undefined", () => {
    expect(formatCellValue(null, undefined)).toBe("");
    expect(formatCellValue(undefined, undefined)).toBe("");
  });

  it("formats numbers with toLocaleString when no format given", () => {
    const result = formatCellValue(1234.5, undefined);
    // toLocaleString is locale-dependent; just check it returns a non-empty string containing digits
    expect(result).toBe((1234.5).toLocaleString());
  });

  it("returns string as-is when no format given", () => {
    expect(formatCellValue("hello", undefined)).toBe("hello");
    expect(formatCellValue("some text", undefined)).toBe("some text");
  });

  it("wraps value with prefix and suffix for text format", () => {
    expect(
      formatCellValue("world", { type: "text", prefix: "Hello ", suffix: "!" }),
    ).toBe("Hello world!");
  });

  it("applies decimals for number format", () => {
    expect(
      formatCellValue(3.14159, { type: "number", decimals: 2 }),
    ).toBe("3.14");
  });

  it("adds thousands separator for number format", () => {
    expect(
      formatCellValue(1234567, { type: "number", decimals: 0, thousands: true }),
    ).toBe("1,234,567");
  });

  it("returns string as-is when number format applied to non-numeric string", () => {
    expect(
      formatCellValue("abc", { type: "number", decimals: 2 }),
    ).toBe("abc");
  });

  it("uses default $ prefix for currency format", () => {
    expect(
      formatCellValue(42, { type: "currency" }),
    ).toBe("$42.00");
  });

  it("uses custom prefix for currency format", () => {
    expect(
      formatCellValue(99.9, { type: "currency", prefix: "\u20AC", decimals: 2 }),
    ).toBe("\u20AC99.90");
  });

  it("multiplies ratio (0..1) by 100 for percent format", () => {
    expect(
      formatCellValue(0.75, { type: "percent" }),
    ).toBe("75.0%");
  });

  it("keeps value > 1 as-is for percent format", () => {
    expect(
      formatCellValue(75, { type: "percent" }),
    ).toBe("75.0%");
  });
});
