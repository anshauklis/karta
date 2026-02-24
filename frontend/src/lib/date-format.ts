/**
 * Format a date value based on time grain and optional date format pattern.
 * If dateFormat is provided (not "adaptive"), it takes priority over grain-based formatting.
 */
export function formatDateByGrain(value: unknown, grain?: string, dateFormat?: string): string {
  if (value == null) return "";
  const str = String(value);

  // Try to parse as date
  const date = new Date(str);
  if (isNaN(date.getTime())) return str;

  // If explicit date format is set (not adaptive), use it — but for "week" grain, show range
  if (dateFormat && dateFormat !== "adaptive") {
    if (grain === "week") {
      const end = new Date(date);
      end.setDate(end.getDate() + 6);
      return `${formatByPattern(date, dateFormat)}\u2013${formatByPattern(end, dateFormat)}`;
    }
    return formatByPattern(date, dateFormat);
  }

  switch (grain) {
    case "month":
      return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(date);
    case "quarter": {
      const q = Math.ceil((date.getMonth() + 1) / 3);
      return `Q${q} ${date.getFullYear()}`;
    }
    case "year":
      return String(date.getFullYear());
    case "day":
      return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
    case "week": {
      const end = new Date(date);
      end.setDate(end.getDate() + 6);
      const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
      return `${fmt.format(date)}\u2013${fmt.format(end)}, ${date.getFullYear()}`;
    }
    default:
      // "raw" or unset — return as-is but strip trailing T00:00:00 variants
      return str.replace(/T00:00:00(\.000)?Z?$/, "");
  }
}

function formatByPattern(date: Date, pattern: string): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = monthNames[date.getMonth()];

  switch (pattern) {
    case "DD.MM.YYYY":
      return `${day}.${month}.${year}`;
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "DD Mon YYYY":
      return `${day} ${mon} ${year}`;
    case "Mon YYYY":
      return `${mon} ${year}`;
    case "YYYY":
      return String(year);
    case "YYYY-MM-DD":
    default:
      return `${year}-${month}-${day}`;
  }
}
