"""Storage abstraction interfaces.

Changing the Vector Database must NOT change RAG, Chunking, Embedding or
Retrieval logic in higher layers. All concrete adapters implement these
contracts.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional, Sequence


@dataclass
class ChunkRecord:
    id: str
    workspace_id: str
    document_id: str
    version: int
    ordinal: int
    text: str
    line_start: int = 0
    line_end: int = 0
    section: str | None = None
    symbol: str | None = None
    tokens: int = 0
    embedding: list[float] | None = None
    superseded: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class DocumentRecord:
    id: str
    workspace_id: str
    filename: str
    path: str
    storage_path: str
    extension: str
    language: str
    size_bytes: int
    content_hash: str
    status: str
    updated_at: int
    indexed_at: int | None = None
    version: int = 0
    parser: str | None = None
    chunker: str | None = None
    embedding: str | None = None
    error: str | None = None
    progress: float | None = None
    stage: str | None = None
    deleted_at: int | None = None
    chunks: int = 0


@dataclass
class SearchHit:
    chunk_id: str
    document_id: str
    workspace_id: str
    text: str
    score: float
    ordinal: int = 0
    version: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class GeneratedReport:
    id: str
    workspace_id: str
    user_id: str | None
    title: str
    report_type: str
    body: str  # full text (markdown / html / json)
    format: str  # markdown | html | json
    model: str
    sources: list[dict[str, Any]] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)
    trace_id: str | None = None
    status: str = "completed"
    version: int = 1
    created_at: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConversationMessage:
    id: str
    conversation_id: str
    role: str  # user | assistant | system
    content: str
    created_at: int
    model: str | None = None
    citations: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


class VectorStore(ABC):
    """Dense vector search and storage. Backend-agnostic."""

    @abstractmethod
    async def ensure_collection(self, dimension: int, distance: str = "cosine") -> None:
        ...

    @abstractmethod
    async def upsert_chunks(self, chunks: Sequence[ChunkRecord], index_id: str | None = None) -> int:
        """Insert or update chunk vectors. Returns number of vectors written."""
        ...

    @abstractmethod
    async def delete_by_document(self, workspace_id: str, document_id: str) -> int:
        ...

    @abstractmethod
    async def delete_by_workspace(self, workspace_id: str) -> int:
        ...

    @abstractmethod
    async def search(
        self,
        workspace_id: str,
        query_vector: list[float],
        top_k: int = 10,
        document_ids: Sequence[str] | None = None,
        index_id: str | None = None,
        score_threshold: float | None = None,
    ) -> list[SearchHit]:
        ...

    @abstractmethod
    async def get_chunk_vectors(
        self, workspace_id: str, chunk_ids: Sequence[str]
    ) -> dict[str, list[float]]:
        ...

    @abstractmethod
    async def count(self, workspace_id: str | None = None) -> int:
        ...

    async def close(self) -> None:
        pass


class MetadataStore(ABC):
    """Relational / operational metadata (documents, jobs, indexes, providers…)."""

    @abstractmethod
    async def init_schema(self) -> None:
        ...

    @abstractmethod
    async def upsert_document(self, doc: DocumentRecord) -> None:
        ...

    @abstractmethod
    async def get_document(self, workspace_id: str, document_id: str) -> DocumentRecord | None:
        ...

    @abstractmethod
    async def list_documents(self, workspace_id: str, include_deleted: bool = False) -> list[DocumentRecord]:
        ...

    @abstractmethod
    async def soft_delete_document(self, workspace_id: str, document_id: str) -> None:
        ...

    @abstractmethod
    async def upsert_chunks_metadata(self, chunks: Sequence[ChunkRecord]) -> int:
        """Store chunk text + metadata (not vectors)."""
        ...

    @abstractmethod
    async def get_chunks_for_document(
        self, workspace_id: str, document_id: str, version: int | None = None
    ) -> list[ChunkRecord]:
        ...

    @abstractmethod
    async def sparse_search(
        self,
        workspace_id: str,
        query: str,
        top_k: int = 20,
        document_ids: Sequence[str] | None = None,
    ) -> list[SearchHit]:
        """Full-text / sparse retrieval (FTS5 or PostgreSQL FTS)."""
        ...

    @abstractmethod
    async def close(self) -> None:
        ...


class ReportStore(ABC):
    """Archive of generated reports, conversations and query traces."""

    @abstractmethod
    async def init_schema(self) -> None:
        ...

    @abstractmethod
    async def save_report(self, report: GeneratedReport) -> str:
        """Persist report and return its id."""
        ...

    @abstractmethod
    async def get_report(self, report_id: str, workspace_id: str | None = None) -> GeneratedReport | None:
        ...

    @abstractmethod
    async def list_reports(
        self, workspace_id: str, limit: int = 50, offset: int = 0
    ) -> list[GeneratedReport]:
        ...

    @abstractmethod
    async def save_conversation_message(self, msg: ConversationMessage) -> None:
        ...

    @abstractmethod
    async def list_conversation_messages(
        self, conversation_id: str, limit: int = 100
    ) -> list[ConversationMessage]:
        ...

    @abstractmethod
    async def save_query_trace(self, trace: dict[str, Any]) -> None:
        ...

    @abstractmethod
    async def close(self) -> None:
        ...


class StorageFacade:
    """Unified access point used by higher layers (RAG, jobs, API)."""

    def __init__(
        self,
        vector: VectorStore,
        metadata: MetadataStore,
        reports: ReportStore | None = None,
    ) -> None:
        self.vector = vector
        self.metadata = metadata
        self.reports = reports

    async def init(self) -> None:
        await self.metadata.init_schema()
        if self.reports is not None:
            await self.reports.init_schema()
        # Vector collection is created lazily on first upsert when dimension is known

    async def close(self) -> None:
        await self.vector.close()
        await self.metadata.close()
        if self.reports is not None:
            await self.reports.close()
