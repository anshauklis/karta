"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  useSSOProviders,
  useCreateSSOProvider,
  useUpdateSSOProvider,
  useDeleteSSOProvider,
  useTestSSOProvider,
} from "@/hooks/use-sso";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KeyRound,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Plug,
  Check,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProviderType = "oidc" | "saml" | "ldap";

interface SSOProvider {
  id: number;
  tenant_id: number;
  provider_type: ProviderType;
  name: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Config field definitions per provider type
// ---------------------------------------------------------------------------

interface ConfigField {
  key: string;
  labelKey: string;
  type: "text" | "password" | "number" | "toggle";
  placeholder?: string;
  defaultValue?: string | number | boolean;
}

const OIDC_FIELDS: ConfigField[] = [
  { key: "issuer", labelKey: "oidc.issuer", type: "text", placeholder: "https://accounts.google.com" },
  { key: "client_id", labelKey: "oidc.clientId", type: "text", placeholder: "your-client-id" },
  { key: "client_secret", labelKey: "oidc.clientSecret", type: "password", placeholder: "your-client-secret" },
  { key: "scopes", labelKey: "oidc.scopes", type: "text", placeholder: "openid email profile", defaultValue: "openid email profile" },
];

const SAML_FIELDS: ConfigField[] = [
  { key: "metadata_url", labelKey: "saml.metadataUrl", type: "text", placeholder: "https://idp.example.com/metadata" },
  { key: "entity_id", labelKey: "saml.entityId", type: "text", placeholder: "https://karta.example.com" },
];

const LDAP_FIELDS: ConfigField[] = [
  { key: "host", labelKey: "ldap.host", type: "text", placeholder: "ldap.example.com" },
  { key: "port", labelKey: "ldap.port", type: "number", defaultValue: 389 },
  { key: "bind_dn", labelKey: "ldap.bindDn", type: "text", placeholder: "cn=admin,dc=example,dc=com" },
  { key: "bind_password", labelKey: "ldap.bindPassword", type: "password" },
  { key: "search_base", labelKey: "ldap.searchBase", type: "text", placeholder: "dc=example,dc=com" },
  { key: "user_filter", labelKey: "ldap.userFilter", type: "text", placeholder: "(uid={username})", defaultValue: "(uid={username})" },
  { key: "email_attr", labelKey: "ldap.emailAttr", type: "text", placeholder: "mail", defaultValue: "mail" },
  { key: "name_attr", labelKey: "ldap.nameAttr", type: "text", placeholder: "cn", defaultValue: "cn" },
  { key: "use_tls", labelKey: "ldap.useTls", type: "toggle", defaultValue: false },
];

function getFieldsForType(type: ProviderType): ConfigField[] {
  switch (type) {
    case "oidc": return OIDC_FIELDS;
    case "saml": return SAML_FIELDS;
    case "ldap": return LDAP_FIELDS;
  }
}

function getDefaultConfig(type: ProviderType): Record<string, unknown> {
  const fields = getFieldsForType(type);
  const config: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) {
      config[f.key] = f.defaultValue;
    }
  }
  return config;
}

// ---------------------------------------------------------------------------
// Provider form dialog
// ---------------------------------------------------------------------------

function ProviderDialog({
  open,
  onClose,
  provider,
}: {
  open: boolean;
  onClose: () => void;
  provider?: SSOProvider;
}) {
  const t = useTranslations("sso");
  const tc = useTranslations("common");
  const isEdit = !!provider;

  const [providerType, setProviderType] = useState<ProviderType>(
    provider?.provider_type || "oidc"
  );
  const [name, setName] = useState(provider?.name || "");
  const [config, setConfig] = useState<Record<string, unknown>>(
    provider?.config || getDefaultConfig("oidc")
  );
  const [error, setError] = useState<string | null>(null);

  const createProvider = useCreateSSOProvider();
  const updateProvider = useUpdateSSOProvider();

  const handleTypeChange = (type: ProviderType) => {
    setProviderType(type);
    if (!isEdit) {
      setConfig(getDefaultConfig(type));
    }
  };

  const setConfigField = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (isEdit && provider) {
        await updateProvider.mutateAsync({ id: provider.id, name, config });
      } else {
        await createProvider.mutateAsync({
          provider_type: providerType,
          name,
          config,
        });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const isPending = createProvider.isPending || updateProvider.isPending;
  const fields = getFieldsForType(providerType);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editProvider") : t("addProvider")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider type (only on create) */}
          {!isEdit && (
            <div className="space-y-2">
              <Label>{t("providerType")}</Label>
              <Select
                value={providerType}
                onValueChange={(v) => handleTypeChange(v as ProviderType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oidc">{t("oidc.title")}</SelectItem>
                  <SelectItem value="saml">{t("saml.title")}</SelectItem>
                  <SelectItem value="ldap">{t("ldap.title")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label>{t("providerName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My SSO Provider"
              required
            />
          </div>

          {/* Dynamic config fields */}
          {fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label>{t(field.labelKey)}</Label>
              {field.type === "toggle" ? (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!config[field.key]}
                    onCheckedChange={(v) => setConfigField(field.key, v)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {config[field.key] ? tc("yes") : tc("no")}
                  </span>
                </div>
              ) : (
                <Input
                  type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
                  value={String(config[field.key] ?? "")}
                  onChange={(e) =>
                    setConfigField(
                      field.key,
                      field.type === "number"
                        ? Number(e.target.value)
                        : e.target.value
                    )
                  }
                  placeholder={field.placeholder}
                />
              )}
            </div>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEdit ? tc("save") : tc("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminSSOPage() {
  const t = useTranslations("sso");
  const tc = useTranslations("common");
  const { data: providers, isLoading } = useSSOProviders();
  const updateProvider = useUpdateSSOProvider();
  const deleteProvider = useDeleteSSOProvider();
  const testProvider = useTestSSOProvider();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<SSOProvider | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    id: number;
    success: boolean;
    message: string;
  } | null>(null);

  const handleEdit = (provider: SSOProvider) => {
    setEditingProvider(provider);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingProvider(undefined);
  };

  const handleToggleActive = async (provider: SSOProvider) => {
    await updateProvider.mutateAsync({
      id: provider.id,
      is_active: !provider.is_active,
    });
  };

  const handleDelete = async (id: number) => {
    await deleteProvider.mutateAsync(id);
    setConfirmDeleteId(null);
  };

  const handleTest = async (id: number) => {
    setTestResult(null);
    const result = await testProvider.mutateAsync(id);
    setTestResult({ id, ...result });
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "oidc": return t("oidc.title");
      case "saml": return t("saml.title");
      case "ldap": return t("ldap.title");
      default: return type;
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-56 rounded" />
          <Skeleton className="h-9 w-36 rounded" />
        </div>
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t("addProvider")}
        </Button>
      </div>

      {/* Empty state */}
      {providers && providers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <KeyRound className="mb-4 h-16 w-16 text-slate-300" />
          <h2 className="mb-2 text-lg font-medium text-slate-600">
            {t("noProviders")}
          </h2>
          <Button onClick={() => setDialogOpen(true)} className="mt-4">
            <Plus className="mr-1 h-4 w-4" />
            {t("addProvider")}
          </Button>
        </div>
      )}

      {/* Providers table */}
      {providers && providers.length > 0 && (
        <Card className="border-slate-200 mt-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("providerName")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("providerType")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  {t("status")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider: SSOProvider) => (
                <tr
                  key={provider.id}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">
                      {provider.name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {typeLabel(provider.provider_type)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={provider.is_active}
                        onCheckedChange={() => handleToggleActive(provider)}
                      />
                      <Badge
                        variant={provider.is_active ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {provider.is_active ? t("active") : t("inactive")}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Test */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleTest(provider.id)}
                        disabled={testProvider.isPending}
                      >
                        {testProvider.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plug className="h-3 w-3" />
                        )}
                        <span className="ml-1 hidden sm:inline">
                          {t("testConnection")}
                        </span>
                      </Button>

                      {/* Test result inline */}
                      {testResult && testResult.id === provider.id && (
                        <span
                          className={`text-xs flex items-center gap-1 ${
                            testResult.success
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {testResult.success ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          {testResult.success
                            ? t("testSuccess")
                            : t("testFailed")}
                        </span>
                      )}

                      {/* Edit */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleEdit(provider)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>

                      {/* Delete */}
                      {confirmDeleteId === provider.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 text-xs"
                            onClick={() => handleDelete(provider.id)}
                            disabled={deleteProvider.isPending}
                          >
                            {deleteProvider.isPending && (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            )}
                            {tc("confirm")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            {tc("cancel")}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => setConfirmDeleteId(provider.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <ProviderDialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          provider={editingProvider}
        />
      )}
    </div>
  );
}
