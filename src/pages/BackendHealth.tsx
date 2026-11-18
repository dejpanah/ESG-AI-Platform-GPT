import { AppShell } from "@/components/AppShell";
import { StatusDot, type Tone } from "@/components/StatusDot";
import { PageBody, PageHeader, Workspace } from "@/components/system/layout";
import {
  Callout,
  EmptyNote,
  KeyValue,
  Panel,
  Stat,
} from "@/components/system/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearBackendErrorLogs,
  fetchBackendErrorLogs,
  fetchBackendHealth,
  fetchDotnetApiDocs,
  fetchServiceDiscovery,
  fetchServiceMetrics,
  pingDotnetEndpoints,
  triggerBackendProbe,
  type BackendErrorLogsResponse,
  type BackendHealthReport,
  type BackendLogSeverity,
  type DotnetConnectivityTestResponse,
  type EndpointStatus,
  type ServiceDiscoveryResponse,
  type ServiceMetricsResponse,
  type ServiceOperationalStatus,
  type ServiceProbe,
} from "@/api/backend-health";
import { syncEsgToRag } from "@/api/esg-data";
import {
  buildBackendHealthCsv,
  triggerCsvDownload,
} from "@/lib/backend-health-export";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Server,
  Sparkles,
  Trash2,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

const DOTNET_URL_KEY = "knowledgeos.dotnetGatewayUrl";
const ALERT_CONFIG_KEY = "knowledgeos.backendHealthAlertConfig";
const TOAST_COOLDOWN_MS = 30_000;
const THRESHOLD_PRESETS = [50, 150, 250, 500, 1000] as const;

type AlertScope = "dotnet" | "all";

interface AlertConfig {
  enabled: boolean;
  thresholdMs: number;
  toastEnabled: boolean;
  scope: AlertScope;
}

interface LatencyAlertEvent {
  id: string;
  timestamp: number;
  target: string;
  kind: "service" | "endpoint";
  latencyMs: number;
  thresholdMs: number;
  severity: "warning" | "critical";
  status: string;
  acknowledged: boolean;
}

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  enabled: true,
  thresholdMs: 250,
  toastEnabled: true,
  scope: "dotnet",
};

function loadAlertConfig(): AlertConfig {
  try {
    const raw = window.localStorage.getItem(ALERT_CONFIG_KEY);
    if (!raw) return DEFAULT_ALERT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AlertConfig>;
    const threshold = Number(parsed.thresholdMs);
    return {
      enabled: parsed.enabled ?? DEFAULT_ALERT_CONFIG.enabled,
      thresholdMs:
        Number.isFinite(threshold) && threshold >= 1
          ? Math.min(30_000, Math.round(threshold))
          : DEFAULT_ALERT_CONFIG.thresholdMs,
      toastEnabled: parsed.toastEnabled ?? DEFAULT_ALERT_CONFIG.toastEnabled,
      scope: parsed.scope === "all" ? "all" : "dotnet",
    };
  } catch {
    return DEFAULT_ALERT_CONFIG;
  }
}

function saveAlertConfig(config: AlertConfig) {
  try {
    window.localStorage.setItem(ALERT_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota errors
  }
}

function toneForStatus(status: ServiceProbe["status"]): Tone {
  if (status === "connected") return "ok";
  if (status === "degraded") return "warn";
  return "bad";
}

function getOperationalStatus(svc: ServiceProbe): ServiceOperationalStatus {
  if (svc.operational_status) return svc.operational_status;
  if (svc.status === "connected") return "Operational";
  if (svc.status === "degraded") return "Degraded";
  return "Offline";
}

function ServiceStatusBadge({ status }: { status: ServiceOperationalStatus }) {
  const tone: Tone =
    status === "Operational" ? "ok" : status === "Degraded" ? "warn" : "bad";
  const style =
    status === "Operational"
      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "Degraded"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300";

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide",
        style,
      )}
    >
      <StatusDot tone={tone} pulse={status === "Operational"} />
      <span>{status}</span>
    </Badge>
  );
}

function LogSeverityBadge({ severity }: { severity: BackendLogSeverity }) {
  const tone: Tone = severity === "warning" ? "warn" : "bad";
  const style =
    severity === "critical"
      ? "border-rose-600/45 bg-rose-500/15 text-rose-700 dark:text-rose-300"
      : severity === "error"
        ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
        style,
      )}
    >
      <StatusDot tone={tone} pulse={severity === "critical"} />
      <span>{severity}</span>
    </Badge>
  );
}

function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  return `${ms.toFixed(1)} ms`;
}

const HISTOGRAM_BUCKETS = [
  { key: "0-10", label: "0–10ms", min: 0, max: 10 },
  { key: "10-25", label: "10–25ms", min: 10, max: 25 },
  { key: "25-50", label: "25–50ms", min: 25, max: 50 },
  { key: "50-100", label: "50–100ms", min: 50, max: 100 },
  { key: "100-250", label: "100–250ms", min: 100, max: 250 },
  { key: "250+", label: "250ms+", min: 250, max: Infinity },
] as const;

const DOTNET_ENDPOINT_SERIES = [
  {
    endpoint: "GET /api/ingest/health",
    shortLabel: "GET /ingest/health",
    color: "#16a34a",
  },
  {
    endpoint: "POST /api/ingest/device",
    shortLabel: "POST /ingest/device",
    color: "#0284c7",
  },
  {
    endpoint: "POST /api/ingest/batch/{table}",
    shortLabel: "POST /ingest/batch",
    color: "#d97706",
  },
  {
    endpoint: "POST /api/ingest/sync-rag",
    shortLabel: "POST /ingest/sync-rag",
    color: "#7c3aed",
  },
] as const;

function computePercentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function collectBreaches(
  data: BackendHealthReport,
  config: AlertConfig,
): Omit<LatencyAlertEvent, "id" | "acknowledged">[] {
  if (!config.enabled) return [];
  const breaches: Omit<LatencyAlertEvent, "id" | "acknowledged">[] = [];
  const threshold = config.thresholdMs;

  const servicesToCheck =
    config.scope === "all"
      ? data.services
      : data.services.filter((s) => s.id === "dotnet_gateway");

  for (const svc of servicesToCheck) {
    if (svc.latency_ms > threshold) {
      breaches.push({
        timestamp: data.timestamp,
        target: svc.name,
        kind: "service",
        latencyMs: svc.latency_ms,
        thresholdMs: threshold,
        severity: svc.latency_ms >= threshold * 2 ? "critical" : "warning",
        status: svc.status,
      });
    }
  }

  const endpointsToCheck: EndpointStatus[] =
    config.scope === "all"
      ? data.endpoints
      : data.endpoints.filter((ep) => ep.service === ".NET Web API");

  for (const ep of endpointsToCheck) {
    if (ep.latency_ms !== null && ep.latency_ms > threshold) {
      breaches.push({
        timestamp: data.timestamp,
        target: `${ep.method} ${ep.path}`,
        kind: "endpoint",
        latencyMs: ep.latency_ms,
        thresholdMs: threshold,
        severity: ep.latency_ms >= threshold * 2 ? "critical" : "warning",
        status: ep.status,
      });
    }
  }

  return breaches;
}

function BackendHealthWorkspace() {
  const [dotnetUrl, setDotnetUrl] = useState<string>(() => {
    try {
      return (
        window.localStorage.getItem(DOTNET_URL_KEY) || "http://127.0.0.1:5180"
      );
    } catch {
      return "http://127.0.0.1:5180";
    }
  });
  const [appliedDotnetUrl, setAppliedDotnetUrl] = useState(dotnetUrl);
  const [pollSeconds, setPollSeconds] = useState<number>(5);
  const [report, setReport] = useState<BackendHealthReport | null>(null);
  const [serviceDiscovery, setServiceDiscovery] =
    useState<ServiceDiscoveryResponse | null>(null);
  const [serviceMetrics, setServiceMetrics] =
    useState<ServiceMetricsResponse | null>(null);
  const [errorLogsData, setErrorLogsData] =
    useState<BackendErrorLogsResponse | null>(null);
  const [logSeverityFilter, setLogSeverityFilter] = useState<
    "all" | BackendLogSeverity
  >("all");
  const [clearingLogs, setClearingLogs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [testingConnectivity, setTestingConnectivity] = useState(false);
  const [pingHistory, setPingHistory] = useState<
    DotnetConnectivityTestResponse[]
  >([]);
  const pingReport = pingHistory[0] ?? null;
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [alertConfig, setAlertConfig] = useState<AlertConfig>(loadAlertConfig);
  const [thresholdInput, setThresholdInput] = useState<string>(() =>
    String(loadAlertConfig().thresholdMs),
  );
  const [alertHistory, setAlertHistory] = useState<LatencyAlertEvent[]>([]);
  const [dismissedAt, setDismissedAt] = useState<number>(0);
  const [histogramEndpointFilter, setHistogramEndpointFilter] =
    useState<string>("all");
  const [histogramStacked, setHistogramStacked] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"telemetry" | "api-docs">(
    "telemetry",
  );
  const [apiDocsDiscovery, setApiDocsDiscovery] =
    useState<DotnetConnectivityTestResponse | null>(null);
  const [discoveringDocs, setDiscoveringDocs] = useState<boolean>(false);
  const [apiDocsOnlyActive, setApiDocsOnlyActive] = useState<boolean>(false);

  const alertConfigRef = useRef(alertConfig);
  const lastToastAtRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    alertConfigRef.current = alertConfig;
  }, [alertConfig]);

  const evaluateAlerts = useCallback(
    (data: BackendHealthReport, forceToast = false) => {
      const cfg = alertConfigRef.current;
      const breaches = collectBreaches(data, cfg);
      if (breaches.length === 0) return;

      const created: LatencyAlertEvent[] = breaches.map((b, idx) => ({
        ...b,
        id: `${data.timestamp}-${idx}-${b.target}`,
        acknowledged: false,
      }));

      setAlertHistory((prev) => [...created, ...prev].slice(0, 50));

      if (!cfg.toastEnabled) return;
      const now = Date.now();
      const notifyTargets: LatencyAlertEvent[] = [];

      for (const item of created) {
        const last = lastToastAtRef.current.get(item.target) ?? 0;
        if (forceToast || now - last >= TOAST_COOLDOWN_MS) {
          lastToastAtRef.current.set(item.target, now);
          notifyTargets.push(item);
        }
      }

      if (notifyTargets.length > 0) {
        const top = notifyTargets[0];
        const summary =
          notifyTargets.length === 1
            ? `${top.target} latency (${top.latencyMs.toFixed(1)} ms) exceeded ${top.thresholdMs} ms threshold`
            : `${notifyTargets.length} targets exceeded ${top.thresholdMs} ms latency threshold (peak: ${top.target} at ${top.latencyMs.toFixed(1)} ms)`;

        if (notifyTargets.some((n) => n.severity === "critical")) {
          toast.error(`Latency Alert: ${summary}`);
        } else {
          toast.warning(`Latency Alert: ${summary}`);
        }
      }
    },
    [],
  );

  const loadProbe = useCallback(
    async (explicit = false) => {
      if (explicit) setProbing(true);
      try {
        const [probeResult, discoveryResult] = await Promise.allSettled([
          explicit
            ? triggerBackendProbe(appliedDotnetUrl)
            : fetchBackendHealth(appliedDotnetUrl),
          fetchServiceDiscovery(appliedDotnetUrl),
        ]);
        if (probeResult.status === "fulfilled") {
          setReport(probeResult.value);
          setError(null);
          evaluateAlerts(probeResult.value, explicit);
        } else {
          throw probeResult.reason;
        }
        if (discoveryResult.status === "fulfilled") {
          setServiceDiscovery(discoveryResult.value);
        }
        try {
          const [metricsData, logsData] = await Promise.allSettled([
            fetchServiceMetrics(appliedDotnetUrl, 60),
            fetchBackendErrorLogs(appliedDotnetUrl, 10, logSeverityFilter),
          ]);
          if (metricsData.status === "fulfilled") {
            setServiceMetrics(metricsData.value);
          }
          if (logsData.status === "fulfilled") {
            setErrorLogsData(logsData.value);
          }
        } catch {
          // Keep last metrics/logs snapshots on transient error
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to probe backends");
      } finally {
        setLoading(false);
        setProbing(false);
      }
    },
    [appliedDotnetUrl, evaluateAlerts, logSeverityFilter],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [probeResult, discoveryResult] = await Promise.allSettled([
          fetchBackendHealth(appliedDotnetUrl),
          fetchServiceDiscovery(appliedDotnetUrl),
        ]);
        if (!active) return;
        if (probeResult.status === "fulfilled") {
          setReport(probeResult.value);
          setError(null);
          evaluateAlerts(probeResult.value, false);
        } else {
          throw probeResult.reason;
        }
        if (discoveryResult.status === "fulfilled") {
          setServiceDiscovery(discoveryResult.value);
        }
        try {
          const [metricsData, logsData] = await Promise.allSettled([
            fetchServiceMetrics(appliedDotnetUrl, 60),
            fetchBackendErrorLogs(appliedDotnetUrl, 10, logSeverityFilter),
          ]);
          if (!active) return;
          if (metricsData.status === "fulfilled") {
            setServiceMetrics(metricsData.value);
          }
          if (logsData.status === "fulfilled") {
            setErrorLogsData(logsData.value);
          }
        } catch {
          // Non-fatal on initial load
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Failed to probe backends");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [appliedDotnetUrl, evaluateAlerts, logSeverityFilter]);

  useEffect(() => {
    if (pollSeconds <= 0) return;
    const timer = window.setInterval(() => {
      void loadProbe(false);
    }, pollSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [pollSeconds, loadProbe]);

  const updateAlertConfig = (patch: Partial<AlertConfig>) => {
    setAlertConfig((prev) => {
      const next = { ...prev, ...patch };
      saveAlertConfig(next);
      alertConfigRef.current = next;
      return next;
    });
  };

  const handleApplyThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(thresholdInput);
    if (!Number.isFinite(numeric) || numeric < 1 || numeric > 30_000) {
      toast.error("Threshold must be between 1 ms and 30,000 ms");
      return;
    }
    const rounded = Math.round(numeric);
    setThresholdInput(String(rounded));
    const nextConfig: AlertConfig = { ...alertConfig, thresholdMs: rounded };
    setAlertConfig(nextConfig);
    saveAlertConfig(nextConfig);
    alertConfigRef.current = nextConfig;
    lastToastAtRef.current.clear();
    if (report) {
      evaluateAlerts(report, true);
    }
    toast.success(`Latency alert threshold set to ${rounded} ms`);
  };

  const handleApplyGatewayUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = dotnetUrl.trim() || "http://127.0.0.1:5180";
    setDotnetUrl(cleaned);
    setAppliedDotnetUrl(cleaned);
    try {
      window.localStorage.setItem(DOTNET_URL_KEY, cleaned);
    } catch {
      // ignore storage quota
    }
    toast.success(`Updated .NET gateway target to ${cleaned}`);
  };

  const handleSyncRag = async () => {
    setSyncing(true);
    try {
      const res = await syncEsgToRag();
      toast.success(
        `Synced ${res.records_synced} ESG rows (${res.chunks_indexed} chunks)`,
      );
      await loadProbe(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "RAG sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleClearErrorLogs = async () => {
    setClearingLogs(true);
    try {
      const res = await clearBackendErrorLogs();
      setErrorLogsData({
        timestamp: res.timestamp,
        total_count: 0,
        counts: { critical: 0, error: 0, warning: 0 },
        logs: [],
      });
      toast.success("Cleared recent backend error logs");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to clear backend error logs",
      );
    } finally {
      setClearingLogs(false);
    }
  };

  const runApiDocsDiscovery = useCallback(
    async (targetUrl?: string) => {
      const cleaned = (targetUrl ?? dotnetUrl).trim() || appliedDotnetUrl;
      setDiscoveringDocs(true);
      try {
        const res = await fetchDotnetApiDocs(cleaned);
        setApiDocsDiscovery(res);
        void loadProbe(false);
      } catch (e) {
        toast.error(
          e instanceof Error
            ? `API discovery failed: ${e.message}`
            : "Failed to discover .NET Web API endpoints",
        );
      } finally {
        setDiscoveringDocs(false);
      }
    },
    [appliedDotnetUrl, dotnetUrl, loadProbe],
  );

  useEffect(() => {
    if (activeTab !== "api-docs") return;
    let active = true;
    (async () => {
      try {
        const res = await fetchDotnetApiDocs(appliedDotnetUrl);
        if (!active) return;
        setApiDocsDiscovery(res);
      } catch (e) {
        if (active) {
          toast.error(
            e instanceof Error
              ? `API discovery failed: ${e.message}`
              : "Failed to discover .NET Web API endpoints",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTab, appliedDotnetUrl]);

  const handleConnectivityTest = async () => {
    const targetUrl = dotnetUrl.trim() || appliedDotnetUrl;
    setTestingConnectivity(true);
    try {
      const res = await pingDotnetEndpoints(targetUrl);
      setPingHistory((prev) => [res, ...prev].slice(0, 20));
      setApiDocsDiscovery(res);
      if (res.ok) {
        toast.success(
          `Connectivity Test passed: ${res.reachable_count}/${res.total_count} .NET Web API endpoints reachable (avg ${res.average_latency_ms ?? 0} ms)`,
        );
      } else {
        const failed = res.results.filter((r) => !r.ok);
        const firstReason =
          failed.find((r) => r.error)?.error ||
          (failed[0]?.status_code ? `HTTP ${failed[0].status_code}` : "unreachable");
        toast.error(
          `Connectivity Test failed: ${res.reachable_count}/${res.total_count} .NET endpoints reachable at ${res.dotnet_url} (${firstReason})`,
        );
      }
      void loadProbe(false);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Connectivity Test error: ${e.message}`
          : "Connectivity Test failed",
      );
    } finally {
      setTestingConnectivity(false);
    }
  };

  const handleExportCsv = () => {
    if (!report && alertHistory.length === 0 && pingHistory.length === 0) {
      toast.error("No latency metrics or connectivity logs available to export yet");
      return;
    }
    try {
      const { csv, filename, rowCount } = buildBackendHealthCsv({
        report,
        alertHistory,
        pingHistory,
        thresholdMs: alertConfig.thresholdMs,
        alertsEnabled: alertConfig.enabled,
      });
      triggerCsvDownload(filename, csv);
      toast.success(`Exported ${rowCount} monitoring rows to ${filename}`);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Export failed: ${e.message}`
          : "Failed to export monitoring CSV",
      );
    }
  };

  const currentBreaches = useMemo(() => {
    if (!report) return [];
    return collectBreaches(report, alertConfig);
  }, [report, alertConfig]);

  const showActiveBanner =
    alertConfig.enabled &&
    currentBreaches.length > 0 &&
    (report?.timestamp ?? 0) > dismissedAt;

  const registeredServices = useMemo(
    () => serviceDiscovery?.services ?? report?.services ?? [],
    [serviceDiscovery, report],
  );

  const dotnetService = useMemo(
    () => registeredServices.find((s) => s.id === "dotnet_gateway") ?? null,
    [registeredServices],
  );
  const ragCoreService = useMemo(
    () => registeredServices.find((s) => s.id === "rag_core") ?? null,
    [registeredServices],
  );

  const latencySeries = useMemo(() => {
    if (!report) return [];
    return report.history.map((point) => ({
      time: point.label,
      "RAG Core": point.rag_core_ms,
      "ESG Store": point.esg_store_ms,
      ".NET API": point.dotnet_ms,
      "Python RAG": point.python_ms,
    }));
  }, [report]);

  const resourceSeries = useMemo(() => {
    if (!report?.resource_history) return [];
    return report.resource_history.map((point) => ({
      time: point.label,
      "Process CPU %": point.process_cpu_pct,
      "System CPU %": point.system_cpu_pct,
      "Memory %": point.memory_pct,
    }));
  }, [report]);

  const hourlyLatencySeries = useMemo(() => {
    if (!serviceMetrics?.series) return [];
    return serviceMetrics.series.map((point) => ({
      time: point.label,
      "Overall Avg": point.overall_avg_ms,
      "RAG Core Avg": point.rag_core_avg_ms,
      "ESG Store Avg": point.esg_store_avg_ms,
      ".NET Avg": point.dotnet_avg_ms,
    }));
  }, [serviceMetrics]);

  const serviceComparisonData = useMemo(() => {
    if (!report) return [];
    return report.services.map((s) => ({
      name: s.name.replace("KnowledgeOS ", "").replace(" Gateway", ""),
      latency: s.latency_ms,
      status: s.status,
      overThreshold: alertConfig.enabled && s.latency_ms > alertConfig.thresholdMs,
    }));
  }, [report, alertConfig.enabled, alertConfig.thresholdMs]);

  const endpointChartData = useMemo(() => {
    if (!report) return [];
    return report.endpoints.map((ep) => {
      const latency = ep.latency_ms ?? 0;
      const isDotnet = ep.service === ".NET Web API";
      const inScope = alertConfig.scope === "all" || isDotnet;
      return {
        endpoint: `${ep.method} ${ep.path.replace("/api/ingest/", "/ingest/").replace("/api/v1/esg/", "/esg/")}`,
        latency,
        status: ep.status,
        overThreshold:
          alertConfig.enabled &&
          inScope &&
          ep.latency_ms !== null &&
          ep.latency_ms > alertConfig.thresholdMs,
      };
    });
  }, [report, alertConfig]);

  const unacknowledgedCount = useMemo(
    () => alertHistory.filter((a) => !a.acknowledged).length,
    [alertHistory],
  );

  const dotnetSamplesLastHour = useMemo(() => {
    if (!report) return [];
    const cutoff = report.timestamp - 60 * 60 * 1000;
    const raw = report.dotnet_endpoint_samples_1h ?? [];
    return raw.filter((s) => s.timestamp >= cutoff);
  }, [report]);

  const filteredHistogramSamples = useMemo(() => {
    if (histogramEndpointFilter === "all") return dotnetSamplesLastHour;
    return dotnetSamplesLastHour.filter(
      (s) => s.endpoint === histogramEndpointFilter,
    );
  }, [dotnetSamplesLastHour, histogramEndpointFilter]);

  const histogramStats = useMemo(() => {
    const sorted = filteredHistogramSamples
      .map((s) => s.latency_ms)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    const overThresholdCount = alertConfig.enabled
      ? sorted.filter((v) => v > alertConfig.thresholdMs).length
      : 0;
    return {
      count: sorted.length,
      p50: computePercentile(sorted, 50),
      p95: computePercentile(sorted, 95),
      max: sorted.length > 0 ? sorted[sorted.length - 1] : null,
      overThresholdCount,
    };
  }, [filteredHistogramSamples, alertConfig.enabled, alertConfig.thresholdMs]);

  const visibleHistogramSeries = useMemo(() => {
    if (histogramEndpointFilter === "all") return DOTNET_ENDPOINT_SERIES;
    return DOTNET_ENDPOINT_SERIES.filter(
      (s) => s.endpoint === histogramEndpointFilter,
    );
  }, [histogramEndpointFilter]);

  const histogramData = useMemo(() => {
    const rows = HISTOGRAM_BUCKETS.map((bucket) => {
      const base: Record<string, string | number | boolean> = {
        bucket: bucket.label,
        overThreshold:
          alertConfig.enabled && bucket.max > alertConfig.thresholdMs,
        total: 0,
      };
      for (const series of DOTNET_ENDPOINT_SERIES) {
        base[series.endpoint] = 0;
      }
      return { ...bucket, row: base };
    });

    for (const sample of filteredHistogramSamples) {
      const targetBucket =
        rows.find(
          (b) => sample.latency_ms >= b.min && sample.latency_ms < b.max,
        ) ?? rows[rows.length - 1];
      if (!targetBucket) continue;
      if (typeof targetBucket.row[sample.endpoint] === "number") {
        targetBucket.row[sample.endpoint] =
          (targetBucket.row[sample.endpoint] as number) + 1;
      }
      targetBucket.row.total = (targetBucket.row.total as number) + 1;
    }

    return rows.map((b) => b.row);
  }, [filteredHistogramSamples, alertConfig.enabled, alertConfig.thresholdMs]);

  return (
    <Workspace>
      <PageHeader
        title="Backend Health"
        description="Real-time connectivity probes, latency thresholds, and automated alert notifications across the .NET Web API gateway and RAG backends."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={alertConfig.enabled ? "outline" : "ghost"}
            className={cn(
              "h-7 text-[11px]",
              currentBreaches.length > 0 &&
                alertConfig.enabled &&
                "border-[var(--term-warn)] text-[var(--term-warn)]",
            )}
            onClick={() => updateAlertConfig({ enabled: !alertConfig.enabled })}
          >
            {alertConfig.enabled ? (
              <Bell className="size-3.5" />
            ) : (
              <BellOff className="size-3.5" />
            )}
            Alerts: {alertConfig.enabled ? `${alertConfig.thresholdMs}ms` : "Off"}
          </Button>
          <select
            aria-label="Polling interval"
            value={String(pollSeconds)}
            onChange={(e) => setPollSeconds(Number(e.target.value))}
            className="h-7 rounded-md border border-input bg-background px-2 text-[11px]"
          >
            <option value="5">Poll: 5s</option>
            <option value="10">Poll: 10s</option>
            <option value="30">Poll: 30s</option>
            <option value="0">Poll: Paused</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => void handleConnectivityTest()}
            disabled={testingConnectivity}
          >
            {testingConnectivity ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Wifi className="size-3.5" />
            )}
            Connectivity Test
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => void loadProbe(true)}
            disabled={probing}
          >
            <RefreshCw className={cn("size-3.5", probing && "animate-spin")} />
            Probe now
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={handleExportCsv}
            disabled={
              !report && alertHistory.length === 0 && pingHistory.length === 0
            }
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => void handleSyncRag()}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Sync ESG → RAG
          </Button>
        </div>
      </PageHeader>

      <PageBody>
        <div
          role="tablist"
          aria-label="Backend Health views"
          className="flex flex-wrap items-center gap-1 border-b border-border pb-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "telemetry"}
            onClick={() => setActiveTab("telemetry")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors",
              activeTab === "telemetry"
                ? "bg-primary/10 text-foreground ring-1 ring-primary/30"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Activity className="size-3.5" />
            Telemetry &amp; Latency
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "api-docs"}
            onClick={() => setActiveTab("api-docs")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors",
              activeTab === "api-docs"
                ? "bg-primary/10 text-foreground ring-1 ring-primary/30"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <BookOpen className="size-3.5" />
            API Docs
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {apiDocsDiscovery
                ? `${apiDocsDiscovery.reachable_count}/${apiDocsDiscovery.total_count}`
                : report
                  ? report.endpoints.filter((e) => e.service === ".NET Web API")
                      .length
                  : 4}
            </span>
          </button>
        </div>

        {activeTab === "api-docs" ? (
          <div className="space-y-4">
            <Panel
              title=".NET Web API Live Service Discovery & Endpoint Reference"
              description="Dynamically discovered using the same non-mutating probe pipeline as Connectivity Test"
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setApiDocsOnlyActive((prev) => !prev)}
                    className={cn(
                      "h-7 rounded-md border px-2.5 font-mono text-[10.5px] transition-colors",
                      apiDocsOnlyActive
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-input bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {apiDocsOnlyActive
                      ? "Showing: Active only"
                      : "Showing: All discovered"}
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => void runApiDocsDiscovery()}
                    disabled={discoveringDocs}
                  >
                    {discoveringDocs ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    Re-discover endpoints
                  </Button>
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-4 text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <StatusDot
                    tone={
                      !apiDocsDiscovery
                        ? "idle"
                        : apiDocsDiscovery.ok
                          ? "ok"
                          : apiDocsDiscovery.reachable_count > 0
                            ? "warn"
                            : "bad"
                    }
                  />
                  Gateway:{" "}
                  <code className="font-mono">
                    {apiDocsDiscovery?.dotnet_url ?? appliedDotnetUrl}
                  </code>
                </span>
                <span className="term-dim font-mono">
                  Active endpoints:{" "}
                  <strong className="text-foreground">
                    {apiDocsDiscovery?.reachable_count ?? 0}/
                    {apiDocsDiscovery?.total_count ?? 4}
                  </strong>
                </span>
                <span className="term-dim font-mono">
                  Avg discovery latency:{" "}
                  {apiDocsDiscovery?.average_latency_ms !== null &&
                  apiDocsDiscovery?.average_latency_ms !== undefined
                    ? `${apiDocsDiscovery.average_latency_ms.toFixed(1)} ms`
                    : "—"}
                </span>
                <span className="term-dim font-mono">
                  Checked:{" "}
                  {apiDocsDiscovery
                    ? new Date(apiDocsDiscovery.checked_at).toLocaleTimeString()
                    : "Discovering…"}
                </span>
              </div>
            </Panel>

            {apiDocsDiscovery && apiDocsDiscovery.reachable_count === 0 && (
              <Callout
                tone="warn"
                title="No live .NET Kestrel endpoints responded to discovery probes"
              >
                Live probes to{" "}
                <code className="font-mono">{apiDocsDiscovery.dotnet_url}</code>{" "}
                did not reach a running{" "}
                <code className="font-mono">ESG-Intelligence-Web-DotNet</code>{" "}
                process.{" "}
                {apiDocsOnlyActive
                  ? 'Toggle to "Showing: All discovered" above to inspect the discovered route specs in offline/standby mode.'
                  : "Showing all configured discovery routes with their live status below."}
              </Callout>
            )}

            {!apiDocsDiscovery ? (
              <div className="flex items-center gap-2 py-8 text-[12px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Running live endpoint discovery on {appliedDotnetUrl}…
              </div>
            ) : (
              (() => {
                const visibleEndpoints = apiDocsOnlyActive
                  ? apiDocsDiscovery.results.filter(
                      (item) => item.active ?? item.ok,
                    )
                  : apiDocsDiscovery.results;

                if (visibleEndpoints.length === 0) {
                  return (
                    <EmptyNote>
                      No active .NET Web API endpoints responded on{" "}
                      {apiDocsDiscovery.dotnet_url}. Switch the filter to
                      &ldquo;All discovered&rdquo; or start the .NET gateway to
                      inspect endpoints.
                    </EmptyNote>
                  );
                }

                return (
                  <div className="grid gap-3">
                    {visibleEndpoints.map((ep) => {
                      const isActive = ep.active ?? ep.ok;
                      const displayPath = ep.canonical_path || ep.path;
                      const curlCmd = ep.sample_request
                        ? `curl -X ${ep.method} "${ep.url}" -H "Content-Type: application/json" -d '${ep.sample_request.replace(/\s+/g, " ")}'`
                        : `curl -X ${ep.method} "${ep.url}"`;
                      return (
                        <Panel
                          key={ep.id}
                          title={ep.title ?? `${ep.method} ${displayPath}`}
                          description={`${ep.method} ${displayPath}`}
                          actions={
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10.5px]">
                                <StatusDot tone={isActive ? "ok" : "bad"} />
                                <span>
                                  {isActive
                                    ? `Active · HTTP ${ep.status_code ?? 200} · ${ep.latency_ms.toFixed(0)}ms`
                                    : `Offline · ${ep.error || "unreachable"}`}
                                </span>
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10.5px]"
                                onClick={() => {
                                  void navigator.clipboard
                                    .writeText(curlCmd)
                                    .then(() =>
                                      toast.success(
                                        `Copied cURL for ${ep.method} ${displayPath}`,
                                      ),
                                    )
                                    .catch(() =>
                                      toast.error("Clipboard access denied"),
                                    );
                                }}
                              >
                                <Copy className="size-3" />
                                Copy cURL
                              </Button>
                            </div>
                          }
                        >
                          <div className="space-y-2.5 text-[11.5px]">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold",
                                  ep.method === "GET"
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                    : "bg-sky-500/15 text-sky-700 dark:text-sky-300",
                                )}
                              >
                                {ep.method}
                              </span>
                              <code className="font-mono text-[12px] font-semibold text-foreground">
                                {displayPath}
                              </code>
                            </div>
                            <p className="text-foreground/90">
                              {ep.description ||
                                "Configured .NET Web API gateway route."}
                            </p>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              <KeyValue label="Target URL" value={ep.url} />
                              <KeyValue
                                label="Upstream RAG Route"
                                value={ep.upstream || "—"}
                              />
                            </div>
                            {ep.query_params && ep.query_params.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="term-dim">Query params:</span>
                                {ep.query_params.map((qp) => (
                                  <code
                                    key={qp}
                                    className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10.5px]"
                                  >
                                    {qp}
                                  </code>
                                ))}
                              </div>
                            )}
                            {ep.sample_request && (
                              <div>
                                <div className="term-dim mb-1 text-[10.5px]">
                                  Example JSON Body
                                </div>
                                <pre className="overflow-x-auto rounded border border-border bg-muted/40 p-2 font-mono text-[10.5px] leading-relaxed">
                                  {ep.sample_request}
                                </pre>
                              </div>
                            )}
                          </div>
                        </Panel>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        ) : loading && !report ? (
          <div className="flex items-center gap-2 py-8 text-[12px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Probing .NET Web API &amp; RAG services…
          </div>
        ) : (
          <>
            {error && (
              <Callout tone="bad" title="Probe request failed">
                {error}
              </Callout>
            )}

            {showActiveBanner && (
              <div
                role="alert"
                className="rounded-md border border-[var(--term-warn)]/50 bg-[var(--term-warn)]/10 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--term-warn)]">
                      <AlertTriangle className="size-4 shrink-0" />
                      Latency Threshold Exceeded ({currentBreaches.length}{" "}
                      {currentBreaches.length === 1 ? "target" : "targets"} &gt;{" "}
                      {alertConfig.thresholdMs} ms)
                    </p>
                    <ul className="space-y-0.5 pl-5 text-[11px]">
                      {currentBreaches.map((b) => (
                        <li key={`${b.kind}-${b.target}`} className="font-mono">
                          <span className="font-semibold">{b.target}</span>:{" "}
                          <span className="text-[var(--term-warn)]">
                            {b.latencyMs.toFixed(1)} ms
                          </span>{" "}
                          <span className="term-dim">
                            (limit {b.thresholdMs} ms · {b.severity})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => setDismissedAt(report?.timestamp ?? Date.now())}
                  >
                    Dismiss banner
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label=".NET Web API"
                value={
                  dotnetService
                    ? dotnetService.status === "connected"
                      ? "Connected"
                      : dotnetService.status === "degraded"
                        ? "Degraded"
                        : "Offline"
                    : "—"
                }
                hint={dotnetService?.url || appliedDotnetUrl}
                tone={dotnetService ? toneForStatus(dotnetService.status) : "idle"}
              />
              <Stat
                label=".NET Gateway latency"
                value={
                  dotnetService?.reachable
                    ? formatLatency(dotnetService.latency_ms)
                    : "Unreachable"
                }
                hint={
                  report?.summary.dotnet_avg_ms !== null &&
                  report?.summary.dotnet_avg_ms !== undefined
                    ? `Avg ${formatLatency(report.summary.dotnet_avg_ms)}`
                    : dotnetService?.error || "Start dotnet run on :5180"
                }
                tone={
                  dotnetService &&
                  alertConfig.enabled &&
                  dotnetService.latency_ms > alertConfig.thresholdMs
                    ? "warn"
                    : dotnetService?.reachable
                      ? "ok"
                      : "warn"
                }
              />
              <Stat
                label="RAG core latency"
                value={formatLatency(ragCoreService?.latency_ms)}
                hint={
                  report?.summary.rag_core_avg_ms !== null &&
                  report?.summary.rag_core_avg_ms !== undefined
                    ? `Avg ${formatLatency(report.summary.rag_core_avg_ms)}`
                    : "Local Express + BM25"
                }
                tone="ok"
              />
              <Stat
                label="Latency alerts"
                value={
                  !alertConfig.enabled
                    ? "Disabled"
                    : currentBreaches.length > 0
                      ? `${currentBreaches.length} active`
                      : "Healthy"
                }
                hint={
                  alertConfig.enabled
                    ? `Limit ${alertConfig.thresholdMs} ms · ${unacknowledgedCount} unread`
                    : "Automated monitoring paused"
                }
                tone={
                  !alertConfig.enabled
                    ? "idle"
                    : currentBreaches.length > 0
                      ? "warn"
                      : "ok"
                }
              />
            </div>

            <Panel
              title="Registered service status"
              description="Live Operational / Degraded / Offline indicator badges pulled from /api/backend-health/services"
              actions={
                serviceDiscovery ? (
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px]">
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {serviceDiscovery.operational_count} Operational
                    </span>
                    <span className="term-dim">·</span>
                    <span className="text-amber-700 dark:text-amber-300">
                      {serviceDiscovery.degraded_count} Degraded
                    </span>
                    <span className="term-dim">·</span>
                    <span className="text-rose-700 dark:text-rose-300">
                      {serviceDiscovery.offline_count} Offline
                    </span>
                  </div>
                ) : undefined
              }
            >
              {registeredServices.length === 0 ? (
                <EmptyNote>Querying service discovery registry…</EmptyNote>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {registeredServices.map((svc) => {
                    const opStatus = getOperationalStatus(svc);
                    return (
                      <div
                        key={svc.id}
                        className="flex flex-col justify-between gap-2 rounded-md border border-border bg-background px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold">
                              {svc.name}
                            </p>
                            <p className="term-dim truncate text-[10.5px]">
                              {svc.role}
                            </p>
                          </div>
                          <ServiceStatusBadge status={opStatus} />
                        </div>
                        <div className="term-dim flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 font-mono text-[10.5px]">
                          <span>
                            {svc.status_code ? `HTTP ${svc.status_code}` : "No HTTP"}
                          </span>
                          <span className="tabular-nums">
                            {formatLatency(svc.latency_ms)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title="Automated Latency Alert Thresholds"
                description="Trigger real-time banners and toast warnings whenever .NET Web API services exceed your SLA threshold"
                actions={
                  <span className="inline-flex items-center gap-1.5 text-[11px]">
                    <StatusDot
                      tone={
                        !alertConfig.enabled
                          ? "idle"
                          : currentBreaches.length > 0
                            ? "warn"
                            : "ok"
                      }
                      pulse={alertConfig.enabled && currentBreaches.length > 0}
                    />
                    <span className="term-dim">
                      {!alertConfig.enabled
                        ? "Monitoring paused"
                        : currentBreaches.length > 0
                          ? `${currentBreaches.length} threshold breach(es)`
                          : `All monitored targets ≤ ${alertConfig.thresholdMs} ms`}
                    </span>
                  </span>
                }
              >
                <div className="space-y-3">
                  <form
                    onSubmit={handleApplyThreshold}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <label className="flex items-center gap-2 text-[11.5px]">
                      <span className="term-dim">Threshold (ms):</span>
                      <Input
                        type="number"
                        min={1}
                        max={30000}
                        step={1}
                        value={thresholdInput}
                        onChange={(e) => setThresholdInput(e.target.value)}
                        className="h-8 w-28 font-mono text-[11.5px]"
                      />
                    </label>
                    <Button type="submit" size="sm" variant="outline" className="h-8 text-[11px]">
                      Apply threshold
                    </Button>
                    <div className="flex flex-wrap gap-1">
                      {THRESHOLD_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setThresholdInput(String(preset));
                            const next: AlertConfig = {
                              ...alertConfig,
                              thresholdMs: preset,
                            };
                            setAlertConfig(next);
                            saveAlertConfig(next);
                            alertConfigRef.current = next;
                            lastToastAtRef.current.clear();
                            if (report) evaluateAlerts(report, true);
                          }}
                          className={cn(
                            "rounded border px-2 py-1 font-mono text-[10.5px] transition-colors",
                            alertConfig.thresholdMs === preset
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {preset}ms
                        </button>
                      ))}
                    </div>
                  </form>

                  <div className="flex flex-wrap items-center gap-4 border-t border-border/60 pt-2.5 text-[11.5px]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={alertConfig.enabled}
                        onChange={(e) =>
                          updateAlertConfig({ enabled: e.target.checked })
                        }
                        className="accent-primary"
                      />
                      <span>Enable automated alerts</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={alertConfig.toastEnabled}
                        onChange={(e) =>
                          updateAlertConfig({ toastEnabled: e.target.checked })
                        }
                        className="accent-primary"
                      />
                      <span>Toast notifications (30s cooldown)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="term-dim">Monitor scope:</span>
                      <select
                        value={alertConfig.scope}
                        onChange={(e) =>
                          updateAlertConfig({
                            scope: e.target.value === "all" ? "all" : "dotnet",
                          })
                        }
                        className="h-7 rounded border border-input bg-background px-2 text-[11px]"
                      >
                        <option value="dotnet">.NET Web API &amp; endpoints</option>
                        <option value="all">All backend services</option>
                      </select>
                    </label>
                  </div>
                </div>
              </Panel>

              <Panel
                title=".NET Web API Gateway Target"
                description="Configure the ESG-Intelligence-Web-DotNet base URL probed via /api/ingest/health"
              >
                <form
                  onSubmit={handleApplyGatewayUrl}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Input
                    value={dotnetUrl}
                    onChange={(e) => setDotnetUrl(e.target.value)}
                    placeholder="http://127.0.0.1:5180"
                    className="h-8 max-w-md font-mono text-[11.5px]"
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-8 text-[11px]">
                    <Server className="size-3.5" />
                    Apply target
                  </Button>
                </form>
                <div className="term-dim mt-3 flex flex-wrap items-center gap-4 text-[11px]">
                  <span>
                    Last probe:{" "}
                    {report
                      ? new Date(report.timestamp).toLocaleTimeString()
                      : "—"}
                  </span>
                  <span>
                    Active index: <code className="font-mono">{report?.summary.active_index ?? "—"}</code>
                  </span>
                  <span>
                    ESG fact rows: <code className="font-mono">{report?.summary.esg_fact_rows ?? 0}</code>
                  </span>
                </div>
                {pingReport && (
                  <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-2.5">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <StatusDot
                          tone={
                            pingReport.ok
                              ? "ok"
                              : pingReport.reachable_count > 0
                                ? "warn"
                                : "bad"
                          }
                        />
                        Connectivity Test:{" "}
                        <span className="font-mono">
                          {pingReport.reachable_count}/{pingReport.total_count}
                        </span>{" "}
                        reachable
                        {pingReport.average_latency_ms !== null && (
                          <span className="term-dim font-mono">
                            (avg {pingReport.average_latency_ms.toFixed(1)} ms)
                          </span>
                        )}
                      </span>
                      <span className="term-dim font-mono text-[10.5px]">
                        {new Date(pingReport.checked_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {pingReport.results.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded border border-border/50 bg-background/60 px-2 py-1 text-[10.5px]"
                        >
                          <span className="inline-flex min-w-0 items-center gap-1.5 font-mono">
                            <StatusDot tone={item.ok ? "ok" : "bad"} />
                            <span className="truncate">
                              {item.method} {item.path}
                            </span>
                          </span>
                          <span className="term-dim shrink-0 font-mono">
                            {item.ok
                              ? `${item.status_code ?? 200} · ${item.latency_ms.toFixed(0)}ms`
                              : item.error || `HTTP ${item.status_code ?? "err"}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                title="Real-time probe latency (ms)"
                description={`Rolling latency timeline with ${alertConfig.thresholdMs} ms SLA alert threshold`}
              >
                {latencySeries.length === 0 ? (
                  <EmptyNote>Collecting initial probe samples…</EmptyNote>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={latencySeries}
                        margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={{ stroke: "var(--border)" }}
                        />
                        <YAxis
                          unit="ms"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            borderColor: "var(--border)",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        {alertConfig.enabled && (
                          <ReferenceLine
                            y={alertConfig.thresholdMs}
                            stroke="#d97706"
                            strokeDasharray="4 4"
                            label={{
                              value: `SLA ${alertConfig.thresholdMs}ms`,
                              position: "insideTopRight",
                              fill: "#d97706",
                              fontSize: 10,
                            }}
                          />
                        )}
                        <Area
                          type="monotone"
                          dataKey="RAG Core"
                          stroke="#16a34a"
                          fill="#16a34a"
                          fillOpacity={0.14}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                        <Area
                          type="monotone"
                          dataKey="ESG Store"
                          stroke="#0284c7"
                          fill="#0284c7"
                          fillOpacity={0.1}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                        <Area
                          type="monotone"
                          dataKey=".NET API"
                          stroke="#d97706"
                          fill="#d97706"
                          fillOpacity={0.12}
                          strokeWidth={2}
                          connectNulls
                          isAnimationActive={false}
                        />
                        <Area
                          type="monotone"
                          dataKey="Python RAG"
                          stroke="#7c3aed"
                          fill="#7c3aed"
                          fillOpacity={0.08}
                          strokeWidth={1.5}
                          connectNulls
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>

              <Panel
                title="Service & endpoint response latency"
                description="Current round-trip probe time per backend service relative to threshold"
              >
                {serviceComparisonData.length === 0 ? (
                  <EmptyNote>No service latency measurements yet.</EmptyNote>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={serviceComparisonData}
                        margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={{ stroke: "var(--border)" }}
                        />
                        <YAxis
                          unit="ms"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${value.toFixed(2)} ms`, "Latency"]}
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            borderColor: "var(--border)",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                        {alertConfig.enabled && (
                          <ReferenceLine
                            y={alertConfig.thresholdMs}
                            stroke="#d97706"
                            strokeDasharray="4 4"
                          />
                        )}
                        <Bar dataKey="latency" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                          {serviceComparisonData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={
                                entry.overThreshold
                                  ? "#d97706"
                                  : entry.status === "connected"
                                    ? "#16a34a"
                                    : entry.status === "degraded"
                                      ? "#d97706"
                                      : "#dc2626"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>
            </div>

            <Panel
              title="Average API response time (last 1h)"
              description="Rolling 60-minute average API latency across registered backend services from the service metrics endpoint"
              actions={
                serviceMetrics ? (
                  <span className="term-dim font-mono text-[10.5px]">
                    {serviceMetrics.summary.sample_count} samples ·{" "}
                    {serviceMetrics.window_minutes}m window
                  </span>
                ) : undefined
              }
            >
              {serviceMetrics && serviceMetrics.summary.sample_count > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2.5 text-[11px]">
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    Overall Avg:{" "}
                    <strong>
                      {formatLatency(serviceMetrics.summary.overall_avg_ms)}
                    </strong>
                  </span>
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    p95:{" "}
                    <strong>
                      {formatLatency(serviceMetrics.summary.p95_ms)}
                    </strong>
                  </span>
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    Min / Max:{" "}
                    <strong>
                      {formatLatency(serviceMetrics.summary.min_ms)}
                    </strong>{" "}
                    <span className="term-dim">
                      / {formatLatency(serviceMetrics.summary.max_ms)}
                    </span>
                  </span>
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    RAG Core:{" "}
                    <strong>
                      {formatLatency(serviceMetrics.summary.rag_core_avg_ms)}
                    </strong>
                  </span>
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    ESG Store:{" "}
                    <strong>
                      {formatLatency(serviceMetrics.summary.esg_store_avg_ms)}
                    </strong>
                  </span>
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    .NET API:{" "}
                    <strong>
                      {serviceMetrics.summary.dotnet_avg_ms !== null
                        ? formatLatency(serviceMetrics.summary.dotnet_avg_ms)
                        : "offline"}
                    </strong>
                  </span>
                </div>
              )}

              {hourlyLatencySeries.length === 0 ? (
                <EmptyNote>
                  Collecting 1-hour service metrics samples…
                </EmptyNote>
              ) : (
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={hourlyLatencySeries}
                      margin={{ top: 8, right: 16, left: -12, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="hourlyOverallFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#0284c7"
                            stopOpacity={0.28}
                          />
                          <stop
                            offset="95%"
                            stopColor="#0284c7"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                      />
                      <YAxis
                        unit="ms"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `${value.toFixed(2)} ms`,
                          name,
                        ]}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      {alertConfig.enabled && (
                        <ReferenceLine
                          y={alertConfig.thresholdMs}
                          stroke="#d97706"
                          strokeDasharray="4 4"
                          label={{
                            value: `SLA ${alertConfig.thresholdMs}ms`,
                            position: "insideTopRight",
                            fill: "#d97706",
                            fontSize: 10,
                          }}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey="Overall Avg"
                        stroke="#0284c7"
                        fill="url(#hourlyOverallFill)"
                        strokeWidth={2.25}
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="RAG Core Avg"
                        stroke="#16a34a"
                        fill="#16a34a"
                        fillOpacity={0.08}
                        strokeWidth={1.75}
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="ESG Store Avg"
                        stroke="#7c3aed"
                        fill="#7c3aed"
                        fillOpacity={0.06}
                        strokeWidth={1.5}
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey=".NET Avg"
                        stroke="#d97706"
                        fill="#d97706"
                        fillOpacity={0.1}
                        strokeWidth={1.75}
                        connectNulls
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel
              title="Backend CPU & Memory usage (%)"
              description="Real-time host and RAG core process CPU utilization and memory consumption sampled per probe"
              actions={
                report?.resource_usage ? (
                  <span className="term-dim font-mono text-[10.5px]">
                    {report.resource_usage.cpu_cores} vCPU · load{" "}
                    {report.resource_usage.load_avg_1m.toFixed(2)} · uptime{" "}
                    {report.resource_usage.uptime_sec}s
                  </span>
                ) : undefined
              }
            >
              {report?.resource_usage && (
                <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    Process CPU:{" "}
                    <strong>
                      {report.resource_usage.current.process_cpu_pct.toFixed(1)}%
                    </strong>
                  </span>
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    System CPU:{" "}
                    <strong>
                      {report.resource_usage.current.system_cpu_pct.toFixed(1)}%
                    </strong>
                  </span>
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    Memory:{" "}
                    <strong>
                      {report.resource_usage.current.memory_pct.toFixed(1)}%
                    </strong>{" "}
                    <span className="term-dim">
                      ({Math.round(report.resource_usage.current.system_mem_used_mb)} /{" "}
                      {Math.round(report.resource_usage.current.system_mem_total_mb)} MB)
                    </span>
                  </span>
                  <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                    RSS / Heap:{" "}
                    <strong>
                      {report.resource_usage.current.process_rss_mb.toFixed(0)} MB
                    </strong>{" "}
                    <span className="term-dim">
                      / {report.resource_usage.current.process_heap_mb.toFixed(0)} MB
                    </span>
                  </span>
                </div>
              )}

              {resourceSeries.length === 0 ? (
                <EmptyNote>Collecting initial CPU &amp; memory samples…</EmptyNote>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={resourceSeries}
                      margin={{ top: 8, right: 16, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        unit="%"
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `${value.toFixed(1)}%`,
                          name,
                        ]}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <Line
                        type="monotone"
                        dataKey="Process CPU %"
                        stroke="#0284c7"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="System CPU %"
                        stroke="#d97706"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="Memory %"
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel
              title=".NET Web API & pipeline endpoint latency"
              description="Latency across Minimal API device-ingestion endpoints (/api/ingest/*) and ESG/RAG sync routes"
            >
              {endpointChartData.length === 0 ? (
                <EmptyNote>No endpoint measurements available.</EmptyNote>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={endpointChartData}
                        layout="vertical"
                        margin={{ top: 4, right: 16, left: 20, bottom: 4 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          unit="ms"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={{ stroke: "var(--border)" }}
                        />
                        <YAxis
                          type="category"
                          dataKey="endpoint"
                          width={165}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(value: number) => [`${value.toFixed(2)} ms`, "Latency"]}
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            borderColor: "var(--border)",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                        {alertConfig.enabled && (
                          <ReferenceLine
                            x={alertConfig.thresholdMs}
                            stroke="#d97706"
                            strokeDasharray="4 4"
                          />
                        )}
                        <Bar dataKey="latency" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                          {endpointChartData.map((entry) => (
                            <Cell
                              key={entry.endpoint}
                              fill={entry.overThreshold ? "#d97706" : "#0284c7"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="overflow-x-auto rounded-md border border-border bg-background">
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                            Endpoint
                          </th>
                          <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                            Upstream
                          </th>
                          <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                            Status
                          </th>
                          <th className="px-2.5 py-1.5 text-right font-medium text-muted-foreground">
                            Latency
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {report?.endpoints.map((ep) => {
                          const breached =
                            alertConfig.enabled &&
                            (alertConfig.scope === "all" ||
                              ep.service === ".NET Web API") &&
                            ep.latency_ms !== null &&
                            ep.latency_ms > alertConfig.thresholdMs;
                          return (
                            <tr
                              key={`${ep.method}-${ep.path}`}
                              className="border-b border-border/60 last:border-0"
                            >
                              <td className="px-2.5 py-1.5 font-mono">
                                <span className="term-dim mr-1">{ep.method}</span>
                                {ep.path}
                              </td>
                              <td className="term-dim px-2.5 py-1.5 font-mono">
                                {ep.upstream}
                              </td>
                              <td className="px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <StatusDot
                                    tone={
                                      breached
                                        ? "warn"
                                        : ep.status === "ready"
                                          ? "ok"
                                          : ep.status === "standby"
                                            ? "warn"
                                            : "bad"
                                    }
                                  />
                                  <span>{ep.status}</span>
                                </span>
                              </td>
                              <td
                                className={cn(
                                  "px-2.5 py-1.5 text-right font-mono tabular-nums",
                                  breached && "font-semibold text-[var(--term-warn)]",
                                )}
                              >
                                {formatLatency(ep.latency_ms)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Panel>

            <Panel
              title=".NET Web API 1-hour latency distribution"
              description="Histogram of measured probe & ping latencies across .NET Minimal API endpoints over the last 60 minutes"
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    aria-label="Filter .NET endpoint for latency histogram"
                    value={histogramEndpointFilter}
                    onChange={(e) => setHistogramEndpointFilter(e.target.value)}
                    className="h-7 rounded-md border border-input bg-background px-2 text-[11px]"
                  >
                    <option value="all">All .NET endpoints</option>
                    {DOTNET_ENDPOINT_SERIES.map((series) => (
                      <option key={series.endpoint} value={series.endpoint}>
                        {series.shortLabel}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setHistogramStacked((prev) => !prev)}
                    className="h-7 rounded-md border border-input bg-background px-2 font-mono text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {histogramStacked ? "View: Stacked" : "View: Grouped"}
                  </button>
                </div>
              }
            >
              <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px]">
                <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                  Samples (1h): <strong>{histogramStats.count}</strong>
                </span>
                <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                  p50: <strong>{formatLatency(histogramStats.p50)}</strong>
                </span>
                <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                  p95: <strong>{formatLatency(histogramStats.p95)}</strong>
                </span>
                <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono">
                  Max: <strong>{formatLatency(histogramStats.max)}</strong>
                </span>
                {alertConfig.enabled && (
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 font-mono",
                      histogramStats.overThresholdCount > 0
                        ? "border-[var(--term-warn)]/60 bg-[var(--term-warn)]/10 text-[var(--term-warn)]"
                        : "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    &gt; {alertConfig.thresholdMs}ms:{" "}
                    <strong>{histogramStats.overThresholdCount}</strong>
                  </span>
                )}
              </div>

              {histogramStats.count === 0 ? (
                <EmptyNote>
                  No 1-hour .NET Web API latency samples recorded yet. Probes and
                  Connectivity Test runs automatically populate this histogram.
                </EmptyNote>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={histogramData}
                      margin={{ top: 8, right: 16, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `${value} ${value === 1 ? "sample" : "samples"}`,
                          name,
                        ]}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      {visibleHistogramSeries.map((series, idx) => (
                        <Bar
                          key={series.endpoint}
                          dataKey={series.endpoint}
                          name={series.shortLabel}
                          fill={series.color}
                          stackId={histogramStacked ? "dotnet-1h" : undefined}
                          radius={
                            !histogramStacked ||
                            idx === visibleHistogramSeries.length - 1
                              ? [3, 3, 0, 0]
                              : [0, 0, 0, 0]
                          }
                          isAnimationActive={false}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel
              title={`Latency Alert Log (${alertHistory.length})`}
              description="Automated threshold breach history recorded during live probes"
              actions={
                alertHistory.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    {unacknowledgedCount > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10.5px]"
                        onClick={() =>
                          setAlertHistory((prev) =>
                            prev.map((a) => ({ ...a, acknowledged: true })),
                          )
                        }
                      >
                        <CheckCircle2 className="size-3" />
                        Acknowledge all
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10.5px]"
                      onClick={() => setAlertHistory([])}
                    >
                      <Trash2 className="size-3" />
                      Clear log
                    </Button>
                  </div>
                ) : undefined
              }
            >
              {alertHistory.length === 0 ? (
                <EmptyNote>
                  No latency threshold alerts recorded yet. All monitored targets
                  are within {alertConfig.thresholdMs} ms (or alerts are paused).
                </EmptyNote>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border bg-background">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                          Time
                        </th>
                        <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                          Target
                        </th>
                        <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                          Severity
                        </th>
                        <th className="px-2.5 py-1.5 text-right font-medium text-muted-foreground">
                          Measured
                        </th>
                        <th className="px-2.5 py-1.5 text-right font-medium text-muted-foreground">
                          Threshold
                        </th>
                        <th className="px-2.5 py-1.5 text-right font-medium text-muted-foreground">
                          State
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {alertHistory.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-border/60 last:border-0"
                        >
                          <td className="term-dim px-2.5 py-1.5 font-mono">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono">
                            {item.target}
                            <span className="term-dim ml-1.5 text-[10px]">
                              ({item.kind})
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <span className="inline-flex items-center gap-1.5">
                              <StatusDot
                                tone={item.severity === "critical" ? "bad" : "warn"}
                              />
                              <span className="capitalize">{item.severity}</span>
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-[var(--term-warn)]">
                            {item.latencyMs.toFixed(1)} ms
                          </td>
                          <td className="term-dim px-2.5 py-1.5 text-right font-mono tabular-nums">
                            {item.thresholdMs} ms
                          </td>
                          <td className="px-2.5 py-1.5 text-right">
                            {item.acknowledged ? (
                              <span className="term-dim text-[10.5px]">acked</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setAlertHistory((prev) =>
                                    prev.map((a) =>
                                      a.id === item.id
                                        ? { ...a, acknowledged: true }
                                        : a,
                                    ),
                                  )
                                }
                                className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted/60"
                              >
                                Ack
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title="Recent Logs"
              description="Last 10 backend error and warning log entries recorded by the server across service probes, endpoint checks, and API requests"
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    aria-label="Filter recent backend logs by severity"
                    value={logSeverityFilter}
                    onChange={(e) =>
                      setLogSeverityFilter(
                        e.target.value as "all" | BackendLogSeverity,
                      )
                    }
                    className="h-7 rounded-md border border-input bg-background px-2 text-[11px]"
                  >
                    <option value="all">
                      All severities ({errorLogsData?.total_count ?? 0})
                    </option>
                    <option value="critical">
                      Critical ({errorLogsData?.counts.critical ?? 0})
                    </option>
                    <option value="error">
                      Error ({errorLogsData?.counts.error ?? 0})
                    </option>
                    <option value="warning">
                      Warning ({errorLogsData?.counts.warning ?? 0})
                    </option>
                  </select>
                  {(errorLogsData?.total_count ?? 0) > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      disabled={clearingLogs}
                      onClick={() => void handleClearErrorLogs()}
                    >
                      <Trash2 className="size-3" />
                      Clear logs
                    </Button>
                  )}
                </div>
              }
            >
              {errorLogsData && errorLogsData.total_count > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 font-mono text-rose-700 dark:text-rose-300">
                    Critical: <strong>{errorLogsData.counts.critical}</strong>
                  </span>
                  <span className="rounded border border-red-500/35 bg-red-500/10 px-2 py-0.5 font-mono text-red-700 dark:text-red-300">
                    Error: <strong>{errorLogsData.counts.error}</strong>
                  </span>
                  <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-amber-700 dark:text-amber-300">
                    Warning: <strong>{errorLogsData.counts.warning}</strong>
                  </span>
                </div>
              )}

              {!errorLogsData || errorLogsData.logs.length === 0 ? (
                <EmptyNote>
                  No backend error logs matching the current filter. All recent
                  API requests and service probes completed without errors.
                </EmptyNote>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border bg-background">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                          Time
                        </th>
                        <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                          Severity
                        </th>
                        <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                          Service / Source
                        </th>
                        <th className="px-2.5 py-1.5 font-medium text-muted-foreground">
                          Message
                        </th>
                        <th className="px-2.5 py-1.5 text-right font-medium text-muted-foreground">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {errorLogsData.logs.slice(0, 10).map((entry) => {
                        const rowTint =
                          entry.severity === "critical"
                            ? "border-l-2 border-l-rose-500 bg-rose-500/[0.03]"
                            : entry.severity === "error"
                              ? "border-l-2 border-l-red-500 bg-red-500/[0.02]"
                              : "border-l-2 border-l-amber-500 bg-amber-500/[0.02]";
                        return (
                          <tr
                            key={entry.id}
                            className={cn(
                              "border-b border-border/60 last:border-0",
                              rowTint,
                            )}
                          >
                            <td className="term-dim whitespace-nowrap px-2.5 py-1.5 font-mono">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-1.5">
                              <LogSeverityBadge severity={entry.severity} />
                            </td>
                            <td className="px-2.5 py-1.5">
                              <div className="font-medium text-foreground">
                                {entry.service}
                              </div>
                              <div className="term-dim font-mono text-[10px]">
                                {entry.source}
                                {entry.status_code !== null
                                  ? ` · HTTP ${entry.status_code}`
                                  : ""}
                              </div>
                            </td>
                            <td
                              className={cn(
                                "px-2.5 py-1.5 font-mono",
                                entry.severity === "critical"
                                  ? "text-rose-700 dark:text-rose-300"
                                  : entry.severity === "error"
                                    ? "text-red-700 dark:text-red-300"
                                    : "text-amber-700 dark:text-amber-300",
                              )}
                            >
                              {entry.message}
                            </td>
                            <td className="term-dim whitespace-nowrap px-2.5 py-1.5 text-right font-mono tabular-nums">
                              ×{entry.occurrences}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title="Connected service matrix"
              description="Live HTTP reachability, status codes, and diagnostic details for every backend dependency"
            >
              <div className="grid gap-3 md:grid-cols-2">
                {registeredServices.map((svc) => {
                  const opStatus = getOperationalStatus(svc);
                  return (
                    <div
                      key={svc.id}
                      className="rounded-md border border-border bg-background px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <StatusDot
                            tone={toneForStatus(svc.status)}
                            pulse={svc.status === "connected"}
                          />
                          <span className="truncate text-[12px] font-semibold">
                            {svc.name}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ServiceStatusBadge status={opStatus} />
                          <span className="font-mono text-[11px] tabular-nums">
                            {formatLatency(svc.latency_ms)}
                          </span>
                        </div>
                      </div>
                      <p className="term-dim mt-0.5 text-[10.5px]">{svc.role}</p>
                      <div className="mt-2">
                        <KeyValue label="Probe URL" value={svc.url} />
                        <KeyValue
                          label="HTTP Status"
                          value={svc.status_code ? String(svc.status_code) : "No response"}
                          tone={svc.status_code && svc.status_code < 400 ? "ok" : "warn"}
                        />
                        <KeyValue label="Detail" value={svc.error || svc.detail} mono={false} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {dotnetService && !dotnetService.reachable && (
              <Callout tone="info" title="Connecting local .NET Web API service">
                <span className="inline-flex items-center gap-1.5">
                  <Activity className="size-3.5 shrink-0" />
                  <span>
                    To see live `.NET Web API` responses here, run{" "}
                    <code className="font-mono">
                      RagApi__BaseUrl=http://127.0.0.1:3000/ dotnet run --urls
                      http://localhost:5180
                    </code>{" "}
                    inside <code className="font-mono">ESG-Intelligence-Web-DotNet</code>{" "}
                    or point the target URL above to your deployed .NET container.
                  </span>
                </span>
              </Callout>
            )}
          </>
        )}
      </PageBody>
    </Workspace>
  );
}

export default function BackendHealth() {
  return (
    <AppShell>
      {() => <BackendHealthWorkspace />}
    </AppShell>
  );
}
