import type { DeviceIngestRequest, EsgTableDescriptor } from "@/api/esg-data";
import { getWorkspaceId } from "@/api/client";

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

export interface CsvRowValidation {
  rowNumber: number;
  raw: Record<string, string>;
  record: Record<string, unknown> | null;
  errors: string[];
}

export interface CsvTransformResult {
  validRecords: Array<Record<string, unknown>>;
  rowResults: CsvRowValidation[];
  missingRequiredFields: string[];
  payload: DeviceIngestRequest;
}

const BOOLEAN_FIELDS = new Set(["is_active", "is_deleted", "disability", "lgbt"]);
const DATE_FIELDS = new Set(["from_date", "to_date"]);
const STRING_FIELDS = new Set(["title", "workspace_id", "user_id"]);

export function detectCsvDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const candidates = [",", ";", "\t"] as const;
  let best = ",";
  let bestCount = -1;
  for (const sep of candidates) {
    const count = firstLine.split(sep).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = sep;
    }
  }
  return best;
}

/** RFC-4180 compliant CSV parser supporting quoted fields, escaped quotes, and BOM removal. */
export function parseCsvText(rawText: string, explicitDelimiter?: string): ParsedCsv {
  const text = rawText.replace(/^\uFEFF/, "");
  const delimiter = explicitDelimiter || detectCsvDelimiter(text);
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if (ch === "\r" && next === "\n") {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
      i += 1;
    } else if (ch === "\n" || ch === "\r") {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], delimiter };
  }

  const headers = rows[0].map((h, idx) => h || `column_${idx + 1}`);
  const dataRows = rows.slice(1).map((r) => {
    const padded = [...r];
    while (padded.length < headers.length) padded.push("");
    return padded.slice(0, headers.length);
  });

  return { headers, rows: dataRows, delimiter };
}

export function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Auto-match CSV headers to target ESG table writable columns. */
export function buildDefaultColumnMapping(
  csvHeaders: string[],
  tableMeta: EsgTableDescriptor,
): Record<string, string> {
  const writableSet = new Set(tableMeta.writable);
  const mapping: Record<string, string> = {};
  const usedTargets = new Set<string>();

  for (const header of csvHeaders) {
    const normalized = normalizeHeaderKey(header);
    if (writableSet.has(normalized) && !usedTargets.has(normalized)) {
      mapping[header] = normalized;
      usedTargets.add(normalized);
      continue;
    }
    // Common alias hints
    const aliases: Record<string, string> = {
      start_date: "from_date",
      period_start: "from_date",
      end_date: "to_date",
      period_end: "to_date",
      amount: writableSet.has("value")
        ? "value"
        : writableSet.has("total")
          ? "total"
          : writableSet.has("total_waste")
            ? "total_waste"
            : "",
      emissions: writableSet.has("value") ? "value" : "",
      co2: writableSet.has("value") ? "value" : "",
      employees: writableSet.has("total_employees") ? "total_employees" : "",
      device: writableSet.has("user_id") ? "user_id" : "",
      source: writableSet.has("user_id") ? "user_id" : "",
    };
    const aliasTarget = aliases[normalized];
    if (aliasTarget && writableSet.has(aliasTarget) && !usedTargets.has(aliasTarget)) {
      mapping[header] = aliasTarget;
      usedTargets.add(aliasTarget);
    } else {
      mapping[header] = "";
    }
  }
  return mapping;
}

function coerceField(
  field: string,
  rawValue: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return { ok: true, value: undefined };
  }

  if (BOOLEAN_FIELDS.has(field)) {
    const low = trimmed.toLowerCase();
    if (low === "true" || low === "1" || low === "yes") return { ok: true, value: true };
    if (low === "false" || low === "0" || low === "no") return { ok: true, value: false };
    return { ok: false, error: `${field} must be boolean (true/false)` };
  }

  if (DATE_FIELDS.has(field)) {
    const slashNormalized = trimmed.replace(/\//g, "-");
    if (/^\d{4}-\d{2}-\d{2}$/.test(slashNormalized)) {
      return { ok: true, value: slashNormalized };
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return { ok: true, value: parsed.toISOString().slice(0, 10) };
    }
    return { ok: false, error: `${field} must be a valid YYYY-MM-DD date` };
  }

  if (STRING_FIELDS.has(field)) {
    return { ok: true, value: trimmed };
  }

  // Remaining ESG fact/dimension FK & measurement columns are numeric
  const cleanNumber = trimmed.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(cleanNumber)) {
    const num = Number(cleanNumber);
    if (Number.isFinite(num)) {
      return { ok: true, value: num };
    }
  }
  return { ok: false, error: `${field} must be numeric (got "${trimmed}")` };
}

export function transformCsvToDotNetPayload(options: {
  parsed: ParsedCsv;
  tableMeta: EsgTableDescriptor;
  columnMapping: Record<string, string>;
  deviceId: string;
  sourceSystem: string;
  syncToRag: boolean;
  workspaceId?: string;
}): CsvTransformResult {
  const {
    parsed,
    tableMeta,
    columnMapping,
    deviceId,
    sourceSystem,
    syncToRag,
    workspaceId = getWorkspaceId(),
  } = options;

  const mappedTargets = new Set(Object.values(columnMapping).filter(Boolean));
  const missingRequiredFields = tableMeta.required.filter(
    (req) => req !== "workspace_id" && !mappedTargets.has(req),
  );

  const rowResults: CsvRowValidation[] = [];
  const validRecords: Array<Record<string, unknown>> = [];

  parsed.rows.forEach((cells, idx) => {
    const rawObj: Record<string, string> = {};
    const record: Record<string, unknown> = {};
    const errors: string[] = [];

    parsed.headers.forEach((header, colIdx) => {
      const val = cells[colIdx] ?? "";
      rawObj[header] = val;
      const target = columnMapping[header];
      if (!target) return;

      const coerced = coerceField(target, val);
      if (!coerced.ok) {
        errors.push(coerced.error);
      } else if (coerced.value !== undefined) {
        record[target] = coerced.value;
      }
    });

    if (tableMeta.kind === "fact") {
      if (!record.workspace_id) record.workspace_id = workspaceId;
      if (!record.user_id && deviceId.trim()) record.user_id = deviceId.trim();
    }

    for (const req of tableMeta.required) {
      if (req === "workspace_id") continue;
      if (record[req] === undefined || record[req] === "") {
        errors.push(`Missing required field "${req}"`);
      }
    }

    const valid = errors.length === 0;
    if (valid) {
      validRecords.push(record);
    }

    rowResults.push({
      rowNumber: idx + 1,
      raw: rawObj,
      record: valid ? record : null,
      errors,
    });
  });

  const payload: DeviceIngestRequest = {
    workspace_id: workspaceId,
    device_id: deviceId.trim() || "csv-import-upload",
    source_system: sourceSystem.trim() || "csv-uploader",
    table: tableMeta.table,
    records: validRecords,
    sync_to_rag: syncToRag,
  };

  return {
    validRecords,
    rowResults,
    missingRequiredFields,
    payload,
  };
}

export function buildSampleCsvForTable(tableMeta: EsgTableDescriptor): string {
  const fields = tableMeta.writable.filter((f) => f !== "workspace_id");
  const headerLine = fields.join(",");
  const sampleRow = fields.map((f) => {
    if (f === "from_date") return "2025-01-01";
    if (f === "to_date") return "2025-03-31";
    if (f === "user_id") return "csv-iot-importer";
    if (f === "title") return "Sample ESG Entry";
    if (BOOLEAN_FIELDS.has(f)) return f === "is_deleted" ? "false" : "true";
    if (f.endsWith("_id") || f === "job_level1" || f === "job_level2") return "1";
    if (f === "total_employees" || f === "total_air_travel") return "25";
    return "1250.5";
  });
  return `${headerLine}\n${sampleRow.join(",")}\n`;
}
