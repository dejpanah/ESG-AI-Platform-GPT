"""Seed sample ESG dimension + fact data.

Usage:
  cd backend && PYTHONPATH=. python -m app.seed_esg
  # or with explicit workspace:
  KNOWLEDGEOS_SEED_WORKSPACE=default PYTHONPATH=. python -m app.seed_esg
"""

from __future__ import annotations

import os
import sys

from app.db import db, init_schema


def _upsert_dim(conn, table: str, title: str, extra: dict | None = None) -> int:
    row = conn.execute(f"SELECT id FROM {table} WHERE title = %s LIMIT 1", (title,)).fetchone()
    if row:
        return int(row["id"])
    cols = ["title"]
    vals = [title]
    if extra:
        for k, v in extra.items():
            cols.append(k)
            vals.append(v)
    col_sql = ", ".join(cols)
    ph = ", ".join(["%s"] * len(vals))
    row = conn.execute(
        f"INSERT INTO {table} ({col_sql}) VALUES ({ph}) RETURNING id",
        vals,
    ).fetchone()
    return int(row["id"])


def seed(workspace_id: str = "default") -> dict:
    init_schema()
    stats: dict[str, int] = {}
    with db() as conn:
        # Dimensions
        continent_id = _upsert_dim(conn, "esg_continent", "Asia")
        area_id = _upsert_dim(conn, "esg_continent_area", "Middle East", {"continent_id": continent_id})
        country_id = _upsert_dim(conn, "esg_country", "Iran", {"continent_area_id": area_id})
        _upsert_dim(conn, "esg_country", "UAE", {"continent_area_id": area_id})

        gender_m = _upsert_dim(conn, "esg_gender", "Male")
        gender_f = _upsert_dim(conn, "esg_gender", "Female")
        gender_o = _upsert_dim(conn, "esg_gender", "Other / Undisclosed")

        age_u30 = _upsert_dim(conn, "esg_various_age_brackets", "Under 30")
        age_30_50 = _upsert_dim(conn, "esg_various_age_brackets", "30-50")
        age_50p = _upsert_dim(conn, "esg_various_age_brackets", "Over 50")

        jl_exec = _upsert_dim(conn, "esg_job_level", "Executive")
        jl_mgr = _upsert_dim(conn, "esg_job_level", "Manager", {"parent_id": jl_exec})
        jl_staff = _upsert_dim(conn, "esg_job_level", "Staff", {"parent_id": jl_mgr})

        et_renewable = _upsert_dim(conn, "esg_energy_type", "Renewable")
        et_fossil = _upsert_dim(conn, "esg_energy_type", "Fossil")
        es_solar = _upsert_dim(conn, "esg_energy_source", "Solar PV", {"energy_type_id": et_renewable})
        es_grid = _upsert_dim(conn, "esg_energy_source", "Grid Electricity", {"energy_type_id": et_fossil})
        es_diesel = _upsert_dim(conn, "esg_energy_source", "Diesel Generator", {"energy_type_id": et_fossil})

        gas_co2 = _upsert_dim(conn, "esg_gas_type", "CO2")
        gas_ch4 = _upsert_dim(conn, "esg_gas_type", "CH4")
        gas_n2o = _upsert_dim(conn, "esg_gas_type", "N2O")

        fuel_diesel = _upsert_dim(conn, "esg_fuel_type", "Diesel")
        fuel_petrol = _upsert_dim(conn, "esg_fuel_type", "Petrol")
        fuel_ev = _upsert_dim(conn, "esg_fuel_type", "Electric")

        vt_car = _upsert_dim(conn, "esg_vehicle_type", "Passenger Car")
        vt_van = _upsert_dim(conn, "esg_vehicle_type", "Van")
        vs_small = _upsert_dim(conn, "esg_vehicle_size", "Small")
        vs_medium = _upsert_dim(conn, "esg_vehicle_size", "Medium")

        travel_air = _upsert_dim(conn, "esg_travel_type", "Air")
        travel_rail = _upsert_dim(conn, "esg_travel_type", "Rail")
        travel_road = _upsert_dim(conn, "esg_travel_type", "Road")

        waste_hazard = _upsert_dim(conn, "esg_waste_type", "Hazardous")
        waste_non = _upsert_dim(conn, "esg_waste_type", "Non-hazardous")
        waste_recycle = _upsert_dim(conn, "esg_waste_type", "Recyclable")

        src_ops = _upsert_dim(conn, "esg_source_type", "Operations")
        src_office = _upsert_dim(conn, "esg_source_type", "Offices")
        src_supply = _upsert_dim(conn, "esg_source_type", "Supply Chain")

        stats["dimensions"] = 1

        # Avoid duplicating sample facts for same period
        period_from = "2024-01-01"
        period_to = "2024-12-31"
        existing = conn.execute(
            "SELECT COUNT(*) AS c FROM esg_co2_emission WHERE workspace_id=%s AND from_date=%s",
            (workspace_id, period_from),
        ).fetchone()["c"]
        if int(existing) > 0:
            conn.commit()
            return {"workspace_id": workspace_id, "skipped": True, "reason": "sample facts already present"}

        def ins(table: str, **kwargs):
            kwargs.setdefault("workspace_id", workspace_id)
            kwargs.setdefault("user_id", "seed")
            cols = list(kwargs.keys())
            ph = ", ".join(["%s"] * len(cols))
            conn.execute(
                f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({ph})",
                [kwargs[c] for c in cols],
            )
            stats[table] = stats.get(table, 0) + 1

        # Environmental 2024
        ins("esg_co2_emission", value=12540.5, from_date=period_from, to_date=period_to)
        ins("esg_ghg_emissions", gas_type_id=gas_co2, value=11800.0, from_date=period_from, to_date=period_to)
        ins("esg_ghg_emissions", gas_type_id=gas_ch4, value=420.3, from_date=period_from, to_date=period_to)
        ins("esg_ghg_emissions", gas_type_id=gas_n2o, value=95.2, from_date=period_from, to_date=period_to)

        ins(
            "esg_energy_consumption",
            energy_source_id=es_solar,
            value=3200.0,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_energy_consumption",
            energy_source_id=es_grid,
            value=8900.0,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_energy_consumption",
            energy_source_id=es_diesel,
            value=1100.0,
            from_date=period_from,
            to_date=period_to,
        )

        ins("esg_total_water_consumption", total=45000.0, from_date=period_from, to_date=period_to)
        ins(
            "esg_water_consumption_breakdown",
            source_type_id=src_ops,
            water_supplies=30000.0,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_water_consumption_breakdown",
            source_type_id=src_office,
            water_supplies=15000.0,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_water_intensity",
            usage_amount=12.5,
            drinkable_amount=8.0,
            from_date=period_from,
            to_date=period_to,
        )
        ins("esg_water_reuse", total_reuse=5200.0, from_date=period_from, to_date=period_to)

        ins(
            "esg_waste_generation",
            waste_type_id=waste_non,
            source_type_id=src_ops,
            total_waste=340.5,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_waste_generation",
            waste_type_id=waste_recycle,
            source_type_id=src_office,
            total_waste=88.0,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_waste_generation",
            waste_type_id=waste_hazard,
            source_type_id=src_ops,
            total_waste=12.2,
            from_date=period_from,
            to_date=period_to,
        )

        ins(
            "esg_business_travel_emission",
            travel_type_id=travel_air,
            total_air_travel=42,
            total_distance_traveled=185000.0,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_business_travel_emission",
            travel_type_id=travel_rail,
            total_air_travel=0,
            total_distance_traveled=22000.0,
            from_date=period_from,
            to_date=period_to,
        )

        ins(
            "esg_co2_emission_transportation",
            vehicle_type_id=vt_car,
            vehicle_size_id=vs_medium,
            fuel_type_id=fuel_petrol,
            annual_fuel=15000.0,
            annual_mileage=180000.0,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_co2_emission_transportation",
            vehicle_type_id=vt_van,
            vehicle_size_id=vs_small,
            fuel_type_id=fuel_diesel,
            annual_fuel=8000.0,
            annual_mileage=95000.0,
            from_date=period_from,
            to_date=period_to,
        )

        # Social 2024
        ins(
            "esg_gender_demographic",
            total_employees=420,
            gender_id=gender_m,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_gender_demographic",
            total_employees=380,
            gender_id=gender_f,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_gender_demographic",
            total_employees=12,
            gender_id=gender_o,
            from_date=period_from,
            to_date=period_to,
        )

        ins(
            "esg_age_demographic",
            total_employees=210,
            various_age_bracket_id=age_u30,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_age_demographic",
            total_employees=450,
            various_age_bracket_id=age_30_50,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_age_demographic",
            total_employees=152,
            various_age_bracket_id=age_50p,
            from_date=period_from,
            to_date=period_to,
        )

        ins(
            "esg_disability_demographic",
            total_employees=28,
            disability=True,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_disability_demographic",
            total_employees=784,
            disability=False,
            from_date=period_from,
            to_date=period_to,
        )
        ins(
            "esg_lgbt_demographic",
            total_employees=35,
            lgbt=True,
            from_date=period_from,
            to_date=period_to,
        )
        ins("esg_hiring_numbers", value=96, from_date=period_from, to_date=period_to)
        ins(
            "esg_racial_and_ethnic",
            total_employees=700,
            country_id=country_id,
            from_date=period_from,
            to_date=period_to,
        )

        # Prior year sample for trend-friendly demos
        p2_from, p2_to = "2023-01-01", "2023-12-31"
        ins("esg_co2_emission", value=14200.0, from_date=p2_from, to_date=p2_to)
        ins(
            "esg_energy_consumption",
            energy_source_id=es_grid,
            value=10200.0,
            from_date=p2_from,
            to_date=p2_to,
        )
        ins("esg_hiring_numbers", value=71, from_date=p2_from, to_date=p2_to)

        conn.commit()
    return {"workspace_id": workspace_id, "skipped": False, "stats": stats}


def main() -> None:
    ws = os.getenv("KNOWLEDGEOS_SEED_WORKSPACE", "default")
    result = seed(ws)
    print(result)
    if result.get("skipped"):
        sys.exit(0)


if __name__ == "__main__":
    main()
