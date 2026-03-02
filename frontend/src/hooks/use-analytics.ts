"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PopularContentItem, UserActivityItem, DashboardStats } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function usePopularContent() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["analytics", "popular"],
    queryFn: () => api.get<PopularContentItem[]>("/api/analytics/popular", token),
    enabled: !!token,
  });
}

export function useUserActivity() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["analytics", "user-activity"],
    queryFn: () => api.get<UserActivityItem[]>("/api/analytics/user-activity", token),
    enabled: !!token,
  });
}

export function useDashboardStats(dashboardId: number | null) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["analytics", "dashboard-stats", dashboardId],
    queryFn: () => api.get<DashboardStats>(`/api/analytics/dashboard/${dashboardId}/stats`, token),
    enabled: !!token && !!dashboardId,
  });
}
