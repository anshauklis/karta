"use client";

import { use, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { useContainerWidth } from "@/hooks/use-container-width";
import dynamic from "next/dynamic";
import "react-grid-layout/css/styles.css";

const ReactGridLayout = dynamic(
  () => import("react-grid-layout/legacy").then((mod) => mod.default || mod) as any,
  { ssr: false }
) as any;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function SharedDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("share");
  const [containerRef, containerWidth] = useContainerWidth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared", token],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/shared/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: t("linkExpiredNotFound") }));
        throw new Error(body.detail || t("failedToLoad"));
      }
      return res.json();
    },
  });

  const charts = data?.charts || [];

  const layout = useMemo(
    () =>
      charts.map((chart: any) => ({
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
      <div className="mx-auto max-w-7xl space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
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

  const dashboard = data.dashboard;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="text-2xl">{dashboard.icon}</span>
        <h1 className="text-xl font-semibold text-foreground">{dashboard.title}</h1>
        <span className="rounded-full bg-blue-50 dark:bg-blue-950 px-2.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">
          {t("sharedView")}
        </span>
      </div>
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
            {charts.map((chart: any) => (
              <div key={String(chart.id)}>
                <ChartCard
                  chart={chart}
                  result={chart.result}
                  showActions={false}
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
