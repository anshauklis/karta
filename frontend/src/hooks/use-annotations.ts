import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Annotation, AnnotationCreate } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function useChartAnnotations(chartId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useQuery({
    queryKey: ["annotations", "chart", chartId],
    queryFn: () => api.get<Annotation[]>(`/api/charts/${chartId}/annotations`, token),
    enabled: !!chartId && !!token,
  });
}

export function useCreateChartAnnotation(chartId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AnnotationCreate) =>
      api.post<Annotation>(`/api/charts/${chartId}/annotations`, body, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", "chart", chartId] });
    },
    onError: () => toast.error("Failed to add comment"),
  });
}

export function useDashboardAnnotations(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useQuery({
    queryKey: ["annotations", "dashboard", dashboardId],
    queryFn: () => api.get<Annotation[]>(`/api/dashboards/${dashboardId}/annotations`, token),
    enabled: !!dashboardId && !!token,
  });
}

export function useCreateDashboardAnnotation(dashboardId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AnnotationCreate) =>
      api.post<Annotation>(`/api/dashboards/${dashboardId}/annotations`, body, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", "dashboard", dashboardId] });
    },
    onError: () => toast.error("Failed to add comment"),
  });
}

export function useDeleteAnnotation(entityType: "chart" | "dashboard", entityId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/annotations/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", entityType, entityId] });
    },
    onError: () => toast.error("Failed to delete comment"),
  });
}
