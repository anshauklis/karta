"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AlertRule, AlertRuleCreate, AlertRuleUpdate, AlertHistory } from "@/types";

export function useAlerts() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => api.get<AlertRule[]>("/api/alerts", token),
    enabled: !!token,
  });
}

export function useCreateAlert() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AlertRuleCreate) =>
      api.post<AlertRule>("/api/alerts", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert created");
    },
  });
}

export function useUpdateAlert() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AlertRuleUpdate }) =>
      api.put<AlertRule>(`/api/alerts/${id}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert updated");
    },
  });
}

export function useDeleteAlert() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/alerts/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alert deleted");
    },
  });
}

export function useTestAlert() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ triggered: boolean; message?: string; error?: string }>(
        `/api/alerts/${id}/test`, {}, token
      ),
  });
}

export function useAlertHistory(alertId: number | null) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["alert-history", alertId],
    queryFn: () => api.get<AlertHistory[]>(`/api/alerts/${alertId}/history`, token),
    enabled: !!token && !!alertId,
  });
}

export function useAllAlertHistory() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["alert-history-all"],
    queryFn: () => api.get<AlertHistory[]>("/api/alert-history", token),
    enabled: !!token,
  });
}
