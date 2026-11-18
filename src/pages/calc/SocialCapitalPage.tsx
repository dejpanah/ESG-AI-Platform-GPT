import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { useState } from "react";

export default function SocialCapitalPage() {
  const {
    view,
    loading,
    mutating,
    error,
    reload,
    addRecord,
    removeRecord,
    patchConfig,
  } = useCalcEngine("social-capital");

  const [payRatio, setPayRatio] = useState("");
  const [auditPct, setAuditPct] = useState("");
  const [communityUsd, setCommunityUsd] = useState("");

  const currPay = String(payRatio || view?.config.gender_pay_ratio || "0.96");
  const currAudit = String(auditPct || view?.config.supply_chain_audited_pct || "91.4");
  const currCommunity = String(communityUsd || view?.config.community_investment_usd || "1450000");

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Headcount (FTE)"
      chartSecondaryLabel="Avg Training (hrs)"
      controlsSlot={
        <Panel
          title="Pay Equity, Supply Chain Human Rights & Community Investment Controls"
          description="Update site-wide gender pay ratio, child & forced labor audit coverage, and social investment totals"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-[10.5px] font-medium text-muted-foreground">
                Pay Equity Ratio (F:M)
              </span>
              <Input
                type="number"
                step="0.01"
                value={currPay}
                onChange={(e) => setPayRatio(e.target.value)}
                className="h-8 w-32 font-mono text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[10.5px] font-medium text-muted-foreground">
                Supply Chain Screened (%)
              </span>
              <Input
                type="number"
                step="0.1"
                value={currAudit}
                onChange={(e) => setAuditPct(e.target.value)}
                className="h-8 w-36 font-mono text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[10.5px] font-medium text-muted-foreground">
                Community Investment ($)
              </span>
              <Input
                type="number"
                value={currCommunity}
                onChange={(e) => setCommunityUsd(e.target.value)}
                className="h-8 w-40 font-mono text-xs"
              />
            </label>
            <Button
              size="sm"
              disabled={mutating}
              className="h-8 px-4 text-xs"
              onClick={() =>
                void patchConfig(
                  {
                    gender_pay_ratio: Number(currPay) || 0.96,
                    supply_chain_audited_pct: Number(currAudit) || 91.4,
                    community_investment_usd: Number(currCommunity) || 1450000,
                  },
                  "Updated Social & Human Capital indicators",
                )
              }
            >
              Update Indicators
            </Button>
          </div>
        </Panel>
      }
    >
      <CalcLedgerPanel
        title="Workforce Diversity, Training, Pay Equity, Child/Forced Labor & Community Ledger"
        description="Covers workforce composition, training intensity, benefits, supply-chain human rights diligence, and local programs"
        records={view?.records ?? []}
        mutating={mutating}
        onAdd={(payload) => addRecord(payload, "Social metric added & workforce totals recalculated")}
        onDelete={removeRecord}
        columns={[
          { key: "domain", label: "ESG Social Domain" },
          { key: "metric_name", label: "Workforce Segment / Program" },
          { key: "headcount", label: "Count / Sites", numeric: true },
          { key: "female_share_pct", label: "Diversity / Coverage %", numeric: true },
          { key: "avg_training_hours", label: "Avg Training (hrs)", numeric: true },
          { key: "pay_ratio_f_m", label: "Pay Ratio", numeric: true },
          { key: "compliance_status", label: "Audit Status" },
        ]}
        fields={[
          {
            key: "domain",
            label: "Domain",
            type: "select",
            required: true,
            options: [
              { label: "Workforce & Diversity", value: "Workforce & Diversity" },
              { label: "Supply Chain Human Rights", value: "Supply Chain Human Rights" },
              { label: "Community Engagement", value: "Community Engagement" },
            ],
          },
          { key: "metric_name", label: "Segment / Program Name", type: "text", required: true, placeholder: "e.g., Turnaround Apprentice Cohort" },
          { key: "headcount", label: "Headcount / Suppliers", type: "number", required: true, defaultValue: 65 },
          { key: "female_share_pct", label: "Diversity / Coverage (%)", type: "number", defaultValue: 34.0 },
          { key: "avg_training_hours", label: "Avg Training Hours", type: "number", defaultValue: 60 },
          { key: "pay_ratio_f_m", label: "Pay Ratio (F:M)", type: "number", defaultValue: 0.98 },
          { key: "compliance_status", label: "Compliance Status", type: "text", defaultValue: "On Track" },
        ]}
      />
    </CalculationEngineShell>
  );
}
