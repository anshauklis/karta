"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, Save, Trash2, Pencil, Check, X } from "lucide-react";
import {
  useDashboardVersions,
  useCreateVersion,
  useRestoreVersion,
  useUpdateVersionLabel,
  useDeleteVersion,
} from "@/hooks/use-versions";

interface VersionHistoryPanelProps {
  dashboardId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
}

export function VersionHistoryPanel({
  dashboardId,
  open,
  onOpenChange,
  onRestored,
}: VersionHistoryPanelProps) {
  const t = useTranslations("versions");
  const { data: versions, isLoading } = useDashboardVersions(
    open ? dashboardId : undefined
  );
  const createVersion = useCreateVersion();
  const restoreVersion = useRestoreVersion();
  const updateLabel = useUpdateVersionLabel();
  const deleteVersion = useDeleteVersion();

  const [newLabel, setNewLabel] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const handleSaveVersion = useCallback(() => {
    createVersion.mutate(
      { dashboardId, label: newLabel || "" },
      {
        onSuccess: () => {
          toast.success(t("versionSaved"));
          setNewLabel("");
        },
      }
    );
  }, [createVersion, dashboardId, newLabel, t]);

  const handleRestore = useCallback(() => {
    if (restoreTarget === null) return;
    restoreVersion.mutate(
      { dashboardId, versionId: restoreTarget },
      {
        onSuccess: () => {
          toast.success(t("restored"));
          setRestoreTarget(null);
          onRestored();
        },
      }
    );
  }, [restoreVersion, dashboardId, restoreTarget, t, onRestored]);

  const handleSaveLabel = useCallback(
    (versionId: number) => {
      updateLabel.mutate(
        { dashboardId, versionId, label: editLabel },
        {
          onSuccess: () => {
            toast.success(t("labelUpdated"));
            setEditingId(null);
          },
        }
      );
    },
    [updateLabel, dashboardId, editLabel, t]
  );

  const handleDelete = useCallback(
    (versionId: number) => {
      deleteVersion.mutate(
        { dashboardId, versionId },
        {
          onSuccess: () => {
            toast.success(t("versionDeleted"));
          },
        }
      );
    },
    [deleteVersion, dashboardId, t]
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:w-[440px] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="text-sm">{t("title")}</SheetTitle>
          </SheetHeader>

          {/* Save version */}
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <Input
              placeholder={t("labelPlaceholder")}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveVersion();
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveVersion}
              disabled={createVersion.isPending}
              className="h-8 shrink-0"
            >
              {createVersion.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" />
              )}
              {t("saveVersion")}
            </Button>
          </div>

          {/* Version list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !versions || versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <p className="text-sm text-muted-foreground">
                  {t("noVersions")}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="px-4 py-3 hover:bg-muted/50 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${
                              v.is_auto
                                ? "bg-muted text-muted-foreground"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {v.is_auto ? t("autoLabel") : t("manualLabel")}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            v{v.version_number}
                          </span>
                        </div>

                        {editingId === v.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              className="h-6 text-xs"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveLabel(v.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveLabel(v.id)}
                              className="rounded p-0.5 hover:bg-muted"
                            >
                              <Check className="h-3 w-3 text-primary" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded p-0.5 hover:bg-muted"
                            >
                              <X className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs truncate">
                              {v.label || (
                                <span className="italic text-muted-foreground">
                                  {t("noLabel")}
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => {
                                setEditingId(v.id);
                                setEditLabel(v.label);
                              }}
                              className="rounded p-0.5 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </div>
                        )}

                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(v.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => setRestoreTarget(v.id)}
                          className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                          title={t("restore")}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-destructive"
                          title={t("delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Restore confirmation */}
      <AlertDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("restoreConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("restoreDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={restoreVersion.isPending}
            >
              {restoreVersion.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
              )}
              {t("restore")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
