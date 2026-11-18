import type { CalcEngineSlug } from "@/api/calc-engines";
import type { LedgerField } from "@/components/calc/CalcLedgerPanel";
import { normalizeHeaderKey, parseCsvText } from "@/lib/esg-csv";

export interface BulkTemplateSpec {
  slug: CalcEngineSlug;
  headers: string[];
  sampleRows: Array<Record<string, string | number | boolean>>;
}

export const EMISSION_FACTORS_FIELDS: LedgerField[] = [
  { key: "code", label: "Factor Code", type: "text", required: true, placeholder: "EF-NG-SITE-2025" },
  { key: "name", label: "Factor Name", type: "text", required: true, placeholder: "Refinery Fuel Gas (Site GC Assay)" },
  { key: "category", label: "Category", type: "text", required: true, defaultValue: "Scope 1 · Stationary" },
  { key: "gas", label: "GHG Gas", type: "text", defaultValue: "CO₂e" },
  {
    key: "source_standard",
    label: "Source Standard",
    type: "select",
    required: true,
    defaultValue: "Site-Specific",
    options: [
      { label: "IPCC 2006", value: "IPCC 2006" },
      { label: "DEFRA", value: "DEFRA" },
      { label: "EPA", value: "EPA" },
      { label: "IEA", value: "IEA" },
      { label: "Site-Specific", value: "Site-Specific" },
      { label: "Lab-Specific", value: "Lab-Specific" },
    ],
  },
  { key: "value", label: "Factor Value", type: "number", required: true, defaultValue: 0.0542 },
  { key: "unit", label: "Factor Unit", type: "text", required: true, defaultValue: "tCO2e/MMBtu" },
  { key: "valid_from", label: "Valid From (YYYY-MM-DD)", type: "text", required: true, defaultValue: "2025-01-01" },
  { key: "uncertainty_pct", label: "Uncertainty (%)", type: "number", defaultValue: 2.1 },
  { key: "notes", label: "Audit Notes", type: "text", defaultValue: "ISO 17025 quarterly GC calibration" },
];

const ENGINE_SAMPLE_ROWS: Partial<Record<CalcEngineSlug, Array<Record<string, string | number | boolean>>>> = {
  "scope-1": [
    {
      unit_name: "Cracking Furnace F-107",
      source_category: "Stationary Combustion",
      equipment_type: "Ethylene Furnace",
      fuel_or_stream: "Fuel Gas",
      activity_amount: 138400,
      activity_unit: "MMBtu",
      ef_value: 0.0544,
      ch4_tonnes: 0.14,
      n2o_tonnes: 0.025,
      factor_ref: "EF-FG-SITE25",
    },
    {
      unit_name: "Auxiliary Steam Boiler B-204 (Anomalous Spike)",
      source_category: "Stationary Combustion",
      equipment_type: "High-Pressure Boiler",
      fuel_or_stream: "Natural Gas",
      activity_amount: 910000,
      activity_unit: "MMBtu",
      ef_value: 0.0531,
      ch4_tonnes: 0.45,
      n2o_tonnes: 0.08,
      factor_ref: "EF-NG-IPCC06",
    },
    {
      unit_name: "Turnaround Crane Fleet C-12",
      source_category: "Mobile Combustion",
      equipment_type: "Heavy Diesel Fleet",
      fuel_or_stream: "ULSD Diesel",
      activity_amount: 1950,
      activity_unit: "m3",
      ef_value: 2.68,
      ch4_tonnes: 0.09,
      n2o_tonnes: 0.04,
      factor_ref: "EF-DSL-DEFRA24",
    },
  ],
  "scope-2": [
    {
      facility: "Olefins Block 2 Substation",
      energy_type: "Purchased Electricity",
      instrument_type: "Grid Average Mix",
      consumption_mwh: 19200,
      location_ef: 0.495,
      market_ef: 0.562,
      certificate_id: "GRID-2025-Q2",
    },
    {
      facility: "Aromatics Complex Solar PPA",
      energy_type: "Purchased Electricity (PPA)",
      instrument_type: "Bundled Solar PPA",
      consumption_mwh: 14500,
      location_ef: 0.495,
      market_ef: 0,
      certificate_id: "IREC-SOL-99812",
    },
    {
      facility: "Polymer Extrusion Line (Anomalous Peak)",
      energy_type: "Purchased Electricity",
      instrument_type: "Grid Average Mix",
      consumption_mwh: 128000,
      location_ef: 0.495,
      market_ef: 0.562,
      certificate_id: "GRID-2025-PEAK",
    },
  ],
  "scope-3": [
    {
      category_num: 1,
      sub_stream: "Purchased Ethane Feedstock — Pipeline B",
      method: "Supplier Primary PCF",
      activity_value: 42000,
      activity_unit: "tonnes",
      ef_value: 0.52,
      data_quality: "High (Primary PCF)",
    },
    {
      category_num: 4,
      sub_stream: "Deep-Sea Chemical Parcel Tanker Charter",
      method: "Distance-Based GLEC",
      activity_value: 310000,
      activity_unit: "t-km (x1000)",
      ef_value: 0.014,
      data_quality: "Medium (GLEC v3)",
    },
    {
      category_num: 1,
      sub_stream: "Imported Naphtha Spot Cargo (Anomalous Factor)",
      method: "Spend / Secondary Factor",
      activity_value: 680000,
      activity_unit: "tonnes",
      ef_value: 0.68,
      data_quality: "Estimated",
    },
  ],
  "emission-factors": [
    {
      code: "EF-RFG-GC25Q2",
      name: "Refinery Fuel Gas — Q2 Online GC",
      category: "Scope 1 · Stationary",
      gas: "CO₂e",
      source_standard: "Site-Specific",
      value: 0.0558,
      unit: "tCO2e/MMBtu",
      valid_from: "2025-04-01",
      uncertainty_pct: 1.8,
      notes: "ISO 17025 certified online gas chromatograph composite",
    },
    {
      code: "EF-NAPHTHA-LAB25",
      name: "Heavy Naphtha Feedstock Carbon Content",
      category: "Scope 1 · Non-Energy Feedstock",
      gas: "CO₂",
      source_standard: "Lab-Specific",
      value: 3.12,
      unit: "tCO2/t feedstock",
      valid_from: "2025-04-01",
      uncertainty_pct: 1.5,
      notes: "ASTM D5291 elemental carbon assay",
    },
    {
      code: "EF-NG-IPCC06",
      name: "Pipeline Natural Gas (High Anomaly Revision)",
      category: "Scope 1 · Stationary",
      gas: "CO₂e",
      source_standard: "IPCC 2006",
      value: 0.0895,
      unit: "tCO2e/MMBtu",
      valid_from: "2025-04-01",
      uncertainty_pct: 4.5,
      notes: "Test revision with +68% deviation from active v2 baseline",
    },
  ],
  methane: [
    {
      asset_name: "Compressor Station CS-04",
      ogmp_level: "Level 4",
      modality: "Ground (OGI + Hi-Flow)",
      ch4_tonnes: 34.2,
      uncertainty_pct: 9.5,
      campaign_date: "2025-03-22",
      notes: "Quarterly LDAR seal vent quantification",
    },
    {
      asset_name: "Tank Farm North Perimeter (Plume Spike)",
      ogmp_level: "Level 5",
      modality: "Aerial (LiDAR / Plume Flight)",
      ch4_tonnes: 215.0,
      uncertainty_pct: 14.0,
      campaign_date: "2025-03-25",
      notes: "Intermittent pressure relief valve lift captured during flight",
    },
  ],
  flaring: [
    {
      flare_unit: "Olefins Cold Box Flare FL-103",
      monitoring_mode: "Continuous Ultrasonic + GC",
      cems_flared_mscf: 7850,
      ops_balance_mscf: 7720,
      production_boe: 265000,
      dre_pct: 98.6,
    },
    {
      flare_unit: "Coker Emergency Knock-Out Flare FL-209 (Low DRE Anomaly)",
      monitoring_mode: "Ultrasonic + Pilot Thermocouple",
      cems_flared_mscf: 48200,
      ops_balance_mscf: 41500,
      production_boe: 210000,
      dre_pct: 94.2,
    },
  ],
  "carbon-intensity": [
    {
      product_stream: "Ethylene (Polymer Grade) — Line 2",
      denominator_type: "Per Tonne Product",
      allocated_emissions_tco2e: 11200,
      denominator_value: 16800,
      denominator_unit: "t Ethylene",
      intensity_unit: "tCO2e / t product",
      benchmark_value: 0.68,
    },
    {
      product_stream: "Methanol Synthesis Loop B (High Intensity Spike)",
      denominator_type: "Per Tonne Product",
      allocated_emissions_tco2e: 29400,
      denominator_value: 12000,
      denominator_unit: "t Methanol",
      intensity_unit: "tCO2e / t product",
      benchmark_value: 0.72,
    },
  ],
  water: [
    {
      facility: "Aromatics Cooling Tower Bank C",
      basin_name: "Coastal Arid Basin #14",
      wri_stress_score: 3.8,
      wri_stress_tier: "High (40-80%)",
      withdrawal_m3: 18400,
      produced_water_m3: 2100,
      reused_m3: 6400,
      discharge_m3: 9800,
      cod_mg_l: 72,
      tds_mg_l: 1480,
      phenols_mg_l: 0.18,
      heavy_metals_mg_l: 0.06,
    },
    {
      facility: "Sour Water Stripper Outfall (COD Exceedance)",
      basin_name: "Coastal Arid Basin #14",
      wri_stress_score: 4.1,
      wri_stress_tier: "Extremely High (>80%)",
      withdrawal_m3: 89000,
      produced_water_m3: 14000,
      reused_m3: 12000,
      discharge_m3: 64000,
      cod_mg_l: 168,
      tds_mg_l: 1890,
      phenols_mg_l: 0.42,
      heavy_metals_mg_l: 0.11,
    },
  ],
  waste: [
    {
      waste_stream: "Spent Hydrocracking Catalyst",
      hazard_class: "Hazardous",
      disposal_route: "Precious Metal Reclamation",
      tonnes: 115,
      recovered: true,
      contractor: "CRI Catalyst Recovery",
    },
    {
      waste_stream: "API Separator Sludge (Turnaround Desludging Spike)",
      hazard_class: "Hazardous",
      disposal_route: "High-Temp Rotary Kiln Incineration",
      tonnes: 1420,
      recovered: false,
      contractor: "CleanHarbors Industrial",
    },
  ],
  "air-emissions": [
    {
      pollutant: "NOx",
      source_unit: "Cracking Heaters Stack S-102",
      measured_tonnes_yr: 64.5,
      permit_limit_tonnes_yr: 95.0,
      measured_conc: 78,
      permit_conc_limit: 120,
      conc_unit: "mg/Nm³",
      monitoring_method: "Continuous CEMS",
    },
    {
      pollutant: "SO₂",
      source_unit: "SRU Tail Gas Incinerator (Permit Exceedance)",
      measured_tonnes_yr: 142.0,
      permit_limit_tonnes_yr: 110.0,
      measured_conc: 195,
      permit_conc_limit: 150,
      conc_unit: "mg/Nm³",
      monitoring_method: "Continuous CEMS",
    },
  ],
  "safety-hse": [
    {
      period: "2025 Q2 — Direct Operations",
      workforce_group: "Direct Employees",
      hours_worked: 1180000,
      fatalities: 0,
      lti_cases: 0,
      recordable_injuries: 1,
      tier1_pse: 0,
      tier2_pse: 0,
      other_psi: 0,
      road_incidents: 0,
    },
    {
      period: "2025 Q2 — Turnaround Contractors (Tier 1 PSE Flag)",
      workforce_group: "Site & Turnaround Contractors",
      hours_worked: 840000,
      fatalities: 0,
      lti_cases: 1,
      recordable_injuries: 3,
      tier1_pse: 1,
      tier2_pse: 1,
      other_psi: 2,
      road_incidents: 1,
    },
  ],
  "social-capital": [
    {
      domain: "Workforce & Diversity",
      metric_name: "Process Engineering & Operations",
      headcount: 420,
      female_share_pct: 31.5,
      avg_training_hours: 54,
      pay_ratio_f_m: 0.97,
      compliance_status: "Verified",
    },
    {
      domain: "Supply Chain Human Rights",
      metric_name: "Tier-1 Raw Material & Logistics Suppliers",
      headcount: 148,
      female_share_pct: 94.0,
      avg_training_hours: 24,
      pay_ratio_f_m: 0.96,
      compliance_status: "ISO 20400 Audited",
    },
  ],
  governance: [
    {
      pillar: "Anti-Corruption",
      indicator: "High-Risk Intermediaries Due Diligence",
      actual_value: 98.5,
      target_value: 100.0,
      unit: "% Screened",
      status: "On Track",
      notes: "ISO 37001 annual audit",
    },
    {
      pillar: "Tax & Transparency",
      indicator: "GRI 207 Country-by-Country Tax Reconciliation",
      actual_value: 100.0,
      target_value: 100.0,
      unit: "% Jurisdictions Disclosed",
      status: "Compliant",
      notes: "Externally assured CbCR",
    },
  ],
};

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCalcBulkTemplateCsv(
  slug: CalcEngineSlug,
  fields: LedgerField[],
): string {
  const effectiveFields =
    slug === "emission-factors" && fields.length === 0
      ? EMISSION_FACTORS_FIELDS
      : fields;
  const headers = effectiveFields.map((f) => f.key);
  const samples = ENGINE_SAMPLE_ROWS[slug];

  const rows: string[] = [headers.join(",")];

  if (samples && samples.length > 0) {
    for (const sample of samples) {
      const line = headers.map((h) => escapeCsvCell(sample[h] ?? "")).join(",");
      rows.push(line);
    }
  } else {
    // Fallback generated row from field defaultValues
    const fallbackLine = effectiveFields
      .map((f) => escapeCsvCell(f.defaultValue ?? f.placeholder ?? ""))
      .join(",");
    rows.push(fallbackLine);
  }

  return `${rows.join("\n")}\n`;
}

export function downloadCalcBulkTemplateCsv(
  slug: CalcEngineSlug,
  fields: LedgerField[],
): void {
  const csvContent = generateCalcBulkTemplateCsv(slug, fields);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `esg_${slug}_bulk_import_template.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parses raw CSV text and maps columns to the Calculation Engine's field schema.
 */
export function parseCalcBulkCsv(
  rawCsvText: string,
  fields: LedgerField[],
): {
  headers: string[];
  mappedRecords: Array<Record<string, unknown>>;
  unmappedHeaders: string[];
} {
  const parsed = parseCsvText(rawCsvText);
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return { headers: [], mappedRecords: [], unmappedHeaders: [] };
  }

  // Match CSV header to field.key or normalized field.label
  const fieldByHeader = new Map<string, LedgerField>();
  const unmappedHeaders: string[] = [];

  for (const h of parsed.headers) {
    const normH = normalizeHeaderKey(h);
    const matched = fields.find(
      (f) =>
        normalizeHeaderKey(f.key) === normH ||
        normalizeHeaderKey(f.label) === normH,
    );
    if (matched) {
      fieldByHeader.set(h, matched);
    } else {
      unmappedHeaders.push(h);
    }
  }

  const mappedRecords: Array<Record<string, unknown>> = parsed.rows.map((cells) => {
    const rec: Record<string, unknown> = {};
    // Initialize defaults for fields not in CSV
    for (const f of fields) {
      if (f.defaultValue !== undefined) {
        rec[f.key] = f.defaultValue;
      }
    }

    parsed.headers.forEach((h, idx) => {
      const field = fieldByHeader.get(h);
      const rawCell = (cells[idx] ?? "").trim();
      if (!field) {
        if (rawCell !== "") {
          rec[normalizeHeaderKey(h)] = rawCell;
        }
        return;
      }

      if (rawCell === "") {
        rec[field.key] = "";
        return;
      }

      if (field.type === "number") {
        const clean = rawCell.replace(/,/g, "");
        const nVal = Number(clean);
        rec[field.key] = Number.isFinite(nVal) ? nVal : rawCell;
      } else if (field.type === "boolean") {
        const low = rawCell.toLowerCase();
        rec[field.key] = low === "true" || low === "1" || low === "yes" || low === "recovered";
      } else {
        rec[field.key] = rawCell;
      }
    });

    return rec;
  });

  return {
    headers: parsed.headers,
    mappedRecords,
    unmappedHeaders,
  };
}
