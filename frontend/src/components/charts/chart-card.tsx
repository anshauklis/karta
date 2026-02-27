"use client";

import { useState, useCallback, memo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, RefreshCw, Loader2, Download, FileSpreadsheet, Info, MessageSquare, Maximize2, Copy, BarChart3, MoreHorizontal, Bot, ArrowRightLeft, Check, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PlotlyChart, type DataPointClickData } from "./plotly-chart";
import { DataTable } from "./data-table";
import { RichTextView } from "@/components/rich-text-view";
import { downloadCSV, downloadExcel } from "@/lib/export";
import { useSummarizeChart } from "@/hooks/use-ai";
import { ChartInsightsBadge } from "./chart-insights-badge";
import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import type { Chart, ChartExecuteResult, ColumnFormat } from "@/types";
import { useInView } from "@/hooks/use-in-view";

// Re-export for backward compatibility (chart-preview.tsx imports from here)
export { getCellStyle, computeColumnStats } from "./data-table";

interface ChartCardProps {
  chart: Chart;
  result?: ChartExecuteResult | null;
  isExecuting?: boolean;
  isFetching?: boolean;
  editHref?: string;
  onEdit?: (chartId: number) => void;
  onRefresh?: (chartId: number) => void;
  onDuplicate?: (chartId: number) => void;
  showActions?: boolean;
  onDataPointClick?: (chartId: number, data: DataPointClickData) => void;
  onToggleComments?: (chartId: number) => void;
  // Tab movement
  tabs?: Array<{ id: number; title: string }>;
  currentTabId?: number | null;
  onMoveToTab?: (chartId: number, tabId: number) => void;
}

export const ChartCard = memo(function ChartCard({ chart, result, isExecuting, isFetching, editHref, onEdit, onRefresh, onDuplicate, showActions = true, onDataPointClick, onToggleComments, tabs, currentTabId, onMoveToTab }: ChartCardProps) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const t = useTranslations("chart");
  const tc = useTranslations("common");
  const td = useTranslations("dashboard");
  const [showInfo, setShowInfo] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const summarize = useSummarizeChart();
  const hasDesc = !!chart.description?.trim();
  const colFormats = (chart.chart_config?.column_formats as Record<string, ColumnFormat>) || undefined;
  const chartId = chart.id;
  const [viewRef, isInView] = useInView();

  const handleEdit = useCallback(() => onEdit?.(chartId), [onEdit, chartId]);
  const handleRefresh = useCallback(() => onRefresh?.(chartId), [onRefresh, chartId]);
  const handleDuplicate = useCallback(() => onDuplicate?.(chartId), [onDuplicate, chartId]);
  const handleDataPointClick = useCallback((data: DataPointClickData) => onDataPointClick?.(chartId, data), [onDataPointClick, chartId]);
  const handleToggleComments = useCallback(() => onToggleComments?.(chartId), [onToggleComments, chartId]);

  // Text block — render content directly, no chart execution
  if (chart.chart_type === "text") {
    const textContent = (chart.chart_config?.content as string) || "";
    return (
      <Card className="flex h-full min-h-[200px] flex-col overflow-hidden md:min-h-0">
        <div className="flex-1 overflow-auto p-4">
          {textContent ? (
            <RichTextView html={textContent} prose />
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("emptyTextBlock")}</p>
          )}
        </div>
        {showActions && onEdit && (
          <div className="border-t border-border px-2 py-1 flex justify-end gap-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleEdit}>
              <Pencil className="mr-1 h-3 w-3" />
              {tc("edit")}
            </Button>
          </div>
        )}
      </Card>
    );
  }

  // Divider — horizontal line with optional title
  if (chart.chart_type === "divider") {
    const dividerTitle = (chart.chart_config?.title as string) || "";
    return (
      <div className="flex h-full items-center px-2">
        {dividerTitle ? (
          <div className="flex w-full items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="shrink-0 text-sm font-medium text-muted-foreground">{dividerTitle}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        ) : (
          <div className="h-px w-full bg-border" />
        )}
      </div>
    );
  }

  // Header — section heading
  if (chart.chart_type === "header") {
    const headerTitle = (chart.chart_config?.title as string) || chart.title || "";
    const level = (chart.chart_config?.level as number) || 1;
    const sizeClass = level === 1 ? "text-xl font-bold" : level === 2 ? "text-lg font-semibold" : "text-base font-medium";
    return (
      <div className="flex h-full items-end px-2 pb-1">
        <span className={`${sizeClass} text-foreground`}>{headerTitle}</span>
      </div>
    );
  }

  // Spacer — empty transparent block
  if (chart.chart_type === "spacer") {
    return <div className="h-full w-full" />;
  }

  // Tab container — rendered separately, not through ChartCard
  if (chart.chart_type === "tabs") {
    return null;
  }

  return (
    <Card className="flex h-full min-h-[200px] flex-col overflow-hidden md:min-h-0">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {editHref ? (
            <Link href={editHref} className="truncate text-sm font-medium text-foreground hover:underline hover:text-primary">
              {chart.title}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-foreground">{chart.title}</span>
          )}
          {hasDesc && (
            <button onClick={() => setShowInfo(true)} className="shrink-0 text-muted-foreground hover:text-blue-500" title={t("info")}>
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
          {chart.id && <ChartInsightsBadge chartId={chart.id} />}
        </div>
        {showActions && (
          <div className="flex shrink-0 gap-1">
            {/* Primary visible actions */}
            {(result?.figure || (result?.columns && result.columns.length > 0)) && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullscreen(true)} title={t("fullscreen")}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Overflow menu — secondary actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {result?.columns && result.columns.length > 0 && (
                  <>
                    <DropdownMenuItem
                      onClick={() => downloadCSV(result.columns, result.rows, chart.title || "chart-data", colFormats)}
                    >
                      <Download className="h-4 w-4" />
                      {t("downloadCSV")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => downloadExcel(result.columns, result.rows, chart.title || "chart-data", token, colFormats, result.formatting)}
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      {t("downloadExcel")}
                    </DropdownMenuItem>
                  </>
                )}
                {onDuplicate && (
                  <DropdownMenuItem onClick={handleDuplicate}>
                    <Copy className="h-4 w-4" />
                    {tc("duplicate")}
                  </DropdownMenuItem>
                )}
                {onRefresh && (
                  <DropdownMenuItem onClick={handleRefresh} disabled={isExecuting}>
                    <RefreshCw className="h-4 w-4" />
                    {tc("refresh")}
                  </DropdownMenuItem>
                )}
                {onToggleComments && (
                  <DropdownMenuItem onClick={handleToggleComments}>
                    <MessageSquare className="h-4 w-4" />
                    {t("comments")}
                  </DropdownMenuItem>
                )}
                {onMoveToTab && tabs && tabs.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <ArrowRightLeft className="h-4 w-4" />
                        {td("moveToTab")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {tabs.map((tab) => (
                          <DropdownMenuItem
                            key={tab.id}
                            disabled={currentTabId === tab.id}
                            onClick={() => onMoveToTab(chart.id, tab.id)}
                          >
                            {currentTabId === tab.id && <Check className="h-3 w-3 mr-1" />}
                            {tab.title}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
                {result?.columns && result.columns.length > 0 && (
                  <DropdownMenuItem
                    onClick={() => {
                      setSummary(null);
                      summarize.mutate(
                        {
                          chart_type: chart.chart_type || "",
                          title: chart.title || "",
                          columns: result.columns,
                          rows: result.rows.slice(0, 50),
                          row_count: result.row_count ?? result.rows.length,
                        },
                        { onSuccess: (data) => setSummary(data.text) }
                      );
                    }}
                    disabled={summarize.isPending}
                  >
                    <Bot className="h-4 w-4" />
                    {t("summarize")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Background refetch shimmer */}
      {isFetching && !isExecuting && (
        <div className="h-0.5 w-full overflow-hidden">
          <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-primary/30 rounded" />
        </div>
      )}

      {/* Chart body — lazy: heavy content (Plotly/DataTable) only mounts when card is in viewport */}
      <div ref={viewRef} className="flex-1 p-2 min-h-0">
        {!isInView || (isExecuting && !result) ? (
          <ChartSkeleton chartType={chart.chart_type} />
        ) : result?.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <p className="text-center text-sm text-red-500 max-w-xs">
              {typeof result.error === "string"
                ? result.error
                : result.error?.message || "An error occurred"}
            </p>
            {typeof result.error === "object" && result.error?.code && (
              <span className="text-[10px] text-muted-foreground font-mono">{result.error.code}</span>
            )}
            {onRefresh && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs mt-1"
                onClick={handleRefresh}
                disabled={isExecuting}
              >
                <RefreshCw className={`mr-1 h-3 w-3 ${isExecuting ? "animate-spin" : ""}`} />
                Retry
              </Button>
            )}
          </div>
        ) : result?.figure ? (
          <PlotlyChart figure={result.figure} className="h-full w-full" onDataPointClick={handleDataPointClick} />
        ) : result?.columns && result.columns.length > 0 ? (
          <div className="overflow-auto text-xs h-full">
            <DataTable
              columns={result.columns}
              rows={result.rows}
              formatting={result.formatting}
              columnFormats={colFormats}
              columnAliases={chart.chart_config?.column_aliases as Record<string, string> | undefined}
              pivotHeaderLevels={result.pivot_header_levels}
              pivotRowIndexCount={result.pivot_row_index_count}
              pivotValueFormats={chart.chart_config?.pivot_value_formats as Record<string, import("./data-table").PivotValueFormat> | undefined}
              pivotPctMode={chart.chart_config?.pivot_pct_mode as string | undefined}
              pivotCondFormat={chart.chart_config?.pivot_cond_format as Array<{ metric: string; type: "heatmap" | "rule"; colorScale?: string; rules?: Array<{ op: string; value: number; color: string }> }>}
              pivotCondFormatMeta={result.pivot_cond_format_meta}
              maxRows={50}
            />
          </div>
        ) : !chart.sql_query && !chart.dataset_id && !chart.chart_code ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <BarChart3 className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Chart not configured</p>
            {onEdit && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={handleEdit}>
                {tc("edit")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No data</p>
          </div>
        )}
      </div>

      {/* AI Summary */}
      {(summary || summarize.isPending) && (
        <div className="border-t border-border px-3 py-2 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-muted-foreground flex items-center gap-1">
              <Bot className="h-3 w-3" />
              AI Summary
            </span>
            {summary && (
              <button onClick={() => setSummary(null)} className="text-muted-foreground hover:text-foreground text-[10px]">
                &times;
              </button>
            )}
          </div>
          {summarize.isPending ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Analyzing...</span>
            </div>
          ) : (
            <p className="text-foreground whitespace-pre-wrap">{summary}</p>
          )}
        </div>
      )}

      {/* Chart info dialog */}
      {hasDesc && (
        <Dialog open={showInfo} onOpenChange={setShowInfo}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>{chart.title}</DialogTitle>
            </DialogHeader>
            <RichTextView html={chart.description} />
          </DialogContent>
        </Dialog>
      )}

      {/* Fullscreen dialog */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent size="full" className="flex flex-col">
          <DialogHeader>
            <DialogTitle>{chart.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {result?.figure ? (
              <PlotlyChart figure={result.figure} className="h-full w-full" />
            ) : result?.columns && result.columns.length > 0 ? (
              <div className="h-full overflow-auto text-xs">
                <DataTable
                  columns={result.columns}
                  rows={result.rows}
                  formatting={result.formatting}
                  columnFormats={colFormats}
                  columnAliases={chart.chart_config?.column_aliases as Record<string, string> | undefined}
                  pivotHeaderLevels={result.pivot_header_levels}
                  pivotRowIndexCount={result.pivot_row_index_count}
                  pivotValueFormats={chart.chart_config?.pivot_value_formats as Record<string, import("./data-table").PivotValueFormat> | undefined}
                  pivotPctMode={chart.chart_config?.pivot_pct_mode as string | undefined}
                  pivotCondFormat={chart.chart_config?.pivot_cond_format as Array<{ metric: string; type: "heatmap" | "rule"; colorScale?: string; rules?: Array<{ op: string; value: number; color: string }> }>}
                  pivotCondFormatMeta={result.pivot_cond_format_meta}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">No data</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
});
