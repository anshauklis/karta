"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { convertLayout } from "@/lib/keyboard-layouts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3, BarChart, LineChart, AreaChart, PieChart,
  ScatterChart as ScatterIcon, Table2, Circle, ArrowUpDown,
  Grid3X3, BoxSelect, LayoutGrid, Filter, Layers, Hash,
  TableProperties, ChevronsDown, Search,
} from "lucide-react";

const CATEGORY_KEYS = [
  { id: "popular", key: "categories.popular" },
  { id: "comparison", key: "categories.comparison" },
  { id: "distribution", key: "categories.distribution" },
  { id: "part", key: "categories.partOfWhole" },
  { id: "trend", key: "categories.trend" },
  { id: "table", key: "categories.table" },
  { id: "statistical", key: "categories.statistical" },
] as const;

const CHART_TYPES = [
  // Popular
  { value: "bar",     icon: BarChart3,      categories: ["popular", "comparison"] },
  { value: "line",    icon: LineChart,      categories: ["popular", "trend"] },
  { value: "pie",     icon: PieChart,       categories: ["popular", "part"] },
  { value: "table",   icon: Table2,         categories: ["popular", "table"] },
  { value: "kpi",     icon: Hash,           categories: ["popular"] },
  // Comparison
  { value: "bar_h",   icon: BarChart3,      categories: ["comparison"], rotate: true },
  { value: "combo",   icon: Layers,         categories: ["comparison"] },
  { value: "scatter", icon: ScatterIcon,    categories: ["comparison"] },
  // Distribution
  { value: "histogram", icon: BarChart,     categories: ["distribution"] },
  { value: "box",     icon: BoxSelect,      categories: ["distribution"] },
  { value: "violin",  icon: BarChart,       categories: ["distribution"] },
  { value: "heatmap", icon: Grid3X3,        categories: ["distribution"] },
  // Part of Whole
  { value: "donut",   icon: Circle,         categories: ["part"] },
  { value: "treemap", icon: LayoutGrid,     categories: ["part"] },
  { value: "funnel",  icon: Filter,         categories: ["part"] },
  // Trend
  { value: "area",    icon: AreaChart,      categories: ["trend"] },
  { value: "waterfall", icon: ChevronsDown, categories: ["trend"] },
  // Table
  { value: "pivot",   icon: TableProperties, categories: ["table"] },
  // Statistical
  { value: "correlation", icon: Grid3X3,    categories: ["statistical"] },
  { value: "pareto",  icon: ArrowUpDown,    categories: ["statistical"] },
  { value: "control", icon: LineChart,      categories: ["statistical"] },
] satisfies { value: string; icon: LucideIcon; categories: string[]; rotate?: boolean }[];

interface ChartTypeGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSelect: (value: string) => void;
}

export function ChartTypeGallery({ open, onOpenChange, value, onSelect }: ChartTypeGalleryProps) {
  const t = useTranslations("chartGallery");
  const tc = useTranslations("common");
  const [category, setCategory] = useState<string>("popular");
  const [search, setSearch] = useState("");

  const { filtered, convertedQuery } = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const direct = CHART_TYPES.filter(
        (ct) => t(`types.${ct.value}.label`).toLowerCase().includes(q) || t(`types.${ct.value}.desc`).toLowerCase().includes(q)
      );
      const converted = convertLayout(search);
      if (converted) {
        const cq = converted.toLowerCase();
        const extra = CHART_TYPES.filter(
          (ct) =>
            (t(`types.${ct.value}.label`).toLowerCase().includes(cq) || t(`types.${ct.value}.desc`).toLowerCase().includes(cq)) &&
            !direct.includes(ct)
        );
        if (extra.length > 0) {
          return { filtered: [...direct, ...extra], convertedQuery: converted };
        }
      }
      return { filtered: direct, convertedQuery: null };
    }
    return { filtered: CHART_TYPES.filter((ct) => ct.categories.includes(category)), convertedQuery: null };
  }, [category, search, t]);

  const handleSelect = (chartValue: string) => {
    onSelect(chartValue);
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="p-0 gap-0 h-[70vh] grid-rows-[auto_1fr]">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col min-h-0">
          {/* Search */}
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pl-9 h-9"
                autoFocus
              />
            </div>
          </div>
          {convertedQuery && (
            <div className="px-4 pb-1 text-xs text-muted-foreground">
              {tc("alsoSearching", { query: convertedQuery })}
            </div>
          )}

        <div className="flex flex-1 min-h-0 border-t border-border">
          {/* Categories sidebar */}
          {!search.trim() && (
            <div className="w-40 border-r border-border overflow-y-auto py-2 shrink-0">
              {CATEGORY_KEYS.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    category === cat.id
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {t(cat.key)}
                </button>
              ))}
            </div>
          )}

          {/* Chart type cards grid */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {filtered.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => handleSelect(ct.value)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    value === ct.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  }`}
                >
                  <ct.icon className={`h-8 w-8 shrink-0 ${ct.rotate ? "rotate-90" : ""} ${
                    value === ct.value ? "text-primary" : "text-muted-foreground"
                  }`} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{t(`types.${ct.value}.label`)}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{t(`types.${ct.value}.desc`)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-export for use as trigger button
export function ChartTypeTrigger({
  value,
  onClick,
}: {
  value: string;
  onClick: () => void;
}) {
  const t = useTranslations("chartGallery");
  const ct = CHART_TYPES.find((c) => c.value === value) || CHART_TYPES[0];
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted"
    >
      <ct.icon className={`h-6 w-6 text-primary ${ct.rotate ? "rotate-90" : ""}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{t(`types.${ct.value}.label`)}</div>
        <div className="text-xs text-muted-foreground">{t(`types.${ct.value}.desc`)}</div>
      </div>
      <span className="text-xs text-muted-foreground">{t("change")}</span>
    </button>
  );
}
