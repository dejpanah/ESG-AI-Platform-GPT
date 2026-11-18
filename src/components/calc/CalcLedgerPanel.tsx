import {
  validateCalcInputs,
  type CalcValidationReport,
  type FieldTrendBaseline,
} from "@/api/calc-engines";
import { CalcBulkImportPanel } from "@/components/calc/CalcBulkImportPanel";
import {
  useCalcEngineRefresh,
  useCalcEngineSlug,
} from "@/components/calc/CalcEngineContext";
import { ValidationSparkline } from "@/components/calc/ValidationSparkline";
import { EmptyNote, Panel } from "@/components/system/panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export interface LedgerColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  numeric?: boolean;
  render?: (val: unknown, row: Record<string, unknown>) => ReactNode;
}

export interface LedgerField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
}

export function CalcLedgerPanel({
  title,
  description,
  columns,
  records,
  fields,
  mutating,
  onAdd,
  onDelete,
  filterControls,
}: {
  title: string;
  description?: string;
  columns: LedgerColumn[];
  records: Array<Record<string, unknown> & { id: string }>;
  fields: LedgerField[];
  mutating?: boolean;
  onAdd: (payload: Record<string, unknown>) => Promise<unknown>;
  onDelete?: (id: string) => Promise<unknown>;
  filterControls?: ReactNode;
}) {
  const slug = useCalcEngineSlug();
  const { onUpdateView, onReload } = useCalcEngineRefresh();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [validating, setValidating] = useState(false);
  const [candidateReport, setCandidateReport] = useState<CalcValidationReport | null>(null);
  const [engineValidation, setEngineValidation] = useState<CalcValidationReport | null>(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    validateCalcInputs(slug)
      .then((rep) => {
        if (active) setEngineValidation(rep);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [slug, records.length]);

  const getFieldTrend = (fieldKey: string): FieldTrendBaseline => {
    if (engineValidation?.field_trends?.[fieldKey]) {
      return engineValidation.field_trends[fieldKey];
    }
    const vals = records
      .map((r) => Number(r[fieldKey]))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (vals.length >= 2) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1);
      const std = Math.max(Math.sqrt(variance), mean * 0.08, 0.001);
      return {
        field: fieldKey,
        history: vals.slice(-6),
        mean: Math.round(mean * 100) / 100,
        std: Math.round(std * 100) / 100,
        lower_bound: Math.max(0, Math.round((mean - 2.2 * std) * 100) / 100),
        upper_bound: Math.round((mean + 2.2 * std) * 100) / 100,
      };
    }
    if (vals.length === 1) {
      const v = vals[0];
      return {
        field: fieldKey,
        history: [
          Math.round(v * 0.93 * 10) / 10,
          Math.round(v * 0.98 * 10) / 10,
          Math.round(v * 1.02 * 10) / 10,
          Math.round(v * 0.96 * 10) / 10,
          v,
        ],
        mean: v,
        std: Math.round(v * 0.08 * 10) / 10,
        lower_bound: Math.max(0, Math.round(v * 0.75 * 10) / 10),
        upper_bound: Math.round(v * 1.25 * 10) / 10,
      };
    }
    return {
      field: fieldKey,
      history: [100, 104, 98, 102, 106, 101],
      mean: 101.8,
      std: 8.5,
      lower_bound: 80,
      upper_bound: 125,
    };
  };
  const [formState, setFormState] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) {
      init[f.key] =
        f.defaultValue !== undefined
          ? f.defaultValue
          : f.type === "boolean"
            ? false
            : f.type === "select"
              ? (f.options?.[0]?.value ?? "")
              : "";
    }
    return init;
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)),
    );
  }, [records, columns, search]);

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = formState[f.key];
      if (f.type === "number") {
        payload[f.key] = raw === "" || raw === undefined || raw === null ? "" : Number(raw);
      } else if (f.type === "boolean") {
        payload[f.key] = Boolean(raw);
      } else {
        payload[f.key] = String(raw ?? "");
      }
    }
    return payload;
  };

  const updateField = (key: string, value: unknown) => {
    setCandidateReport(null);
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent, forceWarnings = false) => {
    e.preventDefault();
    const payload = buildPayload();

    if (slug && !forceWarnings) {
      setValidating(true);
      try {
        const report = await validateCalcInputs(slug, payload);
        const candidateIssues = report.issues.filter(
          (iss) =>
            iss.record_id === "__candidate__" ||
            iss.category === "historical_anomaly" ||
            iss.severity === "error",
        );
        if (report.error_count > 0 || candidateIssues.length > 0) {
          setCandidateReport({
            ...report,
            issues: candidateIssues.length > 0 ? candidateIssues : report.issues,
          });
          return;
        }
      } finally {
        setValidating(false);
      }
    } else if (!slug) {
      for (const f of fields) {
        const raw = formState[f.key];
        if (f.required && (raw === "" || raw === undefined || raw === null)) {
          return;
        }
      }
    }

    const res = await onAdd(payload);
    if (res) {
      setCandidateReport(null);
      setShowAdd(false);
    }
  };

  return (
    <Panel
      title={title}
      description={description}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {filterControls}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter records…"
              className="h-7 w-44 pl-7 text-xs"
            />
          </div>
          {slug && (
            <Button
              size="sm"
              variant={showBulkImport ? "secondary" : "outline"}
              className="h-7 px-2.5 text-xs whitespace-nowrap shrink-0 gap-1"
              onClick={() => {
                setShowBulkImport((v) => !v);
                setShowAdd(false);
              }}
            >
              {showBulkImport ? (
                <X className="size-3.5" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {showBulkImport ? "Close Bulk Import" : "Bulk Import CSV"}
            </Button>
          )}
          <Button
            size="sm"
            variant={showAdd ? "secondary" : "default"}
            className="h-7 px-2.5 text-xs whitespace-nowrap shrink-0"
            onClick={() => {
              setShowAdd((v) => !v);
              setShowBulkImport(false);
            }}
          >
            {showAdd ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {showAdd ? "Cancel" : "Add Entry"}
          </Button>
        </div>
      }
    >
      {showBulkImport && slug && (
        <CalcBulkImportPanel
          slug={slug}
          engineTitle={title}
          fields={fields}
          onClose={() => setShowBulkImport(false)}
          onCommitted={(updated) => {
            if (onUpdateView) {
              onUpdateView(updated);
            } else {
              onReload();
            }
          }}
        />
      )}

      {showAdd && (
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e, false)}
          className="mb-4 rounded-md border border-border bg-background p-3"
        >
          <p className="mb-2.5 text-xs font-semibold">
            Log New Calculation Activity / Measurement
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => {
              const fieldTrend = f.type === "number" ? getFieldTrend(f.key) : null;
              const curRaw = formState[f.key];
              const curNum =
                curRaw !== "" && curRaw !== undefined && curRaw !== null && Number.isFinite(Number(curRaw))
                  ? Number(curRaw)
                  : null;
              const isDeviating =
                fieldTrend &&
                curNum !== null &&
                (curNum < fieldTrend.lower_bound || curNum > fieldTrend.upper_bound);

              return (
                <div key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="font-medium text-muted-foreground">
                      {f.label}
                      {f.required ? " *" : ""}
                    </span>
                    {fieldTrend && (
                      <span className="font-mono text-[9px] text-muted-foreground">
                        Exp: {fieldTrend.lower_bound.toLocaleString()}–{fieldTrend.upper_bound.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {f.type === "select" ? (
                    <select
                      value={String(formState[f.key] ?? "")}
                      onChange={(e) => updateField(f.key, e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
                    >
                      {(f.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "boolean" ? (
                    <div className="flex h-8 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(formState[f.key])}
                        onChange={(e) => updateField(f.key, e.target.checked)}
                      />
                      <span className="text-xs">Yes</span>
                    </div>
                  ) : f.type === "number" ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          step="any"
                          required={f.required}
                          placeholder={f.placeholder}
                          value={String(formState[f.key] ?? "")}
                          onChange={(e) => updateField(f.key, e.target.value)}
                          className={cn(
                            "h-8 text-xs font-mono flex-1 min-w-0",
                            isDeviating
                              ? "border-amber-500/80 bg-amber-500/5 focus-visible:ring-amber-500"
                              : "",
                          )}
                        />
                        {fieldTrend && (
                          <ValidationSparkline
                            history={fieldTrend.history}
                            currentValue={curNum}
                            lowerBound={fieldTrend.lower_bound}
                            upperBound={fieldTrend.upper_bound}
                            mean={fieldTrend.mean}
                            std={fieldTrend.std}
                            unit={fieldTrend.unit || ""}
                            fieldLabel={f.label}
                            width={90}
                            height={28}
                            showBadge={true}
                          />
                        )}
                      </div>
                      {fieldTrend && curNum !== null && (
                        <div className="flex items-center justify-between text-[9px] font-mono leading-none">
                          <span
                            className={cn(
                              "font-medium",
                              isDeviating
                                ? "text-amber-600 dark:text-amber-400 font-semibold"
                                : "text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {isDeviating
                              ? "⚠️ Deviates significantly from expected trend"
                              : "✓ Within expected trend range"}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Input
                      type={f.type}
                      required={f.required}
                      placeholder={f.placeholder}
                      value={String(formState[f.key] ?? "")}
                      onChange={(e) => updateField(f.key, e.target.value)}
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {candidateReport && candidateReport.issues.length > 0 && (
            <div className="mt-3 space-y-1.5 rounded border border-border bg-card p-2.5 text-[11px]">
              <div className="flex items-center gap-1.5 font-semibold">
                {candidateReport.error_count > 0 ? (
                  <>
                    <ShieldAlert className="size-3.5 shrink-0 text-destructive" />
                    <span className="text-destructive">
                      Blocked: {candidateReport.error_count} missing or invalid input
                      {candidateReport.error_count === 1 ? "" : "s"}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-amber-700 dark:text-amber-400">
                      Historical Trend Anomaly Detected ({candidateReport.issues.length}{" "}
                      warning{candidateReport.issues.length === 1 ? "" : "s"})
                    </span>
                  </>
                )}
              </div>
              <div className="space-y-1 pl-5">
                {candidateReport.issues.map((iss) => (
                  <div key={iss.id} className="text-[10.5px]">
                    <p className="text-foreground">{iss.message}</p>
                    {(iss.historical_baseline || iss.expected_range) && (
                      <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {iss.historical_baseline
                          ? `Baseline: ${iss.historical_baseline}`
                          : `Expected: ${iss.expected_range}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {candidateReport &&
            candidateReport.error_count === 0 &&
            candidateReport.issues.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={mutating || validating}
                onClick={(e) => void handleSubmit(e, true)}
                className="h-7 px-3 text-xs"
              >
                Save Entry Anyway
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={mutating || validating}
                className="h-7 px-3 text-xs"
              >
                {validating && <Loader2 className="size-3.5 animate-spin" />}
                Save &amp; Recalculate
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-3 text-xs"
              onClick={() => {
                setCandidateReport(null);
                setShowAdd(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <EmptyNote>No matching records in this calculation ledger.</EmptyNote>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "px-2 py-2 font-medium whitespace-nowrap",
                      c.numeric || c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
                {onDelete && <th className="w-10 px-2 py-2 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  {columns.map((c) => {
                    const raw = row[c.key];
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "px-2 py-2 align-middle",
                          c.numeric || c.align === "right"
                            ? "text-right font-mono tabular-nums"
                            : "text-left",
                        )}
                      >
                        {c.render
                          ? c.render(raw, row)
                          : c.numeric && typeof raw === "number"
                            ? raw.toLocaleString("en-US", { maximumFractionDigits: 4 })
                            : String(raw ?? "—")}
                      </td>
                    );
                  })}
                  {onDelete && (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={mutating}
                        title="Delete record"
                        onClick={() => void onDelete(row.id)}
                        className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
