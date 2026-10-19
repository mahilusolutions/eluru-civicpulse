import { useEffect, useMemo, useState } from 'react';
import { getBooths } from '../api/booths';
import { getVoters } from '../api/voters';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FilterBar, { FilterSearch, FilterSelect } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge, { labelForStatus, toneForStatus } from '../components/ui/StatusBadge';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

export default function VotersPage() {
  const [query, setQuery] = useState('');
  const [part, setPart] = useState('all');
  const [status, setStatus] = useState('all');
  const [pageSize, setPageSize] = useState(25);
  const [debounced, setDebounced] = useState({ q: '', part: 'all', status: 'all' });

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ q: query, part, status }), 250);
    return () => clearTimeout(t);
  }, [query, part, status]);

  const { data: booths } = useApi(getBooths, []);
  const { data, loading, error } = useApi(
    () =>
      getVoters({
        q: debounced.q || undefined,
        part: debounced.part,
        status: debounced.status,
        limit: 500,
      }),
    [debounced.q, debounced.part, debounced.status]
  );

  const pager = usePagination(data?.rows || [], pageSize);

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
        key: 'epic',
        header: 'EPIC',
        accessor: (r) => r.epic || '—',
        className: 'font-mono text-xs text-[var(--muted)]',
        width: '8.5rem',
      },
      {
        key: 'name',
        header: 'Name',
        accessor: 'name',
        className: 'font-semibold text-[var(--ink)]',
      },
      {
        key: 'age',
        header: 'Age',
        accessor: (r) => r.age ?? '—',
        align: 'right',
        width: '3.5rem',
      },
      {
        key: 'gender',
        header: 'Sex',
        accessor: (r) => r.gender || '—',
        align: 'center',
        width: '3.5rem',
      },
      {
        key: 'part_no',
        header: 'Part',
        accessor: 'part_no',
        align: 'center',
        className: 'tabular-nums font-semibold',
        width: '4rem',
      },
      {
        key: 'house_no',
        header: 'House',
        accessor: (r) => r.house_no || '—',
      },
      {
        key: 'status',
        header: 'Status',
        truncate: false,
        cell: (row) => (
          <StatusBadge tone={toneForStatus(row.status)}>
            {labelForStatus(row.status || 'active')}
          </StatusBadge>
        ),
      },
    ],
    []
  );

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="People"
        title="Voters"
        description="Find people by name, voter ID (EPIC), or house number."
      />

      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Search name, EPIC, house…" />
        <FilterSelect label="Part" value={part} onChange={setPart} options={partOptions} />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All statuses' },
            'active',
            'visited',
            'callback',
            'shifted',
          ]}
        />
      </FilterBar>

      <AlertBanner tone="danger">{error}</AlertBanner>

      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey="id"
        loading={loading}
        emptyTitle="No voters yet"
        emptyDescription="Upload a roll PDF or import a CSV from the Data page."
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
