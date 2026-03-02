"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ChangeHistoryItem } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function useEntityHistory(entityType: string | null, entityId: number | null) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["history", entityType, entityId],
    queryFn: () => api.get<ChangeHistoryItem[]>(`/api/history/${entityType}/${entityId}`, token),
    enabled: !!token && !!entityType && !!entityId,
  });
}
