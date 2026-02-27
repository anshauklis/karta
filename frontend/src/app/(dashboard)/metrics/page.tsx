"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useSemanticModels,
  useDeleteSemanticModel,
} from "@/hooks/use-semantic";
import { useConnections } from "@/hooks/use-connections";
import { useRoles } from "@/hooks/use-roles";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Plus, Layers, Trash2, Pencil, Loader2 } from "lucide-react";
import { ModelEditor } from "@/components/metrics/model-editor";
import type { SemanticModel } from "@/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MetricsPage() {
  const t = useTranslations("metrics");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const { canEdit } = useRoles();

  const [connectionFilter, setConnectionFilter] = useState<string>("_all_");
  const filterConnId =
    connectionFilter !== "_all_" ? Number(connectionFilter) : undefined;

  const { data: models, isLoading: modelsLoading } =
    useSemanticModels(filterConnId);
  const { data: connections } = useConnections();
  const deleteModel = useDeleteSemanticModel();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SemanticModel | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Build connection lookup
  const connectionMap = new Map(
    (connections ?? []).map((c) => [c.id, c.name])
  );

  const handleOpenCreate = () => {
    setEditingModelId(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (model: SemanticModel) => {
    setEditingModelId(model.id);
    setEditorOpen(true);
  };

  const handleDelete = (model: SemanticModel) => {
    setDeleteTarget(model);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteTarget(null);
    setDeletingId(deleteTarget.id);
    try {
      await deleteModel.mutateAsync(deleteTarget.id);
    } finally {
      setDeletingId(null);
    }
  };

  // Loading skeleton
  if (modelsLoading) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {tn("metrics")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("description")}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t("newModel")}
          </Button>
        )}
      </div>

      {/* Connection filter */}
      {(connections ?? []).length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <Select value={connectionFilter} onValueChange={setConnectionFilter}>
            <SelectTrigger className="w-[200px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all_">{t("allConnections")}</SelectItem>
              {(connections ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Empty state */}
      {models && models.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Layers className="mb-4 h-16 w-16 text-muted-foreground/30" />
          <h2 className="mb-2 text-lg font-medium text-muted-foreground">
            {t("noModels")}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("createFirstHint")}
          </p>
          {canEdit && (
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-1 h-4 w-4" />
              {t("newModel")}
            </Button>
          )}
        </div>
      ) : (
        /* Models table */
        models &&
        models.length > 0 && (
          <Card>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">{t("name")}</TableHead>
                    <TableHead>{t("connection")}</TableHead>
                    <TableHead className="hidden md:table-cell">
                      {t("sourceType")}
                    </TableHead>
                    <TableHead className="w-[100px] text-center">
                      {t("measures")}
                    </TableHead>
                    <TableHead className="w-[100px] text-center">
                      {t("dimensions")}
                    </TableHead>
                    <TableHead className="hidden sm:table-cell w-[120px]">
                      {t("updated")}
                    </TableHead>
                    <TableHead className="w-[100px] text-right">
                      {t("actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell
                        className="font-medium cursor-pointer hover:text-primary hover:underline"
                        onClick={() => handleOpenEdit(m)}
                      >
                        <span className="flex items-center gap-2">
                          {m.name}
                        </span>
                        {m.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {m.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {connectionMap.get(m.connection_id) ?? t("unknown")}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        <Badge
                          variant={
                            m.source_type === "table" ? "default" : "secondary"
                          }
                          className="text-[10px] px-1.5 py-0"
                        >
                          {m.source_type === "table"
                            ? t("table")
                            : t("customSql")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {m.measures?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {m.dimensions?.length ?? 0}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {formatDate(m.updated_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(m)}
                            title={tc("edit")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(m)}
                            disabled={deletingId === m.id}
                            title={tc("delete")}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {deletingId === m.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )
      )}

      {/* Model editor dialog */}
      <ModelEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        modelId={editingModelId}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("areYouSure")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
