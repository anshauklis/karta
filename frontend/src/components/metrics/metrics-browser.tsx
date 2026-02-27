"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useSemanticModels, useSemanticModel } from "@/hooks/use-semantic";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Layers,
  Hash,
  Calendar,
  BarChart3,
  ChevronDown,
  GripVertical,
  ExternalLink,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { SemanticModel } from "@/types";

function DraggableMeasure({
  modelId,
  name,
  label,
  aggType,
  expression,
}: {
  modelId: number;
  name: string;
  label: string;
  aggType: string;
  expression: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `metric-measure-${modelId}-${name}`,
    data: { type: "measure", modelId, name, expression },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted/70 cursor-grab active:cursor-grabbing transition-colors ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
      <span className="truncate flex-1 text-left">{label || name}</span>
      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
        {aggType}
      </span>
    </button>
  );
}

function DraggableDimension({
  modelId,
  name,
  label,
  columnName,
  dimensionType,
}: {
  modelId: number;
  name: string;
  label: string;
  columnName: string;
  dimensionType: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `metric-dimension-${modelId}-${columnName}`,
    data: { type: "dimension", modelId, name, columnName },
  });

  const typeIcon =
    dimensionType === "temporal" ? (
      <Calendar className="h-3 w-3" />
    ) : dimensionType === "numeric" ? (
      <Hash className="h-3 w-3" />
    ) : (
      <BarChart3 className="h-3 w-3" />
    );

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted/70 cursor-grab active:cursor-grabbing transition-colors ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
      <span className="truncate flex-1 text-left">{label || name}</span>
      <span className="shrink-0 text-muted-foreground">{typeIcon}</span>
    </button>
  );
}

function ModelSection({ model }: { model: SemanticModel }) {
  const [open, setOpen] = useState(false);
  const { data: fullModel, isLoading } = useSemanticModel(open ? model.id : null);
  const t = useTranslations("metrics");

  const measures = fullModel?.measures || [];
  const dimensions = fullModel?.dimensions || [];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="truncate">{model.name}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 space-y-1">
        {isLoading ? (
          <div className="space-y-1 px-2.5 py-1">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : (
          <>
            {/* Measures group */}
            {measures.length > 0 && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  {t("measures_group")} ({measures.length})
                </div>
                {measures.map((m) => (
                  <DraggableMeasure
                    key={m.id}
                    modelId={model.id}
                    name={m.name}
                    label={m.label}
                    aggType={m.agg_type}
                    expression={m.expression}
                  />
                ))}
              </div>
            )}

            {/* Dimensions group */}
            {dimensions.length > 0 && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {t("dimensions_group")} ({dimensions.length})
                </div>
                {dimensions.map((d) => (
                  <DraggableDimension
                    key={d.id}
                    modelId={model.id}
                    name={d.name}
                    label={d.label}
                    columnName={d.column_name}
                    dimensionType={d.dimension_type}
                  />
                ))}
              </div>
            )}

            {measures.length === 0 && dimensions.length === 0 && (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">
                {t("noMeasures")}
              </div>
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MetricsBrowser({
  connectionId,
}: {
  connectionId: number | undefined;
}) {
  const t = useTranslations("metrics");
  const { data: models, isLoading } = useSemanticModels(connectionId);

  if (!connectionId) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <Layers className="h-8 w-8 text-muted-foreground/40" />
        <p>{t("select_connection")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  if (!models || models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <Layers className="h-8 w-8 text-muted-foreground/40" />
        <p>{t("no_models")}</p>
        <Link
          href="/metrics"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {t("go_to_metrics")}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="px-2.5 py-1 text-xs text-muted-foreground">
        {t("drag_hint")}
      </p>
      {models.map((model) => (
        <ModelSection key={model.id} model={model} />
      ))}
    </div>
  );
}
