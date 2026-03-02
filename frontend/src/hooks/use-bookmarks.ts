"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Bookmark, BookmarkCreate } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function useBookmarks(dashboardId: number | null) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["bookmarks", dashboardId],
    queryFn: () => api.get<Bookmark[]>(`/api/dashboards/${dashboardId}/bookmarks`, token),
    enabled: !!token && !!dashboardId,
  });
}

export function useCreateBookmark(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BookmarkCreate) =>
      api.post<Bookmark>(`/api/dashboards/${dashboardId}/bookmarks`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks", dashboardId] });
      toast.success("View saved");
    },
    onError: () => toast.error("Failed to save view"),
  });
}

export function useDeleteBookmark(dashboardId: number) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/bookmarks/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks", dashboardId] });
      toast.success("Bookmark removed");
    },
    onError: () => toast.error("Failed to delete bookmark"),
  });
}
