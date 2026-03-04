"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  useDatasets,
  useCreateDataset,
  useDeleteDataset,
  usePreviewDataset,
  useUpdateDataset,
  useDatasetColumns,
  useDatasetMeasures,
  useCreateDatasetMeasure,
  useUpdateDatasetMeasure,
  useDeleteDatasetMeasure,
  useDatasetDimensions,
  useCreateDatasetDimension,
  useUpdateDatasetDimension,
  useDeleteDatasetDimension,
} from "@/hooks/use-datasets";
import type { DatasetMeasure, DatasetDimension } from "@/hooks/use-datasets";
import { useConnections, useConnectionSchemas, useConnectionSchema } from "@/hooks/use-connections";
import { useDashboards } from "@/hooks/use-dashboards";
import { useRouter, useSearchParams } from "next/navigation";
import type { Dataset, DatasetCreate, DatasetUpdate, SQLResult, SchemaTable } from "@/types";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Plus,
  Database,
  Trash2,
  Eye,
  Loader2,
  Clock,
  TableIcon,
  BarChart3,
  Upload,
  Pencil,
  Check,
  X,
} from "lucide-react";
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
import { toast } from "sonner";
import { CSVUploadDialog } from "@/components/datasets/csv-upload-dialog";
import { ImportDbtDialog } from "@/components/datasets/import-dbt-dialog";
import { useRoles } from "@/hooks/use-roles";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCacheTTL(seconds: number): string {
  if (seconds === 0) return "No cache";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  return `${d}d`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Measures Tab
// ---------------------------------------------------------------------------

function MeasuresTab({ datasetId }: { datasetId: number }) {
  const t = useTranslations("dataset");
  const { data: measures, isLoading } = useDatasetMeasures(datasetId);
  const createMeasure = useCreateDatasetMeasure();
  const updateMeasure = useUpdateDatasetMeasure();
  const deleteMeasure = useDeleteDatasetMeasure();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", label: "", expression: "", agg_type: "sum", format: "", description: "",
  });

  const resetForm = () => {
    setForm({ name: "", label: "", expression: "", agg_type: "sum", format: "", description: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (m: DatasetMeasure) => {
    setForm({
      name: m.name, label: m.label, expression: m.expression,
      agg_type: m.agg_type, format: m.format, description: m.description,
    });
    setEditingId(m.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.label.trim() || !form.expression.trim()) return;
    if (editingId) {
      await updateMeasure.mutateAsync({
        datasetId, measureId: editingId,
        data: { ...form },
      });
    } else {
      await createMeasure.mutateAsync({
        datasetId,
        data: { ...form, filters: [], sort_order: (measures?.length ?? 0) },
      });
    }
    resetForm();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("confirmDeleteMeasure"))) return;
    await deleteMeasure.mutateAsync({ datasetId, measureId: id });
  };

  const isSaving = createMeasure.isPending || updateMeasure.isPending;

  const aggOptions = [
    { value: "sum", label: t("aggSum") },
    { value: "count", label: t("aggCount") },
    { value: "avg", label: t("aggAvg") },
    { value: "min", label: t("aggMin") },
    { value: "max", label: t("aggMax") },
    { value: "count_distinct", label: t("aggCountDistinct") },
  ];

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : measures && measures.length > 0 ? (
        <div className="rounded-md border overflow-auto max-h-[240px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t("measureName")}</TableHead>
                <TableHead className="text-xs">{t("measureLabel")}</TableHead>
                <TableHead className="text-xs">{t("measureExpression")}</TableHead>
                <TableHead className="text-xs">{t("measureAggType")}</TableHead>
                <TableHead className="text-xs w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {measures.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs font-mono py-1">{m.name}</TableCell>
                  <TableCell className="text-xs py-1">{m.label}</TableCell>
                  <TableCell className="text-xs font-mono py-1">{m.expression}</TableCell>
                  <TableCell className="text-xs py-1">{m.agg_type}</TableCell>
                  <TableCell className="text-xs py-1">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(m)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(m.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4">{t("noMeasures")}</p>
      )}

      {showForm ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("measureName")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="revenue" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("measureLabel")}</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Revenue" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("measureExpression")}</Label>
              <Input value={form.expression} onChange={(e) => setForm({ ...form, expression: e.target.value })} placeholder="amount" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("measureAggType")}</Label>
              <Select value={form.agg_type} onValueChange={(v) => setForm({ ...form, agg_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aggOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("measureFormat")}</Label>
              <Input value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} placeholder="$,.2f" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("measureDescription")}</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving || !form.name.trim() || !form.label.trim() || !form.expression.trim()}>
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              <Check className="mr-1 h-3 w-3" />
              {t("saveMeasure")}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>
              <X className="mr-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="mr-1 h-3 w-3" />
          {t("addMeasure")}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dimensions Tab
// ---------------------------------------------------------------------------

function DimensionsTab({ datasetId }: { datasetId: number }) {
  const t = useTranslations("dataset");
  const { data: dimensions, isLoading } = useDatasetDimensions(datasetId);
  const createDimension = useCreateDatasetDimension();
  const updateDimension = useUpdateDatasetDimension();
  const deleteDimension = useDeleteDatasetDimension();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", label: "", column_name: "", dimension_type: "categorical",
    time_grain: null as string | null, format: "", description: "",
  });

  const resetForm = () => {
    setForm({ name: "", label: "", column_name: "", dimension_type: "categorical", time_grain: null, format: "", description: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (d: DatasetDimension) => {
    setForm({
      name: d.name, label: d.label, column_name: d.column_name,
      dimension_type: d.dimension_type, time_grain: d.time_grain,
      format: d.format, description: d.description,
    });
    setEditingId(d.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.label.trim() || !form.column_name.trim()) return;
    const payload = {
      ...form,
      time_grain: form.dimension_type === "time" ? form.time_grain : null,
    };
    if (editingId) {
      await updateDimension.mutateAsync({
        datasetId, dimensionId: editingId, data: payload,
      });
    } else {
      await createDimension.mutateAsync({
        datasetId,
        data: { ...payload, sort_order: (dimensions?.length ?? 0) },
      });
    }
    resetForm();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("confirmDeleteDimension"))) return;
    await deleteDimension.mutateAsync({ datasetId, dimensionId: id });
  };

  const isSaving = createDimension.isPending || updateDimension.isPending;

  const timeGrainOptions = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "quarter", label: "Quarter" },
    { value: "year", label: "Year" },
  ];

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : dimensions && dimensions.length > 0 ? (
        <div className="rounded-md border overflow-auto max-h-[240px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t("dimensionName")}</TableHead>
                <TableHead className="text-xs">{t("dimensionLabel")}</TableHead>
                <TableHead className="text-xs">{t("dimensionColumn")}</TableHead>
                <TableHead className="text-xs">{t("dimensionType")}</TableHead>
                <TableHead className="text-xs w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dimensions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs font-mono py-1">{d.name}</TableCell>
                  <TableCell className="text-xs py-1">{d.label}</TableCell>
                  <TableCell className="text-xs font-mono py-1">{d.column_name}</TableCell>
                  <TableCell className="text-xs py-1">
                    {d.dimension_type === "time" ? `${t("time")}${d.time_grain ? ` (${d.time_grain})` : ""}` : t("categorical")}
                  </TableCell>
                  <TableCell className="text-xs py-1">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(d)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={() => handleDelete(d.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4">{t("noDimensions")}</p>
      )}

      {showForm ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("dimensionName")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="region" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("dimensionLabel")}</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Region" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("dimensionColumn")}</Label>
              <Input value={form.column_name} onChange={(e) => setForm({ ...form, column_name: e.target.value })} placeholder="region" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("dimensionType")}</Label>
              <Select value={form.dimension_type} onValueChange={(v) => setForm({ ...form, dimension_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="categorical">{t("categorical")}</SelectItem>
                  <SelectItem value="time">{t("time")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.dimension_type === "time" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("dimensionTimeGrain")}</Label>
                <Select value={form.time_grain ?? "day"} onValueChange={(v) => setForm({ ...form, time_grain: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeGrainOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("dimensionFormat")}</Label>
              <Input value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("dimensionDescription")}</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={isSaving || !form.name.trim() || !form.label.trim() || !form.column_name.trim()}>
              {isSaving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              <Check className="mr-1 h-3 w-3" />
              {t("saveDimension")}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>
              <X className="mr-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="mr-1 h-3 w-3" />
          {t("addDimension")}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dataset Editor Dialog
// ---------------------------------------------------------------------------

function DatasetEditorDialog({
  open,
  onOpenChange,
  dataset,
  connections,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: Dataset | null;
  connections: { id: number; name: string }[];
  onSave: (data: DatasetCreate | (DatasetUpdate & { id: number })) => void;
  isSaving: boolean;
}) {
  const t = useTranslations("dataset");
  const tc = useTranslations("common");
  const previewDataset = usePreviewDataset();

  const isEdit = dataset !== null;

  // Fetch columns for existing datasets
  const { data: columnsData, isLoading: columnsLoading } = useDatasetColumns(
    open && isEdit ? dataset.id : null
  );
  const datasetColumns = columnsData?.columns ?? [];

  // Shared state
  const [activeTab, setActiveTab] = useState<"virtual" | "physical">("virtual");
  const [connectionId, setConnectionId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cacheTTL, setCacheTTL] = useState("300");

  // Virtual-only state
  const [sqlQuery, setSqlQuery] = useState("");
  const [previewResult, setPreviewResult] = useState<SQLResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Physical-only state
  const [selectedSchema, setSelectedSchema] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState<string>("");

  // Physical: fetch schemas for selected connection
  const connIdNum = connectionId ? Number(connectionId) : null;
  const { data: schemas, isLoading: schemasLoading } = useConnectionSchemas(
    activeTab === "physical" ? connIdNum : null
  );
  // Physical: fetch tables for selected schema (only after schema is chosen)
  const { data: schemaTables, isLoading: tablesLoading } = useConnectionSchema(
    activeTab === "physical" && selectedSchema ? connIdNum : null,
    selectedSchema || undefined
  );

  // Find selected table's columns for preview
  const selectedTableColumns: SchemaTable | undefined = schemaTables?.find(
    (st) => st.table_name === selectedTable
  );

  useEffect(() => {
    if (open) {
      if (dataset) {
        setActiveTab(dataset.dataset_type === "physical" ? "physical" : "virtual");
        setConnectionId(String(dataset.connection_id ?? ""));
        setName(dataset.name);
        setDescription(dataset.description);
        setSqlQuery(dataset.sql_query);
        setCacheTTL(String(dataset.cache_ttl));
        setSelectedSchema(dataset.schema_name ?? "");
        setSelectedTable(dataset.table_name ?? "");
      } else {
        setActiveTab("virtual");
        setConnectionId("");
        setName("");
        setDescription("");
        setSqlQuery("");
        setCacheTTL("300");
        setSelectedSchema("");
        setSelectedTable("");
      }
      setPreviewResult(null);
      setPreviewError(null);
    }
  }, [open, dataset]);

  // Auto-fill name when selecting table in physical mode
  useEffect(() => {
    if (activeTab === "physical" && selectedTable && !isEdit) {
      const autoName = selectedSchema
        ? `${selectedSchema}.${selectedTable}`
        : selectedTable;
      setName(autoName);
    }
  }, [activeTab, selectedSchema, selectedTable, isEdit]);

  // Reset schema/table when connection changes in physical mode
  useEffect(() => {
    if (!isEdit) {
      setSelectedSchema("");
      setSelectedTable("");
    }
  }, [connectionId, isEdit]);

  // Reset table when schema changes
  useEffect(() => {
    if (!isEdit) {
      setSelectedTable("");
    }
  }, [selectedSchema, isEdit]);

  const canSubmitVirtual = !!connectionId && !!name.trim() && !!sqlQuery.trim();
  const canSubmitPhysical = !!connectionId && !!name.trim() && !!selectedTable;
  const canSubmit = activeTab === "virtual" ? canSubmitVirtual : canSubmitPhysical;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (isEdit) {
      onSave({
        id: dataset.id,
        name: name.trim(),
        description: description.trim(),
        ...(activeTab === "virtual" ? { sql_query: sqlQuery.trim() } : {}),
        cache_ttl: Number(cacheTTL) || 0,
      });
    } else {
      if (activeTab === "virtual") {
        onSave({
          connection_id: Number(connectionId),
          name: name.trim(),
          description: description.trim() || undefined,
          sql_query: sqlQuery.trim(),
          cache_ttl: Number(cacheTTL) || 0,
          dataset_type: "virtual",
        } as DatasetCreate);
      } else {
        onSave({
          connection_id: Number(connectionId),
          name: name.trim(),
          description: description.trim() || undefined,
          cache_ttl: Number(cacheTTL) || 0,
          dataset_type: "physical",
          table_name: selectedTable,
          schema_name: selectedSchema || undefined,
        } as DatasetCreate);
      }
    }
  };

  const handlePreview = async () => {
    if (!isEdit || !sqlQuery.trim()) return;
    setIsPreviewing(true);
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const result = await previewDataset.mutateAsync(dataset.id);
      setPreviewResult(result);
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>
            {isEdit ? t("editDataset") : t("createDataset")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? dataset.name
              : activeTab === "physical"
                ? t("physicalHint")
                : t("virtualHint")}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <Tabs defaultValue="general" className="flex-1 overflow-hidden flex flex-col px-6 pb-6">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="general">{t("general")}</TabsTrigger>
              <TabsTrigger value="measures">{t("measures")}</TabsTrigger>
              <TabsTrigger value="dimensions">{t("dimensions")}</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="overflow-auto space-y-4">
              {/* Connection + Name row */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("connection")} *</Label>
                  <Select value={connectionId} onValueChange={setConnectionId} disabled={isEdit}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a connection" />
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("name")} *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Daily Revenue"
                  />
                </div>
              </div>

              {/* Description + Cache TTL */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_160px]">
                <div className="space-y-2">
                  <Label>{t("description")}</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("cacheTTL")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={cacheTTL}
                    onChange={(e) => setCacheTTL(e.target.value)}
                  />
                </div>
              </div>

              {/* Virtual-only: SQL Editor */}
              {activeTab === "virtual" && (
                <div className="space-y-2">
                  <Label>{t("sqlQuery")} *</Label>
                  <div className="rounded-md border overflow-hidden">
                    <Editor
                      height="200px"
                      language="sql"
                      theme="vs"
                      value={sqlQuery}
                      onChange={(v) => setSqlQuery(v ?? "")}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        padding: { top: 8, bottom: 8 },
                        automaticLayout: true,
                        tabSize: 2,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Columns list */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {t("columnsPreview")} {datasetColumns.length > 0 && `(${datasetColumns.length})`}
                </Label>
                {columnsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading columns...
                  </div>
                ) : datasetColumns.length > 0 ? (
                  <div className="rounded-md border overflow-auto max-h-[200px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Column</TableHead>
                          <TableHead className="text-xs">Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {datasetColumns.map((col) => (
                          <TableRow key={col.name}>
                            <TableCell className="text-xs font-mono py-1">{col.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground py-1">{col.type}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("noColumns")}</p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                {activeTab === "virtual" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreview}
                    disabled={isPreviewing || !sqlQuery.trim()}
                  >
                    {isPreviewing ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="mr-1 h-4 w-4" />
                    )}
                    {t("runPreview")}
                  </Button>
                )}
                <div className="flex-1" />
                <Button variant="secondary" onClick={() => onOpenChange(false)}>
                  {tc("cancel")}
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving || !canSubmit}>
                  {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {tc("save")}
                </Button>
              </div>

              {/* Preview error/result */}
              {previewError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {previewError}
                </div>
              )}

              {previewResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <TableIcon className="h-3 w-3" />
                      {previewResult.row_count} row{previewResult.row_count !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {previewResult.execution_time_ms}ms
                    </span>
                  </div>
                  <div className="rounded-md border overflow-auto max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {previewResult.columns.map((col) => (
                            <TableHead
                              key={col}
                              className="whitespace-nowrap text-xs font-semibold"
                            >
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewResult.rows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={previewResult.columns.length}
                              className="text-center text-sm text-slate-400 py-8"
                            >
                              No rows returned
                            </TableCell>
                          </TableRow>
                        ) : (
                          previewResult.rows.map((row, i) => (
                            <TableRow key={i}>
                              {row.map((cell, j) => (
                                <TableCell
                                  key={j}
                                  className="whitespace-nowrap text-xs"
                                >
                                  {cell === null ? (
                                    <span className="text-slate-300 italic">NULL</span>
                                  ) : (
                                    String(cell)
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="measures" className="overflow-auto">
              <MeasuresTab datasetId={dataset.id} />
            </TabsContent>

            <TabsContent value="dimensions" className="overflow-auto">
              <DimensionsTab datasetId={dataset.id} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 overflow-auto px-6 pb-6 space-y-4">
            {/* Virtual / Physical tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "virtual" | "physical")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="virtual">{t("virtual")}</TabsTrigger>
                <TabsTrigger value="physical">{t("physical")}</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Connection + Name row */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("connection")} *</Label>
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a connection" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("name")} *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daily Revenue"
                />
              </div>
            </div>

            {/* Physical-only: Schema + Table selects */}
            {activeTab === "physical" && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("schema")}</Label>
                    <Select
                      value={selectedSchema}
                      onValueChange={setSelectedSchema}
                      disabled={!connectionId || schemasLoading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={schemasLoading ? "Loading..." : t("selectSchema")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(schemas ?? []).map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("table")} *</Label>
                    <Select
                      value={selectedTable}
                      onValueChange={setSelectedTable}
                      disabled={!connectionId || tablesLoading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={tablesLoading ? "Loading..." : t("selectTable")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(schemaTables ?? []).map((st) => (
                          <SelectItem key={st.table_name} value={st.table_name}>
                            {st.table_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Column preview */}
                {selectedTableColumns && selectedTableColumns.columns.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      {t("columnsPreview")} ({selectedTableColumns.columns.length})
                    </Label>
                    <div className="rounded-md border overflow-auto max-h-[200px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Column</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedTableColumns.columns.map((col) => (
                            <TableRow key={col.name}>
                              <TableCell className="text-xs font-mono py-1">{col.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground py-1">{col.type}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Description + Cache TTL */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_160px]">
              <div className="space-y-2">
                <Label>{t("description")}</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("cacheTTL")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={cacheTTL}
                  onChange={(e) => setCacheTTL(e.target.value)}
                />
              </div>
            </div>

            {/* Virtual-only: SQL Editor */}
            {activeTab === "virtual" && (
              <div className="space-y-2">
                <Label>{t("sqlQuery")} *</Label>
                <div className="rounded-md border overflow-hidden">
                  <Editor
                    height="200px"
                    language="sql"
                    theme="vs"
                    value={sqlQuery}
                    onChange={(v) => setSqlQuery(v ?? "")}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8, bottom: 8 },
                      automaticLayout: true,
                      tabSize: 2,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <div className="flex-1" />
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving || !canSubmit}>
                {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {tc("save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DatasetsPage() {
  const t = useTranslations("dataset");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const { canEdit } = useRoles();
  const { data: datasets, isLoading: datasetsLoading } = useDatasets();
  const { data: connections } = useConnections();
  const { data: dashboards } = useDashboards();
  const router = useRouter();
  const createDataset = useCreateDataset();
  const updateDataset = useUpdateDataset();
  const deleteDataset = useDeleteDataset();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [showDbtImport, setShowDbtImport] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Dataset | null>(null);

  // Open editor from URL param ?edit=ID (e.g. from chart editor "Edit dataset")
  const searchParams = useSearchParams();
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && datasets) {
      const ds = datasets.find((d) => d.id === parseInt(editId));
      if (ds) {
        setEditingDataset(ds);
        setEditorOpen(true);
        window.history.replaceState({}, "", "/datasets");
      }
    }
  }, [searchParams, datasets]);

  // Build a connection lookup map
  const connectionMap = new Map(
    (connections ?? []).map((c) => [c.id, c.name])
  );

  const handleOpenCreate = () => {
    setEditingDataset(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (ds: Dataset) => {
    setEditingDataset(ds);
    setEditorOpen(true);
  };

  const handleSave = async (
    data: DatasetCreate | (DatasetUpdate & { id: number })
  ) => {
    if ("id" in data) {
      const { id, ...updateData } = data;
      await updateDataset.mutateAsync({ id, data: updateData });
    } else {
      await createDataset.mutateAsync(data);
    }
    setEditorOpen(false);
  };

  const handleDelete = (ds: Dataset) => {
    setDeleteTarget(ds);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteTarget(null);
    setDeletingId(deleteTarget.id);
    try {
      await deleteDataset.mutateAsync(deleteTarget.id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateChart = (ds: Dataset) => {
    const dbs = dashboards || [];
    if (dbs.length === 0) {
      toast.warning(t("createDashboardFirst"));
      return;
    }
    // If only one dashboard, go directly. Otherwise pick the first non-archived.
    const target = dbs.find((d) => !d.is_archived) || dbs[0];
    router.push(`/dashboard/${target.url_slug}/chart/new?datasetId=${ds.id}`);
  };

  const handleCSVCreateChart = (datasetId: number) => {
    const dbs = dashboards || [];
    if (dbs.length === 0) {
      toast.warning(t("createDashboardFirst"));
      return;
    }
    const target = dbs.find((d) => !d.is_archived) || dbs[0];
    router.push(`/dashboard/${target.url_slug}/chart/new?datasetId=${datasetId}`);
  };

  // --- Loading skeleton ---
  if (datasetsLoading) {
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
        <h1 className="text-xl font-semibold text-slate-900">{tn("datasets")}</h1>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowDbtImport(true)}>
              {t("importDbt")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowCSVUpload(true)}>
              <Upload className="mr-1 h-4 w-4" />
              {t("uploadFile")}
            </Button>
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="mr-1 h-4 w-4" />
              {t("new")}
            </Button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {datasets && datasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Database className="mb-4 h-16 w-16 text-slate-300" />
          <h2 className="mb-2 text-lg font-medium text-slate-600">
            {t("noDatasets")}
          </h2>
          <p className="mb-4 text-sm text-slate-400">
            {t("createFirstHint")}
          </p>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-1 h-4 w-4" />
            {t("createFirst")}
          </Button>
        </div>
      ) : (
        /* Datasets table */
        datasets && datasets.length > 0 && (
          <Card>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">{t("name")}</TableHead>
                    <TableHead>Connection</TableHead>
                    <TableHead className="hidden md:table-cell">
                      {t("description")}
                    </TableHead>
                    <TableHead className="w-[100px]">Cache TTL</TableHead>
                    <TableHead className="hidden sm:table-cell w-[120px]">
                      Created
                    </TableHead>
                    <TableHead className="w-[140px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datasets.map((ds) => (
                    <TableRow key={ds.id}>
                      <TableCell
                        className="font-medium cursor-pointer hover:text-blue-600 hover:underline"
                        onClick={() => handleOpenEdit(ds)}
                      >
                        <span className="flex items-center gap-2">
                          {ds.name}
                          <Badge variant={ds.dataset_type === "physical" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                            {ds.dataset_type === "physical" ? t("physical") : t("virtual")}
                          </Badge>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {ds.connection_id
                          ? connectionMap.get(ds.connection_id) ?? "Unknown"
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-slate-500 max-w-[300px] truncate">
                        {ds.description || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {formatCacheTTL(ds.cache_ttl)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-slate-500">
                        {formatDate(ds.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCreateChart(ds)}
                            title="Create chart from this dataset"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(ds)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(ds)}
                            disabled={deletingId === ds.id}
                            title="Delete"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            {deletingId === ds.id ? (
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

      <DatasetEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        dataset={editingDataset}
        connections={(connections ?? []).map((c) => ({ id: c.id, name: c.name }))}
        onSave={handleSave}
        isSaving={createDataset.isPending || updateDataset.isPending}
      />

      <CSVUploadDialog
        open={showCSVUpload}
        onOpenChange={setShowCSVUpload}
        onCreateChart={handleCSVCreateChart}
      />

      <ImportDbtDialog
        open={showDbtImport}
        onOpenChange={setShowDbtImport}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
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
