import { apiRequest, getApiBase, getUserId, getWorkspaceId } from "./client";

export type CalcEngineSlug =
  | "scope-1"
  | "scope-2"
  | "scope-3"
  | "emission-factors"
  | "methane"
  | "flaring"
  | "carbon-intensity"
  | "water"
  | "waste"
  | "air-emissions"
  | "safety-hse"
  | "social-capital"
  | "governance"
  | "formulas-rules";

export interface CalcKpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "ok" | "warn" | "bad" | "info" | "idle";
}

export interface CalcChartPoint {
  name: string;
  primary: number;
  secondary?: number;
  limit?: number;
  unit?: string;
}

export interface CalcAuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  detail: string;
}

export interface EmissionFactorVersion {
  version: number;
  value: number;
  unit: string;
  source: string;
  valid_from: string;
  valid_to: string | null;
  uncertainty_pct: number;
  notes: string;
  updated_at: number;
  updated_by: string;
}

export interface EmissionFactorItem {
  id: string;
  code: string;
  name: string;
  category: string;
  gas: string;
  source_standard:
    | "IPCC 2006"
    | "DEFRA"
    | "EPA"
    | "IEA"
    | "Site-Specific"
    | "Lab-Specific";
  current_version: number;
  value: number;
  unit: string;
  valid_from: string;
  valid_to: string | null;
  uncertainty_pct: number;
  status: "active" | "deprecated";
  versions: EmissionFactorVersion[];
}

export interface FormulaVersionSnapshot {
  version: number;
  expression: string;
  threshold_operator?: ">" | ">=" | "<" | "<=";
  threshold_value?: number | null;
  threshold_severity?: "warning" | "critical";
  change_note: string;
  author: string;
  created_at: number;
  status: "active" | "pending_approval" | "superseded" | "rejected";
  reviewed_by?: string;
  reviewed_at?: number;
  review_note?: string;
}

export interface FormulaRuleItem {
  id: string;
  code: string;
  name: string;
  target_engine: CalcEngineSlug;
  kind: "formula" | "threshold_rule";
  output_unit: string;
  variables: string[];
  sample_inputs: Record<string, number>;
  active_version: number;
  expression: string;
  threshold_operator?: ">" | ">=" | "<" | "<=";
  threshold_value?: number | null;
  threshold_severity?: "warning" | "critical";
  status: "active" | "pending_approval" | "draft";
  pending_revision: FormulaVersionSnapshot | null;
  history: FormulaVersionSnapshot[];
}

export type CalcRunTrigger =
  | "initial_baseline"
  | "manual_run"
  | "record_added"
  | "record_deleted"
  | "config_updated"
  | "factor_revised"
  | "formula_approved";

export interface CalcRunInputSummary {
  label: string;
  inputs: string;
  result: string;
}

export interface CalcRunEntry {
  id: string;
  run_number: number;
  timestamp: number;
  trigger: CalcRunTrigger;
  trigger_label: string;
  actor: string;
  note: string;
  inputs_snapshot: {
    config: Record<string, unknown>;
    record_count: number;
    entries: CalcRunInputSummary[];
  };
  outputs_snapshot: CalcKpi[];
  validation_summary?: {
    status: "passed" | "warning" | "blocked";
    checks_executed: number;
    error_count: number;
    warning_count: number;
    acknowledged_override?: boolean;
    override_reason?: string;
  };
}

export type ValidationSeverity = "error" | "warning";
export type ValidationCategory =
  | "missing_input"
  | "invalid_value"
  | "historical_anomaly"
  | "domain_rule";
export type ValidationStatus = "passed" | "warning" | "blocked";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  field: string;
  record_id?: string;
  record_label?: string;
  message: string;
  observed_value?: string;
  expected_range?: string;
  historical_baseline?: string;
  deviation_pct?: number;
  z_score?: number;
  remediation: string;
}

export interface TrendComparisonPoint {
  metric: string;
  unit: string;
  current_value: number;
  historical_mean: number;
  historical_std: number;
  prev_run_value: number;
  delta_pct: number;
  z_score: number;
  lower_bound: number;
  upper_bound: number;
  status: "normal" | "anomalous" | "critical";
  historical_series?: number[];
}

export interface FieldTrendBaseline {
  field: string;
  label?: string;
  unit?: string;
  history: number[];
  mean: number;
  std: number;
  lower_bound: number;
  upper_bound: number;
}

export interface CalcValidationReport {
  slug: CalcEngineSlug;
  checked_at: number;
  status: ValidationStatus;
  can_proceed: boolean;
  requires_acknowledgment: boolean;
  checks_executed: number;
  checks_passed: number;
  error_count: number;
  warning_count: number;
  historical_runs_analyzed: number;
  issues: ValidationIssue[];
  trend_comparisons: TrendComparisonPoint[];
  field_trends?: Record<string, FieldTrendBaseline>;
}

export interface BulkRowValidationResult {
  row_index: number;
  label: string;
  status: ValidationStatus;
  error_count: number;
  warning_count: number;
  issues: ValidationIssue[];
  normalized_record: Record<string, unknown>;
}

export interface BulkImportValidationReport {
  slug: CalcEngineSlug;
  checked_at: number;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  status: ValidationStatus;
  can_commit: boolean;
  requires_acknowledgment: boolean;
  rows: BulkRowValidationResult[];
  batch_trend_comparisons: TrendComparisonPoint[];
  field_trends: Record<string, FieldTrendBaseline>;
}

export interface CalcEngineView {
  slug: CalcEngineSlug;
  number: string;
  title: string;
  subtitle: string;
  standard_ref: string;
  methodology: string;
  config: Record<string, unknown>;
  kpis: CalcKpi[];
  charts: {
    primary_title: string;
    primary_unit: string;
    primary_series: CalcChartPoint[];
    secondary_title?: string;
    secondary_unit?: string;
    secondary_series?: CalcChartPoint[];
  };
  records: Array<Record<string, unknown> & { id: string }>;
  audit_log: CalcAuditEntry[];
  calculation_history: CalcRunEntry[];
  validation?: CalcValidationReport;
  extra?: Record<string, unknown>;
}

function wsQuery(): string {
  return `workspace_id=${encodeURIComponent(getWorkspaceId())}`;
}

export async function fetchCalcEngine(slug: CalcEngineSlug): Promise<CalcEngineView> {
  return apiRequest<CalcEngineView>(`/v1/calc/engines/${slug}?${wsQuery()}`);
}

export async function addCalcRecord(
  slug: CalcEngineSlug,
  payload: Record<string, unknown>,
): Promise<CalcEngineView> {
  return apiRequest<CalcEngineView>(`/v1/calc/engines/${slug}/records?${wsQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteCalcRecord(
  slug: CalcEngineSlug,
  recordId: string,
): Promise<CalcEngineView> {
  return apiRequest<CalcEngineView>(
    `/v1/calc/engines/${slug}/records/${encodeURIComponent(recordId)}?${wsQuery()}`,
    { method: "DELETE" },
  );
}

export async function updateCalcConfig(
  slug: CalcEngineSlug,
  patch: Record<string, unknown>,
): Promise<CalcEngineView> {
  return apiRequest<CalcEngineView>(`/v1/calc/engines/${slug}/config?${wsQuery()}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function validateCalcInputs(
  slug: CalcEngineSlug,
  candidateRecord?: Record<string, unknown>,
): Promise<CalcValidationReport> {
  return apiRequest<CalcValidationReport>(`/v1/calc/engines/${slug}/validate?${wsQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      candidateRecord ? { candidate_record: candidateRecord } : {},
    ),
  });
}

export async function validateBulkCalcImport(
  slug: CalcEngineSlug,
  rows: Array<Record<string, unknown>>,
): Promise<BulkImportValidationReport> {
  return apiRequest<BulkImportValidationReport>(
    `/v1/calc/engines/${slug}/bulk-validate?${wsQuery()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    },
  );
}

export type BulkCommitOutcome =
  | {
      outcome: "committed";
      imported_count: number;
      warning_count: number;
      view: CalcEngineView;
      validation: BulkImportValidationReport;
    }
  | {
      outcome: "blocked" | "requires_acknowledgment";
      error: string;
      validation: BulkImportValidationReport;
    };

export async function commitBulkCalcImport(
  slug: CalcEngineSlug,
  rows: Array<Record<string, unknown>>,
  options?: {
    acknowledge_anomalies?: boolean;
    override_reason?: string;
    actor?: string;
  },
): Promise<BulkCommitOutcome> {
  const token = window.localStorage.getItem("knowledgeos.token");
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Workspace-ID": getWorkspaceId(),
    "X-User-ID": getUserId(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(
    `${getApiBase()}/v1/calc/engines/${slug}/bulk-commit?${wsQuery()}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        rows,
        acknowledge_anomalies: options?.acknowledge_anomalies ?? false,
        override_reason: options?.override_reason,
        actor: options?.actor,
      }),
    },
  );

  const data = (await res.json()) as Record<string, unknown>;
  if (res.status === 422 || res.status === 409) {
    return {
      outcome:
        data.outcome === "blocked" ? "blocked" : "requires_acknowledgment",
      error: String(data.error || "Bulk import validation gate triggered"),
      validation: data.validation as BulkImportValidationReport,
    };
  }
  if (!res.ok) {
    throw new Error(String(data.error || data.detail || `Bulk import failed (${res.status})`));
  }

  return {
    outcome: "committed",
    imported_count: Number(data.imported_count ?? rows.length),
    warning_count: Number(data.warning_count ?? 0),
    view: data.view as CalcEngineView,
    validation: data.validation as BulkImportValidationReport,
  };
}

export type ExecuteRunOutcome =
  | { outcome: "executed"; view: CalcEngineView }
  | {
      outcome: "blocked" | "requires_acknowledgment";
      error: string;
      validation: CalcValidationReport;
    };

export async function executeManualCalcRun(
  slug: CalcEngineSlug,
  options?: {
    note?: string;
    acknowledge_anomalies?: boolean;
    override_reason?: string;
  },
): Promise<ExecuteRunOutcome> {
  const token = window.localStorage.getItem("knowledgeos.token");
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Workspace-ID": getWorkspaceId(),
    "X-User-ID": getUserId(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(
    `${getApiBase()}/v1/calc/engines/${slug}/runs?${wsQuery()}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(options ?? {}),
    },
  );
  const data = (await res.json()) as Record<string, unknown>;
  if (res.status === 422 || res.status === 409) {
    return {
      outcome:
        data.outcome === "blocked" ? "blocked" : "requires_acknowledgment",
      error: String(data.error || "Run validation gate triggered"),
      validation: data.validation as CalcValidationReport,
    };
  }
  if (!res.ok) {
    throw new Error(String(data.error || data.detail || `Run failed (${res.status})`));
  }
  return {
    outcome: "executed",
    view: data as unknown as CalcEngineView,
  };
}

export async function exportCalcReport(
  slug: CalcEngineSlug,
): Promise<{ id: string; title: string }> {
  return apiRequest<{ id: string; title: string }>(
    `/v1/calc/engines/${slug}/export-report?${wsQuery()}`,
    { method: "POST" },
  );
}

export async function createEmissionFactor(payload: {
  code: string;
  name: string;
  category: string;
  gas?: string;
  source_standard: EmissionFactorItem["source_standard"];
  value: number;
  unit: string;
  valid_from: string;
  uncertainty_pct?: number;
  notes?: string;
}): Promise<CalcEngineView> {
  return apiRequest<CalcEngineView>(`/v1/calc/emission-factors?${wsQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function reviseEmissionFactor(
  factorId: string,
  payload: {
    value: number;
    unit?: string;
    source?: string;
    valid_from: string;
    uncertainty_pct?: number;
    notes?: string;
  },
): Promise<CalcEngineView> {
  return apiRequest<CalcEngineView>(
    `/v1/calc/emission-factors/${encodeURIComponent(factorId)}/revise?${wsQuery()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function evaluateFormulaExpression(
  expression: string,
  inputs: Record<string, number>,
): Promise<{ value: number; error?: string }> {
  return apiRequest<{ value: number; error?: string }>(
    `/v1/calc/formulas/evaluate?${wsQuery()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expression, inputs }),
    },
  );
}

export async function createFormulaRule(payload: {
  code: string;
  name: string;
  target_engine: CalcEngineSlug;
  kind: "formula" | "threshold_rule";
  output_unit: string;
  expression: string;
  variables: string[];
  sample_inputs: Record<string, number>;
  threshold_operator?: ">" | ">=" | "<" | "<=";
  threshold_value?: number | null;
  threshold_severity?: "warning" | "critical";
  change_note?: string;
}): Promise<CalcEngineView> {
  return apiRequest<CalcEngineView>(`/v1/calc/formulas?${wsQuery()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function proposeFormulaChange(
  formulaId: string,
  payload: {
    expression: string;
    threshold_operator?: ">" | ">=" | "<" | "<=";
    threshold_value?: number | null;
    threshold_severity?: "warning" | "critical";
    change_note: string;
    sample_inputs?: Record<string, number>;
  },
): Promise<CalcEngineView> {
  return apiRequest<CalcEngineView>(
    `/v1/calc/formulas/${encodeURIComponent(formulaId)}/propose?${wsQuery()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function reviewFormulaChange(
  formulaId: string,
  decision: "approve" | "reject",
  review_note: string,
  reviewer = "Chief Carbon Auditor",
): Promise<CalcEngineView> {
  return apiRequest<CalcEngineView>(
    `/v1/calc/formulas/${encodeURIComponent(formulaId)}/${decision}?${wsQuery()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_note, reviewer }),
    },
  );
}
