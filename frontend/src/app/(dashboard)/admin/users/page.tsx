"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useUpdateUserRoles,
} from "@/hooks/use-users";
import type { User, UserCreate, UserUpdate } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_ROLES = ["admin", "editor", "viewer", "sql_lab"] as const;

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: "bg-red-50 text-red-700 border-red-200",
  editor: "bg-blue-50 text-blue-700 border-blue-200",
  viewer: "bg-green-50 text-green-700 border-green-200",
  sql_lab: "bg-purple-50 text-purple-700 border-purple-200",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Role Checkbox Group
// ---------------------------------------------------------------------------

function RoleCheckboxGroup({
  roles,
  onChange,
  idPrefix,
}: {
  roles: string[];
  onChange: (roles: string[]) => void;
  idPrefix: string;
}) {
  const tr = useTranslations("roles");

  const toggle = (role: string) => {
    if (roles.includes(role)) {
      onChange(roles.filter((r) => r !== role));
    } else {
      onChange([...roles, role]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      {ALL_ROLES.map((role) => (
        <div key={role} className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-${role}`}
            checked={roles.includes(role)}
            onCheckedChange={() => toggle(role)}
          />
          <Label htmlFor={`${idPrefix}-${role}`} className="cursor-pointer text-sm">
            {tr(role)}
          </Label>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite / Create User Form
// ---------------------------------------------------------------------------

const INITIAL_CREATE_FORM: UserCreate = {
  name: "",
  email: "",
  password: "",
  is_admin: false,
  groups: "",
};

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tr = useTranslations("roles");
  const [form, setForm] = useState<UserCreate>({ ...INITIAL_CREATE_FORM });
  const [newUserRoles, setNewUserRoles] = useState<string[]>(["viewer"]);
  const [error, setError] = useState<string | null>(null);
  const createUser = useCreateUser();
  const updateUserRoles = useUpdateUserRoles();

  const patch = (partial: Partial<UserCreate>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createUser.mutateAsync({
        ...form,
        is_admin: newUserRoles.includes("admin"),
        roles: newUserRoles,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("failedToCreate"));
    }
  };

  return (
    <Card className="mb-6 border-slate-200 p-6">
      <h3 className="mb-4 text-base font-semibold text-slate-900">
        {t("inviteUser")}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="create-name">{t("name")}</Label>
            <Input
              id="create-name"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="John Doe"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-email">{t("email")}</Label>
            <Input
              id="create-email"
              type="email"
              value={form.email}
              onChange={(e) => patch({ email: e.target.value })}
              placeholder="john@example.com"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-password">{t("password")}</Label>
          <Input
            id="create-password"
            type="password"
            value={form.password}
            onChange={(e) => patch({ password: e.target.value })}
            placeholder="••••••••"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>{tr("roles")}</Label>
          <RoleCheckboxGroup
            roles={newUserRoles}
            onChange={setNewUserRoles}
            idPrefix="create-role"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="create-groups">{t("groups")}</Label>
          <Input
            id="create-groups"
            value={form.groups ?? ""}
            onChange={(e) => patch({ groups: e.target.value })}
            placeholder="analysts, finance"
          />
          <p className="text-xs text-slate-400">{t("groupsHint")}</p>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={createUser.isPending || updateUserRoles.isPending}>
            {(createUser.isPending || updateUserRoles.isPending) ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            {t("createUser")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Edit User Form (inline)
// ---------------------------------------------------------------------------

interface EditFormData {
  name: string;
  email: string;
  password: string;
  groups: string;
}

function EditUserForm({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tr = useTranslations("roles");
  const [form, setForm] = useState<EditFormData>({
    name: user.name,
    email: user.email,
    password: "",
    groups: user.groups || "",
  });
  const [editRoles, setEditRoles] = useState<string[]>(user.roles || []);
  const [error, setError] = useState<string | null>(null);
  const updateUser = useUpdateUser();
  const updateUserRoles = useUpdateUserRoles();

  const patch = (partial: Partial<EditFormData>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const data: UserUpdate = {};
    if (form.name !== user.name) data.name = form.name;
    if (form.email !== user.email) data.email = form.email;
    if (form.password) data.password = form.password;
    if (form.groups !== (user.groups || "")) data.groups = form.groups;

    const rolesChanged = JSON.stringify([...editRoles].sort()) !== JSON.stringify([...(user.roles || [])].sort());

    if (Object.keys(data).length === 0 && !rolesChanged) {
      onClose();
      return;
    }

    try {
      if (Object.keys(data).length > 0) {
        await updateUser.mutateAsync({ userId: user.id, data });
      }
      if (rolesChanged) {
        await updateUserRoles.mutateAsync({ userId: user.id, roles: editRoles });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("failedToUpdate"));
    }
  };

  return (
    <tr>
      <td colSpan={5} className="px-4 py-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`edit-name-${user.id}`}>{t("name")}</Label>
              <Input
                id={`edit-name-${user.id}`}
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="John Doe"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-email-${user.id}`}>{t("email")}</Label>
              <Input
                id={`edit-email-${user.id}`}
                type="email"
                value={form.email}
                onChange={(e) => patch({ email: e.target.value })}
                placeholder="john@example.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`edit-password-${user.id}`}>
              {t("password")}{" "}
              <span className="text-xs text-slate-400">{t("passwordHint")}</span>
            </Label>
            <Input
              id={`edit-password-${user.id}`}
              type="password"
              value={form.password}
              onChange={(e) => patch({ password: e.target.value })}
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-2">
            <Label>{tr("roles")}</Label>
            <RoleCheckboxGroup
              roles={editRoles}
              onChange={setEditRoles}
              idPrefix={`edit-role-${user.id}`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`edit-groups-${user.id}`}>{t("groups")}</Label>
            <Input
              id={`edit-groups-${user.id}`}
              value={form.groups}
              onChange={(e) => patch({ groups: e.target.value })}
              placeholder="analysts, finance"
            />
            <p className="text-xs text-slate-400">{t("groupsHint")}</p>
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={updateUser.isPending || updateUserRoles.isPending}>
              {(updateUser.isPending || updateUserRoles.isPending) ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="mr-1 h-4 w-4" />
              )}
              {t("saveChanges")}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              {tc("cancel")}
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// User Row
// ---------------------------------------------------------------------------

function UserRow({
  user,
  isSelf,
  editingId,
  setEditingId,
}: {
  user: User;
  isSelf: boolean;
  editingId: number | null;
  setEditingId: (id: number | null) => void;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tr = useTranslations("roles");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteUser = useDeleteUser();

  const handleDelete = async () => {
    await deleteUser.mutateAsync(user.id);
    setConfirmDelete(false);
  };

  const isEditing = editingId === user.id;

  if (isEditing) {
    return (
      <EditUserForm user={user} onClose={() => setEditingId(null)} />
    );
  }

  const userRoles = user.roles || [];

  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      {/* Avatar + Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
            {getInitials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {user.name}
              {isSelf && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {t("you")}
                </span>
              )}
            </p>
          </div>
        </div>
      </td>

      {/* Email */}
      <td className="px-4 py-3">
        <p className="truncate text-sm text-slate-500">{user.email}</p>
      </td>

      {/* Roles */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {userRoles.length > 0 ? (
            userRoles.map((role) => (
              <Badge
                key={role}
                variant="outline"
                className={`text-xs ${ROLE_BADGE_STYLES[role] || ""}`}
              >
                {role === "admin" && <Shield className="mr-1 h-3 w-3" />}
                {tr(role)}
              </Badge>
            ))
          ) : (
            <Badge variant="secondary" className="text-slate-500">
              {t("member")}
            </Badge>
          )}
          {user.groups && user.groups.split(",").filter(g => g.trim()).map((g) => (
            <Badge key={g.trim()} variant="outline" className="text-xs">
              {g.trim()}
            </Badge>
          ))}
        </div>
      </td>

      {/* Created */}
      <td className="hidden px-4 py-3 sm:table-cell">
        <p className="text-sm text-slate-400">{formatDate(user.created_at)}</p>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingId(user.id)}
            className="h-8 text-xs"
          >
            <Pencil className="h-3 w-3" />
          </Button>

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteUser.isPending}
                className="h-8 text-xs"
              >
                {deleteUser.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                {tc("confirm")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                className="h-8 text-xs"
              >
                {tc("cancel")}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmDelete(true)}
              disabled={isSelf}
              className="h-8 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 disabled:text-slate-300"
              title={isSelf ? t("cannotDeleteSelf") : t("deleteUser")}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function AdminUsersPage() {
  const t = useTranslations("admin");
  const { data: session } = useSession();
  const currentEmail = (session as { user?: { email?: string } } | null)?.user?.email;

  const { data: users, isLoading } = useUsers();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{t("userManagement")}</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t("inviteUser")}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateUserForm onClose={() => setShowCreate(false)} />
      )}

      {/* User list */}
      {users && users.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="mb-4 h-16 w-16 text-slate-300" />
          <h2 className="mb-2 text-lg font-medium text-slate-600">
            {t("noUsersYet")}
          </h2>
          <p className="mb-4 text-sm text-slate-400">
            {t("inviteFirstDesc")}
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("inviteFirstUser")}
          </Button>
        </div>
      ) : users && users.length > 0 ? (
        <Card className="border-slate-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("name")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("email")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("role")}
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 sm:table-cell">
                  {t("created")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSelf={user.email === currentEmail}
                  editingId={editingId}
                  setEditingId={setEditingId}
                />
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
