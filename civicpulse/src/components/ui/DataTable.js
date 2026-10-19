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
  emptyActionLabel,
  emptyActionTo,
  pagination,
  maxHeight = 'min(62vh, 580px)',
  className = '',
  onRowClick,
  selectedKey,
  dense = false,
}) {
  if (loading) return <LoadingBlock label={loadingLabel} />;

  if (!rows.length && !pagination?.total) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        actionTo={emptyActionTo}
      />
    );
  }

  const getKey = (row, index) => {
    if (typeof rowKey === 'function') return rowKey(row, index);
    if (rowKey && row[rowKey] != null) return row[rowKey];
    return index;
  };

  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-soft ${className}`}
    >
      <div className="min-w-0 overflow-auto" style={{ maxHeight }}>
        <table className={`w-full min-w-[640px] border-collapse text-left ${dense ? 'text-[13px]' : 'text-sm'}`}>
          <thead className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg-muted)]/95 backdrop-blur-sm">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`whitespace-nowrap ${dense ? 'px-2.5' : 'px-3.5'} ${dense ? 'py-2.5' : 'py-3'} text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--muted)] ${alignClass(
                    col.align
                  )} ${col.headerClassName || ''}`}
                  style={{
                    ...(col.width ? { width: col.width, minWidth: col.width } : {}),
                    ...stickyProps(col, true),
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map((row, index) => (
              <tr
                key={getKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                className={`transition-colors hover:bg-[var(--bg-muted)]/55 ${
                  onRowClick ? 'cursor-pointer' : ''
                } ${
                  selectedKey != null && String(getKey(row, index)) === String(selectedKey)
                    ? 'bg-[var(--bg-muted)]'
                    : ''
                }`}
              >
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
                      className={`${dense ? 'px-2.5' : 'px-3.5'} ${dense ? 'py-2' : 'py-3'} align-middle ${alignClass(col.align)} ${
                        col.className || ''
                      }`}
                      title={title}
                      style={stickyProps(col, false)}
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

/** Pin a column to the left or right edge while the table scrolls sideways. */
function stickyProps(col, isHeader) {
  if (!col.sticky) return {};
  const side = col.sticky === 'right' ? 'right' : 'left';
  return {
    position: 'sticky',
    [side]: side === 'left' ? col.stickyOffset || 0 : 0,
    zIndex: isHeader ? 3 : 1,
    background: isHeader ? 'var(--bg-muted)' : 'var(--bg-elevated)',
    boxShadow: side === 'left' ? 'inset -1px 0 0 var(--line)' : 'inset 1px 0 0 var(--line)',
  };
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
