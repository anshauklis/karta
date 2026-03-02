"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  useWhitelabelSettings,
  useUpdateWhitelabel,
  useUploadLogo,
  useUploadFavicon,
  type WhitelabelSettings,
} from "@/hooks/use-whitelabel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Upload, Loader2, RotateCcw } from "lucide-react";

const DEFAULT_PRIMARY = "#2563eb";
const DEFAULT_ACCENT = "#7c3aed";

// ---------------------------------------------------------------------------
// Form component — receives initial values as props to avoid
// setState-in-useEffect / ref-during-render issues with React Compiler.
// ---------------------------------------------------------------------------

function WhitelabelForm({ initial }: { initial: WhitelabelSettings }) {
  const t = useTranslations("whitelabel");
  const tc = useTranslations("common");
  const { data: settings } = useWhitelabelSettings();
  const updateSettings = useUpdateWhitelabel();
  const uploadLogo = useUploadLogo();
  const uploadFavicon = useUploadFavicon();

  const [appName, setAppName] = useState(initial.app_name || "Karta");
  const [primaryColor, setPrimaryColor] = useState(
    initial.primary_color || DEFAULT_PRIMARY,
  );
  const [accentColor, setAccentColor] = useState(
    initial.accent_color || DEFAULT_ACCENT,
  );
  const [customCss, setCustomCss] = useState(initial.custom_css || "");

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      app_name: appName,
      primary_color: primaryColor,
      accent_color: accentColor,
      custom_css: customCss,
    });
    toast.success(t("saved"));
  };

  const handleResetDefaults = async () => {
    setAppName("Karta");
    setPrimaryColor(DEFAULT_PRIMARY);
    setAccentColor(DEFAULT_ACCENT);
    setCustomCss("");
    await updateSettings.mutateAsync({
      app_name: "Karta",
      primary_color: DEFAULT_PRIMARY,
      accent_color: DEFAULT_ACCENT,
      custom_css: "",
    });
    toast.success(t("saved"));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadLogo.mutateAsync(file);
    toast.success(t("saved"));
    // Reset input so the same file can be re-uploaded
    e.target.value = "";
  };

  const handleFaviconUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFavicon.mutateAsync(file);
    toast.success(t("saved"));
    e.target.value = "";
  };

  // Use latest settings for file URLs (they update after upload)
  const logoUrl = settings?.logo_url ?? initial.logo_url;
  const faviconUrl = settings?.favicon_url ?? initial.favicon_url;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetDefaults}
            disabled={updateSettings.isPending}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            {t("resetDefaults")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending && (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            )}
            {t("save")}
          </Button>
        </div>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">{t("description")}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings Form */}
        <div className="space-y-6">
          {/* App Name + Colors + CSS */}
          <Card className="p-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="app-name">{t("appName")}</Label>
                <Input
                  id="app-name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Karta"
                />
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primary-color">{t("primaryColor")}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="primary-color"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-border p-0.5"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="font-mono text-xs"
                      placeholder="#2563eb"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accent-color">{t("accentColor")}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="accent-color"
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-border p-0.5"
                    />
                    <Input
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="font-mono text-xs"
                      placeholder="#7c3aed"
                    />
                  </div>
                </div>
              </div>

              {/* Custom CSS */}
              <div className="space-y-2">
                <Label htmlFor="custom-css">{t("customCss")}</Label>
                <Textarea
                  id="custom-css"
                  value={customCss}
                  onChange={(e) => setCustomCss(e.target.value)}
                  placeholder=":root { --primary: 220 70% 50%; }"
                  rows={5}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </Card>

          {/* File Uploads */}
          <Card className="p-4">
            <div className="space-y-4">
              {/* Logo */}
              <div className="space-y-2">
                <Label>{t("logo")}</Label>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="h-12 w-12 rounded border border-border object-contain p-1"
                      />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-border">
                      <BarChart3 className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadLogo.isPending}
                    >
                      {uploadLogo.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-1 h-4 w-4" />
                      )}
                      {t("uploadLogo")}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PNG, JPG, SVG, WebP
                    </p>
                  </div>
                </div>
              </div>

              {/* Favicon */}
              <div className="space-y-2">
                <Label>{t("favicon")}</Label>
                <div className="flex items-center gap-4">
                  {faviconUrl ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={faviconUrl}
                        alt="Favicon"
                        className="h-12 w-12 rounded border border-border object-contain p-1"
                      />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-border">
                      <BarChart3 className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/png,image/x-icon,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={handleFaviconUpload}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => faviconInputRef.current?.click()}
                      disabled={uploadFavicon.isPending}
                    >
                      {uploadFavicon.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-1 h-4 w-4" />
                      )}
                      {t("uploadFavicon")}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PNG, ICO, SVG, WebP
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Live Preview */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium">{t("preview")}</h2>
          <Card className="overflow-hidden">
            {/* Mock header preview */}
            <div
              className="flex h-14 items-center border-b px-4"
              style={{ borderColor: primaryColor + "33" }}
            >
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={logoUrl}
                    alt={appName}
                    className="h-5 w-5 object-contain"
                  />
                ) : (
                  <BarChart3
                    className="h-5 w-5"
                    style={{ color: primaryColor }}
                  />
                )}
                <span className="text-sm font-semibold">{appName}</span>
              </div>
              <div className="ml-6 flex items-center gap-3">
                <span
                  className="rounded px-2 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: primaryColor + "1a",
                    color: primaryColor,
                  }}
                >
                  Dashboards
                </span>
                <span className="text-xs text-muted-foreground">Charts</span>
                <span className="text-xs text-muted-foreground">SQL Lab</span>
              </div>
              <div className="flex-1" />
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: accentColor }}
              >
                A
              </div>
            </div>
            {/* Mock content area */}
            <div className="p-6">
              <div className="mb-4 flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: primaryColor }}
                />
                <span className="text-sm font-medium">{t("primaryColor")}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {primaryColor}
                </span>
              </div>
              <div className="mb-4 flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: accentColor }}
                />
                <span className="text-sm font-medium">{t("accentColor")}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {accentColor}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded px-3 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {tc("save")}
                </button>
                <button
                  className="rounded px-3 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  {tc("cancel")}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page wrapper — shows skeleton while loading, then renders the form
// with initial data as props (no useEffect sync needed).
// ---------------------------------------------------------------------------

export default function AdminWhitelabelPage() {
  const { data: settings, isLoading } = useWhitelabelSettings();

  if (isLoading || !settings) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <WhitelabelForm initial={settings} />;
}
