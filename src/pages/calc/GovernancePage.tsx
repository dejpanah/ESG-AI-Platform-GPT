import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { useCalcEngine } from "@/hooks/use-calc-engine";

export default function GovernancePage() {
  const { view, loading, mutating, error, reload, addRecord, removeRecord } =
    useCalcEngine("governance");

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Actual Score (%)"
      chartLimitLabel="Governance Target (%)"
    >
      <CalcLedgerPanel
        title="Board Composition, Executive Pay, Anti-Corruption, Whistleblowing & Tax Transparency"
        description="Tracks board independence, diversity, meeting attendance, ESG-linked pay, ISO 37001 ethics compliance, speak-up cases, and GRI 207 CbCR tax"
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Governance indicator logged")}
        onDelete={removeRecord}
        columns={[
          { key: "pillar", label: "Governance Pillar" },
          { key: "indicator", label: "Indicator" },
          { key: "actual_value", label: "Actual", numeric: true },
          { key: "target_value", label: "Target", numeric: true },
          { key: "unit", label: "Unit / Context" },
          { key: "status", label: "Compliance Status" },
          { key: "notes", label: "Disclosure Notes" },
        ]}
        fields={[
          {
            key: "pillar",
            label: "Pillar",
            type: "select",
            required: true,
            options: [
              "Board Composition",
              "Board Diversity & Attendance",
              "Executive Pay",
              "Anti-Corruption",
              "Whistleblowing",
              "Tax & Transparency",
            ].map((p) => ({ label: p, value: p })),
          },
          { key: "indicator", label: "Indicator", type: "text", required: true, placeholder: "e.g., Supplier Ethics Code Sign-Off" },
          { key: "actual_value", label: "Actual (%)", type: "number", required: true, defaultValue: 96.0 },
          { key: "target_value", label: "Target (%)", type: "number", required: true, defaultValue: 95.0 },
          { key: "unit", label: "Unit / Count", type: "text", defaultValue: "% Suppliers Signed" },
          { key: "status", label: "Status", type: "text", defaultValue: "Compliant" },
          { key: "notes", label: "Notes", type: "text", defaultValue: "Verified by Corporate Secretary" },
        ]}
      />
    </CalculationEngineShell>
  );
}
