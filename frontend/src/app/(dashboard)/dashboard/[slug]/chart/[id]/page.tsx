"use client";

import { use, useState, useEffect, useMemo, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Code2,
  Palette,
  Calendar,
  Hash,
  Settings2,
  ChevronDown,
  GripVertical,
  Search,
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  ScatterChart as ScatterIcon,
  Table2,
  TableProperties,
  BarChart,
  Circle,
  ArrowUpDown,
  Grid3X3,
  BoxSelect,
  LayoutGrid,
  Filter,
  Layers,
  ChevronsDown,
  MoreVertical,
  Pencil,
  Terminal,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChartTypeGallery } from "@/components/charts/chart-type-gallery";
import { RichTextEditor } from "@/components/rich-text-editor";
import { HistoryPanel } from "@/components/history-panel";
import { ChartPreview } from "./components/chart-preview";
import { ChartHeader } from "./components/chart-header";
import { SaveChartModal } from "./components/save-chart-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslations } from "next-intl";
import { layoutAwareFilter } from "@/lib/layout-aware-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartEditor } from "./hooks/use-chart-editor";
import { CodeTab } from "./components/code-tab";
import { CustomizeTab } from "./components/customize-tab";
import { DataTab } from "./components/data-tab";
import { useHotkey } from "@/hooks/use-hotkey";
import { AIChartBuilder } from "@/components/ai/ai-chart-builder";
import { MetricsBrowser } from "@/components/metrics/metrics-browser";
import { useSemanticModels } from "@/hooks/use-semantic";
import type { SuggestChartConfigResult } from "@/hooks/use-ai";

const CHART_TYPE_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; rotate?: boolean }> = {
  bar: { icon: BarChart3 },
  line: { icon: LineChart },
  pie: { icon: PieChart },
  table: { icon: Table2 },
  kpi: { icon: Hash },
  scatter: { icon: ScatterIcon },
  area: { icon: AreaChart },
  pivot: { icon: TableProperties },
  donut: { icon: Circle },
  histogram: { icon: BarChart },
  bar_h: { icon: BarChart3, rotate: true },
  combo: { icon: Layers },
  heatmap: { icon: Grid3X3 },
  box: { icon: BoxSelect },
  treemap: { icon: LayoutGrid },
  funnel: { icon: Filter },
  waterfall: { icon: ChevronsDown },
  violin: { icon: BarChart },
  pareto: { icon: ArrowUpDown },
  control: { icon: LineChart },
  correlation: { icon: Grid3X3 },
};

function DraggableColumnPill({ col, type }: { col: string; type: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `source-${col}`,
    data: { col, source: "column-list" },
  });
  const typeIcons: Record<string, string> = { number: "#", date: "\uD83D\uDCC5", text: "Aa" };
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted/70 cursor-grab active:cursor-grabbing transition-colors ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
      <span className="font-mono text-xs text-muted-foreground shrink-0">{typeIcons[type] || "?"}</span>
      <span className="truncate">{col}</span>
    </button>
  );
}

export default function ChartEditorPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = use(params);
  const t = useTranslations("chart");
  const tc = useTranslations("common");
  const ts = useTranslations("chartSource");

  const editor = useChartEditor(slug, id);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [columnSearch, setColumnSearch] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const {
    // Route/identity
    isNew, isStandalone, chartId, router, dashboard, allDashboards, existingChart, connections, datasets, isDark,
    // Standalone dashboard selector
    selectedDashboardId, setSelectedDashboardId: _setSelectedDashboardId,
    // Tab selector
    dashboardTabs: _dashboardTabs, selectedTabId: _selectedTabId, setSelectedTabId: _setSelectedTabId,
    // Mutations
    updateChart, createChart, createStandaloneChart,
    // Form state
    title, setTitle, description, setDescription, showDesc, setShowDesc,
    connectionId, setConnectionId, dataSource, setDataSource, datasetId, setDatasetId,
    sqlQuery, setSqlQuery, mode, chartType, setChartType, chartCode, setChartCode,
    chartConfig, setChartConfig, chartVariables, setChartVariables,
    // Undo
    configUndo,
    // Tab state
    activeTab, setActiveTab, codeSubTab, setCodeSubTab,
    customizeSubTab, setCustomizeSubTab, execTime,
    tooltipOpen, setTooltipOpen, statsOpen, setStatsOpen,
    transformsOpen, setTransformsOpen, refLinesOpen, setRefLinesOpen,
    codeUpdatedVisual, setCodeUpdatedVisual, editorZoom, setEditorZoom,
    // Preview/result
    result, previewing, showHistory, setShowHistory,
    chartGalleryOpen, setChartGalleryOpen,
    fmtSelectedCols, setFmtSelectedCols,
    saveModalOpen, setSaveModalOpen,
    // Columns
    queryColumns, availableColumns, selectedColumns, columnTypes,
    // Handlers
    handlePreview, handleModalSave,
    handleYColumnsChange, handleMultiSelectToggle, updateConfig,
    handleRunQuery, handleSqlEditorMount,
    // Templates
    templates, addTemplate,
    // Conditional formatting
    formattingRules, addFormattingRule, removeFormattingRule, updateFormattingRule,
    addThresholdSubRule, removeThresholdSubRule, updateThresholdSubRule,
    // Derived booleans
    isPivot, isTable, isKPI, isHistogram,
    showXAxis, showYAxis, showColor, showStyling, showConditionalFormatting, canPreview: _canPreview,
    // Refs
    codeEditingRef, codeEditTimerRef,
  } = editor;

  // Semantic models — show metrics tab only when models exist for current connection
  const { data: semanticModels } = useSemanticModels(connectionId);
  const hasMetrics = !!connectionId && (semanticModels?.length ?? 0) > 0;

  // If user is on metrics tab but no models exist anymore, reset to data tab
  useEffect(() => {
    if (activeTab === "metrics" && !hasMetrics) {
      setActiveTab("data");
    }
  }, [activeTab, hasMetrics, setActiveTab]);

  // Ctrl+S / Cmd+S opens the save modal
  useHotkey("s", useCallback(() => setSaveModalOpen(true), [setSaveModalOpen]));

  // AI chart builder: apply suggested config
  const handleAISuggest = useCallback((suggestion: SuggestChartConfigResult) => {
    if (suggestion.chart_type) {
      setChartType(suggestion.chart_type);
    }
    if (suggestion.chart_config && typeof suggestion.chart_config === "object") {
      setChartConfig((prev: Record<string, unknown>) => ({
        ...prev,
        ...suggestion.chart_config,
      }));
    }
    if (suggestion.sql_query) {
      setSqlQuery(suggestion.sql_query);
    }
    if (suggestion.title) {
      setTitle(suggestion.title);
    }
  }, [setChartType, setChartConfig, setSqlQuery, setTitle]);

  // Auto-collapse header once connection + chart type are both selected
  useEffect(() => {
    const hasConnection = dataSource === "sql" ? !!connectionId : !!datasetId;
    if (hasConnection && chartType && !isNew) {
      queueMicrotask(() => setHeaderCollapsed(true));
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDataset = dataSource === "dataset" && datasetId
    ? datasets?.find((ds) => ds.id === datasetId)
    : undefined;
  const selectedSourceName = dataSource === "sql"
    ? connections?.find((c) => c.id === connectionId)?.name
    : selectedDataset?.name;

  const { results: filteredEditorColumns, convertedQuery: editorConvertedQuery } = useMemo(
    () => layoutAwareFilter(availableColumns, columnSearch, (c) => c),
    [availableColumns, columnSearch],
  );

  // Loading gate: show skeleton while chart data is being fetched
  if (!existingChart && id !== "new") {
    return (
      <div className="flex h-[calc(100vh-5.5rem)] flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <Skeleton className="h-6 w-48" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
          <div className="flex-1 p-4">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
          <div className="w-80 border-l p-3 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function getZoneItems(configKey: string): string[] {
    if (configKey === "x_column") return chartConfig.x_column ? [chartConfig.x_column as string] : [];
    if (configKey === "color_column") return chartConfig.color_column ? [chartConfig.color_column as string] : [];
    return (chartConfig[configKey] as string[]) || [];
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Dragged from metrics browser — use drag data instead of parsing IDs
    const dragData = active.data.current;
    if (dragData?.type === "measure") {
      const yItems = (chartConfig.y_columns as string[]) || [];
      if (overId === "zone-y" || yItems.includes(overId)) {
        updateConfig("y_columns", [...yItems, dragData.name]);
      }
      return;
    }
    if (dragData?.type === "dimension") {
      if (overId === "zone-x" || overId === chartConfig.x_column) {
        updateConfig("x_column", dragData.columnName);
      } else if (overId === "zone-color" || overId === chartConfig.color_column) {
        updateConfig("color_column", dragData.columnName);
      }
      return;
    }

    // Dragged from column list to a drop zone
    if (activeId.startsWith("source-")) {
      const col = activeId.replace("source-", "");
      const zoneId = overId.startsWith("source-") ? null : overId;
      if (!zoneId) return;

      const zoneToConfig: Record<string, string> = {
        "zone-x": "x_column",
        "zone-y": "y_columns",
        "zone-color": "color_column",
        "zone-pivot-rows": "pivot_rows",
        "zone-pivot-cols": "pivot_columns",
        "zone-pivot-vals": "pivot_values",
      };

      let targetZone = zoneToConfig[zoneId];
      if (!targetZone) {
        for (const [, configKey] of Object.entries(zoneToConfig)) {
          const items = getZoneItems(configKey);
          if (items.includes(overId)) {
            targetZone = configKey;
            break;
          }
        }
      }
      if (!targetZone) return;

      if (targetZone === "x_column" || targetZone === "color_column") {
        updateConfig(targetZone, col);
      } else if (targetZone === "y_columns") {
        // Allow duplicate columns in y_columns (e.g. SUM(revenue) + AVG(revenue))
        const current = (chartConfig[targetZone] as string[]) || [];
        updateConfig(targetZone, [...current, col]);
      } else if (targetZone === "pivot_values") {
        // Allow duplicate columns in pivot_values (same column with different aggfuncs)
        const current = (chartConfig[targetZone] as string[]) || [];
        if (current.includes(col)) {
          let suffix = 2;
          while (current.includes(`${col}__${suffix}`)) suffix++;
          const dupId = `${col}__${suffix}`;
          updateConfig(targetZone, [...current, dupId]);
          // Copy aggfunc from base column to duplicate
          const fns = { ...((chartConfig.pivot_aggfuncs as Record<string, unknown>) || {}) };
          if (col in fns) {
            fns[dupId] = fns[col];
            updateConfig("pivot_aggfuncs", fns);
          }
        } else {
          updateConfig(targetZone, [...current, col]);
        }
      } else {
        const current = (chartConfig[targetZone] as string[]) || [];
        if (!current.includes(col)) {
          updateConfig(targetZone, [...current, col]);
        }
      }
      return;
    }

    // Reorder within a zone (sortable)
    if (active.id !== over.id) {
      const multiZones = ["y_columns", "pivot_rows", "pivot_columns", "pivot_values"];
      for (const key of multiZones) {
        const items = (chartConfig[key] as string[]) || [];
        const oldIdx = items.indexOf(activeId);
        const newIdx = items.indexOf(overId);
        if (oldIdx >= 0 && newIdx >= 0) {
          updateConfig(key, arrayMove(items, oldIdx, newIdx));
          return;
        }
      }
    }
  }

  return (
    <>
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <div className="flex h-[calc(100vh-5.5rem)] flex-col">
      {/* Top bar — Superset-style header */}
      <ChartHeader
        slug={slug}
        title={title}
        onTitleChange={setTitle}
        description={description}
        onDescriptionChange={setDescription}
        showDesc={showDesc}
        onShowDescChange={setShowDesc}
        dashboardTitle={isStandalone ? "" : (dashboard?.title || slug)}
        isNew={isNew}
        isStandalone={isStandalone}
        isSaving={updateChart.isPending || createChart.isPending || createStandaloneChart.isPending}
        canUndo={configUndo.canUndo}
        canRedo={configUndo.canRedo}
        onUndo={configUndo.undo}
        onRedo={configUndo.redo}
        onOpenSaveModal={() => setSaveModalOpen(true)}
        onSaveAsTemplate={() => {
          const name = prompt("Template name:");
          if (name) addTemplate(name, chartType, chartConfig as Record<string, unknown>);
        }}
        onDelete={() => setShowDeleteConfirm(true)}
        onShowHistory={() => setShowHistory((v) => !v)}
        chartId={chartId}
        previewing={previewing}
        templates={templates}
        onLoadTemplate={(t) => {
          setChartType(t.chartType);
          setChartConfig((prev: Record<string, unknown>) => ({ ...prev, ...t.config }));
        }}
        aiBuilder={
          <AIChartBuilder
            connectionId={connectionId}
            datasetId={datasetId}
            columns={availableColumns}
            currentConfig={chartConfig as Record<string, unknown>}
            currentChartType={chartType}
            onSuggest={handleAISuggest}
          />
        }
      />

      {/* Source + Chart Type — top bar */}
      <div className="shrink-0 border-b border-border bg-card">
        {headerCollapsed ? (
          <button
            onClick={() => setHeaderCollapsed(false)}
            className="flex w-full items-center gap-3 px-4 py-1.5 text-xs hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              {(() => {
                const ct = CHART_TYPE_ICONS[chartType];
                const Icon = ct?.icon || BarChart3;
                return <Icon className={`h-4 w-4 ${ct?.rotate ? "rotate-90" : ""}`} />;
              })()}
              <span className="font-medium">{t(`types.${chartType}`) || chartType}</span>
            </div>
            <span className="text-muted-foreground">|</span>
            <div className="flex items-center gap-1.5">
              {dataSource === "sql" ? <Code2 className="h-3 w-3 text-muted-foreground" /> : <Calendar className="h-3 w-3 text-muted-foreground" />}
              <span className="text-muted-foreground truncate">{selectedSourceName || "Select source..."}</span>
            </div>
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          </button>
        ) : (
          <div className="px-4 py-2 space-y-2">
            <div className="flex items-center gap-3">
              {/* Data source toggle */}
              <div className="flex rounded-md border border-border bg-muted/50 p-0.5 shrink-0">
                <button
                  onClick={() => setDataSource("sql")}
                  className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    dataSource === "sql"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Code2 className="h-3 w-3" />
                  SQL
                </button>
                <button
                  onClick={() => setDataSource("dataset")}
                  className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    dataSource === "dataset"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <TableProperties className="h-3 w-3" />
                  {ts("dataset")}
                </button>
              </div>

              {/* Connection / Dataset selector */}
              <div className="w-48">
                {dataSource === "sql" ? (
                  <Select
                    value={connectionId ? String(connectionId) : ""}
                    onValueChange={(v) => setConnectionId(parseInt(v))}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select connection..." />
                    </SelectTrigger>
                    <SelectContent>
                      {connections?.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name} ({c.db_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={datasetId ? String(datasetId) : ""}
                    onValueChange={(v) => setDatasetId(parseInt(v))}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select dataset..." />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets?.map((ds) => (
                        <SelectItem key={ds.id} value={String(ds.id)}>{ds.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Source context menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-1 flex items-center text-muted-foreground hover:text-foreground transition-colors">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {dataSource === "dataset" && selectedDataset && (
                    <>
                      <DropdownMenuItem onClick={() => window.open(`/datasets?edit=${selectedDataset.id}`, "_blank")}>
                        <Pencil className="h-3.5 w-3.5" />
                        {t("editDataset")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        const cid = selectedDataset.connection_id;
                        const sql = selectedDataset.sql_query;
                        const params = new URLSearchParams();
                        if (cid) params.set("cid", String(cid));
                        if (sql) params.set("sql", sql);
                        window.open(`/sql-lab?${params.toString()}`, "_blank");
                      }}>
                        <Terminal className="h-3.5 w-3.5" />
                        {t("viewInSQLLab")}
                      </DropdownMenuItem>
                    </>
                  )}
                  {dataSource === "sql" && connectionId && (
                    <DropdownMenuItem onClick={() => {
                      const params = new URLSearchParams();
                      params.set("cid", String(connectionId));
                      if (sqlQuery) params.set("sql", sqlQuery);
                      window.open(`/sql-lab?${params.toString()}`, "_blank");
                    }}>
                      <Terminal className="h-3.5 w-3.5" />
                      {t("viewInSQLLab")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Collapse button */}
              <button
                onClick={() => setHeaderCollapsed(true)}
                className="ml-auto flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              </button>
            </div>

            {/* Chart type icon row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <TooltipProvider delayDuration={200}>
                {(["bar", "line", "pie", "table", "kpi", "scatter", "area", "pivot"] as const).map((ct) => {
                  const entry = CHART_TYPE_ICONS[ct];
                  const Icon = entry?.icon || BarChart3;
                  return (
                    <Tooltip key={ct}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => { setChartType(ct); setHeaderCollapsed(true); }}
                          className={`h-10 w-10 rounded-md border flex items-center justify-center transition-colors ${
                            chartType === ct
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          <Icon className={`h-5 w-5 ${entry?.rotate ? "rotate-90" : ""}`} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {t(`types.${ct}`)}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
              <button
                onClick={() => setChartGalleryOpen(true)}
                className="h-10 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:border-primary/30 transition-colors"
              >
                More...
              </button>
              <ChartTypeGallery
                open={chartGalleryOpen}
                onOpenChange={setChartGalleryOpen}
                value={chartType}
                onSelect={(v) => { setChartType(v); setHeaderCollapsed(true); }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Split panels — layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Column browser — fixed left sidebar (outside PanelGroup to avoid fragment issues) */}
        {availableColumns.length > 0 && !isTable && (
          <div className="w-64 shrink-0 border-r border-border flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Columns</span>
                <span className="text-xs text-muted-foreground">{availableColumns.length}</span>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  placeholder="Search columns..."
                  className="w-full rounded-md border border-border bg-muted/50 pl-7 pr-2 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {editorConvertedQuery && (
                <div className="text-xs text-muted-foreground mt-1">
                  {tc("alsoSearching", { query: editorConvertedQuery })}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-1.5">
              {(() => {
                const numCols = filteredEditorColumns.filter((c) => columnTypes[c] === "number");
                const dateCols = filteredEditorColumns.filter((c) => columnTypes[c] === "date");
                const textCols = filteredEditorColumns.filter((c) => columnTypes[c] === "text" || !columnTypes[c]);
                return (
                  <>
                    {numCols.length > 0 && (
                      <div className="space-y-0">
                        <div className="text-xs font-medium text-muted-foreground px-2.5 py-1 flex items-center gap-1.5">
                          <Hash className="h-3.5 w-3.5" /> Numeric ({numCols.length})
                        </div>
                        {numCols.map((col) => <DraggableColumnPill key={col} col={col} type="number" />)}
                      </div>
                    )}
                    {dateCols.length > 0 && (
                      <div className="space-y-0">
                        <div className="text-xs font-medium text-muted-foreground px-2.5 py-1 flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" /> Date ({dateCols.length})
                        </div>
                        {dateCols.map((col) => <DraggableColumnPill key={col} col={col} type="date" />)}
                      </div>
                    )}
                    {textCols.length > 0 && (
                      <div className="space-y-0">
                        <div className="text-xs font-medium text-muted-foreground px-2.5 py-1 flex items-center gap-1.5">
                          <span className="font-mono text-[10px]">Aa</span> Text ({textCols.length})
                        </div>
                        {textCols.map((col) => <DraggableColumnPill key={col} col={col} type="text" />)}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        <PanelGroup orientation="horizontal" id="chart-editor-v5" className="flex-1 min-w-0">
        {/* Config panel */}
        <Panel id="config" defaultSize="35%" minSize="20%" maxSize="55%">
        <div className="flex h-full flex-col overflow-hidden bg-card">

          {/* Description toggle */}
          <div className="shrink-0 px-3 py-1">
            <button
              type="button"
              onClick={() => setShowDesc((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showDesc ? "Hide description" : "+ Add description"}
            </button>
            {showDesc && (
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="Chart description..."
                className="text-xs mt-1"
              />
            )}
          </div>

          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as typeof activeTab); if (v === "data") setCodeUpdatedVisual(false); }} className="flex flex-col flex-1 min-h-0 gap-0">
          {/* Tab bar */}
          <div className="shrink-0 border-b border-border px-3 py-1">
            <TabsList variant="line" className="h-auto">
              <TabsTrigger value="data" className="px-3 py-1.5 text-sm">
                <Palette className="h-4 w-4" />
                Data
                {codeUpdatedVisual && activeTab !== "data" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" title="Updated from code" />
                )}
              </TabsTrigger>
              <TabsTrigger value="customize" className="px-3 py-1.5 text-sm">
                <Settings2 className="h-4 w-4" />
                Customize
              </TabsTrigger>
              <TabsTrigger value="code" className="px-3 py-1.5 text-sm">
                <Code2 className="h-4 w-4" />
                {t("code")}
              </TabsTrigger>
              {hasMetrics && (
                <TabsTrigger value="metrics" className="px-3 py-1.5 text-sm">
                  <Layers className="h-4 w-4" />
                  {t("metrics")}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Scrollable tab content */}
          <TabsContent value="data" className="flex-1 overflow-y-auto p-3 space-y-3 mt-0" style={{ zoom: editorZoom }}>
            <DataTab
              dataSource={dataSource}
              sqlQuery={sqlQuery}
              setSqlQuery={setSqlQuery}
              handleSqlEditorMount={handleSqlEditorMount}
              handleRunQuery={handleRunQuery}
              previewing={previewing}
              isDark={isDark}
              chartConfig={chartConfig}
              updateConfig={updateConfig}
              setChartConfig={setChartConfig}
              chartType={chartType}
              availableColumns={availableColumns}
              queryColumns={queryColumns}
              columnTypes={columnTypes}
              result={result}
              isPivot={isPivot}
              isTable={isTable}
              isKPI={isKPI}
              isHistogram={isHistogram}
              showXAxis={showXAxis}
              showYAxis={showYAxis}
              showColor={showColor}
              handleYColumnsChange={handleYColumnsChange}
              handleMultiSelectToggle={handleMultiSelectToggle}
              variables={chartVariables}
              onVariablesChange={setChartVariables}
            />
          </TabsContent>

          <TabsContent value="customize" className="flex-1 overflow-y-auto p-3 space-y-3 mt-0" style={{ zoom: editorZoom }}>
            <CustomizeTab
              chartConfig={chartConfig}
              chartType={chartType}
              result={result}
              availableColumns={selectedColumns}
              customizeSubTab={customizeSubTab}
              setCustomizeSubTab={setCustomizeSubTab}
              fmtSelectedCols={fmtSelectedCols}
              setFmtSelectedCols={setFmtSelectedCols}
              isPivot={isPivot}
              showStyling={showStyling}
              showConditionalFormatting={showConditionalFormatting}
              tooltipOpen={tooltipOpen}
              setTooltipOpen={setTooltipOpen}
              statsOpen={statsOpen}
              setStatsOpen={setStatsOpen}
              transformsOpen={transformsOpen}
              setTransformsOpen={setTransformsOpen}
              refLinesOpen={refLinesOpen}
              setRefLinesOpen={setRefLinesOpen}
              formattingRules={formattingRules}
              addFormattingRule={addFormattingRule}
              removeFormattingRule={removeFormattingRule}
              updateFormattingRule={updateFormattingRule}
              addThresholdSubRule={addThresholdSubRule}
              removeThresholdSubRule={removeThresholdSubRule}
              updateThresholdSubRule={updateThresholdSubRule}
              updateConfig={updateConfig}
            />
          </TabsContent>

          <TabsContent value="code" className="flex-1 overflow-y-auto p-3 space-y-3 mt-0" style={{ zoom: editorZoom }}>
            <CodeTab
              chartCode={chartCode}
              setChartCode={setChartCode}
              codeSubTab={codeSubTab}
              setCodeSubTab={setCodeSubTab}
              codeUpdatedVisual={codeUpdatedVisual}
              setCodeUpdatedVisual={setCodeUpdatedVisual}
              codeEditingRef={codeEditingRef}
              codeEditTimerRef={codeEditTimerRef}
              result={result}
              previewing={previewing}
              isDark={isDark}
              setChartType={setChartType}
              setChartConfig={setChartConfig}
            />
          </TabsContent>

          <TabsContent value="metrics" className="flex-1 overflow-y-auto p-3 space-y-1 mt-0" style={{ zoom: editorZoom }}>
            <MetricsBrowser connectionId={connectionId} />
          </TabsContent>

          </Tabs>{/* end tabs */}
        </div>{/* end flex h-full flex-col */}
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/30 active:bg-primary/50 transition-colors cursor-col-resize shrink-0" />

        {/* Right panel — Preview */}
        <Panel id="preview" defaultSize="65%" minSize="30%">
        <ChartPreview
          result={result}
          previewing={previewing}
          execTime={execTime}
          chartType={chartType}
          chartConfig={chartConfig}
          title={title}
          isDark={isDark}
          onPreview={handlePreview}
          dataSource={dataSource}
          mode={mode}
        />
        </Panel>
        </PanelGroup>

      </div>

      {/* Floating zoom control — bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1 rounded-lg border border-border bg-background/95 backdrop-blur px-2 py-1 shadow-lg">
        <button
          onClick={() => {
            const next = Math.max(0.8, editorZoom - 0.05);
            setEditorZoom(next);
            localStorage.setItem("karta-editor-zoom", String(next));
          }}
          className="px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          title="Decrease font size"
        >
          A−
        </button>
        <span className="text-[10px] text-muted-foreground tabular-nums min-w-[3ch] text-center">
          {Math.round(editorZoom * 100)}%
        </span>
        <button
          onClick={() => {
            const next = Math.min(1.5, editorZoom + 0.05);
            setEditorZoom(next);
            localStorage.setItem("karta-editor-zoom", String(next));
          }}
          className="px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          title="Increase font size"
        >
          A+
        </button>
      </div>

      {/* History side panel */}
      {showHistory && chartId && (
        <HistoryPanel entityType="chart" entityId={chartId} onClose={() => setShowHistory(false)} />
      )}

      {/* Save Chart Modal */}
      <SaveChartModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        isNew={isNew}
        currentTitle={title}
        currentChartId={chartId}
        currentDashboardId={selectedDashboardId}
        allDashboards={(allDashboards ?? []).map((d) => ({
          id: d.id,
          title: d.title,
          icon: d.icon,
          url_slug: d.url_slug,
        }))}
        isSaving={updateChart.isPending || createChart.isPending || createStandaloneChart.isPending}
        onSave={handleModalSave}
      />

      {/* DragOverlay */}
      <DragOverlay dropAnimation={null}>
        {activeDragId?.startsWith("source-") ? (
          <div className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-lg">
            <GripVertical className="h-3 w-3 text-muted-foreground/40" />
            <span>{activeDragId.replace("source-", "")}</span>
          </div>
        ) : activeDragId?.startsWith("metric-measure-") ? (
          <div className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-lg">
            <GripVertical className="h-3 w-3 text-muted-foreground/40" />
            <Hash className="h-3 w-3 text-primary" />
            <span>{activeDragId.replace(/^metric-measure-\d+-/, "")}</span>
          </div>
        ) : activeDragId?.startsWith("metric-dimension-") ? (
          <div className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-lg">
            <GripVertical className="h-3 w-3 text-muted-foreground/40" />
            <Calendar className="h-3 w-3 text-primary" />
            <span>{activeDragId.replace(/^metric-dimension-\d+-/, "")}</span>
          </div>
        ) : activeDragId ? (
          <div className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-lg">
            <GripVertical className="h-3 w-3 opacity-50" />
            <span className="truncate max-w-[120px]">{activeDragId}</span>
          </div>
        ) : null}
      </DragOverlay>
    </div>
    </DndContext>

    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tc("areYouSure")}</AlertDialogTitle>
          <AlertDialogDescription>{tc("cannotBeUndone")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => router.push(isStandalone ? "/charts" : `/dashboard/${slug}`)}
          >
            {tc("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
