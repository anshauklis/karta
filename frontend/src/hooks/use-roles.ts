"use client";

import { useSession } from "next-auth/react";

export function useRoles() {
  const { data: session } = useSession();
  const roles: string[] = (session as any)?.user?.roles || [];

  return {
    roles,
    isAdmin: roles.includes("admin"),
    isEditor: roles.includes("editor"),
    isViewer: roles.includes("viewer") && !roles.includes("editor"),
    canEdit: roles.includes("editor") || roles.includes("admin"),
    canSqlLab: roles.includes("sql_lab") || roles.includes("editor") || roles.includes("admin"),
  };
}
