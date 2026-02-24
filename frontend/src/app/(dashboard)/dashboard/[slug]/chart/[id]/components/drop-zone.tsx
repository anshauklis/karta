"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, ChevronRight, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface MoveTarget {
  key: string;
  label: string;
}

interface SortablePillProps {
  id: string;
  label: string;
  onRemove: () => void;
  color?: string;
  renderExtra?: React.ReactNode;
  renderExpanded?: React.ReactNode;
  moveTargets?: MoveTarget[];
  onMoveTo?: (targetKey: string) => void;
}

function SortablePill({ id, label, onRemove, color = "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200", renderExtra, renderExpanded, moveTargets, onMoveTo }: SortablePillProps) {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasMoveTargets = moveTargets && moveTargets.length > 0 && onMoveTo;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "shadow-md z-10" : ""}>
      <div
        className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium ${color} ${
          expanded ? "rounded-b-none" : ""
        }`}
      >
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none shrink-0"
          tabIndex={-1}
        >
          <GripVertical className="h-3 w-3 opacity-50" />
        </button>
        {hasMoveTargets ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="truncate flex-1 text-left cursor-pointer hover:underline decoration-dotted underline-offset-2">
                {label}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onPointerDownCapture={(e) => e.stopPropagation()}>
              {moveTargets.map((t) => (
                <DropdownMenuItem key={t.key} onClick={() => onMoveTo(t.key)}>
                  <ArrowRight className="h-3.5 w-3.5" />
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="truncate flex-1">{label}</span>
        )}
        {renderExtra}
        {renderExpanded != null && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="opacity-50 hover:opacity-100 transition-all shrink-0"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-50 hover:opacity-100 transition-opacity shrink-0"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {expanded && renderExpanded && (
        <div
          className={`border border-t-0 rounded-b-md px-2 py-2 text-xs ${color} opacity-80`}
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          {renderExpanded}
        </div>
      )}
    </div>
  );
}

interface DropZoneProps {
  id: string;
  label: string;
  items: string[];
  onRemove: (item: string) => void;
  color?: string;
  placeholder?: string;
  maxItems?: number;
  renderExtra?: (item: string) => React.ReactNode;
  renderExpanded?: (item: string) => React.ReactNode;
  moveTargets?: MoveTarget[];
  onMoveTo?: (item: string, targetKey: string) => void;
}

export function DropZone({
  id,
  label,
  items,
  onRemove,
  color,
  placeholder = "Drop column here",
  maxItems,
  renderExtra,
  renderExpanded,
  moveTargets,
  onMoveTo,
}: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div
        ref={setNodeRef}
        className={`min-h-[36px] rounded-md border border-dashed p-1.5 transition-colors ${
          isOver
            ? "border-primary bg-primary/5"
            : items.length > 0
              ? "border-border bg-muted/20"
              : "border-border"
        }`}
      >
        {items.length > 0 ? (
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1">
              {items.map((item) => (
                <SortablePill
                  key={item}
                  id={item}
                  label={item}
                  onRemove={() => onRemove(item)}
                  color={color}
                  renderExtra={renderExtra?.(item)}
                  renderExpanded={renderExpanded?.(item)}
                  moveTargets={moveTargets}
                  onMoveTo={onMoveTo ? (targetKey) => onMoveTo(item, targetKey) : undefined}
                />
              ))}
            </div>
          </SortableContext>
        ) : (
          <div className="flex items-center justify-center py-1">
            <span className="text-[11px] text-muted-foreground/60">{placeholder}</span>
          </div>
        )}
      </div>
    </div>
  );
}
