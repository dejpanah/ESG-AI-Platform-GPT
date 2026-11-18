"""Sync helpers bridging main.py (sync) to async VectorStore.

Dense vectors live only in Qdrant or pgvector — not in embedding_json for search.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Sequence

from app.storage.interfaces import ChunkRecord, SearchHit

logger = logging.getLogger(__name__)


def _run(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        # Inside async context — use a dedicated thread/loop
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    return asyncio.run(coro)


def ensure_vector_collection(dimension: int) -> None:
    from app.storage.factory import get_storage

    async def _go():
        await get_storage().vector.ensure_collection(dimension)

    try:
        _run(_go())
    except Exception as exc:
        logger.warning("ensure_collection failed: %s", exc)


def upsert_chunk_vectors(
    records: Sequence[dict[str, Any]],
    index_id: str | None = None,
) -> int:
    """records: id, workspace_id, document_id, version, ordinal, text, embedding, ..."""
    from app.storage.factory import get_storage

    chunks: list[ChunkRecord] = []
    for r in records:
        emb = r.get("embedding")
        if not emb:
            continue
        chunks.append(
            ChunkRecord(
                id=r["id"],
                workspace_id=r["workspace_id"],
                document_id=r["document_id"],
                version=int(r.get("version") or 0),
                ordinal=int(r.get("ordinal") or 0),
                text=r.get("text") or "",
                line_start=int(r.get("line_start") or 0),
                line_end=int(r.get("line_end") or 0),
                section=r.get("section"),
                symbol=r.get("symbol"),
                tokens=int(r.get("tokens") or 0),
                embedding=list(emb),
                metadata={"model": r.get("model") or ""},
            )
        )
    if not chunks:
        return 0

    async def _go():
        store = get_storage()
        dim = len(chunks[0].embedding or [])
        if dim:
            await store.vector.ensure_collection(dim)
        return await store.vector.upsert_chunks(chunks, index_id=index_id)

    try:
        return int(_run(_go()) or 0)
    except Exception as exc:
        logger.error("vector upsert failed: %s", exc)
        raise


def delete_document_vectors(workspace_id: str, document_id: str) -> None:
    from app.storage.factory import get_storage

    async def _go():
        await get_storage().vector.delete_by_document(workspace_id, document_id)

    try:
        _run(_go())
    except Exception as exc:
        logger.warning("vector delete_by_document failed: %s", exc)


def dense_search(
    workspace_id: str,
    query_vector: list[float],
    top_k: int = 30,
    document_ids: Sequence[str] | None = None,
    index_id: str | None = None,
    score_threshold: float | None = None,
) -> list[SearchHit]:
    from app.storage.factory import get_storage

    async def _go():
        return await get_storage().vector.search(
            workspace_id=workspace_id,
            query_vector=query_vector,
            top_k=top_k,
            document_ids=(list(document_ids) if document_ids else None),
            index_id=index_id,
            score_threshold=score_threshold,
        )

    try:
        return list(_run(_go()) or [])
    except Exception as exc:
        logger.error("vector search failed: %s", exc)
        return []
