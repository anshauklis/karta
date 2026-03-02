"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type SessionWithToken = { accessToken?: string } | null;

interface Team {
  id: number;
  name: string;
  description: string;
  created_at: string;
  member_count?: number;
}

interface TeamMember {
  id: number;
  user_id: number;
  team_id: number;
  role: string;
  user_name?: string;
  user_email?: string;
}

export function useTeams() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams", token),
    enabled: !!token,
  });
}

export function useTeamMembers(teamId: number | null) {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;

  return useQuery({
    queryKey: ["teams", teamId, "members"],
    queryFn: () => api.get<TeamMember[]>(`/api/teams/${teamId}/members`, token),
    enabled: !!token && !!teamId,
  });
}

export function useCreateTeam() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      api.post<Team>("/api/teams", body, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useUpdateTeam() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; description?: string }) =>
      api.put<Team>(`/api/teams/${id}`, body, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useDeleteTeam() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/teams/${id}`, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useAddTeamMember() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, userId, role }: { teamId: number; userId: number; role: string }) =>
      api.post(`/api/teams/${teamId}/members`, { user_id: userId, role }, token),
    onSuccess: (_, { teamId }) =>
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "members"] }),
  });
}

export function useUpdateTeamMemberRole() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, userId, role }: { teamId: number; userId: number; role: string }) =>
      api.put(`/api/teams/${teamId}/members/${userId}`, { role }, token),
    onSuccess: (_, { teamId }) =>
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "members"] }),
  });
}

export function useRemoveTeamMember() {
  const { data: session } = useSession();
  const token = (session as SessionWithToken)?.accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: number; userId: number }) =>
      api.delete(`/api/teams/${teamId}/members/${userId}`, token),
    onSuccess: (_, { teamId }) =>
      queryClient.invalidateQueries({ queryKey: ["teams", teamId, "members"] }),
  });
}

export type { Team, TeamMember };
