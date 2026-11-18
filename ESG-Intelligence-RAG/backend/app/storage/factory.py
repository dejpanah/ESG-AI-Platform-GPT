"""Storage factory — PostgreSQL required; vectors via Qdrant or pgvector.

SQLite has been removed entirely.
"""

from __future__ import annotations

import logging

from app.core.config import SETTINGS
from app.storage.interfaces import StorageFacade
from app.storage.postgres_adapter import (
    PostgresMetadataStore,
    PostgresReportStore,
    PostgresVectorStore,
)

logger = logging.getLogger(__name__)


def create_storage() -> StorageFacade:
    if not SETTINGS.postgres_url:
        raise RuntimeError(
            "KNOWLEDGEOS_POSTGRES_URL is required. SQLite support has been removed."
        )

    vector_backend = SETTINGS.vector_backend
    logger.info(
        "Creating storage: vector_backend=%s, metadata=postgres",
        vector_backend,
    )

    if vector_backend == "qdrant":
        from app.storage.qdrant_adapter import QdrantVectorStore
        vector = QdrantVectorStore()
    else:
        vector = PostgresVectorStore()

    metadata = PostgresMetadataStore()
    reports = PostgresReportStore()
    return StorageFacade(vector=vector, metadata=metadata, reports=reports)


_storage: StorageFacade | None = None


def get_storage() -> StorageFacade:
    global _storage
    if _storage is None:
        _storage = create_storage()
    return _storage


async def init_storage() -> StorageFacade:
    from app.db import init_schema

    init_schema()
    storage = get_storage()
    await storage.init()
    return storage


async def close_storage() -> None:
    global _storage
    if _storage is not None:
        await _storage.close()
        _storage = None
    from app.db import close_pool

    close_pool()
