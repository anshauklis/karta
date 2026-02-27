"use client";

import { use, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { useTheme } from "next-themes";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function EmbedChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = use(params);
  const search = use(searchParams);
  const { setTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Theme from URL param
  const themeParam = (typeof search.theme === "string" ? search.theme : "light") as "light" | "dark";
  useEffect(() => { setTheme(themeParam); }, [themeParam, setTheme]);

  // Parse ?filter_<col>=<val> params
  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    for (const [key, val] of Object.entries(search)) {
      if (key.startsWith("filter_") && typeof val === "string") {
        f[key.slice(7)] = val;
      }
    }
    return f;
  }, [search]);
  const hasFilters = Object.keys(filters).length > 0;

  // Fetch chart data
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-chart", token, filters],
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/shared/chart/${token}`, window.location.origin);
      if (hasFilters) {
        url.searchParams.set("filters", JSON.stringify(filters));
      }
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Error ${res.status}`);
      }
      return res.json();
    },
  });

  const chart = data?.chart;

  // postMessage: send ready/error events
  useEffect(() => {
    if (chart) {
      window.parent.postMessage({
        type: "karta:ready",
        embedType: "chart",
        id: chart.id,
        title: chart.title,
      }, "*");
    }
  }, [chart]);

  useEffect(() => {
    if (error) {
      window.parent.postMessage({
        type: "karta:error",
        code: "LOAD_ERROR",
        message: (error as Error).message,
      }, "*");
    }
  }, [error]);

  // postMessage: listen for commands from parent
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
      case "karta:refresh":
        window.location.reload();
        break;
    }
  }, [setTheme]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // ResizeObserver: report height changes to parent
  useEffect(() => {
    if (!containerRef.current) return;
    let lastHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const height = Math.ceil(entries[0].contentRect.height);
      if (height !== lastHeight) {
        lastHeight = height;
        window.parent.postMessage({ type: "karta:resize", height }, "*");
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Chart click handler
  const handleChartClick = useCallback((chartId: number, data: { x?: unknown; y?: unknown; label?: string; name?: string }) => {
    window.parent.postMessage({
      type: "karta:chartClick",
      chartId,
      chartTitle: chart?.title,
      point: data,
    }, "*");
  }, [chart?.title]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  if (error || !chart) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-muted-foreground">
        <AlertTriangle className="h-8 w-8" />
        <p className="text-sm">{(error as Error)?.message || "Chart not found"}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      <ChartCard
        chart={chart}
        result={chart.result}
        showActions={false}
        onDataPointClick={handleChartClick}
      />
    </div>
  );
}
