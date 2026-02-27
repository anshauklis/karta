"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Connection, ConnectionCreate, ConnectionTestResult, EngineSpec, SchemaTable } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function useEngineSpecs() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useQuery({
    queryKey: ["engine-specs"],
    queryFn: () => api.get<EngineSpec[]>("/api/connections/engine-specs", token),
    enabled: !!token,
    staleTime: Infinity,
  });
}

export function useConnections() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<Connection[]>("/api/connections", token),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
}

export function useCreateConnection() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ConnectionCreate) =>
      api.post<Connection>("/api/connections", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast.success("Connection created");
    },
  });
}

export function useDeleteConnection() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/connections/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast.success("Connection deleted");
    },
  });
}

export function useUpdateConnection() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ConnectionCreate> }) =>
      api.put<Connection>(`/api/connections/${id}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      toast.success("Connection updated");
    },
  });
}

export function useTestConnection() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useMutation({
    mutationFn: (id: number) =>
      api.post<ConnectionTestResult>(`/api/connections/${id}/test`, {}, token),
  });
}

export function useConnectionSchema(connectionId: number | null, schema?: string | null) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  const params = schema ? `?schema=${encodeURIComponent(schema)}` : "";
  return useQuery({
    queryKey: ["schema", connectionId, schema],
    queryFn: () => api.get<SchemaTable[]>(`/api/connections/${connectionId}/schema${params}`, token),
    enabled: !!token && !!connectionId,
    staleTime: 5 * 60_000,
  });
}

export function useConnectionSchemas(connectionId: number | null) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["schemas", connectionId],
    queryFn: () => api.get<string[]>(`/api/connections/${connectionId}/schemas`, token),
    enabled: !!token && !!connectionId,
    staleTime: 5 * 60_000,
  });
}
