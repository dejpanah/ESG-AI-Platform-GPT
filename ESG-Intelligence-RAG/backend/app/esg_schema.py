"""PostgreSQL schema for structured ESG metrics (converted from Cariboun SQL Server).

All fact tables include workspace_id for multi-tenant isolation.
Lookup / dimension tables are shared (or can be scoped later).
Snake_case naming; IDENTITY → SERIAL/BIGSERIAL; nvarchar → TEXT; datetime → TIMESTAMPTZ.
"""

from __future__ import annotations

ESG_SCHEMA_SQL = """
-- ============================================================
-- Dimension / lookup tables
-- ============================================================

CREATE TABLE IF NOT EXISTS esg_continent (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_continent_area (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    continent_id    BIGINT NOT NULL REFERENCES esg_continent(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_country (
    id                  BIGSERIAL PRIMARY KEY,
    title               TEXT NOT NULL,
    continent_area_id   BIGINT NOT NULL REFERENCES esg_continent_area(id),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_gender (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_various_age_brackets (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_job_level (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    parent_id       BIGINT REFERENCES esg_job_level(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_energy_type (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_energy_source (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    energy_type_id  BIGINT NOT NULL REFERENCES esg_energy_type(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_gas_type (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_fuel_type (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_vehicle_type (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_vehicle_size (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_travel_type (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_waste_type (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS esg_source_type (
    id              BIGSERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
-- Environmental fact tables
-- ============================================================

CREATE TABLE IF NOT EXISTS esg_co2_emission (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    value           DOUBLE PRECISION NOT NULL,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_co2_ws_period ON esg_co2_emission(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_ghg_emissions (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    gas_type_id     BIGINT NOT NULL REFERENCES esg_gas_type(id),
    value           DOUBLE PRECISION NOT NULL,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_ghg_ws_period ON esg_ghg_emissions(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_co2_emission_transportation (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    vehicle_type_id BIGINT NOT NULL REFERENCES esg_vehicle_type(id),
    vehicle_size_id BIGINT NOT NULL REFERENCES esg_vehicle_size(id),
    fuel_type_id    BIGINT NOT NULL REFERENCES esg_fuel_type(id),
    annual_fuel     DOUBLE PRECISION NOT NULL DEFAULT 0,
    annual_mileage  DOUBLE PRECISION NOT NULL DEFAULT 0,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_co2_trans_ws ON esg_co2_emission_transportation(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_business_travel_emission (
    id                      BIGSERIAL PRIMARY KEY,
    workspace_id            TEXT NOT NULL,
    travel_type_id          BIGINT NOT NULL REFERENCES esg_travel_type(id),
    total_air_travel        BIGINT NOT NULL DEFAULT 0,
    total_distance_traveled DOUBLE PRECISION NOT NULL DEFAULT 0,
    from_date               TIMESTAMPTZ NOT NULL,
    to_date                 TIMESTAMPTZ NOT NULL,
    user_id                 TEXT NOT NULL DEFAULT '',
    create_date             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_biz_travel_ws ON esg_business_travel_emission(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_energy_consumption (
    id               BIGSERIAL PRIMARY KEY,
    workspace_id     TEXT NOT NULL,
    energy_source_id BIGINT NOT NULL REFERENCES esg_energy_source(id),
    value            DOUBLE PRECISION NOT NULL DEFAULT 0,
    from_date        TIMESTAMPTZ NOT NULL,
    to_date          TIMESTAMPTZ NOT NULL,
    user_id          TEXT NOT NULL DEFAULT '',
    create_date      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_energy_ws ON esg_energy_consumption(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_total_water_consumption (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    total           DOUBLE PRECISION NOT NULL,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_water_total_ws ON esg_total_water_consumption(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_water_consumption_breakdown (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    source_type_id  BIGINT NOT NULL REFERENCES esg_source_type(id),
    water_supplies  DOUBLE PRECISION NOT NULL DEFAULT 0,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_water_bd_ws ON esg_water_consumption_breakdown(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_water_intensity (
    id               BIGSERIAL PRIMARY KEY,
    workspace_id     TEXT NOT NULL,
    usage_amount     DOUBLE PRECISION NOT NULL DEFAULT 0,
    drinkable_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    from_date        TIMESTAMPTZ NOT NULL,
    to_date          TIMESTAMPTZ NOT NULL,
    user_id          TEXT NOT NULL DEFAULT '',
    create_date      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_water_int_ws ON esg_water_intensity(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_water_reuse (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    total_reuse     DOUBLE PRECISION NOT NULL DEFAULT 0,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_water_reuse_ws ON esg_water_reuse(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_waste_generation (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    waste_type_id   BIGINT NOT NULL REFERENCES esg_waste_type(id),
    source_type_id  BIGINT NOT NULL REFERENCES esg_source_type(id),
    total_waste     DOUBLE PRECISION NOT NULL DEFAULT 0,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_waste_ws ON esg_waste_generation(workspace_id, from_date, to_date);

-- ============================================================
-- Social fact tables (workforce demographics)
-- ============================================================

CREATE TABLE IF NOT EXISTS esg_age_demographic (
    id                      BIGSERIAL PRIMARY KEY,
    workspace_id            TEXT NOT NULL,
    total_employees         INT NOT NULL,
    various_age_bracket_id  BIGINT NOT NULL REFERENCES esg_various_age_brackets(id),
    from_date               TIMESTAMPTZ NOT NULL,
    to_date                 TIMESTAMPTZ NOT NULL,
    user_id                 TEXT NOT NULL DEFAULT '',
    create_date             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_age_demo_ws ON esg_age_demographic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_gender_demographic (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    total_employees INT NOT NULL,
    gender_id       BIGINT NOT NULL REFERENCES esg_gender(id),
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_gender_demo_ws ON esg_gender_demographic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_age_gender_demographic (
    id                      BIGSERIAL PRIMARY KEY,
    workspace_id            TEXT NOT NULL,
    total_employees         INT NOT NULL,
    gender_id               BIGINT NOT NULL REFERENCES esg_gender(id),
    various_age_bracket_id  BIGINT NOT NULL REFERENCES esg_various_age_brackets(id),
    from_date               TIMESTAMPTZ NOT NULL,
    to_date                 TIMESTAMPTZ NOT NULL,
    user_id                 TEXT NOT NULL DEFAULT '',
    create_date             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_age_gender_ws ON esg_age_gender_demographic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_age_job_level_demographic (
    id                      BIGSERIAL PRIMARY KEY,
    workspace_id            TEXT NOT NULL,
    total_employees         INT NOT NULL,
    various_age_bracket_id  BIGINT NOT NULL REFERENCES esg_various_age_brackets(id),
    job_level_id1           BIGINT NOT NULL REFERENCES esg_job_level(id),
    job_level_id2           BIGINT NOT NULL REFERENCES esg_job_level(id),
    from_date               TIMESTAMPTZ NOT NULL,
    to_date                 TIMESTAMPTZ NOT NULL,
    user_id                 TEXT NOT NULL DEFAULT '',
    create_date             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_age_job_ws ON esg_age_job_level_demographic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_gender_job_level_demographic (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    gender_id       BIGINT NOT NULL REFERENCES esg_gender(id),
    total_employees INT NOT NULL,
    job_level1      BIGINT NOT NULL REFERENCES esg_job_level(id),
    job_level2      BIGINT NOT NULL REFERENCES esg_job_level(id),
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_gender_job_ws ON esg_gender_job_level_demographic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_racial_and_ethnic (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    total_employees INT NOT NULL,
    country_id      BIGINT NOT NULL REFERENCES esg_country(id),
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_racial_ws ON esg_racial_and_ethnic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_gender_racial_and_ethnic (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    total_employees INT NOT NULL,
    gender_id       BIGINT NOT NULL REFERENCES esg_gender(id),
    country_id      BIGINT NOT NULL REFERENCES esg_country(id),
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_gender_racial_ws ON esg_gender_racial_and_ethnic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_job_racial_and_ethnic (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    total_employees INT NOT NULL,
    country_id      BIGINT NOT NULL REFERENCES esg_country(id),
    job_level_id1   BIGINT NOT NULL REFERENCES esg_job_level(id),
    job_level_id2   BIGINT NOT NULL REFERENCES esg_job_level(id),
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_job_racial_ws ON esg_job_racial_and_ethnic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_disability_demographic (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    total_employees INT NOT NULL,
    disability      BOOLEAN NOT NULL DEFAULT FALSE,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_disability_ws ON esg_disability_demographic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_lgbt_demographic (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    total_employees INT NOT NULL,
    lgbt            BOOLEAN NOT NULL DEFAULT FALSE,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_lgbt_ws ON esg_lgbt_demographic(workspace_id, from_date, to_date);

CREATE TABLE IF NOT EXISTS esg_hiring_numbers (
    id              BIGSERIAL PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    value           INT NOT NULL,
    from_date       TIMESTAMPTZ NOT NULL,
    to_date         TIMESTAMPTZ NOT NULL,
    user_id         TEXT NOT NULL DEFAULT '',
    create_date     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esg_hiring_ws ON esg_hiring_numbers(workspace_id, from_date, to_date);
"""


def apply_esg_schema(conn) -> None:
    """Execute ESG DDL on an open Postgres connection (psycopg style)."""
    with conn.cursor() as cur:
        cur.execute(ESG_SCHEMA_SQL)
    conn.commit()
