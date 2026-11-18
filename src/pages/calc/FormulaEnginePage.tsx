import {
  createFormulaRule,
  evaluateFormulaExpression,
  proposeFormulaChange,
  reviewFormulaChange,
  type CalcEngineSlug,
  type FormulaRuleItem,
} from "@/api/calc-engines";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { ValidationSparkline } from "@/components/calc/ValidationSparkline";
import { EmptyNote, Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { cn } from "@/lib/utils";
import { Check, Edit3, Play, Plus, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const TARGET_ENGINES: Array<{ slug: CalcEngineSlug; label: string }> = [
  { slug: "scope-1", label: "01. Scope 1 Emissions" },
  { slug: "scope-2", label: "02. Scope 2 Emissions" },
  { slug: "scope-3", label: "03. Scope 3 Emissions" },
  { slug: "methane", label: "05. Methane Accounting" },
  { slug: "flaring", label: "06. Flaring & Losses" },
  { slug: "carbon-intensity", label: "07. Carbon Intensity" },
  { slug: "water", label: "08. Water Accounting" },
  { slug: "waste", label: "09. Waste & Materials" },
  { slug: "air-emissions", label: "10. Air Emissions" },
  { slug: "safety-hse", label: "11. Safety & HSE" },
];

export default function FormulaEnginePage() {
  const { view, setView, loading, error, reload } =
    useCalcEngine("formulas-rules");

  const formulas = useMemo(
    () => (view?.extra?.formulas as FormulaRuleItem[] | undefined) ?? [],
    [view],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeRule = useMemo(
    () => formulas.find((f) => f.id === selectedId) ?? formulas[0] ?? null,
    [formulas, selectedId],
  );

  const [showCreate, setShowCreate] = useState(false);
  const [proposingId, setProposingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // New rule builder state
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newEngine, setNewEngine] = useState<CalcEngineSlug>("carbon-intensity");
  const [newKind, setNewKind] = useState<"formula" | "threshold_rule">("formula");
  const [newUnit, setNewUnit] = useState("tCO2e / t");
  const [newExpr, setNewExpr] = useState("(co2_tonnes + ch4_tonnes * 29.8) / output_tonnes");
  const [newVarsText, setNewVarsText] = useState("co2_tonnes=1200, ch4_tonnes=12, output_tonnes=1800");
  const [newOp, setNewOp] = useState<">" | ">=" | "<" | "<=">(">");
  const [newLimit, setNewLimit] = useState("1.0");
  const [newSeverity, setNewSeverity] = useState<"warning" | "critical">("warning");
  const [newNote, setNewNote] = useState("");
  const [previewVal, setPreviewVal] = useState<string | null>(null);

  // Propose edit state
  const [editExpr, setEditExpr] = useState("");
  const [editLimit, setEditLimit] = useState("");
  const [editOp, setEditOp] = useState<">" | ">=" | "<" | "<=">(">");
  const [editNote, setEditNote] = useState("");
  const [editPreview, setEditPreview] = useState<string | null>(null);

  // Approval review note
  const [reviewNote, setReviewNote] = useState("");

  function parseSampleVars(raw: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const part of raw.split(",")) {
      const [k, v] = part.split("=").map((s) => s.trim());
      if (k && v !== undefined && Number.isFinite(Number(v))) {
        out[k] = Number(v);
      }
    }
    return out;
  }

  const handleTestNew = async () => {
    const inputs = parseSampleVars(newVarsText);
    const res = await evaluateFormulaExpression(newExpr, inputs);
    if (res.error) {
      toast.error(`Formula check failed: ${res.error}`);
      setPreviewVal(null);
    } else {
      setPreviewVal(`${res.value} ${newUnit}`);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputs = parseSampleVars(newVarsText);
    setSubmitting(true);
    try {
      const updated = await createFormulaRule({
        code: newCode.trim(),
        name: newName.trim(),
        target_engine: newEngine,
        kind: newKind,
        output_unit: newUnit.trim(),
        expression: newExpr.trim(),
        variables: Object.keys(inputs),
        sample_inputs: inputs,
        threshold_operator: newOp,
        threshold_value: newLimit === "" ? null : Number(newLimit),
        threshold_severity: newSeverity,
        change_note: newNote.trim() || "Initial submission for approval",
      });
      setView(updated);
      setShowCreate(false);
      setNewCode("");
      setNewName("");
      toast.success("Rule submitted to approval queue (inactive until approved)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSubmitting(false);
    }
  };

  const startPropose = (rule: FormulaRuleItem) => {
    setProposingId(rule.id);
    setEditExpr(rule.pending_revision?.expression ?? rule.expression);
    setEditOp(rule.pending_revision?.threshold_operator ?? rule.threshold_operator ?? ">");
    setEditLimit(
      rule.pending_revision?.threshold_value !== undefined &&
        rule.pending_revision?.threshold_value !== null
        ? String(rule.pending_revision.threshold_value)
        : rule.threshold_value !== undefined && rule.threshold_value !== null
          ? String(rule.threshold_value)
          : "",
    );
    setEditNote("");
    setEditPreview(null);
  };

  const handleTestEdit = async (rule: FormulaRuleItem) => {
    const res = await evaluateFormulaExpression(editExpr, rule.sample_inputs);
    if (res.error) {
      toast.error(`Invalid expression: ${res.error}`);
      setEditPreview(null);
    } else {
      setEditPreview(`${res.value} ${rule.output_unit}`);
    }
  };

  const handleProposeSubmit = async (rule: FormulaRuleItem) => {
    if (!editNote.trim()) {
      toast.error("Provide a change justification note for audit approval");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await proposeFormulaChange(rule.id, {
        expression: editExpr.trim(),
        threshold_operator: editOp,
        threshold_value: editLimit === "" ? null : Number(editLimit),
        change_note: editNote.trim(),
      });
      setView(updated);
      setProposingId(null);
      toast.success(
        `Revision submitted for approval — active v${rule.active_version} unchanged until approved`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to propose revision");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (
    ruleId: string,
    decision: "approve" | "reject",
  ) => {
    setSubmitting(true);
    try {
      const updated = await reviewFormulaChange(
        ruleId,
        decision,
        reviewNote.trim() ||
          (decision === "approve"
            ? "Verified against calculation standard & activated"
            : "Returned for further calibration"),
      );
      setView(updated);
      setReviewNote("");
      toast.success(
        decision === "approve"
          ? "Formula revision approved & promoted to Active"
          : "Pending revision rejected; prior active version retained",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review action failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Approved Versions"
      chartSecondaryLabel="Pending Changes"
      headerActions={
        <Button
          size="sm"
          variant={showCreate ? "secondary" : "default"}
          className="h-8 px-3 text-xs whitespace-nowrap shrink-0"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {showCreate ? "Close Builder" : "New Formula / Rule"}
        </Button>
      }
      controlsSlot={
        showCreate ? (
          <Panel
            title="No-Code Formula & Threshold Builder"
            description="Compose algebraic rules with sample inputs and alert thresholds. New rules enter Pending Approval before activation."
          >
            <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                <Input
                  placeholder="Rule Code (e.g., RULE-NOx-CAP)"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  required
                  className="h-8 font-mono text-xs"
                />
                <Input
                  placeholder="Descriptive Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
                <select
                  value={newEngine}
                  onChange={(e) => setNewEngine(e.target.value as CalcEngineSlug)}
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  {TARGET_ENGINES.map((te) => (
                    <option key={te.slug} value={te.slug}>
                      {te.label}
                    </option>
                  ))}
                </select>
                <select
                  value={newKind}
                  onChange={(e) =>
                    setNewKind(e.target.value as "formula" | "threshold_rule")
                  }
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  <option value="formula">Calculation Formula</option>
                  <option value="threshold_rule">Threshold Compliance Rule</option>
                </select>
                <Input
                  placeholder="Output Unit"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid gap-2.5 lg:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[10.5px] font-medium text-muted-foreground">
                    Formula Expression (supports +, -, *, /, parentheses, and variable names)
                  </span>
                  <Input
                    value={newExpr}
                    onChange={(e) => setNewExpr(e.target.value)}
                    required
                    className="h-8 font-mono text-xs"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10.5px] font-medium text-muted-foreground">
                    Test Variable Inputs (key=value, comma separated)
                  </span>
                  <Input
                    value={newVarsText}
                    onChange={(e) => setNewVarsText(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                </label>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-4">
                <select
                  value={newOp}
                  onChange={(e) => setNewOp(e.target.value as ">" | ">=" | "<" | "<=")}
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs font-mono"
                >
                  <option value=">">Alert if &gt; Limit</option>
                  <option value=">=">Alert if &gt;= Limit</option>
                  <option value="<">Alert if &lt; Limit</option>
                  <option value="<=">Alert if &lt;= Limit</option>
                </select>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="any"
                    placeholder="Threshold Limit"
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    className="h-8 flex-1 min-w-0 font-mono text-xs"
                  />
                  <ValidationSparkline
                    history={[0.8, 0.9, 1.0, 1.05, 1.1]}
                    currentValue={newLimit ? Number(newLimit) : null}
                    unit={newUnit}
                    fieldLabel="Rule Limit"
                    width={85}
                    height={28}
                    showBadge={false}
                  />
                </div>
                <select
                  value={newSeverity}
                  onChange={(e) =>
                    setNewSeverity(e.target.value as "warning" | "critical")
                  }
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  <option value="warning">Warning Alert</option>
                  <option value="critical">Critical Breach</option>
                </select>
                <Input
                  placeholder="Change justification note"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleTestNew()}
                  className="h-7 px-3 text-xs"
                >
                  <Play className="size-3.5" />
                  Test Evaluate
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="h-7 px-3 text-xs"
                >
                  Submit for Approval
                </Button>
                {previewVal && (
                  <span className="font-mono text-xs font-semibold text-[var(--term-ok)] tabular-nums">
                    Test Output: {previewVal}
                  </span>
                )}
              </div>
            </form>
          </Panel>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel
          title="Configured Formulas & Threshold Rules"
          description="Select a rule to edit, submit a revision for approval, or inspect its versioned approval audit log"
        >
          {formulas.length === 0 ? (
            <EmptyNote>No formulas configured yet.</EmptyNote>
          ) : (
            <div className="divide-y divide-border/70">
              {formulas.map((f) => {
                const isSel = activeRule?.id === f.id;
                const recRow = view?.records.find((r) => r.id === f.id);
                const sampleVal = recRow?.evaluated_sample;
                const triggered = Boolean(recRow?.threshold_triggered);
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    className={cn(
                      "cursor-pointer rounded px-2.5 py-2.5 transition-colors hover:bg-muted/40",
                      isSel && "bg-muted/60",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold">{f.code}</span>
                        <span className="font-medium">{f.name}</span>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-[10.5px] font-medium",
                          f.pending_revision
                            ? "text-[var(--term-warn)]"
                            : "text-[var(--term-ok)]",
                        )}
                      >
                        {f.pending_revision
                          ? `v${f.active_version} Active · v${f.pending_revision.version} Pending Approval`
                          : `v${f.active_version} Active`}
                      </span>
                    </div>

                    <div className="mt-1.5 rounded border border-border/70 bg-background px-2.5 py-1.5 font-mono text-[11px]">
                      {f.expression}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-muted-foreground font-mono tabular-nums">
                      <span>
                        Engine: {f.target_engine} · Threshold:{" "}
                        {f.threshold_value !== null && f.threshold_value !== undefined
                          ? `${f.threshold_operator} ${f.threshold_value} (${f.threshold_severity})`
                          : "None"}
                      </span>
                      <span>
                        Sample: {String(sampleVal ?? "—")} {f.output_unit}{" "}
                        {triggered ? "[THRESHOLD TRIGGERED]" : "[NOMINAL]"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title={
            activeRule
              ? `Governance & Approval: ${activeRule.code}`
              : "Rule Inspector"
          }
          description={
            activeRule
              ? `Changes create a pending revision that cannot affect live calculations until approved`
              : "Select a formula or rule"
          }
          actions={
            activeRule && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs whitespace-nowrap shrink-0"
                onClick={() => startPropose(activeRule)}
              >
                <Edit3 className="size-3.5" />
                Propose Revision
              </Button>
            )
          }
        >
          {!activeRule ? (
            <EmptyNote>Select any formula or rule from the list.</EmptyNote>
          ) : (
            <div className="space-y-4">
              {activeRule.pending_revision && (
                <div className="space-y-2.5 rounded-md border border-[var(--term-warn)]/50 bg-[var(--term-warn)]/5 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--term-warn)]">
                      Pending Approval: v{activeRule.pending_revision.version}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Author: {activeRule.pending_revision.author}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {activeRule.pending_revision.change_note}
                  </p>
                  <div className="space-y-1 font-mono text-[10.5px]">
                    <div className="rounded border border-border/60 bg-background px-2 py-1 text-muted-foreground">
                      Current (v{activeRule.active_version}): {activeRule.expression}
                    </div>
                    <div className="rounded border border-[var(--term-warn)]/40 bg-background px-2 py-1 font-medium text-foreground">
                      Proposed (v{activeRule.pending_revision.version}):{" "}
                      {activeRule.pending_revision.expression}
                    </div>
                    {activeRule.pending_revision.threshold_value !== null &&
                      activeRule.pending_revision.threshold_value !== undefined && (
                        <div className="text-[10.5px] text-muted-foreground">
                          Proposed Threshold:{" "}
                          {activeRule.pending_revision.threshold_operator}{" "}
                          {activeRule.pending_revision.threshold_value}
                        </div>
                      )}
                  </div>
                  <Input
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Reviewer sign-off / rejection comment…"
                    className="h-7 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={submitting}
                      className="h-7 px-3 text-xs"
                      onClick={() => void handleReview(activeRule.id, "approve")}
                    >
                      <Check className="size-3.5" />
                      Approve &amp; Activate v{activeRule.pending_revision.version}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={submitting}
                      className="h-7 px-3 text-xs"
                      onClick={() => void handleReview(activeRule.id, "reject")}
                    >
                      <XCircle className="size-3.5" />
                      Reject Change
                    </Button>
                  </div>
                </div>
              )}

              {proposingId === activeRule.id && (
                <div className="space-y-2.5 rounded-md border border-border bg-background p-3">
                  <p className="text-xs font-semibold">
                    Propose Formula Revision (Requires Independent Approval)
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Variables: {activeRule.variables.join(", ") || "none"}
                  </p>
                  <Input
                    value={editExpr}
                    onChange={(e) => setEditExpr(e.target.value)}
                    className="h-8 font-mono text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={editOp}
                      onChange={(e) =>
                        setEditOp(e.target.value as ">" | ">=" | "<" | "<=")
                      }
                      className="h-8 rounded-md border border-input bg-card px-2 font-mono text-xs"
                    >
                      <option value=">">&gt; Threshold</option>
                      <option value=">=">&gt;= Threshold</option>
                      <option value="<">&lt; Threshold</option>
                      <option value="<=">&lt;= Threshold</option>
                    </select>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        step="any"
                        value={editLimit}
                        onChange={(e) => setEditLimit(e.target.value)}
                        placeholder="Limit value"
                        className="h-8 flex-1 min-w-0 font-mono text-xs"
                      />
                      <ValidationSparkline
                        history={
                          activeRule.threshold_value !== null && activeRule.threshold_value !== undefined
                            ? [
                                activeRule.threshold_value * 0.9,
                                activeRule.threshold_value * 0.95,
                                activeRule.threshold_value * 1.02,
                                activeRule.threshold_value,
                              ]
                            : [0.9, 1.0, 1.1]
                        }
                        currentValue={editLimit ? Number(editLimit) : null}
                        unit={activeRule.output_unit}
                        fieldLabel={`${activeRule.code} Threshold`}
                        width={85}
                        height={28}
                        showBadge={false}
                      />
                    </div>
                  </div>
                  <Input
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Audit justification note (required)"
                    className="h-8 text-xs"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleTestEdit(activeRule)}
                      className="h-7 text-xs"
                    >
                      <Play className="size-3.5" />
                      Dry-Run
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={submitting}
                      onClick={() => void handleProposeSubmit(activeRule)}
                      className="h-7 text-xs"
                    >
                      Submit Revision
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setProposingId(null)}
                      className="h-7 text-xs"
                    >
                      Cancel
                    </Button>
                    {editPreview && (
                      <span className="font-mono text-[11px] font-semibold text-[var(--term-ok)]">
                        = {editPreview}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold">
                  Immutable Version &amp; Approval History ({activeRule.history.length})
                </p>
                {activeRule.history.length === 0 ? (
                  <EmptyNote>No approved versions yet — pending initial approval.</EmptyNote>
                ) : (
                  <div className="divide-y divide-border/70">
                    {[...activeRule.history]
                      .sort((a, b) => b.version - a.version)
                      .map((snap) => (
                        <div key={snap.version} className="py-2 text-[11px]">
                          <div className="flex items-center justify-between gap-2 font-mono">
                            <span className="font-semibold">
                              v{snap.version} · {snap.status.toUpperCase()}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(snap.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                            {snap.expression}
                          </div>
                          <p className="mt-0.5 text-muted-foreground">
                            {snap.change_note}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            By {snap.author}
                            {snap.reviewed_by ? ` · Reviewed by ${snap.reviewed_by}` : ""}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </CalculationEngineShell>
  );
}
