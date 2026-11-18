import {
  validateCalcInputs,
  type CalcEngineSlug,
  type CalcValidationReport,
  type ValidationCategory,
  type ValidationIssue,
} from "@/api/calc-engines";
import { ValidationSparkline } from "@/components/calc/ValidationSparkline";
import { EmptyNote, Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<ValidationCategory, string> = {
  missing_input: "Missing Input",
  invalid_value: "Invalid Value",
  historical_anomaly: "Historical Anomaly",
  domain_rule: "Domain Rule",
};

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const isError = issue.severity === "error";
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 text-[11.5px]">
          {isError ? (
            <ShieldAlert className="size-3.5 shrink-0 text-destructive" />
          ) : (
            <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <span
            className={cn(
              "font-semibold",
              isError
                ? "text-destructive"
                : "text-amber-700 dark:text-amber-400",
            )}
          >
            {isError ? "Blocking Error" : "Warning"}
          </span>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <span className="font-medium text-foreground">
            {CATEGORY_LABELS[issue.category]}
          </span>
          {issue.record_label && (
            <>
              <span className="text-muted-foreground" aria-hidden="true">·</span>
              <span className="text-muted-foreground">{issue.record_label}</span>
            </>
          )}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          Field: {issue.field}
          {issue.z_score !== undefined ? ` · ${issue.z_score >= 0 ? "+" : ""}${issue.z_score}σ` : ""}
        </span>
      </div>

      <p className="mt-1 pl-5 text-[11.5px] text-foreground">{issue.message}</p>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 pl-5 font-mono text-[10.5px] text-muted-foreground tabular-nums">
        {issue.observed_value && (
          <span>
            Observed: <strong className="text-foreground">{issue.observed_value}</strong>
          </span>
        )}
        {issue.expected_range && (
          <span>Expected: {issue.expected_range}</span>
        )}
        {issue.historical_baseline && (
          <span>Baseline: {issue.historical_baseline}</span>
        )}
      </div>

      <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
        Action: {issue.remediation}
      </p>
    </div>
  );
}

export function CalculationValidationPanel({
  slug,
  report,
  expanded,
  onToggleExpanded,
  onReportRefreshed,
}: {
  slug: CalcEngineSlug;
  report: CalcValidationReport;
  expanded: boolean;
  onToggleExpanded: () => void;
  onReportRefreshed: (fresh: CalcValidationReport) => void;
}) {
  const [checking, setChecking] = useState(false);

  const handleRecheck = async () => {
    setChecking(true);
    try {
      const fresh = await validateCalcInputs(slug);
      onReportRefreshed(fresh);
      if (fresh.status === "passed") {
        toast.success(
          `Validation passed (${fresh.checks_executed} checks, within historical bounds)`,
        );
      } else if (fresh.status === "blocked") {
        toast.error(
          `Validation blocked: ${fresh.error_count} missing or invalid inputs`,
        );
      } else {
        toast.warning(
          `Validation flagged ${fresh.warning_count} historical trend anomalies/warnings`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation check failed");
    } finally {
      setChecking(false);
    }
  };

  const statusText =
    report.status === "blocked"
      ? `Run Blocked (${report.error_count} error${report.error_count === 1 ? "" : "s"}, ${report.warning_count} warning${report.warning_count === 1 ? "" : "s"})`
      : report.status === "warning"
        ? `Anomalies Flagged (${report.warning_count} warning${report.warning_count === 1 ? "" : "s"} · Review Required)`
        : `Validation Passed (${report.checks_passed}/${report.checks_executed} checks)`;

  const sortedIssues = [...report.issues].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
  );

  return (
    <Panel
      title="Pre-Run Data Validation & Historical Trend Check"
      description={`Analyzed ${report.historical_runs_analyzed} historical periods for completeness, physical bounds, and statistical anomalies`}
      actions={
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={checking}
            onClick={() => void handleRecheck()}
            className="h-7 px-2.5 text-[11px] whitespace-nowrap shrink-0"
          >
            <RefreshCw className={cn("size-3", checking && "animate-spin")} />
            Re-validate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleExpanded}
            className="h-7 px-2.5 text-[11px] whitespace-nowrap shrink-0"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {expanded ? "Hide Details" : "Inspect Details"}
          </Button>
        </div>
      }
    >
      {/* Compact single-row status summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
        <div className="flex items-center gap-2">
          {report.status === "blocked" ? (
            <ShieldAlert className="size-4 shrink-0 text-destructive" />
          ) : report.status === "warning" ? (
            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <span
            className={cn(
              "font-semibold",
              report.status === "blocked"
                ? "text-destructive"
                : report.status === "warning"
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-emerald-700 dark:text-emerald-400",
            )}
          >
            {statusText}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-muted-foreground tabular-nums">
          <span>{report.checks_executed} checks</span>
          <span aria-hidden="true">·</span>
          <span>{report.trend_comparisons.length} trend baselines</span>
          <span aria-hidden="true">·</span>
          <span>
            Last checked{" "}
            {new Date(report.checked_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-4 border-t border-border/70 pt-3">
          {/* Historical Trend Baseline Comparison */}
          <div>
            <p className="mb-2 text-[11px] font-semibold text-foreground">
              Historical Trend Baseline Comparison
            </p>
            {report.trend_comparisons.length === 0 ? (
              <EmptyNote>No trend metrics configured for this engine.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                      <th className="py-1.5 pr-2 text-left font-medium">Metric</th>
                      <th className="px-2 py-1.5 text-center font-medium">Trend Sparkline</th>
                      <th className="px-2 py-1.5 text-right font-medium">Current Input</th>
                      <th className="px-2 py-1.5 text-right font-medium">Hist. Mean (±σ)</th>
                      <th className="px-2 py-1.5 text-right font-medium">Expected Band</th>
                      <th className="px-2 py-1.5 text-right font-medium">Delta</th>
                      <th className="px-2 py-1.5 text-right font-medium">Z-Score</th>
                      <th className="py-1.5 pl-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {report.trend_comparisons.map((t) => (
                      <tr key={t.metric} className="hover:bg-muted/30">
                        <td className="py-1.5 pr-2 font-medium text-foreground">
                          {t.metric}{" "}
                          <span className="text-[10px] text-muted-foreground">
                            ({t.unit})
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <ValidationSparkline
                            history={
                              t.historical_series && t.historical_series.length > 0
                                ? t.historical_series
                                : [
                                    t.historical_mean * 0.96,
                                    t.historical_mean * 1.02,
                                    t.historical_mean * 0.98,
                                    t.prev_run_value,
                                  ]
                            }
                            currentValue={t.current_value}
                            lowerBound={t.lower_bound}
                            upperBound={t.upper_bound}
                            mean={t.historical_mean}
                            std={t.historical_std}
                            unit={t.unit}
                            fieldLabel={t.metric}
                            width={90}
                            height={24}
                            showBadge={false}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums">
                          {t.current_value.toLocaleString("en-US")}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                          {t.historical_mean.toLocaleString("en-US")} ±{" "}
                          {t.historical_std.toLocaleString("en-US")}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-muted-foreground tabular-nums">
                          {t.lower_bound.toLocaleString("en-US")} –{" "}
                          {t.upper_bound.toLocaleString("en-US")}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right font-mono tabular-nums",
                            t.status !== "normal"
                              ? "font-semibold text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {t.delta_pct >= 0 ? "+" : ""}
                          {t.delta_pct}%
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right font-mono tabular-nums",
                            t.status === "critical"
                              ? "font-semibold text-destructive"
                              : t.status === "anomalous"
                                ? "font-semibold text-amber-700 dark:text-amber-400"
                                : "text-muted-foreground",
                          )}
                        >
                          {t.z_score >= 0 ? "+" : ""}
                          {t.z_score}σ
                        </td>
                        <td className="py-1.5 pl-2 text-right font-medium">
                          <span
                            className={cn(
                              t.status === "critical"
                                ? "text-destructive"
                                : t.status === "anomalous"
                                  ? "text-amber-700 dark:text-amber-400"
                                  : "text-emerald-700 dark:text-emerald-400",
                            )}
                          >
                            {t.status === "critical"
                              ? "Outlier"
                              : t.status === "anomalous"
                                ? "Anomalous"
                                : "Normal"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Validation Findings List */}
          <div className="border-t border-border/70 pt-3">
            <p className="mb-2 text-[11px] font-semibold text-foreground">
              Input Completeness &amp; Anomaly Findings ({sortedIssues.length})
            </p>
            {sortedIssues.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No missing fields, out-of-range values, or historical trend anomalies detected. Calculation run is cleared to proceed.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {sortedIssues.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
