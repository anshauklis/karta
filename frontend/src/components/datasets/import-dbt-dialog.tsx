"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Check } from "lucide-react";
import { useConnections } from "@/hooks/use-connections";
import {
  usePreviewDbt,
  useImportDbt,
  type DbtPreviewModel,
  type DbtImportResult,
} from "@/hooks/use-datasets";

interface ImportDbtDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportDbtDialog({ open, onOpenChange }: ImportDbtDialogProps) {
  const t = useTranslations("dbt");
  const tc = useTranslations("common");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [connectionId, setConnectionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [models, setModels] = useState<DbtPreviewModel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<DbtImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: connections } = useConnections();
  const previewDbt = usePreviewDbt();
  const importDbt = useImportDbt();

  const reset = useCallback(() => {
    setStep(1);
    setConnectionId("");
    setFile(null);
    setModels([]);
    setSelected(new Set());
    setResult(null);
    previewDbt.reset();
    importDbt.reset();
  }, [previewDbt, importDbt]);

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleFileUpload = async (f: File) => {
    if (!connectionId) return;
    setFile(f);
    const res = await previewDbt.mutateAsync({
      file: f,
      connectionId: Number(connectionId),
    });
    setModels(res.models);
    setSelected(new Set(res.models.map((m) => m.unique_id)));
    setStep(2);
  };

  const handleToggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selected.size === models.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(models.map((m) => m.unique_id)));
    }
  };

  const handleImport = async () => {
    if (!file || !connectionId || selected.size === 0) return;
    const res = await importDbt.mutateAsync({
      file,
      connectionId: Number(connectionId),
      selectedModels: Array.from(selected),
    });
    setResult(res);
    setStep(3);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t("importFromDbt")}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? t("uploadManifest")
              : step === 2
                ? t("previewModels")
                : t("importComplete")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {/* Step 1: Connection + File */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("selectConnection")}</label>
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectConnection")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(connections ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                className={`
                  border-2 border-dashed rounded-lg p-12 text-center
                  transition-colors
                  ${connectionId ? "cursor-pointer hover:border-muted-foreground/50" : "opacity-50 cursor-not-allowed"}
                  ${previewDbt.isPending ? "border-primary/50" : "border-muted-foreground/25"}
                `}
                onClick={() => connectionId && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />

                {previewDbt.isPending ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{tc("loading")}</p>
                  </div>
                ) : previewDbt.isError ? (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="h-10 w-10 text-destructive" />
                    <p className="text-sm text-destructive">
                      {previewDbt.error?.message || "Failed to parse manifest"}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium">{t("uploadManifest")}</p>
                    <p className="text-xs text-muted-foreground">manifest.json</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Preview models */}
          {step === 2 && models.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {models.length} {t("modelsFound")}
                </p>
                <Button variant="ghost" size="sm" onClick={handleToggleAll}>
                  {selected.size === models.length ? t("deselectAll") : t("selectAll")}
                </Button>
              </div>

              <div className="rounded-md border overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]" />
                      <TableHead>{tc("name")}</TableHead>
                      <TableHead>{t("schema")}</TableHead>
                      <TableHead className="hidden md:table-cell">{tc("description")}</TableHead>
                      <TableHead className="w-[80px]">{t("columns")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("tags")}</TableHead>
                      <TableHead className="w-[80px]">{t("materialized")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models.map((m) => (
                      <TableRow key={m.unique_id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(m.unique_id)}
                            onCheckedChange={() => handleToggle(m.unique_id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {m.name}
                          {m.exists_in_karta && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              {t("existing")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.schema}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                          {m.description || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.columns_count}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex gap-1 flex-wrap">
                            {m.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.materialized}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleImport}
                  disabled={importDbt.isPending || selected.size === 0}
                >
                  {importDbt.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {importDbt.isPending ? t("importing") : t("import")} ({selected.size})
                </Button>
                <Button variant="secondary" onClick={() => { reset(); }}>
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && models.length === 0 && !previewDbt.isPending && (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-sm text-muted-foreground">{t("noModels")}</p>
              <Button variant="secondary" onClick={() => reset()}>
                {tc("back")}
              </Button>
            </div>
          )}

          {/* Step 3: Results */}
          {step === 3 && result && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-full bg-green-100 p-3">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">{t("importComplete")}</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {result.imported > 0 && (
                  <span>{t("imported")}: {result.imported}</span>
                )}
                {result.updated > 0 && (
                  <span>{t("updated")}: {result.updated}</span>
                )}
                {result.skipped > 0 && (
                  <span>{t("skipped")}: {result.skipped}</span>
                )}
              </div>
              <Button variant="secondary" onClick={() => handleClose(false)}>
                {tc("close")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
