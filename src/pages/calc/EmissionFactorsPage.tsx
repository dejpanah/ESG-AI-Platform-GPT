import {
  createEmissionFactor,
  reviseEmissionFactor,
  type EmissionFactorItem,
} from "@/api/calc-engines";
import { CalcBulkImportPanel } from "@/components/calc/CalcBulkImportPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { ValidationSparkline } from "@/components/calc/ValidationSparkline";
import { EmptyNote, Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { EMISSION_FACTORS_FIELDS } from "@/lib/calc-bulk-csv";
import { cn } from "@/lib/utils";
import { History, Plus, Search, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const STANDARDS = [
  "All",
  "IPCC 2006",
  "DEFRA",
  "EPA",
  "IEA",
  "Site-Specific",
  "Lab-Specific",
] as const;

export default function EmissionFactorsPage() {
  const { view, setView, loading, error, reload } =
    useCalcEngine("emission-factors");

  const [standardFilter, setStandardFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [revisingFactorId, setRevisingFactorId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Create factor fields
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Scope 1 · Stationary");
  const [newStandard, setNewStandard] =
    useState<EmissionFactorItem["source_standard"]>("Site-Specific");
  const [newValue, setNewValue] = useState("0.055");
  const [newUnit, setNewUnit] = useState("tCO2e/GJ");
  const [newValidFrom, setNewValidFrom] = useState("2025-01-01");
  const [newUncertainty, setNewUncertainty] = useState("2.5");
  const [newNotes, setNewNotes] = useState("");

  // Revise factor fields
  const [revValue, setRevValue] = useState("");
  const [revValidFrom, setRevValidFrom] = useState("2025-04-01");
  const [revUncertainty, setRevUncertainty] = useState("2.0");
  const [revNotes, setRevNotes] = useState("");

  const factors = useMemo(
    () => (view?.extra?.factors as EmissionFactorItem[] | undefined) ?? [],
    [view],
  );

  const filteredFactors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return factors.filter((f) => {
      if (standardFilter !== "All" && f.source_standard !== standardFilter) {
        return false;
      }
      if (!q) return true;
      return (
        f.code.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
      );
    });
  }, [factors, standardFilter, search]);

  const activeFactor = useMemo(
    () =>
      filteredFactors.find((f) => f.id === selectedId) ??
      filteredFactors[0] ??
      null,
    [filteredFactors, selectedId],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) {
      toast.error("Code and Name are required");
      return;
    }
    setSaving(true);
    try {
      const updated = await createEmissionFactor({
        code: newCode.trim(),
        name: newName.trim(),
        category: newCategory.trim(),
        source_standard: newStandard,
        value: Number(newValue),
        unit: newUnit.trim(),
        valid_from: newValidFrom,
        uncertainty_pct: Number(newUncertainty),
        notes: newNotes.trim(),
      });
      setView(updated);
      setShowCreate(false);
      setNewCode("");
      setNewName("");
      toast.success("Emission factor registered at v1");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add factor");
    } finally {
      setSaving(false);
    }
  };

  const handleRevise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisingFactorId) return;
    setSaving(true);
    try {
      const updated = await reviseEmissionFactor(revisingFactorId, {
        value: Number(revValue),
        valid_from: revValidFrom,
        uncertainty_pct: Number(revUncertainty),
        notes: revNotes.trim(),
      });
      setView(updated);
      setRevisingFactorId(null);
      toast.success("New emission factor version created & audited");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revise factor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      onUpdateView={setView}
      chartPrimaryLabel="Factor Count"
      controlsSlot={
        <Panel
          title="Standard & Provenance Filter"
          description="Filter verified emission factors across IPCC 2006, DEFRA, EPA, IEA, site-specific online CEMS/GC, and ISO 17025 lab assays"
          actions={
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={showBulkImport ? "secondary" : "outline"}
                className="h-7 gap-1 px-2.5 text-xs whitespace-nowrap shrink-0"
                onClick={() => {
                  setShowBulkImport((v) => !v);
                  if (!showBulkImport) setShowCreate(false);
                }}
              >
                {showBulkImport ? (
                  <X className="size-3.5" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {showBulkImport ? "Close Bulk Import" : "Bulk Import CSV"}
              </Button>
              <Button
                size="sm"
                variant={showCreate ? "secondary" : "default"}
                className="h-7 px-2.5 text-xs whitespace-nowrap shrink-0"
                onClick={() => {
                  setShowCreate((v) => !v);
                  if (!showCreate) setShowBulkImport(false);
                }}
              >
                {showCreate ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
                {showCreate ? "Close" : "Register Factor"}
              </Button>
            </div>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {STANDARDS.map((std) => (
                <button
                  key={std}
                  type="button"
                  onClick={() => setStandardFilter(std)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                    standardFilter === std
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {std}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or fuel…"
                className="h-7 w-52 pl-7 text-xs"
              />
            </div>
          </div>

          {showCreate && (
            <form
              onSubmit={(e) => void handleCreate(e)}
              className="mt-3 rounded-md border border-border bg-background p-3"
            >
              <p className="mb-2 text-xs font-semibold">
                Register New Auditable Emission Factor (v1)
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  placeholder="Code (e.g., EF-NAPHTHA-LAB)"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  required
                  className="h-8 text-xs font-mono"
                />
                <Input
                  placeholder="Factor Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
                <Input
                  placeholder="Category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="h-8 text-xs"
                />
                <select
                  value={newStandard}
                  onChange={(e) =>
                    setNewStandard(
                      e.target.value as EmissionFactorItem["source_standard"],
                    )
                  }
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  {STANDARDS.slice(1).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="any"
                    placeholder="Numeric Value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    required
                    className="h-8 flex-1 min-w-0 text-xs font-mono"
                  />
                  <ValidationSparkline
                    history={[0.045, 0.048, 0.052, 0.055, 0.054]}
                    currentValue={newValue ? Number(newValue) : null}
                    unit={newUnit || ""}
                    fieldLabel="Factor Value"
                    width={85}
                    height={28}
                    showBadge={false}
                  />
                </div>
                <Input
                  placeholder="Unit (e.g., tCO2e/t)"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
                <Input
                  type="date"
                  value={newValidFrom}
                  onChange={(e) => setNewValidFrom(e.target.value)}
                  required
                  className="h-8 text-xs font-mono"
                />
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Uncertainty %"
                    value={newUncertainty}
                    onChange={(e) => setNewUncertainty(e.target.value)}
                    className="h-8 flex-1 min-w-0 text-xs font-mono"
                  />
                  <ValidationSparkline
                    history={[1.5, 2.0, 2.2, 2.5, 2.8]}
                    currentValue={newUncertainty ? Number(newUncertainty) : null}
                    unit="%"
                    fieldLabel="Uncertainty"
                    width={80}
                    height={28}
                    showBadge={false}
                  />
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <Input
                  placeholder="Audit justification / Lab report reference"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="h-8 flex-1 text-xs"
                />
                <Button type="submit" size="sm" disabled={saving} className="h-8 px-4 text-xs">
                  Register v1
                </Button>
              </div>
            </form>
          )}

          {showBulkImport && (
            <CalcBulkImportPanel
              slug="emission-factors"
              engineTitle={view?.title ?? "Emission Factor Library"}
              fields={EMISSION_FACTORS_FIELDS}
              onClose={() => setShowBulkImport(false)}
              onCommitted={(updated) => setView(updated)}
            />
          )}
        </Panel>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Emission Factor Registry"
          description="Click any factor to inspect its dated version lineage or publish a revised version"
        >
          {filteredFactors.length === 0 ? (
            <EmptyNote>No emission factors match your filter.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11.5px]">
                <thead>
                  <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                    <th className="px-2 py-2 text-left">Code</th>
                    <th className="px-2 py-2 text-left">Factor Name</th>
                    <th className="px-2 py-2 text-left">Standard</th>
                    <th className="px-2 py-2 text-right">Value</th>
                    <th className="px-2 py-2 text-left">Unit</th>
                    <th className="px-2 py-2 text-right">Ver</th>
                    <th className="px-2 py-2 text-right">Valid From</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredFactors.map((f) => {
                    const isSel = activeFactor?.id === f.id;
                    return (
                      <tr
                        key={f.id}
                        onClick={() => setSelectedId(f.id)}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/40",
                          isSel && "bg-muted/60",
                        )}
                      >
                        <td className="px-2 py-2 font-mono text-[11px] font-semibold">
                          {f.code}
                        </td>
                        <td className="px-2 py-2">{f.name}</td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {f.source_standard}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {f.value}
                        </td>
                        <td className="px-2 py-2 font-mono text-[10.5px]">
                          {f.unit}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          v{f.current_version}
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums">
                          {f.valid_from}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title={
            activeFactor
              ? `Version Lineage: ${activeFactor.code}`
              : "Factor Version History"
          }
          description={
            activeFactor
              ? `${activeFactor.name} · ${activeFactor.source_standard} · ±${activeFactor.uncertainty_pct}% uncertainty`
              : "Select an emission factor"
          }
          actions={
            activeFactor && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs whitespace-nowrap shrink-0"
                onClick={() => {
                  setRevisingFactorId(activeFactor.id);
                  setRevValue(String(activeFactor.value));
                  setRevUncertainty(String(activeFactor.uncertainty_pct));
                  setRevNotes("");
                }}
              >
                <History className="size-3.5" />
                Publish v{activeFactor.current_version + 1}
              </Button>
            )
          }
        >
          {!activeFactor ? (
            <EmptyNote>Select an emission factor to view its dated version audit history.</EmptyNote>
          ) : (
            <div className="space-y-3">
              {revisingFactorId === activeFactor.id && (
                <form
                  onSubmit={(e) => void handleRevise(e)}
                  className="space-y-2 rounded-md border border-border bg-background p-3"
                >
                  <p className="text-xs font-semibold">
                    Create Revision v{activeFactor.current_version + 1} (Previous v
                    {activeFactor.current_version} stays archived)
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        step="any"
                        value={revValue}
                        onChange={(e) => setRevValue(e.target.value)}
                        required
                        placeholder="New value"
                        className="h-8 flex-1 min-w-0 font-mono text-xs"
                      />
                      <ValidationSparkline
                        history={activeFactor.versions.map((v) => v.value)}
                        currentValue={revValue ? Number(revValue) : null}
                        unit={activeFactor.unit}
                        fieldLabel={`${activeFactor.code} Versions`}
                        width={85}
                        height={28}
                        showBadge={false}
                      />
                    </div>
                    <Input
                      type="date"
                      value={revValidFrom}
                      onChange={(e) => setRevValidFrom(e.target.value)}
                      required
                      className="h-8 font-mono text-xs"
                    />
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        step="0.1"
                        value={revUncertainty}
                        onChange={(e) => setRevUncertainty(e.target.value)}
                        placeholder="Uncertainty %"
                        className="h-8 flex-1 min-w-0 font-mono text-xs"
                      />
                      <ValidationSparkline
                        history={activeFactor.versions.map((v) => v.uncertainty_pct)}
                        currentValue={revUncertainty ? Number(revUncertainty) : null}
                        unit="%"
                        fieldLabel="Uncertainty"
                        width={80}
                        height={28}
                        showBadge={false}
                      />
                    </div>
                  </div>
                  <Input
                    value={revNotes}
                    onChange={(e) => setRevNotes(e.target.value)}
                    placeholder="Reason for revision (e.g., Q2 GC assay update)"
                    required
                    className="h-8 text-xs"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={saving} className="h-7 text-xs">
                      Save v{activeFactor.current_version + 1}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setRevisingFactorId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              <div className="divide-y divide-border/70">
                {[...activeFactor.versions]
                  .sort((a, b) => b.version - a.version)
                  .map((v) => (
                    <div key={v.version} className="py-2.5 text-[11.5px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-semibold">
                          v{v.version} · {v.value} {v.unit}
                          {v.version === activeFactor.current_version
                            ? " (Active)"
                            : " (Superseded)"}
                        </span>
                        <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                          {v.valid_from} → {v.valid_to || "Present"}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{v.notes}</p>
                      <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-muted-foreground">
                        <span>{v.source}</span>
                        <span>·</span>
                        <span>±{v.uncertainty_pct}% CI</span>
                        <span>·</span>
                        <span>{v.updated_by}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </CalculationEngineShell>
  );
}
