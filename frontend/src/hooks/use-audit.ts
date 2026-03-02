"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type SessionWithToken = { accessToken?: string } | null;

interface AuditEvent {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  resource_type: string;
  resource_id: number | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface AuditResponse {
  items: AuditEvent[];
  total: number;
  page: number;
  per_page: number;
}

interface AuditFilters {
  user_id?: number;
  action?: string;
  resource_type?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  per_page?: number;
}

export function useAuditLog(filters: AuditFilters = {}) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.set(key, String(value));
  });
  const qs = params.toString();

  return useQuery({
    queryKey: ["audit", filters],
    queryFn: () =>
      api.get<AuditResponse>(`/api/audit${qs ? `?${qs}` : ""}`, token),
    enabled: !!token,
  });
}

export function useAuditStats() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["audit-stats"],
    queryFn: () =>
      api.get<{ action: string; count: number }[]>("/api/audit/stats", token),
    enabled: !!token,
  });
}
