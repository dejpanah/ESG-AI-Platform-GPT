"""Qdrant VectorStore adapter.

Vectors live in Qdrant. Chunk text/metadata continue to live in MetadataStore
(PostgreSQL). This keeps RAG / chunking / embedding logic unchanged.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Sequence

from app.core.config import SETTINGS
from app.storage.interfaces import ChunkRecord, SearchHit, VectorStore

logger = logging.getLogger(__name__)


def _match_any(rest, values: list):
    try:
        return rest.MatchAny(any=values)
    except TypeError:
        return rest.MatchAny(value=values)



class QdrantVectorStore(VectorStore):
    def __init__(
        self,
        url: str | None = None,
        api_key: str | None = None,
        collection: str | None = None,
    ) -> None:
        self.url = (url or SETTINGS.qdrant_url).rstrip("/")
        self.api_key = api_key if api_key is not None else SETTINGS.qdrant_api_key
        self.collection = collection or SETTINGS.qdrant_collection
        self._client = None
        self._dimension: int | None = None

    def _get_client(self):
        if self._client is None:
            try:
                from qdrant_client import QdrantClient
                from qdrant_client.http import models as rest
            except ImportError as exc:
                raise RuntimeError(
                    "qdrant-client is required for VECTOR_BACKEND=qdrant. "
                    "Install with: pip install qdrant-client"
                ) from exc
            kwargs: dict[str, Any] = {"url": self.url}
            if self.api_key:
                kwargs["api_key"] = self.api_key
            self._client = QdrantClient(**kwargs)
            self._rest = rest
        return self._client

    async def ensure_collection(self, dimension: int, distance: str = "cosine") -> None:
        client = self._get_client()
        rest = self._rest
        existing = [c.name for c in client.get_collections().collections]
        if self.collection in existing:
            self._dimension = dimension
            return
        dist_map = {
            "cosine": rest.Distance.COSINE,
            "euclid": rest.Distance.EUCLID,
            "dot": rest.Distance.DOT,
        }
        client.create_collection(
            collection_name=self.collection,
            vectors_config=rest.VectorParams(
                size=dimension,
                distance=dist_map.get(distance, rest.Distance.COSINE),
            ),
        )
        # Payload indexes for filtering
        for field in ("workspace_id", "document_id", "index_id"):
            try:
                client.create_payload_index(
                    collection_name=self.collection,
                    field_name=field,
                    field_schema=rest.PayloadSchemaType.KEYWORD,
                )
            except Exception:
                pass
        self._dimension = dimension
        logger.info("Created Qdrant collection %s (dim=%s)", self.collection, dimension)

    async def upsert_chunks(self, chunks: Sequence[ChunkRecord], index_id: str | None = None) -> int:
        if not chunks:
            return 0
        client = self._get_client()
        rest = self._rest
        # Infer dimension from first embedding
        dim = None
        for c in chunks:
            if c.embedding:
                dim = len(c.embedding)
                break
        if dim is None:
            return 0
        if self._dimension is None:
            await self.ensure_collection(dim)

        points = []
        for c in chunks:
            if not c.embedding:
                continue
            payload = {
                "workspace_id": c.workspace_id,
                "document_id": c.document_id,
                "chunk_id": c.id,
                "version": c.version,
                "ordinal": c.ordinal,
                "text": c.text[:2000],  # keep payload reasonable
                "section": c.section,
                "tokens": c.tokens,
            }
            if index_id:
                payload["index_id"] = index_id
            points.append(
                rest.PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, c.id)),
                    vector=c.embedding,
                    payload=payload,
                )
            )
        if not points:
            return 0
        # Batch upsert
        batch_size = 100
        written = 0
        for i in range(0, len(points), batch_size):
            batch = points[i : i + batch_size]
            client.upsert(collection_name=self.collection, points=batch, wait=True)
            written += len(batch)
        return written

    async def delete_by_document(self, workspace_id: str, document_id: str) -> int:
        client = self._get_client()
        rest = self._rest
        result = client.delete(
            collection_name=self.collection,
            points_selector=rest.FilterSelector(
                filter=rest.Filter(
                    must=[
                        rest.FieldCondition(key="workspace_id", match=rest.MatchValue(value=workspace_id)),
                        rest.FieldCondition(key="document_id", match=rest.MatchValue(value=document_id)),
                    ]
                )
            ),
        )
        return 0  # Qdrant does not return exact count easily

    async def delete_by_workspace(self, workspace_id: str) -> int:
        client = self._get_client()
        rest = self._rest
        client.delete(
            collection_name=self.collection,
            points_selector=rest.FilterSelector(
                filter=rest.Filter(
                    must=[
                        rest.FieldCondition(key="workspace_id", match=rest.MatchValue(value=workspace_id)),
                    ]
                )
            ),
        )
        return 0

    async def search(
        self,
        workspace_id: str,
        query_vector: list[float],
        top_k: int = 10,
        document_ids: Sequence[str] | None = None,
        index_id: str | None = None,
        score_threshold: float | None = None,
    ) -> list[SearchHit]:
        client = self._get_client()
        rest = self._rest
        must = [
            rest.FieldCondition(key="workspace_id", match=rest.MatchValue(value=workspace_id)),
        ]
        if index_id:
            must.append(rest.FieldCondition(key="index_id", match=rest.MatchValue(value=index_id)))
        if document_ids:
            ids = list(document_ids)
            must.append(rest.FieldCondition(key="document_id", match=_match_any(rest, ids)))
        query_filter = rest.Filter(must=must)
        try:
            results = client.search(
                collection_name=self.collection,
                query_vector=query_vector,
                query_filter=query_filter,
                limit=top_k,
                score_threshold=score_threshold,
                with_payload=True,
            )
        except Exception as exc:
            logger.warning("Qdrant search failed (empty result): %s", exc)
            return []
        hits: list[SearchHit] = []
        for r in results:
            payload = r.payload or {}
            hits.append(
                SearchHit(
                    chunk_id=payload.get("chunk_id", str(r.id)),
                    document_id=payload.get("document_id", ""),
                    workspace_id=workspace_id,
                    text=payload.get("text", ""),
                    score=float(r.score),
                    ordinal=int(payload.get("ordinal", 0)),
                    version=int(payload.get("version", 0)),
                    metadata={k: v for k, v in payload.items() if k not in ("text", "chunk_id")},
                )
            )
        return hits

    async def get_chunk_vectors(
        self, workspace_id: str, chunk_ids: Sequence[str]
    ) -> dict[str, list[float]]:
        if not chunk_ids:
            return {}
        client = self._get_client()
        rest = self._rest
        # Retrieve by filter on chunk_id
        points, _ = client.scroll(
            collection_name=self.collection,
            scroll_filter=rest.Filter(
                must=[
                    rest.FieldCondition(key="workspace_id", match=rest.MatchValue(value=workspace_id)),
                    rest.FieldCondition(key="chunk_id", match=_match_any(rest, list(chunk_ids))),
                ]
            ),
            limit=len(chunk_ids),
            with_vectors=True,
            with_payload=True,
        )
        result: dict[str, list[float]] = {}
        for p in points:
            cid = (p.payload or {}).get("chunk_id")
            if cid and p.vector is not None:
                result[cid] = list(p.vector) if not isinstance(p.vector, dict) else list(p.vector.get("", []))
        return result

    async def count(self, workspace_id: str | None = None) -> int:
        client = self._get_client()
        rest = self._rest
        if workspace_id:
            return client.count(
                collection_name=self.collection,
                count_filter=rest.Filter(
                    must=[rest.FieldCondition(key="workspace_id", match=rest.MatchValue(value=workspace_id))]
                ),
                exact=True,
            ).count
        return client.count(collection_name=self.collection, exact=True).count

    async def close(self) -> None:
        if self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None
