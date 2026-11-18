import type { MaterialityWorkspaceState } from "@/api/materiality";
import { AppShell } from "@/components/AppShell";
import { Panel, Stat } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Compass,
  GitCompareArrows,
  History,
  RefreshCcw,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";

const MATERIALITY_TABS = [
  {
    to: "/materiality/double-materiality",
    label: "01. Double Materiality",
    shortDesc: "Inside-Out & Outside-In Matrix",
    icon: Compass,
  },
  {
    to: "/materiality/stakeholder-survey",
    label: "02. Stakeholder Survey & Weighting",
    shortDesc: "5-Group Input & Weight Tracking",
    icon: UsersRound,
  },
  {
    to: "/materiality/topic-mapping",
    label: "03. Topic-to-Standard Mapping",
    shortDesc: "ESRS · GRI · SASB · IPIECA",
    icon: GitCompareArrows,
  },
  {
    to: "/materiality/periodic-review",
    label: "04. Periodic Review & Rationale Log",
    shortDesc: "YoY Comparison & IRO-1 Audit",
    icon: History,
  },
] as const;

export function MaterialityShell({
  title,
  subtitle,
  frameworkBadge,
  state,
  loading,
  error,
  onReload,
  headerActions,
  children,
}: {
  title: string;
  subtitle: string;
  frameworkBadge: string;
  state: MaterialityWorkspaceState | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const doubleMaterialCount =
    state?.topics.filter((t) => t.classification === "Double Material")
      .length ?? 0;
  const impactOnlyCount =
    state?.topics.filter((t) => t.classification === "Impact Material Only")
      .length ?? 0;
  const financialOnlyCount =
    state?.topics.filter((t) => t.classification === "Financial Material Only")
      .length ?? 0;
  const nonMaterialCount =
    state?.topics.filter((t) => t.classification === "Not Material (Monitored)")
      .length ?? 0;
  const totalMaterialCount =
    doubleMaterialCount + impactOnlyCount + financialOnlyCount;

  const totalRespondents =
    state?.stakeholder_groups.reduce((acc, g) => acc + g.respondent_count, 0) ??
    0;

  return (
    <AppShell>
      {() => (
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] space-y-4 p-4 lg:p-6">
            {/* Top Workspace Header */}
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Materiality Assessment
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{frameworkBadge}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">
                    Cycle: {state?.active_cycle ?? "FY 2025 Active Cycle"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[var(--term-ok)]">
                    PostgreSQL Persisted
                  </span>
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {title}
                </h1>
                <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  {subtitle}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {headerActions}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onReload}
                  disabled={loading}
                  className="h-8 gap-1.5 text-xs whitespace-nowrap shrink-0"
                >
                  <RefreshCcw
                    className={cn("size-3.5", loading && "animate-spin")}
                  />
                  Refresh Ledger
                </Button>
              </div>
            </header>

            {/* Module Sub-Navigation Bar */}
            <nav
              aria-label="Materiality Assessment Modules"
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            >
              {MATERIALITY_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors",
                        isActive
                          ? "border-primary bg-primary/8 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      )
                    }
                  >
                    <Icon className="size-4 shrink-0 text-[var(--term-ok)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">
                        {tab.label}
                      </p>
                      <p className="term-dim truncate text-[10.5px]">
                        {tab.shortDesc}
                      </p>
                    </div>
                  </NavLink>
                );
              })}
            </nav>

            {/* Top KPI Summary Strip */}
            {state && (
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                <Stat
                  label="Material Topics (CSRD)"
                  value={`${totalMaterialCount} / ${state.topics.length}`}
                  hint={`${doubleMaterialCount} Double · ${impactOnlyCount} Impact · ${financialOnlyCount} Financial`}
                  tone="ok"
                />
                <Stat
                  label="Double Material Core"
                  value={`${doubleMaterialCount} Topics`}
                  hint={`Both Inside-Out ≥ ${state.impact_threshold.toFixed(1)} & Outside-In ≥ ${state.financial_threshold.toFixed(1)}`}
                  tone="info"
                />
                <Stat
                  label="Quantified Fin. Exposure"
                  value={`$${state.topics
                    .filter(
                      (t) => t.classification !== "Not Material (Monitored)",
                    )
                    .reduce(
                      (acc, t) => acc + t.estimated_financial_exposure_musd,
                      0,
                    )
                    .toFixed(1)}M`}
                  hint="Aggregate CSRD E1-9 / E3-5 transition & physical exposure"
                  tone="warn"
                />
                <Stat
                  label="Stakeholder Sample"
                  value={totalRespondents.toLocaleString()}
                  hint={`Across ${state.stakeholder_groups.length} weighted stakeholder groups`}
                  tone="ok"
                />
                <Stat
                  label="ESRS / GRI / SASB Links"
                  value={`${state.standard_mappings.reduce(
                    (acc, m) => acc + m.covered_datapoints_count,
                    0,
                  )} / ${state.standard_mappings.reduce(
                    (acc, m) => acc + m.mandatory_datapoints_count,
                    0,
                  )}`}
                  hint={`${nonMaterialCount} non-material topic(s) logged in IRO-1 rationale`}
                  tone="idle"
                />
              </div>
            )}

            {error ? (
              <Panel title="Database Connection Error">
                <p className="text-xs text-[var(--term-bad)]">{error}</p>
              </Panel>
            ) : loading && !state ? (
              <Panel title="Loading Materiality Assessment Ledger">
                <div className="space-y-2 py-4">
                  <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-32 w-full animate-pulse rounded bg-muted" />
                </div>
              </Panel>
            ) : (
              children
            )}
          </div>
        </main>
      )}
    </AppShell>
  );
}
