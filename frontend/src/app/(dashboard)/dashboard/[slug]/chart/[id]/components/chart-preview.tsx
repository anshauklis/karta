"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Play, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PlotlyChart } from "@/components/charts/plotly-chart";
import { DataTable } from "@/components/charts/data-table";
import { formatCellValue } from "@/lib/format";
import { formatDateByGrain } from "@/lib/date-format";
import { downloadCSV, downloadExcel } from "@/lib/export";
import type { ChartExecuteResult, ConditionalFormatRule, ColumnFormat } from "@/types";

interface ChartPreviewProps {
  result: ChartExecuteResult | null;
  previewing: boolean;
  execTime: number | null;
  chartType: string;
  chartConfig: Record<string, unknown>;
  title: string;
  isDark: boolean;
  onPreview: () => void;
  dataSource: "sql" | "dataset";
  mode: "visual" | "code";
}

export function ChartPreview({
  result,
  previewing,
  execTime,
  chartType,
  chartConfig,
  title,
  isDark,
  onPreview,
  dataSource,
  mode,
}: ChartPreviewProps) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const t = useTranslations("chart");
  const [previewTab, setPreviewTab] = useState<"results" | "samples">("results");
  const [samplesSearch, setSamplesSearch] = useState("");

  const formattingRules = (chartConfig.conditional_formatting as ConditionalFormatRule[] | undefined) || [];
  const editorColFormats = (chartConfig.column_formats as Record<string, ColumnFormat>) || undefined;
  const columnAliases = (chartConfig.column_aliases as Record<string, string>) || {};
  const displayCol = (col: string) => columnAliases[col] || col;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Main preview area */}
      <div className="flex-1 overflow-hidden p-4">
        {previewing ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
          </div>
        ) : previewTab === "samples" && result?.columns && result.columns.length > 0 ? (
          /* Samples tab — raw data table with column filter */
          <div className="flex h-full flex-col gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <Input
                className="h-7 text-xs max-w-[200px]"
                placeholder="Filter columns..."
                value={samplesSearch}
                onChange={(e) => setSamplesSearch(e.target.value)}
              />
              <span className="text-[10px] text-muted-foreground">
                {samplesSearch ? result.columns.filter((c) => c.toLowerCase().includes(samplesSearch.toLowerCase())).length : result.columns.length} columns
              </span>
            </div>
            <div className="flex-1 overflow-auto rounded-md border border-border bg-card">
              {(() => {
                const filteredCols = samplesSearch
                  ? result.columns.filter((c) => c.toLowerCase().includes(samplesSearch.toLowerCase()))
                  : result.columns;
                const colIndices = filteredCols.map((c) => result.columns.indexOf(c));
                return (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        {filteredCols.map((col) => (
                          <th key={col} className="border-b border-border px-3 py-2 text-left font-semibold text-muted-foreground">{displayCol(col)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 50).map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/50"}>
                          {colIndices.map((ci) => (
                            <td key={ci} className="border-b border-border px-3 py-1.5">{row[ci] != null ? String(row[ci]) : ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        ) : result?.error ? (
          <Card className="mx-auto mt-8 max-w-md p-4">
            <p className="text-sm text-red-500">{typeof result.error === 'string' ? result.error : result.error?.message}</p>
          </Card>
        ) : result?.figure ? (
          <div className="h-full">
            <PlotlyChart figure={result.figure} className="h-full w-full" />
          </div>
        ) : result?.columns && result.columns.length > 0 && (chartType === "table" || chartType === "pivot" || !result.figure) ? (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto rounded-md border border-border bg-card text-xs">
              <DataTable
                columns={result.columns}
                rows={result.rows}
                formatting={formattingRules}
                columnFormats={editorColFormats}
                columnAliases={columnAliases}
                pivotHeaderLevels={result.pivot_header_levels}
                pivotRowIndexCount={result.pivot_row_index_count}
                pivotValueFormats={chartConfig?.pivot_value_formats as Record<string, import("@/components/charts/data-table").PivotValueFormat> | undefined}
                pivotPctMode={chartConfig?.pivot_pct_mode as string | undefined}
                pivotCondFormat={chartConfig?.pivot_cond_format as Array<{ metric: string; type: "heatmap" | "rule"; colorScale?: string; rules?: Array<{ op: string; value: number; color: string }> }>}
                pivotCondFormatMeta={result.pivot_cond_format_meta}
                formatCell={(value, colName) => {
                  if (colName === (chartConfig.time_column as string)) {
                    return formatDateByGrain(value, chartConfig.time_grain as string, chartConfig.date_format as string | undefined);
                  }
                  return formatCellValue(value, editorColFormats?.[colName]);
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center max-w-xs">
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
                <Play className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <h3 className="text-sm font-medium text-foreground mb-1">No data to display</h3>
              <p className="text-xs text-muted-foreground mb-3">
                {dataSource === "dataset"
                  ? "Select a dataset and columns to start building your chart"
                  : "Write a SQL query and click Run to see your chart"}
              </p>
              {mode === "code" && (
                <p className="text-[10px] text-muted-foreground/70 font-mono">
                  Tip: Your code must produce a `fig` variable (Plotly figure)
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer bar — Results/Samples tabs + info */}
      <div className="flex items-center gap-3 border-t border-border bg-muted/50 px-4 py-1.5 text-xs shrink-0">
        <button
          onClick={() => setPreviewTab("results")}
          className={`font-medium transition-colors ${previewTab === "results" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t("results")}
        </button>
        <button
          onClick={() => setPreviewTab("samples")}
          className={`font-medium transition-colors ${previewTab === "samples" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t("samples")}
        </button>
        <span className="ml-auto text-muted-foreground">{result?.row_count ?? 0} rows</span>
        {execTime != null && (
          <span className="font-mono text-muted-foreground" title={`${execTime}ms`}>
            {String(Math.floor(execTime / 3600000)).padStart(2, "0")}:
            {String(Math.floor((execTime % 3600000) / 60000)).padStart(2, "0")}:
            {String(Math.floor((execTime % 60000) / 1000)).padStart(2, "0")}.
            {String(execTime % 1000).padStart(3, "0")}
          </span>
        )}
        {result && result.columns.length > 0 && (
          <>
            <button onClick={() => downloadCSV(result.columns, result.rows, title || "data", editorColFormats)} className="text-primary hover:underline">CSV</button>
            <button onClick={() => downloadExcel(result.columns, result.rows, title || "data", token, editorColFormats, formattingRules)} className="text-primary hover:underline">Excel</button>
          </>
        )}
      </div>
    </div>
  );
}
