import { useMemo, useState } from 'react';
import { getBooths } from '../api/booths';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FilterBar, { FilterSearch, FilterSelect } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import ProgressBar from '../components/ui/ProgressBar';
import StatusBadge, { labelForStatus, toneForStatus } from '../components/ui/StatusBadge';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

export default function BoothsPage() {
  const { data: booths, loading, error } = useApi(getBooths, []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (booths || []).filter((b) => {
      const matchQ =
        !q ||
        String(b.part_no).includes(q) ||
        (b.area_name || '').toLowerCase().includes(q) ||
        (b.agent_name || '').toLowerCase().includes(q);
      const matchS = status === 'all' || (b.status || '') === status;
      return matchQ && matchS;
    });
  }, [booths, query, status]);

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
        accessor: (r) => r.agent_name || 'Unassigned',
      },
      {
        key: 'voter_count',
        header: 'Voters',
        accessor: (r) => r.voter_count || 0,
        align: 'right',
        className: 'tabular-nums font-semibold',
        width: '5rem',
      },
      {
        key: 'coverage',
        header: 'Coverage',
        truncate: false,
        cell: (row) => <ProgressBar value={row.coverage_pct || 0} />,
        width: '9rem',
      },
      {
        key: 'status',
        header: 'Status',
        truncate: false,
        cell: (row) => (
          <StatusBadge tone={toneForStatus(row.status)}>
            {labelForStatus(row.status || 'pending')}
          </StatusBadge>
        ),
      },
    ],
    []
  );

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Field"
        title="Booths"
        description="Every part booth — voters, agents, and visit coverage."
      />

      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Filter part, area, agent…" />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All statuses' },
            'pending',
            'active',
            'ready',
          ]}
        />
      </FilterBar>

      <AlertBanner tone="danger">{error}</AlertBanner>

      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey="part_no"
        loading={loading}
        emptyTitle="No booths yet"
        emptyDescription="Upload a roll PDF from Data to create the first booth."
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
