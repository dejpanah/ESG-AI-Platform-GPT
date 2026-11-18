import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { Panel } from "@/components/system/panels";
import { useCalcEngine } from "@/hooks/use-calc-engine";

export default function WaterPage() {
  const { view, loading, mutating, error, reload, addRecord, removeRecord } =
    useCalcEngine("water");

  const codLimit = Number(view?.config.cod_limit_mg_l ?? 120);
  const tdsLimit = Number(view?.config.tds_limit_mg_l ?? 2000);
  const phenolsLimit = Number(view?.config.phenols_limit_mg_l ?? 0.5);
  const metalsLimit = Number(view?.config.heavy_metals_limit_mg_l ?? 0.2);

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Withdrawal (m³)"
      chartSecondaryLabel="Consumption (m³)"
      controlsSlot={
        <Panel
          title="Effluent Quality Statutory Thresholds & WRI Aqueduct Reference"
          description="Regulatory discharge limits applied to ETP lab assays alongside WRI Aqueduct 4.0 basin water stress tiers"
        >
          <div className="flex flex-wrap gap-6 text-[11.5px] font-mono tabular-nums">
            <span>COD Limit: &le; {codLimit} mg/L</span>
            <span>TDS Limit: &le; {tdsLimit} mg/L</span>
            <span>Phenols Limit: &le; {phenolsLimit} mg/L</span>
            <span>Heavy Metals Limit: &le; {metalsLimit} mg/L</span>
          </div>
        </Panel>
      }
    >
      <CalcLedgerPanel
        title="Facility Water Balance, Produced Water, Effluent Quality & Basin Stress"
        description="Tracks Withdrawal, Consumption, Discharge, Produced Water, Reuse, COD/TDS/Phenols/Heavy Metals, and WRI Aqueduct score"
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Water & effluent assay logged")}
        onDelete={removeRecord}
        columns={[
          { key: "facility", label: "Facility" },
          { key: "basin_name", label: "WRI Basin" },
          { key: "wri_stress_tier", label: "Aqueduct Stress" },
          { key: "withdrawal_m3", label: "Withdrawal (m³)", numeric: true },
          { key: "produced_water_m3", label: "Produced Water (m³)", numeric: true },
          { key: "reused_m3", label: "Reused (m³)", numeric: true },
          { key: "discharge_m3", label: "Discharge (m³)", numeric: true },
          { key: "consumption_m3", label: "Consumption (m³)", numeric: true },
          { key: "cod_mg_l", label: "COD (mg/L)", numeric: true },
          { key: "tds_mg_l", label: "TDS (mg/L)", numeric: true },
          { key: "phenols_mg_l", label: "Phenols", numeric: true },
          { key: "heavy_metals_mg_l", label: "Metals", numeric: true },
        ]}
        fields={[
          { key: "facility", label: "Facility", type: "text", required: true, placeholder: "e.g., Polymer Utility Loop B" },
          { key: "basin_name", label: "Watershed / Basin", type: "text", required: true, defaultValue: "Coastal Arid Basin #14" },
          { key: "wri_stress_score", label: "WRI Stress Score (0-5)", type: "number", required: true, defaultValue: 3.6 },
          { key: "wri_stress_tier", label: "WRI Stress Tier", type: "text", defaultValue: "High (40-80%)" },
          { key: "withdrawal_m3", label: "Withdrawal (m³)", type: "number", required: true, defaultValue: 12000 },
          { key: "produced_water_m3", label: "Produced Water (m³)", type: "number", defaultValue: 1500 },
          { key: "reused_m3", label: "Reused (m³)", type: "number", defaultValue: 4200 },
          { key: "discharge_m3", label: "Discharge (m³)", type: "number", required: true, defaultValue: 6800 },
          { key: "cod_mg_l", label: "COD (mg/L)", type: "number", defaultValue: 64 },
          { key: "tds_mg_l", label: "TDS (mg/L)", type: "number", defaultValue: 1350 },
          { key: "phenols_mg_l", label: "Phenols (mg/L)", type: "number", defaultValue: 0.14 },
          { key: "heavy_metals_mg_l", label: "Heavy Metals (mg/L)", type: "number", defaultValue: 0.05 },
        ]}
      />
    </CalculationEngineShell>
  );
}
