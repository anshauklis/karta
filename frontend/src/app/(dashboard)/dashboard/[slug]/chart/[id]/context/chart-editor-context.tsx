"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ChartEditorState } from "../hooks/use-chart-editor";

const ChartEditorContext = createContext<ChartEditorState | null>(null);

/**
 * Provides the chart editor's full state to descendant panels so they can read
 * what they need via `useChartEditorContext()` instead of receiving ~70 props
 * drilled through page.tsx. The value is the object returned by useChartEditor.
 */
export function ChartEditorProvider({
  editor,
  children,
}: {
  editor: ChartEditorState;
  children: ReactNode;
}) {
  return (
    <ChartEditorContext.Provider value={editor}>
      {children}
    </ChartEditorContext.Provider>
  );
}

export function useChartEditorContext(): ChartEditorState {
  const ctx = useContext(ChartEditorContext);
  if (!ctx) {
    throw new Error("useChartEditorContext must be used within a ChartEditorProvider");
  }
  return ctx;
}
