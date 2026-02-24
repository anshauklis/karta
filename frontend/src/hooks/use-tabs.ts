import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import type { DashboardTab, TabCreate } from "@/types";

export function useDashboardTabs(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["dashboard-tabs", dashboardId],
    queryFn: () => api.get<DashboardTab[]>(`/api/dashboards/${dashboardId}/tabs`, token),
    enabled: !!token && !!dashboardId,
  });
}

export function useCreateTab(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TabCreate) =>
      api.post<DashboardTab>(`/api/dashboards/${dashboardId}/tabs`, data, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-tabs", dashboardId] });
    },
  });
}

export function useUpdateTab(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tabId, data }: { tabId: number; data: Partial<TabCreate> }) =>
      api.put<DashboardTab>(`/api/dashboards/${dashboardId}/tabs/${tabId}`, data, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-tabs", dashboardId] });
    },
  });
}

export function useDeleteTab(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tabId: number) =>
      api.delete(`/api/dashboards/${dashboardId}/tabs/${tabId}`, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-tabs", dashboardId] });
      qc.invalidateQueries({ queryKey: ["charts", dashboardId] });
    },
  });
}

export function useReorderTabs(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tabIds: number[]) =>
      api.put(`/api/dashboards/${dashboardId}/tabs/reorder`, { tab_ids: tabIds }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-tabs", dashboardId] });
    },
  });
}

export function useMoveChartToTab() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chartId, tabId }: { chartId: number; tabId: number }) =>
      api.put(`/api/charts/${chartId}/tab`, { tab_id: tabId }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charts"] });
    },
  });
}
