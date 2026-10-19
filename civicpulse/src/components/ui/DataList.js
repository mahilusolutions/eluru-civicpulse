import DataTable from './DataTable';
import LoadingBlock from './LoadingBlock';
import Pagination from './Pagination';

/**
 * One list, two layouts: a table on wide screens and cards on phones/tablets
 * (the person can switch). Pages give it columns for the table and renderCard for cards.
 */
export default function DataList({
  view,
  columns,
  rows,
  rowKey,
  renderCard,
  loading = false,
  pagination,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyActionLabel,
  emptyActionTo,
  cardGrid = 'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  onRowClick,
}) {
  const getKey = (row, i) => (typeof rowKey === 'function' ? rowKey(row, i) : row[rowKey] ?? i);

  return (
    <>
      <div className={`hidden ${view === 'table' ? 'md:block' : ''}`}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={rowKey}
          loading={loading}
          dense
          maxHeight="none"
          onRowClick={onRowClick}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyActionLabel={emptyActionLabel}
          emptyActionTo={emptyActionTo}
          pagination={pagination}
        />
      </div>

      <div className={view === 'table' ? 'md:hidden' : ''}>
        {loading ? (
          <LoadingBlock label="Loading…" />
        ) : rows.length ? (
          <>
            <ul className={`grid gap-2.5 ${cardGrid}`}>
              {rows.map((row, i) => (
                <li key={getKey(row, i)}>{renderCard(row)}</li>
              ))}
            </ul>
            {pagination ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-soft">
                <Pagination {...pagination} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-10 text-center">
            <p className="text-sm font-bold text-[var(--ink)]">{emptyTitle}</p>
            {emptyDescription ? <p className="mt-1 text-sm text-[var(--muted)]">{emptyDescription}</p> : null}
          </div>
        )}
      </div>
    </>
  );
}

/** Shell every phone card shares. */
export function CardShell({ children, className = '' }) {
  return <div className={`h-full rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3.5 shadow-soft ${className}`}>{children}</div>;
}
