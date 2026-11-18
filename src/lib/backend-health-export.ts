import type {
  BackendHealthReport,
  DotnetConnectivityTestResponse,
} from "@/api/backend-health";

export interface ExportAlertLogItem {
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

export interface BuildBackendHealthCsvInput {
  report: BackendHealthReport | null;
  alertHistory: ExportAlertLogItem[];
  pingHistory: DotnetConnectivityTestResponse[];
  thresholdMs: number;
  alertsEnabled: boolean;
  exportedAt?: number;
}

export interface BackendHealthCsvPayload {
  csv: string;
  filename: string;
  rowCount: number;
}

const CSV_HEADERS = [
  "exported_at",
  "record_type",
  "timestamp_iso",
  "target_name",
  "method",
  "url_or_path",
  "status",
  "reachable",
  "status_code",
  "latency_ms",
  "threshold_ms",
  "over_threshold",
  "severity",
  "acknowledged",
  "detail_or_error",
] as const;

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toIso(ts: number | null | undefined): string {
  if (ts === null || ts === undefined || !Number.isFinite(ts)) return "";
  return new Date(ts).toISOString();
}

function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "";
  return ms.toFixed(2);
}

export function buildBackendHealthCsv({
  report,
  alertHistory,
  pingHistory,
  thresholdMs,
  alertsEnabled,
  exportedAt = Date.now(),
}: BuildBackendHealthCsvInput): BackendHealthCsvPayload {
  const exportedIso = new Date(exportedAt).toISOString();
  const rows: (string | number | boolean | null | undefined)[][] = [];

  if (report) {
    const reportIso = toIso(report.timestamp);

    rows.push([
      exportedIso,
      "summary",
      reportIso,
      "Backend Health Summary",
      "",
      report.dotnet_url,
      `${report.summary.connected_services}/${report.summary.total_services}_connected`,
      report.summary.connected_services === report.summary.total_services,
      "",
      formatMs(report.summary.dotnet_avg_ms),
      alertsEnabled ? thresholdMs : "",
      alertsEnabled &&
      report.summary.dotnet_avg_ms !== null &&
      report.summary.dotnet_avg_ms > thresholdMs,
      "",
      "",
      `rag_core_avg_ms=${formatMs(report.summary.rag_core_avg_ms)}; active_index=${report.summary.active_index}; esg_tables=${report.summary.esg_tables}; esg_fact_rows=${report.summary.esg_fact_rows}; indexed_chunks=${report.summary.indexed_chunks}`,
    ]);

    for (const svc of report.services) {
      rows.push([
        exportedIso,
        "service_probe",
        reportIso,
        svc.name,
        "GET",
        svc.url,
        svc.status,
        svc.reachable,
        svc.status_code,
        formatMs(svc.latency_ms),
        alertsEnabled ? thresholdMs : "",
        alertsEnabled ? svc.latency_ms > thresholdMs : false,
        "",
        "",
        svc.error ? `${svc.detail} | error: ${svc.error}` : svc.detail,
      ]);
    }

    for (const ep of report.endpoints) {
      rows.push([
        exportedIso,
        "endpoint_probe",
        reportIso,
        ep.service,
        ep.method,
        ep.path,
        ep.status,
        ep.status === "ready" || ep.status === "standby",
        "",
        formatMs(ep.latency_ms),
        alertsEnabled ? thresholdMs : "",
        alertsEnabled && ep.latency_ms !== null
          ? ep.latency_ms > thresholdMs
          : false,
        "",
        "",
        `upstream=${ep.upstream}`,
      ]);
    }

    for (const point of report.history) {
      const pointIso = toIso(point.timestamp);
      const samples: {
        target: string;
        latency: number | null;
        reachable: boolean;
      }[] = [
        { target: "RAG Core", latency: point.rag_core_ms, reachable: true },
        { target: "ESG Store", latency: point.esg_store_ms, reachable: true },
        {
          target: ".NET Web API",
          latency: point.dotnet_ms,
          reachable: point.dotnet_reachable,
        },
        {
          target: "Python RAG",
          latency: point.python_ms,
          reachable: point.python_reachable,
        },
      ];

      for (const sample of samples) {
        rows.push([
          exportedIso,
          "latency_history",
          pointIso,
          sample.target,
          "",
          sample.target === ".NET Web API"
            ? report.dotnet_url
            : sample.target === "Python RAG"
              ? report.python_url
              : "",
          sample.reachable ? "reachable" : "offline",
          sample.reachable,
          "",
          formatMs(sample.latency),
          alertsEnabled ? thresholdMs : "",
          alertsEnabled && sample.latency !== null
            ? sample.latency > thresholdMs
            : false,
          "",
          "",
          `sample_label=${point.label}`,
        ]);
      }
    }
  }

  for (const alert of alertHistory) {
    rows.push([
      exportedIso,
      "latency_alert",
      toIso(alert.timestamp),
      alert.target,
      "",
      alert.kind,
      alert.status,
      "",
      "",
      formatMs(alert.latencyMs),
      alert.thresholdMs,
      true,
      alert.severity,
      alert.acknowledged,
      `threshold_breach_kind=${alert.kind}`,
    ]);
  }

  for (const pingRun of pingHistory) {
    const checkedIso = toIso(pingRun.checked_at);
    for (const item of pingRun.results) {
      rows.push([
        exportedIso,
        "connectivity_test",
        checkedIso,
        `.NET ${item.id}`,
        item.method,
        item.url,
        item.ok ? "reachable" : "failed",
        item.reachable,
        item.status_code,
        formatMs(item.latency_ms),
        alertsEnabled ? thresholdMs : "",
        alertsEnabled ? item.latency_ms > thresholdMs : false,
        item.ok ? "" : "warning",
        "",
        item.error ?? `gateway=${pingRun.dotnet_url}`,
      ]);
    }
  }

  const headerLine = CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const bodyLines = rows.map((row) =>
    row.map((cell) => escapeCsvCell(cell)).join(","),
  );
  const csv = "\uFEFF" + [headerLine, ...bodyLines].join("\r\n") + "\r\n";

  const stamp = exportedIso.replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backend-health-metrics-${stamp}.csv`;

  return {
    csv,
    filename,
    rowCount: rows.length,
  };
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
