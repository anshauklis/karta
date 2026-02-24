"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAllCharts, useDeleteChart, useDuplicateChart } from "@/hooks/use-charts";
import { useDashboards } from "@/hooks/use-dashboards";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  ExternalLink,
  BarChart3,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRoles } from "@/hooks/use-roles";

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SortKey = "title" | "chart_type" | "dashboard_title" | "updated_at";
type SortDir = "asc" | "desc";

export default function ChartsPage() {
  const t = useTranslations("chart");
  const tc = useTranslations("common");
  const { canEdit } = useRoles();
  const { data: charts, isLoading } = useAllCharts();
  const { data: dashboards } = useDashboards();
  const deleteChart = useDeleteChart();
  const duplicateChart = useDuplicateChart();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dashFilter, setDashFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => (charts ?? [])
    .filter((c) => {
      if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter !== "all" && c.chart_type !== typeFilter) return false;
      if (dashFilter !== "all" && String(c.dashboard_id) !== dashFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    }), [charts, search, typeFilter, dashFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const chartTypes = [...new Set((charts ?? []).map((c) => c.chart_type))].sort();
  const dashboardOptions = [...new Set((charts ?? []).map((c) => c.dashboard_id))]
    .map((id) => {
      const chart = (charts ?? []).find((c) => c.dashboard_id === id);
      return { id, title: chart?.dashboard_title || `Dashboard #${id}` };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const chartHref = (chart: { id: number; dashboard_slug?: string | null }) =>
    chart.dashboard_slug
      ? `/dashboard/${chart.dashboard_slug}/chart/${chart.id}`
      : `/charts/${chart.id}`;

  const handleDelete = (id: number, title: string) => {
    setDeleteTarget({ id, title });
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "text-primary" : "text-muted-foreground/50"}`} />
    </button>
  );

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Charts</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} chart{filtered.length !== 1 ? "s" : ""}{" "}
            {(charts ?? []).length !== filtered.length && `of ${(charts ?? []).length} total`}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" asChild>
            <Link href="/charts/new">
              <Plus className="mr-2 h-4 w-4" />
              {t("addChart")}
            </Link>
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`${tc("search")}...`}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Chart type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {chartTypes.map((ct) => (
              <SelectItem key={ct} value={ct}>{t(`types.${ct}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dashFilter} onValueChange={(v) => { setDashFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Dashboard" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dashboards</SelectItem>
            {dashboardOptions.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>{d.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">No charts found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search || typeFilter !== "all" || dashFilter !== "all"
              ? "Try adjusting your filters"
              : "Create a chart from any dashboard"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]"><SortHeader label="Title" field="title" /></TableHead>
                <TableHead><SortHeader label="Type" field="chart_type" /></TableHead>
                <TableHead><SortHeader label="Dashboard" field="dashboard_title" /></TableHead>
                <TableHead>Mode</TableHead>
                <TableHead><SortHeader label="Modified" field="updated_at" /></TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((chart) => (
                <TableRow key={chart.id}>
                  <TableCell className="font-medium">
                    <Link href={chartHref(chart)} className="hover:underline hover:text-primary">
                      {chart.title || t("noTitle")}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {t(`types.${chart.chart_type}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {chart.dashboard_title || "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs ${chart.mode === "code" ? "text-amber-600" : "text-blue-600"}`}>
                      {chart.mode === "code" ? t("code") : t("visual")}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {chart.updated_at ? formatDate(chart.updated_at) : "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={chartHref(chart)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {tc("edit")}
                          </Link>
                        </DropdownMenuItem>
                        {chart.dashboard_slug && (
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/${chart.dashboard_slug}`}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Go to Dashboard
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => duplicateChart.mutate(chart.id)}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          {tc("duplicate")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(chart.id, chart.title)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {tc("delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-muted-foreground">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {tc("back")}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {safePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                >
                  {tc("next")}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("areYouSure")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteChartConfirm", { title: deleteTarget?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { deleteChart.mutate(deleteTarget!.id); setDeleteTarget(null); }}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
