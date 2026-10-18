export default function ProgressBar({ value = 0, className = '' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`flex min-w-[120px] items-center gap-2 ${className}`}>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bg-muted)]">
        <div
          className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--ink)]">
        {Math.round(pct)}%
      </span>
    </div>
  );
}
