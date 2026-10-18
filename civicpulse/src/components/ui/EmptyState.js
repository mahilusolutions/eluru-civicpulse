export default function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-12 text-center">
      <p className="font-semibold text-[var(--ink)]">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{description}</p>
      ) : null}
    </div>
  );
}
