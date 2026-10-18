import EmptyState from './EmptyState';
import LoadingBlock from './LoadingBlock';
import Pagination from './Pagination';

export default function DataTable({
  columns = [],
  rows = [],
  rowKey,
  loading = false,
  loadingLabel = 'Loading…',
  emptyTitle = 'No records',
  emptyDescription,
  pagination,
  maxHeight = 'min(60vh, 560px)',
  className = '',
}) {
  if (loading) return <LoadingBlock label={loadingLabel} />;

  if (!rows.length && !pagination?.total) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const getKey = (row, index) => {
    if (typeof rowKey === 'function') return rowKey(row, index);
    if (rowKey && row[rowKey] != null) return row[rowKey];
    return index;
  };

  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] ${className}`}
    >
      <div className="min-w-0 overflow-auto" style={{ maxHeight }}>
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg-muted)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)] ${
                    alignClass(col.align)
                  } ${col.headerClassName || ''}`}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((row, index) => (
              <tr key={getKey(row, index)} className="hover:bg-[var(--bg-muted)]/50">
                {columns.map((col) => {
                  const raw =
                    typeof col.accessor === 'function'
                      ? col.accessor(row, index)
                      : row[col.accessor || col.key];
                  const content = col.cell ? col.cell(row, index, raw) : formatCell(raw);
                  const title =
                    col.truncate !== false &&
                    (typeof content === 'string' || typeof content === 'number')
                      ? String(content)
                      : undefined;

                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 align-middle ${alignClass(col.align)} ${
                        col.className || ''
                      }`}
                      title={title}
                    >
                      {col.truncate === false ? (
                        content
                      ) : (
                        <div className="truncate" style={{ maxWidth: col.maxWidth || '16rem' }}>
                          {content}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination ? (
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          from={pagination.from}
          to={pagination.to}
          total={pagination.total}
          onPageChange={pagination.onPageChange}
          pageSize={pagination.pageSize}
          onPageSizeChange={pagination.onPageSizeChange}
          pageSizeOptions={pagination.pageSizeOptions}
        />
      ) : null}
    </div>
  );
}

function alignClass(align) {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function formatCell(value) {
  if (value == null || value === '') return '—';
  return value;
}
