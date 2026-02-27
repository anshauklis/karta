"use client";

import { useChartInsights } from "@/hooks/use-charts";
import { useTranslations } from "next-intl";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChartInsight } from "@/types";

interface ChartInsightsBadgeProps {
  chartId: number;
}

const severityClasses: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  negative: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  neutral: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
};

function InsightIcon({ insight, className }: { insight: ChartInsight; className?: string }) {
  if (insight.type === "anomaly") return <AlertTriangle className={className} />;
  if (insight.type === "trend") {
    return insight.severity === "positive"
      ? <TrendingUp className={className} />
      : <TrendingDown className={className} />;
  }
  return <Info className={className} />;
}

function InsightTypeLabel({ type, t }: { type: ChartInsight["type"]; t: (key: string) => string }) {
  const labels: Record<string, string> = {
    trend: t("insightTrend"),
    anomaly: t("insightAnomaly"),
    info: t("insightInfo"),
  };
  return <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{labels[type] || type}</span>;
}

export function ChartInsightsBadge({ chartId }: ChartInsightsBadgeProps) {
  const { data } = useChartInsights(chartId);
  const t = useTranslations("chart");
  const insights = data?.insights;

  if (!insights?.length) return null;

  const top = insights[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors hover:opacity-80",
            severityClasses[top.severity] || severityClasses.neutral,
          )}
        >
          <InsightIcon insight={top} className="h-3 w-3 shrink-0" />
          <span className="max-w-[120px] truncate">{top.title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("insights")}</p>
          {insights.map((insight, i) => (
            <div
              key={i}
              className={cn(
                "rounded-md border px-2.5 py-2 text-xs",
                severityClasses[insight.severity] || severityClasses.neutral,
              )}
            >
              <div className="flex items-center gap-1.5">
                <InsightIcon insight={insight} className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">{insight.title}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] opacity-80">{insight.detail}</span>
                <InsightTypeLabel type={insight.type} t={t} />
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
