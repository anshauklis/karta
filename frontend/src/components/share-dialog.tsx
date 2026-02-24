"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useShareLinks, useCreateShareLink, useRevokeShareLink } from "@/hooks/use-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Loader2, Trash2, Link2, Check } from "lucide-react";

interface ShareDialogProps {
  dashboardId: number;
  onClose: () => void;
}

export function ShareDialog({ dashboardId, onClose }: ShareDialogProps) {
  const t = useTranslations("share");
  const tc = useTranslations("common");
  const { data: links, isLoading } = useShareLinks(dashboardId);
  const createLink = useCreateShareLink(dashboardId);
  const revokeLink = useRevokeShareLink(dashboardId);
  const [expiresHours, setExpiresHours] = useState<string>("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCreate = () => {
    createLink.mutate({
      expires_in_hours: expiresHours ? parseInt(expiresHours) : undefined,
    });
  };

  const copyToClipboard = (token: string, id: number) => {
    const url = `${window.location.origin}/shared/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t("dashboard")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new link */}
          <div className="space-y-2">
            <Label className="text-sm">{t("createLink")}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t("expiresInHours")}
                type="number"
                value={expiresHours}
                onChange={(e) => setExpiresHours(e.target.value)}
                className="text-sm"
              />
              <Button size="sm" onClick={handleCreate} disabled={createLink.isPending}>
                {createLink.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("create")}
              </Button>
            </div>
          </div>

          {/* Existing links */}
          <div className="space-y-2">
            <Label className="text-sm">{t("activeLinks")}</Label>
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : !links || links.length === 0 ? (
              <p className="text-sm text-slate-400">{t("noActiveLinks")}</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {links.map((link) => {
                  const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
                  return (
                    <div key={link.id} className={`flex items-center gap-2 rounded-md border p-2 text-xs ${isExpired ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
                      <code className="flex-1 truncate text-slate-600">{link.token.slice(0, 16)}...</code>
                      {link.expires_at && (
                        <span className={`shrink-0 ${isExpired ? "text-red-500" : "text-slate-400"}`}>
                          {isExpired ? t("expired") : `Exp: ${new Date(link.expires_at).toLocaleDateString()}`}
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(link.token, link.id)}
                      >
                        {copiedId === link.id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-red-400 hover:text-red-600"
                        onClick={() => revokeLink.mutate(link.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
