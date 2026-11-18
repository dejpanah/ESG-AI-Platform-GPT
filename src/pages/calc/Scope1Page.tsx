import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { Panel } from "@/components/system/panels";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const SCOPE1_CATEGORIES = [
  "All Categories",
  "Stationary Combustion",
  "Mobile Combustion",
  "Flaring",
  "Fugitive Emissions",
  "Process Emissions",
  "Gas Processing",
  "Non-Energy CO2 (Feedstock)",
] as const;

export default function Scope1Page() {
  const { view, loading, mutating, error, reload, addRecord, removeRecord } =
    useCalcEngine("scope-1");
  const [catFilter, setCatFilter] = useState<string>("All Categories");

  const filteredRecords = useMemo(() => {
    if (!view) return [];
    if (catFilter === "All Categories") return view.records;
    return view.records.filter((r) => r.source_category === catFilter);
  }, [view, catFilter]);

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Emissions (tCO2e)"
      controlsSlot={
        <Panel
          title="Scope 1 Source Boundary Filter"
          description="Filter direct GHG inventory across combustion, flaring, fugitive LDAR, gas processing, and non-energy feedstock CO₂"
        >
          <div className="flex flex-wrap gap-1.5">
            {SCOPE1_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter(cat)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                  catFilter === cat
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </Panel>
      }
    >
      <CalcLedgerPanel
        title="Scope 1 Direct Emissions Ledger"
        description="Calculated as Activity × Emission Factor + CH₄/N₂O GWP conversion"
        records={filteredRecords}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Scope 1 source logged & recalculated")}
        onDelete={removeRecord}
        columns={[
          { key: "unit_name", label: "Source / Asset Unit" },
          { key: "source_category", label: "Scope 1 Category" },
          { key: "fuel_or_stream", label: "Fuel / Feedstock Stream" },
          { key: "activity_amount", label: "Activity", numeric: true },
          { key: "activity_unit", label: "Unit" },
          { key: "ef_value", label: "EF", numeric: true },
          { key: "co2_tonnes", label: "CO₂ (t)", numeric: true },
          { key: "ch4_tonnes", label: "CH₄ (t)", numeric: true },
          { key: "total_tco2e", label: "Total tCO₂e", numeric: true },
          { key: "factor_ref", label: "Factor Ref" },
        ]}
        fields={[
          { key: "unit_name", label: "Unit / Equipment", type: "text", required: true, placeholder: "e.g., Auxiliary Boiler B-305" },
          {
            key: "source_category",
            label: "Category",
            type: "select",
            required: true,
            options: SCOPE1_CATEGORIES.slice(1).map((c) => ({ label: c, value: c })),
          },
          { key: "equipment_type", label: "Equipment Type", type: "text", placeholder: "Boiler / Furnace / Turbine" },
          { key: "fuel_or_stream", label: "Fuel / Stream", type: "text", required: true, placeholder: "Natural Gas" },
          { key: "activity_amount", label: "Activity Quantity", type: "number", required: true, defaultValue: 10000 },
          { key: "activity_unit", label: "Activity Unit", type: "text", required: true, defaultValue: "MMBtu" },
          { key: "ef_value", label: "Emission Factor", type: "number", required: true, defaultValue: 0.0531 },
          { key: "ch4_tonnes", label: "CH₄ (tonnes)", type: "number", defaultValue: 0.05 },
          { key: "n2o_tonnes", label: "N₂O (tonnes)", type: "number", defaultValue: 0.01 },
          { key: "factor_ref", label: "Factor Reference", type: "text", defaultValue: "EF-NG-IPCC06" },
        ]}
      />
    </CalculationEngineShell>
  );
}
