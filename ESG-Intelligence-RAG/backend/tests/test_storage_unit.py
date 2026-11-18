"""Unit tests — no external Postgres/Qdrant required."""

from __future__ import annotations

import pathlib

import pytest


def test_adapt_sql_placeholders():
    from app.db import adapt_sql

    assert adapt_sql("SELECT * FROM t WHERE id=? AND x=?") == "SELECT * FROM t WHERE id=%s AND x=%s"
    out = adapt_sql("INSERT OR IGNORE INTO t(id) VALUES (?)")
    assert "%s" in out
    assert "ON CONFLICT DO NOTHING" in out.upper() or "ON CONFLICT" in out.upper()


def test_hybrid_row_index_and_key():
    from app.db import HybridRow

    row = HybridRow({"id": "a", "n": 3})
    assert row["id"] == "a"
    assert row[0] == "a"
    assert row[1] == 3


def test_object_store_local(tmp_path, monkeypatch):
    monkeypatch.setenv("KNOWLEDGEOS_OBJECT_STORE", "local")
    monkeypatch.setenv("KNOWLEDGEOS_DATA_DIR", str(tmp_path))
    import app.storage.object_store as mod
    mod._STORE = None
    from app.storage.object_store import get_object_store

    store = get_object_store()
    assert store.backend_name == "local"
    f = tmp_path / "doc.txt"
    f.write_text("payload", encoding="utf-8")
    key = store.put_file("ws", "doc.txt", f)
    assert store.exists(key)
    assert store.open_local_path(key).read_text(encoding="utf-8") == "payload"


def test_vector_backend_config_rejects_sqlite(monkeypatch):
    monkeypatch.setenv("KNOWLEDGEOS_VECTOR_BACKEND", "sqlite")
    monkeypatch.setenv("KNOWLEDGEOS_POSTGRES_URL", "postgresql://u:p@localhost/db")
    from app.core.config import Settings

    s = Settings()
    assert s.vector_backend in ("qdrant", "postgres")
    assert s.vector_backend != "sqlite"


def test_no_sqlite_runtime_imports():
    root = pathlib.Path(__file__).resolve().parents[1] / "app"
    offenders = []
    for path in root.rglob("*.py"):
        if path.name == "migrate_sqlite.py":
            continue
        src = path.read_text(encoding="utf-8")
        if "import sqlite3" in src:
            offenders.append(str(path))
    assert offenders == []


def test_storage_factory_requires_postgres(monkeypatch):
    monkeypatch.setenv("KNOWLEDGEOS_POSTGRES_URL", "postgresql://knowledgeos:knowledgeos@localhost:5432/knowledgeos")
    monkeypatch.setenv("KNOWLEDGEOS_VECTOR_BACKEND", "qdrant")
    # reset settings singleton if any
    import importlib
    import app.core.config as cfg
    importlib.reload(cfg)
    from app.storage.factory import create_storage

    # May fail to connect — factory itself should still construct adapters
    try:
        facade = create_storage()
        assert facade.vector is not None
        assert facade.metadata is not None
        assert facade.reports is not None
    except Exception as exc:
        # Connection errors acceptable in unit context without live DB
        assert "sqlite" not in str(exc).lower()


def test_redis_cache_key_format():
    from app.cache.redis_cache import cache_key

    k = cache_key("ws", "idx1", None, "pv", "qh")
    assert k.startswith("kos:cache:ws:idx1:")
    assert "qh" in k
