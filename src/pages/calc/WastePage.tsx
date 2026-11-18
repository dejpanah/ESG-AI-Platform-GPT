import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { useState } from "react";

export default function WastePage() {
  const {
    view,
    loading,
    mutating,
    error,
    reload,
    addRecord,
    removeRecord,
    patchConfig,
  } = useCalcEngine("waste");

  const [recycledInput, setRecycledInput] = useState("");
  const [pkgRecovered, setPkgRecovered] = useState("");

  const currRecycled = String(
    recycledInput || view?.config.recycled_input_materials_tonnes || "8420",
  );
  const currPkg = String(
    pkgRecovered || view?.config.packaging_recovered_pct || "74.5",
  );

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Waste Volume (tonnes)"
      controlsSlot={
        <Panel
          title="Material Circularity Indicator (MCI) & Packaging Inputs"
          description="Adjust recycled feedstock/material inputs and closed-loop industrial packaging recovery rate to recompute Material Circularity"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-[10.5px] font-medium text-muted-foreground">
                Recycled Material Inputs (t)
              </span>
              <Input
                type="number"
                value={currRecycled}
                onChange={(e) => setRecycledInput(e.target.value)}
                className="h-8 w-40 font-mono text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[10.5px] font-medium text-muted-foreground">
                Packaging Recovered (%)
              </span>
              <Input
                type="number"
                step="0.1"
                value={currPkg}
                onChange={(e) => setPkgRecovered(e.target.value)}
                className="h-8 w-36 font-mono text-xs"
              />
            </label>
            <Button
              size="sm"
              disabled={mutating}
              className="h-8 px-4 text-xs"
              onClick={() =>
                void patchConfig(
                  {
                    recycled_input_materials_tonnes: Number(currRecycled) || 0,
                    packaging_recovered_pct: Number(currPkg) || 0,
                  },
                  "Material circularity & packaging parameters updated",
                )
              }
            >
              Recalculate Circularity
            </Button>
          </div>
        </Panel>
      }
    >
      <CalcLedgerPanel
        title="Hazardous / Non-Hazardous Waste, Spent Catalysts, ETP Sludge & Disposal Routes"
        description="Complete manifest ledger tracking waste streams, hazard classification, disposal/recovery routes, and licensed contractors"
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Waste manifest added & circularity updated")}
        onDelete={removeRecord}
        columns={[
          { key: "waste_stream", label: "Waste / Material Stream" },
          { key: "hazard_class", label: "Classification" },
          { key: "disposal_route", label: "Disposal / Recovery Route" },
          { key: "tonnes", label: "Mass (t)", numeric: true },
          {
            key: "recovered",
            label: "Diverted / Circular",
            render: (v) => (v ? "Recovered" : "Disposed"),
          },
          { key: "contractor", label: "Treatment Partner" },
        ]}
        fields={[
          { key: "waste_stream", label: "Waste Stream", type: "text", required: true, placeholder: "e.g., Spent Zeolite Catalyst" },
          {
            key: "hazard_class",
            label: "Hazard Class",
            type: "select",
            required: true,
            options: [
              { label: "Hazardous", value: "Hazardous" },
              { label: "Non-Hazardous", value: "Non-Hazardous" },
            ],
          },
          { key: "disposal_route", label: "Disposal Route", type: "text", required: true, defaultValue: "Metal Recovery & Recycling" },
          { key: "tonnes", label: "Quantity (tonnes)", type: "number", required: true, defaultValue: 85 },
          { key: "recovered", label: "Diverted / Recycled?", type: "boolean", defaultValue: true },
          { key: "contractor", label: "Contractor", type: "text", defaultValue: "Licensed Recovery Facility" },
        ]}
      />
    </CalculationEngineShell>
  );
}
