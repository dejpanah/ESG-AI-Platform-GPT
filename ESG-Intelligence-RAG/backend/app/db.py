"""PostgreSQL-only database layer (SQLite fully removed).

Provides:
- connection pool
- full operational schema (documents, chunks, jobs, cache, indexes, reports, …)
- sparse FTS via tsvector (replaces FTS5)
- a small compatibility helper so existing `?` placeholders still work
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
from contextlib import contextmanager
from typing import Any, Iterator, Sequence

logger = logging.getLogger(__name__)

class HybridRow(dict):
    """dict row that also supports integer index access like sqlite3.Row."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)

    def keys(self):
        return super().keys()


def _as_row(row):
    if row is None:
        return None
    if isinstance(row, dict):
        return HybridRow(row)
    return row


_POOL = None
_POOL_LOCK = threading.Lock()
_SCHEMA_READY = False

# Convert sqlite-style ? placeholders to psycopg %s (skip %% already escaped)
_QMARK_RE = re.compile(r"(?<!%)\?(?!%)")


def _now_ms() -> int:
    return int(time.time() * 1000)


def get_postgres_url() -> str:
    url = (
        os.getenv("KNOWLEDGEOS_POSTGRES_URL")
        or os.getenv("DATABASE_URL")
        or ""
    ).strip()
    if not url:
        raise RuntimeError(
            "KNOWLEDGEOS_POSTGRES_URL (or DATABASE_URL) is required. "
            "SQLite has been removed; PostgreSQL is the only supported database."
        )
    return url


def _create_pool():
    global _POOL
    dsn = get_postgres_url()
    try:
        from psycopg_pool import ConnectionPool
        from psycopg.rows import dict_row

        _POOL = ConnectionPool(
            dsn,
            min_size=1,
            max_size=int(os.getenv("KNOWLEDGEOS_PG_POOL_SIZE", "10")),
            kwargs={"row_factory": dict_row, "autocommit": False},
            open=True,
        )
        logger.info("PostgreSQL pool opened")
        return _POOL
    except ImportError:
        # Fallback without pool
        import psycopg
        from psycopg.rows import dict_row

        class _SimplePool:
            def connection(self):
                return psycopg.connect(dsn, row_factory=dict_row)

            def close(self):
                pass

        _POOL = _SimplePool()
        logger.info("PostgreSQL simple connections (install psycopg-pool for pooling)")
        return _POOL


def get_pool():
    global _POOL
    if _POOL is None:
        with _POOL_LOCK:
            if _POOL is None:
                _create_pool()
    return _POOL


def adapt_sql(sql: str) -> str:
    """Translate common SQLite idioms to PostgreSQL."""
    s = sql.strip()
    s = _QMARK_RE.sub("%s", s)
    if re.search(r"\bINSERT\s+OR\s+IGNORE\b", s, re.I) and "ON CONFLICT" not in s.upper():
        s = re.sub(r"\bINSERT\s+OR\s+IGNORE\b", "INSERT", s, flags=re.I)
        s = s.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    # INSERT OR REPLACE → INSERT (callers should use explicit ON CONFLICT)
    if re.search(r"\bINSERT\s+OR\s+REPLACE\b", s, re.I) and "ON CONFLICT" not in s.upper():
        s = re.sub(r"\bINSERT\s+OR\s+REPLACE\b", "INSERT", s, flags=re.I)
        s = s.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    return s


class PgCursor:
    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql: str, params: Sequence[Any] | None = None):
        self._cur.execute(adapt_sql(sql), params)
        return self

    def executemany(self, sql: str, seq_of_params: Sequence[Sequence[Any]]):
        self._cur.executemany(adapt_sql(sql), seq_of_params)
        return self

    def fetchone(self):
        return _as_row(self._cur.fetchone())

    def fetchall(self):
        return [_as_row(r) for r in self._cur.fetchall()]

    def fetchmany(self, size: int | None = None):
        return self._cur.fetchmany(size) if size is not None else self._cur.fetchmany()

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount

    def close(self):
        self._cur.close()

    def __iter__(self):
        return iter(self._cur)


class PgConnection:
    """Thin wrapper: execute() with ? placeholders, dict rows, commit/close."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql: str, params: Sequence[Any] | None = None) -> PgCursor:
        cur = self._conn.cursor()
        cur.execute(adapt_sql(sql), params)
        return PgCursor(cur)

    def executemany(self, sql: str, seq_of_params: Sequence[Sequence[Any]]) -> PgCursor:
        cur = self._conn.cursor()
        cur.executemany(adapt_sql(sql), seq_of_params)
        return PgCursor(cur)

    def executescript(self, script: str) -> None:
        for stmt in _split_sql(script):
            if not stmt.strip():
                continue
            # skip SQLite-only pragmas
            upper = stmt.strip().upper()
            if upper.startswith("PRAGMA") or "VIRTUAL TABLE" in upper or "USING FTS5" in upper:
                continue
            try:
                self._conn.execute(stmt)
            except Exception as exc:
                msg = str(exc).lower()
                if "already exists" in msg or "duplicate" in msg:
                    continue
                logger.warning("Schema statement issue: %s — %s", stmt[:100], exc)
        self._conn.commit()

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()

    def cursor(self) -> PgCursor:
        return PgCursor(self._conn.cursor())


def _split_sql(script: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    for line in script.splitlines():
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        buf.append(line)
        if stripped.endswith(";"):
            parts.append("\n".join(buf))
            buf = []
    if buf:
        parts.append("\n".join(buf))
    return parts


# ---------------------------------------------------------------------------
# Full operational schema (PostgreSQL) — replaces former SQLite SCHEMA
# ---------------------------------------------------------------------------

POSTGRES_SCHEMA = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  role TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  failure_count INTEGER NOT NULL DEFAULT 0,
  unhealthy_until BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(workspace_id, name)
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
CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);

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
  embedding_json TEXT,
  superseded INTEGER NOT NULL DEFAULT 0,
  UNIQUE(document_id, version, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_chunks_workspace_doc ON chunks(workspace_id, document_id);

-- Full-text search (replaces FTS5)
-- text_tsv is maintained by trigger for broad PG compatibility
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS text_tsv tsvector;
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON chunks USING GIN (text_tsv);

CREATE OR REPLACE FUNCTION chunks_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.text_tsv := to_tsvector('simple', coalesce(NEW.text, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chunks_tsv ON chunks;
CREATE TRIGGER trg_chunks_tsv
  BEFORE INSERT OR UPDATE OF text ON chunks
  FOR EACH ROW EXECUTE PROCEDURE chunks_tsv_trigger();

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  document_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  idempotency_key TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS index_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL,
  embedding TEXT,
  dimensions INTEGER,
  documents INTEGER NOT NULL DEFAULT 0,
  chunks INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  built_at BIGINT,
  validated INTEGER NOT NULL DEFAULT 0,
  evaluated INTEGER NOT NULL DEFAULT 0,
  evaluation_score REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS index_chunks (
  index_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  PRIMARY KEY(index_id, chunk_id)
);
CREATE INDEX IF NOT EXISTS idx_index_chunks_workspace ON index_chunks(workspace_id, index_id);

CREATE TABLE IF NOT EXISTS index_chunk_embeddings (
  index_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  model TEXT NOT NULL,
  PRIMARY KEY(index_id, chunk_id)
);
CREATE INDEX IF NOT EXISTS idx_index_chunk_embeddings_ws ON index_chunk_embeddings(workspace_id, index_id);

-- Dense vectors via pgvector (used when VECTOR_BACKEND=postgres)
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  index_id TEXT,
  model TEXT,
  embedding vector,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_ws ON chunk_embeddings(workspace_id);

CREATE TABLE IF NOT EXISTS cache_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  index_version TEXT NOT NULL,
  model_profile_id TEXT,
  prompt_version TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  query_text TEXT NOT NULL,
  embedding_json TEXT,
  response_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  filter_fingerprint TEXT,
  intent_class TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_entries_key_notnull
  ON cache_entries (workspace_id, index_version, model_profile_id, prompt_version, query_hash)
  WHERE model_profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_entries_key_null
  ON cache_entries (workspace_id, index_version, prompt_version, query_hash)
  WHERE model_profile_id IS NULL;

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  route TEXT NOT NULL,
  payload_json TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  document_id TEXT,
  trace_id TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS golden_set (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  question TEXT NOT NULL,
  expected_json TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  index_id TEXT,
  score REAL,
  report_json TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  trace_id TEXT,
  rating INTEGER,
  comment TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS generated_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL,
  body TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  model TEXT,
  sources_json TEXT,
  citations_json TEXT,
  trace_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  version INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_workspace ON generated_reports(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS report_sources (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
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
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  model TEXT,
  citations_json TEXT,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS query_traces (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  workspace_id TEXT NOT NULL,
  route TEXT,
  query_text TEXT,
  payload_json TEXT,
  created_at BIGINT NOT NULL
);
"""


@contextmanager
def db() -> Iterator[PgConnection]:
    pool = get_pool()
    with pool.connection() as raw:
        conn = PgConnection(raw)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def init_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with db() as conn:
        conn.executescript(POSTGRES_SCHEMA)
        # default workspace
        conn.execute(
            "INSERT INTO workspaces(id, name, created_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
            ("default", "Default workspace", _now_ms()),
        )
        conn.commit()
        try:
            from app.esg_schema import apply_esg_schema
            apply_esg_schema(conn)
        except Exception as exc:
            logger.warning("ESG schema apply failed: %s", exc)
    _SCHEMA_READY = True
    logger.info("PostgreSQL schema initialized")



def close_pool() -> None:
    global _POOL, _SCHEMA_READY
    if _POOL is not None:
        try:
            _POOL.close()
        except Exception:
            pass
        _POOL = None
    _SCHEMA_READY = False


def sparse_search_sql() -> str:
    """PostgreSQL FTS query template (replaces chunks_fts MATCH)."""
    return """
      SELECT c.*, d.filename, d.path, d.version AS document_version,
             ts_rank(c.text_tsv, plainto_tsquery('simple', %s)) AS rank
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.workspace_id = %s
        AND c.superseded = 0
        AND c.text_tsv @@ plainto_tsquery('simple', %s)
    """
