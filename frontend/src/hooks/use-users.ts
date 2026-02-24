"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { User, UserCreate, UserUpdate, DashboardOwner } from "@/types";

export function useUsersBasic() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["users-basic"],
    queryFn: () => api.get<DashboardOwner[]>("/api/users/list", token),
    enabled: !!token,
  });
}

export function useUsers() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/api/admin/users", token),
    enabled: !!token,
  });
}

export function useCreateUser() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UserCreate) =>
      api.post<User>("/api/admin/users", data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User created");
    },
  });
}

export function useUpdateUser() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: UserUpdate }) =>
      api.put<User>(`/api/admin/users/${userId}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated");
    },
  });
}

export function useDeleteUser() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: number) =>
      api.delete(`/api/admin/users/${userId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted");
    },
  });
}

export function useUpdateUserRoles() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roles }: { userId: number; roles: string[] }) =>
      api.put<User>(`/api/admin/users/${userId}/roles`, { roles }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Roles updated");
    },
  });
}
