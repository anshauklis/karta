"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { NotificationChannel, ChannelCreate, ChannelUpdate } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function useChannels() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["channels"],
    queryFn: () => api.get<NotificationChannel[]>("/api/channels", token),
    enabled: !!token,
  });
}

export function useCreateChannel() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ChannelCreate) =>
      api.post<NotificationChannel>("/api/channels", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel created");
    },
  });
}

export function useUpdateChannel() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ChannelUpdate }) =>
      api.put<NotificationChannel>(`/api/channels/${id}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel updated");
    },
  });
}

export function useDeleteChannel() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/channels/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success("Channel deleted");
    },
  });
}

export function useTestChannel() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ success: boolean; error?: string }>(`/api/channels/${id}/test`, {}, token),
  });
}
