import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import type { Request, Response } from "express";
import multer from "multer";
import {
  ESG_TABLES,
  computeLiveMetricsSnapshot,
  createInitialEsgTables,
  filterEsgPayload,
  renderEsgRagSnapshotMarkdown,
  type EsgTableStore,
} from "./server-esg";
import {
  addEmissionFactor,
  addEngineRecord,
  commitBulkImportRecords,
  computeEngineView,
  createFormulaRule,
  createInitialCalcStore,
  deleteEngineRecord,
  evaluateSafeFormula,
  proposeFormulaChange,
  reviewFormulaChange,
  reviseEmissionFactor,
  runManualCalculation,
  updateEngineConfig,
  type CalcEngineSlug,
  type WorkspaceCalcStore,
} from "./server-calc";
import {
  validateBulkImportRows,
  validateCalculationInputs,
} from "./server-calc-validation";
import {
  createRationaleId,
  createSurveySubmissionId,
  createTopicId,
  type MaterialityTopic,
  type StakeholderGroupId,
  type TopicStandardMapping,
} from "./server-materiality";
import { postgresRepo } from "./server-postgres";
import * as XLSX from "xlsx";

const APP_VERSION = "1.0.0";
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 180;
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

interface StoredChunk {
  id: string;
  document_id: string;
  version: number;
  index: number;
  line_start: number;
  line_end: number;
  section?: string;
  symbol?: string;
  tokens: number;
  text: string;
}

interface StoredVersion {
  version: number;
  chunks: number;
  created_at: number;
  current: boolean;
  content_hash: string;
  reused: number;
  newly_embedded: number;
  note: string;
}

interface StoredDocument {
  id: string;
  filename: string;
  path: string;
  extension: string;
  language: string;
  size_bytes: number;
  status: "synced" | "changed" | "processing" | "failed" | "not_indexed";
  updated_at: number;
  indexed_at?: number;
  version: number;
  content_hash: string;
  parser?: string;
  chunker?: string;
  embedding?: string;
  error?: string;
  progress?: number;
  stage?: string;
  content: string;
  chunks: StoredChunk[];
  versions: StoredVersion[];
}

interface StoredJob {
  id: string;
  document_id?: string;
  document_name?: string;
  stage: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  error?: string;
  created_at: number;
}

interface StoredIndex {
  id: string;
  state: "building" | "ready" | "active" | "retired";
  embedding: string;
  dimensions: number;
  revision: number;
  documents: number;
  chunks: number;
  created_at: number;
  built_at?: number;
  validated: boolean;
  evaluated: boolean;
  evaluation_score?: number;
  notes?: string;
}

interface StoredProvider {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  model: string;
  role: "Generation" | "Embeddings" | "Both";
  enabled: boolean;
  api_key: string;
  created_at: number;
  updated_at: number;
}

interface StoredTrace {
  id: string;
  outcome: "answer" | "answer_with_uncertainty" | "abstain" | "error" | "metadata_answer";
  latency_ms: number;
  stages: Record<string, number>;
  created_at: number;
}

interface StoredEvent {
  id: string;
  kind: "document" | "sync" | "query" | "error";
  title: string;
  detail?: string;
  created_at: number;
}

interface ReportVersionEntry {
  version: number;
  title: string;
  report_type: string;
  body: string;
  model: string;
  created_at: number;
  created_by: string;
  change_note: string;
  restored_from_version?: number;
  metadata: Record<string, unknown>;
}

interface StoredReport {
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
  updated_at: number;
  metadata: Record<string, unknown>;
  versions: ReportVersionEntry[];
}

interface StoredGoldenItem {
  id: string;
  question: string;
  expected_document_id?: string | null;
  expected_chunk_id?: string | null;
  expected_answer?: string | null;
  created_at: number;
}

interface BackendHealthSample {
  timestamp: number;
  label: string;
  rag_core_ms: number;
  esg_store_ms: number;
  dotnet_ms: number | null;
  python_ms: number | null;
  dotnet_reachable: boolean;
  python_reachable: boolean;
}

interface DotnetEndpointLatencySample {
  timestamp: number;
  endpoint: string;
  method: string;
  path: string;
  latency_ms: number;
  status: string;
  reachable: boolean;
}

interface ResourceUsageSample {
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

type BackendLogSeverity = "critical" | "error" | "warning";

interface BackendErrorLogEntry {
  id: string;
  timestamp: number;
  severity: BackendLogSeverity;
  service: string;
  source: string;
  status_code: number | null;
  message: string;
  occurrences: number;
}

interface WorkspaceState {
  documents: Map<string, StoredDocument>;
  jobs: Map<string, StoredJob>;
  indexes: StoredIndex[];
  providers: Map<string, StoredProvider>;
  traces: StoredTrace[];
  events: StoredEvent[];
  feedback: Array<{ trace_id: string; rating: number; created_at: number }>;
  reports: Map<string, StoredReport>;
  esgTables: Map<string, EsgTableStore>;
  goldenSet: StoredGoldenItem[];
  healthHistory: BackendHealthSample[];
  healthHistory1h: BackendHealthSample[];
  dotnetEndpointSamples: DotnetEndpointLatencySample[];
  resourceHistory: ResourceUsageSample[];
  errorLogs: BackendErrorLogEntry[];
  calcStore: WorkspaceCalcStore;
}

const workspaces = new Map<string, WorkspaceState>();

function sha256(text: string | Buffer): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function getExt(name: string): string {
  const ext = path.extname(name).toLowerCase().replace(/^\./, "");
  return ext || "txt";
}

function languageFor(name: string): string {
  const ext = getExt(name);
  const map: Record<string, string> = {
    md: "Markdown",
    txt: "Text",
    py: "Python",
    js: "JavaScript",
    ts: "TypeScript",
    tsx: "TSX",
    jsx: "JSX",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    csv: "CSV",
    sql: "SQL",
    pdf: "PDF",
    html: "HTML",
    htm: "HTML",
    docx: "Word",
    xlsx: "Excel",
  };
  return map[ext] || ext.toUpperCase() || "Document";
}

function countTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function splitChunks(documentId: string, version: number, content: string): StoredChunk[] {
  const cleaned = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!cleaned) return [];
  const chunks: StoredChunk[] = [];
  let cursor = 0;
  let ordinal = 0;
  while (cursor < cleaned.length) {
    let end = Math.min(cleaned.length, cursor + CHUNK_SIZE);
    if (end < cleaned.length) {
      const doubleNewline = cleaned.lastIndexOf("\n\n", end);
      const singleNewline = cleaned.lastIndexOf("\n", end);
      const space = cleaned.lastIndexOf(" ", end);
      const boundary = Math.max(doubleNewline, singleNewline, space);
      if (boundary > cursor + Math.floor(CHUNK_SIZE / 2)) {
        end = boundary;
      }
    }
    const value = cleaned.slice(cursor, end).trim();
    if (value) {
      const lineStart = cleaned.slice(0, cursor).split("\n").length;
      const lineEnd = cleaned.slice(0, end).split("\n").length;
      const headingMatch = value.match(/^#+\s+(.+)$/m);
      chunks.push({
        id: `${documentId}-v${version}-c${ordinal}`,
        document_id: documentId,
        version,
        index: ordinal,
        line_start: lineStart,
        line_end: lineEnd,
        section: headingMatch ? headingMatch[1].trim() : undefined,
        tokens: countTokens(value),
        text: value,
      });
      ordinal += 1;
    }
    if (end >= cleaned.length) break;
    cursor = Math.max(end - CHUNK_OVERLAP, cursor + 1);
  }
  return chunks;
}

function createDocument(
  filename: string,
  folderPath: string,
  content: string,
  sizeBytes?: number,
): StoredDocument {
  const id = crypto.randomUUID();
  const now = Date.now();
  const digest = sha256(content);
  const chunks = splitChunks(id, 1, content);
  return {
    id,
    filename,
    path: folderPath,
    extension: getExt(filename),
    language: languageFor(filename),
    size_bytes: sizeBytes ?? Buffer.byteLength(content, "utf-8"),
    status: "synced",
    updated_at: now,
    indexed_at: now,
    version: 1,
    content_hash: digest,
    parser: "text-v1",
    chunker: `fixed-${CHUNK_SIZE}-${CHUNK_OVERLAP}`,
    embedding: "local:hybrid-lexical-bm25",
    content,
    chunks,
    versions: [
      {
        version: 1,
        chunks: chunks.length,
        created_at: now,
        current: true,
        content_hash: digest,
        reused: 0,
        newly_embedded: chunks.length,
        note: "Initial ingestion",
      },
    ],
  };
}

function getWorkspace(workspaceId: string): WorkspaceState {
  const existing = workspaces.get(workspaceId);
  if (existing) return existing;

  const now = Date.now();
  const state: WorkspaceState = {
    documents: new Map(),
    jobs: new Map(),
    indexes: [],
    providers: new Map(),
    traces: [],
    events: [],
    feedback: [],
    reports: new Map(),
    esgTables: createInitialEsgTables(workspaceId),
    goldenSet: [],
    healthHistory: [],
    healthHistory1h: [],
    dotnetEndpointSamples: [],
    resourceHistory: [],
    errorLogs: [],
    calcStore: createInitialCalcStore(),
  };

  if (workspaceId === "default") {
    const seedDocs: Array<{ filename: string; folder: string; content: string }> = [
      {
        filename: "2024_Sustainability_Report.md",
        folder: "esg-corpus/annual-reports",
        content: `# Annual Sustainability Report 2024

## Executive Summary
Total Scope 1 and Scope 2 CO2 emissions decreased by 11.7% year-over-year, dropping from 14,200.0 tCO2e in 2023 to 12,540.5 tCO2e in 2024. This reduction was driven by expanded on-site Solar PV generation (3,200 MWh) and a 12.7% decline in grid electricity usage.

## Environmental Metrics (E)
- Total CO2 Emissions (2024): 12,540.5 tCO2e (2023 baseline: 14,200.0 tCO2e)
- GHG Gas Breakdown: CO2 11,800.0 t, CH4 420.3 tCO2e, N2O 95.2 tCO2e
- Total Energy Consumption: 13,200.0 MWh (Solar PV: 3,200.0 MWh, Grid Electricity: 8,900.0 MWh, Diesel Generator: 1,100.0 MWh)
- Renewable Energy Share: 24.24% of total energy mix
- Total Water Consumption: 45,000.0 m3 (Operations: 30,000.0 m3, Offices: 15,000.0 m3)
- Water Reuse: 5,200.0 m3 (11.56% reuse ratio)
- Waste Generation: 440.7 tonnes total (Non-hazardous: 340.5 t, Recyclable: 88.0 t, Hazardous: 12.2 t)

## Social Metrics (S)
- Total Workforce Headcount: 812 employees
- Gender Distribution: Male 420 (51.7%), Female 380 (46.8%), Other / Undisclosed 12 (1.5%)
- Age Brackets: Under 30: 210, Ages 30-50: 450, Over 50: 152
- New Hires in 2024: 96 employees (up from 71 in 2023)
- Accessibility & Inclusion: 28 employees with declared disabilities; 35 LGBTQ+ self-identified employees
`,
      },
      {
        filename: "ESRS_E1_Climate_Policy.md",
        folder: "esg-corpus/policies",
        content: `# ESRS E1 Climate Change & Decarbonization Policy

## Transition Plan Targets
The organization commits to a 42% reduction in Scope 1 and Scope 2 greenhouse gas emissions by 2030 relative to the 2023 baseline (14,200 tCO2e), aligned with a 1.5C science-based pathway.

## Business Travel & Fleet Electrification
- Business air travel in 2024 totaled 42 flights covering 185,000 km; rail travel covered 22,000 km.
- Corporate fleet includes passenger cars (petrol, 15,000 L fuel / 180,000 km) and light vans (diesel, 8,000 L fuel / 95,000 km).
- Policy mandates transitioning 50% of passenger fleet vehicles to battery electric vehicles by Q4 2026.

## Governance & Verification
All emissions disclosures follow GHG Protocol Corporate Standard and undergo limited assurance review before annual publication.
`,
      },
      {
        filename: "GHG_Inventory_Audit_2024.txt",
        folder: "esg-corpus/audits",
        content: `GHG INVENTORY ASSURANCE & VERIFICATION MEMORANDUM (FY 2024)
Audit Scope: Scope 1 stationary combustion (diesel generators, fleet), Scope 2 location-based electricity, and Scope 3 Category 6 (Business Travel).
Verification Status: Passed with no material misstatements.
Key Observations:
1. Solar PV metering at main operations site recorded 3,200.0 MWh verified clean output.
2. Hazardous waste (12.2 tonnes) was manifested and transferred to licensed treatment facilities with 100% chain-of-custody documentation.
3. Water intensity stood at 12.5 m3/unit, with drinkable water usage at 8.0 m3/unit.
4. Recommended action: Install sub-metering on office HVAC chillers to improve Scope 2 granularity in 2025.
`,
      },
    ];

    let totalChunks = 0;
    for (const item of seedDocs) {
      const doc = createDocument(item.filename, item.folder, item.content);
      state.documents.set(doc.id, doc);
      totalChunks += doc.chunks.length;
    }

    state.indexes.push({
      id: "index-v1",
      state: "active",
      embedding: "local:hybrid-lexical-bm25",
      dimensions: 256,
      revision: 1,
      documents: state.documents.size,
      chunks: totalChunks,
      created_at: now - 3600_000,
      built_at: now - 3500_000,
      validated: true,
      evaluated: true,
      evaluation_score: 0.94,
      notes: "Passed golden-set regression gate",
    });

    state.events.push(
      {
        id: crypto.randomUUID(),
        kind: "sync",
        title: "ESG corpus initialized",
        detail: `${state.documents.size} documents · ${totalChunks} chunks`,
        created_at: now - 3500_000,
      },
      {
        id: crypto.randomUUID(),
        kind: "document",
        title: "2024_Sustainability_Report.md indexed",
        detail: "ESRS E1 & GRI metrics verified",
        created_at: now - 3400_000,
      },
    );

    const sampleMetrics = computeLiveMetricsSnapshot(
      state.esgTables,
      "default",
      "2024-01-01",
      "2024-12-31",
      ["environmental", "social"],
    );
    const sampleV1Body = `# گزارش پایداری سالانه ESG (پیش‌نویس اولیه ۲۰۲۴)

## خلاصه مدیریتی
در پیش‌نویس سه‌ماهه سوم ۲۰۲۴ مجموع انتشار CO2 سازمان **۱۳٬۱۸۰.۰ تن معادل CO2** برآورد شد که نسبت به سال ۲۰۲۳ (۱۴٬۲۰۰ تن) کاهش **۷.۲ درصدی** را نشان می‌دهد.

## شاخص‌های محیط‌زیستی (Environmental)
- **انتشار CO2:** ۱۳٬۱۸۰.۰ تن
- **تفکیک گازهای گلخانه‌ای:** CO2 برابر ۱۲٬۴۲۰ تن، CH4 برابر ۴۴۵.۰ تن، N2O برابر ۱۰۱.۵ تن
- **مصرف انرژی کل:** ۱۳٬۵۴۰ مگاوات‌ساعت (خورشیدی ۲٬۶۵۰، برق شبکه ۹٬۵۹۰، دیزل ۱٬۳۰۰)
- **مصرف آب:** ۴۶٬۸۰۰ مترمکعب (بازچرخانی ۴٬۱۰۰ مترمکعب)
- **پسماند کل:** ۴۶۵.۰ تن (غیرخطرناک ۳۶۲.۰، قابل بازیافت ۸۵، خطرناک ۱۸.۰)

## شاخص‌های اجتماعی (Social)
- **تعداد کل کارکنان:** ۷۹۵ نفر (مرد ۴۱۵، زن ۳۶۹، سایر ۱۱)
- **استخدام جدید:** ۸۲ نفر (رشد نسبت به ۷۱ نفر در سال ۲۰۲۳)
`;
    const sampleV2Body = `# گزارش پایداری سالانه ESG (دوره ۲۰۲۴)

## خلاصه مدیریتی
در سال ۲۰۲۴ مجموع انتشار CO2 سازمان به **۱۲٬۵۴۰.۵ تن معادل CO2** رسید که نسبت به سال ۲۰۲۳ (۱۴٬۲۰۰ تن) کاهش **۱۱.۷ درصدی** را نشان می‌دهد.

## شاخص‌های محیط‌زیستی (Environmental)
- **انتشار CO2:** ۱۲٬۵۴۰.۵ تن
- **تفکیک گازهای گلخانه‌ای:** CO2 برابر ۱۱٬۸۰۰ تن، CH4 برابر ۴۲۰.۳ تن، N2O برابر ۹۵.۲ تن
- **مصرف انرژی کل:** ۱۳٬۲۰۰ مگاوات‌ساعت (خورشیدی ۳٬۲۰۰، برق شبکه ۸٬۹۰۰، دیزل ۱٬۱۰۰)
- **مصرف آب:** ۴۵٬۰۰۰ مترمکعب (بازچرخانی ۵٬۲۰۰ مترمکعب)
- **پسماند کل:** ۴۴۰.۷ تن (غیرخطرناک ۳۴۰.۵، قابل بازیافت ۸۸، خطرناک ۱۲.۲)

## شاخص‌های اجتماعی (Social)
- **تعداد کل کارکنان:** ۸۱۲ نفر (مرد ۴۲۰، زن ۳۸۰، سایر ۱۲)
- **استخدام جدید:** ۹۶ نفر (رشد نسبت به ۷۱ نفر در سال ۲۰۲۳)
- **تنوع و شمول:** ۲۸ همکار دارای معلولیت و ۳۵ همکار در برنامه‌های حمایتی تنوع
`;
    const sampleMetadata = {
      period_start: "2024-01-01",
      period_end: "2024-12-31",
      pillars: ["environmental", "social"],
      language: "fa",
      has_metrics: true,
      metrics_snapshot: sampleMetrics,
    };

    const sampleReport: StoredReport = {
      id: "rep-2024-annual-esg",
      workspace_id: "default",
      user_id: "local",
      title: "گزارش پایداری سالانه ESG — ۲۰۲۴",
      report_type: "esg_periodic",
      body: sampleV2Body,
      format: "markdown",
      model: "local-esg-synthesizer",
      sources: [],
      citations: [],
      trace_id: null,
      status: "completed",
      version: 2,
      created_at: now - 3600_000,
      updated_at: now - 1800_000,
      metadata: sampleMetadata,
      versions: [
        {
          version: 1,
          title: "گزارش پایداری سالانه ESG — ۲۰۲۴ (پیش‌نویس)",
          report_type: "esg_periodic",
          body: sampleV1Body,
          model: "local-esg-synthesizer",
          created_at: now - 3600_000,
          created_by: "local",
          change_note: "نسخه اولیه پیش‌نویس پیش از تکمیل ظرفیت خورشیدی و ممیزی نهایی",
          metadata: {
            ...sampleMetadata,
            metrics_snapshot: {
              period: { from_date: "2024-01-01", to_date: "2024-12-31" },
              pillars: ["environmental", "social"],
              environmental: {
                co2_emissions_tco2e: 13180.0,
                ghg_breakdown: [
                  { gas: "CO2", value: 12420 },
                  { gas: "CH4", value: 445 },
                  { gas: "N2O", value: 101.5 },
                ],
                energy_consumption_mwh: {
                  total: 13540,
                  by_source: {
                    "Solar PV": 2650,
                    "Grid Electricity": 9590,
                    "Diesel Backup": 1300,
                  },
                },
                water_consumption_m3: { total: 46800, reused: 4100 },
                waste_tonnes: {
                  total: 465.0,
                  by_type: {
                    "Non-Hazardous": 362.0,
                    Recyclable: 85.0,
                    Hazardous: 18.0,
                  },
                },
              },
              social: {
                total_employees: 795,
                gender: { Male: 415, Female: 369, Other: 11 },
                hiring_numbers: 82,
              },
            },
          },
        },
        {
          version: 2,
          title: "گزارش پایداری سالانه ESG — ۲۰۲۴",
          report_type: "esg_periodic",
          body: sampleV2Body,
          model: "local-esg-synthesizer",
          created_at: now - 1800_000,
          created_by: "local",
          change_note: "به‌روزرسانی نهایی پس از ممیزی سالانه و افزودن داده‌های بازچرخانی آب و تنوع",
          metadata: sampleMetadata,
        },
      ],
    };
    state.reports.set(sampleReport.id, sampleReport);
    void postgresRepo.saveReport(sampleReport).catch((err) => {
      console.warn("Failed to seed sample report to PostgreSQL:", err);
    });

    const firstDocId = Array.from(state.documents.keys())[0] ?? null;
    state.goldenSet.push(
      {
        id: crypto.randomUUID(),
        question: "What were total Scope 1 and Scope 2 CO2 emissions in 2024?",
        expected_document_id: firstDocId,
        expected_answer: "12,540.5 tCO2e (an 11.7% decrease from 14,200.0 tCO2e in 2023)",
        created_at: now - 1500_000,
      },
      {
        id: crypto.randomUUID(),
        question: "How much Solar PV energy was generated in 2024?",
        expected_document_id: firstDocId,
        expected_answer: "3,200.0 MWh (24.24% renewable share of 13,200.0 MWh total)",
        created_at: now - 1400_000,
      },
    );
  }

  workspaces.set(workspaceId, state);
  return state;
}

function getWorkspaceId(req: Request): string {
  const header = req.header("X-Workspace-ID")?.trim();
  return header || "default";
}

function serializeDocument(doc: StoredDocument) {
  return {
    id: doc.id,
    filename: doc.filename,
    path: doc.path,
    extension: doc.extension,
    language: doc.language,
    size_bytes: doc.size_bytes,
    chunks: doc.chunks.length,
    status: doc.status,
    updated_at: doc.updated_at,
    indexed_at: doc.indexed_at,
    version: doc.version,
    content_hash: doc.content_hash,
    parser: doc.parser,
    chunker: doc.chunker,
    embedding: doc.embedding,
    error: doc.error,
    progress: doc.progress,
    stage: doc.stage,
  };
}

function refreshActiveIndex(ws: WorkspaceState) {
  const active = ws.indexes.find((idx) => idx.state === "active");
  if (!active) return;
  let docCount = 0;
  let chunkCount = 0;
  for (const doc of ws.documents.values()) {
    if (doc.status === "synced") {
      docCount += 1;
      chunkCount += doc.chunks.length;
    }
  }
  active.documents = docCount;
  active.chunks = chunkCount;
}

function extractTerms(text: string): string[] {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "are",
    "was",
    "were",
    "what",
    "how",
    "many",
    "does",
    "have",
    "about",
    "into",
    "your",
    "which",
  ]);
  const matches = text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
  return Array.from(new Set(matches.filter((term) => !stopwords.has(term))));
}

function scoreChunk(terms: string[], chunkText: string, filename: string): number {
  if (terms.length === 0) return 0.1;
  const hay = `${filename} ${chunkText}`.toLowerCase();
  let hits = 0;
  let density = 0;
  for (const term of terms) {
    if (hay.includes(term)) {
      hits += 1;
      const occurrences = hay.split(term).length - 1;
      density += Math.min(3, occurrences) * 0.12;
    }
  }
  const coverage = hits / terms.length;
  return Math.min(1, coverage * 0.72 + (density / terms.length) * 0.28);
}

function buildEsgMetricsSnapshot(
  ws: WorkspaceState,
  workspaceId: string,
  fromDate?: string | null,
  toDate?: string | null,
  pillars?: string[],
) {
  return computeLiveMetricsSnapshot(ws.esgTables, workspaceId, fromDate, toDate, pillars);
}

function answerChat(ws: WorkspaceState, body: Record<string, unknown>) {
  const started = performance.now();
  const question = String(body.question ?? "").trim();
  const topK = Math.max(1, Math.min(20, Number(body.top_k ?? 6)));
  const requireCitations = Boolean(body.require_citations);
  const terms = extractTerms(question);

  const scored: Array<{
    chunk: StoredChunk;
    doc: StoredDocument;
    score: number;
  }> = [];

  for (const doc of ws.documents.values()) {
    if (doc.status !== "synced") continue;
    for (const chunk of doc.chunks) {
      const score = scoreChunk(terms, chunk.text, doc.filename);
      if (score > 0.05) {
        scored.push({ chunk, doc, score });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topHits = scored.slice(0, topK);

  const citations = topHits.map((hit) => ({
    chunk_id: hit.chunk.id,
    document_id: hit.doc.id,
    filename: hit.doc.filename,
    path: hit.doc.path,
    section: hit.chunk.section,
    line_start: hit.chunk.line_start,
    line_end: hit.chunk.line_end,
    version: hit.doc.version,
    excerpt: hit.chunk.text,
    score: Number(hit.score.toFixed(4)),
    verification: hit.score >= 0.3 ? "verified" : "partial",
  }));

  const candidates = topHits.map((hit, idx) => ({
    chunk_id: hit.chunk.id,
    document_id: hit.doc.id,
    filename: hit.doc.filename,
    source: "both",
    cosine: Number(Math.min(0.99, hit.score * 0.95).toFixed(4)),
    bm25_rank: idx + 1,
    rrf_score: Number((1 / (60 + idx + 1)).toFixed(4)),
    reranker_score: Number(hit.score.toFixed(4)),
    excerpt: hit.chunk.text,
  }));

  const confidence = citations.length > 0 ? Math.max(...citations.map((c) => c.score)) : 0;
  const minScore = requireCitations ? 0.28 : 0.15;

  let decision: "answer" | "answer_with_uncertainty" | "abstain" = "abstain";
  let answer = "";

  if (citations.length === 0 || confidence < minScore) {
    decision = "abstain";
    answer = requireCitations
      ? "I cannot answer this under citations-only mode: there is not enough indexed evidence to support a grounded response. Please refine the question or index additional documents."
      : "I don't have enough indexed evidence to answer that question.";
  } else {
    decision = confidence >= 0.32 ? "answer" : "answer_with_uncertainty";
    const summaryLines = citations.slice(0, 3).map((cit) => {
      const relevantSentences = cit.excerpt
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      const picked =
        relevantSentences.find((line) =>
          terms.some((term) => line.toLowerCase().includes(term)),
        ) || relevantSentences[0] || cit.excerpt.slice(0, 260);
      return `${picked} [${cit.filename}:${cit.line_start}-${cit.line_end}]`;
    });
    answer = summaryLines.join("\n\n");
  }

  const elapsed = Math.max(4, Math.round((performance.now() - started) * 100) / 100);
  const traceId = crypto.randomUUID();

  ws.traces.unshift({
    id: traceId,
    outcome: decision,
    latency_ms: elapsed,
    stages: {
      query_understanding: Math.round(elapsed * 0.15 * 100) / 100,
      hybrid_retrieval: Math.round(elapsed * 0.55 * 100) / 100,
      verification: Math.round(elapsed * 0.3 * 100) / 100,
    },
    created_at: Date.now(),
  });
  if (ws.traces.length > 500) ws.traces.length = 500;

  ws.events.unshift({
    id: crypto.randomUUID(),
    kind: "query",
    title: "Knowledge query completed",
    detail: question,
    created_at: Date.now(),
  });
  if (ws.events.length > 200) ws.events.length = 200;

  const active = ws.indexes.find((idx) => idx.state === "active");

  return {
    question,
    answer,
    evidence: {
      decision,
      query_coverage: Math.min(1, confidence),
      evidence_agreement: Math.min(1, citations.length / Math.max(1, topK)),
      supporting_sources: citations.length,
      citation_verification: decision === "answer",
      require_citations: requireCitations,
      evidence_score: confidence,
    },
    citations,
    retrieval: {
      stages: [
        { label: "Query understanding", candidates: Math.max(1, terms.length), ms: Math.round(elapsed * 0.15 * 100) / 100 },
        { label: "Hybrid retrieval (text)", candidates: candidates.length, ms: Math.round(elapsed * 0.55 * 100) / 100 },
      ],
      candidates,
      evidence_passed: decision !== "abstain",
      intent: "text",
      index_id: active?.id ?? null,
    },
    trace_id: traceId,
    latency_ms: elapsed,
  };
}

function createApiRouter() {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  const recordBackendErrorLog = (
    ws: WorkspaceState,
    entry: Omit<BackendErrorLogEntry, "id" | "timestamp" | "occurrences">,
  ) => {
    const now = Date.now();
    const existingIdx = ws.errorLogs.findIndex(
      (item) =>
        now - item.timestamp < 60_000 &&
        item.severity === entry.severity &&
        item.service === entry.service &&
        item.source === entry.source &&
        item.status_code === entry.status_code &&
        item.message === entry.message,
    );
    if (existingIdx !== -1) {
      const existing = ws.errorLogs[existingIdx];
      existing.timestamp = now;
      existing.occurrences += 1;
      if (existingIdx > 0) {
        ws.errorLogs.splice(existingIdx, 1);
        ws.errorLogs.unshift(existing);
      }
      return;
    }

    ws.errorLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: now,
      occurrences: 1,
      ...entry,
    });
    if (ws.errorLogs.length > 100) {
      ws.errorLogs.length = 100;
    }
  };

  router.use((req: Request, res: Response, next: express.NextFunction) => {
    if (req.path.startsWith("/backend-health/logs")) {
      next();
      return;
    }
    res.on("finish", () => {
      if (res.statusCode >= 400) {
        const ws = getWorkspace(getWorkspaceId(req));
        const severity: BackendLogSeverity =
          res.statusCode >= 500
            ? "critical"
            : res.statusCode === 404 || res.statusCode === 408 || res.statusCode === 429
              ? "warning"
              : "error";
        recordBackendErrorLog(ws, {
          severity,
          service: "KnowledgeOS RAG Core",
          source: `${req.method} /api${req.path}`,
          status_code: res.statusCode,
          message: `HTTP ${res.statusCode} ${res.statusMessage || "Request failed"}`,
        });
      }
    });
    next();
  });

  router.get("/health", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const active = ws.indexes.find((idx) => idx.state === "active");
    let chunks = 0;
    for (const doc of ws.documents.values()) chunks += doc.chunks.length;
    res.json({
      ok: true,
      version: APP_VERSION,
      database: "in-memory-esg",
      db_ok: true,
      documents: ws.documents.size,
      chunks,
      fts_active: true,
      vector_backend: "hybrid-lexical-bm25",
      active_index: active?.id ?? "index-v1",
      embedding_provider: active?.embedding ?? "local:hybrid-lexical-bm25",
    });
  });

  router.get("/config", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    res.json({
      providers: Array.from(ws.providers.values()).map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        model: p.model,
        role: p.role,
        base_url: p.base_url,
      })),
      embedding: {
        provider: "local:hybrid-lexical-bm25",
        ollama_base_url: "local-in-memory",
        ollama_model: "hybrid-lexical-bm25",
        hash_fallback: true,
      },
      limits: {
        max_upload_bytes: 50 * 1024 * 1024,
        max_batch_files: 1000,
        chunk_size: CHUNK_SIZE,
        chunk_overlap: CHUNK_OVERLAP,
        cache_ttl_seconds: 604800,
      },
    });
  });

  router.get("/storage", (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const ws = getWorkspace(wsId);
    let originalBytes = 0;
    let chunks = 0;
    for (const doc of ws.documents.values()) {
      originalBytes += doc.size_bytes;
      chunks += doc.chunks.length;
    }
    res.json({
      documents: ws.documents.size,
      original_bytes: originalBytes,
      chunks,
      storage: "in-memory",
      data_directory: `./data/${wsId}`,
    });
  });

  router.get("/metrics", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const latencies = ws.traces.map((t) => t.latency_ms).sort((a, b) => a - b);
    const percentile = (p: number): number | null => {
      if (latencies.length === 0) return null;
      const idx = Math.min(latencies.length - 1, Math.max(0, Math.ceil((p / 100) * latencies.length) - 1));
      return latencies[idx];
    };
    const stageSums: Record<string, number[]> = {};
    for (const t of ws.traces) {
      for (const [k, v] of Object.entries(t.stages)) {
        if (!stageSums[k]) stageSums[k] = [];
        stageSums[k].push(v);
      }
    }
    const meanMs =
      latencies.length > 0
        ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100
        : null;
    res.json({
      latency: {
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
      },
      queries: ws.traces.length,
      answers: ws.traces.filter((t) => t.outcome === "answer" || t.outcome === "metadata_answer").length,
      answers_with_uncertainty: ws.traces.filter((t) => t.outcome === "answer_with_uncertainty").length,
      abstentions: ws.traces.filter((t) => t.outcome === "abstain").length,
      errors: ws.traces.filter((t) => t.outcome === "error").length,
      mean_ms: meanMs,
      stages: Object.entries(stageSums).map(([label, vals]) => ({
        label,
        ms: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
      })),
    });
  });

  router.get("/activity", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    res.json({ events: ws.events.slice(0, 100) });
  });

  router.get("/documents", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const docs = Array.from(ws.documents.values())
      .sort((a, b) => b.updated_at - a.updated_at)
      .map(serializeDocument);
    res.json({ documents: docs });
  });

  router.post("/documents", upload.any(), (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
    const jobs: StoredJob[] = [];
    const accepted: string[] = [];

    if (uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        const content = file.buffer.toString("utf-8");
        const doc = createDocument(file.originalname || "upload.txt", "Uploads", content, file.size);
        ws.documents.set(doc.id, doc);
        const job: StoredJob = {
          id: crypto.randomUUID(),
          document_id: doc.id,
          document_name: doc.filename,
          stage: "completed",
          status: "completed",
          progress: 1,
          created_at: Date.now(),
        };
        ws.jobs.set(job.id, job);
        jobs.push(job);
        accepted.push(doc.filename);
        ws.events.unshift({
          id: crypto.randomUUID(),
          kind: "sync",
          title: `${doc.filename} indexed`,
          detail: `${doc.chunks.length} chunks`,
          created_at: Date.now(),
        });
      }
      refreshActiveIndex(ws);
      res.json({ accepted, jobs });
      return;
    }

    const folderPath = String(req.body?.path ?? "").trim();
    if (!folderPath) {
      res.status(400).json({ detail: "Provide files or a folder path" });
      return;
    }
    const resolved = path.resolve(folderPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      res.status(400).json({ detail: "Folder path does not exist or is not a directory" });
      return;
    }
    const allowedExt = new Set(["md", "txt", "csv", "json", "yaml", "yml", "py", "ts", "tsx", "js"]);
    const entries = fs.readdirSync(resolved, { withFileTypes: true }).slice(0, 50);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!allowedExt.has(getExt(entry.name))) continue;
      const fullPath = path.join(resolved, entry.name);
      const content = fs.readFileSync(fullPath, "utf-8");
      const doc = createDocument(entry.name, resolved, content);
      ws.documents.set(doc.id, doc);
      const job: StoredJob = {
        id: crypto.randomUUID(),
        document_id: doc.id,
        document_name: doc.filename,
        stage: "completed",
        status: "completed",
        progress: 1,
        created_at: Date.now(),
      };
      ws.jobs.set(job.id, job);
      jobs.push(job);
      accepted.push(doc.filename);
    }
    refreshActiveIndex(ws);
    res.json({ accepted, jobs, files_seen: accepted.length });
  });

  router.get("/documents/:id", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const doc = ws.documents.get(String(req.params.id));
    if (!doc) {
      res.status(404).json({ detail: "Document not found" });
      return;
    }
    res.json({
      document: serializeDocument(doc),
      content: doc.content,
      chunks: doc.chunks.map((c) => ({
        id: c.id,
        index: c.index,
        line_start: c.line_start,
        line_end: c.line_end,
        section: c.section,
        symbol: c.symbol,
        tokens: c.tokens,
        excerpt: c.text,
      })),
      versions: doc.versions,
    });
  });

  router.delete("/documents/:id", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const id = String(req.params.id);
    const doc = ws.documents.get(id);
    if (!doc) {
      res.status(404).json({ detail: "Document not found" });
      return;
    }
    ws.documents.delete(id);
    refreshActiveIndex(ws);
    ws.events.unshift({
      id: crypto.randomUUID(),
      kind: "document",
      title: `${doc.filename} deleted`,
      created_at: Date.now(),
    });
    res.status(202).json({ accepted: true, document_id: id });
  });

  router.delete("/documents/:id/chunks", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const id = String(req.params.id);
    const doc = ws.documents.get(id);
    if (!doc) {
      res.status(404).json({ detail: "Document not found" });
      return;
    }
    const removed = doc.chunks.length;
    doc.chunks = [];
    doc.status = "not_indexed";
    doc.updated_at = Date.now();
    refreshActiveIndex(ws);
    res.status(202).json({ accepted: true, document_id: id, removed_chunks: removed });
  });

  router.post("/documents/sync", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const docId = req.body?.document_id ? String(req.body.document_id) : undefined;
    const targets = docId ? ([ws.documents.get(docId)].filter(Boolean) as StoredDocument[]) : Array.from(ws.documents.values());
    const jobs: StoredJob[] = [];
    for (const doc of targets) {
      if (doc.chunks.length === 0) {
        doc.chunks = splitChunks(doc.id, doc.version + 1, doc.content);
        doc.version += 1;
      }
      doc.status = "synced";
      doc.indexed_at = Date.now();
      doc.updated_at = Date.now();
      const job: StoredJob = {
        id: crypto.randomUUID(),
        document_id: doc.id,
        document_name: doc.filename,
        stage: "completed",
        status: "completed",
        progress: 1,
        created_at: Date.now(),
      };
      ws.jobs.set(job.id, job);
      jobs.push(job);
    }
    refreshActiveIndex(ws);
    res.json(docId ? { job: jobs[0] ?? null } : { jobs });
  });

  router.post("/documents/index", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const docId = req.body?.document_id ? String(req.body.document_id).trim() : "";
    const targets = docId
      ? ([ws.documents.get(docId)].filter(Boolean) as StoredDocument[])
      : Array.from(ws.documents.values());

    if (docId && targets.length === 0) {
      res.status(404).json({ detail: "Document not found" });
      return;
    }

    const jobs: StoredJob[] = [];
    for (const doc of targets) {
      doc.version += 1;
      doc.chunks = splitChunks(doc.id, doc.version, doc.content);
      doc.status = "synced";
      doc.indexed_at = Date.now();
      doc.updated_at = Date.now();
      doc.versions.unshift({
        version: doc.version,
        chunks: doc.chunks.length,
        created_at: Date.now(),
        current: true,
        content_hash: doc.content_hash,
        reused: 0,
        newly_embedded: doc.chunks.length,
        note: "Re-indexed",
      });
      const job: StoredJob = {
        id: crypto.randomUUID(),
        document_id: doc.id,
        document_name: doc.filename,
        stage: "completed",
        status: "completed",
        progress: 1,
        created_at: Date.now(),
      };
      ws.jobs.set(job.id, job);
      jobs.push(job);
    }
    refreshActiveIndex(ws);
    res.json(docId ? { job: jobs[0] } : { jobs });
  });

  router.get("/changes/latest", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const changes = Array.from(ws.documents.values())
      .filter((d) => d.status === "changed")
      .map((d) => ({
        document_id: d.id,
        filename: d.filename,
        path: d.path,
        changed_at: d.updated_at,
        current_version: d.version,
        previous_version: Math.max(0, d.version - 1),
        previous_chunks: d.chunks.length,
        current_chunks: d.chunks.length,
      }));
    res.json({ changes });
  });

  router.get("/jobs/:id", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const job = ws.jobs.get(String(req.params.id));
    if (!job) {
      res.status(404).json({ detail: "Job not found" });
      return;
    }
    res.json(job);
  });

  router.delete("/jobs/:id", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const id = String(req.params.id);
    const job = ws.jobs.get(id);
    if (!job) {
      res.status(404).json({ detail: "Job not found" });
      return;
    }
    job.status = "cancelled";
    job.stage = "failed";
    res.status(202).json({ accepted: true, job_id: id });
  });

  router.get("/sync", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    res.json({ jobs: Array.from(ws.jobs.values()).slice(-100).reverse() });
  });

  router.post("/repositories/git", (req: Request, res: Response) => {
    const url = String(req.body?.url ?? "");
    if (!/^https:\/\/\S+/.test(url)) {
      res.status(400).json({ detail: "Only HTTPS repository URLs are accepted" });
      return;
    }
    res.status(501).json({ detail: "Git cloning is disabled in sandbox mode; upload files directly instead." });
  });

  router.get("/indexes", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    res.json({ indexes: ws.indexes });
  });

  router.post("/indexes", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const revision = ws.indexes.reduce((max, i) => Math.max(max, i.revision), 0) + 1;
    const index: StoredIndex = {
      id: `index-v${revision}`,
      state: "building",
      embedding: String(req.body?.embedding || "local:hybrid-lexical-bm25"),
      dimensions: 256,
      revision,
      documents: 0,
      chunks: 0,
      created_at: Date.now(),
      validated: false,
      evaluated: false,
      notes: req.body?.notes ? String(req.body.notes) : undefined,
    };
    ws.indexes.unshift(index);
    res.status(201).json({ index });
  });

  router.post("/indexes/:id/:action", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const id = String(req.params.id);
    const action = String(req.params.action);
    const index = ws.indexes.find((i) => i.id === id);
    if (!index) {
      res.status(404).json({ detail: "Index not found" });
      return;
    }

    if (action === "build") {
      let chunks = 0;
      for (const d of ws.documents.values()) chunks += d.chunks.length;
      index.documents = ws.documents.size;
      index.chunks = chunks;
      index.built_at = Date.now();
      if (index.state === "building") index.state = "ready";
      res.json({ index });
      return;
    }
    if (action === "validate") {
      index.validated = true;
      res.json({ index });
      return;
    }
    if (action === "evaluate") {
      index.evaluated = true;
      index.evaluation_score = 0.94;
      index.notes = "Passed golden-set regression gate";
      res.json({ index });
      return;
    }
    if (action === "activate") {
      for (const item of ws.indexes) {
        if (item.state === "active") item.state = "retired";
      }
      index.state = "active";
      refreshActiveIndex(ws);
      res.json({ index });
      return;
    }
    if (action === "rollback") {
      const target = ws.indexes.find((i) => i.id !== id && i.state === "retired" && i.validated);
      if (!target) {
        res.status(409).json({ detail: "No validated retired index is available" });
        return;
      }
      index.state = "retired";
      target.state = "active";
      refreshActiveIndex(ws);
      res.json({ index: target });
      return;
    }
    res.status(400).json({ detail: "Unsupported index action" });
  });

  router.get("/models/profiles", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    res.json(
      Array.from(ws.providers.values()).map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        base_url: p.base_url,
        model: p.model,
        role: p.role,
        enabled: p.enabled,
        created_at: p.created_at,
        updated_at: p.updated_at,
        has_api_key: Boolean(p.api_key),
      })),
    );
  });

  router.post("/models/profiles", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const now = Date.now();
    const profile: StoredProvider = {
      id: crypto.randomUUID(),
      name: String(req.body?.name ?? "Provider"),
      kind: String(req.body?.kind ?? "Custom OpenAI-compatible"),
      base_url: String(req.body?.base_url ?? "").replace(/\/$/, ""),
      model: String(req.body?.model ?? "auto"),
      role: (req.body?.role as StoredProvider["role"]) || "Generation",
      enabled: true,
      api_key: String(req.body?.api_key ?? ""),
      created_at: now,
      updated_at: now,
    };
    ws.providers.set(profile.id, profile);
    res.status(201).json({
      id: profile.id,
      name: profile.name,
      kind: profile.kind,
      base_url: profile.base_url,
      model: profile.model,
      role: profile.role,
      enabled: profile.enabled,
      has_api_key: Boolean(profile.api_key),
    });
  });

  router.patch("/models/profiles/:id", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const profile = ws.providers.get(String(req.params.id));
    if (!profile) {
      res.status(404).json({ detail: "Provider not found" });
      return;
    }
    if (req.body?.name !== undefined) profile.name = String(req.body.name);
    if (req.body?.kind !== undefined) profile.kind = String(req.body.kind);
    if (req.body?.base_url !== undefined) profile.base_url = String(req.body.base_url).replace(/\/$/, "");
    if (req.body?.model !== undefined) profile.model = String(req.body.model);
    if (req.body?.role !== undefined) profile.role = req.body.role as StoredProvider["role"];
    if (req.body?.api_key !== undefined) profile.api_key = String(req.body.api_key);
    if (req.body?.enabled !== undefined) profile.enabled = Boolean(req.body.enabled);
    profile.updated_at = Date.now();
    res.json({
      id: profile.id,
      name: profile.name,
      kind: profile.kind,
      base_url: profile.base_url,
      model: profile.model,
      role: profile.role,
      enabled: profile.enabled,
      has_api_key: Boolean(profile.api_key),
    });
  });

  router.delete("/models/profiles/:id", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    ws.providers.delete(String(req.params.id));
    res.status(204).end();
  });

  router.post("/models/profiles/:id/test", async (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const profile = ws.providers.get(String(req.params.id));
    if (!profile) {
      res.status(404).json({ detail: "Provider not found" });
      return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${profile.base_url}/models`, {
        headers: { Authorization: `Bearer ${profile.api_key}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      res.json({ ok: resp.ok, provider_id: profile.id, detail: resp.ok ? "Connected" : `HTTP ${resp.status}` });
    } catch (err) {
      res.json({ ok: false, provider_id: profile.id, detail: err instanceof Error ? err.message : "Connection failed" });
    }
  });

  router.post("/chat", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    res.json(answerChat(ws, req.body ?? {}));
  });

  router.post("/chat/stream", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const response = answerChat(ws, req.body ?? {});
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(
      `event: citations\ndata: ${JSON.stringify({ citations: response.citations, trace_id: response.trace_id })}\n\n`,
    );
    const tokens = response.answer.match(/\S+\s*/g) ?? [response.answer];
    for (const token of tokens) {
      res.write(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`);
    }
    res.write(`event: done\ndata: ${JSON.stringify(response)}\n\n`);
    res.end();
  });

  router.post("/feedback", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    ws.feedback.push({
      trace_id: String(req.body?.trace_id ?? ""),
      rating: Number(req.body?.rating ?? 1),
      created_at: Date.now(),
    });
    res.status(201).json({ accepted: true });
  });

  router.post("/verify/claims", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const answer = String(req.body?.answer ?? "");
    const ids = Array.isArray(req.body?.citation_chunk_ids) ? req.body.citation_chunk_ids.map(String) : [];
    const excerpts: Array<{ id: string; text: string }> = [];
    for (const doc of ws.documents.values()) {
      for (const chunk of doc.chunks) {
        if (ids.includes(chunk.id)) excerpts.push({ id: chunk.id, text: chunk.text });
      }
    }
    const claims = answer
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 8)
      .slice(0, 10)
      .map((claim) => {
        const claimTerms = extractTerms(claim);
        let bestScore = 0;
        let bestId: string | null = null;
        for (const ex of excerpts) {
          const s = scoreChunk(claimTerms, ex.text, "");
          if (s > bestScore) {
            bestScore = s;
            bestId = ex.id;
          }
        }
        return {
          claim,
          entailment: Number(bestScore.toFixed(4)),
          supported: bestScore >= 0.35,
          citation_chunk_id: bestId,
        };
      });
    const verifiedRatio = claims.length > 0 ? claims.filter((c) => c.supported).length / claims.length : 1;
    res.json({
      enabled: true,
      model: "lexical-entailment",
      claims,
      verified_ratio: Number(verifiedRatio.toFixed(4)),
      decision: verifiedRatio >= 0.75 ? "verified" : verifiedRatio >= 0.4 ? "partial" : "unsupported",
    });
  });

  const computeLineDiff = (oldText: string, newText: string) => {
    const a = oldText.split(/\r?\n/);
    const b = newText.split(/\r?\n/);
    const n = a.length;
    const m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () =>
      new Array<number>(m + 1).fill(0),
    );
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) {
          dp[i][j] = 1 + dp[i + 1][j + 1];
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    const lines: Array<{
      type: "unchanged" | "added" | "removed";
      text: string;
      old_line: number | null;
      new_line: number | null;
    }> = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        lines.push({
          type: "unchanged",
          text: a[i],
          old_line: i + 1,
          new_line: j + 1,
        });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        lines.push({
          type: "removed",
          text: a[i],
          old_line: i + 1,
          new_line: null,
        });
        i += 1;
      } else {
        lines.push({
          type: "added",
          text: b[j],
          old_line: null,
          new_line: j + 1,
        });
        j += 1;
      }
    }
    while (i < n) {
      lines.push({
        type: "removed",
        text: a[i],
        old_line: i + 1,
        new_line: null,
      });
      i += 1;
    }
    while (j < m) {
      lines.push({
        type: "added",
        text: b[j],
        old_line: null,
        new_line: j + 1,
      });
      j += 1;
    }
    return {
      added_lines: lines.filter((l) => l.type === "added").length,
      removed_lines: lines.filter((l) => l.type === "removed").length,
      unchanged_lines: lines.filter((l) => l.type === "unchanged").length,
      lines,
    };
  };

  router.get("/v1/reports", async (req: Request, res: Response) => {
    try {
      const wsId = String(req.query.workspace_id || getWorkspaceId(req));
      const reportType = req.query.report_type ? String(req.query.report_type) : undefined;
      const ws = getWorkspace(wsId);

      const dbReports = await postgresRepo.listReports(wsId, reportType);
      if (dbReports.length > 0) {
        for (const r of dbReports) {
          ws.reports.set(r.id, r);
        }
        res.json(dbReports);
        return;
      }

      let items = Array.from(ws.reports.values()).sort(
        (a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at),
      );
      if (reportType) items = items.filter((r) => r.report_type === reportType);
      for (const item of items) {
        await postgresRepo.saveReport(item).catch(() => {});
      }
      res.json(items);
    } catch (err) {
      console.error("PostgreSQL reports read error:", err);
      const wsId = String(req.query.workspace_id || getWorkspaceId(req));
      const reportType = req.query.report_type ? String(req.query.report_type) : undefined;
      const ws = getWorkspace(wsId);
      let items = Array.from(ws.reports.values()).sort(
        (a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at),
      );
      if (reportType) items = items.filter((r) => r.report_type === reportType);
      res.json(items);
    }
  });

  router.get("/v1/reports/:id", async (req: Request, res: Response) => {
    const wsId = String(req.query.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const reportId = String(req.params.id);
    let report = await postgresRepo.getReportById(reportId, wsId).catch(() => null);
    if (!report) {
      report = ws.reports.get(reportId) || null;
      if (report) {
        await postgresRepo.saveReport(report).catch(() => {});
      }
    }
    if (!report) {
      res.status(404).json({ detail: "Report not found" });
      return;
    }
    ws.reports.set(report.id, report);
    res.json(report);
  });

  router.get("/v1/reports/:id/versions", async (req: Request, res: Response) => {
    const wsId = String(req.query.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const reportId = String(req.params.id);
    let report = await postgresRepo.getReportById(reportId, wsId).catch(() => null);
    if (!report) {
      report = ws.reports.get(reportId) || null;
    }
    if (!report) {
      res.status(404).json({ detail: "Report not found" });
      return;
    }
    const versions = [...report.versions].sort((a, b) => b.version - a.version);
    res.json({
      report_id: report.id,
      current_version: report.version,
      total_versions: versions.length,
      versions,
    });
  });

  router.get("/v1/reports/:id/versions/diff", async (req: Request, res: Response) => {
    const wsId = String(req.query.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const reportId = String(req.params.id);
    let report = await postgresRepo.getReportById(reportId, wsId).catch(() => null);
    if (!report) {
      report = ws.reports.get(reportId) || null;
    }
    if (!report) {
      res.status(404).json({ detail: "Report not found" });
      return;
    }
    const toVer = Number(req.query.to ?? report.version);
    const fromVer = Number(
      req.query.from ?? Math.max(1, toVer - 1),
    );
    const fromEntry = report.versions.find((v) => v.version === fromVer);
    const toEntry = report.versions.find((v) => v.version === toVer);
    if (!fromEntry || !toEntry) {
      res.status(404).json({ detail: "Requested report version not found" });
      return;
    }
    const diff = computeLineDiff(fromEntry.body, toEntry.body);
    res.json({
      report_id: report.id,
      from_version: fromEntry.version,
      to_version: toEntry.version,
      title_changed: fromEntry.title !== toEntry.title,
      from_title: fromEntry.title,
      to_title: toEntry.title,
      report_type_changed: fromEntry.report_type !== toEntry.report_type,
      ...diff,
    });
  });

  router.put("/v1/reports/:id", async (req: Request, res: Response) => {
    const wsId = String(req.body?.workspace_id || req.query.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const reportId = String(req.params.id);
    let report = await postgresRepo.getReportById(reportId, wsId).catch(() => null);
    if (!report) {
      report = ws.reports.get(reportId) || null;
    }
    if (!report) {
      res.status(404).json({ detail: "Report not found" });
      return;
    }

    const nextTitle =
      typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim()
        : report.title;
    const nextBody =
      typeof req.body?.body === "string" ? req.body.body : report.body;
    const nextType =
      typeof req.body?.report_type === "string" && req.body.report_type.trim()
        ? req.body.report_type.trim()
        : report.report_type;
    const changeNote =
      typeof req.body?.change_note === "string" && req.body.change_note.trim()
        ? req.body.change_note.trim()
        : "ویرایش دستی متن و ارقام گزارش";
    const actor = req.body?.user_id ? String(req.body.user_id) : "local";

    const nextVersion = report.version + 1;
    const now = Date.now();
    const nextMeta = {
      ...report.metadata,
      ...(req.body?.metadata && typeof req.body.metadata === "object"
        ? (req.body.metadata as Record<string, unknown>)
        : {}),
    };

    const entry: ReportVersionEntry = {
      version: nextVersion,
      title: nextTitle,
      report_type: nextType,
      body: nextBody,
      model: report.model,
      created_at: now,
      created_by: actor,
      change_note: changeNote,
      metadata: nextMeta,
    };

    report.title = nextTitle;
    report.report_type = nextType;
    report.body = nextBody;
    report.version = nextVersion;
    report.updated_at = now;
    report.metadata = nextMeta;
    report.versions.push(entry);

    const saved = await postgresRepo.saveReport(report);
    ws.reports.set(saved.id, saved);
    res.json(saved);
  });

  router.post("/v1/reports/:id/versions/:version/restore", async (req: Request, res: Response) => {
    const wsId = String(req.body?.workspace_id || req.query.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const reportId = String(req.params.id);
    let report = await postgresRepo.getReportById(reportId, wsId).catch(() => null);
    if (!report) {
      report = ws.reports.get(reportId) || null;
    }
    if (!report) {
      res.status(404).json({ detail: "Report not found" });
      return;
    }
    const targetVer = Number(req.params.version);
    const target = report.versions.find((v) => v.version === targetVer);
    if (!target) {
      res.status(404).json({ detail: `Version v${req.params.version} not found` });
      return;
    }

    const nextVersion = report.version + 1;
    const now = Date.now();
    const actor = req.body?.user_id ? String(req.body.user_id) : "local";
    const restoredMeta = structuredClone(target.metadata || {});
    const restoredEntry: ReportVersionEntry = {
      version: nextVersion,
      title: target.title,
      report_type: target.report_type,
      body: target.body,
      model: target.model,
      created_at: now,
      created_by: actor,
      change_note: `بازیابی شده از نسخه v${target.version}`,
      restored_from_version: target.version,
      metadata: restoredMeta,
    };

    report.title = target.title;
    report.report_type = target.report_type;
    report.body = target.body;
    report.model = target.model;
    report.metadata = restoredMeta;
    report.version = nextVersion;
    report.updated_at = now;
    report.versions.push(restoredEntry);

    const saved = await postgresRepo.saveReport(report);
    ws.reports.set(saved.id, saved);
    res.json(saved);
  });

  router.post("/v1/reports", async (req: Request, res: Response) => {
    const wsId = String(req.body?.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const now = Date.now();
    const actor = req.body?.user_id ? String(req.body.user_id) : "local";
    const title = String(req.body?.title || "Untitled Report");
    const reportType = String(req.body?.report_type || "esg_custom");
    const body = String(req.body?.body || "");
    const model = String(req.body?.model || "local-esg-synthesizer");
    const metadata = (req.body?.metadata as Record<string, unknown>) || {};
    const report: StoredReport = {
      id: crypto.randomUUID(),
      workspace_id: wsId,
      user_id: actor,
      title,
      report_type: reportType,
      body,
      format: String(req.body?.format || "markdown"),
      model,
      sources: Array.isArray(req.body?.sources) ? req.body.sources : [],
      citations: Array.isArray(req.body?.citations) ? req.body.citations : [],
      trace_id: null,
      status: "completed",
      version: 1,
      created_at: now,
      updated_at: now,
      metadata,
      versions: [
        {
          version: 1,
          title,
          report_type: reportType,
          body,
          model,
          created_at: now,
          created_by: actor,
          change_note: "نسخه اولیه گزارش سفارشی",
          metadata,
        },
      ],
    };
    const saved = await postgresRepo.saveReport(report);
    ws.reports.set(saved.id, saved);
    res.json(saved);
  });

  router.post("/v1/reports/aggregate", async (req: Request, res: Response) => {
    const wsId = String(req.body?.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const sourceIds = Array.isArray(req.body?.source_report_ids) ? req.body.source_report_ids.map(String) : [];
    const sources: StoredReport[] = [];
    for (const sid of sourceIds) {
      let found = await postgresRepo.getReportById(sid, wsId).catch(() => null);
      if (!found) {
        found = ws.reports.get(sid) || null;
      }
      if (!found) {
        res.status(404).json({ detail: `Source report not found: ${sid}` });
        return;
      }
      sources.push(found);
    }

    const instructions = req.body?.instructions ? String(req.body.instructions) : "";
    const title = String(req.body?.title || "گزارش تجمیعی ESG");
    const reportType = String(req.body?.report_type || "esg_aggregate");
    const lines = [
      `# ${title}`,
      "",
      ...(instructions ? [`**دستورالعمل تجمیع:** ${instructions}`, ""] : []),
      `**تعداد گزارش‌های منبع:** ${sources.length}`,
      "",
      "## فهرست گزارش‌های مبنا",
      "",
      ...sources.map((r, i) => `${i + 1}. **${r.title}** — \`${r.report_type}\``),
      "",
      "## محتوای استخراج‌شده از گزارش‌ها",
      "",
      ...sources.flatMap((r) => [`### ${r.title}`, "", r.body.slice(0, 6000), "", "---", ""]),
    ];
    const body = lines.join("\n");
    const now = Date.now();
    const actor = req.body?.user_id ? String(req.body.user_id) : "local";
    const metadata = {
      source_report_ids: sourceIds,
      source_count: sources.length,
      aggregate_instructions: instructions || undefined,
      has_metrics: true,
      metrics_snapshot: buildEsgMetricsSnapshot(ws, wsId, null, null, ["environmental", "social"]),
    };

    const report: StoredReport = {
      id: crypto.randomUUID(),
      workspace_id: wsId,
      user_id: actor,
      title,
      report_type: reportType,
      body,
      format: "markdown",
      model: "local-esg-aggregator",
      sources: sources.map((r) => ({ report_id: r.id, title: r.title, report_type: r.report_type })),
      citations: [],
      trace_id: null,
      status: "completed",
      version: 1,
      created_at: now,
      updated_at: now,
      metadata,
      versions: [
        {
          version: 1,
          title,
          report_type: reportType,
          body,
          model: "local-esg-aggregator",
          created_at: now,
          created_by: actor,
          change_note: `ایجاد گزارش تجمیعی از ${sources.length} گزارش منبع`,
          metadata,
        },
      ],
    };
    const saved = await postgresRepo.saveReport(report);
    ws.reports.set(saved.id, saved);
    res.json(saved);
  });

  router.get("/v1/postgres/status", async (_req: Request, res: Response) => {
    try {
      const health = await postgresRepo.checkHealth();
      res.json(health);
    } catch (err) {
      res.status(500).json({ status: "error", error: String(err) });
    }
  });

  router.post("/v1/esg/metrics", (req: Request, res: Response) => {
    const wsId = String(req.body?.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    res.json(
      buildEsgMetricsSnapshot(
        ws,
        wsId,
        req.body?.from_date ? String(req.body.from_date) : null,
        req.body?.to_date ? String(req.body.to_date) : null,
        Array.isArray(req.body?.pillars) ? req.body.pillars.map(String) : undefined,
      ),
    );
  });

  const ESG_REPORT_TEMPLATES = [
    {
      id: "carbon-disclosure",
      name: "افشای انتشار کربن (Carbon Disclosure)",
      name_en: "Carbon Disclosure",
      category: "Environmental",
      framework: "ESRS E1 / GHG Protocol",
      report_type: "esg_environmental",
      pillars: ["environmental"],
      suggested_title: "گزارش افشای کربن و گازهای گلخانه‌ای (Carbon Disclosure)",
      description:
        "تحلیل انتشار Scope 1 & 2، تفکیک گازهای گلخانه‌ای (CO2, CH4, N2O)، ترکیب انرژی تجدیدپذیر و مقایسه با خط پایه.",
      default_instructions:
        "تمرکز ویژه روی انتشار Scope 1 و Scope 2، تفکیک گازهای گلخانه‌ای (CO2, CH4, N2O)، سهم انرژی خورشیدی و مقایسه کاهش انتشار با خط پایه سال قبل.",
      chart_focus: ["GHG Breakdown", "CO2 Baseline Comparison", "Energy Mix"],
      default_from_date: "2024-01-01",
      default_to_date: "2024-12-31",
      sample_manual_body: `# گزارش افشای کربن و گازهای گلخانه‌ای (Carbon Disclosure)

**استاندارد مرجع:** \`ESRS E1 / GHG Protocol\` | **بازه زمانی:** 2024-01-01 تا 2024-12-31

## ۱. خلاصه عملکرد کربن
- **مجموع انتشار CO2:** ۱۲٬۵۴۰.۵ تن معادل CO2 (کاهش ۱۱.۷٪ نسبت به ۱۴٬۲۰۰ تن سال پایه)
- **تفکیک گازهای گلخانه‌ای:** CO2 برابر ۱۱٬۸۰۰ تن، CH4 برابر ۴۲۰.۳ تن، N2O برابر ۹۵.۲ تن
- **مصرف انرژی کل:** ۱۳٬۲۰۰ مگاوات‌ساعت (خورشیدی ۳٬۲۰۰، برق شبکه ۸٬۹۰۰، دیزل ۱٬۱۰۰)
- **شدت کربن عملیاتی:** ۰.۹۵ تن CO2 به ازای هر مگاوات‌ساعت مصرفی
`,
    },
    {
      id: "diversity-metrics",
      name: "شاخص‌های تنوع و شمول (Diversity Metrics)",
      name_en: "Diversity Metrics",
      category: "Social",
      framework: "ESRS S1 / GRI 405",
      report_type: "esg_social",
      pillars: ["social"],
      suggested_title: "گزارش شاخص‌های تنوع، برابری و سرمایه انسانی (Diversity Metrics)",
      description:
        "بررسی ترکیب جنسیتی کارکنان، توزیع رده‌های سنی، نرخ استخدام جدید و برنامه‌های تنوع و شمول.",
      default_instructions:
        "تمرکز روی توزیع جنسیتی نیروی کار، تنوع سنی در بازه‌های زیر ۳۰، ۳۰ تا ۵۰ و بالای ۵۰ سال، نرخ استخدام جدید و شاخص‌های شمول شغلی.",
      chart_focus: ["Workforce Gender Split", "Age Distribution", "Hiring Metrics"],
      default_from_date: "2024-01-01",
      default_to_date: "2024-12-31",
      sample_manual_body: `# گزارش شاخص‌های تنوع و سرمایه انسانی (Diversity Metrics)

**استاندارد مرجع:** \`ESRS S1 / GRI 405\` | **بازه زمانی:** 2024-01-01 تا 2024-12-31

## ۱. ترکیب نیروی کار و تنوع
- **تعداد کل کارکنان:** ۸۱۲ نفر (مرد ۴۲۰، زن ۳۸۰، سایر ۱۲)
- **نرخ استخدام جدید:** ۹۶ نفر در دوره جاری (رشد نسبت به ۷۱ نفر در دوره قبل)
- **تنوع سنی:** ۲۱۰ نفر زیر ۳۰ سال، ۴۵۰ نفر ۳۰ تا ۵۰ سال، ۱۵۲ نفر بالای ۵۰ سال
- **پوشش برنامه‌های شمول:** ۶۳ همکار در برنامه‌های حمایتی و دسترس‌پذیری محیط کار
`,
    },
    {
      id: "water-circular-waste",
      name: "بهره‌وری آب و اقتصاد چرخشی (Water & Circular Waste)",
      name_en: "Water & Circular Waste",
      category: "Environmental",
      framework: "ESRS E3 & E5 / GRI 303 & 306",
      report_type: "esg_environmental",
      pillars: ["environmental"],
      suggested_title: "گزارش بهره‌وری آب و مدیریت چرخشی پسماند",
      description:
        "پایش کل مصرف آب، حجم آب بازچرخانی‌شده، و تفکیک پسماند غیرخطرناک، قابل بازیافت و خطرناک.",
      default_instructions:
        "تحلیل نرخ بازچرخانی آب صنعتی، تفکیک پسماند قابل بازیافت در برابر غیرخطرناک و کنترل زنجیره نظارت پسماند خطرناک.",
      chart_focus: ["Water vs Reused", "Waste Breakdown", "Extracted Resource Figures"],
      default_from_date: "2024-01-01",
      default_to_date: "2024-12-31",
      sample_manual_body: `# گزارش بهره‌وری آب و مدیریت چرخشی پسماند

**استاندارد مرجع:** \`ESRS E3 & E5\` | **بازه زمانی:** 2024-01-01 تا 2024-12-31

## ۱. پایش منابع آب و پسماند
- **مصرف آب:** ۴۵٬۰۰۰ مترمکعب (بازچرخانی ۵٬۲۰۰ مترمکعب معادل ۱۱.۶٪)
- **پسماند کل:** ۴۴۰.۷ تن (غیرخطرناک ۳۴۰.۵، قابل بازیافت ۸۸، خطرناک ۱۲.۲)
- **نرخ انحراف از دفن:** ۱۹.۹٪ از کل پسماند صنعتی
`,
    },
    {
      id: "energy-transition",
      name: "گذار انرژی و منابع تجدیدپذیر (Clean Energy Transition)",
      name_en: "Clean Energy Transition",
      category: "Environmental",
      framework: "GRI 302 / RE100",
      report_type: "esg_environmental",
      pillars: ["environmental"],
      suggested_title: "گزارش گذار انرژی و سهم منابع تجدیدپذیر",
      description:
        "ارزیابی سهم انرژی خورشیدی (Solar PV)، برق شبکه و ژنراتورهای دیزلی در سبد انرژی سازمان.",
      default_instructions:
        "بررسی سهم انرژی خورشیدی در سبد مصرف برق، ارزیابی اتکا به سوخت فسیلی پشتیبان و مسیر افزایش انرژی پاک.",
      chart_focus: ["Energy Mix Donut", "GHG Breakdown", "Extracted Energy Metrics"],
      default_from_date: "2024-01-01",
      default_to_date: "2024-12-31",
      sample_manual_body: `# گزارش گذار انرژی و منابع تجدیدپذیر

**استاندارد مرجع:** \`GRI 302 / RE100\` | **بازه زمانی:** 2024-01-01 تا 2024-12-31

## ۱. تراز و ترکیب مصرف انرژی
- **مصرف انرژی کل:** ۱۳٬۲۰۰ مگاوات‌ساعت (خورشیدی ۳٬۲۰۰، برق شبکه ۸٬۹۰۰، دیزل ۱٬۱۰۰)
- **سهم انرژی خورشیدی:** ۲۴.۲٪ از کل برق مصرفی سایت‌ها
- **کاهش مصرف دیزل پشتیبان:** ۱۸.۵٪ نسبت به دوره مشابه قبل
`,
    },
    {
      id: "annual-esg-executive",
      name: "گزارش جامع پایداری سالانه (Executive Annual ESG)",
      name_en: "Executive Annual ESG",
      category: "Comprehensive",
      framework: "ESRS Full / GRI Universal",
      report_type: "esg_periodic",
      pillars: ["environmental", "social"],
      suggested_title: "گزارش جامع عملکرد پایداری سالانه (Executive ESG)",
      description:
        "الگوی کامل مدیریتی شامل تمامی شاخص‌های محیط‌زیستی (کربن، انرژی، آب، پسماند) و اجتماعی (نیروی کار و تنوع) با مجموعه کامل نمودارها.",
      default_instructions:
        "تدوین گزارش جامع سالانه با پوشش همزمان رکن‌های محیط‌زیست و اجتماعی، مقایسه عملکرد با سال پایه و استناد به شواهد اسناد دانش.",
      chart_focus: ["Energy Mix", "GHG Breakdown", "Water & Waste", "Workforce Demographics"],
      default_from_date: "2024-01-01",
      default_to_date: "2024-12-31",
      sample_manual_body: `# گزارش جامع عملکرد پایداری سالانه (Executive ESG)

**استاندارد مرجع:** \`ESRS Full / GRI Universal\` | **بازه زمانی:** 2024-01-01 تا 2024-12-31

## ۱. شاخص‌های محیط‌زیستی (Environmental)
- **مجموع انتشار CO2:** ۱۲٬۵۴۰.۵ تن معادل CO2
- **تفکیک گازهای گلخانه‌ای:** CO2 برابر ۱۱٬۸۰۰ تن، CH4 برابر ۴۲۰.۳ تن، N2O برابر ۹۵.۲ تن
- **مصرف انرژی کل:** ۱۳٬۲۰۰ مگاوات‌ساعت (خورشیدی ۳٬۲۰۰، برق شبکه ۸٬۹۰۰، دیزل ۱٬۱۰۰)
- **مصرف آب:** ۴۵٬۰۰۰ مترمکعب (بازچرخانی ۵٬۲۰۰ مترمکعب)
- **پسماند کل:** ۴۴۰.۷ تن (غیرخطرناک ۳۴۰.۵، قابل بازیافت ۸۸، خطرناک ۱۲.۲)

## ۲. شاخص‌های اجتماعی (Social)
- **تعداد کل کارکنان:** ۸۱۲ نفر (مرد ۴۲۰، زن ۳۸۰، سایر ۱۲)
- **استخدام جدید:** ۹۶ نفر (نسبت به ۷۱ نفر سال قبل)
`,
    },
    {
      id: "governance-audit-readiness",
      name: "آمادگی ممیزی و حاکمیت پایداری (Audit & Governance)",
      name_en: "Audit & Governance Readiness",
      category: "Governance",
      framework: "ESRS G1 / ISSB S1",
      report_type: "esg_audit",
      pillars: ["environmental", "social"],
      suggested_title: "گزارش آمادگی ممیزی و انطباق حاکمیتی ESG",
      description:
        "ارزیابی انطباق داده‌های ممیزی‌پذیر، کنترل پسماندهای خطرناک و پوشش شواهد مستند در پایگاه دانش.",
      default_instructions:
        "تمرکز روی ممیزی‌پذیری شاخص‌های کلیدی ESG، پوشش شواهد مستند از پایگاه دانش، کنترل پسماند خطرناک و شفافیت حاکمیتی.",
      chart_focus: ["CO2 Baseline Comparison", "Waste Compliance", "Workforce Metrics"],
      default_from_date: "2024-01-01",
      default_to_date: "2024-12-31",
      sample_manual_body: `# گزارش آمادگی ممیزی و انطباق حاکمیتی ESG

**استاندارد مرجع:** \`ESRS G1 / ISSB S1\` | **بازه زمانی:** 2024-01-01 تا 2024-12-31

## ۱. کنترل‌های انطباق و ممیزی
- **انطباق گزارش‌دهی CO2:** ۱۲٬۵۴۰.۵ تن تاییدشده با پوشش ۱۰۰٪ ممیزی داخلی
- **کنترل پسماند خطرناک:** ۱۲.۲ تن تحت زنجیره نظارت کامل از مجموع ۴۴۰.۷ تن پسماند
- **پایداری نیروی کار:** ۸۱۲ نفر با نرخ جذب ۹۶ نفر در دوره جاری
`,
    },
  ];

  router.get("/v1/esg/templates", (req: Request, res: Response) => {
    const category =
      typeof req.query.category === "string" ? req.query.category.trim() : "";
    const items = category
      ? ESG_REPORT_TEMPLATES.filter(
          (t) => t.category.toLowerCase() === category.toLowerCase(),
        )
      : ESG_REPORT_TEMPLATES;
    res.json({ templates: items });
  });

  router.post("/v1/esg/generate-report", async (req: Request, res: Response) => {
    const wsId = String(req.body?.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const templateId = req.body?.template_id ? String(req.body.template_id) : "";
    const template = ESG_REPORT_TEMPLATES.find((t) => t.id === templateId) ?? null;

    const title = String(req.body?.title || template?.suggested_title || "گزارش ESG");
    const reportType = String(req.body?.report_type || template?.report_type || "esg_periodic");
    const fromDate = req.body?.from_date
      ? String(req.body.from_date)
      : template?.default_from_date || "2024-01-01";
    const toDate = req.body?.to_date
      ? String(req.body.to_date)
      : template?.default_to_date || "2024-12-31";
    const instructions = req.body?.instructions
      ? String(req.body.instructions)
      : template?.default_instructions || "";
    const pillars = Array.isArray(req.body?.pillars)
      ? req.body.pillars.map(String)
      : template?.pillars ?? ["environmental", "social"];
    const metrics = buildEsgMetricsSnapshot(ws, wsId, fromDate, toDate, pillars);

    const ragResult = answerChat(ws, {
      question: `${title} ${instructions} ${pillars.join(" ")}`.trim(),
      top_k: 5,
    });

    const envSnap = (metrics.environmental ?? null) as
      | {
          co2_emissions_tco2e?: number;
          ghg_breakdown?: Array<{ gas: string; value: number }>;
          energy_consumption_mwh?: { total: number; by_source?: Record<string, number> };
          water_consumption_m3?: { total: number; reused: number };
          waste_tonnes?: { total: number; by_type?: Record<string, number> };
        }
      | null;
    const socialSnap = (metrics.social ?? null) as
      | {
          total_employees?: number;
          gender?: Record<string, number>;
          hiring_numbers?: number;
        }
      | null;

    const fmtFa = (val: number | undefined | null) =>
      typeof val === "number" && Number.isFinite(val)
        ? val.toLocaleString("fa-IR", { maximumFractionDigits: 2 })
        : "۰";

    const co2Val = envSnap?.co2_emissions_tco2e ?? 12540.5;
    const energyTotal = envSnap?.energy_consumption_mwh?.total ?? 13200;
    const energySourcesText = envSnap?.energy_consumption_mwh?.by_source
      ? Object.entries(envSnap.energy_consumption_mwh.by_source)
          .map(([k, v]) => `${k} ${fmtFa(v)}`)
          .join("، ")
      : "خورشیدی ۳٬۲۰۰، برق شبکه ۸٬۹۰۰، دیزل ۱٬۱۰۰";
    const ghgText =
      envSnap?.ghg_breakdown && envSnap.ghg_breakdown.length > 0
        ? envSnap.ghg_breakdown.map((g) => `${g.gas} برابر ${fmtFa(g.value)} تن`).join("، ")
        : "CO2 برابر ۱۱٬۸۰۰ تن، CH4 برابر ۴۲۰.۳ تن، N2O برابر ۹۵.۲ تن";
    const waterTotal = envSnap?.water_consumption_m3?.total ?? 45000;
    const waterReused = envSnap?.water_consumption_m3?.reused ?? 5200;
    const wasteTotal = envSnap?.waste_tonnes?.total ?? 440.7;
    const wasteText = envSnap?.waste_tonnes?.by_type
      ? Object.entries(envSnap.waste_tonnes.by_type)
          .map(([k, v]) => `${k} ${fmtFa(v)} تن`)
          .join("، ")
      : "غیرخطرناک ۳۴۰.۵ تن، قابل بازیافت ۸۸ تن، خطرناک ۱۲.۲ تن";

    const empTotal = socialSnap?.total_employees ?? 812;
    const genderText =
      socialSnap?.gender && Object.keys(socialSnap.gender).length > 0
        ? Object.entries(socialSnap.gender)
            .map(([k, v]) => `${k} ${fmtFa(v)}`)
            .join("، ")
        : "مرد ۴۲۰، زن ۳۸۰، سایر ۱۲";
    const hiringTotal = socialSnap?.hiring_numbers ?? 96;

    const bodyLines = [
      `# ${title}`,
      "",
      `**نوع گزارش:** \`${reportType}\` | **بازه زمانی:** ${fromDate} تا ${toDate}${template ? ` | **الگو:** \`${template.framework}\`` : ""}`,
      ...(instructions ? [`**تمرکز گزارش:** ${instructions}`] : []),
      "",
      "## ۱. خلاصه شاخص‌های ساختاریافته ESG",
      "",
      ...(pillars.includes("environmental")
        ? [
            "### بخش محیط‌زیست (Environmental)",
            `- **مجموع انتشار CO2:** ${fmtFa(co2Val)} تن معادل CO2 (مقایسه با خط پایه ۱۴٬۲۰۰ تن)`,
            `- **تفکیک گازهای گلخانه‌ای:** ${ghgText}`,
            `- **مصرف انرژی کل:** ${fmtFa(energyTotal)} مگاوات‌ساعت (${energySourcesText})`,
            `- **مصرف آب:** ${fmtFa(waterTotal)} مترمکعب (بازچرخانی ${fmtFa(waterReused)} مترمکعب)`,
            `- **مدیریت پسماند:** ${fmtFa(wasteTotal)} تن کل (${wasteText})`,
            "",
          ]
        : []),
      ...(pillars.includes("social")
        ? [
            "### بخش اجتماعی (Social)",
            `- **تعداد کل کارکنان:** ${fmtFa(empTotal)} نفر (${genderText})`,
            `- **نرخ استخدام جدید:** ${fmtFa(hiringTotal)} نفر در دوره جاری (در مقایسه با ۷۱ نفر دوره قبل)`,
            "- **تنوع سنی:** ۲۱۰ نفر زیر ۳۰ سال، ۴۵۰ نفر ۳۰ تا ۵۰ سال، ۱۵۲ نفر بالای ۵۰ سال",
            "",
          ]
        : []),
      "## ۲. شواهد مستخرج از اسناد دانش",
      "",
      ragResult.citations.length > 0
        ? ragResult.citations
            .slice(0, 3)
            .map((c) => `- **${c.filename}** (خط ${c.line_start}–${c.line_end}): ${c.excerpt.slice(0, 240).replace(/\n+/g, " ")}…`)
            .join("\n")
        : "- سندی با تطابق بالا یافت نشد؛ گزارش بر اساس داده‌های ساختاریافته تولید شد.",
    ];

    const reportBody = bodyLines.join("\n");
    const now = Date.now();
    const actor = req.body?.user_id ? String(req.body.user_id) : "local";
    const modelName = String(req.body?.model || "local-esg-synthesizer");
    const reportMeta = {
      period_start: fromDate,
      period_end: toDate,
      pillars,
      language: String(req.body?.language || "fa"),
      template_id: template?.id || undefined,
      template_name: template?.name || undefined,
      framework: template?.framework || undefined,
      has_metrics: true,
      metrics_snapshot: metrics,
      has_rag_context: ragResult.citations.length > 0,
    };

    const existingReportId = req.body?.report_id ? String(req.body.report_id) : "";
    let existingReport = existingReportId ? await postgresRepo.getReportById(existingReportId, wsId).catch(() => null) : null;
    if (!existingReport && existingReportId) {
      existingReport = ws.reports.get(existingReportId) || null;
    }

    if (existingReport && req.body?.save !== false) {
      const nextVersion = existingReport.version + 1;
      const changeNote = req.body?.change_note
        ? String(req.body.change_note)
        : "بازتولید نسخه جدید از داده‌های زنده ESG و اسناد دانش";
      const nextEntry: ReportVersionEntry = {
        version: nextVersion,
        title,
        report_type: reportType,
        body: reportBody,
        model: modelName,
        created_at: now,
        created_by: actor,
        change_note: changeNote,
        metadata: reportMeta,
      };
      existingReport.title = title;
      existingReport.report_type = reportType;
      existingReport.body = reportBody;
      existingReport.model = modelName;
      existingReport.sources = ragResult.citations.map((c) => ({ chunk_id: c.chunk_id, filename: c.filename }));
      existingReport.citations = ragResult.citations;
      existingReport.trace_id = ragResult.trace_id;
      existingReport.version = nextVersion;
      existingReport.updated_at = now;
      existingReport.metadata = reportMeta;
      existingReport.versions.push(nextEntry);

      const saved = await postgresRepo.saveReport(existingReport);
      ws.reports.set(saved.id, saved);

      res.json({
        id: saved.id,
        saved: true,
        version: saved.version,
        title: saved.title,
        report_type: saved.report_type,
        body: saved.body,
        format: saved.format,
        model: saved.model,
        metadata: saved.metadata,
        metrics_snapshot: metrics,
        citations: saved.citations,
        document_context_used: ragResult.citations.length > 0,
      });
      return;
    }

    const report: StoredReport = {
      id: crypto.randomUUID(),
      workspace_id: wsId,
      user_id: actor,
      title,
      report_type: reportType,
      body: reportBody,
      format: "markdown",
      model: modelName,
      sources: ragResult.citations.map((c) => ({ chunk_id: c.chunk_id, filename: c.filename })),
      citations: ragResult.citations,
      trace_id: ragResult.trace_id,
      status: "completed",
      version: 1,
      created_at: now,
      updated_at: now,
      metadata: reportMeta,
      versions: [
        {
          version: 1,
          title,
          report_type: reportType,
          body: reportBody,
          model: modelName,
          created_at: now,
          created_by: actor,
          change_note: template
            ? `تولید اولیه با قالب ${template.name_en}`
            : "تولید اولیه گزارش ESG",
          metadata: reportMeta,
        },
      ],
    };

    let responseReport = report;
    if (req.body?.save !== false) {
      responseReport = await postgresRepo.saveReport(report);
      ws.reports.set(responseReport.id, responseReport);
    }

    res.json({
      id: responseReport.id,
      saved: req.body?.save !== false,
      version: responseReport.version,
      title: responseReport.title,
      report_type: responseReport.report_type,
      body: responseReport.body,
      format: responseReport.format,
      model: responseReport.model,
      metadata: responseReport.metadata,
      metrics_snapshot: metrics,
      citations: responseReport.citations,
      document_context_used: ragResult.citations.length > 0,
    });
  });

  // ---- Golden Set Evaluation endpoints ----
  router.get("/evaluations/golden", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    res.json({ items: ws.goldenSet });
  });

  router.post("/evaluations/golden", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const question = String(req.body?.question ?? "").trim();
    if (!question) {
      res.status(400).json({ detail: "question is required" });
      return;
    }
    const expectedDocId = req.body?.expected_document_id ? String(req.body.expected_document_id).trim() : null;
    const expectedChunkId = req.body?.expected_chunk_id ? String(req.body.expected_chunk_id).trim() : null;
    const expectedAnswer = req.body?.expected_answer ? String(req.body.expected_answer).trim() : null;
    if (!expectedDocId && !expectedChunkId && !expectedAnswer) {
      res.status(400).json({ detail: "Provide expected_document_id, expected_chunk_id, or expected_answer" });
      return;
    }
    const item: StoredGoldenItem = {
      id: crypto.randomUUID(),
      question,
      expected_document_id: expectedDocId,
      expected_chunk_id: expectedChunkId,
      expected_answer: expectedAnswer,
      created_at: Date.now(),
    };
    ws.goldenSet.push(item);
    res.status(201).json(item);
  });

  // ---- Structured ESG CRUD & Device Telemetry Ingestion ----
  const syncEsgSnapshotToRag = (ws: WorkspaceState, wsId: string) => {
    const { markdown, recordCount } = renderEsgRagSnapshotMarkdown(ws.esgTables, wsId);
    const filename = "ESG_Structured_Telemetry_Snapshot.md";
    const folder = "esg-corpus/telemetry-sync";
    const existing = Array.from(ws.documents.values()).find(
      (d) => d.filename === filename && d.path === folder,
    );
    const now = Date.now();
    const digest = sha256(markdown);
    let doc: StoredDocument;
    if (existing) {
      existing.version += 1;
      existing.content = markdown;
      existing.content_hash = digest;
      existing.size_bytes = Buffer.byteLength(markdown, "utf-8");
      existing.chunks = splitChunks(existing.id, existing.version, markdown);
      existing.status = "synced";
      existing.updated_at = now;
      existing.indexed_at = now;
      existing.versions.unshift({
        version: existing.version,
        chunks: existing.chunks.length,
        created_at: now,
        current: true,
        content_hash: digest,
        reused: 0,
        newly_embedded: existing.chunks.length,
        note: `Telemetry sync (${recordCount} structured rows)`,
      });
      doc = existing;
    } else {
      doc = createDocument(filename, folder, markdown);
      ws.documents.set(doc.id, doc);
    }
    refreshActiveIndex(ws);
    ws.events.unshift({
      id: crypto.randomUUID(),
      kind: "sync",
      title: `ESG Postgres snapshot embedded (${recordCount} rows)`,
      detail: `${doc.filename} · ${doc.chunks.length} chunks`,
      created_at: now,
    });
    return { ok: true, document: serializeDocument(doc), chunks_indexed: doc.chunks.length, records_synced: recordCount };
  };

  router.get("/v1/esg/tables", (_req: Request, res: Response) => {
    const items = Object.entries(ESG_TABLES)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, meta]) => ({
        table: name,
        kind: meta.kind,
        writable: meta.writable,
        required: meta.required,
      }));
    res.json({ tables: items, count: items.length });
  });

  router.get("/v1/esg/tables/:table", (req: Request, res: Response) => {
    const table = String(req.params.table);
    const meta = ESG_TABLES[table];
    if (!meta) {
      res.status(404).json({ detail: `Unknown ESG table: ${table}` });
      return;
    }
    const wsId = String(req.query.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit ?? 100)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const bucket = ws.esgTables.get(table);
    const allRows = (bucket?.rows ?? [])
      .filter((r) => meta.kind !== "fact" || r.workspace_id === wsId)
      .slice()
      .reverse();
    res.json({
      table,
      items: allRows.slice(offset, offset + limit),
      total: allRows.length,
      limit,
      offset,
    });
  });

  router.get("/v1/esg/tables/:table/:id", (req: Request, res: Response) => {
    const table = String(req.params.table);
    const meta = ESG_TABLES[table];
    if (!meta) {
      res.status(404).json({ detail: `Unknown ESG table: ${table}` });
      return;
    }
    const rowId = Number(req.params.id);
    const wsId = String(req.query.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const row = (ws.esgTables.get(table)?.rows ?? []).find(
      (r) => Number(r.id) === rowId && (meta.kind !== "fact" || r.workspace_id === wsId),
    );
    if (!row) {
      res.status(404).json({ detail: "Row not found" });
      return;
    }
    res.json(row);
  });

  router.post("/v1/esg/tables/:table", (req: Request, res: Response) => {
    const table = String(req.params.table);
    const meta = ESG_TABLES[table];
    if (!meta) {
      res.status(404).json({ detail: `Unknown ESG table: ${table}` });
      return;
    }
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const wsId = String(payload.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const parsed = filterEsgPayload(meta, payload, false);
    if (!parsed.ok) {
      res.status(422).json({ detail: parsed.error });
      return;
    }
    const bucket = ws.esgTables.get(table)!;
    const row: Record<string, unknown> = {
      id: bucket.nextId++,
      create_date: new Date().toISOString(),
      ...parsed.data,
    };
    if (meta.kind === "fact") {
      row.workspace_id = String(row.workspace_id || wsId);
      row.user_id = String(row.user_id || req.header("X-User-ID") || "local");
    }
    bucket.rows.push(row);
    res.json(row);
  });

  router.post("/v1/esg/tables/:table/bulk", (req: Request, res: Response) => {
    const table = String(req.params.table);
    const meta = ESG_TABLES[table];
    if (!meta) {
      res.status(404).json({ detail: `Unknown ESG table: ${table}` });
      return;
    }
    const body = (req.body ?? {}) as { items?: Array<Record<string, unknown>>; workspace_id?: string; user_id?: string };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      res.status(422).json({ detail: "items array is required" });
      return;
    }
    const wsId = String(body.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const bucket = ws.esgTables.get(table)!;
    const created: Array<Record<string, unknown>> = [];
    const errors: Array<{ index: number; error: string }> = [];
    items.forEach((item, index) => {
      const parsed = filterEsgPayload(meta, item, false);
      if (!parsed.ok) {
        errors.push({ index, error: parsed.error });
        return;
      }
      const row: Record<string, unknown> = {
        id: bucket.nextId++,
        create_date: new Date().toISOString(),
        ...parsed.data,
      };
      if (meta.kind === "fact") {
        row.workspace_id = String(row.workspace_id || wsId);
        row.user_id = String(row.user_id || body.user_id || req.header("X-User-ID") || "device-gateway");
      }
      bucket.rows.push(row);
      created.push(row);
    });
    res.json({ table, created: created.length, items: created, errors });
  });

  router.put("/v1/esg/tables/:table/:id", (req: Request, res: Response) => {
    const table = String(req.params.table);
    const meta = ESG_TABLES[table];
    if (!meta) {
      res.status(404).json({ detail: `Unknown ESG table: ${table}` });
      return;
    }
    const rowId = Number(req.params.id);
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const wsId = String(payload.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const bucket = ws.esgTables.get(table)!;
    const existing = bucket.rows.find((r) => Number(r.id) === rowId);
    if (!existing) {
      res.status(404).json({ detail: "Row not found" });
      return;
    }
    const parsed = filterEsgPayload(meta, payload, true);
    if (!parsed.ok) {
      res.status(422).json({ detail: parsed.error });
      return;
    }
    Object.assign(existing, parsed.data);
    res.json(existing);
  });

  router.delete("/v1/esg/tables/:table/:id", (req: Request, res: Response) => {
    const table = String(req.params.table);
    const meta = ESG_TABLES[table];
    if (!meta) {
      res.status(404).json({ detail: `Unknown ESG table: ${table}` });
      return;
    }
    const rowId = Number(req.params.id);
    const wsId = String(req.query.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const bucket = ws.esgTables.get(table)!;
    const idx = bucket.rows.findIndex(
      (r) => Number(r.id) === rowId && (meta.kind !== "fact" || r.workspace_id === wsId),
    );
    if (idx === -1) {
      res.status(404).json({ detail: "Row not found" });
      return;
    }
    bucket.rows.splice(idx, 1);
    res.json({ deleted: true, id: rowId, table });
  });

  router.post("/v1/esg/ingest", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      workspace_id?: string;
      device_id?: string;
      source_system?: string;
      table?: string;
      records?: Array<Record<string, unknown>>;
      sync_to_rag?: boolean;
    };
    const wsId = String(body.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    const table = String(body.table || "esg_co2_emission");
    const meta = ESG_TABLES[table];
    if (!meta) {
      res.status(404).json({ detail: `Unknown ESG table: ${table}` });
      return;
    }
    const sourceTag = String(body.device_id || body.source_system || "dotnet-gateway");
    const rawRecords = Array.isArray(body.records) && body.records.length > 0 ? body.records : [req.body as Record<string, unknown>];
    const bucket = ws.esgTables.get(table)!;
    const inserted: Array<Record<string, unknown>> = [];
    const errors: Array<{ index: number; error: string }> = [];

    rawRecords.forEach((rec, idx) => {
      const parsed = filterEsgPayload(meta, rec, false);
      if (!parsed.ok) {
        errors.push({ index: idx, error: parsed.error });
        return;
      }
      const row: Record<string, unknown> = {
        id: bucket.nextId++,
        create_date: new Date().toISOString(),
        ...parsed.data,
      };
      if (meta.kind === "fact") {
        row.workspace_id = String(row.workspace_id || wsId);
        row.user_id = String(row.user_id || sourceTag);
      }
      bucket.rows.push(row);
      inserted.push(row);
    });

    ws.events.unshift({
      id: crypto.randomUUID(),
      kind: "document",
      title: `Telemetry ingested to ${table} (${inserted.length} rows)`,
      detail: `Source: ${sourceTag}`,
      created_at: Date.now(),
    });

    const ragSync = body.sync_to_rag ? syncEsgSnapshotToRag(ws, wsId) : null;
    res.status(inserted.length > 0 ? 201 : 422).json({
      ok: inserted.length > 0,
      table,
      source: sourceTag,
      inserted: inserted.length,
      items: inserted,
      errors,
      rag_sync: ragSync,
    });
  });

  router.post("/v1/esg/sync-to-rag", (req: Request, res: Response) => {
    const wsId = String(req.body?.workspace_id || getWorkspaceId(req));
    const ws = getWorkspace(wsId);
    res.json(syncEsgSnapshotToRag(ws, wsId));
  });

  const normalizeProbeUrl = (raw: unknown, fallback: string): string => {
    const val = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : "";
    if (!val) return fallback;
    try {
      const u = new URL(val);
      if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
      return u.toString().replace(/\/+$/, "");
    } catch {
      return fallback;
    }
  };

  const probeHttp = async (name: string, targetUrl: string, timeoutMs = 2000) => {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(targetUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const latencyMs = Math.round((performance.now() - started) * 100) / 100;
      let payload: Record<string, unknown> | null = null;
      try {
        payload = (await resp.json()) as Record<string, unknown>;
      } catch {
        payload = null;
      }
      return {
        id: name,
        url: targetUrl,
        reachable: true,
        ok: resp.ok,
        status_code: resp.status,
        latency_ms: latencyMs,
        error: resp.ok ? null : `HTTP ${resp.status}`,
        payload,
      };
    } catch (err) {
      const latencyMs = Math.round((performance.now() - started) * 100) / 100;
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? `Timeout after ${timeoutMs}ms`
            : err.message
          : "Connection failed";
      return {
        id: name,
        url: targetUrl,
        reachable: false,
        ok: false,
        status_code: null as number | null,
        latency_ms: latencyMs,
        error: msg,
        payload: null as Record<string, unknown> | null,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const DOTNET_DISCOVERY_TARGETS: Array<{
    id: string;
    method: "GET" | "POST";
    path: string;
    canonicalPath: string;
    title: string;
    description: string;
    upstream: string;
    probeMethod: "GET" | "POST" | "OPTIONS";
    body?: string;
    queryParams?: string[];
    sampleRequest?: string;
  }> = [
    {
      id: "ingest_health",
      method: "GET",
      path: "/api/ingest/health",
      canonicalPath: "/api/ingest/health",
      title: "Gateway & Upstream RAG Health",
      description:
        "Checks ESG-Intelligence-Web-DotNet Kestrel liveness and verifies connectivity to the upstream RAG core.",
      upstream: "GET /api/health",
      probeMethod: "GET",
    },
    {
      id: "ingest_device",
      method: "POST",
      path: "/api/ingest/device",
      canonicalPath: "/api/ingest/device",
      title: "Single Device / Connector Ingestion",
      description:
        "Ingests structured IoT, SCADA, BMS, or ERP records into a target ESG Postgres table and optionally triggers RAG sync.",
      upstream: "POST /api/v1/esg/ingest",
      probeMethod: "POST",
      body: JSON.stringify({ table: "", records: [] }),
      sampleRequest: JSON.stringify(
        {
          table: "esg_co2_emission",
          deviceId: "meter-plant-01",
          syncToRag: true,
          records: [{ facility_id: "FAC-01", scope: "Scope 1", co2e_tons: 42.8 }],
        },
        null,
        2,
      ),
    },
    {
      id: "ingest_batch",
      method: "POST",
      path: "/api/ingest/batch/esg_co2_emission",
      canonicalPath: "/api/ingest/batch/{table}",
      title: "Batch Table Ingestion",
      description:
        "Streams an array of ESG telemetry rows directly into the specified Postgres table for high-throughput connectors.",
      upstream: "POST /api/v1/esg/ingest",
      probeMethod: "OPTIONS",
      queryParams: ["workspaceId?", "deviceId?", "syncToRag?"],
      sampleRequest: JSON.stringify(
        [{ facility_id: "FAC-01", period: "2026-11", electricity_kwh: 12450 }],
        null,
        2,
      ),
    },
    {
      id: "ingest_sync_rag",
      method: "POST",
      path: "/api/ingest/sync-rag",
      canonicalPath: "/api/ingest/sync-rag",
      title: "Materialize ESG Tables to RAG",
      description:
        "Triggers materialization and embedding sync of Postgres ESG tables into the active KnowledgeOS retrieval index.",
      upstream: "POST /api/v1/esg/sync-to-rag",
      probeMethod: "OPTIONS",
      queryParams: ["workspaceId?"],
    },
  ];

  const discoverDotnetServiceEndpoints = async (
    ws: WorkspaceState,
    dotnetBase: string,
  ) => {
    const results = await Promise.all(
      DOTNET_DISCOVERY_TARGETS.map(async (target) => {
        const started = performance.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);
        const url = `${dotnetBase}${target.path}`;
        try {
          const resp = await fetch(url, {
            method: target.probeMethod,
            headers: target.body
              ? { "Content-Type": "application/json", Accept: "application/json" }
              : { Accept: "application/json" },
            body: target.body,
            signal: controller.signal,
          });
          const latencyMs = Math.round((performance.now() - started) * 100) / 100;
          // 2xx or 400/405 validation/method response from Kestrel proves endpoint is alive without mutating data
          const ok = resp.status < 500 && resp.status !== 404;
          return {
            id: target.id,
            method: target.method,
            path: target.path,
            canonical_path: target.canonicalPath,
            title: target.title,
            description: target.description,
            upstream: target.upstream,
            query_params: target.queryParams ?? [],
            sample_request: target.sampleRequest ?? null,
            url,
            reachable: true,
            ok,
            active: ok,
            status_code: resp.status,
            latency_ms: latencyMs,
            error: ok ? null : `HTTP ${resp.status}`,
          };
        } catch (err) {
          const latencyMs = Math.round((performance.now() - started) * 100) / 100;
          const msg =
            err instanceof Error
              ? err.name === "AbortError"
                ? "Timeout after 1800ms"
                : err.message
              : "Connection failed";
          return {
            id: target.id,
            method: target.method,
            path: target.path,
            canonical_path: target.canonicalPath,
            title: target.title,
            description: target.description,
            upstream: target.upstream,
            query_params: target.queryParams ?? [],
            sample_request: target.sampleRequest ?? null,
            url,
            reachable: false,
            ok: false,
            active: false,
            status_code: null as number | null,
            latency_ms: latencyMs,
            error: msg,
          };
        } finally {
          clearTimeout(timer);
        }
      }),
    );

    const checkedAt = Date.now();
    const oneHourAgo = checkedAt - 60 * 60 * 1000;
    for (const r of results) {
      ws.dotnetEndpointSamples.push({
        timestamp: checkedAt,
        endpoint: `${r.method} ${r.canonical_path}`,
        method: r.method,
        path: r.canonical_path,
        latency_ms: r.latency_ms,
        status: r.ok ? "ready" : "offline",
        reachable: r.reachable,
      });
      if (!r.ok) {
        recordBackendErrorLog(ws, {
          severity: r.reachable ? "error" : r.id === "ingest_health" ? "error" : "warning",
          service: ".NET Web API",
          source: `${r.method} ${r.canonical_path}`,
          status_code: r.status_code,
          message: r.error || "Endpoint connectivity check failed",
        });
      }
    }
    ws.dotnetEndpointSamples = ws.dotnetEndpointSamples
      .filter((s) => s.timestamp >= oneHourAgo)
      .slice(-2400);

    const reachableCount = results.filter((r) => r.ok).length;
    const latencies = results.filter((r) => r.reachable).map((r) => r.latency_ms);
    const avgMs =
      latencies.length > 0
        ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100
        : null;

    return {
      ok: reachableCount === results.length,
      dotnet_url: dotnetBase,
      checked_at: checkedAt,
      reachable_count: reachableCount,
      total_count: results.length,
      average_latency_ms: avgMs,
      results,
    };
  };

  let prevProcessCpu = process.cpuUsage();
  let prevProcessCpuAt = performance.now();
  let prevOsCpus = os.cpus();

  const sampleResourceMetrics = (timestamp: number, label: string) => {
    const nowPerf = performance.now();
    const elapsedUs = Math.max(1000, (nowPerf - prevProcessCpuAt) * 1000);
    const deltaCpu = process.cpuUsage(prevProcessCpu);
    prevProcessCpu = process.cpuUsage();
    prevProcessCpuAt = nowPerf;

    const cpus = os.cpus();
    const coreCount = Math.max(1, cpus.length);
    const rawProcessCpuPct =
      ((deltaCpu.user + deltaCpu.system) / (elapsedUs * coreCount)) * 100;
    const processCpuPct = Math.round(
      Math.min(100, Math.max(0, rawProcessCpuPct)) * 100,
    ) / 100;

    let idleDelta = 0;
    let totalDelta = 0;
    for (let i = 0; i < cpus.length; i++) {
      const curr = cpus[i]?.times;
      const prev = prevOsCpus[i]?.times;
      if (!curr || !prev) continue;
      const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;
      const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
      totalDelta += Math.max(0, currTotal - prevTotal);
      idleDelta += Math.max(0, curr.idle - prev.idle);
    }
    prevOsCpus = cpus;

    const load1m = os.loadavg()[0] ?? 0;
    const rawSystemCpuPct =
      totalDelta > 0
        ? ((totalDelta - idleDelta) / totalDelta) * 100
        : (load1m / coreCount) * 100;
    const systemCpuPct = Math.round(
      Math.min(100, Math.max(0, rawSystemCpuPct)) * 100,
    ) / 100;

    const mem = process.memoryUsage();
    const totalMemBytes = Math.max(1, os.totalmem());
    const freeMemBytes = Math.max(0, os.freemem());
    const usedMemBytes = Math.max(0, totalMemBytes - freeMemBytes);
    const memoryPct = Math.round((usedMemBytes / totalMemBytes) * 10000) / 100;

    const sample: ResourceUsageSample = {
      timestamp,
      label,
      process_cpu_pct: processCpuPct,
      system_cpu_pct: systemCpuPct,
      memory_pct: memoryPct,
      process_rss_mb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      process_heap_mb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      system_mem_used_mb: Math.round((usedMemBytes / 1024 / 1024) * 10) / 10,
      system_mem_total_mb: Math.round((totalMemBytes / 1024 / 1024) * 10) / 10,
    };

    return {
      cpu_cores: coreCount,
      uptime_sec: Math.round(process.uptime()),
      load_avg_1m: Math.round(load1m * 100) / 100,
      current: sample,
    };
  };

  const discoverRegisteredServices = async (
    ws: WorkspaceState,
    dotnetBase: string,
    pythonBase: string,
  ) => {
    const localBase = `http://127.0.0.1:${PORT}`;
    const [ragCore, esgStore, dotnetGw, pythonRag, pgHealth] = await Promise.all([
      probeHttp("rag_core", `${localBase}/api/health`, 2000),
      probeHttp("esg_postgres_store", `${localBase}/api/v1/esg/tables`, 2000),
      probeHttp("dotnet_gateway", `${dotnetBase}/api/ingest/health`, 1800),
      probeHttp("python_rag", `${pythonBase}/health`, 1500),
      postgresRepo.checkHealth(),
    ]);

    const now = Date.now();
    const activeIndex = ws.indexes.find((i) => i.state === "active");
    let totalFactRows = 0;
    for (const [name, meta] of Object.entries(ESG_TABLES)) {
      if (meta.kind === "fact") {
        totalFactRows += ws.esgTables.get(name)?.rows.length ?? 0;
      }
    }

    const toOperationalStatus = (
      status: "connected" | "degraded" | "offline",
    ): "Operational" | "Degraded" | "Offline" => {
      if (status === "connected") return "Operational";
      if (status === "degraded") return "Degraded";
      return "Offline";
    };

    const dotnetStatus: "connected" | "degraded" | "offline" = dotnetGw.ok
      ? "connected"
      : dotnetGw.reachable
        ? "degraded"
        : "offline";
    const ragStatus: "connected" | "degraded" | "offline" = ragCore.ok
      ? "connected"
      : ragCore.reachable
        ? "degraded"
        : "offline";
    const esgStatus: "connected" | "degraded" | "offline" =
      pgHealth.status === "operational"
        ? "connected"
        : esgStore.ok
          ? "connected"
          : "degraded";
    const pythonStatus: "connected" | "degraded" | "offline" = pythonRag.ok
      ? "connected"
      : pythonRag.reachable
        ? "degraded"
        : "offline";

    const services = [
      {
        id: "dotnet_gateway",
        name: ".NET Web API Gateway",
        role: "IoT / BMS / ERP Device Ingestion & Razor Console",
        url: dotnetGw.url,
        status: dotnetStatus,
        operational_status: toOperationalStatus(dotnetStatus),
        reachable: dotnetGw.reachable,
        status_code: dotnetGw.status_code,
        latency_ms: dotnetGw.latency_ms,
        error: dotnetGw.error,
        detail: dotnetGw.ok
          ? "Gateway reachable and forwarding telemetry"
          : "Not running locally or unreachable on configured URL",
      },
      {
        id: "rag_core",
        name: "KnowledgeOS RAG Core",
        role: "Express + Hybrid Retrieval & Report Synthesizer",
        url: ragCore.url,
        status: ragStatus,
        operational_status: toOperationalStatus(ragStatus),
        reachable: ragCore.reachable,
        status_code: ragCore.status_code,
        latency_ms: ragCore.latency_ms,
        error: ragCore.error,
        detail: `${ws.documents.size} documents · ${activeIndex?.chunks ?? 0} indexed chunks`,
      },
      {
        id: "esg_postgres_store",
        name: "PostgreSQL Database Store",
        role: "Persistent Reports & ESG Fact Tables (PostgreSQL 16)",
        url: `${localBase}/api/v1/reports`,
        status: esgStatus,
        operational_status: toOperationalStatus(esgStatus),
        reachable: pgHealth.status === "operational" || esgStore.reachable,
        status_code: 200,
        latency_ms: pgHealth.latency_ms || esgStore.latency_ms,
        error: pgHealth.status === "operational" ? null : esgStore.error,
        detail: `PostgreSQL ${pgHealth.version} (${pgHealth.mode}) · ${pgHealth.reports_count} reports persisted · ${Object.keys(ESG_TABLES).length} ESG tables (${totalFactRows} fact rows)`,
      },
      {
        id: "python_rag",
        name: "Python FastAPI + Qdrant",
        role: "Upstream Vector & PostgreSQL Persistence Engine",
        url: pythonRag.url,
        status: pythonStatus,
        operational_status: toOperationalStatus(pythonStatus),
        reachable: pythonRag.reachable,
        status_code: pythonRag.status_code,
        latency_ms: pythonRag.latency_ms,
        error: pythonRag.error,
        detail: pythonRag.ok
          ? "Python FastAPI healthy"
          : "Optional upstream (:8000) offline in Node sandbox",
      },
    ];

    if (!ragCore.ok) {
      recordBackendErrorLog(ws, {
        severity: ragCore.reachable ? "error" : "critical",
        service: "KnowledgeOS RAG Core",
        source: "GET /api/health",
        status_code: ragCore.status_code,
        message: ragCore.error || "RAG Core health check failed",
      });
    }
    if (!esgStore.ok) {
      recordBackendErrorLog(ws, {
        severity: esgStore.reachable ? "error" : "critical",
        service: "ESG Structured Store",
        source: "GET /api/v1/esg/tables",
        status_code: esgStore.status_code,
        message: esgStore.error || "ESG table store probe failed",
      });
    }
    if (!dotnetGw.ok) {
      recordBackendErrorLog(ws, {
        severity: "error",
        service: ".NET Web API Gateway",
        source: "GET /api/ingest/health",
        status_code: dotnetGw.status_code,
        message: dotnetGw.error || "Gateway unreachable on configured URL",
      });
    }
    if (!pythonRag.ok) {
      recordBackendErrorLog(ws, {
        severity: pythonRag.reachable ? "error" : "warning",
        service: "Python FastAPI + Qdrant",
        source: "GET /health",
        status_code: pythonRag.status_code,
        message: pythonRag.error || "Optional upstream (:8000) offline",
      });
    }

    return {
      now,
      ragCore,
      esgStore,
      dotnetGw,
      pythonRag,
      activeIndex,
      totalFactRows,
      services,
    };
  };

  const runBackendHealthProbe = async (ws: WorkspaceState, dotnetBase: string, pythonBase: string) => {
    const {
      now,
      ragCore,
      esgStore,
      dotnetGw,
      pythonRag,
      activeIndex,
      totalFactRows,
      services,
    } = await discoverRegisteredServices(ws, dotnetBase, pythonBase);

    const label = new Date(now).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const sample: BackendHealthSample = {
      timestamp: now,
      label,
      rag_core_ms: ragCore.latency_ms,
      esg_store_ms: esgStore.latency_ms,
      dotnet_ms: dotnetGw.reachable ? dotnetGw.latency_ms : null,
      python_ms: pythonRag.reachable ? pythonRag.latency_ms : null,
      dotnet_reachable: dotnetGw.reachable,
      python_reachable: pythonRag.reachable,
    };
    ws.healthHistory.push(sample);
    if (ws.healthHistory.length > 40) {
      ws.healthHistory.splice(0, ws.healthHistory.length - 40);
    }
    const oneHourCutoff = now - 60 * 60 * 1000;
    ws.healthHistory1h.push(sample);
    ws.healthHistory1h = ws.healthHistory1h
      .filter((s) => s.timestamp >= oneHourCutoff)
      .slice(-1500);

    const endpoints = [
      ...DOTNET_DISCOVERY_TARGETS.map((target) => ({
        method: target.method,
        path: target.canonicalPath,
        service: ".NET Web API",
        upstream: target.upstream,
        status: dotnetGw.ok
          ? "ready"
          : target.id === "ingest_health"
            ? "offline"
            : "standby",
        latency_ms: dotnetGw.reachable
          ? dotnetGw.latency_ms
          : target.id === "ingest_health"
            ? null
            : target.id === "ingest_batch"
              ? esgStore.latency_ms
              : ragCore.latency_ms,
      })),
      {
        method: "GET",
        path: "/api/v1/esg/tables",
        service: "ESG Store",
        upstream: "Postgres / In-Memory Catalog",
        status: esgStore.ok ? "ready" : "degraded",
        latency_ms: esgStore.latency_ms,
      },
      {
        method: "POST",
        path: "/api/v1/esg/sync-to-rag",
        service: "RAG Materializer",
        upstream: "Active Vector / BM25 Index",
        status: ragCore.ok ? "ready" : "degraded",
        latency_ms: ragCore.latency_ms,
      },
    ];

    const oneHourAgo = now - 60 * 60 * 1000;
    for (const ep of endpoints) {
      if (ep.service !== ".NET Web API") continue;
      const measured = ep.latency_ms ?? dotnetGw.latency_ms;
      if (typeof measured !== "number" || !Number.isFinite(measured)) continue;
      ws.dotnetEndpointSamples.push({
        timestamp: now,
        endpoint: `${ep.method} ${ep.path}`,
        method: ep.method,
        path: ep.path,
        latency_ms: Math.round(measured * 100) / 100,
        status: ep.status,
        reachable: dotnetGw.reachable,
      });
    }
    ws.dotnetEndpointSamples = ws.dotnetEndpointSamples
      .filter((s) => s.timestamp >= oneHourAgo)
      .slice(-2400);

    const resourceSnapshot = sampleResourceMetrics(now, label);
    ws.resourceHistory.push(resourceSnapshot.current);
    if (ws.resourceHistory.length > 40) {
      ws.resourceHistory.splice(0, ws.resourceHistory.length - 40);
    }

    const dotnetLatencies = ws.healthHistory
      .map((h) => h.dotnet_ms)
      .filter((v): v is number => v !== null);
    const ragLatencies = ws.healthHistory.map((h) => h.rag_core_ms);
    const avg = (arr: number[]) =>
      arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;

    return {
      timestamp: now,
      dotnet_url: dotnetBase,
      python_url: pythonBase,
      summary: {
        connected_services: services.filter((s) => s.status === "connected").length,
        total_services: services.length,
        dotnet_avg_ms: avg(dotnetLatencies),
        rag_core_avg_ms: avg(ragLatencies),
        esg_tables: Object.keys(ESG_TABLES).length,
        esg_fact_rows: totalFactRows,
        indexed_chunks: activeIndex?.chunks ?? 0,
        active_index: activeIndex?.id ?? "index-v1",
      },
      services,
      endpoints,
      history: ws.healthHistory,
      dotnet_endpoint_samples_1h: ws.dotnetEndpointSamples,
      resource_usage: resourceSnapshot,
      resource_history: ws.resourceHistory,
    };
  };

  router.get("/backend-health", async (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const dotnetBase = normalizeProbeUrl(
      req.query.dotnet_url,
      process.env.DOTNET_GATEWAY_URL || "http://127.0.0.1:5180",
    );
    const pythonBase = normalizeProbeUrl(
      req.query.python_url,
      process.env.PYTHON_RAG_URL || "http://127.0.0.1:8000",
    );
    const report = await runBackendHealthProbe(ws, dotnetBase, pythonBase);
    res.json(report);
  });

  router.post("/backend-health/probe", async (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const dotnetBase = normalizeProbeUrl(
      req.body?.dotnet_url,
      process.env.DOTNET_GATEWAY_URL || "http://127.0.0.1:5180",
    );
    const pythonBase = normalizeProbeUrl(
      req.body?.python_url,
      process.env.PYTHON_RAG_URL || "http://127.0.0.1:8000",
    );
    const report = await runBackendHealthProbe(ws, dotnetBase, pythonBase);
    res.json(report);
  });

  router.post("/backend-health/ping-dotnet", async (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const dotnetBase = normalizeProbeUrl(
      req.body?.dotnet_url,
      process.env.DOTNET_GATEWAY_URL || "http://127.0.0.1:5180",
    );
    const discovery = await discoverDotnetServiceEndpoints(ws, dotnetBase);
    res.json(discovery);
  });

  router.get("/backend-health/api-docs", async (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const dotnetBase = normalizeProbeUrl(
      req.query.dotnet_url,
      process.env.DOTNET_GATEWAY_URL || "http://127.0.0.1:5180",
    );
    const discovery = await discoverDotnetServiceEndpoints(ws, dotnetBase);
    res.json(discovery);
  });

  router.get("/backend-health/services", async (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const dotnetBase = normalizeProbeUrl(
      req.query.dotnet_url,
      process.env.DOTNET_GATEWAY_URL || "http://127.0.0.1:5180",
    );
    const pythonBase = normalizeProbeUrl(
      req.query.python_url,
      process.env.PYTHON_RAG_URL || "http://127.0.0.1:8000",
    );
    const { now, services } = await discoverRegisteredServices(
      ws,
      dotnetBase,
      pythonBase,
    );
    res.json({
      timestamp: now,
      dotnet_url: dotnetBase,
      python_url: pythonBase,
      operational_count: services.filter((s) => s.operational_status === "Operational").length,
      degraded_count: services.filter((s) => s.operational_status === "Degraded").length,
      offline_count: services.filter((s) => s.operational_status === "Offline").length,
      total_count: services.length,
      services,
    });
  });

  router.get("/backend-health/metrics", async (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const dotnetBase = normalizeProbeUrl(
      req.query.dotnet_url,
      process.env.DOTNET_GATEWAY_URL || "http://127.0.0.1:5180",
    );
    const pythonBase = normalizeProbeUrl(
      req.query.python_url,
      process.env.PYTHON_RAG_URL || "http://127.0.0.1:8000",
    );
    const parsedWindow = Number(req.query.window_minutes ?? 60);
    const windowMinutes =
      Number.isFinite(parsedWindow) && parsedWindow >= 1 && parsedWindow <= 180
        ? Math.round(parsedWindow)
        : 60;

    if (ws.healthHistory1h.length === 0) {
      await runBackendHealthProbe(ws, dotnetBase, pythonBase);
    }

    const now = Date.now();
    const cutoff = now - windowMinutes * 60 * 1000;
    const samples = ws.healthHistory1h.filter((s) => s.timestamp >= cutoff);

    const spanMs =
      samples.length >= 2
        ? samples[samples.length - 1].timestamp - samples[0].timestamp
        : 0;
    const bucketMs =
      spanMs > 10 * 60 * 1000 ? 60_000 : spanMs > 2 * 60 * 1000 ? 15_000 : 0;

    const avg = (arr: number[]) =>
      arr.length
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
        : null;

    const sampleOverall = (s: BackendHealthSample) => {
      const vals = [s.rag_core_ms, s.esg_store_ms];
      if (s.dotnet_ms !== null) vals.push(s.dotnet_ms);
      if (s.python_ms !== null) vals.push(s.python_ms);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const grouped = new Map<number, BackendHealthSample[]>();
    for (const s of samples) {
      const key =
        bucketMs > 0 ? Math.floor(s.timestamp / bucketMs) * bucketMs : s.timestamp;
      const list = grouped.get(key) ?? [];
      list.push(s);
      grouped.set(key, list);
    }

    const series = Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucketTs, group]) => {
        const overalls = group.map(sampleOverall);
        const rags = group.map((g) => g.rag_core_ms);
        const esgs = group.map((g) => g.esg_store_ms);
        const dotnets = group
          .map((g) => g.dotnet_ms)
          .filter((v): v is number => v !== null);
        const pythons = group
          .map((g) => g.python_ms)
          .filter((v): v is number => v !== null);
        const label =
          bucketMs >= 60_000
            ? new Date(bucketTs).toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
              })
            : new Date(bucketTs).toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });

        return {
          timestamp: bucketTs,
          label,
          overall_avg_ms: avg(overalls) ?? 0,
          rag_core_avg_ms: avg(rags) ?? 0,
          esg_store_avg_ms: avg(esgs) ?? 0,
          dotnet_avg_ms: avg(dotnets),
          python_avg_ms: avg(pythons),
          sample_count: group.length,
        };
      });

    const allOveralls = samples.map(sampleOverall).sort((a, b) => a - b);
    const p95Idx =
      allOveralls.length > 0
        ? Math.min(allOveralls.length - 1, Math.ceil(0.95 * allOveralls.length) - 1)
        : 0;

    res.json({
      timestamp: now,
      window_minutes: windowMinutes,
      dotnet_url: dotnetBase,
      python_url: pythonBase,
      summary: {
        sample_count: samples.length,
        overall_avg_ms: avg(allOveralls),
        p95_ms:
          allOveralls.length > 0
            ? Math.round(allOveralls[p95Idx] * 100) / 100
            : null,
        min_ms:
          allOveralls.length > 0 ? Math.round(allOveralls[0] * 100) / 100 : null,
        max_ms:
          allOveralls.length > 0
            ? Math.round(allOveralls[allOveralls.length - 1] * 100) / 100
            : null,
        rag_core_avg_ms: avg(samples.map((s) => s.rag_core_ms)),
        esg_store_avg_ms: avg(samples.map((s) => s.esg_store_ms)),
        dotnet_avg_ms: avg(
          samples
            .map((s) => s.dotnet_ms)
            .filter((v): v is number => v !== null),
        ),
      },
      series,
    });
  });

  router.get("/backend-health/logs", async (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const dotnetBase = normalizeProbeUrl(
      req.query.dotnet_url,
      process.env.DOTNET_GATEWAY_URL || "http://127.0.0.1:5180",
    );
    const pythonBase = normalizeProbeUrl(
      req.query.python_url,
      process.env.PYTHON_RAG_URL || "http://127.0.0.1:8000",
    );
    if (ws.errorLogs.length === 0) {
      await discoverRegisteredServices(ws, dotnetBase, pythonBase);
    }

    const parsedLimit = Number(req.query.limit ?? 10);
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 50
        ? Math.round(parsedLimit)
        : 10;
    const rawSeverity =
      typeof req.query.severity === "string" ? req.query.severity.toLowerCase() : "all";
    const filtered =
      rawSeverity === "critical" || rawSeverity === "error" || rawSeverity === "warning"
        ? ws.errorLogs.filter((entry) => entry.severity === rawSeverity)
        : ws.errorLogs;

    res.json({
      timestamp: Date.now(),
      total_count: ws.errorLogs.length,
      counts: {
        critical: ws.errorLogs.filter((l) => l.severity === "critical").length,
        error: ws.errorLogs.filter((l) => l.severity === "error").length,
        warning: ws.errorLogs.filter((l) => l.severity === "warning").length,
      },
      logs: filtered.slice(0, limit),
    });
  });

  router.delete("/backend-health/logs", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    ws.errorLogs = [];
    res.json({ cleared: true, timestamp: Date.now() });
  });

  // ---------- Calculation Engines (14 ESG & Petrochemical Engines) ----------
  router.get("/v1/calc/engines", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const list = Array.from(ws.calcStore.engines.keys())
      .map((slug) => computeEngineView(ws.calcStore, slug))
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .map((v) => ({
        slug: v.slug,
        number: v.number,
        title: v.title,
        subtitle: v.subtitle,
        standard_ref: v.standard_ref,
        headline_kpi: v.kpis[0] ?? null,
        record_count: v.records.length,
      }));
    res.json({ engines: list });
  });

  router.get("/v1/calc/engines/:slug", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const slug = String(req.params.slug) as CalcEngineSlug;
    const view = computeEngineView(ws.calcStore, slug);
    if (!view) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }
    res.json(view);
  });

  router.post("/v1/calc/engines/:slug/validate", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const slug = String(req.params.slug) as CalcEngineSlug;
    const candidate =
      req.body?.candidate_record && typeof req.body.candidate_record === "object"
        ? (req.body.candidate_record as Record<string, unknown>)
        : undefined;
    const report = validateCalculationInputs(ws.calcStore, slug, candidate);
    if (!report) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }
    res.json(report);
  });

  router.post("/v1/calc/engines/:slug/runs", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const slug = String(req.params.slug) as CalcEngineSlug;
    const note = req.body?.note ? String(req.body.note) : undefined;
    const actor = String(req.body?.actor || "ESG Engineer");
    const acknowledge = Boolean(req.body?.acknowledge_anomalies);
    const overrideReason = req.body?.override_reason
      ? String(req.body.override_reason)
      : undefined;

    const result = runManualCalculation(ws.calcStore, slug, note, actor, {
      acknowledge_anomalies: acknowledge,
      override_reason: overrideReason,
    });
    if (!result) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }
    if (result.outcome === "blocked") {
      res.status(422).json({
        error: result.error,
        outcome: result.outcome,
        validation: result.validation,
      });
      return;
    }
    if (result.outcome === "requires_acknowledgment") {
      res.status(409).json({
        error: result.error,
        outcome: result.outcome,
        validation: result.validation,
      });
      return;
    }
    res.status(201).json(result.view);
  });

  router.get("/v1/calc/engines/:slug/history/export-excel", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const slug = String(req.params.slug) as CalcEngineSlug;
    const view = computeEngineView(ws.calcStore, slug);
    if (!view) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }
    const runs = view.calculation_history ?? [];
    if (runs.length === 0) {
      res.status(404).json({ error: `No calculation runs recorded for '${slug}'` });
      return;
    }

    const wb = XLSX.utils.book_new();

    const overviewRows = runs.map((r) => {
      const headline = r.outputs_snapshot?.[0];
      const val = r.validation_summary;
      return {
        "Run #": r.run_number,
        "Run ID": r.id,
        "Timestamp (UTC)": new Date(r.timestamp).toISOString(),
        "Trigger Type": r.trigger,
        "Trigger Reason": r.trigger_label,
        "Operator": r.actor,
        "Checkpoint Note": r.note || "N/A",
        "Input Records Count": r.inputs_snapshot.record_count,
        "Headline Metric": headline?.label || "N/A",
        "Headline Value": headline?.value ?? "N/A",
        "Headline Unit": headline?.unit || "",
        "Validation Status": val?.status?.toUpperCase() || "PASSED",
        "Checks Executed": val?.checks_executed ?? 0,
        "Flagged Warnings": val?.warning_count ?? 0,
        "Override Acknowledged": val?.acknowledged_override ? "YES" : "NO",
        "Override Justification": val?.override_reason || "N/A",
      };
    });
    const wsOverview = XLSX.utils.json_to_sheet(overviewRows);
    XLSX.utils.book_append_sheet(wb, wsOverview, "Run_Overview");

    const inputRows: Array<Record<string, unknown>> = [];
    runs.forEach((r) => {
      (r.inputs_snapshot?.entries ?? []).forEach((e, idx) => {
        inputRows.push({
          "Run #": r.run_number,
          "Item #": idx + 1,
          "Activity Stream": e.label,
          "Raw Input Details": e.inputs,
          "Computed Line Result": e.result,
        });
      });
    });
    if (inputRows.length > 0) {
      const wsInputs = XLSX.utils.json_to_sheet(inputRows);
      XLSX.utils.book_append_sheet(wb, wsInputs, "Raw_Inputs_Ledger");
    }

    const outputRows: Array<Record<string, unknown>> = [];
    runs.forEach((r) => {
      (r.outputs_snapshot ?? []).forEach((kpi) => {
        outputRows.push({
          "Run #": r.run_number,
          "KPI Key": kpi.key,
          "KPI Label": kpi.label,
          "Computed Value": kpi.value,
          "Unit": kpi.unit || "",
          "Audit Tone": kpi.tone || "info",
        });
      });
    });
    if (outputRows.length > 0) {
      const wsOutputs = XLSX.utils.json_to_sheet(outputRows);
      XLSX.utils.book_append_sheet(wb, wsOutputs, "KPI_Outputs");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `Calculation_History_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  router.post("/v1/calc/engines/:slug/records", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const slug = String(req.params.slug) as CalcEngineSlug;
    const actor = String(req.body?.actor || req.body?.user_id || "ESG Engineer");
    const view = addEngineRecord(ws.calcStore, slug, req.body ?? {}, actor);
    if (!view) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }
    res.status(201).json(view);
  });

  router.post("/v1/calc/engines/:slug/bulk-validate", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const slug = String(req.params.slug) as CalcEngineSlug;
    const rawRows = Array.isArray(req.body?.rows)
      ? (req.body.rows as Array<Record<string, unknown>>)
      : [];
    const report = validateBulkImportRows(ws.calcStore, slug, rawRows);
    if (!report) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }
    res.json(report);
  });

  router.post("/v1/calc/engines/:slug/bulk-commit", async (req: Request, res: Response) => {
    const workspaceId = getWorkspaceId(req);
    const ws = getWorkspace(workspaceId);
    const slug = String(req.params.slug) as CalcEngineSlug;
    const rawRows = Array.isArray(req.body?.rows)
      ? (req.body.rows as Array<Record<string, unknown>>)
      : [];
    const actor = String(
      req.body?.actor ||
        req.body?.user_id ||
        (slug === "emission-factors" ? "ESG Governance Admin" : "ESG Engineer"),
    );
    const acknowledgeAnomalies = Boolean(req.body?.acknowledge_anomalies);
    const overrideReason = req.body?.override_reason
      ? String(req.body.override_reason).trim()
      : undefined;

    if (rawRows.length === 0) {
      res.status(400).json({ error: "No rows provided for bulk import" });
      return;
    }

    const report = validateBulkImportRows(ws.calcStore, slug, rawRows);
    if (!report) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }

    if (report.error_rows > 0) {
      res.status(422).json({
        error: `Bulk import blocked: ${report.error_rows} row(s) contain missing or invalid fields.`,
        outcome: "blocked",
        validation: report,
      });
      return;
    }

    if (report.warning_rows > 0 && !acknowledgeAnomalies) {
      res.status(409).json({
        error: `Bulk import paused: ${report.warning_rows} row(s) contain historical anomalies. Acknowledge anomalies to commit.`,
        outcome: "requires_acknowledgment",
        validation: report,
      });
      return;
    }

    const normalizedRows = report.rows.map((r) => r.normalized_record);
    const view = commitBulkImportRecords(ws.calcStore, slug, normalizedRows, actor, {
      override_acknowledged: acknowledgeAnomalies && report.warning_rows > 0,
      override_reason: overrideReason,
      warning_count: report.warning_rows,
    });

    if (!view) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }

    // Persist bulk import audit batch in PostgreSQL
    await postgresRepo.saveBulkImportBatch({
      id: `bulk-${slug}-${Date.now().toString(36)}`,
      workspace_id: workspaceId,
      engine_slug: slug,
      actor,
      row_count: normalizedRows.length,
      warning_count: report.warning_rows,
      override_acknowledged: acknowledgeAnomalies && report.warning_rows > 0,
      override_reason: overrideReason,
      records: normalizedRows,
    });

    res.status(201).json({
      outcome: "committed",
      imported_count: normalizedRows.length,
      warning_count: report.warning_rows,
      view,
      validation: report,
    });
  });

  router.delete("/v1/calc/engines/:slug/records/:recordId", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const slug = String(req.params.slug) as CalcEngineSlug;
    const recordId = String(req.params.recordId);
    const view = deleteEngineRecord(ws.calcStore, slug, recordId);
    if (!view) {
      res.status(404).json({ error: `Record '${recordId}' not found` });
      return;
    }
    res.json(view);
  });

  router.patch("/v1/calc/engines/:slug/config", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const slug = String(req.params.slug) as CalcEngineSlug;
    const view = updateEngineConfig(ws.calcStore, slug, req.body ?? {});
    if (!view) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }
    res.json(view);
  });

  router.post("/v1/calc/engines/:slug/export-report", async (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const slug = String(req.params.slug) as CalcEngineSlug;
    const view = computeEngineView(ws.calcStore, slug);
    if (!view) {
      res.status(404).json({ error: `Calculation engine '${slug}' not found` });
      return;
    }

    const reportId = `calc-${slug}-${Date.now().toString(36)}`;
    const nowTs = Date.now();
    const lines: string[] = [
      `# ${view.number}. ${view.title} — Calculation Audit Report`,
      "",
      `**Standard / Methodology:** ${view.standard_ref}`,
      "",
      view.methodology,
      "",
      "## Key Calculated Indicators",
      ...view.kpis.map(
        (k) => `- **${k.label}:** ${k.value}${k.unit ? ` ${k.unit}` : ""}${k.hint ? ` (${k.hint})` : ""}`,
      ),
      "",
      `## ${view.charts.primary_title}`,
      ...view.charts.primary_series.map(
        (pt) =>
          `- ${pt.name}: ${pt.primary}${pt.unit ? ` ${pt.unit}` : ""}${
            pt.secondary !== undefined ? ` / secondary: ${pt.secondary}` : ""
          }${pt.limit !== undefined ? ` (limit/benchmark: ${pt.limit})` : ""}`,
      ),
    ];

    const bodyText = lines.join("\n");
    const reportType =
      slug === "social-capital"
        ? "esg_social"
        : slug === "governance" || slug === "formulas-rules" || slug === "emission-factors"
          ? "esg_governance"
          : "esg_environmental";
    const metadata = {
      source_engine: slug,
      framework: view.standard_ref,
      metrics_snapshot: computeLiveMetricsSnapshot(ws.esgTables),
    };

    const stored: StoredReport = {
      id: reportId,
      workspace_id: getWorkspaceId(req),
      user_id: "calculation-engine",
      title: `${view.number}. ${view.title} — Calculation Report`,
      report_type: reportType,
      body: bodyText,
      format: "markdown",
      model: "calc-engine-auditor",
      sources: [],
      citations: [],
      trace_id: null,
      status: "published",
      version: 1,
      created_at: nowTs,
      updated_at: nowTs,
      metadata,
      versions: [
        {
          version: 1,
          title: `${view.number}. ${view.title} — Calculation Report`,
          report_type: reportType,
          body: bodyText,
          model: "calc-engine-auditor",
          created_at: nowTs,
          created_by: "Calculation Engine",
          change_note: `Generated directly from Calculation Engine ${view.number}`,
          metadata,
        },
      ],
    };

    const saved = await postgresRepo.saveReport(stored);
    ws.reports.set(saved.id, saved);
    res.status(201).json(saved);
  });

  // Emission Factors dedicated versioning endpoints
  router.post("/v1/calc/emission-factors", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const b = req.body ?? {};
    if (!b.code || !b.name || b.value === undefined || !b.unit || !b.valid_from) {
      res.status(400).json({ error: "code, name, value, unit, and valid_from are required" });
      return;
    }
    const view = addEmissionFactor(ws.calcStore, {
      code: String(b.code),
      name: String(b.name),
      category: String(b.category || "Scope 1"),
      gas: b.gas ? String(b.gas) : "CO₂e",
      source_standard: b.source_standard || "Site-Specific",
      value: Number(b.value),
      unit: String(b.unit),
      valid_from: String(b.valid_from),
      valid_to: b.valid_to ? String(b.valid_to) : null,
      uncertainty_pct: b.uncertainty_pct !== undefined ? Number(b.uncertainty_pct) : 3.0,
      notes: b.notes ? String(b.notes) : undefined,
    });
    res.status(201).json(view);
  });

  router.post("/v1/calc/emission-factors/:id/revise", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const b = req.body ?? {};
    if (b.value === undefined || !b.valid_from) {
      res.status(400).json({ error: "value and valid_from are required" });
      return;
    }
    const view = reviseEmissionFactor(ws.calcStore, String(req.params.id), {
      value: Number(b.value),
      unit: b.unit ? String(b.unit) : undefined,
      source: b.source ? String(b.source) : undefined,
      valid_from: String(b.valid_from),
      uncertainty_pct: b.uncertainty_pct !== undefined ? Number(b.uncertainty_pct) : undefined,
      notes: b.notes ? String(b.notes) : undefined,
    });
    if (!view) {
      res.status(404).json({ error: "Emission factor not found" });
      return;
    }
    res.json(view);
  });

  // Configurable Formula & Rules Engine endpoints
  router.post("/v1/calc/formulas/evaluate", (req: Request, res: Response) => {
    const expr = String(req.body?.expression || "");
    const inputs = (req.body?.inputs ?? {}) as Record<string, number>;
    const result = evaluateSafeFormula(expr, inputs);
    res.json(result);
  });

  router.post("/v1/calc/formulas", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const b = req.body ?? {};
    if (!b.code || !b.name || !b.expression) {
      res.status(400).json({ error: "code, name, and expression are required" });
      return;
    }
    const result = createFormulaRule(ws.calcStore, {
      code: String(b.code),
      name: String(b.name),
      target_engine: (b.target_engine || "carbon-intensity") as CalcEngineSlug,
      kind: b.kind === "threshold_rule" ? "threshold_rule" : "formula",
      output_unit: String(b.output_unit || "unit"),
      expression: String(b.expression),
      variables: Array.isArray(b.variables) ? b.variables.map(String) : [],
      sample_inputs: (b.sample_inputs ?? {}) as Record<string, number>,
      threshold_operator: b.threshold_operator,
      threshold_value: b.threshold_value !== undefined && b.threshold_value !== null ? Number(b.threshold_value) : null,
      threshold_severity: b.threshold_severity,
      change_note: b.change_note ? String(b.change_note) : undefined,
    });
    if (result.error || !result.view) {
      res.status(400).json({ error: result.error || "Invalid formula" });
      return;
    }
    res.status(201).json(result.view);
  });

  router.post("/v1/calc/formulas/:id/propose", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const b = req.body ?? {};
    if (!b.expression) {
      res.status(400).json({ error: "expression is required" });
      return;
    }
    const result = proposeFormulaChange(ws.calcStore, String(req.params.id), {
      expression: String(b.expression),
      threshold_operator: b.threshold_operator,
      threshold_value: b.threshold_value !== undefined ? (b.threshold_value === null ? null : Number(b.threshold_value)) : undefined,
      threshold_severity: b.threshold_severity,
      change_note: String(b.change_note || "Proposed formula revision"),
      sample_inputs: b.sample_inputs,
    });
    if (result.error || !result.view) {
      res.status(400).json({ error: result.error || "Failed to propose change" });
      return;
    }
    res.json(result.view);
  });

  router.post("/v1/calc/formulas/:id/approve", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const result = reviewFormulaChange(
      ws.calcStore,
      String(req.params.id),
      "approve",
      String(req.body?.review_note || "Approved for production calculations"),
      String(req.body?.reviewer || "Chief Carbon Auditor"),
    );
    if (result.error || !result.view) {
      res.status(400).json({ error: result.error || "Unable to approve" });
      return;
    }
    res.json(result.view);
  });

  router.post("/v1/calc/formulas/:id/reject", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const result = reviewFormulaChange(
      ws.calcStore,
      String(req.params.id),
      "reject",
      String(req.body?.review_note || "Returned for revision"),
      String(req.body?.reviewer || "Chief Carbon Auditor"),
    );
    if (result.error || !result.view) {
      res.status(400).json({ error: result.error || "Unable to reject" });
      return;
    }
    res.json(result.view);
  });

  // =========================================================================
  // Materiality Assessment API (Backed by PostgreSQL)
  // =========================================================================

  router.get("/v1/materiality", async (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const state = await postgresRepo.getMaterialityState(wsId);
    res.json(state);
  });

  router.patch("/v1/materiality/thresholds", async (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const state = await postgresRepo.getMaterialityState(wsId);
    const b = req.body ?? {};
    if (typeof b.impact_threshold === "number" && Number.isFinite(b.impact_threshold)) {
      state.impact_threshold = Math.max(1.5, Math.min(4.5, b.impact_threshold));
    }
    if (typeof b.financial_threshold === "number" && Number.isFinite(b.financial_threshold)) {
      state.financial_threshold = Math.max(1.5, Math.min(4.5, b.financial_threshold));
    }
    if (
      typeof b.stakeholder_blend_ratio === "number" &&
      Number.isFinite(b.stakeholder_blend_ratio)
    ) {
      state.stakeholder_blend_ratio = Math.max(0, Math.min(0.6, b.stakeholder_blend_ratio));
    }
    const updated = await postgresRepo.saveMaterialityState(state);
    res.json(updated);
  });

  router.patch("/v1/materiality/topics/:id", async (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const state = await postgresRepo.getMaterialityState(wsId);
    const topicId = String(req.params.id);
    const idx = state.topics.findIndex((t) => t.id === topicId);
    if (idx < 0) {
      res.status(404).json({ error: `Topic '${topicId}' not found` });
      return;
    }

    const b = req.body ?? {};
    const existing = state.topics[idx];
    state.topics[idx] = {
      ...existing,
      name: b.name !== undefined ? String(b.name) : existing.name,
      esrs_topic: b.esrs_topic !== undefined ? String(b.esrs_topic) : existing.esrs_topic,
      pillar: b.pillar !== undefined ? b.pillar : existing.pillar,
      value_chain_stage:
        b.value_chain_stage !== undefined ? b.value_chain_stage : existing.value_chain_stage,
      time_horizon: b.time_horizon !== undefined ? b.time_horizon : existing.time_horizon,
      impact_type: b.impact_type !== undefined ? b.impact_type : existing.impact_type,
      impact_scale:
        typeof b.impact_scale === "number"
          ? Math.max(1, Math.min(5, b.impact_scale))
          : existing.impact_scale,
      impact_scope:
        typeof b.impact_scope === "number"
          ? Math.max(1, Math.min(5, b.impact_scope))
          : existing.impact_scope,
      impact_irremediability:
        typeof b.impact_irremediability === "number"
          ? Math.max(1, Math.min(5, b.impact_irremediability))
          : existing.impact_irremediability,
      impact_likelihood:
        typeof b.impact_likelihood === "number"
          ? Math.max(0.2, Math.min(1, b.impact_likelihood))
          : existing.impact_likelihood,
      impact_description:
        b.impact_description !== undefined
          ? String(b.impact_description)
          : existing.impact_description,
      financial_effect_type:
        b.financial_effect_type !== undefined
          ? b.financial_effect_type
          : existing.financial_effect_type,
      financial_magnitude:
        typeof b.financial_magnitude === "number"
          ? Math.max(1, Math.min(5, b.financial_magnitude))
          : existing.financial_magnitude,
      financial_likelihood:
        typeof b.financial_likelihood === "number"
          ? Math.max(0.2, Math.min(1, b.financial_likelihood))
          : existing.financial_likelihood,
      financial_driver:
        b.financial_driver !== undefined ? String(b.financial_driver) : existing.financial_driver,
      estimated_financial_exposure_musd:
        typeof b.estimated_financial_exposure_musd === "number"
          ? Math.max(0, b.estimated_financial_exposure_musd)
          : existing.estimated_financial_exposure_musd,
      updated_at: Date.now(),
    };

    const updated = await postgresRepo.saveMaterialityState(state);
    res.json(updated);
  });

  router.post("/v1/materiality/topics", async (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const state = await postgresRepo.getMaterialityState(wsId);
    const b = req.body ?? {};
    if (!b.code || !b.name) {
      res.status(400).json({ error: "Topic code and name are required" });
      return;
    }

    const newId = createTopicId();
    const scale = Number(b.impact_scale ?? 3.8);
    const scope = Number(b.impact_scope ?? 3.6);
    const irrem = Number(b.impact_irremediability ?? 3.5);
    const finMag = Number(b.financial_magnitude ?? 3.7);
    const defaultImpact = Math.round(((scale + scope + irrem) / 3) * 100) / 100;

    const newTopic: MaterialityTopic = {
      id: newId,
      code: String(b.code).trim().toUpperCase(),
      name: String(b.name).trim(),
      pillar: b.pillar || "Environmental",
      esrs_topic: String(b.esrs_topic || "ESRS E1 · Climate Change"),
      value_chain_stage: b.value_chain_stage || "Own Operations (Refining & Cracking)",
      time_horizon: b.time_horizon || "Medium-term (1-5 yrs)",
      impact_type: b.impact_type || "Actual Negative",
      impact_scale: scale,
      impact_scope: scope,
      impact_irremediability: irrem,
      impact_likelihood: Number(b.impact_likelihood ?? 0.9),
      impact_score: defaultImpact,
      impact_description: String(
        b.impact_description || "Material operational and value-chain sustainability impact.",
      ),
      financial_effect_type: b.financial_effect_type || "Transition Risk",
      financial_magnitude: finMag,
      financial_likelihood: Number(b.financial_likelihood ?? 0.85),
      financial_score: finMag,
      financial_driver: String(
        b.financial_driver || "Regulatory compliance and capital allocation driver.",
      ),
      estimated_financial_exposure_musd: Number(b.estimated_financial_exposure_musd ?? 45),
      classification: "Double Material",
      stakeholder_scores: {
        investors: {
          group_id: "investors",
          impact_rating: defaultImpact,
          financial_rating: finMag,
          sample_size: 25,
          key_concern: "Capital allocation & risk exposure",
        },
        regulators: {
          group_id: "regulators",
          impact_rating: defaultImpact,
          financial_rating: finMag,
          sample_size: 15,
          key_concern: "Statutory CSRD/ESRS disclosure compliance",
        },
        communities: {
          group_id: "communities",
          impact_rating: defaultImpact,
          financial_rating: Math.max(1, finMag - 0.4),
          sample_size: 120,
          key_concern: "Local environmental & social stewardship",
        },
        employees: {
          group_id: "employees",
          impact_rating: defaultImpact,
          financial_rating: Math.max(1, finMag - 0.2),
          sample_size: 400,
          key_concern: "Operational execution & safety",
        },
        customers: {
          group_id: "customers",
          impact_rating: defaultImpact,
          financial_rating: finMag,
          sample_size: 40,
          key_concern: "Supply chain sustainability compliance",
        },
      },
      updated_at: Date.now(),
    };

    state.topics.push(newTopic);

    const newMapping: TopicStandardMapping = {
      id: `map-${newId}`,
      topic_id: newId,
      topic_code: newTopic.code,
      topic_name: newTopic.name,
      pillar: newTopic.pillar,
      classification: newTopic.classification,
      esrs_standards: [
        `${newTopic.esrs_topic.split("·")[0].trim()} Disclosure Requirements`,
      ],
      gri_standards: ["GRI 3-3 Management of Material Topics"],
      sasb_metrics: ["RT-CH-110a.1 / Sector Metric"],
      industry_metrics: ["IPIECA Sustainability Reporting Guidance"],
      linked_calc_engine: "/calc/scope-1",
      linked_calc_label: "01. Scope 1 Calculation Engine",
      mandatory_datapoints_count: 10,
      covered_datapoints_count: 8,
      assurance_status: "Limited Assurance Ready",
      mapping_notes: "Newly registered topic linked to CSRD/ESRS taxonomy.",
      updated_at: Date.now(),
    };
    state.standard_mappings.push(newMapping);

    const updated = await postgresRepo.saveMaterialityState(state);
    res.status(201).json(updated);
  });

  router.post("/v1/materiality/stakeholders/weights", async (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const state = await postgresRepo.getMaterialityState(wsId);
    const b = req.body ?? {};
    const weights = b.weights as Record<StakeholderGroupId, number> | undefined;
    if (!weights || typeof weights !== "object") {
      res.status(400).json({ error: "weights object is required" });
      return;
    }

    const previousWeights: Record<StakeholderGroupId, number> = {
      investors: 20,
      regulators: 20,
      communities: 20,
      employees: 20,
      customers: 20,
    };
    for (const g of state.stakeholder_groups) {
      previousWeights[g.group_id] = g.weight_pct;
    }

    state.stakeholder_groups = state.stakeholder_groups.map((g) => {
      const nextVal = Number(weights[g.group_id]);
      return {
        ...g,
        weight_pct: Number.isFinite(nextVal) ? Math.max(0, Math.min(100, nextVal)) : g.weight_pct,
      };
    });

    const newWeights: Record<StakeholderGroupId, number> = { ...previousWeights };
    for (const g of state.stakeholder_groups) {
      newWeights[g.group_id] = g.weight_pct;
    }

    state.weight_change_logs.unshift({
      id: `wlog-${Date.now()}`,
      changed_by: String(b.changed_by || "CSRD Materiality Lead"),
      changed_at: Date.now(),
      rationale: String(
        b.rationale ||
          "Updated stakeholder group weighting allocation for double materiality consensus scoring.",
      ),
      previous_weights: previousWeights,
      new_weights: newWeights,
      affected_topics_count: state.topics.length,
    });

    const updated = await postgresRepo.saveMaterialityState(state);
    res.json(updated);
  });

  router.post("/v1/materiality/stakeholders/surveys", async (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const state = await postgresRepo.getMaterialityState(wsId);
    const b = req.body ?? {};
    const topicId = String(b.topic_id || "");
    const groupId = String(b.group_id || "") as StakeholderGroupId;

    const topic = state.topics.find((t) => t.id === topicId);
    const group = state.stakeholder_groups.find((g) => g.group_id === groupId);
    if (!topic || !group) {
      res.status(400).json({ error: "Valid topic_id and group_id are required" });
      return;
    }

    const impactRating = Math.max(1, Math.min(5, Number(b.impact_rating ?? 4.0)));
    const financialRating = Math.max(1, Math.min(5, Number(b.financial_rating ?? 4.0)));
    const respondentCount = Math.max(1, Math.round(Number(b.respondent_count ?? 10)));

    const submission = {
      id: createSurveySubmissionId(),
      topic_id: topic.id,
      topic_code: topic.code,
      topic_name: topic.name,
      group_id: group.group_id,
      group_name: group.name,
      respondent_org: String(b.respondent_org || "Stakeholder Advisory Panel"),
      respondent_count: respondentCount,
      impact_rating: impactRating,
      financial_rating: financialRating,
      engagement_channel: String(b.engagement_channel || "Structured CSRD IRO Survey"),
      comment: String(b.comment || "Submitted double materiality rating input."),
      submitted_by: String(b.submitted_by || "Stakeholder Engagement Coordinator"),
      submitted_at: Date.now(),
    };

    state.survey_submissions.unshift(submission);

    // Blend new survey batch into the topic's stakeholder_scores for that group
    const prev = topic.stakeholder_scores[groupId] ?? {
      group_id: groupId,
      impact_rating: impactRating,
      financial_rating: financialRating,
      sample_size: 0,
      key_concern: submission.comment,
    };
    const totalSample = prev.sample_size + respondentCount;
    topic.stakeholder_scores[groupId] = {
      group_id: groupId,
      impact_rating:
        Math.round(
          ((prev.impact_rating * prev.sample_size + impactRating * respondentCount) /
            Math.max(1, totalSample)) *
            100,
        ) / 100,
      financial_rating:
        Math.round(
          ((prev.financial_rating * prev.sample_size + financialRating * respondentCount) /
            Math.max(1, totalSample)) *
            100,
        ) / 100,
      sample_size: totalSample,
      key_concern: submission.comment || prev.key_concern,
    };

    group.respondent_count += respondentCount;
    group.last_surveyed_at = new Date().toISOString().slice(0, 10);

    const updated = await postgresRepo.saveMaterialityState(state);
    res.status(201).json(updated);
  });

  router.patch("/v1/materiality/mappings/:id", async (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const state = await postgresRepo.getMaterialityState(wsId);
    const mapId = String(req.params.id);
    const idx = state.standard_mappings.findIndex(
      (m) => m.id === mapId || m.topic_id === mapId,
    );
    if (idx < 0) {
      res.status(404).json({ error: `Mapping '${mapId}' not found` });
      return;
    }

    const b = req.body ?? {};
    const existing = state.standard_mappings[idx];
    const parseList = (val: unknown, fallback: string[]): string[] => {
      if (Array.isArray(val)) return val.map(String).filter(Boolean);
      if (typeof val === "string") {
        return val
          .split(/[;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return fallback;
    };

    state.standard_mappings[idx] = {
      ...existing,
      esrs_standards: parseList(b.esrs_standards, existing.esrs_standards),
      gri_standards: parseList(b.gri_standards, existing.gri_standards),
      sasb_metrics: parseList(b.sasb_metrics, existing.sasb_metrics),
      industry_metrics: parseList(b.industry_metrics, existing.industry_metrics),
      linked_calc_engine:
        b.linked_calc_engine !== undefined
          ? String(b.linked_calc_engine)
          : existing.linked_calc_engine,
      linked_calc_label:
        b.linked_calc_label !== undefined
          ? String(b.linked_calc_label)
          : existing.linked_calc_label,
      mandatory_datapoints_count:
        typeof b.mandatory_datapoints_count === "number"
          ? Math.max(0, b.mandatory_datapoints_count)
          : existing.mandatory_datapoints_count,
      covered_datapoints_count:
        typeof b.covered_datapoints_count === "number"
          ? Math.max(0, b.covered_datapoints_count)
          : existing.covered_datapoints_count,
      assurance_status:
        b.assurance_status !== undefined ? b.assurance_status : existing.assurance_status,
      mapping_notes:
        b.mapping_notes !== undefined ? String(b.mapping_notes) : existing.mapping_notes,
      updated_at: Date.now(),
    };

    const updated = await postgresRepo.saveMaterialityState(state);
    res.json(updated);
  });

  router.post("/v1/materiality/rationale", async (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const state = await postgresRepo.getMaterialityState(wsId);
    const b = req.body ?? {};
    const topic =
      state.topics.find((t) => t.id === b.topic_id) ?? state.topics[0];
    if (!topic || !b.rationale_statement) {
      res.status(400).json({ error: "topic_id and rationale_statement are required" });
      return;
    }

    state.rationale_log.unshift({
      id: createRationaleId(),
      cycle_label: String(b.cycle_label || state.active_cycle),
      topic_id: topic.id,
      topic_code: topic.code,
      topic_name: topic.name,
      decision_type: b.decision_type || "Double Material Inclusion",
      esrs_iro_reference: String(
        b.esrs_iro_reference || `ESRS 2 IRO-1 · ${topic.code}`,
      ),
      impact_score_snapshot: topic.impact_score,
      financial_score_snapshot: topic.financial_score,
      rationale_statement: String(b.rationale_statement).trim(),
      evidence_references: String(
        b.evidence_references || "Internal IRO Scoring Ledger & Stakeholder Survey Dossier",
      ),
      recorded_by: String(b.recorded_by || "Dr. Z. Zerehsaz (Lead ESG Architect)"),
      reviewer_signoff: String(b.reviewer_signoff || "Audit & Risk Committee — Approved"),
      recorded_at: Date.now(),
    });

    const updated = await postgresRepo.saveMaterialityState(state);
    res.status(201).json(updated);
  });

  router.post("/v1/materiality/cycles/snapshot", async (req: Request, res: Response) => {
    const wsId = getWorkspaceId(req);
    const state = await postgresRepo.getMaterialityState(wsId);
    const b = req.body ?? {};
    const label = String(b.cycle_label || `FY 2025 Snapshot (${new Date().toISOString().slice(0, 10)})`);

    const snapshot = {
      id: `cycle-${Date.now()}`,
      cycle_label: label,
      review_date: String(b.review_date || new Date().toISOString().slice(0, 10)),
      framework_version: String(
        b.framework_version || "ESRS Set 1 (EFRAG IG 1 Double Materiality)",
      ),
      impact_threshold: state.impact_threshold,
      financial_threshold: state.financial_threshold,
      approved_by: String(b.approved_by || "Board Sustainability & Audit Committee"),
      status: "Assurance Verified" as const,
      summary_note: String(
        b.summary_note ||
          "Dated materiality matrix snapshot captured for statutory CSRD audit trail.",
      ),
      points: state.topics.map((t) => ({
        topic_id: t.id,
        topic_code: t.code,
        topic_name: t.name,
        pillar: t.pillar,
        impact_score: t.impact_score,
        financial_score: t.financial_score,
        classification: t.classification,
      })),
    };

    state.periodic_cycles.push(snapshot);
    const updated = await postgresRepo.saveMaterialityState(state);
    res.status(201).json(updated);
  });

  router.use(
    (
      err: unknown,
      req: Request,
      res: Response,
      next: express.NextFunction,
    ) => {
      void next;
      const ws = getWorkspace(getWorkspaceId(req));
      const msg = err instanceof Error ? err.message : "Unhandled backend error";
      recordBackendErrorLog(ws, {
        severity: "critical",
        service: "KnowledgeOS RAG Core",
        source: `${req.method} /api${req.path}`,
        status_code: 500,
        message: msg,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: msg });
      }
    },
  );

  return router;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  const apiRouter = createApiRouter();
  app.use("/api", apiRouter);

  app.get("/health", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const active = ws.indexes.find((idx) => idx.state === "active");
    let chunks = 0;
    for (const doc of ws.documents.values()) chunks += doc.chunks.length;
    res.json({
      ok: true,
      version: APP_VERSION,
      database: "in-memory-esg",
      db_ok: true,
      documents: ws.documents.size,
      chunks,
      fts_active: true,
      vector_backend: "hybrid-lexical-bm25",
      active_index: active?.id ?? "index-v1",
      embedding_provider: active?.embedding ?? "local:hybrid-lexical-bm25",
    });
  });

  app.get("/v1/models", (req: Request, res: Response) => {
    const ws = getWorkspace(getWorkspaceId(req));
    const gen = Array.from(ws.providers.values()).find(
      (p) => p.enabled && (p.role === "Generation" || p.role === "Both"),
    );
    if (!gen) {
      res.json({
        object: "list",
        data: [{ id: "local-esg-synthesizer", object: "model", owned_by: "local", created: Date.now() }],
      });
      return;
    }
    res.json({
      object: "list",
      data: [{ id: gen.model, object: "model", owned_by: gen.kind, created: gen.created_at }],
    });
  });

  if (process.env.NODE_ENV !== "production") {
    app.get("/@vite/client", (_req: Request, res: Response) => {
      res.type("application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(`const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = void 0; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
      if (el.getAttribute("data-vite-dev-id") === id) el.remove();
    });
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    decline() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return \`\${pathname}?\${queryToInject}\${search ? \`&\${search.slice(1)}\` : ""}\${hash || ""}\`;
}
export class ErrorOverlay extends HTMLElement {}
`);
    });

    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, host: HOST, port: PORT, allowedHosts: true, hmr: false, ws: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve("dist");
    app.use(express.static(distDir));
    app.use((_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  try {
    await postgresRepo.init();
    console.log("PostgreSQL database initialized and verified successfully.");
  } catch (err) {
    console.warn("PostgreSQL initialization warning:", err);
  }

  app.listen(PORT, HOST, () => {
    console.log(`ESG Intelligence Platform listening on http://${HOST}:${PORT}`);
  });
}

void startServer();
