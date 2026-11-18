import type { EsgReport } from "@/api/reports";
import { EmptyNote } from "@/components/system/panels";
import { extractReportSubreportData } from "@/lib/report-charts";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = [
  "#16a34a",
  "#0284c7",
  "#d97706",
  "#7c3aed",
  "#0d9488",
  "#dc2626",
] as const;

export function ReportSubreport({
  report,
  dir = "rtl",
  printMode = false,
}: {
  report: EsgReport;
  dir?: "rtl" | "ltr";
  printMode?: boolean;
}) {
  const data = useMemo(() => extractReportSubreportData(report), [report]);

  const cardCls = cn(
    "rounded-lg border p-3.5",
    printMode
      ? "border-zinc-200 bg-white text-zinc-900"
      : "border-border bg-background/80 text-foreground",
  );
  const subLabelCls = printMode ? "text-zinc-500" : "text-muted-foreground";
  const gridStroke = printMode ? "#e4e4e7" : "var(--border)";
  const tickColor = printMode ? "#52525b" : "var(--muted-foreground)";

  const waterFlowChartData = useMemo(
    () =>
      data.resourceFlows.flatMap((flow) => [
        { name: "Total Water", value: flow.total, unit: flow.unit },
        { name: flow.secondaryLabel, value: flow.secondary, unit: flow.unit },
      ]),
    [data.resourceFlows],
  );

  const extractedChartData = useMemo(
    () =>
      data.extractedMetrics.slice(0, 10).map((m) => ({
        name:
          m.label.length > 26 ? `${m.label.slice(0, 24).trim()}…` : m.label,
        value: m.value,
        unit: m.unit,
      })),
    [data.extractedMetrics],
  );

  const hasAnyChart =
    data.energyMix.length > 0 ||
    data.ghgBreakdown.length > 0 ||
    data.emissionsComparison.length > 0 ||
    waterFlowChartData.length > 0 ||
    data.wasteBreakdown.length > 0 ||
    data.workforceGender.length > 0 ||
    data.ageDistribution.length > 0 ||
    extractedChartData.length > 0;

  return (
    <div dir={dir} className="space-y-4">
      <div
        data-pdf-block
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2.5",
          printMode
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-border bg-muted/35",
        )}
      >
        <div className="flex items-center gap-2">
          <BarChart3
            className={cn(
              "size-4 shrink-0",
              printMode ? "text-emerald-700" : "text-[var(--term-ok)]",
            )}
          />
          <div>
            <div className="text-[13px] font-semibold">
              زیرگزارش تحلیلی و نموداری (Visual Subreport)
            </div>
            <div className={cn("text-[11px]", subLabelCls)}>
              استخراج خودکار شاخص‌های عددی و مصورسازی داده‌های گزارش
            </div>
          </div>
        </div>
        <span
          className={cn(
            "rounded border px-2 py-0.5 font-mono text-[10.5px]",
            printMode
              ? "border-zinc-300 bg-white text-zinc-700"
              : "border-border bg-background text-muted-foreground",
          )}
        >
          {data.kpis.length} KPIs · {data.chartCount} Charts
        </span>
      </div>

      {data.kpis.length > 0 && (
        <div
          data-pdf-block
          className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {data.kpis.map((kpi) => (
            <div
              key={kpi.id}
              className={cn(
                "rounded-md border px-3 py-2.5",
                printMode
                  ? "border-zinc-200 bg-zinc-50/70"
                  : "border-border bg-card",
              )}
            >
              <div className={cn("text-[11px]", subLabelCls)}>{kpi.label}</div>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                <span className="text-lg font-bold tabular-nums">
                  {kpi.formatted}
                </span>
                {kpi.unit && (
                  <span className={cn("text-[11px]", subLabelCls)}>
                    {kpi.unit}
                  </span>
                )}
              </div>
              {kpi.subtext && (
                <div className={cn("mt-0.5 text-[10.5px]", subLabelCls)}>
                  {kpi.subtext}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!hasAnyChart ? (
        <EmptyNote>
          داده عددی قابل ترسیم در متن یا متادیتای این گزارش یافت نشد.
        </EmptyNote>
      ) : (
        <div
          className={cn(
            "grid gap-4",
            printMode ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2",
          )}
        >
          {data.energyMix.length > 0 && (
            <div data-pdf-block className={cardCls}>
              <div className="mb-1 text-[12.5px] font-semibold">
                ترکیب منابع مصرف انرژی (Energy Mix · MWh)
              </div>
              <div className={cn("mb-2 text-[11px]", subLabelCls)}>
                سهم انرژی خورشیدی، برق شبکه و سایر منابع
              </div>
              <div className={printMode ? "flex justify-center" : "h-56 w-full"}>
                {printMode ? (
                  <PieChart width={640} height={210}>
                    <Pie
                      data={data.energyMix}
                      dataKey="value"
                      nameKey="name"
                      cx="38%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={78}
                      paddingAngle={2}
                      isAnimationActive={false}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {data.energyMix.map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Legend
                      layout="vertical"
                      verticalAlign="middle"
                      align="right"
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                  </PieChart>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.energyMix}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={74}
                        paddingAngle={2}
                        isAnimationActive={false}
                      >
                        {data.energyMix.map((entry, idx) => (
                          <Cell
                            key={entry.name}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [
                          `${value.toLocaleString()} MWh`,
                          "Energy",
                        ]}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {(data.ghgBreakdown.length > 0 || data.emissionsComparison.length > 0) && (
            <div data-pdf-block className={cardCls}>
              <div className="mb-1 text-[12.5px] font-semibold">
                {data.ghgBreakdown.length > 0
                  ? "تفکیک انتشار گازهای گلخانه‌ای (GHG · t)"
                  : "مقایسه انتشار CO2 با خط پایه (tCO2e)"}
              </div>
              <div className={cn("mb-2 text-[11px]", subLabelCls)}>
                {data.ghgBreakdown.length > 0
                  ? "مقایسه حجم انتشار به تفکیک نوع گاز"
                  : "روند تغییرات انتشار نسبت به دوره پایه"}
              </div>
              <div className={printMode ? "flex justify-center" : "h-56 w-full"}>
                {printMode ? (
                  <BarChart
                    width={640}
                    height={210}
                    data={
                      data.ghgBreakdown.length > 0
                        ? data.ghgBreakdown
                        : data.emissionsComparison
                    }
                    margin={{ top: 10, right: 20, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={gridStroke}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: tickColor }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10.5, fill: tickColor }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Bar
                      dataKey="value"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    >
                      {(data.ghgBreakdown.length > 0
                        ? data.ghgBreakdown
                        : data.emissionsComparison
                      ).map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        data.ghgBreakdown.length > 0
                          ? data.ghgBreakdown
                          : data.emissionsComparison
                      }
                      margin={{ top: 10, right: 16, left: -8, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridStroke}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: tickColor }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: tickColor }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          `${value.toLocaleString()} t`,
                          "Emissions",
                        ]}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <Bar
                        dataKey="value"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      >
                        {(data.ghgBreakdown.length > 0
                          ? data.ghgBreakdown
                          : data.emissionsComparison
                        ).map((entry, idx) => (
                          <Cell
                            key={entry.name}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {(waterFlowChartData.length > 0 || data.wasteBreakdown.length > 0) && (
            <div data-pdf-block className={cardCls}>
              <div className="mb-1 text-[12.5px] font-semibold">
                {data.wasteBreakdown.length > 0
                  ? "تفکیک مدیریت پسماند (Waste · tonnes)"
                  : "مصرف و بازچرخانی آب (Water · m³)"}
              </div>
              <div className={cn("mb-2 text-[11px]", subLabelCls)}>
                {data.wasteBreakdown.length > 0
                  ? "مقایسه پسماند غیرخطرناک، قابل بازیافت و خطرناک"
                  : "نسبت آب بازچرخانی‌شده به کل مصرف"}
              </div>
              <div className={printMode ? "flex justify-center" : "h-56 w-full"}>
                {printMode ? (
                  <BarChart
                    width={640}
                    height={210}
                    data={
                      data.wasteBreakdown.length > 0
                        ? data.wasteBreakdown
                        : waterFlowChartData
                    }
                    margin={{ top: 10, right: 20, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={gridStroke}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10.5, fill: tickColor }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10.5, fill: tickColor }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Bar
                      dataKey="value"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    >
                      {(data.wasteBreakdown.length > 0
                        ? data.wasteBreakdown
                        : waterFlowChartData
                      ).map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        data.wasteBreakdown.length > 0
                          ? data.wasteBreakdown
                          : waterFlowChartData
                      }
                      margin={{ top: 10, right: 16, left: -8, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridStroke}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10.5, fill: tickColor }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: tickColor }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          value.toLocaleString(),
                          data.wasteBreakdown.length > 0 ? "Tonnes" : "m³",
                        ]}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <Bar
                        dataKey="value"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      >
                        {(data.wasteBreakdown.length > 0
                          ? data.wasteBreakdown
                          : waterFlowChartData
                        ).map((entry, idx) => (
                          <Cell
                            key={entry.name}
                            fill={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {(data.workforceGender.length > 0 || data.ageDistribution.length > 0) && (
            <div data-pdf-block className={cardCls}>
              <div className="mb-1 text-[12.5px] font-semibold">
                {data.workforceGender.length > 0
                  ? "ترکیب سرمایه انسانی (Workforce Demographics)"
                  : "توزیع سنی کارکنان (Age Distribution)"}
              </div>
              <div className={cn("mb-2 text-[11px]", subLabelCls)}>
                شاخص‌های اجتماعی و تنوع نیروی کار (نفر)
              </div>
              <div className={printMode ? "flex justify-center" : "h-56 w-full"}>
                {printMode ? (
                  <BarChart
                    width={640}
                    height={210}
                    data={
                      data.workforceGender.length > 0
                        ? data.workforceGender
                        : data.ageDistribution
                    }
                    margin={{ top: 10, right: 20, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={gridStroke}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: tickColor }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10.5, fill: tickColor }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Bar
                      dataKey="value"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    >
                      {(data.workforceGender.length > 0
                        ? data.workforceGender
                        : data.ageDistribution
                      ).map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={CHART_COLORS[(idx + 2) % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        data.workforceGender.length > 0
                          ? data.workforceGender
                          : data.ageDistribution
                      }
                      margin={{ top: 10, right: 16, left: -8, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridStroke}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: tickColor }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: tickColor }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          `${value.toLocaleString()} نفر`,
                          "Headcount",
                        ]}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <Bar
                        dataKey="value"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      >
                        {(data.workforceGender.length > 0
                          ? data.workforceGender
                          : data.ageDistribution
                        ).map((entry, idx) => (
                          <Cell
                            key={entry.name}
                            fill={CHART_COLORS[(idx + 2) % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {extractedChartData.length > 0 && (
            <div
              data-pdf-block
              className={cn(
                cardCls,
                !printMode && "xl:col-span-2",
              )}
            >
              <div className="mb-1 text-[12.5px] font-semibold">
                مقادیر عددی استخراج‌شده از متن گزارش (Extracted Report Figures)
              </div>
              <div className={cn("mb-2 text-[11px]", subLabelCls)}>
                تحلیل خودکار اعداد و شاخص‌های کمی مندرج در متن گزارش
              </div>
              <div className={printMode ? "flex justify-center" : "h-64 w-full"}>
                {printMode ? (
                  <BarChart
                    width={640}
                    height={230}
                    data={extractedChartData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 20, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={gridStroke}
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: tickColor }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={175}
                      tick={{ fontSize: 10, fill: tickColor }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Bar
                      dataKey="value"
                      fill="#0284c7"
                      radius={[0, 4, 4, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={extractedChartData}
                      layout="vertical"
                      margin={{ top: 4, right: 20, left: 16, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridStroke}
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: tickColor }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={175}
                        tick={{ fontSize: 10.5, fill: tickColor }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(
                          value: number,
                          name: string,
                          item: { payload?: { unit?: string } },
                        ) => [
                          `${value.toLocaleString()}${item?.payload?.unit ? ` ${item.payload.unit}` : ""}`,
                          item?.payload?.unit ? "Value" : name,
                        ]}
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          borderColor: "var(--border)",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <Bar
                        dataKey="value"
                        fill="#0284c7"
                        radius={[0, 4, 4, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
