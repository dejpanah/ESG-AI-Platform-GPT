# ESG Intelligence — .NET Web UI & Device Ingestion Gateway

ASP.NET Core 8 Razor Pages console + Minimal Web API Ingestion Gateway for the **ESG Intelligence RAG Engine** (compatible with both the Python FastAPI backend on `:8000` and the unified Node/React workspace server on `:3000`).

```
IoT / BMS / SCADA / ERP ──▶ .NET Web API (/api/ingest/*) ──┐
                                                             ▼
Browser → .NET Web UI (:5180) ─────────────────────▶ ESG RAG API (:8000 or :3000)
                                                             │
                                               PostgreSQL · Qdrant · Vector/Hybrid Index
```

## Device & System Web API Endpoints (Minimal API)

- `GET  /api/ingest/health` — Gateway + upstream RAG backend health
- `POST /api/ingest/device` — Ingest telemetry JSON (`{ device_id, table, records, sync_to_rag }`) into Postgres ESG tables and optionally embed a RAG snapshot
- `POST /api/ingest/batch/{table}` — Batch-ingest an array of records into a target ESG table
- `POST /api/ingest/sync-rag` — Materialize structured Postgres ESG tables into a RAG document and index it

## Feature parity with React UI

| React page        | .NET page      |
|-------------------|----------------|
| Ask Knowledge     | `/Chat`        |
| Documents         | `/Documents`   |
| ESG Reports       | `/Reports`     |
| ESG Data          | `/EsgData`     |
| Sync Queue        | `/Sync`        |
| Activity          | `/Activity`    |
| Evaluations       | `/Evaluations` |
| Models            | `/Models`      |
| Indexes           | `/Indexes`     |
| Settings          | `/Settings`    |
| Storage           | `/Storage`     |
| Home              | `/`            |

## Requirements

- .NET 8 SDK
- Running ESG RAG backend on port **8000** (Python FastAPI) or **3000** (Node/Express workspace API)

## Run locally

```bash
cd ESG-Intelligence-Web-DotNet
# Point to Python FastAPI (:8000) or Node/React dev server (:3000)
export RagApi__BaseUrl=http://127.0.0.1:3000/
dotnet restore
dotnet run --urls http://localhost:5180
```

Open **http://localhost:5180**

### Config

`appsettings.json`:

```json
"RagApi": {
  "BaseUrl": "http://127.0.0.1:8000/",
  "DefaultWorkspace": "default",
  "DefaultUser": "local"
}
```

Workspace / user / token cookies (`knowledgeos.*`) are forwarded as `X-Workspace-ID`, `X-User-ID`, and `Authorization: Bearer ...`.

## Docker

```bash
docker compose up -d --build
```
