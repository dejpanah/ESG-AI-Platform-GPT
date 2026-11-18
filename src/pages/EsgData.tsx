import { AppShell } from "@/components/AppShell";
import { PageBody, PageHeader, Workspace } from "@/components/system/layout";
import { Callout, EmptyNote, Panel, Stat } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createEsgRow,
  deleteEsgRow,
  ingestDeviceTelemetry,
  listEsgRows,
  listEsgTables,
  syncEsgToRag,
  type EsgTableDescriptor,
} from "@/api/esg-data";
import { EsgCsvImporter } from "@/components/EsgCsvImporter";
import { getWorkspaceId } from "@/api/client";
import { cn } from "@/lib/utils";
import {
  Cpu,
  Database,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const SAMPLE_TELEMETRY_PRESETS: Array<{
  label: string;
  deviceId: string;
  table: string;
  records: Array<Record<string, unknown>>;
}> = [
  {
    label: "Smart Energy Meter (MWh)",
    deviceId: "bms-meter-plant-02",
    table: "esg_energy_consumption",
    records: [
      {
        energy_source_id: 1,
        value: 480.5,
        from_date: "2025-01-01",
        to_date: "2025-03-31",
      },
      {
        energy_source_id: 2,
        value: 1920.0,
        from_date: "2025-01-01",
        to_date: "2025-03-31",
      },
    ],
  },
  {
    label: "CEMS CO2 Stack Sensor (tCO2e)",
    deviceId: "scada-cems-04",
    table: "esg_co2_emission",
    records: [
      {
        value: 2890.2,
        from_date: "2025-01-01",
        to_date: "2025-03-31",
      },
    ],
  },
  {
    label: "Water Flow & Reuse PLC (m3)",
    deviceId: "plc-water-plant-01",
    table: "esg_total_water_consumption",
    records: [
      {
        total: 10450.0,
        from_date: "2025-01-01",
        to_date: "2025-03-31",
      },
    ],
  },
];

function parseFieldValue(field: string, raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;
  if (
    field !== "title" &&
    field !== "workspace_id" &&
    field !== "user_id" &&
    /^-?\d+(\.\d+)?$/.test(trimmed)
  ) {
    return Number(trimmed);
  }
  return trimmed;
}

function EsgDataWorkspace() {
  const [tables, setTables] = useState<EsgTableDescriptor[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("esg_co2_emission");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "fact" | "dimension">("all");
  const [refreshTick, setRefreshTick] = useState(0);

  // Add record state
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState(false);

  // Telemetry JSON ingestion state
  const [showIngest, setShowIngest] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [deviceId, setDeviceId] = useState("bms-meter-plant-02");
  const [ingestTable, setIngestTable] = useState("esg_energy_consumption");
  const [ingestJson, setIngestJson] = useState(() =>
    JSON.stringify(SAMPLE_TELEMETRY_PRESETS[0].records, null, 2),
  );
  const [syncAfterIngest, setSyncAfterIngest] = useState(true);
  const [ingesting, setIngesting] = useState(false);

  // Manual RAG sync state
  const [syncingRag, setSyncingRag] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await listEsgTables();
        if (!active) return;
        setTables(res.tables);
        if (
          res.tables.length > 0 &&
          !res.tables.some((t) => t.table === selectedTable)
        ) {
          setSelectedTable(res.tables[0].table);
        }
        setError(null);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (active) setLoadingTables(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedTable]);

  const currentMeta = useMemo(
    () => tables.find((t) => t.table === selectedTable) ?? null,
    [tables, selectedTable],
  );

  useEffect(() => {
    if (!currentMeta) return;
    let active = true;
    const run = async () => {
      setLoadingRows(true);
      try {
        const res = await listEsgRows(currentMeta.table, currentMeta.kind, 100);
        if (!active) return;
        setRows(res.items);
        setTotalRows(res.total);
        setError(null);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (active) setLoadingRows(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [currentMeta, refreshTick]);

  const filteredTables = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    return tables.filter((t) => {
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;
      if (q && !t.table.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tables, tableFilter, kindFilter]);

  const factCount = useMemo(
    () => tables.filter((t) => t.kind === "fact").length,
    [tables],
  );
  const dimCount = tables.length - factCount;

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const keys = Object.keys(rows[0]).filter((k) => k !== "workspace_id");
    return keys.slice(0, 8);
  }, [rows]);

  const handleSelectTable = (name: string) => {
    setSelectedTable(name);
    setFormValues({});
  };

  const handleCreateRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMeta) return;
    setSavingRow(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of currentMeta.writable) {
        const raw = formValues[field] ?? "";
        const parsed = parseFieldValue(field, raw);
        if (parsed !== undefined) payload[field] = parsed;
      }
      if (currentMeta.kind === "fact" && !payload.workspace_id) {
        payload.workspace_id = getWorkspaceId();
      }
      await createEsgRow(currentMeta.table, payload);
      toast.success(`Saved record to ${currentMeta.table}`);
      setFormValues({});
      setRefreshTick((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save record");
    } finally {
      setSavingRow(false);
    }
  };

  const handleDeleteRow = async (id: unknown) => {
    if (!currentMeta || (typeof id !== "number" && typeof id !== "string")) return;
    try {
      await deleteEsgRow(currentMeta.table, id, currentMeta.kind);
      toast.success(`Deleted row #${String(id)}`);
      setRefreshTick((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleSyncToRag = async () => {
    setSyncingRag(true);
    try {
      const res = await syncEsgToRag();
      toast.success(
        `Synced ${res.records_synced} ESG rows into ${res.document.filename} (${res.chunks_indexed} chunks)`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "RAG sync failed");
    } finally {
      setSyncingRag(false);
    }
  };

  const handleIngestTelemetry = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(ingestJson);
    } catch {
      toast.error("Telemetry JSON is invalid");
      return;
    }
    const records = Array.isArray(parsed) ? parsed : [parsed];
    setIngesting(true);
    try {
      const res = await ingestDeviceTelemetry({
        device_id: deviceId.trim() || "iot-gateway",
        table: ingestTable,
        records: records as Array<Record<string, unknown>>,
        sync_to_rag: syncAfterIngest,
      });
      toast.success(
        `Ingested ${res.inserted} row(s) into ${res.table}${
          res.rag_sync ? ` & indexed ${res.rag_sync.chunks_indexed} RAG chunks` : ""
        }`,
      );
      setSelectedTable(ingestTable);
      setRefreshTick((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ingestion failed");
    } finally {
      setIngesting(false);
    }
  };

  return (
    <Workspace>
      <PageHeader
        title="ESG Data & Telemetry"
        description="Postgres structured ESG fact & dimension tables, device/ERP ingestion gateway, and one-click RAG embedding sync."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCsvImport((v) => !v)}
          >
            <FileSpreadsheet className="size-3.5" />
            {showCsvImport ? "Hide CSV upload" : "CSV upload"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowIngest((v) => !v)}
          >
            <Cpu className="size-3.5" />
            {showIngest ? "Hide device ingest" : "Device / API ingest"}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSyncToRag()}
            disabled={syncingRag}
          >
            {syncingRag ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Embed & sync to RAG
          </Button>
        </div>
      </PageHeader>

      <PageBody>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="ESG tables" value={String(tables.length)} />
          <Stat label="Fact tables" value={String(factCount)} hint="workspace-scoped" />
          <Stat label="Dimensions" value={String(dimCount)} hint="lookup catalogs" />
          <Stat
            label="Active table rows"
            value={String(totalRows)}
            hint={selectedTable}
          />
        </div>

        {error && (
          <Callout tone="bad" title="ESG data error">
            {error}
          </Callout>
        )}

        {showCsvImport && tables.length > 0 && (
          <EsgCsvImporter
            tables={tables}
            defaultTable={selectedTable}
            onIngested={(table) => {
              setSelectedTable(table);
              setRefreshTick((n) => n + 1);
            }}
          />
        )}

        {showIngest && (
          <Panel
            title="Device & System Telemetry Ingestion"
            description="Push JSON records from IoT meters, SCADA, BMS, ERP, or the .NET Web API gateway (/api/v1/esg/ingest)"
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              {SAMPLE_TELEMETRY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setDeviceId(preset.deviceId);
                    setIngestTable(preset.table);
                    setIngestJson(JSON.stringify(preset.records, null, 2));
                  }}
                  className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <form onSubmit={(e) => void handleIngestTelemetry(e)} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-[11.5px]">
                  <span className="term-dim block">Device / Connector ID</span>
                  <Input
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="bms-meter-plant-02"
                  />
                </label>
                <label className="space-y-1 text-[11.5px]">
                  <span className="term-dim block">Target Postgres table</span>
                  <select
                    value={ingestTable}
                    onChange={(e) => setIngestTable(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-[12px]"
                  >
                    {tables.map((t) => (
                      <option key={t.table} value={t.table}>
                        {t.table} ({t.kind})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1 text-[11.5px]">
                <span className="term-dim block">
                  JSON Records Array (matches /api/v1/esg/ingest & .NET /api/ingest/device)
                </span>
                <Textarea
                  value={ingestJson}
                  onChange={(e) => setIngestJson(e.target.value)}
                  rows={6}
                  className="font-mono text-[11.5px]"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[11.5px]">
                  <input
                    type="checkbox"
                    checked={syncAfterIngest}
                    onChange={(e) => setSyncAfterIngest(e.target.checked)}
                    className="accent-primary"
                  />
                  <span>Automatically materialize & embed snapshot into RAG after save</span>
                </label>
                <Button type="submit" size="sm" disabled={ingesting}>
                  {ingesting && <Loader2 className="size-3.5 animate-spin" />}
                  Ingest records
                </Button>
              </div>
            </form>
          </Panel>
        )}

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel
            title="Postgres ESG Tables"
            description="Select a fact or dimension table"
          >
            <div className="space-y-2">
              <Input
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                placeholder="Filter tables…"
                className="h-8 text-[11.5px]"
              />
              <div className="flex gap-1">
                {(["all", "fact", "dimension"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKindFilter(k)}
                    className={cn(
                      "flex-1 rounded border px-2 py-1 text-[10.5px] capitalize",
                      kindFilter === k
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
              {loadingTables ? (
                <div className="flex items-center gap-2 py-4 text-[11.5px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading tables…
                </div>
              ) : (
                <ul className="max-h-[460px] space-y-1 overflow-y-auto pr-1">
                  {filteredTables.map((t) => (
                    <li key={t.table}>
                      <button
                        type="button"
                        onClick={() => handleSelectTable(t.table)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors",
                          selectedTable === t.table
                            ? "bg-primary/10 font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <span className="truncate font-mono">{t.table}</span>
                        <span className="shrink-0 rounded border border-border px-1.5 py-0 text-[9.5px] uppercase">
                          {t.kind === "dimension" ? "dim" : "fact"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel
              title={currentMeta ? currentMeta.table : "Select a table"}
              description={
                currentMeta
                  ? `${currentMeta.kind} table · ${totalRows} row(s) in workspace "${getWorkspaceId()}"`
                  : "Pick an ESG table on the left"
              }
            >
              {currentMeta ? (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRefreshTick((n) => n + 1)}
                      disabled={loadingRows}
                    >
                      <RefreshCw className={cn("size-3.5", loadingRows && "animate-spin")} />
                      Refresh
                    </Button>
                  </div>
                  <form
                    onSubmit={(e) => void handleCreateRow(e)}
                    className="rounded-md border border-border bg-muted/20 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] font-medium flex items-center gap-1.5">
                        <Plus className="size-3.5" />
                        Add record to {currentMeta.table}
                      </span>
                      <span className="term-dim text-[10.5px]">* required</span>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                      {currentMeta.writable
                        .filter((f) => f !== "workspace_id")
                        .map((field) => {
                          const req = currentMeta.required.includes(field);
                          const isDate = field === "from_date" || field === "to_date";
                          return (
                            <label key={field} className="space-y-1 text-[11px]">
                              <span className="term-dim block font-mono">
                                {field} {req ? "*" : ""}
                              </span>
                              <Input
                                type={isDate ? "date" : "text"}
                                required={req}
                                value={formValues[field] ?? ""}
                                onChange={(e) =>
                                  setFormValues((prev) => ({
                                    ...prev,
                                    [field]: e.target.value,
                                  }))
                                }
                                placeholder={field}
                                className="h-8 text-[11.5px]"
                              />
                            </label>
                          );
                        })}
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" size="sm" disabled={savingRow}>
                        {savingRow ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Database className="size-3.5" />
                        )}
                        Save row
                      </Button>
                    </div>
                  </form>

                  {loadingRows ? (
                    <div className="flex items-center gap-2 py-4 text-[11.5px] text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading rows…
                    </div>
                  ) : rows.length === 0 ? (
                    <EmptyNote>
                      No records in {currentMeta.table} for workspace "{getWorkspaceId()}".
                    </EmptyNote>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-border bg-background">
                      <table className="w-full border-collapse text-[11px]">
                        <thead>
                          <tr className="border-b border-border text-left">
                            {columns.map((col) => (
                              <th
                                key={col}
                                className="px-2.5 py-1.5 font-mono font-medium text-muted-foreground"
                              >
                                {col}
                              </th>
                            ))}
                            <th className="px-2.5 py-1.5 text-right font-medium text-muted-foreground">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => (
                            <tr
                              key={String(row.id ?? idx)}
                              className="border-b border-border/60 last:border-0"
                            >
                              {columns.map((col) => (
                                <td key={col} className="px-2.5 py-1.5 font-mono">
                                  {row[col] === null || row[col] === undefined
                                    ? "—"
                                    : String(row[col])}
                                </td>
                              ))}
                              <td className="px-2.5 py-1.5 text-right">
                                {row.id !== undefined && (
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteRow(row.id)}
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="size-3" />
                                    Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyNote>Select an ESG table to view or insert records.</EmptyNote>
              )}
            </Panel>
          </div>
        </div>
      </PageBody>
    </Workspace>
  );
}

export default function EsgData() {
  return (
    <AppShell>
      {() => <EsgDataWorkspace />}
    </AppShell>
  );
}
