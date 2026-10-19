export default function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-14 text-center shadow-soft">
      <div className="mx-auto mb-3 h-1.5 w-16 animate-pulse rounded-full bg-[var(--brand)]/40" />
      <p className="text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}
