import { useMemo, useState } from 'react';
import { getWards } from '../api/wards';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FilterBar, { FilterSearch } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

export default function WardsPage() {
  const { data: wards, loading, error } = useApi(getWards, []);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (wards || []).filter(
      (w) =>
        !q ||
        String(w.ward_no).includes(q) ||
        (w.name || '').toLowerCase().includes(q) ||
        (w.parts || []).join(',').includes(q)
    );
  }, [wards, query]);

  const pager = usePagination(filtered, pageSize);

  const columns = useMemo(
    () => [
      {
        key: 'ward_no',
        header: 'Ward',
        accessor: 'ward_no',
        className: 'font-bold tabular-nums',
        width: '4rem',
      },
      {
        key: 'name',
        header: 'Name',
        accessor: 'name',
        className: 'font-semibold',
      },
      {
        key: 'notes',
        header: 'Notes',
        accessor: (r) => r.notes || '—',
        className: 'text-[var(--muted)]',
      },
      {
        key: 'parts',
        header: 'Parts',
        accessor: (r) => (r.parts || []).join(', ') || '—',
        className: 'text-xs text-[var(--muted)]',
      },
    ],
    []
  );

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Geography"
        title="Wards"
        description="City wards linked to booth parts for planning."
      />
      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Filter ward or part…" />
      </FilterBar>
      <AlertBanner tone="danger">{error}</AlertBanner>
      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey="id"
        loading={loading}
        emptyTitle="No wards yet"
        emptyDescription="Wards will show here once they are set up for Eluru."
        emptyActionLabel="See booths"
        emptyActionTo="/app/booths"
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
