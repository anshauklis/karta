"use client";

import { usePopularContent, useUserActivity } from "@/hooks/use-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Users, Eye, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";

export default function AnalyticsPage() {
  const t = useTranslations("analytics");
  const { data: popular, isLoading: popularLoading } = usePopularContent();
  const { data: activity, isLoading: activityLoading } = useUserActivity();

  const totalViews = popular?.reduce((sum, item) => sum + item.views_30d, 0) ?? 0;
  const totalUsers = activity?.filter((u) => u.total_views > 0).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
        <Badge variant="secondary" className="text-xs">{t("last30days")}</Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg bg-blue-50 p-2.5">
              <Eye className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{totalViews.toLocaleString()}</p>
              <p className="text-xs text-slate-500">{t("totalViews")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg bg-emerald-50 p-2.5">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{totalUsers}</p>
              <p className="text-xs text-slate-500">{t("activeUsers")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg bg-purple-50 p-2.5">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{popular?.length ?? 0}</p>
              <p className="text-xs text-slate-500">{t("activeContent")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Popular Content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("popularContent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {popularLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 rounded" />
              ))}
            </div>
          ) : !popular || popular.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t("noViewData")}</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                    <th className="pb-2 pr-4">{t("content")}</th>
                    <th className="pb-2 pr-4">{t("type")}</th>
                    <th className="pb-2 pr-4 text-right">{t("views")}</th>
                    <th className="pb-2 pr-4 text-right">{t("unique")}</th>
                    <th className="pb-2 text-right">{t("lastViewed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {popular.map((item) => (
                    <tr key={`${item.entity_type}-${item.entity_id}`} className="border-b border-slate-100">
                      <td className={`py-2 pr-4 font-medium ${item.title ? "text-slate-800" : "text-slate-400 italic"}`}>
                        {item.title || "(Deleted)"}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary" className="text-[10px]">
                          {item.entity_type}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{item.views_30d}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{item.unique_viewers}</td>
                      <td className="py-2 text-right text-xs text-slate-400">
                        {item.last_viewed ? new Date(item.last_viewed).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("userActivity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 rounded" />
              ))}
            </div>
          ) : !activity || activity.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t("noUsersFound")}</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                    <th className="pb-2 pr-4">{t("user")}</th>
                    <th className="pb-2 pr-4">{t("email")}</th>
                    <th className="pb-2 pr-4 text-right">{t("views30d")}</th>
                    <th className="pb-2 text-right">{t("lastActive")}</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((user) => (
                    <tr key={user.user_id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-800">{user.user_name}</td>
                      <td className="py-2 pr-4 text-slate-500">{user.user_email}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{user.total_views}</td>
                      <td className="py-2 text-right text-xs text-slate-400">
                        {user.last_active ? new Date(user.last_active).toLocaleDateString() : t("never")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
