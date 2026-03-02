"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type SessionWithToken = { accessToken?: string } | null;

interface FavoriteEntry {
  entity_type: string;
  entity_id: number;
}

export interface FavoriteItem {
  type: "dashboard";
  id: number;
  label: string;
  slug: string;
  icon: string;
}

export function useFavorites() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const qc = useQueryClient();

  const { data: entries = [] } = useQuery({
    queryKey: ["favorites"],
    queryFn: () => api.get<FavoriteEntry[]>("/api/favorites", token),
    enabled: !!token,
  });

  const toggle = useMutation({
    mutationFn: (body: { entity_type: string; entity_id: number }) =>
      api.post<{ favorited: boolean }>("/api/favorites/toggle", body, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const toggleFavorite = (item: FavoriteItem) => {
    toggle.mutate({ entity_type: item.type, entity_id: item.id });
  };

  const isFavorite = (type: string, id: number) =>
    entries.some((f) => f.entity_type === type && f.entity_id === id);

  return { favorites: entries, toggleFavorite, isFavorite };
}
