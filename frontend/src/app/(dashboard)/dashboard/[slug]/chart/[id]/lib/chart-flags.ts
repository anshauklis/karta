import type { ChartCapabilities } from "@/hooks/use-chart-capabilities";
import { NEEDS_XY, SUPPORTS_COLOR, NO_STYLING } from "./constants";
import { canPreviewChart } from "./chart-preview-logic";

export interface ChartFlags {
  isPivot: boolean;
  isTable: boolean;
  isKPI: boolean;
  isHistogram: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  showColor: boolean;
  showStyling: boolean;
  showConditionalFormatting: boolean;
  canPreview: boolean;
}

/**
 * Pure derivation of the chart-editor's UI flags from chart type, server-provided
 * capabilities (with hardcoded-constant fallback), and the current data source.
 * Extracted from use-chart-editor.ts — no state, no side effects.
 */
export function deriveChartFlags(params: {
  chartType: string;
  cap: ChartCapabilities | undefined;
  dataSource: string;
  datasetId: number | undefined;
  connectionId: number | undefined;
  sqlQuery: string;
}): ChartFlags {
  const { chartType, cap, dataSource, datasetId, connectionId, sqlQuery } = params;

  const isPivot = chartType === "pivot";
  const isTable = chartType === "table";
  const isKPI = chartType === "kpi";
  const isHistogram = chartType === "histogram";

  const showXAxis = cap ? (cap.needs_x || isHistogram) : (NEEDS_XY.includes(chartType) || isHistogram);
  const showYAxis = cap ? (cap.needs_y || isKPI) : (NEEDS_XY.includes(chartType) || isKPI);
  const showColor = cap ? cap.supports_color : SUPPORTS_COLOR.includes(chartType);
  const showStyling = cap ? cap.supports_styling : !NO_STYLING.includes(chartType);
  const showConditionalFormatting = cap ? cap.supports_cond_format : (isPivot || isTable);

  const canPreview = canPreviewChart({ dataSource, datasetId, connectionId, sqlQuery });

  return {
    isPivot, isTable, isKPI, isHistogram,
    showXAxis, showYAxis, showColor, showStyling, showConditionalFormatting,
    canPreview,
  };
}
