"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { useUpsertChartDraft } from "@/hooks/use-chart-drafts";
import { buildDraftPayload } from "../lib/chart-draft";
import type { ChartVariable } from "@/types";

interface DraftSyncParams {
  isNew: boolean;
  isStandalone: boolean;
  selectedDashboardId: number | null;
  dashboardId: number | undefined;
  connectionId: number | undefined;
  datasetId: number | undefined;
  title: string;
  description: string;
  mode: "visual" | "code";
  chartType: string;
  chartConfig: Record<string, unknown>;
  chartCode: string;
  sqlQuery: string;
  chartVariables: ChartVariable[];
  // Shared guard owned by the editor's initial-load flow, so auto-save never
  // fires while the first load is still applying state.
  isInitialLoadRef: MutableRefObject<boolean>;
}

/**
 * Server-side draft auto-save for the chart editor. Debounces a save (3s) on any
 * editor-state change for NEW charts only, and flushes an unsaved draft on
 * unmount. Extracted from the editor god-hook; behaviour is unchanged.
 */
export function useChartDraftSync(params: DraftSyncParams) {
  const {
    isNew, isStandalone, selectedDashboardId, dashboardId,
    connectionId, datasetId, title, description, mode, chartType,
    chartConfig, chartCode, sqlQuery, chartVariables, isInitialLoadRef,
  } = params;

  const upsertDraft = useUpsertChartDraft();
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Ref holding a flush function with latest data — called on unmount
  const flushDraftRef = useRef<(() => void) | null>(null);

  // Debounced auto-save to server (3s) — only for new charts
  useEffect(() => {
    if (isInitialLoadRef.current || !isNew) return;
    clearTimeout(draftTimerRef.current);

    const draftData = buildDraftPayload({
      chartId: "new",
      isStandalone,
      selectedDashboardId,
      dashboardId,
      connectionId,
      datasetId,
      title,
      description,
      mode,
      chartType,
      chartConfig,
      chartCode,
      sqlQuery,
      variables: chartVariables,
    });

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
}
