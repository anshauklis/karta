"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "next-auth/react";

type SessionWithToken = { accessToken?: string } | null;

export interface WhitelabelSettings {
  app_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  accent_color: string;
  custom_css: string;
}

export function useWhitelabelSettings() {
  return useQuery({
    queryKey: ["whitelabel"],
    queryFn: () => api.get<WhitelabelSettings>("/api/tenant/settings"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateWhitelabel() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<WhitelabelSettings>) =>
      api.put<WhitelabelSettings>("/api/tenant/settings", body, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whitelabel"] }),
  });
}

export function useUploadLogo() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<{ url: string }>("/api/tenant/logo", formData, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whitelabel"] }),
  });
}

export function useUploadFavicon() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<{ url: string }>(
        "/api/tenant/favicon",
        formData,
        token,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whitelabel"] }),
  });
}
