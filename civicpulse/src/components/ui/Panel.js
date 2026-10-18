export default function Panel({ children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block text-xs font-medium text-[var(--muted)] ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]';

export const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60';

export const btnGhost =
  'inline-flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--brand)]';
