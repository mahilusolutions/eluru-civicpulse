import { useMemo, useState } from 'react';
import { createOutreach, getOutreach } from '../api/outreach';
import { getVoters } from '../api/voters';
import { useAuth } from '../auth/AuthContext';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import FilterBar, { FilterSearch } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import Panel, { btnPrimary, Field, inputClass } from '../components/ui/Panel';
import { useApi } from '../hooks/useApi';
import { usePagination } from '../hooks/usePagination';

function friendlyError(msg) {
  if (!msg) return '';
  if (/prisma|invocation|OutreachType/i.test(msg)) {
    return 'Could not save. Check the voter and try again.';
  }
  return String(msg).slice(0, 160);
}

export default function OutreachPage() {
  const { role } = useAuth();
  const { data: rows, loading, error, reload } = useApi(() => getOutreach(), []);
  const { data: votersData } = useApi(() => getVoters({ limit: 100 }), []);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    voter_id: '',
    type: 'Visit',
    outcome: 'Contacted',
    notes: '',
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter(
      (r) =>
        !q ||
        (r.voter_name || '').toLowerCase().includes(q) ||
        (r.type || '').toLowerCase().includes(q) ||
        String(r.part_no || '').includes(q)
    );
  }, [rows, query]);

  const pager = usePagination(filtered, pageSize);

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.voter_id) return;
    setSaving(true);
    setMsg('');
    setFormError('');
    try {
      await createOutreach({
        ...form,
        voter_id: Number(form.voter_id),
        created_by_role: role,
      });
      setMsg('Visit logged.');
      setForm((f) => ({ ...f, notes: '' }));
      reload({ silent: true });
    } catch (err) {
      setFormError(friendlyError(err.message));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'voter_name',
        header: 'Voter',
        accessor: 'voter_name',
        className: 'font-semibold',
      },
      {
        key: 'part_no',
        header: 'Part',
        accessor: 'part_no',
        align: 'center',
        width: '4rem',
      },
      { key: 'type', header: 'Type', accessor: 'type', width: '6rem' },
      {
        key: 'outcome',
        header: 'Outcome',
        accessor: (r) => r.outcome || '—',
      },
      {
        key: 'notes',
        header: 'Notes',
        accessor: (r) => r.notes || '—',
        className: 'text-[var(--muted)]',
      },
    ],
    []
  );

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Field"
        title="Outreach"
        description="Log door visits and call outcomes for each voter."
      />

      <Panel className="p-4 sm:p-5">
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Voter" className="sm:col-span-2">
            <select
              required
              value={form.voter_id}
              onChange={(e) => setForm((f) => ({ ...f, voter_id: e.target.value }))}
              className={inputClass}
            >
              <option value="">Select a voter…</option>
              {(votersData?.rows || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · Part {v.part_no}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className={inputClass}
            >
              {['Visit', 'Call', 'WhatsApp', 'SMS'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Outcome">
            <select
              value={form.outcome}
              onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
              className={inputClass}
            >
              {['Contacted', 'Not home', 'Supportive', 'Undecided', 'Refused'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={saving} className={`${btnPrimary} w-full`}>
              {saving ? 'Saving…' : 'Log visit'}
            </button>
          </div>
        </form>
      </Panel>

      <FilterBar>
        <FilterSearch value={query} onChange={setQuery} placeholder="Filter logs…" />
      </FilterBar>
      <AlertBanner tone="success">{msg}</AlertBanner>
      <AlertBanner tone="danger">{formError || error}</AlertBanner>

      <DataTable
        columns={columns}
        rows={pager.rows}
        rowKey="id"
        loading={loading}
        emptyTitle="No outreach yet"
        emptyDescription="Pick a voter above and log your first visit or call."
        emptyActionLabel="Find voters"
        emptyActionTo="/app/voters"
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
