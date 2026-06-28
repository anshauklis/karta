import type { ConditionalFormatRule } from "@/types";

type UpdateConfig = (key: string, value: unknown) => void;

/**
 * Conditional-formatting rule management for the chart editor. Operates on the
 * chart config's `conditional_formatting` array via the shared `updateConfig`
 * setter. Extracted from use-chart-editor.ts to shrink the god-hook.
 */
export function useConditionalFormatting(
  chartConfig: Record<string, unknown>,
  updateConfig: UpdateConfig,
) {
  const formattingRules =
    (chartConfig.conditional_formatting as ConditionalFormatRule[] | undefined) || [];

  const addFormattingRule = () => {
    const newRule: ConditionalFormatRule = {
      column: "",
      type: "threshold",
      rules: [{ op: ">", value: 0, color: "#dcfce7", text_color: "" }],
    };
    updateConfig("conditional_formatting", [...formattingRules, newRule]);
  };

  const removeFormattingRule = (idx: number) => {
    updateConfig("conditional_formatting", formattingRules.filter((_, i) => i !== idx));
  };

  const updateFormattingRule = (idx: number, patch: Partial<ConditionalFormatRule>) => {
    const updated = formattingRules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    updateConfig("conditional_formatting", updated);
  };

  const addThresholdSubRule = (ruleIdx: number) => {
    const rule = formattingRules[ruleIdx];
    const subRules = rule.rules || [];
    updateFormattingRule(ruleIdx, {
      rules: [...subRules, { op: ">", value: 0, color: "#dcfce7", text_color: "" }],
    });
  };

  const removeThresholdSubRule = (ruleIdx: number, subIdx: number) => {
    const rule = formattingRules[ruleIdx];
    updateFormattingRule(ruleIdx, { rules: (rule.rules || []).filter((_, i) => i !== subIdx) });
  };

  const updateThresholdSubRule = (
    ruleIdx: number,
    subIdx: number,
    patch: Partial<{ op: string; value: number; color: string; text_color: string }>,
  ) => {
    const rule = formattingRules[ruleIdx];
    const subRules = (rule.rules || []).map((r, i) => (i === subIdx ? { ...r, ...patch } : r));
    updateFormattingRule(ruleIdx, { rules: subRules });
  };

  return {
    formattingRules,
    addFormattingRule,
    removeFormattingRule,
    updateFormattingRule,
    addThresholdSubRule,
    removeThresholdSubRule,
    updateThresholdSubRule,
  };
}
