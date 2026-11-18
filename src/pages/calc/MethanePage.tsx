import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { Panel } from "@/components/system/panels";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { cn } from "@/lib/utils";

interface GwpPreset {
  label: string;
  ch4: number;
  n2o: number;
}

export default function MethanePage() {
  const {
    view,
    loading,
    mutating,
    error,
    reload,
    addRecord,
    removeRecord,
    patchConfig,
  } = useCalcEngine("methane");

  const presets = (view?.extra?.gwp_presets as Record<string, GwpPreset>) ?? {
    AR6_FOSSIL_100: { label: "IPCC AR6 Fossil (100-yr)", ch4: 29.8, n2o: 273 },
    AR6_NON_FOSSIL_100: { label: "IPCC AR6 Non-Fossil (100-yr)", ch4: 27.0, n2o: 273 },
    AR5_100: { label: "IPCC AR5 (100-yr)", ch4: 28.0, n2o: 265 },
    AR6_20YR: { label: "IPCC AR6 Short-Term (20-yr)", ch4: 82.5, n2o: 273 },
  };
  const activePreset = String(view?.config.gwp_preset ?? "AR6_FOSSIL_100");
  const activeGwp = Number(view?.config.gwp_ch4 ?? 29.8);

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Measured CH₄ (tCH₄)"
      chartSecondaryLabel="Converted CO₂e (tCO₂e)"
      controlsSlot={
        <Panel
          title="Transparent GWP Selection (IPCC AR5 / AR6)"
          description="Switch Global Warming Potential basis to transparently recalculate all OGMP 2.0 Level 4 & Level 5 methane campaigns into CO₂e"
        >
          <div className="flex flex-wrap gap-2">
            {Object.entries(presets).map(([key, p]) => {
              const selected = activePreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={mutating}
                  onClick={() =>
                    void patchConfig(
                      { gwp_preset: key, gwp_ch4: p.ch4 },
                      `Applied ${p.label} (CH₄ GWP = ${p.ch4})`,
                    )
                  }
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-left text-[11px] transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className="font-medium whitespace-nowrap">{p.label}</div>
                  <div className="font-mono text-[10px] opacity-80 tabular-nums">
                    GWP CH₄ = {p.ch4} · N₂O = {p.n2o}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      }
    >
      <CalcLedgerPanel
        title="OGMP 2.0 Level 4 & Level 5 Measurement Campaigns"
        description={`All tCH₄ records converted transparently using active factor GWP = ${activeGwp}`}
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Methane campaign added to OGMP reconciliation")}
        onDelete={removeRecord}
        columns={[
          { key: "asset_name", label: "Asset / Site Perimeter" },
          { key: "ogmp_level", label: "OGMP 2.0 Level" },
          { key: "modality", label: "Measurement Modality" },
          { key: "ch4_tonnes", label: "CH₄ (t)", numeric: true },
          {
            key: "co2e_converted",
            label: `CO₂e (GWP ${activeGwp})`,
            numeric: true,
            render: (_v, row) =>
              (Number(row.ch4_tonnes || 0) * activeGwp).toLocaleString("en-US", {
                maximumFractionDigits: 1,
              }),
          },
          { key: "uncertainty_pct", label: "Uncertainty %", numeric: true },
          { key: "campaign_date", label: "Campaign Date", numeric: true },
          { key: "notes", label: "Reconciliation Notes" },
        ]}
        fields={[
          { key: "asset_name", label: "Asset / Site", type: "text", required: true, placeholder: "e.g., LPG Sphere Storage" },
          {
            key: "ogmp_level",
            label: "OGMP 2.0 Level",
            type: "select",
            required: true,
            options: [
              { label: "Level 4 (Source-Specific)", value: "Level 4" },
              { label: "Level 5 (Site-Level Top-Down)", value: "Level 5" },
            ],
          },
          {
            key: "modality",
            label: "Modality",
            type: "select",
            required: true,
            options: [
              { label: "Ground (OGI + Hi-Flow)", value: "Ground (OGI + Hi-Flow)" },
              { label: "Aerial (LiDAR / Plume Flight)", value: "Aerial (LiDAR / Plume Flight)" },
              { label: "Satellite (GHGSat / TROPOMI)", value: "Satellite (GHGSat / TROPOMI)" },
            ],
          },
          { key: "ch4_tonnes", label: "Measured CH₄ (tonnes)", type: "number", required: true, defaultValue: 12.5 },
          { key: "uncertainty_pct", label: "Uncertainty (%)", type: "number", defaultValue: 11.0 },
          { key: "campaign_date", label: "Campaign Date", type: "text", defaultValue: "2025-03-18" },
          { key: "notes", label: "Notes", type: "text", placeholder: "Asset EF / plume inversion details" },
        ]}
      />
    </CalculationEngineShell>
  );
}
