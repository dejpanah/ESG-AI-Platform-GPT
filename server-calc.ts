import crypto from "node:crypto";
import {
  validateCalculationInputs,
  type CalcValidationReport,
} from "./server-calc-validation";

export type {
  CalcValidationReport,
  TrendComparisonPoint,
  ValidationCategory,
  ValidationIssue,
  ValidationSeverity,
  ValidationStatus,
} from "./server-calc-validation";

export type CalcEngineSlug =
  | "scope-1"
  | "scope-2"
  | "scope-3"
  | "emission-factors"
  | "methane"
  | "flaring"
  | "carbon-intensity"
  | "water"
  | "waste"
  | "air-emissions"
  | "safety-hse"
  | "social-capital"
  | "governance"
  | "formulas-rules";

export interface CalcKpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "ok" | "warn" | "bad" | "info" | "idle";
}

export interface CalcChartPoint {
  name: string;
  primary: number;
  secondary?: number;
  limit?: number;
  unit?: string;
}

export interface CalcRecord {
  id: string;
  created_at: number;
  updated_at: number;
  [key: string]: unknown;
}

export interface CalcAuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  detail: string;
}

export interface EmissionFactorVersion {
  version: number;
  value: number;
  unit: string;
  source: string;
  valid_from: string;
  valid_to: string | null;
  uncertainty_pct: number;
  notes: string;
  updated_at: number;
  updated_by: string;
}

export interface EmissionFactorItem {
  id: string;
  code: string;
  name: string;
  category: string;
  gas: string;
  source_standard: "IPCC 2006" | "DEFRA" | "EPA" | "IEA" | "Site-Specific" | "Lab-Specific";
  current_version: number;
  value: number;
  unit: string;
  valid_from: string;
  valid_to: string | null;
  uncertainty_pct: number;
  status: "active" | "deprecated";
  versions: EmissionFactorVersion[];
}

export interface FormulaVersionSnapshot {
  version: number;
  expression: string;
  threshold_operator?: ">" | ">=" | "<" | "<=";
  threshold_value?: number | null;
  threshold_severity?: "warning" | "critical";
  change_note: string;
  author: string;
  created_at: number;
  status: "active" | "pending_approval" | "superseded" | "rejected";
  reviewed_by?: string;
  reviewed_at?: number;
  review_note?: string;
}

export interface FormulaRuleItem {
  id: string;
  code: string;
  name: string;
  target_engine: CalcEngineSlug;
  kind: "formula" | "threshold_rule";
  output_unit: string;
  variables: string[];
  sample_inputs: Record<string, number>;
  active_version: number;
  expression: string;
  threshold_operator?: ">" | ">=" | "<" | "<=";
  threshold_value?: number | null;
  threshold_severity?: "warning" | "critical";
  status: "active" | "pending_approval" | "draft";
  pending_revision: FormulaVersionSnapshot | null;
  history: FormulaVersionSnapshot[];
}

export type CalcRunTrigger =
  | "initial_baseline"
  | "manual_run"
  | "record_added"
  | "record_deleted"
  | "config_updated"
  | "factor_revised"
  | "formula_approved";

export interface CalcRunInputSummary {
  label: string;
  inputs: string;
  result: string;
}

export interface CalcRunEntry {
  id: string;
  run_number: number;
  timestamp: number;
  trigger: CalcRunTrigger;
  trigger_label: string;
  actor: string;
  note: string;
  inputs_snapshot: {
    config: Record<string, unknown>;
    record_count: number;
    entries: CalcRunInputSummary[];
  };
  outputs_snapshot: CalcKpi[];
  validation_summary?: {
    status: "passed" | "warning" | "blocked";
    checks_executed: number;
    error_count: number;
    warning_count: number;
    acknowledged_override?: boolean;
    override_reason?: string;
  };
}

export interface CalcEngineState {
  slug: CalcEngineSlug;
  number: string;
  title: string;
  subtitle: string;
  standard_ref: string;
  methodology: string;
  config: Record<string, unknown>;
  records: CalcRecord[];
  audit_log: CalcAuditEntry[];
  runs?: CalcRunEntry[];
}

export interface WorkspaceCalcStore {
  engines: Map<CalcEngineSlug, CalcEngineState>;
  emissionFactors: EmissionFactorItem[];
  formulas: FormulaRuleItem[];
}

export interface CalcEngineResponse {
  slug: CalcEngineSlug;
  number: string;
  title: string;
  subtitle: string;
  standard_ref: string;
  methodology: string;
  config: Record<string, unknown>;
  kpis: CalcKpi[];
  charts: {
    primary_title: string;
    primary_unit: string;
    primary_series: CalcChartPoint[];
    secondary_title?: string;
    secondary_unit?: string;
    secondary_series?: CalcChartPoint[];
  };
  records: CalcRecord[];
  audit_log: CalcAuditEntry[];
  calculation_history: CalcRunEntry[];
  validation?: CalcValidationReport;
  extra?: Record<string, unknown>;
}

const GWP_PRESETS: Record<string, { label: string; ch4: number; n2o: number }> = {
  AR6_FOSSIL_100: { label: "IPCC AR6 Fossil (100-yr)", ch4: 29.8, n2o: 273 },
  AR6_NON_FOSSIL_100: { label: "IPCC AR6 Non-Fossil (100-yr)", ch4: 27.0, n2o: 273 },
  AR5_100: { label: "IPCC AR5 (100-yr)", ch4: 28.0, n2o: 265 },
  AR6_20YR: { label: "IPCC AR6 Short-Term (20-yr)", ch4: 82.5, n2o: 273 },
};

const ALL_15_SCOPE3_CATEGORIES: Array<{
  cat: number;
  name: string;
  petrochemical_focus: boolean;
}> = [
  { cat: 1, name: "Cat 1: Purchased Goods & Services (Feedstock, Catalysts, Chemicals)", petrochemical_focus: true },
  { cat: 2, name: "Cat 2: Capital Goods", petrochemical_focus: false },
  { cat: 3, name: "Cat 3: Fuel- and Energy-Related Activities", petrochemical_focus: false },
  { cat: 4, name: "Cat 4: Upstream Transportation & Distribution", petrochemical_focus: true },
  { cat: 5, name: "Cat 5: Waste Generated in Operations", petrochemical_focus: true },
  { cat: 6, name: "Cat 6: Business Travel", petrochemical_focus: true },
  { cat: 7, name: "Cat 7: Employee Commuting", petrochemical_focus: false },
  { cat: 8, name: "Cat 8: Upstream Leased Assets", petrochemical_focus: true },
  { cat: 9, name: "Cat 9: Downstream Transportation & Distribution", petrochemical_focus: true },
  { cat: 10, name: "Cat 10: Processing of Sold Products", petrochemical_focus: true },
  { cat: 11, name: "Cat 11: Use of Sold Products (End Use)", petrochemical_focus: true },
  { cat: 12, name: "Cat 12: End-of-Life Treatment of Sold Products", petrochemical_focus: false },
  { cat: 13, name: "Cat 13: Downstream Leased Assets", petrochemical_focus: true },
  { cat: 14, name: "Cat 14: Franchises", petrochemical_focus: false },
  { cat: 15, name: "Cat 15: Investments", petrochemical_focus: false },
];

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round(v: number, dp = 2): number {
  const factor = 10 ** dp;
  return Math.round(v * factor) / factor;
}

function fmt(v: number, dp = 1): string {
  return round(v, dp).toLocaleString("en-US", {
    minimumFractionDigits: dp === 0 ? 0 : Math.min(dp, 1),
    maximumFractionDigits: dp,
  });
}

/** Safe recursive-descent math expression evaluator (no eval / new Function). */
export function evaluateSafeFormula(
  expression: string,
  variables: Record<string, number>,
): { value: number; error?: string } {
  const src = expression.trim();
  if (!src) return { value: 0, error: "Empty expression" };

  type Token =
    | { type: "num"; value: number }
    | { type: "id"; value: string }
    | { type: "op"; value: string }
    | { type: "paren"; value: "(" | ")" };

  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const parsed = Number(src.slice(i, j));
      if (!Number.isFinite(parsed)) {
        return { value: 0, error: `Invalid number '${src.slice(i, j)}'` };
      }
      tokens.push({ type: "num", value: parsed });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ type: "id", value: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i++;
      continue;
    }
    return { value: 0, error: `Unsupported character '${ch}'` };
  }

  let pos = 0;
  function peek(): Token | undefined {
    return tokens[pos];
  }
  function consume(): Token | undefined {
    return tokens[pos++];
  }

  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.type === "op" && (peek()?.value === "+" || peek()?.value === "-")) {
      const op = consume()!.value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseUnary();
    while (peek()?.type === "op" && (peek()?.value === "*" || peek()?.value === "/")) {
      const op = consume()!.value;
      const right = parseUnary();
      if (op === "/") {
        if (Math.abs(right) < 1e-12) {
          throw new Error("Division by zero");
        }
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parseUnary(): number {
    if (peek()?.type === "op" && (peek()?.value === "+" || peek()?.value === "-")) {
      const op = consume()!.value;
      const val = parseUnary();
      return op === "-" ? -val : val;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.type === "num") {
      consume();
      return t.value;
    }
    if (t.type === "id") {
      consume();
      if (!(t.value in variables)) {
        throw new Error(`Unknown variable '${t.value}'`);
      }
      return num(variables[t.value], 0);
    }
    if (t.type === "paren" && t.value === "(") {
      consume();
      const val = parseExpr();
      const close = consume();
      if (!close || close.type !== "paren" || close.value !== ")") {
        throw new Error("Missing closing parenthesis ')'");
      }
      return val;
    }
    throw new Error("Unexpected token");
  }

  try {
    const value = parseExpr();
    if (pos < tokens.length) {
      return { value: 0, error: "Unexpected trailing tokens" };
    }
    if (!Number.isFinite(value)) {
      return { value: 0, error: "Result is not finite" };
    }
    return { value: round(value, 4) };
  } catch (err) {
    return { value: 0, error: err instanceof Error ? err.message : "Invalid formula" };
  }
}

function evaluateThreshold(
  value: number,
  operator?: ">" | ">=" | "<" | "<=",
  limit?: number | null,
): boolean {
  if (limit === null || limit === undefined || !operator) return false;
  switch (operator) {
    case ">":
      return value > limit;
    case ">=":
      return value >= limit;
    case "<":
      return value < limit;
    case "<=":
      return value <= limit;
    default:
      return false;
  }
}

export function createInitialCalcStore(): WorkspaceCalcStore {
  const now = Date.now();
  const day = 86_400_000;

  const engines = new Map<CalcEngineSlug, CalcEngineState>();

  // 1. Scope 1 Calculation
  engines.set("scope-1", {
    slug: "scope-1",
    number: "01",
    title: "Scope 1 Calculation",
    subtitle:
      "Stationary combustion (boilers, furnaces, turbines), mobile combustion, flaring, fugitive emissions, process emissions, gas processing, and non-energy CO₂ (feedstock)",
    standard_ref: "GHG Protocol Corporate Standard · API Compendium 2021 · IPCC 2006",
    methodology:
      "Direct source-level activity multiplied by fuel/process emission factors and stoichiometric mass balances for feedstock & acid gas removal.",
    config: {
      reporting_year: "2025",
      gwp_basis: "AR6_FOSSIL_100",
      ch4_gwp: 29.8,
      n2o_gwp: 273,
    },
    records: [
      {
        id: "s1-1",
        created_at: now - 12 * day,
        updated_at: now - 2 * day,
        unit_name: "Cracking Furnaces F-101..F-106",
        source_category: "Stationary Combustion",
        equipment_type: "Ethylene Steam Cracker Furnaces",
        fuel_or_stream: "Fuel Gas (Refinery/Cracker Off-gas)",
        activity_amount: 142500,
        activity_unit: "MMBtu",
        ef_value: 0.0544,
        ef_unit: "tCO2e/MMBtu",
        co2_tonnes: 7710.2,
        ch4_tonnes: 0.92,
        n2o_tonnes: 0.05,
        total_tco2e: 7751.3,
        factor_ref: "EF-FG-01 (Site Lab)",
      },
      {
        id: "s1-2",
        created_at: now - 12 * day,
        updated_at: now - 2 * day,
        unit_name: "HP Steam Boilers B-201 & Gas Turbines GT-1/2",
        source_category: "Stationary Combustion",
        equipment_type: "Boilers & Cogeneration Turbines",
        fuel_or_stream: "Natural Gas",
        activity_amount: 98400,
        activity_unit: "MMBtu",
        ef_value: 0.0531,
        ef_unit: "tCO2e/MMBtu",
        co2_tonnes: 5212.0,
        ch4_tonnes: 0.31,
        n2o_tonnes: 0.01,
        total_tco2e: 5224.0,
        factor_ref: "EF-NG-EPA24",
      },
      {
        id: "s1-3",
        created_at: now - 10 * day,
        updated_at: now - 2 * day,
        unit_name: "Plant Logistics & Heavy Crane Fleet",
        source_category: "Mobile Combustion",
        equipment_type: "Diesel Trucks, Forklifts & Marine Tugs",
        fuel_or_stream: "Ultra-Low Sulfur Diesel",
        activity_amount: 342000,
        activity_unit: "Liters",
        ef_value: 0.00268,
        ef_unit: "tCO2e/L",
        co2_tonnes: 904.4,
        ch4_tonnes: 0.08,
        n2o_tonnes: 0.036,
        total_tco2e: 916.6,
        factor_ref: "EF-DSL-DEFRA24",
      },
      {
        id: "s1-4",
        created_at: now - 9 * day,
        updated_at: now - 1 * day,
        unit_name: "Elevated Flare Stack FL-01 & Ground Flare",
        source_category: "Flaring",
        equipment_type: "Hydrocarbon Purge & Emergency Flaring",
        fuel_or_stream: "Sour Flare Gas (98.2% DRE)",
        activity_amount: 58.4,
        activity_unit: "MMSCF",
        ef_value: 67.1,
        ef_unit: "tCO2e/MMSCF",
        co2_tonnes: 3418.4,
        ch4_tonnes: 16.4,
        n2o_tonnes: 0.04,
        total_tco2e: 3918.6,
        factor_ref: "EF-FLR-API21",
      },
      {
        id: "s1-5",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        unit_name: "LDAR Valves, Flanges & Compressor Seals",
        source_category: "Fugitive Emissions",
        equipment_type: "28,400 Tagged Components (OGI + Method 21)",
        fuel_or_stream: "Methane / Light Hydrocarbons",
        activity_amount: 48.2,
        activity_unit: "tCH4",
        ef_value: 29.8,
        ef_unit: "tCO2e/tCH4",
        co2_tonnes: 0,
        ch4_tonnes: 48.2,
        n2o_tonnes: 0,
        total_tco2e: 1436.4,
        factor_ref: "GWP-AR6-CH4",
      },
      {
        id: "s1-6",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        unit_name: "SMR Hydrogen Unit & Catalyst Regeneration",
        source_category: "Process Emissions",
        equipment_type: "Steam Methane Reformer & FCC Regenerator",
        fuel_or_stream: "Process Vent CO₂",
        activity_amount: 4180,
        activity_unit: "tCO2",
        ef_value: 1.0,
        ef_unit: "tCO2e/t",
        co2_tonnes: 4180.0,
        ch4_tonnes: 0,
        n2o_tonnes: 0,
        total_tco2e: 4180.0,
        factor_ref: "Mass-Balance Stoichiometric",
      },
      {
        id: "s1-7",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        unit_name: "Amine Acid Gas Removal Unit (AGRU-02)",
        source_category: "Gas Processing",
        equipment_type: "Sweetening & Dehydration Vent",
        fuel_or_stream: "Acid Gas CO₂ + Trace CH₄",
        activity_amount: 1940,
        activity_unit: "tGas",
        ef_value: 1.08,
        ef_unit: "tCO2e/t",
        co2_tonnes: 1910.0,
        ch4_tonnes: 6.2,
        n2o_tonnes: 0,
        total_tco2e: 2094.8,
        factor_ref: "AGRU CEMS",
      },
      {
        id: "s1-8",
        created_at: now - 5 * day,
        updated_at: now - 1 * day,
        unit_name: "Methanol / Urea Syngas Feedstock Loop",
        source_category: "Non-Energy CO2 (Feedstock)",
        equipment_type: "Non-Fuel Carbon Oxidation & Purge",
        fuel_or_stream: "Natural Gas Feedstock Carbon Uncaptured",
        activity_amount: 1620,
        activity_unit: "tCO2",
        ef_value: 1.0,
        ef_unit: "tCO2e/t",
        co2_tonnes: 1620.0,
        ch4_tonnes: 0,
        n2o_tonnes: 0,
        total_tco2e: 1620.0,
        factor_ref: "Carbon Balance Tier 3",
      },
    ],
    audit_log: [
      {
        id: "aud-s1-1",
        timestamp: now - day,
        actor: "Carbon Accounting Lead",
        action: "Reconciled CEMS & Carbon Balance",
        detail: "Verified AGRU-02 and Methanol feedstock non-energy CO₂ ledger.",
      },
    ],
  });

  // 2. Scope 2 Calculation
  engines.set("scope-2", {
    slug: "scope-2",
    number: "02",
    title: "Scope 2 Calculation",
    subtitle:
      "Location-based and market-based methods; PPAs, REC/I-REC certificates, purchased electricity and steam, grid losses",
    standard_ref: "GHG Protocol Scope 2 Guidance (Dual Reporting) · RE100 / I-REC Standard",
    methodology:
      "Dual reporting across grid-average emission factors (location-based) and contractual instruments including PPAs & I-RECs (market-based), incorporating T&D grid loss adjustments.",
    config: {
      grid_loss_pct: 5.4,
      residual_mix_ef_t_per_mwh: 0.562,
      location_grid_ef_t_per_mwh: 0.495,
      steam_ef_t_per_gj: 0.068,
    },
    records: [
      {
        id: "s2-1",
        created_at: now - 10 * day,
        updated_at: now - 2 * day,
        facility: "Olefin Complex — Main Substation",
        energy_type: "Purchased Electricity",
        instrument_type: "Grid Supply (Residual Mix)",
        consumption_mwh: 18400,
        grid_loss_mwh: 993.6,
        location_ef: 0.495,
        market_ef: 0.562,
        location_tco2e: 9599.8,
        market_tco2e: 10899.2,
        certificate_id: "Residual-Grid-2025-Q1",
      },
      {
        id: "s2-2",
        created_at: now - 9 * day,
        updated_at: now - 2 * day,
        facility: "Olefin Complex — Solar Utility PPA",
        energy_type: "Purchased Electricity (PPA)",
        instrument_type: "15-yr Physical Solar PPA + I-REC",
        consumption_mwh: 11200,
        grid_loss_mwh: 604.8,
        location_ef: 0.495,
        market_ef: 0.0,
        location_tco2e: 5843.4,
        market_tco2e: 0.0,
        certificate_id: "IREC-2025-SOL-88412",
      },
      {
        id: "s2-3",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        facility: "Polymer & Aromatics Unit — Wind RECs",
        energy_type: "Purchased Electricity (Unbundled I-REC)",
        instrument_type: "Certified Wind I-REC Retired",
        consumption_mwh: 6500,
        grid_loss_mwh: 351.0,
        location_ef: 0.495,
        market_ef: 0.0,
        location_tco2e: 3391.2,
        market_tco2e: 0.0,
        certificate_id: "IREC-2025-WND-40219",
      },
      {
        id: "s2-4",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        facility: "Petrochemical Zone — Imported HP Steam",
        energy_type: "Purchased Steam",
        instrument_type: "District CHP Bilateral Contract",
        consumption_mwh: 9100,
        grid_loss_mwh: 227.5,
        location_ef: 0.245,
        market_ef: 0.218,
        location_tco2e: 2285.2,
        market_tco2e: 2033.4,
        certificate_id: "CHP-STM-2025-04",
      },
    ],
    audit_log: [
      {
        id: "aud-s2-1",
        timestamp: now - day,
        actor: "Energy Procurement",
        action: "Retired 17,700 MWh I-RECs",
        detail: "Matched Solar PPA (11,200 MWh) & Wind I-REC (6,500 MWh) in market-based scope.",
      },
    ],
  });

  // 3. Scope 3 Calculation (All 15 Categories, Petrochemical focus)
  engines.set("scope-3", {
    slug: "scope-3",
    number: "03",
    title: "Scope 3 Calculation",
    subtitle:
      "All 15 GHG Protocol categories; petrochemical focus on purchased feedstock, upstream & downstream transport, catalysts & chemicals, waste, business travel, leased assets, processing of sold products, and end use",
    standard_ref: "GHG Protocol Corporate Value Chain (Scope 3) Standard · TfS PCF Guideline",
    methodology:
      "Hybrid calculation combining supplier-specific primary product carbon footprints (PCF), mass-based emission factors for naphtha/ethane feedstocks, distance-based freight ton-km, and stoichiometry for end-use oxidation.",
    config: {
      focus_mode: "petrochemical_priority",
      total_categories: 15,
    },
    records: [
      {
        id: "s3-1",
        created_at: now - 11 * day,
        updated_at: now - 1 * day,
        category_num: 1,
        category_name: "Cat 1: Purchased Goods & Services (Feedstock, Catalysts, Chemicals)",
        sub_stream: "Naphtha & Ethane Cracking Feedstock",
        method: "Supplier PCF / Mass-Based",
        activity_value: 84000,
        activity_unit: "tonnes",
        ef_value: 0.42,
        emissions_tco2e: 35280.0,
        petrochemical_priority: true,
        data_quality: "High (Primary PCF)",
      },
      {
        id: "s3-1b",
        created_at: now - 10 * day,
        updated_at: now - 1 * day,
        category_num: 1,
        category_name: "Cat 1: Purchased Goods & Services (Feedstock, Catalysts, Chemicals)",
        sub_stream: "Catalysts, Inhibitors & Process Chemicals",
        method: "Activity / Spend Hybrid",
        activity_value: 2450,
        activity_unit: "tonnes",
        ef_value: 2.85,
        emissions_tco2e: 6982.5,
        petrochemical_priority: true,
        data_quality: "Medium (Cradle-to-Gate)",
      },
      {
        id: "s3-2",
        created_at: now - 9 * day,
        updated_at: now - 1 * day,
        category_num: 2,
        category_name: "Cat 2: Capital Goods",
        sub_stream: "Heat Exchangers, Piping & Rotating Machinery",
        method: "Spend-Based EEIO",
        activity_value: 4.8,
        activity_unit: "$M USD",
        ef_value: 310.0,
        emissions_tco2e: 1488.0,
        petrochemical_priority: false,
        data_quality: "Spend-Based",
      },
      {
        id: "s3-3",
        created_at: now - 9 * day,
        updated_at: now - 1 * day,
        category_num: 3,
        category_name: "Cat 3: Fuel- and Energy-Related Activities",
        sub_stream: "Well-to-Tank (WTT) Fuel & Grid T&D Losses",
        method: "Average-Data WTT",
        activity_value: 240900,
        activity_unit: "MMBtu",
        ef_value: 0.0145,
        emissions_tco2e: 3493.1,
        petrochemical_priority: false,
        data_quality: "High (IEA/DEFRA)",
      },
      {
        id: "s3-4",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        category_num: 4,
        category_name: "Cat 4: Upstream Transportation & Distribution",
        sub_stream: "Marine Chemical Tanker & Rail Feedstock Logistics",
        method: "Distance-Based (t-km)",
        activity_value: 148000000,
        activity_unit: "tonne-km",
        ef_value: 0.000028,
        emissions_tco2e: 4144.0,
        petrochemical_priority: true,
        data_quality: "High (AIS/Waybill)",
      },
      {
        id: "s3-5",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        category_num: 5,
        category_name: "Cat 5: Waste Generated in Operations",
        sub_stream: "Third-Party Incineration & Hazardous Waste Treatment",
        method: "Waste-Type Specific",
        activity_value: 1180,
        activity_unit: "tonnes",
        ef_value: 1.32,
        emissions_tco2e: 1557.6,
        petrochemical_priority: true,
        data_quality: "High (Manifests)",
      },
      {
        id: "s3-6",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        category_num: 6,
        category_name: "Cat 6: Business Travel",
        sub_stream: "Aviation, Rail & Hotel Stays",
        method: "Distance-Based (p-km)",
        activity_value: 1640000,
        activity_unit: "passenger-km",
        ef_value: 0.00018,
        emissions_tco2e: 295.2,
        petrochemical_priority: true,
        data_quality: "High (TMC Feed)",
      },
      {
        id: "s3-7",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        category_num: 7,
        category_name: "Cat 7: Employee Commuting",
        sub_stream: "Plant Shift Bus & Private Commute",
        method: "Survey + Shuttle Logs",
        activity_value: 1120,
        activity_unit: "employees",
        ef_value: 0.58,
        emissions_tco2e: 649.6,
        petrochemical_priority: false,
        data_quality: "Medium",
      },
      {
        id: "s3-8",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        category_num: 8,
        category_name: "Cat 8: Upstream Leased Assets",
        sub_stream: "Leased Cryogenic Storage Tanks & Nitrogen Units",
        method: "Asset-Specific Energy",
        activity_value: 2950,
        activity_unit: "MWh eq",
        ef_value: 0.495,
        emissions_tco2e: 1460.3,
        petrochemical_priority: true,
        data_quality: "High",
      },
      {
        id: "s3-9",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        category_num: 9,
        category_name: "Cat 9: Downstream Transportation & Distribution",
        sub_stream: "Export Product Tanker & ISO-Container Freight",
        method: "Distance-Based (t-km)",
        activity_value: 215000000,
        activity_unit: "tonne-km",
        ef_value: 0.000024,
        emissions_tco2e: 5160.0,
        petrochemical_priority: true,
        data_quality: "Medium",
      },
      {
        id: "s3-10",
        created_at: now - 5 * day,
        updated_at: now - 1 * day,
        category_num: 10,
        category_name: "Cat 10: Processing of Sold Products",
        sub_stream: "Downstream Polymer Pelletizing & Resin Conversion",
        method: "Customer Conversion Intensity",
        activity_value: 46000,
        activity_unit: "tonnes",
        ef_value: 0.29,
        emissions_tco2e: 13340.0,
        petrochemical_priority: true,
        data_quality: "Medium",
      },
      {
        id: "s3-11",
        created_at: now - 4 * day,
        updated_at: now - 1 * day,
        category_num: 11,
        category_name: "Cat 11: Use of Sold Products (End Use)",
        sub_stream: "Fuel / Solvent & Methanol Combustion End-Use",
        method: "Carbon Content Stoichiometry",
        activity_value: 21500,
        activity_unit: "tonnes",
        ef_value: 1.375,
        emissions_tco2e: 29562.5,
        petrochemical_priority: true,
        data_quality: "High (Lab Carbon %)",
      },
      {
        id: "s3-12",
        created_at: now - 4 * day,
        updated_at: now - 1 * day,
        category_num: 12,
        category_name: "Cat 12: End-of-Life Treatment of Sold Products",
        sub_stream: "Post-Consumer Plastics Incineration & Landfill",
        method: "Regional Waste Mix",
        activity_value: 32000,
        activity_unit: "tonnes",
        ef_value: 0.21,
        emissions_tco2e: 6720.0,
        petrochemical_priority: false,
        data_quality: "Estimated",
      },
      {
        id: "s3-13",
        created_at: now - 3 * day,
        updated_at: now - 1 * day,
        category_num: 13,
        category_name: "Cat 13: Downstream Leased Assets",
        sub_stream: "Leased Port Terminal Loading Arms & Tanks",
        method: "Asset-Specific Energy",
        activity_value: 1850,
        activity_unit: "MWh eq",
        ef_value: 0.495,
        emissions_tco2e: 915.8,
        petrochemical_priority: true,
        data_quality: "Medium",
      },
      {
        id: "s3-14",
        created_at: now - 3 * day,
        updated_at: now - 1 * day,
        category_num: 14,
        category_name: "Cat 14: Franchises",
        sub_stream: "Not Material (Direct B2B Sales Model)",
        method: "Screened — Zero",
        activity_value: 0,
        activity_unit: "sites",
        ef_value: 0,
        emissions_tco2e: 0,
        petrochemical_priority: false,
        data_quality: "Screened N/A",
      },
      {
        id: "s3-15",
        created_at: now - 2 * day,
        updated_at: now - 1 * day,
        category_num: 15,
        category_name: "Cat 15: Investments",
        sub_stream: "Joint Venture (18% Equity) Downstream Terminal",
        method: "Equity Share Investment",
        activity_value: 18,
        activity_unit: "% share",
        ef_value: 120.0,
        emissions_tco2e: 2160.0,
        petrochemical_priority: false,
        data_quality: "High (JV Report)",
      },
    ],
    audit_log: [
      {
        id: "aud-s3-1",
        timestamp: now - day,
        actor: "Value Chain ESG Analyst",
        action: "Completed 15/15 Category Screening",
        detail: "Updated Cat 1 Feedstock & Catalysts with primary supplier PCF.",
      },
    ],
  });

  // 4. Emission Factor Library (special store + engine wrapper)
  const emissionFactors: EmissionFactorItem[] = [
    {
      id: "ef-1",
      code: "EF-NG-IPCC06",
      name: "Natural Gas Stationary Combustion",
      category: "Scope 1 · Stationary",
      gas: "CO₂e",
      source_standard: "IPCC 2006",
      current_version: 2,
      value: 0.0561,
      unit: "tCO2e/GJ",
      valid_from: "2024-01-01",
      valid_to: null,
      uncertainty_pct: 2.5,
      status: "active",
      versions: [
        {
          version: 1,
          value: 0.0560,
          unit: "tCO2e/GJ",
          source: "IPCC 2006 Vol 2 Table 2.2",
          valid_from: "2021-01-01",
          valid_to: "2023-12-31",
          uncertainty_pct: 3.0,
          notes: "Initial AR4 NCV baseline",
          updated_at: now - 120 * day,
          updated_by: "ESG Governance Admin",
        },
        {
          version: 2,
          value: 0.0561,
          unit: "tCO2e/GJ",
          source: "IPCC 2006 + AR6 CH4/N2O Update",
          valid_from: "2024-01-01",
          valid_to: null,
          uncertainty_pct: 2.5,
          notes: "Updated trace CH4/N2O factors to AR6 GWP",
          updated_at: now - 15 * day,
          updated_by: "Chief Carbon Auditor",
        },
      ],
    },
    {
      id: "ef-2",
      code: "EF-DSL-DEFRA24",
      name: "Heavy Diesel Fleet Fuel (Mobile)",
      category: "Scope 1 · Mobile",
      gas: "CO₂e",
      source_standard: "DEFRA",
      current_version: 2,
      value: 0.00268,
      unit: "tCO2e/L",
      valid_from: "2024-06-01",
      valid_to: null,
      uncertainty_pct: 3.2,
      status: "active",
      versions: [
        {
          version: 1,
          value: 0.00264,
          unit: "tCO2e/L",
          source: "UK DEFRA 2023 Conversion Factors",
          valid_from: "2023-06-01",
          valid_to: "2024-05-31",
          uncertainty_pct: 3.5,
          notes: "2023 annual release",
          updated_at: now - 200 * day,
          updated_by: "Fleet Compliance",
        },
        {
          version: 2,
          value: 0.00268,
          unit: "tCO2e/L",
          source: "UK DEFRA 2024 Conversion Factors",
          valid_from: "2024-06-01",
          valid_to: null,
          uncertainty_pct: 3.2,
          notes: "2024 mineral diesel average blend",
          updated_at: now - 30 * day,
          updated_by: "ESG Governance Admin",
        },
      ],
    },
    {
      id: "ef-3",
      code: "EF-FG-EPA24",
      name: "Refinery & Cracker Fuel Gas",
      category: "Scope 1 · Stationary",
      gas: "CO₂e",
      source_standard: "EPA",
      current_version: 1,
      value: 0.0592,
      unit: "tCO2e/MMBtu",
      valid_from: "2024-01-01",
      valid_to: null,
      uncertainty_pct: 4.1,
      status: "active",
      versions: [
        {
          version: 1,
          value: 0.0592,
          unit: "tCO2e/MMBtu",
          source: "US EPA 40 CFR Part 98 Table C-1",
          valid_from: "2024-01-01",
          valid_to: null,
          uncertainty_pct: 4.1,
          notes: "Default fuel gas emission factor",
          updated_at: now - 60 * day,
          updated_by: "ESG Governance Admin",
        },
      ],
    },
    {
      id: "ef-4",
      code: "EF-GRID-IEA24",
      name: "National Grid Electricity Intensity",
      category: "Scope 2 · Electricity",
      gas: "CO₂e",
      source_standard: "IEA",
      current_version: 2,
      value: 0.495,
      unit: "tCO2e/MWh",
      valid_from: "2025-01-01",
      valid_to: null,
      uncertainty_pct: 4.8,
      status: "active",
      versions: [
        {
          version: 1,
          value: 0.512,
          unit: "tCO2e/MWh",
          source: "IEA Emission Factors 2023",
          valid_from: "2023-01-01",
          valid_to: "2024-12-31",
          uncertainty_pct: 5.0,
          notes: "2023 grid mix",
          updated_at: now - 180 * day,
          updated_by: "Energy Procurement",
        },
        {
          version: 2,
          value: 0.495,
          unit: "tCO2e/MWh",
          source: "IEA Emission Factors 2024",
          valid_from: "2025-01-01",
          valid_to: null,
          uncertainty_pct: 4.8,
          notes: "Higher solar & CCGT share reflected",
          updated_at: now - 10 * day,
          updated_by: "Chief Carbon Auditor",
        },
      ],
    },
    {
      id: "ef-5",
      code: "EF-FG-SITE01",
      name: "Cracker Off-Gas Chromatograph Composite",
      category: "Scope 1 · Site-Specific",
      gas: "CO₂",
      source_standard: "Site-Specific",
      current_version: 3,
      value: 0.0544,
      unit: "tCO2/MMBtu",
      valid_from: "2025-02-01",
      valid_to: null,
      uncertainty_pct: 1.4,
      status: "active",
      versions: [
        {
          version: 1,
          value: 0.0558,
          unit: "tCO2/MMBtu",
          source: "GC Online Analyzer Q3-2024",
          valid_from: "2024-07-01",
          valid_to: "2024-10-31",
          uncertainty_pct: 1.8,
          notes: "Initial online GC calibration",
          updated_at: now - 90 * day,
          updated_by: "Process Engineering",
        },
        {
          version: 2,
          value: 0.0549,
          unit: "tCO2/MMBtu",
          source: "GC Online Analyzer Q4-2024",
          valid_from: "2024-11-01",
          valid_to: "2025-01-31",
          uncertainty_pct: 1.5,
          notes: "Hydrogen-rich furnace blend",
          updated_at: now - 40 * day,
          updated_by: "Process Engineering",
        },
        {
          version: 3,
          value: 0.0544,
          unit: "tCO2/MMBtu",
          source: "GC Online Analyzer Q1-2025 (ISO 17025)",
          valid_from: "2025-02-01",
          valid_to: null,
          uncertainty_pct: 1.4,
          notes: "Verified quarterly C/H molecular weight ratio",
          updated_at: now - 5 * day,
          updated_by: "Lab QA Lead",
        },
      ],
    },
    {
      id: "ef-6",
      code: "EF-FLARE-LAB",
      name: "Sour Flare Header Lab Gas Assay",
      category: "Scope 1 · Lab-Specific",
      gas: "CO₂e",
      source_standard: "Lab-Specific",
      current_version: 1,
      value: 67.1,
      unit: "tCO2e/MMSCF",
      valid_from: "2025-01-15",
      valid_to: null,
      uncertainty_pct: 2.1,
      status: "active",
      versions: [
        {
          version: 1,
          value: 67.1,
          unit: "tCO2e/MMSCF",
          source: "ASTM D1945 Lab Gas Chromatography",
          valid_from: "2025-01-15",
          valid_to: null,
          uncertainty_pct: 2.1,
          notes: "Lab assay including C1-C5+ and H2S correction",
          updated_at: now - 14 * day,
          updated_by: "Lab QA Lead",
        },
      ],
    },
  ];

  engines.set("emission-factors", {
    slug: "emission-factors",
    number: "04",
    title: "Emission Factor Library",
    subtitle:
      "IPCC 2006, DEFRA, EPA, IEA, site- and lab-specific factors; versioned, dated, and auditable",
    standard_ref: "ISO 14064-1 §5 · GHG Protocol Auditability Standard",
    methodology:
      "Immutable factor version lineage with effective validity intervals (valid_from/valid_to), lab/standard provenance, and uncertainty percentages.",
    config: { total_standards: 6 },
    records: [],
    audit_log: [
      {
        id: "aud-ef-1",
        timestamp: now - 5 * day,
        actor: "Lab QA Lead",
        action: "Revised EF-FG-SITE01 to v3",
        detail: "Updated cracker off-gas factor from 0.0549 to 0.0544 tCO2/MMBtu (ISO 17025 lab check).",
      },
    ],
  });

  // 5. Methane Accounting (OGMP 2.0 Levels 4 & 5)
  engines.set("methane", {
    slug: "methane",
    number: "05",
    title: "Methane Accounting (OGMP 2.0)",
    subtitle:
      "OGMP 2.0 Levels 4 and 5, asset-specific emission factors, ground/aerial/satellite measurement data, conversion with current GWP (AR5/AR6) and transparent GWP selection",
    standard_ref: "OGMP 2.0 Framework (UNEP) · IPCC AR5 / AR6 · IPIECA Methane",
    methodology:
      "Reconciles Level 4 bottom-up source-specific measurements (OGI/Hi-Flow/CEMS) with Level 5 site-level top-down aerial & satellite campaigns, converting CH₄ mass using transparently selected AR5 or AR6 GWP.",
    config: {
      gwp_preset: "AR6_FOSSIL_100",
      gwp_ch4: 29.8,
      ogmp_target_level: "Level 5",
    },
    records: [
      {
        id: "ch4-1",
        created_at: now - 10 * day,
        updated_at: now - 2 * day,
        asset_name: "Compressor Station CS-01 (Seals & Vents)",
        ogmp_level: "Level 4",
        modality: "Ground (OGI + Hi-Flow Sampler)",
        ch4_tonnes: 24.6,
        uncertainty_pct: 9.5,
        campaign_date: "2025-02-18",
        notes: "Asset-specific compressor dry-gas seal vent direct flow",
      },
      {
        id: "ch4-2",
        created_at: now - 9 * day,
        updated_at: now - 2 * day,
        asset_name: "Gas Processing Train GP-02 (Pneumatics & Valves)",
        ogmp_level: "Level 4",
        modality: "Ground (Method 21 + Acoustic)",
        ch4_tonnes: 14.8,
        uncertainty_pct: 12.0,
        campaign_date: "2025-02-24",
        notes: "Asset-specific LDAR survey across 11,200 tags",
      },
      {
        id: "ch4-3",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        asset_name: "Tank Farm & Flare Header (Site-Wide)",
        ogmp_level: "Level 5",
        modality: "Aerial (LiDAR / Mass-Balance Flight)",
        ch4_tonnes: 43.2,
        uncertainty_pct: 14.0,
        campaign_date: "2025-03-04",
        notes: "Top-down aircraft plume inversion across perimeter",
      },
      {
        id: "ch4-4",
        created_at: now - 5 * day,
        updated_at: now - 1 * day,
        asset_name: "Petrochemical Terminal & Pipeline Corridor",
        ogmp_level: "Level 5",
        modality: "Satellite (GHGSat / Sentinel-5P)",
        ch4_tonnes: 45.9,
        uncertainty_pct: 18.5,
        campaign_date: "2025-03-10",
        notes: "High-resolution 25m satellite overpass reconciliation",
      },
    ],
    audit_log: [
      {
        id: "aud-ch4-1",
        timestamp: now - day,
        actor: "LDAR & Methane Lead",
        action: "OGMP 2.0 Level 4 vs 5 Reconciliation",
        detail: "Aerial + Satellite mean (44.55 tCH4) reconciled against Level 4 + tank vents (39.4 tCH4); 11.6% unexplained variance flagged for OGI inspection.",
      },
    ],
  });

  // 6. Flaring & Losses
  engines.set("flaring", {
    slug: "flaring",
    number: "06",
    title: "Flaring & Losses",
    subtitle:
      "Flare combustion efficiency, flare-to-production ratio, flaring intensity, continuous monitoring and reconciliation with operational data",
    standard_ref: "World Bank Zero Routine Flaring 2030 · API Compendium · EU Methane Reg",
    methodology:
      "Tracks ultrasonic/CEMS continuous flare gas flow vs DCS hydrocarbon mass-balance estimates, accounting for Destruction & Removal Efficiency (DRE) and unburned CH₄ slip.",
    config: {
      benchmark_dre_pct: 98.0,
      max_reconciliation_gap_pct: 5.0,
      gwp_ch4: 29.8,
    },
    records: [
      {
        id: "flr-1",
        created_at: now - 14 * day,
        updated_at: now - 1 * day,
        flare_unit: "Elevated Ethylene Flare FL-101",
        monitoring_mode: "Continuous Ultrasonic + GC",
        cems_flared_mscf: 21400,
        ops_balance_mscf: 20950,
        production_boe: 412000,
        dre_pct: 98.4,
        co2_tonnes: 1215.2,
        unburned_ch4_tonnes: 5.1,
        total_tco2e: 1367.2,
      },
      {
        id: "flr-2",
        created_at: now - 10 * day,
        updated_at: now - 1 * day,
        flare_unit: "Sour Gas Processing Flare FL-202",
        monitoring_mode: "Continuous Optical + Thermal Flow",
        cems_flared_mscf: 18900,
        ops_balance_mscf: 17820,
        production_boe: 365000,
        dre_pct: 97.6,
        co2_tonnes: 1068.4,
        unburned_ch4_tonnes: 6.9,
        total_tco2e: 1274.0,
      },
      {
        id: "flr-3",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        flare_unit: "Ground Enclosed Flare FL-301",
        monitoring_mode: "Continuous CEMS + Steam-Assist",
        cems_flared_mscf: 9200,
        ops_balance_mscf: 9080,
        production_boe: 280000,
        dre_pct: 99.1,
        co2_tonnes: 528.9,
        unburned_ch4_tonnes: 1.3,
        total_tco2e: 567.6,
      },
    ],
    audit_log: [
      {
        id: "aud-flr-1",
        timestamp: now - day,
        actor: "Flare Operations Engineer",
        action: "CEMS-to-DCS Reconciliation",
        detail: "FL-202 steam-to-hydrocarbon ratio tuned after 97.6% DRE warning.",
      },
    ],
  });

  // 7. Carbon Intensity
  engines.set("carbon-intensity", {
    slug: "carbon-intensity",
    number: "07",
    title: "Carbon Intensity",
    subtitle:
      "Per tonne of product (ethylene, methanol, urea, aromatics), per barrel of oil equivalent, and per value added; with configurable custom formulas",
    standard_ref: "ISO 14067 · TfS Product Carbon Footprint · EU ETS Benchmarks",
    methodology:
      "Allocates Scope 1 + Scope 2 (market-based) emissions across primary product lines and financial value added, supporting custom weighted/allocated intensity expressions.",
    config: {
      custom_formula_expression: "(scope1_tco2e + scope2_tco2e) / production_tonnes",
      include_scope2_mode: "market_based",
    },
    records: [
      {
        id: "ci-1",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        product_stream: "Ethylene (HVC)",
        denominator_type: "Per Tonne Product",
        allocated_emissions_tco2e: 14280,
        denominator_value: 16400,
        denominator_unit: "t Ethylene",
        intensity_value: 0.871,
        intensity_unit: "tCO2e / t product",
        benchmark_value: 0.92,
      },
      {
        id: "ci-2",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        product_stream: "Methanol",
        denominator_type: "Per Tonne Product",
        allocated_emissions_tco2e: 9850,
        denominator_value: 15200,
        denominator_unit: "t Methanol",
        intensity_value: 0.648,
        intensity_unit: "tCO2e / t product",
        benchmark_value: 0.68,
      },
      {
        id: "ci-3",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        product_stream: "Urea (Granular)",
        denominator_type: "Per Tonne Product",
        allocated_emissions_tco2e: 6420,
        denominator_value: 11800,
        denominator_unit: "t Urea",
        intensity_value: 0.544,
        intensity_unit: "tCO2e / t product",
        benchmark_value: 0.58,
      },
      {
        id: "ci-4",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        product_stream: "Aromatics (BTX)",
        denominator_type: "Per Tonne Product",
        allocated_emissions_tco2e: 5940,
        denominator_value: 9600,
        denominator_unit: "t Aromatics",
        intensity_value: 0.619,
        intensity_unit: "tCO2e / t product",
        benchmark_value: 0.65,
      },
      {
        id: "ci-5",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        product_stream: "Hydrocarbon Throughput (Total Site)",
        denominator_type: "Per Barrel of Oil Equivalent",
        allocated_emissions_tco2e: 36490,
        denominator_value: 1057000,
        denominator_unit: "BOE",
        intensity_value: 0.0345,
        intensity_unit: "tCO2e / BOE",
        benchmark_value: 0.038,
      },
      {
        id: "ci-6",
        created_at: now - 5 * day,
        updated_at: now - 1 * day,
        product_stream: "Economic Intensity (Gross Value Added)",
        denominator_type: "Per Value Added",
        allocated_emissions_tco2e: 36490,
        denominator_value: 148.5,
        denominator_unit: "$M Value Added",
        intensity_value: 245.7,
        intensity_unit: "tCO2e / $M GVA",
        benchmark_value: 265.0,
      },
    ],
    audit_log: [
      {
        id: "aud-ci-1",
        timestamp: now - day,
        actor: "Process Performance Analyst",
        action: "Updated EU ETS Product Benchmarks",
        detail: "Verified Ethylene (0.871 vs 0.92 benchmark) and Methanol intensities.",
      },
    ],
  });

  // 8. Water Accounting
  engines.set("water", {
    slug: "water",
    number: "08",
    title: "Water Accounting",
    subtitle:
      "Withdrawal, consumption, discharge, produced water, effluent quality (COD, TDS, phenols, heavy metals), and basin water stress (WRI Aqueduct)",
    standard_ref: "GRI 303 (2018) · WRI Aqueduct 4.0 · IPIECA Water Reporting",
    methodology:
      "Full site water balance (Withdrawal = Consumption + Discharge) paired with continuous/lab effluent pollutant concentration verification and WRI Aqueduct basin stress scoring.",
    config: {
      cod_limit_mg_l: 120,
      tds_limit_mg_l: 2000,
      phenols_limit_mg_l: 0.5,
      heavy_metals_limit_mg_l: 0.2,
    },
    records: [
      {
        id: "wat-1",
        created_at: now - 9 * day,
        updated_at: now - 1 * day,
        facility: "Petrochemical Zone A — Cooling & Process",
        basin_name: "Coastal Arid Basin #14",
        wri_stress_score: 4.3,
        wri_stress_tier: "Extremely High (>80%)",
        withdrawal_m3: 48200,
        produced_water_m3: 3400,
        reused_m3: 18900,
        discharge_m3: 24100,
        consumption_m3: 24100,
        cod_mg_l: 68,
        tds_mg_l: 1420,
        phenols_mg_l: 0.18,
        heavy_metals_mg_l: 0.06,
      },
      {
        id: "wat-2",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        facility: "Gas Processing & Produced Water Plant",
        basin_name: "Inland Semi-Arid Sub-Basin",
        wri_stress_score: 3.4,
        wri_stress_tier: "High (40-80%)",
        withdrawal_m3: 21500,
        produced_water_m3: 9800,
        reused_m3: 9200,
        discharge_m3: 11800,
        consumption_m3: 9700,
        cod_mg_l: 94,
        tds_mg_l: 1810,
        phenols_mg_l: 0.34,
        heavy_metals_mg_l: 0.11,
      },
      {
        id: "wat-3",
        created_at: now - 5 * day,
        updated_at: now - 1 * day,
        facility: "Marine Desalination & Utility Plant",
        basin_name: "Gulf Seawater Intake",
        wri_stress_score: 1.6,
        wri_stress_tier: "Low-Medium (10-20%)",
        withdrawal_m3: 34600,
        produced_water_m3: 0,
        reused_m3: 11400,
        discharge_m3: 26800,
        consumption_m3: 7800,
        cod_mg_l: 41,
        tds_mg_l: 1190,
        phenols_mg_l: 0.09,
        heavy_metals_mg_l: 0.04,
      },
    ],
    audit_log: [
      {
        id: "aud-wat-1",
        timestamp: now - day,
        actor: "Environmental Lab Lead",
        action: "Uploaded Monthly ETP Effluent Assay",
        detail: "All 3 facilities compliant on COD, TDS, phenols, and heavy metals limits.",
      },
    ],
  });

  // 9. Waste & Materials
  engines.set("waste", {
    slug: "waste",
    number: "09",
    title: "Waste & Materials",
    subtitle:
      "Hazardous/non-hazardous waste, spent catalyst, treatment-plant sludge, disposal route, recycling, material circularity, and packaging",
    standard_ref: "GRI 306 (2020) · Ellen MacArthur MCI · Basel Convention",
    methodology:
      "Tracks hazardous & non-hazardous waste streams including spent hydrotreating/polymerization catalysts and ETP sludge by licensed disposal route, calculating overall diversion & material circularity.",
    config: {
      recycled_input_materials_tonnes: 8420,
      total_material_inputs_tonnes: 42100,
      packaging_recovered_pct: 74.5,
    },
    records: [
      {
        id: "wst-1",
        created_at: now - 10 * day,
        updated_at: now - 1 * day,
        waste_stream: "Spent Nickel/Molybdenum Catalysts",
        hazard_class: "Hazardous",
        disposal_route: "Metal Recovery & Recycling",
        tonnes: 245.0,
        recovered: true,
        contractor: "Certified Precious & Base Metal Refiner",
      },
      {
        id: "wst-2",
        created_at: now - 9 * day,
        updated_at: now - 1 * day,
        waste_stream: "ETP Biological & API Separator Sludge",
        hazard_class: "Hazardous",
        disposal_route: "Cement Kiln Co-Processing (Energy Recovery)",
        tonnes: 412.5,
        recovered: true,
        contractor: "Industrial Co-Processing Partner",
      },
      {
        id: "wst-3",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        waste_stream: "Contaminated Spent Solvents & Oily Rags",
        hazard_class: "Hazardous",
        disposal_route: "High-Temp Hazardous Incineration",
        tonnes: 168.0,
        recovered: false,
        contractor: "Licensed HazWaste Thermal Unit",
      },
      {
        id: "wst-4",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        waste_stream: "Off-Spec Polymer Scrap & Pallet Packaging",
        hazard_class: "Non-Hazardous",
        disposal_route: "Mechanical Recycling & Re-pelletizing",
        tonnes: 690.0,
        recovered: true,
        contractor: "Circular Polymer Reprocessor",
      },
      {
        id: "wst-5",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        waste_stream: "Industrial Packaging (Drums, IBCs & Film)",
        hazard_class: "Non-Hazardous",
        disposal_route: "Closed-Loop Reconditioning & Recycling",
        tonnes: 318.0,
        recovered: true,
        contractor: "Packaging Take-Back Network",
      },
      {
        id: "wst-6",
        created_at: now - 5 * day,
        updated_at: now - 1 * day,
        waste_stream: "Refractory Brick & Inert Construction Debris",
        hazard_class: "Non-Hazardous",
        disposal_route: "Engineered Landfill",
        tonnes: 284.0,
        recovered: false,
        contractor: "Municipal Industrial Site",
      },
    ],
    audit_log: [
      {
        id: "aud-wst-1",
        timestamp: now - 2 * day,
        actor: "Circular Economy Officer",
        action: "Verified Spent Catalyst Metal Recovery",
        detail: "245 t spent Ni/Mo catalyst routed to off-site metal reclamation (94% recovery yield).",
      },
    ],
  });

  // 10. Air Emissions
  engines.set("air-emissions", {
    slug: "air-emissions",
    number: "10",
    title: "Air Emissions",
    subtitle:
      "SO₂, NOx, PM, VOC, H₂S, benzene; comparison against permit limits and compliance monitoring",
    standard_ref: "GRI 305-7 · EU IED BREF (Refining & LVOC) · EPA NESHAP",
    methodology:
      "Monitors continuous stack analyzers (CEMS) and perimeter ambient stations across criteria pollutants and HAPs (H₂S, benzene), comparing observed mass & concentration against regulatory permit caps.",
    config: {
      compliance_warning_threshold_pct: 85,
    },
    records: [
      {
        id: "air-1",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        pollutant: "NOx",
        source_unit: "Cracking Furnaces & Boilers (CEMS)",
        measured_tonnes_yr: 184.2,
        permit_limit_tonnes_yr: 260.0,
        measured_conc: 92,
        permit_conc_limit: 150,
        conc_unit: "mg/Nm³",
        monitoring_method: "Continuous CEMS",
      },
      {
        id: "air-2",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        pollutant: "SO₂",
        source_unit: "Sulfur Recovery Unit (SRU) & Heaters",
        measured_tonnes_yr: 112.5,
        permit_limit_tonnes_yr: 180.0,
        measured_conc: 118,
        permit_conc_limit: 200,
        conc_unit: "mg/Nm³",
        monitoring_method: "Continuous CEMS",
      },
      {
        id: "air-3",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        pollutant: "PM",
        source_unit: "Catalyst Handling & Boiler Stacks",
        measured_tonnes_yr: 21.4,
        permit_limit_tonnes_yr: 40.0,
        measured_conc: 11.2,
        permit_conc_limit: 20.0,
        conc_unit: "mg/Nm³",
        monitoring_method: "Isokinetic Stack Test",
      },
      {
        id: "air-4",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        pollutant: "VOC",
        source_unit: "Tank Breathing, Loading & LDAR",
        measured_tonnes_yr: 94.8,
        permit_limit_tonnes_yr: 110.0,
        measured_conc: 42.0,
        permit_conc_limit: 50.0,
        conc_unit: "mg/Nm³",
        monitoring_method: "OGI + Vapor Recovery Meter",
      },
      {
        id: "air-5",
        created_at: now - 5 * day,
        updated_at: now - 1 * day,
        pollutant: "H₂S",
        source_unit: "Sour Gas Amine & Fence-Line Monitors",
        measured_tonnes_yr: 2.1,
        permit_limit_tonnes_yr: 5.0,
        measured_conc: 1.8,
        permit_conc_limit: 5.0,
        conc_unit: "ppm",
        monitoring_method: "Perimeter UV-DOAS",
      },
      {
        id: "air-6",
        created_at: now - 4 * day,
        updated_at: now - 1 * day,
        pollutant: "Benzene",
        source_unit: "Aromatics Extraction & Fence-Line Tube",
        measured_tonnes_yr: 1.42,
        permit_limit_tonnes_yr: 2.5,
        measured_conc: 2.9,
        permit_conc_limit: 5.0,
        conc_unit: "µg/m³",
        monitoring_method: "EPA Method 325B Passive",
      },
    ],
    audit_log: [
      {
        id: "aud-air-1",
        timestamp: now - day,
        actor: "Air Quality Compliance",
        action: "VOC Tank Farm Audit",
        detail: "VOC utilization at 86.2% of annual permit cap — floating roof seal maintenance scheduled.",
      },
    ],
  });

  // 11. Safety & HSE
  engines.set("safety-hse", {
    slug: "safety-hse",
    number: "11",
    title: "Safety & HSE",
    subtitle:
      "LTIFR, TRIR, FAR, hours worked, process safety incidents (PSI), Tier 1/2 Process Safety Events per API 754, and road/contractor incidents",
    standard_ref: "API RP 754 (3rd Ed.) · IOGP Safety Data Standard · OSHA / GRI 403",
    methodology:
      "Computes LTIFR and TRIR per 1,000,000 exposure hours, Fatal Accident Rate (FAR) per 100,000,000 hours, and Tier 1 / Tier 2 Process Safety Event rates per API RP 754.",
    config: {
      rate_basis_hours: 1000000,
      far_basis_hours: 100000000,
    },
    records: [
      {
        id: "hse-1",
        created_at: now - 10 * day,
        updated_at: now - 1 * day,
        period: "2025 Q1 — Employees",
        workforce_group: "Direct Employees",
        hours_worked: 1850000,
        fatalities: 0,
        lti_cases: 1,
        recordable_injuries: 3,
        tier1_pse: 0,
        tier2_pse: 1,
        other_psi: 3,
        road_incidents: 0,
      },
      {
        id: "hse-2",
        created_at: now - 10 * day,
        updated_at: now - 1 * day,
        period: "2025 Q1 — Contractors",
        workforce_group: "Site & Turnaround Contractors",
        hours_worked: 1420000,
        fatalities: 0,
        lti_cases: 1,
        recordable_injuries: 4,
        tier1_pse: 0,
        tier2_pse: 2,
        other_psi: 4,
        road_incidents: 2,
      },
    ],
    audit_log: [
      {
        id: "aud-hse-1",
        timestamp: now - day,
        actor: "HSE Director",
        action: "API 754 Tier 1/2 Classification Review",
        detail: "Zero Tier 1 PSEs; 3 Tier 2 minor flange/seal LOPC events investigated with RCA closed.",
      },
    ],
  });

  // 12. Social & Human Capital
  engines.set("social-capital", {
    slug: "social-capital",
    number: "12",
    title: "Social & Human Capital",
    subtitle:
      "Workforce composition and diversity, training, pay and benefits, child and forced labor in the chain, community investment and local engagement",
    standard_ref: "GRI 401/404/405/408/409/413 · CSRD ESRS S1 & S2",
    methodology:
      "Aggregates workforce diversity across job grades, training intensity, gender pay equity ratio, Tier-1/Tier-2 supplier child & forced labor screening coverage, and social investment.",
    config: {
      total_headcount: 1480,
      women_pct: 24.6,
      under30_pct: 21.8,
      gender_pay_ratio: 0.96,
      benefits_coverage_pct: 100.0,
      supply_chain_audited_pct: 91.4,
      child_forced_labor_incidents: 0,
      community_investment_usd: 1450000,
    },
    records: [
      {
        id: "soc-1",
        created_at: now - 9 * day,
        updated_at: now - 1 * day,
        domain: "Workforce & Diversity",
        metric_name: "Senior & Technical Management",
        headcount: 240,
        female_share_pct: 22.5,
        avg_training_hours: 44.0,
        pay_ratio_f_m: 0.97,
        compliance_status: "On Track",
      },
      {
        id: "soc-2",
        created_at: now - 9 * day,
        updated_at: now - 1 * day,
        domain: "Workforce & Diversity",
        metric_name: "Plant Operations & Maintenance",
        headcount: 890,
        female_share_pct: 16.2,
        avg_training_hours: 52.5,
        pay_ratio_f_m: 0.95,
        compliance_status: "On Track",
      },
      {
        id: "soc-3",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        domain: "Workforce & Diversity",
        metric_name: "Engineering, R&D & Corporate",
        headcount: 350,
        female_share_pct: 47.4,
        avg_training_hours: 38.0,
        pay_ratio_f_m: 0.98,
        compliance_status: "Leading",
      },
      {
        id: "soc-4",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        domain: "Supply Chain Human Rights",
        metric_name: "Tier 1 & 2 Suppliers Screened (Child & Forced Labor)",
        headcount: 184,
        female_share_pct: 91.4,
        avg_training_hours: 12.0,
        pay_ratio_f_m: 1.0,
        compliance_status: "0 Violations Found",
      },
      {
        id: "soc-5",
        created_at: now - 4 * day,
        updated_at: now - 1 * day,
        domain: "Community Engagement",
        metric_name: "Local STEM, Clean Water & Vocational Grants ($1.45M)",
        headcount: 14,
        female_share_pct: 100.0,
        avg_training_hours: 24.0,
        pay_ratio_f_m: 1.0,
        compliance_status: "Active (14 Local Programs)",
      },
    ],
    audit_log: [
      {
        id: "aud-soc-1",
        timestamp: now - 2 * day,
        actor: "VP People & Sustainability",
        action: "Annual Supply Chain Social Audit",
        detail: "91.4% of high-risk Tier 1/2 contractors audited for ILO child & forced labor compliance.",
      },
    ],
  });

  // 13. Governance
  engines.set("governance", {
    slug: "governance",
    number: "13",
    title: "Governance",
    subtitle:
      "Board composition and independence, diversity, meeting attendance, executive pay, anti-corruption, whistleblowing channels, tax and transparency",
    standard_ref: "GRI 2 / 205 / 207 · CSRD ESRS G1 · IFRS S1 Governance",
    methodology:
      "Tracks governance oversight KPIs including independent board ratio, attendance, executive ESG-linked variable pay, anti-corruption certification, whistleblower case resolution, and tax CbCR transparency.",
    config: {
      board_total_seats: 11,
      independent_directors: 7,
      female_directors: 4,
      exec_pay_esg_weight_pct: 25,
      effective_tax_rate_pct: 23.8,
      cbcr_published: true,
    },
    records: [
      {
        id: "gov-1",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        pillar: "Board Composition",
        indicator: "Independent Directors",
        actual_value: 63.6,
        target_value: 60.0,
        unit: "% (7 of 11)",
        status: "Compliant",
        notes: "Audit & Sustainability Committees 100% independent",
      },
      {
        id: "gov-2",
        created_at: now - 8 * day,
        updated_at: now - 1 * day,
        pillar: "Board Diversity & Attendance",
        indicator: "Board Gender Diversity / Attendance",
        actual_value: 36.4,
        target_value: 33.0,
        unit: "% Women (96.5% Attendance)",
        status: "Compliant",
        notes: "11 of 12 meetings had >=95% attendance",
      },
      {
        id: "gov-3",
        created_at: now - 7 * day,
        updated_at: now - 1 * day,
        pillar: "Executive Pay",
        indicator: "ESG KPI Weight in C-Suite Bonus",
        actual_value: 25.0,
        target_value: 20.0,
        unit: "% Variable Comp",
        status: "Aligned",
        notes: "Tied to Scope 1 intensity, Methane OGMP, and API 754 Tier 1/2",
      },
      {
        id: "gov-4",
        created_at: now - 6 * day,
        updated_at: now - 1 * day,
        pillar: "Anti-Corruption",
        indicator: "ISO 37001 Training & Vendor Due Diligence",
        actual_value: 98.8,
        target_value: 95.0,
        unit: "% Workforce Trained",
        status: "Compliant (0 Bribery Cases)",
        notes: "Annual integrity sign-off across procurement & sales",
      },
      {
        id: "gov-5",
        created_at: now - 5 * day,
        updated_at: now - 1 * day,
        pillar: "Whistleblowing",
        indicator: "Anonymous Speak-Up Resolution Rate",
        actual_value: 100.0,
        target_value: 95.0,
        unit: "% Closed <30d (9 Cases)",
        status: "Operational 24/7",
        notes: "Multilingual external hotline + non-retaliation policy",
      },
      {
        id: "gov-6",
        created_at: now - 4 * day,
        updated_at: now - 1 * day,
        pillar: "Tax & Transparency",
        indicator: "Country-by-Country Tax & Effective Rate",
        actual_value: 23.8,
        target_value: 21.0,
        unit: "% Effective Tax ($41.2M Paid)",
        status: "GRI 207 Published",
        notes: "Full CbCR & statutory vs cash tax reconciliation published",
      },
    ],
    audit_log: [
      {
        id: "aud-gov-1",
        timestamp: now - day,
        actor: "Corporate Secretary & Ethics",
        action: "Board & GRI 207 Sign-off",
        detail: "Verified 63.6% board independence, 9/9 speak-up cases resolved, and GRI 207 tax disclosure.",
      },
    ],
  });

  // 14. Configurable Formula & Rules Engine
  const formulas: FormulaRuleItem[] = [
    {
      id: "frm-1",
      code: "RULE-FLARE-CO2E",
      name: "Flare Gas Destruction & CH₄ Slip Formula",
      target_engine: "flaring",
      kind: "formula",
      output_unit: "tCO2e",
      variables: ["flared_mscf", "ef_co2", "dre_pct", "ch4_frac", "gwp_ch4"],
      sample_inputs: {
        flared_mscf: 21400,
        ef_co2: 0.0568,
        dre_pct: 98.4,
        ch4_frac: 0.015,
        gwp_ch4: 29.8,
      },
      active_version: 2,
      expression: "flared_mscf * ef_co2 * (dre_pct / 100) + flared_mscf * ch4_frac * (1 - dre_pct / 100) * gwp_ch4",
      threshold_operator: ">",
      threshold_value: 1500,
      threshold_severity: "warning",
      status: "active",
      pending_revision: null,
      history: [
        {
          version: 1,
          expression: "flared_mscf * ef_co2 + flared_mscf * 0.0002 * 28",
          threshold_operator: ">",
          threshold_value: 1500,
          threshold_severity: "warning",
          change_note: "Initial AR5 default 98% DRE",
          author: "Process Carbon Lead",
          created_at: now - 45 * day,
          status: "superseded",
          reviewed_by: "VP Sustainability",
          reviewed_at: now - 44 * day,
        },
        {
          version: 2,
          expression: "flared_mscf * ef_co2 * (dre_pct / 100) + flared_mscf * ch4_frac * (1 - dre_pct / 100) * gwp_ch4",
          threshold_operator: ">",
          threshold_value: 1500,
          threshold_severity: "warning",
          change_note: "Added explicit measured DRE% and configurable AR6 GWP CH4",
          author: "Flare Compliance Lead",
          created_at: now - 12 * day,
          status: "active",
          reviewed_by: "Chief Carbon Auditor",
          reviewed_at: now - 11 * day,
          review_note: "Approved per API Compendium 2021 §4.3",
        },
      ],
    },
    {
      id: "frm-2",
      code: "RULE-CI-ETHYLENE",
      name: "Ethylene Product Carbon Intensity",
      target_engine: "carbon-intensity",
      kind: "formula",
      output_unit: "tCO2e / t product",
      variables: ["scope1_tco2e", "scope2_tco2e", "feedstock_credit_tco2e", "ethylene_tonnes"],
      sample_inputs: {
        scope1_tco2e: 11420,
        scope2_tco2e: 2860,
        feedstock_credit_tco2e: 0,
        ethylene_tonnes: 16400,
      },
      active_version: 1,
      expression: "(scope1_tco2e + scope2_tco2e - feedstock_credit_tco2e) / ethylene_tonnes",
      threshold_operator: ">",
      threshold_value: 0.92,
      threshold_severity: "critical",
      status: "pending_approval",
      pending_revision: {
        version: 2,
        expression: "(scope1_tco2e + scope2_tco2e - feedstock_credit_tco2e * 0.85) / ethylene_tonnes",
        threshold_operator: ">",
        threshold_value: 0.89,
        threshold_severity: "critical",
        change_note: "Tighten EU ETS benchmark threshold to 0.89 & apply 85% conservative credit factor",
        author: "Process Performance Analyst",
        created_at: now - 1 * day,
        status: "pending_approval",
      },
      history: [
        {
          version: 1,
          expression: "(scope1_tco2e + scope2_tco2e - feedstock_credit_tco2e) / ethylene_tonnes",
          threshold_operator: ">",
          threshold_value: 0.92,
          threshold_severity: "critical",
          change_note: "Initial ISO 14067 allocation formula",
          author: "Process Performance Analyst",
          created_at: now - 30 * day,
          status: "active",
          reviewed_by: "Chief Carbon Auditor",
          reviewed_at: now - 29 * day,
        },
      ],
    },
    {
      id: "frm-3",
      code: "RULE-TRIR-HSE",
      name: "Total Recordable Incident Rate (TRIR)",
      target_engine: "safety-hse",
      kind: "formula",
      output_unit: "incidents / 1M hrs",
      variables: ["recordable_injuries", "hours_worked"],
      sample_inputs: {
        recordable_injuries: 7,
        hours_worked: 3270000,
      },
      active_version: 1,
      expression: "(recordable_injuries * 1000000) / hours_worked",
      threshold_operator: ">",
      threshold_value: 2.5,
      threshold_severity: "critical",
      status: "active",
      pending_revision: null,
      history: [
        {
          version: 1,
          expression: "(recordable_injuries * 1000000) / hours_worked",
          threshold_operator: ">",
          threshold_value: 2.5,
          threshold_severity: "critical",
          change_note: "IOGP 1,000,000 exposure-hours baseline",
          author: "HSE Director",
          created_at: now - 40 * day,
          status: "active",
          reviewed_by: "VP Operations",
          reviewed_at: now - 39 * day,
        },
      ],
    },
    {
      id: "frm-4",
      code: "RULE-WATER-COD",
      name: "Effluent COD Permit Compliance Rule",
      target_engine: "water",
      kind: "threshold_rule",
      output_unit: "mg/L",
      variables: ["cod_mg_l", "dilution_factor"],
      sample_inputs: {
        cod_mg_l: 94,
        dilution_factor: 1.0,
      },
      active_version: 1,
      expression: "cod_mg_l * dilution_factor",
      threshold_operator: ">=",
      threshold_value: 120,
      threshold_severity: "critical",
      status: "active",
      pending_revision: null,
      history: [
        {
          version: 1,
          expression: "cod_mg_l * dilution_factor",
          threshold_operator: ">=",
          threshold_value: 120,
          threshold_severity: "critical",
          change_note: "Environmental Permit #EP-2024 Discharge Cap",
          author: "Environmental Lab Lead",
          created_at: now - 50 * day,
          status: "active",
          reviewed_by: "Compliance Counsel",
          reviewed_at: now - 49 * day,
        },
      ],
    },
  ];

  engines.set("formulas-rules", {
    slug: "formulas-rules",
    number: "14",
    title: "Configurable Formula & Rules Engine",
    subtitle:
      "Define formulas, thresholds and rules without coding; versioned and auditable; formula changes require approval",
    standard_ref: "SOX / ISO 14064-3 Change Control · Dual-Control Governance",
    methodology:
      "No-code mathematical expression parser with variable validation, threshold alerting, immutable version snapshots, and mandatory independent approval before activating any formula change.",
    config: {
      require_approval_for_changes: true,
      allow_self_approval: false,
    },
    records: [],
    audit_log: [
      {
        id: "aud-frm-1",
        timestamp: now - 1 * day,
        actor: "Process Performance Analyst",
        action: "Submitted RULE-CI-ETHYLENE v2 for approval",
        detail: "Proposed threshold tightening from 0.92 to 0.89 tCO2e/t pending Chief Carbon Auditor review.",
      },
    ],
  });

  const store: WorkspaceCalcStore = { engines, emissionFactors, formulas };
  for (const state of engines.values()) {
    state.runs = [];
    seedInitialRunsForEngine(store, state.slug, now, day);
  }
  return store;
}

const TRIGGER_LABELS: Record<CalcRunTrigger, string> = {
  initial_baseline: "Initial Baseline",
  manual_run: "Manual Run",
  record_added: "Record Added",
  record_deleted: "Record Deleted",
  config_updated: "Parameter Update",
  factor_revised: "Factor Revised",
  formula_approved: "Formula Approved",
};

function buildRunInputSummaries(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
): { recordCount: number; entries: CalcRunInputSummary[] } {
  const state = store.engines.get(slug);
  if (!state) return { recordCount: 0, entries: [] };

  if (slug === "emission-factors") {
    return {
      recordCount: store.emissionFactors.length,
      entries: store.emissionFactors.slice(0, 12).map((f) => ({
        label: f.code,
        inputs: `${f.name} · ${f.source_standard} · valid ${f.valid_from}`,
        result: `v${f.current_version}: ${f.value} ${f.unit}`,
      })),
    };
  }

  if (slug === "formulas-rules") {
    return {
      recordCount: store.formulas.length,
      entries: store.formulas.slice(0, 12).map((f) => ({
        label: f.code,
        inputs: `v${f.active_version}: ${f.expression}`,
        result: f.pending_revision
          ? `v${f.pending_revision.version} pending`
          : f.status,
      })),
    };
  }

  const entries: CalcRunInputSummary[] = state.records.slice(0, 12).map((r) => {
    switch (slug) {
      case "scope-1":
        return {
          label: String(r.unit_name || r.id),
          inputs: `${r.source_category} · ${num(r.activity_amount).toLocaleString()} ${r.activity_unit} × ${r.ef_value}`,
          result: `${num(r.total_tco2e).toLocaleString()} tCO2e`,
        };
      case "scope-2":
        return {
          label: String(r.facility || r.id),
          inputs: `${r.energy_type} · ${num(r.consumption_mwh).toLocaleString()} MWh (loc=${r.location_ef}, mkt=${r.market_ef})`,
          result: `Loc ${num(r.location_tco2e).toLocaleString()} / Mkt ${num(r.market_tco2e).toLocaleString()} tCO2e`,
        };
      case "scope-3":
        return {
          label: `Cat ${r.category_num}: ${String(r.sub_stream || "")}`,
          inputs: `${r.method} · ${num(r.activity_value).toLocaleString()} ${r.activity_unit} × ${r.ef_value}`,
          result: `${num(r.emissions_tco2e).toLocaleString()} tCO2e`,
        };
      case "methane":
        return {
          label: String(r.asset_name || r.id),
          inputs: `${r.ogmp_level} · ${r.modality} · ${r.ch4_tonnes} tCH4`,
          result: `±${r.uncertainty_pct}% CI`,
        };
      case "flaring":
        return {
          label: String(r.flare_unit || r.id),
          inputs: `CEMS ${num(r.cems_flared_mscf).toLocaleString()} / Ops ${num(r.ops_balance_mscf).toLocaleString()} MSCF @ ${r.dre_pct}% DRE`,
          result: `${num(r.total_tco2e).toLocaleString()} tCO2e`,
        };
      case "carbon-intensity":
        return {
          label: String(r.product_stream || r.id),
          inputs: `${num(r.allocated_emissions_tco2e).toLocaleString()} tCO2e / ${num(r.denominator_value).toLocaleString()} ${r.denominator_unit}`,
          result: `${r.intensity_value} ${r.intensity_unit}`,
        };
      case "water":
        return {
          label: String(r.facility || r.id),
          inputs: `Withdraw ${num(r.withdrawal_m3).toLocaleString()} m³ · Produced ${num(r.produced_water_m3).toLocaleString()} m³ · COD ${r.cod_mg_l} mg/L`,
          result: `WRI ${r.wri_stress_score} (${r.wri_stress_tier})`,
        };
      case "waste":
        return {
          label: String(r.waste_stream || r.id),
          inputs: `${r.hazard_class} · ${r.tonnes} t · ${r.disposal_route}`,
          result: r.recovered ? "Recovered" : "Disposed",
        };
      case "air-emissions":
        return {
          label: `${String(r.pollutant)} · ${String(r.source_unit || "")}`,
          inputs: `Conc ${r.measured_conc} ${r.conc_unit} (limit ${r.permit_conc_limit})`,
          result: `${r.measured_tonnes_yr} / ${r.permit_limit_tonnes_yr} t/yr`,
        };
      case "safety-hse":
        return {
          label: String(r.period || r.id),
          inputs: `${num(r.hours_worked).toLocaleString()} hrs · LTI=${r.lti_cases} · TRC=${r.recordable_injuries}`,
          result: `T1=${r.tier1_pse} · T2=${r.tier2_pse}`,
        };
      case "social-capital":
        return {
          label: String(r.metric_name || r.id),
          inputs: `${r.domain} · count=${r.headcount} · div=${r.female_share_pct}%`,
          result: String(r.compliance_status || "Tracked"),
        };
      case "governance":
        return {
          label: String(r.indicator || r.id),
          inputs: `${r.pillar} · target=${r.target_value}%`,
          result: `${r.actual_value}% (${r.status})`,
        };
      default:
        return {
          label: String(r.id),
          inputs: JSON.stringify(r).slice(0, 80),
          result: "OK",
        };
    }
  });

  return { recordCount: state.records.length, entries };
}

export function recordCalculationRun(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  trigger: CalcRunTrigger,
  actor: string,
  note: string,
  customTimestamp?: number,
  validationSummary?: CalcRunEntry["validation_summary"],
): CalcRunEntry | null {
  const state = store.engines.get(slug);
  const view = computeEngineView(store, slug, true);
  if (!state || !view) return null;

  const runs = state.runs ?? [];
  const nextNum = (runs[0]?.run_number ?? 0) + 1;
  const inputSummary = buildRunInputSummaries(store, slug);

  const entry: CalcRunEntry = {
    id: `run-${slug}-${nextNum}-${crypto.randomUUID().slice(0, 6)}`,
    run_number: nextNum,
    timestamp: customTimestamp ?? Date.now(),
    trigger,
    trigger_label: TRIGGER_LABELS[trigger],
    actor,
    note,
    inputs_snapshot: {
      config: structuredClone(view.config),
      record_count: inputSummary.recordCount,
      entries: inputSummary.entries,
    },
    outputs_snapshot: structuredClone(view.kpis),
    validation_summary: validationSummary,
  };

  runs.unshift(entry);
  if (runs.length > 50) runs.length = 50;
  state.runs = runs;
  return entry;
}

function seedInitialRunsForEngine(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  now: number,
  day: number,
) {
  const state = store.engines.get(slug);
  if (!state) return;

  // Snapshot #1: earlier baseline (temporarily exclude last record or use baseline parameter where helpful)
  const originalRecords = [...state.records];
  const originalConfig = { ...state.config };

  if (slug === "methane") {
    state.config = { ...originalConfig, gwp_preset: "AR5_100", gwp_ch4: 28.0 };
    recordCalculationRun(
      store,
      slug,
      "initial_baseline",
      "LDAR & Methane Lead",
      "Q1 baseline calculation under IPCC AR5 (GWP=28.0) before AR6 migration",
      now - 6 * day,
    );
    state.config = originalConfig;
    recordCalculationRun(
      store,
      slug,
      "config_updated",
      "Chief Carbon Auditor",
      "Migrated GWP basis to IPCC AR6 Fossil (29.8) & ingested GHGSat overpass",
      now - 1 * day,
    );
    return;
  }

  if (slug === "scope-2") {
    state.config = { ...originalConfig, grid_loss_pct: 5.8 };
    recordCalculationRun(
      store,
      slug,
      "initial_baseline",
      "Energy Procurement",
      "Initial Scope 2 dual calculation using 5.8% prior-year T&D grid loss",
      now - 7 * day,
    );
    state.config = originalConfig;
    recordCalculationRun(
      store,
      slug,
      "config_updated",
      "Energy Procurement",
      "Applied 2025 utility T&D loss (5.4%) and retired 17,700 MWh PPA/I-RECs",
      now - 1 * day,
    );
    return;
  }

  if (originalRecords.length > 1) {
    state.records = originalRecords.slice(0, originalRecords.length - 1);
    recordCalculationRun(
      store,
      slug,
      "initial_baseline",
      "System Baseline",
      `Initial scope run across ${state.records.length} verified records`,
      now - 7 * day,
    );
    state.records = originalRecords;
    recordCalculationRun(
      store,
      slug,
      "record_added",
      state.audit_log[0]?.actor || "ESG Engineer",
      state.audit_log[0]?.detail || `Recomputed with all ${state.records.length} active inputs`,
      now - 1 * day,
    );
  } else {
    recordCalculationRun(
      store,
      slug,
      "initial_baseline",
      state.audit_log[0]?.actor || "ESG Governance Admin",
      state.audit_log[0]?.detail || `Baseline verified calculation for ${state.title}`,
      now - 5 * day,
    );
    recordCalculationRun(
      store,
      slug,
      "manual_run",
      state.audit_log[0]?.actor || "ESG Engineer",
      "Pre-audit verification checkpoint run",
      now - 1 * day,
    );
  }
}

export interface ManualRunResult {
  outcome: "executed" | "blocked" | "requires_acknowledgment";
  view: CalcEngineResponse | null;
  validation: CalcValidationReport;
  error?: string;
}

export function runManualCalculation(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  note?: string,
  actor = "ESG Engineer",
  options?: {
    acknowledge_anomalies?: boolean;
    override_reason?: string;
  },
): ManualRunResult | null {
  const state = store.engines.get(slug);
  const validation = validateCalculationInputs(store, slug);
  if (!state || !validation) return null;

  if (!validation.can_proceed) {
    return {
      outcome: "blocked",
      view: null,
      validation,
      error: `Run blocked by data validation: ${validation.error_count} missing or invalid input${validation.error_count === 1 ? "" : "s"} must be resolved before running ${state.title}.`,
    };
  }

  if (validation.requires_acknowledgment && !options?.acknowledge_anomalies) {
    return {
      outcome: "requires_acknowledgment",
      view: null,
      validation,
      error: `Historical trend anomalies detected (${validation.warning_count} warning${validation.warning_count === 1 ? "" : "s"}). Review and acknowledge anomalies before proceeding.`,
    };
  }

  const overrideNote = options?.acknowledge_anomalies
    ? options.override_reason?.trim() || "Operator acknowledged historical trend anomaly"
    : undefined;

  const finalNote = [
    note?.trim() || `Manual verification run for ${state.title}`,
    overrideNote ? `[Anomaly Override: ${overrideNote}]` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const run = recordCalculationRun(
    store,
    slug,
    "manual_run",
    actor,
    finalNote,
    undefined,
    {
      status: validation.status,
      checks_executed: validation.checks_executed,
      error_count: validation.error_count,
      warning_count: validation.warning_count,
      acknowledged_override: Boolean(options?.acknowledge_anomalies),
      override_reason: overrideNote,
    },
  );
  if (run) {
    state.audit_log.unshift({
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: run.timestamp,
      actor,
      action: options?.acknowledge_anomalies
        ? `Executed Run #${run.run_number} (Anomaly Override)`
        : `Executed Calculation Run #${run.run_number}`,
      detail: run.note,
    });
  }
  return {
    outcome: "executed",
    view: computeEngineView(store, slug),
    validation,
  };
}

export function computeEngineView(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  skipValidation = false,
): CalcEngineResponse | null {
  const state = store.engines.get(slug);
  if (!state) return null;

  const base = {
    slug: state.slug,
    number: state.number,
    title: state.title,
    subtitle: state.subtitle,
    standard_ref: state.standard_ref,
    methodology: state.methodology,
    config: state.config,
    records: state.records,
    audit_log: state.audit_log,
    calculation_history: state.runs ?? [],
    validation: skipValidation
      ? undefined
      : (validateCalculationInputs(store, slug) ?? undefined),
  };

  switch (slug) {
    case "scope-1": {
      const byCat = new Map<string, number>();
      let total = 0;
      let totalCo2 = 0;
      let totalCh4 = 0;
      let totalN2o = 0;
      for (const r of state.records) {
        const t = num(r.total_tco2e);
        total += t;
        totalCo2 += num(r.co2_tonnes);
        totalCh4 += num(r.ch4_tonnes);
        totalN2o += num(r.n2o_tonnes);
        const cat = String(r.source_category || "Other");
        byCat.set(cat, (byCat.get(cat) ?? 0) + t);
      }
      const primary_series: CalcChartPoint[] = Array.from(byCat.entries()).map(
        ([name, val]) => ({
          name,
          primary: round(val, 1),
          unit: "tCO2e",
        }),
      );
      const stationary = byCat.get("Stationary Combustion") ?? 0;
      const flaring = byCat.get("Flaring") ?? 0;
      const feedstock = byCat.get("Non-Energy CO2 (Feedstock)") ?? 0;
      return {
        ...base,
        kpis: [
          { key: "total", label: "Total Scope 1", value: fmt(total, 1), unit: "tCO2e", tone: "ok" },
          { key: "stationary", label: "Stationary Combustion", value: fmt(stationary, 1), unit: "tCO2e", hint: `${total > 0 ? round((stationary / total) * 100, 1) : 0}% of Scope 1` },
          { key: "flaring_fugitive", label: "Flaring + Fugitive", value: fmt(flaring + (byCat.get("Fugitive Emissions") ?? 0), 1), unit: "tCO2e", tone: "warn" },
          { key: "non_energy", label: "Process + Feedstock CO₂", value: fmt((byCat.get("Process Emissions") ?? 0) + feedstock, 1), unit: "tCO2e", hint: `CH₄: ${fmt(totalCh4, 1)} t · N₂O: ${fmt(totalN2o, 2)} t` },
        ],
        charts: {
          primary_title: "Scope 1 Emissions by Sub-Category",
          primary_unit: "tCO2e",
          primary_series,
          secondary_title: "GHG Gas Split (CO₂ vs Non-CO₂ CO₂e)",
          secondary_unit: "tCO2e",
          secondary_series: [
            { name: "CO₂ Direct", primary: round(totalCo2, 1) },
            { name: "CH₄ (AR6 CO₂e)", primary: round(totalCh4 * num(state.config.ch4_gwp, 29.8), 1) },
            { name: "N₂O (AR6 CO₂e)", primary: round(totalN2o * num(state.config.n2o_gwp, 273), 1) },
          ],
        },
      };
    }

    case "scope-2": {
      const gridLossPct = num(state.config.grid_loss_pct, 5.4);
      let locTotal = 0;
      let mktTotal = 0;
      let totalMwh = 0;
      let renewableMwh = 0;
      const primary_series: CalcChartPoint[] = state.records.map((r) => {
        const mwh = num(r.consumption_mwh);
        const loc = mwh * (1 + gridLossPct / 100) * num(r.location_ef, 0.495);
        const mkt = mwh * (1 + gridLossPct / 100) * num(r.market_ef, 0.562);
        locTotal += loc;
        mktTotal += mkt;
        totalMwh += mwh;
        if (num(r.market_ef) === 0 && String(r.energy_type).includes("Electricity")) {
          renewableMwh += mwh;
        }
        return {
          name: String(r.facility || r.energy_type),
          primary: round(loc, 1),
          secondary: round(mkt, 1),
          unit: "tCO2e",
        };
      });
      const recSavings = Math.max(0, locTotal - mktTotal);
      return {
        ...base,
        kpis: [
          { key: "loc", label: "Location-Based Scope 2", value: fmt(locTotal, 1), unit: "tCO2e", hint: `Includes ${gridLossPct}% grid T&D loss` },
          { key: "mkt", label: "Market-Based Scope 2", value: fmt(mktTotal, 1), unit: "tCO2e", tone: "ok", hint: "After PPA & I-REC retirement" },
          { key: "re_share", label: "PPA / I-REC Coverage", value: `${totalMwh > 0 ? round((renewableMwh / totalMwh) * 100, 1) : 0}%`, unit: `${fmt(renewableMwh, 0)} MWh`, tone: "info" },
          { key: "reduction", label: "Contractual Avoidance", value: fmt(recSavings, 1), unit: "tCO2e", tone: "ok" },
        ],
        charts: {
          primary_title: "Location-Based vs Market-Based Emissions by Facility",
          primary_unit: "tCO2e",
          primary_series,
        },
      };
    }

    case "scope-3": {
      const byCat = new Map<number, number>();
      let total = 0;
      let priorityTotal = 0;
      for (const r of state.records) {
        const val = num(r.emissions_tco2e);
        total += val;
        if (r.petrochemical_priority) priorityTotal += val;
        const cat = num(r.category_num, 1);
        byCat.set(cat, (byCat.get(cat) ?? 0) + val);
      }
      const primary_series: CalcChartPoint[] = ALL_15_SCOPE3_CATEGORIES.map((c) => ({
        name: `Cat ${c.cat}`,
        primary: round(byCat.get(c.cat) ?? 0, 1),
        unit: "tCO2e",
      }));
      const coveredCount = ALL_15_SCOPE3_CATEGORIES.filter((c) =>
        state.records.some((r) => num(r.category_num) === c.cat),
      ).length;
      return {
        ...base,
        kpis: [
          { key: "total", label: "Total Scope 3", value: fmt(total, 1), unit: "tCO2e", tone: "info" },
          { key: "petro", label: "Petrochemical Priority Streams", value: fmt(priorityTotal, 1), unit: "tCO2e", hint: `${total > 0 ? round((priorityTotal / total) * 100, 1) : 0}% of Scope 3` },
          { key: "cats", label: "GHG Protocol Categories", value: `${coveredCount} / 15`, unit: "Screened", tone: "ok" },
          { key: "top_cat", label: "Cat 1 Feedstock & Chemicals", value: fmt(byCat.get(1) ?? 0, 1), unit: "tCO2e" },
        ],
        charts: {
          primary_title: "All 15 GHG Protocol Scope 3 Categories",
          primary_unit: "tCO2e",
          primary_series,
        },
        extra: {
          categories_catalog: ALL_15_SCOPE3_CATEGORIES,
        },
      };
    }

    case "emission-factors": {
      const factors = store.emissionFactors;
      const byStandard = new Map<string, number>();
      let totalVersions = 0;
      for (const f of factors) {
        byStandard.set(f.source_standard, (byStandard.get(f.source_standard) ?? 0) + 1);
        totalVersions += f.versions.length;
      }
      return {
        ...base,
        records: factors.map((f) => ({
          id: f.id,
          created_at: f.versions[0]?.updated_at ?? Date.now(),
          updated_at: f.versions[f.versions.length - 1]?.updated_at ?? Date.now(),
          ...f,
        })),
        kpis: [
          { key: "count", label: "Active Emission Factors", value: String(factors.filter((f) => f.status === "active").length), unit: "Factors", tone: "ok" },
          { key: "versions", label: "Auditable Version Snapshots", value: String(totalVersions), unit: "Revisions", tone: "info" },
          { key: "site_lab", label: "Site & Lab-Specific", value: String(factors.filter((f) => f.source_standard === "Site-Specific" || f.source_standard === "Lab-Specific").length), unit: "Tier 3 Factors" },
          { key: "avg_unc", label: "Mean Uncertainty", value: `${round(factors.reduce((a, b) => a + b.uncertainty_pct, 0) / Math.max(1, factors.length), 1)}%`, unit: "95% CI" },
        ],
        charts: {
          primary_title: "Emission Factors by Standard / Provenance",
          primary_unit: "factors",
          primary_series: Array.from(byStandard.entries()).map(([name, count]) => ({
            name,
            primary: count,
          })),
        },
        extra: {
          factors,
        },
      };
    }

    case "methane": {
      const presetKey = String(state.config.gwp_preset || "AR6_FOSSIL_100");
      const preset = GWP_PRESETS[presetKey] ?? GWP_PRESETS.AR6_FOSSIL_100;
      const gwp = num(state.config.gwp_ch4, preset.ch4);
      let l4Ch4 = 0;
      let l5Ch4 = 0;
      const primary_series: CalcChartPoint[] = state.records.map((r) => {
        const ch4 = num(r.ch4_tonnes);
        if (String(r.ogmp_level) === "Level 4") l4Ch4 += ch4;
        else l5Ch4 += ch4;
        return {
          name: `${String(r.ogmp_level)} · ${String(r.modality).split(" ")[0]}`,
          primary: round(ch4, 2),
          secondary: round(ch4 * gwp, 1),
          unit: "tCH4 / tCO2e",
        };
      });
      const reconciledCh4 = Math.max(l4Ch4, l5Ch4);
      const reconciliationGapPct =
        l5Ch4 > 0 ? round(((l5Ch4 - l4Ch4) / l5Ch4) * 100, 1) : 0;
      return {
        ...base,
        config: {
          ...state.config,
          gwp_preset: presetKey,
          gwp_label: preset.label,
          gwp_ch4: gwp,
        },
        kpis: [
          { key: "l4", label: "OGMP Level 4 (Bottom-Up)", value: fmt(l4Ch4, 1), unit: `tCH₄ (${fmt(l4Ch4 * gwp, 0)} tCO2e)` },
          { key: "l5", label: "OGMP Level 5 (Top-Down Avg)", value: fmt(l5Ch4 / Math.max(1, state.records.filter((r) => r.ogmp_level === "Level 5").length), 1), unit: "tCH₄", tone: "info" },
          { key: "total_co2e", label: "Reconciled CH₄ Equivalent", value: fmt(reconciledCh4 * gwp, 1), unit: "tCO2e", tone: "warn", hint: `${preset.label} (GWP = ${gwp})` },
          { key: "gap", label: "L4 vs L5 Reconciliation Gap", value: `${reconciliationGapPct}%`, unit: "Site vs Source", tone: Math.abs(reconciliationGapPct) > 15 ? "bad" : "ok" },
        ],
        charts: {
          primary_title: "OGMP 2.0 Level 4 vs Level 5 Methane Measurements",
          primary_unit: "tCH4",
          primary_series,
        },
        extra: {
          gwp_presets: GWP_PRESETS,
        },
      };
    }

    case "flaring": {
      let totalCems = 0;
      let totalOps = 0;
      let totalBoe = 0;
      let totalCo2e = 0;
      let weightedDre = 0;
      const primary_series: CalcChartPoint[] = state.records.map((r) => {
        const cems = num(r.cems_flared_mscf);
        const ops = num(r.ops_balance_mscf);
        const boe = num(r.production_boe);
        const dre = num(r.dre_pct, 98);
        const co2e = num(r.total_tco2e);
        totalCems += cems;
        totalOps += ops;
        totalBoe += boe;
        totalCo2e += co2e;
        weightedDre += dre * cems;
        return {
          name: String(r.flare_unit),
          primary: round(cems, 0),
          secondary: round(ops, 0),
          unit: "MSCF",
        };
      });
      const avgDre = totalCems > 0 ? weightedDre / totalCems : 98;
      const flareToProd = totalBoe > 0 ? (totalCems / totalBoe) * 1000 : 0; // SCF/BOE
      const flaringIntensity = totalBoe > 0 ? (totalCo2e / totalBoe) * 1000 : 0; // kgCO2e/BOE
      const reconDiffPct = totalCems > 0 ? ((totalCems - totalOps) / totalCems) * 100 : 0;
      return {
        ...base,
        kpis: [
          { key: "dre", label: "Weighted Combustion Efficiency", value: `${round(avgDre, 2)}%`, unit: "DRE", tone: avgDre >= 98 ? "ok" : "warn", hint: `Target >= ${num(state.config.benchmark_dre_pct, 98)}%` },
          { key: "ratio", label: "Flare-to-Production Ratio", value: fmt(flareToProd, 1), unit: "SCF / BOE", tone: "info" },
          { key: "intensity", label: "Flaring Carbon Intensity", value: fmt(flaringIntensity, 2), unit: "kgCO2e / BOE" },
          { key: "recon", label: "CEMS vs Ops Reconciliation", value: `${round(reconDiffPct, 2)}%`, unit: `${fmt(totalCems - totalOps, 0)} MSCF`, tone: Math.abs(reconDiffPct) <= 5 ? "ok" : "bad" },
        ],
        charts: {
          primary_title: "Continuous Flare CEMS vs Operational Balance (MSCF)",
          primary_unit: "MSCF",
          primary_series,
        },
      };
    }

    case "carbon-intensity": {
      const productRecords = state.records.filter(
        (r) => String(r.denominator_type) === "Per Tonne Product",
      );
      const boeRec = state.records.find((r) => String(r.denominator_type).includes("Barrel"));
      const gvaRec = state.records.find((r) => String(r.denominator_type).includes("Value Added"));
      const primary_series: CalcChartPoint[] = productRecords.map((r) => ({
        name: String(r.product_stream),
        primary: round(num(r.intensity_value), 3),
        limit: round(num(r.benchmark_value), 3),
        unit: String(r.intensity_unit),
      }));
      const avgProdIntensity =
        productRecords.length > 0
          ? productRecords.reduce((a, b) => a + num(b.intensity_value), 0) / productRecords.length
          : 0;
      return {
        ...base,
        kpis: [
          { key: "ethylene", label: "Ethylene Intensity", value: fmt(num(productRecords[0]?.intensity_value), 3), unit: "tCO2e / t", tone: "ok", hint: `Benchmark: ${num(productRecords[0]?.benchmark_value)}` },
          { key: "avg_prod", label: "Portfolio Avg Product Intensity", value: fmt(avgProdIntensity, 3), unit: "tCO2e / t" },
          { key: "boe", label: "Per Barrel Oil Equivalent", value: fmt(num(boeRec?.intensity_value), 4), unit: "tCO2e / BOE", tone: "info" },
          { key: "gva", label: "Per Value Added", value: fmt(num(gvaRec?.intensity_value), 1), unit: "tCO2e / $M GVA" },
        ],
        charts: {
          primary_title: "Product Carbon Intensity vs Benchmark",
          primary_unit: "tCO2e / t",
          primary_series,
        },
      };
    }

    case "water": {
      let withdrawal = 0;
      let consumption = 0;
      let discharge = 0;
      let produced = 0;
      let reused = 0;
      let highStressWithdrawal = 0;
      let maxCod = 0;
      const primary_series: CalcChartPoint[] = state.records.map((r) => {
        const w = num(r.withdrawal_m3);
        const c = num(r.consumption_m3);
        const d = num(r.discharge_m3);
        withdrawal += w;
        consumption += c;
        discharge += d;
        produced += num(r.produced_water_m3);
        reused += num(r.reused_m3);
        if (num(r.wri_stress_score) >= 3.0) highStressWithdrawal += w;
        maxCod = Math.max(maxCod, num(r.cod_mg_l));
        return {
          name: String(r.facility),
          primary: round(w, 0),
          secondary: round(c, 0),
          unit: "m³",
        };
      });
      const reusePct = withdrawal + produced > 0 ? (reused / (withdrawal + produced)) * 100 : 0;
      const highStressPct = withdrawal > 0 ? (highStressWithdrawal / withdrawal) * 100 : 0;
      const codLimit = num(state.config.cod_limit_mg_l, 120);
      return {
        ...base,
        kpis: [
          { key: "withdraw", label: "Total Withdrawal", value: fmt(withdrawal, 0), unit: "m³", hint: `Produced water: ${fmt(produced, 0)} m³` },
          { key: "consume", label: "Net Consumption / Discharge", value: `${fmt(consumption, 0)} / ${fmt(discharge, 0)}`, unit: "m³" },
          { key: "reuse", label: "Circular Water Reuse Rate", value: `${round(reusePct, 1)}%`, unit: `${fmt(reused, 0)} m³`, tone: "ok" },
          { key: "stress", label: "WRI High-Stress Share", value: `${round(highStressPct, 1)}%`, unit: `Max COD ${maxCod}/${codLimit} mg/L`, tone: highStressPct > 50 ? "warn" : "ok" },
        ],
        charts: {
          primary_title: "Water Withdrawal vs Consumption by Facility (m³)",
          primary_unit: "m³",
          primary_series,
          secondary_title: "Effluent COD Concentration vs Permit Cap",
          secondary_unit: "mg/L",
          secondary_series: state.records.map((r) => ({
            name: String(r.facility),
            primary: num(r.cod_mg_l),
            limit: codLimit,
          })),
        },
      };
    }

    case "waste": {
      let haz = 0;
      let nonHaz = 0;
      let recovered = 0;
      let total = 0;
      for (const r of state.records) {
        const t = num(r.tonnes);
        total += t;
        if (String(r.hazard_class) === "Hazardous") haz += t;
        else nonHaz += t;
        if (r.recovered) recovered += t;
      }
      const diversionPct = total > 0 ? (recovered / total) * 100 : 0;
      const recycledInputs = num(state.config.recycled_input_materials_tonnes, 8420);
      const totalInputs = num(state.config.total_material_inputs_tonnes, 42100);
      const mci =
        totalInputs > 0
          ? round(((recycledInputs / totalInputs) * 0.5 + (diversionPct / 100) * 0.5) * 100, 1)
          : 0;
      return {
        ...base,
        kpis: [
          { key: "total", label: "Total Waste Generated", value: fmt(total, 1), unit: "tonnes" },
          { key: "haz", label: "Hazardous / Non-Hazardous", value: `${fmt(haz, 0)} / ${fmt(nonHaz, 0)}`, unit: "tonnes", tone: "warn" },
          { key: "diversion", label: "Recycling & Recovery Rate", value: `${round(diversionPct, 1)}%`, unit: `${fmt(recovered, 0)} t`, tone: "ok" },
          { key: "mci", label: "Material Circularity (MCI)", value: `${mci}%`, unit: `Packaging: ${num(state.config.packaging_recovered_pct, 74.5)}%`, tone: "info" },
        ],
        charts: {
          primary_title: "Waste Streams by Volume & Hazard Class",
          primary_unit: "tonnes",
          primary_series: state.records.map((r) => ({
            name: String(r.waste_stream),
            primary: num(r.tonnes),
          })),
        },
      };
    }

    case "air-emissions": {
      let totalMass = 0;
      let nearLimitCount = 0;
      let exceedances = 0;
      const primary_series: CalcChartPoint[] = state.records.map((r) => {
        const obs = num(r.measured_tonnes_yr);
        const lim = num(r.permit_limit_tonnes_yr);
        totalMass += obs;
        const pct = lim > 0 ? (obs / lim) * 100 : 0;
        if (pct > 100) exceedances++;
        else if (pct >= 85) nearLimitCount++;
        return {
          name: String(r.pollutant),
          primary: round(obs, 2),
          limit: round(lim, 2),
          unit: "t/yr",
        };
      });
      return {
        ...base,
        kpis: [
          { key: "total", label: "Total Criteria & HAP Mass", value: fmt(totalMass, 1), unit: "tonnes/yr" },
          { key: "exceed", label: "Permit Exceedances", value: String(exceedances), unit: "Parameters", tone: exceedances > 0 ? "bad" : "ok" },
          { key: "near", label: "Approaching Limit (>=85%)", value: String(nearLimitCount), unit: "Watchlist", tone: nearLimitCount > 0 ? "warn" : "ok" },
          { key: "monitored", label: "Monitored Pollutant Streams", value: String(state.records.length), unit: "SO₂, NOx, PM, VOC, H₂S, C₆H₆", tone: "info" },
        ],
        charts: {
          primary_title: "Measured Air Emissions vs Annual Permit Limit (t/yr)",
          primary_unit: "t/yr",
          primary_series,
        },
      };
    }

    case "safety-hse": {
      let hours = 0;
      let fatalities = 0;
      let lti = 0;
      let trc = 0;
      let tier1 = 0;
      let tier2 = 0;
      let road = 0;
      for (const r of state.records) {
        hours += num(r.hours_worked);
        fatalities += num(r.fatalities);
        lti += num(r.lti_cases);
        trc += num(r.recordable_injuries);
        tier1 += num(r.tier1_pse);
        tier2 += num(r.tier2_pse);
        road += num(r.road_incidents);
      }
      const ltifr = hours > 0 ? (lti * 1_000_000) / hours : 0;
      const trir = hours > 0 ? (trc * 1_000_000) / hours : 0;
      const far = hours > 0 ? (fatalities * 100_000_000) / hours : 0;
      const pseTier1Rate = hours > 0 ? (tier1 * 1_000_000) / hours : 0;
      return {
        ...base,
        kpis: [
          { key: "ltifr", label: "LTIFR (per 1M hrs)", value: fmt(ltifr, 2), unit: `${lti} LTI · ${fmt(hours / 1_000_000, 2)}M hrs`, tone: ltifr <= 0.8 ? "ok" : "warn" },
          { key: "trir", label: "TRIR (per 1M hrs)", value: fmt(trir, 2), unit: `${trc} Recordable`, tone: trir <= 2.5 ? "info" : "bad" },
          { key: "far", label: "FAR (per 100M hrs)", value: fmt(far, 2), unit: `${fatalities} Fatalities`, tone: fatalities === 0 ? "ok" : "bad" },
          { key: "api754", label: "API 754 Tier 1 / Tier 2 PSE", value: `${tier1} / ${tier2}`, unit: `Rate ${fmt(pseTier1Rate, 2)} · Road: ${road}`, tone: tier1 > 0 ? "bad" : "warn" },
        ],
        charts: {
          primary_title: "Exposure Hours & Safety Events by Workforce Group",
          primary_unit: "cases",
          primary_series: state.records.map((r) => ({
            name: String(r.workforce_group),
            primary: num(r.recordable_injuries),
            secondary: num(r.tier1_pse) + num(r.tier2_pse),
          })),
        },
      };
    }

    case "social-capital": {
      const wfRows = state.records.filter((r) => String(r.domain) === "Workforce & Diversity");
      const totalEmp = wfRows.reduce((a, b) => a + num(b.headcount), 0) || num(state.config.total_headcount, 1480);
      const weightedWomen =
        wfRows.reduce((a, b) => a + num(b.headcount) * num(b.female_share_pct), 0) /
        Math.max(1, wfRows.reduce((a, b) => a + num(b.headcount), 0));
      const weightedTraining =
        wfRows.reduce((a, b) => a + num(b.headcount) * num(b.avg_training_hours), 0) /
        Math.max(1, wfRows.reduce((a, b) => a + num(b.headcount), 0));
      return {
        ...base,
        kpis: [
          { key: "headcount", label: "Total Workforce", value: fmt(totalEmp, 0), unit: "FTEs", hint: `Women: ${round(weightedWomen, 1)}%` },
          { key: "training", label: "Avg Training Intensity", value: fmt(weightedTraining, 1), unit: "hrs / employee", tone: "info" },
          { key: "pay", label: "Gender Pay Equity Ratio", value: fmt(num(state.config.gender_pay_ratio, 0.96), 2), unit: "F:M Median", tone: "ok", hint: `Benefits: ${num(state.config.benefits_coverage_pct, 100)}%` },
          { key: "hr", label: "Child & Forced Labor Audit", value: `${num(state.config.supply_chain_audited_pct, 91.4)}%`, unit: `${num(state.config.child_forced_labor_incidents, 0)} Incidents · $${fmt(num(state.config.community_investment_usd) / 1e6, 2)}M Community`, tone: "ok" },
        ],
        charts: {
          primary_title: "Headcount & Training Hours Across Workforce Segments",
          primary_unit: "employees / hrs",
          primary_series: wfRows.map((r) => ({
            name: String(r.metric_name),
            primary: num(r.headcount),
            secondary: num(r.avg_training_hours),
          })),
        },
      };
    }

    case "governance": {
      const indep = state.records.find((r) => String(r.pillar).includes("Composition"))?.actual_value ?? 63.6;
      const div = state.records.find((r) => String(r.pillar).includes("Diversity"))?.actual_value ?? 36.4;
      const antiCorr = state.records.find((r) => String(r.pillar).includes("Anti-Corruption"))?.actual_value ?? 98.8;
      const tax = state.records.find((r) => String(r.pillar).includes("Tax"))?.actual_value ?? 23.8;
      return {
        ...base,
        kpis: [
          { key: "indep", label: "Board Independence", value: `${indep}%`, unit: `${num(state.config.independent_directors, 7)}/${num(state.config.board_total_seats, 11)} Directors`, tone: "ok" },
          { key: "div", label: "Board Diversity", value: `${div}%`, unit: "96.5% Attendance", tone: "info" },
          { key: "ethics", label: "Anti-Corruption & Speak-Up", value: `${antiCorr}%`, unit: "100% Whistleblower Closed", tone: "ok" },
          { key: "tax", label: "Effective Tax & Exec ESG Pay", value: `${tax}%`, unit: `${num(state.config.exec_pay_esg_weight_pct, 25)}% ESG Bonus Link` },
        ],
        charts: {
          primary_title: "Governance Compliance vs Target Benchmarks (%)",
          primary_unit: "%",
          primary_series: state.records.map((r) => ({
            name: String(r.pillar),
            primary: num(r.actual_value),
            limit: num(r.target_value),
          })),
        },
      };
    }

    case "formulas-rules": {
      const formulas = store.formulas;
      const pendingCount = formulas.filter((f) => f.status === "pending_approval" || f.pending_revision !== null).length;
      const activeCount = formulas.filter((f) => f.status === "active").length;
      const totalRevs = formulas.reduce((a, f) => a + f.history.length + (f.pending_revision ? 1 : 0), 0);
      return {
        ...base,
        records: formulas.map((f) => {
          const ev = evaluateSafeFormula(f.expression, f.sample_inputs);
          const triggered = evaluateThreshold(
            ev.value,
            f.threshold_operator,
            f.threshold_value,
          );
          return {
            id: f.id,
            created_at: f.history[0]?.created_at ?? Date.now(),
            updated_at: f.history[f.history.length - 1]?.created_at ?? Date.now(),
            ...f,
            evaluated_sample: ev.value,
            threshold_triggered: triggered,
          };
        }),
        kpis: [
          { key: "total", label: "Configured Formulas & Rules", value: String(formulas.length), unit: "Active Engine Rules", tone: "info" },
          { key: "active", label: "Approved & Active", value: String(activeCount), unit: "Verified", tone: "ok" },
          { key: "pending", label: "Pending Approval Queue", value: String(pendingCount), unit: "Awaiting Sign-Off", tone: pendingCount > 0 ? "warn" : "ok" },
          { key: "revs", label: "Audit Trail Versions", value: String(totalRevs), unit: "Immutable Revisions" },
        ],
        charts: {
          primary_title: "Formula Versions & Governance Status",
          primary_unit: "versions",
          primary_series: formulas.map((f) => ({
            name: f.code,
            primary: f.history.length,
            secondary: f.pending_revision ? 1 : 0,
          })),
        },
        extra: {
          formulas,
        },
      };
    }

    default:
      return null;
  }
}

export function addEngineRecord(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  payload: Record<string, unknown>,
  actor = "ESG Engineer",
): CalcEngineResponse | null {
  const state = store.engines.get(slug);
  if (!state) return null;

  const now = Date.now();
  const id = `${slug}-${crypto.randomUUID().slice(0, 8)}`;

  // Enrich server-calculated derived fields per engine
  const record: CalcRecord = {
    ...payload,
    id,
    created_at: now,
    updated_at: now,
  };

  if (slug === "scope-1") {
    const act = num(payload.activity_amount);
    const ef = num(payload.ef_value);
    const co2 = num(payload.co2_tonnes, act * ef);
    const ch4 = num(payload.ch4_tonnes, 0);
    const n2o = num(payload.n2o_tonnes, 0);
    const total = num(
      payload.total_tco2e,
      co2 + ch4 * num(state.config.ch4_gwp, 29.8) + n2o * num(state.config.n2o_gwp, 273),
    );
    record.co2_tonnes = round(co2, 2);
    record.ch4_tonnes = round(ch4, 2);
    record.n2o_tonnes = round(n2o, 3);
    record.total_tco2e = round(total, 2);
  } else if (slug === "scope-2") {
    const mwh = num(payload.consumption_mwh);
    const lossPct = num(state.config.grid_loss_pct, 5.4);
    const locEf = num(payload.location_ef, 0.495);
    const mktEf = num(payload.market_ef, 0.562);
    record.grid_loss_mwh = round(mwh * (lossPct / 100), 1);
    record.location_tco2e = round(mwh * (1 + lossPct / 100) * locEf, 2);
    record.market_tco2e = round(mwh * (1 + lossPct / 100) * mktEf, 2);
  } else if (slug === "scope-3") {
    const act = num(payload.activity_value);
    const ef = num(payload.ef_value);
    record.emissions_tco2e = round(num(payload.emissions_tco2e, act * ef), 2);
  } else if (slug === "flaring") {
    const cems = num(payload.cems_flared_mscf);
    const dre = num(payload.dre_pct, 98.0);
    const co2 = num(payload.co2_tonnes, cems * 0.0568 * (dre / 100));
    const ch4 = num(payload.unburned_ch4_tonnes, cems * 0.015 * (1 - dre / 100));
    record.co2_tonnes = round(co2, 2);
    record.unburned_ch4_tonnes = round(ch4, 2);
    record.total_tco2e = round(co2 + ch4 * num(state.config.gwp_ch4, 29.8), 2);
  } else if (slug === "carbon-intensity") {
    const numEm = num(payload.allocated_emissions_tco2e);
    const den = Math.max(0.0001, num(payload.denominator_value, 1));
    record.intensity_value = round(numEm / den, 4);
  } else if (slug === "water") {
    const w = num(payload.withdrawal_m3);
    const d = num(payload.discharge_m3);
    record.consumption_m3 = round(num(payload.consumption_m3, Math.max(0, w - d)), 1);
  }

  state.records.unshift(record);
  state.audit_log.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    actor,
    action: `Added record to ${state.title}`,
    detail: `Record ${id} logged and engine totals recalculated.`,
  });

  recordCalculationRun(
    store,
    slug,
    "record_added",
    actor,
    `Recalculated after adding ${String(payload.unit_name || payload.facility || payload.sub_stream || payload.asset_name || payload.flare_unit || payload.product_stream || payload.waste_stream || payload.pollutant || payload.period || payload.metric_name || payload.indicator || id)}`,
    now,
  );

  return computeEngineView(store, slug);
}

export function deleteEngineRecord(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  recordId: string,
  actor = "ESG Engineer",
): CalcEngineResponse | null {
  const state = store.engines.get(slug);
  if (!state) return null;
  const idx = state.records.findIndex((r) => r.id === recordId);
  if (idx === -1) return null;
  const [removed] = state.records.splice(idx, 1);
  const now = Date.now();
  state.audit_log.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    actor,
    action: `Removed record ${recordId}`,
    detail: `Deleted record and updated calculated totals.`,
  });
  recordCalculationRun(
    store,
    slug,
    "record_deleted",
    actor,
    `Recalculated after removing ${String(removed?.unit_name || removed?.facility || removed?.id || recordId)}`,
    now,
  );
  return computeEngineView(store, slug);
}

export function updateEngineConfig(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  patch: Record<string, unknown>,
  actor = "ESG Engineer",
): CalcEngineResponse | null {
  const state = store.engines.get(slug);
  if (!state) return null;

  if (slug === "methane" && typeof patch.gwp_preset === "string") {
    const preset = GWP_PRESETS[patch.gwp_preset];
    if (preset) {
      patch.gwp_ch4 = preset.ch4;
    }
  }
  state.config = { ...state.config, ...patch };
  const now = Date.now();
  const detail = Object.entries(patch)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
  state.audit_log.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    actor,
    action: `Updated calculation parameters`,
    detail,
  });
  recordCalculationRun(
    store,
    slug,
    "config_updated",
    actor,
    `Updated parameters (${detail})`,
    now,
  );
  return computeEngineView(store, slug);
}

export function addEmissionFactor(
  store: WorkspaceCalcStore,
  payload: {
    code: string;
    name: string;
    category: string;
    gas?: string;
    source_standard: EmissionFactorItem["source_standard"];
    value: number;
    unit: string;
    valid_from: string;
    valid_to?: string | null;
    uncertainty_pct?: number;
    notes?: string;
  },
  actor = "ESG Governance Admin",
): CalcEngineResponse | null {
  const now = Date.now();
  const id = `ef-${crypto.randomUUID().slice(0, 8)}`;
  const item: EmissionFactorItem = {
    id,
    code: payload.code.trim(),
    name: payload.name.trim(),
    category: payload.category.trim(),
    gas: (payload.gas || "CO₂e").trim(),
    source_standard: payload.source_standard,
    current_version: 1,
    value: num(payload.value),
    unit: payload.unit.trim(),
    valid_from: payload.valid_from,
    valid_to: payload.valid_to || null,
    uncertainty_pct: num(payload.uncertainty_pct, 3.0),
    status: "active",
    versions: [
      {
        version: 1,
        value: num(payload.value),
        unit: payload.unit.trim(),
        source: payload.source_standard,
        valid_from: payload.valid_from,
        valid_to: payload.valid_to || null,
        uncertainty_pct: num(payload.uncertainty_pct, 3.0),
        notes: payload.notes?.trim() || "Initial verified factor registration",
        updated_at: now,
        updated_by: actor,
      },
    ],
  };
  store.emissionFactors.unshift(item);
  store.engines.get("emission-factors")?.audit_log.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    actor,
    action: `Registered ${item.code} v1`,
    detail: `${item.value} ${item.unit} (${item.source_standard}, valid from ${item.valid_from})`,
  });
  recordCalculationRun(
    store,
    "emission-factors",
    "factor_revised",
    actor,
    `Registered factor ${item.code} v1 (${item.value} ${item.unit})`,
    now,
  );
  return computeEngineView(store, "emission-factors");
}

export function reviseEmissionFactor(
  store: WorkspaceCalcStore,
  factorId: string,
  payload: {
    value: number;
    unit?: string;
    source?: string;
    valid_from: string;
    uncertainty_pct?: number;
    notes?: string;
  },
  actor = "Chief Carbon Auditor",
): CalcEngineResponse | null {
  const factor = store.emissionFactors.find((f) => f.id === factorId);
  if (!factor) return null;
  const now = Date.now();
  const prevVer = factor.versions[factor.versions.length - 1];
  if (prevVer && !prevVer.valid_to) {
    prevVer.valid_to = payload.valid_from;
  }
  const nextVersion = factor.current_version + 1;
  const nextUnit = payload.unit?.trim() || factor.unit;
  const nextUnc = payload.uncertainty_pct !== undefined ? num(payload.uncertainty_pct) : factor.uncertainty_pct;

  factor.versions.push({
    version: nextVersion,
    value: num(payload.value),
    unit: nextUnit,
    source: payload.source?.trim() || factor.source_standard,
    valid_from: payload.valid_from,
    valid_to: null,
    uncertainty_pct: nextUnc,
    notes: payload.notes?.trim() || `Revised to v${nextVersion}`,
    updated_at: now,
    updated_by: actor,
  });
  factor.current_version = nextVersion;
  factor.value = num(payload.value);
  factor.unit = nextUnit;
  factor.valid_from = payload.valid_from;
  factor.uncertainty_pct = nextUnc;

  store.engines.get("emission-factors")?.audit_log.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    actor,
    action: `Revised ${factor.code} to v${nextVersion}`,
    detail: `${prevVer?.value ?? "-"} -> ${factor.value} ${factor.unit} (effective ${factor.valid_from})`,
  });
  recordCalculationRun(
    store,
    "emission-factors",
    "factor_revised",
    actor,
    `Revised ${factor.code} to v${nextVersion} (${factor.value} ${factor.unit})`,
    now,
  );
  return computeEngineView(store, "emission-factors");
}

export function createFormulaRule(
  store: WorkspaceCalcStore,
  payload: {
    code: string;
    name: string;
    target_engine: CalcEngineSlug;
    kind: "formula" | "threshold_rule";
    output_unit: string;
    expression: string;
    variables: string[];
    sample_inputs: Record<string, number>;
    threshold_operator?: ">" | ">=" | "<" | "<=";
    threshold_value?: number | null;
    threshold_severity?: "warning" | "critical";
    change_note?: string;
  },
  actor = "ESG Engineer",
): { view: CalcEngineResponse | null; error?: string } {
  const test = evaluateSafeFormula(payload.expression, payload.sample_inputs);
  if (test.error) {
    return { view: null, error: test.error };
  }
  const now = Date.now();
  const id = `frm-${crypto.randomUUID().slice(0, 8)}`;
  const pendingRev: FormulaVersionSnapshot = {
    version: 1,
    expression: payload.expression.trim(),
    threshold_operator: payload.threshold_operator,
    threshold_value: payload.threshold_value ?? null,
    threshold_severity: payload.threshold_severity,
    change_note: payload.change_note?.trim() || "New formula submitted for governance approval",
    author: actor,
    created_at: now,
    status: "pending_approval",
  };
  const item: FormulaRuleItem = {
    id,
    code: payload.code.trim().toUpperCase(),
    name: payload.name.trim(),
    target_engine: payload.target_engine,
    kind: payload.kind,
    output_unit: payload.output_unit.trim() || "unit",
    variables: payload.variables,
    sample_inputs: payload.sample_inputs,
    active_version: 0,
    expression: payload.expression.trim(),
    threshold_operator: payload.threshold_operator,
    threshold_value: payload.threshold_value ?? null,
    threshold_severity: payload.threshold_severity,
    status: "pending_approval",
    pending_revision: pendingRev,
    history: [],
  };
  store.formulas.unshift(item);
  store.engines.get("formulas-rules")?.audit_log.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    actor,
    action: `Created ${item.code} (Pending Approval)`,
    detail: `Expression: ${item.expression}`,
  });
  return { view: computeEngineView(store, "formulas-rules") };
}

export function proposeFormulaChange(
  store: WorkspaceCalcStore,
  formulaId: string,
  payload: {
    expression: string;
    threshold_operator?: ">" | ">=" | "<" | "<=";
    threshold_value?: number | null;
    threshold_severity?: "warning" | "critical";
    change_note: string;
    sample_inputs?: Record<string, number>;
  },
  actor = "Process Performance Analyst",
): { view: CalcEngineResponse | null; error?: string } {
  const formula = store.formulas.find((f) => f.id === formulaId);
  if (!formula) return { view: null, error: "Formula not found" };
  const sample = payload.sample_inputs ?? formula.sample_inputs;
  const check = evaluateSafeFormula(payload.expression, sample);
  if (check.error) return { view: null, error: check.error };

  const now = Date.now();
  const nextVer = Math.max(formula.active_version, ...formula.history.map((h) => h.version), 0) + 1;
  formula.sample_inputs = sample;
  formula.pending_revision = {
    version: nextVer,
    expression: payload.expression.trim(),
    threshold_operator: payload.threshold_operator ?? formula.threshold_operator,
    threshold_value: payload.threshold_value !== undefined ? payload.threshold_value : formula.threshold_value,
    threshold_severity: payload.threshold_severity ?? formula.threshold_severity,
    change_note: payload.change_note.trim() || `Proposed revision v${nextVer}`,
    author: actor,
    created_at: now,
    status: "pending_approval",
  };
  formula.status = "pending_approval";

  store.engines.get("formulas-rules")?.audit_log.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    actor,
    action: `Proposed ${formula.code} v${nextVer}`,
    detail: `${formula.pending_revision.change_note} — awaiting independent approval.`,
  });
  return { view: computeEngineView(store, "formulas-rules") };
}

export function reviewFormulaChange(
  store: WorkspaceCalcStore,
  formulaId: string,
  decision: "approve" | "reject",
  reviewNote: string,
  reviewer = "Chief Carbon Auditor",
): { view: CalcEngineResponse | null; error?: string } {
  const formula = store.formulas.find((f) => f.id === formulaId);
  if (!formula || !formula.pending_revision) {
    return { view: null, error: "No pending revision to review" };
  }
  const now = Date.now();
  const pending = formula.pending_revision;

  if (decision === "approve") {
    for (const h of formula.history) {
      if (h.status === "active") h.status = "superseded";
    }
    const approvedSnap: FormulaVersionSnapshot = {
      ...pending,
      status: "active",
      reviewed_by: reviewer,
      reviewed_at: now,
      review_note: reviewNote || "Approved for production calculation",
    };
    formula.history.push(approvedSnap);
    formula.active_version = approvedSnap.version;
    formula.expression = approvedSnap.expression;
    formula.threshold_operator = approvedSnap.threshold_operator;
    formula.threshold_value = approvedSnap.threshold_value;
    formula.threshold_severity = approvedSnap.threshold_severity;
    formula.pending_revision = null;
    formula.status = "active";

    store.engines.get("formulas-rules")?.audit_log.unshift({
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: now,
      actor: reviewer,
      action: `Approved ${formula.code} v${approvedSnap.version}`,
      detail: reviewNote || "Activated new calculation formula",
    });
    recordCalculationRun(
      store,
      "formulas-rules",
      "formula_approved",
      reviewer,
      `Approved & activated ${formula.code} v${approvedSnap.version}`,
      now,
    );
  } else {
    const rejectedSnap: FormulaVersionSnapshot = {
      ...pending,
      status: "rejected",
      reviewed_by: reviewer,
      reviewed_at: now,
      review_note: reviewNote || "Returned for revision",
    };
    formula.history.push(rejectedSnap);
    formula.pending_revision = null;
    formula.status = formula.active_version > 0 ? "active" : "draft";

    store.engines.get("formulas-rules")?.audit_log.unshift({
      id: `aud-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: now,
      actor: reviewer,
      action: `Rejected ${formula.code} v${rejectedSnap.version}`,
      detail: reviewNote || "Revision rejected; prior active version retained",
    });
  }

  return { view: computeEngineView(store, "formulas-rules") };
}

export function commitBulkImportRecords(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  rows: Array<Record<string, unknown>>,
  actor = "ESG Engineer",
  options?: {
    override_acknowledged?: boolean;
    override_reason?: string;
    warning_count?: number;
  },
): CalcEngineResponse | null {
  if (slug === "emission-factors") {
    return commitBulkEmissionFactors(store, rows, actor, options);
  }

  const state = store.engines.get(slug);
  if (!state) return null;

  const now = Date.now();
  const createdRecords: CalcRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const payload = rows[i];
    const id = `${slug}-${crypto.randomUUID().slice(0, 8)}`;
    const record: CalcRecord = {
      ...payload,
      id,
      created_at: now + i,
      updated_at: now + i,
    };

    if (slug === "scope-1") {
      const act = num(payload.activity_amount);
      const ef = num(payload.ef_value);
      const co2 = num(payload.co2_tonnes, act * ef);
      const ch4 = num(payload.ch4_tonnes, 0);
      const n2o = num(payload.n2o_tonnes, 0);
      const total = num(
        payload.total_tco2e,
        co2 + ch4 * num(state.config.ch4_gwp, 29.8) + n2o * num(state.config.n2o_gwp, 273),
      );
      record.co2_tonnes = round(co2, 2);
      record.ch4_tonnes = round(ch4, 2);
      record.n2o_tonnes = round(n2o, 3);
      record.total_tco2e = round(total, 2);
    } else if (slug === "scope-2") {
      const mwh = num(payload.consumption_mwh);
      const lossPct = num(state.config.grid_loss_pct, 5.4);
      const locEf = num(payload.location_ef, 0.495);
      const mktEf = num(payload.market_ef, 0.562);
      record.grid_loss_mwh = round(mwh * (lossPct / 100), 1);
      record.location_tco2e = round(mwh * (1 + lossPct / 100) * locEf, 2);
      record.market_tco2e = round(mwh * (1 + lossPct / 100) * mktEf, 2);
    } else if (slug === "scope-3") {
      const catNum = Math.min(15, Math.max(1, Math.round(num(payload.category_num, 1))));
      const catMeta = ALL_15_SCOPE3_CATEGORIES.find((c) => c.cat === catNum);
      record.category_num = catNum;
      record.category_name =
        String(payload.category_name || "").trim() || catMeta?.name || `Cat ${catNum}`;
      record.petrochemical_priority =
        payload.petrochemical_priority !== undefined
          ? Boolean(payload.petrochemical_priority)
          : (catMeta?.petrochemical_focus ?? true);
      const act = num(payload.activity_value);
      const ef = num(payload.ef_value);
      record.emissions_tco2e = round(num(payload.emissions_tco2e, act * ef), 2);
    } else if (slug === "flaring") {
      const cems = num(payload.cems_flared_mscf);
      const dre = num(payload.dre_pct, 98.0);
      const co2 = num(payload.co2_tonnes, cems * 0.0568 * (dre / 100));
      const ch4 = num(payload.unburned_ch4_tonnes, cems * 0.015 * (1 - dre / 100));
      record.co2_tonnes = round(co2, 2);
      record.unburned_ch4_tonnes = round(ch4, 2);
      record.total_tco2e = round(co2 + ch4 * num(state.config.gwp_ch4, 29.8), 2);
    } else if (slug === "carbon-intensity") {
      const numEm = num(payload.allocated_emissions_tco2e);
      const den = Math.max(0.0001, num(payload.denominator_value, 1));
      record.intensity_value = round(numEm / den, 4);
    } else if (slug === "water") {
      const w = num(payload.withdrawal_m3);
      const d = num(payload.discharge_m3);
      record.consumption_m3 = round(num(payload.consumption_m3, Math.max(0, w - d)), 1);
    }

    createdRecords.push(record);
  }

  state.records.unshift(...createdRecords);
  const overrideDetail = options?.override_acknowledged
    ? ` (Anomaly override acknowledged: ${options.override_reason || "Verified batch upload"})`
    : "";

  state.audit_log.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    actor,
    action: `Bulk CSV Import (${createdRecords.length} rows)`,
    detail: `Committed ${createdRecords.length} pre-validated activity records to ${state.title}${overrideDetail}.`,
  });

  recordCalculationRun(
    store,
    slug,
    "record_added",
    actor,
    `Bulk CSV Import of ${createdRecords.length} activity rows${overrideDetail}`,
    now,
    {
      status: (options?.warning_count ?? 0) > 0 ? "warning" : "passed",
      checks_executed: createdRecords.length * 4,
      error_count: 0,
      warning_count: options?.warning_count ?? 0,
      acknowledged_override: options?.override_acknowledged,
      override_reason: options?.override_reason,
    },
  );

  return computeEngineView(store, slug);
}

export function commitBulkEmissionFactors(
  store: WorkspaceCalcStore,
  rows: Array<Record<string, unknown>>,
  actor = "ESG Governance Admin",
  options?: {
    override_acknowledged?: boolean;
    override_reason?: string;
    warning_count?: number;
  },
): CalcEngineResponse | null {
  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  let createdCount = 0;
  let revisedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = String(r.code ?? "").trim();
    const name = String(r.name ?? "").trim();
    if (!code || !name) continue;

    const category = String(r.category ?? "Scope 1 · Stationary").trim();
    const gas = String(r.gas ?? "CO₂e").trim();
    const source_standard = (String(r.source_standard || "Site-Specific").trim() ||
      "Site-Specific") as EmissionFactorItem["source_standard"];
    const value = num(r.value, 0.05);
    const unit = String(r.unit ?? "tCO2e/unit").trim();
    const valid_from = String(r.valid_from ?? todayIso).trim() || todayIso;
    const valid_to = r.valid_to ? String(r.valid_to).trim() : null;
    const uncertainty_pct = num(r.uncertainty_pct, 2.5);
    const notes = String(r.notes ?? "Bulk CSV import registration").trim();

    const existing = store.emissionFactors.find(
      (f) => f.code.toLowerCase() === code.toLowerCase(),
    );

    if (existing) {
      const prevVer = existing.versions[existing.versions.length - 1];
      if (prevVer && !prevVer.valid_to) {
        prevVer.valid_to = valid_from;
      }
      const nextVer = existing.current_version + 1;
      existing.versions.push({
        version: nextVer,
        value,
        unit,
        source: source_standard,
        valid_from,
        valid_to,
        uncertainty_pct,
        notes: notes || `Bulk CSV revision v${nextVer}`,
        updated_at: now + i,
        updated_by: actor,
      });
      existing.current_version = nextVer;
      existing.value = value;
      existing.unit = unit;
      existing.valid_from = valid_from;
      existing.valid_to = valid_to;
      existing.uncertainty_pct = uncertainty_pct;
      existing.source_standard = source_standard;
      revisedCount++;
    } else {
      const item: EmissionFactorItem = {
        id: `ef-${crypto.randomUUID().slice(0, 8)}`,
        code,
        name,
        category,
        gas,
        source_standard,
        current_version: 1,
        value,
        unit,
        valid_from,
        valid_to,
        uncertainty_pct,
        status: "active",
        versions: [
          {
            version: 1,
            value,
            unit,
            source: source_standard,
            valid_from,
            valid_to,
            uncertainty_pct,
            notes,
            updated_at: now + i,
            updated_by: actor,
          },
        ],
      };
      store.emissionFactors.unshift(item);
      createdCount++;
    }
  }

  const totalCount = createdCount + revisedCount;
  const overrideDetail = options?.override_acknowledged
    ? ` (Override: ${options.override_reason || "Auditor verified"})`
    : "";

  store.engines.get("emission-factors")?.audit_log.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: now,
    actor,
    action: `Bulk CSV Factor Import (${totalCount} factors)`,
    detail: `Registered ${createdCount} new factor(s) and revised ${revisedCount} existing factor(s)${overrideDetail}.`,
  });

  recordCalculationRun(
    store,
    "emission-factors",
    "factor_revised",
    actor,
    `Bulk CSV Import: ${createdCount} new, ${revisedCount} revised emission factors${overrideDetail}`,
    now,
    {
      status: (options?.warning_count ?? 0) > 0 ? "warning" : "passed",
      checks_executed: totalCount * 4,
      error_count: 0,
      warning_count: options?.warning_count ?? 0,
      acknowledged_override: options?.override_acknowledged,
      override_reason: options?.override_reason,
    },
  );

  return computeEngineView(store, "emission-factors");
}

