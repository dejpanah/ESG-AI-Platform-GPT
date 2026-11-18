import { CalcLedgerPanel } from "@/components/calc/CalcLedgerPanel";
import { CalculationEngineShell } from "@/components/calc/CalculationEngineShell";
import { Panel } from "@/components/system/panels";
import { useCalcEngine } from "@/hooks/use-calc-engine";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

interface Scope3CategoryMeta {
  cat: number;
  name: string;
  petrochemical_focus: boolean;
}

export default function Scope3Page() {
  const { view, loading, mutating, error, reload, addRecord, removeRecord } =
    useCalcEngine("scope-3");
  const [focusOnly, setFocusOnly] = useState(false);

  const catalog = useMemo<Scope3CategoryMeta[]>(
    () => (view?.extra?.categories_catalog as Scope3CategoryMeta[]) ?? [],
    [view],
  );

  const filteredRecords = useMemo(() => {
    if (!view) return [];
    if (!focusOnly) return view.records;
    return view.records.filter((r) => Boolean(r.petrochemical_priority));
  }, [view, focusOnly]);

  const catTotals = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of view?.records ?? []) {
      const cat = Number(r.category_num || 0);
      map.set(cat, (map.get(cat) ?? 0) + Number(r.emissions_tco2e || 0));
    }
    return map;
  }, [view]);

  return (
    <CalculationEngineShell
      view={view}
      loading={loading}
      error={error}
      onReload={() => void reload()}
      chartPrimaryLabel="Category Emissions (tCO2e)"
      controlsSlot={
        <Panel
          title="15 GHG Protocol Categories — Petrochemical Materiality Matrix"
          description="Prioritizing feedstock, catalysts & chemicals, upstream/downstream transport, waste, business travel, leased assets, processing & end use of sold products"
          actions={
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setFocusOnly(false)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                  !focusOnly
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All 15 Categories
              </button>
              <button
                type="button"
                onClick={() => setFocusOnly(true)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors",
                  focusOnly
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Petrochemical Priority Only
              </button>
            </div>
          }
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {catalog
              .filter((c) => !focusOnly || c.petrochemical_focus)
              .map((c) => {
                const total = catTotals.get(c.cat) ?? 0;
                return (
                  <div
                    key={c.cat}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px]",
                      c.petrochemical_focus
                        ? "border-emerald-500/35 bg-emerald-500/[0.03]"
                        : "border-border bg-background",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {c.petrochemical_focus ? "Petrochemical Focus" : "Standard Scope 3"}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums">
                      {total.toLocaleString("en-US", { maximumFractionDigits: 1 })} t
                    </span>
                  </div>
                );
              })}
          </div>
        </Panel>
      }
    >
      <CalcLedgerPanel
        title="Scope 3 Value Chain Activity Ledger"
        description="Upstream & downstream Scope 3 streams with primary PCF, distance-based, and stoichiometric methods"
        records={filteredRecords}
        mutating={mutating}
        onAdd={(payload) => {
          const catNum = Number(payload.category_num || 1);
          const meta = catalog.find((c) => c.cat === catNum);
          return addRecord(
            {
              ...payload,
              category_num: catNum,
              category_name: meta?.name ?? `Cat ${catNum}`,
              petrochemical_priority: meta?.petrochemical_focus ?? false,
            },
            "Scope 3 value chain record saved",
          );
        }}
        onDelete={removeRecord}
        columns={[
          { key: "category_name", label: "GHG Protocol Category" },
          { key: "sub_stream", label: "Petrochemical / Supply Stream" },
          { key: "method", label: "Method" },
          { key: "activity_value", label: "Activity", numeric: true },
          { key: "activity_unit", label: "Unit" },
          { key: "ef_value", label: "Factor", numeric: true },
          { key: "emissions_tco2e", label: "Emissions tCO₂e", numeric: true },
          { key: "data_quality", label: "Data Quality" },
        ]}
        fields={[
          {
            key: "category_num",
            label: "Scope 3 Category (1-15)",
            type: "select",
            required: true,
            options: (catalog.length > 0
              ? catalog
              : [{ cat: 1, name: "Cat 1: Purchased Goods & Services", petrochemical_focus: true }]
            ).map((c) => ({ label: c.name, value: String(c.cat) })),
          },
          { key: "sub_stream", label: "Stream Description", type: "text", required: true, placeholder: "e.g., Hydrotreating Catalyst Replacement" },
          { key: "method", label: "Methodology", type: "text", required: true, defaultValue: "Supplier PCF" },
          { key: "activity_value", label: "Activity Quantity", type: "number", required: true, defaultValue: 500 },
          { key: "activity_unit", label: "Unit", type: "text", required: true, defaultValue: "tonnes" },
          { key: "ef_value", label: "Emission Factor", type: "number", required: true, defaultValue: 2.1 },
          { key: "data_quality", label: "Data Quality", type: "text", defaultValue: "High (Primary PCF)" },
        ]}
      />
    </CalculationEngineShell>
  );
}
