"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  useConnections,
  useCreateConnection,
  useUpdateConnection,
  useDeleteConnection,
  useTestConnection,
  useConnectionSchema,
} from "@/hooks/use-connections";
import type { Connection, ConnectionCreate, SchemaTable } from "@/types";
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

const DB_TYPES = [
  { value: "postgresql", label: "PostgreSQL", icon: "🐘", color: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300", defaultPort: 5432 },
  { value: "mysql", label: "MySQL", icon: "🐬", color: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300", defaultPort: 3306 },
  { value: "clickhouse", label: "ClickHouse", icon: "⚡", color: "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300", defaultPort: 8123 },
  { value: "mssql", label: "MS SQL", icon: "🏢", color: "border-red-300 bg-red-50 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300", defaultPort: 1433 },
  { value: "duckdb", label: "DuckDB", icon: "🦆", color: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300", defaultPort: 0 },
] as const;

const NEEDS_HOST_PORT = ["postgresql", "mysql", "clickhouse", "mssql"];

const INITIAL_FORM: ConnectionCreate = {
  name: "",
  db_type: "postgresql",
  host: "",
  port: 5432,
  database_name: "",
  username: "",
  password: "",
  ssl_enabled: false,
};

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
}: {
  conn: Connection;
  onEdit: (conn: Connection) => void;
}) {
  const tc = useTranslations("common");
  const [showSchema, setShowSchema] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const testConnection = useTestConnection();
  const deleteConnection = useDeleteConnection();

  const dbType = DB_TYPES.find((d) => d.value === conn.db_type);

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
        <span className="text-xl shrink-0">{dbType?.icon ?? "🗄️"}</span>

        {/* Name + connection info */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-sm font-medium text-foreground">{conn.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {NEEDS_HOST_PORT.includes(conn.db_type)
              ? `${conn.host}:${conn.port}/${conn.database_name}`
              : conn.database_name}
          </p>
        </div>

        {/* Type badge */}
        <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
          {conn.db_type}
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

// ---- Connection Dialog (Create / Edit) ------------------------------------

function ConnectionDialog({
  open,
  onClose,
  editConnection,
}: {
  open: boolean;
  onClose: () => void;
  editConnection: Connection | null;
}) {
  const t = useTranslations("connection");
  const tc = useTranslations("common");
  const isEdit = !!editConnection;
  const [step, setStep] = useState<"type" | "form">(isEdit ? "form" : "type");
  const [form, setForm] = useState<ConnectionCreate>({ ...INITIAL_FORM });
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();

  // Sync form state when dialog opens or editConnection changes
  useEffect(() => {
    if (open) {
      if (editConnection) {
        setForm({
          name: editConnection.name,
          db_type: editConnection.db_type,
          host: editConnection.host,
          port: editConnection.port,
          database_name: editConnection.database_name,
          username: editConnection.username,
          password: "",
          ssl_enabled: editConnection.ssl_enabled ?? false,
        });
        setStep("form");
      } else {
        setForm({ ...INITIAL_FORM });
        setStep("type");
      }
      setTestResult(null);
    }
  }, [open, editConnection]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  const patch = (partial: Partial<ConnectionCreate>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const handleTypeSelect = (dbType: string) => {
    const opt = DB_TYPES.find((o) => o.value === dbType);
    patch({ db_type: dbType, port: opt?.defaultPort ?? 5432 });
    setStep("form");
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
    } catch (err: any) {
      const msg = err?.message || err?.response?.data?.detail || "Failed to save connection";
      setTestResult({ success: false, message: msg });
    }
  };

  const isPending = createConnection.isPending || updateConnection.isPending;
  const selectedType = DB_TYPES.find((d) => d.value === form.db_type);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit") : t("new")}</DialogTitle>
        </DialogHeader>

        {/* Step 1: DB type selection grid */}
        {step === "type" && !isEdit && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose a database type:</p>
            <div className="grid grid-cols-3 gap-3">
              {DB_TYPES.map((db) => (
                <button
                  key={db.value}
                  onClick={() => handleTypeSelect(db.value)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors hover:shadow-sm ${db.color}`}
                >
                  <span className="text-3xl">{db.icon}</span>
                  <span className="text-xs font-medium">{db.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Connection form */}
        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Selected type indicator (for new connections) */}
            {!isEdit && (
              <button
                type="button"
                onClick={() => setStep("type")}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted ${selectedType?.color ?? ""}`}
              >
                <span>{selectedType?.icon}</span>
                <span className="font-medium">{selectedType?.label}</span>
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

            {/* Host + Port */}
            {NEEDS_HOST_PORT.includes(form.db_type) && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="conn-host">{t("host")}</Label>
                  <Input
                    id="conn-host"
                    value={form.host}
                    onChange={(e) => patch({ host: e.target.value })}
                    placeholder="localhost"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conn-port">{t("port")}</Label>
                  <Input
                    id="conn-port"
                    type="number"
                    value={form.port}
                    onChange={(e) => patch({ port: parseInt(e.target.value, 10) || 0 })}
                    required
                  />
                </div>
              </div>
            )}

            {/* Database */}
            <div className="space-y-2">
              <Label htmlFor="conn-db">{form.db_type === "duckdb" ? "File Path" : t("database")}</Label>
              <Input
                id="conn-db"
                value={form.database_name}
                onChange={(e) => patch({ database_name: e.target.value })}
                placeholder={form.db_type === "duckdb" ? "/data/my.duckdb" : "mydb"}
                required
              />
            </div>

            {/* Username + Password */}
            {NEEDS_HOST_PORT.includes(form.db_type) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="conn-user">{t("username")}</Label>
                  <Input
                    id="conn-user"
                    value={form.username}
                    onChange={(e) => patch({ username: e.target.value })}
                    placeholder="postgres"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conn-pass">{t("password")}</Label>
                  <Input
                    id="conn-pass"
                    type="password"
                    value={form.password}
                    onChange={(e) => patch({ password: e.target.value })}
                    placeholder={isEdit ? "••••••••  (leave blank to keep)" : "••••••••"}
                    required={!isEdit}
                  />
                </div>
              </div>
            )}

            {/* SSL toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="conn-ssl"
                checked={form.ssl_enabled ?? false}
                onCheckedChange={(v) => patch({ ssl_enabled: v })}
              />
              <Label htmlFor="conn-ssl" className="cursor-pointer text-sm">
                {t("ssl")}
              </Label>
            </div>

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);

  const handleAdd = () => {
    setEditConn(null);
    setDialogOpen(true);
  };

  const handleEdit = (conn: Connection) => {
    setEditConn(conn);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditConn(null);
  };

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
            {DB_TYPES.slice(0, 3).map((db) => (
              <button
                key={db.value}
                onClick={handleAdd}
                className={`flex items-center gap-2 rounded-lg border-2 px-4 py-2 transition-colors hover:shadow-sm ${db.color}`}
              >
                <span className="text-xl">{db.icon}</span>
                <span className="text-sm font-medium">{db.label}</span>
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
            <ConnectionCard key={conn.id} conn={conn} onEdit={handleEdit} />
          ))}
        </div>
      )}

      {/* Connection Dialog */}
      <ConnectionDialog open={dialogOpen} onClose={handleClose} editConnection={editConn} />
    </div>
  );
}
