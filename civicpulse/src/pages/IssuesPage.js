import { useMemo, useState } from 'react';
import { createIssue, getIssues, updateIssue } from '../api/issues';
import { useAuth } from '../auth/AuthContext';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FilterBar, { FilterSearch } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import Panel, { btnPrimary, Field, inputClass } from '../components/ui/Panel';
import StatusBadge, { labelForStatus, toneForStatus } from '../components/ui/StatusBadge';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

export default function IssuesPage() {
  const { role } = useAuth();
  const { data: issues, loading, error, reload } = useApi(getIssues, []);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    part_no: '',
    priority: 'Medium',
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (issues || []).filter(
      (i) =>
        !q ||
        (i.title || '').toLowerCase().includes(q) ||
        String(i.part_no || '').includes(q) ||
        (i.status || '').toLowerCase().includes(q)
    );
  }, [issues, query]);

  const pager = usePagination(filtered, pageSize);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createIssue({
        ...form,
        part_no: form.part_no ? Number(form.part_no) : null,
        reporter_role: role,
      });
      setForm({ title: '', description: '', part_no: '', priority: 'Medium' });
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
        key: 'title',
        header: 'Issue',
        truncate: false,
        cell: (r) => (
          <div className="min-w-0 max-w-md">
            <p className="font-semibold text-[var(--ink)]">{r.title}</p>
            {r.description ? (
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{r.description}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'part_no',
        header: 'Part',
        accessor: (r) => r.part_no ?? '—',
        align: 'center',
        width: '4rem',
      },
      {
        key: 'priority',
        header: 'Priority',
        truncate: false,
        cell: (r) => (
          <StatusBadge tone={r.priority === 'High' ? 'danger' : 'warning'}>
            {r.priority}
          </StatusBadge>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        truncate: false,
        cell: (r) => (
          <StatusBadge tone={toneForStatus(r.status)}>
            {labelForStatus(r.status)}
          </StatusBadge>
        ),
      },
      {
        key: 'actions',
        header: '',
        truncate: false,
        align: 'right',
        cell: (r) =>
          r.status !== 'Resolved' ? (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--brand)] hover:underline"
              onClick={() => updateIssue(r.id, { status: 'Resolved' }).then(reload)}
            >
              Resolve
            </button>
          ) : (
            '—'
          ),
      },
    ],
    [reload]
  );

  return (
    <section className="space-y-4">
      <PageHeader title="Issues" description="Track civic tickets by booth." />

      <Panel className="p-4">
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>
          <Field label="Part">
            <input
              type="number"
              value={form.part_no}
              onChange={(e) => setForm((f) => ({ ...f, part_no: e.target.value }))}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>
          <Field label="Priority">
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              className={inputClass}
            >
              {['Low', 'Medium', 'High'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <button type="submit" disabled={saving} className={`${btnPrimary} sm:col-span-2`}>
            {saving ? 'Saving…' : 'Create issue'}
          </button>
        </form>
      </Panel>

      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Filter issues…" />
      </FilterBar>
      <AlertBanner tone="danger">{error}</AlertBanner>

      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey="id"
        loading={loading}
        emptyTitle="No issues"
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
