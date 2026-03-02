"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

type SessionWithToken = { accessToken?: string } | null;

interface BillingStatus {
  tier: string;
  status: string;
  subscription_id: string | null;
  period_end: string | null;
}

export function useBillingStatus() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => api.get<BillingStatus>("/api/billing/status", token),
    enabled: !!token,
  });
}

export function useCheckout() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useMutation({
    mutationFn: (tier: string) =>
      api.post<{ url: string }>("/api/billing/checkout", { tier }, token),
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });
}

export function useBillingPortal() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  return useMutation({
    mutationFn: () =>
      api.post<{ url: string }>("/api/billing/portal", {}, token),
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });
}
