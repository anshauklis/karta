"use client";

import { useState, useRef, useCallback, useEffect, type MutableRefObject } from "react";
import { canPreviewChart, buildPreviewRequest, mergePreviewResult } from "../lib/chart-preview-logic";
import type { usePreviewChart } from "@/hooks/use-charts";
import type { ChartExecuteResult, ChartVariable } from "@/types";

interface PreviewParams {
  dataSource: "sql" | "dataset";
  datasetId: number | undefined;
  connectionId: number | undefined;
  sqlQuery: string;
  activeTab: "data" | "customize" | "code" | "metrics";
  chartType: string;
  chartConfig: Record<string, unknown>;
  chartCode: string;
  chartVariables: ChartVariable[];
  // The preview mutation from useChart hooks (TanStack Query).
  previewChart: ReturnType<typeof usePreviewChart>;
  // Shared guard owned by the editor's initial-load flow, so auto-preview never
  // fires before the first load settles.
  isInitialLoadRef: MutableRefObject<boolean>;
}

/**
 * Owns the chart editor's preview/execute path: the rendered `result`, raw
 * source-column discovery (`queryColumns`), and the debounced auto-preview
 * timers. Extracted from the editor god-hook; behaviour is unchanged.
 */
export function useChartPreview(params: PreviewParams) {
  const {
    dataSource, datasetId, connectionId, sqlQuery, activeTab,
    chartType, chartConfig, chartCode, chartVariables,
    previewChart, isInitialLoadRef,
  } = params;

  const [result, setResult] = useState<ChartExecuteResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [execTime, setExecTime] = useState<number | null>(null);
  const execStartRef = useRef<number>(0);

  // Source-column browser: show the RAW query columns (queryColumns), not the
  // chart's aggregated output. Populated by a config-less discovery query in
  // handlePreview; falls back to result.columns until then.
  const [queryColumns, setQueryColumns] = useState<string[]>([]);
  // Tracks the data source that queryColumns were discovered for, so the raw
  // column list is refreshed only when the source (SQL/dataset/connection) changes.
  const discoveredColsKeyRef = useRef<string>("");

  const handlePreview = async () => {
    if (!canPreviewChart({ dataSource, datasetId, connectionId, sqlQuery })) return;
    setPreviewing(true);
    execStartRef.current = Date.now();
    try {
      const previewConnectionId = dataSource === "dataset" ? undefined : connectionId;
      const previewDatasetId = dataSource === "dataset" ? datasetId : undefined;

      // Discover RAW source columns (pre-aggregation) for the column browser.
      // Re-runs only when the data source changed since the last discovery, so
      // assigning a column (which re-previews on the same SQL) never shrinks it.
      const sourceKey = `${dataSource}:${previewConnectionId}:${previewDatasetId}:${sqlQuery}`;
      if (queryColumns.length === 0 || discoveredColsKeyRef.current !== sourceKey) {
        const plainRes = await previewChart.mutateAsync({
          connection_id: previewConnectionId,
          dataset_id: previewDatasetId,
          sql_query: sqlQuery,
          mode: "visual",
          chart_type: "table",
          chart_config: {},
        });
        if (plainRes.columns) {
          setQueryColumns(plainRes.columns);
          discoveredColsKeyRef.current = sourceKey;
        }
      }

      const res = await previewChart.mutateAsync(buildPreviewRequest({
        dataSource,
        connectionId,
        datasetId,
        sqlQuery,
        isCodeMode: activeTab === "code",
        chartType,
        chartConfig,
        chartCode,
        variables: chartVariables,
      }));
      setResult((prev) => mergePreviewResult(prev, res));
    } catch (e: unknown) {
      setResult((prev) => ({
        figure: null,
        columns: prev?.columns || [],
        rows: [],
        row_count: 0,
        error: e instanceof Error ? e.message : String(e),
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
  const canAutoPreview = canPreviewChart({ dataSource, datasetId, connectionId, sqlQuery });
  const triggerAutoPreview = useCallback((delay: number) => {
    if (isInitialLoadRef.current) return;
    if (!canAutoPreview) return;
    if (autoPreviewTimerRef.current) clearTimeout(autoPreviewTimerRef.current);
    autoPreviewTimerRef.current = setTimeout(() => {
      handlePreviewRef.current();
    }, delay);
  }, [canAutoPreview, isInitialLoadRef]);

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
    } catch (e: unknown) {
      setResult((prev) => ({
        figure: null,
        columns: prev?.columns || [],
        rows: [],
        row_count: 0,
        error: e instanceof Error ? e.message : String(e),
      }));
    } finally {
      setPreviewing(false);
    }
  };

  return {
    result,
    previewing,
    execTime,
    queryColumns,
    handlePreview,
    handlePreviewRef,
    handleRunQuery,
  };
}
