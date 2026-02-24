"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Chart, ChartCreate, ChartUpdate, ChartExecuteResult, ChartPreviewRequest, LayoutItem } from "@/types";

export interface ChartListItem {
  id: number;
  dashboard_id: number;
  title: string;
  chart_type: string;
  mode: string;
  connection_id: number | null;
  dataset_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  dashboard_title: string | null;
  dashboard_slug: string | null;
}

export function useAllCharts() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["charts", "all"],
    queryFn: () => api.get<ChartListItem[]>("/api/charts", token),
    enabled: !!token,
  });
}

export function useDashboardCharts(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["charts", dashboardId],
    queryFn: () => api.get<Chart[]>(`/api/dashboards/${dashboardId}/charts`, token),
    enabled: !!token && !!dashboardId,
  });
}

export function useChart(chartId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["chart", chartId],
    queryFn: () => api.get<Chart>(`/api/charts/${chartId}`, token),
    enabled: !!token && !!chartId,
  });
}

export function useCreateChart(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ChartCreate) =>
      api.post<Chart>(`/api/dashboards/${dashboardId}/charts`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charts", dashboardId] });
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      toast.success("Chart created");
    },
  });
}

export function useCreateStandaloneChart() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ChartCreate & { dashboard_id?: number | null }) =>
      api.post<Chart>("/api/charts", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      toast.success("Chart created");
    },
  });
}

export function useUpdateChart() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chartId, data }: { chartId: number; data: ChartUpdate }) =>
      api.put<Chart>(`/api/charts/${chartId}`, data, token),
    onSuccess: (_, { chartId }) => {
      queryClient.invalidateQueries({ queryKey: ["chart", chartId] });
      queryClient.invalidateQueries({ queryKey: ["charts"] });
      toast.success("Chart saved");
    },
  });
}

export function useDeleteChart() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chartId: number) =>
      api.delete(`/api/charts/${chartId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      toast.success("Chart deleted");
    },
  });
}

export function useExecuteChart() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useMutation({
    mutationFn: ({ chartId, filters, force }: { chartId: number; filters?: Record<string, unknown>; force?: boolean }) =>
      api.post<ChartExecuteResult>(
        `/api/charts/${chartId}/execute`,
        {
          ...(filters && Object.keys(filters).length > 0 ? { filters } : {}),
          ...(force ? { force: true } : {}),
        },
        token
      ),
  });
}

export function chartResultKey(chartId: number, filters?: Record<string, unknown>): readonly [string, number, string] {
  const filtersKey = filters && Object.keys(filters).length > 0
    ? JSON.stringify(filters, Object.keys(filters).sort())
    : "none";
  return ["chart-result", chartId, filtersKey] as const;
}

export function usePreviewChart() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useMutation({
    mutationFn: (data: ChartPreviewRequest) =>
      api.post<ChartExecuteResult>("/api/charts/preview", data, token),
  });
}

export function useDuplicateChart() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chartId: number) =>
      api.post<Chart>(`/api/charts/${chartId}/duplicate`, {}, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      toast.success("Chart duplicated");
    },
  });
}

export function useImportChart(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chartId: number) =>
      api.post<Chart>(`/api/dashboards/${dashboardId}/import-chart/${chartId}`, {}, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charts", dashboardId] });
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      toast.success("Chart added");
    },
  });
}

export function useSaveLayout(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (items: LayoutItem[]) =>
      api.put(`/api/dashboards/${dashboardId}/layout`, { items }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charts", dashboardId] });
      toast.success("Layout saved");
    },
  });
}
