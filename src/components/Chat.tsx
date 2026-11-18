import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { askKnowledgeStream } from "@/api/knowledge";
import type { AnswerDecision, ChatResponse } from "@/api/types";
import { Answer } from "@/components/Answer";
import { DirectionToggle } from "@/components/DirectionToggle";
import { Button } from "@/components/ui/button";
import {
  ESG_SUGGESTED_QUERIES,
  matchSuggestedQueries,
  type SuggestedQuery,
} from "@/lib/suggested-queries";
import {
  loadSavedDirection,
  resolveTextDirection,
  saveDirection,
  type TextDirectionMode,
} from "@/lib/text-direction";
import { cn } from "@/lib/utils";
import { CornerDownLeft, Loader2, Sparkles } from "lucide-react";

interface Turn {
  id: string;
  question: string;
  response: ChatResponse;
}

export interface ChatHandle {
  ask: (question: string, citationsOnly?: boolean) => void;
  prefill: (question: string, citationsOnly?: boolean) => void;
}

export interface ChatProps {
  ref?: Ref<ChatHandle>;
  headerActions?: ReactNode;
  onPendingChange?: (pending: boolean) => void;
  onQueryComplete?: (entry: {
    question: string;
    requireCitations: boolean;
    decision?: AnswerDecision;
    citationCount?: number;
  }) => void;
}

export function Chat({
  ref,
  headerActions,
  onPendingChange,
  onQueryComplete,
}: ChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requireCitations, setRequireCitations] = useState(false);
  const [focused, setFocused] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const [dirMode, setDirMode] = useState<TextDirectionMode>(() =>
    loadSavedDirection("chat", "auto"),
  );
  const abortRef = useRef<AbortController | null>(null);
  const counter = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, pending]);

  const suggestions = useMemo<SuggestedQuery[]>(() => {
    if (pending || suggestionsDismissed) return [];
    return matchSuggestedQueries(input, 5);
  }, [input, pending, suggestionsDismissed]);

  const showSuggestions = focused && suggestions.length > 0;

  const executeQuery = useCallback(
    async (rawQuestion: string, citationsOnly: boolean) => {
      const question = rawQuestion.trim();
      if (!question || pending) return;
      setInput("");
      setSuggestionsDismissed(false);
      setActiveSuggestionIdx(-1);
      setPending(true);
      onPendingChange?.(true);
      setStreamingAnswer("");
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await askKnowledgeStream(
          question,
          controller.signal,
          (token) => setStreamingAnswer((current) => current + token),
          { requireCitations: citationsOnly },
        );
        counter.current += 1;
        setTurns((current) => [
          ...current,
          { id: `turn-${counter.current}`, question, response },
        ]);
        onQueryComplete?.({
          question,
          requireCitations: citationsOnly,
          decision: response.evidence.decision,
          citationCount: response.citations.length,
        });
      } catch (value) {
        if (!controller.signal.aborted) {
          setError(value instanceof Error ? value.message : "Query failed");
          onQueryComplete?.({
            question,
            requireCitations: citationsOnly,
          });
        }
      } finally {
        if (!controller.signal.aborted) {
          setPending(false);
          onPendingChange?.(false);
          setStreamingAnswer("");
        }
      }
    },
    [pending, onPendingChange, onQueryComplete],
  );

  useImperativeHandle(
    ref,
    () => ({
      ask: (question: string, citationsOnly?: boolean) => {
        const useCitations = citationsOnly ?? requireCitations;
        if (citationsOnly !== undefined) setRequireCitations(citationsOnly);
        void executeQuery(question, useCitations);
      },
      prefill: (question: string, citationsOnly?: boolean) => {
        setInput(question);
        setSuggestionsDismissed(true);
        setActiveSuggestionIdx(-1);
        if (citationsOnly !== undefined) setRequireCitations(citationsOnly);
        textareaRef.current?.focus();
      },
    }),
    [executeQuery, requireCitations],
  );

  const submit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      await executeQuery(input, requireCitations);
    },
    [executeQuery, input, requireCitations],
  );

  const applySuggestion = useCallback((item: SuggestedQuery, runImmediately: boolean) => {
    if (runImmediately) {
      void executeQuery(item.question, requireCitations);
    } else {
      setInput(item.question);
      setSuggestionsDismissed(true);
      setActiveSuggestionIdx(-1);
      textareaRef.current?.focus();
    }
  }, [executeQuery, requireCitations]);

  const inputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showSuggestions) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveSuggestionIdx((idx) => (idx + 1) % suggestions.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveSuggestionIdx((idx) =>
            idx <= 0 ? suggestions.length - 1 : idx - 1,
          );
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSuggestionsDismissed(true);
          setActiveSuggestionIdx(-1);
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          const chosen = suggestions[activeSuggestionIdx >= 0 ? activeSuggestionIdx : 0];
          if (chosen) applySuggestion(chosen, false);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey && activeSuggestionIdx >= 0) {
          event.preventDefault();
          const chosen = suggestions[activeSuggestionIdx];
          if (chosen) applySuggestion(chosen, true);
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submit();
      }
    },
    [showSuggestions, suggestions, activeSuggestionIdx, applySuggestion, submit],
  );

  const starterQueries = ESG_SUGGESTED_QUERIES.slice(0, 4);

  const handleDirChange = useCallback((mode: TextDirectionMode) => {
    setDirMode(mode);
    saveDirection("chat", mode);
  }, []);

  const headerResolvedDir = useMemo(() => {
    const sample =
      streamingAnswer ||
      turns[turns.length - 1]?.response.answer ||
      input;
    return resolveTextDirection(dirMode, sample);
  }, [dirMode, streamingAnswer, turns, input]);

  const streamingDir = useMemo(
    () => resolveTextDirection(dirMode, streamingAnswer),
    [dirMode, streamingAnswer],
  );

  const inputDir = useMemo(() => {
    if (dirMode !== "auto") return dirMode;
    return input.trim() ? resolveTextDirection("auto", input) : "ltr";
  }, [dirMode, input]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <h2 className="text-[13px] font-semibold tracking-tight">
            Ask your Knowledge Base
          </h2>
          <div className="ml-auto flex items-center gap-1.5">
            <DirectionToggle
              value={dirMode}
              resolved={headerResolvedDir}
              onChange={handleDirChange}
            />
            {headerActions}
          </div>
        </div>
      </header>
      <div
        ref={scrollRef}
        className="term-grid min-h-0 flex-1 overflow-y-auto px-4 py-5"
      >
        <div className="mx-auto w-full max-w-3xl space-y-7">
          {turns.length === 0 && !pending ? (
            <div className="flex min-h-[320px] items-center justify-center text-center">
              <div className="max-w-lg space-y-4">
                <div>
                  <h1 className="text-xl font-bold tracking-tight">
                    Ask your documents
                  </h1>
                  <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                    Ask a question about indexed documents. Answers include the
                    evidence used by retrieval.
                  </p>
                </div>
                <div className="space-y-1.5 text-left">
                  <p className="term-dim flex items-center justify-center gap-1.5 text-[10px] tracking-[0.12em] uppercase">
                    <Sparkles className="size-3 text-[var(--term-ok)]" />
                    Common ESG questions
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {starterQueries.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void executeQuery(item.question, requireCitations)}
                        className="rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-[var(--term-ok)]/50 hover:bg-accent/50"
                      >
                        <span className="term-dim block text-[9.5px] tracking-wider uppercase">
                          {item.category}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-foreground">
                          {item.question}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {turns.map((turn) => {
            const questionDir = resolveTextDirection(dirMode, turn.question);
            return (
              <div key={turn.id} className="space-y-3">
                <div className="flex items-start gap-2">
                  <span className="term-dim shrink-0 text-[12px] leading-6">
                    user
                  </span>
                  <span className="text-[var(--term-ok)]">❯</span>
                  <span
                    dir={questionDir}
                    className={cn(
                      "min-w-0 flex-1 text-[12.5px] leading-6 font-medium",
                      questionDir === "rtl" ? "text-right" : "text-left",
                    )}
                  >
                    {turn.question}
                  </span>
                </div>
                <Answer
                  response={turn.response}
                  directionMode={dirMode}
                  onOpenSource={() => undefined}
                />
              </div>
            );
          })}
          {pending ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Streaming answer…
              </div>
              {streamingAnswer ? (
                <div
                  dir={streamingDir}
                  className={cn(
                    "rounded-lg border border-border bg-card px-3 py-3 text-[12.5px] leading-6 whitespace-pre-wrap",
                    streamingDir === "rtl" ? "text-right" : "text-left",
                  )}
                >
                  {streamingAnswer}
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-[var(--term-bad)]/40 bg-[var(--term-bad)]/10 px-3 py-2 text-[11.5px] text-[var(--term-bad)]">
              {error}
            </div>
          ) : null}
        </div>
      </div>
      <div className="relative shrink-0 border-t border-border bg-card px-4 py-3">
        <form
          className="mx-auto flex w-full max-w-3xl flex-col gap-2"
          onSubmit={(event) => void submit(event)}
        >
          {showSuggestions ? (
            <div
              role="listbox"
              aria-label="Suggested ESG queries"
              className="overflow-hidden rounded-lg border border-border bg-background"
            >
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5 text-[10px]">
                <span className="flex items-center gap-1.5 font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  <Sparkles className="size-3 text-[var(--term-ok)]" />
                  Suggested ESG queries
                </span>
                <span className="term-dim hidden sm:inline">
                  ↑↓ select · Tab fill · Enter ask · Esc close
                </span>
              </div>
              <ul className="divide-y divide-border/70">
                {suggestions.map((item, idx) => {
                  const active = idx === activeSuggestionIdx;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveSuggestionIdx(idx)}
                        onClick={() => applySuggestion(item, true)}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[11.5px] transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted/50",
                        )}
                      >
                        <span className="text-[var(--term-ok)]">❯</span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {item.question}
                        </span>
                        <span className="term-dim shrink-0 rounded border border-border px-1.5 py-0.5 text-[9.5px] uppercase">
                          {item.category}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2 px-1 text-[12px] text-muted-foreground select-none">
            <input
              type="checkbox"
              className="size-3.5 accent-[var(--term-ok)]"
              checked={requireCitations}
              disabled={pending}
              onChange={(event) => setRequireCitations(event.target.checked)}
            />
            <span>
              پاسخ فقط با استناد
              <span className="term-dim">
                {" "}
                — فقط از شواهد بازیابی‌شده؛ بدون حدس (حوزه‌های حساس)
              </span>
            </span>
          </label>
          <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <span className="term-ok pb-1.5 text-[14px] leading-5 font-bold">
              ❯
            </span>
            <textarea
              ref={textareaRef}
              dir={inputDir}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setSuggestionsDismissed(false);
                setActiveSuggestionIdx(-1);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={inputKeyDown}
              disabled={pending}
              rows={1}
              placeholder="Ask about your indexed documents…"
              className={cn(
                "min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[13px] leading-6 outline-none",
                inputDir === "rtl" ? "text-right" : "text-left",
              )}
            />
            <Button
              type="submit"
              size="sm"
              disabled={pending || !input.trim()}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CornerDownLeft className="size-3.5" />
              )}{" "}
              Ask
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
