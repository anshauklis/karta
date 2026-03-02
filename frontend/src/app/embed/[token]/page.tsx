"use client";

import { use, useMemo, useEffect, useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import type { Chart, ChartExecuteResult } from "@/types";
import { useContainerWidth } from "@/hooks/use-container-width";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import "react-grid-layout/css/styles.css";

const ReactGridLayout = dynamic(
  () => import("react-grid-layout/legacy").then((mod) => mod.default || mod) as unknown as Promise<React.ComponentType<Record<string, unknown>>>,
  { ssr: false }
) as React.ComponentType<Record<string, unknown>>;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = use(params);
  const search = use(searchParams);
  const t = useTranslations("share");
  const { setTheme } = useTheme();
  const [containerRef, containerWidth] = useContainerWidth();

  // Apply theme from URL param
  const themeParam = (search.theme as string) || "light";
  useEffect(() => {
    setTheme(themeParam);
  }, [themeParam, setTheme]);

  const embedContainerRef = useRef<HTMLDivElement>(null);

  // Extract filter params: ?filter_<column>=<value>
  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(search)) {
      if (key.startsWith("filter_") && typeof value === "string") {
        result[key.replace("filter_", "")] = value;
      }
    }
    return result;
  }, [search]);

  // postMessage: runtime filters from parent
  const [runtimeFilters, setRuntimeFilters] = useState<Record<string, string> | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("karta:")) return;

    switch (msg.type) {
      case "karta:setTheme":
        if (msg.theme === "light" || msg.theme === "dark") {
          setTheme(msg.theme);
          window.parent.postMessage({ type: "karta:themeChange", theme: msg.theme }, "*");
        }
        break;
      case "karta:setFilters":
        if (msg.filters && typeof msg.filters === "object") {
          setRuntimeFilters(msg.filters);
          window.parent.postMessage({ type: "karta:filterChange", filters: msg.filters }, "*");
        }
        break;
      case "karta:refresh":
        window.location.reload();
        break;
    }
  }, [setTheme]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const activeFilters = runtimeFilters || filters;
  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared", token, activeFilters],
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/shared/${token}`, window.location.origin);
      if (hasActiveFilters) {
        url.searchParams.set("filters", JSON.stringify(activeFilters));
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: t("linkExpiredNotFound") }));
        throw new Error(body.detail || t("failedToLoad"));
      }
      return res.json();
    },
  });

  // postMessage: send ready event
  useEffect(() => {
    if (data?.dashboard) {
      window.parent.postMessage({
        type: "karta:ready",
        embedType: "dashboard",
        id: data.dashboard.id,
        title: data.dashboard.title,
        chartCount: data.charts?.length || 0,
      }, "*");
    }
  }, [data]);

  // postMessage: send error event
  useEffect(() => {
    if (error) {
      window.parent.postMessage({
        type: "karta:error",
        code: "LOAD_ERROR",
        message: (error as Error).message,
      }, "*");
    }
  }, [error]);

  // ResizeObserver: report content height to parent for auto-resize
  useEffect(() => {
    if (!embedContainerRef.current) return;
    let lastHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const height = Math.ceil(entries[0].contentRect.height);
      if (height !== lastHeight) {
        lastHeight = height;
        window.parent.postMessage({ type: "karta:resize", height }, "*");
      }
    });
    observer.observe(embedContainerRef.current);
    return () => observer.disconnect();
  }, []);

  type SharedChart = Chart & { result?: ChartExecuteResult };

  const handleChartClick = useCallback((chartId: number, pointData: { x?: unknown; y?: unknown; label?: string; name?: string }) => {
    const chartInfo = (data?.charts as SharedChart[] | undefined)?.find((c) => c.id === chartId);
    window.parent.postMessage({
      type: "karta:chartClick",
      chartId,
      chartTitle: chartInfo?.title,
      point: pointData,
    }, "*");
  }, [data?.charts]);

  const charts: SharedChart[] = useMemo(() => data?.charts || [], [data?.charts]);

  const layout = useMemo(
    () =>
      charts.map((chart) => ({
        i: String(chart.id),
        x: chart.grid_x ?? 0,
        y: chart.grid_y ?? 0,
        w: chart.grid_w ?? 6,
        h: chart.grid_h ?? 224,
        static: true,
      })),
    [charts]
  );

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="mb-2 text-lg font-medium text-foreground">
          {(error as Error)?.message || t("dashboardNotAvailable")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("linkExpiredOrRevoked")}</p>
      </div>
    );
  }

  return (
    <div className="w-full p-2" ref={embedContainerRef}>
        {charts.length > 0 ? (
          <div ref={containerRef}>
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
              {charts.map((chart) => (
                <div key={String(chart.id)}>
                  <ChartCard
                    chart={chart}
                    result={chart.result}
                    showActions={false}
                    onDataPointClick={handleChartClick}
                  />
                </div>
              ))}
            </ReactGridLayout>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">{t("noCharts")}</p>
        )}
      </div>
  );
}
