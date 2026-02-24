import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { SharedLink } from "@/types";

export function useShareLinks(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  return useQuery({
    queryKey: ["share-links", dashboardId],
    queryFn: () => api.get<SharedLink[]>(`/api/dashboards/${dashboardId}/shares`, token),
    enabled: !!dashboardId && !!token,
  });
}

export function useCreateShareLink(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { expires_in_hours?: number }) =>
      api.post<SharedLink>(`/api/dashboards/${dashboardId}/share`, body, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["share-links", dashboardId] });
      toast.success("Share link created");
    },
    onError: () => toast.error("Failed to create share link"),
  });
}

export function useRevokeShareLink(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: number) => api.delete(`/api/shares/${linkId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["share-links", dashboardId] });
      toast.success("Share link revoked");
    },
    onError: () => toast.error("Failed to revoke link"),
  });
}

// ── Import / Export ──────────────────────────────────────────────────

export interface ImportPreviewConnection {
  _ref: string;
  exported: {
    name: string;
    db_type: string;
    host: string;
    database_name: string;
  };
  status: "matched" | "unmatched";
  matched_connection_id: number | null;
  matched_connection_name: string | null;
}

export interface ImportPreviewResponse {
  dashboard: {
    title: string;
    description: string;
    icon: string;
    chart_count: number;
    tab_count: number;
    filter_count: number;
  };
  connections: ImportPreviewConnection[];
  available_connections: { id: number; name: string; db_type: string }[];
}

export function useImportPreview() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<ImportPreviewResponse>("/api/dashboards/import", data, token),
  });
}

export function useImportConfirm() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      data: Record<string, unknown>;
      connection_mapping: Record<string, number>;
    }) =>
      api.post<{ id: number; url_slug: string }>(
        "/api/dashboards/import/confirm",
        body,
        token,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      toast.success("Dashboard imported successfully");
    },
    onError: () => {
      toast.error("Import failed");
    },
  });
}
