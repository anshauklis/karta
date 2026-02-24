"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  FileText, Plus, Trash2, Send, Pencil,
  Bell as ChannelIcon, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useReports, useCreateReport, useUpdateReport, useDeleteReport, useSendReport,
} from "@/hooks/use-reports";
import {
  useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel, useTestChannel,
} from "@/hooks/use-channels";
import { useDashboards } from "@/hooks/use-dashboards";
import { useDashboardCharts } from "@/hooks/use-charts";
import { describeCron } from "@/lib/cron-describe";
import type { ScheduledReport, NotificationChannel } from "@/types";
import { useRoles } from "@/hooks/use-roles";

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

interface ReportForm {
  name: string;
  chart_id: number;
  channel_id: number | null;
  schedule: string;
  timezone: string;
  is_active: boolean;
}

const EMPTY_FORM: ReportForm = {
  name: "",
  chart_id: 0,
  channel_id: null,
  schedule: "0 9 * * *",
  timezone: "Europe/Moscow",
  is_active: true,
};

export default function ReportsPage() {
  const t = useTranslations("report");
  const tc = useTranslations("common");
  const { canEdit } = useRoles();
  const { data: reports = [], isLoading } = useReports();
  const { data: channels = [] } = useChannels();
  const { data: dashboards = [] } = useDashboards();
  const createReport = useCreateReport();
  const updateReport = useUpdateReport();
  const deleteReport = useDeleteReport();
  const sendReport = useSendReport();

  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ReportForm>(EMPTY_FORM);
  const [showChannels, setShowChannels] = useState(false);

  // For chart selection: pick dashboard first, then chart
  const [selectedDashId, setSelectedDashId] = useState<number | null>(null);
  const { data: dashCharts = [] } = useDashboardCharts(selectedDashId ?? undefined);

  const patch = (updates: Partial<ReportForm>) =>
    setForm((prev) => ({ ...prev, ...updates }));

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedDashId(null);
    setShowEditor(true);
  };

  const openEdit = (report: ScheduledReport) => {
    setEditingId(report.id);
    setForm({
      name: report.name,
      chart_id: report.chart_id,
      channel_id: report.channel_id,
      schedule: report.schedule,
      timezone: report.timezone,
      is_active: report.is_active,
    });
    setSelectedDashId(null);
    setShowEditor(true);
  };

  const handleSave = () => {
    if (!form.name || !form.chart_id || !form.schedule) {
      toast.error(t("fillRequired"));
      return;
    }
    if (editingId) {
      updateReport.mutate(
        { id: editingId, data: form },
        { onSuccess: () => setShowEditor(false) }
      );
    } else {
      createReport.mutate(form, { onSuccess: () => setShowEditor(false) });
    }
  };

  const handleSend = (id: number) => {
    sendReport.mutate(id, {
      onSuccess: (res) => {
        if (res.success) toast.success(t("reportSent"));
        else toast.error(res.error || t("failedToSend"));
      },
    });
  };

  const handleToggle = (report: ScheduledReport) => {
    updateReport.mutate({
      id: report.id,
      data: { is_active: !report.is_active },
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl font-semibold text-slate-900">{t("title")}</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-600">
            {reports.length}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowChannels(true)}>
            <Settings className="mr-1.5 h-4 w-4" />
            {t("channels")}
          </Button>
          {canEdit && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("new")}
            </Button>
          )}
        </div>
      </div>

      {/* Reports List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : reports.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-lg font-medium text-slate-600">{t("noReports")}</p>
          <p className="mb-4 text-sm text-slate-500">{t("noReportsDesc")}</p>
          {canEdit && <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />{t("new")}</Button>}
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Card key={report.id} className={`p-4 transition-colors ${!report.is_active ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-slate-900">{report.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {report.chart_title && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">Chart: {report.chart_title}</span>
                    )}
                    {report.channel_name && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">{report.channel_name}</span>
                    )}
                    <span>{report.schedule}</span>
                    {report.last_run_at && (
                      <span>{t("last")}: {new Date(report.last_run_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={report.is_active}
                    onCheckedChange={() => handleToggle(report)}
                    className="scale-75"
                    title={report.is_active ? t("disable") : t("enable")}
                  />
                  <Button variant="ghost" size="sm" onClick={() => handleSend(report.id)} title={t("sendNow")}
                    disabled={sendReport.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(report)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteReport.mutate(report.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Report Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editingId ? t("editReport") : t("newScheduled")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t("name")} *</Label>
              <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Daily revenue report" />
            </div>

            {/* Dashboard → Chart selector */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("dashboard")}</Label>
                <Select value={selectedDashId ? String(selectedDashId) : ""} onValueChange={(v) => { setSelectedDashId(parseInt(v)); patch({ chart_id: 0 }); }}>
                  <SelectTrigger><SelectValue placeholder={t("selectDashboard")} /></SelectTrigger>
                  <SelectContent>
                    {dashboards.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("chart")} *</Label>
                <Select value={form.chart_id ? String(form.chart_id) : ""} onValueChange={(v) => patch({ chart_id: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder={t("selectChart")} /></SelectTrigger>
                  <SelectContent>
                    {dashCharts.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("scheduleCron")} *</Label>
                <Input value={form.schedule} onChange={(e) => patch({ schedule: e.target.value })} placeholder="0 9 * * *" />
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
            <Button onClick={handleSave} disabled={createReport.isPending || updateReport.isPending}>
              {editingId ? tc("update") : tc("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channels Management Dialog */}
      <ChannelsDialog open={showChannels} onClose={() => setShowChannels(false)} />
    </div>
  );
}

// --- Channels Management Dialog ---

function ChannelsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("report");
  const tc = useTranslations("common");
  const { data: channels = [] } = useChannels();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();
  const testChannel = useTestChannel();

  const [showAdd, setShowAdd] = useState(false);
  const [channelType, setChannelType] = useState<"slack" | "telegram" | "email">("telegram");
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [recipients, setRecipients] = useState("");

  const handleCreate = () => {
    if (channelType === "email") {
      if (!name || !recipients) {
        toast.error(t("allFieldsRequired"));
        return;
      }
    } else if (!name || !botToken || !chatId) {
      toast.error(t("allFieldsRequired"));
      return;
    }
    const config: Record<string, string> =
      channelType === "slack"
        ? { bot_token: botToken, channel_id: chatId }
        : channelType === "email"
        ? { recipients }
        : { bot_token: botToken, chat_id: chatId };

    createChannel.mutate(
      { name, channel_type: channelType, config },
      {
        onSuccess: () => {
          setShowAdd(false);
          setName("");
          setBotToken("");
          setChatId("");
          setRecipients("");
        },
      }
    );
  };

  const handleTest = (id: number) => {
    testChannel.mutate(id, {
      onSuccess: (res) => {
        if (res.success) toast.success(t("testMessageSent"));
        else toast.error(res.error || t("testFailed"));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("channelsTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {channels.length === 0 && !showAdd && (
            <p className="text-center text-sm text-slate-500 py-4">
              {t("noChannels")}
            </p>
          )}

          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-slate-900">{ch.name}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{ch.channel_type}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ch.channel_type === "telegram" ? `Chat: ${ch.config.chat_id}` : ch.channel_type === "email" ? `To: ${ch.config.recipients}` : `Channel: ${ch.config.channel_id}`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleTest(ch.id)} disabled={testChannel.isPending}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteChannel.mutate(ch.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </div>
          ))}

          {showAdd ? (
            <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/50 p-3">
              <div className="flex gap-2">
                {(["telegram", "slack", "email"] as const).map((ct) => (
                  <button
                    key={ct}
                    onClick={() => setChannelType(ct)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      channelType === ct
                        ? "border-blue-500 bg-blue-100 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {ct === "telegram" ? "Telegram" : ct === "email" ? "Email" : "Slack"}
                  </button>
                ))}
              </div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("channelName")} />
              {channelType === "email" ? (
                <Input
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder={t("emailRecipients")}
                  type="email"
                />
              ) : (
                <>
                  <Input value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder={t("botToken")} type="password" />
                  <Input
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder={channelType === "slack" ? "Slack channel ID" : "Telegram chat ID"}
                  />
                </>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={createChannel.isPending}>{tc("add")}</Button>
                <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>{tc("cancel")}</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("addChannel")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
