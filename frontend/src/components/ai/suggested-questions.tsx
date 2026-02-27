"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

interface SuggestedQuestionsProps {
  context?: { type: string; id: number };
  onSelect: (question: string) => void;
}

export function SuggestedQuestions({ context, onSelect }: SuggestedQuestionsProps) {
  const t = useTranslations("copilot");

  const questionKeys = useMemo(() => {
    switch (context?.type) {
      case "dashboard":
        return [
          "questionDashboardTrends",
          "questionDashboardMetric",
          "questionDashboardSummarize",
        ] as const;
      case "chart":
        return [
          "questionChartExplain",
          "questionChartImprove",
          "questionChartPatterns",
        ] as const;
      case "sql-lab":
        return [
          "questionSqlHelp",
          "questionSqlOptimize",
          "questionSqlSchema",
        ] as const;
      default:
        return [
          "questionDefaultSchema",
          "questionDefaultData",
          "questionDefaultChart",
        ] as const;
    }
  }, [context?.type]);

  return (
    <div className="py-8 text-center">
      <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground mb-4">{t("suggestedTitle")}</p>
      <div className="space-y-2 px-2">
        {questionKeys.map((key) => {
          const question = t(key);
          return (
            <button
              key={key}
              onClick={() => onSelect(question)}
              className="block w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {question}
            </button>
          );
        })}
      </div>
    </div>
  );
}
