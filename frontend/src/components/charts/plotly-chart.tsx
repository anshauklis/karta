"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export interface DataPointClickData {
  x?: unknown;
  y?: unknown;
  label?: string;
  name?: string;
}

interface PlotlyChartProps {
  figure: Record<string, unknown>;
  className?: string;
  onDataPointClick?: (data: DataPointClickData) => void;
}

export const PlotlyChart = memo(function PlotlyChart({ figure, className, onDataPointClick }: PlotlyChartProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (figure.data || []) as any[];

  const layout = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const figLayout = (figure.layout || {}) as any;
    return {
    ...figLayout,
    autosize: true,
    margin: { l: 40, r: 20, t: 30, b: 40, ...figLayout.margin },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: {
      ...figLayout.font,
      color: isDark ? "#e2e8f0" : "#334155",
    },
    xaxis: {
      ...figLayout.xaxis,
      gridcolor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
      linecolor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
    },
    yaxis: {
      ...figLayout.yaxis,
      gridcolor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
      linecolor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
    },
    ...(figLayout.yaxis2 ? {
      yaxis2: {
        ...figLayout.yaxis2,
        gridcolor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        linecolor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
      },
    } : {}),
    legend: {
      ...figLayout.legend,
      font: { ...figLayout.legend?.font, color: isDark ? "#e2e8f0" : "#334155" },
    },
    ...(figLayout.coloraxis ? {
      coloraxis: {
        ...figLayout.coloraxis,
        colorbar: {
          ...figLayout.coloraxis?.colorbar,
          tickfont: { color: isDark ? "#e2e8f0" : "#334155" },
        },
      },
    } : {}),
  };
  }, [figure.layout, isDark]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = useCallback((event: any) => {
    if (!onDataPointClick || !event?.points?.[0]) return;
    const point = event.points[0];
    onDataPointClick({
      x: point.x,
      y: point.y,
      label: point.label ?? point.text,
      name: point.data?.name,
    });
  }, [onDataPointClick]);

  return (
    <div className={className}>
      <Plot
        data={data}
        layout={layout}
        config={{ responsive: true, displayModeBar: false }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
        onClick={handleClick}
      />
    </div>
  );
});
