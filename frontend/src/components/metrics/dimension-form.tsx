"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, X } from "lucide-react";
import type { ModelDimension } from "@/types";

const DIMENSION_TYPES = ["categorical", "temporal", "numeric"] as const;
const TIME_GRAINS = ["day", "week", "month", "quarter", "year"] as const;

interface DimensionFormProps {
  dimension?: ModelDimension | null;
  onSave: (data: Partial<ModelDimension>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function DimensionForm({
  dimension,
  onSave,
  onCancel,
  isSaving,
}: DimensionFormProps) {
  const t = useTranslations("metrics");
  const isEdit = !!dimension;

  const [name, setName] = useState(dimension?.name ?? "");
  const [label, setLabel] = useState(dimension?.label ?? "");
  const [columnName, setColumnName] = useState(dimension?.column_name ?? "");
  const [dimensionType, setDimensionType] = useState<string>(
    dimension?.dimension_type ?? "categorical"
  );
  const [timeGrain, setTimeGrain] = useState<string>(
    dimension?.time_grain ?? "_none_"
  );
  const [format, setFormat] = useState(dimension?.format ?? "");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(isEdit);

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    if (!nameManuallyEdited && newLabel) {
      setName(slugify(newLabel));
    }
  };

  const handleNameChange = (newName: string) => {
    setName(newName);
    setNameManuallyEdited(true);
  };

  const canSubmit = !!name.trim() && !!columnName.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSave({
      name: name.trim(),
      label: label.trim() || name.trim(),
      column_name: columnName.trim(),
      dimension_type: dimensionType as ModelDimension["dimension_type"],
      time_grain:
        dimensionType === "temporal" && timeGrain !== "_none_"
          ? timeGrain
          : null,
      format: format.trim(),
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("label")}</Label>
          <Input
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="e.g. Order Date"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("name")}</Label>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. order_date"
            className="h-8 text-sm font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("columnName")} *</Label>
          <Input
            value={columnName}
            onChange={(e) => setColumnName(e.target.value)}
            placeholder="e.g. order_date"
            className="h-8 text-sm font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("dimensionType")}</Label>
          <Select value={dimensionType} onValueChange={setDimensionType}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIMENSION_TYPES.map((dt) => (
                <SelectItem key={dt} value={dt}>
                  {dt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {dimensionType === "temporal" && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t("timeGrain")}</Label>
            <Select value={timeGrain} onValueChange={setTimeGrain}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">--</SelectItem>
                {TIME_GRAINS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("format")}</Label>
          <Input
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            placeholder="Optional format"
            className="h-8 text-sm font-mono"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          <X className="mr-1 h-3.5 w-3.5" />
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || isSaving}>
          {isSaving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="mr-1 h-3.5 w-3.5" />
          )}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
