"""Bootstrap storage layer and optionally mount extra routers onto the main app.

Usage from backend/main.py (optional, non-breaking):

    from app.bootstrap import attach_enterprise
    attach_enterprise(app)
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

logger = logging.getLogger(__name__)


async def _startup() -> None:
    try:
        from app.storage.factory import init_storage
        await init_storage()
        logger.info("Enterprise storage layer initialized")
    except Exception as exc:
        logger.warning("Enterprise storage init failed (falling back to legacy): %s", exc)


async def _shutdown() -> None:
    try:
        from app.storage.factory import close_storage
        await close_storage()
    except Exception:
        pass


def attach_enterprise(app: FastAPI) -> None:
    """Mount report routes and hook storage lifecycle. Safe to call multiple times."""
    # Mount report API
    try:
        from app.api.reports import router as reports_router
        app.include_router(reports_router)
        logger.info("Mounted /api/v1/reports")
    except Exception as exc:
        logger.warning("Could not mount reports router: %s", exc)

    try:
        from app.api.esg_reports import router as esg_router
        app.include_router(esg_router)
        logger.info("Mounted /api/v1/esg")
    except Exception as exc:
        logger.warning("Could not mount ESG reports router: %s", exc)

    try:
        from app.api.esg_crud import router as esg_crud_router
        app.include_router(esg_crud_router)
        logger.info("Mounted /api/v1/esg/tables CRUD")
    except Exception as exc:
        logger.warning("Could not mount ESG CRUD router: %s", exc)

    # Combine with existing lifespan if present
    original = getattr(app, "router", None)
    # Simple: register startup/shutdown events (compatible with older FastAPI)
    app.add_event_handler("startup", _startup)
    app.add_event_handler("shutdown", _shutdown)
