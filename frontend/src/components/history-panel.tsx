"use client";

import { useTranslations } from "next-intl";
import { useEntityHistory } from "@/hooks/use-history";
import { Badge } from "@/components/ui/badge";
import { Loader2, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HistoryPanelProps {
  entityType: string;
  entityId: number;
  onClose: () => void;
}

export function HistoryPanel({ entityType, entityId, onClose }: HistoryPanelProps) {
  const td = useTranslations("dashboard");
  const { data: history, isLoading } = useEntityHistory(entityType, entityId);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-96 flex-col border-l border-slate-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">{td("changeHistory")}</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : !history || history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <History className="mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">{td("noChanges")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${
                        item.action === "created"
                          ? "bg-emerald-50 text-emerald-700"
                          : item.action === "deleted"
                            ? "bg-red-50 text-red-700"
                            : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {item.action}
                    </Badge>
                    <span className="text-xs font-medium text-slate-700">
                      {item.user_name || `User #${item.user_id}`}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>

                {/* Changed fields */}
                {Object.keys(item.changes).length > 0 && (
                  <div className="space-y-1.5">
                    {Object.entries(item.changes).map(([field, change]) => (
                      <div key={field} className="rounded bg-slate-50 px-2 py-1.5">
                        <span className="text-[10px] font-medium uppercase text-slate-400">{field}</span>
                        <div className="mt-0.5 flex gap-2 text-xs">
                          <span className="truncate text-red-500 line-through">
                            {typeof change.old === "object" ? JSON.stringify(change.old) : String(change.old ?? "—")}
                          </span>
                          <span className="text-slate-400">&rarr;</span>
                          <span className="truncate text-emerald-600">
                            {typeof change.new === "object" ? JSON.stringify(change.new) : String(change.new ?? "—")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
