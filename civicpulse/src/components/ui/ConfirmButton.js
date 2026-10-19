import { useState } from 'react';

/** A delete button that asks "sure?" first, so one stray click cannot remove anything. */
export default function ConfirmButton({ label = 'Delete', confirmLabel = 'Yes, delete', onConfirm, disabled = false }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAsking(true)}
        className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/10 disabled:opacity-60"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={onConfirm}
        className="rounded-xl bg-[var(--danger)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
        Cancel
      </button>
    </span>
  );
}
