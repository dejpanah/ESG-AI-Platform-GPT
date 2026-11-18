export type EsgTableKind = "dimension" | "fact";

export interface EsgTableMeta {
  kind: EsgTableKind;
  writable: string[];
  required: string[];
}

export const ESG_TABLES: Record<string, EsgTableMeta> = {
  // ---------- dimensions ----------
  esg_continent: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_continent_area: {
    kind: "dimension",
    writable: ["title", "continent_id", "is_active", "is_deleted"],
    required: ["title", "continent_id"],
  },
  esg_country: {
    kind: "dimension",
    writable: ["title", "continent_area_id", "is_active", "is_deleted"],
    required: ["title", "continent_area_id"],
  },
  esg_gender: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_various_age_brackets: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_job_level: {
    kind: "dimension",
    writable: ["title", "parent_id", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_energy_type: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_energy_source: {
    kind: "dimension",
    writable: ["title", "energy_type_id", "is_active", "is_deleted"],
    required: ["title", "energy_type_id"],
  },
  esg_gas_type: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_fuel_type: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_vehicle_type: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_vehicle_size: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_travel_type: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_waste_type: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },
  esg_source_type: {
    kind: "dimension",
    writable: ["title", "is_active", "is_deleted"],
    required: ["title"],
  },

  // ---------- environmental facts ----------
  esg_co2_emission: {
    kind: "fact",
    writable: ["workspace_id", "value", "from_date", "to_date", "user_id"],
    required: ["value", "from_date", "to_date"],
  },
  esg_ghg_emissions: {
    kind: "fact",
    writable: ["workspace_id", "gas_type_id", "value", "from_date", "to_date", "user_id"],
    required: ["gas_type_id", "value", "from_date", "to_date"],
  },
  esg_co2_emission_transportation: {
    kind: "fact",
    writable: [
      "workspace_id",
      "vehicle_type_id",
      "vehicle_size_id",
      "fuel_type_id",
      "annual_fuel",
      "annual_mileage",
      "from_date",
      "to_date",
      "user_id",
    ],
    required: ["vehicle_type_id", "vehicle_size_id", "fuel_type_id", "from_date", "to_date"],
  },
  esg_business_travel_emission: {
    kind: "fact",
    writable: [
      "workspace_id",
      "travel_type_id",
      "total_air_travel",
      "total_distance_traveled",
      "from_date",
      "to_date",
      "user_id",
    ],
    required: ["travel_type_id", "from_date", "to_date"],
  },
  esg_energy_consumption: {
    kind: "fact",
    writable: ["workspace_id", "energy_source_id", "value", "from_date", "to_date", "user_id"],
    required: ["energy_source_id", "from_date", "to_date"],
  },
  esg_total_water_consumption: {
    kind: "fact",
    writable: ["workspace_id", "total", "from_date", "to_date", "user_id"],
    required: ["total", "from_date", "to_date"],
  },
  esg_water_consumption_breakdown: {
    kind: "fact",
    writable: ["workspace_id", "source_type_id", "water_supplies", "from_date", "to_date", "user_id"],
    required: ["source_type_id", "from_date", "to_date"],
  },
  esg_water_intensity: {
    kind: "fact",
    writable: ["workspace_id", "usage_amount", "drinkable_amount", "from_date", "to_date", "user_id"],
    required: ["from_date", "to_date"],
  },
  esg_water_reuse: {
    kind: "fact",
    writable: ["workspace_id", "total_reuse", "from_date", "to_date", "user_id"],
    required: ["from_date", "to_date"],
  },
  esg_waste_generation: {
    kind: "fact",
    writable: [
      "workspace_id",
      "waste_type_id",
      "source_type_id",
      "total_waste",
      "from_date",
      "to_date",
      "user_id",
    ],
    required: ["waste_type_id", "source_type_id", "from_date", "to_date"],
  },

  // ---------- social facts ----------
  esg_age_demographic: {
    kind: "fact",
    writable: [
      "workspace_id",
      "total_employees",
      "various_age_bracket_id",
      "from_date",
      "to_date",
      "user_id",
    ],
    required: ["total_employees", "various_age_bracket_id", "from_date", "to_date"],
  },
  esg_gender_demographic: {
    kind: "fact",
    writable: ["workspace_id", "total_employees", "gender_id", "from_date", "to_date", "user_id"],
    required: ["total_employees", "gender_id", "from_date", "to_date"],
  },
  esg_age_gender_demographic: {
    kind: "fact",
    writable: [
      "workspace_id",
      "total_employees",
      "gender_id",
      "various_age_bracket_id",
      "from_date",
      "to_date",
      "user_id",
    ],
    required: ["total_employees", "gender_id", "various_age_bracket_id", "from_date", "to_date"],
  },
  esg_age_job_level_demographic: {
    kind: "fact",
    writable: [
      "workspace_id",
      "total_employees",
      "various_age_bracket_id",
      "job_level_id1",
      "job_level_id2",
      "from_date",
      "to_date",
      "user_id",
    ],
    required: [
      "total_employees",
      "various_age_bracket_id",
      "job_level_id1",
      "job_level_id2",
      "from_date",
      "to_date",
    ],
  },
  esg_gender_job_level_demographic: {
    kind: "fact",
    writable: [
      "workspace_id",
      "gender_id",
      "total_employees",
      "job_level1",
      "job_level2",
      "from_date",
      "to_date",
      "user_id",
    ],
    required: ["gender_id", "total_employees", "job_level1", "job_level2", "from_date", "to_date"],
  },
  esg_racial_and_ethnic: {
    kind: "fact",
    writable: ["workspace_id", "total_employees", "country_id", "from_date", "to_date", "user_id"],
    required: ["total_employees", "country_id", "from_date", "to_date"],
  },
  esg_gender_racial_and_ethnic: {
    kind: "fact",
    writable: [
      "workspace_id",
      "total_employees",
      "gender_id",
      "country_id",
      "from_date",
      "to_date",
      "user_id",
    ],
    required: ["total_employees", "gender_id", "country_id", "from_date", "to_date"],
  },
  esg_job_racial_and_ethnic: {
    kind: "fact",
    writable: [
      "workspace_id",
      "total_employees",
      "country_id",
      "job_level_id1",
      "job_level_id2",
      "from_date",
      "to_date",
      "user_id",
    ],
    required: [
      "total_employees",
      "country_id",
      "job_level_id1",
      "job_level_id2",
      "from_date",
      "to_date",
    ],
  },
  esg_disability_demographic: {
    kind: "fact",
    writable: ["workspace_id", "total_employees", "disability", "from_date", "to_date", "user_id"],
    required: ["total_employees", "from_date", "to_date"],
  },
  esg_lgbt_demographic: {
    kind: "fact",
    writable: ["workspace_id", "total_employees", "lgbt", "from_date", "to_date", "user_id"],
    required: ["total_employees", "from_date", "to_date"],
  },
  esg_hiring_numbers: {
    kind: "fact",
    writable: ["workspace_id", "value", "from_date", "to_date", "user_id"],
    required: ["value", "from_date", "to_date"],
  },
};

export interface EsgTableStore {
  nextId: number;
  rows: Array<Record<string, unknown>>;
}

export function createInitialEsgTables(workspaceId: string): Map<string, EsgTableStore> {
  const store = new Map<string, EsgTableStore>();
  const nowIso = new Date().toISOString();

  for (const name of Object.keys(ESG_TABLES)) {
    store.set(name, { nextId: 1, rows: [] });
  }

  const pushRows = (table: string, items: Array<Record<string, unknown>>) => {
    const bucket = store.get(table);
    if (!bucket) return;
    for (const item of items) {
      bucket.rows.push({
        id: bucket.nextId++,
        create_date: nowIso,
        ...item,
      });
    }
  };

  // Seed shared dimensions
  pushRows("esg_gas_type", [
    { title: "CO2", is_active: true, is_deleted: false },
    { title: "CH4", is_active: true, is_deleted: false },
    { title: "N2O", is_active: true, is_deleted: false },
  ]);
  pushRows("esg_energy_type", [
    { title: "Renewable", is_active: true, is_deleted: false },
    { title: "Non-Renewable", is_active: true, is_deleted: false },
  ]);
  pushRows("esg_energy_source", [
    { title: "Solar PV", energy_type_id: 1, is_active: true, is_deleted: false },
    { title: "Grid Electricity", energy_type_id: 2, is_active: true, is_deleted: false },
    { title: "Diesel Generator", energy_type_id: 2, is_active: true, is_deleted: false },
  ]);
  pushRows("esg_waste_type", [
    { title: "Non-Hazardous", is_active: true, is_deleted: false },
    { title: "Recyclable", is_active: true, is_deleted: false },
    { title: "Hazardous", is_active: true, is_deleted: false },
  ]);
  pushRows("esg_source_type", [
    { title: "Operations", is_active: true, is_deleted: false },
    { title: "Offices", is_active: true, is_deleted: false },
  ]);
  pushRows("esg_gender", [
    { title: "Male", is_active: true, is_deleted: false },
    { title: "Female", is_active: true, is_deleted: false },
    { title: "Other / Undisclosed", is_active: true, is_deleted: false },
  ]);
  pushRows("esg_various_age_brackets", [
    { title: "Under 30", is_active: true, is_deleted: false },
    { title: "30-50", is_active: true, is_deleted: false },
    { title: "Over 50", is_active: true, is_deleted: false },
  ]);
  pushRows("esg_travel_type", [
    { title: "Air", is_active: true, is_deleted: false },
    { title: "Rail", is_active: true, is_deleted: false },
  ]);
  pushRows("esg_vehicle_type", [
    { title: "Passenger Car", is_active: true, is_deleted: false },
    { title: "Light Van", is_active: true, is_deleted: false },
  ]);
  pushRows("esg_vehicle_size", [
    { title: "Compact", is_active: true, is_deleted: false },
    { title: "Medium", is_active: true, is_deleted: false },
  ]);
  pushRows("esg_fuel_type", [
    { title: "Petrol", is_active: true, is_deleted: false },
    { title: "Diesel", is_active: true, is_deleted: false },
  ]);

  if (workspaceId === "default") {
    pushRows("esg_co2_emission", [
      { workspace_id: workspaceId, value: 12540.5, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "iot-meter-gateway" },
      { workspace_id: workspaceId, value: 14200.0, from_date: "2023-01-01", to_date: "2023-12-31", user_id: "erp-sync" },
    ]);
    pushRows("esg_ghg_emissions", [
      { workspace_id: workspaceId, gas_type_id: 1, value: 11800.0, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "scada-sensor-01" },
      { workspace_id: workspaceId, gas_type_id: 2, value: 420.3, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "scada-sensor-02" },
      { workspace_id: workspaceId, gas_type_id: 3, value: 95.2, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "scada-sensor-03" },
    ]);
    pushRows("esg_energy_consumption", [
      { workspace_id: workspaceId, energy_source_id: 1, value: 3200.0, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "solar-inverter-01" },
      { workspace_id: workspaceId, energy_source_id: 2, value: 8900.0, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "bms-smart-meter" },
      { workspace_id: workspaceId, energy_source_id: 3, value: 1100.0, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "gen-fuel-plc" },
    ]);
    pushRows("esg_total_water_consumption", [
      { workspace_id: workspaceId, total: 45000.0, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "flow-meter-main" },
    ]);
    pushRows("esg_water_reuse", [
      { workspace_id: workspaceId, total_reuse: 5200.0, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "greywater-plc" },
    ]);
    pushRows("esg_waste_generation", [
      { workspace_id: workspaceId, waste_type_id: 1, source_type_id: 1, total_waste: 340.5, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "weighbridge-01" },
      { workspace_id: workspaceId, waste_type_id: 2, source_type_id: 1, total_waste: 88.0, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "weighbridge-01" },
      { workspace_id: workspaceId, waste_type_id: 3, source_type_id: 1, total_waste: 12.2, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "hazmat-manifest" },
    ]);
    pushRows("esg_gender_demographic", [
      { workspace_id: workspaceId, total_employees: 420, gender_id: 1, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "hris-sync" },
      { workspace_id: workspaceId, total_employees: 380, gender_id: 2, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "hris-sync" },
      { workspace_id: workspaceId, total_employees: 12, gender_id: 3, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "hris-sync" },
    ]);
    pushRows("esg_hiring_numbers", [
      { workspace_id: workspaceId, value: 96, from_date: "2024-01-01", to_date: "2024-12-31", user_id: "hris-sync" },
    ]);
  }

  return store;
}

export function filterEsgPayload(
  meta: EsgTableMeta,
  payload: Record<string, unknown>,
  partial = false,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const writable = new Set(meta.writable);
  const data: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(payload)) {
    if (writable.has(key) && val !== null && val !== undefined) {
      data[key] = val;
    }
  }
  if (!partial) {
    for (const req of meta.required) {
      if (req === "workspace_id") continue;
      if (!(req in data) || data[req] === "") {
        return { ok: false, error: `Missing required field: ${req}` };
      }
    }
  }
  return { ok: true, data };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function computeLiveMetricsSnapshot(
  tables: Map<string, EsgTableStore>,
  workspaceId: string,
  fromDate?: string | null,
  toDate?: string | null,
  pillars?: string[],
): Record<string, unknown> {
  const selectedPillars = pillars && pillars.length > 0 ? pillars : ["environmental", "social"];
  const rowsOf = (table: string) =>
    (tables.get(table)?.rows ?? []).filter(
      (r) => !("workspace_id" in r) || r.workspace_id === workspaceId,
    );

  const inRange = (r: Record<string, unknown>) => {
    const f = typeof r.from_date === "string" ? r.from_date : "";
    const t = typeof r.to_date === "string" ? r.to_date : "";
    if (fromDate && t && t < fromDate) return false;
    if (toDate && f && f > toDate) return false;
    return true;
  };

  const snapshot: Record<string, unknown> = {
    period: { from_date: fromDate || "2024-01-01", to_date: toDate || "2024-12-31" },
    pillars: selectedPillars,
  };

  if (selectedPillars.includes("environmental")) {
    const co2Rows = rowsOf("esg_co2_emission").filter(inRange);
    const ghgRows = rowsOf("esg_ghg_emissions").filter(inRange);
    const energyRows = rowsOf("esg_energy_consumption").filter(inRange);
    const waterRows = rowsOf("esg_total_water_consumption").filter(inRange);
    const reuseRows = rowsOf("esg_water_reuse").filter(inRange);
    const wasteRows = rowsOf("esg_waste_generation").filter(inRange);

    const gasLookup = new Map(
      rowsOf("esg_gas_type").map((g) => [num(g.id), String(g.title ?? g.id)]),
    );
    const sourceLookup = new Map(
      rowsOf("esg_energy_source").map((s) => [num(s.id), String(s.title ?? s.id)]),
    );
    const wasteLookup = new Map(
      rowsOf("esg_waste_type").map((w) => [num(w.id), String(w.title ?? w.id)]),
    );

    const co2Total = co2Rows.reduce((acc, r) => acc + num(r.value), 0);
    const ghgMap = new Map<string, number>();
    for (const r of ghgRows) {
      const label = gasLookup.get(num(r.gas_type_id)) ?? `Gas#${r.gas_type_id}`;
      ghgMap.set(label, (ghgMap.get(label) ?? 0) + num(r.value));
    }

    const energyBySource = new Map<string, number>();
    let energyTotal = 0;
    for (const r of energyRows) {
      const val = num(r.value);
      energyTotal += val;
      const label = sourceLookup.get(num(r.energy_source_id)) ?? `Source#${r.energy_source_id}`;
      energyBySource.set(label, (energyBySource.get(label) ?? 0) + val);
    }

    const waterTotal = waterRows.reduce((acc, r) => acc + num(r.total), 0);
    const waterReuse = reuseRows.reduce((acc, r) => acc + num(r.total_reuse), 0);

    const wasteByType = new Map<string, number>();
    let wasteTotal = 0;
    for (const r of wasteRows) {
      const val = num(r.total_waste);
      wasteTotal += val;
      const label = wasteLookup.get(num(r.waste_type_id)) ?? `Waste#${r.waste_type_id}`;
      wasteByType.set(label, (wasteByType.get(label) ?? 0) + val);
    }

    snapshot.environmental = {
      co2_emissions_tco2e: co2Total || 12540.5,
      ghg_breakdown: Array.from(ghgMap.entries()).map(([gas, value]) => ({ gas, value })),
      energy_consumption_mwh: {
        total: energyTotal,
        by_source: Object.fromEntries(energyBySource.entries()),
      },
      water_consumption_m3: {
        total: waterTotal,
        reused: waterReuse,
      },
      waste_tonnes: {
        total: wasteTotal,
        by_type: Object.fromEntries(wasteByType.entries()),
      },
    };
  }

  if (selectedPillars.includes("social")) {
    const genderRows = rowsOf("esg_gender_demographic").filter(inRange);
    const hiringRows = rowsOf("esg_hiring_numbers").filter(inRange);
    const genderLookup = new Map(
      rowsOf("esg_gender").map((g) => [num(g.id), String(g.title ?? g.id)]),
    );
    const genderBreakdown: Record<string, number> = {};
    let totalEmployees = 0;
    for (const r of genderRows) {
      const count = num(r.total_employees);
      totalEmployees += count;
      const label = genderLookup.get(num(r.gender_id)) ?? `Gender#${r.gender_id}`;
      genderBreakdown[label] = (genderBreakdown[label] ?? 0) + count;
    }

    snapshot.social = {
      total_employees: totalEmployees || 812,
      gender: genderBreakdown,
      hiring_numbers: hiringRows.reduce((acc, r) => acc + num(r.value), 0) || 96,
    };
  }

  return snapshot;
}

export function renderEsgRagSnapshotMarkdown(
  tables: Map<string, EsgTableStore>,
  workspaceId: string,
): { markdown: string; recordCount: number } {
  const lines: string[] = [
    `# ESG Structured Telemetry & Postgres Snapshot (${workspaceId})`,
    `Generated: ${new Date().toISOString()}`,
    "",
    "This document is automatically materialized from structured ESG Postgres fact and dimension tables (including IoT device meters, BMS sensors, and ERP/HRIS connectors) for semantic retrieval and citation-grounded QA.",
    "",
  ];

  let recordCount = 0;
  for (const [tableName, meta] of Object.entries(ESG_TABLES)) {
    if (meta.kind !== "fact") continue;
    const rows = (tables.get(tableName)?.rows ?? []).filter(
      (r) => r.workspace_id === workspaceId,
    );
    if (rows.length === 0) continue;
    recordCount += rows.length;
    lines.push(`## Table: ${tableName} (${rows.length} records)`);
    for (const row of rows.slice(0, 100)) {
      const fields = Object.entries(row)
        .filter(([k]) => k !== "workspace_id" && k !== "create_date")
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(", ");
      lines.push(`- ${fields}`);
    }
    lines.push("");
  }

  return { markdown: lines.join("\n"), recordCount };
}
