export default function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-12 text-center text-sm text-[var(--muted)]">
      {label}
    </div>
  );
}
