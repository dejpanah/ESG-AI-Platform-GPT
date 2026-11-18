"""PostgreSQL adapter: relational metadata + optional pgvector + report archive.

When VECTOR_BACKEND=postgres this class also acts as VectorStore using pgvector.
When only used for metadata/reports, vector methods are no-ops or raise.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Sequence

from app.core.config import SETTINGS
from app.storage.interfaces import (
    ChunkRecord,
    ConversationMessage,
    DocumentRecord,
    GeneratedReport,
    MetadataStore,
    ReportStore,
    SearchHit,
    VectorStore,
)

logger = logging.getLogger(__name__)


def _now_ms() -> int:
    return int(time.time() * 1000)


POSTGRES_SCHEMA = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  extension TEXT NOT NULL,
  language TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  indexed_at BIGINT,
  version INTEGER NOT NULL DEFAULT 0,
  parser TEXT,
  chunker TEXT,
  embedding TEXT,
  error TEXT,
  progress REAL,
  stage TEXT,
  deleted_at BIGINT,
  UNIQUE(workspace_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  current INTEGER NOT NULL DEFAULT 1,
  chunks INTEGER NOT NULL DEFAULT 0,
  reused INTEGER NOT NULL DEFAULT 0,
  newly_embedded INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  UNIQUE(document_id, version)
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  line_start INTEGER NOT NULL DEFAULT 0,
  line_end INTEGER NOT NULL DEFAULT 0,
  section TEXT,
  symbol TEXT,
  tokens INTEGER NOT NULL DEFAULT 0,
  superseded BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  UNIQUE(document_id, version, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_chunks_workspace_doc ON chunks(workspace_id, document_id);

-- pgvector column is added dynamically once we know dimension
-- We keep a separate embeddings table so dimension changes are manageable.
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  index_id TEXT,
  model TEXT,
  embedding vector,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_workspace ON chunk_embeddings(workspace_id);

CREATE TABLE IF NOT EXISTS generated_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL,
  body TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  model TEXT,
  sources JSONB DEFAULT '[]',
  citations JSONB DEFAULT '[]',
  trace_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  version INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_reports_workspace ON generated_reports(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS report_sources (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES generated_reports(id) ON DELETE CASCADE,
  document_id TEXT,
  chunk_id TEXT,
  citation_text TEXT,
  ordinal INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  model TEXT,
  citations JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_conv_messages ON conversation_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS query_traces (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  workspace_id TEXT NOT NULL,
  route TEXT,
  query_text TEXT,
  payload JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traces_workspace ON query_traces(workspace_id, created_at DESC);

-- Full-text search support
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS text_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON chunks USING GIN (text_tsv);
"""


class PostgresPool:
    """Minimal async-friendly pool using psycopg (sync) + thread offload if needed."""

    def __init__(self, dsn: str) -> None:
        self.dsn = dsn
        self._pool = None

    def _ensure(self):
        if self._pool is not None:
            return
        try:
            from psycopg_pool import ConnectionPool
        except ImportError:
            # Fallback to single connections
            self._pool = "simple"
            return
        self._pool = ConnectionPool(self.dsn, min_size=1, max_size=10, open=True)

    def connection(self):
        self._ensure()
        if self._pool == "simple":
            import psycopg
            return psycopg.connect(self.dsn)
        return self._pool.connection()

    def execute(self, sql: str, params: tuple | list | None = None):
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                conn.commit()
                try:
                    return cur.fetchall()
                except Exception:
                    return []

    def execute_one(self, sql: str, params: tuple | list | None = None):
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                conn.commit()
                return cur.fetchone()

    def executemany(self, sql: str, seq: list):
        with self.connection() as conn:
            with conn.cursor() as cur:
                cur.executemany(sql, seq)
                conn.commit()

    def close(self) -> None:
        if self._pool and self._pool != "simple":
            self._pool.close()


class PostgresMetadataStore(MetadataStore):
    def __init__(self, dsn: str | None = None) -> None:
        self.dsn = dsn or SETTINGS.postgres_url
        if not self.dsn:
            raise ValueError("KNOWLEDGEOS_POSTGRES_URL is required for PostgresMetadataStore")
        self.pool = PostgresPool(self.dsn)

    async def init_schema(self) -> None:
        # Run schema statements one by one (some may already exist)
        statements = [s.strip() for s in POSTGRES_SCHEMA.split(";") if s.strip()]
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                for stmt in statements:
                    try:
                        cur.execute(stmt)
                    except Exception as exc:
                        # Ignore "already exists" style errors
                        if "already exists" not in str(exc).lower() and "duplicate" not in str(exc).lower():
                            logger.warning("Schema statement warning: %s — %s", stmt[:80], exc)
                conn.commit()
        logger.info("PostgreSQL metadata schema ready")

    async def upsert_document(self, doc: DocumentRecord) -> None:
        self.pool.execute(
            """
            INSERT INTO documents (
              id, workspace_id, filename, path, storage_path, extension, language,
              size_bytes, content_hash, status, updated_at, indexed_at, version,
              parser, chunker, embedding, error, progress, stage, deleted_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
              filename=EXCLUDED.filename, status=EXCLUDED.status, updated_at=EXCLUDED.updated_at,
              indexed_at=EXCLUDED.indexed_at, version=EXCLUDED.version, error=EXCLUDED.error,
              progress=EXCLUDED.progress, stage=EXCLUDED.stage, deleted_at=EXCLUDED.deleted_at
            """,
            (
                doc.id, doc.workspace_id, doc.filename, doc.path, doc.storage_path,
                doc.extension, doc.language, doc.size_bytes, doc.content_hash, doc.status,
                doc.updated_at, doc.indexed_at, doc.version, doc.parser, doc.chunker,
                doc.embedding, doc.error, doc.progress, doc.stage, doc.deleted_at,
            ),
        )

    async def get_document(self, workspace_id: str, document_id: str) -> DocumentRecord | None:
        row = self.pool.execute_one(
            """
            SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id=d.id AND c.superseded=0) AS chunks
            FROM documents d WHERE d.workspace_id=%s AND d.id=%s AND d.deleted_at IS NULL
            """,
            (workspace_id, document_id),
        )
        if not row:
            return None
        return self._row_to_doc(row)

    async def list_documents(self, workspace_id: str, include_deleted: bool = False) -> list[DocumentRecord]:
        sql = """
          SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id=d.id AND c.superseded=0) AS chunks
          FROM documents d WHERE d.workspace_id=%s
        """
        if not include_deleted:
            sql += " AND d.deleted_at IS NULL"
        sql += " ORDER BY d.updated_at DESC"
        rows = self.pool.execute(sql, (workspace_id,))
        return [self._row_to_doc(r) for r in rows]

    async def soft_delete_document(self, workspace_id: str, document_id: str) -> None:
        self.pool.execute(
            "UPDATE documents SET deleted_at=%s, status='deleted', updated_at=%s WHERE workspace_id=%s AND id=%s",
            (_now_ms(), _now_ms(), workspace_id, document_id),
        )

    async def upsert_chunks_metadata(self, chunks: Sequence[ChunkRecord]) -> int:
        if not chunks:
            return 0
        rows = [
            (
                c.id, c.workspace_id, c.document_id, c.version, c.ordinal, c.text,
                c.line_start, c.line_end, c.section, c.symbol, c.tokens, c.superseded,
                json.dumps(c.metadata),
            )
            for c in chunks
        ]
        self.pool.executemany(
            """
            INSERT INTO chunks (
              id, workspace_id, document_id, version, ordinal, text,
              line_start, line_end, section, symbol, tokens, superseded, metadata
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (document_id, version, ordinal) DO UPDATE SET
              text=EXCLUDED.text, section=EXCLUDED.section, symbol=EXCLUDED.symbol,
              tokens=EXCLUDED.tokens, superseded=EXCLUDED.superseded, metadata=EXCLUDED.metadata
            """,
            rows,
        )
        return len(rows)

    async def get_chunks_for_document(
        self, workspace_id: str, document_id: str, version: int | None = None
    ) -> list[ChunkRecord]:
        if version is not None:
            rows = self.pool.execute(
                "SELECT * FROM chunks WHERE workspace_id=%s AND document_id=%s AND version=%s AND superseded=0 ORDER BY ordinal",
                (workspace_id, document_id, version),
            )
        else:
            rows = self.pool.execute(
                "SELECT * FROM chunks WHERE workspace_id=%s AND document_id=%s AND superseded=0 ORDER BY ordinal",
                (workspace_id, document_id),
            )
        return [self._row_to_chunk(r) for r in rows]

    async def sparse_search(
        self,
        workspace_id: str,
        query: str,
        top_k: int = 20,
        document_ids: Sequence[str] | None = None,
    ) -> list[SearchHit]:
        sql = """
          SELECT id, document_id, text, ordinal, version,
                 ts_rank(text_tsv, plainto_tsquery('simple', %s)) AS rank
          FROM chunks
          WHERE workspace_id=%s AND superseded=0
            AND text_tsv @@ plainto_tsquery('simple', %s)
        """
        params: list[Any] = [query, workspace_id, query]
        if document_ids:
            sql += " AND document_id = ANY(%s)"
            params.append(list(document_ids))
        sql += " ORDER BY rank DESC LIMIT %s"
        params.append(top_k)
        rows = self.pool.execute(sql, params)
        hits: list[SearchHit] = []
        for r in rows:
            hits.append(
                SearchHit(
                    chunk_id=r[0],
                    document_id=r[1],
                    workspace_id=workspace_id,
                    text=r[2],
                    score=float(r[5]) if r[5] is not None else 0.0,
                    ordinal=r[3],
                    version=r[4],
                )
            )
        return hits

    async def close(self) -> None:
        self.pool.close()

    @staticmethod
    def _row_to_doc(row) -> DocumentRecord:
        # row is tuple from psycopg
        # order matches SELECT d.*, chunks
        keys = [
            "id", "workspace_id", "filename", "path", "storage_path", "extension",
            "language", "size_bytes", "content_hash", "status", "updated_at", "indexed_at",
            "version", "parser", "chunker", "embedding", "error", "progress", "stage", "deleted_at", "chunks",
        ]
        d = dict(zip(keys, row)) if not hasattr(row, "keys") else dict(row)
        return DocumentRecord(
            id=d["id"],
            workspace_id=d["workspace_id"],
            filename=d["filename"],
            path=d["path"],
            storage_path=d["storage_path"],
            extension=d["extension"],
            language=d["language"],
            size_bytes=d["size_bytes"],
            content_hash=d["content_hash"],
            status=d["status"],
            updated_at=d["updated_at"],
            indexed_at=d.get("indexed_at"),
            version=d.get("version", 0),
            parser=d.get("parser"),
            chunker=d.get("chunker"),
            embedding=d.get("embedding"),
            error=d.get("error"),
            progress=d.get("progress"),
            stage=d.get("stage"),
            deleted_at=d.get("deleted_at"),
            chunks=d.get("chunks") or 0,
        )

    @staticmethod
    def _row_to_chunk(row) -> ChunkRecord:
        d = dict(row) if hasattr(row, "keys") else {
            "id": row[0], "workspace_id": row[1], "document_id": row[2], "version": row[3],
            "ordinal": row[4], "text": row[5], "line_start": row[6], "line_end": row[7],
            "section": row[8], "symbol": row[9], "tokens": row[10], "superseded": row[11],
        }
        return ChunkRecord(
            id=d["id"],
            workspace_id=d["workspace_id"],
            document_id=d["document_id"],
            version=d["version"],
            ordinal=d["ordinal"],
            text=d["text"],
            line_start=d.get("line_start", 0),
            line_end=d.get("line_end", 0),
            section=d.get("section"),
            symbol=d.get("symbol"),
            tokens=d.get("tokens", 0),
            superseded=bool(d.get("superseded")),
        )


class PostgresVectorStore(VectorStore):
    """pgvector-backed dense search. Requires chunk metadata already in chunks."""

    def __init__(self, dsn: str | None = None) -> None:
        self.dsn = dsn or SETTINGS.postgres_url
        if not self.dsn:
            raise ValueError("KNOWLEDGEOS_POSTGRES_URL required for PostgresVectorStore")
        self.pool = PostgresPool(self.dsn)
        self._dimension: int | None = None

    async def ensure_collection(self, dimension: int, distance: str = "cosine") -> None:
        # Ensure vector column has correct type. We recreate index if dimension changes.
        self._dimension = dimension
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                # Check current dimension of embedding column if any rows exist
                cur.execute(
                    """
                    SELECT atttypmod FROM pg_attribute
                    WHERE attrelid = 'chunk_embeddings'::regclass AND attname = 'embedding'
                    """
                )
                # Simpler: just ensure IVFFlat or HNSW index
                try:
                    cur.execute(
                        f"""
                        CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_hnsw
                        ON chunk_embeddings USING hnsw (embedding vector_cosine_ops)
                        WITH (m = 16, ef_construction = 64)
                        """
                    )
                except Exception as exc:
                    logger.warning("Could not create HNSW index (pgvector version?): %s", exc)
                conn.commit()

    async def upsert_chunks(self, chunks: Sequence[ChunkRecord], index_id: str | None = None) -> int:
        if not chunks:
            return 0
        dim = next((len(c.embedding) for c in chunks if c.embedding), None)
        if dim is None:
            return 0
        if self._dimension is None:
            await self.ensure_collection(dim)

        written = 0
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                for c in chunks:
                    if not c.embedding:
                        continue
                    # Ensure metadata row exists
                    cur.execute(
                        """
                        INSERT INTO chunks (
                          id, workspace_id, document_id, version, ordinal, text,
                          line_start, line_end, section, symbol, tokens, superseded
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (document_id, version, ordinal) DO UPDATE SET
                          text=EXCLUDED.text, superseded=EXCLUDED.superseded
                        """,
                        (
                            c.id, c.workspace_id, c.document_id, c.version, c.ordinal, c.text,
                            c.line_start, c.line_end, c.section, c.symbol, c.tokens, c.superseded,
                        ),
                    )
                    vec_str = "[" + ",".join(str(float(x)) for x in c.embedding) + "]"
                    cur.execute(
                        """
                        INSERT INTO chunk_embeddings (chunk_id, workspace_id, document_id, index_id, model, embedding, created_at)
                        VALUES (%s,%s,%s,%s,%s,%s::vector,%s)
                        ON CONFLICT (chunk_id) DO UPDATE SET
                          embedding=EXCLUDED.embedding, index_id=EXCLUDED.index_id, model=EXCLUDED.model
                        """,
                        (
                            c.id, c.workspace_id, c.document_id, index_id,
                            c.metadata.get("model"), vec_str, _now_ms(),
                        ),
                    )
                    written += 1
                conn.commit()
        return written

    async def delete_by_document(self, workspace_id: str, document_id: str) -> int:
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM chunk_embeddings WHERE workspace_id=%s AND document_id=%s",
                    (workspace_id, document_id),
                )
                n = cur.rowcount
                cur.execute(
                    "DELETE FROM chunks WHERE workspace_id=%s AND document_id=%s",
                    (workspace_id, document_id),
                )
                conn.commit()
                return n

    async def delete_by_workspace(self, workspace_id: str) -> int:
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM chunk_embeddings WHERE workspace_id=%s", (workspace_id,))
                n = cur.rowcount
                cur.execute("DELETE FROM chunks WHERE workspace_id=%s", (workspace_id,))
                conn.commit()
                return n

    async def search(
        self,
        workspace_id: str,
        query_vector: list[float],
        top_k: int = 10,
        document_ids: Sequence[str] | None = None,
        index_id: str | None = None,
        score_threshold: float | None = None,
    ) -> list[SearchHit]:
        vec_str = "[" + ",".join(str(float(x)) for x in query_vector) + "]"
        sql = """
          SELECT e.chunk_id, e.document_id, c.text, c.ordinal, c.version,
                 1 - (e.embedding <=> %s::vector) AS score
          FROM chunk_embeddings e
          JOIN chunks c ON c.id = e.chunk_id
          WHERE e.workspace_id=%s AND c.superseded=0
        """
        params: list[Any] = [vec_str, workspace_id]
        if index_id:
            sql += " AND e.index_id=%s"
            params.append(index_id)
        if document_ids:
            sql += " AND e.document_id = ANY(%s)"
            params.append(list(document_ids))
        if score_threshold is not None:
            sql += " AND (1 - (e.embedding <=> %s::vector)) >= %s"
            params.extend([vec_str, score_threshold])
        sql += " ORDER BY e.embedding <=> %s::vector LIMIT %s"
        params.extend([vec_str, top_k])
        rows = self.pool.execute(sql, params)
        hits: list[SearchHit] = []
        for r in rows:
            hits.append(
                SearchHit(
                    chunk_id=r[0],
                    document_id=r[1],
                    workspace_id=workspace_id,
                    text=r[2],
                    score=float(r[5]) if r[5] is not None else 0.0,
                    ordinal=r[3],
                    version=r[4],
                )
            )
        return hits

    async def get_chunk_vectors(
        self, workspace_id: str, chunk_ids: Sequence[str]
    ) -> dict[str, list[float]]:
        if not chunk_ids:
            return {}
        rows = self.pool.execute(
            "SELECT chunk_id, embedding FROM chunk_embeddings WHERE workspace_id=%s AND chunk_id = ANY(%s)",
            (workspace_id, list(chunk_ids)),
        )
        result: dict[str, list[float]] = {}
        for r in rows:
            if r[1] is not None:
                # psycopg returns list or string depending on version
                emb = r[1]
                if isinstance(emb, str):
                    emb = json.loads(emb.replace("(", "[").replace(")", "]"))
                result[r[0]] = list(emb)
        return result

    async def count(self, workspace_id: str | None = None) -> int:
        if workspace_id:
            row = self.pool.execute_one(
                "SELECT COUNT(*) FROM chunk_embeddings WHERE workspace_id=%s", (workspace_id,)
            )
        else:
            row = self.pool.execute_one("SELECT COUNT(*) FROM chunk_embeddings")
        return int(row[0]) if row else 0

    async def close(self) -> None:
        self.pool.close()


class PostgresReportStore(ReportStore):
    def __init__(self, dsn: str | None = None) -> None:
        self.dsn = dsn or SETTINGS.postgres_url
        if not self.dsn:
            raise ValueError("KNOWLEDGEOS_POSTGRES_URL required")
        self.pool = PostgresPool(self.dsn)

    async def init_schema(self) -> None:
        # Schema is shared with metadata store
        pass

    async def save_report(self, report: GeneratedReport) -> str:
        rid = report.id or str(uuid.uuid4())
        self.pool.execute(
            """
            INSERT INTO generated_reports (
              id, workspace_id, user_id, title, report_type, body, format, model,
              sources, citations, trace_id, status, version, created_at, metadata
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s,%s::jsonb)
            """,
            (
                rid, report.workspace_id, report.user_id, report.title, report.report_type,
                report.body, report.format, report.model,
                json.dumps(report.sources), json.dumps(report.citations), report.trace_id,
                report.status, report.version, report.created_at or _now_ms(),
                json.dumps(report.metadata),
            ),
        )
        # Optional: write report_sources
        for i, src in enumerate(report.sources or []):
            self.pool.execute(
                """
                INSERT INTO report_sources (id, report_id, document_id, chunk_id, citation_text, ordinal)
                VALUES (%s,%s,%s,%s,%s,%s)
                """,
                (
                    str(uuid.uuid4()), rid,
                    src.get("document_id"), src.get("chunk_id"),
                    src.get("text") or src.get("citation"), i,
                ),
            )
        return rid

    async def get_report(self, report_id: str, workspace_id: str | None = None) -> GeneratedReport | None:
        if workspace_id:
            row = self.pool.execute_one(
                "SELECT * FROM generated_reports WHERE id=%s AND workspace_id=%s",
                (report_id, workspace_id),
            )
        else:
            row = self.pool.execute_one("SELECT * FROM generated_reports WHERE id=%s", (report_id,))
        if not row:
            return None
        return self._row_to_report(row)

    async def list_reports(
        self, workspace_id: str, limit: int = 50, offset: int = 0
    ) -> list[GeneratedReport]:
        rows = self.pool.execute(
            "SELECT * FROM generated_reports WHERE workspace_id=%s ORDER BY created_at DESC LIMIT %s OFFSET %s",
            (workspace_id, limit, offset),
        )
        return [self._row_to_report(r) for r in rows]

    async def save_conversation_message(self, msg: ConversationMessage) -> None:
        self.pool.execute(
            """
            INSERT INTO conversation_messages (
              id, conversation_id, role, content, created_at, model, citations, metadata
            ) VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)
            """,
            (
                msg.id, msg.conversation_id, msg.role, msg.content, msg.created_at,
                msg.model, json.dumps(msg.citations), json.dumps(msg.metadata),
            ),
        )

    async def list_conversation_messages(
        self, conversation_id: str, limit: int = 100
    ) -> list[ConversationMessage]:
        rows = self.pool.execute(
            "SELECT id, conversation_id, role, content, created_at, model, citations, metadata FROM conversation_messages WHERE conversation_id=%s ORDER BY created_at ASC LIMIT %s",
            (conversation_id, limit),
        )
        result: list[ConversationMessage] = []
        for r in rows:
            citations = r[6] if isinstance(r[6], list) else json.loads(r[6] or "[]")
            meta = r[7] if isinstance(r[7], dict) else json.loads(r[7] or "{}")
            result.append(
                ConversationMessage(
                    id=r[0], conversation_id=r[1], role=r[2], content=r[3],
                    created_at=r[4], model=r[5], citations=citations, metadata=meta,
                )
            )
        return result

    async def save_query_trace(self, trace: dict[str, Any]) -> None:
        self.pool.execute(
            """
            INSERT INTO query_traces (id, request_id, workspace_id, route, query_text, payload, created_at)
            VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s)
            """,
            (
                trace.get("id") or str(uuid.uuid4()),
                trace.get("request_id"),
                trace["workspace_id"],
                trace.get("route"),
                trace.get("query_text"),
                json.dumps(trace.get("payload", {})),
                trace.get("created_at") or _now_ms(),
            ),
        )

    async def close(self) -> None:
        self.pool.close()

    @staticmethod
    def _row_to_report(row) -> GeneratedReport:
        # Flexible mapping
        if hasattr(row, "keys"):
            d = dict(row)
        else:
            # positional from SELECT *
            cols = [
                "id", "workspace_id", "user_id", "title", "report_type", "body", "format",
                "model", "sources", "citations", "trace_id", "status", "version", "created_at", "metadata",
            ]
            d = dict(zip(cols, row))
        sources = d.get("sources") or []
        if isinstance(sources, str):
            sources = json.loads(sources)
        citations = d.get("citations") or []
        if isinstance(citations, str):
            citations = json.loads(citations)
        meta = d.get("metadata") or {}
        if isinstance(meta, str):
            meta = json.loads(meta)
        return GeneratedReport(
            id=d["id"],
            workspace_id=d["workspace_id"],
            user_id=d.get("user_id"),
            title=d["title"],
            report_type=d["report_type"],
            body=d["body"],
            format=d.get("format") or "markdown",
            model=d.get("model") or "",
            sources=sources,
            citations=citations,
            trace_id=d.get("trace_id"),
            status=d.get("status") or "completed",
            version=d.get("version") or 1,
            created_at=d.get("created_at") or 0,
            metadata=meta,
        )
