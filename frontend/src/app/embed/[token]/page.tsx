"use client";

import { use, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { useContainerWidth } from "@/hooks/use-container-width";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import "react-grid-layout/css/styles.css";

const ReactGridLayout = dynamic(
  () => import("react-grid-layout/legacy").then((mod) => mod.default || mod) as any,
  { ssr: false }
) as any;

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

  const hasFilters = Object.keys(filters).length > 0;

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared", token, filters],
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/shared/${token}`, window.location.origin);
      if (hasFilters) {
        url.searchParams.set("filters", JSON.stringify(filters));
      }
      const res = await fetch(url.toString());
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
    <div className="w-full p-2">
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
