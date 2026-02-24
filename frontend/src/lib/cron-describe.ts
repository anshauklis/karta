/**
 * Simple cron expression → human-readable description.
 * Covers the common patterns used in alerts/reports presets.
 * For exotic expressions, returns the raw cron string.
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every N minutes: */N * * * *
  if (minute.startsWith("*/") && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const n = parseInt(minute.slice(2));
    if (n === 1) return "Every minute";
    return `Every ${n} minutes`;
  }

  // Every hour at :MM: MM * * * *
  if (/^\d+$/.test(minute) && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    const m = parseInt(minute);
    if (m === 0) return "Every hour";
    return `Every hour at :${String(m).padStart(2, "0")}`;
  }

  // Daily at HH:MM: MM HH * * *
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Daily at ${String(parseInt(hour)).padStart(2, "0")}:${String(parseInt(minute)).padStart(2, "0")}`;
  }

  // Weekly: MM HH * * DOW
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === "*" && month === "*" && /^\d$/.test(dayOfWeek)) {
    const day = DAYS[parseInt(dayOfWeek)] ?? dayOfWeek;
    return `${day} at ${String(parseInt(hour)).padStart(2, "0")}:${String(parseInt(minute)).padStart(2, "0")}`;
  }

  // Monthly: MM HH DOM * *
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dayOfMonth) && month === "*" && dayOfWeek === "*") {
    return `Monthly on day ${parseInt(dayOfMonth)} at ${String(parseInt(hour)).padStart(2, "0")}:${String(parseInt(minute)).padStart(2, "0")}`;
  }

  return expr;
}
