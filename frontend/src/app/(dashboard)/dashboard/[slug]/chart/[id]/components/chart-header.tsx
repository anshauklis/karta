"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  Save,
  Loader2,
  Undo2,
  Redo2,
  History,
  MoreHorizontal,
  Copy,
  Bookmark,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChartTemplate } from "@/hooks/use-templates";

export interface ChartHeaderProps {
  slug: string;
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  showDesc: boolean;
  onShowDescChange: (value: boolean) => void;
  dashboardTitle: string;
  isNew: boolean;
  isStandalone?: boolean;
  isSaving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSaveModal: () => void;
  onSaveAsTemplate?: () => void;
  onDelete?: () => void;
  onShowHistory?: () => void;
  chartId?: number;
  previewing?: boolean;
  templates?: ChartTemplate[];
  onLoadTemplate?: (template: ChartTemplate) => void;
  /** Optional AI builder component rendered between title and action buttons */
  aiBuilder?: React.ReactNode;
}

export function ChartHeader({
  slug,
  title,
  onTitleChange,
  dashboardTitle,
  isNew,
  isStandalone: _isStandalone,
  isSaving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenSaveModal,
  onSaveAsTemplate,
  onDelete,
  onShowHistory,
  chartId: _chartId,
  previewing,
  templates,
  onLoadTemplate,
  aiBuilder,
}: ChartHeaderProps) {
  const t = useTranslations("chart");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");

  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
      {/* Left: Breadcrumb + Title */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Link
          href={slug ? `/dashboard/${slug}/edit` : "/charts"}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-40"
        >
          {slug ? dashboardTitle || slug : tn("charts")}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="h-7 w-64 border-none bg-transparent text-sm font-semibold shadow-none focus-visible:ring-0 px-1"
          placeholder={t("noTitle")}
        />
        {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
      </div>

      {/* AI Chart Builder */}
      {aiBuilder && (
        <div className="shrink-0">
          {aiBuilder}
        </div>
      )}

      {/* Right: Undo/Redo + Save + overflow menu */}
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onUndo} disabled={!canUndo} title="Undo (Cmd+Z)">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRedo} disabled={!canRedo} title="Redo (Cmd+Shift+Z)">
          <Redo2 className="h-3.5 w-3.5" />
        </Button>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Save button — opens modal */}
        <Button
          size="sm"
          onClick={onOpenSaveModal}
          disabled={isSaving}
          className="h-7"
          title="Save (Cmd+S)"
        >
          {isSaving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          <Save className="mr-1 h-3.5 w-3.5" />
          {tc("save")}
        </Button>

        {/* Overflow menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {!isNew && onShowHistory && (
              <DropdownMenuItem onClick={onShowHistory}>
                <History className="h-3 w-3" />
                Version History
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(window.location.href)}>
              <Copy className="h-3 w-3" />
              Copy Link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSaveAsTemplate?.()}>
              <Bookmark className="h-3 w-3" />
              {t("saveAsTemplate")}
            </DropdownMenuItem>
            {templates?.map((tmpl) => (
              <DropdownMenuItem key={tmpl.id} onClick={() => onLoadTemplate?.(tmpl)}>
                {t("loadTemplate")}: {tmpl.name}
              </DropdownMenuItem>
            ))}
            {!isNew && onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-3 w-3" />
                  {tc("delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
