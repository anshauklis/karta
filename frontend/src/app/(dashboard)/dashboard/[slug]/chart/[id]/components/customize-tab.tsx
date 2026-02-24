"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ColorPicker } from "@/components/ui/color-picker";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  TrendingUp,
  ChevronDown,
  Settings2,
  Sliders,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ColumnFormatsTable } from "./column-formats-table";
import { COLOR_PALETTES, SUPPORTS_STACK, SUPPORTS_SORT, SUPPORTS_OVERLAYS } from "../lib/constants";
import { FORMAT_PRESETS, d3Format } from "@/lib/d3-format";
import type { ColumnFormat, ConditionalFormatRule, ChartExecuteResult } from "@/types";
import type { PivotValueFormat } from "@/components/charts/data-table";

/* ---- Pivot Filter Section (reusable for rows & columns) ---- */
function PivotFilterSection({
  label,
  configKey,
  chartConfig,
  updateConfig,
  result,
  extractValues,
  searchPlaceholder,
  showAllLabel,
}: {
  label: string;
  configKey: string;
  chartConfig: Record<string, unknown>;
  updateConfig: (key: string, value: unknown) => void;
  result: ChartExecuteResult | null;
  extractValues: (res: ChartExecuteResult) => string[];
  searchPlaceholder: string;
  showAllLabel: string;
}) {
  const [search, setSearch] = useState("");
  const uniqueValues = useMemo(
    () => (result ? extractValues(result) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result],
  );

  if (uniqueValues.length === 0) return null;

  const selected = (chartConfig[configKey] as string[]) || [];
  const showSearch = uniqueValues.length > 8;
  const filtered = search
    ? uniqueValues.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : uniqueValues;

  const toggleValue = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    updateConfig(configKey, next.length > 0 ? next : null);
  };

  const clearAll = () => updateConfig(configKey, null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
        {selected.length > 0 && (
          <button onClick={clearAll} className="text-[10px] text-primary hover:underline">
            {showAllLabel}
          </button>
        )}
      </div>
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded border border-border bg-muted/50 pl-6 pr-2 py-1 text-[10px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}
      <div className="max-h-32 overflow-y-auto space-y-0.5">
        {filtered.map((val) => {
          const isChecked = selected.length === 0 || selected.includes(val);
          return (
            <label key={val} className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => {
                  if (selected.length === 0) {
                    updateConfig(configKey, uniqueValues.filter((v) => v !== val));
                  } else {
                    toggleValue(val);
                  }
                }}
                className="h-3 w-3"
              />
              <span className="text-muted-foreground truncate">{val}</span>
            </label>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="text-[9px] text-muted-foreground/70">
          {selected.length} / {uniqueValues.length}
        </div>
      )}
    </div>
  );
}

export interface CustomizeTabProps {
  chartConfig: Record<string, unknown>;
  chartType: string;
  result: ChartExecuteResult | null;
  availableColumns: string[];
  customizeSubTab: "formatting" | "overlays" | "advanced";
  setCustomizeSubTab: (v: "formatting" | "overlays" | "advanced") => void;
  fmtSelectedCols: string[];
  setFmtSelectedCols: (v: string[]) => void;
  isPivot: boolean;
  showStyling: boolean;
  showConditionalFormatting: boolean;
  tooltipOpen: boolean;
  setTooltipOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  statsOpen: boolean;
  setStatsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  transformsOpen: boolean;
  setTransformsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  refLinesOpen: boolean;
  setRefLinesOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  formattingRules: ConditionalFormatRule[];
  addFormattingRule: () => void;
  removeFormattingRule: (idx: number) => void;
  updateFormattingRule: (idx: number, patch: Partial<ConditionalFormatRule>) => void;
  addThresholdSubRule: (ruleIdx: number) => void;
  removeThresholdSubRule: (ruleIdx: number, subIdx: number) => void;
  updateThresholdSubRule: (ruleIdx: number, subIdx: number, patch: Record<string, unknown>) => void;
  updateConfig: (key: string, value: unknown) => void;
}

export function CustomizeTab({
  chartConfig,
  chartType,
  result,
  availableColumns,
  customizeSubTab,
  setCustomizeSubTab,
  fmtSelectedCols,
  setFmtSelectedCols,
  isPivot,
  showStyling,
  showConditionalFormatting,
  tooltipOpen,
  setTooltipOpen,
  statsOpen,
  setStatsOpen,
  transformsOpen,
  setTransformsOpen,
  refLinesOpen,
  setRefLinesOpen,
  formattingRules,
  addFormattingRule,
  removeFormattingRule,
  updateFormattingRule,
  addThresholdSubRule,
  removeThresholdSubRule,
  updateThresholdSubRule,
  updateConfig,
}: CustomizeTabProps) {
  const tp = useTranslations("pivot");
  return (
    <div className="space-y-4">
      {/* Sub-tabs within Customize */}
      <Tabs value={customizeSubTab} onValueChange={(v) => setCustomizeSubTab(v as typeof customizeSubTab)}>
        <TabsList className="w-full">
          <TabsTrigger value="formatting" className="flex-1 text-xs">Formatting</TabsTrigger>
          <TabsTrigger value="overlays" className="flex-1 text-xs">Overlays</TabsTrigger>
          <TabsTrigger value="advanced" className="flex-1 text-xs">Advanced</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* === Column Formats (per-column table) === */}
      {customizeSubTab === "formatting" && availableColumns.length > 0 && (
        <ColumnFormatsTable
          columns={availableColumns}
          formats={(chartConfig.column_formats as Record<string, ColumnFormat>) || {}}
          result={result}
          selectedCols={fmtSelectedCols}
          onSelectedColsChange={setFmtSelectedCols}
          onFormatChange={(formats) => updateConfig("column_formats", formats)}
          aliases={(chartConfig.column_aliases as Record<string, string>) || {}}
          onAliasChange={(aliases) => updateConfig("column_aliases", aliases)}
        />
      )}

      {/* Styling section -- hide for table/pivot/kpi */}
      {customizeSubTab === "formatting" && !isPivot && availableColumns.length > 0 && showStyling && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <Label className="text-xs font-semibold text-muted-foreground">Styling</Label>

          {/* Stack Mode -- only for bar/area */}
          {SUPPORTS_STACK.includes(chartType) && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Stack Mode</span>
              <div className="flex gap-1">
                {(["none", "stacked", "percent"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => updateConfig("stack_mode", m)}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      (chartConfig.stack_mode || "none") === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {m === "none" ? "Group" : m === "stacked" ? "Stack" : "100%"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sort Order */}
          {SUPPORTS_SORT.includes(chartType) && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Sort</span>
              <div className="flex gap-1">
                {(["none", "asc", "desc"] as const).map((s) => {
                  const Icon = s === "asc" ? ArrowUp : s === "desc" ? ArrowDown : ArrowUpDown;
                  const label = s === "none" ? "None" : s === "asc" ? "Asc" : "Desc";
                  return (
                    <button
                      key={s}
                      onClick={() => updateConfig("sort_order", s)}
                      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                        (chartConfig.sort_order || "none") === s
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Show Values */}
          <div className="flex items-center gap-2 text-xs">
            <Switch
              checked={(chartConfig.show_values as boolean) || false}
              onCheckedChange={(v) => updateConfig("show_values", v)}
              className="scale-75"
            />
            <span className="text-muted-foreground">Show values</span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 text-xs">
            <Switch
              checked={(chartConfig.show_legend as boolean) ?? true}
              onCheckedChange={(v) => updateConfig("show_legend", v)}
              className="scale-75"
            />
            <span className="text-muted-foreground">Show legend</span>
          </div>

          {/* Legend Position */}
          {(chartConfig.show_legend !== false) && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Legend Position</span>
              <div className="flex gap-1">
                {(["auto", "top", "bottom", "left", "right"] as const).map(pos => (
                  <button key={pos}
                    onClick={() => updateConfig("legend_position", pos)}
                    className={`rounded-md border px-2 py-1 text-xs capitalize transition-colors ${
                      (chartConfig.legend_position || "auto") === pos
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color Palette */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Color Palette</span>
            <div className="flex gap-2">
              {COLOR_PALETTES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => updateConfig("color_palette", p.value)}
                  title={p.label}
                  className={`flex gap-0.5 rounded-md border p-1 transition-colors ${
                    (chartConfig.color_palette || "default") === p.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {p.colors.map((c, i) => (
                    <div
                      key={i}
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </button>
              ))}
            </div>
          </div>

          {/* Per-value Color Mapping */}
          {(chartConfig.color_column as string) && result?.rows && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Color Mapping</span>
              <div className="space-y-0.5">
                {(() => {
                  const colorCol = chartConfig.color_column as string;
                  const colIdx = result.columns.indexOf(colorCol);
                  if (colIdx < 0) return null;
                  const uniqueVals = [...new Set(result.rows.map(r => String(r[colIdx])))].slice(0, 20);
                  const colorMap = (chartConfig.color_map as Record<string, string>) || {};
                  return uniqueVals.map(val => (
                    <div key={val} className="flex items-center gap-1.5">
                      <ColorPicker
                        value={colorMap[val] || "#636EFA"}
                        onChange={(c) => updateConfig("color_map", { ...colorMap, [val]: c })}
                        className="h-5 w-5"
                      />
                      <span className="text-[10px] text-muted-foreground truncate">{val}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Number Format -- D3-style */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Number Format</span>
            <Select
              value={(chartConfig.number_format as string) || "auto"}
              onValueChange={(v) => updateConfig("number_format", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <div className="flex items-center justify-between gap-3 w-full">
                      <span>{p.label}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">{p.example}</span>
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="_custom_">Custom...</SelectItem>
              </SelectContent>
            </Select>
            {(chartConfig.number_format as string) === "_custom_" && (
              <Input
                className="h-7 text-xs font-mono"
                placeholder="e.g. $,.2f or .1%"
                value={(chartConfig.custom_number_format as string) || ""}
                onChange={(e) => updateConfig("custom_number_format", e.target.value)}
              />
            )}
            {/* Live preview */}
            {(() => {
              const fmt = (chartConfig.number_format as string) === "_custom_"
                ? (chartConfig.custom_number_format as string) || ""
                : (chartConfig.number_format as string) || "auto";
              const sampleVal = result?.rows?.[0]
                ? (() => {
                    const yCols = (chartConfig.y_columns as string[]) || [];
                    const yIdx = yCols.length > 0 && result.columns
                      ? result.columns.indexOf(yCols[0])
                      : -1;
                    const raw = yIdx >= 0 ? result.rows[0][yIdx] : null;
                    return typeof raw === "number" ? raw : null;
                  })()
                : null;
              if (sampleVal !== null && fmt) {
                return (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>Preview:</span>
                    <span className="font-mono text-foreground">{d3Format(sampleVal, fmt)}</span>
                    <span className="text-muted-foreground/50">({sampleVal})</span>
                  </div>
                );
              }
              return null;
            })()}
          </div>

          {/* Date Format */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Date Format</span>
            <Select
              value={(chartConfig.date_format as string) || "adaptive"}
              onValueChange={(v) => updateConfig("date_format", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adaptive">Adaptive</SelectItem>
                <SelectItem value="YYYY-MM-DD">2024-01-15</SelectItem>
                <SelectItem value="DD.MM.YYYY">15.01.2024</SelectItem>
                <SelectItem value="MM/DD/YYYY">01/15/2024</SelectItem>
                <SelectItem value="DD Mon YYYY">15 Jan 2024</SelectItem>
                <SelectItem value="Mon YYYY">Jan 2024</SelectItem>
                <SelectItem value="YYYY">2024</SelectItem>
                <SelectItem value="_custom_date_">Custom...</SelectItem>
              </SelectContent>
            </Select>
            {(chartConfig.date_format as string) === "_custom_date_" && (
              <Input
                className="h-7 text-xs font-mono"
                placeholder="e.g. %Y-%m-%d %H:%M"
                value={(chartConfig.custom_date_format as string) || ""}
                onChange={(e) => updateConfig("custom_date_format", e.target.value)}
              />
            )}
          </div>

          {/* Currency -- compact icon-only */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Currency</span>
            <div className="flex gap-0.5">
              {[
                { value: "", symbol: "\u2014", tip: "None" },
                { value: "$", symbol: "$", tip: "US Dollar" },
                { value: "\u20ac", symbol: "\u20ac", tip: "Euro" },
                { value: "\u00a3", symbol: "\u00a3", tip: "British Pound" },
                { value: "\u00a5", symbol: "\u00a5", tip: "Japanese Yen" },
                { value: "\u20bd", symbol: "\u20bd", tip: "Russian Ruble" },
              ].map((c) => (
                <button
                  key={c.value || "_none"}
                  title={c.tip}
                  onClick={() => updateConfig("currency_symbol", c.value)}
                  className={`h-7 w-7 rounded border text-xs font-medium transition-colors ${
                    ((chartConfig.currency_symbol as string) || "") === c.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {c.symbol}
                </button>
              ))}
            </div>
          </div>

          {/* Axis Labels -- inline */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">X</span>
            <Input
              className="h-7 text-xs"
              value={(chartConfig.x_axis_label as string) || ""}
              onChange={(e) => updateConfig("x_axis_label", e.target.value)}
              placeholder="Auto"
            />
            <span className="text-xs text-muted-foreground shrink-0">Y</span>
            <Input
              className="h-7 text-xs"
              value={(chartConfig.y_axis_label as string) || ""}
              onChange={(e) => updateConfig("y_axis_label", e.target.value)}
              placeholder="Auto"
            />
          </div>

          {/* Tooltip columns -- collapsible */}
          {availableColumns.length > 0 && (() => {
            const tooltipCols = ((chartConfig.tooltip as Record<string, unknown>)?.columns as string[]) || [];
            const tooltipCount = tooltipCols.length;
            return (
            <Collapsible open={tooltipOpen} onOpenChange={setTooltipOpen} className="space-y-1">
              <CollapsibleTrigger className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground group">
                <span className="flex items-center gap-1">
                  Tooltip {tooltipCount > 0 && <span className="rounded bg-primary/10 px-1 text-[10px] text-primary">{tooltipCount}</span>}
                </span>
                <ChevronDown className="h-3 w-3 transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1">
                <div className="flex flex-wrap gap-1">
                  {availableColumns.map((col) => {
                    const active = tooltipCols.includes(col);
                    return (
                      <button
                        key={col}
                        onClick={() => {
                          const newCols = active ? tooltipCols.filter((c) => c !== col) : [...tooltipCols, col];
                          updateConfig("tooltip", { ...((chartConfig.tooltip as Record<string, unknown>) || {}), columns: newCols });
                        }}
                        className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                          active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {col}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={((chartConfig.tooltip as Record<string, unknown>)?.hide as boolean) || false}
                    onCheckedChange={(v) => updateConfig("tooltip", { ...((chartConfig.tooltip as Record<string, unknown>) || {}), hide: v, columns: [] })}
                    className="scale-75"
                  />
                  <span className="text-muted-foreground">Hide tooltip</span>
                </div>
              </CollapsibleContent>
            </Collapsible>
            );
          })()}

          {/* Reference Lines -- collapsible */}
          <Collapsible open={refLinesOpen} onOpenChange={setRefLinesOpen} className="space-y-1">
            <div className="flex items-center justify-between">
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground group">
                <ChevronDown className="h-3 w-3 transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
                Reference Lines
                {((chartConfig.reference_lines as Array<Record<string, unknown>>) || []).length > 0 && (
                  <span className="rounded bg-primary/10 px-1 text-[10px] text-primary">{((chartConfig.reference_lines as Array<Record<string, unknown>>) || []).length}</span>
                )}
              </CollapsibleTrigger>
              <button
                onClick={() => {
                  const lines = ((chartConfig.reference_lines as Array<Record<string, unknown>>) || []);
                  updateConfig("reference_lines", [...lines, { type: "horizontal", value: "", label: "", color: "#EF553B" }]);
                  setRefLinesOpen(true);
                }}
                className="text-xs text-primary hover:underline"
              >
                + Add
              </button>
            </div>
            <CollapsibleContent>
            {((chartConfig.reference_lines as Array<Record<string, unknown>>) || []).map((rl, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Select
                  value={(rl.type as string) || "horizontal"}
                  onValueChange={(v) => {
                    const lines = [...((chartConfig.reference_lines as Array<Record<string, unknown>>) || [])];
                    lines[idx] = { ...lines[idx], type: v };
                    updateConfig("reference_lines", lines);
                  }}
                >
                  <SelectTrigger size="xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horizontal">H</SelectItem>
                    <SelectItem value="vertical">V</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-6 w-16 text-[10px]"
                  placeholder="Value"
                  value={(rl.value as string) ?? ""}
                  onChange={(e) => {
                    const lines = [...((chartConfig.reference_lines as Array<Record<string, unknown>>) || [])];
                    lines[idx] = { ...lines[idx], value: e.target.value };
                    updateConfig("reference_lines", lines);
                  }}
                />
                <Input
                  className="h-6 flex-1 text-[10px]"
                  placeholder="Label"
                  value={(rl.label as string) || ""}
                  onChange={(e) => {
                    const lines = [...((chartConfig.reference_lines as Array<Record<string, unknown>>) || [])];
                    lines[idx] = { ...lines[idx], label: e.target.value };
                    updateConfig("reference_lines", lines);
                  }}
                />
                <ColorPicker
                  value={(rl.color as string) || "#EF553B"}
                  onChange={(c) => {
                    const lines = [...((chartConfig.reference_lines as Array<Record<string, unknown>>) || [])];
                    lines[idx] = { ...lines[idx], color: c };
                    updateConfig("reference_lines", lines);
                  }}
                />
                <button
                  onClick={() => {
                    const lines = ((chartConfig.reference_lines as Array<Record<string, unknown>>) || []).filter((_, i) => i !== idx);
                    updateConfig("reference_lines", lines);
                  }}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* === Statistical Overlays === */}
      {customizeSubTab === "overlays" && !isPivot && availableColumns.length > 0 && SUPPORTS_OVERLAYS.includes(chartType) && (
        <Collapsible open={statsOpen} onOpenChange={setStatsOpen} className="rounded-md border border-border">
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <CollapsibleTrigger className="flex items-center gap-1.5 font-semibold text-muted-foreground group">
              <ChevronDown className="h-3 w-3 transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
              <TrendingUp className="h-3 w-3" />
              Statistics
              {((chartConfig.overlays as Array<Record<string, unknown>>) || []).length > 0 && (
                <span className="rounded bg-primary/10 px-1 text-[10px] text-primary font-normal normal-case ml-1">
                  {((chartConfig.overlays as Array<Record<string, unknown>>) || []).length}
                </span>
              )}
            </CollapsibleTrigger>
            <button onClick={() => {
              const overlays = ((chartConfig.overlays as Array<Record<string, unknown>>) || []);
              updateConfig("overlays", [...overlays, { type: "trendline", color: "#FF6B6B", degree: 1 }]);
              setStatsOpen(true);
            }} className="text-xs text-primary hover:underline">+ Add</button>
          </div>
          <CollapsibleContent>
          <div className="px-3 pb-3 space-y-1.5">
          {((chartConfig.overlays as Array<Record<string, unknown>>) || []).map((ov, idx) => {
            const overlays = (chartConfig.overlays as Array<Record<string, unknown>>) || [];
            const updateOverlay = (patch: Record<string, unknown>) => {
              const updated = overlays.map((o, i) => (i === idx ? { ...o, ...patch } : o));
              updateConfig("overlays", updated);
            };
            const removeOverlay = () => {
              updateConfig("overlays", overlays.filter((_, i) => i !== idx));
            };
            return (
              <div key={idx} className="space-y-1.5 rounded border border-border bg-muted/50 p-2">
                <div className="flex items-center gap-1">
                  <Select
                    value={(ov.type as string) || "trendline"}
                    onValueChange={(v) => updateOverlay({ type: v })}
                  >
                    <SelectTrigger size="xs" className="flex-1 bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trendline">Trendline</SelectItem>
                      <SelectItem value="moving_average">Moving Average</SelectItem>
                      <SelectItem value="confidence_band">Confidence Band</SelectItem>
                      <SelectItem value="anomalies">Anomaly Detection</SelectItem>
                      <SelectItem value="forecast">Forecast</SelectItem>
                    </SelectContent>
                  </Select>
                  <ColorPicker
                    value={(ov.color as string) || "#FF6B6B"}
                    onChange={(c) => updateOverlay({ color: c })}
                  />
                  <button onClick={removeOverlay} className="text-red-400 hover:text-red-600">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {/* Type-specific params */}
                {ov.type === "trendline" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Degree</span>
                    <Select
                      value={String((ov.degree as number) || 1)}
                      onValueChange={(v) => updateOverlay({ degree: parseInt(v) })}
                    >
                      <SelectTrigger size="xs" className="h-5 bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Linear</SelectItem>
                        <SelectItem value="2">Quadratic</SelectItem>
                        <SelectItem value="3">Cubic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {ov.type === "moving_average" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Window</span>
                    <Input
                      type="number"
                      className="h-5 w-14 text-[10px]"
                      value={(ov.window as number) || 7}
                      onChange={(e) => updateOverlay({ window: parseInt(e.target.value) || 7 })}
                      min={2}
                    />
                    <div className="flex items-center gap-1 text-[10px]">
                      <Switch
                        checked={(ov.ema as boolean) || false}
                        onCheckedChange={(v) => updateOverlay({ ema: v })}
                        className="scale-[0.6]"
                      />
                      EMA
                    </div>
                  </div>
                )}
                {ov.type === "confidence_band" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Window</span>
                    <Input
                      type="number"
                      className="h-5 w-14 text-[10px]"
                      value={(ov.window as number) || 7}
                      onChange={(e) => updateOverlay({ window: parseInt(e.target.value) || 7 })}
                      min={2}
                    />
                    <span className="text-[10px] text-muted-foreground">Std</span>
                    <Select
                      value={String((ov.n_std as number) || 2)}
                      onValueChange={(v) => updateOverlay({ n_std: parseFloat(v) })}
                    >
                      <SelectTrigger size="xs" className="h-5 bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1σ</SelectItem>
                        <SelectItem value="2">2σ</SelectItem>
                        <SelectItem value="3">3σ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {ov.type === "anomalies" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Window</span>
                    <Input
                      type="number"
                      className="h-5 w-14 text-[10px]"
                      value={(ov.window as number) || 14}
                      onChange={(e) => updateOverlay({ window: parseInt(e.target.value) || 14 })}
                      min={2}
                    />
                    <span className="text-[10px] text-muted-foreground">Threshold</span>
                    <Input
                      type="number"
                      className="h-5 w-14 text-[10px]"
                      value={(ov.threshold as number) || 2.5}
                      onChange={(e) => updateOverlay({ threshold: parseFloat(e.target.value) || 2.5 })}
                      step={0.5}
                      min={1}
                    />
                  </div>
                )}
                {ov.type === "forecast" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Periods</span>
                    <Input
                      type="number"
                      className="h-5 w-14 text-[10px]"
                      value={(ov.periods as number) || 7}
                      onChange={(e) => updateOverlay({ periods: parseInt(e.target.value) || 7 })}
                      min={1}
                    />
                    <span className="text-[10px] text-muted-foreground">Method</span>
                    <Select
                      value={(ov.method as string) || "linear"}
                      onValueChange={(v) => updateOverlay({ method: v })}
                    >
                      <SelectTrigger size="xs" className="h-5 bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="linear">Linear</SelectItem>
                        <SelectItem value="holt">Holt-Winters</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })}
          </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* === Data Transforms === */}
      {customizeSubTab === "overlays" && !isPivot && availableColumns.length > 0 && (
        <Collapsible open={transformsOpen} onOpenChange={setTransformsOpen} className="rounded-md border border-border">
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <CollapsibleTrigger className="flex items-center gap-1.5 font-semibold text-muted-foreground group">
              <ChevronDown className="h-3 w-3 transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
              <Settings2 className="h-3 w-3" />
              Transforms
              {((chartConfig.transforms as Array<Record<string, unknown>>) || []).length > 0 && (
                <span className="rounded bg-primary/10 px-1 text-[10px] text-primary font-normal normal-case ml-1">
                  {((chartConfig.transforms as Array<Record<string, unknown>>) || []).length}
                </span>
              )}
            </CollapsibleTrigger>
            <button onClick={() => {
              const transforms = ((chartConfig.transforms as Array<Record<string, unknown>>) || []);
              updateConfig("transforms", [...transforms, { type: "moving_average", column: "", output_column: "", window: 7 }]);
              setTransformsOpen(true);
            }} className="text-xs text-primary hover:underline">+ Add</button>
          </div>
          <CollapsibleContent>
          <div className="px-3 pb-3 space-y-1.5">
          {((chartConfig.transforms as Array<Record<string, unknown>>) || []).map((tr, idx) => {
            const transforms = (chartConfig.transforms as Array<Record<string, unknown>>) || [];
            const updateTransform = (patch: Record<string, unknown>) => {
              const updated = transforms.map((t, i) => (i === idx ? { ...t, ...patch } : t));
              updateConfig("transforms", updated);
            };
            const removeTransform = () => {
              updateConfig("transforms", transforms.filter((_, i) => i !== idx));
            };
            const moveUp = () => {
              if (idx === 0) return;
              const updated = [...transforms];
              [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
              updateConfig("transforms", updated);
            };
            const moveDown = () => {
              if (idx === transforms.length - 1) return;
              const updated = [...transforms];
              [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
              updateConfig("transforms", updated);
            };
            const trType = (tr.type as string) || "moving_average";
            const trCol = (tr.column as string) || "";
            const autoOutput = trCol ? `${trCol}_${trType}` : "";
            const isEnabled = tr.enabled !== false;
            return (
              <div key={idx} className={`space-y-1.5 rounded border p-2 ${isEnabled ? "border-border bg-muted/50" : "border-border/50 bg-muted/20 opacity-60"}`}>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono text-muted-foreground/50 w-4 shrink-0">{idx + 1}</span>
                  <button
                    onClick={() => updateTransform({ enabled: !isEnabled })}
                    className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${isEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                    title={isEnabled ? "Disable" : "Enable"}
                  >
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${isEnabled ? "left-3.5" : "left-0.5"}`} />
                  </button>
                  <Select
                    value={trCol || "_empty_"}
                    onValueChange={(v) => {
                      const col = v === "_empty_" ? "" : v;
                      updateTransform({ column: col, output_column: col ? `${col}_${trType}` : "" });
                    }}
                  >
                    <SelectTrigger size="xs" className="flex-1 bg-card">
                      <SelectValue placeholder="Column..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_empty_">Column...</SelectItem>
                      {availableColumns.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={trType}
                    onValueChange={(v) => {
                      updateTransform({ type: v, output_column: trCol ? `${trCol}_${v}` : "" });
                    }}
                  >
                    <SelectTrigger size="xs" className="flex-1 bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moving_average">Moving Avg</SelectItem>
                      <SelectItem value="ema">EMA</SelectItem>
                      <SelectItem value="pct_change">% Change</SelectItem>
                      <SelectItem value="cumsum">Cumulative</SelectItem>
                      <SelectItem value="z_score">Z-Score</SelectItem>
                      <SelectItem value="yoy">YoY</SelectItem>
                      <SelectItem value="pct_of_total">% of Total</SelectItem>
                      <SelectItem value="rank">Rank</SelectItem>
                      <SelectItem value="diff">Diff</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={moveUp} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up">
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button onClick={moveDown} disabled={idx === transforms.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down">
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button onClick={removeTransform} className="text-red-400 hover:text-red-600" title="Remove">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-1 pl-5">
                  <span className="text-[10px] text-muted-foreground">&rarr;</span>
                  <Input
                    className="h-5 flex-1 text-[10px]"
                    placeholder="Output column"
                    value={(tr.output_column as string) || autoOutput}
                    onChange={(e) => updateTransform({ output_column: e.target.value })}
                  />
                  {(trType === "moving_average" || trType === "ema") && (
                    <>
                      <span className="text-[10px] text-muted-foreground">win</span>
                      <Input
                        type="number"
                        className="h-5 w-12 text-[10px]"
                        value={(tr.window as number) || (tr.span as number) || 7}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 7;
                          updateTransform(trType === "ema" ? { span: v } : { window: v });
                        }}
                        min={2}
                      />
                    </>
                  )}
                  {(trType === "yoy" || trType === "diff") && (
                    <>
                      <span className="text-[10px] text-muted-foreground">periods</span>
                      <Input
                        type="number"
                        className="h-5 w-12 text-[10px]"
                        value={(tr.periods as number) || (trType === "yoy" ? 12 : 1)}
                        onChange={(e) => updateTransform({ periods: parseInt(e.target.value) || 1 })}
                        min={1}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
          </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* === Sort & Subtotals (Pivot/Table only) === */}
      {showConditionalFormatting && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">Sort & Subtotals</p>
          {/* Percentage Mode Toggle */}
          {isPivot && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{tp("valuesAs")}</Label>
              <div className="flex gap-1 flex-wrap">
                {[
                  { value: null, label: tp("absolute") },
                  { value: "row", label: "% " + tp("ofRow") },
                  { value: "column", label: "% " + tp("ofColumn") },
                  { value: "total", label: "% " + tp("ofTotal") },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => updateConfig("pivot_pct_mode", opt.value)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      (chartConfig.pivot_pct_mode || null) === opt.value
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">Sort Rows By</span>
              <Select
                value={(chartConfig.sort_rows as string) || "none"}
                onValueChange={(v) => updateConfig("sort_rows", v)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default</SelectItem>
                  <SelectItem value="key_asc">Key A &rarr; Z</SelectItem>
                  <SelectItem value="key_desc">Key Z &rarr; A</SelectItem>
                  <SelectItem value="value_asc">Value &uarr;</SelectItem>
                  <SelectItem value="value_desc">Value &darr;</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isPivot && (
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Sort Columns By</span>
                <Select
                  value={(chartConfig.sort_columns as string) || "none"}
                  onValueChange={(v) => updateConfig("sort_columns", v)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default</SelectItem>
                    <SelectItem value="key_asc">Key A &rarr; Z</SelectItem>
                    <SelectItem value="key_desc">Key Z &rarr; A</SelectItem>
                    <SelectItem value="value_asc">Value &uarr;</SelectItem>
                    <SelectItem value="value_desc">Value &darr;</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {isPivot && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Row Subtotals</span>
                  <div className="flex gap-1">
                    {(["none", "top", "bottom"] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => updateConfig("row_subtotals", pos)}
                        className={`rounded-md border px-2 py-0.5 text-[10px] capitalize transition-colors ${
                          ((chartConfig.row_subtotals as string) || "none") === pos
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {pos === "none" ? "Off" : pos}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Column Subtotals</span>
                  <div className="flex gap-1">
                    {(["none", "left", "right"] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => updateConfig("col_subtotals", pos)}
                        className={`rounded-md border px-2 py-0.5 text-[10px] capitalize transition-colors ${
                          ((chartConfig.col_subtotals as string) || "none") === pos
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {pos === "none" ? "Off" : pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Grand Total */}
              <div className="flex items-center gap-2 text-xs">
                <Switch
                  checked={(chartConfig.show_grand_total as boolean) || false}
                  onCheckedChange={(v) => updateConfig("show_grand_total", v)}
                  className="scale-75"
                />
                <span className="text-muted-foreground">{tp("grandTotal")}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Column Limit</span>
                <Input
                  type="number"
                  min={0}
                  placeholder="500"
                  value={(chartConfig.pivot_column_limit as number) || ""}
                  onChange={(e) => updateConfig("pivot_column_limit", e.target.value ? Number(e.target.value) : null)}
                  className="h-7 text-xs"
                />
              </div>
              {/* Row/Column Filtering */}
              <PivotFilterSection
                label={tp("filterRows")}
                configKey="pivot_row_filter"
                chartConfig={chartConfig}
                updateConfig={updateConfig}
                result={result}
                extractValues={(res) => {
                  if (!res?.rows?.length || !res.columns?.length) return [];
                  const rowIdxCount = (res.pivot_row_index_count as number | undefined) || 1;
                  const colIdx = Math.min(rowIdxCount - 1, res.columns.length - 1);
                  const vals = new Set<string>();
                  for (const row of res.rows) {
                    const v = row[colIdx];
                    if (v != null) vals.add(String(v));
                  }
                  return [...vals].sort();
                }}
                searchPlaceholder={tp("searchValues")}
                showAllLabel={tp("showAll")}
              />
              <PivotFilterSection
                label={tp("filterColumns")}
                configKey="pivot_col_filter"
                chartConfig={chartConfig}
                updateConfig={updateConfig}
                result={result}
                extractValues={(res) => {
                  if (!res?.pivot_header_levels?.length) return [];
                  // Use the first header level for column groups
                  const topLevel = res.pivot_header_levels[0];
                  const vals = new Set<string>();
                  for (const h of topLevel) {
                    if (h) vals.add(h);
                  }
                  return [...vals].sort();
                }}
                searchPlaceholder={tp("searchValues")}
                showAllLabel={tp("showAll")}
              />

              {/* Post-Processing */}
              {((chartConfig.pivot_values as string[]) || []).length > 0 && (
                <div className="space-y-1.5">
                  <button
                    onClick={() => updateConfig("_pivot_pp_open", !(chartConfig._pivot_pp_open as boolean))}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium hover:text-foreground w-full"
                  >
                    <Settings2 className="h-3 w-3" />
                    {tp("postProcessing")}
                    <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${(chartConfig._pivot_pp_open as boolean) ? "" : "-rotate-90"}`} />
                  </button>
                  {(chartConfig._pivot_pp_open as boolean) && (() => {
                    const pivotVals = (chartConfig.pivot_values as string[]) || [];

                    /* -- Cumulative -- */
                    const cumList = (chartConfig.pivot_cumulative as Array<{ metric: string; func: string }>) || [];
                    const cumEnabled = cumList.length > 0;
                    const cumMetric = cumList[0]?.metric || pivotVals[0] || "";
                    const cumFunc = cumList[0]?.func || "cumsum";

                    /* -- Rolling -- */
                    const rollList = (chartConfig.pivot_rolling as Array<{ metric: string; func: string; window: number }>) || [];
                    const rollEnabled = rollList.length > 0;
                    const rollMetric = rollList[0]?.metric || pivotVals[0] || "";
                    const rollFunc = rollList[0]?.func || "mean";
                    const rollWindow = rollList[0]?.window || 3;

                    /* -- Time Comparison -- */
                    const timeCmp = (chartConfig.pivot_time_compare as { shift: number; mode: string } | null) || null;
                    const timeCmpEnabled = timeCmp !== null;
                    const timeShift = timeCmp?.shift || 1;
                    const timeMode = timeCmp?.mode || "diff";

                    /* -- Rank -- */
                    const rankList = (chartConfig.pivot_rank as Array<{ metric: string; method: string }>) || [];
                    const rankEnabled = rankList.length > 0;
                    const rankMetric = rankList[0]?.metric || pivotVals[0] || "";
                    const rankMethod = rankList[0]?.method || "dense";

                    return (
                      <div className="space-y-2">
                        {/* Cumulative */}
                        <div className="space-y-1 rounded border border-border bg-muted/30 p-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                            <Switch
                              checked={cumEnabled}
                              onCheckedChange={(v) => {
                                if (v) {
                                  updateConfig("pivot_cumulative", [{ metric: pivotVals[0] || "", func: "cumsum" }]);
                                } else {
                                  updateConfig("pivot_cumulative", null);
                                }
                              }}
                              className="scale-[0.6]"
                            />
                            <span className="text-muted-foreground font-medium">{tp("cumulative")}</span>
                          </div>
                          {cumEnabled && (
                            <div className="flex items-center gap-1 pl-[18px]">
                              <Select
                                value={cumMetric}
                                onValueChange={(v) => updateConfig("pivot_cumulative", [{ ...cumList[0], metric: v }])}
                              >
                                <SelectTrigger size="xs" className="flex-1 bg-card">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {pivotVals.map((v) => (
                                    <SelectItem key={v} value={v}>{v}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={cumFunc}
                                onValueChange={(v) => updateConfig("pivot_cumulative", [{ ...cumList[0], func: v }])}
                              >
                                <SelectTrigger size="xs" className="flex-1 bg-card">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="cumsum">{tp("cumsum")}</SelectItem>
                                  <SelectItem value="cumprod">{tp("cumprod")}</SelectItem>
                                  <SelectItem value="cummin">{tp("cummin")}</SelectItem>
                                  <SelectItem value="cummax">{tp("cummax")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>

                        {/* Rolling */}
                        <div className="space-y-1 rounded border border-border bg-muted/30 p-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                            <Switch
                              checked={rollEnabled}
                              onCheckedChange={(v) => {
                                if (v) {
                                  updateConfig("pivot_rolling", [{ metric: pivotVals[0] || "", func: "mean", window: 3 }]);
                                } else {
                                  updateConfig("pivot_rolling", null);
                                }
                              }}
                              className="scale-[0.6]"
                            />
                            <span className="text-muted-foreground font-medium">{tp("rolling")}</span>
                          </div>
                          {rollEnabled && (
                            <div className="flex items-center gap-1 pl-[18px]">
                              <Select
                                value={rollMetric}
                                onValueChange={(v) => updateConfig("pivot_rolling", [{ ...rollList[0], metric: v }])}
                              >
                                <SelectTrigger size="xs" className="flex-1 bg-card">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {pivotVals.map((v) => (
                                    <SelectItem key={v} value={v}>{v}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={rollFunc}
                                onValueChange={(v) => updateConfig("pivot_rolling", [{ ...rollList[0], func: v }])}
                              >
                                <SelectTrigger size="xs" className="bg-card">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="mean">mean</SelectItem>
                                  <SelectItem value="sum">sum</SelectItem>
                                  <SelectItem value="std">std</SelectItem>
                                  <SelectItem value="min">min</SelectItem>
                                  <SelectItem value="max">max</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                min={2}
                                value={rollWindow}
                                onChange={(e) => updateConfig("pivot_rolling", [{ ...rollList[0], window: parseInt(e.target.value) || 3 }])}
                                className="h-6 w-12 text-[10px]"
                              />
                            </div>
                          )}
                        </div>

                        {/* Time Comparison */}
                        <div className="space-y-1 rounded border border-border bg-muted/30 p-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                            <Switch
                              checked={timeCmpEnabled}
                              onCheckedChange={(v) => {
                                if (v) {
                                  updateConfig("pivot_time_compare", { shift: 1, mode: "diff" });
                                } else {
                                  updateConfig("pivot_time_compare", null);
                                }
                              }}
                              className="scale-[0.6]"
                            />
                            <span className="text-muted-foreground font-medium">{tp("timeCompare")}</span>
                          </div>
                          {timeCmpEnabled && (
                            <div className="space-y-1 pl-[18px]">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-muted-foreground shrink-0">{tp("timeShift")}</span>
                                <Input
                                  type="number"
                                  min={1}
                                  value={timeShift}
                                  onChange={(e) => updateConfig("pivot_time_compare", { shift: parseInt(e.target.value) || 1, mode: timeMode })}
                                  className="h-6 w-14 text-[10px]"
                                />
                              </div>
                              <div className="flex gap-1">
                                {(["diff", "pct", "ratio"] as const).map((m) => (
                                  <button
                                    key={m}
                                    onClick={() => updateConfig("pivot_time_compare", { shift: timeShift, mode: m })}
                                    className={`rounded-md border px-2 py-0.5 text-[10px] transition-colors ${
                                      timeMode === m
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border text-muted-foreground hover:border-primary/30"
                                    }`}
                                  >
                                    {m === "diff" ? tp("timeDiff") : m === "pct" ? tp("timePct") : tp("timeRatio")}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Rank */}
                        <div className="space-y-1 rounded border border-border bg-muted/30 p-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                            <Switch
                              checked={rankEnabled}
                              onCheckedChange={(v) => {
                                if (v) {
                                  updateConfig("pivot_rank", [{ metric: pivotVals[0] || "", method: "dense" }]);
                                } else {
                                  updateConfig("pivot_rank", null);
                                }
                              }}
                              className="scale-[0.6]"
                            />
                            <span className="text-muted-foreground font-medium">{tp("rank")}</span>
                          </div>
                          {rankEnabled && (
                            <div className="flex items-center gap-1 pl-[18px]">
                              <Select
                                value={rankMetric}
                                onValueChange={(v) => updateConfig("pivot_rank", [{ ...rankList[0], metric: v }])}
                              >
                                <SelectTrigger size="xs" className="flex-1 bg-card">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {pivotVals.map((v) => (
                                    <SelectItem key={v} value={v}>{v}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={rankMethod}
                                onValueChange={(v) => updateConfig("pivot_rank", [{ ...rankList[0], method: v }])}
                              >
                                <SelectTrigger size="xs" className="flex-1 bg-card">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="dense">dense</SelectItem>
                                  <SelectItem value="min">min</SelectItem>
                                  <SelectItem value="max">max</SelectItem>
                                  <SelectItem value="average">average</SelectItem>
                                  <SelectItem value="first">first</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Value Metrics: rename, visibility & subtotal function */}
              {((chartConfig.pivot_values as string[]) || []).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Value Metrics</span>
                  {((chartConfig.pivot_values as string[]) || []).map((val) => {
                    const labels = (chartConfig.pivot_value_labels as Record<string, string>) || {};
                    const visible = (chartConfig.pivot_values_visible as string[]) || [];
                    const allVisible = visible.length === 0;
                    const isVisible = allVisible || visible.includes(val);
                    const subtotalFuncs = (chartConfig.pivot_subtotal_funcs as Record<string, string>) || {};
                    const currentFunc = subtotalFuncs[val] || "sum";
                    return (
                      <div key={val} className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const currentVisible = (chartConfig.pivot_values_visible as string[]) || [];
                              const allVals = (chartConfig.pivot_values as string[]) || [];
                              if (currentVisible.length === 0) {
                                // First click: show all except this one
                                updateConfig("pivot_values_visible", allVals.filter((v) => v !== val));
                              } else if (currentVisible.includes(val)) {
                                const next = currentVisible.filter((v) => v !== val);
                                updateConfig("pivot_values_visible", next.length === 0 ? null : next);
                              } else {
                                const next = [...currentVisible, val];
                                updateConfig("pivot_values_visible", next.length === allVals.length ? null : next);
                              }
                            }}
                            className={`h-4 w-4 shrink-0 rounded border text-[8px] flex items-center justify-center transition-colors ${
                              isVisible
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border text-transparent"
                            }`}
                          >
                            ✓
                          </button>
                          <span className="text-[10px] text-muted-foreground shrink-0 max-w-[60px] truncate" title={val}>
                            {val}
                          </span>
                          <Input
                            placeholder={val}
                            value={labels[val] || ""}
                            onChange={(e) => {
                              const next = { ...labels };
                              if (e.target.value) {
                                next[val] = e.target.value;
                              } else {
                                delete next[val];
                              }
                              updateConfig("pivot_value_labels", Object.keys(next).length ? next : null);
                            }}
                            className="h-6 text-[10px] flex-1 min-w-0"
                          />
                          <Select
                            value={currentFunc}
                            onValueChange={(v) => {
                              const next = { ...subtotalFuncs, [val]: v };
                              if (v === "sum") delete next[val];
                              updateConfig("pivot_subtotal_funcs", Object.keys(next).length ? next : null);
                            }}
                          >
                            <SelectTrigger size="xs" className="bg-card shrink-0" title={tp("subtotalFunc")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sum">sum</SelectItem>
                              <SelectItem value="avg">avg</SelectItem>
                              <SelectItem value="min">min</SelectItem>
                              <SelectItem value="max">max</SelectItem>
                              <SelectItem value="count">count</SelectItem>
                              <SelectItem value="formula">{tp("formula")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {currentFunc === "formula" && (
                          <Input
                            placeholder="e.g. sum(clicks) / sum(impressions)"
                            value={(() => {
                              const formulas = (chartConfig.pivot_subtotal_formulas as Record<string, string>) || {};
                              return formulas[val] || "";
                            })()}
                            onChange={(e) => {
                              const formulas = (chartConfig.pivot_subtotal_formulas as Record<string, string>) || {};
                              const next = { ...formulas };
                              if (e.target.value) {
                                next[val] = e.target.value;
                              } else {
                                delete next[val];
                              }
                              updateConfig("pivot_subtotal_formulas", Object.keys(next).length ? next : null);
                            }}
                            className="h-6 text-[10px] ml-[22px]"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Per-metric value formatting */}
              {((chartConfig.pivot_values as string[]) || []).length > 0 && (
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      // Toggle open/close by checking if any formats exist
                      const cur = (chartConfig._pivot_fmt_open as boolean) ?? false;
                      updateConfig("_pivot_fmt_open", !cur);
                    }}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium hover:text-foreground w-full"
                  >
                    <Sliders className="h-3 w-3" />
                    {tp("valueFormatting")}
                    <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${(chartConfig._pivot_fmt_open as boolean) ? "" : "-rotate-90"}`} />
                  </button>
                  {(chartConfig._pivot_fmt_open as boolean) && ((chartConfig.pivot_values as string[]) || []).map((val) => {
                    const formats = (chartConfig.pivot_value_formats as Record<string, PivotValueFormat>) || {};
                    const fmt = formats[val] || {};
                    const updateFmt = (patch: Partial<PivotValueFormat>) => {
                      const next = { ...formats, [val]: { ...fmt, ...patch } };
                      updateConfig("pivot_value_formats", next);
                    };
                    return (
                      <div key={val} className="space-y-1 rounded border border-border bg-muted/30 p-1.5">
                        <span className="text-[10px] text-muted-foreground font-medium truncate block" title={val}>{val}</span>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-muted-foreground">{tp("decimals")}</span>
                            <Input
                              type="number"
                              min={0}
                              max={6}
                              className="h-6 text-[10px]"
                              value={fmt.decimals ?? ""}
                              onChange={(e) => updateFmt({ decimals: e.target.value !== "" ? Number(e.target.value) : undefined })}
                              placeholder="Auto"
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-muted-foreground">{tp("prefix")}</span>
                            <Input
                              className="h-6 text-[10px]"
                              value={fmt.prefix || ""}
                              onChange={(e) => updateFmt({ prefix: e.target.value || undefined })}
                              placeholder="$, \u20BD..."
                            />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-muted-foreground">{tp("suffix")}</span>
                            <Input
                              className="h-6 text-[10px]"
                              value={fmt.suffix || ""}
                              onChange={(e) => updateFmt({ suffix: e.target.value || undefined })}
                              placeholder="%, pcs..."
                            />
                          </div>
                          <div className="flex items-end pb-0.5">
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <Switch
                                checked={fmt.thousands_separator || false}
                                onCheckedChange={(v) => updateFmt({ thousands_separator: v })}
                                className="scale-[0.6]"
                              />
                              {tp("thousandsSep")}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pivot Conditional Formatting */}
              {((chartConfig.pivot_values as string[]) || []).length > 0 && (
                <div className="space-y-1.5">
                  <button
                    onClick={() => updateConfig("_pivot_cf_open", !(chartConfig._pivot_cf_open as boolean))}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium hover:text-foreground w-full"
                  >
                    <Sliders className="h-3 w-3" />
                    {tp("condFormatting")}
                    <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${(chartConfig._pivot_cf_open as boolean) ? "" : "-rotate-90"}`} />
                  </button>
                  {(chartConfig._pivot_cf_open as boolean) && (() => {
                    const pivotVals = (chartConfig.pivot_values as string[]) || [];
                    const condFmtRules = (chartConfig.pivot_cond_format as Array<{
                      metric: string;
                      type: "heatmap" | "rule";
                      colorScale?: string;
                      rules?: Array<{ op: string; value: number; color: string }>;
                    }>) || [];

                    const addCondRule = () => {
                      updateConfig("pivot_cond_format", [
                        ...condFmtRules,
                        { metric: pivotVals[0] || "", type: "heatmap" as const, colorScale: "greenRed" },
                      ]);
                    };

                    const updateCondRule = (idx: number, patch: Record<string, unknown>) => {
                      const updated = condFmtRules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
                      updateConfig("pivot_cond_format", updated);
                    };

                    const removeCondRule = (idx: number) => {
                      const updated = condFmtRules.filter((_, i) => i !== idx);
                      updateConfig("pivot_cond_format", updated.length > 0 ? updated : null);
                    };

                    return (
                      <div className="space-y-1.5">
                        <button onClick={addCondRule} className="text-[10px] text-primary hover:underline">
                          + {tp("addRule")}
                        </button>
                        {condFmtRules.map((cfr, idx) => {
                          const cfRules = cfr.rules || [];
                          return (
                            <div key={idx} className="space-y-1 rounded border border-border bg-muted/30 p-1.5">
                              <div className="flex items-center gap-1">
                                <Select
                                  value={cfr.metric}
                                  onValueChange={(v) => updateCondRule(idx, { metric: v })}
                                >
                                  <SelectTrigger size="xs" className="flex-1 bg-card">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {pivotVals.map((v) => (
                                      <SelectItem key={v} value={v}>{v}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <button
                                  onClick={() => removeCondRule(idx)}
                                  className="text-red-400 hover:text-red-600 shrink-0"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="flex gap-1">
                                {(["heatmap", "rule"] as const).map((t) => (
                                  <button
                                    key={t}
                                    onClick={() => {
                                      if (t === "heatmap") {
                                        updateCondRule(idx, { type: t, colorScale: cfr.colorScale || "greenRed" });
                                      } else {
                                        updateCondRule(idx, { type: t, rules: cfr.rules || [{ op: ">", value: 0, color: "#dcfce7" }] });
                                      }
                                    }}
                                    className={`rounded-md border px-2 py-0.5 text-[10px] transition-colors ${
                                      cfr.type === t
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border text-muted-foreground hover:border-primary/30"
                                    }`}
                                  >
                                    {t === "heatmap" ? tp("heatmap") : tp("rule")}
                                  </button>
                                ))}
                              </div>
                              {cfr.type === "heatmap" && (
                                <Select
                                  value={cfr.colorScale || "greenRed"}
                                  onValueChange={(v) => updateCondRule(idx, { colorScale: v })}
                                >
                                  <SelectTrigger size="xs" className="w-full bg-card">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="greenRed">{tp("greenRed")}</SelectItem>
                                    <SelectItem value="redGreen">{tp("redGreen")}</SelectItem>
                                    <SelectItem value="blueWhite">{tp("blueWhite")}</SelectItem>
                                    <SelectItem value="whiteBlue">{tp("whiteBlue")}</SelectItem>
                                    <SelectItem value="yellowRed">{tp("yellowRed")}</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                              {cfr.type === "rule" && (
                                <div className="space-y-1">
                                  {cfRules.map((sub, si) => (
                                    <div key={si} className="flex items-center gap-1">
                                      <Select
                                        value={sub.op}
                                        onValueChange={(v) => {
                                          const updated = cfRules.map((s, i) => (i === si ? { ...s, op: v } : s));
                                          updateCondRule(idx, { rules: updated });
                                        }}
                                      >
                                        <SelectTrigger size="xs" className="bg-card">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{`>`}</SelectItem>
                                          <SelectItem value="<">{`<`}</SelectItem>
                                          <SelectItem value=">=">{`>=`}</SelectItem>
                                          <SelectItem value="<=">{`<=`}</SelectItem>
                                          <SelectItem value="==">=</SelectItem>
                                          <SelectItem value="!=">!=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        value={sub.value}
                                        onChange={(e) => {
                                          const updated = cfRules.map((s, i) => (i === si ? { ...s, value: parseFloat(e.target.value) || 0 } : s));
                                          updateCondRule(idx, { rules: updated });
                                        }}
                                        className="h-6 w-16 text-[10px]"
                                      />
                                      <ColorPicker
                                        value={sub.color || "#dcfce7"}
                                        onChange={(c) => {
                                          const updated = cfRules.map((s, i) => (i === si ? { ...s, color: c } : s));
                                          updateCondRule(idx, { rules: updated });
                                        }}
                                      />
                                      <button
                                        onClick={() => {
                                          const updated = cfRules.filter((_, i) => i !== si);
                                          updateCondRule(idx, { rules: updated });
                                        }}
                                        className="text-red-400 hover:text-red-600"
                                      >
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => {
                                      updateCondRule(idx, { rules: [...cfRules, { op: ">", value: 0, color: "#dcfce7" }] });
                                    }}
                                    className="text-[10px] text-primary hover:underline"
                                  >
                                    + {tp("addRule")}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* === Conditional Formatting === */}
      {customizeSubTab === "formatting" && showConditionalFormatting && availableColumns.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Conditional Formatting</p>
          </div>
          {formattingRules.length === 0 ? (
            <button
              onClick={addFormattingRule}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border py-3 text-xs text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add new color formatter
            </button>
          ) : (
            <button
              onClick={addFormattingRule}
              className="text-xs text-primary hover:underline"
            >
              + Add new color formatter
            </button>
          )}
          {formattingRules.map((rule, idx) => {
            const colOptions = availableColumns;
            return (
              <div key={idx} className="space-y-2 rounded border border-border bg-muted/50 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Rule {idx + 1}</span>
                  <Button size="sm" variant="ghost" onClick={() => removeFormattingRule(idx)} className="h-6 w-6 p-0 text-red-400 hover:text-red-600">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* Column selector -- multi-select chips */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Columns (click to toggle)</span>
                  <div className="flex flex-wrap gap-1">
                    {colOptions.map((col) => {
                      const isActive = rule.column === col || rule.columns?.includes(col);
                      return (
                        <button
                          key={col}
                          onClick={() => {
                            const currentCols = rule.columns || (rule.column ? [rule.column] : []);
                            const newCols = isActive
                              ? currentCols.filter((c) => c !== col)
                              : [...currentCols, col];
                            updateFormattingRule(idx, {
                              column: newCols[0] || "",
                              columns: newCols,
                            });
                          }}
                          className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                            isActive
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          {col}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Type selector */}
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Type</span>
                  <div className="flex gap-1">
                    {(["threshold", "color_scale"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          if (t === "threshold") {
                            updateFormattingRule(idx, { type: t, rules: rule.rules || [{ op: ">", value: 0, color: "#dcfce7", text_color: "" }] });
                          } else {
                            updateFormattingRule(idx, { type: t, min_color: rule.min_color || "#fef2f2", max_color: rule.max_color || "#dc2626" });
                          }
                        }}
                        className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                          rule.type === t
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {t === "threshold" ? "Threshold" : "Color Scale"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Threshold sub-rules */}
                {rule.type === "threshold" && (
                  <div className="space-y-1.5">
                    {(rule.rules || []).map((sub, si) => (
                      <div key={si} className="flex items-center gap-1">
                        <Select
                          value={sub.op}
                          onValueChange={(v) => updateThresholdSubRule(idx, si, { op: v })}
                        >
                          <SelectTrigger size="xs" className="h-7 bg-card">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value=">">{`>`}</SelectItem>
                            <SelectItem value=">=">{`>=`}</SelectItem>
                            <SelectItem value="<">{`<`}</SelectItem>
                            <SelectItem value="<=">{`<=`}</SelectItem>
                            <SelectItem value="=">=</SelectItem>
                            <SelectItem value="!=">!=</SelectItem>
                          </SelectContent>
                        </Select>
                        <input
                          type="number"
                          value={sub.value}
                          onChange={(e) => updateThresholdSubRule(idx, si, { value: parseFloat(e.target.value) || 0 })}
                          className="h-7 w-20 rounded border border-border px-1.5 text-xs"
                          placeholder="Value"
                        />
                        <div className="flex items-center gap-0.5">
                          <span className="text-[10px] text-muted-foreground">bg</span>
                          <ColorPicker
                            value={sub.color || "#dcfce7"}
                            onChange={(c) => updateThresholdSubRule(idx, si, { color: c })}
                            title="Background color"
                          />
                        </div>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[10px] text-muted-foreground">txt</span>
                          <ColorPicker
                            value={sub.text_color || "#000000"}
                            onChange={(c) => updateThresholdSubRule(idx, si, { text_color: c })}
                            title="Text color"
                          />
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => removeThresholdSubRule(idx, si)} className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500">
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    ))}
                    <button
                      onClick={() => addThresholdSubRule(idx)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      + Add condition
                    </button>
                    {/* Miniature preview strip */}
                    {(rule.rules || []).length > 0 && (
                      <div className="flex h-3 w-full overflow-hidden rounded border border-border mt-1">
                        {(rule.rules || []).map((sub, si) => (
                          <div
                            key={si}
                            className="flex-1 flex items-center justify-center"
                            style={{ backgroundColor: sub.color || "#dcfce7", color: sub.text_color || "#000" }}
                            title={`${sub.op} ${sub.value}`}
                          >
                            <span className="text-[7px] font-mono leading-none">{sub.op}{sub.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Color scale config */}
                {rule.type === "color_scale" && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Min</span>
                      <ColorPicker
                        value={rule.min_color || "#fef2f2"}
                        onChange={(c) => updateFormattingRule(idx, { min_color: c })}
                      />
                    </div>
                    <div className="h-3 flex-1 rounded" style={{
                      background: `linear-gradient(to right, ${rule.min_color || "#fef2f2"}, ${rule.max_color || "#dc2626"})`,
                    }} />
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">Max</span>
                      <ColorPicker
                        value={rule.max_color || "#dc2626"}
                        onChange={(c) => updateFormattingRule(idx, { max_color: c })}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* === Advanced Query Settings === */}
      {customizeSubTab === "advanced" && <Collapsible defaultOpen className="space-y-2">
        <CollapsibleTrigger className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
          Advanced Query Settings
        </CollapsibleTrigger>
        <CollapsibleContent>
        <div className="space-y-2 pl-2 pt-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Cache TTL</Label>
            <Select
              value={chartConfig.cache_ttl != null ? String(chartConfig.cache_ttl) : "_auto_"}
              onValueChange={(v) => updateConfig("cache_ttl", v === "_auto_" ? null : parseInt(v))}
            >
              <SelectTrigger size="xs" className="w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_auto_">Auto (dataset)</SelectItem>
                <SelectItem value="0">No cache</SelectItem>
                <SelectItem value="60">1 min</SelectItem>
                <SelectItem value="300">5 min</SelectItem>
                <SelectItem value="600">10 min</SelectItem>
                <SelectItem value="1800">30 min</SelectItem>
                <SelectItem value="3600">1 hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Extra WHERE clause</Label>
            <Input
              className="h-7 text-xs font-mono"
              value={(chartConfig.extra_where as string) || ""}
              onChange={(e) => updateConfig("extra_where", e.target.value)}
              placeholder='status = &apos;active&apos; AND amount > 0'
            />
            <p className="text-[9px] text-muted-foreground">
              Appended to query as WHERE condition.
            </p>
          </div>
        </div>
        </CollapsibleContent>
      </Collapsible>}
    </div>
  );
}
