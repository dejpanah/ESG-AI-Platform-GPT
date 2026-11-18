import { useMemo, useRef, useState } from "react";
import {
  ingestDeviceTelemetry,
  type EsgTableDescriptor,
} from "@/api/esg-data";
import { getWorkspaceId } from "@/api/client";
import {
  buildDefaultColumnMapping,
  buildSampleCsvForTable,
  parseCsvText,
  transformCsvToDotNetPayload,
  type ParsedCsv,
} from "@/lib/esg-csv";
import { Panel, EmptyNote } from "@/components/system/panels";
import { StatusDot } from "@/components/StatusDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

export function EsgCsvImporter({
  tables,
  defaultTable,
  onIngested,
}: {
  tables: EsgTableDescriptor[];
  defaultTable: string;
  onIngested?: (table: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [targetTable, setTargetTable] = useState<string>(defaultTable);
  const [deviceId, setDeviceId] = useState("csv-gateway-upload");
  const [sourceSystem, setSourceSystem] = useState("csv-batch-importer");
  const [syncToRag, setSyncToRag] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const tableMeta = useMemo(
    () =>
      tables.find((t) => t.table === targetTable) ??
      tables.find((t) => t.table === defaultTable) ??
      tables[0] ??
      null,
    [tables, targetTable, defaultTable],
  );

  const loadCsvContent = (name: string, text: string, metaOverride?: EsgTableDescriptor | null) => {
    const parsed = parseCsvText(text);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      toast.error("CSV file must include a header row and at least one data row.");
      return;
    }
    const activeMeta = metaOverride ?? tableMeta;
    setFileName(name);
    setParsedCsv(parsed);
    if (activeMeta) {
      setColumnMapping(buildDefaultColumnMapping(parsed.headers, activeMeta));
    }
  };

  const handleFileChange = async (file: File | undefined | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      loadCsvContent(file.name, text);
    } catch {
      toast.error("Could not read CSV file");
    }
  };

  const handleTableChange = (nextTable: string) => {
    setTargetTable(nextTable);
    const nextMeta = tables.find((t) => t.table === nextTable);
    if (parsedCsv && nextMeta) {
      setColumnMapping(buildDefaultColumnMapping(parsedCsv.headers, nextMeta));
    }
  };

  const handleDownloadTemplate = () => {
    if (!tableMeta) return;
    const csv = buildSampleCsvForTable(tableMeta);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tableMeta.table}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadSample = () => {
    if (!tableMeta) return;
    const csv = buildSampleCsvForTable(tableMeta);
    loadCsvContent(`${tableMeta.table}_sample.csv`, csv, tableMeta);
    toast.success(`Loaded sample CSV for ${tableMeta.table}`);
  };

  const transformed = useMemo(() => {
    if (!parsedCsv || !tableMeta) return null;
    return transformCsvToDotNetPayload({
      parsed: parsedCsv,
      tableMeta,
      columnMapping,
      deviceId,
      sourceSystem,
      syncToRag,
      workspaceId: getWorkspaceId(),
    });
  }, [parsedCsv, tableMeta, columnMapping, deviceId, sourceSystem, syncToRag]);

  const handleDownloadDotNetPayload = () => {
    if (!transformed) return;
    const blob = new Blob([JSON.stringify(transformed.payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${transformed.payload.table}_dotnet_ingest_payload.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async () => {
    if (!transformed || !tableMeta) return;
    if (transformed.validRecords.length === 0) {
      toast.error("No valid ESG records to ingest. Check required field mappings.");
      return;
    }
    setUploading(true);
    try {
      const res = await ingestDeviceTelemetry(transformed.payload);
      toast.success(
        `Ingested ${res.inserted} CSV row(s) into ${res.table}${
          res.rag_sync ? ` & synced ${res.rag_sync.chunks_indexed} RAG chunks` : ""
        }`,
      );
      onIngested?.(tableMeta.table);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CSV ingestion failed");
    } finally {
      setUploading(false);
    }
  };

  const validCount = transformed?.validRecords.length ?? 0;
  const totalCount = transformed?.rowResults.length ?? 0;
  const errorCount = totalCount - validCount;

  return (
    <Panel
      title="CSV ESG Data Importer (.NET Web API Schema)"
      description="Upload & parse CSV telemetry or ESG reports, map columns to Postgres tables, validate required fields, and emit DeviceIngestPayload for /api/ingest/device."
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={handleLoadSample}
            disabled={!tableMeta}
          >
            <FileSpreadsheet className="size-3.5" />
            Load sample CSV
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={handleDownloadTemplate}
            disabled={!tableMeta}
          >
            <Download className="size-3.5" />
            CSV template
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-[11.5px]">
            <span className="term-dim block">Target ESG table</span>
            <select
              value={tableMeta?.table ?? targetTable}
              onChange={(e) => handleTableChange(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11.5px] font-mono"
            >
              {tables.map((t) => (
                <option key={t.table} value={t.table}>
                  {t.table} ({t.kind})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11.5px]">
            <span className="term-dim block">device_id (.NET payload)</span>
            <Input
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="csv-gateway-upload"
              className="h-8 font-mono text-[11.5px]"
            />
          </label>
          <label className="space-y-1 text-[11.5px]">
            <span className="term-dim block">source_system (.NET payload)</span>
            <Input
              value={sourceSystem}
              onChange={(e) => setSourceSystem(e.target.value)}
              placeholder="csv-batch-importer"
              className="h-8 font-mono text-[11.5px]"
            />
          </label>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const dropped = e.dataTransfer.files?.[0];
            void handleFileChange(dropped);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-5 text-center transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20",
          )}
        >
          <Upload className="size-5 text-muted-foreground" />
          <div className="text-[12px]">
            {fileName ? (
              <span>
                Loaded <code className="font-mono font-semibold">{fileName}</code>{" "}
                ({totalCount} row{totalCount === 1 ? "" : "s"}, delimiter{" "}
                <code className="font-mono">
                  {parsedCsv?.delimiter === "\t" ? "\\t" : parsedCsv?.delimiter}
                </code>
                )
              </span>
            ) : (
              <span>
                Drop a <code className="font-mono">.csv</code> file here or browse to parse ESG records
              </span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              void handleFileChange(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose CSV file
          </Button>
        </div>

        {parsedCsv && tableMeta && transformed ? (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-background p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11.5px] font-semibold">
                  Column Mapping → <code className="font-mono">{tableMeta.table}</code>
                </span>
                {transformed.missingRequiredFields.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--term-warn)]">
                    <AlertTriangle className="size-3.5" />
                    Missing required:{" "}
                    {transformed.missingRequiredFields.join(", ")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--term-ok)]">
                    <CheckCircle2 className="size-3.5" />
                    All required fields mapped
                  </span>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {parsedCsv.headers.map((header) => {
                  const mapped = columnMapping[header] ?? "";
                  const sampleVal = parsedCsv.rows[0]?.[parsedCsv.headers.indexOf(header)] ?? "";
                  return (
                    <div
                      key={header}
                      className="rounded border border-border/80 bg-muted/20 p-2 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10.5px]">
                        <span className="truncate font-mono font-medium" title={header}>
                          {header}
                        </span>
                        <span className="term-dim truncate max-w-[110px]" title={sampleVal}>
                          e.g. {sampleVal || "—"}
                        </span>
                      </div>
                      <select
                        value={mapped}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({
                            ...prev,
                            [header]: e.target.value,
                          }))
                        }
                        className="h-7 w-full rounded border border-input bg-background px-1.5 font-mono text-[11px]"
                      >
                        <option value="">-- ignore column --</option>
                        {tableMeta.writable.map((field) => (
                          <option key={field} value={field}>
                            {field}
                            {tableMeta.required.includes(field) ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot tone={validCount > 0 ? "ok" : "warn"} />
                    <span>{validCount} valid record(s)</span>
                  </span>
                  {errorCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-[var(--term-warn)]">
                      <StatusDot tone="warn" />
                      <span>{errorCount} row error(s)</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => setShowJsonPreview((v) => !v)}
                  >
                    <Code2 className="size-3.5" />
                    {showJsonPreview ? "Hide .NET JSON" : "Preview .NET JSON"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={handleDownloadDotNetPayload}
                    disabled={validCount === 0}
                  >
                    <Download className="size-3.5" />
                    Export .NET JSON
                  </Button>
                </div>
              </div>

              {showJsonPreview && (
                <pre className="max-h-60 overflow-auto rounded-md border border-border bg-background p-2.5 font-mono text-[10.5px]">
                  {JSON.stringify(transformed.payload, null, 2)}
                </pre>
              )}

              <div className="max-h-56 overflow-auto rounded-md border border-border bg-background">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-2.5 py-1.5 font-mono font-medium text-muted-foreground">
                        #
                      </th>
                      <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                        Validation
                      </th>
                      <th className="px-2.5 py-1.5 font-mono font-medium text-muted-foreground">
                        Normalized .NET Record
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transformed.rowResults.slice(0, 25).map((res) => (
                      <tr
                        key={res.rowNumber}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="term-dim px-2.5 py-1.5 font-mono">
                          {res.rowNumber}
                        </td>
                        <td className="px-2.5 py-1.5">
                          {res.errors.length === 0 ? (
                            <span className="text-[var(--term-ok)]">ready</span>
                          ) : (
                            <span className="text-[var(--term-warn)]">
                              {res.errors.join("; ")}
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-[10.5px]">
                          {res.record
                            ? JSON.stringify(res.record)
                            : JSON.stringify(res.raw)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {transformed.rowResults.length > 25 && (
                <p className="term-dim text-[10.5px]">
                  Showing first 25 of {transformed.rowResults.length} parsed rows.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <label className="flex items-center gap-2 text-[11.5px]">
                <input
                  type="checkbox"
                  checked={syncToRag}
                  onChange={(e) => setSyncToRag(e.target.checked)}
                  className="accent-primary"
                />
                <span>
                  Set <code className="font-mono">sync_to_rag: true</code> to embed parsed rows into RAG immediately
                </span>
              </label>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSubmit()}
                disabled={uploading || validCount === 0}
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                Ingest {validCount} validated record{validCount === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        ) : (
          <EmptyNote>
            Select a target ESG table and upload a CSV file (or click &ldquo;Load sample CSV&rdquo;) to inspect column mappings and validate the `.NET Web API` `DeviceIngestPayload`.
          </EmptyNote>
        )}
      </div>
    </Panel>
  );
}
