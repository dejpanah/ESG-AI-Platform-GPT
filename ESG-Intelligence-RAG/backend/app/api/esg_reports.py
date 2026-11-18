"""ESG report generation: metrics + RAG context + LLM → archived report."""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.esg_data import fetch_esg_snapshot
from app.services.esg_prompts import build_report_user_prompt, system_prompt
from app.services.esg_rag import build_retrieval_query, retrieve_document_context
from app.storage.factory import get_storage
from app.storage.interfaces import GeneratedReport

router = APIRouter(prefix="/api/v1/esg", tags=["esg"])


class GenerateESGReportRequest(BaseModel):
    workspace_id: str = "default"
    title: str
    report_type: str = "esg_periodic"
    from_date: str | None = None
    to_date: str | None = None
    pillars: list[str] = Field(default_factory=lambda: ["environmental", "social"])
    instructions: str | None = None
    language: str = "fa"
    model: str = ""
    include_metrics: bool = True
    include_rag: bool = True
    document_context: str | None = None
    user_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    save: bool = True
    rag_top_k: int = Field(12, ge=1, le=40)


class MetricsQuery(BaseModel):
    workspace_id: str = "default"
    from_date: str | None = None
    to_date: str | None = None
    pillars: list[str] = Field(default_factory=lambda: ["environmental", "social"])


def _ollama_generate(system: str, user: str, model: str | None = None) -> str:
    base = os.getenv("KNOWLEDGEOS_OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = (
        model
        or os.getenv("KNOWLEDGEOS_OLLAMA_CHAT_MODEL")
        or os.getenv("KNOWLEDGEOS_OLLAMA_EMBEDDING_MODEL")
        or "llama3.2"
    ).strip()
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    for path, body in (
        ("/api/chat", payload),
        (
            "/api/generate",
            {
                "model": model,
                "stream": False,
                "prompt": f"System:\n{system}\n\nUser:\n{user}\n\nAssistant:",
            },
        ),
    ):
        try:
            req = Request(
                f"{base}{path}",
                data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if "message" in data and isinstance(data["message"], dict):
                return str(data["message"].get("content") or "").strip()
            if "response" in data:
                return str(data["response"] or "").strip()
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError):
            continue
    return (
        f"# {user[:200]}\n\n"
        "*مدل زبانی در دسترس نبود؛ نسخه اسکلتی بر اساس داده‌های موجود.*\n\n"
    )


@router.post("/metrics")
async def get_metrics(payload: MetricsQuery) -> dict[str, Any]:
    try:
        return fetch_esg_snapshot(
            payload.workspace_id,
            payload.from_date,
            payload.to_date,
            payload.pillars,
        )
    except Exception as exc:
        raise HTTPException(500, f"Failed to load ESG metrics: {exc}") from exc


@router.post("/generate-report")
async def generate_esg_report(payload: GenerateESGReportRequest) -> dict[str, Any]:
    metrics = None
    if payload.include_metrics:
        try:
            metrics = fetch_esg_snapshot(
                payload.workspace_id,
                payload.from_date,
                payload.to_date,
                payload.pillars,
            )
        except Exception as exc:
            metrics = {"error": str(exc)}

    citations: list[dict[str, Any]] = []
    doc_context = (payload.document_context or "").strip()
    if payload.include_rag:
        q = build_retrieval_query(
            payload.title, payload.report_type, payload.instructions, payload.pillars
        )
        auto_ctx, citations = retrieve_document_context(
            payload.workspace_id, q, top_k=payload.rag_top_k
        )
        if auto_ctx:
            doc_context = (doc_context + "\n\n---\n\n" + auto_ctx) if doc_context else auto_ctx

    sys_p = system_prompt(payload.language)
    user_p = build_report_user_prompt(
        report_type=payload.report_type,
        title=payload.title,
        instructions=payload.instructions,
        metrics_snapshot=metrics if isinstance(metrics, dict) else None,
        document_context=doc_context or None,
        language=payload.language,
    )
    body = _ollama_generate(sys_p, user_p, payload.model or None)

    meta = dict(payload.metadata or {})
    meta.update(
        {
            "period_start": payload.from_date,
            "period_end": payload.to_date,
            "pillars": payload.pillars,
            "language": payload.language,
            "has_metrics": bool(metrics) and "error" not in (metrics or {}),
            "has_rag_context": bool(doc_context),
            "rag_citation_count": len(citations),
        }
    )

    report_out: dict[str, Any] = {
        "title": payload.title,
        "report_type": payload.report_type,
        "body": body,
        "format": "markdown",
        "model": payload.model or os.getenv("KNOWLEDGEOS_OLLAMA_CHAT_MODEL", "ollama"),
        "metadata": meta,
        "metrics_snapshot": metrics,
        "citations": citations,
        "document_context_used": bool(doc_context),
    }

    if payload.save:
        storage = get_storage()
        if storage.reports is None:
            raise HTTPException(503, "Report archive is not configured")
        report = GeneratedReport(
            id=str(uuid.uuid4()),
            workspace_id=payload.workspace_id,
            user_id=payload.user_id,
            title=payload.title,
            report_type=payload.report_type,
            body=body,
            format="markdown",
            model=report_out["model"],
            sources=[{"chunk_id": c.get("chunk_id"), "filename": c.get("filename")} for c in citations],
            citations=citations,
            trace_id=None,
            status="completed",
            version=1,
            created_at=int(time.time() * 1000),
            metadata=meta,
        )
        rid = await storage.reports.save_report(report)
        report_out["id"] = rid
        report_out["saved"] = True
    else:
        report_out["saved"] = False

    return report_out
