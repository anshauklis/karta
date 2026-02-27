"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useShareLinks, useCreateShareLink, useRevokeShareLink, useChartShareLinks, useCreateChartShareLink } from "@/hooks/use-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Loader2, Trash2, Link2, Check, Code2 } from "lucide-react";

interface ShareDialogProps {
  dashboardId?: number;
  chartId?: number;
  onClose: () => void;
}

export function ShareDialog({ dashboardId, chartId, onClose }: ShareDialogProps) {
  const t = useTranslations("share");
  const tc = useTranslations("common");

  const { data: dashLinks, isLoading: isDashLoading } = useShareLinks(dashboardId);
  const { data: chartLinks, isLoading: isChartLoading } = useChartShareLinks(chartId);

  const links = chartId ? chartLinks : dashLinks;
  const isLoading = chartId ? isChartLoading : isDashLoading;

  const createDashLink = useCreateShareLink(dashboardId);
  const createChartLink = useCreateChartShareLink(chartId);
  const revokeLink = useRevokeShareLink(dashboardId);

  const createLink = chartId ? createChartLink : createDashLink;
  const [expiresHours, setExpiresHours] = useState<string>("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [embedTheme, setEmbedTheme] = useState<string>("light");
  const [embedCopied, setEmbedCopied] = useState<string | null>(null);

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

  const activeLinks = useMemo(
    () => (links || []).filter((l) => !l.expires_at || new Date(l.expires_at) >= new Date()),
    [links]
  );

  const getEmbedCode = (linkToken: string) => {
    const path = chartId ? `/embed/chart/${linkToken}` : `/embed/${linkToken}`;
    const src = `${window.location.origin}${path}?theme=${embedTheme}`;
    return `<iframe src="${src}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
  };

  const copyEmbedCode = (token: string) => {
    navigator.clipboard.writeText(getEmbedCode(token));
    setEmbedCopied(token);
    setTimeout(() => setEmbedCopied(null), 2000);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {chartId ? t("chart") : t("dashboard")}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="link">
          <TabsList className="w-full">
            <TabsTrigger value="link" className="flex-1">
              <Link2 className="h-3.5 w-3.5 mr-1" />
              {t("tabLink")}
            </TabsTrigger>
            <TabsTrigger value="embed" className="flex-1">
              <Code2 className="h-3.5 w-3.5 mr-1" />
              {t("tabEmbed")}
            </TabsTrigger>
          </TabsList>

          {/* Share Link Tab */}
          <TabsContent value="link">
            <div className="space-y-4 pt-2">
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
                        <div key={link.id} className={`flex items-center gap-2 rounded-md border p-2 text-xs ${isExpired ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" : "border-border"}`}>
                          <code className="flex-1 truncate text-muted-foreground">{link.token.slice(0, 16)}...</code>
                          {link.expires_at && (
                            <span className={`shrink-0 ${isExpired ? "text-red-500" : "text-muted-foreground"}`}>
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
          </TabsContent>

          {/* Embed Tab */}
          <TabsContent value="embed">
            <div className="space-y-4 pt-2">
              {activeLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("embedNoLinks")}</p>
              ) : (
                <>
                  {/* Theme selector */}
                  <div className="space-y-2">
                    <Label className="text-sm">{t("embedTheme")}</Label>
                    <Select value={embedTheme} onValueChange={setEmbedTheme}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">{t("embedThemeLight")}</SelectItem>
                        <SelectItem value="dark">{t("embedThemeDark")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Embed code for each active link */}
                  <div className="space-y-3">
                    <Label className="text-sm">{t("embedCode")}</Label>
                    {activeLinks.map((link) => (
                      <div key={link.id} className="space-y-1.5">
                        <div className="relative">
                          <pre className="rounded-md border bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono text-muted-foreground">
                            {getEmbedCode(link.token)}
                          </pre>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="absolute top-1.5 right-1.5 h-7 w-7"
                            onClick={() => copyEmbedCode(link.token)}
                          >
                            {embedCopied === link.token ? (
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                        {link.expires_at && (
                          <p className="text-xs text-muted-foreground">
                            Exp: {new Date(link.expires_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground">{t("embedHint")}</p>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
