"use client";

import { PlotlyChart } from "@/components/charts/plotly-chart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { parseCodeToVisual } from "@/lib/parse-code";
import type { ChartExecuteResult } from "@/types";
import { useState, useRef, useCallback, type MutableRefObject } from "react";

import dynamic from "next/dynamic";
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface CodeTabProps {
  chartCode: string;
  setChartCode: (v: string) => void;
  codeSubTab: "editor" | "output";
  setCodeSubTab: (v: "editor" | "output") => void;
  codeUpdatedVisual: boolean;
  setCodeUpdatedVisual: (v: boolean) => void;
  codeEditingRef: MutableRefObject<boolean>;
  codeEditTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  result: ChartExecuteResult | null;
  previewing: boolean;
  isDark: boolean;
  setChartType: (v: string) => void;
  setChartConfig: (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

export function CodeTab({
  chartCode,
  setChartCode,
  codeSubTab,
  setCodeSubTab,
  codeUpdatedVisual: _codeUpdatedVisual,
  setCodeUpdatedVisual,
  codeEditingRef,
  codeEditTimerRef,
  result,
  previewing,
  isDark,
  setChartType,
  setChartConfig,
}: CodeTabProps) {
  const t = useTranslations("chart");
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCodeEditing, setIsCodeEditing] = useState(false);

  const debouncedParse = useCallback((code: string) => {
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    parseTimerRef.current = setTimeout(() => {
      const parsed = parseCodeToVisual(code);
      if (parsed) {
        const { _chartType, ...configPatch } = parsed;
        if (_chartType && typeof _chartType === "string") {
          setChartType(_chartType);
        }
        if (Object.keys(configPatch).length > 0) {
          setChartConfig((prev: Record<string, unknown>) => ({ ...prev, ...configPatch }));
          setCodeUpdatedVisual(true);
        }
      }
    }, 300);
  }, [setChartType, setChartConfig, setCodeUpdatedVisual]);

  return (
    <Tabs value={codeSubTab} onValueChange={(v) => setCodeSubTab(v as typeof codeSubTab)} className="flex flex-col flex-1 min-h-0 gap-0">
      {/* Sub-tabs + sync badge */}
      <div className="flex items-center gap-1 border-b border-border mb-2">
        <TabsList variant="line" className="h-auto">
          <TabsTrigger value="editor" className="px-3 py-1.5 text-xs">
            Editor
          </TabsTrigger>
          <TabsTrigger value="output" className="px-3 py-1.5 text-xs">
            {t("output")}
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-2">
          {isCodeEditing ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-600 dark:text-yellow-400">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              Syncing...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-600 dark:text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Synced
            </span>
          )}
        </div>
      </div>

      {/* Editor sub-tab */}
      <TabsContent value="editor" className="space-y-2 flex-1 min-h-0 mt-0">
        <div className="overflow-hidden rounded-md border border-border flex-1">
          <MonacoEditor
            height="calc(100vh - 420px)"
            language="python"
            value={chartCode}
            onChange={(v) => {
              const newCode = v || "";
              codeEditingRef.current = true;
              setIsCodeEditing(true);
              setChartCode(newCode);
              debouncedParse(newCode);
              if (codeEditTimerRef.current) clearTimeout(codeEditTimerRef.current);
              codeEditTimerRef.current = setTimeout(() => {
                codeEditingRef.current = false;
                setIsCodeEditing(false);
              }, 2000);
            }}
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              fontSize: 13,
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 4,
            }}
            theme={isDark ? "vs-dark" : "vs-light"}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Available: df (DataFrame), pd, px, go, np. Must produce a &apos;fig&apos; variable.
        </p>
      </TabsContent>

      {/* Output sub-tab — inline Plotly preview or table */}
      <TabsContent value="output" className="flex-1 min-h-0 overflow-hidden rounded-md border border-border bg-card mt-0">
        {previewing ? (
          <div className="flex h-full items-center justify-center min-h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
          </div>
        ) : result?.error ? (
          <div className="p-4">
            <p className="text-sm text-red-500">{typeof result.error === 'string' ? result.error : result.error?.message}</p>
          </div>
        ) : result?.figure ? (
          <div className="h-full min-h-[300px]">
            <PlotlyChart figure={result.figure} className="h-full w-full" />
          </div>
        ) : result?.columns && result.columns.length > 0 ? (
          <div className="h-full overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {result.columns.map((col) => (
                    <th key={col} className="border-b border-border px-3 py-2 text-left font-semibold text-muted-foreground">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 100).map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/50"}>
                    {row.map((cell, j) => (
                      <td key={j} className="border-b border-border px-3 py-1.5">{cell != null ? String(cell) : ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center min-h-[300px] text-muted-foreground text-sm">
            No output yet — edit code and it will auto-preview
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
