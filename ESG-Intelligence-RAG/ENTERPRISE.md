# ESG Intelligence Platform — Enterprise (PostgreSQL-only)

SQLite is **removed** from the runtime. Dense vectors live in **Qdrant or pgvector**. Object files live on **disk or MinIO**. Cache primary is **Redis**.

Generated ESG reports are archived in PostgreSQL and form the **report library**. Aggregate reports can be built from any set of previously stored reports.

## Env

```bash
# Required
KNOWLEDGEOS_POSTGRES_URL=postgresql://knowledgeos:knowledgeos@localhost:5432/knowledgeos

# Vector: qdrant | postgres
KNOWLEDGEOS_VECTOR_BACKEND=qdrant
KNOWLEDGEOS_QDRANT_URL=http://localhost:6333

# Object storage: local | minio
KNOWLEDGEOS_OBJECT_STORE=local
# KNOWLEDGEOS_OBJECT_STORE=minio
# KNOWLEDGEOS_MINIO_ENDPOINT=localhost:9000
# KNOWLEDGEOS_MINIO_ACCESS_KEY=knowledgeos
# KNOWLEDGEOS_MINIO_SECRET_KEY=knowledgeossecret
# KNOWLEDGEOS_MINIO_BUCKET=knowledgeos

# Cache
KNOWLEDGEOS_REDIS_URL=redis://localhost:6379/0

# Report archive (library)
KNOWLEDGEOS_ARCHIVE_REPORTS=true

# Legacy SQLite → Postgres migration (one-time)
# KNOWLEDGEOS_SQLITE_SOURCE=/path/to/knowledgeos.sqlite3
# python -m app.migrate_sqlite
```

## Docker

```bash
docker compose -f docker/docker-compose.yml up --build
```

## Design notes for ESG

- Search dense path uses VectorStore only
- Report library stores full body + metadata (period, standard, pillars, source_report_ids)
- `POST /api/v1/reports/aggregate` builds a new `esg_aggregate` report from selected library items
- Future structured ESG tables (metrics, emissions, workforce, …) will be added to the same Postgres; the engine can read them via SQL views or dedicated adapters
- FTS via PostgreSQL `text_tsv`
