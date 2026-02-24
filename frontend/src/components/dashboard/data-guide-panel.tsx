"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Database, FileSpreadsheet, Table2, ChevronDown } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { extractTables } from "@/lib/extract-tables";
import type { Chart, Connection, Dataset } from "@/types";

interface DataGuidePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charts: Chart[];
  connections: Connection[];
  datasets: Dataset[];
}

function Section({
  icon: Icon,
  title,
  count,
  defaultOpen = true,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-accent/50 transition-colors"
      >
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1">{title}</span>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && <div className="px-4 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

export function DataGuidePanel({
  open,
  onOpenChange,
  charts,
  connections,
  datasets,
}: DataGuidePanelProps) {
  const t = useTranslations("dashboard");

  const connectionGroups = useMemo(() => {
    const groups = new Map<
      number,
      { connection: Connection; charts: Chart[] }
    >();
    for (const chart of charts) {
      if (chart.connection_id == null) continue;
      if (!groups.has(chart.connection_id)) {
        const conn = connections.find((c) => c.id === chart.connection_id);
        if (!conn) continue;
        groups.set(chart.connection_id, { connection: conn, charts: [] });
      }
      groups.get(chart.connection_id)!.charts.push(chart);
    }
    return [...groups.values()];
  }, [charts, connections]);

  const datasetGroups = useMemo(() => {
    const groups = new Map<number, { dataset: Dataset; charts: Chart[] }>();
    for (const chart of charts) {
      if (chart.dataset_id == null) continue;
      if (!groups.has(chart.dataset_id)) {
        const ds = datasets.find((d) => d.id === chart.dataset_id);
        if (!ds) continue;
        groups.set(chart.dataset_id, { dataset: ds, charts: [] });
      }
      groups.get(chart.dataset_id)!.charts.push(chart);
    }
    return [...groups.values()];
  }, [charts, datasets]);

  const tableGroups = useMemo(() => {
    const tableMap = new Map<string, Chart[]>();
    for (const chart of charts) {
      const sql = chart.sql_query;
      if (!sql) continue;
      const tables = extractTables(sql);
      for (const table of tables) {
        if (!tableMap.has(table)) {
          tableMap.set(table, []);
        }
        tableMap.get(table)!.push(chart);
      }
    }
    return [...tableMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, charts]) => ({ name, charts }));
  }, [charts]);

  const hasData =
    connectionGroups.length > 0 ||
    datasetGroups.length > 0 ||
    tableGroups.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
          <SheetTitle>{t("dataGuide")}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Database className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {t("dataGuideNoData")}
              </p>
            </div>
          ) : (
            <>
              {connectionGroups.length > 0 && (
                <Section
                  icon={Database}
                  title={t("dataGuideConnections")}
                  count={connectionGroups.length}
                >
                  {connectionGroups.map(({ connection, charts }) => (
                    <div
                      key={connection.id}
                      className="rounded-md border border-border p-3 text-sm space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {connection.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase shrink-0">
                          {connection.db_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {connection.host}:{connection.port}/{connection.database_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("dataGuideUsedBy", {
                          charts: charts.map((c) => c.title).join(", "),
                        })}
                      </p>
                    </div>
                  ))}
                </Section>
              )}

              {datasetGroups.length > 0 && (
                <Section
                  icon={FileSpreadsheet}
                  title={t("dataGuideDatasets")}
                  count={datasetGroups.length}
                >
                  {datasetGroups.map(({ dataset, charts }) => (
                    <div
                      key={dataset.id}
                      className="rounded-md border border-border p-3 text-sm space-y-1"
                    >
                      <span className="font-medium">{dataset.name}</span>
                      {dataset.sql_query && (
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {dataset.sql_query.length > 80
                            ? dataset.sql_query.slice(0, 80) + "..."
                            : dataset.sql_query}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t("dataGuideUsedBy", {
                          charts: charts.map((c) => c.title).join(", "),
                        })}
                      </p>
                    </div>
                  ))}
                </Section>
              )}

              {tableGroups.length > 0 && (
                <Section
                  icon={Table2}
                  title={t("dataGuideTables")}
                  count={tableGroups.length}
                >
                  {tableGroups.map(({ name, charts }) => (
                    <div
                      key={name}
                      className="rounded-md border border-border p-3 text-sm space-y-1"
                    >
                      <span className="font-medium font-mono">{name}</span>
                      <p className="text-xs text-muted-foreground">
                        {t("dataGuideUsedBy", {
                          charts: charts.map((c) => c.title).join(", "),
                        })}
                      </p>
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
