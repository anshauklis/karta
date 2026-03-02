import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { Story, StoryDetail, StoryCreate, StorySlide, StorySlideCreate } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function useStories() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useQuery({
    queryKey: ["stories"],
    queryFn: () => api.get<Story[]>("/api/stories", token),
    enabled: !!token,
  });
}

export function useStory(id: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useQuery({
    queryKey: ["stories", id],
    queryFn: () => api.get<StoryDetail>(`/api/stories/${id}`, token),
    enabled: !!id && !!token,
  });
}

export function useCreateStory() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StoryCreate) => api.post<Story>("/api/stories", body, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      toast.success("Story created");
    },
    onError: () => toast.error("Failed to create story"),
  });
}

export function useUpdateStory(id: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<StoryCreate>) => api.put<Story>(`/api/stories/${id}`, body, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      queryClient.invalidateQueries({ queryKey: ["stories", id] });
      toast.success("Story updated");
    },
    onError: () => toast.error("Failed to update story"),
  });
}

export function useDeleteStory() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/stories/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      toast.success("Story deleted");
    },
    onError: () => toast.error("Failed to delete story"),
  });
}

export function useCreateSlide(storyId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StorySlideCreate) =>
      api.post<StorySlide>(`/api/stories/${storyId}/slides`, body, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories", storyId] });
    },
    onError: () => toast.error("Failed to add slide"),
  });
}

export function useUpdateSlide(storyId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slideId, data }: { slideId: number; data: Partial<StorySlideCreate & { slide_order: number }> }) =>
      api.put<StorySlide>(`/api/stories/slides/${slideId}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories", storyId] });
    },
    onError: () => toast.error("Failed to update slide"),
  });
}

export function useReorderSlides(storyId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: number; sort_order: number }[]) =>
      api.put(`/api/stories/${storyId}/slides/reorder`, { items }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories", storyId] });
    },
    onError: () => toast.error("Failed to reorder slides"),
  });
}

export function useDeleteSlide(storyId: number | undefined) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slideId: number) => api.delete(`/api/stories/slides/${slideId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories", storyId] });
    },
    onError: () => toast.error("Failed to delete slide"),
  });
}
