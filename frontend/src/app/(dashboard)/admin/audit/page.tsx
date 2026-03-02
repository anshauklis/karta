"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuditLog } from "@/hooks/use-audit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";

const ACTIONS = [
  "login",
  "logout",
  "create",
  "update",
  "delete",
  "execute",
  "export",
  "share",
] as const;

const RESOURCE_TYPES = [
  "dashboard",
  "chart",
  "connection",
  "dataset",
  "user",
  "report",
  "alert",
] as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditLogPage() {
  const t = useTranslations("audit");

  const [action, setAction] = useState<string>("_all_");
  const [resourceType, setResourceType] = useState<string>("_all_");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const filters: Record<string, string | number | undefined> = {
    page,
    per_page: 50,
  };
  if (action && action !== "_all_") filters.action = action;
  if (resourceType && resourceType !== "_all_")
    filters.resource_type = resourceType;
  if (fromDate) filters.from_date = fromDate;
  if (toDate) filters.to_date = toDate;

  const { data, isLoading } = useAuditLog(filters);

  const totalPages = data ? Math.ceil(data.total / data.per_page) : 1;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ScrollText className="h-6 w-6" />
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("action")}
            </label>
            <Select
              value={action}
              onValueChange={(v) => {
                setAction(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("allActions")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all_">{t("allActions")}</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {t(`actions.${a}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("resourceType")}
            </label>
            <Select
              value={resourceType}
              onValueChange={(v) => {
                setResourceType(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("allResources")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all_">{t("allResources")}</SelectItem>
                {RESOURCE_TYPES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`resources.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("fromDate")}
            </label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("toDate")}
            </label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !data?.items?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ScrollText className="mb-2 h-10 w-10" />
            <p className="text-sm">{t("noEvents")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3">{t("time")}</th>
                  <th className="px-4 py-3">{t("user")}</th>
                  <th className="px-4 py-3">{t("action")}</th>
                  <th className="px-4 py-3">{t("resourceType")}</th>
                  <th className="px-4 py-3">{t("resourceId")}</th>
                  <th className="px-4 py-3">{t("ipAddress")}</th>
                  <th className="px-4 py-3">{t("details")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b last:border-0 hover:bg-muted/50"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                      {formatDateTime(event.created_at)}
                    </td>
                    <td className="px-4 py-2">
                      {event.user_name ?? event.user_id ?? "-"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {event.action}
                      </span>
                    </td>
                    <td className="px-4 py-2">{event.resource_type}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {event.resource_id ?? "-"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {event.ip_address ?? "-"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 text-xs text-muted-foreground">
                      {event.details &&
                      Object.keys(event.details).length > 0
                        ? JSON.stringify(event.details)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.total > data.per_page && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {data.total} events
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
