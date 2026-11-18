"""Registry of ESG Postgres tables for generic CRUD + seed metadata.

Fact tables are workspace-scoped. Dimension tables are shared lookups.
"""

from __future__ import annotations

from typing import Any

# Columns that are auto-managed / not required on create
AUTO_COLUMNS = frozenset({"id", "create_date"})

# table_name -> metadata
# writable: columns clients may send on create/update
# required: required on create (beyond workspace_id for facts)
ESG_TABLES: dict[str, dict[str, Any]] = {
    # ---------- dimensions ----------
    "esg_continent": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_continent_area": {
        "kind": "dimension",
        "writable": ["title", "continent_id", "is_active", "is_deleted"],
        "required": ["title", "continent_id"],
    },
    "esg_country": {
        "kind": "dimension",
        "writable": ["title", "continent_area_id", "is_active", "is_deleted"],
        "required": ["title", "continent_area_id"],
    },
    "esg_gender": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_various_age_brackets": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_job_level": {
        "kind": "dimension",
        "writable": ["title", "parent_id", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_energy_type": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_energy_source": {
        "kind": "dimension",
        "writable": ["title", "energy_type_id", "is_active", "is_deleted"],
        "required": ["title", "energy_type_id"],
    },
    "esg_gas_type": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_fuel_type": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_vehicle_type": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_vehicle_size": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_travel_type": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_waste_type": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    "esg_source_type": {
        "kind": "dimension",
        "writable": ["title", "is_active", "is_deleted"],
        "required": ["title"],
    },
    # ---------- environmental facts ----------
    "esg_co2_emission": {
        "kind": "fact",
        "writable": ["workspace_id", "value", "from_date", "to_date", "user_id"],
        "required": ["value", "from_date", "to_date"],
    },
    "esg_ghg_emissions": {
        "kind": "fact",
        "writable": ["workspace_id", "gas_type_id", "value", "from_date", "to_date", "user_id"],
        "required": ["gas_type_id", "value", "from_date", "to_date"],
    },
    "esg_co2_emission_transportation": {
        "kind": "fact",
        "writable": [
            "workspace_id", "vehicle_type_id", "vehicle_size_id", "fuel_type_id",
            "annual_fuel", "annual_mileage", "from_date", "to_date", "user_id",
        ],
        "required": ["vehicle_type_id", "vehicle_size_id", "fuel_type_id", "from_date", "to_date"],
    },
    "esg_business_travel_emission": {
        "kind": "fact",
        "writable": [
            "workspace_id", "travel_type_id", "total_air_travel", "total_distance_traveled",
            "from_date", "to_date", "user_id",
        ],
        "required": ["travel_type_id", "from_date", "to_date"],
    },
    "esg_energy_consumption": {
        "kind": "fact",
        "writable": ["workspace_id", "energy_source_id", "value", "from_date", "to_date", "user_id"],
        "required": ["energy_source_id", "from_date", "to_date"],
    },
    "esg_total_water_consumption": {
        "kind": "fact",
        "writable": ["workspace_id", "total", "from_date", "to_date", "user_id"],
        "required": ["total", "from_date", "to_date"],
    },
    "esg_water_consumption_breakdown": {
        "kind": "fact",
        "writable": ["workspace_id", "source_type_id", "water_supplies", "from_date", "to_date", "user_id"],
        "required": ["source_type_id", "from_date", "to_date"],
    },
    "esg_water_intensity": {
        "kind": "fact",
        "writable": ["workspace_id", "usage_amount", "drinkable_amount", "from_date", "to_date", "user_id"],
        "required": ["from_date", "to_date"],
    },
    "esg_water_reuse": {
        "kind": "fact",
        "writable": ["workspace_id", "total_reuse", "from_date", "to_date", "user_id"],
        "required": ["from_date", "to_date"],
    },
    "esg_waste_generation": {
        "kind": "fact",
        "writable": [
            "workspace_id", "waste_type_id", "source_type_id", "total_waste",
            "from_date", "to_date", "user_id",
        ],
        "required": ["waste_type_id", "source_type_id", "from_date", "to_date"],
    },
    # ---------- social facts ----------
    "esg_age_demographic": {
        "kind": "fact",
        "writable": [
            "workspace_id", "total_employees", "various_age_bracket_id",
            "from_date", "to_date", "user_id",
        ],
        "required": ["total_employees", "various_age_bracket_id", "from_date", "to_date"],
    },
    "esg_gender_demographic": {
        "kind": "fact",
        "writable": ["workspace_id", "total_employees", "gender_id", "from_date", "to_date", "user_id"],
        "required": ["total_employees", "gender_id", "from_date", "to_date"],
    },
    "esg_age_gender_demographic": {
        "kind": "fact",
        "writable": [
            "workspace_id", "total_employees", "gender_id", "various_age_bracket_id",
            "from_date", "to_date", "user_id",
        ],
        "required": ["total_employees", "gender_id", "various_age_bracket_id", "from_date", "to_date"],
    },
    "esg_age_job_level_demographic": {
        "kind": "fact",
        "writable": [
            "workspace_id", "total_employees", "various_age_bracket_id",
            "job_level_id1", "job_level_id2", "from_date", "to_date", "user_id",
        ],
        "required": [
            "total_employees", "various_age_bracket_id", "job_level_id1", "job_level_id2",
            "from_date", "to_date",
        ],
    },
    "esg_gender_job_level_demographic": {
        "kind": "fact",
        "writable": [
            "workspace_id", "gender_id", "total_employees", "job_level1", "job_level2",
            "from_date", "to_date", "user_id",
        ],
        "required": ["gender_id", "total_employees", "job_level1", "job_level2", "from_date", "to_date"],
    },
    "esg_racial_and_ethnic": {
        "kind": "fact",
        "writable": ["workspace_id", "total_employees", "country_id", "from_date", "to_date", "user_id"],
        "required": ["total_employees", "country_id", "from_date", "to_date"],
    },
    "esg_gender_racial_and_ethnic": {
        "kind": "fact",
        "writable": [
            "workspace_id", "total_employees", "gender_id", "country_id",
            "from_date", "to_date", "user_id",
        ],
        "required": ["total_employees", "gender_id", "country_id", "from_date", "to_date"],
    },
    "esg_job_racial_and_ethnic": {
        "kind": "fact",
        "writable": [
            "workspace_id", "total_employees", "country_id", "job_level_id1", "job_level_id2",
            "from_date", "to_date", "user_id",
        ],
        "required": [
            "total_employees", "country_id", "job_level_id1", "job_level_id2",
            "from_date", "to_date",
        ],
    },
    "esg_disability_demographic": {
        "kind": "fact",
        "writable": ["workspace_id", "total_employees", "disability", "from_date", "to_date", "user_id"],
        "required": ["total_employees", "from_date", "to_date"],
    },
    "esg_lgbt_demographic": {
        "kind": "fact",
        "writable": ["workspace_id", "total_employees", "lgbt", "from_date", "to_date", "user_id"],
        "required": ["total_employees", "from_date", "to_date"],
    },
    "esg_hiring_numbers": {
        "kind": "fact",
        "writable": ["workspace_id", "value", "from_date", "to_date", "user_id"],
        "required": ["value", "from_date", "to_date"],
    },
}


def list_table_names() -> list[str]:
    return sorted(ESG_TABLES.keys())


def get_table_meta(name: str) -> dict[str, Any] | None:
    return ESG_TABLES.get(name)
