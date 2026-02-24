"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { layoutAwareFilter } from "@/lib/layout-aware-filter";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search, GripVertical } from "lucide-react";
import type { Connection, Dataset } from "@/types";

function HighlightText({ text, search, convertedSearch }: { text: string; search: string; convertedSearch?: string }) {
  if (!search && !convertedSearch) return <>{text}</>;
  const lowerText = text.toLowerCase();
  let idx = search ? lowerText.indexOf(search.toLowerCase()) : -1;
  let matchLen = search ? search.length : 0;
  if (idx === -1 && convertedSearch) {
    idx = lowerText.indexOf(convertedSearch.toLowerCase());
    matchLen = convertedSearch.length;
  }
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-yellow-200 dark:bg-yellow-800 rounded-sm">{text.slice(idx, idx + matchLen)}</span>
      {text.slice(idx + matchLen)}
    </>
  );
}

interface DraggableColumnProps {
  col: string;
  type: string;
  icon: string;
  search?: string;
  convertedSearch?: string;
}

function DraggableColumn({ col, type, icon, search = "", convertedSearch = "" }: DraggableColumnProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `column-${col}`,
    data: { column: col, type },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted cursor-grab select-none active:cursor-grabbing"
    >
      <span className="w-5 text-center text-[10px] font-mono text-muted-foreground shrink-0">{icon}</span>
      <span className="truncate flex-1"><HighlightText text={col} search={search} convertedSearch={convertedSearch} /></span>
      <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
    </div>
  );
}

interface DraggableMetricProps {
  metric: Record<string, string>;
}

function DraggableMetric({ metric }: DraggableMetricProps) {
  const stableId = `metric-${metric.aggregate || ""}:${metric.column || ""}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: stableId,
    data: { metric, type: "metric" },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted cursor-grab select-none active:cursor-grabbing"
    >
      <span className="w-5 text-center text-[10px] font-mono text-primary/70 shrink-0">fx</span>
      <span className="truncate flex-1">{metric.label || `${metric.aggregate}(${metric.column})`}</span>
      <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
    </div>
  );
}

export interface ChartSourcePanelProps {
  dataSource: "sql" | "dataset";
  connectionId: number | null;
  datasetId: number | null;
  connections: Connection[] | undefined;
  datasets: Dataset[] | undefined;
  availableColumns: string[];
  columnTypes: Record<string, string>;
  metrics: Array<Record<string, string>>;
  rowCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function ChartSourcePanel({
  dataSource,
  connectionId,
  datasetId,
  connections,
  datasets,
  availableColumns,
  columnTypes,
  metrics,
  rowCount,
  collapsed,
  onToggleCollapse,
}: ChartSourcePanelProps) {
  const t = useTranslations("chartSource");
  const tc = useTranslations("common");
  const [search, setSearch] = useState("");
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [columnsOpen, setColumnsOpen] = useState(true);

  const sourceName = dataSource === "dataset"
    ? datasets?.find(d => d.id === datasetId)?.name || t("selectDataset")
    : connections?.find(c => c.id === connectionId)?.name || t("selectConnection");

  const { results: filteredColumns, convertedQuery: colConvertedQuery } = layoutAwareFilter(
    availableColumns, search, (c) => c,
  );
  const { results: filteredMetrics } = layoutAwareFilter(
    metrics, search, (m) => m.label || m.column || "",
  );

  const numCols = filteredColumns.filter(c => columnTypes[c] === "number");
  const dateCols = filteredColumns.filter(c => columnTypes[c] === "date");
  const textCols = filteredColumns.filter(c => columnTypes[c] === "text" || !columnTypes[c]);

  if (collapsed) {
    return (
      <div className="w-10 shrink-0 border-r border-border bg-muted/30 flex flex-col items-center py-2">
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
          title={t("expandPanel")}
        >
          <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-[240px] min-w-[200px] shrink-0 border-r border-border bg-muted/30 flex flex-col overflow-hidden">
      {/* Dataset selector */}
      <div className="border-b border-border px-3 py-2 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {dataSource === "dataset" ? t("dataset") : t("sqlQuery")}
          </div>
          <p className="text-xs truncate mt-0.5">{sourceName}</p>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
          title={t("collapsePanel")}
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-90" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder={t("searchColumns")}
            className="h-7 text-xs pl-7"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {colConvertedQuery && (
        <div className="px-3 pb-1 text-xs text-muted-foreground">
          {tc("alsoSearching", { query: colConvertedQuery })}
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Metrics section */}
        {metrics.length > 0 && (
          <div className="border-b border-border">
            <button
              onClick={() => setMetricsOpen(!metricsOpen)}
              className="flex w-full items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground hover:bg-muted/50"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${metricsOpen ? "" : "-rotate-90"}`} />
              {t("metrics")}
              <span className="ml-auto font-normal normal-case">
                {t("ofCount", { filtered: filteredMetrics.length, total: metrics.length })}
              </span>
            </button>
            {metricsOpen && (
              <div className="px-1 pb-2 space-y-0.5">
                {filteredMetrics.map((m, i) => (
                  <DraggableMetric key={`${m.aggregate}:${m.column}`} metric={m} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Columns section */}
        <div>
          <button
            onClick={() => setColumnsOpen(!columnsOpen)}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground hover:bg-muted/50"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${columnsOpen ? "" : "-rotate-90"}`} />
            {t("columns")}
            <span className="ml-auto font-normal normal-case">
              {t("ofCount", { filtered: filteredColumns.length, total: availableColumns.length })}
            </span>
          </button>
          {columnsOpen && (
            <div className="px-1 pb-2 space-y-0.5">
              {availableColumns.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t("runToSeeColumns")}
                </p>
              ) : filteredColumns.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {t("noMatches")}
                </p>
              ) : (
                <>
                  {dateCols.length > 0 && (
                    <>
                      <div className="px-2 py-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase">{t("temporal")}</div>
                      {dateCols.map(col => (
                        <DraggableColumn key={col} col={col} type="date" icon="⏱" search={search} convertedSearch={colConvertedQuery || undefined} />
                      ))}
                    </>
                  )}
                  {numCols.length > 0 && (
                    <>
                      <div className="px-2 py-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase">{t("numeric")}</div>
                      {numCols.map(col => (
                        <DraggableColumn key={col} col={col} type="number" icon="#" search={search} convertedSearch={colConvertedQuery || undefined} />
                      ))}
                    </>
                  )}
                  {textCols.length > 0 && (
                    <>
                      <div className="px-2 py-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase">{t("string")}</div>
                      {textCols.map(col => (
                        <DraggableColumn key={col} col={col} type="text" icon="Str" search={search} convertedSearch={colConvertedQuery || undefined} />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
        {t("rowCount", { count: rowCount })}
      </div>
    </div>
  );
}
