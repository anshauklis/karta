"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SQLTab, SQLTabCreate, SQLTabUpdate } from "@/types";

export function useSQLTabs() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["sql-tabs"],
    queryFn: () => api.get<SQLTab[]>("/api/sql/tabs", token),
    enabled: !!token,
  });
}

export function useCreateSQLTab() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: SQLTabCreate) =>
      api.post<SQLTab>("/api/sql/tabs", data, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sql-tabs"] }),
  });
}

export function useUpdateSQLTab() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: SQLTabUpdate & { id: number }) =>
      api.put<SQLTab>(`/api/sql/tabs/${id}`, data, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sql-tabs"] }),
  });
}

export function useDeleteSQLTab() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/api/sql/tabs/${id}`, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sql-tabs"] }),
  });
}
