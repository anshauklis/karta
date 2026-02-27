"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useSemanticModel,
  useSemanticModels,
  useCreateSemanticModel,
  useUpdateSemanticModel,
  useCreateMeasure,
  useUpdateMeasure,
  useDeleteMeasure,
  useCreateDimension,
  useUpdateDimension,
  useDeleteDimension,
  useCreateJoin,
  useDeleteJoin,
} from "@/hooks/use-semantic";
import { useConnections } from "@/hooks/use-connections";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { MeasureForm } from "./measure-form";
import { DimensionForm } from "./dimension-form";
import { JoinEditor } from "./join-editor";
import type {
  SemanticModel,
  ModelMeasure,
  ModelDimension,
  ModelJoin,
  Connection,
} from "@/types";

// ---------------------------------------------------------------------------
// Public API — outer wrapper that handles data fetching + key-based remount
// ---------------------------------------------------------------------------

interface ModelEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: number | null;
}

export function ModelEditor({ open, onOpenChange, modelId }: ModelEditorProps) {
  const isEdit = modelId !== null;

  const { data: model, isLoading: modelLoading } = useSemanticModel(
    open && isEdit ? modelId : null
  );
  const { data: connections } = useConnections();
  const { data: allModels } = useSemanticModels();

  // Key forces full remount of form when we switch between models or create/edit
  const formKey = isEdit
    ? `edit-${modelId}-${model?.updated_at ?? "loading"}`
    : "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="gap-0 p-0 max-h-[90vh] flex flex-col">
        <ModelEditorForm
          key={formKey}
          onOpenChange={onOpenChange}
          modelId={modelId}
          isEdit={isEdit}
          model={model ?? null}
          modelLoading={modelLoading}
          connections={connections ?? []}
          allModels={allModels ?? []}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form — all local state initialised from props, no useEffect sync
// ---------------------------------------------------------------------------

interface ModelEditorFormProps {
  onOpenChange: (open: boolean) => void;
  modelId: number | null;
  isEdit: boolean;
  model: SemanticModel | null;
  modelLoading: boolean;
  connections: Connection[];
  allModels: SemanticModel[];
}

function ModelEditorForm({
  onOpenChange,
  modelId,
  isEdit,
  model,
  modelLoading,
  connections,
  allModels,
}: ModelEditorFormProps) {
  const t = useTranslations("metrics");
  const tc = useTranslations("common");

  const createModel = useCreateSemanticModel();
  const updateModel = useUpdateSemanticModel();
  const createMeasure = useCreateMeasure();
  const updateMeasure = useUpdateMeasure();
  const deleteMeasure = useDeleteMeasure();
  const createDimension = useCreateDimension();
  const updateDimension = useUpdateDimension();
  const deleteDimension = useDeleteDimension();
  const createJoin = useCreateJoin();
  const deleteJoin = useDeleteJoin();

  // Model fields — initialised from props (no effect needed thanks to key remount)
  const [name, setName] = useState(model?.name ?? "");
  const [description, setDescription] = useState(model?.description ?? "");
  const [connectionId, setConnectionId] = useState<string>(
    model ? String(model.connection_id) : "_none_"
  );
  const [sourceType, setSourceType] = useState<"table" | "sql">(
    model?.source_type ?? "table"
  );
  const [sourceTable, setSourceTable] = useState(model?.source_table ?? "");
  const [sourceSql, setSourceSql] = useState(model?.source_sql ?? "");

  // Sub-entity editing state
  const [activeTab, setActiveTab] = useState("measures");
  const [editingMeasure, setEditingMeasure] = useState<ModelMeasure | null>(
    null
  );
  const [addingMeasure, setAddingMeasure] = useState(false);
  const [editingDimension, setEditingDimension] =
    useState<ModelDimension | null>(null);
  const [addingDimension, setAddingDimension] = useState(false);
  const [addingJoin, setAddingJoin] = useState(false);

  const measures = model?.measures ?? [];
  const dimensions = model?.dimensions ?? [];
  const joins = model?.joins ?? [];

  const canSubmitModel =
    !!name.trim() &&
    connectionId !== "_none_" &&
    (sourceType === "table" ? !!sourceTable.trim() : !!sourceSql.trim());

  const isSavingModel = createModel.isPending || updateModel.isPending;

  // ---- Model save ----
  const handleSaveModel = async () => {
    if (!canSubmitModel) return;
    const payload = {
      name: name.trim(),
      description: description.trim(),
      connection_id: Number(connectionId),
      source_type: sourceType,
      source_table: sourceType === "table" ? sourceTable.trim() : null,
      source_sql: sourceType === "sql" ? sourceSql.trim() : null,
    };
    try {
      if (isEdit && modelId) {
        await updateModel.mutateAsync({ id: modelId, data: payload });
        toast.success("Model updated");
      } else {
        await createModel.mutateAsync(payload);
        toast.success("Model created");
        onOpenChange(false);
      }
    } catch {
      // error toast handled by api.ts
    }
  };

  // ---- Measure handlers ----
  const handleSaveMeasure = async (data: Partial<ModelMeasure>) => {
    if (!modelId) return;
    try {
      if (editingMeasure) {
        await updateMeasure.mutateAsync({
          id: editingMeasure.id,
          modelId,
          ...data,
        });
        setEditingMeasure(null);
      } else {
        await createMeasure.mutateAsync({ modelId, ...data });
        setAddingMeasure(false);
      }
    } catch {
      // error toast handled by api.ts
    }
  };

  const handleDeleteMeasure = async (measure: ModelMeasure) => {
    if (!modelId) return;
    try {
      await deleteMeasure.mutateAsync({ id: measure.id, modelId });
    } catch {
      // error toast handled by api.ts
    }
  };

  // ---- Dimension handlers ----
  const handleSaveDimension = async (data: Partial<ModelDimension>) => {
    if (!modelId) return;
    try {
      if (editingDimension) {
        await updateDimension.mutateAsync({
          id: editingDimension.id,
          modelId,
          ...data,
        });
        setEditingDimension(null);
      } else {
        await createDimension.mutateAsync({ modelId, ...data });
        setAddingDimension(false);
      }
    } catch {
      // error toast handled by api.ts
    }
  };

  const handleDeleteDimension = async (dim: ModelDimension) => {
    if (!modelId) return;
    try {
      await deleteDimension.mutateAsync({ id: dim.id, modelId });
    } catch {
      // error toast handled by api.ts
    }
  };

  // ---- Join handlers ----
  const handleSaveJoin = async (data: Partial<ModelJoin>) => {
    if (!modelId) return;
    try {
      await createJoin.mutateAsync({ modelId, ...data });
      setAddingJoin(false);
    } catch {
      // error toast handled by api.ts
    }
  };

  const handleDeleteJoin = async (join: ModelJoin) => {
    if (!modelId) return;
    try {
      await deleteJoin.mutateAsync({ id: join.id, modelId });
    } catch {
      // error toast handled by api.ts
    }
  };

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
        <DialogTitle>{isEdit ? t("editModel") : t("newModel")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-auto px-6 pb-6 space-y-4">
        {/* Loading state for edit mode */}
        {isEdit && modelLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Model fields (always shown for create, shown after load for edit) */}
        {(!isEdit || model) && (
          <>
            {/* Name + Connection */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("name")} *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Orders"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("connection")} *</Label>
                <Select
                  value={connectionId}
                  onValueChange={setConnectionId}
                  disabled={isEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select connection..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">--</SelectItem>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this model"
                rows={2}
              />
            </div>

            {/* Source type + source */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("sourceType")}</Label>
                <Select
                  value={sourceType}
                  onValueChange={(v) => setSourceType(v as "table" | "sql")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="table">{t("table")}</SelectItem>
                    <SelectItem value="sql">{t("customSql")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {sourceType === "table" && (
                <div className="space-y-2">
                  <Label>{t("sourceTable")} *</Label>
                  <Input
                    value={sourceTable}
                    onChange={(e) => setSourceTable(e.target.value)}
                    placeholder="e.g. public.orders"
                  />
                </div>
              )}
            </div>

            {sourceType === "sql" && (
              <div className="space-y-2">
                <Label>{t("sourceSql")} *</Label>
                <Textarea
                  value={sourceSql}
                  onChange={(e) => setSourceSql(e.target.value)}
                  placeholder="SELECT * FROM orders WHERE status = 'completed'"
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
            )}

            {/* Save model button */}
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button
                onClick={handleSaveModel}
                disabled={!canSubmitModel || isSavingModel}
              >
                {isSavingModel && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                {tc("save")}
              </Button>
            </div>

            {/* Measures / Dimensions / Joins tabs -- only for existing models */}
            {isEdit && model && (
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="mt-2"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="measures">
                    {t("measures")}
                    {measures.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 text-[10px] px-1.5 py-0"
                      >
                        {measures.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="dimensions">
                    {t("dimensions")}
                    {dimensions.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 text-[10px] px-1.5 py-0"
                      >
                        {dimensions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="joins">
                    {t("joins")}
                    {joins.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 text-[10px] px-1.5 py-0"
                      >
                        {joins.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* ---- Measures Tab ---- */}
                <TabsContent value="measures" className="space-y-3 mt-3">
                  {measures.length === 0 && !addingMeasure && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {t("noMeasures")}
                    </p>
                  )}

                  {measures.map((m) =>
                    editingMeasure?.id === m.id ? (
                      <MeasureForm
                        key={m.id}
                        measure={m}
                        onSave={handleSaveMeasure}
                        onCancel={() => setEditingMeasure(null)}
                        isSaving={updateMeasure.isPending}
                      />
                    ) : (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {m.label || m.name}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {m.agg_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {m.expression}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setAddingMeasure(false);
                              setEditingMeasure(m);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteMeasure(m)}
                            disabled={deleteMeasure.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  )}

                  {addingMeasure && (
                    <MeasureForm
                      onSave={handleSaveMeasure}
                      onCancel={() => setAddingMeasure(false)}
                      isSaving={createMeasure.isPending}
                    />
                  )}

                  {!addingMeasure && !editingMeasure && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingMeasure(true)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t("addMeasure")}
                    </Button>
                  )}
                </TabsContent>

                {/* ---- Dimensions Tab ---- */}
                <TabsContent value="dimensions" className="space-y-3 mt-3">
                  {dimensions.length === 0 && !addingDimension && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {t("noDimensions")}
                    </p>
                  )}

                  {dimensions.map((d) =>
                    editingDimension?.id === d.id ? (
                      <DimensionForm
                        key={d.id}
                        dimension={d}
                        onSave={handleSaveDimension}
                        onCancel={() => setEditingDimension(null)}
                        isSaving={updateDimension.isPending}
                      />
                    ) : (
                      <div
                        key={d.id}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {d.label || d.name}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              {d.dimension_type}
                            </Badge>
                            {d.time_grain && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 shrink-0"
                              >
                                {d.time_grain}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {d.column_name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              setAddingDimension(false);
                              setEditingDimension(d);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteDimension(d)}
                            disabled={deleteDimension.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  )}

                  {addingDimension && (
                    <DimensionForm
                      onSave={handleSaveDimension}
                      onCancel={() => setAddingDimension(false)}
                      isSaving={createDimension.isPending}
                    />
                  )}

                  {!addingDimension && !editingDimension && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingDimension(true)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t("addDimension")}
                    </Button>
                  )}
                </TabsContent>

                {/* ---- Joins Tab ---- */}
                <TabsContent value="joins" className="space-y-3 mt-3">
                  {joins.length === 0 && !addingJoin && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {t("noJoins")}
                    </p>
                  )}

                  {joins.map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 shrink-0 uppercase"
                        >
                          {j.join_type}
                        </Badge>
                        <span className="text-xs font-mono truncate">
                          {j.from_column}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-xs font-medium truncate">
                          {j.to_model_name ?? `Model #${j.to_model_id}`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          .
                        </span>
                        <span className="text-xs font-mono truncate">
                          {j.to_column}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0 ml-2"
                        onClick={() => handleDeleteJoin(j)}
                        disabled={deleteJoin.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}

                  {addingJoin && (
                    <JoinEditor
                      models={allModels}
                      currentModelId={modelId!}
                      onSave={handleSaveJoin}
                      onCancel={() => setAddingJoin(false)}
                      isSaving={createJoin.isPending}
                    />
                  )}

                  {!addingJoin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingJoin(true)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t("addJoin")}
                    </Button>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </div>
    </>
  );
}
