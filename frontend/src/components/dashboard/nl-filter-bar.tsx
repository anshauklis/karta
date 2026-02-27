"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useParseDashboardFilters } from "@/hooks/use-ai";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, X } from "lucide-react";

interface NLFilterBarProps {
  columns: { name: string; type: string }[];
  onFiltersApplied: (filters: Record<string, unknown>) => void;
}

export function NLFilterBar({ columns, onFiltersApplied }: NLFilterBarProps) {
  const t = useTranslations("dashboard");
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const parseMutation = useParseDashboardFilters();

  const handleSubmit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || parseMutation.isPending) return;

    try {
      const result = await parseMutation.mutateAsync({
        prompt: text,
        columns,
      });

      if (result.filters.length === 0) {
        toast.info(t("nlFilterNoMatch"));
        return;
      }

      // Convert array [{column, value}] to dict {column: value}
      const filterDict: Record<string, unknown> = {};
      for (const f of result.filters) {
        filterDict[f.column] = f.value;
      }

      onFiltersApplied(filterDict);
      toast.success(t("nlFilterApplied"));
      setPrompt("");
    } catch {
      // Error toast is shown by api.post
    }
  }, [prompt, columns, parseMutation, onFiltersApplied, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!columns || columns.length === 0) return null;

  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="relative flex-1">
        <Sparkles className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("nlFilterPlaceholder")}
          className="h-8 pl-8 pr-8 text-sm"
          disabled={parseMutation.isPending}
        />
        {prompt && !parseMutation.isPending && (
          <button
            onClick={() => setPrompt("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {parseMutation.isPending && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleSubmit}
        disabled={!prompt.trim() || parseMutation.isPending}
        className="h-8 gap-1.5"
      >
        {parseMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {t("nlFilterApply")}
      </Button>
    </div>
  );
}
