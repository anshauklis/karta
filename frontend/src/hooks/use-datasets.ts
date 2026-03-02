"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Dataset, DatasetCreate, DatasetUpdate, SQLResult } from "@/types";
import { toast } from "sonner";

type SessionWithToken = { accessToken?: string } | null;

export interface CSVPreviewResponse {
  temp_id: string;
  filename: string;
  columns: { name: string; type: string }[];
  rows: (string | number | boolean | null)[][];
  total_rows: number;
}

export interface CSVImportRequest {
  temp_id: string;
  table_name: string;
  dataset_name: string;
  description?: string;
}

export interface CSVImportResponse {
  dataset_id: number;
  connection_id: number;
  dataset_name: string;
  table_name: string;
  row_count: number;
}

export function useDatasets() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["datasets"],
    queryFn: () => api.get<Dataset[]>("/api/datasets", token),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
}

export function useCreateDataset() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DatasetCreate) =>
      api.post<Dataset>("/api/datasets", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}

export function useUpdateDataset() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DatasetUpdate }) =>
      api.put<Dataset>(`/api/datasets/${id}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      toast.success("Dataset updated");
    },
  });
}

export function useDeleteDataset() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/datasets/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}

export function useDatasetColumns(datasetId: number | null) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["dataset-columns", datasetId],
    queryFn: () =>
      api.get<{ columns: { name: string; type: string }[] }>(
        `/api/datasets/${datasetId}/columns`,
        token
      ),
    enabled: !!token && datasetId !== null,
    staleTime: 5 * 60_000,
  });
}

export function usePreviewDataset() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useMutation({
    mutationFn: (id: number) =>
      api.post<SQLResult>(`/api/datasets/${id}/preview`, {}, token),
  });
}

export function useCSVPreview() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<CSVPreviewResponse>("/api/csv/preview", formData, token);
    },
  });
}

export function useCSVImport() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CSVImportRequest) =>
      api.post<CSVImportResponse>("/api/csv/import", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}

export interface DbtPreviewModel {
  unique_id: string;
  name: string;
  schema: string;
  description: string;
  columns_count: number;
  columns: { name: string; description: string; data_type: string }[];
  tags: string[];
  materialized: string;
  exists_in_karta: boolean;
}

export interface DbtImportResult {
  imported: number;
  updated: number;
  skipped: number;
  datasets: { id: number; name: string; action: string }[];
}

export function usePreviewDbt() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useMutation({
    mutationFn: ({ file, connectionId }: { file: File; connectionId: number }) => {
      const formData = new FormData();
      formData.append("manifest", file);
      formData.append("connection_id", String(connectionId));
      return api.upload<{ models: DbtPreviewModel[] }>("/api/datasets/preview-dbt", formData, token);
    },
  });
}

export function useImportDbt() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      connectionId,
      selectedModels,
    }: {
      file: File;
      connectionId: number;
      selectedModels: string[];
    }) => {
      const formData = new FormData();
      formData.append("manifest", file);
      formData.append("connection_id", String(connectionId));
      formData.append("selected_models", JSON.stringify(selectedModels));
      return api.upload<DbtImportResult>("/api/datasets/import-dbt", formData, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
}
