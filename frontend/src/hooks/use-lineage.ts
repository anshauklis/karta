import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import type { LineageData } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function useLineage() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useQuery({
    queryKey: ["lineage"],
    queryFn: () => api.get<LineageData>("/api/lineage", token),
    enabled: !!token,
  });
}
