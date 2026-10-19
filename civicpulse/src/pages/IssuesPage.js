import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Eye, Plus, RefreshCw } from 'lucide-react';
import { getBooths } from '../api/booths';
import { createIssue, deleteIssue, getIssues, updateIssue } from '../api/issues';
import { useAuth } from '../auth/AuthContext';
import { ROLES, ROLE_LABELS } from '../auth/roles';
import AlertBanner from '../components/ui/AlertBanner';
import ConfirmButton from '../components/ui/ConfirmButton';
import DataList, { CardShell } from '../components/ui/DataList';
import { FilterSelect } from '../components/ui/FilterBar';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { Field, btnPrimary } from '../components/ui/Panel';
import { FilterField, FilterPanel, MiniFact, Pill, StatStrip, ViewSwitch, btnTool, btnToolPrimary, inputSm, useChartsOpen, useDebouncedSearch, useViewMode } from '../components/ui/kit';
import { BarList, ChartCard } from '../components/voters/VoterCharts';
import { useApi } from '../hooks/useApi';
import { stationName } from '../utils/boothFormat';
import { fmt } from '../utils/voterFormat';

const PRIORITIES = [
  { value: 'Critical', label: 'Critical', color: 'var(--viz-crit)', rank: 4 },
  { value: 'High', label: 'High', color: 'var(--viz-serious)', rank: 3 },
  { value: 'Medium', label: 'Medium', color: 'var(--viz-active)', rank: 2 },
  { value: 'Low', label: 'Low', color: 'var(--viz-unknown)', rank: 1 },
];
const STATUSES = [
  { value: 'Open', label: 'Open', color: 'var(--viz-warn)' },
  { value: 'In progress', label: 'In progress', color: 'var(--viz-active)' },
  { value: 'Resolved', label: 'Resolved', color: 'var(--viz-good)' },
  { value: 'Closed', label: 'Closed', color: 'var(--viz-unknown)' },
];
const priorityOf = (v) => PRIORITIES.find((p) => p.value === v) || PRIORITIES[2];
const statusOf = (v) => STATUSES.find((s) => s.value === v) || STATUSES[0];
const isDone = (i) => i.status === 'Resolved' || i.status === 'Closed';
const day = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function IssueModal({ issue, booths, role, canEdit, onClose, onSaved }) {
  const isNew = !issue;
  const [form, setForm] = useState({
    title: issue?.title || '',
    description: issue?.description || '',
    part_no: issue?.part_no ? String(issue.part_no) : '',
    priority: issue?.priority || 'Medium',
    status: issue?.status || 'Open',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isNew) {
        await createIssue({ title: form.title, description: form.description, part_no: form.part_no || null, priority: form.priority, reporter_role: role });
      } else {
        await updateIssue(issue.id, { title: form.title, description: form.description, priority: form.priority, status: form.status });
      }
      onSaved(isNew ? 'Issue reported.' : 'Issue updated.');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteIssue(issue.id);
      onSaved('Issue deleted.');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const readOnly = !canEdit;

  return (
    <Modal
      title={isNew ? 'Report an issue' : issue.title}
      subtitle={isNew ? 'Describe a local problem so someone can follow it up.' : `Reported ${day(issue.created_at)}${issue.reporter_role ? ` by ${ROLE_LABELS[issue.reporter_role] || issue.reporter_role}` : ''}`}
      size="md"
      onClose={onClose}
      footer={
        readOnly ? null : (
          <>
            {!isNew ? <ConfirmButton label="Delete issue" confirmLabel="Yes, delete" onConfirm={remove} disabled={busy} /> : null}
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
              Cancel
            </button>
            <button type="submit" form="issue-form" disabled={busy} className={`${btnPrimary} !py-2`}>
              {busy ? 'Saving…' : isNew ? 'Report issue' : 'Save changes'}
            </button>
          </>
        )
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <form id="issue-form" onSubmit={save} className="space-y-3">
        <Field label="What is the problem?">
          <input required autoFocus={isNew} disabled={readOnly} maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Drain overflowing near the school" className={inputSm} />
        </Field>
        <Field label="More detail (optional)">
          <textarea disabled={readOnly} rows={3} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inputSm} resize-y`} />
        </Field>
        <div className={`grid gap-3 ${isNew ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          <Field label="Booth">
            {isNew ? (
              <select value={form.part_no} onChange={(e) => setForm({ ...form, part_no: e.target.value })} className={inputSm}>
                <option value="">Not about one booth</option>
                {booths.map((b) => (
                  <option key={b.part_no} value={b.part_no}>
                    Booth {b.part_no} · {stationName(b.polling_station_name, b.part_no)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="py-2 text-sm font-semibold text-[var(--ink)]">{issue.part_no ? `Booth ${issue.part_no}` : 'Not about one booth'}</p>
            )}
          </Field>
          <Field label="How urgent?">
            <select disabled={readOnly} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputSm}>
              {PRIORITIES.map((p) => (
                <option key={p.value}>{p.value}</option>
              ))}
            </select>
          </Field>
          {!isNew ? (
            <Field label="Progress">
              <select disabled={readOnly} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputSm}>
                {STATUSES.map((s) => (
                  <option key={s.value}>{s.value}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

export default function IssuesPage() {
  const { role } = useAuth();
  const canEdit = role !== ROLES.VIEWER;

  const issuesApi = useApi(getIssues, []);
  const boothsApi = useApi(getBooths, []);
  const issues = useMemo(() => issuesApi.data || [], [issuesApi.data]);
  const booths = useMemo(() => boothsApi.data || [], [boothsApi.data]);

  const [params, setParams] = useSearchParams();
  const f = { q: params.get('q') || '', status: params.get('status') || 'all', priority: params.get('priority') || 'all', part: params.get('part') || 'all' };
  const patch = useCallback(
    (changes) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(changes).forEach(([k, v]) => (v == null || v === '' || v === 'all' ? next.delete(k) : next.set(k, v)));
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );
  const [search, setSearch] = useDebouncedSearch(f.q, (v) => patch({ q: v }));

  const [view, setView] = useViewMode('civicpulse_issues_view');
  const [chartsOpen, setChartsOpen] = useChartsOpen('civicpulse_issues_charts');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(null); // null | 'new' | issue
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  const sig = JSON.stringify(f);
  useEffect(() => setPage(1), [sig, pageSize]);

  const filtered = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return issues
      .filter((i) => {
        if (f.status === 'open' ? isDone(i) : f.status !== 'all' && i.status !== f.status) return false;
        if (f.priority !== 'all' && i.priority !== f.priority) return false;
        if (f.part !== 'all' && String(i.part_no) !== f.part) return false;
        return !needle || i.title.toLowerCase().includes(needle) || (i.description || '').toLowerCase().includes(needle) || String(i.part_no || '') === needle;
      })
      .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || priorityOf(b.priority).rank - priorityOf(a.priority).rank || b.id - a.id);
  }, [issues, f.q, f.status, f.priority, f.part]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = { page: safePage, pageCount, from: filtered.length ? (safePage - 1) * pageSize + 1 : 0, to: Math.min(safePage * pageSize, filtered.length), total: filtered.length, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };

  const openIssues = issues.filter((i) => !isDone(i));
  const urgent = openIssues.filter((i) => i.priority === 'High' || i.priority === 'Critical');
  const refresh = () => issuesApi.reload({ silent: true });

  const byPart = useMemo(() => {
    const map = new Map();
    openIssues.forEach((i) => i.part_no && map.set(i.part_no, (map.get(i.part_no) || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, n]) => ({ key: String(p), label: `Booth ${p}`, value: n }));
  }, [openIssues]);

  const chips = [
    f.q && { key: 'q', label: `“${f.q}”`, onRemove: () => setSearch('') },
    f.status !== 'all' && { key: 'status', label: f.status === 'open' ? 'Still open' : f.status, onRemove: () => patch({ status: '' }) },
    f.priority !== 'all' && { key: 'priority', label: `${f.priority} priority`, onRemove: () => patch({ priority: '' }) },
    f.part !== 'all' && { key: 'part', label: `Booth ${f.part}`, onRemove: () => patch({ part: '' }) },
  ].filter(Boolean);

  async function changeStatus(issue, status) {
    setBusyId(issue.id);
    try {
      await updateIssue(issue.id, { status });
      refresh();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyId(null);
    }
  }

  // A plain function (not a component) so the dropdown keeps focus while the list re-renders.
  const statusSelect = (issue) => (
    <select
      value={issue.status}
      disabled={!canEdit || busyId === issue.id}
      onChange={(e) => changeStatus(issue, e.target.value)}
      aria-label={`Progress of ${issue.title}`}
      className="rounded-lg border border-[var(--line)] bg-[var(--bg)] py-1 pl-2 pr-6 text-xs font-semibold text-[var(--ink-soft)] outline-none focus:border-[var(--brand)] disabled:opacity-70"
    >
      {STATUSES.map((s) => (
        <option key={s.value}>{s.value}</option>
      ))}
    </select>
  );

  const columns = useMemo(
    () => [
      {
        key: 'title',
        header: 'Issue',
        truncate: false,
        sticky: 'left',
        stickyOffset: 0,
        cell: (i) => (
          <div className="min-w-[14rem] max-w-[26rem]">
            <p className={`font-semibold leading-snug ${isDone(i) ? 'text-[var(--muted)] line-through' : 'text-[var(--ink)]'}`}>{i.title}</p>
            {i.description ? <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{i.description}</p> : null}
          </div>
        ),
      },
      { key: 'booth', header: 'Booth', accessor: (i) => i.part_no ?? '—', align: 'center', className: 'tabular-nums font-semibold', width: '4.5rem' },
      { key: 'priority', header: 'Urgency', truncate: false, cell: (i) => <Pill color={priorityOf(i.priority).color}>{i.priority}</Pill>, width: '7rem' },
      { key: 'status', header: 'Progress', truncate: false, cell: (i) => statusSelect(i), width: '8.5rem' },
      { key: 'date', header: 'Reported', accessor: (i) => day(i.created_at), width: '7.5rem', className: 'whitespace-nowrap text-[var(--ink-soft)]' },
      { key: 'by', header: 'By', accessor: (i) => ROLE_LABELS[i.reporter_role] || '—', width: '7rem' },
      {
        key: 'view',
        header: 'Details',
        align: 'center',
        truncate: false,
        sticky: 'right',
        width: '5.5rem',
        cell: (i) => (
          <button type="button" onClick={() => setOpen(i)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)]">
            <Eye className="h-3.5 w-3.5" />
            {canEdit ? 'Edit' : 'View'}
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, busyId]
  );

  const renderCard = (i) => (
    <CardShell>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`font-bold leading-snug ${isDone(i) ? 'text-[var(--muted)] line-through' : 'text-[var(--ink)]'}`}>{i.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill color={priorityOf(i.priority).color}>{i.priority}</Pill>
            <Pill color={statusOf(i.status).color}>{i.status}</Pill>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(i)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)]">
          <Eye className="h-3.5 w-3.5" />
          {canEdit ? 'Edit' : 'View'}
        </button>
      </div>
      {i.description ? <p className="mt-2 text-sm text-[var(--ink-soft)]">{i.description}</p> : null}
      <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-3">
        <MiniFact label="Booth">{i.part_no ?? 'General'}</MiniFact>
        <MiniFact label="Reported">{day(i.created_at)}</MiniFact>
        <MiniFact label="By">{ROLE_LABELS[i.reporter_role]}</MiniFact>
      </dl>
    </CardShell>
  );

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Local problems reported from the field, so each one is followed until it is fixed."
        actions={
          <>
            <ViewSwitch view={view} onChange={setView} />
            <button type="button" onClick={() => setChartsOpen((o) => !o)} className={btnTool} aria-pressed={chartsOpen}>
              <BarChart3 className="h-3.5 w-3.5" />
              {chartsOpen ? 'Hide charts' : 'Show charts'}
            </button>
            <button type="button" onClick={refresh} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {canEdit ? (
              <button type="button" onClick={() => setOpen('new')} className={btnToolPrimary}>
                <Plus className="h-3.5 w-3.5" />
                Report an issue
              </button>
            ) : null}
          </>
        }
      />

      <FilterPanel search={search} onSearch={setSearch} placeholder="Search issues by title, detail or booth number…" chips={chips} onClearAll={() => { setSearch(''); setParams({}, { replace: true }); }} cols="md:grid-cols-3">
        <FilterField label="Progress">
          <FilterSelect label="Progress" className="w-full" value={f.status} onChange={(v) => patch({ status: v })} options={[{ value: 'all', label: 'Everything' }, { value: 'open', label: 'Still open' }, ...STATUSES.map((s) => ({ value: s.value, label: s.label }))]} />
        </FilterField>
        <FilterField label="How urgent">
          <FilterSelect label="Urgency" className="w-full" value={f.priority} onChange={(v) => patch({ priority: v })} options={[{ value: 'all', label: 'Any urgency' }, ...PRIORITIES.map((p) => ({ value: p.value, label: p.label }))]} />
        </FilterField>
        <FilterField label="Booth">
          <FilterSelect label="Booth" className="w-full" value={f.part} onChange={(v) => patch({ part: v })} options={[{ value: 'all', label: 'All booths' }, ...booths.map((b) => ({ value: String(b.part_no), label: `Booth ${b.part_no}` }))]} />
        </FilterField>
      </FilterPanel>

      <AlertBanner tone="danger">{issuesApi.error || boothsApi.error}</AlertBanner>
      <AlertBanner tone="info">{notice}</AlertBanner>

      <StatStrip
        items={[
          { label: 'Still open', value: fmt(openIssues.length), hint: 'problems to follow up' },
          { label: 'Urgent', value: fmt(urgent.length), hint: 'high or critical' },
          { label: 'In progress', value: fmt(issues.filter((i) => i.status === 'In progress').length), hint: 'being worked on' },
          { label: 'Fixed', value: fmt(issues.length - openIssues.length), hint: `of ${fmt(issues.length)} reported` },
        ]}
      />

      {chartsOpen && issues.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ChartCard title="How urgent" subtitle="Open issues · click to filter">
            <BarList
              unit="issues"
              items={PRIORITIES.map((p) => ({ key: p.value, label: p.label, value: openIssues.filter((i) => i.priority === p.value).length }))}
              activeKey={f.priority === 'all' ? null : f.priority}
              onPick={(item) => patch({ priority: f.priority === item.key ? '' : item.key })}
            />
          </ChartCard>
          <ChartCard title="Progress" subtitle="All issues · click to filter">
            <BarList
              unit="issues"
              items={STATUSES.map((s) => ({ key: s.value, label: s.label, value: issues.filter((i) => i.status === s.value).length }))}
              activeKey={f.status === 'all' || f.status === 'open' ? null : f.status}
              onPick={(item) => patch({ status: f.status === item.key ? '' : item.key })}
            />
          </ChartCard>
          <ChartCard className="md:col-span-2 xl:col-span-1" title="Booths with most open issues">
            <BarList unit="issues" items={byPart} activeKey={f.part === 'all' ? null : f.part} onPick={(item) => patch({ part: f.part === item.key ? '' : item.key })} empty="No open issues are tied to a booth." />
          </ChartCard>
        </div>
      ) : null}

      <DataList
        view={view}
        columns={columns}
        rows={rows}
        rowKey="id"
        renderCard={renderCard}
        loading={issuesApi.loading && !issuesApi.data}
        pagination={paging}
        emptyTitle={chips.length ? 'No issues match these filters' : 'No issues reported yet'}
        emptyDescription={chips.length ? 'Try removing a filter.' : canEdit ? 'Choose “Report an issue” to log the first local problem.' : 'Issues will appear here as the team reports them.'}
      />

      {open ? (
        <IssueModal
          issue={open === 'new' ? null : open}
          booths={booths}
          role={role}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            setNotice(msg);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}
