"use client";

import { useTranslations } from "next-intl";
import { usePlugins } from "@/hooks/use-connections";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Puzzle } from "lucide-react";

export default function AdminPluginsPage() {
  const t = useTranslations("plugins");
  const { data: plugins, isLoading } = usePlugins();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-44 rounded" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("description")}</p>
      </div>

      {plugins && plugins.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Puzzle className="mb-4 h-16 w-16 text-slate-300" />
          <h2 className="mb-2 text-lg font-medium text-slate-600">
            {t("noPlugins")}
          </h2>
        </div>
      ) : plugins && plugins.length > 0 ? (
        <Card className="border-slate-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("name")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("type")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("source")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {plugins.map((plugin) => (
                <tr
                  key={plugin.db_type}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">
                      {plugin.display_name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-500">{plugin.type}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={plugin.source === "built-in" ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {plugin.source === "built-in" ? t("builtIn") : plugin.source}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className="bg-green-50 text-xs text-green-700 border-green-200"
                    >
                      {t("active")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
