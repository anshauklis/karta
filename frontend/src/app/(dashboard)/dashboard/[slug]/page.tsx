"use client";

import { useEffect, useState, useRef, use, useCallback, useMemo, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDashboardBySlug } from "@/hooks/use-dashboards";
import { useDashboardTabs } from "@/hooks/use-tabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardCharts, useExecuteChart, useUpdateChart, chartResultKey } from "@/hooks/use-charts";
import { ChartCard } from "@/components/charts/chart-card";
import { ChartErrorBoundary } from "@/components/charts/chart-error-boundary";
import { TabContainer } from "@/components/charts/tab-container";
import { TextBlockEditor } from "@/components/text-block-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, ChevronRight, BarChart3, Info, X, Share2, FileDown, Download, MessageSquare, Plus, BookOpen, MoreHorizontal, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useContainerWidth } from "@/hooks/use-container-width";
import { RichTextView } from "@/components/rich-text-view";
import { FilterGrid } from "@/components/dashboard/filter-grid";
import { FilterEditor } from "@/components/dashboard/filter-editor";
import { useDashboardFilters } from "@/hooks/use-filters";
import { CommentsPanel } from "@/components/comments-panel";
import { ShareDialog } from "@/components/share-dialog";
import { DataGuidePanel } from "@/components/dashboard/data-guide-panel";
import { downloadDashboardPDF } from "@/lib/export-pdf";
import { DashboardPropertiesDialog } from "@/components/dashboard/dashboard-properties-dialog";
import { useConnections } from "@/hooks/use-connections";
import { useDatasets } from "@/hooks/use-datasets";
import { useDashboardColumnsTyped } from "@/hooks/use-filters";
import type { ChartExecuteResult } from "@/types";
import { useHotkey } from "@/hooks/use-hotkey";
import { useQueryClient } from "@tanstack/react-query";
import { useRoles } from "@/hooks/use-roles";
import { NLFilterBar } from "@/components/dashboard/nl-filter-bar";
import { MobileDashboard } from "@/components/dashboard/mobile-dashboard";
import { useIsMobile } from "@/hooks/use-mobile";

const VISUAL_TYPES = new Set(["text", "divider", "header", "spacer", "tabs"]);
const FILTER_CONCURRENCY = 4;

// Dynamic import for react-grid-layout (needs window)
import dynamic from "next/dynamic";
const ReactGridLayout = dynamic(
  () => import("react-grid-layout/legacy").then((mod) => mod.default || mod) as unknown as Promise<React.ComponentType<Record<string, unknown>>>,
  { ssr: false }
) as React.ComponentType<Record<string, unknown>>;

// Import react-grid-layout CSS
import "react-grid-layout/css/styles.css";

export default function DashboardViewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { data: dashboard, isLoading: dashLoading } = useDashboardBySlug(slug);
  const { data: charts } = useDashboardCharts(dashboard?.id);
  const { data: session } = useSession();
  const { canEdit } = useRoles();
  const isMobile = useIsMobile();
  const executeChart = useExecuteChart();
  const updateChart = useUpdateChart();
  const queryClient = useQueryClient();

  // Ctrl+S / Cmd+S — prevent browser save dialog
  useHotkey("s", useCallback(() => {}, []));

  const [containerRef, containerWidth] = useContainerWidth();
  const [results, setResults] = useState<Record<number, ChartExecuteResult>>({});
  const [executing, setExecuting] = useState<Set<number>>(new Set());
  const [showInfo, setShowInfo] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({});
  const [drillFilters, setDrillFilters] = useState<Record<string, unknown>>({});
  const activeFiltersRef = useRef(activeFilters);
  activeFiltersRef.current = activeFilters;
  const drillFiltersRef = useRef(drillFilters);
  drillFiltersRef.current = drillFilters;
  const [commentsChartId, setCommentsChartId] = useState<number | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showDashComments, setShowDashComments] = useState(false);
  const [dataGuideOpen, setDataGuideOpen] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [editingTextChartId, setEditingTextChartId] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const { data: tabs } = useDashboardTabs(dashboard?.id ?? 0);
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<string>("");

  // Initialize activeTab from URL param or first tab
  useEffect(() => {
    if (!tabs || tabs.length === 0) return;
    if (activeTabParam && tabs.some((t) => String(t.id) === activeTabParam)) {
      setActiveTab(activeTabParam);
    } else if (!activeTab || !tabs.some((t) => String(t.id) === activeTab)) {
      setActiveTab(String(tabs[0].id));
    }
  }, [tabs, activeTabParam, activeTab]);

  const containedChartIds = useMemo(() => {
    if (!charts) return new Set<number>();
    const ids = new Set<number>();
    charts.forEach((chart) => {
      if (chart.chart_type === "tabs" && chart.chart_config?.tabs) {
        (chart.chart_config.tabs as Array<{ charts?: Array<{ chart_id: number }> }>).forEach((tab) => {
          tab.charts?.forEach((c) => ids.add(c.chart_id));
        });
      }
    });
    return ids;
  }, [charts]);

  const visibleCharts = useMemo(() => {
    if (!charts) return [];
    let filtered = charts;
    if (activeTab) {
      const tabId = parseInt(activeTab);
      if (!isNaN(tabId)) {
        filtered = charts.filter((c) => c.tab_id === tabId);
      }
    }
    return filtered.filter((c) => !containedChartIds.has(c.id));
  }, [charts, activeTab, containedChartIds]);

  const { data: allConnections } = useConnections();
  const { data: allDatasets } = useDatasets();
  const { data: dashFilters } = useDashboardFilters(dashboard?.id);
  const { data: typedColumns } = useDashboardColumnsTyped(dashboard?.id);
  const defaultsApplied = useRef(false);

  // Apply default filter values on first load
  useEffect(() => {
    if (!dashFilters || defaultsApplied.current) return;
    defaultsApplied.current = true;
    const defaults: Record<string, unknown> = {};
    for (const f of dashFilters) {
      if (f.default_value) {
        defaults[f.id] = f.default_value;
      }
    }
    if (Object.keys(defaults).length > 0) {
      setActiveFilters(defaults);
    }
  }, [dashFilters]);


  const layout = useMemo(
    () =>
      visibleCharts.map((chart) => ({
        i: String(chart.id),
        x: chart.grid_x,
        y: chart.grid_y,
        w: chart.grid_w,
        h: chart.grid_h,
      })),
    [visibleCharts]
  );

  // Track which charts have been auto-executed
  const executedRef = useRef<Set<number>>(new Set());

  const resolveFiltersForChart = useCallback((chartId: number, filterValues: Record<string, unknown>) => {
    if (!dashFilters || Object.keys(filterValues).length === 0) return {};
    const resolved: Record<string, unknown> = {};
    for (const filter of dashFilters) {
      const value = filterValues[filter.id] ?? filterValues[String(filter.id)];
      if (value === null || value === undefined) continue;
      const config = filter.config || {};
      const scope = (config.scope as Record<string, string>) || {};
      const delimiter = config.delimiter as string | undefined;
      const chartKey = String(chartId);
      // Only apply filter to charts explicitly listed in scope
      if (!(chartKey in scope)) continue;
      const col = scope[chartKey] || filter.target_column;
      // Wrap in __contains for delimiter-split columns
      resolved[col] = delimiter ? { __contains: value } : value;
    }
    return resolved;
  }, [dashFilters]);

  // Restore cached chart results from TanStack Query on mount
  useEffect(() => {
    if (!charts) return;
    const cached: Record<number, ChartExecuteResult> = {};
    for (const chart of charts) {
      if (VISUAL_TYPES.has(chart.chart_type || "")) continue;
      // Try cache with no filters first (initial load)
      const key = chartResultKey(chart.id);
      const data = queryClient.getQueryData<ChartExecuteResult>(key);
      if (data) {
        cached[chart.id] = data;
      }
    }
    if (Object.keys(cached).length > 0) {
      setResults((prev) => ({ ...cached, ...prev }));
    }
    // Only run on initial chart load, not on filter changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charts]);

  const executeChartById = useCallback(async (chartId: number, filters?: Record<string, unknown>, force?: boolean) => {
    startTransition(() => {
      setExecuting((prev) => new Set(prev).add(chartId));
    });
    try {
      // If no explicit resolved filters provided, resolve from current active + drill filters
      const resolved = filters ?? resolveFiltersForChart(chartId, { ...activeFiltersRef.current, ...drillFiltersRef.current });
      const result = await executeChart.mutateAsync({ chartId, filters: Object.keys(resolved).length > 0 ? resolved : undefined, force });
      // Persist to TanStack Query cache for cross-navigation
      queryClient.setQueryData(chartResultKey(chartId, Object.keys(resolved).length > 0 ? resolved : undefined), result);
      startTransition(() => {
        setResults((prev) => ({ ...prev, [chartId]: result }));
      });
    } catch (e: unknown) {
      startTransition(() => {
        setResults((prev) => ({
          ...prev,
          [chartId]: { figure: null, columns: [], rows: [], row_count: 0, error: e instanceof Error ? e.message : String(e) },
        }));
      });
    } finally {
      startTransition(() => {
        setExecuting((prev) => {
          const next = new Set(prev);
          next.delete(chartId);
          return next;
        });
      });
    }
  }, [resolveFiltersForChart, executeChart, queryClient]);

  // Viewport-gated: execute a single chart when it becomes visible
  const executeChartOnVisible = useCallback((chartId: number) => {
    if (executedRef.current.has(chartId)) return;
    executedRef.current.add(chartId);
    executeChartById(chartId);
  }, [executeChartById]);

  const handleRefreshChart = useCallback((chartId: number) => {
    executeChartById(chartId, undefined, true);
  }, [executeChartById]);

  // Re-execute already-loaded charts when filters change
  const filtersSnap = useRef<string>("");
  useEffect(() => {
    if (!charts || charts.length === 0) return;

    const merged = { ...activeFilters, ...drillFilters };
    const snap = JSON.stringify(merged);

    // First run: record initial filter state, don't execute (viewport handles it)
    if (filtersSnap.current === "") {
      filtersSnap.current = snap;
      return;
    }
    if (filtersSnap.current === snap) return;
    filtersSnap.current = snap;

    // Only re-execute charts that have already been loaded (visible ones)
    const chartsToExecute = charts.filter((chart) => {
      if (VISUAL_TYPES.has(chart.chart_type || "")) return false;
      return executedRef.current.has(chart.id);
    });

    if (chartsToExecute.length === 0) return;

    let cancelled = false;
    (async () => {
      for (let i = 0; i < chartsToExecute.length; i += FILTER_CONCURRENCY) {
        if (cancelled) break;
        const batch = chartsToExecute.slice(i, i + FILTER_CONCURRENCY);
        await Promise.allSettled(
          batch.map((chart) => {
            const resolved = resolveFiltersForChart(chart.id, merged);
            return executeChartById(chart.id, Object.keys(resolved).length > 0 ? resolved : undefined);
          })
        );
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charts, activeFilters, drillFilters]);

  const handleEditTextBlock = useCallback((chartId: number) => {
    setEditingTextChartId(chartId);
    setTextEditorOpen(true);
  }, []);

  const handleSaveTextBlock = useCallback((html: string) => {
    if (!editingTextChartId) return;
    updateChart.mutate({
      chartId: editingTextChartId,
      data: { chart_config: { content: html } },
    });
  }, [editingTextChartId, updateChart]);

  const handleEditChart = useCallback((chartId: number) => {
    const c = charts?.find((ch) => ch.id === chartId);
    if (c?.chart_type === "text") {
      handleEditTextBlock(chartId);
    } else {
      router.push(`/dashboard/${slug}/chart/${chartId}`);
    }
  }, [router, slug, charts, handleEditTextBlock]);

  const handleDataPointClick = useCallback((chartId: number, data: { x?: unknown; y?: unknown; label?: string; name?: string }) => {
    const chart = charts?.find((c) => c.id === chartId);
    if (!chart) return;
    const config = chart.chart_config as Record<string, unknown>;
    const xCol = config?.x_column as string | undefined;
    if (xCol && data.x != null) {
      setDrillFilters((prev) => ({ ...prev, [xCol]: data.x }));
    }
  }, [charts]);

  const handleToggleComments = useCallback((chartId: number) => {
    setCommentsChartId((prev) => (prev === chartId ? null : chartId));
  }, []);

  if (dashLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Dashboard not found</p>
        <Link href="/" className="mt-2 text-blue-600 hover:underline">Back to home</Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <nav className="flex items-center gap-1 text-sm min-w-0">
            <Link href="/" className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors shrink-0">
              {tn("dashboards")}
            </Link>
            <ChevronRight className="hidden sm:block h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-2xl leading-none shrink-0">{dashboard.icon}</span>
            <h1 className="text-lg sm:text-xl font-semibold text-foreground truncate">{dashboard.title}</h1>
          </nav>
          {dashboard.description && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setShowInfo((v) => !v)}
              title="Dashboard info"
            >
              <Info className={`h-4 w-4 ${showInfo ? "text-blue-600" : "text-muted-foreground"}`} />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          {/* Overflow menu — secondary actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowProperties(true)}>
                <Settings2 className="h-4 w-4" />
                {t("properties")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDataGuideOpen(true)}>
                <BookOpen className="h-4 w-4" />
                {t("dataGuide")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDashComments((v) => !v)}>
                <MessageSquare className="h-4 w-4" />
                {t("comments")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (gridRef.current) downloadDashboardPDF(gridRef.current, dashboard?.title ?? "Dashboard");
                }}
              >
                <FileDown className="h-4 w-4" />
                {t("pdf")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/dashboards/${dashboard.id}/export`, {
                      headers: { Authorization: `Bearer ${(session as { accessToken?: string } | null)?.accessToken}` },
                    });
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${dashboard.url_slug}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    toast.error("Export failed");
                  }
                }}
              >
                <Download className="h-4 w-4" />
                {t("exportJson")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canEdit && <FilterEditor dashboardId={dashboard.id} dashboard={dashboard} />}
          <Button size="sm" variant="ghost" onClick={() => setShowShare(true)}>
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">{t("share")}</span>
          </Button>
          {canEdit && (
            <Link href={`/dashboard/${slug}/chart/new`}>
              <Button size="sm" variant="default">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">{t("addChart")}</span>
              </Button>
            </Link>
          )}
          {canEdit && (
            <Link href={`/dashboard/${slug}/edit`}>
              <Button size="sm" variant="secondary">
                <Pencil className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">{tc("edit")}</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {showInfo && dashboard.description && (
        <div className="mb-4 rounded-md border border-accent bg-accent/50 px-4 py-3">
          <RichTextView html={dashboard.description} />
        </div>
      )}

      {/* Tab bar — only shown if 2+ tabs */}
      {tabs && tabs.length > 1 && (
        <div className="px-4 pt-2">
          <Tabs value={activeTab} onValueChange={(v) => {
            setActiveTab(v);
            const url = new URL(window.location.href);
            url.searchParams.set("tab", v);
            window.history.replaceState({}, "", url.toString());
          }}>
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={String(tab.id)} className="px-4">
                  {tab.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* NL Filter Bar (AI) */}
      {typedColumns && typedColumns.length > 0 && (
        <NLFilterBar
          columns={typedColumns}
          onFiltersApplied={(filters) => {
            setDrillFilters((prev) => ({ ...prev, ...filters }));
          }}
        />
      )}

      {/* Filters */}
      <FilterGrid
        dashboardId={dashboard.id}
        dashboard={dashboard}
        activeFilters={activeFilters}
        onFiltersChange={setActiveFilters}
        isEditing={false}
      />

      {/* Drill-down breadcrumb */}
      {Object.keys(drillFilters).length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Drill:</span>
          {Object.entries(drillFilters).map(([col, val]) => (
            <Badge key={col} variant="secondary" className="gap-1">
              {col} = {String(val)}
              <button
                onClick={() =>
                  setDrillFilters((prev) => {
                    const next = { ...prev };
                    delete next[col];
                    return next;
                  })
                }
                className="ml-1 hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDrillFilters({})}
            className="h-6 text-xs"
          >
            {t("drillClearAll")}
          </Button>
        </div>
      )}

      {/* Chart grid */}
      {!charts || charts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BarChart3 className="mb-4 h-16 w-16 text-muted-foreground/50" />
          <h2 className="mb-2 text-lg font-medium text-foreground">{t("noCharts")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">Edit this dashboard to add charts</p>
          <Link href={`/dashboard/${slug}/edit`}>
            <Button>
              <Pencil className="mr-1 h-4 w-4" />
              {t("editDashboard")}
            </Button>
          </Link>
        </div>
      ) : isMobile ? (
        <div ref={gridRef}>
          <MobileDashboard
            charts={visibleCharts}
            allCharts={charts || []}
            results={results}
            executing={executing}
            editHrefPrefix={`/dashboard/${slug}/chart`}
            onEdit={handleEditChart}
            onRefresh={handleRefreshChart}
            onDataPointClick={handleDataPointClick}
            onToggleComments={handleToggleComments}
            onVisible={executeChartOnVisible}
            onUpdateTabConfig={(chartId, config) =>
              updateChart.mutate({ chartId, data: { chart_config: config } })
            }
          />
        </div>
      ) : (
        <div ref={containerRef} className="-mx-6">
        <div ref={gridRef}>
        <ReactGridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={1}
          width={containerWidth}
          isDraggable={false}
          isResizable={false}
          compactType="vertical"
          margin={[16, 0]}
        >
          {visibleCharts.map((chart) => (
            <div key={String(chart.id)}>
              <ChartErrorBoundary chartTitle={chart.title} onRetry={() => handleRefreshChart(chart.id)}>
                {chart.chart_type === "tabs" ? (
                  <div className="h-full">
                    <TabContainer
                      chart={chart}
                      allCharts={charts || []}
                      results={results}
                      executing={executing}
                      isEditing={false}
                      onUpdateConfig={(config) =>
                        updateChart.mutate({ chartId: chart.id, data: { chart_config: config } })
                      }
                      onEdit={handleEditChart}
                      onRefresh={handleRefreshChart}
                    />
                  </div>
                ) : (
                  <ChartCard
                    chart={chart}
                    result={results[chart.id]}
                    isExecuting={executing.has(chart.id)}
                    isFetching={executing.has(chart.id) && !!results[chart.id]}
                    editHref={chart.chart_type !== "text" ? `/dashboard/${slug}/chart/${chart.id}` : undefined}
                    onRefresh={handleRefreshChart}
                    onEdit={handleEditChart}
                    onDataPointClick={handleDataPointClick}
                    onToggleComments={handleToggleComments}
                    onVisible={() => executeChartOnVisible(chart.id)}
                  />
                )}
              </ChartErrorBoundary>
            </div>
          ))}
        </ReactGridLayout>
        </div>
        </div>
      )}

      {/* Comments panel — chart level */}
      {commentsChartId && (
        <CommentsPanel entityType="chart" entityId={commentsChartId} onClose={() => setCommentsChartId(null)} />
      )}

      {/* Comments panel — dashboard level */}
      {showDashComments && dashboard && (
        <CommentsPanel entityType="dashboard" entityId={dashboard.id} onClose={() => setShowDashComments(false)} />
      )}

      {/* Share dialog */}
      {showShare && dashboard && (
        <ShareDialog dashboardId={dashboard.id} onClose={() => setShowShare(false)} />
      )}

      {/* Data guide panel */}
      <DataGuidePanel
        open={dataGuideOpen}
        onOpenChange={setDataGuideOpen}
        charts={charts || []}
        connections={allConnections || []}
        datasets={allDatasets || []}
      />

      {/* Text block editor */}
      <TextBlockEditor
        open={textEditorOpen}
        onOpenChange={setTextEditorOpen}
        content={
          editingTextChartId
            ? ((charts?.find((c) => c.id === editingTextChartId)?.chart_config?.content as string) || "")
            : ""
        }
        onSave={handleSaveTextBlock}
      />

      {/* Dashboard properties */}
      {dashboard && (
        <DashboardPropertiesDialog
          dashboard={dashboard}
          open={showProperties}
          onOpenChange={setShowProperties}
        />
      )}
    </div>
  );
}
