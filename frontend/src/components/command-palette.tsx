"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Command } from "cmdk";
import { useDashboards } from "@/hooks/use-dashboards";
import { useAllCharts } from "@/hooks/use-charts";
import { layoutAwareMatch } from "@/lib/layout-aware-filter";
import { convertLayout } from "@/lib/keyboard-layouts";
import {
  LayoutDashboard, Database, Terminal, FileSpreadsheet,
  Bell, FileText, BookOpen, Users, Shield, Eye, GitBranch,
  Search, BarChart3, Layers, Puzzle,
} from "lucide-react";
import { useRoles } from "@/hooks/use-roles";

export function CommandPalette() {
  const t = useTranslations("commandPalette");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const router = useRouter();
  const { isAdmin, canSqlLab } = useRoles();
  const { data: dashboards } = useDashboards();
  const { data: charts } = useAllCharts();

  const PAGES = [
    { label: tn("dashboards"), href: "/", icon: LayoutDashboard, group: "navigate" as const },
    { label: tn("connections"), href: "/connections", icon: Database, group: "navigate" as const },
    { label: tn("sqlLab"), href: "/sql-lab", icon: Terminal, group: "navigate" as const },
    { label: tn("datasets"), href: "/datasets", icon: FileSpreadsheet, group: "navigate" as const },
    { label: tn("metrics"), href: "/metrics", icon: Layers, group: "navigate" as const },
    { label: tn("alerts"), href: "/alerts", icon: Bell, group: "navigate" as const },
    { label: tn("reports"), href: "/reports", icon: FileText, group: "navigate" as const },
    { label: tn("stories"), href: "/stories", icon: BookOpen, group: "navigate" as const },
    { label: tn("users"), href: "/admin/users", icon: Users, group: "admin" as const },
    { label: tn("rlsRules"), href: "/admin/rls", icon: Shield, group: "admin" as const },
    { label: tn("plugins"), href: "/admin/plugins", icon: Puzzle, group: "admin" as const },
    { label: tn("analytics"), href: "/analytics", icon: Eye, group: "admin" as const },
    { label: tn("lineage"), href: "/lineage", icon: GitBranch, group: "admin" as const },
  ];

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = (href: string) => {
    router.push(href);
    setSearchValue("");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <Command
        className="relative z-50 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        label="Command palette"
        filter={layoutAwareMatch}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Command.Input
            placeholder={t("searchPlaceholder")}
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
            onValueChange={setSearchValue}
          />
        </div>
        {(() => {
          const converted = searchValue.trim() ? convertLayout(searchValue) : null;
          return converted ? (
            <div className="px-4 pb-1 text-xs text-muted-foreground">
              {tc("alsoSearching", { query: converted })}
            </div>
          ) : null;
        })()}
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("noResults")}
          </Command.Empty>

          {dashboards && dashboards.length > 0 && (
            <Command.Group heading={t("dashboards")} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {dashboards.map((d) => (
                <Command.Item
                  key={`dash-${d.id}`}
                  value={`dashboard ${d.title}`}
                  onSelect={() => go(`/dashboard/${d.url_slug}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-accent"
                >
                  <span className="text-lg">{d.icon}</span>
                  <span>{d.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{t("chartsCount", { count: d.chart_count })}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {charts && charts.length > 0 && (
            <Command.Group heading={t("charts")} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {charts.map((c) => (
                <Command.Item
                  key={`chart-${c.id}`}
                  value={`chart ${c.title}`}
                  onSelect={() => go(c.dashboard_slug ? `/dashboard/${c.dashboard_slug}/chart/${c.id}` : `/charts/${c.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-accent"
                >
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span>{c.title}</span>
                  {c.dashboard_title && (
                    <span className="ml-auto text-xs text-muted-foreground">{c.dashboard_title}</span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading={t("navigate")} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {PAGES.filter((p) => p.group === "navigate" && (p.href !== "/sql-lab" || canSqlLab)).map((p) => (
              <Command.Item
                key={p.href}
                value={p.label}
                onSelect={() => go(p.href)}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-accent"
              >
                <p.icon className="h-4 w-4 text-muted-foreground" />
                <span>{p.label}</span>
              </Command.Item>
            ))}
          </Command.Group>

          {isAdmin && (
            <Command.Group heading={t("admin")} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {PAGES.filter((p) => p.group === "admin").map((p) => (
                <Command.Item
                  key={p.href}
                  value={p.label}
                  onSelect={() => go(p.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-accent"
                >
                  <p.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{p.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">Esc</kbd> {t("escToClose")}
        </div>
      </Command>
    </div>
  );
}
