"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { DashboardFilter, DashboardFilterCreate, DashboardFilterUpdate } from "@/types";

export function useDashboardFilters(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["dashboard-filters", dashboardId],
    queryFn: () => api.get<DashboardFilter[]>(`/api/dashboards/${dashboardId}/filters`, token),
    enabled: !!token && !!dashboardId,
  });
}

export function useCreateFilter(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DashboardFilterCreate) =>
      api.post<DashboardFilter>(`/api/dashboards/${dashboardId}/filters`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-filters", dashboardId] });
      toast.success("Filter created");
    },
  });
}

export function useUpdateFilter() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: DashboardFilterUpdate & { id: number }) =>
      api.put<DashboardFilter>(`/api/filters/${id}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-filters"] });
      toast.success("Filter saved");
    },
  });
}

export function useDeleteFilter() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (filterId: number) =>
      api.delete(`/api/filters/${filterId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-filters"] });
      toast.success("Filter deleted");
    },
  });
}


export function useFilterValues(filterId: number | undefined, parentValue?: string | null) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  const params = new URLSearchParams();
  if (parentValue) params.set("parent_value", parentValue);
  const qs = params.toString();

  return useQuery({
    queryKey: ["filter-values", filterId, parentValue ?? null],
    queryFn: () => api.get<{ values: string[] }>(
      `/api/filters/${filterId}/values${qs ? `?${qs}` : ""}`, token
    ),
    enabled: !!token && !!filterId,
    staleTime: 5 * 60_000,
  });
}

export function useDashboardDatasets(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["dashboard-datasets", dashboardId],
    queryFn: () => api.get<{ id: number; name: string; connection_id: number }[]>(
      `/api/dashboards/${dashboardId}/filter-datasets`, token
    ),
    enabled: !!token && !!dashboardId,
  });
}

export function useDashboardChartColumns(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["dashboard-chart-columns", dashboardId],
    queryFn: () => api.get<Record<string, string[]>>(
      `/api/dashboards/${dashboardId}/charts-columns`, token
    ),
    enabled: !!token && !!dashboardId,
  });
}

export function useDatasetColumns(datasetId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["dataset-columns", datasetId],
    queryFn: () => api.get<{ columns: { name: string; type: string }[] }>(`/api/datasets/${datasetId}/columns`, token),
    enabled: !!token && !!datasetId,
  });
}
