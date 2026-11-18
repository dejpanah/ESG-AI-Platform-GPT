import type { CalcEngineSlug, CalcRunEntry } from "@/api/calc-engines";
import * as XLSX from "xlsx";

const ENGINE_LABELS: Record<string, string> = {
  "scope-1": "Scope 1 Direct GHG Emissions",
  "scope-2": "Scope 2 Indirect Electricity & Steam",
  "scope-3": "Scope 3 Value Chain GHG",
  "emission-factors": "Emission Factor Library",
  "methane": "OGMP 2.0 Methane Accounting",
  "flaring": "Flaring & Venting Losses",
  "carbon-intensity": "Product Carbon Intensity",
  "water": "Water Accounting & Stress",
  "waste": "Waste & Circular Materials",
  "air-emissions": "Criteria Air Pollutants",
  "safety-hse": "Safety & API 754 HSE",
  "social-capital": "Social & Human Capital",
  "governance": "Corporate Governance & Ethics",
  "formulas-rules": "Configurable Formulas & Rules",
};

function formatIso(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function formatReadableDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(ms);
  }
}

function autoFitColumns(
  rows: Record<string, unknown>[],
  minWidth = 14,
): Array<{ wch: number }> {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0] || {});
  return keys.map((key) => {
    let maxLen = key.length;
    for (const r of rows) {
      const val = r[key];
      const str = val === null || val === undefined ? "" : String(val);
      if (str.length > maxLen) {
        maxLen = str.length;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, minWidth), 70) };
  });
}

export interface ExportHistoryOptions {
  slug: CalcEngineSlug | string;
  runs: CalcRunEntry[];
  filenamePrefix?: string;
  engineName?: string;
}

/**
 * Builds and downloads a multi-sheet Microsoft Excel (.xlsx) workbook
 * containing full historical calculation runs, raw inputs, KPI outputs,
 * parameters, and validation audit logs.
 */
export function exportCalculationHistoryToExcel({
  slug,
  runs,
  filenamePrefix = "ESG_Calculation_History",
  engineName,
}: ExportHistoryOptions): boolean {
  if (!runs || runs.length === 0) {
    return false;
  }

  const resolvedName = engineName || ENGINE_LABELS[slug] || slug.toUpperCase();
  const wb = XLSX.utils.book_new();

  // 1. Run Overview Sheet
  const overviewRows = runs.map((r) => {
    const headline = r.outputs_snapshot?.[0];
    const val = r.validation_summary;
    return {
      "Engine Scope": resolvedName,
      "Run #": r.run_number,
      "Run ID": r.id,
      "Timestamp (UTC)": formatIso(r.timestamp),
      "Execution Date": formatReadableDate(r.timestamp),
      "Trigger Type": r.trigger,
      "Trigger Reason": r.trigger_label,
      "Operator / Actor": r.actor,
      "Checkpoint Note": r.note || "N/A",
      "Input Records Count": r.inputs_snapshot.record_count,
      "Headline Metric": headline?.label || "N/A",
      "Headline Value": headline?.value ?? "N/A",
      "Headline Unit": headline?.unit || "",
      "Validation Status": val?.status?.toUpperCase() || "PASSED",
      "Pre-Run Checks": val?.checks_executed ?? 0,
      "Warnings / Anomalies": val?.warning_count ?? 0,
      "Critical Errors": val?.error_count ?? 0,
      "Override Acknowledged": val?.acknowledged_override ? "YES" : "NO",
      "Override Justification": val?.override_reason || "N/A",
    };
  });

  const wsOverview = XLSX.utils.json_to_sheet(overviewRows);
  wsOverview["!cols"] = autoFitColumns(overviewRows, 15);
  XLSX.utils.book_append_sheet(wb, wsOverview, "Run_Overview");

  // 2. Raw Inputs Ledger Sheet
  const inputRows: Array<Record<string, unknown>> = [];
  runs.forEach((r) => {
    const entries = r.inputs_snapshot?.entries ?? [];
    if (entries.length === 0) {
      inputRows.push({
        "Run #": r.run_number,
        "Execution Date": formatReadableDate(r.timestamp),
        "Item #": 1,
        "Activity / Stream": "No individual rows recorded",
        "Raw Input Details": "N/A",
        "Computed Line Result": "N/A",
      });
    } else {
      entries.forEach((item, idx) => {
        inputRows.push({
          "Run #": r.run_number,
          "Execution Date": formatReadableDate(r.timestamp),
          "Item #": idx + 1,
          "Activity / Stream": item.label,
          "Raw Input Details": item.inputs,
          "Computed Line Result": item.result,
        });
      });
    }
  });

  const wsInputs = XLSX.utils.json_to_sheet(inputRows);
  wsInputs["!cols"] = autoFitColumns(inputRows, 15);
  XLSX.utils.book_append_sheet(wb, wsInputs, "Raw_Inputs_Ledger");

  // 3. KPI Outputs Sheet
  const outputRows: Array<Record<string, unknown>> = [];
  runs.forEach((r) => {
    (r.outputs_snapshot ?? []).forEach((kpi) => {
      outputRows.push({
        "Run #": r.run_number,
        "Execution Date": formatReadableDate(r.timestamp),
        "KPI Metric Key": kpi.key,
        "KPI Label": kpi.label,
        "Computed Value": kpi.value,
        "Unit": kpi.unit || "",
        "Audit Status Tone": kpi.tone || "info",
        "Calculation Hint": kpi.hint || "",
      });
    });
  });

  const wsOutputs = XLSX.utils.json_to_sheet(outputRows);
  wsOutputs["!cols"] = autoFitColumns(outputRows, 15);
  XLSX.utils.book_append_sheet(wb, wsOutputs, "KPI_Outputs");

  // 4. Configuration & Emission Parameters Sheet
  const configRows: Array<Record<string, unknown>> = [];
  runs.forEach((r) => {
    const cfg = r.inputs_snapshot?.config ?? {};
    const entries = Object.entries(cfg);
    if (entries.length === 0) {
      configRows.push({
        "Run #": r.run_number,
        "Execution Date": formatReadableDate(r.timestamp),
        "Parameter Name": "Default System Settings",
        "Configured Value": "Standard baseline factors",
      });
    } else {
      entries.forEach(([key, val]) => {
        configRows.push({
          "Run #": r.run_number,
          "Execution Date": formatReadableDate(r.timestamp),
          "Parameter Name": key,
          "Configured Value":
            val === null || val === undefined
              ? ""
              : typeof val === "object"
                ? JSON.stringify(val)
                : String(val),
        });
      });
    }
  });

  const wsConfig = XLSX.utils.json_to_sheet(configRows);
  wsConfig["!cols"] = autoFitColumns(configRows, 18);
  XLSX.utils.book_append_sheet(wb, wsConfig, "Parameters_Config");

  // 5. Pre-Run Validation & Anomaly Trail
  const validationRows = runs.map((r) => {
    const v = r.validation_summary;
    return {
      "Run #": r.run_number,
      "Execution Date": formatReadableDate(r.timestamp),
      "Validation Outcome": v?.status?.toUpperCase() || "PASSED",
      "Total Integrity Checks": v?.checks_executed ?? 0,
      "Anomalies Flagged": v?.warning_count ?? 0,
      "Fatal Input Errors": v?.error_count ?? 0,
      "Auditor Override Acknowledged": v?.acknowledged_override ? "YES" : "NO",
      "Override Audit Justification": v?.override_reason || "Standard execution (No override required)",
    };
  });

  const wsValidation = XLSX.utils.json_to_sheet(validationRows);
  wsValidation["!cols"] = autoFitColumns(validationRows, 18);
  XLSX.utils.book_append_sheet(wb, wsValidation, "Validation_Audit_Log");

  // Write and trigger browser file download
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${filenamePrefix}_${cleanSlug}_${dateStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
  return true;
}

/**
 * Exports an individual calculation run entry as a complete audit certificate workbook.
 */
export function exportSingleRunToExcel({
  slug,
  run,
  engineName,
}: {
  slug: CalcEngineSlug | string;
  run: CalcRunEntry;
  engineName?: string;
}): boolean {
  const resolvedName = engineName || ENGINE_LABELS[slug] || slug.toUpperCase();
  const wb = XLSX.utils.book_new();

  // Certificate metadata sheet
  const certRows = [
    { "Audit Attribute": "Engine Scope Code", "Value": slug },
    { "Audit Attribute": "Engine Scope Title", "Value": resolvedName },
    { "Audit Attribute": "Calculation Run #", "Value": run.run_number },
    { "Audit Attribute": "System Run ID", "Value": run.id },
    { "Audit Attribute": "Execution Timestamp (UTC)", "Value": formatIso(run.timestamp) },
    { "Audit Attribute": "Execution Timestamp (Local)", "Value": formatReadableDate(run.timestamp) },
    { "Audit Attribute": "Trigger Type", "Value": run.trigger },
    { "Audit Attribute": "Trigger Description", "Value": run.trigger_label },
    { "Audit Attribute": "Execution Actor", "Value": run.actor },
    { "Audit Attribute": "Auditor / Checkpoint Note", "Value": run.note || "N/A" },
    { "Audit Attribute": "Total Input Activity Rows", "Value": run.inputs_snapshot.record_count },
    { "Audit Attribute": "Pre-Run Validation Status", "Value": run.validation_summary?.status?.toUpperCase() || "PASSED" },
    { "Audit Attribute": "Validation Checks Completed", "Value": run.validation_summary?.checks_executed ?? 0 },
    { "Audit Attribute": "Flagged Trend Anomalies", "Value": run.validation_summary?.warning_count ?? 0 },
    { "Audit Attribute": "Override Acknowledged", "Value": run.validation_summary?.acknowledged_override ? "YES" : "NO" },
    { "Audit Attribute": "Override Justification Note", "Value": run.validation_summary?.override_reason || "N/A" },
  ];

  const wsCert = XLSX.utils.json_to_sheet(certRows);
  wsCert["!cols"] = [{ wch: 32 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsCert, "Audit_Certificate");

  // Raw Inputs
  const entries = run.inputs_snapshot?.entries ?? [];
  const inputRows = entries.map((e, idx) => ({
    "Item #": idx + 1,
    "Activity Stream": e.label,
    "Raw Input Metrics": e.inputs,
    "Computed Line Result": e.result,
  }));
  const wsInputs = XLSX.utils.json_to_sheet(inputRows.length > 0 ? inputRows : [{ "Status": "No activity rows recorded" }]);
  wsInputs["!cols"] = autoFitColumns(inputRows, 16);
  XLSX.utils.book_append_sheet(wb, wsInputs, "Input_Activities");

  // KPI Outputs
  const outputRows = (run.outputs_snapshot ?? []).map((kpi) => ({
    "Metric Key": kpi.key,
    "Metric Label": kpi.label,
    "Calculated Value": kpi.value,
    "Unit": kpi.unit || "",
    "Audit Tone": kpi.tone || "info",
    "Description": kpi.hint || "",
  }));
  const wsOutputs = XLSX.utils.json_to_sheet(outputRows);
  wsOutputs["!cols"] = autoFitColumns(outputRows, 16);
  XLSX.utils.book_append_sheet(wb, wsOutputs, "KPI_Results");

  // Parameters
  const cfgEntries = Object.entries(run.inputs_snapshot?.config ?? {}).map(([k, v]) => ({
    "Parameter": k,
    "Configured Value": String(v),
  }));
  const wsConfig = XLSX.utils.json_to_sheet(cfgEntries.length > 0 ? cfgEntries : [{ "Parameter": "Default settings", "Configured Value": "Standard baseline" }]);
  wsConfig["!cols"] = [{ wch: 25 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsConfig, "Parameters_Used");

  const cleanSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `ESG_Run_${run.run_number}_${cleanSlug}_Audit_Log.xlsx`;
  XLSX.writeFile(wb, fileName);
  return true;
}
