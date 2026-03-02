"use client";

import { useDroppable } from "@dnd-kit/core";
import { X } from "lucide-react";

interface DropZoneProps {
  id: string;
  label: string;
  values: string[];
  onRemove: (column: string) => void;
  placeholder?: string;
  multiple?: boolean;
  className?: string;
}

export function DropZone({
  id,
  label,
  values,
  onRemove,
  placeholder = "+ Drop columns here or click",
  multiple: _multiple = false,
  className = "",
}: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div className={`space-y-1.5 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div
        ref={setNodeRef}
        className={`min-h-[36px] rounded-md border-2 border-dashed px-2 py-1.5 transition-colors ${
          isOver
            ? "border-primary bg-primary/5"
            : values.length > 0
              ? "border-border bg-card"
              : "border-border/50 bg-muted/30"
        }`}
      >
        {values.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {values.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary"
              >
                {v}
                <button
                  onClick={() => onRemove(v)}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 text-center py-0.5">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );
}
