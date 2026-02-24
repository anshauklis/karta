"use client";

import { useState, Fragment } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCellValue } from "@/lib/format";
import type { ColumnFormat, ChartExecuteResult } from "@/types";

interface ColumnFormatsTableProps {
  columns: string[];
  formats: Record<string, ColumnFormat>;
  result: ChartExecuteResult | null;
  selectedCols: string[];
  onSelectedColsChange: (cols: string[]) => void;
  onFormatChange: (formats: Record<string, ColumnFormat>) => void;
  aliases?: Record<string, string>;
  onAliasChange?: (aliases: Record<string, string>) => void;
}

function getDetailSummary(fmt: ColumnFormat | undefined): string {
  if (!fmt) return "\u2014";
  switch (fmt.type) {
    case "number":
      return [
        fmt.decimals != null ? `${fmt.decimals} dec` : null,
        fmt.thousands !== false ? "," : null,
        fmt.prefix || null,
        fmt.suffix || null,
      ]
        .filter(Boolean)
        .join(", ") || "\u2014";
    case "percent":
      return [
        fmt.decimals != null ? `${fmt.decimals} dec` : null,
        fmt.thousands !== false ? "," : null,
        fmt.suffix || null,
      ]
        .filter(Boolean)
        .join(", ") || "%";
    case "currency":
      return [
        fmt.prefix || "$",
        fmt.decimals != null ? `${fmt.decimals} dec` : null,
      ]
        .filter(Boolean)
        .join(", ") || "$";
    case "date":
      return fmt.date_pattern || "Auto";
    case "text":
      return [fmt.prefix, fmt.suffix].filter(Boolean).join(", ") || "text";
    default:
      return "\u2014";
  }
}

export function ColumnFormatsTable({
  columns,
  formats,
  result,
  selectedCols,
  onSelectedColsChange,
  onFormatChange,
  aliases,
  onAliasChange,
}: ColumnFormatsTableProps) {
  const t = useTranslations("columnFormats");
  const [expandedCol, setExpandedCol] = useState<string | null>(null);
  const [editingAlias, setEditingAlias] = useState<string | null>(null);

  const setColFmt = (col: string, patch: Partial<ColumnFormat>) => {
    const updated = { ...formats };
    updated[col] = { ...(updated[col] || { type: "number" as const }), ...patch };
    onFormatChange(updated);
  };

  const clearFmt = (col: string) => {
    const updated = { ...formats };
    delete updated[col];
    onFormatChange(updated);
  };

  const getSample = (col: string): unknown => {
    if (!result?.columns || !result?.rows?.[0]) return null;
    const idx = result.columns.indexOf(col);
    if (idx < 0) return null;
    return result.rows[0][idx] ?? null;
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-muted-foreground">
          {t("title")}
        </Label>
        <div className="flex gap-1">
          {[
            { label: "$", patch: { type: "currency" as const, decimals: 2, prefix: "$" } },
            { label: "%", patch: { type: "percent" as const, decimals: 1 } },
            { label: "0", patch: { type: "number" as const, decimals: 0 } },
            { label: ".2", patch: { type: "number" as const, decimals: 2 } },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                if (selectedCols.length === 0) return;
                const updated = { ...formats };
                for (const c of selectedCols) {
                  updated[c] = { ...(updated[c] || {}), ...preset.patch };
                }
                onFormatChange(updated);
              }}
              className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
              title={t("applyToSelected", { label: preset.label })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left py-1 pr-2 font-medium w-5">
                <Checkbox
                  checked={selectedCols.length === columns.length && columns.length > 0}
                  onCheckedChange={(v) =>
                    onSelectedColsChange(v ? [...columns] : [])
                  }
                  className="h-3 w-3"
                />
              </th>
              <th className="text-left py-1 pr-2 font-medium">{t("column")}</th>
              <th className="text-left py-1 pr-2 font-medium w-20">{t("type")}</th>
              <th className="text-left py-1 pr-2 font-medium w-24">{t("detail")}</th>
              <th className="text-left py-1 pr-2 font-medium w-20">{t("preview")}</th>
              <th className="w-5"></th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => {
              const fmt = formats[col];
              const sample = getSample(col);
              const isSelected = selectedCols.includes(col);
              const isExpanded = expandedCol === col;

              return (
                <Fragment key={col}>
                  <tr
                    className={`border-b border-border/50 cursor-pointer ${
                      isSelected ? "bg-primary/5" : ""
                    } ${isExpanded ? "bg-muted/30" : "hover:bg-muted/10"}`}
                    onClick={() => setExpandedCol(isExpanded ? null : col)}
                  >
                    <td className="py-1 pr-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() =>
                          onSelectedColsChange(
                            isSelected
                              ? selectedCols.filter((x) => x !== col)
                              : [...selectedCols, col]
                          )
                        }
                        className="h-3 w-3"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-1 truncate max-w-[140px]" title={col}>
                        <ChevronDown
                          className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${
                            isExpanded ? "" : "-rotate-90"
                          }`}
                        />
                        {editingAlias === col ? (
                          <Input
                            autoFocus
                            className="h-5 text-[13px] px-1 w-full"
                            defaultValue={aliases?.[col] || col}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (onAliasChange) {
                                const updated = { ...(aliases || {}) };
                                if (val && val !== col) {
                                  updated[col] = val;
                                } else {
                                  delete updated[col];
                                }
                                onAliasChange(updated);
                              }
                              setEditingAlias(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setEditingAlias(null);
                            }}
                          />
                        ) : (
                          <span
                            className="truncate cursor-text"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              if (onAliasChange) setEditingAlias(col);
                            }}
                            title={aliases?.[col] ? `${col} → ${aliases[col]}` : col}
                          >
                            {aliases?.[col] || col}
                            {aliases?.[col] && (
                              <span className="ml-1 text-[10px] text-muted-foreground/50">({col})</span>
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1 pr-2" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={fmt?.type || "_auto_"}
                        onValueChange={(v) => {
                          if (v !== "_auto_") {
                            setColFmt(col, { type: v as ColumnFormat["type"] });
                          } else {
                            clearFmt(col);
                          }
                        }}
                      >
                        <SelectTrigger size="xs" className="w-full text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_auto_">{t("typeAuto")}</SelectItem>
                          <SelectItem value="number">{t("typeNumber")}</SelectItem>
                          <SelectItem value="percent">{t("typePercent")}</SelectItem>
                          <SelectItem value="currency">{t("typeCurrency")}</SelectItem>
                          <SelectItem value="date">{t("typeDate")}</SelectItem>
                          <SelectItem value="text">{t("typeText")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1 pr-2 text-muted-foreground truncate max-w-[80px]" title={getDetailSummary(fmt)}>
                      {getDetailSummary(fmt)}
                    </td>
                    <td className="py-1 pr-2 font-mono text-muted-foreground truncate max-w-[60px]">
                      {sample !== null && fmt
                        ? formatCellValue(sample, fmt)
                        : sample !== null
                        ? String(sample)
                        : "\u2014"}
                    </td>
                    <td className="py-1" onClick={(e) => e.stopPropagation()}>
                      {fmt && (
                        <button
                          onClick={() => clearFmt(col)}
                          className="text-red-400 hover:text-red-600"
                        >
                          {"\u00d7"}
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Expandable detail row */}
                  {isExpanded && (
                    <tr className="border-b border-border/50 bg-muted/20">
                      <td></td>
                      <td colSpan={5} className="py-2 pr-2">
                        <ExpandedDetail
                          fmt={fmt}
                          onPatch={(patch) => setColFmt(col, patch)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandedDetail({
  fmt,
  onPatch,
}: {
  fmt: ColumnFormat | undefined;
  onPatch: (patch: Partial<ColumnFormat>) => void;
}) {
  const t = useTranslations("columnFormats");

  if (!fmt) {
    return (
      <p className="text-[13px] text-muted-foreground italic">
        {t("selectType")}
      </p>
    );
  }

  if (fmt.type === "date") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-muted-foreground">{t("pattern")}</span>
        <Select
          value={fmt.date_pattern || "_auto_"}
          onValueChange={(v) => onPatch({ date_pattern: v === "_auto_" ? undefined : v })}
        >
          <SelectTrigger size="xs" className="text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_auto_">{t("patternAuto")}</SelectItem>
            <SelectItem value="DD.MM.YYYY">DD.MM.YYYY (12.02.2023)</SelectItem>
            <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2023-02-12)</SelectItem>
            <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (02/12/2023)</SelectItem>
            <SelectItem value="DD Mon YYYY">DD Mon YYYY (12 Feb 2023)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (fmt.type === "text") {
    return (
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1">
          <span className="text-[13px] text-muted-foreground">{t("prefix")}</span>
          <Input
            className="h-6 w-14 text-[13px] px-1"
            value={fmt.prefix || ""}
            placeholder=""
            onChange={(e) => onPatch({ prefix: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[13px] text-muted-foreground">{t("suffix")}</span>
          <Input
            className="h-6 w-14 text-[13px] px-1"
            value={fmt.suffix || ""}
            placeholder=""
            onChange={(e) => onPatch({ suffix: e.target.value })}
          />
        </div>
      </div>
    );
  }

  // number, percent, currency
  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex items-center gap-1">
        <span className="text-[13px] text-muted-foreground">{t("decimals")}</span>
        <Input
          type="number"
          className="h-6 w-12 text-[13px] px-1"
          value={fmt.decimals ?? 0}
          min={0}
          max={10}
          onChange={(e) => onPatch({ decimals: parseInt(e.target.value) || 0 })}
        />
      </div>
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Switch
          checked={fmt.thousands !== false}
          onCheckedChange={(v) => onPatch({ thousands: v })}
          className="scale-[0.6]"
        />
        {t("thousands")}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[13px] text-muted-foreground">{t("prefix")}</span>
        <Input
          className="h-6 w-14 text-[13px] px-1"
          value={fmt.prefix || ""}
          placeholder={fmt.type === "currency" ? "$" : ""}
          onChange={(e) => onPatch({ prefix: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[13px] text-muted-foreground">{t("suffix")}</span>
        <Input
          className="h-6 w-14 text-[13px] px-1"
          value={fmt.suffix || ""}
          placeholder={fmt.type === "percent" ? "%" : ""}
          onChange={(e) => onPatch({ suffix: e.target.value })}
        />
      </div>
    </div>
  );
}
