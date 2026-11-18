"""Redis-backed answer cache. Falls back to no-op miss if Redis unavailable.

KNOWLEDGEOS_REDIS_URL=redis://localhost:6379/0
KNOWLEDGEOS_CACHE_TTL_SECONDS=604800
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

_CLIENT = None
_FAILED_UNTIL = 0.0


def _client():
    global _CLIENT, _FAILED_UNTIL
    if time.time() < _FAILED_UNTIL:
        return None
    if _CLIENT is not None:
        return _CLIENT
    url = os.getenv("KNOWLEDGEOS_REDIS_URL", "").strip()
    if not url:
        return None
    try:
        import redis
        c = redis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        c.ping()
        _CLIENT = c
        logger.info("Redis cache connected %s", url)
        return _CLIENT
    except Exception as exc:
        logger.warning("Redis unavailable, cache disabled until retry: %s", exc)
        _FAILED_UNTIL = time.time() + 30
        _CLIENT = None
        return None


def cache_key(
    workspace_id: str,
    index_version: str,
    model_profile_id: str | None,
    prompt_version: str,
    query_hash: str,
) -> str:
    return (
        f"kos:cache:{workspace_id}:{index_version}:"
        f"{model_profile_id or '-'}:{prompt_version}:{query_hash}"
    )


def get_json(key: str) -> dict[str, Any] | None:
    c = _client()
    if c is None:
        return None
    try:
        raw = c.get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Redis get failed: %s", exc)
        return None


def set_json(key: str, value: dict[str, Any], ttl_seconds: int | None = None) -> bool:
    c = _client()
    if c is None:
        return False
    ttl = ttl_seconds if ttl_seconds is not None else int(
        os.getenv("KNOWLEDGEOS_CACHE_TTL_SECONDS", str(7 * 86400))
    )
    try:
        c.setex(key, max(60, ttl), json.dumps(value, ensure_ascii=False))
        return True
    except Exception as exc:
        logger.warning("Redis set failed: %s", exc)
        return False


def delete_prefix(workspace_id: str) -> int:
    c = _client()
    if c is None:
        return 0
    try:
        n = 0
        for key in c.scan_iter(match=f"kos:cache:{workspace_id}:*", count=200):
            c.delete(key)
            n += 1
        return n
    except Exception:
        return 0


def enabled() -> bool:
    return _client() is not None
