"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bell, Plus, Trash2, Play, Pencil, History,
  AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useAlerts, useCreateAlert, useUpdateAlert, useDeleteAlert,
  useTestAlert, useAllAlertHistory,
} from "@/hooks/use-alerts";
import { useConnections } from "@/hooks/use-connections";
import { useChannels } from "@/hooks/use-channels";
import { describeCron } from "@/lib/cron-describe";
import type { AlertRule, AlertRuleCreate, AlertRuleUpdate } from "@/types";
import { useRoles } from "@/hooks/use-roles";

const EMPTY_FORM: AlertRuleCreate = {
  name: "",
  connection_id: 0,
  channel_id: null,
  alert_type: "threshold",
  sql_query: "",
  condition_column: "",
  condition_operator: ">",
  condition_value: 0,
  anomaly_config: {
    metric_column: "",
    detection_methods: ["iqr"],
    check_lower: true,
    check_upper: true,
    time_adjusted: false,
  },
  schedule: "0 * * * *",
  timezone: "Europe/Moscow",
  severity: "warning",
  is_active: true,
};

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  critical: <AlertCircle className="h-4 w-4 text-red-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  info: <Info className="h-4 w-4 text-blue-500" />,
};

function getCronPresets(t: (key: string) => string) {
  return [
    { label: t("cronEveryHour"), value: "0 * * * *" },
    { label: t("cronEvery30Min"), value: "*/30 * * * *" },
    { label: t("cronEvery5Min"), value: "*/5 * * * *" },
    { label: t("cronDaily9"), value: "0 9 * * *" },
    { label: t("cronDaily18"), value: "0 18 * * *" },
    { label: t("cronMon9"), value: "0 9 * * 1" },
    { label: t("cronFri17"), value: "0 17 * * 5" },
  ];
}

export default function AlertsPage() {
  const t = useTranslations("alert");
  const tc = useTranslations("common");
  const { canEdit } = useRoles();
  const { data: alerts = [], isLoading } = useAlerts();
  const { data: connections = [] } = useConnections();
  const { data: channels = [] } = useChannels();
  const { data: history = [] } = useAllAlertHistory();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();
  const deleteAlert = useDeleteAlert();
  const testAlert = useTestAlert();

  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AlertRuleCreate>(EMPTY_FORM);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const HISTORY_PAGE_SIZE = 20;
  const historyTotalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const pagedHistory = history.slice(
    (safeHistoryPage - 1) * HISTORY_PAGE_SIZE,
    safeHistoryPage * HISTORY_PAGE_SIZE,
  );

  const patch = (updates: Partial<AlertRuleCreate>) =>
    setForm((prev) => ({ ...prev, ...updates }));

  const patchAnomaly = (updates: Record<string, unknown>) =>
    setForm((prev) => ({
      ...prev,
      anomaly_config: { ...prev.anomaly_config, ...updates },
    }));

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowEditor(true);
  };

  const openEdit = (alert: AlertRule) => {
    setEditingId(alert.id);
    setForm({
      name: alert.name,
      connection_id: alert.connection_id,
      channel_id: alert.channel_id,
      alert_type: alert.alert_type,
      sql_query: alert.sql_query,
      condition_column: alert.condition_column || "",
      condition_operator: alert.condition_operator || ">",
      condition_value: alert.condition_value || 0,
      anomaly_config: alert.anomaly_config || EMPTY_FORM.anomaly_config,
      schedule: alert.schedule,
      timezone: alert.timezone,
      severity: alert.severity,
      is_active: alert.is_active,
    });
    setShowEditor(true);
  };

  const handleSave = () => {
    if (!form.name || !form.connection_id || !form.sql_query || !form.schedule) {
      toast.error(t("fillRequired"));
      return;
    }
    if (editingId) {
      updateAlert.mutate(
        { id: editingId, data: form as AlertRuleUpdate },
        { onSuccess: () => setShowEditor(false) }
      );
    } else {
      createAlert.mutate(form, { onSuccess: () => setShowEditor(false) });
    }
  };

  const handleTest = (id: number) => {
    testAlert.mutate(id, {
      onSuccess: (res) => {
        if (res.triggered) toast.warning(`Triggered: ${res.message}`);
        else if (res.error) toast.error(res.error);
        else toast.success(res.message || t("noAnomalyDetected"));
      },
    });
  };

  const handleToggle = (alert: AlertRule) => {
    updateAlert.mutate({
      id: alert.id,
      data: { is_active: !alert.is_active },
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-600">
            {alerts.length}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className="mr-1.5 h-4 w-4" />
            {t("history")}
          </Button>
          {canEdit && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("new")}
            </Button>
          )}
        </div>
      </div>

      {/* Alert History Panel */}
      {showHistory && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-medium text-slate-700">{t("recentHistory")}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">{t("noTriggered")}</p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-slate-500">
                    <tr>
                      <th className="pb-2">{t("time")}</th>
                      <th className="pb-2">{t("alert")}</th>
                      <th className="pb-2">{t("severity")}</th>
                      <th className="pb-2">{t("value")}</th>
                      <th className="pb-2">{t("message")}</th>
                      <th className="pb-2">{t("sent")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pagedHistory.map((h) => (
                      <tr key={h.id} className="text-slate-700">
                        <td className="py-1.5 pr-3 text-xs text-slate-500">
                          {new Date(h.triggered_at).toLocaleString()}
                        </td>
                        <td className="py-1.5 pr-3 font-medium">{h.alert_name || `#${h.alert_rule_id}`}</td>
                        <td className="py-1.5 pr-3">{SEVERITY_ICON[h.severity] || h.severity}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{h.current_value?.toFixed(2) ?? "—"}</td>
                        <td className="py-1.5 pr-3 max-w-xs truncate">{h.message}</td>
                        <td className="py-1.5">{h.notification_sent ? tc("yes") : tc("no")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    {(safeHistoryPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(safeHistoryPage * HISTORY_PAGE_SIZE, history.length)} of {history.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeHistoryPage <= 1}
                      onClick={() => setHistoryPage(safeHistoryPage - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {safeHistoryPage} / {historyTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safeHistoryPage >= historyTotalPages}
                      onClick={() => setHistoryPage(safeHistoryPage + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Alerts List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : alerts.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">{t("noAlerts")}</p>
          <p className="mb-4 text-sm text-slate-500">{t("createFirst")}</p>
          {canEdit && <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />{t("new")}</Button>}
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <Card key={alert.id} className={`p-4 transition-colors ${!alert.is_active ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {SEVERITY_ICON[alert.severity] || SEVERITY_ICON.warning}
                  <div>
                    <h3 className="font-medium text-slate-900">{alert.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{alert.alert_type}</span>
                      <span>{alert.schedule}</span>
                      {alert.last_run_at && (
                        <span>{t("last")}: {new Date(alert.last_run_at).toLocaleString()}</span>
                      )}
                      {alert.last_value != null && (
                        <span>{t("value")}: {alert.last_value.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}>
                    {expandedId === alert.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                  <Switch
                    checked={alert.is_active}
                    onCheckedChange={() => handleToggle(alert)}
                    className="scale-75"
                    title={alert.is_active ? t("disable") : t("enable")}
                  />
                  <Button variant="ghost" size="sm" onClick={() => handleTest(alert.id)} title={t("testNow")}>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(alert)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTargetId(alert.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === alert.id && (
                <div className="mt-3 border-t pt-3 text-xs text-slate-600">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="font-medium">{t("connection")}:</span> {connections.find((c) => c.id === alert.connection_id)?.name || alert.connection_id}</div>
                    <div><span className="font-medium">{t("channel")}:</span> {channels.find((c) => c.id === alert.channel_id)?.name || t("none")}</div>
                    <div><span className="font-medium">{t("timezone")}:</span> {alert.timezone}</div>
                    {alert.alert_type === "threshold" && (
                      <div><span className="font-medium">{t("condition")}:</span> {alert.condition_column} {alert.condition_operator} {alert.condition_value}</div>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="font-medium">{t("sql")}:</span>
                    <pre className="mt-1 rounded bg-slate-50 p-2 text-xs">{alert.sql_query}</pre>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editingId ? t("editAlert") : t("new")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <Label>{t("name")} *</Label>
              <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Revenue drop alert" />
            </div>

            {/* Connection + Channel */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("connection")} *</Label>
                <Select value={form.connection_id ? String(form.connection_id) : ""} onValueChange={(v) => patch({ connection_id: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder={t("selectConnection")} /></SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("notificationChannel")}</Label>
                <Select value={form.channel_id ? String(form.channel_id) : "none"} onValueChange={(v) => patch({ channel_id: v === "none" ? null : parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder={t("selectChannel")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("none")}</SelectItem>
                    {channels.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.channel_type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* SQL */}
            <div>
              <Label>{t("sqlQuery")} *</Label>
              <textarea
                value={form.sql_query}
                onChange={(e) => patch({ sql_query: e.target.value })}
                className="w-full rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-sm"
                rows={4}
                placeholder="SELECT metric_col FROM table WHERE ..."
              />
            </div>

            {/* Alert Type */}
            <div>
              <Label>{t("alertType")}</Label>
              <div className="mt-1 flex gap-2">
                {(["threshold", "anomaly"] as const).map((at) => (
                  <button
                    key={at}
                    onClick={() => patch({ alert_type: at })}
                    className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                      form.alert_type === at
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {at === "threshold" ? t("threshold") : t("anomalyDetection")}
                  </button>
                ))}
              </div>
            </div>

            {/* Threshold Config */}
            {form.alert_type === "threshold" && (
              <div className="rounded-md border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-medium text-slate-700">{t("thresholdCondition")}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">{t("column")}</Label>
                    <Input value={form.condition_column || ""} onChange={(e) => patch({ condition_column: e.target.value })} placeholder="metric_col" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("operator")}</Label>
                    <Select value={form.condition_operator || ">"} onValueChange={(v) => patch({ condition_operator: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[">", "<", ">=", "<=", "=", "!="].map((op) => (
                          <SelectItem key={op} value={op}>{op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">{t("value")}</Label>
                    <Input type="number" value={form.condition_value ?? 0} onChange={(e) => patch({ condition_value: parseFloat(e.target.value) })} />
                  </div>
                </div>
              </div>
            )}

            {/* Anomaly Config */}
            {form.alert_type === "anomaly" && (
              <div className="rounded-md border border-slate-200 p-4 space-y-3">
                <p className="text-sm font-medium text-slate-700">{t("anomalyDetection")}</p>
                <div>
                  <Label className="text-xs">{t("metricColumn")}</Label>
                  <Input
                    value={(form.anomaly_config?.metric_column as string) || ""}
                    onChange={(e) => patchAnomaly({ metric_column: e.target.value })}
                    placeholder="metric_col"
                  />
                </div>
                <div>
                  <Label className="text-xs">{t("detectionMethods")}</Label>
                  <div className="mt-1 flex gap-2">
                    {(["iqr", "3sigma"] as const).map((method) => {
                      const methods = (form.anomaly_config?.detection_methods as string[]) || ["iqr"];
                      const active = methods.includes(method);
                      return (
                        <button
                          key={method}
                          onClick={() => {
                            const next = active
                              ? methods.filter((m) => m !== method)
                              : [...methods, method];
                            if (next.length > 0) patchAnomaly({ detection_methods: next });
                          }}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {method === "iqr" ? "IQR" : "3-Sigma"}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Switch
                      checked={form.anomaly_config?.time_adjusted as boolean || false}
                      onCheckedChange={(v) => patchAnomaly({ time_adjusted: v })}
                      className="scale-75"
                    />
                    {t("timeAdjusted")}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Switch
                      checked={form.anomaly_config?.check_lower as boolean ?? true}
                      onCheckedChange={(v) => patchAnomaly({ check_lower: v })}
                      className="scale-75"
                    />
                    {t("checkLower")}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Switch
                      checked={form.anomaly_config?.check_upper as boolean ?? true}
                      onCheckedChange={(v) => patchAnomaly({ check_upper: v })}
                      className="scale-75"
                    />
                    {t("checkUpper")}
                  </div>
                </div>
              </div>
            )}

            {/* Schedule + Severity */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{t("scheduleCron")} *</Label>
                <Input value={form.schedule} onChange={(e) => patch({ schedule: e.target.value })} placeholder="0 * * * *" />
                {form.schedule && (
                  <p className="mt-1 text-xs text-muted-foreground">{describeCron(form.schedule)}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {getCronPresets(t).map((p) => (
                    <button
                      key={p.value}
                      onClick={() => patch({ schedule: p.value })}
                      className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>{t("severity")}</Label>
                <Select value={form.severity} onValueChange={(v) => patch({ severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">{t("critical")}</SelectItem>
                    <SelectItem value="warning">{t("warning")}</SelectItem>
                    <SelectItem value="info">{t("info")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("timezone")}</Label>
                <Input value={form.timezone} onChange={(e) => patch({ timezone: e.target.value })} />
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => patch({ is_active: v })}
              />
              {t("active")}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>{tc("cancel")}</Button>
            <Button onClick={handleSave} disabled={createAlert.isPending || updateAlert.isPending}>
              {editingId ? tc("update") : tc("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("areYouSure")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { deleteAlert.mutate(deleteTargetId!); setDeleteTargetId(null); }}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
