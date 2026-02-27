"use client";

import { useEffect, useState, useCallback, useRef, useMemo, use, forwardRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDashboardBySlug, useUpdateDashboard } from "@/hooks/use-dashboards";
import {
  useDashboardCharts,
  useDeleteChart,
  useExecuteChart,
  useSaveLayout,
  useDuplicateChart,
  useCreateChart,
  useUpdateChart,
} from "@/hooks/use-charts";
import { useDashboardTabs, useCreateTab, useUpdateTab, useDeleteTab, useMoveChartToTab, useReorderTabs } from "@/hooks/use-tabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChartCard } from "@/components/charts/chart-card";
import { TabContainer } from "@/components/charts/tab-container";
import { TextBlockEditor } from "@/components/text-block-editor";
import { FilterEditor } from "@/components/dashboard/filter-editor";
import { FilterGrid } from "@/components/dashboard/filter-grid";
import { ChartBrowser } from "@/components/dashboard/chart-browser";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Save,
  ChevronRight,
  Trash2,
  Loader2,
  FileText,
  History,
  GripVertical,
  Columns2,
  Columns3,
  LayoutGrid,
  SquareIcon,
  Search,
  BarChart3,
  Type,
  Minus,
  Heading,
  Space,
  SquareSplitVertical,
  X,
  Settings2,
  Undo2,
  Redo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { RichTextEditor } from "@/components/rich-text-editor";
import { HistoryPanel } from "@/components/history-panel";
import { DashboardPropertiesDialog } from "@/components/dashboard/dashboard-properties-dialog";
import { useContainerWidth } from "@/hooks/use-container-width";
import { useHotkey } from "@/hooks/use-hotkey";
import { useLayoutHistory } from "@/hooks/use-layout-history";
import type { Chart, ChartExecuteResult, LayoutItem } from "@/types";

import dynamic from "next/dynamic";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactGridLayout = dynamic(
  () => import("react-grid-layout/legacy").then((mod) => mod.default || mod) as any,
  { ssr: false }
) as any;
import "react-grid-layout/css/styles.css";

const VISUAL_TYPES = new Set(["text", "divider", "header", "spacer", "tabs"]);

// Layout preset helpers
function applyLayoutPreset(charts: Chart[], columns: number): LayoutItem[] {
  const colWidth = Math.floor(12 / columns);
  return charts.map((chart, i) => ({
    id: chart.id,
    grid_x: (i % columns) * colWidth,
    grid_y: Math.floor(i / columns) * 224,
    grid_w: colWidth,
    grid_h: 224,
  }));
}

function SortableTabItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={isDragging ? "z-10" : ""}
    >
      <div className="flex items-center">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground transition-opacity px-0.5"
          tabIndex={-1}
        >
          <GripVertical className="h-3 w-3" />
        </span>
        {children}
      </div>
    </div>
  );
}

type ResizeHandleAxis = "s" | "w" | "e" | "n" | "se" | "sw" | "ne" | "nw";

const ResizeHandle = forwardRef<HTMLDivElement, { axis: ResizeHandleAxis }>(
  ({ axis, ...props }, ref) => {
    const positionClasses: Record<string, string> = {
      s: "bottom-0 left-0 right-0 h-1.5 cursor-ns-resize",
      n: "top-0 left-0 right-0 h-1.5 cursor-ns-resize",
      w: "top-0 bottom-0 left-0 w-1.5 cursor-ew-resize",
      e: "top-0 bottom-0 right-0 w-1.5 cursor-ew-resize",
      se: "bottom-0 right-0 h-3 w-3 cursor-nwse-resize",
      sw: "bottom-0 left-0 h-3 w-3 cursor-nesw-resize",
      ne: "top-0 right-0 h-3 w-3 cursor-nesw-resize",
      nw: "top-0 left-0 h-3 w-3 cursor-nwse-resize",
    };

    const isEdge = axis.length === 1;
    const isCorner = axis.length === 2;

    return (
      <div
        ref={ref}
        className={`react-resizable-handle absolute z-30 opacity-0 group-hover:opacity-100 transition-opacity ${positionClasses[axis] || ""}`}
        {...props}
      >
        {isCorner && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400/70" />
          </div>
        )}
        {isEdge && (
          <div
            className={`absolute ${
              axis === "s" || axis === "n"
                ? "left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 h-0.5 w-8 rounded-full bg-blue-400/50"
                : "top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-0.5 h-8 rounded-full bg-blue-400/50"
            }`}
          />
        )}
      </div>
    );
  }
);
ResizeHandle.displayName = "ResizeHandle";

export default function DashboardEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { data: dashboard, isLoading: dashLoading } = useDashboardBySlug(slug);
  const { data: charts, isLoading: chartsLoading } = useDashboardCharts(dashboard?.id);
  const deleteChart = useDeleteChart();
  const duplicateChart = useDuplicateChart();
  const executeChart = useExecuteChart();
  const createChart = useCreateChart(dashboard?.id ?? 0);
  const updateChart = useUpdateChart();
  const saveLayout = useSaveLayout(dashboard?.id ?? 0);
  const updateDashboard = useUpdateDashboard();

  // Ctrl+S / Cmd+S — prevent browser save dialog (layout auto-saves)
  useHotkey("s", useCallback(() => {}, []));

  const { data: tabs } = useDashboardTabs(dashboard?.id ?? 0);
  const createTabMut = useCreateTab(dashboard?.id ?? 0);
  const updateTabMut = useUpdateTab(dashboard?.id ?? 0);
  const deleteTabMut = useDeleteTab(dashboard?.id ?? 0);
  const moveChartToTab = useMoveChartToTab();
  const reorderTabs = useReorderTabs(dashboard?.id ?? 0);
  const tabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const [activeTab, setActiveTab] = useState<string>("");
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [deleteTabId, setDeleteTabId] = useState<number | null>(null);

  // Initialize activeTab to first tab's ID when tabs load
  useEffect(() => {
    if (tabs && tabs.length > 0 && (!activeTab || !tabs.some((t) => String(t.id) === activeTab))) {
      setActiveTab(String(tabs[0].id));
    }
  }, [tabs]);

  const [containerRef, containerWidth, freezeWidth, unfreezeWidth] = useContainerWidth();
  const [results, setResults] = useState<Record<number, ChartExecuteResult>>({});
  const [executing, setExecuting] = useState<Set<number>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({});
  const [showDescEditor, setShowDescEditor] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [compactType, setCompactType] = useState<"vertical" | null>("vertical");
  const [textEditorOpen, setTextEditorOpen] = useState(false);
  const [editingTextChartId, setEditingTextChartId] = useState<number | null>(null);
  const t = useTranslations("dashboard");
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [deleteChartId, setDeleteChartId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const pointerTabRef = useRef<string | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const tc = useTranslations("common");
  const tl = useTranslations("layout");
  const tn = useTranslations("nav");

  const containedChartIds = useMemo(() => {
    if (!charts) return new Set<number>();
    const ids = new Set<number>();
    charts.forEach((chart) => {
      if (chart.chart_type === "tabs" && chart.chart_config?.tabs) {
        (chart.chart_config.tabs as any[]).forEach((tab: any) => {
          (tab.charts as any[])?.forEach((c: any) => ids.add(c.chart_id));
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

  // Memoized layout from charts — stable reference, only changes when charts data changes.
  // RGL manages its own internal state during drag/resize. We only save on stop.
  const layout = useMemo(
    () =>
      visibleCharts.map((chart) => ({
        i: String(chart.id),
        x: chart.grid_x,
        y: chart.grid_y,
        w: chart.grid_w,
        h: chart.grid_h,
        minW: chart.chart_type === "tabs" ? 4 : VISUAL_TYPES.has(chart.chart_type || "") ? 1 : 2,
        minH: chart.chart_type === "tabs" ? 168 : VISUAL_TYPES.has(chart.chart_type || "") ? 56 : 112,
      })),
    [visibleCharts]
  );

  const layoutHistory = useLayoutHistory();

  // Init description from dashboard
  useEffect(() => {
    if (dashboard) setDescValue(dashboard.description || "");
  }, [dashboard]);

  // Track which charts have been auto-executed
  const executedRef = useRef<Set<number>>(new Set());

  const historyInitRef = useRef(false);
  useEffect(() => {
    if (visibleCharts.length > 0 && !historyInitRef.current) {
      historyInitRef.current = true;
      layoutHistory.init(
        visibleCharts.map((c) => ({
          id: c.id,
          grid_x: c.grid_x,
          grid_y: c.grid_y,
          grid_w: c.grid_w,
          grid_h: c.grid_h,
        }))
      );
    }
  }, [visibleCharts]);

  // Execute all charts on load
  useEffect(() => {
    if (!charts || charts.length === 0) return;
    charts.forEach((chart) => {
      if (VISUAL_TYPES.has(chart.chart_type || "")) return;
      const canRun = chart.sql_query || chart.connection_id || chart.dataset_id;
      if (canRun && !executedRef.current.has(chart.id)) {
        executedRef.current.add(chart.id);
        executeChartById(chart.id);
      }
    });
  }, [charts]);

  const executeChartById = async (chartId: number) => {
    setExecuting((prev) => new Set(prev).add(chartId));
    try {
      const result = await executeChart.mutateAsync({ chartId });
      setResults((prev) => ({ ...prev, [chartId]: result }));
    } catch (e: any) {
      setResults((prev) => ({
        ...prev,
        [chartId]: { figure: null, columns: [], rows: [], row_count: 0, error: e.message },
      }));
    } finally {
      setExecuting((prev) => {
        const next = new Set(prev);
        next.delete(chartId);
        return next;
      });
    }
  };

  // Ref for adding CSS class during drag/resize — avoids React re-renders
  const gridRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    (_layout: any, _oldItem: any) => {
      setSelectedIds(new Set());
      gridRef.current?.classList.add("grid-interacting");
      if (gridRef.current) {
        const colW = (containerWidth - 11 * 16) / 12;
        gridRef.current.style.setProperty("--col-w", `${colW}px`);
        gridRef.current.style.setProperty("--grid-gap", "16px");
      }
      freezeWidth();

      // Monitor pointer to highlight tab on hover
      const onMove = (e: PointerEvent) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const tabEl = (el as HTMLElement)?.closest?.("[data-tab-id]") as HTMLElement | null;
        const tabId = tabEl?.dataset.tabId || null;
        if (tabId !== pointerTabRef.current) {
          pointerTabRef.current = tabId;
          setDragOverTabId(tabId);
        }
      };
      document.addEventListener("pointermove", onMove);
      pointerCleanupRef.current = () => {
        document.removeEventListener("pointermove", onMove);
      };
    },
    [freezeWidth, containerWidth]
  );

  const handleResizeStart = useCallback(() => {
    gridRef.current?.classList.add("grid-interacting");
    if (gridRef.current) {
      const colW = (containerWidth - 11 * 16) / 12;
      gridRef.current.style.setProperty("--col-w", `${colW}px`);
      gridRef.current.style.setProperty("--grid-gap", "16px");
    }
    freezeWidth();
  }, [freezeWidth, containerWidth]);

  // Save layout on drag stop — also handles cross-tab chart moves
  const handleDragStop = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (finalLayout: { i: string; x: number; y: number; w: number; h: number }[], _oldItem: any, newItem: any) => {
      gridRef.current?.classList.remove("grid-interacting");
      unfreezeWidth();
      // Clean up pointermove listener
      pointerCleanupRef.current?.();
      pointerCleanupRef.current = null;

      const targetTabId = pointerTabRef.current;
      pointerTabRef.current = null;
      setDragOverTabId(null);

      const chartId = parseInt(newItem.i);
      const chart = charts?.find((c) => c.id === chartId);

      // Check if dropped on a different tab
      if (targetTabId && chart) {
        const currentTab = chart.tab_id ? String(chart.tab_id) : "";
        if (targetTabId !== currentTab) {
          const newTabId = parseInt(targetTabId);
          if (!isNaN(newTabId)) {
            moveChartToTab.mutate(
              { chartId, tabId: newTabId },
              { onSuccess: () => setActiveTab(targetTabId) }
            );
            return; // Don't save layout — chart moved to another tab
          }
        }
      }

      // Normal layout save
      if (!dashboard || !finalLayout.length) return;
      const items: LayoutItem[] = finalLayout.map((l) => ({
        id: parseInt(l.i),
        grid_x: l.x,
        grid_y: l.y,
        grid_w: l.w,
        grid_h: l.h,
      }));
      layoutHistory.push(items);
      saveLayout.mutate(items);
    },
    [dashboard, saveLayout, charts, moveChartToTab, unfreezeWidth, layoutHistory]
  );

  const handleResizeStop = useCallback(
    (finalLayout: { i: string; x: number; y: number; w: number; h: number }[]) => {
      gridRef.current?.classList.remove("grid-interacting");
      unfreezeWidth();
      if (!dashboard || !finalLayout.length) return;
      const items: LayoutItem[] = finalLayout.map((l) => ({
        id: parseInt(l.i),
        grid_x: l.x,
        grid_y: l.y,
        grid_w: l.w,
        grid_h: l.h,
      }));
      layoutHistory.push(items);
      saveLayout.mutate(items);
    },
    [dashboard, saveLayout, unfreezeWidth, layoutHistory]
  );

  const handleApplyPreset = async (columns: number) => {
    if (!charts || !dashboard) return;
    const items = applyLayoutPreset(charts, columns);
    layoutHistory.push(items);
    await saveLayout.mutateAsync(items);
  };

  const handleAddChart = () => {
    router.push(`/dashboard/${slug}/chart/new`);
  };

  const handleAddTextBlock = async () => {
    try {
      const newChart = await createChart.mutateAsync({
        title: "",
        chart_type: "text",
        chart_config: { content: "" },
        mode: "visual",
      });
      setEditingTextChartId(newChart.id);
      setTextEditorOpen(true);
    } catch { /* toast handled by hook */ }
  };

  const handleAddDivider = async () => {
    try {
      await createChart.mutateAsync({
        title: "",
        chart_type: "divider",
        chart_config: {},
        mode: "visual",
      });
    } catch { /* toast handled by hook */ }
  };

  const handleAddHeader = async () => {
    try {
      await createChart.mutateAsync({
        title: "",
        chart_type: "header",
        chart_config: { title: "Section", level: 1 },
        mode: "visual",
      });
    } catch { /* toast handled by hook */ }
  };

  const handleAddSpacer = async () => {
    try {
      await createChart.mutateAsync({
        title: "",
        chart_type: "spacer",
        chart_config: {},
        mode: "visual",
      });
    } catch { /* toast handled by hook */ }
  };

  const handleAddTabContainer = async () => {
    try {
      await createChart.mutateAsync({
        title: "Tabs",
        chart_type: "tabs",
        chart_config: {
          tabs: [
            { id: crypto.randomUUID(), title: "Tab 1", charts: [] },
            { id: crypto.randomUUID(), title: "Tab 2", charts: [] },
          ],
        },
        mode: "visual",
      });
    } catch { /* toast handled by hook */ }
  };

  const handleEditTextBlock = (chartId: number) => {
    setEditingTextChartId(chartId);
    setTextEditorOpen(true);
  };

  const handleSaveTextBlock = (html: string) => {
    if (!editingTextChartId) return;
    updateChart.mutate({
      chartId: editingTextChartId,
      data: { chart_config: { content: html } },
    });
  };

  const handleDeleteChart = (chartId: number) => {
    setDeleteChartId(chartId);
  };

  const confirmDeleteChart = async () => {
    if (deleteChartId === null) return;
    await deleteChart.mutateAsync(deleteChartId);
    setDeleteChartId(null);
  };

  const handleRefreshChart = useCallback((chartId: number) => {
    executeChartById(chartId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUndo = useCallback(() => {
    const restored = layoutHistory.undo();
    if (restored && dashboard) {
      saveLayout.mutate(restored);
    }
  }, [layoutHistory, dashboard, saveLayout]);

  const handleRedo = useCallback(() => {
    const restored = layoutHistory.redo();
    if (restored && dashboard) {
      saveLayout.mutate(restored);
    }
  }, [layoutHistory, dashboard, saveLayout]);

  useHotkey("z", useCallback((e: KeyboardEvent) => {
    if (e.shiftKey) {
      handleRedo();
    } else {
      handleUndo();
    }
  }, [handleUndo, handleRedo]));

  const handleEditChart = useCallback((chartId: number) => {
    const c = charts?.find((ch) => ch.id === chartId);
    if (c?.chart_type === "text") {
      handleEditTextBlock(chartId);
    } else {
      router.push(`/dashboard/${slug}/chart/${chartId}`);
    }
  }, [router, slug, charts]);

  const handleDuplicateChart = useCallback((chartId: number) => {
    duplicateChart.mutate(chartId);
  }, [duplicateChart]);

  const handleMoveChartToTab = useCallback((chartId: number, tabId: number) => {
    moveChartToTab.mutate(
      { chartId, tabId },
      {
        onSuccess: () => {
          setActiveTab(String(tabId));
        },
      }
    );
  }, [moveChartToTab]);

  const handleChartClick = useCallback((chartId: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(chartId)) {
          next.delete(chartId);
        } else {
          next.add(chartId);
        }
        return next;
      });
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIds(new Set());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleTabDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !tabs) return;
    const oldIndex = tabs.findIndex(t => String(t.id) === String(active.id));
    const newIndex = tabs.findIndex(t => String(t.id) === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(tabs, oldIndex, newIndex);
    reorderTabs.mutate(newOrder.map(t => t.id));
  }, [tabs, reorderTabs]);

  if (dashLoading || chartsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
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
        <Link href="/" className="mt-2 text-primary hover:underline">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen -mx-6 -mt-6 px-6 pt-0 bg-blue-50/40 dark:bg-blue-950/10">
      {/* Edit mode banner */}
      <div className="flex items-center justify-between border-b border-blue-200/60 dark:border-blue-800/30 bg-blue-50/80 dark:bg-blue-950/20 px-6 py-2 -mx-6 mb-4">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              {tn("dashboards")}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <Link href={`/dashboard/${slug}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
              <span className="text-lg leading-none">{dashboard.icon}</span>
              <span>{dashboard.title}</span>
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px]">
              {t("editing")}
            </Badge>
          </nav>
          <span className="text-xs text-muted-foreground hidden sm:inline">{t("dragToRearrange")}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Layout presets */}
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
            <button
              onClick={() => handleApplyPreset(1)}
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
              title={tl("column1")}
            >
              <SquareIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleApplyPreset(2)}
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
              title={tl("column2")}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleApplyPreset(3)}
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
              title={tl("column3")}
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleApplyPreset(4)}
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
              title={tl("column4")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={() => setCompactType((prev) => (prev === "vertical" ? null : "vertical"))}
            className={`rounded p-1 text-xs px-2 ${
              compactType === null
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
            title={compactType === "vertical" ? tl("freePlace") : tl("compact")}
          >
            {compactType === "vertical" ? tl("compact") : tl("freePlace")}
          </button>

          <div className="mx-1 h-4 w-px bg-border" />
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleUndo}
              disabled={!layoutHistory.canUndo}
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
              title={tl("undo")}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!layoutHistory.canRedo}
              className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
              title={tl("redo")}
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mx-1 h-4 w-px bg-border" />

          <Button size="sm" variant="outline" onClick={() => setShowDescEditor((v) => !v)}>
            <FileText className="mr-1 h-4 w-4" />
            {t("description")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowProperties(true)}>
            <Settings2 className="mr-1 h-4 w-4" />
            {t("properties")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            <History className="mr-1 h-4 w-4" />
          </Button>
          <FilterEditor dashboardId={dashboard.id} dashboard={dashboard} />
          <ChartBrowser dashboardId={dashboard.id}>
            <Button size="sm" variant="outline">
              <Search className="mr-1 h-4 w-4" />
              {t("browseCharts")}
            </Button>
          </ChartBrowser>
          <Button
            size="sm"
            variant="outline"
            onClick={() => createTabMut.mutate({ title: "New Tab" })}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addTab")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                {tc("add")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleAddChart}>
                <BarChart3 className="mr-2 h-4 w-4" />
                {t("addChart")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleAddTextBlock}>
                <Type className="mr-2 h-4 w-4" />
                {t("addTextBlock")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddDivider}>
                <Minus className="mr-2 h-4 w-4" />
                {t("addDivider")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddHeader}>
                <Heading className="mr-2 h-4 w-4" />
                {t("addHeader")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddSpacer}>
                <Space className="mr-2 h-4 w-4" />
                {t("addSpacer")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleAddTabContainer}>
                <SquareSplitVertical className="mr-2 h-4 w-4" />
                {t("addTabContainer")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            onClick={() => router.push(`/dashboard/${slug}`)}
          >
            {tc("done")}
          </Button>
        </div>
      </div>

      {/* Description editor */}
      {showDescEditor && (
        <div className="mb-4 space-y-2">
          <RichTextEditor
            value={descValue}
            onChange={setDescValue}
            placeholder="Dashboard description (supports bold, italic, underline, links)..."
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (dashboard) {
                  updateDashboard.mutate({ id: dashboard.id, data: { description: descValue } });
                  setShowDescEditor(false);
                }
              }}
              disabled={updateDashboard.isPending}
            >
              {updateDashboard.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              {t("saveDescription")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowDescEditor(false)}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Tab bar — always visible in edit mode, with drag-to-reorder */}
      {tabs && tabs.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
          <DndContext sensors={tabSensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
            <SortableContext items={tabs.map(t => String(t.id))} strategy={horizontalListSortingStrategy}>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  {tabs.map((tab) => (
                    <SortableTabItem key={tab.id} id={String(tab.id)}>
                      <TabsTrigger
                        value={String(tab.id)}
                        data-tab-id={String(tab.id)}
                        onDoubleClick={() => setEditingTabId(tab.id)}
                        className={`group/tab relative px-4 ${dragOverTabId === String(tab.id) ? "ring-2 ring-primary bg-primary/10" : ""}`}
                      >
                        {editingTabId === tab.id ? (
                          <input
                            autoFocus
                            defaultValue={tab.title}
                            className="bg-transparent border-none outline-none w-20 text-center text-sm"
                            onBlur={(e) => {
                              updateTabMut.mutate({ tabId: tab.id, data: { title: e.target.value } });
                              setEditingTabId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setEditingTabId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            {tab.title}
                            {tabs.length > 1 && (
                              <button
                                className="ml-1.5 opacity-0 group-hover/tab:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTabId(tab.id);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </>
                        )}
                      </TabsTrigger>
                    </SortableTabItem>
                  ))}
                </TabsList>
              </Tabs>
            </SortableContext>
          </DndContext>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => createTabMut.mutate({ title: "New Tab" })}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Filter grid — editable layout */}
      <FilterGrid
        dashboardId={dashboard.id}
        dashboard={dashboard}
        activeFilters={activeFilters}
        onFiltersChange={setActiveFilters}
        isEditing={true}
      />

      {/* Chart grid — draggable & resizable */}
      {!charts || charts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-20 text-center">
          <Plus className="mb-4 h-16 w-16 text-muted-foreground/30" />
          <h2 className="mb-2 text-lg font-medium text-foreground">{t("noCharts")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("addFirstChart")}</p>
          <Button onClick={handleAddChart}>
            <Plus className="mr-1 h-4 w-4" />
            {t("addChart")}
          </Button>
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
          isDraggable={true}
          isResizable={true}
          compactType={compactType}
          margin={[16, 0]}
          onDragStart={handleDragStart}
          onResizeStart={handleResizeStart}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          draggableHandle=".drag-handle"
          resizeHandles={["s", "w", "e", "n", "se", "sw", "ne", "nw"]}
          resizeHandle={(axis: ResizeHandleAxis, ref: React.Ref<HTMLElement>) => (
            <ResizeHandle key={axis} ref={ref as React.Ref<HTMLDivElement>} axis={axis} />
          )}
        >
          {visibleCharts.map((chart) => (
            <div key={String(chart.id)}>
              <div
                className={`relative h-full group ${selectedIds.has(chart.id) ? "ring-2 ring-blue-500 rounded-lg" : ""}`}
                onClick={(e) => handleChartClick(chart.id, e)}
              >
                {/* Drag handle — visible grip icon */}
                <div className="drag-handle absolute inset-x-0 top-0 z-10 h-10 cursor-move flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 rounded bg-muted/80 px-2 py-0.5">
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Drag</span>
                  </div>
                </div>
                {/* Delete button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 z-20 h-6 w-6 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDeleteChart(chart.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                {chart.chart_type === "tabs" ? (
                  <TabContainer
                    chart={chart}
                    allCharts={charts || []}
                    results={results}
                    executing={executing}
                    isEditing={true}
                    onUpdateConfig={(config) =>
                      updateChart.mutate({ chartId: chart.id, data: { chart_config: config } })
                    }
                    onEdit={handleEditChart}
                    onRefresh={handleRefreshChart}
                    onDuplicate={handleDuplicateChart}
                  />
                ) : (
                  <ChartCard
                    chart={chart}
                    result={results[chart.id]}
                    isExecuting={executing.has(chart.id)}
                    editHref={chart.chart_type !== "text" ? `/dashboard/${slug}/chart/${chart.id}` : undefined}
                    onRefresh={handleRefreshChart}
                    onEdit={handleEditChart}
                    onDuplicate={handleDuplicateChart}
                    tabs={tabs?.map((tb) => ({ id: tb.id, title: tb.title }))}
                    currentTabId={chart.tab_id}
                    onMoveToTab={tabs && tabs.length > 1 ? handleMoveChartToTab : undefined}
                  />
                )}
              </div>
            </div>
          ))}
        </ReactGridLayout>
        </div>
        </div>
      )}
      {/* History side panel */}
      {showHistory && dashboard && (
        <HistoryPanel entityType="dashboard" entityId={dashboard.id} onClose={() => setShowHistory(false)} />
      )}
      {/* Text block editor modal */}
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

      <AlertDialog open={deleteChartId !== null} onOpenChange={(open) => !open && setDeleteChartId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("areYouSure")}</AlertDialogTitle>
            <AlertDialogDescription>{tc("cannotBeUndone")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteChart}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete tab confirmation */}
      <AlertDialog open={deleteTabId !== null} onOpenChange={(open) => !open && setDeleteTabId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTab")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteTabConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTabId === null) return;
                deleteTabMut.mutate(deleteTabId, {
                  onSuccess: () => {
                    // Switch to first remaining tab
                    const remaining = tabs?.filter((t) => t.id !== deleteTabId);
                    if (remaining && remaining.length > 0) {
                      setActiveTab(String(remaining[0].id));
                    }
                  },
                });
                setDeleteTabId(null);
              }}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
