import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({
  page,
  pageCount,
  from,
  to,
  total,
  onPageChange,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageSizeChange,
}) {
  if (total === 0) return null;

  const canPrev = page > 1;
  const canNext = page < pageCount;

  const windowPages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pageCount, page + 2);
  for (let i = start; i <= end; i += 1) windowPages.push(i);

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-xs text-[var(--muted)]">
        Showing <span className="font-semibold text-[var(--ink)]">{from}</span>–
        <span className="font-semibold text-[var(--ink)]">{to}</span> of{' '}
        <span className="font-semibold text-[var(--ink)]">{total}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-xs font-semibold text-[var(--ink)] outline-none focus:border-[var(--brand)]"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--ink)] transition hover:bg-[var(--bg-muted)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {start > 1 ? (
            <>
              <PageBtn page={1} current={page} onPageChange={onPageChange} />
              {start > 2 ? (
                <span className="px-1 text-xs text-[var(--muted)]">…</span>
              ) : null}
            </>
          ) : null}

          {windowPages.map((p) => (
            <PageBtn key={p} page={p} current={page} onPageChange={onPageChange} />
          ))}

          {end < pageCount ? (
            <>
              {end < pageCount - 1 ? (
                <span className="px-1 text-xs text-[var(--muted)]">…</span>
              ) : null}
              <PageBtn page={pageCount} current={page} onPageChange={onPageChange} />
            </>
          ) : null}

          <button
            type="button"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--ink)] transition hover:bg-[var(--bg-muted)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PageBtn({ page, current, onPageChange }) {
  const active = page === current;
  return (
    <button
      type="button"
      onClick={() => onPageChange(page)}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${
        active
          ? 'bg-[var(--brand)] text-white'
          : 'border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]'
      }`}
    >
      {page}
    </button>
  );
}
