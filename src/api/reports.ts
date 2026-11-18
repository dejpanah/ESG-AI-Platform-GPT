import { apiRequest, getWorkspaceId, getUserId } from "./client";

export interface ReportMetricsSnapshot {
  period?: { from_date?: string; to_date?: string };
  pillars?: string[];
  environmental?: {
    co2_emissions_tco2e?: number;
    ghg_breakdown?: Array<{ gas: string; value: number }>;
    energy_consumption_mwh?: {
      total?: number;
      by_source?: Record<string, number>;
    };
    water_consumption_m3?: {
      total?: number;
      reused?: number;
    };
    waste_tonnes?: {
      total?: number;
      by_type?: Record<string, number>;
    };
  };
  social?: {
    total_employees?: number;
    gender?: Record<string, number>;
    hiring_numbers?: number;
  };
}

export interface ReportVersionEntry {
  version: number;
  title: string;
  report_type: string;
  body: string;
  model: string;
  created_at: number;
  created_by: string;
  change_note: string;
  restored_from_version?: number;
  metadata: Record<string, unknown> & {
    metrics_snapshot?: ReportMetricsSnapshot;
  };
}

export interface EsgReport {
  id: string;
  workspace_id: string;
  user_id: string | null;
  title: string;
  report_type: string;
  body: string;
  format: string;
  model: string;
  sources: unknown[];
  citations: unknown[];
  trace_id: string | null;
  status: string;
  version: number;
  created_at: number;
  updated_at?: number;
  metadata: Record<string, unknown> & {
    metrics_snapshot?: ReportMetricsSnapshot;
    template_id?: string;
    template_name?: string;
    framework?: string;
  };
  versions?: ReportVersionEntry[];
}

export interface ReportVersionsResponse {
  report_id: string;
  current_version: number;
  total_versions: number;
  versions: ReportVersionEntry[];
}

export interface ReportDiffLine {
  type: "unchanged" | "added" | "removed";
  text: string;
  old_line: number | null;
  new_line: number | null;
}

export interface ReportVersionDiffResponse {
  report_id: string;
  from_version: number;
  to_version: number;
  title_changed: boolean;
  from_title: string;
  to_title: string;
  report_type_changed: boolean;
  added_lines: number;
  removed_lines: number;
  unchanged_lines: number;
  lines: ReportDiffLine[];
}

export interface EsgReportTemplate {
  id: string;
  name: string;
  name_en: string;
  category: "Environmental" | "Social" | "Governance" | "Comprehensive" | string;
  framework: string;
  report_type: string;
  pillars: string[];
  suggested_title: string;
  description: string;
  default_instructions: string;
  chart_focus: string[];
  default_from_date: string;
  default_to_date: string;
  sample_manual_body: string;
}

export interface GenerateReportPayload {
  workspace_id?: string;
  report_id?: string;
  change_note?: string;
  title: string;
  report_type?: string;
  template_id?: string;
  from_date?: string;
  to_date?: string;
  pillars?: string[];
  instructions?: string;
  language?: string;
  model?: string;
  include_metrics?: boolean;
  document_context?: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
  save?: boolean;
}

export interface CreateManualReportPayload {
  workspace_id?: string;
  title: string;
  report_type?: string;
  body: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

export interface AggregatePayload {
  workspace_id?: string;
  title: string;
  source_report_ids: string[];
  report_type?: string;
  instructions?: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

export async function listReports(reportType?: string): Promise<EsgReport[]> {
  const ws = getWorkspaceId();
  const q = new URLSearchParams({ workspace_id: ws, limit: "100" });
  if (reportType) q.set("report_type", reportType);
  // reports router is mounted at /api/v1/reports — client base already ends with /api
  return apiRequest<EsgReport[]>(`/v1/reports?${q.toString()}`);
}

export async function getReport(id: string): Promise<EsgReport> {
  const ws = getWorkspaceId();
  return apiRequest<EsgReport>(`/v1/reports/${encodeURIComponent(id)}?workspace_id=${encodeURIComponent(ws)}`);
}

export async function createManualReport(payload: CreateManualReportPayload): Promise<EsgReport> {
  return apiRequest<EsgReport>(`/v1/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: getWorkspaceId(),
      user_id: getUserId(),
      format: "markdown",
      ...payload,
    }),
  });
}

export async function reviseReport(
  reportId: string,
  payload: {
    title?: string;
    body?: string;
    report_type?: string;
    change_note?: string;
  },
): Promise<EsgReport> {
  const ws = getWorkspaceId();
  return apiRequest<EsgReport>(
    `/v1/reports/${encodeURIComponent(reportId)}?workspace_id=${encodeURIComponent(ws)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: ws,
        user_id: getUserId(),
        ...payload,
      }),
    },
  );
}

export async function listReportVersions(
  reportId: string,
): Promise<ReportVersionsResponse> {
  const ws = getWorkspaceId();
  return apiRequest<ReportVersionsResponse>(
    `/v1/reports/${encodeURIComponent(reportId)}/versions?workspace_id=${encodeURIComponent(ws)}`,
  );
}

export async function fetchReportVersionDiff(
  reportId: string,
  fromVersion: number,
  toVersion: number,
): Promise<ReportVersionDiffResponse> {
  const ws = getWorkspaceId();
  const params = new URLSearchParams({
    workspace_id: ws,
    from: String(fromVersion),
    to: String(toVersion),
  });
  return apiRequest<ReportVersionDiffResponse>(
    `/v1/reports/${encodeURIComponent(reportId)}/versions/diff?${params.toString()}`,
  );
}

export async function restoreReportVersion(
  reportId: string,
  version: number,
): Promise<EsgReport> {
  const ws = getWorkspaceId();
  return apiRequest<EsgReport>(
    `/v1/reports/${encodeURIComponent(reportId)}/versions/${encodeURIComponent(String(version))}/restore?workspace_id=${encodeURIComponent(ws)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: ws,
        user_id: getUserId(),
      }),
    },
  );
}

export async function listReportTemplates(category?: string): Promise<EsgReportTemplate[]> {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  const qs = params.toString();
  const data = await apiRequest<{ templates: EsgReportTemplate[] }>(
    `/v1/esg/templates${qs ? `?${qs}` : ""}`,
  );
  return data.templates ?? [];
}

export async function generateEsgReport(payload: GenerateReportPayload): Promise<Record<string, unknown>> {
  return apiRequest(`/v1/esg/generate-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: getWorkspaceId(),
      user_id: getUserId(),
      language: "fa",
      save: true,
      ...payload,
    }),
    timeoutMs: 180000,
  });
}

export async function aggregateReports(payload: AggregatePayload): Promise<EsgReport> {
  return apiRequest<EsgReport>(`/v1/reports/aggregate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: getWorkspaceId(),
      user_id: getUserId(),
      report_type: "esg_aggregate",
      ...payload,
    }),
    timeoutMs: 60000,
  });
}

export async function fetchEsgMetrics(fromDate?: string, toDate?: string): Promise<Record<string, unknown>> {
  return apiRequest(`/v1/esg/metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: getWorkspaceId(),
      from_date: fromDate || null,
      to_date: toDate || null,
      pillars: ["environmental", "social"],
    }),
  });
}

export const REPORT_TYPE_OPTIONS = [
  { value: "esg_periodic", label: "دوره‌ای (Periodic)" },
  { value: "esg_environmental", label: "محیط‌زیست (E)" },
  { value: "esg_social", label: "اجتماعی (S)" },
  { value: "esg_governance", label: "حاکمیتی (G)" },
  { value: "esg_audit", label: "ممیزی" },
  { value: "esg_aggregate", label: "تجمیعی" },
  { value: "esg_custom", label: "سفارشی" },
] as const;

export interface PostgresStatus {
  status: "operational" | "degraded" | "offline";
  engine: string;
  version: string;
  mode: "embedded" | "remote";
  reports_count: number;
  latency_ms: number;
}

export async function getPostgresStatus(): Promise<PostgresStatus> {
  return apiRequest<PostgresStatus>(`/v1/postgres/status`);
}

