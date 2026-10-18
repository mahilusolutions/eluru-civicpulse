import { useMemo, useState } from 'react';
import { getElectionDay, updateElectionDay } from '../api/electionDay';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FilterBar, { FilterSearch } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

export default function ElectionDayPage() {
  const { data: rows, loading, error, reload } = useApi(getElectionDay, []);
  const [busy, setBusy] = useState(null);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter(
      (r) =>
        !q ||
        String(r.part_no).includes(q) ||
        (r.area_name || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const pager = usePagination(filtered, pageSize);

  async function bump(part, field, delta) {
    const row = (rows || []).find((r) => r.part_no === part);
    if (!row) return;
    setBusy(part);
    try {
      await updateElectionDay(part, { [field]: Math.max(0, (row[field] || 0) + delta) });
      reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(null);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'part_no',
        header: 'Part',
        accessor: 'part_no',
        className: 'font-bold tabular-nums',
        width: '4rem',
      },
      {
        key: 'area_name',
        header: 'Area',
        accessor: (r) => r.area_name || '—',
      },
      {
        key: 'slips',
        header: 'Slips',
        truncate: false,
        cell: (row) => (
          <span className="inline-flex items-center gap-2">
            <span className="tabular-nums font-semibold">{row.slip_printed || 0}</span>
            <button
              type="button"
              disabled={busy === row.part_no}
              onClick={() => bump(row.part_no, 'slip_printed', 10)}
              className="text-xs font-semibold text-[var(--brand)] disabled:opacity-50"
            >
              +10
            </button>
          </span>
        ),
      },
      {
        key: 'voted',
        header: 'Voted',
        truncate: false,
        cell: (row) => (
          <span className="inline-flex items-center gap-2">
            <span className="tabular-nums font-semibold">{row.voted_count || 0}</span>
            <button
              type="button"
              disabled={busy === row.part_no}
              onClick={() => bump(row.part_no, 'voted_count', 5)}
              className="text-xs font-semibold text-[var(--brand)] disabled:opacity-50"
            >
              +5
            </button>
          </span>
        ),
      },
      {
        key: 'missing',
        header: 'Missing',
        accessor: (r) => r.missing_count || 0,
        align: 'right',
        className: 'tabular-nums',
        width: '5rem',
      },
      {
        key: 'turnout',
        header: 'Turnout',
        accessor: (r) => `${Math.round(r.turnout_pct || 0)}%`,
        align: 'right',
        className: 'font-semibold tabular-nums',
        width: '5rem',
      },
    ],
    [busy, rows]
  );

  return (
    <section className="space-y-4">
      <PageHeader title="Election Day" description="Slips, turnout, and missing voters." />
      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Filter part or area…" />
      </FilterBar>
      <AlertBanner tone="danger">{error}</AlertBanner>
      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey="part_no"
        loading={loading}
        emptyTitle="No booth stats yet"
        pagination={{
          page: pager.page,
          pageCount: pager.pageCount,
          from: pager.from,
          to: pager.to,
          total: pager.total,
          pageSize,
          onPageChange: pager.setPage,
          onPageSizeChange: setPageSize,
        }}
      />
    </section>
  );
}
