import {
  commitBulkCalcImport,
  validateBulkCalcImport,
  type BulkImportValidationReport,
  type CalcEngineSlug,
  type CalcEngineView,
} from "@/api/calc-engines";
import type { LedgerField } from "@/components/calc/CalcLedgerPanel";
import { ValidationSparkline } from "@/components/calc/ValidationSparkline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  downloadCalcBulkTemplateCsv,
  EMISSION_FACTORS_FIELDS,
  generateCalcBulkTemplateCsv,
  parseCalcBulkCsv,
} from "@/lib/calc-bulk-csv";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export interface CalcBulkImportPanelProps {
  slug: CalcEngineSlug;
  engineTitle?: string;
  fields: LedgerField[];
  onClose: () => void;
  onCommitted: (updatedView: CalcEngineView) => void;
}

export function CalcBulkImportPanel({
  slug,
  engineTitle,
  fields,
  onClose,
  onCommitted,
}: CalcBulkImportPanelProps) {
  const effectiveFields =
    slug === "emission-factors" && fields.length === 0
      ? EMISSION_FACTORS_FIELDS
      : fields;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [stagedRows, setStagedRows] = useState<Array<Record<string, unknown>>>([]);
  const [validation, setValidation] = useState<BulkImportValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [acknowledgeAnomalies, setAcknowledgeAnomalies] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [expandedRowIdx, setExpandedRowIdx] = useState<number | null>(null);

  const runPreValidation = async (rowsToValidate: Array<Record<string, unknown>>) => {
    if (rowsToValidate.length === 0) {
      setValidation(null);
      return;
    }
    setValidating(true);
    try {
      const report = await validateBulkCalcImport(slug, rowsToValidate);
      setValidation(report);
      // Auto-expand first anomalous or blocked row so user immediately sees details
      const firstIssueRow = report.rows.find(
        (r) => r.error_count > 0 || r.warning_count > 0,
      );
      if (firstIssueRow) {
        setExpandedRowIdx(firstIssueRow.row_index);
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to pre-validate CSV rows",
      );
    } finally {
      setValidating(false);
    }
  };

  const handleCsvText = async (rawText: string, sourceLabel: string) => {
    const parsed = parseCalcBulkCsv(rawText, effectiveFields);
    if (parsed.mappedRecords.length === 0) {
      toast.error("CSV file contains no valid data rows.");
      return;
    }
    setFileName(sourceLabel);
    setStagedRows(parsed.mappedRecords);
    setAcknowledgeAnomalies(false);
    setOverrideReason("");
    await runPreValidation(parsed.mappedRecords);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await handleCsvText(text, file.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read CSV file");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleLoadSampleBatch = async () => {
    const sampleCsv = generateCalcBulkTemplateCsv(slug, effectiveFields);
    await handleCsvText(sampleCsv, `sample_${slug}_batch.csv`);
    toast.info("Loaded sample CSV batch with pre-validation anomaly checks");
  };

  const handleUpdateCell = (rowIndex0: number, fieldKey: string, rawVal: string, fieldType: LedgerField["type"]) => {
    setStagedRows((prev) => {
      const next = [...prev];
      const currentRow = { ...next[rowIndex0] };
      if (fieldType === "number") {
        const cleaned = rawVal.replace(/,/g, "");
        currentRow[fieldKey] =
          rawVal.trim() === ""
            ? ""
            : Number.isFinite(Number(cleaned))
              ? Number(cleaned)
              : rawVal;
      } else if (fieldType === "boolean") {
        currentRow[fieldKey] = rawVal === "true";
      } else {
        currentRow[fieldKey] = rawVal;
      }
      next[rowIndex0] = currentRow;
      return next;
    });
  };

  const handleRemoveRow = async (rowIndex0: number) => {
    const next = stagedRows.filter((_, i) => i !== rowIndex0);
    setStagedRows(next);
    if (next.length === 0) {
      setValidation(null);
      setFileName("");
      return;
    }
    await runPreValidation(next);
  };

  const handleCommit = async () => {
    if (stagedRows.length === 0) return;
    setCommitting(true);
    try {
      const outcome = await commitBulkCalcImport(slug, stagedRows, {
        acknowledge_anomalies: acknowledgeAnomalies,
        override_reason: overrideReason.trim() || undefined,
      });

      if (outcome.outcome !== "committed") {
        setValidation(outcome.validation);
        if (outcome.outcome === "blocked") {
          toast.error(outcome.error);
        } else {
          toast.warning(outcome.error);
        }
        return;
      }

      toast.success(
        `Committed ${outcome.imported_count} ${
          slug === "emission-factors" ? "emission factor(s)" : "activity record(s)"
        } to PostgreSQL & recalculated engine`,
      );
      onCommitted(outcome.view);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk import commit failed");
    } finally {
      setCommitting(false);
    }
  };

  // Pick up to 5 primary columns to display inline in the staging table
  const previewFields = effectiveFields.slice(0, 5);

  return (
    <div className="mb-4 rounded-md border border-primary/35 bg-background p-3.5 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileSpreadsheet className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold tracking-tight text-foreground">
              Bulk CSV Import &amp; Pre-Validation Workbench
              {engineTitle ? ` — ${engineTitle}` : ""}
            </h3>
            <p className="text-[10.5px] text-muted-foreground">
              Download the standardized CSV template, upload or stage rows, inspect historical anomalies, and commit verified data to PostgreSQL
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => downloadCalcBulkTemplateCsv(slug, effectiveFields)}
            className="h-7 px-2.5 text-[11px] gap-1"
          >
            <Download className="size-3.5" />
            Download CSV Template
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleLoadSampleBatch()}
            className="h-7 px-2.5 text-[11px] gap-1"
          >
            <Sparkles className="size-3.5 text-amber-500" />
            Load Sample Batch
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="h-7 px-2 text-[11px]"
          >
            <X className="size-3.5" />
            Close
          </Button>
        </div>
      </div>

      {/* Upload Dropzone / Controls */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border bg-muted/20 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5 text-xs">
          <Upload className="size-4 text-muted-foreground" />
          <div>
            <span className="font-medium text-foreground">
              {fileName
                ? `Loaded: ${fileName} (${stagedRows.length} rows staged)`
                : "Upload a populated CSV template file (.csv)"}
            </span>
            <p className="text-[10px] text-muted-foreground font-mono">
              Expected columns: {effectiveFields.map((f) => f.key).join(", ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 px-3 text-xs gap-1.5"
          >
            <Upload className="size-3.5" />
            Choose CSV File
          </Button>
          {stagedRows.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={validating}
              onClick={() => void runPreValidation(stagedRows)}
              className="h-7 px-2.5 text-xs"
            >
              {validating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Re-Validate Edited Rows
            </Button>
          )}
        </div>
      </div>

      {/* Pre-Validation Report & Interactive Staging Table */}
      {stagedRows.length > 0 && validation && (
        <div className="mt-3 space-y-3">
          {/* Summary Banner */}
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs",
              validation.status === "blocked"
                ? "border-destructive/50 bg-destructive/5 text-destructive"
                : validation.status === "warning"
                  ? "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300"
                  : "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300",
            )}
          >
            <div className="flex items-center gap-2">
              {validation.status === "blocked" ? (
                <ShieldAlert className="size-4 shrink-0 text-destructive" />
              ) : validation.status === "warning" ? (
                <AlertTriangle className="size-4 shrink-0 text-amber-500" />
              ) : (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              )}
              <div>
                <span className="font-semibold">
                  {validation.status === "blocked"
                    ? `Pre-Validation Blocked (${validation.error_rows} error row${validation.error_rows === 1 ? "" : "s"})`
                    : validation.status === "warning"
                      ? `Pre-Validation Flagged Historical Anomalies (${validation.warning_rows} anomalous row${validation.warning_rows === 1 ? "" : "s"})`
                      : `All ${validation.total_rows} Staged Rows Passed Pre-Validation`}
                </span>
                <span className="ml-2 font-mono text-[10.5px] opacity-85">
                  [{validation.valid_rows} valid · {validation.warning_rows} warnings · {validation.error_rows} errors]
                </span>
              </div>
            </div>

            <span className="font-mono text-[10px] text-muted-foreground">
              Click any cell below to fix typos or unit errors inline before committing
            </span>
          </div>

          {/* Row-by-Row Pre-Validation Table */}
          <div className="max-h-80 overflow-x-auto overflow-y-auto rounded-md border border-border bg-card">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <th className="py-2 pr-2 pl-3">Row</th>
                  <th className="px-2 py-2">Pre-Validation Status</th>
                  {previewFields.map((f) => (
                    <th key={f.key} className="px-2 py-2">
                      {f.label}
                    </th>
                  ))}
                  <th className="py-2 pr-3 pl-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {stagedRows.map((row, idx0) => {
                  const rowReport = validation.rows[idx0];
                  const rowStatus = rowReport?.status ?? "passed";
                  const rowIssues = rowReport?.issues ?? [];
                  const isExpanded = expandedRowIdx === idx0 + 1;

                  return (
                    <tr
                      key={`staged-row-${idx0}`}
                      className={cn(
                        "transition-colors",
                        rowStatus === "blocked"
                          ? "bg-destructive/[0.04]"
                          : rowStatus === "warning"
                            ? "bg-amber-500/[0.04]"
                            : "hover:bg-muted/20",
                      )}
                    >
                      <td className="py-1.5 pr-2 pl-3 font-mono font-semibold text-muted-foreground">
                        #{idx0 + 1}
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRowIdx((prev) =>
                              prev === idx0 + 1 ? null : idx0 + 1,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-left font-medium hover:underline"
                        >
                          {rowStatus === "blocked" ? (
                            <>
                              <ShieldAlert className="size-3.5 text-destructive" />
                              <span className="text-destructive font-semibold">
                                {rowReport?.error_count} Error(s)
                              </span>
                            </>
                          ) : rowStatus === "warning" ? (
                            <>
                              <AlertTriangle className="size-3.5 text-amber-500" />
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                {rowReport?.warning_count} Anomaly
                              </span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="size-3.5 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Verified
                              </span>
                            </>
                          )}
                        </button>
                        {rowIssues.length > 0 && (
                          <div className="mt-0.5 space-y-0.5 text-[10px] leading-tight">
                            {(isExpanded ? rowIssues : rowIssues.slice(0, 1)).map(
                              (iss) => (
                                <p
                                  key={iss.id}
                                  className={cn(
                                    "max-w-xs",
                                    iss.severity === "error"
                                      ? "text-destructive"
                                      : "text-amber-700 dark:text-amber-400",
                                  )}
                                >
                                  • {iss.message}
                                </p>
                              ),
                            )}
                          </div>
                        )}
                      </td>

                      {previewFields.map((f) => {
                        const cellVal = row[f.key];
                        const fieldIssue = rowIssues.find((i) => i.field === f.key);
                        const trend =
                          f.type === "number"
                            ? validation.field_trends?.[f.key]
                            : undefined;
                        const numVal =
                          f.type === "number" &&
                          cellVal !== "" &&
                          cellVal !== undefined &&
                          Number.isFinite(Number(cellVal))
                            ? Number(cellVal)
                            : null;

                        return (
                          <td key={f.key} className="px-2 py-1.5 align-middle">
                            <div className="flex items-center gap-1.5">
                              <Input
                                type={f.type === "number" ? "number" : "text"}
                                step="any"
                                value={String(cellVal ?? "")}
                                onChange={(e) =>
                                  handleUpdateCell(idx0, f.key, e.target.value, f.type)
                                }
                                onBlur={() => void runPreValidation(stagedRows)}
                                className={cn(
                                  "h-7 w-28 text-[11px] font-mono",
                                  fieldIssue?.severity === "error"
                                    ? "border-destructive bg-destructive/5"
                                    : fieldIssue?.severity === "warning"
                                      ? "border-amber-500 bg-amber-500/5"
                                      : "",
                                )}
                              />
                              {f.type === "number" && trend && (
                                <ValidationSparkline
                                  history={trend.history}
                                  currentValue={numVal}
                                  lowerBound={trend.lower_bound}
                                  upperBound={trend.upper_bound}
                                  mean={trend.mean}
                                  std={trend.std}
                                  fieldLabel={f.label}
                                  width={68}
                                  height={22}
                                  showBadge={false}
                                  compact
                                />
                              )}
                            </div>
                          </td>
                        );
                      })}

                      <td className="py-1.5 pr-3 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => void handleRemoveRow(idx0)}
                          title="Remove row from import batch"
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cumulative Batch Trend Impact */}
          {validation.batch_trend_comparisons.length > 0 && (
            <div className="rounded-md border border-border bg-muted/20 p-2.5">
              <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Projected Engine Totals After Batch Commit vs. Historical Trend
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {validation.batch_trend_comparisons.map((t) => (
                  <div
                    key={t.metric}
                    className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {t.metric}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        Projected: {t.current_value.toLocaleString("en-US")} {t.unit} (
                        {t.delta_pct >= 0 ? "+" : ""}
                        {t.delta_pct}%)
                      </div>
                    </div>
                    <ValidationSparkline
                      history={t.historical_series ?? [t.historical_mean, t.prev_run_value]}
                      currentValue={t.current_value}
                      lowerBound={t.lower_bound}
                      upperBound={t.upper_bound}
                      mean={t.historical_mean}
                      std={t.historical_std}
                      unit={t.unit}
                      fieldLabel={t.metric}
                      width={76}
                      height={24}
                      showBadge={false}
                      compact
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anomaly Acknowledgment & Commit Gate */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2.5">
            {validation.requires_acknowledgment ? (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledgeAnomalies}
                    onChange={(e) => setAcknowledgeAnomalies(e.target.checked)}
                  />
                  <span>
                    Acknowledge {validation.warning_rows} anomalous row(s) and authorize database commit
                  </span>
                </label>
                {acknowledgeAnomalies && (
                  <Input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Audit justification (e.g., Q2 turnaround flaring / lab assay update)"
                    className="h-7 w-72 text-xs"
                  />
                )}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {validation.error_rows > 0
                  ? "Resolve or remove rows with red errors above to enable database commit."
                  : "All staged rows verified against physical bounds and historical baselines."}
              </span>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setStagedRows([]);
                  setValidation(null);
                  setFileName("");
                }}
                className="h-8 px-3 text-xs"
              >
                Clear Batch
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  committing ||
                  validating ||
                  !validation.can_commit ||
                  (validation.requires_acknowledgment && !acknowledgeAnomalies)
                }
                onClick={() => void handleCommit()}
                className="h-8 px-4 text-xs gap-1.5"
              >
                {committing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                Commit {stagedRows.length} Row{stagedRows.length === 1 ? "" : "s"} to Database
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
