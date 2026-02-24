"use client";

import { useState, useMemo } from "react";
import { useDashboards, useCreateDashboard, useDeleteDashboard } from "@/hooks/use-dashboards";
import { useConnections } from "@/hooks/use-connections";
import { useFavorites } from "@/hooks/use-favorites";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, BarChart3, Star, Search, ArrowUp, ArrowDown, X, MoreHorizontal, Trash2, Settings2, Upload } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WelcomeWizard } from "@/components/welcome-wizard";
import { DashboardPropertiesDialog } from "@/components/dashboard/dashboard-properties-dialog";
import { ImportDashboardDialog } from "@/components/dashboard/import-dashboard-dialog";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { Dashboard } from "@/types";
import { useRoles } from "@/hooks/use-roles";

type SortKey = "title" | "updated_at" | "chart_count";
type SortDir = "asc" | "desc";

export default function HomePage() {
  const { data: dashboards, isLoading } = useDashboards();
  const { data: connections } = useConnections();
  const createDashboard = useCreateDashboard();
  const deleteDashboard = useDeleteDashboard();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { canEdit } = useRoles();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const [wizardDismissed, setWizardDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("karta_wizard_dismissed") === "true";
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [propertiesTarget, setPropertiesTarget] = useState<Dashboard | null>(null);
  const [showImport, setShowImport] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "title" ? "asc" : "desc");
    }
  };

  const filtered = useMemo(() => {
    let list = dashboards ?? [];
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.description && d.description.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "title") {
        return a.title.localeCompare(b.title) * dir;
      }
      if (sortKey === "chart_count") {
        return (a.chart_count - b.chart_count) * dir;
      }
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir;
    });
  }, [dashboards, search, sortKey, sortDir]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createDashboard.mutateAsync({ title: newTitle.trim() });
    setNewTitle("");
    setShowCreate(false);
  };

  const handleDelete = (id: number, title: string) => {
    setDeleteTarget({ id, title });
  };

  const dismissWizard = () => {
    setWizardDismissed(true);
    localStorage.setItem("karta_wizard_dismissed", "true");
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    );
  }

  const showWizard = !wizardDismissed && dashboards && dashboards.length === 0;

  return (
    <div>
      {showWizard && (
        <WelcomeWizard onDismiss={dismissWizard} hasConnections={(connections?.length ?? 0) > 0} />
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-foreground">{tn("dashboards")}</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchDashboards")}
              className="h-8 w-48 pl-8 pr-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center rounded-md border border-border">
            {(["title", "updated_at", "chart_count"] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => toggleSort(key)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 text-xs transition-colors",
                  sortKey === key
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {key === "title" && t("sortTitle")}
                {key === "updated_at" && t("sortUpdated")}
                {key === "chart_count" && t("sortCharts")}
                {sortKey === key &&
                  (sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  ))}
              </button>
            ))}
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
              <Upload className="mr-1 h-4 w-4" />
              {t("importDashboard")}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("new")}
            </Button>
          )}
        </div>
      </div>

      {showCreate && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="title">Dashboard Title</Label>
                <Input
                  id="title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="My Dashboard"
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={createDashboard.isPending}>
                {tc("create")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                {tc("cancel")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {dashboards && dashboards.length === 0 && !showCreate && !showWizard ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BarChart3 className="mb-4 h-16 w-16 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-medium text-foreground">{t("noDashboards")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("createFirst")}</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Create your first dashboard
          </Button>
        </div>
      ) : (
        <>
          {filtered.length === 0 && search && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("noResults")}</p>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((d) => (
                <div key={d.id} className="relative group">
                  <Link href={`/dashboard/${d.url_slug}`}>
                    <Card className="cursor-pointer border-border transition-shadow hover:shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{d.icon}</span>
                          <CardTitle className="text-base flex-1">{d.title}</CardTitle>
                        </div>
                        {d.description && (
                          <CardDescription className="line-clamp-2">{d.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">
                            {d.chart_count} chart{d.chart_count !== 1 ? "s" : ""}
                          </Badge>
                          <span>Updated {new Date(d.updated_at).toLocaleDateString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite({ type: "dashboard", id: d.id, label: d.title, slug: d.url_slug, icon: d.icon });
                      }}
                    >
                      <Star className={cn("h-4 w-4", isFavorite("dashboard", d.id) ? "fill-amber-400 text-amber-400" : "text-muted-foreground hover:text-amber-400")} />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                        <button className="rounded-sm p-0.5 hover:bg-accent">
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setPropertiesTarget(d);
                          }}
                        >
                          <Settings2 className="mr-2 h-4 w-4" />
                          {t("properties")}
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(d.id, d.title);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("deleteDashboard")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("areYouSure")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm", { title: deleteTarget?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { deleteDashboard.mutate(deleteTarget!.id); setDeleteTarget(null); }}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {propertiesTarget && (
        <DashboardPropertiesDialog
          dashboard={propertiesTarget}
          open={!!propertiesTarget}
          onOpenChange={(open) => !open && setPropertiesTarget(null)}
        />
      )}
      <ImportDashboardDialog open={showImport} onOpenChange={setShowImport} />
    </div>
  );
}
