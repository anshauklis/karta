"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Dashboard } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function useDashboards() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["dashboards"],
    queryFn: () => api.get<Dashboard[]>("/api/dashboards", token),
    enabled: !!token,
  });
}

export function useCreateDashboard() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { title: string; description?: string; icon?: string }) =>
      api.post<Dashboard>("/api/dashboards", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      toast.success("Dashboard created");
    },
  });
}

export interface DashboardUpdateData {
  title?: string;
  description?: string;
  icon?: string;
  sort_order?: number;
  filter_layout?: Record<string, unknown>;
  url_slug?: string;
  color_scheme?: string | null;
  owner_ids?: number[];
  roles?: string[];
}

export function useUpdateDashboard() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DashboardUpdateData; silent?: boolean }) =>
      api.put<Dashboard>(`/api/dashboards/${id}`, data, token),
    onSuccess: (_, { silent }) => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (!silent) toast.success("Dashboard updated");
    },
  });
}

export function useGroups() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["dashboard-groups"],
    queryFn: () => api.get<string[]>("/api/dashboards/groups", token),
    enabled: !!token,
  });
}

export function useDeleteDashboard() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dashboardId: number) =>
      api.delete(`/api/dashboards/${dashboardId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      toast.success("Dashboard deleted");
    },
  });
}

export function useDashboardBySlug(slug: string | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["dashboard", "slug", slug],
    queryFn: () => api.get<Dashboard>(`/api/dashboards/by-slug/${slug}`, token),
    enabled: !!token && !!slug,
  });
}
