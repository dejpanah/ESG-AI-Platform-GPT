import {
  createMaterialityTopic,
  updateMaterialityThresholds,
  updateMaterialityTopic,
  type MaterialityPillar,
  type MaterialityTopic,
} from "@/api/materiality";
import { MaterialityShell } from "@/components/materiality/MaterialityShell";
import { Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMateriality } from "@/hooks/use-materiality";
import { cn } from "@/lib/utils";
import { Plus, Save, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { toast } from "sonner";

const PILLAR_FILTERS = ["All", "Environmental", "Social", "Governance"] as const;

function classificationColor(c: MaterialityTopic["classification"]): string {
  switch (c) {
    case "Double Material":
      return "#10b981"; // emerald-500
    case "Impact Material Only":
      return "#3b82f6"; // blue-500
    case "Financial Material Only":
      return "#f59e0b"; // amber-500
    default:
      return "#64748b"; // slate-500
  }
}

export default function DoubleMaterialityPage() {
  const { state, setState, loading, error, reload } = useMateriality();

  const [pillarFilter, setPillarFilter] = useState<string>("All");
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Threshold form state (nullable overrides backed by server state)
  const [impactThresholdOverride, setImpactThreshold] = useState<number | null>(
    null,
  );
  const [financialThresholdOverride, setFinancialThreshold] = useState<
    number | null
  >(null);
  const [blendRatioOverride, setBlendRatio] = useState<number | null>(null);

  const impactThreshold =
    impactThresholdOverride ?? state?.impact_threshold ?? 3.0;
  const financialThreshold =
    financialThresholdOverride ?? state?.financial_threshold ?? 3.0;
  const blendRatio =
    blendRatioOverride ?? state?.stakeholder_blend_ratio ?? 0.3;

  // Selected topic draft overrides
  const [topicDraft, setTopicDraft] = useState<Partial<MaterialityTopic>>({});

  // Add new topic state
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newPillar, setNewPillar] = useState<MaterialityPillar>("Environmental");
  const [newEsrsTopic, setNewEsrsTopic] = useState("ESRS E1 · Climate Change");
  const [newScale, setNewScale] = useState("4.1");
  const [newScope, setNewScope] = useState("3.9");
  const [newIrrem, setNewIrrem] = useState("3.8");
  const [newFinMag, setNewFinMag] = useState("4.0");
  const [newExposure, setNewExposure] = useState("85");
  const [newImpactDesc, setNewImpactDesc] = useState("");
  const [newFinDriver, setNewFinDriver] = useState("");

  const filteredTopics = useMemo(() => {
    const list = state?.topics ?? [];
    if (pillarFilter === "All") return list;
    return list.filter((t) => t.pillar === pillarFilter);
  }, [state, pillarFilter]);

  const activeTopic = useMemo(() => {
    if (!filteredTopics.length) return null;
    return (
      filteredTopics.find((t) => t.id === selectedTopicId) ?? filteredTopics[0]
    );
  }, [filteredTopics, selectedTopicId]);

  const selectTopic = (id: string) => {
    setSelectedTopicId(id);
    setTopicDraft({});
  };

  const editScale = topicDraft.impact_scale ?? activeTopic?.impact_scale ?? 4.5;
  const editScope = topicDraft.impact_scope ?? activeTopic?.impact_scope ?? 4.2;
  const editIrrem =
    topicDraft.impact_irremediability ??
    activeTopic?.impact_irremediability ??
    4.0;
  const editImpactLikelihood =
    topicDraft.impact_likelihood ?? activeTopic?.impact_likelihood ?? 1.0;
  const editImpactType =
    topicDraft.impact_type ?? activeTopic?.impact_type ?? "Actual Negative";
  const editImpactDesc =
    topicDraft.impact_description ?? activeTopic?.impact_description ?? "";

  const editFinMag =
    topicDraft.financial_magnitude ?? activeTopic?.financial_magnitude ?? 4.2;
  const editFinLikelihood =
    topicDraft.financial_likelihood ??
    activeTopic?.financial_likelihood ??
    0.85;
  const editFinType =
    topicDraft.financial_effect_type ??
    activeTopic?.financial_effect_type ??
    "Transition Risk";
  const editFinExposure =
    topicDraft.estimated_financial_exposure_musd ??
    activeTopic?.estimated_financial_exposure_musd ??
    120;
  const editFinDriver =
    topicDraft.financial_driver ?? activeTopic?.financial_driver ?? "";

  const setEditScale = (v: number) =>
    setTopicDraft((p) => ({ ...p, impact_scale: v }));
  const setEditScope = (v: number) =>
    setTopicDraft((p) => ({ ...p, impact_scope: v }));
  const setEditIrrem = (v: number) =>
    setTopicDraft((p) => ({ ...p, impact_irremediability: v }));
  const setEditImpactLikelihood = (v: number) =>
    setTopicDraft((p) => ({ ...p, impact_likelihood: v }));
  const setEditImpactType = (v: MaterialityTopic["impact_type"]) =>
    setTopicDraft((p) => ({ ...p, impact_type: v }));
  const setEditImpactDesc = (v: string) =>
    setTopicDraft((p) => ({ ...p, impact_description: v }));
  const setEditFinMag = (v: number) =>
    setTopicDraft((p) => ({ ...p, financial_magnitude: v }));
  const setEditFinLikelihood = (v: number) =>
    setTopicDraft((p) => ({ ...p, financial_likelihood: v }));
  const setEditFinType = (v: MaterialityTopic["financial_effect_type"]) =>
    setTopicDraft((p) => ({ ...p, financial_effect_type: v }));
  const setEditFinExposure = (v: number) =>
    setTopicDraft((p) => ({ ...p, estimated_financial_exposure_musd: v }));
  const setEditFinDriver = (v: string) =>
    setTopicDraft((p) => ({ ...p, financial_driver: v }));

  const handleSaveThresholds = async () => {
    setSaving(true);
    try {
      const updated = await updateMaterialityThresholds({
        impact_threshold: impactThreshold,
        financial_threshold: financialThreshold,
        stakeholder_blend_ratio: blendRatio,
      });
      setState(updated);
      setImpactThreshold(null);
      setFinancialThreshold(null);
      setBlendRatio(null);
      toast.success(
        "CSRD materiality thresholds updated & saved to PostgreSQL",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update thresholds",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTopicIro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTopic) return;
    setSaving(true);
    try {
      const updated = await updateMaterialityTopic(activeTopic.id, {
        impact_scale: editScale,
        impact_scope: editScope,
        impact_irremediability: editIrrem,
        impact_likelihood: editImpactLikelihood,
        impact_type: editImpactType,
        impact_description: editImpactDesc,
        financial_magnitude: editFinMag,
        financial_likelihood: editFinLikelihood,
        financial_effect_type: editFinType,
        estimated_financial_exposure_musd: editFinExposure,
        financial_driver: editFinDriver,
      });
      setState(updated);
      setTopicDraft({});
      toast.success(
        `Updated Inside-Out & Outside-In IRO scores for ${activeTopic.code}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update topic IRO",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      toast.error("Topic code and name are required");
      return;
    }
    setSaving(true);
    try {
      const updated = await createMaterialityTopic({
        code: newCode.trim(),
        name: newName.trim(),
        pillar: newPillar,
        esrs_topic: newEsrsTopic.trim(),
        impact_scale: Number(newScale),
        impact_scope: Number(newScope),
        impact_irremediability: Number(newIrrem),
        financial_magnitude: Number(newFinMag),
        estimated_financial_exposure_musd: Number(newExposure),
        impact_description:
          newImpactDesc.trim() ||
          "Operational and value-chain sustainability impact assessed under ESRS 1.",
        financial_driver:
          newFinDriver.trim() ||
          "Cash-flow, cost-of-capital, or regulatory transition exposure.",
      });
      setState(updated);
      setShowAddForm(false);
      setNewCode("");
      setNewName("");
      toast.success("New sustainability topic added & persisted to PostgreSQL");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create topic",
      );
    } finally {
      setSaving(false);
    }
  };

  const scatterData = useMemo(
    () =>
      filteredTopics.map((t) => ({
        ...t,
        x: t.financial_score,
        y: t.impact_score,
        z: Math.max(60, Math.min(400, t.estimated_financial_exposure_musd)),
      })),
    [filteredTopics],
  );

  return (
    <MaterialityShell
      title="Double Materiality Assessment (ESRS 1 & CSRD)"
      subtitle="Simultaneous evaluation of Inside-Out Impact Materiality (scale, scope, irremediability on people & environment) and Outside-In Financial Materiality (cash flow, CapEx, and enterprise value risk/opportunity) per EFRAG IG 1."
      frameworkBadge="ESRS 1 §3.3–3.5 · EFRAG IG 1"
      state={state}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      headerActions={
        <Button
          size="sm"
          variant={showAddForm ? "secondary" : "default"}
          onClick={() => setShowAddForm((v) => !v)}
          className="h-8 gap-1.5 text-xs whitespace-nowrap shrink-0"
        >
          {showAddForm ? (
            <X className="size-3.5" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {showAddForm ? "Close Topic Form" : "Add Materiality Topic"}
        </Button>
      }
    >
      {showAddForm && (
        <Panel
          title="Register New CSRD / ESRS Sustainability Topic"
          description="Add a custom sustainability matter to evaluate across both Inside-Out Impact and Outside-In Financial dimensions"
        >
          <form
            onSubmit={(e) => void handleCreateTopic(e)}
            className="space-y-3"
          >
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                placeholder="Topic Code (e.g., ESRS-S3-COM)"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
                className="h-8 font-mono text-xs"
              />
              <Input
                placeholder="Topic Title"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="h-8 text-xs"
              />
              <select
                value={newPillar}
                onChange={(e) =>
                  setNewPillar(e.target.value as MaterialityPillar)
                }
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="Environmental">Environmental</option>
                <option value="Social">Social</option>
                <option value="Governance">Governance</option>
              </select>
              <Input
                placeholder="ESRS Sub-topic (e.g., ESRS S3 · Communities)"
                value={newEsrsTopic}
                onChange={(e) => setNewEsrsTopic(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Impact Scale (1–5)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={newScale}
                  onChange={(e) => setNewScale(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Impact Scope (1–5)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Irremediability (1–5)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={newIrrem}
                  onChange={(e) => setNewIrrem(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Financial Magnitude (1–5)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={newFinMag}
                  onChange={(e) => setNewFinMag(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
              <div>
                <label className="term-dim block text-[10px] uppercase">
                  Fin. Exposure ($M USD)
                </label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={newExposure}
                  onChange={(e) => setNewExposure(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <Input
                placeholder="Inside-Out Impact Description (Society & Environment)"
                value={newImpactDesc}
                onChange={(e) => setNewImpactDesc(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Outside-In Financial Driver (Cash flow, CapEx, Cost of Capital)"
                value={newFinDriver}
                onChange={(e) => setNewFinDriver(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className="h-8 text-xs"
              >
                Register & Score Topic
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {/* Threshold & Pillar Filter Controls */}
      <Panel
        title="CSRD Materiality Thresholds & Consensus Calibration"
        description="Configure the ESRS 1 cut-off thresholds (1.5–4.5) and stakeholder survey blend weight. Topics crossing either threshold are mandatory for CSRD reporting."
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void handleSaveThresholds()}
            className="h-7 gap-1.5 text-xs whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="size-3.5" />
            Save Thresholds
          </Button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  Impact Materiality Threshold (Y-Axis)
                </span>
                <span className="font-mono font-semibold text-[var(--term-ok)] tabular-nums">
                  {impactThreshold.toFixed(2)} / 5.0
                </span>
              </div>
              <input
                type="range"
                min={2.0}
                max={4.2}
                step={0.1}
                value={impactThreshold}
                onChange={(e) => setImpactThreshold(Number(e.target.value))}
                className="mt-2 w-full accent-emerald-500"
              />
              <p className="term-dim mt-1 text-[10px]">
                Inside-Out severity & likelihood cut-off per ESRS 1 §43
              </p>
            </div>

            <div className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  Financial Materiality Threshold (X-Axis)
                </span>
                <span className="font-mono font-semibold text-amber-400 tabular-nums">
                  {financialThreshold.toFixed(2)} / 5.0
                </span>
              </div>
              <input
                type="range"
                min={2.0}
                max={4.2}
                step={0.1}
                value={financialThreshold}
                onChange={(e) => setFinancialThreshold(Number(e.target.value))}
                className="mt-2 w-full accent-amber-500"
              />
              <p className="term-dim mt-1 text-[10px]">
                Outside-In enterprise value & cash-flow cut-off per ESRS 1 §49
              </p>
            </div>

            <div className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  Stakeholder Survey Blend Weight
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {Math.round(blendRatio * 100)}% Survey /{" "}
                  {Math.round((1 - blendRatio) * 100)}% IRO
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.05}
                value={blendRatio}
                onChange={(e) => setBlendRatio(Number(e.target.value))}
                className="mt-2 w-full accent-blue-500"
              />
              <p className="term-dim mt-1 text-[10px]">
                Blends weighted stakeholder scores into final topic coordinates
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 self-center">
            {PILLAR_FILTERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPillarFilter(p)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  pillarFilter === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {/* Main 2-Column Split: Double Materiality Scatter Matrix + IRO Scoring Workbench */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel
          title="Double Materiality Matrix (Inside-Out vs. Outside-In)"
          description="Bubble size reflects quantified financial exposure ($M USD). Click any point to inspect or recalibrate its IRO scoring parameters."
        >
          <div className="h-[390px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 16, right: 24, bottom: 24, left: 10 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.18)"
                />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Financial Materiality"
                  domain={[1, 5.2]}
                  tickCount={6}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  label={{
                    value:
                      "Financial Materiality (Outside-In Impact on Enterprise Value) →",
                    position: "bottom",
                    offset: 6,
                    fontSize: 11,
                    fill: "#94a3b8",
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Impact Materiality"
                  domain={[1, 5.2]}
                  tickCount={6}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  label={{
                    value:
                      "Impact Materiality (Inside-Out on People & Environment) →",
                    angle: -90,
                    position: "insideLeft",
                    offset: 8,
                    fontSize: 11,
                    fill: "#94a3b8",
                  }}
                />
                <ZAxis type="number" dataKey="z" range={[90, 420]} />
                <ReferenceArea
                  x1={financialThreshold}
                  x2={5.2}
                  y1={impactThreshold}
                  y2={5.2}
                  fill="#10b981"
                  fillOpacity={0.07}
                />
                <ReferenceLine
                  x={financialThreshold}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: `Fin. Cut-off (${financialThreshold.toFixed(1)})`,
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#f59e0b",
                  }}
                />
                <ReferenceLine
                  y={impactThreshold}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  label={{
                    value: `Impact Cut-off (${impactThreshold.toFixed(1)})`,
                    position: "insideTopLeft",
                    fontSize: 10,
                    fill: "#10b981",
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0].payload as MaterialityTopic;
                    return (
                      <div className="max-w-xs rounded-md border border-border bg-card p-2.5 text-xs shadow-md">
                        <p className="font-mono text-[11px] font-semibold text-foreground">
                          {pt.code} · {pt.classification}
                        </p>
                        <p className="mt-0.5 font-medium text-foreground">
                          {pt.name}
                        </p>
                        <div className="mt-1.5 space-y-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                          <p>
                            Inside-Out Impact Score:{" "}
                            <span className="font-semibold text-foreground">
                              {pt.impact_score.toFixed(2)} / 5.00
                            </span>
                          </p>
                          <p>
                            Outside-In Financial Score:{" "}
                            <span className="font-semibold text-foreground">
                              {pt.financial_score.toFixed(2)} / 5.00
                            </span>
                          </p>
                          <p>
                            Est. Financial Exposure:{" "}
                            <span className="font-semibold text-foreground">
                              ${pt.estimated_financial_exposure_musd.toFixed(1)}M
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={scatterData}
                  onClick={(point) => {
                    if (point?.id) selectTopic(String(point.id));
                  }}
                  className="cursor-pointer"
                >
                  {scatterData.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={classificationColor(entry.classification)}
                      stroke={
                        activeTopic?.id === entry.id ? "#ffffff" : "transparent"
                      }
                      strokeWidth={activeTopic?.id === entry.id ? 2 : 0}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                <strong className="text-emerald-400">■</strong> Double Material
                (Both ≥ Threshold)
              </span>
              <span>
                <strong className="text-blue-400">■</strong> Impact Material
                Only (Inside-Out)
              </span>
              <span>
                <strong className="text-amber-400">■</strong> Financial Material
                Only (Outside-In)
              </span>
              <span>
                <strong className="text-slate-400">■</strong> Monitored / Below
                Cut-off
              </span>
            </div>
            <span className="font-mono text-[10.5px]">
              Click any node to calibrate IRO
            </span>
          </div>
        </Panel>

        <Panel
          title={
            activeTopic
              ? `IRO Scoring Workbench: ${activeTopic.code}`
              : "IRO Scoring Workbench"
          }
          description={
            activeTopic
              ? `${activeTopic.name} · ${activeTopic.esrs_topic}`
              : "Select a topic to calibrate Inside-Out and Outside-In parameters"
          }
        >
          {activeTopic ? (
            <form
              onSubmit={(e) => void handleSaveTopicIro(e)}
              className="space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
                <div>
                  <span className="term-dim text-[10px] uppercase">
                    Computed ESRS Classification
                  </span>
                  <p className="font-semibold text-foreground">
                    {activeTopic.classification}
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-[11px] text-muted-foreground">
                    Impact:{" "}
                    <strong className="text-foreground">
                      {activeTopic.impact_score.toFixed(2)}
                    </strong>{" "}
                    · Financial:{" "}
                    <strong className="text-foreground">
                      {activeTopic.financial_score.toFixed(2)}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Inside-Out Impact Parameters */}
              <div className="space-y-2 rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">
                    1. Inside-Out Impact Materiality (Society & Environment)
                  </p>
                  <select
                    value={editImpactType}
                    onChange={(e) =>
                      setEditImpactType(
                        e.target.value as MaterialityTopic["impact_type"],
                      )
                    }
                    className="h-7 rounded border border-input bg-card px-2 text-[11px]"
                  >
                    <option value="Actual Negative">Actual Negative</option>
                    <option value="Potential Negative">
                      Potential Negative
                    </option>
                    <option value="Actual Positive">Actual Positive</option>
                    <option value="Potential Positive">
                      Potential Positive
                    </option>
                  </select>
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <div>
                    <label className="term-dim block text-[10px]">
                      Scale (1–5)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={editScale}
                      onChange={(e) => setEditScale(Number(e.target.value))}
                      className="mt-0.5 h-7 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="term-dim block text-[10px]">
                      Scope (1–5)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={editScope}
                      onChange={(e) => setEditScope(Number(e.target.value))}
                      className="mt-0.5 h-7 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="term-dim block text-[10px]">
                      Irremediability
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={editIrrem}
                      onChange={(e) => setEditIrrem(Number(e.target.value))}
                      className="mt-0.5 h-7 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="term-dim block text-[10px]">
                      Likelihood (0.2–1)
                    </label>
                    <Input
                      type="number"
                      step="0.05"
                      min="0.2"
                      max="1"
                      value={editImpactLikelihood}
                      onChange={(e) =>
                        setEditImpactLikelihood(Number(e.target.value))
                      }
                      className="mt-0.5 h-7 font-mono text-xs"
                    />
                  </div>
                </div>

                <Input
                  value={editImpactDesc}
                  onChange={(e) => setEditImpactDesc(e.target.value)}
                  placeholder="Environmental / social impact description"
                  className="h-7 text-xs"
                />
              </div>

              {/* Outside-In Financial Parameters */}
              <div className="space-y-2 rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">
                    2. Outside-In Financial Materiality (Enterprise Value)
                  </p>
                  <select
                    value={editFinType}
                    onChange={(e) =>
                      setEditFinType(
                        e.target
                          .value as MaterialityTopic["financial_effect_type"],
                      )
                    }
                    className="h-7 rounded border border-input bg-card px-2 text-[11px]"
                  >
                    <option value="Transition Risk">Transition Risk</option>
                    <option value="Physical Risk">Physical Risk</option>
                    <option value="Regulatory / Liability Risk">
                      Regulatory / Liability Risk
                    </option>
                    <option value="Capital & Market Opportunity">
                      Capital & Market Opportunity
                    </option>
                    <option value="Operational Cost Risk">
                      Operational Cost Risk
                    </option>
                  </select>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <label className="term-dim block text-[10px]">
                      Fin. Magnitude (1–5)
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={editFinMag}
                      onChange={(e) => setEditFinMag(Number(e.target.value))}
                      className="mt-0.5 h-7 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="term-dim block text-[10px]">
                      Fin. Likelihood (0.2–1)
                    </label>
                    <Input
                      type="number"
                      step="0.05"
                      min="0.2"
                      max="1"
                      value={editFinLikelihood}
                      onChange={(e) =>
                        setEditFinLikelihood(Number(e.target.value))
                      }
                      className="mt-0.5 h-7 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="term-dim block text-[10px]">
                      Exposure ($M USD)
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={editFinExposure}
                      onChange={(e) =>
                        setEditFinExposure(Number(e.target.value))
                      }
                      className="mt-0.5 h-7 font-mono text-xs"
                    />
                  </div>
                </div>

                <Input
                  value={editFinDriver}
                  onChange={(e) => setEditFinDriver(e.target.value)}
                  placeholder="Cash-flow, CapEx, carbon price or margin driver"
                  className="h-7 text-xs"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="h-8 gap-1.5 text-xs whitespace-nowrap"
                >
                  <Save className="size-3.5" />
                  Save IRO Assessment to PostgreSQL
                </Button>
              </div>
            </form>
          ) : null}
        </Panel>
      </div>

      {/* Full Double Materiality IRO Ledger Table */}
      <Panel
        title="CSRD Double Materiality Register (IRO Scoring Ledger)"
        description="Complete sustainability topic assessment showing Inside-Out severity components, Outside-In financial exposure, and final CSRD materiality determination"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                <th className="px-2.5 py-2 text-left">Code</th>
                <th className="px-2.5 py-2 text-left">Sustainability Topic</th>
                <th className="px-2.5 py-2 text-left">Pillar / Value Chain</th>
                <th className="px-2.5 py-2 text-right">
                  Scale · Scope · Irrem
                </th>
                <th className="px-2.5 py-2 text-right">
                  Impact Score (Inside-Out)
                </th>
                <th className="px-2.5 py-2 text-right">
                  Financial Score (Outside-In)
                </th>
                <th className="px-2.5 py-2 text-right">Fin. Exposure</th>
                <th className="px-2.5 py-2 text-left">
                  CSRD Materiality Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredTopics.map((t) => {
                const isSelected = activeTopic?.id === t.id;
                return (
                  <tr
                    key={t.id}
                    onClick={() => selectTopic(t.id)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/40",
                      isSelected && "bg-muted/60",
                    )}
                  >
                    <td className="px-2.5 py-2.5 font-mono text-[11px] font-semibold">
                      {t.code}
                    </td>
                    <td className="px-2.5 py-2.5">
                      <p className="font-medium text-foreground">{t.name}</p>
                      <p className="term-dim text-[10.5px]">{t.esrs_topic}</p>
                    </td>
                    <td className="px-2.5 py-2.5 text-muted-foreground">
                      <span>{t.pillar}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="text-[10.5px]">
                        {t.value_chain_stage}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                      {t.impact_scale.toFixed(1)} · {t.impact_scope.toFixed(1)}{" "}
                      · {t.impact_irremediability.toFixed(1)}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono font-semibold tabular-nums">
                      <span
                        className={cn(
                          t.impact_score >= (state?.impact_threshold ?? 3.0)
                            ? "text-emerald-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {t.impact_score.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono font-semibold tabular-nums">
                      <span
                        className={cn(
                          t.financial_score >=
                            (state?.financial_threshold ?? 3.0)
                            ? "text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {t.financial_score.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono tabular-nums">
                      ${t.estimated_financial_exposure_musd.toFixed(1)}M
                    </td>
                    <td className="px-2.5 py-2.5 font-medium">
                      <span
                        className={cn(
                          "text-[11px]",
                          t.classification === "Double Material" &&
                            "text-emerald-400",
                          t.classification === "Impact Material Only" &&
                            "text-blue-400",
                          t.classification === "Financial Material Only" &&
                            "text-amber-400",
                          t.classification === "Not Material (Monitored)" &&
                            "text-muted-foreground",
                        )}
                      >
                        {t.classification}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </MaterialityShell>
  );
}
