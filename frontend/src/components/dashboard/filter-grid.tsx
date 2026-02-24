"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useDashboardFilters, useFilterValues, useUpdateFilter } from "@/hooks/use-filters";
import { useUpdateDashboard } from "@/hooks/use-dashboards";
import { useBookmarks, useCreateBookmark, useDeleteBookmark } from "@/hooks/use-bookmarks";
import { useContainerWidth } from "@/hooks/use-container-width";
import type { Dashboard, DashboardFilter } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import {
  Filter,
  X,
  Loader2,
  ChevronDown,
  Check,
  Bookmark,
  Save,
  Trash2,
  Info,
  GripVertical,
} from "lucide-react";
import "react-grid-layout/css/styles.css";

/** Layout item shape used by react-grid-layout */
interface RGLLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactGridLayout = dynamic(
  () => import("react-grid-layout/legacy").then((mod) => mod.default || mod) as any,
  { ssr: false }
) as any;

// ============================================================
// Auto-layout generation for filters
// ============================================================

function generateDefaultLayout(filters: DashboardFilter[]): RGLLayoutItem[] {
  const sorted = [...filters].sort((a, b) => a.sort_order - b.sort_order);
  const layout: RGLLayoutItem[] = [];
  const processedGroups = new Set<string>();
  let x = 0,
    y = 0;

  for (const f of sorted) {
    if (f.group_name) {
      if (processedGroups.has(f.group_name)) continue;
      processedGroups.add(f.group_name);
      const groupSize = filters.filter(
        (gf) => gf.group_name === f.group_name
      ).length;
      const w = 3;
      // ~60px per filter + 40px header/padding, rowHeight=90
      const h = Math.max(2, Math.ceil((groupSize * 60 + 40) / 90));
      if (x + w > 12) {
        x = 0;
        y += h;
      }
      layout.push({
        i: `group_${f.group_name}`,
        x,
        y,
        w,
        h,
        minW: 2,
        minH: 2,
      });
      x += w;
    } else {
      const w = 3;
      if (x + w > 12) {
        x = 0;
        y++;
      }
      layout.push({
        i: `filter_${f.id}`,
        x,
        y,
        w,
        h: 1,
        minW: 2,
        minH: 1,
      });
      x += w;
    }
  }
  return layout;
}

// ============================================================
// Sub-components for each filter type (copied from filter-bar.tsx)
// ============================================================

function FilterSelect({
  filter,
  value,
  onChange,
  activeFilters,
  disabled,
}: {
  filter: DashboardFilter;
  value: unknown;
  onChange: (val: string | null) => void;
  activeFilters: Record<string, unknown>;
  disabled?: boolean;
}) {
  const tc = useTranslations("common");
  const dependsOnId = (filter.config as any)?.depends_on_filter_id;
  const parentValue = dependsOnId ? (activeFilters[dependsOnId] as string) || null : null;
  const { data: valuesData, isLoading } = useFilterValues(filter.id, parentValue);
  const values = valuesData?.values || [];

  useEffect(() => {
    if (values.length > 0 && !value && (filter.config as any)?.select_first_by_default) {
      onChange(values[0]);
    }
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (values.length > 0 && value && !values.includes(value as string)) {
      onChange(null);
    }
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
        <span className="text-sm text-slate-400">{tc("loading")}</span>
      </div>
    );
  }

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="truncate text-slate-700">
            {(value as string) || tc("all")}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          {values.length > 5 && (
            <CommandInput placeholder={`${tc("search")}...`} className="h-8 text-xs" />
          )}
          <CommandList>
            <CommandEmpty className="py-3 text-xs">{tc("noResults")}</CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={() => { onChange(null); setOpen(false); }}>
                <Check className={`h-3.5 w-3.5 ${!value ? "opacity-100" : "opacity-0"}`} />
                {tc("all")}
              </CommandItem>
              {values.map((v) => (
                <CommandItem key={v} onSelect={() => { onChange(v); setOpen(false); }}>
                  <Check className={`h-3.5 w-3.5 ${value === v ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{v}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FilterMultiSelect({
  filter,
  value,
  onChange,
  activeFilters,
  disabled,
}: {
  filter: DashboardFilter;
  value: unknown;
  onChange: (val: string[]) => void;
  activeFilters: Record<string, unknown>;
  disabled?: boolean;
}) {
  const tc = useTranslations("common");
  const td = useTranslations("dashboard");
  const dependsOnId = (filter.config as any)?.depends_on_filter_id;
  const parentValue = dependsOnId ? (activeFilters[dependsOnId] as string) || null : null;
  const { data: valuesData, isLoading } = useFilterValues(filter.id, parentValue);
  const values = valuesData?.values || [];
  const selected = (value as string[]) || [];

  useEffect(() => {
    if (values.length > 0 && selected.length > 0) {
      const valid = selected.filter((s) => values.includes(s));
      if (valid.length !== selected.length) {
        onChange(valid);
      }
    }
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

  const [open, setOpen] = useState(false);

  const toggle = (v: string) => {
    if (selected.includes(v)) {
      onChange(selected.filter((s) => s !== v));
    } else {
      onChange([...selected, v]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
        <span className="text-sm text-slate-400">{tc("loading")}</span>
      </div>
    );
  }

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="truncate text-slate-700">
            {selected.length === 0 ? tc("all") : td("selectedCount", { count: selected.length })}
          </span>
          <div className="flex items-center gap-1">
            {selected.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {selected.length}
              </Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        {values.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground">{td("noOptions")}</div>
        ) : (
          <Command>
            <CommandInput placeholder={`${tc("search")}...`} className="h-8 text-xs" />
            <div className="flex items-center gap-1 border-b px-2 py-1.5">
              <button
                type="button"
                onClick={() => onChange([...values])}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {td("selectAll")} ({values.length})
              </button>
              <span className="text-muted-foreground/40">|</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => !selected.includes(v)))}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {td("selectInvert")}
              </button>
              <span className="text-muted-foreground/40">|</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[11px] font-medium text-destructive hover:underline"
              >
                {td("clearSelection")}
              </button>
            </div>
            <CommandList>
              <CommandEmpty className="py-3 text-xs">{tc("noResults")}</CommandEmpty>
              <CommandGroup>
                {values.map((v) => (
                  <CommandItem key={v} onSelect={() => toggle(v)}>
                    <Check className={`h-3.5 w-3.5 ${selected.includes(v) ? "opacity-100" : "opacity-0"}`} />
                    <span className="truncate">{v}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FilterNumberRange({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (val: { min: number | null; max: number | null } | null) => void;
  disabled?: boolean;
}) {
  const td = useTranslations("dashboard");
  const current = value as { min?: number | null; max?: number | null } | null;

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        className="h-9 w-full bg-white"
        placeholder={td("min")}
        disabled={disabled}
        value={current?.min ?? ""}
        onChange={(e) =>
          onChange({
            min: e.target.value ? Number(e.target.value) : null,
            max: current?.max ?? null,
          })
        }
      />
      <span className="text-sm text-slate-400">-</span>
      <Input
        type="number"
        className="h-9 w-full bg-white"
        placeholder={td("max")}
        disabled={disabled}
        value={current?.max ?? ""}
        onChange={(e) =>
          onChange({
            min: current?.min ?? null,
            max: e.target.value ? Number(e.target.value) : null,
          })
        }
      />
    </div>
  );
}

function FilterTextSearch({
  value,
  onChange,
  disabled,
}: {
  value: unknown;
  onChange: (val: string | null) => void;
  disabled?: boolean;
}) {
  const tc = useTranslations("common");
  const [local, setLocal] = useState<string>((value as string) || "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal((value as string) || "");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(v || null);
    }, 300);
  };

  return (
    <Input
      type="text"
      className="h-9 w-full bg-white"
      placeholder={`${tc("search")}...`}
      disabled={disabled}
      value={local}
      onChange={handleChange}
    />
  );
}

// ============================================================
// FilterControl — shared filter-type switch used by all card types
// ============================================================

function FilterControl({
  filter,
  value,
  onChange,
  activeFilters,
  disabled,
}: {
  filter: DashboardFilter;
  value: unknown;
  onChange: (val: unknown) => void;
  activeFilters: Record<string, unknown>;
  disabled: boolean;
}) {
  switch (filter.filter_type) {
    case "select":
      return (
        <FilterSelect
          filter={filter}
          value={value}
          onChange={onChange}
          activeFilters={activeFilters}
          disabled={disabled}
        />
      );
    case "multi_select":
      return (
        <FilterMultiSelect
          filter={filter}
          value={value}
          onChange={(val) => onChange(val.length > 0 ? val : null)}
          activeFilters={activeFilters}
          disabled={disabled}
        />
      );
    case "date_range":
      return (
        <div className={disabled ? "pointer-events-none opacity-50" : ""}>
          <DateRangeFilter
            value={value as { from?: string; to?: string; preset?: string } | null}
            onChange={onChange}
          />
        </div>
      );
    case "number_range":
      return (
        <FilterNumberRange
          value={value}
          onChange={(val) => {
            const isEmpty = !val || (val.min === null && val.max === null);
            onChange(isEmpty ? null : val);
          }}
          disabled={disabled}
        />
      );
    case "text_search":
      return (
        <FilterTextSearch
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      return null;
  }
}

// ============================================================
// FilterCard — individual filter rendered inside the grid
// ============================================================

function FilterCard({
  filter,
  value,
  onChange,
  activeFilters,
  isEditing,
}: {
  filter: DashboardFilter;
  value: unknown;
  onChange: (val: unknown) => void;
  activeFilters: Record<string, unknown>;
  isEditing: boolean;
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* Header with label and optional drag handle */}
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
        {isEditing && (
          <div className="filter-drag-handle cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        )}
        <Label className="text-xs text-slate-500 flex items-center gap-1 truncate">
          {filter.label}
          {(filter.config as any)?.is_required && (
            <span className="text-red-500">*</span>
          )}
          {(filter.config as any)?.description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>{(filter.config as any).description}</TooltipContent>
            </Tooltip>
          )}
        </Label>
      </div>

      {/* Filter control area — prevent DnD conflicts with Select dropdowns */}
      <div
        className="flex-1 px-3 pb-2"
        onPointerDownCapture={isEditing ? (e) => e.stopPropagation() : undefined}
      >
        <FilterControl
          filter={filter}
          value={value}
          onChange={onChange}
          activeFilters={activeFilters}
          disabled={isEditing}
        />
      </div>
    </div>
  );
}

// ============================================================
// FilterStackCard — multiple filters stacked vertically, no collapse
// ============================================================

function FilterStackCard({
  filters,
  draftFilters,
  updateDraft,
  isEditing,
  onUnstack,
}: {
  filters: DashboardFilter[];
  draftFilters: Record<string, unknown>;
  updateDraft: (column: string, value: unknown) => void;
  isEditing: boolean;
  onUnstack?: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
      {isEditing && (
        <div className="filter-drag-handle flex items-center gap-1 px-3 pt-1.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
          <GripVertical className="h-3.5 w-3.5" />
          {onUnstack && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-5 text-[10px] px-1.5 text-slate-400 hover:text-red-500"
              onClick={onUnstack}
            >
              Unstack
            </Button>
          )}
        </div>
      )}
      <div
        className="flex-1 overflow-y-auto px-3 py-1.5 space-y-2"
        onPointerDownCapture={isEditing ? (e) => e.stopPropagation() : undefined}
      >
        {filters.map((filter) => (
          <div key={filter.id}>
            <Label className="text-xs text-slate-500 mb-0.5 block truncate">
              {filter.label}
            </Label>
            <FilterControl
              filter={filter}
              value={draftFilters[filter.id]}
              onChange={(val) => updateDraft(String(filter.id), val)}
              activeFilters={draftFilters}
              disabled={isEditing}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// FilterGroupCard — collapsible group with header, name, active count
// ============================================================

function FilterGroupCard({
  groupName,
  filters,
  draftFilters,
  updateDraft,
  isEditing,
  isCollapsed,
  onToggleCollapse,
  onUngroup,
}: {
  groupName: string;
  filters: DashboardFilter[];
  draftFilters: Record<string, unknown>;
  updateDraft: (column: string, value: unknown) => void;
  isEditing: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onUngroup?: () => void;
}) {
  const activeCount = filters.filter((f) => draftFilters[f.id] != null).length;

  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* Header — always visible */}
      <div
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 select-none",
          !isEditing && "cursor-pointer",
          !isCollapsed && "border-b border-slate-100"
        )}
        onClick={!isEditing ? onToggleCollapse : undefined}
      >
        {isEditing && (
          <div className="filter-drag-handle cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-400 transition-transform",
            isCollapsed && "-rotate-90"
          )}
        />
        <span className="text-xs font-medium text-slate-600 truncate">
          {groupName}
        </span>
        {activeCount > 0 && (
          <Badge
            variant="secondary"
            className="ml-auto text-[10px] h-4 px-1.5"
          >
            {activeCount} active
          </Badge>
        )}
        {isEditing && onUngroup && (
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-5 text-[10px] px-1.5 text-slate-400 hover:text-red-500",
              activeCount === 0 && "ml-auto"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onUngroup();
            }}
          >
            Ungroup
          </Button>
        )}
      </div>

      {/* Filters — hidden when collapsed */}
      {!isCollapsed && (
        <div
          className="flex-1 overflow-y-auto px-3 py-1.5 space-y-2"
          onPointerDownCapture={isEditing ? (e) => e.stopPropagation() : undefined}
        >
          {filters.map((filter) => (
            <div key={filter.id}>
              <Label className="text-xs text-slate-500 mb-0.5 block truncate">
                {filter.label}
              </Label>
              <FilterControl
                filter={filter}
                value={draftFilters[filter.id]}
                onChange={(val) => updateDraft(String(filter.id), val)}
                activeFilters={draftFilters}
                disabled={isEditing}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function resolveFilterIds(layoutKey: string, filters: DashboardFilter[]): number[] {
  if (layoutKey.startsWith("filter_")) {
    return [Number(layoutKey.replace("filter_", ""))];
  }
  if (layoutKey.startsWith("group_")) {
    const name = layoutKey.replace("group_", "");
    return filters.filter((f) => f.group_name === name).map((f) => f.id);
  }
  return [];
}

// ============================================================
// Main FilterGrid component
// ============================================================

interface FilterGridProps {
  dashboardId: number;
  dashboard: Dashboard;
  activeFilters: Record<string, unknown>;
  onFiltersChange: (filters: Record<string, unknown>) => void;
  isEditing: boolean;
}

export function FilterGrid({
  dashboardId,
  dashboard,
  activeFilters,
  onFiltersChange,
  isEditing,
}: FilterGridProps) {
  const tc = useTranslations("common");
  const td = useTranslations("dashboard");
  const { data: filters, isLoading } = useDashboardFilters(dashboardId);
  const { data: bookmarks } = useBookmarks(dashboardId);
  const createBookmark = useCreateBookmark(dashboardId);
  const deleteBookmark = useDeleteBookmark(dashboardId);
  const updateDashboard = useUpdateDashboard();
  const updateFilter = useUpdateFilter();

  const [containerRef, containerWidth, freezeWidth, unfreezeWidth] = useContainerWidth();
  const [draftFilters, setDraftFilters] = useState<Record<string, unknown>>({});
  const [showBookmarkInput, setShowBookmarkInput] = useState(false);
  const [bookmarkName, setBookmarkName] = useState("");

  const [mergeCandidate, setMergeCandidate] = useState<{
    source: string;
    target: string;
    position: { x: number; y: number };
  } | null>(null);
  const prevLayoutRef = useRef<RGLLayoutItem[]>([]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const saved = (dashboard.filter_layout?.collapsed as string[]) || [];
    return new Set(saved);
  });

  const groupMeta = (dashboard.filter_layout?.groups as Record<string, { collapsible?: boolean }>) || {};

  // Compute grouped and standalone filters
  const { standaloneFilters, groupedFilters } = useMemo(() => {
    if (!filters) return { standaloneFilters: [], groupedFilters: new Map<string, DashboardFilter[]>() };
    const standalone: DashboardFilter[] = [];
    const grouped = new Map<string, DashboardFilter[]>();
    for (const f of [...filters].sort((a, b) => a.sort_order - b.sort_order)) {
      if (f.group_name) {
        if (!grouped.has(f.group_name)) grouped.set(f.group_name, []);
        grouped.get(f.group_name)!.push(f);
      } else {
        standalone.push(f);
      }
    }
    return { standaloneFilters: standalone, groupedFilters: grouped };
  }, [filters]);

  const handleToggleCollapse = useCallback((groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      const wasCollapsed = next.has(groupName);
      if (wasCollapsed) next.delete(groupName);
      else next.add(groupName);

      // Persist collapsed state + update item height for expand
      const collapsed = Array.from(next);
      const savedItems = (dashboard.filter_layout?.items as RGLLayoutItem[]) || [];
      const items = savedItems.map((item) => {
        if (item.i !== `group_${groupName}`) return item;
        if (!wasCollapsed) return { ...item, h: 1 }; // collapsing
        // expanding — restore proper height
        const count = filters?.filter((f) => f.group_name === groupName).length ?? 0;
        const h = Math.max(2, Math.ceil((count * 60 + 40) / 90));
        return { ...item, h };
      });

      updateDashboard.mutate({
        id: dashboard.id,
        data: { filter_layout: { ...dashboard.filter_layout, collapsed, items } },
      });
      return next;
    });
  }, [dashboard.id, dashboard.filter_layout, filters, updateDashboard]);

  // Sync draft from active filters when they change externally
  useEffect(() => {
    setDraftFilters({ ...activeFilters });
  }, [activeFilters]);

  const updateDraft = useCallback((column: string, value: unknown) => {
    setDraftFilters((prev) => {
      const next = { ...prev };
      if (value === null || value === undefined) {
        delete next[column];
      } else {
        next[column] = value;
      }
      return next;
    });
  }, []);

  const handleApply = () => {
    onFiltersChange({ ...draftFilters });
  };

  const handleReset = () => {
    setDraftFilters({});
    onFiltersChange({});
  };

  const hasActiveFilters = Object.keys(activeFilters).length > 0;
  const hasDraftChanges =
    JSON.stringify(draftFilters) !== JSON.stringify(activeFilters);

  // Build layout from dashboard.filter_layout.items or auto-generate
  const layout = useMemo(() => {
    if (!filters || filters.length === 0) return [];

    const savedItems = (dashboard.filter_layout?.items as RGLLayoutItem[] | undefined) || [];

    // If we have a saved layout, use it — but reconcile with current filters
    if (savedItems.length > 0) {
      const savedIds = new Set(savedItems.map((item) => item.i));
      const result = [...savedItems.map((item) => ({ ...item, minW: 2, minH: 1 }))];

      // Find the max y and rightmost x for appending new items
      let maxY = 0;
      let maxX = 0;
      for (const item of savedItems) {
        if (item.y > maxY || (item.y === maxY && item.x + item.w > maxX)) {
          maxY = item.y;
          maxX = item.x + item.w;
        }
      }

      // Track which groups already have layout items
      const processedGroups = new Set<string>();

      // Add missing standalone filters and group items
      for (const f of filters) {
        if (f.group_name) {
          // Grouped filter — ensure group has a layout item
          if (processedGroups.has(f.group_name)) continue;
          processedGroups.add(f.group_name);
          const groupKey = `group_${f.group_name}`;
          if (!savedIds.has(groupKey)) {
            const groupSize = filters.filter(
              (gf) => gf.group_name === f.group_name
            ).length;
            const w = 3;
            const h = Math.max(2, Math.ceil((groupSize * 60 + 40) / 90));
            if (maxX + w > 12) {
              maxX = 0;
              maxY += h;
            }
            result.push({
              i: groupKey,
              x: maxX,
              y: maxY,
              w,
              h,
              minW: 2,
              minH: 2,
            });
            maxX += w;
          }
        } else {
          // Standalone filter — ensure it has a layout item
          const key = `filter_${f.id}`;
          if (!savedIds.has(key)) {
            const w = 3;
            if (maxX + w > 12) {
              maxX = 0;
              maxY++;
            }
            result.push({
              i: key,
              x: maxX,
              y: maxY,
              w,
              h: 1,
              minW: 2,
              minH: 1,
            });
            maxX += w;
          }
        }
      }

      // Remove layout items for filters/groups that no longer exist
      const groupNames = new Set(
        filters.map((f) => f.group_name).filter(Boolean)
      );
      const cleanedResult = result.filter((item) => {
        if (item.i.startsWith("group_")) {
          return groupNames.has(item.i.replace("group_", ""));
        }
        // Standalone filters — must exist AND not be in a group
        const filterId = Number(item.i.replace("filter_", ""));
        const filter = filters.find((f) => f.id === filterId);
        return filter && !filter.group_name;
      });

      // Adjust heights for group items based on collapse state
      return cleanedResult.map((item) => {
        if (!item.i.startsWith("group_")) return item;
        const name = item.i.replace("group_", "");
        const isCollapsed = collapsedGroups.has(name);
        if (isCollapsed) return { ...item, h: 1, minH: 1 };
        // Cap oversized saved heights to a reasonable max
        const groupFilters = filters.filter((f) => f.group_name === name);
        const maxH = Math.max(2, Math.ceil((groupFilters.length * 60 + 40) / 90));
        const h = Math.min(item.h, maxH);
        return { ...item, h, minH: 2 };
      });
    }

    // No saved layout — auto-generate
    return generateDefaultLayout(filters);
  }, [filters, dashboard.filter_layout, collapsedGroups]);

  // Auto-save layout when filters are added or removed (reconciliation)
  const prevFilterCountRef = useRef<number>(0);
  useEffect(() => {
    if (!filters || filters.length === 0) return;
    const prevCount = prevFilterCountRef.current;
    prevFilterCountRef.current = filters.length;
    // Skip initial render (prevCount === 0) and only save when count changes
    if (prevCount > 0 && prevCount !== filters.length && layout.length > 0) {
      const items = layout.map((l) => ({
        i: l.i, x: l.x, y: l.y, w: l.w, h: l.h,
      }));
      updateDashboard.mutate({
        id: dashboard.id,
        data: { filter_layout: { items } },
      });
    }
  }, [filters, layout, dashboard.id, updateDashboard]);

  const handleResizeStart = useCallback(() => {
    freezeWidth();
  }, [freezeWidth]);

  // Common save logic for persisting layout
  const saveLayout = useCallback(
    (newLayout: RGLLayoutItem[]) => {
      const items = newLayout.map((l) => ({
        i: l.i, x: l.x, y: l.y, w: l.w, h: l.h,
      }));
      updateDashboard.mutate({
        id: dashboard.id,
        data: { filter_layout: { ...dashboard.filter_layout, items } },
      });
    },
    [dashboard.id, dashboard.filter_layout, updateDashboard]
  );

  // Store layout before drag for reverting
  const handleDragStart2 = useCallback(
    (_layout: RGLLayoutItem[], _oldItem: RGLLayoutItem) => {
      freezeWidth();
      prevLayoutRef.current = _layout.map((l) => ({ ...l }));
    },
    [freezeWidth]
  );

  const handleDragStop = useCallback(
    (newLayout: RGLLayoutItem[], _oldItem: RGLLayoutItem, newItem: RGLLayoutItem, _placeholder: unknown, e: MouseEvent) => {
      unfreezeWidth();
      if (!isEditing) return;

      // Check if dragged standalone filter overlaps another item
      if (newItem.i.startsWith("filter_")) {
        const overlapping = newLayout.find((item) =>
          item.i !== newItem.i &&
          item.x < newItem.x + newItem.w &&
          item.x + item.w > newItem.x &&
          item.y < newItem.y + newItem.h &&
          item.y + item.h > newItem.y
        );

        if (overlapping && (overlapping.i.startsWith("filter_") || overlapping.i.startsWith("group_"))) {
          // Show merge menu at mouse position
          setMergeCandidate({
            source: newItem.i,
            target: overlapping.i,
            position: { x: e.clientX, y: e.clientY },
          });
          return; // Don't save layout yet — wait for user choice
        }
      }

      // Normal save
      saveLayout(newLayout);
    },
    [isEditing, unfreezeWidth, saveLayout]
  );

  const handleResizeStop = useCallback(
    (newLayout: RGLLayoutItem[]) => {
      unfreezeWidth();
      if (!isEditing) return;
      saveLayout(newLayout);
    },
    [isEditing, unfreezeWidth, saveLayout]
  );

  // Merge handler — "stack" or "group" mode
  const handleMerge = useCallback(async (type: "stack" | "group") => {
    if (!mergeCandidate || !filters) return;

    const sourceIds = resolveFilterIds(mergeCandidate.source, filters);
    const targetIds = resolveFilterIds(mergeCandidate.target, filters);
    const allIds = [...new Set([...sourceIds, ...targetIds])];

    let groupName: string;
    if (mergeCandidate.target.startsWith("group_")) {
      // Adding to existing group — keep its name
      groupName = mergeCandidate.target.replace("group_", "");
    } else if (type === "group") {
      const name = prompt("Group name:");
      if (!name) { handleMergeCancel(); return; }
      groupName = name;
    } else {
      groupName = `stack_${Date.now()}`;
    }

    // Update each filter's group_name
    for (const id of allIds) {
      await updateFilter.mutateAsync({ id, group_name: groupName });
    }

    // Update filter_layout.groups
    const groups = { ...groupMeta };
    if (!groups[groupName]) {
      groups[groupName] = { collapsible: type === "group" };
    }
    await updateDashboard.mutateAsync({
      id: dashboard.id,
      data: { filter_layout: { ...dashboard.filter_layout, groups } },
    });

    setMergeCandidate(null);
  }, [mergeCandidate, filters, groupMeta, dashboard, updateFilter, updateDashboard]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMergeCancel = useCallback(() => {
    // Revert to previous layout
    if (prevLayoutRef.current.length > 0) {
      saveLayout(prevLayoutRef.current);
    }
    setMergeCandidate(null);
  }, [saveLayout]);

  // Ungroup/unstack — clear group_name for all filters in a group
  const handleUngroup = useCallback(async (groupName: string) => {
    if (!filters) return;
    const groupFilters = filters.filter((f) => f.group_name === groupName);

    // Clear group_name for all filters in the group
    for (const f of groupFilters) {
      await updateFilter.mutateAsync({ id: f.id, group_name: null });
    }

    // Remove group metadata and collapsed state
    const groups = { ...groupMeta };
    delete groups[groupName];
    const collapsed = [...collapsedGroups].filter((n) => n !== groupName);

    await updateDashboard.mutateAsync({
      id: dashboard.id,
      data: { filter_layout: { ...dashboard.filter_layout, groups, collapsed } },
    });
  }, [filters, groupMeta, collapsedGroups, dashboard, updateFilter, updateDashboard]);

  // Don't render if no filters configured or still loading
  if (isLoading) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        <span className="text-sm text-slate-400">{td("loadingFilters")}</span>
      </div>
    );
  }

  if (!filters || filters.length === 0) {
    return null;
  }

  const hasRequiredEmpty = filters.some((f) => {
    return (f.config as any)?.is_required && !draftFilters[f.id];
  });

  // Build active filter chips for the indicator bar (not a hook — after early returns)
  const activeChips = !hasActiveFilters
    ? []
    : filters
        .filter((f) => activeFilters[f.id] != null)
        .map((f) => {
          const val = activeFilters[f.id];
          let display: string;
          if (Array.isArray(val)) {
            display = val.length <= 2 ? val.join(", ") : td("selectedCount", { count: val.length });
          } else if (typeof val === "object" && val !== null) {
            const obj = val as Record<string, unknown>;
            if ("from" in obj || "to" in obj || "preset" in obj) {
              display = (obj.preset as string) || [obj.from, obj.to].filter(Boolean).join(" — ");
            } else {
              display = [obj.min, obj.max].filter((v) => v != null).join(" — ");
            }
          } else {
            display = String(val);
          }
          return { id: f.id, label: f.label, display };
        });

  return (
    <div className="mb-4">
      {/* Applied filters indicator */}
      {activeChips.length > 0 && !isEditing && (
        <div className="flex flex-wrap items-center gap-2 mt-1 mb-2">
          <Filter className="h-4.5 w-4.5 text-slate-400 shrink-0" />
          {activeChips.map((chip) => (
            <Badge
              key={chip.id}
              variant="secondary"
              className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-sm font-normal"
            >
              <span className="text-slate-500">{chip.label}:</span>
              <span className="font-medium text-slate-700 max-w-[200px] truncate">{chip.display}</span>
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-slate-300/50 text-slate-400 hover:text-slate-600"
                onClick={() => {
                  const next = { ...activeFilters };
                  delete next[chip.id];
                  onFiltersChange(next);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            className="text-sm text-slate-400 hover:text-red-500 hover:underline ml-1"
            onClick={handleReset}
          >
            {tc("reset")}
          </button>
        </div>
      )}

      {/* Filter grid area */}
      <div ref={containerRef} className="rounded-lg border border-slate-200 bg-slate-50">
        <ReactGridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={90}
          width={containerWidth}
          margin={[8, 8]}
          compactType="horizontal"
          isDraggable={isEditing}
          isResizable={isEditing}
          draggableHandle=".filter-drag-handle"
          onDragStart={handleDragStart2}
          onResizeStart={handleResizeStart}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
        >
          {/* Standalone filters */}
          {standaloneFilters.map((filter) => (
            <div key={`filter_${filter.id}`}>
              <FilterCard
                filter={filter}
                value={draftFilters[filter.id]}
                onChange={(val) => updateDraft(String(filter.id), val)}
                activeFilters={draftFilters}
                isEditing={isEditing}
              />
            </div>
          ))}

          {/* Grouped/stacked filters */}
          {Array.from(groupedFilters.entries()).map(([groupName, groupFilters]) => {
            const isCollapsible = groupMeta[groupName]?.collapsible ?? false;
            const isCollapsed = collapsedGroups.has(groupName);

            return (
              <div key={`group_${groupName}`}>
                {isCollapsible ? (
                  <FilterGroupCard
                    groupName={groupName}
                    filters={groupFilters}
                    draftFilters={draftFilters}
                    updateDraft={updateDraft}
                    isEditing={isEditing}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => handleToggleCollapse(groupName)}
                    onUngroup={isEditing ? () => handleUngroup(groupName) : undefined}
                  />
                ) : (
                  <FilterStackCard
                    filters={groupFilters}
                    draftFilters={draftFilters}
                    updateDraft={updateDraft}
                    isEditing={isEditing}
                    onUnstack={isEditing ? () => handleUngroup(groupName) : undefined}
                  />
                )}
              </div>
            );
          })}
        </ReactGridLayout>

        {/* Merge menu — shown when dragging a filter onto another */}
        {mergeCandidate && (
          <div
            className="fixed z-50 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
            style={{ left: mergeCandidate.position.x, top: mergeCandidate.position.y }}
          >
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="justify-start text-xs"
                onClick={() => handleMerge("stack")}
              >
                Stack
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="justify-start text-xs"
                onClick={() => handleMerge("group")}
              >
                Group...
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="justify-start text-xs text-slate-400"
                onClick={handleMergeCancel}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Apply / Reset buttons + Bookmarks — shown in view mode */}
        {!isEditing && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-2">
            <div className="flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <Button size="sm" onClick={handleApply} disabled={!hasDraftChanges || hasRequiredEmpty}>
              {tc("apply")}
            </Button>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" onClick={handleReset}>
                <X className="mr-1 h-3.5 w-3.5" />
                {tc("reset")}
              </Button>
            )}

            {/* Bookmarks */}
            <div className="ml-auto flex items-center gap-1.5">
              {bookmarks && bookmarks.length > 0 && (
                <div className="flex items-center gap-1">
                  {bookmarks.map((bm) => (
                    <div key={bm.id} className="flex items-center gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => onFiltersChange(bm.filter_state)}
                      >
                        <Bookmark className="mr-1 h-3 w-3" />
                        {bm.name}
                      </Button>
                      <button
                        onClick={() => deleteBookmark.mutate(bm.id)}
                        className="rounded p-0.5 text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {showBookmarkInput ? (
                <div className="flex items-center gap-1">
                  <Input
                    className="h-7 w-32 text-xs"
                    placeholder={td("viewName")}
                    value={bookmarkName}
                    onChange={(e) => setBookmarkName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && bookmarkName.trim()) {
                        createBookmark.mutate({ name: bookmarkName.trim(), filter_state: activeFilters });
                        setBookmarkName("");
                        setShowBookmarkInput(false);
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      if (bookmarkName.trim()) {
                        createBookmark.mutate({ name: bookmarkName.trim(), filter_state: activeFilters });
                        setBookmarkName("");
                      }
                      setShowBookmarkInput(false);
                    }}
                  >
                    <Save className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowBookmarkInput(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setShowBookmarkInput(true)}
                  disabled={!hasActiveFilters}
                >
                  <Save className="mr-1 h-3 w-3" />
                  {td("saveView")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
