/** Toolbar under the top nav — no page title (nav already shows it). */
export default function PageHeader({ description, actions }) {
  if (!description && !actions) return null;

  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {description ? (
        <p className="min-w-0 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      ) : (
        <span />
      )}
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
