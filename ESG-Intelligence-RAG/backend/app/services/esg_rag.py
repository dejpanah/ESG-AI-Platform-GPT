"""Lightweight document retrieval for ESG report generation.

Uses PostgreSQL full-text search on indexed chunks so generate-report can
auto-fill document_context without requiring the full chat pipeline / embeddings.
Falls back gracefully when no documents are indexed.
"""

from __future__ import annotations

from typing import Any

from app.db import db


def build_retrieval_query(title: str, report_type: str, instructions: str | None, pillars: list[str] | None) -> str:
    parts = [title or ""]
    if instructions:
        parts.append(instructions)
    if report_type:
        parts.append(report_type.replace("_", " "))
    if pillars:
        parts.extend(pillars)
    # ESG keyword boosters
    parts.extend(["ESG", "sustainability", "emission", "energy", "diversity", "governance"])
    return " ".join(p for p in parts if p).strip() or "ESG sustainability report"


def retrieve_document_context(
    workspace_id: str,
    query: str,
    *,
    top_k: int = 12,
    max_chars: int = 12000,
) -> tuple[str, list[dict[str, Any]]]:
    """Return (joined_text, citation_dicts) from FTS over chunks."""
    citations: list[dict[str, Any]] = []
    snippets: list[str] = []
    try:
        with db() as conn:
            sql = """
              SELECT c.id AS chunk_id, c.text, c.document_id, c.ordinal,
                     d.filename, d.path,
                     ts_rank(c.text_tsv, plainto_tsquery('simple', %s)) AS rank
              FROM chunks c
              JOIN documents d ON d.id = c.document_id
              WHERE c.workspace_id = %s
                AND c.superseded = 0
                AND d.deleted_at IS NULL
                AND c.text_tsv @@ plainto_tsquery('simple', %s)
              ORDER BY rank DESC
              LIMIT %s
            """
            rows = conn.execute(sql, (query, workspace_id, query, top_k)).fetchall()
            if not rows:
                # Fallback: recent chunks if FTS matches nothing
                rows = conn.execute(
                    """
                    SELECT c.id AS chunk_id, c.text, c.document_id, c.ordinal,
                           d.filename, d.path, 0.0 AS rank
                    FROM chunks c
                    JOIN documents d ON d.id = c.document_id
                    WHERE c.workspace_id = %s AND c.superseded = 0 AND d.deleted_at IS NULL
                    ORDER BY c.id DESC
                    LIMIT %s
                    """,
                    (workspace_id, min(top_k, 6)),
                ).fetchall()
    except Exception:
        return "", []

    total = 0
    for r in rows:
        text = (r["text"] or "").strip()
        if not text:
            continue
        fname = r.get("filename") or "document"
        header = f"[{fname}#{r.get('ordinal', 0)}]"
        block = f"{header}\n{text}"
        if total + len(block) > max_chars:
            remain = max_chars - total
            if remain > 200:
                snippets.append(block[:remain] + "…")
            break
        snippets.append(block)
        total += len(block)
        citations.append(
            {
                "chunk_id": str(r["chunk_id"]),
                "document_id": str(r["document_id"]),
                "filename": fname,
                "path": r.get("path"),
                "ordinal": r.get("ordinal"),
                "score": float(r.get("rank") or 0),
                "excerpt": text[:240],
            }
        )
    return "\n\n---\n\n".join(snippets), citations
