import type {
  CalcEngineSlug,
  CalcEngineState,
  CalcRunEntry,
  WorkspaceCalcStore,
} from "./server-calc";
import { evaluateSafeFormula } from "./server-calc";

export type ValidationSeverity = "error" | "warning";
export type ValidationCategory =
  | "missing_input"
  | "invalid_value"
  | "historical_anomaly"
  | "domain_rule";
export type ValidationStatus = "passed" | "warning" | "blocked";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  field: string;
  record_id?: string;
  record_label?: string;
  message: string;
  observed_value?: string;
  expected_range?: string;
  historical_baseline?: string;
  deviation_pct?: number;
  z_score?: number;
  remediation: string;
}

export interface TrendComparisonPoint {
  metric: string;
  unit: string;
  current_value: number;
  historical_mean: number;
  historical_std: number;
  prev_run_value: number;
  delta_pct: number;
  z_score: number;
  lower_bound: number;
  upper_bound: number;
  status: "normal" | "anomalous" | "critical";
  historical_series: number[];
}

export interface FieldTrendBaseline {
  field: string;
  label?: string;
  unit?: string;
  history: number[];
  mean: number;
  std: number;
  lower_bound: number;
  upper_bound: number;
}

export interface CalcValidationReport {
  slug: CalcEngineSlug;
  checked_at: number;
  status: ValidationStatus;
  can_proceed: boolean;
  requires_acknowledgment: boolean;
  checks_executed: number;
  checks_passed: number;
  error_count: number;
  warning_count: number;
  historical_runs_analyzed: number;
  issues: ValidationIssue[];
  trend_comparisons: TrendComparisonPoint[];
  field_trends?: Record<string, FieldTrendBaseline>;
}

interface HistoricalMetricSeed {
  metric: string;
  kpiKey?: string;
  unit: string;
  history: number[]; // chronologically oldest -> newest verified historical series
  extractCurrent: (
    state: CalcEngineState,
    records: Array<Record<string, unknown>>,
    store: WorkspaceCalcStore,
  ) => number;
  /** Minimum relative stdDev floor so small steady-state variance still has realistic band */
  minRelStd?: number;
}

function n(v: unknown, fallback = 0): number {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(v: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function hasMissingText(v: unknown): boolean {
  if (typeof v !== "string") return true;
  const t = v.trim();
  return t.length === 0 || t.toLowerCase() === "null" || t.toLowerCase() === "undefined";
}

function parseNumeric(v: unknown): { present: boolean; finite: boolean; value: number } {
  if (v === undefined || v === null || v === "") {
    return { present: false, finite: false, value: 0 };
  }
  const numVal = Number(v);
  if (!Number.isFinite(numVal)) {
    return { present: true, finite: false, value: 0 };
  }
  return { present: true, finite: true, value: numVal };
}

function computeStats(values: number[], minRelStd = 0.06): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, values.length - 1);
  const sampleStd = Math.sqrt(variance);
  const floorStd = Math.max(Math.abs(mean) * minRelStd, 0.001);
  return { mean, std: Math.max(sampleStd, floorStd) };
}

function getRecordLabel(slug: CalcEngineSlug, r: Record<string, unknown>, idx: number): string {
  const candidate =
    r.unit_name ||
    r.facility ||
    r.sub_stream ||
    r.asset_name ||
    r.flare_unit ||
    r.product_stream ||
    r.waste_stream ||
    r.pollutant ||
    r.workforce_group ||
    r.metric_name ||
    r.indicator ||
    r.code ||
    r.name ||
    r.id;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return `${slug} row #${idx + 1}`;
}

/** Multi-period verified historical baselines per engine, combined dynamically with prior run outputs */
const HISTORICAL_METRICS: Record<CalcEngineSlug, HistoricalMetricSeed[]> = {
  "scope-1": [
    {
      metric: "Total Scope 1 Emissions",
      kpiKey: "total",
      unit: "tCO2e",
      history: [26140, 26890, 27450, 26980, 27610, 27141.7],
      extractCurrent: (_s, recs) => recs.reduce((a, r) => a + n(r.total_tco2e), 0),
    },
    {
      metric: "Total Direct Activity Input Count",
      unit: "sources",
      history: [7, 7, 8, 8, 8, 8],
      minRelStd: 0.12,
      extractCurrent: (_s, recs) => recs.length,
    },
  ],
  "scope-2": [
    {
      metric: "Location-Based Scope 2",
      kpiKey: "loc",
      unit: "tCO2e",
      history: [20420, 20980, 21310, 20750, 21490, 21119.6],
      extractCurrent: (s, recs) => {
        const loss = n(s.config.grid_loss_pct, 5.4);
        return recs.reduce(
          (a, r) => a + n(r.consumption_mwh) * (1 + loss / 100) * n(r.location_ef, 0.495),
          0,
        );
      },
    },
    {
      metric: "Total Purchased Electricity & Steam",
      unit: "MWh",
      history: [43100, 44500, 45600, 44200, 46100, 45200],
      extractCurrent: (_s, recs) => recs.reduce((a, r) => a + n(r.consumption_mwh), 0),
    },
  ],
  "scope-3": [
    {
      metric: "Total Value Chain Emissions",
      kpiKey: "total",
      unit: "tCO2e",
      history: [104800, 107200, 111400, 108900, 110500, 109652],
      extractCurrent: (_s, recs) => recs.reduce((a, r) => a + n(r.emissions_tco2e), 0),
    },
    {
      metric: "Cat 1 Feedstock & Chemicals",
      kpiKey: "top_cat",
      unit: "tCO2e",
      history: [40100, 41500, 42900, 41950, 42600, 42262.5],
      extractCurrent: (_s, recs) =>
        recs.filter((r) => n(r.category_num) === 1).reduce((a, r) => a + n(r.emissions_tco2e), 0),
    },
  ],
  "emission-factors": [
    {
      metric: "Active Factor Count",
      kpiKey: "count",
      unit: "factors",
      history: [5, 5, 6, 6, 6, 6],
      minRelStd: 0.15,
      extractCurrent: (_s, _r, store) =>
        store.emissionFactors.filter((f) => f.status === "active").length,
    },
    {
      metric: "Mean Factor Uncertainty",
      kpiKey: "avg_unc",
      unit: "%",
      history: [3.2, 3.1, 3.0, 3.0, 2.9, 3.0],
      minRelStd: 0.12,
      extractCurrent: (_s, _r, store) =>
        store.emissionFactors.reduce((a, f) => a + f.uncertainty_pct, 0) /
        Math.max(1, store.emissionFactors.length),
    },
  ],
  methane: [
    {
      metric: "Level 4 Bottom-Up CH₄",
      kpiKey: "l4",
      unit: "tCH4",
      history: [37.2, 38.5, 40.1, 39.0, 40.4, 39.4],
      extractCurrent: (_s, recs) =>
        recs.filter((r) => String(r.ogmp_level) === "Level 4").reduce((a, r) => a + n(r.ch4_tonnes), 0),
    },
    {
      metric: "Level 5 Site-Level Mean CH₄",
      kpiKey: "l5",
      unit: "tCH4",
      history: [41.8, 43.2, 45.4, 43.9, 45.1, 44.55],
      extractCurrent: (_s, recs) => {
        const l5 = recs.filter((r) => String(r.ogmp_level) === "Level 5");
        return l5.reduce((a, r) => a + n(r.ch4_tonnes), 0) / Math.max(1, l5.length);
      },
    },
  ],
  flaring: [
    {
      metric: "Total CEMS Flared Gas",
      unit: "MSCF",
      history: [48200, 49100, 51200, 48800, 50400, 49500],
      extractCurrent: (_s, recs) => recs.reduce((a, r) => a + n(r.cems_flared_mscf), 0),
    },
    {
      metric: "Weighted Flare Combustion Efficiency",
      kpiKey: "dre",
      unit: "% DRE",
      history: [98.1, 98.3, 98.0, 98.4, 98.2, 98.2],
      minRelStd: 0.015,
      extractCurrent: (_s, recs) => {
        const vol = recs.reduce((a, r) => a + n(r.cems_flared_mscf), 0);
        return vol > 0
          ? recs.reduce((a, r) => a + n(r.dre_pct, 98) * n(r.cems_flared_mscf), 0) / vol
          : 0;
      },
    },
  ],
  "carbon-intensity": [
    {
      metric: "Portfolio Avg Product Intensity",
      kpiKey: "avg_prod",
      unit: "tCO2e/t",
      history: [0.692, 0.684, 0.679, 0.676, 0.673, 0.6705],
      extractCurrent: (_s, recs) => {
        const prods = recs.filter((r) => String(r.denominator_type) === "Per Tonne Product");
        return prods.reduce((a, r) => a + n(r.intensity_value), 0) / Math.max(1, prods.length);
      },
    },
  ],
  water: [
    {
      metric: "Total Site Water Withdrawal",
      kpiKey: "withdraw",
      unit: "m³",
      history: [101400, 103800, 105200, 102900, 104800, 104300],
      extractCurrent: (_s, recs) => recs.reduce((a, r) => a + n(r.withdrawal_m3), 0),
    },
    {
      metric: "Peak Effluent COD",
      unit: "mg/L",
      history: [88, 91, 95, 89, 92, 94],
      minRelStd: 0.08,
      extractCurrent: (_s, recs) =>
        recs.reduce((m, r) => Math.max(m, n(r.cod_mg_l)), 0),
    },
  ],
  waste: [
    {
      metric: "Total Waste Generated",
      kpiKey: "total",
      unit: "tonnes",
      history: [2040, 2110, 2180, 2095, 2145, 2117.5],
      extractCurrent: (_s, recs) => recs.reduce((a, r) => a + n(r.tonnes), 0),
    },
    {
      metric: "Waste Diversion & Recovery Rate",
      kpiKey: "diversion",
      unit: "%",
      history: [76.2, 77.4, 78.1, 77.9, 78.5, 78.6],
      extractCurrent: (_s, recs) => {
        const tot = recs.reduce((a, r) => a + n(r.tonnes), 0);
        const rec = recs.reduce((a, r) => a + (r.recovered ? n(r.tonnes) : 0), 0);
        return tot > 0 ? (rec / tot) * 100 : 0;
      },
    },
  ],
  "air-emissions": [
    {
      metric: "Total Criteria & HAP Mass",
      unit: "tonnes/yr",
      history: [428.5, 422.1, 419.0, 417.8, 415.9, 416.4],
      extractCurrent: (_s, recs) => recs.reduce((a, r) => a + n(r.measured_tonnes_yr), 0),
    },
  ],
  "safety-hse": [
    {
      metric: "Total Workforce Exposure Hours",
      unit: "hrs",
      history: [3150000, 3210000, 3290000, 3240000, 3310000, 3270000],
      extractCurrent: (_s, recs) => recs.reduce((a, r) => a + n(r.hours_worked), 0),
    },
    {
      metric: "TRIR (per 1M hrs)",
      unit: "rate",
      history: [2.22, 2.18, 2.13, 2.16, 2.11, 2.14],
      minRelStd: 0.12,
      extractCurrent: (_s, recs) => {
        const hrs = recs.reduce((a, r) => a + n(r.hours_worked), 0);
        const trc = recs.reduce((a, r) => a + n(r.recordable_injuries), 0);
        return hrs > 0 ? (trc * 1_000_000) / hrs : 0;
      },
    },
  ],
  "social-capital": [
    {
      metric: "Workforce Segment Headcount",
      unit: "FTEs",
      history: [1430, 1455, 1470, 1465, 1475, 1480],
      extractCurrent: (_s, recs) =>
        recs
          .filter((r) => String(r.domain) === "Workforce & Diversity")
          .reduce((a, r) => a + n(r.headcount), 0),
    },
  ],
  governance: [
    {
      metric: "Board Independence Ratio",
      unit: "%",
      history: [54.5, 54.5, 63.6, 63.6, 63.6, 63.6],
      minRelStd: 0.08,
      extractCurrent: (_s, recs) =>
        n(recs.find((r) => String(r.pillar).includes("Composition"))?.actual_value, 63.6),
    },
  ],
  "formulas-rules": [
    {
      metric: "Configured Formulas & Rules",
      unit: "rules",
      history: [3, 3, 4, 4, 4, 4],
      minRelStd: 0.18,
      extractCurrent: (_s, _r, store) => store.formulas.length,
    },
  ],
};

const FIELD_HISTORICAL_DEFAULTS: Record<string, number[]> = {
  activity_amount: [2800, 3100, 3450, 3200, 3600, 3500],
  ef_value: [0.053, 0.053, 0.054, 0.053, 0.053, 0.053],
  ch4_tonnes: [0.04, 0.05, 0.05, 0.04, 0.05, 0.05],
  n2o_tonnes: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01],
  consumption_mwh: [5100, 5300, 5550, 5400, 5650, 5500],
  location_ef: [0.495, 0.495, 0.492, 0.495, 0.490, 0.495],
  market_ef: [0.38, 0.36, 0.35, 0.34, 0.33, 0.32],
  activity_value: [11800, 12200, 13100, 12600, 13400, 13000],
  cems_flared_mscf: [5900, 6200, 6500, 6100, 6400, 6300],
  ops_balance_mscf: [5800, 6100, 6420, 6050, 6320, 6250],
  dre_pct: [98.1, 98.3, 98.0, 98.4, 98.2, 98.2],
  production_boe: [118000, 121000, 125000, 122000, 126000, 124000],
  allocated_emissions_tco2e: [1800, 1850, 1920, 1870, 1940, 1900],
  denominator_value: [2800, 2850, 2900, 2880, 2920, 2900],
  withdrawal_m3: [14200, 14900, 15600, 15000, 15400, 15300],
  produced_water_m3: [3100, 3200, 3300, 3250, 3350, 3300],
  discharge_m3: [9100, 9400, 9800, 9300, 9700, 9600],
  cod_mg_l: [84, 88, 92, 86, 90, 89],
  tds_mg_l: [1400, 1450, 1510, 1440, 1490, 1475],
  tonnes: [275, 290, 310, 285, 305, 300],
  measured_tonnes_yr: [57, 59, 63, 58, 62, 61],
  permit_limit_tonnes_yr: [80, 80, 80, 80, 80, 80],
  measured_conc: [42, 44, 46, 43, 45, 44.5],
  hours_worked: [415000, 428000, 445000, 432000, 451000, 442000],
  recordable_injuries: [1, 1, 0, 1, 0, 1],
  headcount: [205, 212, 220, 216, 225, 222],
  female_share_pct: [38.5, 39.0, 39.8, 39.4, 40.2, 40.0],
  avg_training_hours: [36, 38, 41, 39, 42, 40.5],
  actual_value: [60, 62, 63.6, 63.6, 63.6, 63.6],
  value: [0.495, 0.495, 0.492, 0.495, 0.490, 0.495],
  uncertainty_pct: [3.2, 3.1, 3.0, 3.0, 2.9, 3.0],
};

function computeFieldTrends(records: Array<Record<string, unknown>>): Record<string, FieldTrendBaseline> {
  const result: Record<string, FieldTrendBaseline> = {};
  const allKeys = new Set<string>();

  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      if (k === "id" || k === "created_at" || k === "updated_at" || k.startsWith("__")) continue;
      if (typeof v === "number" && Number.isFinite(v)) {
        allKeys.add(k);
      }
    }
  }

  for (const k of Object.keys(FIELD_HISTORICAL_DEFAULTS)) {
    if (records.some((r) => k in r)) {
      allKeys.add(k);
    }
  }

  for (const field of allKeys) {
    const presentVals = records
      .map((r) => Number(r[field]))
      .filter((v) => Number.isFinite(v) && v > 0);

    const defaultSeed = FIELD_HISTORICAL_DEFAULTS[field] ?? [];
    let combinedHistory: number[];
    if (presentVals.length >= 3) {
      combinedHistory = presentVals.slice(-6);
    } else if (defaultSeed.length > 0) {
      combinedHistory =
        presentVals.length > 0
          ? [...defaultSeed.slice(0, 4), ...presentVals]
          : defaultSeed;
    } else if (presentVals.length > 0) {
      combinedHistory = presentVals;
    } else {
      continue;
    }

    const { mean, std } = computeStats(combinedHistory, 0.1);
    const lower = Math.max(0, round(mean - 2.2 * std, 2));
    const upper = round(Math.max(mean + 2.2 * std, Math.max(...combinedHistory) * 1.25), 2);

    result[field] = {
      field,
      history: combinedHistory.map((v) => round(v, 2)),
      mean: round(mean, 2),
      std: round(std, 2),
      lower_bound: lower,
      upper_bound: upper,
    };
  }

  return result;
}

function computePeerRangeForField(
  records: Array<Record<string, unknown>>,
  field: string,
): { mean: number; std: number; max: number; count: number } | null {
  const vals = records
    .map((r) => Number(r[field]))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < 2) return null;
  const { mean, std } = computeStats(vals, 0.35);
  return { mean, std, max: Math.max(...vals), count: vals.length };
}

export function validateCalculationInputs(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  candidateRecord?: Record<string, unknown>,
): CalcValidationReport | null {
  const state = store.engines.get(slug);
  if (!state) return null;

  const now = Date.now();
  const issues: ValidationIssue[] = [];
  let checksExecuted = 0;
  let checksPassed = 0;

  const pass = () => {
    checksExecuted++;
    checksPassed++;
  };
  const fail = (issue: Omit<ValidationIssue, "id">) => {
    checksExecuted++;
    issues.push({
      id: `val-${issues.length + 1}-${issue.field}`,
      ...issue,
    });
  };

  // Build effective record set (candidateRecord appended temporarily when pre-validating entry)
  const records: Array<Record<string, unknown>> = candidateRecord
    ? [...state.records, { ...candidateRecord, __is_candidate: true, id: "__candidate__" }]
    : state.records;

  // 1. Check non-empty dataset for standard ledger engines
  if (slug !== "emission-factors" && slug !== "formulas-rules") {
    if (records.length === 0) {
      fail({
        severity: "error",
        category: "missing_input",
        field: "records",
        message: "Calculation ledger contains zero activity records.",
        observed_value: "0 records",
        expected_range: ">= 1 verified activity record",
        remediation: "Add at least one activity or measurement entry before running this engine.",
      });
    } else {
      pass();
    }
  }

  // 2. Engine parameter / config completeness checks
  if (slug === "scope-1") {
    const ch4Gwp = parseNumeric(state.config.ch4_gwp);
    const n2oGwp = parseNumeric(state.config.n2o_gwp);
    if (!ch4Gwp.present || !ch4Gwp.finite || ch4Gwp.value <= 0) {
      fail({
        severity: "error",
        category: "missing_input",
        field: "config.ch4_gwp",
        message: "Scope 1 CH₄ GWP conversion factor is missing or non-positive.",
        observed_value: String(state.config.ch4_gwp ?? "missing"),
        expected_range: "20.0 – 90.0 (AR5/AR6)",
        remediation: "Configure valid IPCC AR5 or AR6 CH₄ GWP factor.",
      });
    } else pass();

    if (!n2oGwp.present || !n2oGwp.finite || n2oGwp.value <= 0) {
      fail({
        severity: "error",
        category: "missing_input",
        field: "config.n2o_gwp",
        message: "Scope 1 N₂O GWP conversion factor is missing or non-positive.",
        observed_value: String(state.config.n2o_gwp ?? "missing"),
        expected_range: "250 – 310 (AR5/AR6)",
        remediation: "Configure valid IPCC AR5 or AR6 N₂O GWP factor.",
      });
    } else pass();
  } else if (slug === "scope-2") {
    const loss = parseNumeric(state.config.grid_loss_pct);
    if (!loss.present || !loss.finite || loss.value < 0 || loss.value > 35) {
      fail({
        severity: "error",
        category: "invalid_value",
        field: "config.grid_loss_pct",
        message: "Grid T&D loss percentage is missing or outside physical bounds (0–35%).",
        observed_value: `${String(state.config.grid_loss_pct ?? "missing")}%`,
        expected_range: "0.0% – 35.0%",
        remediation: "Enter regional T&D loss factor between 0% and 35%.",
      });
    } else pass();
  } else if (slug === "methane") {
    const gwp = parseNumeric(state.config.gwp_ch4);
    if (!gwp.present || !gwp.finite || gwp.value <= 0) {
      fail({
        severity: "error",
        category: "missing_input",
        field: "config.gwp_ch4",
        message: "Methane GWP multiplier is missing or invalid.",
        observed_value: String(state.config.gwp_ch4 ?? "missing"),
        expected_range: "25.0 – 85.0",
        remediation: "Select an IPCC AR5 or AR6 GWP preset.",
      });
    } else pass();
  } else if (slug === "waste") {
    const recIn = parseNumeric(state.config.recycled_input_materials_tonnes);
    const totIn = parseNumeric(state.config.total_material_inputs_tonnes);
    if (!totIn.present || !totIn.finite || totIn.value <= 0) {
      fail({
        severity: "error",
        category: "missing_input",
        field: "config.total_material_inputs_tonnes",
        message: "Total material input mass is missing or zero (needed for MCI denominator).",
        observed_value: String(state.config.total_material_inputs_tonnes ?? "missing"),
        expected_range: "> 0 tonnes",
        remediation: "Provide positive total feedstock/material input mass.",
      });
    } else if (recIn.finite && recIn.value > totIn.value) {
      fail({
        severity: "error",
        category: "domain_rule",
        field: "config.recycled_input_materials_tonnes",
        message: "Recycled input materials exceed total material inputs.",
        observed_value: `${recIn.value} t > ${totIn.value} t`,
        expected_range: `<= ${totIn.value} tonnes`,
        remediation: "Verify circular feedstock balance so recycled inputs <= total inputs.",
      });
    } else pass();
  }

  // Helper to check a required text + positive numeric field + peer anomaly
  const checkRequiredText = (
    r: Record<string, unknown>,
    field: string,
    label: string,
    idx: number,
  ) => {
    const val = r[field];
    if (hasMissingText(val)) {
      fail({
        severity: "error",
        category: "missing_input",
        field,
        record_id: String(r.id ?? idx),
        record_label: getRecordLabel(slug, r, idx),
        message: `Missing required field '${label}' on ledger entry.`,
        observed_value: "Empty / Missing",
        expected_range: "Non-empty identifier",
        remediation: `Provide a valid '${label}' identifier.`,
      });
      return false;
    }
    pass();
    return true;
  };

  const checkNumericField = (
    r: Record<string, unknown>,
    field: string,
    label: string,
    idx: number,
    opts: {
      min?: number;
      max?: number;
      strictlyPositive?: boolean;
      checkPeerOutlier?: boolean;
      peerUnitField?: string;
      allowZeroIf?: boolean;
    } = {},
  ) => {
    const parsed = parseNumeric(r[field]);
    const recLabel = getRecordLabel(slug, r, idx);
    if (!parsed.present) {
      fail({
        severity: "error",
        category: "missing_input",
        field,
        record_id: String(r.id ?? idx),
        record_label: recLabel,
        message: `Missing numeric input '${label}' for ${recLabel}.`,
        observed_value: "Missing",
        expected_range: opts.strictlyPositive ? "> 0" : `>= ${opts.min ?? 0}`,
        remediation: `Supply a valid numeric '${label}' measurement.`,
      });
      return null;
    }
    if (!parsed.finite) {
      fail({
        severity: "error",
        category: "invalid_value",
        field,
        record_id: String(r.id ?? idx),
        record_label: recLabel,
        message: `Non-numeric value entered for '${label}' on ${recLabel}.`,
        observed_value: String(r[field]),
        expected_range: "Finite number",
        remediation: "Replace invalid text/NaN with a numeric value.",
      });
      return null;
    }
    const min = opts.min ?? 0;
    if (parsed.value < min) {
      fail({
        severity: "error",
        category: "invalid_value",
        field,
        record_id: String(r.id ?? idx),
        record_label: recLabel,
        message: `Negative or below-minimum value (${parsed.value}) for '${label}' on ${recLabel}.`,
        observed_value: String(parsed.value),
        expected_range: `>= ${min}`,
        remediation: `Correct '${label}' to a physically valid value >= ${min}.`,
      });
      return null;
    }
    if (opts.max !== undefined && parsed.value > opts.max) {
      fail({
        severity: "error",
        category: "invalid_value",
        field,
        record_id: String(r.id ?? idx),
        record_label: recLabel,
        message: `Value (${parsed.value}) for '${label}' exceeds maximum bound (${opts.max}) on ${recLabel}.`,
        observed_value: String(parsed.value),
        expected_range: `${min} – ${opts.max}`,
        remediation: `Verify measurement units and enter value <= ${opts.max}.`,
      });
      return null;
    }
    if (opts.strictlyPositive && !opts.allowZeroIf && parsed.value <= 0) {
      fail({
        severity: "error",
        category: "missing_input",
        field,
        record_id: String(r.id ?? idx),
        record_label: recLabel,
        message: `Zero or missing activity value for '${label}' on ${recLabel}.`,
        observed_value: String(parsed.value),
        expected_range: "> 0",
        remediation: `Provide metered '${label}' > 0 or remove unused placeholder entry.`,
      });
      return null;
    }
    pass();

    if (opts.checkPeerOutlier && parsed.value > 0) {
      const peers = state.records.filter((peer) => {
        if (peer.id === r.id) return false;
        if (opts.peerUnitField) {
          return String(peer[opts.peerUnitField] ?? "") === String(r[opts.peerUnitField] ?? "");
        }
        return true;
      });
      const peerStats = computePeerRangeForField(peers, field);
      if (peerStats && parsed.value > Math.max(peerStats.max * 2.5, peerStats.mean + 3.2 * peerStats.std)) {
        const z = (parsed.value - peerStats.mean) / peerStats.std;
        const devPct = ((parsed.value - peerStats.mean) / peerStats.mean) * 100;
        fail({
          severity: "warning",
          category: "historical_anomaly",
          field,
          record_id: String(r.id ?? idx),
          record_label: recLabel,
          message: `Anomalous spike detected in '${label}' on ${recLabel} vs historical unit range.`,
          observed_value: parsed.value.toLocaleString("en-US"),
          expected_range: `<= ${round(Math.max(peerStats.max * 2.0, peerStats.mean + 2.5 * peerStats.std), 1).toLocaleString("en-US")}`,
          historical_baseline: `Peer mean ${round(peerStats.mean, 1).toLocaleString("en-US")} (max ${round(peerStats.max, 1).toLocaleString("en-US")})`,
          deviation_pct: round(devPct, 1),
          z_score: round(z, 2),
          remediation: "Check unit conversion (e.g., GJ vs MMBtu, kg vs tonnes) or acknowledge intentional throughput spike.",
        });
      }
    }
    return parsed.value;
  };

  // 3. Per-Engine Record Completeness, Bounds & Domain Rules
  if (slug === "scope-1") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "unit_name", "Source / Asset Unit", idx);
      checkRequiredText(r, "fuel_or_stream", "Fuel / Feedstock Stream", idx);
      const act = checkNumericField(r, "activity_amount", "Activity Quantity", idx, {
        strictlyPositive: true,
        checkPeerOutlier: true,
        peerUnitField: "activity_unit",
      });
      const ef = checkNumericField(r, "ef_value", "Emission Factor", idx, {
        strictlyPositive: true,
      });
      checkNumericField(r, "ch4_tonnes", "CH₄ (tonnes)", idx, { min: 0 });
      checkNumericField(r, "n2o_tonnes", "N₂O (tonnes)", idx, { min: 0 });
      if (act !== null && ef !== null && ef > 120) {
        fail({
          severity: "warning",
          category: "historical_anomaly",
          field: "ef_value",
          record_id: String(r.id ?? idx),
          record_label: getRecordLabel(slug, r, idx),
          message: `Unusually high Scope 1 emission factor (${ef}) compared to standard IPCC/API fuel range.`,
          observed_value: String(ef),
          expected_range: "0.001 – 80 tCO2e/unit",
          remediation: "Confirm factor denominator unit matches activity unit.",
        });
      }
    });
  } else if (slug === "scope-2") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "facility", "Facility / Grid Meter", idx);
      checkNumericField(r, "consumption_mwh", "Purchased Energy (MWh)", idx, {
        strictlyPositive: true,
        checkPeerOutlier: true,
      });
      checkNumericField(r, "location_ef", "Location-Based EF", idx, { min: 0, max: 2.0 });
      checkNumericField(r, "market_ef", "Market-Based EF", idx, { min: 0, max: 2.0 });
    });
  } else if (slug === "scope-3") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "sub_stream", "Value Chain Sub-Stream", idx);
      const isExemptZero = String(r.method || "").includes("Screened");
      checkNumericField(r, "activity_value", "Activity Quantity", idx, {
        strictlyPositive: !isExemptZero,
        allowZeroIf: isExemptZero,
        checkPeerOutlier: true,
        peerUnitField: "activity_unit",
      });
      checkNumericField(r, "ef_value", "Emission Factor", idx, { min: 0 });
    });
  } else if (slug === "emission-factors") {
    const todayIso = new Date(now).toISOString().slice(0, 10);
    store.emissionFactors.forEach((f, idx) => {
      if (hasMissingText(f.code) || hasMissingText(f.unit)) {
        fail({
          severity: "error",
          category: "missing_input",
          field: "code",
          record_id: f.id,
          record_label: f.code || `Factor #${idx + 1}`,
          message: `Emission factor missing code or unit.`,
          remediation: "Provide factor code and explicit denominator unit.",
        });
      } else pass();
      if (!Number.isFinite(f.value) || f.value <= 0) {
        fail({
          severity: "error",
          category: "invalid_value",
          field: "value",
          record_id: f.id,
          record_label: f.code,
          message: `Emission factor ${f.code} has non-positive value (${f.value}).`,
          observed_value: String(f.value),
          expected_range: "> 0",
          remediation: "Revise factor with positive verified value.",
        });
      } else pass();
      if (f.valid_to && f.valid_to < todayIso) {
        fail({
          severity: "warning",
          category: "domain_rule",
          field: "valid_to",
          record_id: f.id,
          record_label: f.code,
          message: `Emission factor ${f.code} expired on ${f.valid_to}.`,
          observed_value: f.valid_to,
          expected_range: `>= ${todayIso}`,
          remediation: "Publish a revised version with updated validity period.",
        });
      }
    });
  } else if (slug === "methane") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "asset_name", "Asset / Site Perimeter", idx);
      checkNumericField(r, "ch4_tonnes", "Measured CH₄ (tonnes)", idx, {
        strictlyPositive: true,
        checkPeerOutlier: true,
      });
      checkNumericField(r, "uncertainty_pct", "Uncertainty (%)", idx, { min: 0, max: 100 });
    });
  } else if (slug === "flaring") {
    const maxGap = n(state.config.max_reconciliation_gap_pct, 5.0);
    const minDre = n(state.config.benchmark_dre_pct, 98.0);
    records.forEach((r, idx) => {
      checkRequiredText(r, "flare_unit", "Flare Stack / Header", idx);
      const cems = checkNumericField(r, "cems_flared_mscf", "CEMS Flared (MSCF)", idx, {
        strictlyPositive: true,
        checkPeerOutlier: true,
      });
      const ops = checkNumericField(r, "ops_balance_mscf", "Ops Balance (MSCF)", idx, {
        min: 0,
      });
      checkNumericField(r, "production_boe", "Production (BOE)", idx, {
        strictlyPositive: true,
      });
      const dre = checkNumericField(r, "dre_pct", "Combustion Efficiency DRE (%)", idx, {
        min: 50,
        max: 100,
      });
      if (cems !== null && ops !== null && cems > 0) {
        const gapPct = Math.abs((cems - ops) / cems) * 100;
        if (gapPct > maxGap) {
          fail({
            severity: "warning",
            category: "domain_rule",
            field: "ops_balance_mscf",
            record_id: String(r.id ?? idx),
            record_label: getRecordLabel(slug, r, idx),
            message: `CEMS vs Ops mass-balance gap (${round(gapPct, 1)}%) exceeds threshold (${maxGap}%).`,
            observed_value: `${round(gapPct, 1)}% gap`,
            expected_range: `<= ${maxGap}%`,
            remediation: "Reconcile ultrasonic flare meter calibration against DCS hydrocarbon balance.",
          });
        }
      }
      if (dre !== null && dre < minDre) {
        fail({
          severity: "warning",
          category: "domain_rule",
          field: "dre_pct",
          record_id: String(r.id ?? idx),
          record_label: getRecordLabel(slug, r, idx),
          message: `Flare DRE (${dre}%) is below benchmark (${minDre}%), elevating unburned CH₄ slip.`,
          observed_value: `${dre}%`,
          expected_range: `>= ${minDre}%`,
          remediation: "Inspect steam-assist / air-assist control loop and log adjustment.",
        });
      }
    });
  } else if (slug === "carbon-intensity") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "product_stream", "Product Stream / Denominator", idx);
      checkNumericField(r, "allocated_emissions_tco2e", "Allocated Emissions (tCO2e)", idx, {
        min: 0,
        checkPeerOutlier: true,
      });
      checkNumericField(r, "denominator_value", "Production / Denominator", idx, {
        strictlyPositive: true,
      });
    });
  } else if (slug === "water") {
    const codLim = n(state.config.cod_limit_mg_l, 120);
    const tdsLim = n(state.config.tds_limit_mg_l, 2000);
    const phLim = n(state.config.phenols_limit_mg_l, 0.5);
    const hmLim = n(state.config.heavy_metals_limit_mg_l, 0.2);

    records.forEach((r, idx) => {
      checkRequiredText(r, "facility", "Facility Name", idx);
      const w = checkNumericField(r, "withdrawal_m3", "Withdrawal (m³)", idx, {
        strictlyPositive: true,
        checkPeerOutlier: true,
      });
      const p = checkNumericField(r, "produced_water_m3", "Produced Water (m³)", idx, { min: 0 });
      const d = checkNumericField(r, "discharge_m3", "Discharge (m³)", idx, { min: 0 });
      const cod = checkNumericField(r, "cod_mg_l", "Effluent COD (mg/L)", idx, { min: 0 });
      const tds = checkNumericField(r, "tds_mg_l", "Effluent TDS (mg/L)", idx, { min: 0 });
      const ph = checkNumericField(r, "phenols_mg_l", "Phenols (mg/L)", idx, { min: 0 });
      const hm = checkNumericField(r, "heavy_metals_mg_l", "Heavy Metals (mg/L)", idx, { min: 0 });
      checkNumericField(r, "wri_stress_score", "WRI Stress Score", idx, { min: 0, max: 5 });

      if (w !== null && p !== null && d !== null && d > w + p) {
        fail({
          severity: "error",
          category: "domain_rule",
          field: "discharge_m3",
          record_id: String(r.id ?? idx),
          record_label: getRecordLabel(slug, r, idx),
          message: `Water balance violation: Discharge (${d.toLocaleString()} m³) exceeds Withdrawal + Produced Water (${(w + p).toLocaleString()} m³).`,
          observed_value: `${d.toLocaleString()} m³`,
          expected_range: `<= ${(w + p).toLocaleString()} m³`,
          remediation: "Verify flowmeter totals or include missing produced/stormwater intake.",
        });
      }
      if (
        (cod !== null && cod > codLim) ||
        (tds !== null && tds > tdsLim) ||
        (ph !== null && ph > phLim) ||
        (hm !== null && hm > hmLim)
      ) {
        fail({
          severity: "warning",
          category: "domain_rule",
          field: "cod_mg_l",
          record_id: String(r.id ?? idx),
          record_label: getRecordLabel(slug, r, idx),
          message: `Effluent quality parameter exceeds regulatory permit cap on ${getRecordLabel(slug, r, idx)}.`,
          observed_value: `COD ${cod ?? 0}/${codLim}, TDS ${tds ?? 0}/${tdsLim}`,
          expected_range: "Below permit cap",
          remediation: "Confirm lab assay dilution or document ETP exceedance notice.",
        });
      }
    });
  } else if (slug === "waste") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "waste_stream", "Waste Stream", idx);
      checkNumericField(r, "tonnes", "Waste Mass (tonnes)", idx, {
        strictlyPositive: true,
        checkPeerOutlier: true,
      });
    });
  } else if (slug === "air-emissions") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "pollutant", "Pollutant", idx);
      const mass = checkNumericField(r, "measured_tonnes_yr", "Measured Mass (t/yr)", idx, {
        min: 0,
        checkPeerOutlier: true,
      });
      const lim = checkNumericField(r, "permit_limit_tonnes_yr", "Permit Mass Cap (t/yr)", idx, {
        strictlyPositive: true,
      });
      const conc = checkNumericField(r, "measured_conc", "Concentration", idx, { min: 0 });
      const concLim = checkNumericField(r, "permit_conc_limit", "Concentration Limit", idx, {
        strictlyPositive: true,
      });
      if (mass !== null && lim !== null && mass > lim) {
        fail({
          severity: "warning",
          category: "domain_rule",
          field: "measured_tonnes_yr",
          record_id: String(r.id ?? idx),
          record_label: getRecordLabel(slug, r, idx),
          message: `${String(r.pollutant)} annual emission (${mass} t/yr) exceeds permit limit (${lim} t/yr).`,
          observed_value: `${mass} t/yr`,
          expected_range: `<= ${lim} t/yr`,
          remediation: "Validate CEMS drift check or attach regulatory exceedance notice.",
        });
      }
      if (conc !== null && concLim !== null && conc > concLim) {
        fail({
          severity: "warning",
          category: "domain_rule",
          field: "measured_conc",
          record_id: String(r.id ?? idx),
          record_label: getRecordLabel(slug, r, idx),
          message: `${String(r.pollutant)} stack concentration (${conc}) exceeds permit limit (${concLim}).`,
          observed_value: String(conc),
          expected_range: `<= ${concLim}`,
          remediation: "Verify stack normalization O2% correction and CEMS calibration.",
        });
      }
    });
  } else if (slug === "safety-hse") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "workforce_group", "Workforce Group", idx);
      checkNumericField(r, "hours_worked", "Exposure Hours Worked", idx, {
        strictlyPositive: true,
        checkPeerOutlier: true,
      });
      const fat = checkNumericField(r, "fatalities", "Fatalities", idx, { min: 0 });
      const lti = checkNumericField(r, "lti_cases", "LTI Cases", idx, { min: 0 });
      const trc = checkNumericField(r, "recordable_injuries", "Recordable Injuries", idx, { min: 0 });
      const t1 = checkNumericField(r, "tier1_pse", "API 754 Tier 1 PSE", idx, { min: 0 });

      if (lti !== null && trc !== null && lti > trc) {
        fail({
          severity: "error",
          category: "domain_rule",
          field: "lti_cases",
          record_id: String(r.id ?? idx),
          record_label: getRecordLabel(slug, r, idx),
          message: `Classification error: LTI cases (${lti}) cannot exceed Total Recordable Injuries (${trc}).`,
          observed_value: `LTI ${lti} > TRC ${trc}`,
          expected_range: `LTI <= ${trc}`,
          remediation: "Every LTI is a recordable injury; update TRC count or verify LTI flag.",
        });
      }
      if (fat !== null && lti !== null && fat > lti) {
        fail({
          severity: "error",
          category: "domain_rule",
          field: "fatalities",
          record_id: String(r.id ?? idx),
          record_label: getRecordLabel(slug, r, idx),
          message: `Classification error: Fatalities (${fat}) cannot exceed LTI/Severe injury count (${lti}).`,
          observed_value: `${fat} > ${lti}`,
          expected_range: `<= ${lti}`,
          remediation: "Reconcile incident classification hierarchy.",
        });
      }
      if ((fat !== null && fat > 0) || (t1 !== null && t1 > 0)) {
        fail({
          severity: "warning",
          category: "domain_rule",
          field: "tier1_pse",
          record_id: String(r.id ?? idx),
          record_label: getRecordLabel(slug, r, idx),
          message: `High-consequence safety event recorded (Fatalities=${fat ?? 0}, Tier 1 PSE=${t1 ?? 0}).`,
          observed_value: `Fat=${fat ?? 0}, T1=${t1 ?? 0}`,
          expected_range: "0 high-consequence events",
          remediation: "Confirm RCA reference before finalizing quarterly HSE disclosure.",
        });
      }
    });
  } else if (slug === "social-capital") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "metric_name", "Segment / Metric Name", idx);
      checkNumericField(r, "headcount", "Headcount / Count", idx, { strictlyPositive: true });
      checkNumericField(r, "female_share_pct", "Share (%)", idx, { min: 0, max: 100 });
      checkNumericField(r, "avg_training_hours", "Training Hours", idx, { min: 0, max: 500 });
      checkNumericField(r, "pay_ratio_f_m", "Pay Ratio (F:M)", idx, { min: 0.2, max: 2.0 });
    });
  } else if (slug === "governance") {
    records.forEach((r, idx) => {
      checkRequiredText(r, "indicator", "Governance Indicator", idx);
      checkNumericField(r, "actual_value", "Actual Value (%)", idx, { min: 0, max: 100 });
      checkNumericField(r, "target_value", "Target Value (%)", idx, { min: 0, max: 100 });
    });
  } else if (slug === "formulas-rules") {
    store.formulas.forEach((f) => {
      const res = evaluateSafeFormula(f.expression, f.sample_inputs);
      if (res.error) {
        fail({
          severity: "error",
          category: "invalid_value",
          field: "expression",
          record_id: f.id,
          record_label: f.code,
          message: `Formula ${f.code} failed syntax/variable validation: ${res.error}`,
          observed_value: f.expression,
          remediation: "Fix expression syntax or declare missing sample input variable.",
        });
      } else pass();
      if (f.pending_revision) {
        fail({
          severity: "warning",
          category: "domain_rule",
          field: "pending_revision",
          record_id: f.id,
          record_label: f.code,
          message: `${f.code} has pending revision v${f.pending_revision.version} awaiting independent approval.`,
          observed_value: `v${f.pending_revision.version} pending`,
          expected_range: "All changes reviewed",
          remediation: "Active approved version will be used unless pending revision is approved first.",
        });
      }
    });
  }

  // 4. Historical Trend Analysis against prior runs + baseline distribution
  const trendComparisons: TrendComparisonPoint[] = [];
  const seeds = HISTORICAL_METRICS[slug] ?? [];
  const priorRuns: CalcRunEntry[] = (state.runs ?? []).filter(
    (run) => !run.validation_summary?.acknowledged_override,
  );

  for (const seed of seeds) {
    const current = round(seed.extractCurrent(state, records, store), 3);
    // Blend multi-period baseline with prior run KPI snapshots where numeric values match
    const series = [...seed.history];
    const matchingPriorVals = seed.kpiKey
      ? priorRuns
          .slice(0, 6)
          .reverse()
          .map((run) => {
            const kpi = run.outputs_snapshot.find((k) => k.key === seed.kpiKey);
            if (!kpi) return null;
            const parsed = Number.parseFloat(String(kpi.value).replace(/,/g, ""));
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
          })
          .filter((v): v is number => v !== null)
      : [];

    const combinedHistory =
      matchingPriorVals.length >= 2 ? [...seed.history.slice(0, 4), ...matchingPriorVals] : series;

    const { mean, std } = computeStats(combinedHistory, seed.minRelStd ?? 0.06);
    const prevVal = combinedHistory[combinedHistory.length - 1] ?? mean;
    const zScore = std > 0 ? (current - mean) / std : 0;
    const deltaPct = prevVal !== 0 ? ((current - prevVal) / Math.abs(prevVal)) * 100 : 0;
    const lower = Math.max(0, round(mean - 2.2 * std, 2));
    const upper = round(mean + 2.2 * std, 2);

    let trendStatus: TrendComparisonPoint["status"] = "normal";
    if (Math.abs(zScore) >= 3.5 || Math.abs(deltaPct) >= 65) {
      trendStatus = "critical";
    } else if (Math.abs(zScore) >= 2.2 || Math.abs(deltaPct) >= 28) {
      trendStatus = "anomalous";
    }

    trendComparisons.push({
      metric: seed.metric,
      unit: seed.unit,
      current_value: current,
      historical_mean: round(mean, 2),
      historical_std: round(std, 2),
      prev_run_value: round(prevVal, 2),
      delta_pct: round(deltaPct, 1),
      z_score: round(zScore, 2),
      lower_bound: lower,
      upper_bound: upper,
      status: trendStatus,
      historical_series: combinedHistory.map((v) => round(v, 2)),
    });

    if (trendStatus !== "normal") {
      fail({
        severity: "warning",
        category: "historical_anomaly",
        field: seed.metric,
        message: `${seed.metric} (${current.toLocaleString("en-US")} ${seed.unit}) deviates ${deltaPct >= 0 ? "+" : ""}${round(deltaPct, 1)}% (${round(zScore, 2)}σ) from historical trend.`,
        observed_value: `${current.toLocaleString("en-US")} ${seed.unit}`,
        expected_range: `${lower.toLocaleString("en-US")} – ${upper.toLocaleString("en-US")} ${seed.unit}`,
        historical_baseline: `Mean ${round(mean, 2).toLocaleString("en-US")} ± ${round(std, 2).toLocaleString("en-US")} ${seed.unit}`,
        deviation_pct: round(deltaPct, 1),
        z_score: round(zScore, 2),
        remediation:
          "Verify new or edited activity values for unit-of-measure errors before confirming run.",
      });
    } else {
      pass();
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const status: ValidationStatus =
    errorCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "passed";

  return {
    slug,
    checked_at: now,
    status,
    can_proceed: errorCount === 0,
    requires_acknowledgment: errorCount === 0 && warningCount > 0,
    checks_executed: checksExecuted,
    checks_passed: checksPassed,
    error_count: errorCount,
    warning_count: warningCount,
    historical_runs_analyzed: Math.max(6, priorRuns.length),
    issues,
    trend_comparisons: trendComparisons,
    field_trends: computeFieldTrends(records),
  };
}

export interface BulkRowValidationResult {
  row_index: number;
  label: string;
  status: ValidationStatus;
  error_count: number;
  warning_count: number;
  issues: ValidationIssue[];
  normalized_record: Record<string, unknown>;
}

export interface BulkImportValidationReport {
  slug: CalcEngineSlug;
  checked_at: number;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  status: ValidationStatus;
  can_commit: boolean;
  requires_acknowledgment: boolean;
  rows: BulkRowValidationResult[];
  batch_trend_comparisons: TrendComparisonPoint[];
  field_trends: Record<string, FieldTrendBaseline>;
}

export function validateBulkImportRows(
  store: WorkspaceCalcStore,
  slug: CalcEngineSlug,
  candidateRows: Array<Record<string, unknown>>,
): BulkImportValidationReport | null {
  const state = store.engines.get(slug);
  if (!state) return null;

  const now = Date.now();
  const fieldTrends = computeFieldTrends(state.records);
  const rowResults: BulkRowValidationResult[] = [];
  const todayIso = new Date(now).toISOString().slice(0, 10);

  if (slug === "emission-factors") {
    const validStandards = new Set([
      "IPCC 2006",
      "DEFRA",
      "EPA",
      "IEA",
      "Site-Specific",
      "Lab-Specific",
    ]);

    candidateRows.forEach((rawRow, idx) => {
      const rowNum = idx + 1;
      const issues: ValidationIssue[] = [];
      const code = String(rawRow.code ?? "").trim();
      const name = String(rawRow.name ?? "").trim();
      const category = String(rawRow.category ?? "Scope 1 · Stationary").trim();
      const gas = String(rawRow.gas ?? "CO₂e").trim();
      const rawStd = String(rawRow.source_standard ?? "Site-Specific").trim();
      const source_standard = validStandards.has(rawStd) ? rawStd : "Site-Specific";
      const valParsed = parseNumeric(rawRow.value);
      const unit = String(rawRow.unit ?? "").trim();
      const valid_from = String(rawRow.valid_from ?? todayIso).trim() || todayIso;
      const valid_to = rawRow.valid_to ? String(rawRow.valid_to).trim() : null;
      const uncParsed = parseNumeric(rawRow.uncertainty_pct);
      const notes = String(rawRow.notes ?? "Bulk CSV import registration").trim();

      const label = code || name || `Row #${rowNum}`;

      if (!code) {
        issues.push({
          id: `bulk-ef-${rowNum}-code`,
          severity: "error",
          category: "missing_input",
          field: "code",
          record_id: `row-${rowNum}`,
          record_label: label,
          message: `Row #${rowNum}: Missing required Emission Factor 'code'.`,
          observed_value: "Empty",
          expected_range: "Unique factor code (e.g., EF-NG-SITE)",
          remediation: "Provide a non-empty emission factor code.",
        });
      }
      if (!name) {
        issues.push({
          id: `bulk-ef-${rowNum}-name`,
          severity: "error",
          category: "missing_input",
          field: "name",
          record_id: `row-${rowNum}`,
          record_label: label,
          message: `Row #${rowNum}: Missing required Emission Factor 'name'.`,
          observed_value: "Empty",
          expected_range: "Descriptive factor name",
          remediation: "Provide a descriptive name for the emission factor.",
        });
      }
      if (!unit) {
        issues.push({
          id: `bulk-ef-${rowNum}-unit`,
          severity: "error",
          category: "missing_input",
          field: "unit",
          record_id: `row-${rowNum}`,
          record_label: label,
          message: `Row #${rowNum}: Missing denominator 'unit' (e.g., tCO2e/MMBtu).`,
          observed_value: "Empty",
          expected_range: "tCO2e/<unit>",
          remediation: "Specify explicit emission factor unit.",
        });
      }
      if (!valParsed.present || !valParsed.finite || valParsed.value <= 0) {
        issues.push({
          id: `bulk-ef-${rowNum}-value`,
          severity: "error",
          category: "invalid_value",
          field: "value",
          record_id: `row-${rowNum}`,
          record_label: label,
          message: `Row #${rowNum}: Factor value (${String(rawRow.value ?? "missing")}) must be a positive number.`,
          observed_value: String(rawRow.value ?? "missing"),
          expected_range: "> 0",
          remediation: "Enter a positive numeric emission factor.",
        });
      } else {
        // Check against existing factor with same code or category peer range
        const existingFactor = store.emissionFactors.find(
          (f) => f.code.toLowerCase() === code.toLowerCase(),
        );
        if (existingFactor) {
          const deltaPct =
            existingFactor.value > 0
              ? ((valParsed.value - existingFactor.value) / existingFactor.value) * 100
              : 0;
          if (Math.abs(deltaPct) >= 25) {
            issues.push({
              id: `bulk-ef-${rowNum}-anomaly`,
              severity: "warning",
              category: "historical_anomaly",
              field: "value",
              record_id: `row-${rowNum}`,
              record_label: label,
              message: `Factor ${code} value (${valParsed.value}) deviates ${deltaPct >= 0 ? "+" : ""}${round(deltaPct, 1)}% from current active v${existingFactor.current_version} (${existingFactor.value} ${existingFactor.unit}).`,
              observed_value: `${valParsed.value} ${unit}`,
              expected_range: `${round(existingFactor.value * 0.75, 4)} – ${round(existingFactor.value * 1.25, 4)} ${existingFactor.unit}`,
              historical_baseline: `Active v${existingFactor.current_version}: ${existingFactor.value} ${existingFactor.unit}`,
              deviation_pct: round(deltaPct, 1),
              remediation: "Verify lab assay or unit conversion before superseding active factor version.",
            });
          }
        } else if (valParsed.value > 50) {
          issues.push({
            id: `bulk-ef-${rowNum}-high-ef`,
            severity: "warning",
            category: "historical_anomaly",
            field: "value",
            record_id: `row-${rowNum}`,
            record_label: label,
            message: `Unusually high emission factor (${valParsed.value} ${unit}) compared to standard IPCC/DEFRA range (0.001 – 25).`,
            observed_value: `${valParsed.value} ${unit}`,
            expected_range: "0.0005 – 25.0",
            remediation: "Confirm factor is expressed in tonnes CO2e rather than kg CO2e.",
          });
        }
      }

      if (uncParsed.present && (!uncParsed.finite || uncParsed.value < 0 || uncParsed.value > 100)) {
        issues.push({
          id: `bulk-ef-${rowNum}-unc`,
          severity: "error",
          category: "invalid_value",
          field: "uncertainty_pct",
          record_id: `row-${rowNum}`,
          record_label: label,
          message: `Row #${rowNum}: Uncertainty % (${String(rawRow.uncertainty_pct)}) must be between 0 and 100.`,
          observed_value: String(rawRow.uncertainty_pct),
          expected_range: "0 – 100%",
          remediation: "Provide valid uncertainty percentage.",
        });
      } else if (uncParsed.present && uncParsed.value > 25) {
        issues.push({
          id: `bulk-ef-${rowNum}-unc-warn`,
          severity: "warning",
          category: "historical_anomaly",
          field: "uncertainty_pct",
          record_id: `row-${rowNum}`,
          record_label: label,
          message: `High uncertainty (±${uncParsed.value}%) exceeds typical ISO 14064 Tier 2/3 tolerance (±15%).`,
          observed_value: `±${uncParsed.value}%`,
          expected_range: "<= ±15.0%",
          remediation: "Consider higher-tier metering or acknowledge elevated uncertainty.",
        });
      }

      if (valid_to && valid_to < todayIso) {
        issues.push({
          id: `bulk-ef-${rowNum}-expired`,
          severity: "warning",
          category: "domain_rule",
          field: "valid_to",
          record_id: `row-${rowNum}`,
          record_label: label,
          message: `Factor ${code} has a past expiration date (${valid_to}).`,
          observed_value: valid_to,
          expected_range: `>= ${todayIso}`,
          remediation: "Verify validity window for current reporting period.",
        });
      }

      const errCount = issues.filter((i) => i.severity === "error").length;
      const warnCount = issues.filter((i) => i.severity === "warning").length;

      rowResults.push({
        row_index: rowNum,
        label,
        status: errCount > 0 ? "blocked" : warnCount > 0 ? "warning" : "passed",
        error_count: errCount,
        warning_count: warnCount,
        issues,
        normalized_record: {
          code,
          name,
          category,
          gas,
          source_standard,
          value: valParsed.finite ? valParsed.value : 0,
          unit,
          valid_from,
          valid_to,
          uncertainty_pct: uncParsed.present && uncParsed.finite ? uncParsed.value : 2.5,
          notes,
        },
      });
    });
  } else {
    // Standard activity / ledger engines: validate each candidate row against validateCalculationInputs
    // and against fieldTrends
    candidateRows.forEach((rawRow, idx) => {
      const rowNum = idx + 1;
      const singleReport = validateCalculationInputs(store, slug, rawRow);
      const rowIssues: ValidationIssue[] = [];

      if (singleReport) {
        // Keep issues specifically triggered by __candidate__
        for (const iss of singleReport.issues) {
          if (iss.record_id === "__candidate__") {
            rowIssues.push({
              ...iss,
              id: `bulk-r${rowNum}-${iss.field}-${rowIssues.length + 1}`,
              record_id: `row-${rowNum}`,
            });
          }
        }
      }

      // Also check every numeric field against fieldTrends[field] corridor so even moderate anomalies are highlighted
      for (const [fieldKey, trend] of Object.entries(fieldTrends)) {
        const parsed = parseNumeric(rawRow[fieldKey]);
        if (!parsed.present || !parsed.finite) continue;
        const alreadyFlagged = rowIssues.some((i) => i.field === fieldKey);
        if (alreadyFlagged) continue;

        if (parsed.value < trend.lower_bound || parsed.value > trend.upper_bound) {
          const z = trend.std > 0 ? (parsed.value - trend.mean) / trend.std : 0;
          const devPct =
            trend.mean !== 0 ? ((parsed.value - trend.mean) / Math.abs(trend.mean)) * 100 : 0;
          if (Math.abs(z) >= 2.0 || Math.abs(devPct) >= 30) {
            rowIssues.push({
              id: `bulk-r${rowNum}-trend-${fieldKey}`,
              severity: "warning",
              category: "historical_anomaly",
              field: fieldKey,
              record_id: `row-${rowNum}`,
              record_label: getRecordLabel(slug, rawRow, idx),
              message: `'${fieldKey}' (${parsed.value.toLocaleString("en-US")}) deviates ${devPct >= 0 ? "+" : ""}${round(devPct, 1)}% (${round(z, 2)}σ) from historical baseline corridor.`,
              observed_value: parsed.value.toLocaleString("en-US"),
              expected_range: `${trend.lower_bound.toLocaleString("en-US")} – ${trend.upper_bound.toLocaleString("en-US")}`,
              historical_baseline: `Mean ${trend.mean.toLocaleString("en-US")} ± ${trend.std.toLocaleString("en-US")}`,
              deviation_pct: round(devPct, 1),
              z_score: round(z, 2),
              remediation:
                "Verify measurement units and magnitude against historical facility trend before committing.",
            });
          }
        }
      }

      const errCount = rowIssues.filter((i) => i.severity === "error").length;
      const warnCount = rowIssues.filter((i) => i.severity === "warning").length;
      const label = getRecordLabel(slug, rawRow, idx);

      rowResults.push({
        row_index: rowNum,
        label,
        status: errCount > 0 ? "blocked" : warnCount > 0 ? "warning" : "passed",
        error_count: errCount,
        warning_count: warnCount,
        issues: rowIssues,
        normalized_record: rawRow,
      });
    });
  }

  // Compute cumulative batch trend impact when all non-error rows are combined with existing records
  const nonErrorCandidateRecords = rowResults
    .filter((r) => r.error_count === 0)
    .map((r, i) => ({ ...r.normalized_record, id: `__bulk_${i}__` }));

  const combinedRecords = [...state.records, ...nonErrorCandidateRecords];
  const batchTrendComparisons: TrendComparisonPoint[] = [];
  const seeds = HISTORICAL_METRICS[slug] ?? [];

  for (const seed of seeds) {
    const current = round(seed.extractCurrent(state, combinedRecords, store), 3);
    const series = [...seed.history];
    const { mean, std } = computeStats(series, seed.minRelStd ?? 0.06);
    const prevVal = series[series.length - 1] ?? mean;
    const zScore = std > 0 ? (current - mean) / std : 0;
    const deltaPct = prevVal !== 0 ? ((current - prevVal) / Math.abs(prevVal)) * 100 : 0;
    const lower = Math.max(0, round(mean - 2.2 * std, 2));
    const upper = round(mean + 2.2 * std, 2);

    let trendStatus: TrendComparisonPoint["status"] = "normal";
    if (Math.abs(zScore) >= 3.5 || Math.abs(deltaPct) >= 65) {
      trendStatus = "critical";
    } else if (Math.abs(zScore) >= 2.2 || Math.abs(deltaPct) >= 28) {
      trendStatus = "anomalous";
    }

    batchTrendComparisons.push({
      metric: seed.metric,
      unit: seed.unit,
      current_value: current,
      historical_mean: round(mean, 2),
      historical_std: round(std, 2),
      prev_run_value: round(prevVal, 2),
      delta_pct: round(deltaPct, 1),
      z_score: round(zScore, 2),
      lower_bound: lower,
      upper_bound: upper,
      status: trendStatus,
      historical_series: series.map((v) => round(v, 2)),
    });
  }

  const errorRows = rowResults.filter((r) => r.error_count > 0).length;
  const warningRows = rowResults.filter((r) => r.error_count === 0 && r.warning_count > 0).length;
  const validRows = rowResults.filter((r) => r.error_count === 0 && r.warning_count === 0).length;

  const overallStatus: ValidationStatus =
    errorRows > 0 ? "blocked" : warningRows > 0 ? "warning" : "passed";

  return {
    slug,
    checked_at: now,
    total_rows: rowResults.length,
    valid_rows: validRows,
    warning_rows: warningRows,
    error_rows: errorRows,
    status: overallStatus,
    can_commit: rowResults.length > 0 && errorRows === 0,
    requires_acknowledgment: errorRows === 0 && warningRows > 0,
    rows: rowResults,
    batch_trend_comparisons: batchTrendComparisons,
    field_trends: fieldTrends,
  };
}

