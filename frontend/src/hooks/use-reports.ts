"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ScheduledReport } from "@/types";

interface ReportCreate {
  name: string;
  chart_id: number;
  channel_id?: number | null;
  schedule: string;
  timezone?: string;
  is_active?: boolean;
}

interface ReportUpdate {
  name?: string;
  chart_id?: number;
  channel_id?: number | null;
  schedule?: string;
  timezone?: string;
  is_active?: boolean;
}

export function useReports() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["reports"],
    queryFn: () => api.get<ScheduledReport[]>("/api/reports", token),
    enabled: !!token,
  });
}

export function useCreateReport() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ReportCreate) =>
      api.post<ScheduledReport>("/api/reports", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Report created");
    },
  });
}

export function useUpdateReport() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReportUpdate }) =>
      api.put<ScheduledReport>(`/api/reports/${id}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Report updated");
    },
  });
}

export function useDeleteReport() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/reports/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Report deleted");
    },
  });
}

export function useSendReport() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ success: boolean; error?: string }>(
        `/api/reports/${id}/send`, {}, token
      ),
  });
}
