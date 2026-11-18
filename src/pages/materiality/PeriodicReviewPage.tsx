import {
  createMaterialityRationale,
  createPeriodicCycleSnapshot,
  type MaterialityRationaleEntry,
} from "@/api/materiality";
import { MaterialityShell } from "@/components/materiality/MaterialityShell";
import { EmptyNote, Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMateriality } from "@/hooks/use-materiality";
import { cn } from "@/lib/utils";
import { Camera, FileCheck2, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
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

export default function PeriodicReviewPage() {
  const { state, setState, loading, error, reload } = useMateriality();

  const [baseCycleId, setBaseCycleId] = useState<string>("cycle-2023");
  const [targetCycleId, setTargetCycleId] = useState<string>("cycle-2025");
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const [showRationaleForm, setShowRationaleForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Snapshot form state
  const [snapLabel, setSnapLabel] = useState("FY 2025 Q2 Board Review Snapshot");
  const [snapDate, setSnapDate] = useState("2025-05-15");
  const [snapFramework, setSnapFramework] = useState(
    "ESRS Set 1 (EFRAG IG 1 Double Materiality)",
  );
  const [snapApprover, setSnapApprover] = useState(
    "Board Sustainability & Audit Committee",
  );
  const [snapNote, setSnapNote] = useState("");

  // Rationale form state
  const [ratTopicId, setRatTopicId] = useState("topic-e1-ghg");
  const [ratDecisionType, setRatDecisionType] =
    useState<MaterialityRationaleEntry["decision_type"]>(
      "Double Material Inclusion",
    );
  const [ratReference, setRatReference] = useState("ESRS 2 IRO-1 §53 · ESRS E1");
  const [ratStatement, setRatStatement] = useState("");
  const [ratEvidence, setRatEvidence] = useState(
    "ISO 14064 Verification Dossier & Stakeholder Survey Consensus",
  );
  const [ratAuthor, setRatAuthor] = useState(
    "Dr. Z. Zerehsaz (Lead ESG Architect)",
  );
  const [ratSignoff, setRatSignoff] = useState(
    "Audit & Risk Committee — Approved",
  );

  const baseCycle = useMemo(
    () =>
      state?.periodic_cycles.find((c) => c.id === baseCycleId) ??
      state?.periodic_cycles[0] ??
      null,
    [state, baseCycleId],
  );

  const targetCycle = useMemo(
    () =>
      state?.periodic_cycles.find((c) => c.id === targetCycleId) ??
      state?.periodic_cycles[state.periodic_cycles.length - 1] ??
      null,
    [state, targetCycleId],
  );

  const yoyRows = useMemo(() => {
    if (!state) return [];
    const baseMap = new Map(
      (baseCycle?.points ?? []).map((p) => [p.topic_id, p]),
    );
    const targetMap = new Map(
      (targetCycle?.points ?? []).map((p) => [p.topic_id, p]),
    );

    return state.topics.map((t) => {
      const bPt = baseMap.get(t.id);
      const tPt = targetMap.get(t.id);
      const baseImp = bPt?.impact_score ?? t.impact_score;
      const baseFin = bPt?.financial_score ?? t.financial_score;
      const currImp = tPt?.impact_score ?? t.impact_score;
      const currFin = tPt?.financial_score ?? t.financial_score;
      const baseClass = bPt?.classification ?? t.classification;
      const currClass = tPt?.classification ?? t.classification;

      const deltaImp = Math.round((currImp - baseImp) * 100) / 100;
      const deltaFin = Math.round((currFin - baseFin) * 100) / 100;

      let shiftLabel = "Consistent";
      if (baseClass !== currClass) {
        if (currClass === "Double Material") {
          shiftLabel = "Escalated to Double Material";
        } else if (baseClass === "Not Material (Monitored)") {
          shiftLabel = "Newly Material";
        } else {
          shiftLabel = "Reclassified";
        }
      } else if (Math.abs(deltaImp) >= 0.3 || Math.abs(deltaFin) >= 0.3) {
        shiftLabel =
          deltaImp + deltaFin > 0 ? "Score Elevated" : "Score Moderated";
      }

      return {
        topic_id: t.id,
        code: t.code,
        shortCode: t.code.replace("ESRS-", ""),
        name: t.name,
        pillar: t.pillar,
        baseImp,
        baseFin,
        currImp,
        currFin,
        deltaImp,
        deltaFin,
        baseClass,
        currClass,
        shiftLabel,
      };
    });
  }, [state, baseCycle, targetCycle]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapLabel.trim()) {
      toast.error("Snapshot cycle label is required");
      return;
    }
    setSaving(true);
    try {
      const updated = await createPeriodicCycleSnapshot({
        cycle_label: snapLabel.trim(),
        review_date: snapDate,
        framework_version: snapFramework.trim(),
        approved_by: snapApprover.trim(),
        summary_note:
          snapNote.trim() ||
          "Dated materiality matrix snapshot captured for statutory CSRD audit trail.",
      });
      setState(updated);
      setShowSnapshotForm(false);
      setSnapNote("");
      const newest = updated.periodic_cycles[updated.periodic_cycles.length - 1];
      if (newest) setTargetCycleId(newest.id);
      toast.success(
        "Dated materiality matrix snapshot saved to PostgreSQL",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create snapshot",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRationale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratStatement.trim()) {
      toast.error("Please enter a formal rationale statement");
      return;
    }
    setSaving(true);
    try {
      const updated = await createMaterialityRationale({
        cycle_label: targetCycle?.cycle_label ?? state?.active_cycle,
        topic_id: ratTopicId,
        decision_type: ratDecisionType,
        esrs_iro_reference: ratReference.trim(),
        rationale_statement: ratStatement.trim(),
        evidence_references: ratEvidence.trim(),
        recorded_by: ratAuthor.trim(),
        reviewer_signoff: ratSignoff.trim(),
      });
      setState(updated);
      setShowRationaleForm(false);
      setRatStatement("");
      toast.success(
        "CSRD / ESRS 2 IRO-1 rationale recorded & persisted to PostgreSQL",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to record rationale",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <MaterialityShell
      title="Periodic Review, YoY Comparison & Rationale Log"
      subtitle="Compare dated materiality matrices year-over-year, freeze board-approved review snapshots, and maintain the mandatory ESRS 2 IRO-1 recorded rationale and exclusion audit log."
      frameworkBadge="ESRS 2 IRO-1 §53–59 · Annual Materiality Review"
      state={state}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={showSnapshotForm ? "secondary" : "outline"}
            onClick={() => {
              setShowSnapshotForm((v) => !v);
              if (!showSnapshotForm) setShowRationaleForm(false);
            }}
            className="h-8 gap-1.5 text-xs whitespace-nowrap shrink-0"
          >
            {showSnapshotForm ? (
              <X className="size-3.5" />
            ) : (
              <Camera className="size-3.5" />
            )}
            {showSnapshotForm ? "Close Snapshot" : "Freeze Dated Snapshot"}
          </Button>
          <Button
            size="sm"
            variant={showRationaleForm ? "secondary" : "default"}
            onClick={() => {
              setShowRationaleForm((v) => !v);
              if (!showRationaleForm) setShowSnapshotForm(false);
            }}
            className="h-8 gap-1.5 text-xs whitespace-nowrap shrink-0"
          >
            {showRationaleForm ? (
              <X className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {showRationaleForm
              ? "Close Rationale Form"
              : "Record IRO-1 Rationale"}
          </Button>
        </div>
      }
    >
      {/* Freeze Dated Matrix Snapshot Form */}
      {showSnapshotForm && (
        <Panel
          title="Capture Dated Materiality Matrix Snapshot"
          description="Freeze the current Inside-Out and Outside-In topic scores into a dated cycle for year-over-year comparison and external assurance"
        >
          <form
            onSubmit={(e) => void handleCreateSnapshot(e)}
            className="space-y-3"
          >
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                placeholder="Cycle Label (e.g., FY 2025 Q2 Board Sign-off)"
                value={snapLabel}
                onChange={(e) => setSnapLabel(e.target.value)}
                required
                className="h-8 text-xs"
              />
              <Input
                type="date"
                value={snapDate}
                onChange={(e) => setSnapDate(e.target.value)}
                required
                className="h-8 font-mono text-xs"
              />
              <Input
                placeholder="Framework Version"
                value={snapFramework}
                onChange={(e) => setSnapFramework(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Approving Body"
                value={snapApprover}
                onChange={(e) => setSnapApprover(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Summary note of methodology or regulatory changes in this review cycle..."
                value={snapNote}
                onChange={(e) => setSnapNote(e.target.value)}
                className="h-8 flex-1 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="h-8 gap-1.5 text-xs whitespace-nowrap"
              >
                <Camera className="size-3.5" />
                Save Dated Cycle Snapshot
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {/* Record New CSRD IRO-1 Rationale Form */}
      {showRationaleForm && state && (
        <Panel
          title="Record Formal CSRD / ESRS 2 IRO-1 Materiality Rationale"
          description="Document why a topic is included, escalated year-over-year, or excluded below the materiality threshold per ESRS 2 IRO-1 §53–56"
        >
          <form
            onSubmit={(e) => void handleCreateRationale(e)}
            className="space-y-3"
          >
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Sustainability Topic
                </label>
                <select
                  value={ratTopicId}
                  onChange={(e) => setRatTopicId(e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  {state.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name} ({t.classification})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Decision Classification
                </label>
                <select
                  value={ratDecisionType}
                  onChange={(e) =>
                    setRatDecisionType(
                      e.target
                        .value as MaterialityRationaleEntry["decision_type"],
                    )
                  }
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="Double Material Inclusion">
                    Double Material Inclusion
                  </option>
                  <option value="Impact-Only Inclusion">
                    Impact-Only Inclusion
                  </option>
                  <option value="Financial-Only Inclusion">
                    Financial-Only Inclusion
                  </option>
                  <option value="Threshold Exclusion Rationale">
                    Threshold Exclusion Rationale
                  </option>
                  <option value="YoY Score Escalation">
                    YoY Score Escalation
                  </option>
                  <option value="Methodology & Weighting Update">
                    Methodology & Weighting Update
                  </option>
                </select>
              </div>

              <div>
                <label className="term-dim block text-[10px] uppercase">
                  ESRS 2 IRO-1 Reference
                </label>
                <Input
                  value={ratReference}
                  onChange={(e) => setRatReference(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>

              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Evidence Dossier Reference
                </label>
                <Input
                  value={ratEvidence}
                  onChange={(e) => setRatEvidence(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <Input
                placeholder="Recorded By (Author & Title)"
                value={ratAuthor}
                onChange={(e) => setRatAuthor(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Assurance / Committee Sign-Off Status"
                value={ratSignoff}
                onChange={(e) => setRatSignoff(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Formal recorded rationale statement (threshold justification, stakeholder evidence, or exclusion explanation)..."
                value={ratStatement}
                onChange={(e) => setRatStatement(e.target.value)}
                required
                className="h-8 flex-1 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="h-8 gap-1.5 text-xs whitespace-nowrap"
              >
                <FileCheck2 className="size-3.5" />
                Commit Rationale to Audit Log
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {/* Cycle Selector & YoY Trajectory Chart */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Panel
          title="Dated Review Cycles & Comparison Selector"
          description="Select any two dated materiality cycles to inspect year-over-year score movements and classification changes"
        >
          <div className="space-y-3 text-xs">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Baseline / Prior Cycle
                </label>
                <select
                  value={baseCycleId}
                  onChange={(e) => setBaseCycleId(e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  {(state?.periodic_cycles ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cycle_label} ({c.review_date})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Target / Active Cycle
                </label>
                <select
                  value={targetCycleId}
                  onChange={(e) => setTargetCycleId(e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  {(state?.periodic_cycles ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cycle_label} ({c.review_date})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divide-y divide-border/60 rounded-md border border-border bg-background px-3 py-1">
              {(state?.periodic_cycles ?? []).map((c) => (
                <div key={c.id} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {c.cycle_label}
                    </span>
                    <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                      {c.review_date} · {c.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.summary_note}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>{c.framework_version}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Cut-offs: Imp ≥ {c.impact_threshold.toFixed(1)} / Fin ≥{" "}
                      {c.financial_threshold.toFixed(1)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{c.approved_by}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title={`Year-over-Year Trajectory: ${baseCycle?.cycle_label ?? "Baseline"} vs. ${targetCycle?.cycle_label ?? "Active"}`}
          description="Comparison of Inside-Out Impact and Outside-In Financial scores across reporting periods"
        >
          <div className="h-[345px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={yoyRows}
                margin={{ top: 12, right: 16, bottom: 20, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.16)"
                />
                <XAxis
                  dataKey="shortCode"
                  tick={{ fontSize: 10.5, fill: "#94a3b8" }}
                />
                <YAxis
                  domain={[0, 5]}
                  tickCount={6}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                    fontSize: "11.5px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar
                  dataKey="baseImp"
                  name={`${baseCycle?.cycle_label ?? "Prior"} Impact`}
                  fill="#64748b"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="currImp"
                  name={`${targetCycle?.cycle_label ?? "Active"} Impact`}
                  fill="#10b981"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="baseFin"
                  name={`${baseCycle?.cycle_label ?? "Prior"} Financial`}
                  fill="#475569"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="currFin"
                  name={`${targetCycle?.cycle_label ?? "Active"} Financial`}
                  fill="#f59e0b"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Year-over-Year Materiality Matrix Comparison Table */}
      <Panel
        title="Year-over-Year (YoY) Materiality Matrix Shift Ledger"
        description={`Detailed topic-by-topic variance between ${baseCycle?.cycle_label ?? "Baseline"} and ${targetCycle?.cycle_label ?? "Active Cycle"}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                <th className="px-2.5 py-2 text-left">Topic</th>
                <th className="px-2.5 py-2 text-right">
                  Prior (Imp / Fin)
                </th>
                <th className="px-2.5 py-2 text-right">
                  Active (Imp / Fin)
                </th>
                <th className="px-2.5 py-2 text-right">YoY Δ Impact</th>
                <th className="px-2.5 py-2 text-right">YoY Δ Financial</th>
                <th className="px-2.5 py-2 text-left">Prior Status</th>
                <th className="px-2.5 py-2 text-left">Active Status</th>
                <th className="px-2.5 py-2 text-left">YoY Trajectory</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {yoyRows.map((r) => (
                <tr key={r.topic_id} className="hover:bg-muted/30">
                  <td className="px-2.5 py-2">
                    <span className="font-mono text-[11px] font-semibold">
                      {r.code}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span className="font-medium text-foreground">
                      {r.name}
                    </span>
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono text-muted-foreground tabular-nums">
                    {r.baseImp.toFixed(2)} / {r.baseFin.toFixed(2)}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono font-semibold text-foreground tabular-nums">
                    {r.currImp.toFixed(2)} / {r.currFin.toFixed(2)}
                  </td>
                  <td
                    className={cn(
                      "px-2.5 py-2 text-right font-mono tabular-nums",
                      r.deltaImp > 0 && "text-emerald-400",
                      r.deltaImp < 0 && "text-amber-400",
                      r.deltaImp === 0 && "text-muted-foreground",
                    )}
                  >
                    {r.deltaImp > 0 ? `+${r.deltaImp.toFixed(2)}` : r.deltaImp.toFixed(2)}
                  </td>
                  <td
                    className={cn(
                      "px-2.5 py-2 text-right font-mono tabular-nums",
                      r.deltaFin > 0 && "text-amber-400",
                      r.deltaFin < 0 && "text-blue-400",
                      r.deltaFin === 0 && "text-muted-foreground",
                    )}
                  >
                    {r.deltaFin > 0 ? `+${r.deltaFin.toFixed(2)}` : r.deltaFin.toFixed(2)}
                  </td>
                  <td className="px-2.5 py-2 text-muted-foreground">
                    {r.baseClass}
                  </td>
                  <td className="px-2.5 py-2 font-medium text-foreground">
                    {r.currClass}
                  </td>
                  <td className="px-2.5 py-2 font-mono text-[11px]">
                    <span
                      className={cn(
                        r.shiftLabel.includes("Escalated") ||
                          r.shiftLabel.includes("Newly")
                          ? "font-semibold text-emerald-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {r.shiftLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Recorded Rationale & Exclusion Audit Log */}
      <Panel
        title="CSRD / ESRS 2 IRO-1 Recorded Rationale & Exclusion Audit Log"
        description="Dated justification log documenting materiality inclusion decisions, year-over-year escalations, and non-material topic explanations for external assurance"
      >
        {!state?.rationale_log.length ? (
          <EmptyNote>No recorded rationale entries found.</EmptyNote>
        ) : (
          <div className="divide-y divide-border/70">
            {state.rationale_log.map((entry) => (
              <div key={entry.id} className="py-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">
                      {entry.topic_code}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-foreground">
                      {entry.topic_name}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={cn(
                        "font-medium",
                        entry.decision_type === "Double Material Inclusion" &&
                          "text-emerald-400",
                        entry.decision_type ===
                          "Threshold Exclusion Rationale" &&
                          "text-muted-foreground",
                        entry.decision_type === "YoY Score Escalation" &&
                          "text-amber-400",
                      )}
                    >
                      {entry.decision_type}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    <span>
                      Imp: {entry.impact_score_snapshot.toFixed(2)} · Fin:{" "}
                      {entry.financial_score_snapshot.toFixed(2)}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>
                      {new Date(entry.recorded_at).toISOString().slice(0, 10)}
                    </span>
                  </div>
                </div>

                <p className="mt-1.5 leading-relaxed text-foreground/90">
                  {entry.rationale_statement}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-muted-foreground">
                  <span>{entry.esrs_iro_reference}</span>
                  <span aria-hidden="true">·</span>
                  <span>Evidence: {entry.evidence_references}</span>
                  <span aria-hidden="true">·</span>
                  <span>Recorded by: {entry.recorded_by}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--term-ok)]">
                    {entry.reviewer_signoff}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </MaterialityShell>
  );
}
