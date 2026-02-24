"use client";

import { useSession } from "next-auth/react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SQLResult } from "@/types";

export function useExecuteSQL() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useMutation({
    mutationFn: (data: { connection_id: number; sql: string; limit?: number }) =>
      api.post<SQLResult>("/api/sql/execute", data, token),
  });
}
