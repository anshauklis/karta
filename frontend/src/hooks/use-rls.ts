"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { RLSRule, RLSRuleCreate } from "@/types";

export function useRLSRules() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["rls-rules"],
    queryFn: () => api.get<RLSRule[]>("/api/rls", token),
    enabled: !!token,
  });
}

export function useCreateRLSRule() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RLSRuleCreate) => api.post<RLSRule>("/api/rls", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rls-rules"] });
      toast.success("RLS rule created");
    },
    onError: () => toast.error("Failed to create RLS rule"),
  });
}

export function useDeleteRLSRule() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/rls/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rls-rules"] });
      toast.success("RLS rule deleted");
    },
    onError: () => toast.error("Failed to delete RLS rule"),
  });
}
