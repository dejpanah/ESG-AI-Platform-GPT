import {
  executeManualCalcRun,
  type CalcEngineSlug,
  type CalcEngineView,
  type CalcRunEntry,
  type CalcValidationReport,
} from "@/api/calc-engines";
import {
  exportCalculationHistoryToExcel,
  exportSingleRunToExcel,
} from "@/lib/calc-history-excel";
import { EmptyNote } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  History,
  Loader2,
  Play,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function formatTimestamp(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ms);
  }
}

function RunCard({
  run,
  expanded,
  onToggle,
  onExportSingle,
}: {
  run: CalcRunEntry;
  expanded: boolean;
  onToggle: () => void;
  onExportSingle: (run: CalcRunEntry) => void;
}) {
  const headline = run.outputs_snapshot[0];
  const configEntries = Object.entries(run.inputs_snapshot.config);

  return (
    <div className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/40",
          expanded && "bg-muted/50",
        )}
      >
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="flex items-center gap-1.5 font-mono font-semibold text-foreground">
            {expanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
            Run #{run.run_number}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExportSingle(run);
              }}
              title={`Export Run #${run.run_number} to Excel (.xlsx)`}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              <FileSpreadsheet className="size-3" />
            </button>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {formatTimestamp(run.timestamp)}
            </span>
          </div>
        </div>

        <div className="mt-1 pl-5 text-[10.5px] text-muted-foreground">
          <span>{run.trigger_label}</span>
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span>{run.inputs_snapshot.record_count} inputs</span>
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span>{run.actor}</span>
        </div>

        {run.note && (
          <p className="mt-1 pl-5 line-clamp-2 text-[11px] leading-snug text-foreground/90">
            {run.note}
          </p>
        )}

        {headline && (
          <div className="mt-1.5 pl-5 font-mono text-[10.5px] text-foreground tabular-nums">
            <span className="text-muted-foreground">{headline.label}: </span>
            <span className="font-semibold">
              {headline.value}
              {headline.unit ? ` ${headline.unit}` : ""}
            </span>
          </div>
        )}

        {run.validation_summary && (
          <div className="mt-1 pl-5 text-[10px] text-muted-foreground font-mono tabular-nums">
            {run.validation_summary.acknowledged_override ? (
              <span className="text-amber-700 dark:text-amber-400">
                Validation: Overridden ({run.validation_summary.warning_count} warnings)
              </span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">
                Validation: Passed ({run.validation_summary.checks_executed} checks)
              </span>
            )}
          </div>
        )}
      </button>

      {expanded && (
        <div className="space-y-2.5 bg-background/80 px-3 py-2.5 text-[10.5px]">
          {/* Parameters used */}
          {configEntries.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Parameters Used
              </p>
              <div className="divide-y divide-border/50 rounded border border-border/70 bg-card px-2">
                {configEntries.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-2 py-1 font-mono text-[10px]"
                  >
                    <span className="truncate text-muted-foreground">{k}</span>
                    <span className="shrink-0 font-medium text-foreground tabular-nums">
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scope inputs snapshot */}
          <div>
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Inputs Snapshot ({run.inputs_snapshot.entries.length} of{" "}
              {run.inputs_snapshot.record_count})
            </p>
            {run.inputs_snapshot.entries.length === 0 ? (
              <p className="text-muted-foreground">No activity rows recorded.</p>
            ) : (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-border/70 bg-card p-2">
                {run.inputs_snapshot.entries.map((item, idx) => (
                  <div
                    key={`${item.label}-${idx}`}
                    className="border-b border-border/40 pb-1 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] font-semibold tabular-nums">
                        {item.result}
                      </span>
                    </div>
                    <p className="truncate font-mono text-[9.5px] text-muted-foreground">
                      {item.inputs}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All KPI outputs from this run */}
          <div>
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Run Outputs
            </p>
            <div className="divide-y divide-border/50 rounded border border-border/70 bg-card px-2">
              {run.outputs_snapshot.map((kpi) => (
                <div
                  key={kpi.key}
                  className="flex items-center justify-between gap-2 py-1 text-[10px]"
                >
                  <span className="truncate text-muted-foreground">{kpi.label}</span>
                  <span className="shrink-0 font-mono font-semibold text-foreground tabular-nums">
                    {kpi.value}
                    {kpi.unit ? ` ${kpi.unit}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Offline Audit Trail Export */}
          <div className="flex items-center justify-between border-t border-border/60 pt-2">
            <span className="font-mono text-[9px] text-muted-foreground truncate max-w-[170px]">
              ID: {run.id}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onExportSingle(run)}
              className="h-6 px-2 text-[10px] gap-1 text-emerald-700 dark:text-emerald-400 border-emerald-600/30 hover:bg-emerald-500/10 shrink-0"
            >
              <FileSpreadsheet className="size-3" />
              Download Run Log (.xlsx)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CalculationHistorySidebar({
  slug,
  engineTitle,
  runs,
  validation,
  onRunExecuted,
  onValidationGateTriggered,
}: {
  slug: CalcEngineSlug;
  engineTitle?: string;
  runs: CalcRunEntry[];
  validation?: CalcValidationReport;
  onRunExecuted: (updated: CalcEngineView) => void;
  onValidationGateTriggered?: (report: CalcValidationReport) => void;
}) {
  const [search, setSearch] = useState("");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(
    () => runs[0]?.id ?? null,
  );
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [runNote, setRunNote] = useState("");
  const [acknowledgeAnomalies, setAcknowledgeAnomalies] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [gateReport, setGateReport] = useState<CalcValidationReport | null>(null);
  const [running, setRunning] = useState(false);

  const activeValidation =
    gateReport && gateReport.checked_at >= (validation?.checked_at ?? 0)
      ? gateReport
      : validation;

  const filteredRuns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter(
      (r) =>
        r.trigger_label.toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q) ||
        r.actor.toLowerCase().includes(q) ||
        `run #${r.run_number}`.includes(q) ||
        r.inputs_snapshot.entries.some(
          (e) =>
            e.label.toLowerCase().includes(q) ||
            e.inputs.toLowerCase().includes(q),
        ),
    );
  }, [runs, search]);

  const handleManualRun = async () => {
    setRunning(true);
    try {
      const outcome = await executeManualCalcRun(slug, {
        note: runNote.trim() || undefined,
        acknowledge_anomalies: acknowledgeAnomalies,
        override_reason: overrideReason.trim() || undefined,
      });

      if (outcome.outcome !== "executed") {
        setGateReport(outcome.validation);
        onValidationGateTriggered?.(outcome.validation);
        if (outcome.outcome === "blocked") {
          toast.error(outcome.error);
        } else {
          toast.warning(outcome.error);
        }
        return;
      }

      const updated = outcome.view;
      onRunExecuted(updated);
      setRunNote("");
      setOverrideReason("");
      setAcknowledgeAnomalies(false);
      setGateReport(null);
      setShowNoteInput(false);
      if (updated.calculation_history[0]) {
        setExpandedRunId(updated.calculation_history[0].id);
      }
      toast.success(
        `Saved Calculation Run #${updated.calculation_history[0]?.run_number ?? ""}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record run");
    } finally {
      setRunning(false);
    }
  };

  const handleExportAll = () => {
    if (runs.length === 0) {
      toast.info("No recorded calculation runs to export.");
      return;
    }
    const targetRuns = filteredRuns.length > 0 ? filteredRuns : runs;
    try {
      const ok = exportCalculationHistoryToExcel({
        slug,
        engineName: engineTitle,
        runs: targetRuns,
      });
      if (ok) {
        toast.success(
          `Exported ${targetRuns.length} calculation run${targetRuns.length === 1 ? "" : "s"} to Excel (.xlsx)`,
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to export calculation history",
      );
    }
  };

  const handleExportSingle = (run: CalcRunEntry) => {
    try {
      const ok = exportSingleRunToExcel({ slug, run });
      if (ok) {
        toast.success(`Exported Run #${run.run_number} audit log to Excel (.xlsx)`);
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to export calculation run",
      );
    }
  };

  return (
    <aside
      aria-label="Calculation History"
      className="flex max-h-[44dvh] w-full shrink-0 flex-col border-t border-border bg-card/50 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l xl:w-[348px]"
    >
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <History className="size-3.5 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-[12px] font-semibold tracking-tight">
              Calculation History
            </h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              disabled={runs.length === 0}
              onClick={handleExportAll}
              title={
                runs.length === 0
                  ? "No recorded runs to export"
                  : `Export calculation history (${runs.length} runs) to Excel (.xlsx)`
              }
              className="h-7 px-2 text-[11px] whitespace-nowrap shrink-0 text-emerald-700 dark:text-emerald-400 border-emerald-600/30 hover:bg-emerald-500/10 hover:text-emerald-800"
            >
              <FileSpreadsheet className="size-3.5" />
              <span>Export Excel</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={running}
              onClick={() => setShowNoteInput((v) => !v)}
              className="h-7 px-2.5 text-[11px] whitespace-nowrap shrink-0"
            >
              {running ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Play className="size-3" />
              )}
              Run Snapshot
            </Button>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10.5px] text-muted-foreground font-mono tabular-nums">
          <span>{runs.length} recorded runs</span>
          <span>Scope: {slug}</span>
        </div>

        {showNoteInput && (
          <div className="mt-2.5 space-y-2 rounded border border-border bg-background p-2.5">
            {activeValidation && (
              <div className="space-y-1.5 border-b border-border/70 pb-2 text-[10.5px]">
                <div className="flex items-center gap-1.5 font-semibold">
                  {activeValidation.status === "blocked" ? (
                    <>
                      <ShieldAlert className="size-3.5 shrink-0 text-destructive" />
                      <span className="text-destructive">
                        Blocked: {activeValidation.error_count} missing/invalid input
                        {activeValidation.error_count === 1 ? "" : "s"}
                      </span>
                    </>
                  ) : activeValidation.status === "warning" ? (
                    <>
                      <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span className="text-amber-700 dark:text-amber-400">
                        {activeValidation.warning_count} historical anomaly / rule warning
                        {activeValidation.warning_count === 1 ? "" : "s"}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-400">
                        Pre-run check passed ({activeValidation.checks_executed} checks)
                      </span>
                    </>
                  )}
                </div>

                {activeValidation.issues.slice(0, 3).map((iss) => (
                  <p
                    key={iss.id}
                    className="pl-5 text-[10px] leading-snug text-muted-foreground"
                  >
                    {iss.message}
                  </p>
                ))}

                {activeValidation.status === "warning" && (
                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-start gap-2 text-[10.5px] text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acknowledgeAnomalies}
                        onChange={(e) => setAcknowledgeAnomalies(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Acknowledge flagged historical anomalies and authorize run
                      </span>
                    </label>
                    {acknowledgeAnomalies && (
                      <Input
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Override justification (logged to audit trail)"
                        className="h-7 text-[10.5px]"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            <Input
              value={runNote}
              onChange={(e) => setRunNote(e.target.value)}
              placeholder="Optional checkpoint note (e.g., Q1 pre-audit freeze)"
              className="h-7 text-[11px]"
            />
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                disabled={
                  running ||
                  activeValidation?.status === "blocked" ||
                  (activeValidation?.status === "warning" && !acknowledgeAnomalies)
                }
                onClick={() => void handleManualRun()}
                className="h-6 px-2.5 text-[10.5px]"
              >
                {activeValidation?.status === "warning"
                  ? "Confirm & Execute Run"
                  : "Execute & Log Run"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowNoteInput(false);
                  setAcknowledgeAnomalies(false);
                }}
                className="h-6 px-2 text-[10.5px]"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="relative mt-2">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter runs, triggers, or inputs…"
            className="h-7 pl-6.5 text-[11px]"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredRuns.length === 0 ? (
          <div className="p-3">
            <EmptyNote>No calculation runs match your filter.</EmptyNote>
          </div>
        ) : (
          filteredRuns.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              expanded={expandedRunId === run.id}
              onToggle={() =>
                setExpandedRunId((prev) => (prev === run.id ? null : run.id))
              }
              onExportSingle={handleExportSingle}
            />
          ))
        )}
      </div>
    </aside>
  );
}
