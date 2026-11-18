import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

function renderInline(text: string, lightPrint = false): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong
          key={idx}
          className={cn(
            "font-semibold",
            lightPrint ? "text-zinc-950" : "text-foreground",
          )}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[12px]",
            lightPrint
              ? "bg-zinc-100 text-zinc-800"
              : "bg-muted text-foreground",
          )}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function ReportMarkdown({
  content,
  dir = "rtl",
  lightPrint = false,
}: {
  content: string;
  dir?: "rtl" | "ltr";
  lightPrint?: boolean;
}) {
  const lines = content.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let listItems: Array<{ ordered: boolean; text: string }> = [];

  const flushList = (keyBase: number) => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    const Tag = isOrdered ? "ol" : "ul";
    nodes.push(
      <Tag
        key={`list-${keyBase}`}
        className={cn(
          "my-2 space-y-1.5 text-[13px] leading-relaxed",
          isOrdered ? "list-decimal" : "list-disc",
          dir === "rtl" ? "pr-5" : "pl-5",
          lightPrint ? "text-zinc-800" : "text-foreground/90",
        )}
      >
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item.text, lightPrint)}</li>
        ))}
      </Tag>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(idx);
      return;
    }

    if (/^---+$/.test(line)) {
      flushList(idx);
      nodes.push(
        <hr
          key={`hr-${idx}`}
          className={cn(
            "my-4",
            lightPrint ? "border-zinc-200" : "border-border",
          )}
        />,
      );
      return;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      flushList(idx);
      nodes.push(
        <h1
          key={`h1-${idx}`}
          className={cn(
            "mt-1 mb-3 border-b pb-2 text-lg font-bold tracking-tight",
            lightPrint
              ? "border-zinc-200 text-zinc-950"
              : "border-border text-foreground",
          )}
        >
          {renderInline(h1[1], lightPrint)}
        </h1>,
      );
      return;
    }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flushList(idx);
      nodes.push(
        <h2
          key={`h2-${idx}`}
          className={cn(
            "mt-5 mb-2 text-[15px] font-semibold",
            lightPrint ? "text-zinc-900" : "text-foreground",
          )}
        >
          {renderInline(h2[1], lightPrint)}
        </h2>,
      );
      return;
    }

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      flushList(idx);
      nodes.push(
        <h3
          key={`h3-${idx}`}
          className={cn(
            "mt-3.5 mb-1.5 text-[13.5px] font-semibold",
            lightPrint ? "text-emerald-800" : "text-[var(--term-ok)]",
          )}
        >
          {renderInline(h3[1], lightPrint)}
        </h3>,
      );
      return;
    }

    const ulMatch = line.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      if (listItems.length > 0 && listItems[0].ordered) flushList(idx);
      listItems.push({ ordered: false, text: ulMatch[1] });
      return;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) flushList(idx);
      listItems.push({ ordered: true, text: olMatch[1] });
      return;
    }

    flushList(idx);
    nodes.push(
      <p
        key={`p-${idx}`}
        className={cn(
          "my-2 text-[13px] leading-relaxed",
          lightPrint ? "text-zinc-800" : "text-foreground/90",
        )}
      >
        {renderInline(line, lightPrint)}
      </p>,
    );
  });

  flushList(lines.length);

  return (
    <div dir={dir} className={cn(dir === "rtl" ? "text-right" : "text-left")}>
      {nodes}
    </div>
  );
}
