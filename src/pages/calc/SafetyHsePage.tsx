import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { useCalcEngine } from "@/hooks/use-calc-engine";

export default function SafetyHsePage() {
  const { view, loading, mutating, error, reload, addRecord, removeRecord } =
    useCalcEngine("safety-hse");

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Recordable Injuries"
      chartSecondaryLabel="API 754 Tier 1 + 2 PSE"
    >
      <CalcLedgerPanel
        title="HSE Exposure Hours, LTIFR / TRIR / FAR & API RP 754 Process Safety Events"
        description="Tracks employee and contractor hours worked, Lost Time Injuries, Recordable Incidents, Tier 1/2 Process Safety Events, PSI, and road incidents"
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Safety period logged & LTIFR/TRIR/FAR recalculated")}
        onDelete={removeRecord}
        columns={[
          { key: "period", label: "Reporting Period" },
          { key: "workforce_group", label: "Workforce Group" },
          { key: "hours_worked", label: "Hours Worked", numeric: true },
          { key: "fatalities", label: "Fatalities", numeric: true },
          { key: "lti_cases", label: "LTI", numeric: true },
          { key: "recordable_injuries", label: "TRC", numeric: true },
          { key: "tier1_pse", label: "API 754 Tier 1", numeric: true },
          { key: "tier2_pse", label: "API 754 Tier 2", numeric: true },
          { key: "other_psi", label: "Other PSI", numeric: true },
          { key: "road_incidents", label: "Road Incidents", numeric: true },
        ]}
        fields={[
          { key: "period", label: "Period Label", type: "text", required: true, placeholder: "e.g., 2025 Q2 — Employees" },
          {
            key: "workforce_group",
            label: "Workforce Group",
            type: "select",
            required: true,
            options: [
              { label: "Direct Employees", value: "Direct Employees" },
              { label: "Site & Turnaround Contractors", value: "Site & Turnaround Contractors" },
              { label: "Logistics & Road Fleet", value: "Logistics & Road Fleet" },
            ],
          },
          { key: "hours_worked", label: "Exposure Hours Worked", type: "number", required: true, defaultValue: 950000 },
          { key: "fatalities", label: "Fatalities", type: "number", required: true, defaultValue: 0 },
          { key: "lti_cases", label: "Lost Time Injuries (LTI)", type: "number", required: true, defaultValue: 0 },
          { key: "recordable_injuries", label: "Total Recordable Cases (TRC)", type: "number", required: true, defaultValue: 1 },
          { key: "tier1_pse", label: "API 754 Tier 1 PSE", type: "number", defaultValue: 0 },
          { key: "tier2_pse", label: "API 754 Tier 2 PSE", type: "number", defaultValue: 0 },
          { key: "other_psi", label: "Other PSI", type: "number", defaultValue: 1 },
          { key: "road_incidents", label: "Road Incidents", type: "number", defaultValue: 0 },
        ]}
      />
    </CalculationEngineShell>
  );
}
