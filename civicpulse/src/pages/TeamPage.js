import { useMemo, useState } from 'react';
import { createTeamMember, getTeam } from '../api/team';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FilterBar, { FilterSearch } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import Panel, { btnPrimary, Field, inputClass } from '../components/ui/Panel';
import StatusBadge, { labelForStatus, toneForStatus } from '../components/ui/StatusBadge';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

export default function TeamPage() {
  const { data: team, loading, error, reload } = useApi(getTeam, []);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    role: 'Booth Agent',
    zone: '',
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (team || []).filter(
      (m) =>
        !q ||
        (m.name || '').toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q) ||
        (m.zone || '').toLowerCase().includes(q)
    );
  }, [team, query]);

  const pager = usePagination(filtered, pageSize);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createTeamMember(form);
      setForm({ name: '', role: 'Booth Agent', zone: '' });
      reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        accessor: 'name',
        className: 'font-semibold',
      },
      { key: 'role', header: 'Role', accessor: 'role' },
      {
        key: 'zone',
        header: 'Zone',
        accessor: (r) => r.zone || '—',
      },
      {
        key: 'status',
        header: 'Status',
        truncate: false,
        cell: (r) => (
          <StatusBadge tone={toneForStatus(r.status)}>
            {labelForStatus(r.status || 'Active')}
          </StatusBadge>
        ),
      },
    ],
    []
  );

  return (
    <section className="space-y-4">
      <PageHeader title="Team" description="Coordinators, agents, and volunteers." />

      <Panel className="p-4">
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4">
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Role">
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className={inputClass}
            >
              {['Coordinator', 'Booth Agent', 'Volunteer', 'Admin'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Zone">
            <input
              value={form.zone}
              onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={saving} className={`${btnPrimary} w-full`}>
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </Panel>

      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Filter team…" />
      </FilterBar>
      <AlertBanner tone="danger">{error}</AlertBanner>

      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey="id"
        loading={loading}
        emptyTitle="No team members"
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
