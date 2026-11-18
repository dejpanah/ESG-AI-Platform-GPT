"""ESG Report archive API — library of generated reports + aggregation.

Works on top of the StorageFacade. Supports ESG-specific report types and
building aggregate reports from previously stored period reports.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.storage.factory import get_storage
from app.storage.interfaces import GeneratedReport

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

# Canonical ESG report types used by the platform
ESG_REPORT_TYPES = frozenset(
    {
        "answer",                 # plain chat answer (backward compatible)
        "esg_periodic",           # periodic sustainability report
        "esg_environmental",      # E pillar
        "esg_social",             # S pillar
        "esg_governance",         # G pillar
        "esg_audit",              # audit / assurance
        "esg_aggregate",          # multi-period / multi-report rollup
        "esg_custom",             # free-form user request
    }
)


class ReportCreate(BaseModel):
    workspace_id: str
    title: str
    report_type: str = "answer"
    body: str
    format: str = "markdown"
    model: str = ""
    user_id: str | None = None
    sources: list[dict[str, Any]] = Field(default_factory=list)
    citations: list[dict[str, Any]] = Field(default_factory=list)
    trace_id: str | None = None
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "ESG metadata examples: period_start, period_end, standard (GRI/SASB/TCFD/ESRS), "
            "scope, organization, pillars, source_report_ids"
        ),
    )


class ReportOut(BaseModel):
    id: str
    workspace_id: str
    user_id: str | None
    title: str
    report_type: str
    body: str
    format: str
    model: str
    sources: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    trace_id: str | None
    status: str
    version: int
    created_at: int
    metadata: dict[str, Any]


class AggregateRequest(BaseModel):
    """Build a new aggregate ESG report from existing library reports."""

    workspace_id: str
    title: str
    source_report_ids: list[str] = Field(..., min_length=1)
    report_type: str = "esg_aggregate"
    format: str = "markdown"
    model: str = ""
    user_id: str | None = None
    # Optional guidance for the aggregator (period range, focus pillars, etc.)
    instructions: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


def _to_out(r: GeneratedReport) -> ReportOut:
    return ReportOut(
        id=r.id,
        workspace_id=r.workspace_id,
        user_id=r.user_id,
        title=r.title,
        report_type=r.report_type,
        body=r.body,
        format=r.format,
        model=r.model,
        sources=r.sources,
        citations=r.citations,
        trace_id=r.trace_id,
        status=r.status,
        version=r.version,
        created_at=r.created_at,
        metadata=r.metadata or {},
    )


def _build_aggregate_body(source_reports: list[GeneratedReport], instructions: str | None) -> str:
    """Deterministic markdown scaffold for an aggregate report.

    The full LLM-powered aggregation can be plugged in later (call generation
    service with the source bodies). For now we produce a structured library
    document that references the source reports and concatenates key sections.
    """
    lines: list[str] = []
    lines.append("# گزارش تجمیعی ESG")
    lines.append("")
    if instructions:
        lines.append(f"**دستورالعمل تجمیع:** {instructions}")
        lines.append("")
    lines.append(f"**تعداد گزارش‌های منبع:** {len(source_reports)}")
    lines.append("")
    lines.append("## فهرست گزارش‌های مبنا")
    lines.append("")
    for i, r in enumerate(source_reports, 1):
        period = ""
        meta = r.metadata or {}
        if meta.get("period_start") or meta.get("period_end"):
            period = f" ({meta.get('period_start', '?')} → {meta.get('period_end', '?')})"
        lines.append(f"{i}. **{r.title}** — `{r.report_type}`{period} — id=`{r.id}`")
    lines.append("")
    lines.append("## محتوای استخراج‌شده از گزارش‌ها")
    lines.append("")
    for r in source_reports:
        lines.append(f"### {r.title}")
        lines.append("")
        # Keep a reasonable excerpt to avoid huge payloads; full body remains in library
        body = (r.body or "").strip()
        excerpt = body if len(body) <= 8000 else body[:8000] + "\n\n… [ادامه در گزارش اصلی]"
        lines.append(excerpt)
        lines.append("")
        lines.append("---")
        lines.append("")
    lines.append(
        "*این سند اسکلت تجمیعی است. برای تولید روایت تحلیلی نهایی می‌توان از سرویس تولید "
        "گزارش (LLM) روی همین منابع استفاده کرد.*"
    )
    return "\n".join(lines)


@router.post("", response_model=ReportOut)
async def create_report(payload: ReportCreate) -> ReportOut:
    storage = get_storage()
    if storage.reports is None:
        raise HTTPException(503, "Report archive is not configured")
    if payload.report_type not in ESG_REPORT_TYPES:
        # Allow unknown types for forward compatibility, but prefer known ones
        pass
    report = GeneratedReport(
        id=str(uuid.uuid4()),
        workspace_id=payload.workspace_id,
        user_id=payload.user_id,
        title=payload.title,
        report_type=payload.report_type,
        body=payload.body,
        format=payload.format,
        model=payload.model,
        sources=payload.sources,
        citations=payload.citations,
        trace_id=payload.trace_id,
        status="completed",
        version=1,
        created_at=int(time.time() * 1000),
        metadata=payload.metadata,
    )
    rid = await storage.reports.save_report(report)
    report.id = rid
    return _to_out(report)


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(
    report_id: str,
    workspace_id: str | None = Query(None),
) -> ReportOut:
    storage = get_storage()
    if storage.reports is None:
        raise HTTPException(503, "Report archive is not configured")
    report = await storage.reports.get_report(report_id, workspace_id)
    if report is None:
        raise HTTPException(404, "Report not found")
    return _to_out(report)


@router.get("", response_model=list[ReportOut])
async def list_reports(
    workspace_id: str = Query(...),
    report_type: str | None = Query(None, description="Filter by ESG report type"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[ReportOut]:
    storage = get_storage()
    if storage.reports is None:
        raise HTTPException(503, "Report archive is not configured")
    reports = await storage.reports.list_reports(workspace_id, limit=limit, offset=offset)
    if report_type:
        reports = [r for r in reports if r.report_type == report_type]
    return [_to_out(r) for r in reports]


@router.post("/aggregate", response_model=ReportOut)
async def aggregate_reports(payload: AggregateRequest) -> ReportOut:
    """Create an aggregate ESG report from existing reports in the library.

    Loads the source reports, builds a structured aggregate body, and stores
    a new report of type `esg_aggregate` (or the type provided) that references
    the source report IDs in metadata.source_report_ids.
    """
    storage = get_storage()
    if storage.reports is None:
        raise HTTPException(503, "Report archive is not configured")

    source_reports: list[GeneratedReport] = []
    for rid in payload.source_report_ids:
        r = await storage.reports.get_report(rid, payload.workspace_id)
        if r is None:
            raise HTTPException(404, f"Source report not found: {rid}")
        if r.workspace_id != payload.workspace_id:
            raise HTTPException(403, f"Report {rid} does not belong to this workspace")
        source_reports.append(r)

    body = _build_aggregate_body(source_reports, payload.instructions)
    meta = dict(payload.metadata or {})
    meta["source_report_ids"] = list(payload.source_report_ids)
    meta["source_count"] = len(source_reports)
    if payload.instructions:
        meta["aggregate_instructions"] = payload.instructions

    # Collect period hints if present on sources
    periods = []
    for r in source_reports:
        m = r.metadata or {}
        if m.get("period_start") or m.get("period_end"):
            periods.append({"start": m.get("period_start"), "end": m.get("period_end"), "report_id": r.id})
    if periods:
        meta["source_periods"] = periods

    report = GeneratedReport(
        id=str(uuid.uuid4()),
        workspace_id=payload.workspace_id,
        user_id=payload.user_id,
        title=payload.title,
        report_type=payload.report_type or "esg_aggregate",
        body=body,
        format=payload.format,
        model=payload.model,
        sources=[{"report_id": r.id, "title": r.title, "report_type": r.report_type} for r in source_reports],
        citations=[],
        trace_id=None,
        status="completed",
        version=1,
        created_at=int(time.time() * 1000),
        metadata=meta,
    )
    rid = await storage.reports.save_report(report)
    report.id = rid
    return _to_out(report)
