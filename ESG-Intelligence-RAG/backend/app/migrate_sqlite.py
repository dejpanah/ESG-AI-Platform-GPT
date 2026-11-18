"""One-shot migration: legacy SQLite → PostgreSQL (+ optional vector backfill).

Usage:
  KNOWLEDGEOS_POSTGRES_URL=postgresql://... \
  KNOWLEDGEOS_SQLITE_SOURCE=/path/to/knowledgeos.sqlite3 \
  python -m app.migrate_sqlite

Optional:
  KNOWLEDGEOS_VECTOR_BACKEND=qdrant|postgres
  KNOWLEDGEOS_MIGRATE_VECTORS=true   # push embeddings into Vector DB
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(level)s %(message)s")
logger = logging.getLogger("migrate_sqlite")

TABLES = [
    "workspaces",
    "provider_profiles",
    "documents",
    "document_versions",
    "chunks",
    "jobs",
    "index_versions",
    "index_chunks",
    "index_chunk_embeddings",
    "cache_entries",
    "traces",
    "events",
    "golden_set",
    "evaluations",
    "feedback",
]


def _pg():
    from app.db import db, init_schema
    init_schema()
    return db


def copy_table(sqlite_conn: sqlite3.Connection, table: str) -> int:
    sqlite_conn.row_factory = sqlite3.Row
    try:
        rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
    except sqlite3.Error as exc:
        logger.warning("Skip table %s: %s", table, exc)
        return 0
    if not rows:
        return 0
    cols = [k for k in rows[0].keys() if k != "text_tsv"]
    # Skip FTS virtual tables
    if table.endswith("_fts"):
        return 0
    placeholders = ",".join(["%s"] * len(cols))
    col_list = ",".join(cols)
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
    n = 0
    with _pg()() as pg:
        for row in rows:
            values = []
            for c in cols:
                v = row[c]
                values.append(v)
            try:
                pg.execute(sql, values)
                n += 1
            except Exception as exc:
                logger.debug("row skip %s: %s", table, exc)
        pg.commit()
    logger.info("Copied %s rows into %s", n, table)
    return n


def backfill_vectors() -> int:
    if os.getenv("KNOWLEDGEOS_MIGRATE_VECTORS", "true").lower() not in ("1", "true", "yes"):
        logger.info("Vector backfill skipped (KNOWLEDGEOS_MIGRATE_VECTORS=false)")
        return 0
    from app.storage.vector_ops import upsert_chunk_vectors

    with _pg()() as pg:
        rows = pg.execute(
            "SELECT id, workspace_id, document_id, version, ordinal, text, "
            "line_start, line_end, tokens, embedding_json FROM chunks "
            "WHERE superseded=0 AND embedding_json IS NOT NULL"
        ).fetchall()
    batch: list[dict] = []
    total = 0
    for row in rows:
        try:
            emb = json.loads(row["embedding_json"])
        except Exception:
            continue
        if not emb:
            continue
        batch.append(
            {
                "id": row["id"],
                "workspace_id": row["workspace_id"],
                "document_id": row["document_id"],
                "version": row["version"],
                "ordinal": row["ordinal"],
                "text": row["text"],
                "line_start": row["line_start"],
                "line_end": row["line_end"],
                "tokens": row["tokens"],
                "embedding": emb,
            }
        )
        if len(batch) >= 50:
            total += upsert_chunk_vectors(batch)
            batch = []
    if batch:
        total += upsert_chunk_vectors(batch)
    logger.info("Backfilled %s vectors into Vector DB", total)
    return total


def main() -> int:
    src = os.getenv("KNOWLEDGEOS_SQLITE_SOURCE", "").strip()
    if not src:
        default = Path(os.getenv("KNOWLEDGEOS_DATA_DIR", "data")) / "knowledgeos.sqlite3"
        src = str(default)
    path = Path(src)
    if not path.exists():
        logger.error("SQLite source not found: %s", path)
        logger.info("Set KNOWLEDGEOS_SQLITE_SOURCE to the legacy database file.")
        return 1
    if not os.getenv("KNOWLEDGEOS_POSTGRES_URL") and not os.getenv("DATABASE_URL"):
        logger.error("KNOWLEDGEOS_POSTGRES_URL is required")
        return 1

    logger.info("Migrating from %s → PostgreSQL", path)
    sqlite_conn = sqlite3.connect(str(path))
    total = 0
    for table in TABLES:
        total += copy_table(sqlite_conn, table)
    sqlite_conn.close()
    vectors = backfill_vectors()
    logger.info("Done. rows≈%s vectors=%s", total, vectors)
    logger.info("You can archive/remove the SQLite file after verification.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
