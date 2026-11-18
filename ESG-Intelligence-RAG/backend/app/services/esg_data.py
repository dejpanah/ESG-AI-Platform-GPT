"""Query structured ESG metrics from Postgres for report generation."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.db import db


def _period_filter(from_date: str | None, to_date: str | None) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if from_date:
        clauses.append("from_date >= %s")
        params.append(from_date)
    if to_date:
        clauses.append("to_date <= %s")
        params.append(to_date)
    if not clauses:
        return "", params
    return " AND " + " AND ".join(clauses), params


def fetch_environmental_summary(
    workspace_id: str,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    """Aggregate key environmental metrics for a workspace/period."""
    pf, params = _period_filter(from_date, to_date)
    base = [workspace_id] + params
    out: dict[str, Any] = {"pillar": "environmental", "workspace_id": workspace_id}

    with db() as conn:
        # CO2
        rows = conn.execute(
            f"SELECT SUM(value) AS total, COUNT(*) AS n FROM esg_co2_emission "
            f"WHERE workspace_id=%s{pf}",
            base,
        ).fetchall()
        out["co2_emission"] = {"total": float(rows[0]["total"] or 0), "records": int(rows[0]["n"] or 0)}

        # GHG by gas type
        rows = conn.execute(
            f"""SELECT g.title AS gas, SUM(e.value) AS total
                FROM esg_ghg_emissions e
                JOIN esg_gas_type g ON g.id = e.gas_type_id
                WHERE e.workspace_id=%s{pf}
                GROUP BY g.title ORDER BY total DESC""",
            base,
        ).fetchall()
        out["ghg_by_gas"] = [{"gas": r["gas"], "total": float(r["total"] or 0)} for r in rows]

        # Energy by source
        rows = conn.execute(
            f"""SELECT s.title AS source, t.title AS energy_type, SUM(e.value) AS total
                FROM esg_energy_consumption e
                JOIN esg_energy_source s ON s.id = e.energy_source_id
                JOIN esg_energy_type t ON t.id = s.energy_type_id
                WHERE e.workspace_id=%s{pf}
                GROUP BY s.title, t.title ORDER BY total DESC""",
            base,
        ).fetchall()
        out["energy"] = [
            {"source": r["source"], "type": r["energy_type"], "total": float(r["total"] or 0)}
            for r in rows
        ]

        # Water
        rows = conn.execute(
            f"SELECT SUM(total) AS total FROM esg_total_water_consumption WHERE workspace_id=%s{pf}",
            base,
        ).fetchall()
        out["water_total"] = float(rows[0]["total"] or 0) if rows else 0.0

        rows = conn.execute(
            f"SELECT SUM(total_reuse) AS total FROM esg_water_reuse WHERE workspace_id=%s{pf}",
            base,
        ).fetchall()
        out["water_reuse"] = float(rows[0]["total"] or 0) if rows else 0.0

        # Waste
        rows = conn.execute(
            f"""SELECT w.title AS waste_type, s.title AS source_type, SUM(e.total_waste) AS total
                FROM esg_waste_generation e
                JOIN esg_waste_type w ON w.id = e.waste_type_id
                JOIN esg_source_type s ON s.id = e.source_type_id
                WHERE e.workspace_id=%s{pf}
                GROUP BY w.title, s.title ORDER BY total DESC""",
            base,
        ).fetchall()
        out["waste"] = [
            {"waste_type": r["waste_type"], "source_type": r["source_type"], "total": float(r["total"] or 0)}
            for r in rows
        ]

        # Business travel
        rows = conn.execute(
            f"""SELECT t.title AS travel_type, SUM(e.total_distance_traveled) AS distance,
                       SUM(e.total_air_travel) AS air
                FROM esg_business_travel_emission e
                JOIN esg_travel_type t ON t.id = e.travel_type_id
                WHERE e.workspace_id=%s{pf}
                GROUP BY t.title""",
            base,
        ).fetchall()
        out["business_travel"] = [
            {"travel_type": r["travel_type"], "distance": float(r["distance"] or 0), "air": int(r["air"] or 0)}
            for r in rows
        ]

    return out


def fetch_social_summary(
    workspace_id: str,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    """Aggregate workforce / diversity metrics."""
    pf, params = _period_filter(from_date, to_date)
    base = [workspace_id] + params
    out: dict[str, Any] = {"pillar": "social", "workspace_id": workspace_id}

    with db() as conn:
        rows = conn.execute(
            f"""SELECT g.title AS gender, SUM(e.total_employees) AS total
                FROM esg_gender_demographic e
                JOIN esg_gender g ON g.id = e.gender_id
                WHERE e.workspace_id=%s{pf}
                GROUP BY g.title""",
            base,
        ).fetchall()
        out["by_gender"] = [{"gender": r["gender"], "total": int(r["total"] or 0)} for r in rows]

        rows = conn.execute(
            f"""SELECT a.title AS age_bracket, SUM(e.total_employees) AS total
                FROM esg_age_demographic e
                JOIN esg_various_age_brackets a ON a.id = e.various_age_bracket_id
                WHERE e.workspace_id=%s{pf}
                GROUP BY a.title""",
            base,
        ).fetchall()
        out["by_age"] = [{"age_bracket": r["age_bracket"], "total": int(r["total"] or 0)} for r in rows]

        rows = conn.execute(
            f"""SELECT disability, SUM(total_employees) AS total
                FROM esg_disability_demographic WHERE workspace_id=%s{pf}
                GROUP BY disability""",
            base,
        ).fetchall()
        out["disability"] = [
            {"disability": bool(r["disability"]), "total": int(r["total"] or 0)} for r in rows
        ]

        rows = conn.execute(
            f"""SELECT lgbt, SUM(total_employees) AS total
                FROM esg_lgbt_demographic WHERE workspace_id=%s{pf}
                GROUP BY lgbt""",
            base,
        ).fetchall()
        out["lgbt"] = [{"lgbt": bool(r["lgbt"]), "total": int(r["total"] or 0)} for r in rows]

        rows = conn.execute(
            f"SELECT SUM(value) AS total FROM esg_hiring_numbers WHERE workspace_id=%s{pf}",
            base,
        ).fetchall()
        out["hiring"] = int(rows[0]["total"] or 0) if rows else 0

        rows = conn.execute(
            f"""SELECT c.title AS country, SUM(e.total_employees) AS total
                FROM esg_racial_and_ethnic e
                JOIN esg_country c ON c.id = e.country_id
                WHERE e.workspace_id=%s{pf}
                GROUP BY c.title ORDER BY total DESC""",
            base,
        ).fetchall()
        out["by_country"] = [{"country": r["country"], "total": int(r["total"] or 0)} for r in rows]

    return out


def fetch_esg_snapshot(
    workspace_id: str,
    from_date: str | None = None,
    to_date: str | None = None,
    pillars: list[str] | None = None,
) -> dict[str, Any]:
    pillars = pillars or ["environmental", "social"]
    snap: dict[str, Any] = {
        "workspace_id": workspace_id,
        "from_date": from_date,
        "to_date": to_date,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
    if "environmental" in pillars:
        snap["environmental"] = fetch_environmental_summary(workspace_id, from_date, to_date)
    if "social" in pillars:
        snap["social"] = fetch_social_summary(workspace_id, from_date, to_date)
    # Governance tables not present in source schema yet
    if "governance" in pillars:
        snap["governance"] = {"note": "No structured governance metrics tables in current schema"}
    return snap
