"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { TabContainer } from "@/components/charts/tab-container";
import type { Chart, ChartExecuteResult } from "@/types";

const ROW_HEIGHT_PX = 1;
const MIN_CHART_HEIGHT = 200;

interface MobileDashboardProps {
  charts: Chart[];
  allCharts: Chart[];
  results: Record<number, ChartExecuteResult>;
  executing: Set<number>;
  editHrefPrefix?: string;
  showActions?: boolean;
  onEdit?: (chartId: number) => void;
  onRefresh?: (chartId: number) => void;
  onDataPointClick?: (chartId: number, data: { x?: unknown; y?: unknown; label?: string; name?: string }) => void;
  onToggleComments?: (chartId: number) => void;
  // Tab container support
  onUpdateTabConfig?: (chartId: number, config: Record<string, unknown>) => void;
}

export function MobileDashboard({
  charts,
  allCharts,
  results,
  executing,
  editHrefPrefix,
  showActions = true,
  onEdit,
  onRefresh,
  onDataPointClick,
  onToggleComments,
  onUpdateTabConfig,
}: MobileDashboardProps) {
  // Sort charts by grid position: top-to-bottom, then left-to-right
  const sorted = useMemo(
    () =>
      [...charts].sort((a, b) =>
        a.grid_y !== b.grid_y ? a.grid_y - b.grid_y : a.grid_x - b.grid_x
      ),
    [charts]
  );

  return (
    <div className="flex flex-col gap-3 px-1 py-2">
      {sorted.map((chart) => {
        // Convert grid_h (in row-height units) to pixels, with a minimum
        const heightPx = Math.max(chart.grid_h * ROW_HEIGHT_PX, MIN_CHART_HEIGHT);

        if (chart.chart_type === "tabs") {
          return (
            <div key={chart.id} style={{ height: heightPx }}>
              <TabContainer
                chart={chart}
                allCharts={allCharts}
                results={results}
                executing={executing}
                isEditing={false}
                onUpdateConfig={(config) => onUpdateTabConfig?.(chart.id, config)}
                onEdit={onEdit}
                onRefresh={onRefresh}
              />
            </div>
          );
        }

        return (
          <div
            key={chart.id}
            className="w-full"
            style={{ height: heightPx }}
          >
            <ChartCard
              chart={chart}
              result={results[chart.id]}
              isExecuting={executing.has(chart.id)}
              editHref={
                editHrefPrefix && chart.chart_type !== "text"
                  ? `${editHrefPrefix}/${chart.id}`
                  : undefined
              }
              showActions={showActions}
              onEdit={onEdit}
              onRefresh={onRefresh}
              onDataPointClick={onDataPointClick}
              onToggleComments={onToggleComments}
            />
          </div>
        );
      })}
    </div>
  );
}
