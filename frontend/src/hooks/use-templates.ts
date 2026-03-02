"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type SessionWithToken = { accessToken?: string } | null;

export interface ChartTemplate {
  id: string;
  name: string;
  chartType: string;
  config: Record<string, unknown>;
  createdAt: number;
}

interface ServerTemplate {
  id: number;
  name: string;
  chart_type: string;
  config: Record<string, unknown>;
  created_at: string;
}

function toClientTemplate(s: ServerTemplate): ChartTemplate {
  return {
    id: String(s.id),
    name: s.name,
    chartType: s.chart_type,
    config: s.config,
    createdAt: new Date(s.created_at).getTime(),
  };
}

export function useTemplates() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const qc = useQueryClient();

  const { data: raw = [] } = useQuery({
    queryKey: ["chart-templates"],
    queryFn: () => api.get<ServerTemplate[]>("/api/templates", token),
    enabled: !!token,
  });

  const templates = raw.map(toClientTemplate);

  const createMut = useMutation({
    mutationFn: (body: { name: string; chart_type: string; config: Record<string, unknown> }) =>
      api.post<ServerTemplate>("/api/templates", body, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-templates"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/templates/${id}`, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chart-templates"] }),
  });

  const addTemplate = (name: string, chartType: string, config: Record<string, unknown>) => {
    const cleanConfig = { ...config, x_column: "", y_columns: [], color_column: "" };
    createMut.mutate({ name, chart_type: chartType, config: cleanConfig });
    // Return a temporary template for immediate UI feedback
    return { id: `tpl_${Date.now()}`, name, chartType, config: cleanConfig, createdAt: Date.now() };
  };

  const removeTemplate = (id: string) => {
    deleteMut.mutate(parseInt(id));
  };

  return { templates, addTemplate, removeTemplate };
}
