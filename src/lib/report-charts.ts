import type { EsgReport, ReportMetricsSnapshot } from "@/api/reports";

export interface ReportKpiItem {
  id: string;
  label: string;
  value: number;
  formatted: string;
  unit: string;
  pillar: "environmental" | "social" | "general";
  subtext?: string;
}

export interface ChartDatum {
  name: string;
  value: number;
  unit?: string;
  sharePct?: number;
}

export interface ExtractedTextMetric {
  id: string;
  label: string;
  value: number;
  formatted: string;
  unit: string;
  category: string;
}

export interface ReportSubreportData {
  kpis: ReportKpiItem[];
  energyMix: ChartDatum[];
  ghgBreakdown: ChartDatum[];
  resourceFlows: Array<{
    name: string;
    total: number;
    secondary: number;
    secondaryLabel: string;
    unit: string;
  }>;
  wasteBreakdown: ChartDatum[];
  workforceGender: ChartDatum[];
  ageDistribution: ChartDatum[];
  emissionsComparison: ChartDatum[];
  extractedMetrics: ExtractedTextMetric[];
  chartCount: number;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx !== -1) {
      out += String(aIdx);
      continue;
    }
    if (ch === "٬") {
      out += ",";
      continue;
    }
    if (ch === "٫") {
      out += ".";
      continue;
    }
    out += ch;
  }
  return out;
}

function parseNumericToken(raw: string): number | null {
  const cleaned = normalizeDigits(raw)
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function inferUnitFromContext(text: string): string {
  const norm = normalizeDigits(text).toLowerCase();
  if (/tco2e|معادل\s*co2|تن/.test(norm)) return "t";
  if (/mwh|مگاوات/.test(norm)) return "MWh";
  if (/kwh|کیلووات/.test(norm)) return "kWh";
  if (/m3|متر\s*مکعب|مترمکعب/.test(norm)) return "m³";
  if (/نفر|employee|headcount|staff/.test(norm)) return "نفر";
  if (/%|درصد|percent/.test(norm)) return "%";
  if (/\$|usd|eur|ریال|تومان/.test(norm)) return "$";
  if (/hours|ساعت/.test(norm)) return "h";
  return "";
}

function isLikelyYearOrIndex(num: number, line: string, indexInLine: number): boolean {
  if (Number.isInteger(num) && num >= 1900 && num <= 2100) {
    const before = line.slice(Math.max(0, indexInLine - 16), indexInLine);
    if (/(سال|دوره|year|fy|–|-|از|تا|\/)/i.test(before) || indexInLine === 0) {
      return true;
    }
  }
  if (Number.isInteger(num) && num >= 1380 && num <= 1450) {
    const before = line.slice(Math.max(0, indexInLine - 12), indexInLine);
    if (/(سال|دوره|year|\/)/i.test(before)) return true;
  }
  return false;
}

function cleanLabel(raw: string): string {
  return raw
    .replace(/^[-*•\d.)\s#]+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/[:：]+$/, "")
    .trim();
}

export function extractMetricsFromText(body: string): ExtractedTextMetric[] {
  const results: ExtractedTextMetric[] = [];
  const seen = new Set<string>();
  const lines = body.split(/\r?\n/);

  let currentSection = "General";

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (/^#{1,4}\s+/.test(trimmed)) {
      currentSection = cleanLabel(trimmed);
      continue;
    }

    // Skip metadata banner or citation line markers like "(خط 12-18)"
    if (/^\*\*نوع گزارش:\*\*/.test(trimmed) || /^\*\*بازه زمانی:\*\*/.test(trimmed)) {
      continue;
    }

    const normLine = normalizeDigits(trimmed);

    // 1) Look for explicit "Label: Value [Unit]" or "**Label:** Value [Unit]"
    const kvMatch = trimmed.match(/^(?:[-*•]\s*)?(?:\*\*)?([^:*\n]+?)(?:\*\*)?\s*[:：]\s*(.+)$/);
    if (kvMatch) {
      const label = cleanLabel(kvMatch[1]);
      const rhs = kvMatch[2];
      const rhsNorm = normalizeDigits(rhs);
      const firstNumMatch = rhsNorm.match(/(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)/);
      if (firstNumMatch && label.length >= 2 && label.length <= 60) {
        const val = parseNumericToken(firstNumMatch[1]);
        const idx = firstNumMatch.index ?? 0;
        if (val !== null && !isLikelyYearOrIndex(val, rhsNorm, idx)) {
          const afterNum = rhs.slice(idx + firstNumMatch[0].length, idx + firstNumMatch[0].length + 28);
          const unit = inferUnitFromContext(afterNum) || inferUnitFromContext(rhs);
          const key = `${label.toLowerCase()}::${val}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              id: `txt-${results.length}`,
              label,
              value: val,
              formatted: formatNumber(val),
              unit,
              category: currentSection,
            });
          }
        }
      }

      // 2) Also scan parenthetical / comma-separated sub-items inside the same line
      // e.g. "(خورشیدی ۳٬۲۰۰، برق شبکه ۸٬۹۰۰، دیزل ۱٬۱۰۰)" or "CO2 برابر ۱۱٬۸۰۰ تن، CH4 برابر ۴۲۰.۳ تن"
      const parenMatches = rhs.matchAll(/\(([^)]+)\)/g);
      for (const pm of parenMatches) {
        const inner = pm[1];
        const parts = inner.split(/[،,؛;]/);
        for (const part of parts) {
          const partNorm = normalizeDigits(part).trim();
          const numMatch = partNorm.match(/(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)/);
          if (!numMatch) continue;
          const val = parseNumericToken(numMatch[1]);
          if (val === null || isLikelyYearOrIndex(val, partNorm, numMatch.index ?? 0)) continue;
          const labelPart = partNorm
            .replace(numMatch[0], " ")
            .replace(/\b(برابر|معادل|مجموع|کل|نسبت به|در مقایسه با|سال قبل|دوره قبل)\b/g, " ")
            .replace(/(تن|مگاوات‌ساعت|مترمکعب|نفر|درصد|%)/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (labelPart.length >= 2 && labelPart.length <= 40 && !/^(رشد|کاهش|افزایش|تحت)/.test(labelPart)) {
            const unit = inferUnitFromContext(part) || inferUnitFromContext(rhs);
            const subLabel = `${labelPart}`;
            const key = `${subLabel.toLowerCase()}::${val}`;
            if (!seen.has(key)) {
              seen.add(key);
              results.push({
                id: `txt-${results.length}`,
                label: subLabel,
                value: val,
                formatted: formatNumber(val),
                unit,
                category: label,
              });
            }
          }
        }
      }
      continue;
    }

    // 3) Free-text sentence fallback (e.g., "در سال 2024 مجموع انتشار CO2 به 12540.5 تن رسید")
    const numMatches = normLine.matchAll(/(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)/g);
    for (const nm of numMatches) {
      const idx = nm.index ?? 0;
      const val = parseNumericToken(nm[1]);
      if (val === null || isLikelyYearOrIndex(val, normLine, idx)) continue;
      // Ignore bullet numbers at line start like "1. "
      if (/^\d+\./.test(normLine.slice(idx))) continue;
      const beforeWords = normLine
        .slice(Math.max(0, idx - 36), idx)
        .replace(/[*`#]/g, "")
        .trim()
        .split(/\s+/)
        .slice(-4)
        .join(" ");
      const afterSlice = normLine.slice(idx + nm[0].length, idx + nm[0].length + 24);
      const unit = inferUnitFromContext(afterSlice);
      const label = cleanLabel(beforeWords || currentSection);
      if (label.length < 2) continue;
      const key = `${label.toLowerCase()}::${val}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          id: `txt-${results.length}`,
          label,
          value: val,
          formatted: formatNumber(val),
          unit,
          category: currentSection,
        });
      }
    }
  }

  return results;
}

function parseAgeBreakdownFromBody(body: string): ChartDatum[] {
  const norm = normalizeDigits(body);
  const ageLine = norm
    .split(/\r?\n/)
    .find((l) => /تنوع سنی|age/i.test(l));
  if (!ageLine) return [];

  const items: ChartDatum[] = [];
  const underMatch = ageLine.match(/(\d+(?:,\d+)?)\s*نفر\s*زیر\s*30/);
  const midMatch = ageLine.match(/(\d+(?:,\d+)?)\s*نفر\s*30\s*تا\s*50/);
  const overMatch = ageLine.match(/(\d+(?:,\d+)?)\s*نفر\s*بالای\s*50/);

  if (underMatch) {
    const v = parseNumericToken(underMatch[1]);
    if (v !== null) items.push({ name: "< 30 yrs", value: v, unit: "نفر" });
  }
  if (midMatch) {
    const v = parseNumericToken(midMatch[1]);
    if (v !== null) items.push({ name: "30–50 yrs", value: v, unit: "نفر" });
  }
  if (overMatch) {
    const v = parseNumericToken(overMatch[1]);
    if (v !== null) items.push({ name: "> 50 yrs", value: v, unit: "نفر" });
  }
  return items;
}

function parseGhgFromBody(body: string): ChartDatum[] {
  const norm = normalizeDigits(body);
  const ghgLine = norm
    .split(/\r?\n/)
    .find((l) => /گازهای گلخانه‌ای|ghg/i.test(l));
  if (!ghgLine) return [];

  const matches = Array.from(
    ghgLine.matchAll(/(CO2|CH4|N2O|SF6|HFCs)\s*(?:برابر|=|:)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/gi),
  );
  return matches
    .map((m) => {
      const val = parseNumericToken(m[2]);
      return val !== null ? { name: m[1].toUpperCase(), value: val, unit: "t" } : null;
    })
    .filter((item): item is { name: string; value: number; unit: string } => item !== null);
}

function parseEnergyFromBody(body: string): ChartDatum[] {
  const norm = normalizeDigits(body);
  const energyLine = norm
    .split(/\r?\n/)
    .find((l) => /مصرف انرژی|energy/i.test(l));
  if (!energyLine) return [];

  const paren = energyLine.match(/\(([^)]+)\)/);
  if (!paren) return [];

  const parts = paren[1].split(/[،,]/);
  const rawItems: Array<{ name: string; value: number }> = [];
  for (const p of parts) {
    const m = p.match(/([^\d]+?)\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
    if (!m) continue;
    const val = parseNumericToken(m[2]);
    if (val === null) continue;
    rawItems.push({ name: m[1].trim(), value: val });
  }
  const sum = rawItems.reduce((a, b) => a + b.value, 0);
  return rawItems.map((item) => ({
    name: item.name,
    value: item.value,
    unit: "MWh",
    sharePct: sum > 0 ? Math.round((item.value / sum) * 1000) / 10 : 0,
  }));
}

export function extractReportSubreportData(report: EsgReport): ReportSubreportData {
  const snap = report.metadata?.metrics_snapshot as ReportMetricsSnapshot | undefined;
  const extractedMetrics = extractMetricsFromText(report.body);

  const kpis: ReportKpiItem[] = [];
  let energyMix: ChartDatum[] = [];
  let ghgBreakdown: ChartDatum[] = [];
  const resourceFlows: ReportSubreportData["resourceFlows"] = [];
  let wasteBreakdown: ChartDatum[] = [];
  let workforceGender: ChartDatum[] = [];
  const ageDistribution = parseAgeBreakdownFromBody(report.body);
  const emissionsComparison: ChartDatum[] = [];

  if (snap?.environmental) {
    const env = snap.environmental;
    if (typeof env.co2_emissions_tco2e === "number") {
      kpis.push({
        id: "kpi-co2",
        label: "انتشار کل CO2",
        value: env.co2_emissions_tco2e,
        formatted: formatNumber(env.co2_emissions_tco2e),
        unit: "tCO2e",
        pillar: "environmental",
        subtext: "Baseline 2023: 14,200 tCO2e",
      });
      emissionsComparison.push(
        { name: "2023 Baseline", value: 14200, unit: "tCO2e" },
        { name: "Current Period", value: env.co2_emissions_tco2e, unit: "tCO2e" },
      );
    }

    if (env.ghg_breakdown && env.ghg_breakdown.length > 0) {
      ghgBreakdown = env.ghg_breakdown.map((g) => ({
        name: g.gas,
        value: g.value,
        unit: "t",
      }));
    }

    if (env.energy_consumption_mwh) {
      const total = env.energy_consumption_mwh.total ?? 0;
      const bySource = env.energy_consumption_mwh.by_source ?? {};
      const entries = Object.entries(bySource);
      const sum = entries.reduce((acc, [, v]) => acc + v, 0) || total;
      energyMix = entries.map(([name, value]) => ({
        name,
        value,
        unit: "MWh",
        sharePct: sum > 0 ? Math.round((value / sum) * 1000) / 10 : 0,
      }));
      const solar = entries.find(([k]) => /solar|خورشیدی/i.test(k))?.[1] ?? 0;
      kpis.push({
        id: "kpi-energy",
        label: "مصرف انرژی کل",
        value: total,
        formatted: formatNumber(total),
        unit: "MWh",
        pillar: "environmental",
        subtext:
          total > 0 && solar > 0
            ? `${Math.round((solar / total) * 1000) / 10}% تجدیدپذیر`
            : undefined,
      });
    }

    if (env.water_consumption_m3) {
      const total = env.water_consumption_m3.total ?? 0;
      const reused = env.water_consumption_m3.reused ?? 0;
      kpis.push({
        id: "kpi-water",
        label: "مصرف آب",
        value: total,
        formatted: formatNumber(total),
        unit: "m³",
        pillar: "environmental",
        subtext: `بازچرخانی: ${formatNumber(reused)} m³`,
      });
      resourceFlows.push({
        name: "Water (m³)",
        total,
        secondary: reused,
        secondaryLabel: "Reused / Recycled",
        unit: "m³",
      });
    }

    if (env.waste_tonnes) {
      const total = env.waste_tonnes.total ?? 0;
      const byType = env.waste_tonnes.by_type ?? {};
      const entries = Object.entries(byType);
      const sum = entries.reduce((acc, [, v]) => acc + v, 0) || total;
      wasteBreakdown = entries.map(([name, value]) => ({
        name,
        value,
        unit: "t",
        sharePct: sum > 0 ? Math.round((value / sum) * 1000) / 10 : 0,
      }));
      kpis.push({
        id: "kpi-waste",
        label: "پسماند کل",
        value: total,
        formatted: formatNumber(total),
        unit: "t",
        pillar: "environmental",
      });
    }
  }

  if (snap?.social) {
    const soc = snap.social;
    if (typeof soc.total_employees === "number") {
      kpis.push({
        id: "kpi-employees",
        label: "تعداد کل کارکنان",
        value: soc.total_employees,
        formatted: formatNumber(soc.total_employees),
        unit: "نفر",
        pillar: "social",
        subtext:
          typeof soc.hiring_numbers === "number"
            ? `استخدام جدید: ${formatNumber(soc.hiring_numbers)} نفر`
            : undefined,
      });
    }
    if (soc.gender) {
      workforceGender = Object.entries(soc.gender).map(([name, value]) => ({
        name,
        value,
        unit: "نفر",
      }));
    }
  }

  // Fill from body text if structured snapshot omitted any series
  if (ghgBreakdown.length === 0) {
    ghgBreakdown = parseGhgFromBody(report.body);
  }
  if (energyMix.length === 0) {
    energyMix = parseEnergyFromBody(report.body);
  }

  // If custom manual report had no structured snapshot, synthesize KPIs from extracted text numbers
  if (kpis.length === 0 && extractedMetrics.length > 0) {
    for (const m of extractedMetrics.slice(0, 6)) {
      kpis.push({
        id: m.id,
        label: m.label,
        value: m.value,
        formatted: m.formatted,
        unit: m.unit,
        pillar: "general",
        subtext: m.category !== "General" ? m.category : undefined,
      });
    }
  }

  let chartCount = 0;
  if (energyMix.length > 0) chartCount += 1;
  if (ghgBreakdown.length > 0 || emissionsComparison.length > 0) chartCount += 1;
  if (resourceFlows.length > 0 || wasteBreakdown.length > 0) chartCount += 1;
  if (workforceGender.length > 0 || ageDistribution.length > 0) chartCount += 1;
  if (extractedMetrics.length > 0) chartCount += 1;

  return {
    kpis,
    energyMix,
    ghgBreakdown,
    resourceFlows,
    wasteBreakdown,
    workforceGender,
    ageDistribution,
    emissionsComparison,
    extractedMetrics,
    chartCount,
  };
}
