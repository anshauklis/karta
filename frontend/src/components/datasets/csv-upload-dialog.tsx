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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, FileSpreadsheet, Loader2, Check, BarChart3 } from "lucide-react";
import {
  useCSVPreview,
  useCSVImport,
  type CSVPreviewResponse,
  type CSVImportResponse,
} from "@/hooks/use-datasets";

interface CSVUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateChart?: (datasetId: number) => void;
}

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

export function CSVUploadDialog({
  open,
  onOpenChange,
  onCreateChart,
}: CSVUploadDialogProps) {
  const t = useTranslations("dataset");
  const tc = useTranslations("common");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<CSVPreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<CSVImportResponse | null>(null);
  const [tableName, setTableName] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const csvPreview = useCSVPreview();
  const csvImport = useCSVImport();

  const reset = useCallback(() => {
    setStep(1);
    setPreview(null);
    setImportResult(null);
    setTableName("");
    setDatasetName("");
    setDescription("");
    setDragOver(false);
    csvPreview.reset();
    csvImport.reset();
  }, [csvPreview, csvImport]);

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const ACCEPTED_EXTENSIONS = [".csv", ".parquet"];

  const handleFile = async (file: File) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      return;
    }

    const result = await csvPreview.mutateAsync(file);
    setPreview(result);

    // Default names from filename (strip extension)
    const baseName = file.name.replace(/\.(csv|parquet)$/i, "");
    setTableName(baseName);
    setDatasetName(baseName);
    setStep(2);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!preview) return;
    const result = await csvImport.mutateAsync({
      temp_id: preview.temp_id,
      table_name: tableName,
      dataset_name: datasetName,
      description,
    });
    setImportResult(result);
    setStep(3);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t("uploadFile")}</DialogTitle>
          <DialogDescription>
            {t("step", { current: step, total: 3 })} — {step === 1 ? t("selectFile") : step === 2 ? t("reviewData") : t("done")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {/* Step 1: File Selection */}
          {step === 1 && (
            <div
              className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                transition-colors
                ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}
              `}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.parquet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />

              {csvPreview.isPending ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </div>
              ) : csvPreview.isError ? (
                <div className="flex flex-col items-center gap-3">
                  <FileSpreadsheet className="h-10 w-10 text-destructive" />
                  <p className="text-sm text-destructive">{t("invalidFile")}</p>
                  <p className="text-xs text-muted-foreground">{csvPreview.error?.message}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium">{t("dragDropFile")}</p>
                  <p className="text-xs text-muted-foreground">{t("orClickToSelect")}</p>
                  <p className="text-xs text-muted-foreground">Max 200MB</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview & Settings */}
          {step === 2 && preview && (
            <div className="space-y-4">
              {/* Settings */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("tableName")}</Label>
                  <Input
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="my_table"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("datasetName")}</Label>
                  <Input
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    placeholder="My Dataset"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("description")}</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>

              {/* Info */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{t("rowCount", { count: preview.total_rows })}</span>
                <span>{t("columnCount", { count: preview.columns.length })}</span>
                <span>{preview.filename}</span>
              </div>

              {/* Preview table */}
              <div className="rounded-md border overflow-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.columns.map((col) => (
                        <TableHead key={col.name} className="whitespace-nowrap">
                          <div className="text-xs font-semibold">{col.name}</div>
                          <div className="text-[10px] text-muted-foreground font-normal">{col.type}</div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row, i) => (
                      <TableRow key={i}>
                        {row.map((cell, j) => (
                          <TableCell key={j} className="whitespace-nowrap text-xs">
                            {cell === null ? (
                              <span className="text-muted-foreground italic">NULL</span>
                            ) : (
                              String(cell)
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleImport}
                  disabled={csvImport.isPending || !tableName.trim() || !datasetName.trim()}
                >
                  {csvImport.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {csvImport.isPending ? t("importing") : t("import")}
                </Button>
                <Button variant="secondary" onClick={() => { reset(); setStep(1); }}>
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && importResult && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-full bg-green-100 p-3">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">{t("datasetCreated")}</h3>
              <p className="text-sm text-muted-foreground">
                {importResult.dataset_name} — {t("rowCount", { count: importResult.row_count })}
              </p>
              <div className="flex items-center gap-3">
                {onCreateChart && (
                  <Button onClick={() => onCreateChart(importResult.dataset_id)}>
                    <BarChart3 className="mr-1 h-4 w-4" />
                    {t("createChart")}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => handleClose(false)}>
                  {tc("close")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
