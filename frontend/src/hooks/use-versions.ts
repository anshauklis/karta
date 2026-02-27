import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";

type SessionWithToken = { accessToken?: string } | null;

interface VersionListItem {
  id: number;
  dashboard_id: number;
  version_number: number;
  label: string;
  is_auto: boolean;
  created_by: number | null;
  created_at: string;
}

interface VersionDetail extends VersionListItem {
  snapshot: Record<string, unknown>;
}

export function useDashboardVersions(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["dashboard-versions", dashboardId],
    queryFn: () =>
      api.get<VersionListItem[]>(
        `/api/dashboards/${dashboardId}/versions`,
        token
      ),
    enabled: !!token && !!dashboardId,
    staleTime: 30_000,
  });
}

export function useVersionDetail(
  dashboardId: number | undefined,
  versionId: number | null
) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["dashboard-version-detail", dashboardId, versionId],
    queryFn: () =>
      api.get<VersionDetail>(
        `/api/dashboards/${dashboardId}/versions/${versionId}`,
        token
      ),
    enabled: !!token && !!dashboardId && versionId !== null,
  });
}

export function useCreateVersion() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dashboardId,
      label,
    }: {
      dashboardId: number;
      label: string;
    }) =>
      api.post<VersionListItem>(
        `/api/dashboards/${dashboardId}/versions`,
        { label },
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-versions", variables.dashboardId],
      });
    },
  });
}

export function useRestoreVersion() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dashboardId,
      versionId,
    }: {
      dashboardId: number;
      versionId: number;
    }) =>
      api.post(
        `/api/dashboards/${dashboardId}/versions/${versionId}/restore`,
        {},
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-versions", variables.dashboardId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", "slug"],
      });
      queryClient.invalidateQueries({
        queryKey: ["charts", variables.dashboardId],
      });
    },
  });
}

export function useUpdateVersionLabel() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dashboardId,
      versionId,
      label,
    }: {
      dashboardId: number;
      versionId: number;
      label: string;
    }) =>
      api.put<VersionListItem>(
        `/api/dashboards/${dashboardId}/versions/${versionId}`,
        { label },
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-versions", variables.dashboardId],
      });
    },
  });
}

export function useDeleteVersion() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dashboardId,
      versionId,
    }: {
      dashboardId: number;
      versionId: number;
    }) =>
      api.delete(
        `/api/dashboards/${dashboardId}/versions/${versionId}`,
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-versions", variables.dashboardId],
      });
    },
  });
}
