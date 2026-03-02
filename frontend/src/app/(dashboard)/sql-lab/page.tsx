"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { useConnections, useConnectionSchema } from "@/hooks/use-connections";
import { useExecuteSQL } from "@/hooks/use-sql";
import { useCreateDataset } from "@/hooks/use-datasets";
import {
  useSQLTabs,
  useCreateSQLTab,
  useUpdateSQLTab,
  useDeleteSQLTab,
} from "@/hooks/use-sql-tabs";
import type { SchemaTable, SQLResult, SQLTab } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Save,
  Download,
  Database,
  Table2,
  Columns3,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Loader2,
  Terminal,
  Plus,
  Search,
  Bot,
} from "lucide-react";
import { downloadCSV } from "@/lib/export";
import { useFixSQL, useGenerateSQL } from "@/hooks/use-ai";
import { useRoles } from "@/hooks/use-roles";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const AUTO_SAVE_MS = 2000;

// ---------------------------------------------------------------------------
// Schema Browser
// ---------------------------------------------------------------------------

function SchemaBrowser({
  tables,
  isLoading,
  onInsert,
}: {
  tables: SchemaTable[] | undefined;
  isLoading: boolean;
  onInsert: (text: string) => void;
}) {
  const t = useTranslations("sqlLab");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const toggle = (tableName: string) =>
    setExpanded((prev) => ({ ...prev, [tableName]: !prev[tableName] }));

  // Filter tables & columns by search query
  const filtered = useMemo(() => {
    if (!tables) return [];
    const q = search.toLowerCase().trim();
    if (!q) return tables;
    return tables
      .map((table) => {
        const tableMatch = table.table_name.toLowerCase().includes(q);
        const matchingCols = table.columns.filter((c) =>
          c.name.toLowerCase().includes(q)
        );
        if (tableMatch) return table; // show full table
        if (matchingCols.length > 0)
          return { ...table, columns: matchingCols }; // show only matching columns
        return null;
      })
      .filter(Boolean) as SchemaTable[];
  }, [tables, search]);

  // Auto-expand tables with matching columns when searching
  useEffect(() => {
    if (!search.trim() || !tables) return;
    const q = search.toLowerCase().trim();
    const toExpand: Record<string, boolean> = {};
    for (const table of tables) {
      const hasColMatch = table.columns.some((c) =>
        c.name.toLowerCase().includes(q)
      );
      if (hasColMatch) toExpand[table.table_name] = true;
    }
    if (Object.keys(toExpand).length > 0) {
      queueMicrotask(() => setExpanded((prev) => ({ ...prev, ...toExpand })));
    }
  }, [search, tables]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 rounded" />
        ))}
      </div>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-slate-400">
        <Database className="mb-2 h-8 w-8 text-slate-300" />
        <span>{t("noTablesFound")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Search field */}
      <div className="sticky top-0 z-10 bg-white p-2 dark:bg-slate-950">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchSchema")}
            className="h-7 pl-7 pr-7 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table list */}
      <div className="space-y-0.5 p-2 pt-0">
        {filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">
            {t("noMatches")}
          </div>
        ) : (
          filtered.map((table) => (
            <div key={table.table_name}>
              <button
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => toggle(table.table_name)}
              >
                {expanded[table.table_name] ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
                <Table2 className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                <span
                  className="flex-1 truncate font-mono text-xs cursor-pointer hover:text-blue-600"
                  title={t("clickToInsert", { table: table.table_name })}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsert(table.table_name);
                  }}
                >
                  {table.table_name}
                </span>
                <span className="text-[10px] text-slate-400">
                  {table.columns.length}
                </span>
              </button>
              {expanded[table.table_name] && (
                <div className="ml-5 border-l border-slate-200 pl-2">
                  {table.columns.map((col) => (
                    <button
                      key={col.name}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-xs text-slate-500 hover:bg-slate-50 hover:text-blue-600 cursor-pointer"
                      title={t("clickToInsertColumn", { column: col.name })}
                      onClick={() => onInsert(col.name)}
                    >
                      <Columns3 className="h-3 w-3 shrink-0 text-slate-300" />
                      <span className="flex-1 truncate font-mono">
                        {col.name}
                      </span>
                      <span className="shrink-0 rounded bg-slate-100 px-1 py-px text-[10px] font-medium text-slate-400">
                        {col.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results Table
// ---------------------------------------------------------------------------

function ResultsTable({ result }: { result: SQLResult }) {
  const t = useTranslations("sqlLab");
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<Record<string, unknown>, unknown>[]>(
    () =>
      result.columns.map((col) => ({
        accessorKey: col,
        header: col,
        cell: (info) => {
          const value = info.getValue();
          if (value === null) return <span className="text-slate-300 italic">{t("null")}</span>;
          return String(value);
        },
      })),
    [result.columns, t]
  );

  const data = useMemo(
    () =>
      result.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        result.columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      }),
    [result.columns, result.rows]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none whitespace-nowrap border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-100"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: <ArrowUp className="h-3 w-3 text-blue-500" />,
                        desc: <ArrowDown className="h-3 w-3 text-blue-500" />,
                      }[header.column.getIsSorted() as string] ?? (
                        <ArrowUpDown className="h-3 w-3 text-slate-300" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-blue-50/40">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="whitespace-nowrap border-b border-r border-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        <span>
          {t("rowCount", { count: result.row_count })}
        </span>
        <span className="text-slate-300">|</span>
        <span>{t("ms", { ms: result.execution_time_ms })}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save as Dataset Dialog
// ---------------------------------------------------------------------------

function SaveDatasetDialog({
  connectionId,
  sql,
  onClose,
}: {
  connectionId: number;
  sql: string;
  onClose: () => void;
}) {
  const t = useTranslations("sqlLab");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createDataset = useCreateDataset();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createDataset.mutateAsync({
      connection_id: connectionId,
      name: name.trim(),
      description: description.trim() || undefined,
      sql_query: sql,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">{t("saveAsDataset")}</CardTitle>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ds-name">{t("name")}</Label>
              <Input
                id="ds-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-desc">{t("descriptionOptional")}</Label>
              <Input
                id="ds-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                {tc("cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!name.trim() || createDataset.isPending}
              >
                {createDataset.isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3.5 w-3.5" />
                )}
                {t("saveDataset")}
              </Button>
            </div>
            {createDataset.isError && (
              <p className="text-xs text-red-500">
                {(createDataset.error as Error).message || t("failedToSave")}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Bar
// ---------------------------------------------------------------------------

function TabBar({
  tabs,
  onSwitch,
  onCreate,
  onClose,
  onRename,
}: {
  tabs: SQLTab[];
  onSwitch: (id: number) => void;
  onCreate: () => void;
  onClose: (id: number) => void;
  onRename: (id: number, label: string) => void;
}) {
  const t = useTranslations("sqlLab");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = (tab: SQLTab) => {
    setEditingId(tab.id);
    setEditLabel(tab.label);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (editingId !== null && editLabel.trim()) {
      onRename(editingId, editLabel.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-0 border-b border-slate-200 bg-slate-50 px-2">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group relative flex items-center gap-1 border-b-2 px-3 py-1.5 text-xs cursor-pointer transition-colors ${
            tab.is_active
              ? "border-blue-500 bg-white text-slate-800 font-medium"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          }`}
          onClick={() => !tab.is_active && onSwitch(tab.id)}
          onDoubleClick={() => startRename(tab)}
          title={t("renameTab")}
        >
          {editingId === tab.id ? (
            <input
              ref={inputRef}
              className="w-24 rounded border border-blue-300 bg-white px-1 py-0 text-xs outline-none"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="max-w-[120px] truncate">{tab.label}</span>
          )}
          <button
            className="ml-1 rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-600 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            title={t("closeTab")}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        className="ml-1 flex items-center gap-1 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        onClick={onCreate}
        title={t("newTab")}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SQL Lab Page
// ---------------------------------------------------------------------------

export default function SQLLabPage() {
  const t = useTranslations("sqlLab");
  const ta = useTranslations("aiAssistant");
  const tr = useTranslations("roles");
  const { canSqlLab } = useRoles();
  const fixSQL = useFixSQL();
  const generateSQL = useGenerateSQL();
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiInput, setShowAiInput] = useState(false);
  const { data: connections, isLoading: connectionsLoading } = useConnections();
  const { data: tabs, isLoading: tabsLoading } = useSQLTabs();
  const createTab = useCreateSQLTab();
  const updateTab = useUpdateSQLTab();
  const deleteTab = useDeleteSQLTab();
  const executeSQL = useExecuteSQL();

  // Local state per-tab results
  const [result, setResult] = useState<SQLResult | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Local overrides for SQL and connection while typing (before auto-save)
  const [localSql, setLocalSql] = useState<string | null>(null);
  const [localConnectionId, setLocalConnectionId] = useState<number | null | undefined>(undefined);

  const editorRef = useRef<unknown>(null);
  const schemaRef = useRef<SchemaTable[] | undefined>(undefined);
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevActiveTabIdRef = useRef<number | null>(null);

  const activeTab = tabs?.find((t) => t.is_active) ?? tabs?.[0] ?? null;
  const sql = localSql ?? activeTab?.sql_query ?? "";
  const activeConnectionId =
    localConnectionId !== undefined
      ? localConnectionId
      : activeTab?.connection_id ??
        (connections && connections.length > 0 ? connections[0].id : null);

  // Reset local state when active tab changes
  useEffect(() => {
    if (activeTab && activeTab.id !== prevActiveTabIdRef.current) {
      prevActiveTabIdRef.current = activeTab.id;
      queueMicrotask(() => {
        setLocalSql(null);
        setLocalConnectionId(undefined);
        setResult(null);
      });
    }
  }, [activeTab]);

  // Auto-save debounce
  const scheduleAutoSave = useCallback(
    (data: { sql_query?: string; connection_id?: number | null }) => {
      if (!activeTab) return;
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        updateTab.mutate({ id: activeTab.id, ...data });
      }, AUTO_SAVE_MS);
    },
    [activeTab, updateTab]
  );

  // Pre-fill from URL params (?cid=X&sql=Y) — e.g. "View in SQL Lab" from chart editor
  const searchParams = useSearchParams();
  const urlParamsAppliedRef = useRef(false);
  useEffect(() => {
    if (urlParamsAppliedRef.current) return;
    if (!tabs || tabsLoading) return;
    const paramCid = searchParams.get("cid");
    const paramSql = searchParams.get("sql");
    if (!paramCid && !paramSql) { urlParamsAppliedRef.current = true; return; }
    urlParamsAppliedRef.current = true;
    queueMicrotask(() => {
      if (paramCid) setLocalConnectionId(parseInt(paramCid));
      if (paramSql) setLocalSql(paramSql);
    });
    // Clean URL without reload
    window.history.replaceState({}, "", "/sql-lab");
  }, [tabs, tabsLoading, searchParams]);

  const { data: schema, isLoading: schemaLoading } = useConnectionSchema(activeConnectionId);
  useEffect(() => { schemaRef.current = schema; }, [schema]);

  const handleRun = useCallback(() => {
    if (!activeConnectionId || !sql.trim()) return;
    executeSQL.mutate(
      { connection_id: activeConnectionId, sql: sql.trim(), limit: 1000 },
      { onSuccess: (data) => setResult(data) }
    );
  }, [activeConnectionId, sql, executeSQL]);

  const handleEditorMount = useCallback(
    (editor: unknown, monaco: unknown) => {
      editorRef.current = editor;
      const ed = editor as { addCommand: (keybinding: number, handler: () => void) => void };
      const m = monaco as {
        KeyMod: { CtrlCmd: number };
        KeyCode: { Enter: number };
        languages: {
          CompletionItemKind: Record<string, number>;
          registerCompletionItemProvider: (lang: string, provider: unknown) => { dispose: () => void };
        };
      };
      ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => {
        handleRun();
      });

      completionDisposableRef.current?.dispose();
      completionDisposableRef.current = m.languages.registerCompletionItemProvider("sql", {
        triggerCharacters: [".", " "],
        provideCompletionItems: (model: { getWordUntilPosition: (pos: unknown) => { startColumn: number; endColumn: number } }, position: { lineNumber: number }) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          const suggestions: unknown[] = [];

          const keywords = [
            "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "BETWEEN",
            "LIKE", "IS", "NULL", "ORDER", "BY", "GROUP", "HAVING", "LIMIT",
            "OFFSET", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS",
            "ON", "AS", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX",
            "CASE", "WHEN", "THEN", "ELSE", "END", "UNION", "ALL", "WITH",
            "EXISTS", "COALESCE", "CAST", "EXTRACT", "DATE_TRUNC", "INSERT",
            "UPDATE", "DELETE", "CREATE", "ALTER", "DROP", "TABLE", "INDEX",
            "VIEW", "INTO", "VALUES", "SET", "ASC", "DESC", "NULLS", "FIRST",
            "LAST", "OVER", "PARTITION", "ROW_NUMBER", "RANK", "DENSE_RANK",
            "LAG", "LEAD", "WINDOW", "FILTER", "ILIKE", "SIMILAR", "TO",
          ];
          for (const kw of keywords) {
            suggestions.push({
              label: kw,
              kind: m.languages.CompletionItemKind.Keyword,
              insertText: kw,
              range,
            });
          }

          if (schemaRef.current) {
            for (const table of schemaRef.current) {
              suggestions.push({
                label: table.table_name,
                kind: m.languages.CompletionItemKind.Class,
                insertText: table.table_name,
                detail: `${table.columns.length} columns`,
                range,
              });
              for (const col of table.columns) {
                suggestions.push({
                  label: col.name,
                  kind: m.languages.CompletionItemKind.Field,
                  insertText: col.name,
                  detail: `${table.table_name}.${col.name} (${col.type})`,
                  range,
                });
              }
            }
          }

          return { suggestions };
        },
      });
    },
    [handleRun]
  );

  const handleInsertTable = useCallback(
    (tableName: string) => {
      const ed = editorRef.current as {
        trigger: (source: string, handler: string, args: unknown) => void;
      } | null;
      if (!ed) return;
      ed.trigger("keyboard", "type", { text: tableName });
    },
    []
  );

  const handleSqlChange = useCallback(
    (value: string | undefined) => {
      const v = value ?? "";
      setLocalSql(v);
      scheduleAutoSave({ sql_query: v });
    },
    [scheduleAutoSave]
  );

  const handleConnectionChange = useCallback(
    (connId: number | null) => {
      setLocalConnectionId(connId);
      scheduleAutoSave({ connection_id: connId });
    },
    [scheduleAutoSave]
  );

  const handleSwitchTab = useCallback(
    (id: number) => {
      // Flush pending auto-save for current tab
      clearTimeout(autoSaveTimerRef.current);
      if (activeTab && localSql !== null) {
        updateTab.mutate({ id: activeTab.id, sql_query: localSql, connection_id: localConnectionId ?? undefined });
      }
      updateTab.mutate({ id, is_active: true });
    },
    [activeTab, localSql, localConnectionId, updateTab]
  );

  const handleCreateTab = useCallback(() => {
    createTab.mutate({});
  }, [createTab]);

  const handleCloseTab = useCallback(
    (id: number) => {
      deleteTab.mutate(id);
    },
    [deleteTab]
  );

  const handleRenameTab = useCallback(
    (id: number, label: string) => {
      updateTab.mutate({ id, label });
    },
    [updateTab]
  );

  if (!canSqlLab) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Terminal className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">{tr("noPermission")}</p>
        </div>
      </div>
    );
  }

  if (tabsLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("loadingTabs")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-0 -m-4">
      {/* Top Bar */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-slate-500" />
          <h1 className="text-sm font-semibold text-slate-800">{t("title")}</h1>
        </div>

        <div className="mx-2 h-5 w-px bg-slate-200" />

        <div className="flex items-center gap-2">
          <Label htmlFor="conn-select" className="text-xs text-slate-500">
            {t("connection")}
          </Label>
          {connectionsLoading ? (
            <Skeleton className="h-8 w-48 rounded" />
          ) : (
            <Select
              value={activeConnectionId != null ? String(activeConnectionId) : "_empty_"}
              onValueChange={(v) => handleConnectionChange(v !== "_empty_" ? Number(v) : null)}
            >
              <SelectTrigger size="sm" className="w-auto">
                <SelectValue placeholder={t("noConnections")} />
              </SelectTrigger>
              <SelectContent>
                {!connections || connections.length === 0 ? (
                  <SelectItem value="_empty_">{t("noConnections")}</SelectItem>
                ) : (
                  connections.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} ({c.db_type})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex-1" />

        <Button
          size="sm"
          onClick={handleRun}
          disabled={!activeConnectionId || !sql.trim() || executeSQL.isPending}
        >
          {executeSQL.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1 h-3.5 w-3.5" />
          )}
          {t("run")}
        </Button>

        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowSaveDialog(true)}
          disabled={!activeConnectionId || !sql.trim()}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {t("saveAsDataset")}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAiInput(!showAiInput)}
        >
          <Bot className="mr-1 h-3.5 w-3.5" />
          AI
        </Button>

        {result && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => downloadCSV(result.columns, result.rows, "query-results")}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            {t("csv")}
          </Button>
        )}
      </div>

      {/* Tab Bar */}
      {tabs && tabs.length > 0 && (
        <TabBar
          tabs={tabs}
          onSwitch={handleSwitchTab}
          onCreate={handleCreateTab}
          onClose={handleCloseTab}
          onRename={handleRenameTab}
        />
      )}

      {/* AI prompt input */}
      {showAiInput && (
        <div className="flex gap-2 border-b border-slate-200 bg-slate-50/50 px-4 py-2">
          <Input
            placeholder={ta("generatePlaceholder")}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && aiPrompt.trim() && activeConnectionId) {
                generateSQL.mutate(
                  { connection_id: activeConnectionId, prompt: aiPrompt, current_sql: sql },
                  {
                    onSuccess: (data) => {
                      if (data.sql) {
                        setLocalSql(data.sql);
                        if (activeTab) scheduleAutoSave({ sql_query: data.sql });
                      }
                      setAiPrompt("");
                      setShowAiInput(false);
                    },
                  }
                );
              }
            }}
            className="text-sm"
            disabled={generateSQL.isPending}
            autoFocus
          />
          {generateSQL.isPending && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
        </div>
      )}

      {/* Main Area: Schema Browser + Editor */}
      <div className="flex flex-1 overflow-hidden">
        {/* Schema Browser */}
        <div className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("schemaBrowser")}
            </h2>
          </div>
          <div className="flex-1 overflow-auto">
            {activeConnectionId ? (
              <SchemaBrowser
                tables={schema}
                isLoading={schemaLoading}
                onInsert={handleInsertTable}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-xs text-slate-400">
                <Database className="mb-2 h-8 w-8 text-slate-300" />
                <span>{t("selectConnection")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Editor + Results */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Monaco Editor */}
          <div className="h-64 shrink-0 border-b border-slate-200">
            <Editor
              key={activeTab?.id ?? "no-tab"}
              height="100%"
              language="sql"
              theme="vs"
              value={sql}
              onChange={handleSqlChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                padding: { top: 8, bottom: 8 },
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>

          {/* Results Area */}
          <div className="flex flex-1 flex-col overflow-hidden bg-white">
            {executeSQL.isPending && (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t("executing")}
              </div>
            )}

            {executeSQL.isError && !executeSQL.isPending && (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="max-w-lg rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p className="mb-1 font-medium">{t("queryError")}</p>
                  <p className="font-mono text-xs">
                    {(executeSQL.error as Error).message || t("errorOccurred")}
                  </p>
                  {activeConnectionId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        fixSQL.mutate(
                          {
                            connection_id: activeConnectionId,
                            sql: sql,
                            error: (executeSQL.error as Error).message || "",
                          },
                          {
                            onSuccess: (data) => {
                              if (data.sql) {
                                setLocalSql(data.sql);
                                if (activeTab) scheduleAutoSave({ sql_query: data.sql });
                              }
                            },
                          }
                        );
                      }}
                      disabled={fixSQL.isPending}
                    >
                      {fixSQL.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Bot className="mr-1 h-3 w-3" />
                      )}
                      {ta("fixSQL")}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {result && !executeSQL.isPending && !executeSQL.isError && (
              <ResultsTable result={result} />
            )}

            {!result && !executeSQL.isPending && !executeSQL.isError && (
              <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
                <Play className="mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm">{t("runToSeeResults")}</p>
                <p className="mt-1 text-xs text-slate-300">{t("shortcutHint")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && activeConnectionId && (
        <SaveDatasetDialog
          connectionId={activeConnectionId}
          sql={sql}
          onClose={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
