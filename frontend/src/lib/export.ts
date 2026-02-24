import type { ColumnFormat, ConditionalFormatRule } from "@/types";
import { formatCellValue } from "./format";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Generate CSV string and trigger browser download.
 * Applies column formatting if provided.
 */
export function downloadCSV(
  columns: string[],
  rows: unknown[][],
  filename: string,
  columnFormats?: Record<string, ColumnFormat>,
) {
  const escape = (val: unknown): string => {
    const s = val == null ? "" : String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = columns.map(escape).join(",");
  const body = rows
    .map((row) =>
      row.map((cell, j) => {
        const fmt = columnFormats?.[columns[j]];
        const formatted = fmt ? formatCellValue(cell, fmt) : cell;
        return escape(formatted);
      }).join(",")
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate Excel file via API and trigger download.
 */
export async function downloadExcel(
  columns: string[],
  rows: unknown[][],
  filename: string,
  token?: string,
  columnFormats?: Record<string, ColumnFormat>,
  formatting?: ConditionalFormatRule[],
) {
  const res = await fetch(`${API_URL}/api/export/xlsx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      columns,
      rows,
      filename,
      column_formats: columnFormats,
      formatting,
    }),
  });

  if (!res.ok) {
    throw new Error(`Excel export failed: ${res.statusText}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
