"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAllCharts, useImportChart } from "@/hooks/use-charts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, BarChart3, Table, PieChart, TrendingUp } from "lucide-react";

const CHART_ICONS: Record<string, React.ReactNode> = {
  bar: <BarChart3 className="h-4 w-4" />,
  line: <TrendingUp className="h-4 w-4" />,
  pie: <PieChart className="h-4 w-4" />,
  table: <Table className="h-4 w-4" />,
};

export function ChartBrowser({ dashboardId, children }: { dashboardId: number; children: React.ReactNode }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: allCharts, isLoading } = useAllCharts();
  const importChart = useImportChart(dashboardId);

  // Filter out charts already on this dashboard
  const available = (allCharts || []).filter((c) => c.dashboard_id !== dashboardId);

  const filtered = search
    ? available.filter(
        (c) =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          (c.dashboard_title || "").toLowerCase().includes(search.toLowerCase())
      )
    : available;

  const handleImport = async (chartId: number) => {
    await importChart.mutateAsync(chartId);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("browseChartsTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${tc("search")}...`}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              {search ? tc("noResults") : t("browseChartsEmpty")}
            </p>
          ) : (
            filtered.map((chart) => (
              <button
                key={chart.id}
                type="button"
                onClick={() => handleImport(chart.id)}
                disabled={importChart.isPending}
                className="flex w-full items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  {CHART_ICONS[chart.chart_type] || <BarChart3 className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium text-slate-700">{chart.title}</div>
                  {chart.dashboard_title && (
                    <div className="truncate text-xs text-slate-400">{chart.dashboard_title}</div>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {chart.chart_type || "chart"}
                </Badge>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
