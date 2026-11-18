import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ValidationSparklineProps {
  history: number[];
  currentValue?: number | null | undefined;
  lowerBound?: number;
  upperBound?: number;
  mean?: number;
  std?: number;
  unit?: string;
  fieldLabel?: string;
  width?: number;
  height?: number;
  showBadge?: boolean;
  className?: string;
  compact?: boolean;
}

interface SparklineDataPoint {
  period: string;
  value: number;
  isCurrent: boolean;
}

export function ValidationSparkline({
  history,
  currentValue,
  lowerBound,
  upperBound,
  mean,
  std,
  unit = "",
  fieldLabel,
  width = 100,
  height = 30,
  showBadge = true,
  className,
  compact = false,
}: ValidationSparklineProps) {
  const gradientId = useId().replace(/:/g, "_");
  const [hovered, setHovered] = useState(false);

  // Compute effective baseline statistics if not explicitly passed
  const stats = useMemo(() => {
    const raw = history.filter((v) => Number.isFinite(v));
    const vals = raw.length > 0 ? raw : [100, 100];
    const computedMean =
      mean ?? vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const variance =
      vals.reduce((acc, v) => acc + (v - computedMean) ** 2, 0) /
      Math.max(1, vals.length - 1);
    const computedStd = std ?? Math.sqrt(variance);
    const effStd = Math.max(computedStd, Math.abs(computedMean) * 0.05, 0.001);

    const effLower =
      lowerBound !== undefined
        ? lowerBound
        : Math.max(0, computedMean - 2.2 * effStd);
    const effUpper =
      upperBound !== undefined
        ? upperBound
        : computedMean + 2.2 * effStd;

    return {
      history: vals,
      mean: Math.round(computedMean * 100) / 100,
      std: Math.round(effStd * 100) / 100,
      lower: Math.round(effLower * 100) / 100,
      upper: Math.round(effUpper * 100) / 100,
    };
  }, [history, mean, std, lowerBound, upperBound]);

  // Determine deviation status of current input
  const deviation = useMemo(() => {
    if (
      currentValue === undefined ||
      currentValue === null ||
      !Number.isFinite(currentValue)
    ) {
      return null;
    }
    const val = Number(currentValue);
    const isOver = val > stats.upper;
    const isUnder = val < stats.lower;
    const deltaPct =
      stats.mean !== 0 ? ((val - stats.mean) / Math.abs(stats.mean)) * 100 : 0;
    const zScore = stats.std > 0 ? (val - stats.mean) / stats.std : 0;

    let status: "normal" | "warning" | "critical" = "normal";
    if (
      Math.abs(zScore) >= 3.5 ||
      (stats.upper > 0 && val > stats.upper * 1.8)
    ) {
      status = "critical";
    } else if (
      isOver ||
      isUnder ||
      Math.abs(zScore) >= 2.0 ||
      Math.abs(deltaPct) >= 25
    ) {
      status = "warning";
    }

    return {
      value: val,
      isOver,
      isUnder,
      deltaPct: Math.round(deltaPct * 10) / 10,
      zScore: Math.round(zScore * 100) / 100,
      status,
    };
  }, [currentValue, stats]);

  // Build Recharts data array
  const { chartData, yDomain } = useMemo(() => {
    const list: SparklineDataPoint[] = stats.history.map((val, idx) => ({
      period: `T-${stats.history.length - idx}`,
      value: val,
      isCurrent: false,
    }));

    if (deviation) {
      list.push({
        period: "Current Input",
        value: deviation.value,
        isCurrent: true,
      });
    }

    const allValues = [
      ...stats.history,
      stats.lower,
      stats.upper,
      ...(deviation ? [deviation.value] : []),
    ];
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const padding = Math.max((maxVal - minVal) * 0.15, 1);
    const domainMin = Math.max(0, Math.floor(minVal - padding));
    const domainMax = Math.ceil(maxVal + padding);

    return {
      chartData: list,
      yDomain: [domainMin, domainMax] as [number, number],
    };
  }, [stats, deviation]);

  // Recharts styling & anomaly colors
  const theme = useMemo(() => {
    if (!deviation) {
      return {
        stroke: "#0284c7", // sky-600
        fill: "#0284c7",
        corridorFill: "#0284c7",
        corridorOpacity: 0.08,
        bg: "bg-sky-500/10",
        border: "border-sky-500/30",
        text: "text-sky-600 dark:text-sky-400",
      };
    }
    if (deviation.status === "critical") {
      return {
        stroke: "#f43f5e", // rose-500
        fill: "#f43f5e",
        corridorFill: "#f43f5e",
        corridorOpacity: 0.15,
        bg: "bg-rose-500/10",
        border: "border-rose-500/40",
        text: "text-rose-600 dark:text-rose-400",
      };
    }
    if (deviation.status === "warning") {
      return {
        stroke: "#f59e0b", // amber-500
        fill: "#f59e0b",
        corridorFill: "#f59e0b",
        corridorOpacity: 0.14,
        bg: "bg-amber-500/10",
        border: "border-amber-500/40",
        text: "text-amber-600 dark:text-amber-400",
      };
    }
    return {
      stroke: "#10b981", // emerald-500
      fill: "#10b981",
      corridorFill: "#10b981",
      corridorOpacity: 0.1,
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-600 dark:text-emerald-400",
    };
  }, [deviation]);

  // Custom dot renderer for Recharts Area
  const renderDot = (dotProps: {
    cx?: number;
    cy?: number;
    payload?: SparklineDataPoint;
    index?: number;
  }): React.ReactElement<SVGElement> => {
    const { cx, cy, payload, index } = dotProps;
    if (typeof cx !== "number" || typeof cy !== "number" || !payload || !payload.isCurrent) {
      return <circle key={`sparkline-empty-${index ?? 0}`} cx={0} cy={0} r={0} opacity={0} />;
    }

    const isOutlier = deviation?.status !== "normal";
    return (
      <g key={`sparkline-cur-dot-${index ?? 0}`}>
        {isOutlier && (
          <circle
            cx={cx}
            cy={cy}
            r={6}
            fill="none"
            stroke={theme.stroke}
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={3.8}
          fill={theme.stroke}
          stroke="#ffffff"
          strokeWidth={1.5}
        />
      </g>
    );
  };

  return (
    <div
      className={cn("relative inline-flex items-center gap-1.5", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Recharts Container with explicit dimensions */}
      <div
        className={cn(
          "relative overflow-hidden rounded border transition-colors select-none",
          theme.border,
          hovered ? "bg-muted/40" : "bg-card/60",
        )}
        style={{ width, height }}
      >
        <AreaChart
          width={width}
          height={height}
          data={chartData}
          margin={{ top: 2, right: 3, left: 3, bottom: 2 }}
        >
          <defs>
            <linearGradient
              id={`sparkline-grad-${gradientId}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={theme.fill} stopOpacity={0.35} />
              <stop offset="100%" stopColor={theme.fill} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis dataKey="period" hide />
          <YAxis domain={yDomain} hide />

          {/* Shaded Expected Baseline Corridor via Recharts ReferenceArea */}
          <ReferenceArea
            y1={stats.lower}
            y2={stats.upper}
            fill={theme.corridorFill}
            fillOpacity={theme.corridorOpacity}
            stroke={theme.stroke}
            strokeDasharray="2 2"
            strokeOpacity={0.35}
          />

          {/* Mean reference line */}
          <ReferenceLine
            y={stats.mean}
            stroke="#94a3b8"
            strokeDasharray="1 2"
            strokeOpacity={0.4}
          />

          {/* Main Historical Trend Curve */}
          <Area
            type="monotone"
            dataKey="value"
            stroke={theme.stroke}
            strokeWidth={1.6}
            fill={`url(#sparkline-grad-${gradientId})`}
            dot={renderDot}
            isAnimationActive={false}
          />

          <RechartsTooltip
            cursor={{ stroke: theme.stroke, strokeWidth: 1, strokeDasharray: "2 2" }}
            content={() => null}
          />
        </AreaChart>
      </div>

      {/* Outlier indicator tag next to the sparkline if deviating */}
      {showBadge && deviation && deviation.status !== "normal" && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9.5px] font-medium font-mono whitespace-nowrap",
            theme.bg,
            theme.text,
            theme.border,
            "border",
          )}
          title={`Deviation: ${deviation.deltaPct > 0 ? "+" : ""}${deviation.deltaPct}% (${deviation.zScore}σ from mean)`}
        >
          {deviation.status === "critical" ? (
            <ShieldAlert className="size-2.5 text-rose-500" />
          ) : (
            <AlertTriangle className="size-2.5 text-amber-500" />
          )}
          <span>
            {deviation.deltaPct > 0 ? "+" : ""}
            {deviation.deltaPct}%
          </span>
        </span>
      )}

      {/* Interactive Tooltip Card on Hover */}
      {hovered && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 w-64 rounded-md border border-border bg-popover p-2.5 text-popover-foreground shadow-xl text-xs pointer-events-none animate-in fade-in-0 zoom-in-95"
          style={{ minWidth: compact ? "200px" : "240px" }}
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-1.5 mb-1.5">
            <span className="font-semibold text-[11px] truncate">
              {fieldLabel ? `${fieldLabel} Trend` : "Historical Baseline Trend"}
            </span>
            {deviation ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[9px] font-medium",
                  theme.bg,
                  theme.text,
                )}
              >
                {deviation.status === "normal" && (
                  <CheckCircle2 className="size-2.5" />
                )}
                {deviation.status === "warning" && (
                  <AlertTriangle className="size-2.5" />
                )}
                {deviation.status === "critical" && (
                  <ShieldAlert className="size-2.5" />
                )}
                {deviation.status === "normal"
                  ? "In Range"
                  : deviation.status === "warning"
                    ? "Anomaly"
                    : "Outlier"}
              </span>
            ) : (
              <span className="text-[9.5px] text-muted-foreground font-mono">
                {stats.history.length} periods
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10.5px]">
            <div>
              <span className="text-muted-foreground block text-[9px] font-sans">
                Expected Corridor
              </span>
              <span className="font-semibold text-foreground">
                {stats.lower.toLocaleString()} – {stats.upper.toLocaleString()}{" "}
                {unit}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] font-sans">
                Historical Mean (±σ)
              </span>
              <span className="text-foreground">
                {stats.mean.toLocaleString()} (±{stats.std.toLocaleString()})
              </span>
            </div>
            {deviation && (
              <>
                <div>
                  <span className="text-muted-foreground block text-[9px] font-sans">
                    Current Input
                  </span>
                  <span className={cn("font-bold", theme.text)}>
                    {deviation.value.toLocaleString()} {unit}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[9px] font-sans">
                    Statistical Deviation
                  </span>
                  <span className={cn("font-medium", theme.text)}>
                    {deviation.deltaPct > 0 ? "+" : ""}
                    {deviation.deltaPct}% ({deviation.zScore}σ)
                  </span>
                </div>
              </>
            )}
          </div>

          {deviation && deviation.status !== "normal" && (
            <div
              className={cn(
                "mt-2 rounded p-1.5 text-[9.5px] border leading-tight",
                theme.bg,
                theme.border,
                theme.text,
              )}
            >
              <strong>
                {deviation.status === "critical"
                  ? "Extreme Anomaly Detected: "
                  : "Trend Deviation Warning: "}
              </strong>
              Value deviates by {Math.abs(deviation.deltaPct)}% from historical
              baseline ($[ {stats.lower.toLocaleString()}, {stats.upper.toLocaleString()} ]$).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
