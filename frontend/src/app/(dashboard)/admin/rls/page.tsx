"use client";

import { useState } from "react";
import { useRLSRules, useCreateRLSRule, useDeleteRLSRule } from "@/hooks/use-rls";
import { useConnections } from "@/hooks/use-connections";
import type { RLSRuleCreate } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Plus, Trash2, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

const INITIAL_FORM: RLSRuleCreate = {
  connection_id: 0,
  table_name: "",
  column_name: "",
  user_id: null,
  group_name: null,
  filter_value: "",
};

export default function RLSPage() {
  const t = useTranslations("rls");
  const tc = useTranslations("common");
  const { data: rules, isLoading } = useRLSRules();
  const { data: connections } = useConnections();
  const createRule = useCreateRLSRule();
  const deleteRule = useDeleteRLSRule();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<RLSRuleCreate>({ ...INITIAL_FORM });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const patch = (p: Partial<RLSRuleCreate>) => setForm((prev) => ({ ...prev, ...p }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createRule.mutateAsync(form);
    setForm({ ...INITIAL_FORM });
    setShowAdd(false);
  };

  const handleDelete = async (id: number) => {
    await deleteRule.mutateAsync(id);
    setConfirmDelete(null);
  };

  const getConnectionName = (id: number) =>
    connections?.find((c) => c.id === id)?.name ?? `#${id}`;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-48 rounded" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-4 w-4" /> {t("addRule")}
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">{t("newRule")}</CardTitle>
            <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t("connection")}</Label>
                  <Select
                    value={form.connection_id ? String(form.connection_id) : "_empty_"}
                    onValueChange={(v) => patch({ connection_id: v !== "_empty_" ? Number(v) : 0 })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("select")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_empty_">{t("select")}</SelectItem>
                      {connections?.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("table")}</Label>
                  <Input value={form.table_name} onChange={(e) => patch({ table_name: e.target.value })} placeholder="orders" required />
                </div>
                <div className="space-y-2">
                  <Label>{t("column")}</Label>
                  <Input value={form.column_name} onChange={(e) => patch({ column_name: e.target.value })} placeholder="region" required />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t("userId")}</Label>
                  <Input
                    type="number"
                    value={form.user_id ?? ""}
                    onChange={(e) => patch({ user_id: e.target.value ? Number(e.target.value) : null })}
                    placeholder={t("leaveEmpty")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("groupName")}</Label>
                  <Input
                    value={form.group_name ?? ""}
                    onChange={(e) => patch({ group_name: e.target.value || null })}
                    placeholder="analysts"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("filterValue")}</Label>
                  <Input value={form.filter_value} onChange={(e) => patch({ filter_value: e.target.value })} placeholder="US" required />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={createRule.isPending}>
                  {createRule.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  {t("createRule")}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowAdd(false)}>{tc("cancel")}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      {!rules || rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Shield className="mb-4 h-16 w-16 text-slate-300" />
          <h2 className="mb-2 text-lg font-medium text-slate-600">{t("noRules")}</h2>
          <p className="mb-4 text-sm text-slate-400">{t("noRulesDesc")}</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2">{t("connection")}</th>
                  <th className="px-4 py-2">{t("table")}</th>
                  <th className="px-4 py-2">{t("column")}</th>
                  <th className="px-4 py-2">{t("user")}</th>
                  <th className="px-4 py-2">{t("filterValue")}</th>
                  <th className="px-4 py-2 text-right">{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-slate-100">
                    <td className="px-4 py-2">
                      <Badge variant="secondary" className="text-xs">{getConnectionName(rule.connection_id)}</Badge>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{rule.table_name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{rule.column_name}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {rule.user_id ? `User #${rule.user_id}` : rule.group_name || "All users"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-700">{rule.filter_value}</td>
                    <td className="px-4 py-2 text-right">
                      {confirmDelete === rule.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(rule.id)}>
                            Confirm
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-500" onClick={() => setConfirmDelete(rule.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
