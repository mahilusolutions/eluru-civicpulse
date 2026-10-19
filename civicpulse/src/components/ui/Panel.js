export default function Panel({ children, className = '', padded = false }) {
  return (
    <div
      className={`rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-soft ${
        padded ? 'p-4 sm:p-5' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block text-xs font-semibold text-[var(--muted)] ${className}`}>
      {label}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15';

export const btnPrimary =
  'inline-flex items-center justify-center rounded-xl bg-[var(--brand)] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60';

export const btnGhost =
  'inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3.5 py-2.5 text-sm font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]';
