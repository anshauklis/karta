"use client";

import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { formatCellValue } from "@/lib/format";
import { useRowSelection } from "@/hooks/use-row-selection";
import type { ConditionalFormatRule, ColumnFormat } from "@/types";

// ---------------------------------------------------------------------------
// Helper functions (copied from chart-card.tsx)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function interpolateColor(minColor: string, maxColor: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(minColor);
  const [r2, g2, b2] = hexToRgb(maxColor);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

type ColumnStats = Record<number, { min: number; max: number }>;

function columnMatchesRule(colName: string, rule: ConditionalFormatRule): boolean {
  if (rule.column === colName || rule.columns?.includes(colName)) return true;
  // Pivot columns are formatted as "GroupA | value_col", match the trailing segment
  if (colName.includes(" | ")) {
    const suffix = colName.split(" | ").pop() || "";
    if (rule.column === suffix || rule.columns?.includes(suffix)) return true;
  }
  return false;
}

export function computeColumnStats(
  allRows: (string | number | null)[][],
  columns: string[],
  formatting: ConditionalFormatRule[],
): ColumnStats {
  const stats: ColumnStats = {};
  if (!formatting?.length) return stats;
  const colorScaleCols = new Set<number>();
  for (const rule of formatting) {
    if (rule.type === "color_scale") {
      for (let j = 0; j < columns.length; j++) {
        if (columnMatchesRule(columns[j], rule)) {
          colorScaleCols.add(j);
        }
      }
    }
  }
  for (const colIdx of colorScaleCols) {
    let min = Infinity;
    let max = -Infinity;
    for (const row of allRows) {
      const v = row[colIdx];
      const num = typeof v === "number" ? v : parseFloat(String(v));
      if (!isNaN(num)) {
        if (num < min) min = num;
        if (num > max) max = num;
      }
    }
    if (min !== Infinity) {
      stats[colIdx] = { min, max };
    }
  }
  return stats;
}

export function getCellStyle(
  value: unknown,
  colIndex: number,
  columns: string[],
  formatting: ConditionalFormatRule[],
  columnStats: ColumnStats,
): React.CSSProperties {
  if (!formatting?.length) return {};
  const colName = columns[colIndex];
  const rules = formatting.filter((r) => columnMatchesRule(colName, r));
  const numVal = typeof value === "number" ? value : parseFloat(String(value));

  for (const rule of rules) {
    if (rule.type === "threshold" && rule.rules && !isNaN(numVal)) {
      for (const r of rule.rules) {
        let match = false;
        if (r.op === ">" && numVal > r.value) match = true;
        if (r.op === "<" && numVal < r.value) match = true;
        if (r.op === ">=" && numVal >= r.value) match = true;
        if (r.op === "<=" && numVal <= r.value) match = true;
        if (r.op === "=" && numVal === r.value) match = true;
        if (r.op === "!=" && numVal !== r.value) match = true;
        if (match) {
          return {
            backgroundColor: r.color,
            color: r.text_color || "inherit",
          };
        }
      }
    }
    if (rule.type === "color_scale" && !isNaN(numVal) && rule.min_color && rule.max_color) {
      const s = columnStats[colIndex];
      if (s) {
        const t = s.max === s.min ? 0.5 : (numVal - s.min) / (s.max - s.min);
        return {
          backgroundColor: interpolateColor(rule.min_color, rule.max_color, Math.max(0, Math.min(1, t))),
        };
      }
    }
  }
  return {};
}

// ---------------------------------------------------------------------------
// Pivot value formatting
// ---------------------------------------------------------------------------

export interface PivotValueFormat {
  decimals?: number;
  prefix?: string;
  suffix?: string;
  thousands_separator?: boolean;
}

const PCT_DEFAULT_FMT: PivotValueFormat = { decimals: 1, suffix: "%" };

function formatPivotValue(
  value: unknown,
  colName: string,
  formats: Record<string, PivotValueFormat>,
  pctMode?: string | null,
): string {
  if (value == null || value === "") return "";
  const num = Number(value);
  if (isNaN(num)) return String(value);

  const metric = colName.includes(" | ") ? colName.split(" | ").pop()! : colName;
  const fmt = formats[metric] || (pctMode ? PCT_DEFAULT_FMT : null);
  if (!fmt) return String(value);

  let result = fmt.decimals != null ? num.toFixed(fmt.decimals) : String(num);
  if (fmt.thousands_separator) {
    const [intPart, decPart] = result.split(".");
    result =
      intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0") +
      (decPart ? "." + decPart : "");
  }
  if (fmt.prefix) result = fmt.prefix + result;
  if (fmt.suffix) result = result + fmt.suffix;
  return result;
}

// ---------------------------------------------------------------------------
// Pivot conditional formatting helpers
// ---------------------------------------------------------------------------

const COLOR_SCALES: Record<string, [string, string]> = {
  "green-red": ["#dcfce7", "#fecaca"],
  "red-green": ["#fecaca", "#dcfce7"],
  "blue-white": ["#dbeafe", "#ffffff"],
  "white-blue": ["#ffffff", "#dbeafe"],
  "yellow-red": ["#fef9c3", "#fecaca"],
};

function getHeatmapColor(value: number, min: number, max: number, scale: string): string {
  const colors = COLOR_SCALES[scale] || COLOR_SCALES["green-red"];
  if (max === min) return colors[0];
  const ratio = (value - min) / (max - min);
  const parseHex = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parseHex(colors[0]);
  const [r2, g2, b2] = parseHex(colors[1]);
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function getRuleColor(value: number, rules: Array<{ op: string; value: number; color: string }>): string | null {
  for (const rule of rules) {
    const v = rule.value;
    let match = false;
    switch (rule.op) {
      case ">": match = value > v; break;
      case "<": match = value < v; break;
      case ">=": match = value >= v; break;
      case "<=": match = value <= v; break;
      case "==": match = value === v; break;
      case "!=": match = value !== v; break;
    }
    if (match) return rule.color;
  }
  return null;
}

// ---------------------------------------------------------------------------
// DataTable component
// ---------------------------------------------------------------------------

interface DataTableProps {
  columns: string[];
  rows: (string | number | null)[][];
  formatting?: ConditionalFormatRule[];
  columnFormats?: Record<string, ColumnFormat>;
  pivotHeaderLevels?: string[][];
  pivotRowIndexCount?: number;
  pivotValueFormats?: Record<string, PivotValueFormat>;
  pivotCondFormat?: Array<{
    metric: string;
    type: "heatmap" | "rule";
    colorScale?: string;
    rules?: Array<{ op: string; value: number; color: string }>;
  }>;
  pivotCondFormatMeta?: Record<string, { min: number; max: number; mean: number }>;
  pivotPctMode?: string | null;
  columnAliases?: Record<string, string>;
  maxRows?: number;
  className?: string;
  formatCell?: (value: unknown, colName: string) => string;
}

type RowData = (string | number | null)[];

export function DataTable({
  columns,
  rows,
  formatting = [],
  columnFormats,
  pivotHeaderLevels,
  pivotRowIndexCount = 0,
  pivotValueFormats,
  pivotCondFormat,
  pivotCondFormatMeta,
  columnAliases,
  pivotPctMode,
  maxRows,
  className,
  formatCell,
}: DataTableProps) {
  const displayAlias = useCallback((name: string) => columnAliases?.[name] || name, [columnAliases]);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Safeguard: limit columns to prevent browser freeze on wide pivots
  const MAX_DISPLAY_COLS = 200;
  const totalCols = columns.length;
  const isTruncated = totalCols > MAX_DISPLAY_COLS;

  const displayColumns = useMemo(
    () => (isTruncated ? columns.slice(0, MAX_DISPLAY_COLS) : columns),
    [columns, isTruncated],
  );

  const displayRows = useMemo(() => {
    const limited = maxRows ? rows.slice(0, maxRows) : rows;
    return isTruncated ? limited.map((row) => row.slice(0, MAX_DISPLAY_COLS)) : limited;
  }, [rows, maxRows, isTruncated]);

  const displayFormatting = useMemo(
    () =>
      isTruncated
        ? formatting.filter((r) => {
            const col = r.column;
            return !col || displayColumns.includes(col);
          })
        : formatting,
    [formatting, isTruncated, displayColumns],
  );

  const headerLevels = useMemo(
    () =>
      pivotHeaderLevels?.map((level) =>
        isTruncated ? level.slice(0, MAX_DISPLAY_COLS) : level,
      ),
    [pivotHeaderLevels, isTruncated],
  );

  const isPivotMultiHeader = headerLevels && headerLevels.length > 1;

  const columnStats = useMemo(
    () => computeColumnStats(displayRows, displayColumns, displayFormatting),
    [displayRows, displayColumns, displayFormatting],
  );

  // Row selection
  const { handleRowClick: handleRowSelect, isSelected: isRowSelected, clearSelection } = useRowSelection(rows);

  // TanStack column definitions
  const columnDefs = useMemo<ColumnDef<RowData, unknown>[]>(
    () =>
      displayColumns.map((colName, idx) => ({
        id: `col-${idx}`,
        accessorFn: (row: RowData) => row[idx],
        header: displayAlias(colName),
        size: 150,
        minSize: 60,
        maxSize: 800,
        sortingFn: (rowA, rowB) => {
          const va = rowA.original[idx];
          const vb = rowB.original[idx];
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === "number" && typeof vb === "number") {
            return va - vb;
          }
          return String(va).localeCompare(String(vb));
        },
      })),
    [displayColumns, displayAlias],
  );

  const table = useReactTable({
    data: displayRows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: (updater) => {
      clearSelection();
      setSorting(updater);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  const flatHeaders = table.getFlatHeaders();
  const renderedRows = table.getRowModel().rows;

  // Wrap TanStack resize handler to stop propagation (prevents grid layout drag)
  const wrapResize = (handler: ReturnType<typeof flatHeaders[0]["getResizeHandler"]>) => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      handler(e);
    };
  };

  // Compute rowspan map for row index columns (Excel-like merging)
  // Must use renderedRows (sorted order) not displayRows (original order)
  const { rowSpanMap, skipCells } = useMemo(() => {
    const rsMap = new Map<string, number>();
    const skip = new Set<string>();
    if (pivotRowIndexCount > 0) {
      for (let col = 0; col < pivotRowIndexCount; col++) {
        let i = 0;
        while (i < renderedRows.length) {
          let span = 1;
          while (
            i + span < renderedRows.length &&
            renderedRows[i + span].original[col] === renderedRows[i].original[col] &&
            renderedRows[i].original[col] !== "Total" &&
            (col === 0 || renderedRows[i + span].original.slice(0, col).every((v, k) => v === renderedRows[i].original[k]))
          ) {
            skip.add(`${i + span}-${col}`);
            span++;
          }
          if (span > 1) rsMap.set(`${i}-${col}`, span);
          i += span;
        }
      }
    }
    return { rowSpanMap: rsMap, skipCells: skip };
  }, [renderedRows, pivotRowIndexCount]);

  // Cell formatting helper
  const renderCellValue = useCallback((value: unknown, colIdx: number): string => {
    const colName = displayColumns[colIdx];
    // Pivot value formatting takes priority for non-index columns
    if ((pivotValueFormats || pivotPctMode) && colIdx >= pivotRowIndexCount) {
      const formatted = formatPivotValue(value, colName, pivotValueFormats || {}, pivotPctMode);
      if (formatted !== "" || value == null || value === "") return formatted;
    }
    if (formatCell) return formatCell(value, colName);
    return formatCellValue(value, columnFormats?.[colName]);
  }, [displayColumns, pivotValueFormats, pivotPctMode, pivotRowIndexCount, formatCell, columnFormats]);

  // Pivot conditional formatting style helper
  const getPivotCondCellStyle = useCallback((colName: string, cellValue: unknown): React.CSSProperties | undefined => {
    if (!pivotCondFormat || !pivotCondFormat.length) return undefined;
    const numValue = typeof cellValue === "number" ? cellValue : parseFloat(String(cellValue));
    if (isNaN(numValue)) return undefined;

    // Extract metric from "Metric | GroupValue" format
    const metric = colName.includes(" | ") ? colName.split(" | ")[0] : colName;

    const fmt = pivotCondFormat.find((f) => f.metric === metric);
    if (!fmt) return undefined;

    let bg: string | null = null;
    if (fmt.type === "heatmap" && pivotCondFormatMeta?.[metric]) {
      const { min, max } = pivotCondFormatMeta[metric];
      bg = getHeatmapColor(numValue, min, max, fmt.colorScale || "green-red");
    } else if (fmt.type === "rule" && fmt.rules) {
      bg = getRuleColor(numValue, fmt.rules);
    }

    return bg ? { backgroundColor: bg } : undefined;
  }, [pivotCondFormat, pivotCondFormatMeta]);

  return (
    <div className={className}>
      {isTruncated && (
        <div className="px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
          Showing {MAX_DISPLAY_COLS} of {totalCols} columns
        </div>
      )}
      <table
        className="tabular-nums"
        style={{ width: table.getCenterTotalSize(), tableLayout: "fixed" }}
      >
        <thead className="sticky top-0 z-10 bg-card">
          {isPivotMultiHeader
            ? headerLevels.map((level, levelIdx) => {
                const isFirstLevel = levelIdx === 0;
                const isLastLevel = levelIdx === headerLevels.length - 1;
                const cells: React.ReactNode[] = [];
                let j = 0;
                while (j < level.length) {
                  const isRowIdx = j < pivotRowIndexCount;
                  if (isRowIdx) {
                    if (isFirstLevel) {
                      const header = flatHeaders[j];
                      const stickyLeft = j * 150;
                      cells.push(
                        <th
                          key={`h-${levelIdx}-${j}`}
                          rowSpan={headerLevels.length}
                          className="relative cursor-pointer select-none border-b border-r border-border px-2 py-1 text-left font-medium text-muted-foreground hover:text-foreground align-bottom sticky z-[3] bg-card"
                          style={{ width: header?.getSize(), left: `${stickyLeft}px` }}
                          onClick={header?.column.getToggleSortingHandler()}
                        >
                          <span className="flex items-center gap-1">
                            {displayAlias(level[j])}
                            {{ asc: "▲", desc: "▼" }[header?.column.getIsSorted() as string] ?? null}
                          </span>
                          <div
                            onMouseDown={header ? wrapResize(header.getResizeHandler()) : undefined}
                            onTouchStart={header ? wrapResize(header.getResizeHandler()) : undefined}
                            className={`resizer ${header?.column.getIsResizing() ? "isResizing" : ""}`}
                          />
                        </th>,
                      );
                    }
                    j++;
                    continue;
                  }
                  // Non-row-index columns
                  if (isLastLevel) {
                    // Last level: individual cells with resize/sort
                    const header = flatHeaders[j];
                    cells.push(
                      <th
                        key={`h-${levelIdx}-${j}`}
                        className="relative cursor-pointer select-none border-b border-border px-2 py-1 text-left font-medium text-muted-foreground hover:text-foreground bg-card"
                        style={{ width: header?.getSize() }}
                        onClick={header?.column.getToggleSortingHandler()}
                      >
                        <span className="flex items-center gap-1">
                          {displayAlias(level[j])}
                          {{ asc: "▲", desc: "▼" }[header?.column.getIsSorted() as string] ?? null}
                        </span>
                        <div
                          onMouseDown={header?.getResizeHandler()}
                          onTouchStart={header?.getResizeHandler()}
                          className={`resizer ${header?.column.getIsResizing() ? "isResizing" : ""}`}
                        />
                      </th>,
                    );
                    j++;
                  } else {
                    // Non-last level: merge consecutive identical values
                    let colspan = 1;
                    while (j + colspan < level.length && level[j + colspan] === level[j] && level[j] !== "") {
                      colspan++;
                    }
                    cells.push(
                      <th
                        key={`h-${levelIdx}-${j}`}
                        colSpan={colspan > 1 ? colspan : undefined}
                        className="border-b px-2 py-1 font-medium text-muted-foreground text-center border-x border-border bg-card"
                      >
                        <span className="flex items-center justify-center gap-1">
                          {displayAlias(level[j])}
                        </span>
                      </th>,
                    );
                    j += colspan;
                  }
                }
                return <tr key={`hl-${levelIdx}`}>{cells}</tr>;
              })
            : table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const hIdx = header.column.getIndex();
                    const isIdxCol = hIdx < pivotRowIndexCount;
                    return (
                      <th
                        key={header.id}
                        className={`relative cursor-pointer select-none border-b border-border px-2 py-1 text-left font-medium text-muted-foreground hover:text-foreground bg-card ${isIdxCol ? "sticky z-[3]" : ""}`}
                        style={{ width: header.getSize(), ...(isIdxCol ? { left: `${hIdx * 150}px` } : {}) }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{ asc: "▲", desc: "▼" }[header.column.getIsSorted() as string] ?? null}
                        </span>
                        <div
                          onMouseDown={wrapResize(header.getResizeHandler())}
                          onTouchStart={wrapResize(header.getResizeHandler())}
                          className={`resizer ${header.column.getIsResizing() ? "isResizing" : ""}`}
                        />
                      </th>
                    );
                  })}
                </tr>
              ))}
        </thead>
        <tbody>
          {renderedRows.map((row, renderIdx) => {
            const isTotal = row.original.some((cell) => cell === "Total");
            return (
              <tr
                key={row.id}
                onClick={(e) => handleRowSelect(renderIdx, e)}
                className={`cursor-pointer ${
                  isRowSelected(renderIdx)
                    ? "bg-primary/10 hover:bg-primary/15"
                    : isTotal
                      ? "bg-blue-50 dark:bg-blue-950 hover:bg-muted/50"
                      : renderIdx % 2 === 0
                        ? "bg-card hover:bg-muted/50"
                        : "bg-muted/30 hover:bg-muted/50"
                } ${isTotal ? "font-semibold" : ""}`}
              >
                {row.getVisibleCells().map((cell) => {
                  const colIdx = cell.column.getIndex();
                  const cellKey = `${renderIdx}-${colIdx}`;
                  if (skipCells.has(cellKey)) return null;
                  const span = rowSpanMap.get(cellKey);
                  const isRowIdxCol = colIdx < pivotRowIndexCount;
                  const cellValue = cell.getValue();
                  const stickyLeft = isRowIdxCol ? colIdx * 150 : undefined;
                  const pivotCondStyle = !isRowIdxCol ? getPivotCondCellStyle(displayColumns[colIdx], cellValue) : undefined;
                  return (
                    <td
                      key={cell.id}
                      rowSpan={span}
                      style={{
                        ...(isRowIdxCol
                          ? { left: `${stickyLeft}px` }
                          : getCellStyle(cellValue, colIdx, displayColumns, displayFormatting, columnStats)),
                        ...pivotCondStyle,
                        width: cell.column.getSize(),
                      }}
                      className={`border-b px-2 py-1 overflow-hidden text-ellipsis ${
                        isTotal ? "border-blue-200 dark:border-blue-800" : "border-border"
                      } ${isRowIdxCol ? "font-medium border-r align-top sticky z-[1] bg-card" : ""} ${
                        !isRowIdxCol && typeof cellValue === "number" ? "text-right tabular-nums" : ""
                      }`}
                    >
                      {renderCellValue(cellValue, colIdx)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
