"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDashboardCharts } from "@/hooks/use-charts";
import { useTranslations } from "next-intl";
import { Loader2, Search, AlertTriangle, Info, Check, ChevronsUpDown } from "lucide-react";

export interface SaveParams {
  mode: "overwrite" | "save_as";
  title: string;
  dashboardId: number | null;
  andGoToDashboard: boolean;
}

interface SaveChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isNew: boolean;
  currentTitle: string;
  currentChartId?: number;
  currentDashboardId: number | null;
  allDashboards: Array<{ id: number; title: string; icon?: string; url_slug: string }>;
  isSaving: boolean;
  onSave: (params: SaveParams) => Promise<void>;
}

export function SaveChartModal({
  open,
  onOpenChange,
  isNew,
  currentTitle,
  currentChartId,
  currentDashboardId,
  allDashboards,
  isSaving,
  onSave,
}: SaveChartModalProps) {
  const t = useTranslations("chart");
  const tc = useTranslations("common");

  const [mode, setMode] = useState<"overwrite" | "save_as">(isNew ? "save_as" : "overwrite");
  const [title, setTitle] = useState(currentTitle);
  const [dashboardId, setDashboardId] = useState<number | null>(currentDashboardId);
  const [dashSearch, setDashSearch] = useState("");
  const [dashPickerOpen, setDashPickerOpen] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setMode(isNew ? "save_as" : "overwrite");
        setTitle(currentTitle);
        setDashboardId(currentDashboardId);
        setDashSearch("");
        setDashPickerOpen(false);
      });
    }
  }, [open, isNew, currentTitle, currentDashboardId]);

  // When switching to "save_as", append " (copy)" if title matches current
  useEffect(() => {
    if (mode === "save_as" && title === currentTitle && !isNew) {
      queueMicrotask(() => setTitle(`${currentTitle} (copy)`));
    } else if (mode === "overwrite" && title === `${currentTitle} (copy)`) {
      queueMicrotask(() => setTitle(currentTitle));
    }
  }, [mode, title, currentTitle, isNew]);

  // Fetch charts in selected dashboard for duplicate detection
  const { data: dashCharts } = useDashboardCharts(dashboardId ?? undefined);

  const hasDuplicate = useMemo(() => {
    if (!dashCharts || !title.trim()) return false;
    return dashCharts.some(
      (c) =>
        c.title.toLowerCase() === title.trim().toLowerCase() &&
        (mode === "save_as" || c.id !== currentChartId)
    );
  }, [dashCharts, title, mode, currentChartId]);

  const selectedDashboard = allDashboards.find((d) => d.id === dashboardId);

  const filteredDashboards = allDashboards.filter((d) =>
    d.title.toLowerCase().includes(dashSearch.toLowerCase())
  );

  const handleSave = async (andGoToDashboard: boolean) => {
    await onSave({
      mode,
      title: title.trim(),
      dashboardId,
      andGoToDashboard,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="gap-5">
        <DialogHeader>
          <DialogTitle>{t("saveChart")}</DialogTitle>
        </DialogHeader>

        {/* Save mode radio */}
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as "overwrite" | "save_as")}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="overwrite" id="save-overwrite" disabled={isNew} />
            <Label
              htmlFor="save-overwrite"
              className={`text-sm cursor-pointer ${isNew ? "text-muted-foreground" : ""}`}
            >
              {t("saveOverwrite")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="save_as" id="save-as" />
            <Label htmlFor="save-as" className="text-sm cursor-pointer">
              {t("saveAs")}
            </Label>
          </div>
        </RadioGroup>

        {/* Info banner for save-as mode */}
        {mode === "save_as" && (
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t("saveAsInfo")}</span>
          </div>
        )}

        {/* Chart name */}
        <div className="space-y-1.5">
          <Label htmlFor="chart-name" className="text-sm font-medium">
            {t("chartName")}
          </Label>
          <Input
            id="chart-name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("noTitle")}
            autoFocus
          />
        </div>

        {/* Dashboard picker */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t("addToDashboard")}</Label>
          <Popover open={dashPickerOpen} onOpenChange={setDashPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-muted/50 transition-colors"
              >
                <span className={selectedDashboard ? "" : "text-muted-foreground"}>
                  {selectedDashboard
                    ? `${selectedDashboard.icon || "📊"} ${selectedDashboard.title}`
                    : t("noneDashboard")}
                </span>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
              <div className="p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={dashSearch}
                    onChange={(e) => setDashSearch(e.target.value)}
                    placeholder={t("searchDashboards")}
                    className="h-8 pl-8 text-sm"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto px-1 pb-1">
                {/* None option */}
                <button
                  type="button"
                  onClick={() => { setDashboardId(null); setDashPickerOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm hover:bg-accent transition-colors ${
                    dashboardId === null ? "bg-accent font-medium" : ""
                  }`}
                >
                  <Check className={`h-3.5 w-3.5 shrink-0 ${dashboardId === null ? "opacity-100" : "opacity-0"}`} />
                  <span>{t("noneDashboard")}</span>
                </button>
                {filteredDashboards.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => { setDashboardId(d.id); setDashPickerOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm hover:bg-accent transition-colors ${
                      dashboardId === d.id ? "bg-accent font-medium" : ""
                    }`}
                  >
                    <Check className={`h-3.5 w-3.5 shrink-0 ${dashboardId === d.id ? "opacity-100" : "opacity-0"}`} />
                    <span>{d.icon || "📊"} {d.title}</span>
                  </button>
                ))}
                {filteredDashboards.length === 0 && (
                  <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">
                    {tc("noResults")}
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Duplicate name warning */}
        {hasDuplicate && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t("duplicateNameWarning")}</span>
          </div>
        )}

        {/* Footer buttons */}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {tc("cancel")}
          </Button>
          {dashboardId != null && (
            <Button
              variant="outline"
              onClick={() => handleSave(true)}
              disabled={isSaving || !title.trim()}
            >
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("saveAndGoToDashboard")}
            </Button>
          )}
          <Button
            onClick={() => handleSave(false)}
            disabled={isSaving || !title.trim()}
          >
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
