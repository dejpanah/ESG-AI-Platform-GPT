import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { useCalcEngine } from "@/hooks/use-calc-engine";

export default function AirEmissionsPage() {
  const { view, loading, mutating, error, reload, addRecord, removeRecord } =
    useCalcEngine("air-emissions");

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Measured (t/yr)"
      chartLimitLabel="Permit Limit (t/yr)"
    >
      <CalcLedgerPanel
        title="Criteria & Hazardous Air Pollutants (SO₂, NOx, PM, VOC, H₂S, Benzene)"
        description="Continuous CEMS, stack testing, and perimeter monitoring compared against statutory permit limits"
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Air pollutant measurement recorded")}
        onDelete={removeRecord}
        columns={[
          { key: "pollutant", label: "Pollutant" },
          { key: "source_unit", label: "Source / Monitoring Station" },
          { key: "measured_tonnes_yr", label: "Measured (t/yr)", numeric: true },
          { key: "permit_limit_tonnes_yr", label: "Permit Cap (t/yr)", numeric: true },
          {
            key: "utilization_pct",
            label: "Cap Utilization",
            numeric: true,
            render: (_v, row) => {
              const m = Number(row.measured_tonnes_yr || 0);
              const l = Number(row.permit_limit_tonnes_yr || 1);
              const pct = (m / l) * 100;
              return (
                <span
                  className={
                    pct > 100
                      ? "font-semibold text-[var(--term-bad)]"
                      : pct >= 85
                        ? "font-semibold text-[var(--term-warn)]"
                        : "text-[var(--term-ok)]"
                  }
                >
                  {pct.toFixed(1)}%
                </span>
              );
            },
          },
          { key: "measured_conc", label: "Conc.", numeric: true },
          { key: "permit_conc_limit", label: "Conc. Limit", numeric: true },
          { key: "conc_unit", label: "Unit" },
          { key: "monitoring_method", label: "Method" },
        ]}
        fields={[
          {
            key: "pollutant",
            label: "Pollutant",
            type: "select",
            required: true,
            options: ["SO₂", "NOx", "PM", "VOC", "H₂S", "Benzene"].map((p) => ({
              label: p,
              value: p,
            })),
          },
          { key: "source_unit", label: "Source / Stack", type: "text", required: true, placeholder: "e.g., Auxiliary Turbine GT-3" },
          { key: "measured_tonnes_yr", label: "Measured (t/yr)", type: "number", required: true, defaultValue: 18.4 },
          { key: "permit_limit_tonnes_yr", label: "Permit Limit (t/yr)", type: "number", required: true, defaultValue: 40 },
          { key: "measured_conc", label: "Measured Conc.", type: "number", defaultValue: 45 },
          { key: "permit_conc_limit", label: "Conc. Limit", type: "number", defaultValue: 100 },
          { key: "conc_unit", label: "Conc. Unit", type: "text", defaultValue: "mg/Nm³" },
          { key: "monitoring_method", label: "Method", type: "text", defaultValue: "Continuous CEMS" },
        ]}
      />
    </CalculationEngineShell>
  );
}
