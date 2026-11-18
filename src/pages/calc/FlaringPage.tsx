import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { useState } from "react";

export default function FlaringPage() {
  const {
    view,
    loading,
    mutating,
    error,
    reload,
    addRecord,
    removeRecord,
    patchConfig,
  } = useCalcEngine("flaring");

  const [dreTarget, setDreTarget] = useState("");
  const currentDreTarget = String(dreTarget || view?.config.benchmark_dre_pct || "98.0");

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Continuous CEMS Flared (MSCF)"
      chartSecondaryLabel="Operational Balance (MSCF)"
      controlsSlot={
        <Panel
          title="Combustion Efficiency & Reconciliation Benchmark"
          description="Configure target Flare Destruction & Removal Efficiency (DRE %) and reconcile continuous ultrasonic/CEMS flow against DCS mass balances"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-[10.5px] font-medium text-muted-foreground">
                Target DRE (%)
              </span>
              <Input
                type="number"
                step="0.1"
                value={currentDreTarget}
                onChange={(e) => setDreTarget(e.target.value)}
                className="h-8 w-32 font-mono text-xs"
              />
            </label>
            <Button
              size="sm"
              disabled={mutating}
              className="h-8 px-4 text-xs"
              onClick={() =>
                void patchConfig(
                  { benchmark_dre_pct: Number(currentDreTarget) || 98.0 },
                  "Updated Flare DRE benchmark",
                )
              }
            >
              Apply DRE Benchmark
            </Button>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              Max CEMS/Ops Variance Tolerance: ±{String(view?.config.max_reconciliation_gap_pct ?? 5)}%
            </span>
          </div>
        </Panel>
      }
    >
      <CalcLedgerPanel
        title="Flare Stack Monitoring & Mass-Balance Reconciliation"
        description="Tracks flare combustion efficiency, flare-to-production ratio, unburned CH₄ slip, and continuous CEMS vs DCS variance"
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Flare unit log added & reconciled")}
        onDelete={removeRecord}
        columns={[
          { key: "flare_unit", label: "Flare System" },
          { key: "monitoring_mode", label: "Continuous Monitoring" },
          { key: "cems_flared_mscf", label: "CEMS Flow (MSCF)", numeric: true },
          { key: "ops_balance_mscf", label: "Ops Balance (MSCF)", numeric: true },
          {
            key: "recon_gap",
            label: "Variance %",
            numeric: true,
            render: (_v, r) => {
              const cems = Number(r.cems_flared_mscf || 0);
              const ops = Number(r.ops_balance_mscf || 0);
              const pct = cems > 0 ? ((cems - ops) / cems) * 100 : 0;
              return `${pct.toFixed(2)}%`;
            },
          },
          { key: "dre_pct", label: "DRE %", numeric: true },
          { key: "production_boe", label: "Throughput (BOE)", numeric: true },
          { key: "unburned_ch4_tonnes", label: "CH₄ Slip (t)", numeric: true },
          { key: "total_tco2e", label: "Total tCO₂e", numeric: true },
        ]}
        fields={[
          { key: "flare_unit", label: "Flare Unit", type: "text", required: true, placeholder: "e.g., Polymer Purge Flare FL-401" },
          { key: "monitoring_mode", label: "Monitoring Sensor", type: "text", required: true, defaultValue: "Continuous Ultrasonic + GC" },
          { key: "cems_flared_mscf", label: "CEMS Volume (MSCF)", type: "number", required: true, defaultValue: 6400 },
          { key: "ops_balance_mscf", label: "Ops Balance (MSCF)", type: "number", required: true, defaultValue: 6250 },
          { key: "production_boe", label: "Production (BOE)", type: "number", required: true, defaultValue: 220000 },
          { key: "dre_pct", label: "Combustion Efficiency DRE (%)", type: "number", required: true, defaultValue: 98.5 },
        ]}
      />
    </CalculationEngineShell>
  );
}
