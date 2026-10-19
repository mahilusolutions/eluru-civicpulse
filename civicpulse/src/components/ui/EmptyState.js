import { Link } from 'react-router-dom';
import { btnPrimary, btnGhost } from './Panel';

export default function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  icon,
}) {
  return (
    <div className="cp-empty-enter rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)]/80 px-5 py-14 text-center shadow-soft">
      {icon ? (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-muted)] text-[var(--brand)]">
          {icon}
        </div>
      ) : (
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[var(--accent)]" />
      )}
      <p className="text-base font-bold text-[var(--ink)]">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      ) : null}
      {actionLabel && actionTo ? (
        <Link to={actionTo} className={`${btnPrimary} mt-5`}>
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && onAction && !actionTo ? (
        <button type="button" onClick={onAction} className={`${btnGhost} mt-5`}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
