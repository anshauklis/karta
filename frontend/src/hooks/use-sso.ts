"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type SessionWithToken = { accessToken?: string } | null;

interface SSOProvider {
  id: number;
  tenant_id: number;
  provider_type: "oidc" | "saml" | "ldap";
  name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export function useSSOProviders() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useQuery({
    queryKey: ["sso", "providers"],
    queryFn: () => api.get<SSOProvider[]>("/api/sso/providers", token),
    enabled: !!token,
  });
}

export function useCreateSSOProvider() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      provider_type: string;
      name: string;
      config: Record<string, unknown>;
    }) => api.post<SSOProvider>("/api/sso/providers", body, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sso"] }),
  });
}

export function useUpdateSSOProvider() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      name?: string;
      config?: Record<string, unknown>;
      is_active?: boolean;
    }) => api.put<SSOProvider>(`/api/sso/providers/${id}`, body, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sso"] }),
  });
}

export function useDeleteSSOProvider() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/sso/providers/${id}`, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sso"] }),
  });
}

export function useTestSSOProvider() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ success: boolean; message: string }>(
        `/api/sso/providers/${id}/test`,
        {},
        token
      ),
  });
}
