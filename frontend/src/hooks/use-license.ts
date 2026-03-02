"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LicenseInfo } from "@/types";

type SessionWithToken = { accessToken?: string } | null;

export function useLicense() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["license"],
    queryFn: () => api.get<LicenseInfo>("/api/license", token),
    enabled: !!token,
    staleTime: Infinity,
  });
}

export function useHasFeature(feature: string): boolean {
  const { data } = useLicense();
  return data?.features?.includes(feature) ?? false;
}
