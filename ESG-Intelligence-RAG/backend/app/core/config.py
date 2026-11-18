"""Application settings — PostgreSQL only (SQLite removed)."""

from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
from typing import Literal

from cryptography.fernet import Fernet

VectorBackend = Literal["qdrant", "postgres"]


class Settings:
    def __init__(self) -> None:
        self.data_dir = Path(os.getenv("KNOWLEDGEOS_DATA_DIR", "data")).expanduser()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.files_dir = self.data_dir / "files"
        self.files_dir.mkdir(parents=True, exist_ok=True)

        self.postgres_url = (
            os.getenv("KNOWLEDGEOS_POSTGRES_URL")
            or os.getenv("DATABASE_URL")
            or ""
        ).strip()
        if not self.postgres_url:
            self.postgres_url = "postgresql://knowledgeos:knowledgeos@localhost:5432/knowledgeos"

        raw = os.getenv("KNOWLEDGEOS_VECTOR_BACKEND", "qdrant").lower().strip()
        if raw not in ("qdrant", "postgres"):
            raw = "qdrant"
        self.vector_backend: VectorBackend = raw  # type: ignore[assignment]

        self.qdrant_url = os.getenv("KNOWLEDGEOS_QDRANT_URL", "http://localhost:6333").rstrip("/")
        self.qdrant_api_key = os.getenv("KNOWLEDGEOS_QDRANT_API_KEY", "").strip()
        self.qdrant_collection = os.getenv("KNOWLEDGEOS_QDRANT_COLLECTION", "knowledge_chunks")
        self.redis_url = os.getenv("KNOWLEDGEOS_REDIS_URL", "").strip()

        self.ollama_base_url = os.getenv("KNOWLEDGEOS_OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
        self.ollama_embedding_model = os.getenv("KNOWLEDGEOS_OLLAMA_EMBEDDING_MODEL", "all-minilm")
        self.allow_hash_embedding_fallback = os.getenv(
            "KNOWLEDGEOS_ALLOW_HASH_EMBEDDING_FALLBACK", "false"
        ).lower() in ("1", "true", "yes")

        self.auth_secret = os.getenv("KNOWLEDGEOS_AUTH_SECRET", "dev-secret-change-me")
        self.encryption_key = os.getenv("KNOWLEDGEOS_ENCRYPTION_KEY", "")
        if not self.encryption_key:
            derived = hashlib.sha256(self.auth_secret.encode()).digest()
            self.encryption_key = base64.urlsafe_b64encode(derived).decode()
        key_bytes = self.encryption_key.encode() if isinstance(self.encryption_key, str) else self.encryption_key
        self.fernet = Fernet(key_bytes)

        self.allow_anonymous = os.getenv("KNOWLEDGEOS_ALLOW_ANONYMOUS", "true").lower() in ("1", "true", "yes")
        self.cors_origins = [
            o.strip()
            for o in os.getenv(
                "KNOWLEDGEOS_CORS_ORIGINS",
                "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5000,http://localhost:5173,http://localhost:5080",
            ).split(",")
            if o.strip()
        ]
        self.max_upload_bytes = int(os.getenv("KNOWLEDGEOS_MAX_UPLOAD_BYTES", str(512 * 1024 * 1024)))
        self.workers = int(os.getenv("KNOWLEDGEOS_WORKERS", "4"))
        self.chunk_size = int(os.getenv("KNOWLEDGEOS_CHUNK_SIZE", "1200"))
        self.chunk_overlap = int(os.getenv("KNOWLEDGEOS_CHUNK_OVERLAP", "180"))
        self.cache_ttl_seconds = int(os.getenv("KNOWLEDGEOS_CACHE_TTL_SECONDS", str(7 * 86400)))
        self.semantic_cache_enabled = os.getenv("KNOWLEDGEOS_CACHE_SEMANTIC_ENABLED", "false").lower() in ("1", "true", "yes")
        self.nli_enabled = os.getenv("KNOWLEDGEOS_NLI_ENABLED", "true").lower() in ("1", "true", "yes")
        self.archive_reports = os.getenv("KNOWLEDGEOS_ARCHIVE_REPORTS", "true").lower() in ("1", "true", "yes")

    @property
    def use_qdrant(self) -> bool:
        return self.vector_backend == "qdrant"

    @property
    def use_pgvector(self) -> bool:
        return self.vector_backend == "postgres"


SETTINGS = Settings()
