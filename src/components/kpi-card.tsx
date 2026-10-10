import { cn } from "@/lib/utils";

type Tom = "default" | "gain" | "loss" | "warn" | "accent";

const TOM: Record<Tom, string> = {
  default: "text-fg",
  gain: "text-gain",
  loss: "text-loss",
  warn: "text-warn",
  accent: "text-accent",
};

export function KpiCard({
  label,
  value,
  hint,
  tom = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tom?: Tom;
}) {
  return (
    <article className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={cn("mt-2 font-mono text-[1.35rem] font-medium tabular leading-none", TOM[tom])}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-subtle">{hint}</p> : null}
    </article>
  );
}
