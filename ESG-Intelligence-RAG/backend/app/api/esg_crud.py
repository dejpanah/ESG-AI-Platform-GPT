"""Generic CRUD API for all ESG Postgres tables.

External systems and the .NET data-entry UI call these endpoints to push/pull
structured ESG metrics.

Routes:
  GET    /api/v1/esg/tables                         — catalog
  GET    /api/v1/esg/tables/{table}                 — list rows
  GET    /api/v1/esg/tables/{table}/{id}            — get one
  POST   /api/v1/esg/tables/{table}                 — create one
  POST   /api/v1/esg/tables/{table}/bulk            — bulk create
  PUT    /api/v1/esg/tables/{table}/{id}            — update
  DELETE /api/v1/esg/tables/{table}/{id}            — delete
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import db
from app.services.esg_tables import ESG_TABLES, get_table_meta, list_table_names

router = APIRouter(prefix="/api/v1/esg/tables", tags=["esg-crud"])


def _row_to_dict(row: Any) -> dict[str, Any]:
    if row is None:
        return {}
    if isinstance(row, dict):
        return dict(row)
    try:
        return dict(row)
    except Exception:
        return {k: row[k] for k in row.keys()}  # type: ignore[attr-defined]


def _validate_table(table: str) -> dict[str, Any]:
    meta = get_table_meta(table)
    if meta is None:
        raise HTTPException(404, f"Unknown ESG table: {table}. Known: {', '.join(list_table_names())}")
    return meta


def _filter_payload(meta: dict[str, Any], payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
    writable = set(meta["writable"])
    cleaned = {k: v for k, v in payload.items() if k in writable and v is not None}
    if not partial:
        for req in meta.get("required", []):
            if req not in cleaned:
                # workspace_id may be injected later for facts
                if req == "workspace_id":
                    continue
                raise HTTPException(422, f"Missing required field: {req}")
    return cleaned


@router.get("")
async def catalog() -> dict[str, Any]:
    items = []
    for name, meta in sorted(ESG_TABLES.items()):
        items.append(
            {
                "table": name,
                "kind": meta["kind"],
                "writable": meta["writable"],
                "required": meta["required"],
            }
        )
    return {"tables": items, "count": len(items)}


@router.get("/{table}")
async def list_rows(
    table: str,
    workspace_id: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    meta = _validate_table(table)
    sql = f"SELECT * FROM {table}"
    params: list[Any] = []
    clauses: list[str] = []
    if meta["kind"] == "fact":
        if not workspace_id:
            raise HTTPException(422, "workspace_id is required for fact tables")
        clauses.append("workspace_id = %s")
        params.append(workspace_id)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
        count_sql = f"SELECT COUNT(*) AS c FROM {table}"
        count_params: list[Any] = []
        if meta["kind"] == "fact":
            count_sql += " WHERE workspace_id = %s"
            count_params.append(workspace_id)
        total = conn.execute(count_sql, count_params).fetchone()["c"]
    return {
        "table": table,
        "items": [_row_to_dict(r) for r in rows],
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }


@router.get("/{table}/{row_id}")
async def get_row(table: str, row_id: int, workspace_id: str | None = Query(None)) -> dict[str, Any]:
    meta = _validate_table(table)
    sql = f"SELECT * FROM {table} WHERE id = %s"
    params: list[Any] = [row_id]
    if meta["kind"] == "fact" and workspace_id:
        sql += " AND workspace_id = %s"
        params.append(workspace_id)
    with db() as conn:
        row = conn.execute(sql, params).fetchone()
    if row is None:
        raise HTTPException(404, "Row not found")
    return _row_to_dict(row)


@router.post("/{table}")
async def create_row(table: str, payload: dict[str, Any]) -> dict[str, Any]:
    meta = _validate_table(table)
    data = _filter_payload(meta, payload)
    if meta["kind"] == "fact":
        data.setdefault("workspace_id", payload.get("workspace_id") or "default")
        data.setdefault("user_id", payload.get("user_id") or "")
        if "workspace_id" not in data or not data["workspace_id"]:
            raise HTTPException(422, "workspace_id is required for fact tables")
    if not data:
        raise HTTPException(422, "No writable fields provided")
    cols = list(data.keys())
    placeholders = ", ".join(["%s"] * len(cols))
    col_sql = ", ".join(cols)
    sql = f"INSERT INTO {table} ({col_sql}) VALUES ({placeholders}) RETURNING *"
    with db() as conn:
        row = conn.execute(sql, [data[c] for c in cols]).fetchone()
        conn.commit()
    return _row_to_dict(row)


class BulkCreate(BaseModel):
    items: list[dict[str, Any]] = Field(..., min_length=1, max_length=500)
    workspace_id: str | None = None
    user_id: str | None = None


@router.post("/{table}/bulk")
async def bulk_create(table: str, body: BulkCreate) -> dict[str, Any]:
    meta = _validate_table(table)
    created: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    with db() as conn:
        for i, item in enumerate(body.items):
            try:
                data = _filter_payload(meta, item)
                if meta["kind"] == "fact":
                    data.setdefault("workspace_id", body.workspace_id or item.get("workspace_id") or "default")
                    data.setdefault("user_id", body.user_id or item.get("user_id") or "")
                if not data:
                    raise ValueError("empty payload")
                cols = list(data.keys())
                placeholders = ", ".join(["%s"] * len(cols))
                col_sql = ", ".join(cols)
                sql = f"INSERT INTO {table} ({col_sql}) VALUES ({placeholders}) RETURNING *"
                row = conn.execute(sql, [data[c] for c in cols]).fetchone()
                created.append(_row_to_dict(row))
            except Exception as exc:
                errors.append({"index": i, "error": str(exc)})
        conn.commit()
    return {"table": table, "created": len(created), "items": created, "errors": errors}


@router.put("/{table}/{row_id}")
async def update_row(table: str, row_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    meta = _validate_table(table)
    data = _filter_payload(meta, payload, partial=True)
    # never allow changing primary key; workspace_id change optional but kept if sent
    if not data:
        raise HTTPException(422, "No updatable fields provided")
    sets = ", ".join(f"{k} = %s" for k in data)
    sql = f"UPDATE {table} SET {sets} WHERE id = %s RETURNING *"
    params = list(data.values()) + [row_id]
    with db() as conn:
        row = conn.execute(sql, params).fetchone()
        if row is None:
            raise HTTPException(404, "Row not found")
        conn.commit()
    return _row_to_dict(row)


@router.delete("/{table}/{row_id}")
async def delete_row(table: str, row_id: int, workspace_id: str | None = Query(None)) -> dict[str, Any]:
    meta = _validate_table(table)
    sql = f"DELETE FROM {table} WHERE id = %s"
    params: list[Any] = [row_id]
    if meta["kind"] == "fact" and workspace_id:
        sql += " AND workspace_id = %s"
        params.append(workspace_id)
    sql += " RETURNING id"
    with db() as conn:
        row = conn.execute(sql, params).fetchone()
        if row is None:
            raise HTTPException(404, "Row not found")
        conn.commit()
    return {"deleted": True, "id": row_id, "table": table}
