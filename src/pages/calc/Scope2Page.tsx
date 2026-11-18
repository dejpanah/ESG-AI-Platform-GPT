import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { useState } from "react";

export default function Scope2Page() {
  const {
    view,
    loading,
    mutating,
    error,
    reload,
    addRecord,
    removeRecord,
    patchConfig,
  } = useCalcEngine("scope-2");

  const [gridLossInput, setGridLossInput] = useState<string>("");
  const currentGridLoss = String(gridLossInput || view?.config.grid_loss_pct || "5.4");

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Location-Based (tCO2e)"
      chartSecondaryLabel="Market-Based (tCO2e)"
      controlsSlot={
        <Panel
          title="Dual Accounting & Grid Loss Parameters"
          description="Adjust transmission & distribution (T&D) grid loss percentage to recalculate both Location-Based and Market-Based Scope 2 totals"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-[10.5px] font-medium text-muted-foreground">
                Grid T&amp;D Loss Factor (%)
              </span>
              <Input
                type="number"
                step="0.1"
                value={currentGridLoss}
                onChange={(e) => setGridLossInput(e.target.value)}
                className="h-8 w-36 font-mono text-xs"
              />
            </label>
            <Button
              size="sm"
              disabled={mutating}
              className="h-8 px-4 text-xs"
              onClick={() =>
                void patchConfig(
                  { grid_loss_pct: Number(currentGridLoss) || 0 },
                  "Updated T&D grid loss % and recalculated Scope 2 dual totals",
                )
              }
            >
              Apply Grid Loss %
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground font-mono tabular-nums">
              <span>Location EF: {String(view?.config.location_grid_ef_t_per_mwh ?? 0.495)} t/MWh</span>
              <span>Residual Mix EF: {String(view?.config.residual_mix_ef_t_per_mwh ?? 0.562)} t/MWh</span>
            </div>
          </div>
        </Panel>
      }
    >
      <CalcLedgerPanel
        title="Purchased Electricity, Steam, PPAs & REC / I-REC Ledger"
        description="Every entry maintains both Location-Based (grid average) and Market-Based (PPA/I-REC/residual mix) emissions"
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Scope 2 instrument added & dual totals updated")}
        onDelete={removeRecord}
        columns={[
          { key: "facility", label: "Facility / Substation" },
          { key: "energy_type", label: "Energy Carrier" },
          { key: "instrument_type", label: "Contractual Instrument (PPA/I-REC)" },
          { key: "consumption_mwh", label: "Metered (MWh)", numeric: true },
          { key: "grid_loss_mwh", label: "Grid Loss (MWh)", numeric: true },
          { key: "location_tco2e", label: "Location tCO₂e", numeric: true },
          { key: "market_tco2e", label: "Market tCO₂e", numeric: true },
          { key: "certificate_id", label: "Certificate / Registry ID" },
        ]}
        fields={[
          { key: "facility", label: "Facility", type: "text", required: true, placeholder: "e.g., Aromatics Substation" },
          {
            key: "energy_type",
            label: "Energy Type",
            type: "select",
            required: true,
            options: [
              { label: "Purchased Electricity", value: "Purchased Electricity" },
              { label: "Purchased Electricity (PPA)", value: "Purchased Electricity (PPA)" },
              { label: "Purchased Electricity (Unbundled I-REC)", value: "Purchased Electricity (Unbundled I-REC)" },
              { label: "Purchased Steam", value: "Purchased Steam" },
            ],
          },
          { key: "instrument_type", label: "Instrument", type: "text", required: true, defaultValue: "Certified I-REC" },
          { key: "consumption_mwh", label: "Consumption (MWh)", type: "number", required: true, defaultValue: 5000 },
          { key: "location_ef", label: "Location EF (tCO2e/MWh)", type: "number", required: true, defaultValue: 0.495 },
          { key: "market_ef", label: "Market EF (0 for PPA/REC)", type: "number", required: true, defaultValue: 0 },
          { key: "certificate_id", label: "PPA / I-REC Serial", type: "text", defaultValue: "IREC-2025-NEW" },
        ]}
      />
    </CalculationEngineShell>
  );
}
