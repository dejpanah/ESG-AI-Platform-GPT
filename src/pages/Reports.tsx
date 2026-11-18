import { AppShell } from "@/components/AppShell";
import { DirectionToggle } from "@/components/DirectionToggle";
import { ReportMarkdown } from "@/components/ReportMarkdown";
import { ReportSubreport } from "@/components/ReportSubreport";
import { ReportVersionHistory } from "@/components/ReportVersionHistory";
import { PageBody, PageHeader, Workspace } from "@/components/system/layout";
import { EmptyNote, Panel } from "@/components/system/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  aggregateReports,
  createManualReport,
  generateEsgReport,
  getReport,
  listReports,
  listReportTemplates,
  reviseReport,
  REPORT_TYPE_OPTIONS,
  getPostgresStatus,
  type EsgReport,
  type EsgReportTemplate,
  type PostgresStatus,
} from "@/api/reports";
import { extractReportSubreportData } from "@/lib/report-charts";
import { exportReportContainerToPdf } from "@/lib/report-pdf";
import {
  loadSavedDirection,
  resolveTextDirection,
  saveDirection,
  type TextDirectionMode,
} from "@/lib/text-direction";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Check,
  Database,
  Edit3,
  FileDown,
  FileText,
  History,
  Layers,
  LayoutTemplate,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type ReportViewMode = "combined" | "text" | "subreport" | "versions";
type CreateMode = "auto" | "manual";

const TEMPLATE_CATEGORIES = [
  "All",
  "Environmental",
  "Social",
  "Governance",
  "Comprehensive",
] as const;

function templateCategoryStyle(category: string): string {
  switch (category) {
    case "Environmental":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "Social":
      return "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "Governance":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default:
      return "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300";
  }
}

function formatTs(ms: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("fa-IR");
  } catch {
    return String(ms);
  }
}

function ReportsWorkspace() {
  const [reports, setReports] = useState<EsgReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EsgReport | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dirMode, setDirMode] = useState<TextDirectionMode>(() =>
    loadSavedDirection("reports", "auto"),
  );
  const [viewMode, setViewMode] = useState<ReportViewMode>("combined");

  // Templates library state
  const [templates, setTemplates] = useState<EsgReportTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(true);
  const [templateCategory, setTemplateCategory] = useState<string>("All");
  const [selectedTemplate, setSelectedTemplate] =
    useState<EsgReportTemplate | null>(null);
  const [quickGeneratingTemplateId, setQuickGeneratingTemplateId] = useState<
    string | null
  >(null);

  // Generate / create form
  const [showGenerate, setShowGenerate] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("auto");
  const [genTitle, setGenTitle] = useState("");
  const [genType, setGenType] = useState("esg_periodic");
  const [genFrom, setGenFrom] = useState("");
  const [genTo, setGenTo] = useState("");
  const [genInstructions, setGenInstructions] = useState("");
  const [manualBody, setManualBody] = useState("");
  const [generating, setGenerating] = useState(false);

  // Aggregate form
  const [showAggregate, setShowAggregate] = useState(false);
  const [aggTitle, setAggTitle] = useState("");
  const [aggInstructions, setAggInstructions] = useState("");
  const [aggregating, setAggregating] = useState(false);

  // PDF Export state
  const [pdfTarget, setPdfTarget] = useState<EsgReport | null>(null);
  const pdfSheetRef = useRef<HTMLDivElement | null>(null);

  // Versioning & Revision editor state
  const [editingReport, setEditingReport] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editNote, setEditNote] = useState("");
  const [savingRevision, setSavingRevision] = useState(false);
  const [regeneratingReport, setRegeneratingReport] = useState(false);
  const [pgStatus, setPgStatus] = useState<PostgresStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, status] = await Promise.all([
        listReports(typeFilter || undefined),
        getPostgresStatus().catch(() => null),
      ]);
      setReports(data);
      if (status) setPgStatus(status);
      setSelected((prev) => {
        if (!prev) return data[0] ?? null;
        return data.find((r) => r.id === prev.id) ?? data[0] ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    let active = true;
    listReportTemplates()
      .then((items) => {
        if (active) setTemplates(items);
      })
      .catch(() => {
        // Non-fatal if templates fail transiently
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listReports(typeFilter || undefined)
      .then((data) => {
        if (active) {
          setReports(data);
          setSelected((prev) => {
            if (!prev) return data[0] ?? null;
            return data.find((r) => r.id === prev.id) ?? data[0] ?? null;
          });
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [typeFilter]);

  useEffect(() => {
    if (!pdfTarget) return;
    let active = true;
    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 60));
        if (!active || !pdfSheetRef.current) return;
        await exportReportContainerToPdf(pdfSheetRef.current, pdfTarget.title);
        if (active) {
          toast.success(`فایل PDF گزارش «${pdfTarget.title}» دانلود شد`);
        }
      } catch (e) {
        if (active) {
          toast.error(
            e instanceof Error
              ? `خطا در خروجی PDF: ${e.message}`
              : "خطا در تولید فایل PDF",
          );
        }
      } finally {
        if (active) setPdfTarget(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [pdfTarget]);

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyTemplateToForm = (tpl: EsgReportTemplate) => {
    setSelectedTemplate(tpl);
    setGenTitle(tpl.suggested_title);
    setGenType(tpl.report_type);
    setGenFrom(tpl.default_from_date);
    setGenTo(tpl.default_to_date);
    setGenInstructions(tpl.default_instructions);
    setManualBody(tpl.sample_manual_body);
    setShowGenerate(true);
    toast.success(`قالب «${tpl.name_en}» روی فرم تولید گزارش اعمال شد`);
  };

  const quickGenerateFromTemplate = async (tpl: EsgReportTemplate) => {
    setQuickGeneratingTemplateId(tpl.id);
    try {
      const result = await generateEsgReport({
        title: tpl.suggested_title,
        report_type: tpl.report_type,
        template_id: tpl.id,
        from_date: tpl.default_from_date,
        to_date: tpl.default_to_date,
        instructions: tpl.default_instructions,
        pillars: tpl.pillars,
      });
      toast.success(`گزارش از قالب «${tpl.name_en}» همراه با نمودارها ساخته شد`);
      await load();
      if (result.id) {
        const full = await getReport(String(result.id));
        setSelected(full);
        setViewMode("combined");
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "خطا در تولید گزارش از قالب",
      );
    } finally {
      setQuickGeneratingTemplateId(null);
    }
  };

  const onGenerate = async () => {
    if (!genTitle.trim()) {
      toast.error("عنوان گزارش را وارد کنید");
      return;
    }
    if (createMode === "manual" && !manualBody.trim()) {
      toast.error("متن گزارش را وارد کنید");
      return;
    }
    setGenerating(true);
    try {
      if (createMode === "manual") {
        const created = await createManualReport({
          title: genTitle.trim(),
          report_type: genType,
          body: manualBody.trim(),
          metadata: selectedTemplate
            ? {
                template_id: selectedTemplate.id,
                template_name: selectedTemplate.name,
                framework: selectedTemplate.framework,
              }
            : undefined,
        });
        toast.success("گزارش متنی ذخیره و زیرگزارش نموداری ساخته شد");
        setShowGenerate(false);
        setGenTitle("");
        setManualBody("");
        setSelectedTemplate(null);
        await load();
        setSelected(created);
      } else {
        const resolvedPillars =
          selectedTemplate?.pillars ??
          (genType === "esg_environmental"
            ? ["environmental"]
            : genType === "esg_social"
              ? ["social"]
              : ["environmental", "social"]);
        const result = await generateEsgReport({
          title: genTitle.trim(),
          report_type: genType,
          template_id: selectedTemplate?.id,
          from_date: genFrom || undefined,
          to_date: genTo || undefined,
          instructions: genInstructions || undefined,
          pillars: resolvedPillars,
        });
        toast.success("گزارش تولید و در کتابخانه ذخیره شد");
        setShowGenerate(false);
        setGenTitle("");
        setGenInstructions("");
        setSelectedTemplate(null);
        await load();
        if (result.id) {
          const full = await getReport(String(result.id));
          setSelected(full);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در تولید گزارش");
    } finally {
      setGenerating(false);
    }
  };

  const onAggregate = async () => {
    if (checked.size < 1) {
      toast.error("حداقل یک گزارش انتخاب کنید");
      return;
    }
    if (!aggTitle.trim()) {
      toast.error("عنوان گزارش تجمیعی را وارد کنید");
      return;
    }
    setAggregating(true);
    try {
      const result = await aggregateReports({
        title: aggTitle.trim(),
        source_report_ids: Array.from(checked),
        instructions: aggInstructions || undefined,
      });
      toast.success("گزارش تجمیعی ساخته شد");
      setShowAggregate(false);
      setAggTitle("");
      setChecked(new Set());
      await load();
      setSelected(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در تجمیع");
    } finally {
      setAggregating(false);
    }
  };

  const openRevisionEditor = (r: EsgReport) => {
    setEditTitle(r.title);
    setEditBody(r.body);
    setEditNote("");
    setEditingReport(true);
    if (viewMode === "versions") {
      setViewMode("combined");
    }
  };

  const handleSaveRevision = async () => {
    if (!selected) return;
    if (!editTitle.trim() || !editBody.trim()) {
      toast.error("عنوان و متن گزارش نمی‌تواند خالی باشد");
      return;
    }
    setSavingRevision(true);
    try {
      const updated = await reviseReport(selected.id, {
        title: editTitle.trim(),
        body: editBody.trim(),
        change_note: editNote.trim() || undefined,
      });
      setSelected(updated);
      setEditingReport(false);
      await load();
      toast.success(`نسخه جدید v${updated.version} با موفقیت ثبت شد`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره نسخه جدید");
    } finally {
      setSavingRevision(false);
    }
  };

  const handleRegenerateIteration = async () => {
    if (!selected) return;
    setRegeneratingReport(true);
    try {
      const snapshot = selected.metadata?.metrics_snapshot;
      const pillars = snapshot?.pillars?.length
        ? snapshot.pillars
        : ["environmental", "social"];
      await generateEsgReport({
        report_id: selected.id,
        title: selected.title,
        report_type: selected.report_type,
        template_id: selected.metadata?.template_id,
        from_date: snapshot?.period?.from_date,
        to_date: snapshot?.period?.to_date,
        pillars,
        change_note: "بازتولید خودکار نسخه جدید با آخرین داده‌های ESG",
      });
      const updated = await getReport(selected.id);
      setSelected(updated);
      setEditingReport(false);
      await load();
      toast.success(
        `نسخه جدید v${updated.version} با داده‌های بروز بازتولید شد`,
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "خطا در بازتولید نسخه جدید گزارش",
      );
    } finally {
      setRegeneratingReport(false);
    }
  };

  const handleVersionRestored = useCallback(
    (updated: EsgReport) => {
      setSelected(updated);
      setEditingReport(false);
      void load();
    },
    [load],
  );

  const filteredTemplates = useMemo(() => {
    if (templateCategory === "All") return templates;
    return templates.filter((t) => t.category === templateCategory);
  }, [templates, templateCategory]);

  const filteredCount = useMemo(() => reports.length, [reports]);

  const handleDirChange = useCallback((mode: TextDirectionMode) => {
    setDirMode(mode);
    saveDirection("reports", mode);
  }, []);

  const previewDir = useMemo(
    () =>
      resolveTextDirection(
        dirMode,
        selected ? `${selected.title}\n${selected.body}` : "",
      ),
    [dirMode, selected],
  );

  const pdfDir = useMemo(
    () =>
      resolveTextDirection(
        dirMode,
        pdfTarget ? `${pdfTarget.title}\n${pdfTarget.body}` : "",
      ),
    [dirMode, pdfTarget],
  );

  const chartCountsByReportId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reports) {
      map.set(r.id, extractReportSubreportData(r).chartCount);
    }
    return map;
  }, [reports]);

  const selectedSubreportSummary = useMemo(
    () => (selected ? extractReportSubreportData(selected) : null),
    [selected],
  );

  return (
    <Workspace>
      <PageHeader
        title="کتابخانه گزارش‌های ESG"
        description="تولید از قالب‌های آماده، آرشیو، زیرگزارش نموداری و خروجی PDF گزارش‌های پایداری"
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setShowGenerate((v) => !v)}>
            <Plus className="size-4" />
            تولید گزارش
          </Button>
          <Button
            size="sm"
            variant={showTemplates ? "secondary" : "outline"}
            onClick={() => setShowTemplates((v) => !v)}
          >
            <LayoutTemplate className="size-4" />
            کتابخانه قالب‌ها ({templates.length})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={checked.size === 0}
            onClick={() => setShowAggregate((v) => !v)}
          >
            <Layers className="size-4" />
            تجمیع ({checked.size})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            بروزرسانی
          </Button>
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">همه انواع</option>
            {REPORT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {filteredCount} گزارش
          </span>
          <div className="mr-auto flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
                pgStatus?.status === "operational"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
              )}
              title={
                pgStatus
                  ? `ذخیره‌سازی گزارش‌ها در ${pgStatus.engine} (${pgStatus.mode}) — ${pgStatus.reports_count} گزارش در پایگاه داده`
                  : "ذخیره مستقیم در پایگاه داده PostgreSQL"
              }
            >
              <Database className="size-3.5" />
              <span>پایگاه داده PostgreSQL</span>
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </span>
          </div>
        </div>

        {showTemplates && (
          <Panel
            title="کتابخانه قالب‌های آماده گزارش ESG"
            description="یک قالب استاندارد (مانند Carbon Disclosure یا Diversity Metrics) را به عنوان نقطه شروع انتخاب کنید تا پیش‌تنظیم‌های متن و نمودارها اعمال شوند"
            actions={
              <div className="flex flex-wrap items-center gap-1">
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTemplateCategory(cat)}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                      templateCategory === cat
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {cat === "All" ? "همه" : cat}
                  </button>
                ))}
              </div>
            }
          >
            {filteredTemplates.length === 0 ? (
              <EmptyNote>قالبی در این دسته‌بندی یافت نشد.</EmptyNote>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredTemplates.map((tpl) => {
                  const isSelected = selectedTemplate?.id === tpl.id;
                  const isQuickGenerating =
                    quickGeneratingTemplateId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      className={cn(
                        "flex flex-col justify-between rounded-lg border p-3.5 transition-colors",
                        isSelected
                          ? "border-emerald-500/60 bg-emerald-500/[0.04]"
                          : "border-border bg-background/80 hover:bg-muted/30",
                      )}
                    >
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded px-1.5 py-0 font-mono text-[10px]",
                              templateCategoryStyle(tpl.category),
                            )}
                          >
                            {tpl.category}
                          </Badge>
                          <span className="term-dim font-mono text-[10px]">
                            {tpl.framework}
                          </span>
                        </div>

                        <h3 className="mt-2 text-[13px] font-semibold leading-snug">
                          {tpl.name}
                        </h3>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                          {tpl.description}
                        </p>

                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {tpl.chart_focus.map((chart) => (
                            <span
                              key={chart}
                              className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                            >
                              <BarChart3 className="size-2.5" />
                              {chart}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
                        <Button
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          className="h-7 flex-1 text-[11px]"
                          onClick={() => applyTemplateToForm(tpl)}
                        >
                          {isSelected ? (
                            <Check className="size-3.5" />
                          ) : (
                            <LayoutTemplate className="size-3.5" />
                          )}
                          {isSelected ? "قالب انتخاب شد" : "انتخاب و سفارشی‌سازی"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-[11px]"
                          disabled={Boolean(quickGeneratingTemplateId)}
                          onClick={() => void quickGenerateFromTemplate(tpl)}
                        >
                          {isQuickGenerating ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="size-3.5" />
                          )}
                          تولید فوری
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        )}

        {showGenerate && (
          <Panel
            title="ایجاد گزارش جدید ESG"
            description="تولید خودکار از داده‌های ساختاریافته و RAG یا ثبت متن گزارش با استخراج خودکار نمودار"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {selectedTemplate && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    <span>قالب: {selectedTemplate.name_en}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTemplate(null)}
                      className="hover:opacity-75"
                      title="حذف انتخاب قالب"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                )}
                <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setCreateMode("auto")}
                    className={cn(
                      "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                      createMode === "auto"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    تولید هوشمند ESG
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateMode("manual")}
                    className={cn(
                      "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                      createMode === "manual"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    متن سفارشی + اعداد
                  </button>
                </div>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="عنوان گزارش"
                value={genTitle}
                onChange={(e) => setGenTitle(e.target.value)}
              />
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={genType}
                onChange={(e) => setGenType(e.target.value)}
              >
                {REPORT_TYPE_OPTIONS.filter(
                  (o) => o.value !== "esg_aggregate",
                ).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              {createMode === "auto" ? (
                <>
                  <Input
                    type="date"
                    value={genFrom}
                    onChange={(e) => setGenFrom(e.target.value)}
                  />
                  <Input
                    type="date"
                    value={genTo}
                    onChange={(e) => setGenTo(e.target.value)}
                  />
                  <textarea
                    className="sm:col-span-2 min-h-[80px] rounded-md border border-border bg-background p-2 text-sm"
                    placeholder="دستورالعمل اختیاری (مثلاً تمرکز روی کاهش کربن)"
                    value={genInstructions}
                    onChange={(e) => setGenInstructions(e.target.value)}
                  />
                </>
              ) : (
                <textarea
                  className="sm:col-span-2 min-h-[140px] rounded-md border border-border bg-background p-2.5 font-mono text-xs leading-relaxed"
                  placeholder={
                    "متن گزارش خود را همراه با اعداد وارد کنید تا زیرگزارش نموداری به صورت خودکار ساخته شود...\nمثال:\n- مجموع انتشار CO2: ۱۲٬۵۴۰ تن\n- انرژی خورشیدی: ۳٬۴۰۰ مگاوات‌ساعت\n- مصرف آب: ۴۱٬۰۰۰ مترمکعب"
                  }
                  value={manualBody}
                  onChange={(e) => setManualBody(e.target.value)}
                />
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => void onGenerate()} disabled={generating}>
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                تولید و ذخیره
              </Button>
              <Button variant="ghost" onClick={() => setShowGenerate(false)}>
                انصراف
              </Button>
            </div>
          </Panel>
        )}

        {showAggregate && (
          <Panel
            title="گزارش تجمیعی"
            description={`${checked.size} گزارش انتخاب‌شده`}
          >
            <div className="grid gap-3">
              <Input
                placeholder="عنوان گزارش تجمیعی"
                value={aggTitle}
                onChange={(e) => setAggTitle(e.target.value)}
              />
              <textarea
                className="min-h-[60px] rounded-md border border-border bg-background p-2 text-sm"
                placeholder="دستورالعمل تجمیع (اختیاری)"
                value={aggInstructions}
                onChange={(e) => setAggInstructions(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={() => void onAggregate()} disabled={aggregating}>
                  {aggregating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Layers className="size-4" />
                  )}
                  ساخت تجمیعی
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowAggregate(false)}
                >
                  انصراف
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {error && <EmptyNote>{error}</EmptyNote>}

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <Panel
            title="فهرست گزارش‌ها"
            description="کتابخانه آرشیو شده با زیرگزارش نموداری و خروجی PDF"
          >
            {loading && reports.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> در حال بارگذاری…
              </div>
            ) : reports.length === 0 ? (
              <EmptyNote>هنوز گزارشی ذخیره نشده است.</EmptyNote>
            ) : (
              <ul className="divide-y divide-border">
                {reports.map((r) => {
                  const itemDir = resolveTextDirection(dirMode, r.title);
                  const chartCount = chartCountsByReportId.get(r.id) ?? 0;
                  const isExportingThis = pdfTarget?.id === r.id;
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        "flex items-start gap-2 rounded px-1.5 py-2.5 transition-colors hover:bg-muted/40",
                        selected?.id === r.id && "bg-muted/60",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1.5"
                        checked={checked.has(r.id)}
                        onChange={() => toggleCheck(r.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        type="button"
                        dir={itemDir}
                        className={cn(
                          "min-w-0 flex-1",
                          itemDir === "rtl" ? "text-right" : "text-left",
                        )}
                        onClick={() => {
                          setSelected(r);
                          setEditingReport(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-sm font-medium">
                            {r.title}
                          </span>
                          <Badge
                            variant="outline"
                            className="shrink-0 rounded px-1.5 py-0 font-mono text-[10px]"
                          >
                            v{r.version}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>{r.report_type}</span>
                          <span>·</span>
                          <span>{formatTs(r.updated_at || r.created_at)}</span>
                          <Badge
                            variant="outline"
                            className="gap-1 rounded px-1.5 py-0 font-mono text-[10px]"
                          >
                            <BarChart3 className="size-2.5" />
                            <span>{chartCount} نمودار</span>
                          </Badge>
                          {r.metadata?.framework && (
                            <span className="rounded border border-border/70 px-1.5 py-0 font-mono text-[9.5px]">
                              {r.metadata.framework}
                            </span>
                          )}
                        </div>
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2 text-[11px]"
                        disabled={Boolean(pdfTarget)}
                        title="خروجی PDF گزارش و نمودارها"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPdfTarget(r);
                        }}
                      >
                        {isExportingThis ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <FileDown className="size-3.5" />
                        )}
                        <span className="hidden sm:inline">PDF</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title={selected ? selected.title : "پیش‌نمایش"}
            description={
              selected
                ? `v${selected.version} · ${selected.report_type} · ${selected.model}${
                    selected.metadata?.framework
                      ? ` · ${selected.metadata.framework}`
                      : ""
                  }${
                    selectedSubreportSummary
                      ? ` · ${selectedSubreportSummary.chartCount} نمودار در زیرگزارش`
                      : ""
                  } · پایگاه داده PostgreSQL`
                : "یک گزارش انتخاب کنید"
            }
            actions={
              <div className="flex flex-wrap items-center gap-1.5">
                {selected && (
                  <>
                    <div className="inline-flex flex-wrap rounded-md border border-border bg-muted/40 p-0.5">
                      <button
                        type="button"
                        onClick={() => setViewMode("combined")}
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                          viewMode === "combined"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        کامل (متن + نمودار)
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("text")}
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                          viewMode === "text"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        متن گزارش
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("subreport")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                          viewMode === "subreport"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <BarChart3 className="size-3" />
                        زیرگزارش نموداری
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("versions")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                          viewMode === "versions"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <History className="size-3" />
                        تاریخچه نسخه‌ها ({selected.versions?.length ?? selected.version})
                      </button>
                    </div>

                    <Button
                      size="sm"
                      variant={editingReport ? "secondary" : "outline"}
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() =>
                        editingReport
                          ? setEditingReport(false)
                          : openRevisionEditor(selected)
                      }
                    >
                      <Edit3 className="size-3.5" />
                      {editingReport ? "بستن ویرایشگر" : "ویرایش / نسخه جدید"}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px]"
                      disabled={regeneratingReport}
                      onClick={() => void handleRegenerateIteration()}
                    >
                      {regeneratingReport ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      بازتولید نسخه
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px]"
                      disabled={Boolean(pdfTarget)}
                      onClick={() => setPdfTarget(selected)}
                    >
                      {pdfTarget?.id === selected.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <FileDown className="size-3.5" />
                      )}
                      خروجی PDF
                    </Button>
                  </>
                )}
                <DirectionToggle
                  value={dirMode}
                  resolved={previewDir}
                  onChange={handleDirChange}
                />
              </div>
            }
          >
            {!selected ? (
              <EmptyNote>
                برای مشاهده محتوا و زیرگزارش نموداری، گزارشی از فهرست انتخاب
                کنید.
              </EmptyNote>
            ) : (
              <div className="space-y-6">
                {editingReport && (
                  <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.04] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[13px] font-semibold">
                          ثبت نسخه جدید (ایجاد v{selected.version + 1})
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          تغییرات شما به عنوان نسخه جدید در تاریخچه ثبت می‌شود و نسخه فعلی v
                          {selected.version} حفظ خواهد شد.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setEditingReport(false)}
                      >
                        <X className="size-3.5" />
                        بستن
                      </Button>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <Input
                        placeholder="عنوان نسخه جدید گزارش"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                      <Input
                        placeholder="توضیح تغییرات این نسخه (مثلاً: اصلاح ارقام آب و انرژی)"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                      />
                    </div>

                    <textarea
                      dir={previewDir}
                      className="min-h-[180px] w-full rounded-md border border-border bg-background p-2.5 font-mono text-xs leading-relaxed"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={savingRevision}
                        onClick={() => void handleSaveRevision()}
                      >
                        {savingRevision ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                        ذخیره به عنوان نسخه v{selected.version + 1}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingReport(false)}
                      >
                        انصراف
                      </Button>
                    </div>
                  </div>
                )}

                {viewMode === "versions" ? (
                  <ReportVersionHistory
                    report={selected}
                    dir={previewDir}
                    onRestored={handleVersionRestored}
                  />
                ) : (
                  <>
                    {(viewMode === "combined" || viewMode === "text") && (
                      <div className="rounded-lg border border-border/80 bg-background/70 p-4">
                        <ReportMarkdown content={selected.body} dir={previewDir} />
                      </div>
                    )}

                    {(viewMode === "combined" || viewMode === "subreport") && (
                      <div
                        className={cn(
                          viewMode === "combined" && "border-t border-border pt-5",
                        )}
                      >
                        <ReportSubreport report={selected} dir={previewDir} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Panel>
        </div>

        {/* Off-screen light-paper printable sheet for deterministic multi-page PDF export */}
        {pdfTarget && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed top-0 -left-[12000px] z-[-1] w-[794px] bg-white p-8 text-zinc-900"
          >
            <div ref={pdfSheetRef} className="space-y-5 bg-white text-zinc-900">
              <div
                data-pdf-block
                dir={pdfDir}
                className={cn(
                  "rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-4",
                  pdfDir === "rtl" ? "text-right" : "text-left",
                )}
              >
                <div className="text-xs font-medium text-emerald-700">
                  ESG Intelligence Platform · Sustainability Report &amp; Visual Subreport
                </div>
                <h1 className="mt-1 text-xl font-bold text-zinc-950">
                  {pdfTarget.title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px] text-zinc-600">
                  <span>Type: {pdfTarget.report_type}</span>
                  <span>·</span>
                  <span>Model: {pdfTarget.model}</span>
                  <span>·</span>
                  <span>Generated: {formatTs(pdfTarget.created_at)}</span>
                </div>
              </div>

              <div
                data-pdf-block
                className="rounded-lg border border-zinc-200 bg-white px-5 py-4"
              >
                <ReportMarkdown
                  content={pdfTarget.body}
                  dir={pdfDir}
                  lightPrint
                />
              </div>

              <ReportSubreport report={pdfTarget} dir={pdfDir} printMode />
            </div>
          </div>
        )}
      </PageBody>
    </Workspace>
  );
}

export default function ReportsPage() {
  return (
    <AppShell>
      {() => <ReportsWorkspace />}
    </AppShell>
  );
}
