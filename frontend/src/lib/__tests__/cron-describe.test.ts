import { describe, it, expect } from "vitest";
import { describeCron } from "../cron-describe";

describe("describeCron", () => {
  it("returns 'Every minute' for */1 * * * *", () => {
    expect(describeCron("*/1 * * * *")).toBe("Every minute");
  });

  it("returns 'Every N minutes' for */5 and */15", () => {
    expect(describeCron("*/5 * * * *")).toBe("Every 5 minutes");
    expect(describeCron("*/15 * * * *")).toBe("Every 15 minutes");
  });

  it("returns 'Every hour' for 0 * * * *", () => {
    expect(describeCron("0 * * * *")).toBe("Every hour");
  });

  it("returns 'Every hour at :MM' for non-zero minute", () => {
    expect(describeCron("30 * * * *")).toBe("Every hour at :30");
    expect(describeCron("5 * * * *")).toBe("Every hour at :05");
  });

  it("returns 'Daily at HH:MM' for MM HH * * *", () => {
    expect(describeCron("0 9 * * *")).toBe("Daily at 09:00");
    expect(describeCron("30 14 * * *")).toBe("Daily at 14:30");
  });

  it("returns 'Monday at HH:MM' for DOW=1", () => {
    expect(describeCron("0 9 * * 1")).toBe("Mon at 09:00");
  });

  it("returns 'Sunday at HH:MM' for DOW=0", () => {
    expect(describeCron("0 9 * * 0")).toBe("Sun at 09:00");
  });

  it("returns monthly description for MM HH DOM * *", () => {
    expect(describeCron("0 9 15 * *")).toBe("Monthly on day 15 at 09:00");
    expect(describeCron("0 0 1 * *")).toBe("Monthly on day 1 at 00:00");
  });

  it("returns raw expression for unrecognized patterns", () => {
    const expr = "0 9 * 1-6 1-5";
    expect(describeCron(expr)).toBe(expr);
  });

  it("returns raw expression for wrong part count", () => {
    expect(describeCron("* * *")).toBe("* * *");
    expect(describeCron("* * * * * *")).toBe("* * * * * *");
  });
});
