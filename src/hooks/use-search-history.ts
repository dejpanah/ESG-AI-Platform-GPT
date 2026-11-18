import { useCallback, useState } from "react";
import { getWorkspaceId } from "@/api/client";
import type { AnswerDecision } from "@/api/types";

export interface SearchHistoryItem {
  id: string;
  question: string;
  timestamp: number;
  requireCitations: boolean;
  decision?: AnswerDecision;
  citationCount?: number;
}

const MAX_HISTORY_ITEMS = 50;

function getStorageKey(): string {
  return `knowledgeos.search_history:${getWorkspaceId()}`;
}

function loadHistory(): SearchHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SearchHistoryItem =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as SearchHistoryItem).id === "string" &&
          typeof (item as SearchHistoryItem).question === "string" &&
          typeof (item as SearchHistoryItem).timestamp === "number",
      )
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function persistHistory(items: SearchHistoryItem[]): void {
  try {
    window.localStorage.setItem(getStorageKey(), JSON.stringify(items));
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}

export function useSearchHistory() {
  const [items, setItems] = useState<SearchHistoryItem[]>(() => loadHistory());

  const recordQuery = useCallback(
    (entry: {
      question: string;
      requireCitations: boolean;
      decision?: AnswerDecision;
      citationCount?: number;
    }) => {
      const normalized = entry.question.trim();
      if (!normalized) return;

      setItems((prev) => {
        const filtered = prev.filter(
          (item) =>
            item.question.toLowerCase() !== normalized.toLowerCase() ||
            item.requireCitations !== entry.requireCitations,
        );
        const nextItem: SearchHistoryItem = {
          id: crypto.randomUUID(),
          question: normalized,
          timestamp: Date.now(),
          requireCitations: entry.requireCitations,
          decision: entry.decision,
          citationCount: entry.citationCount,
        };
        const next = [nextItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);
        persistHistory(next);
        return next;
      });
    },
    [],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      persistHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setItems([]);
    persistHistory([]);
  }, []);

  return {
    items,
    recordQuery,
    removeItem,
    clearHistory,
  };
}
