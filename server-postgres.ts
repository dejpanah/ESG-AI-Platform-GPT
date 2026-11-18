import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import {
  createInitialMaterialityState,
  recomputeMaterialityState,
  type MaterialityWorkspaceState,
} from "./server-materiality";

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
  metadata?: Record<string, unknown>;
}

export interface StoredReport {
  id: string;
  workspace_id: string;
  user_id?: string | null;
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

export interface PostgresHealthInfo {
  status: "operational" | "degraded" | "offline";
  engine: string;
  version: string;
  mode: "embedded" | "remote";
  reports_count: number;
  latency_ms: number;
}

interface RawReportRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  title: string;
  report_type: string;
  body: string;
  format: string;
  model: string | null;
  status: string;
  version: number;
  sources: unknown;
  citations: unknown;
  trace_id: string | null;
  metadata: unknown;
  versions: unknown;
  created_at: string | Date;
  updated_at: string | Date;
}

class PostgresReportRepository {
  private pgliteClient: PGlite | null = null;
  private pgPool: pg.Pool | null = null;
  private isRemote = false;
  private initialized = false;

  private async getClient() {
    if (!this.initialized) {
      await this.init();
    }
    return {
      query: async (sqlText: string, params: unknown[] = []) => {
        if (this.isRemote && this.pgPool) {
          return this.pgPool.query(sqlText, params);
        }
        if (this.pgliteClient) {
          return this.pgliteClient.query(sqlText, params);
        }
        throw new Error("PostgreSQL client not initialized");
      },
    };
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const remoteUrl =
      process.env.DATABASE_URL ||
      (process.env.PGHOST &&
        `postgres://${process.env.PGUSER || "postgres"}:${process.env.PGPASSWORD || ""}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || "postgres"}`);

    if (remoteUrl) {
      try {
        const pool = new pg.Pool({
          connectionString: remoteUrl,
          connectionTimeoutMillis: 5000,
        });
        await pool.query("SELECT 1;");
        this.pgPool = pool;
        this.isRemote = true;
        console.log("Connected to external PostgreSQL database.");
      } catch (err) {
        console.warn("External PostgreSQL connection failed, falling back to embedded PostgreSQL:", err);
        this.isRemote = false;
      }
    }

    if (!this.isRemote) {
      const dbDir = path.resolve(process.cwd(), "data", "postgres");
      fs.mkdirSync(dbDir, { recursive: true });
      this.pgliteClient = new PGlite(dbDir);
      console.log(`Initialized embedded PostgreSQL database at ${dbDir}.`);
    }

    const createTableSql = `
      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(128) PRIMARY KEY,
        workspace_id VARCHAR(128) NOT NULL,
        user_id VARCHAR(128),
        title TEXT NOT NULL,
        report_type VARCHAR(64) NOT NULL,
        body TEXT NOT NULL,
        format VARCHAR(32) NOT NULL DEFAULT 'markdown',
        model VARCHAR(128),
        status VARCHAR(32) NOT NULL DEFAULT 'completed',
        version INTEGER NOT NULL DEFAULT 1,
        sources JSONB NOT NULL DEFAULT '[]',
        citations JSONB NOT NULL DEFAULT '[]',
        trace_id VARCHAR(128),
        metadata JSONB NOT NULL DEFAULT '{}',
        versions JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_reports_workspace_updated ON reports(workspace_id, updated_at DESC);
    `;

    const createBulkTableSql = `
      CREATE TABLE IF NOT EXISTS calc_bulk_imports (
        id VARCHAR(128) PRIMARY KEY,
        workspace_id VARCHAR(128) NOT NULL,
        engine_slug VARCHAR(64) NOT NULL,
        actor VARCHAR(128) NOT NULL,
        row_count INTEGER NOT NULL,
        warning_count INTEGER NOT NULL DEFAULT 0,
        override_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
        override_reason TEXT,
        records JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    const createMaterialityTableSql = `
      CREATE TABLE IF NOT EXISTS materiality_workspaces (
        workspace_id VARCHAR(128) PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    if (this.isRemote && this.pgPool) {
      await this.pgPool.query(createTableSql);
      await this.pgPool.query(createIndexSql);
      await this.pgPool.query(createBulkTableSql);
      await this.pgPool.query(createMaterialityTableSql);
    } else if (this.pgliteClient) {
      await this.pgliteClient.exec(createTableSql);
      await this.pgliteClient.exec(createIndexSql);
      await this.pgliteClient.exec(createBulkTableSql);
      await this.pgliteClient.exec(createMaterialityTableSql);
    }

    this.initialized = true;
  }

  private rowToReport(row: RawReportRow): StoredReport {
    const parseJson = (val: unknown, fallback: unknown) => {
      if (!val) return fallback;
      if (typeof val === "object") return val;
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return fallback;
        }
      }
      return fallback;
    };

    const toMs = (val: string | Date | number | undefined, fallback: number) => {
      if (!val) return fallback;
      if (val instanceof Date) return val.getTime();
      if (typeof val === "number") return val;
      const parsed = new Date(val).getTime();
      return Number.isNaN(parsed) ? fallback : parsed;
    };

    const now = Date.now();
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      user_id: row.user_id || null,
      title: row.title,
      report_type: row.report_type,
      body: row.body,
      format: row.format || "markdown",
      model: row.model || "local-esg-synthesizer",
      sources: parseJson(row.sources, []) as StoredReport["sources"],
      citations: parseJson(row.citations, []) as StoredReport["citations"],
      trace_id: row.trace_id,
      status: row.status || "completed",
      version: row.version || 1,
      created_at: toMs(row.created_at, now),
      updated_at: toMs(row.updated_at, now),
      metadata: parseJson(row.metadata, {}) as Record<string, unknown>,
      versions: parseJson(row.versions, []) as ReportVersionEntry[],
    };
  }

  async listReports(workspaceId: string, reportType?: string): Promise<StoredReport[]> {
    const client = await this.getClient();
    let query = `
      SELECT * FROM reports 
      WHERE workspace_id = $1
    `;
    const params: unknown[] = [workspaceId];
    if (reportType) {
      query += ` AND report_type = $2`;
      params.push(reportType);
    }
    query += ` ORDER BY updated_at DESC;`;

    const res = await client.query(query, params);
    return (res.rows as RawReportRow[]).map((r) => this.rowToReport(r));
  }

  async getReportById(id: string, workspaceId?: string): Promise<StoredReport | null> {
    const client = await this.getClient();
    let query = `SELECT * FROM reports WHERE id = $1`;
    const params: unknown[] = [id];
    if (workspaceId) {
      query += ` AND workspace_id = $2`;
      params.push(workspaceId);
    }
    query += ` LIMIT 1;`;

    const res = await client.query(query, params);
    if (res.rows.length === 0) return null;
    return this.rowToReport(res.rows[0] as RawReportRow);
  }

  async saveReport(report: StoredReport): Promise<StoredReport> {
    const client = await this.getClient();
    const createdDate = new Date(report.created_at || Date.now()).toISOString();
    const updatedDate = new Date(report.updated_at || Date.now()).toISOString();

    const upsertSql = `
      INSERT INTO reports (
        id, workspace_id, user_id, title, report_type, body,
        format, model, status, version, sources, citations,
        trace_id, metadata, versions, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11::jsonb, $12::jsonb,
        $13, $14::jsonb, $15::jsonb, $16::timestamptz, $17::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        report_type = EXCLUDED.report_type,
        body = EXCLUDED.body,
        format = EXCLUDED.format,
        model = EXCLUDED.model,
        status = EXCLUDED.status,
        version = EXCLUDED.version,
        sources = EXCLUDED.sources,
        citations = EXCLUDED.citations,
        trace_id = EXCLUDED.trace_id,
        metadata = EXCLUDED.metadata,
        versions = EXCLUDED.versions,
        updated_at = EXCLUDED.updated_at
      RETURNING *;
    `;

    const params = [
      report.id,
      report.workspace_id,
      report.user_id || null,
      report.title,
      report.report_type,
      report.body,
      report.format || "markdown",
      report.model || "local-esg-synthesizer",
      report.status || "completed",
      report.version || 1,
      JSON.stringify(report.sources || []),
      JSON.stringify(report.citations || []),
      report.trace_id || null,
      JSON.stringify(report.metadata || {}),
      JSON.stringify(report.versions || []),
      createdDate,
      updatedDate,
    ];

    const res = await client.query(upsertSql, params);
    return this.rowToReport(res.rows[0] as RawReportRow);
  }

  async saveBulkImportBatch(batch: {
    id: string;
    workspace_id: string;
    engine_slug: string;
    actor: string;
    row_count: number;
    warning_count: number;
    override_acknowledged: boolean;
    override_reason?: string;
    records: unknown[];
  }): Promise<void> {
    try {
      const client = await this.getClient();
      await client.query(
        `
        INSERT INTO calc_bulk_imports (
          id, workspace_id, engine_slug, actor, row_count,
          warning_count, override_acknowledged, override_reason, records
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        ON CONFLICT (id) DO NOTHING;
        `,
        [
          batch.id,
          batch.workspace_id,
          batch.engine_slug,
          batch.actor,
          batch.row_count,
          batch.warning_count,
          batch.override_acknowledged,
          batch.override_reason || null,
          JSON.stringify(batch.records || []),
        ],
      );
    } catch (err) {
      console.warn("Failed to persist bulk import batch in PostgreSQL:", err);
    }
  }

  async getMaterialityState(
    workspaceId: string,
  ): Promise<MaterialityWorkspaceState> {
    try {
      const client = await this.getClient();
      const res = await client.query(
        `SELECT payload FROM materiality_workspaces WHERE workspace_id = $1 LIMIT 1;`,
        [workspaceId],
      );
      if (res.rows.length > 0) {
        const raw = (res.rows[0] as { payload: unknown }).payload;
        const parsed =
          typeof raw === "string"
            ? (JSON.parse(raw) as MaterialityWorkspaceState)
            : (raw as MaterialityWorkspaceState);
        if (parsed && Array.isArray(parsed.topics)) {
          return recomputeMaterialityState(parsed);
        }
      }
      const seeded = createInitialMaterialityState(workspaceId);
      await this.saveMaterialityState(seeded);
      return seeded;
    } catch (err) {
      console.warn("Failed to load materiality state from PostgreSQL:", err);
      return createInitialMaterialityState(workspaceId);
    }
  }

  async saveMaterialityState(
    state: MaterialityWorkspaceState,
  ): Promise<MaterialityWorkspaceState> {
    const recomputed = recomputeMaterialityState(state);
    try {
      const client = await this.getClient();
      await client.query(
        `
        INSERT INTO materiality_workspaces (workspace_id, payload, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (workspace_id) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = NOW();
        `,
        [recomputed.workspace_id || "default", JSON.stringify(recomputed)],
      );
    } catch (err) {
      console.warn("Failed to save materiality state to PostgreSQL:", err);
    }
    return recomputed;
  }

  async checkHealth(): Promise<PostgresHealthInfo> {
    const start = Date.now();
    try {
      const client = await this.getClient();
      const verRes = await client.query("SELECT version();");
      const countRes = await client.query("SELECT count(*) as count FROM reports;");
      const duration = Date.now() - start;
      const count = Number((countRes.rows[0] as { count: number | string })?.count || 0);
      const versionStr = String((verRes.rows[0] as { version?: string })?.version || "PostgreSQL 16");

      return {
        status: "operational",
        engine: "PostgreSQL",
        version: versionStr.split(" ")[1] || "16.x",
        mode: this.isRemote ? "remote" : "embedded",
        reports_count: count,
        latency_ms: duration,
      };
    } catch {
      return {
        status: "degraded",
        engine: "PostgreSQL",
        version: "unknown",
        mode: this.isRemote ? "remote" : "embedded",
        reports_count: 0,
        latency_ms: Date.now() - start,
      };
    }
  }
}

export const postgresRepo = new PostgresReportRepository();
