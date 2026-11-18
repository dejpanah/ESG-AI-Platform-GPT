"""Object storage: local disk OR MinIO, selected by env.

KNOWLEDGEOS_OBJECT_STORE=local|minio  (default: local)
When minio:
  KNOWLEDGEOS_MINIO_ENDPOINT=localhost:9000
  KNOWLEDGEOS_MINIO_ACCESS_KEY=knowledgeos
  KNOWLEDGEOS_MINIO_SECRET_KEY=knowledgeossecret
  KNOWLEDGEOS_MINIO_BUCKET=knowledgeos
  KNOWLEDGEOS_MINIO_SECURE=false
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO

logger = logging.getLogger(__name__)


class ObjectStore(ABC):
    @abstractmethod
    def put_file(self, workspace_id: str, filename: str, source: Path | BinaryIO, size_hint: int | None = None) -> str:
        """Store object; return storage key/path used as documents.storage_path."""

    @abstractmethod
    def open_local_path(self, storage_path: str) -> Path:
        """Return a local filesystem path for reading (may download to temp for MinIO)."""

    @abstractmethod
    def delete(self, storage_path: str) -> None:
        ...

    @abstractmethod
    def exists(self, storage_path: str) -> bool:
        ...

    @property
    @abstractmethod
    def backend_name(self) -> str:
        ...


class LocalObjectStore(ObjectStore):
    def __init__(self, root: Path | None = None) -> None:
        self.root = Path(
            root
            or os.getenv("KNOWLEDGEOS_DATA_DIR", "data")
        ).expanduser() / "files"
        self.root.mkdir(parents=True, exist_ok=True)

    @property
    def backend_name(self) -> str:
        return "local"

    def put_file(self, workspace_id: str, filename: str, source: Path | BinaryIO, size_hint: int | None = None) -> str:
        target_dir = self.root / workspace_id
        target_dir.mkdir(parents=True, exist_ok=True)
        safe = Path(filename).name or "upload.bin"
        # unique name if collision
        dest = target_dir / safe
        if dest.exists():
            stem, suf = dest.stem, dest.suffix
            n = 1
            while dest.exists():
                dest = target_dir / f"{stem}_{n}{suf}"
                n += 1
        if isinstance(source, Path):
            import shutil
            shutil.copy2(source, dest)
        else:
            with dest.open("wb") as out:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
        return str(dest.resolve())

    def open_local_path(self, storage_path: str) -> Path:
        p = Path(storage_path)
        if not p.exists():
            raise FileNotFoundError(storage_path)
        return p

    def delete(self, storage_path: str) -> None:
        p = Path(storage_path)
        if p.exists():
            p.unlink()

    def exists(self, storage_path: str) -> bool:
        return Path(storage_path).exists()


class MinioObjectStore(ObjectStore):
    def __init__(self) -> None:
        try:
            from minio import Minio
        except ImportError as exc:
            raise RuntimeError(
                "minio package required for KNOWLEDGEOS_OBJECT_STORE=minio. "
                "pip install minio"
            ) from exc
        endpoint = os.getenv("KNOWLEDGEOS_MINIO_ENDPOINT", "localhost:9000")
        access = os.getenv("KNOWLEDGEOS_MINIO_ACCESS_KEY", "knowledgeos")
        secret = os.getenv("KNOWLEDGEOS_MINIO_SECRET_KEY", "knowledgeossecret")
        secure = os.getenv("KNOWLEDGEOS_MINIO_SECURE", "false").lower() in ("1", "true", "yes")
        self.bucket = os.getenv("KNOWLEDGEOS_MINIO_BUCKET", "knowledgeos")
        self._client = Minio(endpoint, access_key=access, secret_key=secret, secure=secure)
        if not self._client.bucket_exists(self.bucket):
            self._client.make_bucket(self.bucket)
        self._tmp = Path(tempfile.gettempdir()) / "knowledgeos-minio-cache"
        self._tmp.mkdir(parents=True, exist_ok=True)
        logger.info("MinIO object store ready bucket=%s endpoint=%s", self.bucket, endpoint)

    @property
    def backend_name(self) -> str:
        return "minio"

    def _key(self, workspace_id: str, filename: str) -> str:
        safe = Path(filename).name or "upload.bin"
        digest = hashlib.sha1(f"{workspace_id}:{safe}:{os.urandom(4).hex()}".encode()).hexdigest()[:10]
        return f"{workspace_id}/{digest}_{safe}"

    def put_file(self, workspace_id: str, filename: str, source: Path | BinaryIO, size_hint: int | None = None) -> str:
        key = self._key(workspace_id, filename)
        if isinstance(source, Path):
            size = source.stat().st_size
            with source.open("rb") as fh:
                self._client.put_object(self.bucket, key, fh, size)
        else:
            # write to temp then upload for unknown size streams
            tmp = self._tmp / Path(key).name
            with tmp.open("wb") as out:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
            size = tmp.stat().st_size
            with tmp.open("rb") as fh:
                self._client.put_object(self.bucket, key, fh, size)
            tmp.unlink(missing_ok=True)
        return f"minio://{self.bucket}/{key}"

    def open_local_path(self, storage_path: str) -> Path:
        if not storage_path.startswith("minio://"):
            # allow legacy local paths during migration
            p = Path(storage_path)
            if p.exists():
                return p
            raise FileNotFoundError(storage_path)
        # minio://bucket/key
        rest = storage_path[len("minio://"):]
        bucket, _, key = rest.partition("/")
        local = self._tmp / hashlib.sha1(storage_path.encode()).hexdigest() / Path(key).name
        local.parent.mkdir(parents=True, exist_ok=True)
        if not local.exists():
            self._client.fget_object(bucket or self.bucket, key, str(local))
        return local

    def delete(self, storage_path: str) -> None:
        if not storage_path.startswith("minio://"):
            return
        rest = storage_path[len("minio://"):]
        bucket, _, key = rest.partition("/")
        try:
            self._client.remove_object(bucket or self.bucket, key)
        except Exception as exc:
            logger.warning("MinIO delete failed %s: %s", storage_path, exc)

    def exists(self, storage_path: str) -> bool:
        if not storage_path.startswith("minio://"):
            return Path(storage_path).exists()
        rest = storage_path[len("minio://"):]
        bucket, _, key = rest.partition("/")
        try:
            self._client.stat_object(bucket or self.bucket, key)
            return True
        except Exception:
            return False


_STORE: ObjectStore | None = None


def get_object_store() -> ObjectStore:
    global _STORE
    if _STORE is not None:
        return _STORE
    mode = os.getenv("KNOWLEDGEOS_OBJECT_STORE", "local").lower().strip()
    if mode == "minio":
        _STORE = MinioObjectStore()
    else:
        _STORE = LocalObjectStore()
    logger.info("Object store backend=%s", _STORE.backend_name)
    return _STORE
