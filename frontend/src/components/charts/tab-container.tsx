"use client";

import { useState, useMemo, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartCard } from "./chart-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useContainerWidth } from "@/hooks/use-container-width";
import type { Chart, ChartExecuteResult } from "@/types";

import dynamic from "next/dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */
const ReactGridLayout = dynamic(
  () => import("react-grid-layout/legacy").then((mod) => mod.default || mod) as any,
  { ssr: false },
) as any;
/* eslint-enable @typescript-eslint/no-explicit-any */
import "react-grid-layout/css/styles.css";

interface TabDef {
  id: string;
  title: string;
  charts: { chart_id: number; x: number; y: number; w: number; h: number }[];
}

interface TabContainerProps {
  chart: Chart;
  allCharts: Chart[];
  results: Record<number, ChartExecuteResult>;
  executing: Set<number>;
  isEditing: boolean;
  onUpdateConfig: (config: Record<string, unknown>) => void;
  onEdit?: (chartId: number) => void;
  onRefresh?: (chartId: number) => void;
  onDuplicate?: (chartId: number) => void;
}

export function TabContainer({
  chart,
  allCharts,
  results,
  executing,
  isEditing,
  onUpdateConfig,
  onEdit,
  onRefresh,
  onDuplicate,
}: TabContainerProps) {
  const t = useTranslations("dashboard");
  const tabs = useMemo(
    () => (chart.chart_config?.tabs as TabDef[]) || [],
    [chart.chart_config?.tabs],
  );
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id || "");
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [innerContainerRef, innerWidth] = useContainerWidth(800);

  // Map of chart_id -> Chart for quick lookup
  const chartMap = useMemo(() => {
    const map = new Map<number, Chart>();
    allCharts.forEach((c) => map.set(c.id, c));
    return map;
  }, [allCharts]);

  const updateTabs = useCallback(
    (newTabs: TabDef[]) => {
      onUpdateConfig({ ...chart.chart_config, tabs: newTabs });
    },
    [chart.chart_config, onUpdateConfig],
  );

  const handleAddTab = useCallback(() => {
    const newTab: TabDef = {
      id: crypto.randomUUID(),
      title: `Tab ${tabs.length + 1}`,
      charts: [],
    };
    const newTabs = [...tabs, newTab];
    updateTabs(newTabs);
    setActiveTab(newTab.id);
  }, [tabs, updateTabs]);

  const handleDeleteTab = useCallback(
    (tabId: string) => {
      if (tabs.length <= 1) return;
      const newTabs = tabs.filter((tab) => tab.id !== tabId);
      updateTabs(newTabs);
      if (activeTab === tabId) {
        setActiveTab(newTabs[0]?.id || "");
      }
    },
    [tabs, activeTab, updateTabs],
  );

  const handleRenameTab = useCallback(
    (tabId: string, newTitle: string) => {
      const newTabs = tabs.map((tab) =>
        tab.id === tabId ? { ...tab, title: newTitle } : tab,
      );
      updateTabs(newTabs);
      setEditingTabId(null);
    },
    [tabs, updateTabs],
  );

  const handleLayoutChange = useCallback(
    (tabId: string, layout: { i: string; x: number; y: number; w: number; h: number }[]) => {
      const newTabs = tabs.map((tab) => {
        if (tab.id !== tabId) return tab;
        const updatedCharts = tab.charts.map((c) => {
          const item = layout.find((l) => l.i === String(c.chart_id));
          if (!item) return c;
          return { ...c, x: item.x, y: item.y, w: item.w, h: item.h };
        });
        return { ...tab, charts: updatedCharts };
      });
      updateTabs(newTabs);
    },
    [tabs, updateTabs],
  );

  // Keep activeTab in sync when tabs change (e.g. first render or tab deletion)
  const resolvedActiveTab = tabs.find((tab) => tab.id === activeTab)
    ? activeTab
    : tabs[0]?.id || "";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Tab bar */}
      <Tabs
        value={resolvedActiveTab}
        onValueChange={setActiveTab}
        className="flex h-full flex-col"
      >
        <div className="flex items-center border-b border-border bg-muted/30 px-2">
          <TabsList className="h-8">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="group/tab relative h-7 gap-1 text-xs"
              >
                {editingTabId === tab.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameTab(tab.id, editingTitle);
                        if (e.key === "Escape") setEditingTabId(null);
                      }}
                      className="h-5 w-20 text-xs px-1"
                    />
                    <button
                      onClick={() => handleRenameTab(tab.id, editingTitle)}
                      className="text-green-600 hover:text-green-700"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setEditingTabId(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    {tab.title}
                    {isEditing && (
                      <span className="ml-1 hidden items-center gap-0.5 group-hover/tab:inline-flex">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTabId(tab.id);
                            setEditingTitle(tab.title);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        {tabs.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTab(tab.id);
                            }}
                            className="text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </span>
                    )}
                  </>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="ml-1 h-6 w-6"
              onClick={handleAddTab}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Tab content with nested grid */}
        <div ref={innerContainerRef} className="flex-1 overflow-auto">
          {tabs.map((tab) => {
            const tabLayout = tab.charts.map((c) => ({
              i: String(c.chart_id),
              x: c.x,
              y: c.y,
              w: c.w,
              h: c.h,
              minW: 2,
              minH: 2,
            }));

            return (
              <TabsContent key={tab.id} value={tab.id} className="h-full mt-0">
                {tab.charts.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-4">
                    <p className="text-xs text-muted-foreground">
                      {isEditing
                        ? t("tabEmptyEdit")
                        : t("tabEmpty")}
                    </p>
                  </div>
                ) : (
                  <ReactGridLayout
                    className="layout"
                    layout={tabLayout}
                    cols={12}
                    rowHeight={30}
                    width={innerWidth}
                    isDraggable={isEditing}
                    isResizable={isEditing}
                    compactType="vertical"
                    margin={[8, 8]}
                    draggableHandle=".inner-drag-handle"
                    onDragStop={(layout: { i: string; x: number; y: number; w: number; h: number }[]) =>
                      handleLayoutChange(tab.id, layout)
                    }
                    onResizeStop={(layout: { i: string; x: number; y: number; w: number; h: number }[]) =>
                      handleLayoutChange(tab.id, layout)
                    }
                  >
                    {tab.charts.map((tc) => {
                      const innerChart = chartMap.get(tc.chart_id);
                      if (!innerChart) return <div key={String(tc.chart_id)} />;
                      return (
                        <div key={String(tc.chart_id)}>
                          <div className="relative h-full group">
                            {isEditing && (
                              <div className="inner-drag-handle absolute inset-x-0 top-0 z-10 h-8 cursor-move flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 rounded bg-muted/80 px-1.5 py-0.5">
                                  <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
                                </div>
                              </div>
                            )}
                            <ChartCard
                              chart={innerChart}
                              result={results[innerChart.id]}
                              isExecuting={executing.has(innerChart.id)}
                              onEdit={onEdit}
                              onRefresh={onRefresh}
                              onDuplicate={onDuplicate}
                              showActions={true}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </ReactGridLayout>
                )}
              </TabsContent>
            );
          })}
        </div>
      </Tabs>
    </div>
  );
}
