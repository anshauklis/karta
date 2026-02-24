"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useChartAnnotations,
  useCreateChartAnnotation,
  useDashboardAnnotations,
  useCreateDashboardAnnotation,
  useDeleteAnnotation,
} from "@/hooks/use-annotations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Trash2, Loader2, X } from "lucide-react";

interface CommentsPanelProps {
  entityType: "chart" | "dashboard";
  entityId: number;
  onClose: () => void;
}

export function CommentsPanel({ entityType, entityId, onClose }: CommentsPanelProps) {
  const td = useTranslations("dashboard");
  const chartQuery = useChartAnnotations(entityType === "chart" ? entityId : undefined);
  const dashQuery = useDashboardAnnotations(entityType === "dashboard" ? entityId : undefined);
  const createChart = useCreateChartAnnotation(entityType === "chart" ? entityId : undefined);
  const createDash = useCreateDashboardAnnotation(entityType === "dashboard" ? entityId : undefined);
  const deleteAnnotation = useDeleteAnnotation(entityType, entityId);

  const annotations = entityType === "chart" ? chartQuery.data : dashQuery.data;
  const isLoading = entityType === "chart" ? chartQuery.isLoading : dashQuery.isLoading;
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (!text.trim()) return;
    const body = { annotation_type: "comment", content: text.trim() };
    if (entityType === "chart") {
      createChart.mutate(body, { onSuccess: () => setText("") });
    } else {
      createDash.mutate(body, { onSuccess: () => setText("") });
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-border bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{td("comments")}</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !annotations || annotations.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{td("noComments")}</p>
        ) : (
          annotations.map((a) => (
            <div key={a.id} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-foreground">
                  {a.user_name || `User #${a.user_id}`}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                  <button
                    onClick={() => deleteAnnotation.mutate(a.id)}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <Input
            placeholder={td("addComment")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="text-sm"
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!text.trim() || createChart.isPending || createDash.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
