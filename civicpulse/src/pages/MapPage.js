import { useMemo, useState } from 'react';
import { getMapBooths } from '../api/map';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FilterBar, { FilterSearch } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import ProgressBar from '../components/ui/ProgressBar';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

export default function MapPage() {
  const { data: booths, loading, error } = useApi(getMapBooths, []);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (booths || []).filter(
      (b) =>
        !q ||
        String(b.part_no).includes(q) ||
        (b.area_name || '').toLowerCase().includes(q)
    );
  }, [booths, query]);

  const pager = usePagination(filtered, pageSize);

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
        key: 'agent_name',
        header: 'Agent',
        accessor: (r) => r.agent_name || '—',
      },
      {
        key: 'voter_count',
        header: 'Voters',
        accessor: (r) => r.voter_count || 0,
        align: 'right',
        className: 'tabular-nums',
        width: '5rem',
      },
      {
        key: 'coverage',
        header: 'Coverage',
        truncate: false,
        cell: (r) => <ProgressBar value={r.coverage_pct || 0} />,
        width: '9rem',
      },
    ],
    []
  );

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Geography"
        title="Map"
        description="Booth coverage at a glance across Eluru parts."
      />
      <AlertBanner tone="danger">{error}</AlertBanner>

      {!loading && booths?.length ? (
        <Panel className="relative min-h-[200px] overflow-hidden p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {booths.slice(0, 60).map((b) => (
              <span
                key={b.part_no}
                title={`Part ${b.part_no} · ${Math.round(b.coverage_pct || 0)}%`}
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg)] px-2 text-xs font-bold text-[var(--ink)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                {b.part_no}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Showing first {Math.min(60, booths.length)} of {booths.length} parts
          </p>
        </Panel>
      ) : null}

      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Filter part or area…" />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey="part_no"
        loading={loading}
        emptyTitle="No booths on map yet"
        emptyDescription="Upload voter rolls so booth parts appear on the map."
        emptyActionLabel="Go to Data"
        emptyActionTo="/app/data"
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
