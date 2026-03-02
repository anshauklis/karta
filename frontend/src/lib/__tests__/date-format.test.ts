import { describe, it, expect } from "vitest";
import { formatDateByGrain } from "../date-format";

describe("formatDateByGrain", () => {
  it("returns empty string for null and undefined", () => {
    expect(formatDateByGrain(null)).toBe("");
    expect(formatDateByGrain(undefined)).toBe("");
  });

  it("returns raw string for unparseable date", () => {
    expect(formatDateByGrain("not-a-date")).toBe("not-a-date");
    expect(formatDateByGrain("abc123")).toBe("abc123");
  });

  it('formats month grain as "Mon YYYY"', () => {
    // Use a mid-month date to avoid timezone boundary issues
    const result = formatDateByGrain("2025-06-15T12:00:00Z", "month");
    expect(result).toBe("Jun 2025");
  });

  it('formats quarter grain as "QN YYYY"', () => {
    // Q2: April–June
    expect(formatDateByGrain("2025-06-15T12:00:00Z", "quarter")).toBe("Q2 2025");
    // Q1: January–March
    expect(formatDateByGrain("2025-01-15T12:00:00Z", "quarter")).toBe("Q1 2025");
    // Q4: October–December
    expect(formatDateByGrain("2025-12-15T12:00:00Z", "quarter")).toBe("Q4 2025");
  });

  it("formats year grain as four-digit year", () => {
    expect(formatDateByGrain("2025-06-15T12:00:00Z", "year")).toBe("2025");
  });

  it("formats day grain with short month, day, and year", () => {
    const result = formatDateByGrain("2025-06-15T12:00:00Z", "day");
    // Intl "en" short month format: "Jun 15, 2025"
    expect(result).toBe("Jun 15, 2025");
  });

  it("formats week grain as a range with en-dash", () => {
    const result = formatDateByGrain("2025-06-09T12:00:00Z", "week");
    // Should contain en-dash (\u2013)
    expect(result).toContain("\u2013");
    // Range should span 6 days: Jun 9–Jun 15, 2025
    expect(result).toMatch(/Jun\s+9\u2013Jun\s+15,\s+2025/);
  });

  it("strips trailing T00:00:00 variants for default/raw grain", () => {
    expect(formatDateByGrain("2025-06-15T00:00:00Z")).toBe("2025-06-15");
    expect(formatDateByGrain("2025-06-15T00:00:00")).toBe("2025-06-15");
    expect(formatDateByGrain("2025-06-15T00:00:00.000Z")).toBe("2025-06-15");
    expect(formatDateByGrain("2025-06-15T00:00:00.000")).toBe("2025-06-15");
    // Non-midnight time should remain untouched
    expect(formatDateByGrain("2025-06-15T14:30:00Z")).toBe("2025-06-15T14:30:00Z");
  });
});
