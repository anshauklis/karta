"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";

interface SuggestedQuestionsProps {
  context?: { type: string; id: number };
  onSelect: (question: string) => void;
}

const QUESTIONS: Record<string, string[]> = {
  dashboard: [
    "What trends are visible?",
    "Which metric changed most?",
    "Summarize this dashboard",
  ],
  chart: [
    "Explain this chart's data",
    "How can I improve this visualization?",
    "What patterns do you see?",
  ],
  "sql-lab": [
    "Help me write a query",
    "Optimize this SQL",
    "Explain this schema",
  ],
  default: [
    "Show me the database schema",
    "What data is available?",
    "Create a chart",
  ],
};

export function SuggestedQuestions({ context, onSelect }: SuggestedQuestionsProps) {
  const t = useTranslations("copilot");

  const questions = useMemo(() => {
    if (context?.type && QUESTIONS[context.type]) {
      return QUESTIONS[context.type];
    }
    return QUESTIONS.default;
  }, [context?.type]);

  return (
    <div className="py-8 text-center">
      <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground mb-4">{t("suggestedTitle")}</p>
      <div className="space-y-2 px-2">
        {questions.map((question) => (
          <button
            key={question}
            onClick={() => onSelect(question)}
            className="block w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
