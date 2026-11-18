import { useMemo, useState } from "react";
import { getWorkspaceId } from "@/api/client";
import type { AnswerDecision } from "@/api/types";
import { StatusDot, type Tone } from "@/components/StatusDot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SearchHistoryItem } from "@/hooks/use-search-history";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Download, History, Pencil, Play, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

function decisionTone(decision?: AnswerDecision): Tone {
  if (decision === "answer") return "ok";
  if (decision === "answer_with_uncertainty" || decision === "abstain") return "warn";
  return "idle";
}

function decisionLabel(decision?: AnswerDecision): string {
  if (decision === "answer") return "answered";
  if (decision === "answer_with_uncertainty") return "hedged";
  if (decision === "abstain") return "abstained";
  return "ran";
}

export function SearchHistoryPanel({
  items,
  pending = false,
  onRun,
  onPrefill,
  onRemove,
  onClear,
  className,
}: {
  items: SearchHistoryItem[];
  pending?: boolean;
  onRun: (item: SearchHistoryItem) => void;
  onPrefill?: (item: SearchHistoryItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  className?: string;
}) {
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.question.toLowerCase().includes(q));
  }, [items, filter]);

  const handleExport = () => {
    if (items.length === 0) return;
    const workspaceId = getWorkspaceId();
    const exportedAt = new Date().toISOString();
    const payload = {
      exportedAt,
      workspaceId,
      count: items.length,
      queries: items.map((item) => ({
        ...item,
        timestampIso: new Date(item.timestamp).toISOString(),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateSlug = exportedAt.slice(0, 10);
    link.href = url;
    link.download = `search-history-${workspaceId}-${dateSlug}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} ${items.length === 1 ? "query" : "queries"} as JSON`);
  };

  return (
    <aside
      aria-label="Search History"
      className={cn(
        "flex h-full min-h-0 flex-col bg-sidebar/60 text-foreground",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <History className="size-3.5 shrink-0 text-[var(--term-ok)]" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[12px] font-semibold tracking-tight">
            Search History
          </h2>
          <p className="term-dim truncate text-[10px]">
            {items.length === 0
              ? "Recent queries saved locally"
              : `${items.length} saved ${items.length === 1 ? "query" : "queries"}`}
          </p>
        </div>
        {items.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10.5px] text-muted-foreground hover:text-foreground"
              onClick={handleExport}
              title="Export search history as JSON"
            >
              <Download className="size-3" />
              Export
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10.5px] text-muted-foreground hover:text-foreground"
              onClick={onClear}
              title="Clear search history"
            >
              <Trash2 className="size-3" />
              Clear
            </Button>
          </div>
        ) : null}
      </header>

      {items.length > 0 ? (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter history…"
              className="h-7 bg-background pl-7 text-[11px]"
            />
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card/60 px-3 py-5 text-center">
            <p className="text-[11.5px] font-medium">No recent queries</p>
            <p className="term-dim mt-1 text-[10.5px] leading-4">
              Questions you ask are persisted in local storage so you can re-run
              them in one click.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="term-dim px-2 py-4 text-center text-[11px]">
            No history entries match &ldquo;{filter.trim()}&rdquo;.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visible.map((item) => (
              <li
                key={item.id}
                className="group rounded-md border border-border bg-card transition-colors hover:border-[var(--term-ok)]/50"
              >
                <div className="flex items-start gap-1.5 px-2.5 pt-2 pb-1.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onRun(item)}
                    title="Re-execute query"
                    className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <p className="line-clamp-3 text-[11.5px] leading-4.5 font-medium text-foreground group-hover:text-[var(--term-ok)]">
                      {item.question}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onRun(item)}
                      aria-label={`Re-run: ${item.question}`}
                      title="Re-execute query"
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-[var(--term-ok)] disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Play className="size-3" />
                    </button>
                    {onPrefill ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onPrefill(item)}
                        aria-label={`Edit in prompt: ${item.question}`}
                        title="Load into prompt"
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Pencil className="size-3" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      aria-label={`Remove from history: ${item.question}`}
                      title="Remove"
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-[var(--term-bad)]"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 px-2.5 py-1 text-[10px]">
                  <span className="flex items-center gap-1">
                    <StatusDot tone={decisionTone(item.decision)} />
                    <span className="term-dim">{decisionLabel(item.decision)}</span>
                  </span>
                  {item.citationCount !== undefined ? (
                    <span className="term-dim tabular-nums">
                      · {item.citationCount}{" "}
                      {item.citationCount === 1 ? "source" : "sources"}
                    </span>
                  ) : null}
                  {item.requireCitations ? (
                    <span className="rounded border border-border px-1 py-0 text-[9px] text-muted-foreground">
                      cited-only
                    </span>
                  ) : null}
                  <span className="term-dim ml-auto tabular-nums">
                    {formatRelative(item.timestamp)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
