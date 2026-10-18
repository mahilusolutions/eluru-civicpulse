import { useMemo, useState } from 'react';
import { getBooths } from '../api/booths';
import { getHouseholds } from '../api/households';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FilterBar, { FilterSelect } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

export default function HouseholdsPage() {
  const [part, setPart] = useState('all');
  const [pageSize, setPageSize] = useState(25);
  const { data: booths } = useApi(getBooths, []);
  const { data: households, loading, error } = useApi(
    () => getHouseholds({ part }),
    [part]
  );
  const pager = usePagination(households || [], pageSize);

  const partOptions = useMemo(
    () => [
      { value: 'all', label: 'All parts' },
      ...(booths || []).map((b) => ({
        value: String(b.part_no),
        label: `Part ${b.part_no}`,
      })),
    ],
    [booths]
  );

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
        key: 'house_no',
        header: 'House',
        accessor: 'house_no',
        className: 'font-semibold',
      },
      {
        key: 'head_name',
        header: 'Sample name',
        accessor: (r) => r.head_name || '—',
      },
      {
        key: 'member_count',
        header: 'Members',
        accessor: 'member_count',
        align: 'right',
        className: 'tabular-nums font-semibold',
        width: '5.5rem',
      },
    ],
    []
  );

  return (
    <section className="space-y-4">
      <PageHeader title="Households" description="Electors grouped by house number." />
      <FilterBar>
        <FilterSelect label="Part" value={part} onChange={setPart} options={partOptions} />
      </FilterBar>
      <AlertBanner tone="danger">{error}</AlertBanner>
      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey={(r) => `${r.part_no}-${r.house_no}`}
        loading={loading}
        emptyTitle="No households yet"
        emptyDescription="Load voters with house numbers first."
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
