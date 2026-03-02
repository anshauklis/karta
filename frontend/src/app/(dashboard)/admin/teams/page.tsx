"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useTeams,
  useCreateTeam,
  useDeleteTeam,
  useTeamMembers,
  useAddTeamMember,
  useRemoveTeamMember,
  useUpdateTeamMemberRole,
} from "@/hooks/use-teams";
import { useUsers } from "@/hooks/use-users";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  UserPlus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAM_ROLES = ["viewer", "editor", "admin", "owner"] as const;

const ROLE_BADGE_STYLES: Record<string, string> = {
  viewer: "bg-green-50 text-green-700 border-green-200",
  editor: "bg-blue-50 text-blue-700 border-blue-200",
  admin: "bg-red-50 text-red-700 border-red-200",
  owner: "bg-purple-50 text-purple-700 border-purple-200",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Create Team Dialog
// ---------------------------------------------------------------------------

function CreateTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createTeam = useCreateTeam();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createTeam.mutateAsync({ name, description });
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTeam")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">{t("name")}</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineering"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-desc">{t("teamDescription")}</Label>
            <Input
              id="team-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Backend and frontend engineers"
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={createTeam.isPending}>
              {createTeam.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {tc("create")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Add Member Dialog
// ---------------------------------------------------------------------------

function AddMemberDialog({
  teamId,
  open,
  onOpenChange,
}: {
  teamId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("viewer");
  const { data: allUsers } = useUsers();
  const addMember = useAddTeamMember();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    await addMember.mutateAsync({
      teamId,
      userId: Number(selectedUserId),
      role: selectedRole,
    });
    setSelectedUserId("");
    setSelectedRole("viewer");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addMember")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("selectUser")}</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectUser")} />
              </SelectTrigger>
              <SelectContent>
                {allUsers?.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("selectRole")}</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectRole")} />
              </SelectTrigger>
              <SelectContent>
                {TEAM_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`roles.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={addMember.isPending || !selectedUserId}>
              {addMember.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {tc("add")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Team Members Panel (expanded row)
// ---------------------------------------------------------------------------

function TeamMembersPanel({ teamId }: { teamId: number }) {
  const t = useTranslations("teams");
  const [showAddMember, setShowAddMember] = useState(false);
  const { data: members, isLoading } = useTeamMembers(teamId);
  const removeMember = useRemoveTeamMember();
  const updateRole = useUpdateTeamMemberRole();
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="px-4 py-3">
        <Skeleton className="h-8 w-full rounded" />
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-700">
          {t("members")} ({members?.length ?? 0})
        </h4>
        <Button size="sm" variant="outline" onClick={() => setShowAddMember(true)}>
          <UserPlus className="mr-1 h-3 w-3" />
          {t("addMember")}
        </Button>
      </div>

      {members && members.length > 0 ? (
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pb-2 text-left text-xs font-medium uppercase text-slate-400">
                {t("name")}
              </th>
              <th className="pb-2 text-left text-xs font-medium uppercase text-slate-400">
                {t("role")}
              </th>
              <th className="pb-2 text-right text-xs font-medium uppercase text-slate-400" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-slate-100 last:border-b-0">
                <td className="py-2 text-sm text-slate-700">
                  {member.user_name ?? "Unknown"}{" "}
                  <span className="text-slate-400">{member.user_email}</span>
                </td>
                <td className="py-2">
                  <Select
                    value={member.role}
                    onValueChange={(role) =>
                      updateRole.mutate({
                        teamId,
                        userId: member.user_id,
                        role,
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEAM_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`roles.${role}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-2 text-right">
                  {confirmRemoveId === member.user_id ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        disabled={removeMember.isPending}
                        onClick={() => {
                          removeMember.mutate({ teamId, userId: member.user_id });
                          setConfirmRemoveId(null);
                        }}
                      >
                        {removeMember.isPending && (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        {t("removeMember")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setConfirmRemoveId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setConfirmRemoveId(member.user_id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-400">{t("noTeams")}</p>
      )}

      <AddMemberDialog
        teamId={teamId}
        open={showAddMember}
        onOpenChange={setShowAddMember}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminTeamsPage() {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const { data: teams, isLoading } = useTeams();
  const deleteTeam = useDeleteTeam();

  const [showCreate, setShowCreate] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // --- Loading state -------------------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-44 rounded" />
          <Skeleton className="h-9 w-32 rounded" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  // --- Page ----------------------------------------------------------------
  return (
    <div>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t("createTeam")}
        </Button>
      </div>
      <p className="mb-6 text-sm text-slate-500">{t("description")}</p>

      <CreateTeamDialog open={showCreate} onOpenChange={setShowCreate} />

      {/* Team list */}
      {teams && teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="mb-4 h-16 w-16 text-slate-300" />
          <h2 className="mb-2 text-lg font-medium text-slate-600">
            {t("noTeams")}
          </h2>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("createTeam")}
          </Button>
        </div>
      ) : teams && teams.length > 0 ? (
        <Card className="border-slate-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("name")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("teamDescription")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("memberCount")}
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 sm:table-cell">
                  {t("created")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400" />
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const isExpanded = expandedTeamId === team.id;
                return (
                  <tr key={team.id} className="group">
                    <td colSpan={6} className="p-0">
                      <div
                        className="flex cursor-pointer items-center border-b border-slate-100"
                        onClick={() =>
                          setExpandedTeamId(isExpanded ? null : team.id)
                        }
                      >
                        <td className="w-8 px-4 py-3 text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">
                          {team.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {team.description || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-xs">
                            {team.member_count ?? 0}
                          </Badge>
                        </td>
                        <td className="hidden px-4 py-3 text-sm text-slate-400 sm:table-cell">
                          {team.created_at ? formatDate(team.created_at) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {confirmDeleteId === team.id ? (
                            <div
                              className="flex items-center justify-end gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 text-xs"
                                disabled={deleteTeam.isPending}
                                onClick={() => {
                                  deleteTeam.mutate(team.id);
                                  setConfirmDeleteId(null);
                                  if (isExpanded) setExpandedTeamId(null);
                                }}
                              >
                                {deleteTeam.isPending && (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                )}
                                {tc("confirm")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                {tc("cancel")}
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(team.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </div>
                      {isExpanded && <TeamMembersPanel teamId={team.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
