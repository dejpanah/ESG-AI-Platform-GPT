import type {
  ResolvedDirection,
  TextDirectionMode,
} from "@/lib/text-direction";
import { cn } from "@/lib/utils";
import { AlignLeft, AlignRight } from "lucide-react";

const OPTIONS: { value: TextDirectionMode; label: string; title: string }[] = [
  { value: "auto", label: "Auto", title: "Auto-detect LTR / RTL from text" },
  { value: "rtl", label: "RTL", title: "Force Right-to-Left view" },
  { value: "ltr", label: "LTR", title: "Force Left-to-Right view" },
];

export function DirectionToggle({
  value,
  resolved,
  onChange,
  className,
}: {
  value: TextDirectionMode;
  resolved?: ResolvedDirection;
  onChange: (mode: TextDirectionMode) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Text direction"
      className={cn(
        "inline-flex h-7 items-center rounded-md border border-border bg-background p-0.5",
        className,
      )}
    >
      <span
        className="term-dim flex items-center px-1.5"
        title={
          resolved
            ? `Active reading direction: ${resolved.toUpperCase()}`
            : "Reading direction"
        }
      >
        {resolved === "rtl" ? (
          <AlignRight className="size-3 text-[var(--term-ok)]" />
        ) : (
          <AlignLeft className="size-3" />
        )}
      </span>
      {OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-full rounded-[4px] px-1.5 font-mono text-[10px] font-medium tracking-wide transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
