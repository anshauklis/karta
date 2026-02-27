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
import { useChartDraft, useUpsertChartDraft, useDeleteChartDraft } from "@/hooks/use-chart-drafts";
import { useDashboardTabs, useMoveChartToTab } from "@/hooks/use-tabs";
import { generateCodeFromVisual } from "@/lib/generate-code";
import { parseCodeToVisual } from "@/lib/parse-code";
import { useTheme } from "next-themes";
import { useChartCapabilities } from "@/hooks/use-chart-capabilities";
import { NEEDS_XY, SUPPORTS_COLOR, NO_STYLING } from "../lib/constants";
import type { ChartExecuteResult, ConditionalFormatRule } from "@/types";
import type { SaveParams } from "../components/save-chart-modal";

export function useChartEditor(slug: string, id: string) {
  const isNew = id === "new";
  const isStandalone = !slug;
  const chartId = isNew ? undefined : parseInt(id);
  const router = useRouter();
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

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
  const [activeTab, setActiveTab] = useState<"data" | "customize" | "code">("data");
  const [codeSubTab, setCodeSubTab] = useState<"editor" | "output">("editor");
  const [customizeSubTab, setCustomizeSubTab] = useState<"formatting" | "overlays" | "advanced">("formatting");
  const [execTime, setExecTime] = useState<number | null>(null);
  const execStartRef = useRef<number>(0);
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

  // Auto-sync Visual -> Code when visual config changes
  useEffect(() => {
    if (isInitialLoadRef.current) return;
    if (codeEditingRef.current) return;
    if (mode === "code") return; // Don't overwrite user code in code mode
    setChartCode(generateCodeFromVisual(chartConfig, chartType));
  }, [chartConfig, chartType, mode]);

  // Preview state
  const [result, setResult] = useState<ChartExecuteResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chartGalleryOpen, setChartGalleryOpen] = useState(false);
  const [fmtSelectedCols, setFmtSelectedCols] = useState<string[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // --- Server-side draft (hooks must be called before effects that use them) ---
  const draftKey = isNew ? undefined : id;
  const { data: serverDraft, isFetched: draftFetched } = useChartDraft(draftKey);
  const upsertDraft = useUpsertChartDraft();
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

  // Get available columns from last query result -- for pivot, use stored original columns
  const [queryColumns, setQueryColumns] = useState<string[]>([]);
  const availableColumns = chartType === "pivot" ? queryColumns : (result?.columns || []);

  // Columns actually selected in the Data tab (for Customize tab filtering)
  const selectedColumns = useMemo(() => {
    if (chartType === "pivot") {
      return [
        ...((chartConfig.pivot_rows as string[]) || []),
        ...((chartConfig.pivot_columns as string[]) || []),
        ...((chartConfig.pivot_values as string[]) || []),
      ].filter(Boolean);
    }
    if (chartType === "table") {
      return ((chartConfig.y_columns as string[]) || []).filter(Boolean);
    }
    const cols: string[] = [];
    if (chartConfig.x_column) cols.push(chartConfig.x_column as string);
    if (chartConfig.y_columns) cols.push(...((chartConfig.y_columns as string[]) || []));
    if (chartConfig.color_column) cols.push(chartConfig.color_column as string);
    return cols.filter(Boolean);
  }, [chartType, chartConfig.x_column, chartConfig.y_columns, chartConfig.color_column, chartConfig.pivot_rows, chartConfig.pivot_columns, chartConfig.pivot_values]);

  // When result changes, store the original query columns (before pivot transform)
  useEffect(() => {
    if (result?.columns && result.columns.length > 0 && chartType !== "pivot") {
      setQueryColumns(result.columns);
    }
  }, [result, chartType]);

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

  const handlePreview = async () => {
    if (dataSource === "dataset") {
      if (!datasetId) return;
    } else {
      if (!connectionId || !sqlQuery.trim()) return;
    }
    setPreviewing(true);
    execStartRef.current = Date.now();
    try {
      const previewConnectionId = dataSource === "dataset" ? undefined : connectionId;
      const previewDatasetId = dataSource === "dataset" ? datasetId : undefined;

      // For pivot, first run a plain query to get columns for mapping
      if (chartType === "pivot" && queryColumns.length === 0) {
        const plainRes = await previewChart.mutateAsync({
          connection_id: previewConnectionId,
          dataset_id: previewDatasetId,
          sql_query: sqlQuery,
          mode: "visual",
          chart_type: "table",
          chart_config: {},
        });
        if (plainRes.columns) setQueryColumns(plainRes.columns);
      }

      const isCodeMode = activeTab === "code";
      const res = await previewChart.mutateAsync({
        connection_id: previewConnectionId,
        dataset_id: previewDatasetId,
        sql_query: sqlQuery,
        mode: isCodeMode ? "code" : "visual",
        chart_type: chartType,
        chart_config: chartConfig,
        ...(isCodeMode ? { chart_code: chartCode } : {}),
        ...(chartVariables.length > 0 ? { variables: chartVariables } : {}),
      });
      setResult((prev) => {
        // Preserve previous columns when response has error and returns no columns
        if (res.error && (!res.columns || res.columns.length === 0) && prev?.columns?.length) {
          return { ...res, columns: prev.columns };
        }
        return res;
      });
    } catch (e: any) {
      setResult((prev) => ({
        figure: null,
        columns: prev?.columns || [],
        rows: [],
        row_count: 0,
        error: e.message,
      }));
    } finally {
      setPreviewing(false);
      if (execStartRef.current) setExecTime(Date.now() - execStartRef.current);
    }
  };

  // Stable ref to handlePreview (avoids stale closures in timers)
  const handlePreviewRef = useRef<() => void>(() => {});
  handlePreviewRef.current = handlePreview;

  // Auto-preview: debounced
  const autoPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canAutoPreview = (dataSource === "dataset" ? !!datasetId : (!!connectionId && !!sqlQuery.trim()));
  const triggerAutoPreview = useCallback((delay: number) => {
    if (isInitialLoadRef.current) return;
    if (!canAutoPreview) return;
    if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current);
    autoPreviewTimerRef.current = setTimeout(() => {
      handlePreviewRef.current();
    }, delay);
  }, [canAutoPreview]);

  // Auto-preview on visual config changes (800ms)
  useEffect(() => {
    triggerAutoPreview(800);
    return () => { if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current); };
  }, [chartConfig, chartType, triggerAutoPreview]);

  // Auto-preview on data source changes (immediate)
  useEffect(() => {
    triggerAutoPreview(100);
    return () => { if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current); };
  }, [datasetId, connectionId, triggerAutoPreview]);

  // Auto-preview on SQL changes (1500ms)
  useEffect(() => {
    triggerAutoPreview(1500);
    return () => { if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current); };
  }, [sqlQuery, triggerAutoPreview]);

  // Auto-preview on code changes (1500ms) -- only in code tab
  useEffect(() => {
    if (activeTab !== "code") return;
    triggerAutoPreview(1500);
    return () => { if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current); };
  }, [chartCode, activeTab, triggerAutoPreview]);

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

  // For pivot: run a plain query first to get column names
  const handleRunQuery = async () => {
    if (dataSource === "dataset") {
      if (!datasetId) return;
    } else {
      if (!connectionId || !sqlQuery.trim()) return;
    }
    setPreviewing(true);
    try {
      const res = await previewChart.mutateAsync({
        connection_id: dataSource === "dataset" ? undefined : connectionId,
        dataset_id: dataSource === "dataset" ? datasetId : undefined,
        sql_query: sqlQuery,
        mode: "visual",
        chart_type: "table",
        chart_config: {},
      });
      if (res.columns) setQueryColumns(res.columns);
      setResult(res);
    } catch (e: any) {
      setResult((prev) => ({
        figure: null,
        columns: prev?.columns || [],
        rows: [],
        row_count: 0,
        error: e.message,
      }));
    } finally {
      setPreviewing(false);
    }
  };

  // --- Conditional formatting helpers ---
  const formattingRules = (chartConfig.conditional_formatting as ConditionalFormatRule[] | undefined) || [];

  const addFormattingRule = () => {
    const newRule: ConditionalFormatRule = {
      column: "",
      type: "threshold",
      rules: [{ op: ">", value: 0, color: "#dcfce7", text_color: "" }],
    };
    updateConfig("conditional_formatting", [...formattingRules, newRule]);
  };

  const removeFormattingRule = (idx: number) => {
    updateConfig("conditional_formatting", formattingRules.filter((_, i) => i !== idx));
  };

  const updateFormattingRule = (idx: number, patch: Partial<ConditionalFormatRule>) => {
    const updated = formattingRules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    updateConfig("conditional_formatting", updated);
  };

  const addThresholdSubRule = (ruleIdx: number) => {
    const rule = formattingRules[ruleIdx];
    const subRules = rule.rules || [];
    updateFormattingRule(ruleIdx, { rules: [...subRules, { op: ">", value: 0, color: "#dcfce7", text_color: "" }] });
  };

  const removeThresholdSubRule = (ruleIdx: number, subIdx: number) => {
    const rule = formattingRules[ruleIdx];
    updateFormattingRule(ruleIdx, { rules: (rule.rules || []).filter((_, i) => i !== subIdx) });
  };

  const updateThresholdSubRule = (ruleIdx: number, subIdx: number, patch: Partial<{ op: string; value: number; color: string; text_color: string }>) => {
    const rule = formattingRules[ruleIdx];
    const subRules = (rule.rules || []).map((r, i) => (i === subIdx ? { ...r, ...patch } : r));
    updateFormattingRule(ruleIdx, { rules: subRules });
  };

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

  // --- Server-side draft auto-save ---
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Ref holding a flush function with latest data — called on unmount
  const flushDraftRef = useRef<(() => void) | null>(null);

  // Debounced auto-save to server (3s) — only for new charts
  useEffect(() => {
    if (isInitialLoadRef.current || !isNew) return;
    clearTimeout(draftTimerRef.current);

    const draftData = {
      chartId: "new",
      dashboard_id: isStandalone ? selectedDashboardId : dashboard?.id,
      connection_id: connectionId ?? null,
      dataset_id: datasetId ?? null,
      title,
      description,
      mode,
      chart_type: chartType,
      chart_config: chartConfig,
      chart_code: chartCode,
      sql_query: sqlQuery,
      variables: chartVariables.length > 0 ? chartVariables : null,
    };

    // Keep flush function up-to-date with latest data
    flushDraftRef.current = () => upsertDraft.mutate(draftData);

    draftTimerRef.current = setTimeout(() => {
      upsertDraft.mutate(draftData);
      flushDraftRef.current = null; // saved — nothing to flush
    }, 3000);
    return () => clearTimeout(draftTimerRef.current);
  }, [title, description, sqlQuery, mode, chartType, chartConfig, chartCode, connectionId, datasetId, chartVariables]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush unsaved draft immediately on unmount (only for new charts)
  useEffect(() => {
    if (!isNew) return;
    return () => { flushDraftRef.current?.(); };
  }, [isNew]);

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

  const isPivot = chartType === "pivot";
  const isTable = chartType === "table";
  const isKPI = chartType === "kpi";
  const isHistogram = chartType === "histogram";

  // Use API capabilities with hardcoded constants as fallback
  const { data: capsMap } = useChartCapabilities();
  const cap = capsMap?.[chartType];
  const showXAxis = cap ? (cap.needs_x || isHistogram) : (NEEDS_XY.includes(chartType) || isHistogram);
  const showYAxis = cap ? (cap.needs_y || isKPI) : (NEEDS_XY.includes(chartType) || isKPI);
  const showColor = cap ? cap.supports_color : SUPPORTS_COLOR.includes(chartType);
  const showStyling = cap ? cap.supports_styling : !NO_STYLING.includes(chartType);
  const showConditionalFormatting = cap ? cap.supports_cond_format : (isPivot || isTable);

  const canPreview = dataSource === "dataset" ? !!datasetId : (!!connectionId && !!sqlQuery.trim());

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
