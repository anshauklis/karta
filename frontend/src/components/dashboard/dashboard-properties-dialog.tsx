"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";

import { useUpdateDashboard, useGroups } from "@/hooks/use-dashboards";
import { useUsersBasic } from "@/hooks/use-users";
import type { Dashboard } from "@/types";

const COLOR_SCHEMES = [
  "Plotly",
  "D3",
  "G10",
  "T10",
  "Alphabet",
  "Dark24",
  "Light24",
  "Set1",
  "Pastel1",
  "Dark2",
  "Set2",
  "Pastel2",
  "Set3",
  "Antique",
  "Bold",
  "Pastel",
  "Prism",
  "Safe",
  "Vivid",
];

const SENTINEL_NONE = "_none_";

interface DashboardPropertiesDialogProps {
  dashboard: Dashboard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DashboardPropertiesDialog({
  dashboard,
  open,
  onOpenChange,
}: DashboardPropertiesDialogProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const router = useRouter();
  const updateDashboard = useUpdateDashboard();
  const { data: users = [] } = useUsersBasic();
  const { data: groups = [] } = useGroups();

  const [title, setTitle] = useState(dashboard.title);
  const [icon, setIcon] = useState(dashboard.icon);
  const [urlSlug, setUrlSlug] = useState(dashboard.url_slug);
  const [description, setDescription] = useState(dashboard.description);
  const [colorScheme, setColorScheme] = useState(dashboard.color_scheme || "");
  const [ownerIds, setOwnerIds] = useState<string[]>(
    dashboard.owners?.map((o) => String(o.id)) || []
  );
  const [roles, setRoles] = useState<string[]>(dashboard.roles || []);
  const [slugError, setSlugError] = useState("");

  // Reset form when dashboard changes or dialog opens
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setTitle(dashboard.title);
        setIcon(dashboard.icon);
        setUrlSlug(dashboard.url_slug);
        setDescription(dashboard.description);
        setColorScheme(dashboard.color_scheme || "");
        setOwnerIds(dashboard.owners?.map((o) => String(o.id)) || []);
        setRoles(dashboard.roles || []);
        setSlugError("");
      });
    }
  }, [open, dashboard]);

  const validateSlug = useCallback((slug: string) => {
    if (!slug) return false;
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  }, []);

  const handleSlugChange = (value: string) => {
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setUrlSlug(normalized);
    if (normalized && !validateSlug(normalized)) {
      setSlugError(t("slugInvalid"));
    } else {
      setSlugError("");
    }
  };

  const handleSave = async () => {
    if (urlSlug && !validateSlug(urlSlug)) {
      setSlugError(t("slugInvalid"));
      return;
    }

    // Only send changed fields
    const data: Record<string, unknown> = {};
    if (title !== dashboard.title) data.title = title;
    if (icon !== dashboard.icon) data.icon = icon;
    if (urlSlug !== dashboard.url_slug) data.url_slug = urlSlug;
    if (description !== dashboard.description) data.description = description;

    const newColorScheme = colorScheme || null;
    if (newColorScheme !== dashboard.color_scheme) data.color_scheme = newColorScheme;

    const newOwnerIds = ownerIds.map(Number);
    const oldOwnerIds = dashboard.owners?.map((o) => o.id) || [];
    if (JSON.stringify(newOwnerIds.sort()) !== JSON.stringify(oldOwnerIds.sort())) {
      data.owner_ids = newOwnerIds;
    }

    const sortedNewRoles = [...roles].sort();
    const sortedOldRoles = [...(dashboard.roles || [])].sort();
    if (JSON.stringify(sortedNewRoles) !== JSON.stringify(sortedOldRoles)) {
      data.roles = roles;
    }

    if (Object.keys(data).length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      await updateDashboard.mutateAsync({ id: dashboard.id, data });
      toast.success(t("propertiesSaved"));
      onOpenChange(false);

      // If slug changed, navigate to new URL
      if (data.url_slug) {
        router.replace(`/dashboard/${data.url_slug}`);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes("slug")) {
        setSlugError(t("slugTaken"));
      }
    }
  };

  const userOptions = users.map((u) => ({
    value: String(u.id),
    label: `${u.name} (${u.email})`,
  }));

  const groupOptions = groups.map((g) => ({
    value: g,
    label: g,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("propertiesTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("propertiesTitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t("basicInfo")}
            </h3>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="dashboard-title">{t("name")}</Label>
                <Input
                  id="dashboard-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-[1fr_80px] gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="dashboard-slug">{t("urlSlug")}</Label>
                  <Input
                    id="dashboard-slug"
                    value={urlSlug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    className={slugError ? "border-destructive" : ""}
                  />
                  {slugError && (
                    <p className="text-xs text-destructive">{slugError}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="dashboard-icon">{t("icon")}</Label>
                  <Input
                    id="dashboard-icon"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    className="text-center"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="dashboard-description">{t("description")}</Label>
                <Textarea
                  id="dashboard-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Access */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t("access")}
            </h3>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>{t("owners")}</Label>
                <MultiSelect
                  options={userOptions}
                  selected={ownerIds}
                  onChange={setOwnerIds}
                  placeholder={t("noOwners")}
                  searchPlaceholder={t("searchUsers")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("ownersHint")}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label>{t("roles")}</Label>
                <MultiSelect
                  options={groupOptions}
                  selected={roles}
                  onChange={setRoles}
                  placeholder={t("noRoles")}
                  searchPlaceholder={t("searchGroups")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("rolesHint")}
                </p>
              </div>
            </div>
          </div>

          {/* Color Scheme */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t("colorScheme")}
            </h3>

            <Select
              value={colorScheme || SENTINEL_NONE}
              onValueChange={(v) => setColorScheme(v === SENTINEL_NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("noColorScheme")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SENTINEL_NONE}>{t("noColorScheme")}</SelectItem>
                {COLOR_SCHEMES.map((scheme) => (
                  <SelectItem key={scheme} value={scheme}>
                    {scheme}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title.trim() || !urlSlug.trim() || !!slugError || updateDashboard.isPending}
          >
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
