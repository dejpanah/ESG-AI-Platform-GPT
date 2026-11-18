import { AppShell } from "@/components/AppShell";
import { PageBody, PageHeader, Workspace } from "@/components/system/layout";
import { EmptyNote, Panel, Stat } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import {
  exportCalcReport,
  type CalcChartPoint,
  type CalcEngineView,
  type CalcValidationReport,
} from "@/api/calc-engines";
import {
  CalcEngineRefreshContext,
  CalcEngineSlugContext,
} from "@/components/calc/CalcEngineContext";
import { CalculationHistorySidebar } from "@/components/calc/CalculationHistorySidebar";
import { CalculationValidationPanel } from "@/components/calc/CalculationValidationPanel";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

function formatShortLabel(name: string): string {
  if (name.length <= 20) return name;
  return `${name.slice(0, 18)}…`;
}

function downloadRecordsCsv(view: CalcEngineView) {
  if (!view.records.length) {
    toast.error("No records available to export");
    return;
  }
  const hiddenKeys = new Set(["id", "created_at", "updated_at", "versions", "history", "pending_revision", "sample_inputs"]);
  const cols = Array.from(
    new Set(
      view.records.flatMap((row) =>
        Object.keys(row).filter((k) => !hiddenKeys.has(k)),
      ),
    ),
  );
  const escapeCell = (val: unknown) => {
    const s = Array.isArray(val) ? val.join("; ") : String(val ?? "");
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [
    cols.join(","),
    ...view.records.map((r) => cols.map((c) => escapeCell(r[c])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${view.slug}-calculation-ledger.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${view.records.length} rows to CSV`);
}

function EngineChart({
  title,
  unit,
  series,
  primaryLabel = "Calculated Value",
  secondaryLabel = "Comparison",
  limitLabel = "Limit / Benchmark",
}: {
  title: string;
  unit: string;
  series: CalcChartPoint[];
  primaryLabel?: string;
  secondaryLabel?: string;
  limitLabel?: string;
}) {
  const hasSecondary = series.some((d) => d.secondary !== undefined);
  const hasLimit = series.some((d) => d.limit !== undefined);

  return (
    <Panel title={title} description={`Unit: ${unit}`}>
      {series.length === 0 ? (
        <EmptyNote>No chart data recorded yet.</EmptyNote>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              margin={{ top: 8, right: 16, left: 4, bottom: 24 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tickFormatter={formatShortLabel}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                interval={0}
                angle={series.length > 6 ? -20 : 0}
                textAnchor={series.length > 6 ? "end" : "middle"}
                height={series.length > 6 ? 52 : 28}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                width={56}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
              />
              {(hasSecondary || hasLimit) && (
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
              )}
              <Bar
                dataKey="primary"
                name={primaryLabel}
                fill="var(--chart-1)"
                radius={[3, 3, 0, 0]}
              />
              {hasSecondary && (
                <Bar
                  dataKey="secondary"
                  name={secondaryLabel}
                  fill="var(--chart-3)"
                  radius={[3, 3, 0, 0]}
                />
              )}
              {hasLimit && (
                <Bar
                  dataKey="limit"
                  name={limitLabel}
                  fill="var(--chart-2)"
                  radius={[3, 3, 0, 0]}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

export function CalculationEngineShell({
  view,
  loading,
  error,
  onReload,
  onUpdateView,
  chartPrimaryLabel,
  chartSecondaryLabel,
  chartLimitLabel,
  headerActions,
  controlsSlot,
  children,
}: {
  view: CalcEngineView | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onUpdateView?: (updated: CalcEngineView) => void;
  chartPrimaryLabel?: string;
  chartSecondaryLabel?: string;
  chartLimitLabel?: string;
  headerActions?: ReactNode;
  controlsSlot?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [exportingReport, setExportingReport] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [localValidation, setLocalValidation] =
    useState<CalcValidationReport | null>(null);
  const [validationToggle, setValidationToggle] = useState<{
    slug: string;
    expanded: boolean;
  } | null>(null);

  const activeValidation =
    localValidation &&
    localValidation.slug === view?.slug &&
    localValidation.checked_at >= (view?.validation?.checked_at ?? 0)
      ? localValidation
      : view?.validation;

  const isValidationExpanded =
    view && validationToggle?.slug === view.slug
      ? validationToggle.expanded
      : activeValidation
        ? activeValidation.status !== "passed"
        : false;

  const handlePublishReport = async () => {
    if (!view) return;
    setExportingReport(true);
    try {
      const created = await exportCalcReport(view.slug);
      toast.success(`Published "${created.title}" to ESG Reports`, {
        action: {
          label: "View Report",
          onClick: () => navigate("/reports"),
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to publish report");
    } finally {
      setExportingReport(false);
    }
  };

  return (
    <AppShell>
      {() => (
        <Workspace>
          <PageHeader
            title={
              view
                ? `${view.number}. ${view.title}`
                : "Calculation Engine"
            }
            description={view?.subtitle}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {headerActions}
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs whitespace-nowrap shrink-0"
                disabled={!view || view.records.length === 0}
                onClick={() => view && downloadRecordsCsv(view)}
              >
                <Download className="size-3.5" />
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs whitespace-nowrap shrink-0"
                disabled={!view || exportingReport}
                onClick={() => void handlePublishReport()}
              >
                {exportingReport ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileCheck2 className="size-3.5" />
                )}
                Publish ESG Report
              </Button>
              {activeValidation && (
                <Button
                  size="sm"
                  variant={
                    activeValidation.status === "blocked"
                      ? "destructive"
                      : isValidationExpanded
                        ? "secondary"
                        : "outline"
                  }
                  className="h-8 px-3 text-xs whitespace-nowrap shrink-0"
                  onClick={() =>
                    view &&
                    setValidationToggle({
                      slug: view.slug,
                      expanded: !isValidationExpanded,
                    })
                  }
                >
                  {activeValidation.status === "blocked" ? (
                    <ShieldAlert className="size-3.5" />
                  ) : activeValidation.status === "warning" ? (
                    <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  )}
                  {activeValidation.status === "blocked"
                    ? `Blocked (${activeValidation.error_count})`
                    : activeValidation.status === "warning"
                      ? `Anomalies (${activeValidation.warning_count})`
                      : "Validated"}
                </Button>
              )}
              <Button
                size="sm"
                variant={showHistory ? "secondary" : "outline"}
                className="h-8 px-3 text-xs whitespace-nowrap shrink-0"
                onClick={() => setShowHistory((v) => !v)}
              >
                <History className="size-3.5" />
                History ({view?.calculation_history?.length ?? 0})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2.5 text-xs whitespace-nowrap shrink-0"
                onClick={onReload}
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </PageHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <PageBody maxWidth="max-w-6xl">
            {error ? (
              <Panel title="Backend Connection Issue">
                <EmptyNote>{error}</EmptyNote>
              </Panel>
            ) : loading && !view ? (
              <Panel title="Loading Calculation Engine">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading active calculation ledger and parameters…
                </div>
              </Panel>
            ) : view ? (
              <div className="space-y-4">
                {/* Methodology Strip — plain unboxed metadata */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2 text-[11px] text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">Standard:</span>
                    <span>{view.standard_ref}</span>
                  </div>
                  <span className="max-w-xl truncate" title={view.methodology}>
                    {view.methodology}
                  </span>
                </div>

                {/* KPI Strip */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {view.kpis.map((kpi) => (
                    <Stat
                      key={kpi.key}
                      label={kpi.label}
                      value={kpi.value}
                      hint={
                        [kpi.unit, kpi.hint].filter(Boolean).join(" · ") || undefined
                      }
                      tone={kpi.tone ?? "idle"}
                    />
                  ))}
                </div>

                {/* Data Validation & Historical Trend Check */}
                {activeValidation && (
                  <CalculationValidationPanel
                    slug={view.slug}
                    report={activeValidation}
                    expanded={isValidationExpanded}
                    onToggleExpanded={() =>
                      setValidationToggle({
                        slug: view.slug,
                        expanded: !isValidationExpanded,
                      })
                    }
                    onReportRefreshed={(fresh) => setLocalValidation(fresh)}
                  />
                )}

                {/* Specialized Engine Controls */}
                {controlsSlot}

                {/* Charts */}
                <div
                  className={
                    view.charts.secondary_series
                      ? "grid gap-4 lg:grid-cols-2"
                      : "grid gap-4"
                  }
                >
                  <EngineChart
                    title={view.charts.primary_title}
                    unit={view.charts.primary_unit}
                    series={view.charts.primary_series}
                    primaryLabel={chartPrimaryLabel}
                    secondaryLabel={chartSecondaryLabel}
                    limitLabel={chartLimitLabel}
                  />
                  {view.charts.secondary_series && (
                    <EngineChart
                      title={view.charts.secondary_title || "Breakdown"}
                      unit={view.charts.secondary_unit || view.charts.primary_unit}
                      series={view.charts.secondary_series}
                      primaryLabel="Measured"
                      limitLabel="Permit Limit"
                    />
                  )}
                </div>

                {/* Domain-specific workbench & ledger */}
                <CalcEngineSlugContext.Provider value={view.slug}>
                  <CalcEngineRefreshContext.Provider
                    value={{
                      onReload,
                      onUpdateView: (updated) => {
                        setLocalValidation(updated.validation ?? null);
                        if (onUpdateView) {
                          onUpdateView(updated);
                        } else {
                          onReload();
                        }
                      },
                    }}
                  >
                    {children}
                  </CalcEngineRefreshContext.Provider>
                </CalcEngineSlugContext.Provider>

                {/* Audit Log */}
                <Panel
                  title="Calculation Audit Trail"
                  description="Chronological log of parameter updates, factor selections, and ledger revisions"
                >
                  {view.audit_log.length === 0 ? (
                    <EmptyNote>No audit entries recorded yet.</EmptyNote>
                  ) : (
                    <div className="divide-y divide-border/70">
                      {view.audit_log.slice(0, 8).map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-[11px]"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-foreground">
                              {entry.action}
                            </span>
                            <span className="mx-2 text-muted-foreground">·</span>
                            <span className="text-muted-foreground">
                              {entry.detail}
                            </span>
                          </div>
                          <div className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                            {entry.actor} · {new Date(entry.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            ) : null}
            </PageBody>

            {showHistory && view && (
              <CalculationHistorySidebar
                key={view.slug}
                slug={view.slug}
                engineTitle={view.title}
                runs={view.calculation_history ?? []}
                validation={activeValidation}
                onRunExecuted={(updated) => {
                  setLocalValidation(updated.validation ?? null);
                  if (onUpdateView) {
                    onUpdateView(updated);
                  } else {
                    onReload();
                  }
                }}
                onValidationGateTriggered={(report) => {
                  setLocalValidation(report);
                  setValidationToggle({ slug: report.slug, expanded: true });
                }}
              />
            )}
          </div>
        </Workspace>
      )}
    </AppShell>
  );
}
