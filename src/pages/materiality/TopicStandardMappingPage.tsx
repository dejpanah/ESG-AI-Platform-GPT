import {
  updateTopicStandardMapping,
  type TopicStandardMapping,
} from "@/api/materiality";
import { MaterialityShell } from "@/components/materiality/MaterialityShell";
import { EmptyNote, Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMateriality } from "@/hooks/use-materiality";
import { cn } from "@/lib/utils";
import { ExternalLink, Save, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
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

const CALC_ENGINE_OPTIONS = [
  { value: "/calc/scope-1", label: "01. Scope 1 / 02. Scope 2 / 03. Scope 3 Engines" },
  { value: "/calc/emission-factors", label: "04. Emission Factor Library" },
  { value: "/calc/methane", label: "05. Methane Accounting & 06. Flaring Engines" },
  { value: "/calc/carbon-intensity", label: "07. Carbon Intensity Engine" },
  { value: "/calc/water", label: "08. Water Accounting Engine" },
  { value: "/calc/waste", label: "09. Waste & Materials Engine" },
  { value: "/calc/air-emissions", label: "10. Air Emissions Calculation Engine" },
  { value: "/calc/safety-hse", label: "11. Safety & HSE Calculation Engine" },
  { value: "/calc/social-capital", label: "12. Social & Human Capital Engine" },
  { value: "/calc/governance", label: "13. Governance Calculation Engine" },
] as const;

interface MappingDraft {
  esrsText?: string;
  griText?: string;
  sasbText?: string;
  industryText?: string;
  mandatoryCount?: string;
  coveredCount?: string;
  assuranceStatus?: TopicStandardMapping["assurance_status"];
  linkedEngine?: string;
  mappingNotes?: string;
}

export default function TopicStandardMappingPage() {
  const { state, setState, loading, error, reload } = useMateriality();

  const [scopeFilter, setScopeFilter] = useState<
    "all" | "material" | "double"
  >("all");
  const [search, setSearch] = useState("");
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<MappingDraft>({});

  const filteredMappings = useMemo(() => {
    const list = state?.standard_mappings ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((m) => {
      if (
        scopeFilter === "material" &&
        m.classification === "Not Material (Monitored)"
      ) {
        return false;
      }
      if (
        scopeFilter === "double" &&
        m.classification !== "Double Material"
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        m.topic_code,
        m.topic_name,
        ...m.esrs_standards,
        ...m.gri_standards,
        ...m.sasb_metrics,
        ...m.industry_metrics,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [state, scopeFilter, search]);

  const activeMapping = useMemo(() => {
    if (!filteredMappings.length) return null;
    return (
      filteredMappings.find((m) => m.id === selectedMappingId) ??
      filteredMappings[0]
    );
  }, [filteredMappings, selectedMappingId]);

  const selectMapping = (id: string) => {
    setSelectedMappingId(id);
    setDraft({});
  };

  const esrsText =
    draft.esrsText ?? activeMapping?.esrs_standards.join("; ") ?? "";
  const griText =
    draft.griText ?? activeMapping?.gri_standards.join("; ") ?? "";
  const sasbText =
    draft.sasbText ?? activeMapping?.sasb_metrics.join("; ") ?? "";
  const industryText =
    draft.industryText ?? activeMapping?.industry_metrics.join("; ") ?? "";
  const mandatoryCount =
    draft.mandatoryCount ??
    String(activeMapping?.mandatory_datapoints_count ?? 20);
  const coveredCount =
    draft.coveredCount ??
    String(activeMapping?.covered_datapoints_count ?? 20);
  const assuranceStatus =
    draft.assuranceStatus ??
    activeMapping?.assurance_status ??
    "Reasonable Assurance Ready";
  const linkedEngine =
    draft.linkedEngine ?? activeMapping?.linked_calc_engine ?? "/calc/scope-1";
  const mappingNotes =
    draft.mappingNotes ?? activeMapping?.mapping_notes ?? "";

  const setEsrsText = (v: string) => setDraft((p) => ({ ...p, esrsText: v }));
  const setGriText = (v: string) => setDraft((p) => ({ ...p, griText: v }));
  const setSasbText = (v: string) => setDraft((p) => ({ ...p, sasbText: v }));
  const setIndustryText = (v: string) =>
    setDraft((p) => ({ ...p, industryText: v }));
  const setMandatoryCount = (v: string) =>
    setDraft((p) => ({ ...p, mandatoryCount: v }));
  const setCoveredCount = (v: string) =>
    setDraft((p) => ({ ...p, coveredCount: v }));
  const setAssuranceStatus = (
    v: TopicStandardMapping["assurance_status"],
  ) => setDraft((p) => ({ ...p, assuranceStatus: v }));
  const setLinkedEngine = (v: string) =>
    setDraft((p) => ({ ...p, linkedEngine: v }));
  const setMappingNotes = (v: string) =>
    setDraft((p) => ({ ...p, mappingNotes: v }));

  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMapping) return;
    setSaving(true);
    try {
      const matchedEngine = CALC_ENGINE_OPTIONS.find(
        (o) => o.value === linkedEngine,
      );
      const updated = await updateTopicStandardMapping(activeMapping.id, {
        esrs_standards: esrsText,
        gri_standards: griText,
        sasb_metrics: sasbText,
        industry_metrics: industryText,
        mandatory_datapoints_count: Number(mandatoryCount) || 0,
        covered_datapoints_count: Number(coveredCount) || 0,
        assurance_status: assuranceStatus,
        linked_calc_engine: linkedEngine,
        linked_calc_label:
          matchedEngine?.label ?? activeMapping.linked_calc_label,
        mapping_notes: mappingNotes.trim(),
      });
      setState(updated);
      setDraft({});
      toast.success(
        `Updated ESRS / GRI / SASB / Industry mapping for ${activeMapping.topic_code}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save standard mapping",
      );
    } finally {
      setSaving(false);
    }
  };

  const coverageChartData = useMemo(
    () =>
      filteredMappings.map((m) => ({
        code: m.topic_code.replace("ESRS-", ""),
        Covered: m.covered_datapoints_count,
        Gap: Math.max(
          0,
          m.mandatory_datapoints_count - m.covered_datapoints_count,
        ),
        ESRS_Count: m.esrs_standards.length,
        GRI_Count: m.gri_standards.length,
        SASB_Count: m.sasb_metrics.length,
        Industry_Count: m.industry_metrics.length,
      })),
    [filteredMappings],
  );

  return (
    <MaterialityShell
      title="Topic-to-Standard Interoperability Mapping"
      subtitle="Trace every material topic across ESRS Set 1 disclosure requirements, GRI Universal & Oil/Gas Sector Standards, ISSB/SASB Refining & Chemicals codes, and IPIECA / OGMP 2.0 / API RP 754 industry metrics."
      frameworkBadge="EFRAG-GRI & EFRAG-ISSB Interoperability · IPIECA"
      state={state}
      loading={loading}
      error={error}
      onReload={() => void reload()}
    >
      {/* Filter & Search Bar */}
      <Panel
        title="Cross-Standard Concordance Filter"
        description="Filter topics by materiality scope or search by standard code (e.g., E1-6, GRI 305, RT-CH-110a.1, OGMP 2.0, API 754)"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "All Assessed Topics" },
                { id: "material", label: "Material Topics Only (CSRD Scope)" },
                { id: "double", label: "Double Material Core" },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setScopeFilter(btn.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  scopeFilter === btn.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ESRS, GRI, SASB, IPIECA code…"
              className="h-8 w-72 pl-8 text-xs"
            />
          </div>
        </div>
      </Panel>

      {/* Top 2-Column Split: Datapoint Coverage Chart + Active Topic Mapping Editor */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)]">
        <Panel
          title="CSRD Mandatory Datapoint Coverage by Material Topic"
          description="Quantitative readiness of required EFRAG IG 3 datapoints vs. open remediation gaps"
        >
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={coverageChartData}
                layout="vertical"
                margin={{ top: 8, right: 20, bottom: 8, left: 16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.16)"
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                />
                <YAxis
                  type="category"
                  dataKey="code"
                  width={68}
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
                  dataKey="Covered"
                  stackId="dp"
                  name="Covered Datapoints"
                  fill="#10b981"
                  radius={[0, 2, 2, 0]}
                />
                <Bar
                  dataKey="Gap"
                  stackId="dp"
                  name="Open Datapoint Gap"
                  fill="#f59e0b"
                  radius={[0, 2, 2, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title={
            activeMapping
              ? `Standard Mapping Editor: ${activeMapping.topic_code}`
              : "Standard Mapping Editor"
          }
          description={
            activeMapping
              ? `${activeMapping.topic_name} · ${activeMapping.classification}`
              : "Select a topic row to edit its cross-standard disclosures"
          }
          actions={
            activeMapping && (
              <Link
                to={activeMapping.linked_calc_engine}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <ExternalLink className="size-3" />
                Open Linked Calc Engine
              </Link>
            )
          }
        >
          {activeMapping ? (
            <form
              onSubmit={(e) => void handleSaveMapping(e)}
              className="space-y-2.5 text-xs"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="term-dim block text-[10px] uppercase">
                    ESRS Disclosure Requirements (; separated)
                  </label>
                  <Input
                    value={esrsText}
                    onChange={(e) => setEsrsText(e.target.value)}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="term-dim block text-[10px] uppercase">
                    GRI Standards (; separated)
                  </label>
                  <Input
                    value={griText}
                    onChange={(e) => setGriText(e.target.value)}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="term-dim block text-[10px] uppercase">
                    SASB Sector Metrics (; separated)
                  </label>
                  <Input
                    value={sasbText}
                    onChange={(e) => setSasbText(e.target.value)}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="term-dim block text-[10px] uppercase">
                    Industry Metrics (IPIECA / OGMP 2.0 / API 754)
                  </label>
                  <Input
                    value={industryText}
                    onChange={(e) => setIndustryText(e.target.value)}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <div>
                  <label className="term-dim block text-[10px] uppercase">
                    Mandatory DPs
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={mandatoryCount}
                    onChange={(e) => setMandatoryCount(e.target.value)}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="term-dim block text-[10px] uppercase">
                    Covered DPs
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={coveredCount}
                    onChange={(e) => setCoveredCount(e.target.value)}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="term-dim block text-[10px] uppercase">
                    Assurance Readiness
                  </label>
                  <select
                    value={assuranceStatus}
                    onChange={(e) =>
                      setAssuranceStatus(
                        e.target
                          .value as TopicStandardMapping["assurance_status"],
                      )
                    }
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="Reasonable Assurance Ready">
                      Reasonable Assurance Ready
                    </option>
                    <option value="Limited Assurance Ready">
                      Limited Assurance Ready
                    </option>
                    <option value="Gap Remediation">Gap Remediation</option>
                    <option value="Monitored Only">Monitored Only</option>
                  </select>
                </div>
                <div>
                  <label className="term-dim block text-[10px] uppercase">
                    Linked Calc Engine
                  </label>
                  <select
                    value={linkedEngine}
                    onChange={(e) => setLinkedEngine(e.target.value)}
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {CALC_ENGINE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Input
                  value={mappingNotes}
                  onChange={(e) => setMappingNotes(e.target.value)}
                  placeholder="Audit traceability & methodology mapping notes..."
                  className="h-8 flex-1 text-xs"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="h-8 gap-1.5 text-xs whitespace-nowrap"
                >
                  <Save className="size-3.5" />
                  Save Standard Mapping
                </Button>
              </div>
            </form>
          ) : (
            <EmptyNote>No topic mapping matches your filter.</EmptyNote>
          )}
        </Panel>
      </div>

      {/* Master Topic-to-Standard Concordance Table */}
      <Panel
        title="Master Topic-to-Standard Concordance Matrix (ESRS · GRI · SASB · Industry)"
        description="Click any row to edit its disclosure links or jump directly to the underlying quantitative Calculation Engine"
      >
        {filteredMappings.length === 0 ? (
          <EmptyNote>No topic mappings match your filter criteria.</EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-2.5 py-2 text-left">Material Topic</th>
                  <th className="px-2.5 py-2 text-left">ESRS Set 1</th>
                  <th className="px-2.5 py-2 text-left">GRI Standards</th>
                  <th className="px-2.5 py-2 text-left">SASB Metrics</th>
                  <th className="px-2.5 py-2 text-left">
                    Industry (IPIECA / OGMP / API)
                  </th>
                  <th className="px-2.5 py-2 text-right">Datapoints</th>
                  <th className="px-2.5 py-2 text-left">Assurance & Engine</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredMappings.map((m) => {
                  const isSel = activeMapping?.id === m.id;
                  const pct =
                    m.mandatory_datapoints_count > 0
                      ? Math.round(
                          (m.covered_datapoints_count /
                            m.mandatory_datapoints_count) *
                            100,
                        )
                      : 100;
                  return (
                    <tr
                      key={m.id}
                      onClick={() => selectMapping(m.id)}
                      className={cn(
                        "cursor-pointer align-top transition-colors hover:bg-muted/40",
                        isSel && "bg-muted/60",
                      )}
                    >
                      <td className="px-2.5 py-2.5">
                        <p className="font-mono text-[11px] font-semibold">
                          {m.topic_code}
                        </p>
                        <p className="font-medium text-foreground">
                          {m.topic_name}
                        </p>
                        <p className="term-dim mt-0.5 text-[10.5px]">
                          {m.classification}
                        </p>
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-[10.5px] text-foreground/90">
                        <ul className="space-y-0.5">
                          {m.esrs_standards.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-[10.5px] text-muted-foreground">
                        <ul className="space-y-0.5">
                          {m.gri_standards.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-[10.5px] text-amber-400/90">
                        <ul className="space-y-0.5">
                          {m.sasb_metrics.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-2.5 py-2.5 text-[11px] text-muted-foreground">
                        <ul className="space-y-0.5">
                          {m.industry_metrics.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-mono tabular-nums">
                        <span className="font-semibold text-foreground">
                          {m.covered_datapoints_count} /{" "}
                          {m.mandatory_datapoints_count}
                        </span>
                        <p className="term-dim text-[10px]">{pct}% covered</p>
                      </td>
                      <td className="px-2.5 py-2.5">
                        <p
                          className={cn(
                            "text-[11px] font-medium",
                            m.assurance_status ===
                              "Reasonable Assurance Ready" &&
                              "text-emerald-400",
                            m.assurance_status === "Limited Assurance Ready" &&
                              "text-blue-400",
                            m.assurance_status === "Gap Remediation" &&
                              "text-amber-400",
                          )}
                        >
                          {m.assurance_status}
                        </p>
                        <Link
                          to={m.linked_calc_engine}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          {m.linked_calc_label}
                          <ExternalLink className="size-2.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </MaterialityShell>
  );
}
