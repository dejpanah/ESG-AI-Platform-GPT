import { evaluateFormulaExpression } from "@/api/calc-engines";
import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { useState } from "react";
import { toast } from "sonner";

export default function CarbonIntensityPage() {
  const {
    view,
    loading,
    mutating,
    error,
    reload,
    addRecord,
    removeRecord,
    patchConfig,
  } = useCalcEngine("carbon-intensity");

  const [formulaText, setFormulaText] = useState("");
  const [scope1Test, setScope1Test] = useState("11420");
  const [scope2Test, setScope2Test] = useState("2860");
  const [prodTest, setProdTest] = useState("16400");
  const [testResult, setTestResult] = useState<string | null>(null);

  const activeFormula = String(
    formulaText ||
      view?.config.custom_formula_expression ||
      "(scope1_tco2e + scope2_tco2e) / production_tonnes",
  );

  const handleTestAndSave = async () => {
    try {
      const ev = await evaluateFormulaExpression(activeFormula, {
        scope1_tco2e: Number(scope1Test) || 0,
        scope2_tco2e: Number(scope2Test) || 0,
        production_tonnes: Number(prodTest) || 1,
      });
      if (ev.error) {
        toast.error(`Formula error: ${ev.error}`);
        return;
      }
      setTestResult(String(ev.value));
      await patchConfig(
        { custom_formula_expression: activeFormula },
        `Custom intensity formula evaluated (${ev.value}) & saved`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to evaluate formula");
    }
  };

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Actual Intensity"
      chartLimitLabel="Sector Benchmark"
      controlsSlot={
        <Panel
          title="Configurable Custom Intensity Formula Workbench"
          description="Compose custom carbon intensity expressions using scope1_tco2e, scope2_tco2e, and production_tonnes denominators"
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-[10.5px] font-medium text-muted-foreground">
                  Custom Intensity Formula Expression
                </span>
                <Input
                  value={activeFormula}
                  onChange={(e) => setFormulaText(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={mutating}
                  onClick={() => void handleTestAndSave()}
                  className="h-7 px-3 text-xs"
                >
                  Evaluate &amp; Save Formula
                </Button>
                {testResult !== null && (
                  <span className="font-mono text-xs font-semibold tabular-nums text-[var(--term-ok)]">
                    Preview Result: {testResult} tCO₂e / unit
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">scope1_tco2e</span>
                <Input
                  type="number"
                  value={scope1Test}
                  onChange={(e) => setScope1Test(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">scope2_tco2e</span>
                <Input
                  type="number"
                  value={scope2Test}
                  onChange={(e) => setScope2Test(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">production_tonnes</span>
                <Input
                  type="number"
                  value={prodTest}
                  onChange={(e) => setProdTest(e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </label>
            </div>
          </div>
        </Panel>
      }
    >
      <CalcLedgerPanel
        title="Product, BOE & Value-Added Intensity Ledger"
        description="Tracks Ethylene, Methanol, Urea, Aromatics per-tonne intensities alongside BOE and economic GVA ratios"
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Intensity benchmark row added & computed")}
        onDelete={removeRecord}
        columns={[
          { key: "product_stream", label: "Product / Business Stream" },
          { key: "denominator_type", label: "Denominator Basis" },
          { key: "allocated_emissions_tco2e", label: "Allocated tCO₂e", numeric: true },
          { key: "denominator_value", label: "Denominator", numeric: true },
          { key: "denominator_unit", label: "Denom. Unit" },
          { key: "intensity_value", label: "Calculated Intensity", numeric: true },
          { key: "intensity_unit", label: "Unit" },
          { key: "benchmark_value", label: "Benchmark", numeric: true },
        ]}
        fields={[
          { key: "product_stream", label: "Product / Stream", type: "text", required: true, placeholder: "e.g., Propylene (Polymer Grade)" },
          {
            key: "denominator_type",
            label: "Denominator Basis",
            type: "select",
            required: true,
            options: [
              { label: "Per Tonne Product", value: "Per Tonne Product" },
              { label: "Per Barrel of Oil Equivalent", value: "Per Barrel of Oil Equivalent" },
              { label: "Per Value Added", value: "Per Value Added" },
            ],
          },
          { key: "allocated_emissions_tco2e", label: "Allocated Emissions (tCO2e)", type: "number", required: true, defaultValue: 4800 },
          { key: "denominator_value", label: "Denominator Volume / Value", type: "number", required: true, defaultValue: 6200 },
          { key: "denominator_unit", label: "Denominator Unit", type: "text", required: true, defaultValue: "t Propylene" },
          { key: "intensity_unit", label: "Intensity Unit", type: "text", required: true, defaultValue: "tCO2e / t product" },
          { key: "benchmark_value", label: "Benchmark Target", type: "number", defaultValue: 0.85 },
        ]}
      />
    </CalculationEngineShell>
  );
}
