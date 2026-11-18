import {
  submitStakeholderSurvey,
  updateStakeholderWeights,
  type StakeholderGroupId,
} from "@/api/materiality";
import { MaterialityShell } from "@/components/materiality/MaterialityShell";
import { EmptyNote, Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMateriality } from "@/hooks/use-materiality";
import { cn } from "@/lib/utils";
import { MessageSquarePlus, Scale, Send, X } from "lucide-react";
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

const GROUP_COLORS: Record<StakeholderGroupId, string> = {
  investors: "#10b981",
  regulators: "#f59e0b",
  communities: "#3b82f6",
  employees: "#a855f7",
  customers: "#06b6d4",
};

export default function StakeholderSurveyPage() {
  const { state, setState, loading, error, reload } = useMateriality();

  const [chartDimension, setChartDimension] = useState<"impact" | "financial">(
    "impact",
  );
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [savingWeights, setSavingWeights] = useState(false);
  const [submittingSurvey, setSubmittingSurvey] = useState(false);

  // Weighting state (nullable overrides backed by server state)
  const [weightOverrides, setWeightOverrides] = useState<
    Partial<Record<StakeholderGroupId, number>>
  >({});
  const [weightAuthor, setWeightAuthor] = useState(
    "CSRD Sustainability Steering Committee",
  );
  const [weightRationale, setWeightRationale] = useState("");

  // Survey capture state
  const [surveyTopicId, setSurveyTopicId] = useState("topic-e1-ghg");
  const [surveyGroupId, setSurveyGroupId] =
    useState<StakeholderGroupId>("investors");
  const [respondentOrg, setRespondentOrg] = useState("");
  const [respondentCount, setRespondentCount] = useState("18");
  const [impactRating, setImpactRating] = useState("4.6");
  const [financialRating, setFinancialRating] = useState("4.7");
  const [engagementChannel, setEngagementChannel] = useState(
    "CSRD Double Materiality Structured Questionnaire",
  );
  const [surveyComment, setSurveyComment] = useState("");
  const [submittedBy, setSubmittedBy] = useState(
    "Stakeholder Engagement Lead",
  );

  const weights = useMemo<Record<StakeholderGroupId, number>>(() => {
    const base: Record<StakeholderGroupId, number> = {
      investors: 25,
      regulators: 25,
      communities: 20,
      employees: 15,
      customers: 15,
    };
    for (const g of state?.stakeholder_groups ?? []) {
      base[g.group_id] = g.weight_pct;
    }
    return {
      investors: weightOverrides.investors ?? base.investors,
      regulators: weightOverrides.regulators ?? base.regulators,
      communities: weightOverrides.communities ?? base.communities,
      employees: weightOverrides.employees ?? base.employees,
      customers: weightOverrides.customers ?? base.customers,
    };
  }, [state, weightOverrides]);

  const setWeights = (
    updater:
      | Record<StakeholderGroupId, number>
      | ((
          prev: Record<StakeholderGroupId, number>,
        ) => Record<StakeholderGroupId, number>),
  ) => {
    const next = typeof updater === "function" ? updater(weights) : updater;
    setWeightOverrides(next);
  };

  const totalWeight = useMemo(
    () =>
      Object.values(weights).reduce(
        (acc, v) => acc + (Number.isFinite(v) ? v : 0),
        0,
      ),
    [weights],
  );

  const handleNormalizeWeights = () => {
    if (totalWeight <= 0) return;
    const entries = Object.entries(weights) as Array<
      [StakeholderGroupId, number]
    >;
    const normalized: Record<StakeholderGroupId, number> = {
      investors: 20,
      regulators: 20,
      communities: 20,
      employees: 20,
      customers: 20,
    };
    let running = 0;
    entries.forEach(([k, val], idx) => {
      if (idx === entries.length - 1) {
        normalized[k] = Math.max(0, 100 - running);
      } else {
        const rounded = Math.round((val / totalWeight) * 100);
        normalized[k] = rounded;
        running += rounded;
      }
    });
    setWeightOverrides(normalized);
  };

  const handleSaveWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWeights(true);
    try {
      const updated = await updateStakeholderWeights({
        weights,
        changed_by: weightAuthor.trim() || "CSRD Steering Committee",
        rationale:
          weightRationale.trim() ||
          "Recalibrated stakeholder group weighting across Investors, Regulators, Communities, Employees, and Customers.",
      });
      setState(updated);
      setWeightOverrides({});
      setWeightRationale("");
      toast.success(
        "Stakeholder group weights saved to PostgreSQL & topic scores recomputed",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update weights",
      );
    } finally {
      setSavingWeights(false);
    }
  };

  const handleSubmitSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respondentOrg.trim()) {
      toast.error("Please enter the respondent organization or cohort name");
      return;
    }
    setSubmittingSurvey(true);
    try {
      const updated = await submitStakeholderSurvey({
        topic_id: surveyTopicId,
        group_id: surveyGroupId,
        respondent_org: respondentOrg.trim(),
        respondent_count: Number(respondentCount) || 10,
        impact_rating: Number(impactRating) || 4.0,
        financial_rating: Number(financialRating) || 4.0,
        engagement_channel: engagementChannel.trim(),
        comment:
          surveyComment.trim() ||
          "Structured CSRD stakeholder consultation input recorded.",
        submitted_by: submittedBy.trim() || "ESG Engagement Lead",
      });
      setState(updated);
      setRespondentOrg("");
      setSurveyComment("");
      setShowSurveyForm(false);
      toast.success(
        "Stakeholder survey response recorded & blended into Double Materiality scores",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to submit survey response",
      );
    } finally {
      setSubmittingSurvey(false);
    }
  };

  const chartData = useMemo(() => {
    const topics = state?.topics ?? [];
    return topics.map((t) => {
      const s = t.stakeholder_scores;
      const pick = (gid: StakeholderGroupId) =>
        chartDimension === "impact"
          ? (s[gid]?.impact_rating ?? t.impact_score)
          : (s[gid]?.financial_rating ?? t.financial_score);

      return {
        code: t.code.replace("ESRS-", ""),
        fullName: t.name,
        Investors: pick("investors"),
        Regulators: pick("regulators"),
        Communities: pick("communities"),
        Employees: pick("employees"),
        Customers: pick("customers"),
      };
    });
  }, [state, chartDimension]);

  return (
    <MaterialityShell
      title="Stakeholder Survey & Weighting Engine"
      subtitle="Capture and weight input from Investors, Communities, Employees, Customers, and Regulators per ESRS 1 §24 affected stakeholder & user of sustainability statements requirements, with full weighting change tracking."
      frameworkBadge="ESRS 1 §22–24 · AA1000SES Stakeholder Engagement"
      state={state}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      headerActions={
        <Button
          size="sm"
          variant={showSurveyForm ? "secondary" : "default"}
          onClick={() => setShowSurveyForm((v) => !v)}
          className="h-8 gap-1.5 text-xs whitespace-nowrap shrink-0"
        >
          {showSurveyForm ? (
            <X className="size-3.5" />
          ) : (
            <MessageSquarePlus className="size-3.5" />
          )}
          {showSurveyForm
            ? "Close Survey Form"
            : "Capture Stakeholder Survey Input"}
        </Button>
      }
    >
      {/* Capture New Stakeholder Survey Response Form */}
      {showSurveyForm && state && (
        <Panel
          title="Capture New Stakeholder Survey / Consultation Batch"
          description="Record quantitative Impact (Inside-Out) and Financial (Outside-In) ratings from a stakeholder group; automatically blends into topic consensus scores"
        >
          <form
            onSubmit={(e) => void handleSubmitSurvey(e)}
            className="space-y-3"
          >
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Materiality Topic
                </label>
                <select
                  value={surveyTopicId}
                  onChange={(e) => setSurveyTopicId(e.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  {state.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Stakeholder Group
                </label>
                <select
                  value={surveyGroupId}
                  onChange={(e) =>
                    setSurveyGroupId(e.target.value as StakeholderGroupId)
                  }
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  {state.stakeholder_groups.map((g) => (
                    <option key={g.group_id} value={g.group_id}>
                      {g.name} ({g.weight_pct}% weight)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Respondent Organization / Cohort
                </label>
                <Input
                  placeholder="e.g., European Institutional Investor Forum"
                  value={respondentOrg}
                  onChange={(e) => setRespondentOrg(e.target.value)}
                  required
                  className="mt-1 h-8 text-xs"
                />
              </div>

              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Engagement Channel
                </label>
                <Input
                  placeholder="e.g., Q2 Structured IRO Survey"
                  value={engagementChannel}
                  onChange={(e) => setEngagementChannel(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Respondent Sample Size (N)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="5000"
                  value={respondentCount}
                  onChange={(e) => setRespondentCount(e.target.value)}
                  required
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>

              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Inside-Out Impact Rating (1.0–5.0)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={impactRating}
                  onChange={(e) => setImpactRating(e.target.value)}
                  required
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>

              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Outside-In Financial Rating (1.0–5.0)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={financialRating}
                  onChange={(e) => setFinancialRating(e.target.value)}
                  required
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>

              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Recorded By
                </label>
                <Input
                  value={submittedBy}
                  onChange={(e) => setSubmittedBy(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Qualitative stakeholder concern, evidence or regulatory citation..."
                value={surveyComment}
                onChange={(e) => setSurveyComment(e.target.value)}
                required
                className="h-8 flex-1 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={submittingSurvey}
                className="h-8 gap-1.5 text-xs whitespace-nowrap"
              >
                <Send className="size-3.5" />
                Record Survey & Update Consensus
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {/* Top Split: Stakeholder Weighting Allocation + Multi-Stakeholder Chart */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.3fr)]">
        <Panel
          title="Stakeholder Group Weighting & Influence Allocation"
          description="Adjust relative weights across the 5 CSRD stakeholder groups. Every change is logged with before/after weights and triggers an immediate materiality recalculation."
          actions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleNormalizeWeights}
              className="h-7 text-xs whitespace-nowrap"
            >
              Normalize to 100% (Current: {totalWeight}%)
            </Button>
          }
        >
          <form
            onSubmit={(e) => void handleSaveWeights(e)}
            className="space-y-2.5"
          >
            {(state?.stakeholder_groups ?? []).map((group) => {
              const wVal = weights[group.group_id] ?? group.weight_pct;
              return (
                <div
                  key={group.group_id}
                  className="rounded-md border border-border bg-background p-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {group.name}
                      </p>
                      <p className="term-dim text-[10.5px]">
                        {group.engagement_method} ·{" "}
                        <span className="font-mono">
                          N={group.respondent_count} ({group.response_rate_pct}%
                          response)
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={wVal}
                        onChange={(e) =>
                          setWeights((prev) => ({
                            ...prev,
                            [group.group_id]: Number(e.target.value),
                          }))
                        }
                        className="h-7 w-16 text-right font-mono text-xs tabular-nums"
                      />
                      <span className="font-mono text-xs font-semibold">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={wVal}
                    onChange={(e) =>
                      setWeights((prev) => ({
                        ...prev,
                        [group.group_id]: Number(e.target.value),
                      }))
                    }
                    className="mt-1.5 w-full accent-emerald-500"
                  />
                </div>
              );
            })}

            <div className="grid gap-2 pt-1 sm:grid-cols-2">
              <Input
                placeholder="Approved by (e.g., CSRD Steering Committee)"
                value={weightAuthor}
                onChange={(e) => setWeightAuthor(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Rationale for weighting change (logged to audit trail)"
                value={weightRationale}
                onChange={(e) => setWeightRationale(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                Total Allocation: {totalWeight}%
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={savingWeights}
                className="h-8 gap-1.5 text-xs whitespace-nowrap"
              >
                <Scale className="size-3.5" />
                Save Weighting & Track Change
              </Button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Multi-Stakeholder Priority Comparison by Topic"
          description="Compare how Investors, Regulators, Communities, Employees, and Customers rate each sustainability topic (1.0–5.0 scale)"
          actions={
            <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setChartDimension("impact")}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                  chartDimension === "impact"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Inside-Out Impact Ratings
              </button>
              <button
                type="button"
                onClick={() => setChartDimension("financial")}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                  chartDimension === "financial"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Outside-In Financial Ratings
              </button>
            </div>
          }
        >
          <div className="h-[375px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 16, bottom: 20, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.16)"
                />
                <XAxis
                  dataKey="code"
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
                  dataKey="Investors"
                  fill={GROUP_COLORS.investors}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="Regulators"
                  fill={GROUP_COLORS.regulators}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="Communities"
                  fill={GROUP_COLORS.communities}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="Employees"
                  fill={GROUP_COLORS.employees}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="Customers"
                  fill={GROUP_COLORS.customers}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Stakeholder Consensus Matrix Across All Topics */}
      <Panel
        title="Topic × Stakeholder Group Consensus Matrix (Impact / Financial Scores)"
        description="Disaggregated survey scores (Impact / Financial) across all 5 stakeholder groups and the resulting weighted consensus"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                <th className="px-2 py-2 text-left">Topic</th>
                <th className="px-2 py-2 text-right">
                  Investors ({weights.investors}%)
                </th>
                <th className="px-2 py-2 text-right">
                  Regulators ({weights.regulators}%)
                </th>
                <th className="px-2 py-2 text-right">
                  Communities ({weights.communities}%)
                </th>
                <th className="px-2 py-2 text-right">
                  Employees ({weights.employees}%)
                </th>
                <th className="px-2 py-2 text-right">
                  Customers ({weights.customers}%)
                </th>
                <th className="px-2 py-2 text-right">
                  Final Blended (Imp / Fin)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {(state?.topics ?? []).map((t) => {
                const s = t.stakeholder_scores;
                return (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="px-2 py-2">
                      <span className="font-mono text-[11px] font-semibold">
                        {t.code}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-medium text-foreground">
                        {t.name}
                      </span>
                    </td>
                    {(
                      [
                        "investors",
                        "regulators",
                        "communities",
                        "employees",
                        "customers",
                      ] as StakeholderGroupId[]
                    ).map((gid) => {
                      const cell = s[gid];
                      return (
                        <td
                          key={gid}
                          className="px-2 py-2 text-right font-mono text-[11px] tabular-nums"
                          title={cell?.key_concern}
                        >
                          <span className="text-foreground">
                            {cell?.impact_rating.toFixed(1)}
                          </span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-amber-400">
                            {cell?.financial_rating.toFixed(1)}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums">
                      <span className="text-emerald-400">
                        {t.impact_score.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-amber-400">
                        {t.financial_score.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Bottom 2-Column Split: Weighting Change Tracking Log & Captured Survey Submissions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Weighting & Governance Change Tracking Log"
          description="Immutable audit log of all stakeholder group weight adjustments and their rationale"
        >
          {!state?.weight_change_logs.length ? (
            <EmptyNote>No stakeholder weight changes logged yet.</EmptyNote>
          ) : (
            <div className="divide-y divide-border/60">
              {state.weight_change_logs.map((log) => (
                <div key={log.id} className="py-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {log.changed_by}
                    </span>
                    <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                      {new Date(log.changed_at).toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{log.rationale}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10.5px] text-muted-foreground tabular-nums">
                    {(
                      [
                        "investors",
                        "regulators",
                        "communities",
                        "employees",
                        "customers",
                      ] as StakeholderGroupId[]
                    ).map((gid) => {
                      const prev = log.previous_weights[gid];
                      const next = log.new_weights[gid];
                      const diff = next - prev;
                      return (
                        <span key={gid}>
                          {gid}: {prev}% →{" "}
                          <strong
                            className={cn(
                              diff > 0 && "text-emerald-400",
                              diff < 0 && "text-amber-400",
                              diff === 0 && "text-foreground",
                            )}
                          >
                            {next}%
                          </strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Captured Stakeholder Survey & Consultation Log"
          description="Recent quantitative ratings and qualitative feedback submitted across the 5 stakeholder cohorts"
        >
          {!state?.survey_submissions.length ? (
            <EmptyNote>No stakeholder survey submissions recorded.</EmptyNote>
          ) : (
            <div className="divide-y divide-border/60">
              {state.survey_submissions.map((sub) => (
                <div key={sub.id} className="py-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {sub.respondent_org}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({sub.group_name} · N={sub.respondent_count})
                      </span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums">
                      Imp:{" "}
                      <strong className="text-emerald-400">
                        {sub.impact_rating.toFixed(1)}
                      </strong>{" "}
                      · Fin:{" "}
                      <strong className="text-amber-400">
                        {sub.financial_rating.toFixed(1)}
                      </strong>
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">“{sub.comment}”</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
                    <span>{sub.topic_code}</span>
                    <span aria-hidden="true">·</span>
                    <span>{sub.engagement_channel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{sub.submitted_by}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </MaterialityShell>
  );
}
