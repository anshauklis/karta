"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  FileJson,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useImportPreview,
  useImportConfirm,
  type ImportPreviewResponse,
  type ImportPreviewConnection,
} from "@/hooks/use-export";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDashboardDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const router = useRouter();

  const [fileData, setFileData] = useState<Record<string, unknown> | null>(
    null,
  );
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [connectionMapping, setConnectionMapping] = useState<
    Record<string, number>
  >({});
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importPreview = useImportPreview();
  const importConfirm = useImportConfirm();

  const reset = useCallback(() => {
    setFileData(null);
    setPreview(null);
    setConnectionMapping({});
    setDragOver(false);
    importPreview.reset();
    importConfirm.reset();
  }, [importPreview, importConfirm]);

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const processFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Record<string, unknown>;
      setFileData(data);

      const result = await importPreview.mutateAsync(data);
      setPreview(result);

      // Pre-fill mapping for auto-matched connections
      const initialMapping: Record<string, number> = {};
      for (const conn of result.connections) {
        if (conn.status === "matched" && conn.matched_connection_id !== null) {
          initialMapping[conn._ref] = conn.matched_connection_id;
        }
      }
      setConnectionMapping(initialMapping);
    } catch {
      toast.error(t("importInvalidFile"));
      setFileData(null);
      setPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleImport = async () => {
    if (!fileData) return;
    const result = await importConfirm.mutateAsync({
      data: fileData,
      connection_mapping: connectionMapping,
    });
    handleClose(false);
    router.push(`/dashboard/${result.url_slug}`);
  };

  const allConnectionsMapped =
    !preview?.connections.length ||
    preview.connections.every((conn) => connectionMapping[conn._ref] != null);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            {t("importDashboard")}
          </DialogTitle>
          <DialogDescription>
            {preview
              ? preview.dashboard.title
              : t("importDropZone")}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: File drop zone */}
        {!preview && (
          <div
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
              transition-colors
              ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}
            `}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processFile(file);
              }}
            />

            {importPreview.isPending ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {tc("validating")}
                </p>
              </div>
            ) : importPreview.isError ? (
              <div className="flex flex-col items-center gap-3">
                <FileJson className="h-10 w-10 text-destructive" />
                <p className="text-sm text-destructive">
                  {t("importInvalidFile")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">{t("importDropZone")}</p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Preview */}
        {preview && (
          <div className="space-y-4">
            {/* Dashboard info card */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{preview.dashboard.icon || "📊"}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">
                    {preview.dashboard.title}
                  </h3>
                  {preview.dashboard.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                      {preview.dashboard.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="secondary">
                      {t("importCharts", {
                        count: preview.dashboard.chart_count,
                      })}
                    </Badge>
                    <Badge variant="secondary">
                      {t("importTabs", {
                        count: preview.dashboard.tab_count,
                      })}
                    </Badge>
                    <Badge variant="secondary">
                      {t("importFilters", {
                        count: preview.dashboard.filter_count,
                      })}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection mapping */}
            {preview.connections.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {t("importConnectionMapping")}
                </Label>
                <div className="space-y-2">
                  {preview.connections.map((conn) => (
                    <ConnectionMappingRow
                      key={conn._ref}
                      connection={conn}
                      availableConnections={preview.available_connections}
                      mappedId={connectionMapping[conn._ref] ?? null}
                      onMap={(id) =>
                        setConnectionMapping((prev) => ({
                          ...prev,
                          [conn._ref]: id,
                        }))
                      }
                      selectPlaceholder={t("importSelectConnection")}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {preview && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleImport}
              disabled={!allConnectionsMapped || importConfirm.isPending}
            >
              {importConfirm.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {importConfirm.isPending ? tc("importing") : tc("import")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Connection Mapping Row ──────────────────────────────────────────

function ConnectionMappingRow({
  connection,
  availableConnections,
  mappedId,
  onMap,
  selectPlaceholder,
}: {
  connection: ImportPreviewConnection;
  availableConnections: { id: number; name: string; db_type: string }[];
  mappedId: number | null;
  onMap: (id: number) => void;
  selectPlaceholder: string;
}) {
  const isMapped = mappedId !== null;

  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      {/* Status icon */}
      {isMapped ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
      )}

      {/* Connection info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {connection.exported.name}
          </span>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {connection.exported.db_type}
          </Badge>
        </div>
        {connection.exported.host && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {connection.exported.host}
            {connection.exported.database_name
              ? ` / ${connection.exported.database_name}`
              : ""}
          </p>
        )}
      </div>

      {/* Mapping select */}
      <Select
        value={mappedId !== null ? String(mappedId) : undefined}
        onValueChange={(val) => onMap(Number(val))}
      >
        <SelectTrigger className="w-[200px] shrink-0">
          <SelectValue placeholder={selectPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {availableConnections.map((ac) => (
            <SelectItem key={ac.id} value={String(ac.id)}>
              <span className="flex items-center gap-2">
                {ac.name}
                <Badge variant="outline" className="text-[10px] ml-1">
                  {ac.db_type}
                </Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
