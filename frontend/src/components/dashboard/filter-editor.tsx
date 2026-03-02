"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDashboardFilters,
  useCreateFilter,
  useUpdateFilter,
  useDeleteFilter,
  useDashboardDatasets,
  useDatasetColumns,
  useDashboardChartColumns,
} from "@/hooks/use-filters";
import { useDashboardCharts } from "@/hooks/use-charts";
import { useUpdateDashboard } from "@/hooks/use-dashboards";
import type { Dashboard, DashboardFilter, DashboardFilterCreate, Chart } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Filter,
  Plus,
  Trash2,
  Loader2,
  Check,
  Link2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_TYPES = [
  { value: "select", label: "Dropdown" },
  { value: "multi_select", label: "Multi-Select" },
  { value: "date_range", label: "Date Range" },
  { value: "number_range", label: "Number Range" },
  { value: "text_search", label: "Text Search" },
];

const DATE_TYPES = [
  "date",
  "timestamp",
  "timestamptz",
  "datetime",
  "timestamp without time zone",
  "timestamp with time zone",
];

const NUM_TYPES = [
  "int2",
  "int4",
  "int8",
  "integer",
  "bigint",
  "smallint",
  "float",
  "float4",
  "float8",
  "double",
  "real",
  "numeric",
  "decimal",
  "number",
  "double precision",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterFormData {
  label: string;
  filter_type: string;
  target_column: string;
  default_value: string;
  dataset_id: number | null;
  column: string;
  scope: Record<string, string>;
  group_name: string | null;
  delimiter: string;
  depends_on_filter_id: number | null;
  sort_values: boolean;
  is_required: boolean;
  select_first_by_default: boolean;
  description: string;
}

const EMPTY_FORM: FilterFormData = {
  label: "",
  filter_type: "select",
  target_column: "",
  default_value: "",
  dataset_id: null,
  column: "",
  scope: {},
  group_name: null,
  delimiter: "",
  depends_on_filter_id: null,
  sort_values: true,
  is_required: false,
  select_first_by_default: false,
  description: "",
};

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function filterToForm(filter: DashboardFilter): FilterFormData {
  const config = filter.config || {};
  return {
    label: filter.label,
    filter_type: filter.filter_type,
    target_column: filter.target_column,
    default_value: filter.default_value || "",
    dataset_id: (config.dataset_id as number) || null,
    column: (config.column as string) || filter.target_column,
    scope: (config.scope as Record<string, string>) || {},
    group_name: filter.group_name || null,
    delimiter: (config.delimiter as string) || "",
    depends_on_filter_id: (config.depends_on_filter_id as number) || null,
    sort_values: config.sort_values !== undefined ? Boolean(config.sort_values) : true,
    is_required: Boolean(config.is_required),
    select_first_by_default: Boolean(config.select_first_by_default),
    description: (config.description as string) || "",
  };
}

function formToPayload(
  form: FilterFormData
): DashboardFilterCreate & { group_name?: string | null } {
  const config: Record<string, unknown> = {};
  if (form.dataset_id) config.dataset_id = form.dataset_id;
  if (form.column) config.column = form.column;
  if (Object.keys(form.scope).length > 0) config.scope = form.scope;
  if (form.delimiter) config.delimiter = form.delimiter;
  if (form.depends_on_filter_id)
    config.depends_on_filter_id = form.depends_on_filter_id;
  config.sort_values = form.sort_values;
  if (form.is_required) config.is_required = true;
  if (form.select_first_by_default) config.select_first_by_default = true;
  if (form.description) config.description = form.description;

  return {
    label: form.label,
    filter_type: form.filter_type,
    target_column: form.target_column || form.column,
    default_value: form.default_value || undefined,
    config,
    group_name: form.group_name,
  };
}

// ---------------------------------------------------------------------------
// ScopeRow  (reused from original, themed with shadcn tokens)
// ---------------------------------------------------------------------------

function ScopeRow({
  chart,
  targetColumn,
  manualColumn,
  onToggle,
  onColumnChange,
  chartColumns,
}: {
  chart: Chart;
  targetColumn: string;
  manualColumn: string | undefined;
  onToggle: (enabled: boolean) => void;
  onColumnChange: (col: string) => void;
  chartColumns: string[];
}) {
  const autoMatch = chartColumns.includes(targetColumn);
  const isManual = manualColumn !== undefined;
  const isActive = autoMatch || isManual;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
      <button
        type="button"
        onClick={() => {
          if (isManual) {
            onToggle(false);
          } else if (!autoMatch) {
            onToggle(true);
          }
        }}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          isActive
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 hover:border-primary"
        } ${autoMatch && !isManual ? "cursor-default" : "cursor-pointer"}`}
      >
        {isActive && <Check className="h-3 w-3" />}
      </button>
      <span className="flex-1 truncate font-medium text-foreground">
        {chart.title || `Chart ${chart.id}`}
      </span>
      {autoMatch && !isManual && (
        <Badge variant="secondary" className="text-[10px] shrink-0">
          auto
        </Badge>
      )}
      {isManual && (
        <Select
          value={manualColumn || "_empty_"}
          onValueChange={(v) => onColumnChange(v === "_empty_" ? "" : v)}
        >
          <SelectTrigger size="xs" className="h-6 text-[11px]">
            <SelectValue placeholder="-- column --" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_empty_">-- column --</SelectItem>
            {chartColumns.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!autoMatch && !isManual && (
        <span className="text-[10px] text-muted-foreground">no match</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter list item for left panel
// ---------------------------------------------------------------------------

function FilterItem({
  filter,
  isSelected,
  onSelect,
  onDelete,
  confirmDelete,
  isDeleting,
}: {
  filter: DashboardFilter;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  confirmDelete: boolean;
  isDeleting: boolean;
}) {
  const tc = useTranslations("common");

  return (
    <div
      className={`group flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm cursor-pointer transition-colors ${
        isSelected
          ? "border-primary bg-primary/5 text-foreground"
          : "border-border bg-background text-foreground hover:bg-muted/50"
      }`}
      onClick={onSelect}
    >
      <span className="flex-1 truncate text-xs font-medium">
        {filter.label}
      </span>
      <button
        type="button"
        className={`shrink-0 rounded p-0.5 transition-colors ${
          confirmDelete
            ? "text-destructive hover:bg-destructive/10"
            : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-destructive"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={isDeleting}
      >
        {isDeleting && confirmDelete ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
      {confirmDelete && (
        <span className="text-[10px] text-destructive shrink-0">
          {tc("clickAgain")}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

function SettingsTab({
  form,
  onChange,
  dashboardId,
  dashboard,
  updateDashboard,
  filters,
  currentFilterId,
}: {
  form: FilterFormData;
  onChange: (form: FilterFormData) => void;
  dashboardId: number;
  dashboard?: Dashboard;
  updateDashboard: ReturnType<typeof useUpdateDashboard>;
  filters: DashboardFilter[];
  currentFilterId: number | null;
}) {
  const td = useTranslations("dashboard");
  const { data: datasets } = useDashboardDatasets(dashboardId);
  const { data: columnsData } = useDatasetColumns(form.dataset_id || undefined);
  const allColumns = columnsData?.columns || [];

  const [configOpen, setConfigOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [dependsEnabled, setDependsEnabled] = useState(
    !!form.depends_on_filter_id
  );

  // Sync dependsEnabled when switching filters
  useEffect(() => {
    queueMicrotask(() => setDependsEnabled(!!form.depends_on_filter_id));
  }, [form.depends_on_filter_id]);

  const columns = allColumns.filter((col) => {
    const t = col.type?.toLowerCase() || "";
    if (form.filter_type === "date_range")
      return DATE_TYPES.some((dt) => t.includes(dt));
    if (form.filter_type === "number_range")
      return NUM_TYPES.some((nt) => t.includes(nt));
    return true;
  });

  // Parent filter candidates: same dataset, not self, no circular
  const parentCandidates = filters.filter((f) => {
    if (currentFilterId && f.id === currentFilterId) return false;
    const fConfig = f.config || {};
    if ((fConfig.dataset_id as number) !== form.dataset_id) return false;
    if (
      currentFilterId &&
      (fConfig.depends_on_filter_id as number) === currentFilterId
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-4 p-4">
      {/* Filter Type + Name */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            {td("filterType")}
          </Label>
          <Select
            value={form.filter_type}
            onValueChange={(v) => onChange({ ...form, filter_type: v })}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            {td("filterName")}
          </Label>
          <Input
            value={form.label}
            onChange={(e) => onChange({ ...form, label: e.target.value })}
            placeholder="e.g. Game Name"
            className="h-8"
          />
        </div>
      </div>

      {/* Dataset + Column */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            {td("dataset")}
          </Label>
          <Select
            value={form.dataset_id != null ? String(form.dataset_id) : "_empty_"}
            onValueChange={(v) => {
              const dsId = v !== "_empty_" ? Number(v) : null;
              onChange({
                ...form,
                dataset_id: dsId,
                column: "",
                target_column: "",
                scope: {},
              });
            }}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder={td("selectDataset")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_empty_">{td("selectDataset")}</SelectItem>
              {(datasets || []).map((ds) => (
                <SelectItem key={ds.id} value={String(ds.id)}>
                  {ds.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            {td("targetColumn")}
          </Label>
          {form.dataset_id ? (
            <Select
              value={form.column || "_empty_"}
              onValueChange={(v) => {
                const col = v === "_empty_" ? "" : v;
                const colType =
                  allColumns.find((c) => c.name === col)?.type?.toLowerCase() ||
                  "";
                let autoType = form.filter_type;
                if (col) {
                  if (DATE_TYPES.some((dt) => colType.includes(dt))) {
                    autoType = "date_range";
                  } else if (NUM_TYPES.some((nt) => colType.includes(nt))) {
                    autoType = "number_range";
                  } else {
                    autoType = "select";
                  }
                }
                onChange({
                  ...form,
                  column: col,
                  target_column: col,
                  label: form.label || col,
                  filter_type: autoType,
                  scope: {},
                });
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder={td("selectColumn")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_empty_">{td("selectColumn")}</SelectItem>
                {columns.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                    {c.type !== "unknown" ? ` (${c.type})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={form.target_column}
              onChange={(e) =>
                onChange({ ...form, target_column: e.target.value })
              }
              placeholder="e.g. created_at"
              className="h-8"
            />
          )}
        </div>
      </div>

      {/* Filter Configuration (collapsible) */}
      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
          {configOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {td("filterConfiguration")}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          {/* Depends on filter */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="depends-on"
                checked={dependsEnabled}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    onChange({ ...form, depends_on_filter_id: null });
                    setDependsEnabled(false);
                  } else {
                    setDependsEnabled(true);
                  }
                }}
              />
              <Label htmlFor="depends-on" className="text-xs cursor-pointer">
                {td("dependsOnFilter")}
              </Label>
            </div>
            {dependsEnabled && (
              <Select
                value={
                  form.depends_on_filter_id
                    ? String(form.depends_on_filter_id)
                    : "_empty_"
                }
                onValueChange={(v) =>
                  onChange({
                    ...form,
                    depends_on_filter_id:
                      v !== "_empty_" ? Number(v) : null,
                  })
                }
              >
                <SelectTrigger size="sm" className="ml-6">
                  <SelectValue placeholder={td("selectParentFilter")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_empty_">
                    {td("selectParentFilter")}
                  </SelectItem>
                  {parentCandidates.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Sort values */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="sort-values"
              checked={form.sort_values}
              onCheckedChange={(checked) =>
                onChange({ ...form, sort_values: !!checked })
              }
            />
            <Label htmlFor="sort-values" className="text-xs cursor-pointer">
              {td("sortFilterValues")}
            </Label>
          </div>

          {/* Delimiter (only for select/multi_select) */}
          {(form.filter_type === "select" ||
            form.filter_type === "multi_select") && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {td("delimiter")}
              </Label>
              <Input
                value={form.delimiter}
                onChange={(e) =>
                  onChange({ ...form, delimiter: e.target.value })
                }
                placeholder={td("delimiterPlaceholder")}
                className="h-8"
              />
            </div>
          )}

          {/* Filter group */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {td("filterGroup")}
            </Label>
            <Input
              value={form.group_name || ""}
              onChange={(e) =>
                onChange({ ...form, group_name: e.target.value || null })
              }
              placeholder="e.g. Date Filters"
              className="h-8"
            />
            {form.group_name && dashboard && (
              <div className="flex items-center gap-2 mt-1">
                <Checkbox
                  id="collapsible"
                  checked={
                    (dashboard.filter_layout?.groups as Record<string, { collapsible?: boolean }>)?.[form.group_name]?.collapsible ?? false
                  }
                  onCheckedChange={(checked) => {
                    const groups = {
                      ...((dashboard.filter_layout?.groups as Record<string, { collapsible?: boolean }>) || {}),
                      [form.group_name!]: { collapsible: !!checked },
                    };
                    updateDashboard.mutate({
                      id: dashboard.id,
                      data: { filter_layout: { ...dashboard.filter_layout, groups } },
                    });
                  }}
                />
                <Label htmlFor="collapsible" className="text-xs">
                  {td("collapsibleGroup")}
                </Label>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Filter Settings (collapsible) */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
          {settingsOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {td("filterSettings")}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          {/* Default value */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {td("defaultValue")}
            </Label>
            <Input
              value={form.default_value}
              onChange={(e) =>
                onChange({ ...form, default_value: e.target.value })
              }
              placeholder="Optional"
              className="h-8"
            />
          </div>

          {/* Required */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="is-required"
              checked={form.is_required}
              onCheckedChange={(checked) =>
                onChange({ ...form, is_required: !!checked })
              }
            />
            <Label htmlFor="is-required" className="text-xs cursor-pointer">
              {td("filterRequired")}
            </Label>
          </div>

          {/* Select first by default */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-first"
              checked={form.select_first_by_default}
              onCheckedChange={(checked) =>
                onChange({ ...form, select_first_by_default: !!checked })
              }
            />
            <Label htmlFor="select-first" className="text-xs cursor-pointer">
              {td("selectFirstByDefault")}
            </Label>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {td("filterDescription")}
            </Label>
            <Textarea
              value={form.description}
              onChange={(e) =>
                onChange({ ...form, description: e.target.value })
              }
              placeholder={td("descriptionPlaceholder")}
              className="min-h-[60px] text-xs"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoping Tab
// ---------------------------------------------------------------------------

function ScopingTab({
  form,
  onChange,
  dashboardId,
}: {
  form: FilterFormData;
  onChange: (form: FilterFormData) => void;
  dashboardId: number;
}) {
  const td = useTranslations("dashboard");
  const { data: charts } = useDashboardCharts(dashboardId);
  const { data: chartColumnsMap } = useDashboardChartColumns(dashboardId);
  const chartList = charts || [];

  if (!form.column) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {td("selectColumn")}
      </div>
    );
  }

  if (chartList.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {td("noCharts")}
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link2 className="h-3 w-3" />
        {td("scope")}
      </Label>
      <div className="space-y-1">
        {chartList.map((chart) => (
          <ScopeRow
            key={chart.id}
            chart={chart}
            targetColumn={form.column}
            manualColumn={form.scope[String(chart.id)]}
            chartColumns={chartColumnsMap?.[String(chart.id)] || []}
            onToggle={(enabled) => {
              const next = { ...form.scope };
              if (enabled) {
                next[String(chart.id)] = "";
              } else {
                delete next[String(chart.id)];
              }
              onChange({ ...form, scope: next });
            }}
            onColumnChange={(col) => {
              onChange({
                ...form,
                scope: { ...form.scope, [String(chart.id)]: col },
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main FilterEditor
// ---------------------------------------------------------------------------

export function FilterEditor({ dashboardId, dashboard }: { dashboardId: number; dashboard?: Dashboard }) {
  const tc = useTranslations("common");
  const td = useTranslations("dashboard");

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<FilterFormData>(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState<"settings" | "scoping">(
    "settings"
  );
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const { data: filters, isLoading } = useDashboardFilters(
    open ? dashboardId : undefined
  );
  const createFilter = useCreateFilter(dashboardId);
  const updateFilter = useUpdateFilter();
  const deleteFilter = useDeleteFilter();
  const updateDashboard = useUpdateDashboard();

  const sortedFilters = [...(filters || [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  // When filters load and we have a selectedId, sync the form
  useEffect(() => {
    if (selectedId && filters) {
      const found = filters.find((f) => f.id === selectedId);
      if (found) {
        queueMicrotask(() => setForm(filterToForm(found)));
      }
    }
  }, [selectedId, filters]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setSelectedId(null);
        setIsNew(false);
        setForm(EMPTY_FORM);
        setActiveTab("settings");
        setConfirmDelete(null);
      });
    }
  }, [open]);

  const handleSelectFilter = useCallback(
    (filter: DashboardFilter) => {
      setSelectedId(filter.id);
      setIsNew(false);
      setForm(filterToForm(filter));
      setActiveTab("settings");
      setConfirmDelete(null);
    },
    []
  );

  const handleAddFilter = useCallback(() => {
    setSelectedId(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setActiveTab("settings");
    setConfirmDelete(null);
  }, []);

  const handleDelete = useCallback(
    async (filterId: number) => {
      if (confirmDelete !== filterId) {
        setConfirmDelete(filterId);
        return;
      }
      await deleteFilter.mutateAsync(filterId);
      setConfirmDelete(null);
      if (selectedId === filterId) {
        setSelectedId(null);
        setIsNew(false);
        setForm(EMPTY_FORM);
      }
    },
    [confirmDelete, deleteFilter, selectedId]
  );

  const handleSave = useCallback(async () => {
    if (!form.label.trim() || !form.target_column.trim()) return;
    const payload = formToPayload(form);

    if (isNew) {
      const created = await createFilter.mutateAsync(payload);
      setSelectedId(created.id);
      setIsNew(false);
    } else if (selectedId) {
      await updateFilter.mutateAsync({ id: selectedId, ...payload });
    }
  }, [form, isNew, selectedId, createFilter, updateFilter]);

  const handleCancel = useCallback(() => {
    setOpen(false);
  }, []);

  const isSaving = createFilter.isPending || updateFilter.isPending;
  const canSave =
    (isNew || selectedId !== null) &&
    form.label.trim() !== "" &&
    form.target_column.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Filter className="mr-1 h-4 w-4" />
          {td("filters")}
        </Button>
      </DialogTrigger>
      <DialogContent
        size="xl"
        className="p-0 gap-0 h-[80vh] grid-rows-[auto_1fr_auto]"
      >
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle>{td("addAndEditFilters")}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 border-t border-border">
          {/* ---- Left panel ---- */}
          <div className="w-[220px] shrink-0 border-r border-border flex flex-col">
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {isLoading ? (
                <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground justify-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {td("loadingFilters")}
                </div>
              ) : sortedFilters.length === 0 && !isNew ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {td("noFilters")}
                </p>
              ) : (
                <div className="space-y-1">
                  {sortedFilters.map((filter) => (
                    <FilterItem
                      key={filter.id}
                      filter={filter}
                      isSelected={selectedId === filter.id}
                      onSelect={() => handleSelectFilter(filter)}
                      onDelete={() => handleDelete(filter.id)}
                      confirmDelete={confirmDelete === filter.id}
                      isDeleting={deleteFilter.isPending}
                    />
                  ))}
                </div>
              )}

              {/* New filter item (unsaved) */}
              {isNew && (
                <div className="flex items-center gap-1.5 rounded-md border border-primary bg-primary/5 px-2 py-1.5 text-xs font-medium text-foreground">
                  <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">
                    {form.label || td("addFilter")}
                  </span>
                </div>
              )}
            </div>
            <div className="p-2 border-t border-border">
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={handleAddFilter}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {td("addFilter")}
              </Button>
            </div>
          </div>

          {/* ---- Right panel ---- */}
          <div className="flex-1 flex flex-col min-h-0">
            {selectedId || isNew ? (
              <>
                {/* Tab bar */}
                <div className="flex border-b border-border px-4 shrink-0">
                  <button
                    type="button"
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                      activeTab === "settings"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setActiveTab("settings")}
                  >
                    {td("settingsTab")}
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                      activeTab === "scoping"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setActiveTab("scoping")}
                  >
                    {td("scopingTab")}
                  </button>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                  {activeTab === "settings" ? (
                    <SettingsTab
                      form={form}
                      onChange={setForm}
                      dashboardId={dashboardId}
                      dashboard={dashboard}
                      updateDashboard={updateDashboard}
                      filters={sortedFilters}
                      currentFilterId={selectedId}
                    />
                  ) : (
                    <ScopingTab
                      form={form}
                      onChange={setForm}
                      dashboardId={dashboardId}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                {td("noFilters")}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border">
          <Button variant="outline" onClick={handleCancel}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !canSave}>
            {isSaving && (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            )}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
