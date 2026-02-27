import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api";
import type {
  SemanticModel,
  ModelMeasure,
  ModelDimension,
  ModelJoin,
  SemanticQueryResult,
} from "@/types";

// ===== Models ================================================================

export function useSemanticModels(connectionId?: number) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  const params = connectionId ? `?connection_id=${connectionId}` : "";

  return useQuery({
    queryKey: ["semantic-models", connectionId],
    queryFn: () =>
      api.get<SemanticModel[]>(`/api/semantic/models${params}`, token),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
}

export function useSemanticModel(modelId: number | null) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["semantic-model", modelId],
    queryFn: () =>
      api.get<SemanticModel>(`/api/semantic/models/${modelId}`, token),
    enabled: !!token && modelId !== null,
  });
}

export function useCreateSemanticModel() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<SemanticModel>) =>
      api.post<SemanticModel>("/api/semantic/models", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["semantic-models"] });
    },
  });
}

export function useUpdateSemanticModel() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SemanticModel> }) =>
      api.put<SemanticModel>(`/api/semantic/models/${id}`, data, token),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["semantic-models"] });
      queryClient.invalidateQueries({
        queryKey: ["semantic-model", variables.id],
      });
    },
  });
}

export function useDeleteSemanticModel() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/api/semantic/models/${id}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["semantic-models"] });
    },
  });
}

// ===== Measures ==============================================================

export function useCreateMeasure() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      modelId,
      ...data
    }: { modelId: number } & Partial<ModelMeasure>) =>
      api.post<ModelMeasure>(
        `/api/semantic/models/${modelId}/measures`,
        data,
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["semantic-model", variables.modelId],
      });
    },
  });
}

export function useUpdateMeasure() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      modelId,
      ...data
    }: { id: number; modelId: number } & Partial<ModelMeasure>) =>
      api.put<ModelMeasure>(`/api/semantic/measures/${id}`, data, token),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["semantic-model", variables.modelId],
      });
    },
  });
}

export function useDeleteMeasure() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: number; modelId: number }) =>
      api.delete(`/api/semantic/measures/${id}`, token),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["semantic-model", variables.modelId],
      });
    },
  });
}

// ===== Dimensions ============================================================

export function useCreateDimension() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      modelId,
      ...data
    }: { modelId: number } & Partial<ModelDimension>) =>
      api.post<ModelDimension>(
        `/api/semantic/models/${modelId}/dimensions`,
        data,
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["semantic-model", variables.modelId],
      });
    },
  });
}

export function useUpdateDimension() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      modelId,
      ...data
    }: { id: number; modelId: number } & Partial<ModelDimension>) =>
      api.put<ModelDimension>(`/api/semantic/dimensions/${id}`, data, token),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["semantic-model", variables.modelId],
      });
    },
  });
}

export function useDeleteDimension() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: number; modelId: number }) =>
      api.delete(`/api/semantic/dimensions/${id}`, token),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["semantic-model", variables.modelId],
      });
    },
  });
}

// ===== Joins =================================================================

export function useCreateJoin() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      modelId,
      ...data
    }: { modelId: number } & Partial<ModelJoin>) =>
      api.post<ModelJoin>(
        `/api/semantic/models/${modelId}/joins`,
        data,
        token
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["semantic-model", variables.modelId],
      });
    },
  });
}

export function useDeleteJoin() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: number; modelId: number }) =>
      api.delete(`/api/semantic/joins/${id}`, token),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["semantic-model", variables.modelId],
      });
    },
  });
}

// ===== Query =================================================================

export function useSemanticQuery() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useMutation({
    mutationFn: (data: {
      model_id: number;
      measures: string[];
      dimensions: string[];
      filters?: Array<{
        dimension: string;
        operator: string;
        value: string | string[];
      }>;
      order_by?: string;
      limit?: number;
    }) => api.post<SemanticQueryResult>("/api/semantic/query", data, token),
  });
}
