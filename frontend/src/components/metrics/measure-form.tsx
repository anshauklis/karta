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
import type { ModelMeasure } from "@/types";

const AGG_TYPES = [
  "sum",
  "count",
  "count_distinct",
  "avg",
  "min",
  "max",
  "custom",
] as const;

interface MeasureFormProps {
  measure?: ModelMeasure | null;
  onSave: (data: Partial<ModelMeasure>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function MeasureForm({
  measure,
  onSave,
  onCancel,
  isSaving,
}: MeasureFormProps) {
  const t = useTranslations("metrics");
  const isEdit = !!measure;

  const [name, setName] = useState(measure?.name ?? "");
  const [label, setLabel] = useState(measure?.label ?? "");
  const [expression, setExpression] = useState(measure?.expression ?? "");
  const [aggType, setAggType] = useState<string>(measure?.agg_type ?? "sum");
  const [format, setFormat] = useState(measure?.format ?? "");
  const [description, setDescription] = useState(measure?.description ?? "");
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

  const canSubmit = !!name.trim() && !!expression.trim() && !!aggType;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSave({
      name: name.trim(),
      label: label.trim() || name.trim(),
      expression: expression.trim(),
      agg_type: aggType as ModelMeasure["agg_type"],
      format: format.trim(),
      description: description.trim(),
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
            placeholder="e.g. Total Revenue"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("name")}</Label>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. total_revenue"
            className="h-8 text-sm font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("expression")} *</Label>
          <Input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="e.g. SUM(amount)"
            className="h-8 text-sm font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("aggType")}</Label>
          <Select value={aggType} onValueChange={setAggType}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGG_TYPES.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("format")}</Label>
          <Input
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            placeholder="e.g. $,.2f"
            className="h-8 text-sm font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="h-8 text-sm"
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
