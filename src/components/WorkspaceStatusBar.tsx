import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { fetchOpenAIModels } from "@/api/knowledge";
import { fetchIndexes } from "@/api/indexes";
import { fetchProviders, type ProviderProfile } from "@/api/providers";
import type { RagIndex } from "@/api/types";
import { StatusDot, TONE_TEXT, type Tone } from "@/components/StatusDot";
import type { BackendHealth } from "@/hooks/use-backend-health";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Cpu, Database, RefreshCw } from "lucide-react";

interface LiveMeta {
  providers: ProviderProfile[];
  models: Array<{ id: string }>;
  indexes: RagIndex[];
  refreshing: boolean;
}

export function WorkspaceStatusBar({
  health,
  className,
}: {
  health: BackendHealth;
  className?: string;
}) {
  const [meta, setMeta] = useState<LiveMeta>({
    providers: [],
    models: [],
    indexes: [],
    refreshing: false,
  });

  const refreshMeta = useCallback((signal?: AbortSignal) => {
    Promise.allSettled([
      fetchProviders(signal),
      fetchOpenAIModels(signal),
      fetchIndexes(signal),
    ]).then(([provRes, modRes, idxRes]) => {
      if (signal?.aborted) return;
      setMeta((prev) => ({
        providers: provRes.status === "fulfilled" ? provRes.value : prev.providers,
        models: modRes.status === "fulfilled" ? modRes.value : prev.models,
        indexes: idxRes.status === "fulfilled" ? idxRes.value : prev.indexes,
        refreshing: false,
      }));
    });
  }, []);

  useEffect(() => {
    if (health.state !== "online") return;
    const controller = new AbortController();
    refreshMeta(controller.signal);
    const timer = window.setInterval(() => {
      refreshMeta(controller.signal);
    }, 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [health.state, refreshMeta]);

  const handleManualRefresh = () => {
    setMeta((prev) => ({ ...prev, refreshing: true }));
    refreshMeta();
  };

  const backendInfo = useMemo(() => {
    if (health.state === "online") {
      return {
        tone: "ok" as Tone,
        pulse: false,
        label: "RAG online",
        detail: health.data.version ? `v${health.data.version}` : "",
        title: `Connected to RAG backend${health.data.version ? ` (v${health.data.version})` : ""}`,
      };
    }
    if (health.state === "offline") {
      return {
        tone: "bad" as Tone,
        pulse: false,
        label: "RAG offline",
        detail: "unreachable",
        title: "Cannot reach RAG backend",
      };
    }
    return {
      tone: "idle" as Tone,
      pulse: true,
      label: "RAG connecting…",
      detail: "",
      title: "Checking RAG backend connection",
    };
  }, [health]);

  const modelInfo = useMemo(() => {
    if (health.state === "offline") {
      return {
        name: "Unavailable",
        sub: "",
        tone: "bad" as Tone,
        title: "Model unavailable while backend is offline",
      };
    }
    const activeProvider = meta.providers.find(
      (p) => p.enabled && (p.role === "Generation" || p.role === "Both"),
    );
    const modelName =
      activeProvider?.model ||
      meta.models[0]?.id ||
      (health.state === "online" ? "local-esg-synthesizer" : "Checking…");
    const embeddingName =
      health.state === "online" ? health.data.embeddingProvider : undefined;
    const providerLabel = activeProvider ? activeProvider.name : "local";
    return {
      name: modelName,
      sub: providerLabel,
      tone: (health.state === "online" ? "ok" : "idle") as Tone,
      title: `Active model: ${modelName} (${providerLabel})${embeddingName ? ` · Embeddings: ${embeddingName}` : ""}`,
    };
  }, [health, meta.providers, meta.models]);

  const indexInfo = useMemo(() => {
    if (health.state === "offline") {
      return {
        tone: "bad" as Tone,
        pulse: false,
        label: "offline",
        stats: "",
        title: "Index status unavailable while backend is offline",
      };
    }
    const building = meta.indexes.find((idx) => idx.state === "building");
    const active = meta.indexes.find((idx) => idx.state === "active");
    const fallbackId =
      health.state === "online" ? health.data.activeIndex : undefined;
    const docs =
      active?.documents ??
      (health.state === "online" ? health.data.documents : undefined);
    const chunks =
      active?.chunks ??
      (health.state === "online" ? health.data.chunks : undefined);

    if (building) {
      return {
        tone: "info" as Tone,
        pulse: true,
        label: `${building.id} · building`,
        stats:
          docs !== undefined && chunks !== undefined
            ? `${formatCount(docs)} docs · ${formatCount(chunks)} chunks`
            : "",
        title: `Building index ${building.id}`,
      };
    }

    if (active || fallbackId) {
      const id = active?.id ?? fallbackId ?? "active";
      return {
        tone: "ok" as Tone,
        pulse: false,
        label: `${id} · active`,
        stats:
          docs !== undefined && chunks !== undefined
            ? `${formatCount(docs)} docs · ${formatCount(chunks)} chunks`
            : "",
        title: `Active index: ${id}${active?.evaluated && active.evaluationScore ? ` (eval ${Math.round(active.evaluationScore * 100)}%)` : ""}`,
      };
    }

    if (meta.indexes.length > 0) {
      const first = meta.indexes[0];
      return {
        tone: "warn" as Tone,
        pulse: false,
        label: `${first.id} · ${first.state}`,
        stats: `${formatCount(first.documents)} docs`,
        title: `No active index (${first.id} is ${first.state})`,
      };
    }

    return {
      tone: (health.state === "checking" ? "idle" : "warn") as Tone,
      pulse: health.state === "checking",
      label: health.state === "checking" ? "checking…" : "no index",
      stats: "",
      title: "No active RAG index",
    };
  }, [health, meta.indexes]);

  return (
    <footer
      aria-label="Workspace status bar"
      className={cn(
        "flex h-8 shrink-0 items-center gap-x-3 overflow-x-auto border-t border-border bg-card px-3 font-mono text-[11px] sm:px-4",
        className,
      )}
    >
      {/* RAG Backend Connection */}
      <div
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
        title={backendInfo.title}
      >
        <StatusDot tone={backendInfo.tone} pulse={backendInfo.pulse} />
        <span className={cn("font-medium", TONE_TEXT[backendInfo.tone])}>
          {backendInfo.label}
        </span>
        {backendInfo.detail ? (
          <span className="term-dim hidden sm:inline">{backendInfo.detail}</span>
        ) : null}
      </div>

      <span aria-hidden className="h-3 w-px shrink-0 bg-border" />

      {/* Current Model */}
      <Link
        to="/models"
        title={modelInfo.title}
        className="flex min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
      >
        <Cpu className="size-3 shrink-0 text-[var(--term-info)]" />
        <span className="term-dim hidden md:inline">model:</span>
        <span className="max-w-[180px] truncate font-medium text-foreground">
          {modelInfo.name}
        </span>
        {modelInfo.sub ? (
          <span className="term-dim hidden lg:inline">({modelInfo.sub})</span>
        ) : null}
      </Link>

      <span aria-hidden className="h-3 w-px shrink-0 bg-border" />

      {/* Index Status */}
      <Link
        to="/indexes"
        title={indexInfo.title}
        className="flex min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
      >
        <Database className="size-3 shrink-0 text-[var(--term-ok)]" />
        <span className="term-dim hidden md:inline">index:</span>
        <StatusDot tone={indexInfo.tone} pulse={indexInfo.pulse} />
        <span className="font-medium text-foreground">{indexInfo.label}</span>
        {indexInfo.stats ? (
          <span className="term-dim hidden tabular-nums sm:inline">
            · {indexInfo.stats}
          </span>
        ) : null}
      </Link>

      {/* Right actions */}
      <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
        {health.state === "online" && health.data.fts5Active ? (
          <span className="term-dim hidden text-[10px] tracking-wider uppercase xl:inline">
            FTS5 ready
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={health.state !== "online" || meta.refreshing}
          title="Refresh model & index status"
          aria-label="Refresh status bar"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw
            className={cn("size-3", meta.refreshing && "animate-spin")}
          />
        </button>
      </div>
    </footer>
  );
}
