"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { ChartDraft, ChartDraftUpsert } from "@/types";

export function useChartDraft(chartId: string | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const key = chartId ?? "new";

  return useQuery({
    queryKey: ["chart-draft", key],
    queryFn: async () => {
      try {
        return await api.get<ChartDraft>(`/api/drafts/charts/${key}`, token);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!token,
    retry: false,
  });
}

export function useUpsertChartDraft() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ chartId, ...data }: ChartDraftUpsert & { chartId: string }) =>
      api.put<ChartDraft>(`/api/drafts/charts/${chartId}`, data, token),
    onSuccess: (draft, { chartId }) => {
      qc.setQueryData(["chart-draft", chartId], draft);
    },
  });
}

export function useDeleteChartDraft() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (chartId: string) =>
      api.delete(`/api/drafts/charts/${chartId}`, token),
    onSuccess: (_, chartId) =>
      qc.setQueryData(["chart-draft", chartId], null),
  });
}
