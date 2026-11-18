import {
  fetchReportVersionDiff,
  listReportVersions,
  restoreReportVersion,
  type EsgReport,
  type ReportVersionDiffResponse,
  type ReportVersionEntry,
} from "@/api/reports";
import { EmptyNote } from "@/components/system/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GitCompare,
  History,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function formatTs(ms: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("fa-IR");
  } catch {
    return String(ms);
  }
}

export function ReportVersionHistory({
  report,
  dir = "rtl",
  onRestored,
}: {
  report: EsgReport;
  dir?: "rtl" | "ltr";
  onRestored: (updated: EsgReport) => void;
}) {
  const [versions, setVersions] = useState<ReportVersionEntry[]>(() =>
    [...(report.versions ?? [])].sort((a, b) => b.version - a.version),
  );
  const [loadingVersions, setLoadingVersions] = useState(false);

  const [fromVer, setFromVer] = useState<number>(() =>
    Math.max(1, report.version - 1),
  );
  const [toVer, setToVer] = useState<number>(() => report.version);
  const [onlyChanges, setOnlyChanges] = useState<boolean>(false);

  const [diff, setDiff] = useState<ReportVersionDiffResponse | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    listReportVersions(report.id)
      .then((res) => {
        if (!active) return;
        const sorted = [...res.versions].sort((a, b) => b.version - a.version);
        setVersions(sorted);
        const latest = res.current_version || sorted[0]?.version || 1;
        const prev = sorted.find((v) => v.version < latest)?.version ?? latest;
        setToVer(latest);
        setFromVer(prev);
      })
      .catch(() => {
        if (active) {
          const fallback = [...(report.versions ?? [])].sort(
            (a, b) => b.version - a.version,
          );
          setVersions(fallback);
        }
      })
      .finally(() => {
        if (active) setLoadingVersions(false);
      });
    return () => {
      active = false;
    };
  }, [report.id, report.version, report.versions]);

  useEffect(() => {
    if (versions.length < 1) return;
    const hasFrom = versions.some((v) => v.version === fromVer);
    const hasTo = versions.some((v) => v.version === toVer);
    if (!hasFrom || !hasTo) return;

    let active = true;
    fetchReportVersionDiff(report.id, fromVer, toVer)
      .then((res) => {
        if (active) setDiff(res);
      })
      .catch(() => {
        if (active) setDiff(null);
      })
      .finally(() => {
        if (active) setLoadingDiff(false);
      });
    return () => {
      active = false;
    };
  }, [report.id, fromVer, toVer, versions]);

  const handleRestore = async (targetVersion: number) => {
    setRestoringVersion(targetVersion);
    try {
      const updated = await restoreReportVersion(report.id, targetVersion);
      toast.success(
        `نسخه v${targetVersion} با موفقیت به عنوان نسخه جدید v${updated.version} بازیابی شد`,
      );
      onRestored(updated);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "خطا در بازیابی نسخه قبلی گزارش",
      );
    } finally {
      setRestoringVersion(null);
    }
  };

  const visibleDiffLines = useMemo(() => {
    if (!diff) return [];
    if (!onlyChanges) return diff.lines;
    return diff.lines.filter((l) => l.type !== "unchanged");
  }, [diff, onlyChanges]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-background/80 p-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitCompare className="size-4 text-[var(--term-info)]" />
            <div>
              <div className="text-[13px] font-semibold">
                مقایسه تغییرات بین نسخه‌ها (Change History Diff)
              </div>
              <div className="text-[11px] text-muted-foreground">
                مشاهده دقیق خطوط اضافه‌شده و حذف‌شده میان دو نسخه گزارش
              </div>
            </div>
          </div>

          {versions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">از:</span>
                <select
                  aria-label="نسخه مبدأ برای مقایسه"
                  value={fromVer}
                  onChange={(e) => {
                    setLoadingDiff(true);
                    setFromVer(Number(e.target.value));
                  }}
                  className="h-7 rounded border border-input bg-background px-2 font-mono text-[11px]"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version}
                      {v.version === report.version ? " (فعلی)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">به:</span>
                <select
                  aria-label="نسخه مقصد برای مقایسه"
                  value={toVer}
                  onChange={(e) => {
                    setLoadingDiff(true);
                    setToVer(Number(e.target.value));
                  }}
                  className="h-7 rounded border border-input bg-background px-2 font-mono text-[11px]"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version}
                      {v.version === report.version ? " (فعلی)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setOnlyChanges((prev) => !prev)}
                className={cn(
                  "h-7 rounded border px-2 font-mono text-[10.5px] transition-colors",
                  onlyChanges
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {onlyChanges ? "نمایش: فقط تغییرات" : "نمایش: متن کامل"}
              </button>
            </div>
          )}
        </div>

        {loadingDiff && (
          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            در حال محاسبه تفاوت نسخه‌ها…
          </div>
        )}

        {diff && (
          <>
            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 font-mono text-emerald-700 dark:text-emerald-300">
                +{diff.added_lines} افزوده
              </span>
              <span className="rounded border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 font-mono text-rose-700 dark:text-rose-300">
                -{diff.removed_lines} حذف‌شده
              </span>
              <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono text-muted-foreground">
                {diff.unchanged_lines} بدون تغییر
              </span>
              {diff.title_changed && (
                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                  تغییر عنوان: «{diff.from_title}» → «{diff.to_title}»
                </span>
              )}
            </div>

            {visibleDiffLines.length === 0 ? (
              <EmptyNote>
                {fromVer === toVer
                  ? "دو نسخه یکسان انتخاب شده‌اند. یک نسخه قبلی را برای مشاهده تفاوت انتخاب کنید."
                  : "تفاوتی در متن بین این دو نسخه یافت نشد."}
              </EmptyNote>
            ) : (
              <div
                dir={dir}
                className="max-h-72 overflow-y-auto rounded-md border border-border bg-card font-mono text-[11px]"
              >
                {visibleDiffLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-start gap-2 border-b border-border/40 px-2.5 py-1 last:border-0",
                      line.type === "added" &&
                        "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                      line.type === "removed" &&
                        "bg-rose-500/10 text-rose-800 dark:text-rose-200",
                      line.type === "unchanged" && "text-muted-foreground",
                    )}
                  >
                    <span className="w-8 shrink-0 select-none text-right opacity-60 tabular-nums">
                      {line.old_line ?? ""}
                    </span>
                    <span className="w-8 shrink-0 select-none text-right opacity-60 tabular-nums">
                      {line.new_line ?? ""}
                    </span>
                    <span className="w-3 shrink-0 select-none font-bold">
                      {line.type === "added"
                        ? "+"
                        : line.type === "removed"
                          ? "-"
                          : " "}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 whitespace-pre-wrap break-words",
                        dir === "rtl" ? "text-right" : "text-left",
                      )}
                    >
                      {line.text || " "}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background/80 p-3.5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="size-4 text-[var(--term-ok)]" />
            <div>
              <div className="text-[13px] font-semibold">
                تاریخچه نسخه‌های گزارش ({versions.length})
              </div>
              <div className="text-[11px] text-muted-foreground">
                بازگشت به نسخه‌های قبلی بدون حذف تاریخچه تغییرات
              </div>
            </div>
          </div>
          {loadingVersions && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {versions.length === 0 ? (
          <EmptyNote>نسخه‌ای برای این گزارش ثبت نشده است.</EmptyNote>
        ) : (
          <div className="space-y-2">
            {versions.map((ver) => {
              const isCurrent = ver.version === report.version;
              const isRestoring = restoringVersion === ver.version;
              return (
                <div
                  key={ver.version}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5",
                    isCurrent
                      ? "border-emerald-500/45 bg-emerald-500/[0.04]"
                      : "border-border bg-card",
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="rounded px-1.5 py-0 font-mono text-[10.5px] font-semibold"
                      >
                        v{ver.version}
                      </Badge>
                      {isCurrent && (
                        <Badge
                          variant="outline"
                          className="rounded border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 font-mono text-[10px] text-emerald-700 dark:text-emerald-300"
                        >
                          نسخه فعلی (Active)
                        </Badge>
                      )}
                      {ver.restored_from_version && (
                        <Badge
                          variant="outline"
                          className="rounded border-sky-500/40 bg-sky-500/10 px-1.5 py-0 font-mono text-[10px] text-sky-700 dark:text-sky-300"
                        >
                          بازیابی از v{ver.restored_from_version}
                        </Badge>
                      )}
                      <span className="truncate text-[12px] font-medium">
                        {ver.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {ver.change_note}
                    </div>
                    <div className="term-dim flex flex-wrap items-center gap-2 font-mono text-[10px]">
                      <span>{formatTs(ver.created_at)}</span>
                      <span>·</span>
                      <span>{ver.model}</span>
                      <span>·</span>
                      <span>by {ver.created_by}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {!isCurrent && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setLoadingDiff(true);
                            setFromVer(ver.version);
                            setToVer(report.version);
                          }}
                        >
                          <GitCompare className="size-3.5" />
                          مقایسه با فعلی
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-[11px]"
                          disabled={restoringVersion !== null}
                          onClick={() => void handleRestore(ver.version)}
                        >
                          {isRestoring ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          بازیابی v{ver.version}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
