"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Bot, Plus, Trash2, Edit2, Save, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import {
  useAIGlossary,
  useCreateGlossaryTerm,
  useUpdateGlossaryTerm,
  useDeleteGlossaryTerm,
  type AIGlossaryTerm,
} from "@/hooks/use-ai";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface AIStatus {
  enabled: boolean;
  api_url: string;
  api_key_set: boolean;
  api_key_preview: string;
  model: string;
  total_sessions: number;
  total_messages: number;
}

interface AdminSession {
  id: number;
  title: string;
  context_type: string | null;
  user_name: string;
  user_email: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export default function AdminAiPage() {
  const t = useTranslations("aiAssistant");

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{t("aiSettings")}</h1>
      </div>
      <ConfigSection />
      <SessionsSection />
      <GlossarySection />
    </div>
  );
}

function ConfigSection() {
  const t = useTranslations("aiAssistant");
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  const { data: status } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api.get<AIStatus>("/api/ai/status", token),
    enabled: !!token,
  });

  if (!status) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">{t("status")}</CardTitle>
        </CardHeader>
        <CardContent>
          {status.enabled ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="font-medium text-green-700">{t("enabled")}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="font-medium text-red-700">{t("disabled")}</span>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">{t("model")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium font-mono text-sm">{status.model}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{status.api_url}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">{t("apiKey")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-sm">{status.api_key_preview || "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {status.api_key_set ? t("keyConfigured") : t("keyNotSet")}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">{t("usage")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{status.total_sessions}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("sessionsCount", { messages: status.total_messages })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SessionsSection() {
  const t = useTranslations("aiAssistant");
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  const { data: sessions } = useQuery({
    queryKey: ["ai-admin-sessions"],
    queryFn: () => api.get<AdminSession[]>("/api/ai/admin/sessions", token),
    enabled: !!token,
  });

  if (!sessions || sessions.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        {t("recentSessions")}
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("sessionUser")}</TableHead>
            <TableHead>{t("sessionTitle")}</TableHead>
            <TableHead className="text-center">{t("messages")}</TableHead>
            <TableHead>{t("lastActivity")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.slice(0, 20).map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <div>
                  <p className="text-sm font-medium">{s.user_name}</p>
                  <p className="text-xs text-muted-foreground">{s.user_email}</p>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm">{s.title || "Untitled"}</span>
                {s.context_type && (
                  <Badge variant="outline" className="ml-2 text-[10px]">{s.context_type}</Badge>
                )}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary">{s.message_count}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(s.updated_at).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function GlossarySection() {
  const t = useTranslations("aiAssistant");
  const tc = useTranslations("common");
  const { data: terms } = useAIGlossary();
  const createTerm = useCreateGlossaryTerm();
  const updateTerm = useUpdateGlossaryTerm();
  const deleteTerm = useDeleteGlossaryTerm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<AIGlossaryTerm | null>(null);
  const [form, setForm] = useState({ term: "", definition: "", sql_hint: "" });

  const handleSave = () => {
    if (!form.term || !form.definition) return;
    if (editingTerm) {
      updateTerm.mutate(
        { id: editingTerm.id, ...form },
        { onSuccess: () => { setDialogOpen(false); resetForm(); } }
      );
    } else {
      createTerm.mutate(form, {
        onSuccess: () => { setDialogOpen(false); resetForm(); },
      });
    }
  };

  const resetForm = () => {
    setForm({ term: "", definition: "", sql_hint: "" });
    setEditingTerm(null);
  };

  const startEdit = (term: AIGlossaryTerm) => {
    setEditingTerm(term);
    setForm({ term: term.term, definition: term.definition, sql_hint: term.sql_hint || "" });
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">{t("glossary")}</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              {t("addTerm")}
            </Button>
          </DialogTrigger>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>{editingTerm ? tc("edit") : t("addTerm")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">{t("term")}</Label>
                <Input
                  value={form.term}
                  onChange={(e) => setForm({ ...form, term: e.target.value })}
                  placeholder="FTD"
                />
              </div>
              <div>
                <Label className="text-xs">{t("definition")}</Label>
                <Input
                  value={form.definition}
                  onChange={(e) => setForm({ ...form, definition: e.target.value })}
                  placeholder="First Time Deposit — first player deposit"
                />
              </div>
              <div>
                <Label className="text-xs">{t("sqlHint")}</Label>
                <Input
                  value={form.sql_hint}
                  onChange={(e) => setForm({ ...form, sql_hint: e.target.value })}
                  placeholder="usually column ftd_amount or is_ftd"
                />
              </div>
              <Button onClick={handleSave} disabled={!form.term || !form.definition} className="w-full">
                <Save className="h-4 w-4 mr-1" />
                {tc("save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {!terms || terms.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t("noTerms")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("term")}</TableHead>
              <TableHead>{t("definition")}</TableHead>
              <TableHead>{t("sqlHint")}</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {terms.map((term) => (
              <TableRow key={term.id}>
                <TableCell className="font-medium">{term.term}</TableCell>
                <TableCell>{term.definition}</TableCell>
                <TableCell className="text-muted-foreground">{term.sql_hint || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(term)} className="text-muted-foreground hover:text-foreground">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteTerm.mutate(term.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
