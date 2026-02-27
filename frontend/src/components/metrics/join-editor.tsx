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
import type { ModelJoin, SemanticModel } from "@/types";

const JOIN_TYPES = ["inner", "left", "right", "full"] as const;

interface JoinEditorProps {
  models: SemanticModel[];
  currentModelId: number;
  onSave: (data: Partial<ModelJoin>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export function JoinEditor({
  models,
  currentModelId,
  onSave,
  onCancel,
  isSaving,
}: JoinEditorProps) {
  const t = useTranslations("metrics");

  const [toModelId, setToModelId] = useState<string>("_none_");
  const [joinType, setJoinType] = useState<string>("left");
  const [fromColumn, setFromColumn] = useState("");
  const [toColumn, setToColumn] = useState("");

  // Filter out the current model from the list
  const otherModels = models.filter((m) => m.id !== currentModelId);

  const canSubmit =
    toModelId !== "_none_" &&
    !!fromColumn.trim() &&
    !!toColumn.trim() &&
    !!joinType;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSave({
      to_model_id: Number(toModelId),
      join_type: joinType as ModelJoin["join_type"],
      from_column: fromColumn.trim(),
      to_column: toColumn.trim(),
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("targetModel")} *</Label>
          <Select value={toModelId} onValueChange={setToModelId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={t("selectModelPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none_">--</SelectItem>
              {otherModels.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("joinType")}</Label>
          <Select value={joinType} onValueChange={setJoinType}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOIN_TYPES.map((jt) => (
                <SelectItem key={jt} value={jt}>
                  {jt.toUpperCase()} JOIN
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("fromColumn")} *</Label>
          <Input
            value={fromColumn}
            onChange={(e) => setFromColumn(e.target.value)}
            placeholder={t("fromColumnPlaceholder")}
            className="h-8 text-sm font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("toColumn")} *</Label>
          <Input
            value={toColumn}
            onChange={(e) => setToColumn(e.target.value)}
            placeholder={t("toColumnPlaceholder")}
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
