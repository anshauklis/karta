"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  useConnections,
  useCreateConnection,
  useUpdateConnection,
  useDeleteConnection,
  useTestConnection,
  useConnectionSchema,
  useEngineSpecs,
} from "@/hooks/use-connections";
import type { Connection, ConnectionCreate, EngineSpec, FieldDef, SchemaTable } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Database,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Zap,
  Server,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Map spec icon names to emojis for the UI. */
const ICON_MAP: Record<string, string> = {
  postgres: "\u{1F418}",   // elephant
  mysql: "\u{1F42C}",      // dolphin
  clickhouse: "\u26A1",    // lightning
  mssql: "\u{1F3E2}",      // office
  duckdb: "\u{1F986}",     // duck
  database: "\u{1F5C4}\uFE0F", // file cabinet (fallback)
};

/** Tailwind color classes per spec icon (db_type or icon field). */
const COLOR_MAP: Record<string, string> = {
  postgres: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300",
  mysql: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300",
  clickhouse: "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300",
  mssql: "border-red-300 bg-red-50 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300",
  duckdb: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300",
  _sqlalchemy: "border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:border-purple-800 dark:text-purple-300",
  database: "border-gray-300 bg-gray-50 text-gray-700 dark:bg-gray-950 dark:border-gray-800 dark:text-gray-300",
};

function getEmoji(spec: EngineSpec): string {
  return ICON_MAP[spec.icon] ?? ICON_MAP[spec.db_type] ?? ICON_MAP.database;
}

function getColor(spec: EngineSpec): string {
  return COLOR_MAP[spec.db_type] ?? COLOR_MAP[spec.icon] ?? COLOR_MAP.database;
}

/** The well-known field names that map directly to ConnectionCreate top-level keys. */
const STANDARD_FIELDS = new Set([
  "host", "port", "database_name", "username", "password", "ssl_enabled", "sqlalchemy_uri",
]);

const INITIAL_FORM: ConnectionCreate = {
  name: "",
  db_type: "",
  host: "",
  port: 0,
  database_name: "",
  username: "",
  password: "",
  ssl_enabled: false,
};

/** Build default form values from a spec's connection_fields. */
function buildFormFromSpec(spec: EngineSpec, keepName: string): ConnectionCreate {
  const form: ConnectionCreate = { ...INITIAL_FORM, name: keepName, db_type: spec.db_type };
  const extra: Record<string, unknown> = {};

  for (const field of spec.connection_fields) {
    if (STANDARD_FIELDS.has(field.name)) {
      (form as Record<string, unknown>)[field.name] = field.default ?? getFieldZero(field);
    } else {
      extra[field.name] = field.default ?? getFieldZero(field);
    }
  }

  if (Object.keys(extra).length > 0) {
    form.extra_params = extra;
  }

  return form;
}

function getFieldZero(field: FieldDef): unknown {
  switch (field.type) {
    case "number": return 0;
    case "boolean": return false;
    default: return "";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TestBadge({ result }: { result: { success: boolean; message: string } | null }) {
  if (!result) return null;
  return result.success ? (
    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
      <CheckCircle className="mr-1 h-3 w-3" />
      Connected
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
      <XCircle className="mr-1 h-3 w-3" />
      {result.message.slice(0, 60)}
    </Badge>
  );
}

// ---- Schema browser -------------------------------------------------------

function SchemaBrowser({ connectionId }: { connectionId: number }) {
  const { data: tables, isLoading, error } = useConnectionSchema(connectionId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (table: string) =>
    setExpanded((prev) => ({ ...prev, [table]: !prev[table] }));

  if (isLoading) {
    return (
      <div className="space-y-2 py-3 pl-8">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-48 rounded" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="py-3 pl-8 text-sm text-red-500">Failed to load schema.</p>;
  }

  if (!tables || tables.length === 0) {
    return <p className="py-3 pl-8 text-sm text-muted-foreground">No tables found.</p>;
  }

  return (
    <div className="space-y-1 py-3 pl-8">
      {tables.map((t: SchemaTable) => (
        <div key={t.table_name}>
          <button
            onClick={() => toggle(t.table_name)}
            className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm text-foreground hover:bg-muted"
          >
            {expanded[t.table_name] ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-xs">{t.table_name}</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {t.columns.length} col{t.columns.length !== 1 ? "s" : ""}
            </Badge>
          </button>

          {expanded[t.table_name] && (
            <div className="ml-6 border-l border-border pl-3">
              {t.columns.map((col) => (
                <div key={col.name} className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
                  <span className="w-40 truncate font-mono">{col.name}</span>
                  <Badge variant="secondary" className="text-[10px] font-normal">{col.type}</Badge>
                  {col.nullable && (
                    <Badge variant="secondary" className="text-[10px] font-normal text-muted-foreground">nullable</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- Connection Card ------------------------------------------------------

function ConnectionCard({
  conn,
  onEdit,
  specs,
}: {
  conn: Connection;
  onEdit: (conn: Connection) => void;
  specs: EngineSpec[];
}) {
  const tc = useTranslations("common");
  const [showSchema, setShowSchema] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const testConnection = useTestConnection();
  const deleteConnection = useDeleteConnection();

  // Find matching spec for icon/color, falling back to a generic look
  const spec = specs.find((s) => s.db_type === conn.db_type || (conn.db_type === "postgresql" && s.db_type === "postgres"));
  const emoji = spec ? getEmoji(spec) : ICON_MAP.database;
  const hasHostPort = spec ? spec.connection_fields.some((f) => f.name === "host") : false;

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testConnection.mutateAsync(conn.id);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Request failed" });
    }
  };

  const handleDelete = async () => {
    await deleteConnection.mutateAsync(conn.id);
    setConfirmDelete(false);
  };

  return (
    <Card className="overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Expand toggle */}
        <button
          onClick={() => setShowSchema((v) => !v)}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {showSchema ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* DB type icon */}
        <span className="text-xl shrink-0">{emoji}</span>

        {/* Name + connection info */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-sm font-medium text-foreground">{conn.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {hasHostPort
              ? `${conn.host}:${conn.port}/${conn.database_name}`
              : conn.database_name}
          </p>
        </div>

        {/* Type badge */}
        <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
          {spec?.display_name ?? conn.db_type}
        </Badge>

        {/* System badge */}
        {conn.is_system && (
          <Badge variant="secondary" className="hidden text-xs sm:inline-flex bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800">
            System
          </Badge>
        )}

        {/* Status indicator */}
        {testResult && (
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${testResult.success ? "bg-emerald-500" : "bg-red-500"}`} />
        )}

        {/* Test result text */}
        <TestBadge result={testResult} />

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={handleTest} disabled={testConnection.isPending} className="h-8 text-xs">
            {testConnection.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Zap className="mr-1 h-3 w-3" />}
            Test
          </Button>
          {!conn.is_system && (
            <>
              <Button size="sm" variant="outline" onClick={() => onEdit(conn)} className="h-8 text-xs">
                <Pencil className="mr-1 h-3 w-3" />
                {tc("edit")}
              </Button>

              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleteConnection.isPending} className="h-8 text-xs">
                    {deleteConnection.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    {tc("confirm")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} className="h-8 text-xs">
                    {tc("cancel")}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDelete(true)}
                  className="h-8 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Schema panel */}
      {showSchema && <SchemaBrowser connectionId={conn.id} />}
    </Card>
  );
}

// ---- Dynamic Field Renderer -----------------------------------------------

function DynamicField({
  field,
  value,
  onChange,
  isEdit,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (val: unknown) => void;
  isEdit: boolean;
}) {
  const fieldId = `conn-${field.name}`;

  if (field.type === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Switch
          id={fieldId}
          checked={!!value}
          onCheckedChange={(v) => onChange(v)}
        />
        <Label htmlFor={fieldId} className="cursor-pointer text-sm">
          {field.label}
        </Label>
      </div>
    );
  }

  const isPassword = field.type === "password";

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{field.label}</Label>
      <Input
        id={fieldId}
        type={field.type === "number" ? "number" : field.type === "password" ? "password" : "text"}
        value={value != null ? String(value) : ""}
        onChange={(e) => {
          if (field.type === "number") {
            onChange(parseInt(e.target.value, 10) || 0);
          } else {
            onChange(e.target.value);
          }
        }}
        placeholder={isPassword && isEdit ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022  (leave blank to keep)" : field.placeholder}
        required={isPassword && isEdit ? false : field.required}
      />
    </div>
  );
}

// ---- Connection Dialog (Create / Edit) ------------------------------------

/** Compute initial form state from an optional editConnection. */
function initFormState(editConnection: Connection | null): ConnectionCreate {
  if (editConnection) {
    return {
      name: editConnection.name,
      db_type: editConnection.db_type,
      host: editConnection.host,
      port: editConnection.port,
      database_name: editConnection.database_name,
      username: editConnection.username,
      password: "",
      ssl_enabled: editConnection.ssl_enabled ?? false,
    };
  }
  return { ...INITIAL_FORM };
}

function ConnectionDialogInner({
  onClose,
  editConnection,
}: {
  onClose: () => void;
  editConnection: Connection | null;
}) {
  const t = useTranslations("connection");
  const tc = useTranslations("common");
  const isEdit = !!editConnection;
  const [step, setStep] = useState<"type" | "form">(isEdit ? "form" : "type");
  const [form, setForm] = useState<ConnectionCreate>(() => initFormState(editConnection));
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: specs } = useEngineSpecs();
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();

  // Resolve the active spec for the current db_type
  const activeSpec = useMemo(
    () => specs?.find((s) => s.db_type === form.db_type) ?? null,
    [specs, form.db_type],
  );

  const patch = (partial: Partial<ConnectionCreate>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const handleTypeSelect = (dbType: string) => {
    const spec = specs?.find((s) => s.db_type === dbType);
    if (spec) {
      setForm(buildFormFromSpec(spec, form.name));
    } else {
      patch({ db_type: dbType });
    }
    setStep("form");
  };

  /** Get the current value for a field, checking standard keys first, then extra_params. */
  const getFieldValue = (field: FieldDef): unknown => {
    if (STANDARD_FIELDS.has(field.name)) {
      return (form as Record<string, unknown>)[field.name];
    }
    return form.extra_params?.[field.name] ?? "";
  };

  /** Set a field value, routing to the right place. */
  const setFieldValue = (field: FieldDef, value: unknown) => {
    if (STANDARD_FIELDS.has(field.name)) {
      patch({ [field.name]: value } as Partial<ConnectionCreate>);
    } else {
      setForm((prev) => ({
        ...prev,
        extra_params: { ...(prev.extra_params ?? {}), [field.name]: value },
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestResult(null);
    try {
      if (isEdit && editConnection) {
        await updateConnection.mutateAsync({ id: editConnection.id, data: form });
        setTestResult({ success: true, message: "Updated" });
      } else {
        await createConnection.mutateAsync(form);
        setTestResult({ success: true, message: "Saved" });
      }
      onClose();
    } catch (err: unknown) {
      const error = err as Record<string, unknown> | undefined;
      const msg = (error?.message as string)
        || ((error?.response as Record<string, unknown>)?.data as Record<string, unknown>)?.detail as string
        || "Failed to save connection";
      setTestResult({ success: false, message: msg });
    }
  };

  const isPending = createConnection.isPending || updateConnection.isPending;

  // Group fields for layout: pair host+port side-by-side, username+password side-by-side
  const renderFields = () => {
    if (!activeSpec) return null;
    const fields = activeSpec.connection_fields;

    // Collect field groups for nicer layout
    const rendered: React.ReactNode[] = [];
    let i = 0;
    while (i < fields.length) {
      const field = fields[i];

      // Host + Port side by side
      if (field.name === "host" && fields[i + 1]?.name === "port") {
        const portField = fields[i + 1];
        rendered.push(
          <div key="host-port" className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <DynamicField
                field={field}
                value={getFieldValue(field)}
                onChange={(v) => setFieldValue(field, v)}
                isEdit={isEdit}
              />
            </div>
            <DynamicField
              field={portField}
              value={getFieldValue(portField)}
              onChange={(v) => setFieldValue(portField, v)}
              isEdit={isEdit}
            />
          </div>,
        );
        i += 2;
        continue;
      }

      // Username + Password side by side
      if (field.name === "username" && fields[i + 1]?.name === "password") {
        const passField = fields[i + 1];
        rendered.push(
          <div key="user-pass" className="grid grid-cols-2 gap-3">
            <DynamicField
              field={field}
              value={getFieldValue(field)}
              onChange={(v) => setFieldValue(field, v)}
              isEdit={isEdit}
            />
            <DynamicField
              field={passField}
              value={getFieldValue(passField)}
              onChange={(v) => setFieldValue(passField, v)}
              isEdit={isEdit}
            />
          </div>,
        );
        i += 2;
        continue;
      }

      // Single field
      rendered.push(
        <DynamicField
          key={field.name}
          field={field}
          value={getFieldValue(field)}
          onChange={(v) => setFieldValue(field, v)}
          isEdit={isEdit}
        />,
      );
      i++;
    }

    return rendered;
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? t("edit") : t("new")}</DialogTitle>
      </DialogHeader>

      {/* Step 1: DB type selection grid */}
      {step === "type" && !isEdit && specs && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Choose a database type:</p>
          <div className="grid grid-cols-3 gap-3">
            {specs.map((spec) => (
              <button
                key={spec.db_type}
                onClick={() => handleTypeSelect(spec.db_type)}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:shadow-sm ${getColor(spec)}`}
              >
                <span className="text-3xl">{getEmoji(spec)}</span>
                <span className="text-xs font-medium">{spec.display_name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Connection form */}
      {step === "form" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selected type indicator (for new connections) */}
          {!isEdit && activeSpec && (
            <button
              type="button"
              onClick={() => setStep("type")}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted ${getColor(activeSpec)}`}
            >
              <span>{getEmoji(activeSpec)}</span>
              <span className="font-medium">{activeSpec.display_name}</span>
              <span className="text-xs text-muted-foreground ml-1">(change)</span>
            </button>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="conn-name">{t("name")}</Label>
            <Input
              id="conn-name"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Production DB"
              required
              autoFocus
            />
          </div>

          {/* Dynamic fields from spec */}
          {renderFields()}

          {/* Test result */}
          {testResult && <TestBadge result={testResult} />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-1 h-4 w-4" />
              )}
              {isEdit ? tc("update") : t("testAndSave")}
            </Button>
          </DialogFooter>
        </form>
      )}
    </>
  );
}

function ConnectionDialog({
  open,
  onClose,
  editConnection,
  dialogKey,
}: {
  open: boolean;
  onClose: () => void;
  editConnection: Connection | null;
  dialogKey: number;
}) {
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        {open && (
          <ConnectionDialogInner
            key={dialogKey}
            onClose={onClose}
            editConnection={editConnection}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ConnectionsPage() {
  const t = useTranslations("connection");
  const tn = useTranslations("nav");
  const { data: connections, isLoading } = useConnections();
  const { data: specs } = useEngineSpecs();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);
  const [dialogKey, setDialogKey] = useState(0);

  const handleAdd = () => {
    setEditConn(null);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };

  const handleEdit = (conn: Connection) => {
    setEditConn(conn);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditConn(null);
  };

  // Show first 3 specs (excluding _sqlalchemy) for quick-start buttons
  const quickStartSpecs = useMemo(
    () => (specs ?? []).filter((s) => s.db_type !== "_sqlalchemy").slice(0, 3),
    [specs],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-36 rounded" />
          <Skeleton className="h-9 w-36 rounded" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">{tn("connections")}</h1>
          {connections && connections.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {connections.length}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="mr-1 h-4 w-4" />
          {t("new")}
        </Button>
      </div>

      {/* Connection list */}
      {connections && connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-20 text-center">
          <Database className="mb-4 h-16 w-16 text-muted-foreground/40" />
          <h2 className="mb-2 text-lg font-medium text-foreground">{t("noConnections")}</h2>
          <p className="mb-4 max-w-sm text-sm text-muted-foreground">
            {t("connectDescription")}
          </p>
          {/* Visual DB type buttons as quick-start */}
          <div className="flex gap-3 mb-4">
            {quickStartSpecs.map((spec) => (
              <button
                key={spec.db_type}
                onClick={handleAdd}
                className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 transition-colors hover:shadow-sm ${getColor(spec)}`}
              >
                <span className="text-xl">{getEmoji(spec)}</span>
                <span className="text-sm font-medium">{spec.display_name}</span>
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={handleAdd}>
            <Plus className="mr-1 h-4 w-4" />
            All databases
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {connections?.map((conn) => (
            <ConnectionCard key={conn.id} conn={conn} onEdit={handleEdit} specs={specs ?? []} />
          ))}
        </div>
      )}

      {/* Connection Dialog */}
      <ConnectionDialog open={dialogOpen} onClose={handleClose} editConnection={editConn} dialogKey={dialogKey} />
    </div>
  );
}
