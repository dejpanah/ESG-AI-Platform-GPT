import { apiRequest } from "./client";

export type ServiceOperationalStatus = "Operational" | "Degraded" | "Offline";

export interface ServiceProbe {
  id: string;
  name: string;
  role: string;
  url: string;
  status: "connected" | "degraded" | "offline";
  operational_status?: ServiceOperationalStatus;
  reachable: boolean;
  status_code: number | null;
  latency_ms: number;
  error: string | null;
  detail: string;
}

export interface ServiceDiscoveryResponse {
  timestamp: number;
  dotnet_url: string;
  python_url: string;
  operational_count: number;
  degraded_count: number;
  offline_count: number;
  total_count: number;
  services: ServiceProbe[];
}

export interface EndpointStatus {
  method: string;
  path: string;
  service: string;
  upstream: string;
  status: "ready" | "standby" | "offline" | "degraded";
  latency_ms: number | null;
}

export interface HealthHistoryPoint {
  timestamp: number;
  label: string;
  rag_core_ms: number;
  esg_store_ms: number;
  dotnet_ms: number | null;
  python_ms: number | null;
  dotnet_reachable: boolean;
  python_reachable: boolean;
}

export interface BackendHealthSummary {
  connected_services: number;
  total_services: number;
  dotnet_avg_ms: number | null;
  rag_core_avg_ms: number | null;
  esg_tables: number;
  esg_fact_rows: number;
  indexed_chunks: number;
  active_index: string;
}

export interface DotnetEndpointLatencySample {
  timestamp: number;
  endpoint: string;
  method: string;
  path: string;
  latency_ms: number;
  status: string;
  reachable: boolean;
}

export interface ResourceUsageSample {
  timestamp: number;
  label: string;
  process_cpu_pct: number;
  system_cpu_pct: number;
  memory_pct: number;
  process_rss_mb: number;
  process_heap_mb: number;
  system_mem_used_mb: number;
  system_mem_total_mb: number;
}

export interface ResourceUsageSummary {
  cpu_cores: number;
  uptime_sec: number;
  load_avg_1m: number;
  current: ResourceUsageSample;
}

export interface BackendHealthReport {
  timestamp: number;
  dotnet_url: string;
  python_url: string;
  summary: BackendHealthSummary;
  services: ServiceProbe[];
  endpoints: EndpointStatus[];
  history: HealthHistoryPoint[];
  dotnet_endpoint_samples_1h?: DotnetEndpointLatencySample[];
  resource_usage?: ResourceUsageSummary;
  resource_history?: ResourceUsageSample[];
}

export interface DotnetPingResult {
  id: string;
  method: string;
  path: string;
  canonical_path?: string;
  title?: string;
  description?: string;
  upstream?: string;
  query_params?: string[];
  sample_request?: string | null;
  url: string;
  reachable: boolean;
  ok: boolean;
  active?: boolean;
  status_code: number | null;
  latency_ms: number;
  error: string | null;
}

export interface DotnetConnectivityTestResponse {
  ok: boolean;
  dotnet_url: string;
  checked_at: number;
  reachable_count: number;
  total_count: number;
  average_latency_ms: number | null;
  results: DotnetPingResult[];
}

export async function fetchBackendHealth(
  dotnetUrl?: string,
  pythonUrl?: string,
): Promise<BackendHealthReport> {
  const params = new URLSearchParams();
  if (dotnetUrl?.trim()) params.set("dotnet_url", dotnetUrl.trim());
  if (pythonUrl?.trim()) params.set("python_url", pythonUrl.trim());
  const qs = params.toString();
  return apiRequest(`/backend-health${qs ? `?${qs}` : ""}`);
}

export async function triggerBackendProbe(
  dotnetUrl?: string,
  pythonUrl?: string,
): Promise<BackendHealthReport> {
  return apiRequest("/backend-health/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dotnet_url: dotnetUrl?.trim() || undefined,
      python_url: pythonUrl?.trim() || undefined,
    }),
  });
}

export async function pingDotnetEndpoints(
  dotnetUrl?: string,
): Promise<DotnetConnectivityTestResponse> {
  return apiRequest("/backend-health/ping-dotnet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dotnet_url: dotnetUrl?.trim() || undefined,
    }),
  });
}

export async function fetchDotnetApiDocs(
  dotnetUrl?: string,
): Promise<DotnetConnectivityTestResponse> {
  const params = new URLSearchParams();
  if (dotnetUrl?.trim()) params.set("dotnet_url", dotnetUrl.trim());
  const qs = params.toString();
  return apiRequest(`/backend-health/api-docs${qs ? `?${qs}` : ""}`);
}

export async function fetchServiceDiscovery(
  dotnetUrl?: string,
  pythonUrl?: string,
): Promise<ServiceDiscoveryResponse> {
  const params = new URLSearchParams();
  if (dotnetUrl?.trim()) params.set("dotnet_url", dotnetUrl.trim());
  if (pythonUrl?.trim()) params.set("python_url", pythonUrl.trim());
  const qs = params.toString();
  return apiRequest(`/backend-health/services${qs ? `?${qs}` : ""}`);
}

export interface ServiceMetricsPoint {
  timestamp: number;
  label: string;
  overall_avg_ms: number;
  rag_core_avg_ms: number;
  esg_store_avg_ms: number;
  dotnet_avg_ms: number | null;
  python_avg_ms: number | null;
  sample_count: number;
}

export interface ServiceMetricsSummary {
  sample_count: number;
  overall_avg_ms: number | null;
  p95_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  rag_core_avg_ms: number | null;
  esg_store_avg_ms: number | null;
  dotnet_avg_ms: number | null;
}

export interface ServiceMetricsResponse {
  timestamp: number;
  window_minutes: number;
  dotnet_url: string;
  python_url: string;
  summary: ServiceMetricsSummary;
  series: ServiceMetricsPoint[];
}

export async function fetchServiceMetrics(
  dotnetUrl?: string,
  windowMinutes = 60,
  pythonUrl?: string,
): Promise<ServiceMetricsResponse> {
  const params = new URLSearchParams();
  params.set("window_minutes", String(windowMinutes));
  if (dotnetUrl?.trim()) params.set("dotnet_url", dotnetUrl.trim());
  if (pythonUrl?.trim()) params.set("python_url", pythonUrl.trim());
  return apiRequest(`/backend-health/metrics?${params.toString()}`);
}

export type BackendLogSeverity = "critical" | "error" | "warning";

export interface BackendErrorLogEntry {
  id: string;
  timestamp: number;
  severity: BackendLogSeverity;
  service: string;
  source: string;
  status_code: number | null;
  message: string;
  occurrences: number;
}

export interface BackendErrorLogsResponse {
  timestamp: number;
  total_count: number;
  counts: {
    critical: number;
    error: number;
    warning: number;
  };
  logs: BackendErrorLogEntry[];
}

export async function fetchBackendErrorLogs(
  dotnetUrl?: string,
  limit = 10,
  severity: "all" | BackendLogSeverity = "all",
  pythonUrl?: string,
): Promise<BackendErrorLogsResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (severity !== "all") params.set("severity", severity);
  if (dotnetUrl?.trim()) params.set("dotnet_url", dotnetUrl.trim());
  if (pythonUrl?.trim()) params.set("python_url", pythonUrl.trim());
  return apiRequest(`/backend-health/logs?${params.toString()}`);
}

export async function clearBackendErrorLogs(): Promise<{
  cleared: boolean;
  timestamp: number;
}> {
  return apiRequest("/backend-health/logs", {
    method: "DELETE",
  });
}
