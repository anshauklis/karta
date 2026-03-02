"use client";

import { useState, useEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  ChevronDown,
  ArrowLeftRight,
  Play,
  Variable,
} from "lucide-react";
import { DropZone } from "./drop-zone";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { ChartExecuteResult, ChartVariable } from "@/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

/** Buffered SQL input — only commits to config on Enter or Apply click */
function SqlInput({
  value,
  onChange,
  placeholder,
  className,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  mono?: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const dirty = local !== value;
  return (
    <div className="flex gap-1 items-center">
      <Input
        className={`${className || "h-7 text-[11px] bg-card"} ${mono ? "font-mono" : ""} flex-1`}
        placeholder={placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onChange(local); }}
      />
      {dirty && (
        <button
          onClick={() => onChange(local)}
          className="shrink-0 p-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          title="Apply (Enter)"
        >
          <Play className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export interface DataTabProps {
  dataSource: string;
  sqlQuery: string;
  setSqlQuery: (v: string) => void;
  handleSqlEditorMount: (editor: unknown, monaco: unknown) => void;
  handleRunQuery: () => void;
  previewing: boolean;
  isDark: boolean;
  chartConfig: Record<string, unknown>;
  updateConfig: (key: string, value: unknown) => void;
  setChartConfig: (cfg: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => void;
  chartType: string;
  availableColumns: string[];
  queryColumns: string[];
  columnTypes: Record<string, string>;
  result: ChartExecuteResult | null;
  isPivot: boolean;
  isTable: boolean;
  isKPI: boolean;
  isHistogram: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  showColor: boolean;
  handleYColumnsChange: (col: string) => void;
  handleMultiSelectToggle: (key: string, col: string) => void;
  variables: ChartVariable[];
  onVariablesChange: (vars: ChartVariable[]) => void;
}

export function DataTab({
  dataSource,
  sqlQuery,
  setSqlQuery,
  handleSqlEditorMount,
  handleRunQuery,
  previewing,
  isDark,
  chartConfig,
  updateConfig,
  setChartConfig,
  chartType,
  availableColumns,
  queryColumns,
  columnTypes: _columnTypes,
  result: _result,
  isPivot,
  isTable,
  isKPI,
  isHistogram,
  showXAxis,
  showYAxis,
  showColor,
  handleYColumnsChange,
  handleMultiSelectToggle,
  variables,
  onVariablesChange,
}: DataTabProps) {
  const t = useTranslations("chart");

  const movePivotField = (item: string, fromKey: string, toKey: string) => {
    setChartConfig((prev: Record<string, unknown>) => {
      const fromArr = ((prev[fromKey] as string[]) || []).filter((c) => c !== item);
      // For duplicates (col__N) moving out of values, use base column name in target
      const dupMatch = item.match(/^(.+)__(\d+)$/);
      const targetItem = (fromKey === "pivot_values" && toKey !== "pivot_values" && dupMatch)
        ? dupMatch[1]
        : item;
      const toArr = (prev[toKey] as string[]) || [];
      const alreadyInTarget = toArr.includes(targetItem);
      const next: Record<string, unknown> = alreadyInTarget
        ? { ...prev, [fromKey]: fromArr }
        : { ...prev, [fromKey]: fromArr, [toKey]: [...toArr, targetItem] };
      // Clean up aggfuncs/custom SQL/pct modes when leaving values
      if (fromKey === "pivot_values") {
        const fns = { ...((prev.pivot_aggfuncs as Record<string, unknown>) || {}) };
        delete fns[item];
        next.pivot_aggfuncs = fns;
        const csql = { ...((prev.pivot_custom_sql as Record<string, string>) || {}) };
        if (item in csql) { delete csql[item]; next.pivot_custom_sql = Object.keys(csql).length ? csql : null; }
        const pct = { ...((prev.pivot_pct_modes as Record<string, string | null>) || {}) };
        if (item in pct) { delete pct[item]; next.pivot_pct_modes = Object.keys(pct).length ? pct : null; }
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
                  {/* SQL Editor (in Data tab when sql mode) */}
                  {dataSource === "sql" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">SQL Query</Label>
                        {isPivot && (
                          <button className="h-6 rounded-md px-2 text-xs text-primary hover:bg-muted/70 disabled:opacity-50" onClick={handleRunQuery} disabled={previewing}>
                            Run Query
                          </button>
                        )}
                      </div>
                      <div className="overflow-hidden rounded-md border border-border">
                        <MonacoEditor
                          height="160px"
                          language="sql"
                          value={sqlQuery}
                          onChange={(v) => setSqlQuery(v || "")}
                          onMount={handleSqlEditorMount}
                          options={{
                            minimap: { enabled: false },
                            lineNumbers: "on",
                            fontSize: 13,
                            scrollBeyondLastLine: false,
                            wordWrap: "on",
                            tabSize: 2,
                          }}
                          theme={isDark ? "vs-dark" : "vs-light"}
                        />
                      </div>
                    </div>
                  )}

                  {/* === SQL Variables === */}
                  {dataSource === "sql" && (() => {
                    // Auto-detect {{ var_name }} placeholders from SQL
                    const detectedNames: string[] = [];
                    const varPattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
                    for (const m of sqlQuery.matchAll(varPattern)) {
                      if (!detectedNames.includes(m[1])) detectedNames.push(m[1]);
                    }
                    if (detectedNames.length === 0) return null;

                    // Sync: ensure every detected var has a definition
                    const currentVars = variables || [];
                    const byName = new Map(currentVars.map(v => [v.name, v]));
                    const synced = detectedNames.map(name =>
                      byName.get(name) || { name, type: "text" as const, default: "", label: "" }
                    );
                    // If synced differs from current, update once
                    const needsSync = synced.length !== currentVars.length ||
                      synced.some((v, i) => v.name !== currentVars[i]?.name);

                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Variable className="h-3.5 w-3.5 text-muted-foreground" />
                          <Label className="text-xs">Variables</Label>
                          <span className="text-[10px] text-muted-foreground">({detectedNames.length})</span>
                          {needsSync && (
                            <button
                              onClick={() => onVariablesChange(synced)}
                              className="ml-auto text-[10px] text-primary hover:underline"
                            >
                              Sync
                            </button>
                          )}
                        </div>
                        {synced.map((v, idx) => (
                          <div key={v.name} className="rounded-md border border-border p-2 space-y-1.5">
                            <div className="flex items-center gap-1">
                              <code className="text-[11px] font-mono text-primary bg-primary/5 px-1.5 py-0.5 rounded">
                                {"{{ "}{v.name}{" }}"}
                              </code>
                              <Select
                                value={v.type || "text"}
                                onValueChange={(val) => {
                                  const updated = [...synced];
                                  updated[idx] = { ...updated[idx], type: val as "text" | "number" | "date" };
                                  onVariablesChange(updated);
                                }}
                              >
                                <SelectTrigger size="xs" className="h-6 w-20 bg-card">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                  <SelectItem value="date">Date</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-6 flex-1 text-[10px] bg-card"
                                placeholder="Default value"
                                value={v.default || ""}
                                onChange={(e) => {
                                  const updated = [...synced];
                                  updated[idx] = { ...updated[idx], default: e.target.value };
                                  onVariablesChange(updated);
                                }}
                              />
                              <Input
                                className="h-6 flex-1 text-[10px] bg-card"
                                placeholder="Label (optional)"
                                value={v.label || ""}
                                onChange={(e) => {
                                  const updated = [...synced];
                                  updated[idx] = { ...updated[idx], label: e.target.value };
                                  onVariablesChange(updated);
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* --- Time group --- */}
                  {availableColumns.length > 0 && (chartConfig.time_column as string) ? (
                    <Collapsible defaultOpen className="rounded-md border border-border">
                      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 select-none">
                        <ChevronDown className="h-3.5 w-3.5 transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
                        Time
                        <span className="ml-auto text-[10px] font-normal normal-case">{(chartConfig.time_grain as string) || "raw"}</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                      <div className="border-t border-border px-3 py-3 space-y-3">
                        {availableColumns.length > 0 && (
                          <div className="space-y-2">
                            <Label>Time Column <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                            <Select
                              value={(chartConfig.time_column as string) || "_none_"}
                              onValueChange={(v) => {
                                updateConfig("time_column", v === "_none_" ? "" : v);
                                if (v === "_none_") updateConfig("time_grain", "raw");
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none_">None</SelectItem>
                                {availableColumns.map((col) => (
                                  <SelectItem key={col} value={col}>{col}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {(chartConfig.time_column as string) && (
                          <div className="space-y-2">
                            <Label>Time Grain</Label>
                            <div className="flex flex-wrap gap-1">
                              {(["raw", "day", "week", "month", "quarter", "year"] as const).map((g) => (
                                <button
                                  key={g}
                                  onClick={() => updateConfig("time_grain", g)}
                                  className={`rounded-md border px-2 py-1 text-xs capitalize transition-colors ${
                                    (chartConfig.time_grain || "raw") === g
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border text-muted-foreground hover:border-primary/30"
                                  }`}
                                >
                                  {g}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {(chartConfig.time_column as string) && (
                          <div className="space-y-2">
                            <Label>Date Format</Label>
                            <Select
                              value={(chartConfig.date_format as string) || "adaptive"}
                              onValueChange={(v) => updateConfig("date_format", v)}
                            >
                              <SelectTrigger className="h-8 text-sm">
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
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        {(chartConfig.time_column as string) && (
                          <div className="space-y-2">
                            <Label>Time Range</Label>
                            <div className="flex flex-wrap gap-1">
                              {(["all", "7d", "30d", "90d", "1y"] as const).map((r) => {
                                const labels: Record<string, string> = {
                                  all: "All", "7d": "7 days", "30d": "30 days", "90d": "90 days", "1y": "1 year"
                                };
                                return (
                                  <button
                                    key={r}
                                    onClick={() => updateConfig("time_range", r)}
                                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                                      (chartConfig.time_range || "all") === r
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border text-muted-foreground hover:border-primary/30"
                                    }`}
                                  >
                                    {labels[r]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : availableColumns.length > 0 ? (
                    <Collapsible className="rounded-md border border-border">
                      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 select-none">
                        <ChevronDown className="h-3.5 w-3.5 transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
                        Time
                        <span className="ml-auto text-[10px] font-normal normal-case">not set</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                      <div className="border-t border-border px-3 py-3 space-y-3">
                        <div className="space-y-2">
                          <Label>Time Column <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                          <Select
                            value="_none_"
                            onValueChange={(v) => {
                              updateConfig("time_column", v === "_none_" ? "" : v);
                              if (v === "_none_") updateConfig("time_grain", "raw");
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none_">None</SelectItem>
                              {availableColumns.map((col) => (
                                <SelectItem key={col} value={col}>{col}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                  {/* --- Visualization group --- */}
                  <Collapsible defaultOpen className="rounded-md border border-border">
                    <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 select-none">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
                      Visualization
                      <span className="ml-auto text-[10px] font-normal normal-case">{t(`types.${chartType}`)}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                    <div className="border-t border-border px-3 py-3 space-y-3">

                  {/* === Pivot config with drop zones === */}
                  {isPivot && queryColumns.length > 0 && (
                    <div className="space-y-3 rounded-md border border-border p-3">
                      <Label className="text-xs font-semibold text-muted-foreground">Pivot Table</Label>

                      <DropZone
                        id="zone-pivot-rows"
                        label="Rows"
                        items={(chartConfig.pivot_rows as string[]) || []}
                        onRemove={(col) => handleMultiSelectToggle("pivot_rows", col)}
                        color="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                        placeholder="Drop row columns here"
                        moveTargets={[
                          { key: "pivot_columns", label: "Move to Columns" },
                          { key: "pivot_values", label: "Move to Values" },
                        ]}
                        onMoveTo={(item, targetKey) => movePivotField(item, "pivot_rows", targetKey)}
                      />

                      {(chartConfig.pivot_rows as string[])?.length > 0 && (chartConfig.pivot_columns as string[])?.length > 0 && (
                        <button
                          onClick={() => {
                            const rows = (chartConfig.pivot_rows as string[]) || [];
                            const cols = (chartConfig.pivot_columns as string[]) || [];
                            setChartConfig((prev: Record<string, unknown>) => ({
                              ...prev,
                              pivot_rows: cols,
                              pivot_columns: rows,
                            }));
                          }}
                          className="mx-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
                          title={t("swapRowsCols")}
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                        </button>
                      )}

                      <DropZone
                        id="zone-pivot-cols"
                        label="Columns (optional)"
                        items={(chartConfig.pivot_columns as string[]) || []}
                        onRemove={(col) => handleMultiSelectToggle("pivot_columns", col)}
                        color="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200"
                        placeholder="Drop column headers here"
                        moveTargets={[
                          { key: "pivot_rows", label: "Move to Rows" },
                          { key: "pivot_values", label: "Move to Values" },
                        ]}
                        onMoveTo={(item, targetKey) => movePivotField(item, "pivot_columns", targetKey)}
                      />

                      <DropZone
                        id="zone-pivot-vals"
                        label="Values"
                        items={(chartConfig.pivot_values as string[]) || []}
                        onRemove={(col) => {
                          handleMultiSelectToggle("pivot_values", col);
                          const fns = { ...((chartConfig.pivot_aggfuncs as Record<string, unknown>) || {}) };
                          delete fns[col];
                          updateConfig("pivot_aggfuncs", fns);
                          // Clean up custom SQL for removed column
                          const csql = { ...((chartConfig.pivot_custom_sql as Record<string, string>) || {}) };
                          if (col in csql) { delete csql[col]; updateConfig("pivot_custom_sql", Object.keys(csql).length ? csql : null); }
                          // Clean up per-column pct mode
                          const pct = { ...((chartConfig.pivot_pct_modes as Record<string, string | null>) || {}) };
                          if (col in pct) { delete pct[col]; updateConfig("pivot_pct_modes", Object.keys(pct).length ? pct : null); }
                        }}
                        color="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                        placeholder="Drop value columns here"
                        getLabel={(col) => {
                          const m = col.match(/^(.+)__(\d+)$/);
                          return m ? `${m[1]} (${m[2]})` : col;
                        }}
                        moveTargets={[
                          { key: "pivot_rows", label: "Move to Rows" },
                          { key: "pivot_columns", label: "Move to Columns" },
                        ]}
                        onMoveTo={(item, targetKey) => movePivotField(item, "pivot_values", targetKey)}
                        renderExtra={(col) => {
                          const rawAggfunc = ((chartConfig.pivot_aggfuncs as Record<string, unknown>) || {})[col];
                          const selectValue = typeof rawAggfunc === "string" ? rawAggfunc : "sum";

                          const pctModes = (chartConfig.pivot_pct_modes as Record<string, string | null>) || {};
                          const globalPct = (chartConfig.pivot_pct_mode as string) || null;
                          const colPct = col in pctModes ? pctModes[col] : undefined;
                          // Effective value: per-column override > global > ABS
                          const effectivePct = colPct !== undefined ? (colPct ?? "_abs_") : (globalPct ?? "_abs_");

                          return (
                            <div className="flex gap-0.5" onPointerDownCapture={(e) => e.stopPropagation()}>
                              <Select
                                value={selectValue}
                                onValueChange={(v) => {
                                  const fns = { ...((chartConfig.pivot_aggfuncs as Record<string, unknown>) || {}) };
                                  fns[col] = v;
                                  updateConfig("pivot_aggfuncs", fns);
                                }}
                              >
                                <SelectTrigger size="xs" className="h-5 uppercase font-medium border-border/50">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="sum">SUM</SelectItem>
                                  <SelectItem value="avg">AVG</SelectItem>
                                  <SelectItem value="count">COUNT</SelectItem>
                                  <SelectItem value="min">MIN</SelectItem>
                                  <SelectItem value="max">MAX</SelectItem>
                                  <SelectItem value="median">MEDIAN</SelectItem>
                                  <SelectItem value="count_distinct">DISTINCT</SelectItem>
                                  <SelectItem value="std">STD DEV</SelectItem>
                                  <SelectItem value="var">VARIANCE</SelectItem>
                                  <SelectItem value="first">FIRST</SelectItem>
                                  <SelectItem value="last">LAST</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={effectivePct}
                                onValueChange={(v) => {
                                  const next = { ...pctModes };
                                  if (v === "_abs_") {
                                    // If global is set, force absolute with null; otherwise just remove override
                                    if (globalPct) {
                                      next[col] = null;
                                    } else {
                                      delete next[col];
                                    }
                                  } else {
                                    next[col] = v;
                                  }
                                  updateConfig("pivot_pct_modes", Object.keys(next).length ? next : null);
                                }}
                              >
                                <SelectTrigger size="xs" className={`h-5 uppercase font-medium border-border/50 ${effectivePct !== "_abs_" ? "text-violet-600 dark:text-violet-400" : ""}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_abs_">ABS</SelectItem>
                                  <SelectItem value="row">% ROW</SelectItem>
                                  <SelectItem value="column">% COL</SelectItem>
                                  <SelectItem value="total">% ALL</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        }}
                        renderExpanded={(col) => {
                          const pivotCustomSql = (chartConfig.pivot_custom_sql as Record<string, string>) || {};
                          const isCustomSql = col in pivotCustomSql;

                          const pctModes = (chartConfig.pivot_pct_modes as Record<string, string | null>) || {};
                          const globalPct = (chartConfig.pivot_pct_mode as string) || null;
                          const colPct = col in pctModes ? pctModes[col] : undefined;

                          const pctOptions = [
                            { value: "_inherit_", label: `Default${globalPct ? ` (% ${globalPct})` : " (ABS)"}` },
                            { value: "_abs_", label: "ABS" },
                            { value: "row", label: "% Row" },
                            { value: "column", label: "% Col" },
                            { value: "total", label: "% Total" },
                          ];

                          return (
                            <div className="space-y-2">
                              {/* Custom SQL toggle */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-muted-foreground font-medium">Expression</span>
                                  <div className="flex gap-0.5 rounded-md border border-border p-0.5">
                                    <button
                                      className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                                        !isCustomSql ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                      onClick={() => {
                                        const next = { ...pivotCustomSql };
                                        delete next[col];
                                        updateConfig("pivot_custom_sql", Object.keys(next).length ? next : null);
                                      }}
                                    >
                                      Simple
                                    </button>
                                    <button
                                      className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                                        isCustomSql ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                      onClick={() => {
                                        updateConfig("pivot_custom_sql", { ...pivotCustomSql, [col]: pivotCustomSql[col] || "" });
                                      }}
                                    >
                                      SQL
                                    </button>
                                  </div>
                                </div>
                                {isCustomSql && (
                                  <SqlInput
                                    mono
                                    className="h-6 text-[10px] bg-card"
                                    placeholder="amount * quantity"
                                    value={pivotCustomSql[col] || ""}
                                    onChange={(v) => updateConfig("pivot_custom_sql", { ...pivotCustomSql, [col]: v })}
                                  />
                                )}
                              </div>

                              {/* Values As (pct mode) */}
                              <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground font-medium">Values As</span>
                                <div className="flex gap-1 flex-wrap">
                                  {pctOptions.map((opt) => {
                                    const isSelected =
                                      opt.value === "_inherit_" ? colPct === undefined :
                                      opt.value === "_abs_" ? colPct === null :
                                      colPct === opt.value;
                                    return (
                                      <button
                                        key={opt.value}
                                        onClick={() => {
                                          const next = { ...pctModes };
                                          if (opt.value === "_inherit_") {
                                            delete next[col];
                                          } else if (opt.value === "_abs_") {
                                            next[col] = null;
                                          } else {
                                            next[col] = opt.value;
                                          }
                                          updateConfig("pivot_pct_modes", Object.keys(next).length ? next : null);
                                        }}
                                        className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                                          isSelected
                                            ? "border-primary bg-primary/10 text-primary font-medium"
                                            : "border-border/50 text-muted-foreground hover:text-foreground"
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </div>
                  )}

                  {isPivot && queryColumns.length === 0 && (
                    <p className="text-xs text-muted-foreground">Run your SQL query first to configure pivot columns.</p>
                  )}
                    </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* === Standard axis mapping === */}
                  {!isPivot && availableColumns.length > 0 && (
                    <>
                  {/* --- Axes group --- */}
                  <Collapsible defaultOpen className="rounded-md border border-border">
                    <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 select-none">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
                      Axes
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                    <div className="border-t border-border px-3 py-3 space-y-3">
                      {/* X Axis — drop zone with Simple/SQL toggle */}
                      {showXAxis && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-muted-foreground">{isHistogram ? "Column to bin" : "X Axis"}</span>
                            <div className="flex gap-0.5 rounded-md border border-border p-0.5">
                              <button
                                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                                  (chartConfig.x_expression_type as string || "simple") === "simple" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                }`}
                                onClick={() => updateConfig("x_expression_type", "simple")}
                              >
                                Simple
                              </button>
                              <button
                                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                                  (chartConfig.x_expression_type as string) === "custom_sql" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                }`}
                                onClick={() => updateConfig("x_expression_type", "custom_sql")}
                              >
                                SQL
                              </button>
                            </div>
                          </div>
                          {(chartConfig.x_expression_type as string || "simple") === "simple" ? (
                            <DropZone
                              id="zone-x"
                              label=""
                              items={(chartConfig.x_column as string) ? [chartConfig.x_column as string] : []}
                              onRemove={() => updateConfig("x_column", "")}
                              color="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                              placeholder="Drop X axis column here"
                              maxItems={1}
                            />
                          ) : (
                            <div className="space-y-1.5">
                              <SqlInput
                                mono
                                className="h-7 text-[11px] bg-card"
                                placeholder="DATE_TRUNC('month', created_at)"
                                value={(chartConfig.x_custom_sql as string) || ""}
                                onChange={(v) => updateConfig("x_custom_sql", v)}
                              />
                              <SqlInput
                                className="h-7 text-[11px] bg-card"
                                placeholder="Label"
                                value={(chartConfig.x_column as string) || ""}
                                onChange={(v) => updateConfig("x_column", v)}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Y Axis — drop zone (multi) */}
                      {showYAxis && !isTable && (
                        <DropZone
                          id="zone-y"
                          label={isKPI ? "Value column" : chartType === "combo" ? "Y Axis (1st = bar, rest = lines)" : "Y Axis"}
                          items={(chartConfig.y_columns as string[]) || []}
                          onRemove={(col) => handleYColumnsChange(col)}
                          color="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                          placeholder="Drop Y axis columns here"
                        />
                      )}

                      {/* Table Columns — drop zone */}
                      {isTable && availableColumns.length > 0 && (
                        <DropZone
                          id="zone-y"
                          label="Columns"
                          items={(chartConfig.y_columns as string[]) || []}
                          onRemove={(col) => {
                            const yCols = (chartConfig.y_columns as string[]) || [];
                            updateConfig("y_columns", yCols.filter((c) => c !== col));
                          }}
                          color="bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-200"
                          placeholder="Drop table columns here"
                        />
                      )}

                      {/* Color / Group — drop zone with Simple/SQL toggle */}
                      {showColor && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-medium text-muted-foreground">{chartType === "heatmap" ? "Row grouping" : "Color / Group"}</span>
                            <div className="flex gap-0.5 rounded-md border border-border p-0.5">
                              <button
                                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                                  (chartConfig.color_expression_type as string || "simple") === "simple" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                }`}
                                onClick={() => updateConfig("color_expression_type", "simple")}
                              >
                                Simple
                              </button>
                              <button
                                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                                  (chartConfig.color_expression_type as string) === "custom_sql" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                }`}
                                onClick={() => updateConfig("color_expression_type", "custom_sql")}
                              >
                                SQL
                              </button>
                            </div>
                          </div>
                          {(chartConfig.color_expression_type as string || "simple") === "simple" ? (
                            <DropZone
                              id="zone-color"
                              label=""
                              items={(chartConfig.color_column as string) ? [chartConfig.color_column as string] : []}
                              onRemove={() => updateConfig("color_column", "")}
                              color="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200"
                              placeholder="Drop color/group column here"
                              maxItems={1}
                            />
                          ) : (
                            <div className="space-y-1.5">
                              <SqlInput
                                mono
                                className="h-7 text-[11px] bg-card"
                                placeholder="CASE WHEN amount > 100 THEN 'high' ELSE 'low' END"
                                value={(chartConfig.color_custom_sql as string) || ""}
                                onChange={(v) => updateConfig("color_custom_sql", v)}
                              />
                              <SqlInput
                                className="h-7 text-[11px] bg-card"
                                placeholder="Label"
                                value={(chartConfig.color_column as string) || ""}
                                onChange={(v) => updateConfig("color_column", v)}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* === Type-specific config === */}

                      {/* Histogram: bins */}
                      {isHistogram && (
                        <div className="space-y-1">
                          <Label>Number of bins</Label>
                          <Input
                            type="number"
                            className="h-8 w-24 text-xs"
                            value={(chartConfig.bins as number) || 20}
                            onChange={(e) => updateConfig("bins", parseInt(e.target.value) || 20)}
                            min={2}
                            max={200}
                          />
                        </div>
                      )}

                      {/* KPI: target, prefix, suffix */}
                      {isKPI && (
                        <div className="space-y-2 rounded-md border border-border p-3">
                          <Label className="text-xs font-semibold text-muted-foreground">KPI Settings</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground">Target</span>
                              <Input
                                type="number"
                                className="h-7 text-xs"
                                value={(chartConfig.kpi_target as number) ?? ""}
                                onChange={(e) => updateConfig("kpi_target", e.target.value ? parseFloat(e.target.value) : null)}
                                placeholder="Optional"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground">Prefix</span>
                              <Input
                                className="h-7 text-xs"
                                value={(chartConfig.kpi_prefix as string) || ""}
                                onChange={(e) => updateConfig("kpi_prefix", e.target.value)}
                                placeholder="$"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground">Suffix</span>
                              <Input
                                className="h-7 text-xs"
                                value={(chartConfig.kpi_suffix as string) || ""}
                                onChange={(e) => updateConfig("kpi_suffix", e.target.value)}
                                placeholder="%"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                    </CollapsibleContent>
                  </Collapsible>{/* end Axes */}

                  {/* --- Query group --- */}
                  <Collapsible className="rounded-md border border-border">
                    <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 select-none">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
                      Query
                      {((chartConfig.metrics as Array<Record<string, string>>) || []).length > 0 && (
                        <span className="ml-auto text-[10px] font-normal normal-case">
                          {((chartConfig.metrics as Array<Record<string, string>>) || []).length} metrics
                        </span>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                    <div className="border-t border-border px-3 py-3 space-y-3">
                      {/* === Metrics -- Superset-style aggregated measures === */}
                      {showYAxis && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Metrics</Label>
                            <button
                              onClick={() => {
                                const metrics = ((chartConfig.metrics as Array<Record<string, string>>) || []);
                                updateConfig("metrics", [...metrics, { column: "", aggregate: "SUM", label: "", expressionType: "simple" }]);
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              + Add Metric
                            </button>
                          </div>
                          {((chartConfig.metrics as Array<Record<string, string>>) || []).length === 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              No metrics -- using raw Y columns. Add metrics for SUM/AVG/COUNT aggregation.
                            </p>
                          )}
                          {((chartConfig.metrics as Array<Record<string, string>>) || []).map((m, idx) => {
                            const metrics = (chartConfig.metrics as Array<Record<string, string>>) || [];
                            const exprType = m.expressionType || "simple";
                            return (
                              <div key={idx} className="rounded-md border border-border p-2 space-y-2">
                                {/* Tab switcher + delete */}
                                <div className="flex items-center justify-between">
                                  <div className="flex gap-0.5 rounded-md border border-border p-0.5">
                                    <button
                                      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                                        exprType === "simple" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                      onClick={() => {
                                        const updated = [...metrics];
                                        updated[idx] = { ...updated[idx], expressionType: "simple" };
                                        updateConfig("metrics", updated);
                                        const labels = updated.map(mm => {
                                          if (mm.expressionType === "custom_sql") return mm.label || mm.sqlExpression || "";
                                          return mm.label || `${mm.aggregate}(${mm.column})`;
                                        });
                                        updateConfig("y_columns", labels);
                                      }}
                                    >
                                      Simple
                                    </button>
                                    <button
                                      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                                        exprType === "custom_sql" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                      onClick={() => {
                                        const updated = [...metrics];
                                        const cur = updated[idx];
                                        const autoExpr = (cur.aggregate && cur.column) ? `${cur.aggregate}(${cur.column})` : (cur.sqlExpression || "");
                                        updated[idx] = { ...cur, expressionType: "custom_sql", sqlExpression: autoExpr || cur.sqlExpression || "" };
                                        updateConfig("metrics", updated);
                                        const labels = updated.map(mm => {
                                          if (mm.expressionType === "custom_sql") return mm.label || mm.sqlExpression || "";
                                          return mm.label || `${mm.aggregate}(${mm.column})`;
                                        });
                                        updateConfig("y_columns", labels);
                                      }}
                                    >
                                      Custom SQL
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => {
                                      const updated = metrics.filter((_, i) => i !== idx);
                                      updateConfig("metrics", updated);
                                      const labels = updated.map(mm => {
                                        if (mm.expressionType === "custom_sql") return mm.label || mm.sqlExpression || "";
                                        return mm.label || `${mm.aggregate}(${mm.column})`;
                                      });
                                      updateConfig("y_columns", labels);
                                    }}
                                    className="text-red-400 hover:text-red-600"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>

                                {/* Simple mode: aggregate + column dropdowns */}
                                {exprType === "simple" && (
                                  <div className="flex items-center gap-1">
                                    <Select
                                      value={m.aggregate || "SUM"}
                                      onValueChange={(agg) => {
                                        const updated = [...metrics];
                                        updated[idx] = { ...updated[idx], aggregate: agg, label: `${agg}(${updated[idx].column || ""})` };
                                        updateConfig("metrics", updated);
                                        const labels = updated.map(mm => {
                                          if (mm.expressionType === "custom_sql") return mm.label || mm.sqlExpression || "";
                                          return mm.label || `${mm.aggregate}(${mm.column})`;
                                        });
                                        updateConfig("y_columns", labels);
                                      }}
                                    >
                                      <SelectTrigger size="xs" className="h-7 bg-card">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="SUM">SUM</SelectItem>
                                        <SelectItem value="AVG">AVG</SelectItem>
                                        <SelectItem value="COUNT">COUNT</SelectItem>
                                        <SelectItem value="MIN">MIN</SelectItem>
                                        <SelectItem value="MAX">MAX</SelectItem>
                                        <SelectItem value="COUNT_DISTINCT">DISTINCT</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <span className="text-[10px] text-muted-foreground">(</span>
                                    <Select
                                      value={m.column || "_empty_"}
                                      onValueChange={(col) => {
                                        const c = col === "_empty_" ? "" : col;
                                        const updated = [...metrics];
                                        updated[idx] = { ...updated[idx], column: c, label: `${updated[idx].aggregate || "SUM"}(${c})` };
                                        updateConfig("metrics", updated);
                                        const labels = updated.map(mm => {
                                          if (mm.expressionType === "custom_sql") return mm.label || mm.sqlExpression || "";
                                          return mm.label || `${mm.aggregate}(${mm.column})`;
                                        });
                                        updateConfig("y_columns", labels);
                                      }}
                                    >
                                      <SelectTrigger size="xs" className="h-7 flex-1 bg-card">
                                        <SelectValue placeholder="Column..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="_empty_">Column...</SelectItem>
                                        <SelectItem value="*">* (all rows)</SelectItem>
                                        {availableColumns.map(c => (
                                          <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <span className="text-[10px] text-muted-foreground">)</span>
                                  </div>
                                )}

                                {/* Custom SQL mode: expression + label */}
                                {exprType === "custom_sql" && (
                                  <div className="space-y-1.5">
                                    <SqlInput
                                      mono
                                      className="h-7 text-[11px] bg-card"
                                      placeholder="SUM(amount) / COUNT(DISTINCT user_id)"
                                      value={m.sqlExpression || ""}
                                      onChange={(v) => {
                                        const updated = [...metrics];
                                        updated[idx] = { ...updated[idx], sqlExpression: v };
                                        updateConfig("metrics", updated);
                                        const labels = updated.map(mm => {
                                          if (mm.expressionType === "custom_sql") return mm.label || mm.sqlExpression || "";
                                          return mm.label || `${mm.aggregate}(${mm.column})`;
                                        });
                                        updateConfig("y_columns", labels);
                                      }}
                                    />
                                    <SqlInput
                                      className="h-7 text-[11px] bg-card"
                                      placeholder="Label (required)"
                                      value={m.label || ""}
                                      onChange={(v) => {
                                        const updated = [...metrics];
                                        updated[idx] = { ...updated[idx], label: v };
                                        updateConfig("metrics", updated);
                                        const labels = updated.map(mm => {
                                          if (mm.expressionType === "custom_sql") return mm.label || mm.sqlExpression || "";
                                          return mm.label || `${mm.aggregate}(${mm.column})`;
                                        });
                                        updateConfig("y_columns", labels);
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* === Chart-level Filters === */}
                      {availableColumns.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Filters</Label>
                            <button
                              onClick={() => {
                                const filters = ((chartConfig.chart_filters as Array<Record<string, string>>) || []);
                                updateConfig("chart_filters", [...filters, { column: "", operator: "=", value: "", expressionType: "simple" }]);
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              + Add Filter
                            </button>
                          </div>
                          {((chartConfig.chart_filters as Array<Record<string, string>>) || []).map((f, idx) => {
                            const filters = (chartConfig.chart_filters as Array<Record<string, string>>) || [];
                            const filterExprType = f.expressionType || "simple";
                            return (
                              <div key={idx} className="rounded-md border border-border p-2 space-y-2">
                                {/* Toggle + delete */}
                                <div className="flex items-center justify-between">
                                  <div className="flex gap-0.5 rounded-md border border-border p-0.5">
                                    <button
                                      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                                        filterExprType === "simple" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                      onClick={() => {
                                        const updated = [...filters];
                                        updated[idx] = { ...updated[idx], expressionType: "simple" };
                                        updateConfig("chart_filters", updated);
                                      }}
                                    >
                                      Simple
                                    </button>
                                    <button
                                      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                                        filterExprType === "custom_sql" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                      onClick={() => {
                                        const updated = [...filters];
                                        updated[idx] = { ...updated[idx], expressionType: "custom_sql" };
                                        updateConfig("chart_filters", updated);
                                      }}
                                    >
                                      SQL
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => updateConfig("chart_filters", filters.filter((_, i) => i !== idx))}
                                    className="text-red-400 hover:text-red-600"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>

                                {/* Simple mode: column + operator + value */}
                                {filterExprType === "simple" && (
                                  <div className="flex items-center gap-1">
                                    <Select
                                      value={f.column || "_empty_"}
                                      onValueChange={(v) => {
                                        const updated = [...filters];
                                        updated[idx] = { ...updated[idx], column: v === "_empty_" ? "" : v };
                                        updateConfig("chart_filters", updated);
                                      }}
                                    >
                                      <SelectTrigger size="xs" className="h-7 flex-1 bg-card">
                                        <SelectValue placeholder="Column..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="_empty_">Column...</SelectItem>
                                        {availableColumns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    <Select
                                      value={f.operator || "="}
                                      onValueChange={(v) => {
                                        const updated = [...filters];
                                        updated[idx] = { ...updated[idx], operator: v };
                                        updateConfig("chart_filters", updated);
                                      }}
                                    >
                                      <SelectTrigger size="xs" className="h-7 bg-card">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="=">=</SelectItem>
                                        <SelectItem value="!=">!=</SelectItem>
                                        <SelectItem value=">">{`>`}</SelectItem>
                                        <SelectItem value=">=">{`>=`}</SelectItem>
                                        <SelectItem value="<">{`<`}</SelectItem>
                                        <SelectItem value="<=">{`<=`}</SelectItem>
                                        <SelectItem value="IN">IN</SelectItem>
                                        <SelectItem value="NOT IN">NOT IN</SelectItem>
                                        <SelectItem value="LIKE">LIKE</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      className="h-7 w-24 text-[10px]"
                                      value={f.value ?? ""}
                                      onChange={(e) => {
                                        const updated = [...filters];
                                        updated[idx] = { ...updated[idx], value: e.target.value };
                                        updateConfig("chart_filters", updated);
                                      }}
                                      placeholder="Value..."
                                    />
                                  </div>
                                )}

                                {/* Custom SQL mode: raw expression */}
                                {filterExprType === "custom_sql" && (
                                  <SqlInput
                                    mono
                                    className="h-7 text-[11px] bg-card"
                                    placeholder="revenue / units > 100"
                                    value={f.sqlExpression || ""}
                                    onChange={(v) => {
                                      const updated = [...filters];
                                      updated[idx] = { ...updated[idx], sqlExpression: v };
                                      updateConfig("chart_filters", updated);
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* === Calculated Columns === */}
                      {availableColumns.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Calculated Columns</Label>
                            <button
                              onClick={() => {
                                const cols = ((chartConfig.calculated_columns as Array<Record<string, string>>) || []);
                                updateConfig("calculated_columns", [...cols, { name: "", expression: "" }]);
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              + Add
                            </button>
                          </div>
                          {((chartConfig.calculated_columns as Array<Record<string, string>>) || []).map((cc, idx) => {
                            const cols = (chartConfig.calculated_columns as Array<Record<string, string>>) || [];
                            return (
                              <div key={idx} className="flex items-center gap-1">
                                <Input className="h-7 w-28 text-[10px]" placeholder="Name"
                                  value={cc.name || ""}
                                  onChange={(e) => {
                                    const updated = [...cols]; updated[idx] = { ...updated[idx], name: e.target.value };
                                    updateConfig("calculated_columns", updated);
                                  }} />
                                <span className="text-[10px] text-muted-foreground">=</span>
                                <Input className="h-7 flex-1 text-[10px] font-mono" placeholder="revenue / players"
                                  value={cc.expression || ""}
                                  onChange={(e) => {
                                    const updated = [...cols]; updated[idx] = { ...updated[idx], expression: e.target.value };
                                    updateConfig("calculated_columns", updated);
                                  }} />
                                <button onClick={() => updateConfig("calculated_columns", cols.filter((_, i) => i !== idx))}
                                  className="text-red-400 hover:text-red-600">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* === Row Limit === */}
                      {availableColumns.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Label className="shrink-0 text-xs">Row Limit</Label>
                          <Input
                            type="number"
                            className="h-7 w-24 text-xs"
                            value={(chartConfig.row_limit as number) || ""}
                            onChange={(e) => updateConfig("row_limit", e.target.value ? parseInt(e.target.value) : null)}
                            placeholder="All"
                            min={1}
                          />
                        </div>
                      )}
                    </div>
                    </CollapsibleContent>
                  </Collapsible>
                    </>
                  )}
    </div>
  );
}
