"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useChart, useUpdateChart, usePreviewChart, useCreateChart, useCreateStandaloneChart } from "@/hooks/use-charts";
import { useConnections, useConnectionSchema } from "@/hooks/use-connections";
import { useDashboardBySlug, useDashboards } from "@/hooks/use-dashboards";
import { useTemplates } from "@/hooks/use-templates";
import { useUndo } from "@/hooks/use-undo";
import { useDatasets } from "@/hooks/use-datasets";
import { useChartDraft, useDeleteChartDraft } from "@/hooks/use-chart-drafts";
import { useDashboardTabs, useMoveChartToTab } from "@/hooks/use-tabs";
import { generateCodeFromVisual } from "@/lib/generate-code";
import { parseCodeToVisual } from "@/lib/parse-code";
import { useTheme } from "next-themes";
import { useChartCapabilities } from "@/hooks/use-chart-capabilities";
import { deriveChartFlags } from "../lib/chart-flags";
import { computeSelectedColumns } from "../lib/chart-columns";
import { useConditionalFormatting } from "./use-conditional-formatting";
import { useChartPreview } from "./use-chart-preview";
import { useChartDraftSync } from "./use-chart-draft-sync";
import type { SaveParams } from "../components/save-chart-modal";

export function useChartEditor(slug: string, id: string) {
  const isNew = id === "new";
  const isStandalone = !slug;
  const chartId = isNew ? undefined : parseInt(id);
  const router = useRouter();
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken;

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const { data: dashboard } = useDashboardBySlug(slug || undefined);
  const { data: allDashboards } = useDashboards();
  const { data: existingChart, isFetched: chartFetched } = useChart(chartId);
  const { data: connections } = useConnections();
  const updateChart = useUpdateChart();
  const previewChart = usePreviewChart();
  const createChart = useCreateChart(dashboard?.id ?? 0);
  const createStandaloneChart = useCreateStandaloneChart();
  const [selectedDashboardId, setSelectedDashboardId] = useState<number | null>(null);
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null);

  const { data: dashboardTabs } = useDashboardTabs(
    isStandalone ? (selectedDashboardId ?? 0) : (dashboard?.id ?? 0)
  );
  const moveChartToTabMut = useMoveChartToTab();

  // Form state
  const [title, setTitle] = useState("New Chart");
  const [description, setDescription] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [connectionId, setConnectionId] = useState<number | undefined>();

  // Tab state
  const [activeTab, setActiveTab] = useState<"data" | "customize" | "code" | "metrics">("data");
  const [codeSubTab, setCodeSubTab] = useState<"editor" | "output">("editor");
  const [customizeSubTab, setCustomizeSubTab] = useState<"formatting" | "overlays" | "advanced">("formatting");
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [transformsOpen, setTransformsOpen] = useState(false);
  const [refLinesOpen, setRefLinesOpen] = useState(false);
  const [codeUpdatedVisual, setCodeUpdatedVisual] = useState(false);
  const [editorZoom, setEditorZoom] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("karta-editor-zoom");
      return saved ? parseFloat(saved) : 1.15;
    }
    return 1.15;
  });
  const [dataSource, setDataSource] = useState<"sql" | "dataset">("sql");
  const [datasetId, setDatasetId] = useState<number | undefined>();
  const { data: datasets } = useDatasets();

  // Schema for SQL autocomplete
  const { data: schemaData } = useConnectionSchema(connectionId ?? null);
  const schemaRef = useRef(schemaData);
  schemaRef.current = schemaData;
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const [sqlQuery, setSqlQuery] = useState("");
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const [chartType, setChartType] = useState("bar");
  const configUndo = useUndo<Record<string, unknown>>({
    x_column: "",
    y_columns: [] as string[],
    color_column: "",
    show_legend: true,
    x_axis_label: "",
    y_axis_label: "",
    stack_mode: "none",
    show_values: false,
    color_palette: "default",
    number_format: "",
    sort_order: "none",
    bins: 20,
    kpi_target: null,
    kpi_prefix: "",
    kpi_suffix: "",
    pivot_rows: [] as string[],
    pivot_columns: [] as string[],
    pivot_values: [] as string[],
    pivot_aggfuncs: {} as Record<string, string>,
    row_subtotals: "none",
    col_subtotals: "none",
    show_grand_total: false,
    pivot_subtotal_funcs: {} as Record<string, string>,
    pivot_subtotal_formulas: {} as Record<string, string>,
  });
  const chartConfig = configUndo.value;
  const setChartConfig = configUndo.set;

  // Auto-open collapsible sections when items are added
  const overlayCount = ((chartConfig.overlays as Array<unknown>) || []).length;
  const transformCount = ((chartConfig.transforms as Array<unknown>) || []).length;
  const refLineCount = ((chartConfig.reference_lines as Array<unknown>) || []).length;
  useEffect(() => { if (overlayCount > 0) setStatsOpen(true); }, [overlayCount]);
  useEffect(() => { if (transformCount > 0) setTransformsOpen(true); }, [transformCount]);
  useEffect(() => { if (refLineCount > 0) setRefLinesOpen(true); }, [refLineCount]);

  const { templates, addTemplate, removeTemplate } = useTemplates();
  const [chartCode, setChartCode] = useState(
    `# Available: df (DataFrame), pd, px, go, np\n# Must produce a 'fig' variable\n\nfig = px.bar(df, x=df.columns[0], y=df.columns[1])\n`
  );

  // SQL variables ({{ var_name }} syntax)
  const [chartVariables, setChartVariables] = useState<import("@/types").ChartVariable[]>([]);

  // Guard against auto-preview firing on initial load
  const isInitialLoadRef = useRef(true);

  // Guard against Visual->Code useEffect overwriting code while user types in Code tab
  const codeEditingRef = useRef(false);
  const codeEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preview/execute path + auto-preview timers (extracted sub-hook)
  const {
    result,
    previewing,
    execTime,
    queryColumns,
    handlePreview,
    handlePreviewRef,
    handleRunQuery,
  } = useChartPreview({
    dataSource, datasetId, connectionId, sqlQuery, activeTab,
    chartType, chartConfig, chartCode, chartVariables,
    previewChart, isInitialLoadRef,
  });

  // Auto-sync Visual -> Code when visual config changes
  const prevChartTypeForCodeRef = useRef(chartType);
  useEffect(() => {
    if (isInitialLoadRef.current) return;
    if (codeEditingRef.current) return;
    const typeChanged = prevChartTypeForCodeRef.current !== chartType;
    prevChartTypeForCodeRef.current = chartType;
    // In code mode keep the user's code — EXCEPT when they explicitly switch the
    // chart type, then regenerate so the code-mode visualization tracks the type.
    if (mode === "code" && !typeChanged) return;
    setChartCode(generateCodeFromVisual(chartConfig, chartType));
  }, [chartConfig, chartType, mode]);

  // Preview UI state
  const [showHistory, setShowHistory] = useState(false);
  const [chartGalleryOpen, setChartGalleryOpen] = useState(false);
  const [fmtSelectedCols, setFmtSelectedCols] = useState<string[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // --- Server-side draft (hooks must be called before effects that use them) ---
  const draftKey = isNew ? undefined : id;
  const { data: serverDraft, isFetched: draftFetched } = useChartDraft(draftKey);
  const deleteDraftMutation = useDeleteChartDraft();

  // Helper: apply draft state to all editor fields
  const applyDraft = (draft: NonNullable<typeof serverDraft>) => {
    if (draft.title) setTitle(draft.title);
    setDescription(draft.description || "");
    if (draft.description) setShowDesc(true);
    setConnectionId(draft.connection_id ?? undefined);
    if (draft.dashboard_id) setSelectedDashboardId(draft.dashboard_id);
    if (draft.sql_query) setSqlQuery(draft.sql_query);
    if (draft.mode) setMode(draft.mode as "visual" | "code");
    if (draft.chart_type) setChartType(draft.chart_type);
    if (draft.dataset_id) {
      setDataSource("dataset");
      setDatasetId(draft.dataset_id);
    }
    if (draft.chart_config && Object.keys(draft.chart_config).length > 0) {
      configUndo.reset(draft.chart_config);
    }
    if (draft.chart_code) setChartCode(draft.chart_code);
    if (draft.variables) setChartVariables(draft.variables);
  };

  // --- Unified initial load: draft-first ---
  // Waits for relevant queries to settle, then loads from the best source:
  //   new chart: serverDraft > defaults
  //   existing chart: serverDraft (if newer) > existingChart
  useEffect(() => {
    if (!isInitialLoadRef.current) return;

    if (isNew) {
      // New chart: only wait for draft query
      if (!draftFetched) return;
      if (serverDraft) {
        applyDraft(serverDraft);
      }
      // Delay clearing the guard so React can batch all state updates, then
      // trigger initial preview (auto-preview effects can't re-fire from a ref change)
      setTimeout(() => {
        isInitialLoadRef.current = false;
        handlePreviewRef.current();
      }, 100);
      return;
    }

    // Existing chart: wait for both chart data AND draft to settle
    if (!chartFetched || !draftFetched) return;

    // Always load from saved chart; delete stale draft if present
    if (serverDraft) {
      deleteDraftMutation.mutate(id);
    }

    if (existingChart) {
      // Load from saved chart (full processing with backward compat)
      setTitle(existingChart.title);
      setDescription(existingChart.description || "");
      if (existingChart.description) setShowDesc(true);
      setConnectionId(existingChart.connection_id ?? undefined);
      if (existingChart.dashboard_id) setSelectedDashboardId(existingChart.dashboard_id);
      setSelectedTabId(existingChart.tab_id ?? null);
      setSqlQuery(existingChart.sql_query);
      setMode(existingChart.mode);
      setChartType(existingChart.chart_type || "bar");
      if (existingChart.dataset_id) {
        setDataSource("dataset");
        setDatasetId(existingChart.dataset_id);
      }
      setChartVariables(existingChart.variables || []);
      if (existingChart.chart_config && Object.keys(existingChart.chart_config).length > 0) {
        const cfg = { ...existingChart.chart_config };
        // Backward compat: old stacked boolean -> stack_mode
        if (cfg.stacked && !cfg.stack_mode) {
          cfg.stack_mode = "stacked";
          delete cfg.stacked;
        }
        configUndo.reset(cfg);
      }
      if (existingChart.mode === "code") setActiveTab("code");
      if (existingChart.mode === "code" && existingChart.chart_code) {
        setChartCode(existingChart.chart_code);
        const parsed = parseCodeToVisual(existingChart.chart_code);
        if (parsed) {
          const { _chartType, ...configPatch } = parsed;
          if (_chartType) setChartType(_chartType as string);
          if (Object.keys(configPatch).length > 0) {
            configUndo.reset({ ...(existingChart.chart_config || {}), ...configPatch });
          }
        }
      } else if (existingChart.chart_code) {
        setChartCode(existingChart.chart_code);
      }
    }

    // Delay clearing the guard so React can batch all state updates, then
    // trigger initial preview (auto-preview effects can't re-fire from a ref change)
    setTimeout(() => {
      isInitialLoadRef.current = false;
      handlePreviewRef.current();
    }, 100);
  }, [existingChart, serverDraft, draftFetched, chartFetched, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  // Source-column browser: prefer the RAW query columns (queryColumns from the
  // preview hook) over the chart's aggregated output; fall back to result.columns.
  const availableColumns = queryColumns.length > 0 ? queryColumns : (result?.columns || []);

  // Columns actually selected in the Data tab (for Customize tab filtering)
  const selectedColumns = useMemo(
    () => computeSelectedColumns(chartType, chartConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartType, chartConfig.x_column, chartConfig.y_columns, chartConfig.color_column, chartConfig.pivot_rows, chartConfig.pivot_columns, chartConfig.pivot_values],
  );

  // Auto-fill y_columns with all columns when switching to table (if empty)
  useEffect(() => {
    if (mode === "code") return; // Code mode manages its own columns
    if (chartType === "table" && availableColumns.length > 0) {
      const yCols = (chartConfig.y_columns as string[]) || [];
      if (yCols.length === 0) {
        setChartConfig((prev: Record<string, unknown>) => ({ ...prev, y_columns: [...availableColumns] }));
      }
    }
  }, [chartType, availableColumns.length, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Classify columns by detected type from query result
  const columnTypes = useMemo(() => {
    const types: Record<string, "number" | "text" | "date"> = {};
    if (result?.rows && result.rows.length > 0 && result?.columns) {
      for (const col of result.columns) {
        const colIdx = result.columns.indexOf(col);
        const sample = result.rows.find((r) => r[colIdx] != null)?.[colIdx];
        if (typeof sample === "number") types[col] = "number";
        else if (typeof sample === "string" && !isNaN(Date.parse(sample)) && sample.length >= 8)
          types[col] = "date";
        else types[col] = "text";
      }
    }
    return types;
  }, [result?.rows, result?.columns]);

  const handleModalSave = async (params: SaveParams) => {
    const data = {
      title: params.title,
      description,
      connection_id: dataSource === "dataset" ? undefined : connectionId,
      dataset_id: dataSource === "dataset" ? datasetId : undefined,
      sql_query: sqlQuery,
      mode: activeTab === "code" ? "code" as const : "visual" as const,
      chart_type: chartType,
      chart_config: chartConfig,
      chart_code: chartCode,
      tab_id: selectedTabId,
      variables: chartVariables,
    };

    if (params.mode === "overwrite" && chartId) {
      // Overwrite existing chart
      await updateChart.mutateAsync({ chartId, data });
      // Move to different tab if changed
      if (existingChart && existingChart.tab_id !== selectedTabId && selectedTabId !== null) {
        await moveChartToTabMut.mutateAsync({ chartId, tabId: selectedTabId });
      }
      deleteDraftMutation.mutate(id);
      setTitle(params.title);
      setSaveModalOpen(false);

      if (params.andGoToDashboard && params.dashboardId) {
        const dash = allDashboards?.find((d) => d.id === params.dashboardId);
        if (dash) router.push(`/dashboard/${dash.url_slug}`);
      }
    } else {
      // Save as new chart (always use standalone endpoint — it accepts optional dashboard_id)
      const chart = await createStandaloneChart.mutateAsync({
        ...data,
        title: params.title,
        dashboard_id: params.dashboardId,
      });
      deleteDraftMutation.mutate(isNew ? "new" : id);
      setTitle(params.title);
      setSaveModalOpen(false);

      if (params.andGoToDashboard && params.dashboardId) {
        const dash = allDashboards?.find((d) => d.id === params.dashboardId);
        if (dash) {
          router.push(`/dashboard/${dash.url_slug}`);
        }
      } else {
        // Navigate to the new chart's editor
        const dash = allDashboards?.find((d) => d.id === params.dashboardId);
        if (dash) {
          router.replace(`/dashboard/${dash.url_slug}/chart/${chart.id}`);
        } else {
          router.replace(`/charts/${chart.id}`);
        }
      }
    }
  };

  const handleYColumnsChange = (col: string) => {
    const current = (chartConfig.y_columns as string[]) || [];
    const updated = current.includes(col)
      ? current.filter((c) => c !== col)
      : [...current, col];
    setChartConfig({ ...chartConfig, y_columns: updated });
  };

  const handleMultiSelectToggle = (key: string, col: string) => {
    setChartConfig((prev: Record<string, unknown>) => {
      const current = (prev[key] as string[]) || [];
      const updated = current.includes(col)
        ? current.filter((c: string) => c !== col)
        : [...current, col];
      return { ...prev, [key]: updated };
    });
  };

  const updateConfig = (key: string, value: unknown) => {
    setChartConfig((prev: Record<string, unknown>) => ({ ...prev, [key]: value }));
  };

  // --- Conditional formatting helpers (extracted) ---
  const {
    formattingRules,
    addFormattingRule,
    removeFormattingRule,
    updateFormattingRule,
    addThresholdSubRule,
    removeThresholdSubRule,
    updateThresholdSubRule,
  } = useConditionalFormatting(chartConfig, updateConfig);

  const handleSqlEditorMount = useCallback((_editor: unknown, monaco: unknown) => {
    const m = monaco as {
      languages: {
        CompletionItemKind: Record<string, number>;
        registerCompletionItemProvider: (lang: string, provider: unknown) => { dispose: () => void };
      };
    };
    completionDisposableRef.current?.dispose();
    completionDisposableRef.current = m.languages.registerCompletionItemProvider("sql", {
      triggerCharacters: [".", " "],
      provideCompletionItems: (model: { getWordUntilPosition: (pos: unknown) => { startColumn: number; endColumn: number } }, position: { lineNumber: number }) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions: unknown[] = [];
        const keywords = [
          "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "BETWEEN",
          "LIKE", "IS", "NULL", "ORDER", "BY", "GROUP", "HAVING", "LIMIT",
          "OFFSET", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON", "AS",
          "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "CASE", "WHEN",
          "THEN", "ELSE", "END", "UNION", "ALL", "WITH", "EXISTS",
          "COALESCE", "CAST", "EXTRACT", "DATE_TRUNC",
        ];
        for (const kw of keywords) {
          suggestions.push({
            label: kw,
            kind: m.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
          });
        }
        if (schemaRef.current) {
          for (const table of schemaRef.current) {
            suggestions.push({
              label: table.table_name,
              kind: m.languages.CompletionItemKind.Class,
              insertText: table.table_name,
              detail: `${table.columns.length} columns`,
              range,
            });
            for (const col of table.columns) {
              suggestions.push({
                label: col.name,
                kind: m.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: `${table.table_name}.${col.name} (${col.type})`,
                range,
              });
            }
          }
        }
        return { suggestions };
      },
    });
  }, []);

  // --- Server-side draft auto-save (extracted sub-hook) ---
  useChartDraftSync({
    isNew,
    isStandalone,
    selectedDashboardId,
    dashboardId: dashboard?.id,
    connectionId,
    datasetId,
    title,
    description,
    mode,
    chartType,
    chartConfig,
    chartCode,
    sqlQuery,
    chartVariables,
    isInitialLoadRef,
  });

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inEditor = tag === "TEXTAREA" || (e.target as HTMLElement)?.closest?.(".monaco-editor");

      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        setSaveModalOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !inEditor) {
        e.preventDefault();
        handlePreview();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey && !inEditor) {
        e.preventDefault();
        configUndo.undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey && !inEditor) {
        e.preventDefault();
        configUndo.redo();
      }
      if (e.key === "Escape" && !inEditor && tag !== "INPUT") {
        router.push(isStandalone ? "/charts" : `/dashboard/${slug}`);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  });

  // Derived UI flags (extracted to a pure helper). Capabilities come from the API
  // with hardcoded constants as fallback.
  const { data: capsMap } = useChartCapabilities();
  const cap = capsMap?.[chartType];
  const {
    isPivot, isTable, isKPI, isHistogram,
    showXAxis, showYAxis, showColor, showStyling, showConditionalFormatting,
    canPreview,
  } = deriveChartFlags({ chartType, cap, dataSource, datasetId, connectionId, sqlQuery });

  return {
    // Route/identity
    isNew,
    isStandalone,
    chartId,
    slug,
    router,
    dashboard,
    allDashboards,
    existingChart,
    connections,
    datasets,
    isDark,
    token,

    // Standalone dashboard selector
    selectedDashboardId, setSelectedDashboardId,

    // Tab selector
    dashboardTabs,
    selectedTabId, setSelectedTabId,

    // Mutations
    updateChart,
    createChart,
    createStandaloneChart,
    previewChart,

    // Form state
    title, setTitle,
    description, setDescription,
    showDesc, setShowDesc,
    connectionId, setConnectionId,
    dataSource, setDataSource,
    datasetId, setDatasetId,
    sqlQuery, setSqlQuery,
    mode, setMode,
    chartType, setChartType,
    chartCode, setChartCode,
    chartConfig, setChartConfig,
    chartVariables, setChartVariables,

    // Undo
    configUndo,

    // Tab state
    activeTab, setActiveTab,
    codeSubTab, setCodeSubTab,
    customizeSubTab, setCustomizeSubTab,
    execTime,
    tooltipOpen, setTooltipOpen,
    statsOpen, setStatsOpen,
    transformsOpen, setTransformsOpen,
    refLinesOpen, setRefLinesOpen,
    codeUpdatedVisual, setCodeUpdatedVisual,
    editorZoom, setEditorZoom,

    // Preview/result
    result,
    previewing,
    showHistory, setShowHistory,
    chartGalleryOpen, setChartGalleryOpen,
    fmtSelectedCols, setFmtSelectedCols,
    saveModalOpen, setSaveModalOpen,

    // Columns
    queryColumns,
    availableColumns,
    selectedColumns,
    columnTypes,

    // Handlers
    handlePreview,
    handleModalSave,
    handleYColumnsChange,
    handleMultiSelectToggle,
    updateConfig,
    handleRunQuery,
    handleSqlEditorMount,

    // Templates
    templates, addTemplate, removeTemplate,

    // Conditional formatting
    formattingRules,
    addFormattingRule,
    removeFormattingRule,
    updateFormattingRule,
    addThresholdSubRule,
    removeThresholdSubRule,
    updateThresholdSubRule,

    // Derived booleans
    isPivot,
    isTable,
    isKPI,
    isHistogram,
    showXAxis,
    showYAxis,
    showColor,
    showStyling,
    showConditionalFormatting,
    canPreview,

    // Refs (needed by JSX in code tab)
    codeEditingRef,
    codeEditTimerRef,
  };
}

export type ChartEditorState = ReturnType<typeof useChartEditor>;
