import type { ColumnFormat } from "@/types";

/**
 * Format a cell value according to column format config.
 * Returns formatted string for display/export.
 */
export function formatCellValue(
  value: unknown,
  format: ColumnFormat | undefined,
): string {
  if (value == null) return "";
  if (!format) {
    // Default: numbers get toLocaleString, rest as-is
    if (typeof value === "number") return value.toLocaleString();
    return String(value);
  }

  const { type, decimals, prefix = "", suffix = "", thousands = true, date_pattern } = format;

  if (type === "text") {
    return `${prefix}${String(value)}${suffix}`;
  }

  if (type === "date") {
    return formatDate(value, date_pattern || "YYYY-MM-DD");
  }

  // Numeric types: number, percent, currency
  let num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return String(value);

  if (type === "percent") {
    // If value looks like a ratio (0..1 range), multiply by 100
    if (Math.abs(num) <= 1 && num !== 0) {
      num = num * 100;
    }
    const formatted = num.toFixed(decimals ?? 1);
    return `${prefix}${thousands ? addThousands(formatted) : formatted}%${suffix}`;
  }

  if (type === "currency") {
    const formatted = num.toFixed(decimals ?? 2);
    const currPrefix = prefix || "$";
    return `${currPrefix}${thousands ? addThousands(formatted) : formatted}${suffix}`;
  }

  // type === "number"
  const formatted = decimals != null ? num.toFixed(decimals) : String(num);
  return `${prefix}${thousands ? addThousands(formatted) : formatted}${suffix}`;
}

function addThousands(numStr: string): string {
  const parts = numStr.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

function formatDate(value: unknown, pattern: string): string {
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = monthNames[d.getMonth()];

  switch (pattern) {
    case "DD.MM.YYYY":
      return `${day}.${month}.${year}`;
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "DD Mon YYYY":
      return `${day} ${mon} ${year}`;
    case "YYYY-MM-DD":
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Get Excel number format string for a ColumnFormat.
 */
export function getExcelFormat(format: ColumnFormat): string | undefined {
  if (!format) return undefined;
  const d = format.decimals ?? 0;
  const decPart = d > 0 ? "." + "0".repeat(d) : "";

  switch (format.type) {
    case "number":
      return format.thousands !== false ? `#,##0${decPart}` : `0${decPart}`;
    case "currency": {
      const sym = format.prefix || "$";
      return format.thousands !== false
        ? `${sym}#,##0${decPart}`
        : `${sym}0${decPart}`;
    }
    case "percent":
      return `0${decPart}%`;
    case "date":
      switch (format.date_pattern) {
        case "DD.MM.YYYY": return "DD.MM.YYYY";
        case "MM/DD/YYYY": return "MM/DD/YYYY";
        case "DD Mon YYYY": return "DD MMM YYYY";
        default: return "YYYY-MM-DD";
      }
    default:
      return undefined;
  }
}
