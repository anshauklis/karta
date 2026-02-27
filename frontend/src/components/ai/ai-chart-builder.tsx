"use client";

import { useState, useRef, useCallback } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSuggestChartConfig, type SuggestChartConfigResult } from "@/hooks/use-ai";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface AIChartBuilderProps {
  connectionId?: number;
  datasetId?: number;
  columns: string[];
  currentConfig: Record<string, unknown>;
  currentChartType: string;
  onSuggest: (suggestion: SuggestChartConfigResult) => void;
}

export function AIChartBuilder({
  connectionId,
  datasetId,
  columns,
  currentConfig,
  currentChartType,
  onSuggest,
}: AIChartBuilderProps) {
  const [prompt, setPrompt] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastExplanation, setLastExplanation] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggest = useSuggestChartConfig();

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    try {
      const result = await suggest.mutateAsync({
        prompt: trimmed,
        connection_id: connectionId,
        dataset_id: datasetId,
        columns,
        current_config: currentConfig,
        current_chart_type: currentChartType,
      });

      onSuggest(result);
      setLastExplanation(result.explanation || null);

      if (result.title) {
        toast.success(`AI suggests: ${result.title}`);
      } else {
        toast.success("AI chart config applied");
      }
    } catch {
      // api.ts already shows error toast
    }
  }, [prompt, connectionId, datasetId, columns, currentConfig, currentChartType, suggest, onSuggest]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      setIsExpanded(false);
      setPrompt("");
      setLastExplanation(null);
    }
  };

  // Collapsed state: just a button
  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => {
          setIsExpanded(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <Sparkles className="h-3.5 w-3.5" />
        AI
      </Button>
    );
  }

  // Expanded state: input + submit
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex items-center">
        <Sparkles className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your chart..."
          disabled={suggest.isPending}
          className="h-7 w-64 pl-7 pr-7 text-xs"
          autoFocus
        />
        {prompt && !suggest.isPending && (
          <button
            onClick={() => {
              setPrompt("");
              setLastExplanation(null);
              inputRef.current?.focus();
            }}
            className="absolute right-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {suggest.isPending && (
          <Loader2 className="absolute right-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      <Button
        size="sm"
        className="h-7 px-2.5 text-xs"
        onClick={handleSubmit}
        disabled={!prompt.trim() || suggest.isPending}
      >
        {suggest.isPending ? "Thinking..." : "Apply"}
      </Button>

      <button
        onClick={() => {
          setIsExpanded(false);
          setPrompt("");
          setLastExplanation(null);
        }}
        className={cn(
          "text-muted-foreground hover:text-foreground transition-colors",
          suggest.isPending && "pointer-events-none opacity-50",
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {lastExplanation && (
        <span className="text-[10px] text-muted-foreground max-w-48 truncate" title={lastExplanation}>
          {lastExplanation}
        </span>
      )}
    </div>
  );
}
