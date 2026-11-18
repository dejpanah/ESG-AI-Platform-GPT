import { apiRequest, getWorkspaceId } from "./client";

export type EsgTableKind = "dimension" | "fact";

export interface EsgTableDescriptor {
  table: string;
  kind: EsgTableKind;
  writable: string[];
  required: string[];
}

export interface EsgRowsResponse {
  table: string;
  items: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  offset: number;
}

export interface EsgSyncRagResult {
  ok: boolean;
  document: {
    id: string;
    filename: string;
    chunks: number;
    version: number;
  };
  chunks_indexed: number;
  records_synced: number;
}

export interface DeviceIngestRequest {
  workspace_id?: string;
  device_id?: string;
  source_system?: string;
  table: string;
  records: Array<Record<string, unknown>>;
  sync_to_rag?: boolean;
}

export interface DeviceIngestResponse {
  ok: boolean;
  table: string;
  source: string;
  inserted: number;
  items: Array<Record<string, unknown>>;
  errors: Array<{ index: number; error: string }>;
  rag_sync: EsgSyncRagResult | null;
}

export interface GoldenItem {
  id: string;
  question: string;
  expected_document_id?: string | null;
  expected_chunk_id?: string | null;
  expected_answer?: string | null;
  created_at?: number;
}

export async function listEsgTables(): Promise<{
  tables: EsgTableDescriptor[];
  count: number;
}> {
  return apiRequest("/v1/esg/tables");
}

export async function listEsgRows(
  table: string,
  kind: EsgTableKind,
  limit = 100,
): Promise<EsgRowsResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (kind === "fact") {
    params.set("workspace_id", getWorkspaceId());
  }
  return apiRequest(`/v1/esg/tables/${encodeURIComponent(table)}?${params.toString()}`);
}

export async function createEsgRow(
  table: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiRequest(`/v1/esg/tables/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: getWorkspaceId(),
      ...payload,
    }),
  });
}

export async function deleteEsgRow(
  table: string,
  id: number | string,
  kind: EsgTableKind,
): Promise<{ deleted: boolean; id: number }> {
  const qs =
    kind === "fact"
      ? `?workspace_id=${encodeURIComponent(getWorkspaceId())}`
      : "";
  return apiRequest(
    `/v1/esg/tables/${encodeURIComponent(table)}/${encodeURIComponent(String(id))}${qs}`,
    { method: "DELETE" },
  );
}

export async function ingestDeviceTelemetry(
  payload: DeviceIngestRequest,
): Promise<DeviceIngestResponse> {
  return apiRequest("/v1/esg/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: getWorkspaceId(),
      ...payload,
    }),
  });
}

export async function syncEsgToRag(): Promise<EsgSyncRagResult> {
  return apiRequest("/v1/esg/sync-to-rag", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_id: getWorkspaceId() }),
  });
}

export async function listGoldenSet(): Promise<{ items: GoldenItem[] }> {
  return apiRequest("/evaluations/golden");
}

export async function addGoldenItem(payload: {
  question: string;
  expected_document_id?: string | null;
  expected_chunk_id?: string | null;
  expected_answer?: string | null;
}): Promise<GoldenItem> {
  return apiRequest("/evaluations/golden", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
