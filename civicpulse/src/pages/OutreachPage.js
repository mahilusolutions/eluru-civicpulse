import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, DoorOpen, Megaphone, MessageCircle, MessageSquareText, MoreHorizontal, Pencil, Phone, Plus, RefreshCw, Trash2, History } from 'lucide-react';
import { createOutreach, deleteOutreach, getOutreach, getOutreachHistory, getOutreachStats, updateOutreach } from '../api/outreach';
import { useAuth } from '../auth/AuthContext';
import { ROLES, ROLE_LABELS } from '../auth/roles';
import VoterModal from '../components/voters/VoterModal';
import VoterPicker from '../components/pickers/VoterPicker';
import AlertBanner from '../components/ui/AlertBanner';
import DataList, { CardShell } from '../components/ui/DataList';
import { FilterSelect } from '../components/ui/FilterBar';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { Field, btnPrimary } from '../components/ui/Panel';
import { FilterField, FilterPanel, MiniFact, Pill, StatStrip, ViewSwitch, btnTool, btnToolPrimary, inputSm, useChartsOpen, useDebouncedSearch, useViewMode } from '../components/ui/kit';
import { BarList, ChartCard, ColumnChart } from '../components/voters/VoterCharts';
import { useApi } from '../hooks/useApi';
import { fmt, niceName, pct, roadName } from '../utils/voterFormat';

const TYPES = [
  { value: 'Visit', label: 'Visit', icon: DoorOpen },
  { value: 'Call', label: 'Call', icon: Phone },
  { value: 'WhatsApp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'SMS', label: 'SMS', icon: MessageSquareText },
  { value: 'Event', label: 'Event', icon: Megaphone },
  { value: 'Other', label: 'Other', icon: MoreHorizontal },
];
const OUTCOMES = ['Contacted', 'Supportive', 'Undecided', 'Not home', 'Call back later', 'Refused'];
const PERIODS = [
  { value: 'all', label: 'Any time' },
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

const when = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const CAN_DELETE = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR];
const FIELD_LABELS = { type: 'How', outcome: 'Result', notes: 'Note' };
const typeIcon = (name) => TYPES.find((t) => t.value === name)?.icon || MoreHorizontal;

function LogModal({ role, editing, onClose, onSaved }) {
  const [voter, setVoter] = useState(null);
  const [type, setType] = useState(editing?.type || 'Visit');
  const [outcome, setOutcome] = useState(editing ? editing.outcome || '' : 'Contacted');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    if (!editing && !voter) {
      setError('Find and choose the voter first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await updateOutreach(editing.id, { type, outcome, notes: notes.trim(), actor_role: role });
        onSaved(`Contact with ${niceName(editing.voter_name)} updated.`);
      } else {
        await createOutreach({ voter_id: voter.id, type, outcome, notes: notes.trim() || undefined, created_by_role: role });
        onSaved(`Contact with ${niceName(voter.name)} saved.`);
      }
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? 'Edit contact' : 'Log a contact'}
      subtitle={editing ? `${niceName(editing.voter_name)} · Booth ${editing.part_no}` : 'Record a visit, call or message with a voter.'}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
            Cancel
          </button>
          <button type="submit" form="log-form" disabled={busy} className={`${btnPrimary} !py-2`}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Save contact'}
          </button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <form id="log-form" onSubmit={save} className="space-y-3.5">
        {editing ? null : (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">Who did you meet?</p>
            <VoterPicker value={voter} onChange={setVoter} autoFocus />
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">How did you reach them?</p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {TYPES.map(({ value, label, icon: TypeIcon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                aria-pressed={type === value}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-semibold transition ${
                  type === value ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--brand)]'
                }`}
              >
                <TypeIcon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <Field label="What happened?">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={inputSm}>
            {outcome && !OUTCOMES.includes(outcome) ? <option>{outcome}</option> : null}
            {OUTCOMES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Anything worth remembering" className={inputSm} />
        </Field>
      </form>
    </Modal>
  );
}

function DeleteModal({ row, role, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await deleteOutreach(row.id, role);
      onDeleted(`Contact with ${niceName(row.voter_name)} deleted. It stays in the history log.`);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Delete this contact?"
      subtitle={`${niceName(row.voter_name)} · ${row.type} · ${when(row.created_at)}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
            Cancel
          </button>
          <button type="button" onClick={remove} disabled={busy} className={`${btnPrimary} !bg-red-600 !py-2`}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <p className="text-sm text-[var(--ink-soft)]">This removes the contact from the list and the counts. A record of the deletion is kept in the history log.</p>
    </Modal>
  );
}

function HistoryModal({ row, onClose }) {
  const h = useApi(() => getOutreachHistory(row.id), [row.id]);
  const events = h.data || [];
  const verb = { create: 'Logged', update: 'Edited', delete: 'Deleted' };
  return (
    <Modal title="History" subtitle={`${niceName(row.voter_name)} · ${row.type}`} size="md" onClose={onClose}>
      <AlertBanner tone="danger">{h.error}</AlertBanner>
      {h.loading && !h.data ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {h.data && !events.length ? <p className="text-sm text-[var(--muted)]">No history recorded for this contact.</p> : null}
      <ol className="space-y-3">
        {events.map((e) => {
          const diffs = e.action === 'update' ? Object.keys(FIELD_LABELS).filter((k) => (e.before_data?.[k] ?? null) !== (e.after_data?.[k] ?? null)) : [];
          return (
            <li key={e.id} className="rounded-xl border border-[var(--line)] p-3">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {verb[e.action] || e.action} <span className="font-normal text-[var(--muted)]">by {ROLE_LABELS[e.actor_role] || 'Unknown'}</span>
              </p>
              <p className="text-xs text-[var(--muted)]">{new Date(e.created_at).toLocaleString()}</p>
              {diffs.map((k) => (
                <p key={k} className="mt-1 text-xs text-[var(--ink-soft)]">
                  {FIELD_LABELS[k]}: <span className="line-through">{e.before_data?.[k] || '—'}</span> → <span className="font-semibold">{e.after_data?.[k] || '—'}</span>
                </p>
              ))}
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}

export default function OutreachPage() {
  const { role } = useAuth();
  const canLog = role !== ROLES.VIEWER;
  const canDelete = CAN_DELETE.includes(role);

  const [params, setParams] = useSearchParams();
  const f = { q: params.get('q') || '', type: params.get('type') || 'all', outcome: params.get('outcome') || 'all', days: params.get('days') || 'all' };
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

  const [view, setView] = useViewMode('civicpulse_outreach_view');
  const [chartsOpen, setChartsOpen] = useChartsOpen('civicpulse_outreach_charts');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [history, setHistory] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [notice, setNotice] = useState('');

  const sig = JSON.stringify(f);
  useEffect(() => setPage(1), [sig, pageSize]);

  const list = useApi(
    () => getOutreach({ q: f.q || undefined, type: f.type, outcome: f.outcome, days: f.days === 'all' ? undefined : f.days, page, limit: pageSize }),
    [sig, page, pageSize]
  );
  const stats = useApi(getOutreachStats, []);

  const rows = list.data?.rows || [];
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const paging = { page, pageCount, from: total ? (page - 1) * pageSize + 1 : 0, to: Math.min(page * pageSize, total), total, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };

  const s = stats.data;
  const refresh = () => {
    list.reload({ silent: true });
    stats.reload({ silent: true });
  };

  const outcomeOptions = [{ value: 'all', label: 'Any result' }, ...OUTCOMES.map((o) => ({ value: o, label: o }))];
  const chips = [
    f.q && { key: 'q', label: `“${f.q}”`, onRemove: () => setSearch('') },
    f.type !== 'all' && { key: 'type', label: f.type, onRemove: () => patch({ type: '' }) },
    f.outcome !== 'all' && { key: 'outcome', label: f.outcome, onRemove: () => patch({ outcome: '' }) },
    f.days !== 'all' && { key: 'days', label: PERIODS.find((p) => p.value === f.days)?.label, onRemove: () => patch({ days: '' }) },
  ].filter(Boolean);

  const dayData = (s?.per_day || []).map((d) => {
    const date = new Date(`${d.day}T00:00:00`);
    return { key: d.day, label: date.toLocaleDateString(undefined, { day: 'numeric' }), title: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), value: d.count };
  });

  const actionButtons = (r) => (
    <span className="inline-flex items-center gap-1">
      <button type="button" title="History" aria-label="History" onClick={() => setHistory(r)} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]">
        <History className="h-4 w-4" />
      </button>
      {canLog ? (
        <button type="button" title="Edit" aria-label="Edit" onClick={() => setEditing(r)} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--brand)]">
          <Pencil className="h-4 w-4" />
        </button>
      ) : null}
      {canDelete ? (
        <button type="button" title="Delete" aria-label="Delete" onClick={() => setDeleting(r)} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </span>
  );

  const columns = useMemo(
    () => [
      { key: 'when', header: 'When', truncate: false, sticky: 'left', stickyOffset: 0, cell: (r) => <span className="whitespace-nowrap tabular-nums text-[var(--ink-soft)]">{when(r.created_at)}</span> },
      { key: 'voter', header: 'Voter', truncate: false, cell: (r) => (
          <button type="button" onClick={() => setViewId(r.voter_id)} className="inline-block min-w-[9rem] text-left font-semibold text-[var(--ink)] hover:text-[var(--brand)] hover:underline">
            {niceName(r.voter_name)}
          </button>
        ),
      },
      { key: 'part_no', header: 'Booth', accessor: 'part_no', align: 'center', className: 'tabular-nums font-semibold', width: '4.5rem' },
      { key: 'house', header: 'House no.', accessor: (r) => r.house_number || '—', className: 'tabular-nums', width: '6rem' },
      {
        key: 'type',
        header: 'How',
        truncate: false,
        cell: (r) => {
          const TypeIcon = typeIcon(r.type);
          return (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <TypeIcon className="h-3.5 w-3.5 text-[var(--brand)]" />
              {r.type}
            </span>
          );
        },
      },
      { key: 'outcome', header: 'Result', truncate: false, cell: (r) => (r.outcome ? <Pill>{r.outcome}</Pill> : <span className="text-[var(--muted)]">—</span>) },
      { key: 'notes', header: 'Note', truncate: false, cell: (r) => <span className="inline-block max-w-[18rem] truncate align-middle text-[var(--ink-soft)]" title={r.notes || ''}>{r.notes || '—'}</span> },
      { key: 'by', header: 'Logged by', accessor: (r) => ROLE_LABELS[r.created_by_role] || '—', width: '8rem' },
      { key: 'actions', header: '', truncate: false, sticky: 'right', align: 'right', width: '7rem', cell: actionButtons },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canLog, canDelete, setViewId]
  );

  const renderCard = (r) => {
    const TypeIcon = typeIcon(r.type);
    return (
      <CardShell>
        <div role="button" tabIndex={0} onClick={() => setViewId(r.voter_id)} onKeyDown={(e) => e.key === 'Enter' && setViewId(r.voter_id)} className="flex cursor-pointer items-start gap-3" title="View voter details">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-muted)] text-[var(--brand)]">
            <TypeIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-snug text-[var(--ink)]">{niceName(r.voter_name)}</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {when(r.created_at)} · Booth {r.part_no}
              {r.house_number ? ` · House ${r.house_number}` : ''}
            </p>
          </div>
          {r.outcome ? <Pill>{r.outcome}</Pill> : null}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3">
          <MiniFact label="How">{r.type}</MiniFact>
          <MiniFact label="Logged by">{ROLE_LABELS[r.created_by_role]}</MiniFact>
          <MiniFact label="Road" className="col-span-2">{roadName(r)}</MiniFact>
          {r.notes ? <MiniFact label="Note" className="col-span-2">{r.notes}</MiniFact> : null}
        </dl>
        <div className="mt-3 flex justify-end border-t border-[var(--line)] pt-2">{actionButtons(r)}</div>
      </CardShell>
    );
  };

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Every visit, call and message with a voter, so the team always knows who has been reached."
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
            {canLog ? (
              <button type="button" onClick={() => setLogging(true)} className={btnToolPrimary}>
                <Plus className="h-3.5 w-3.5" />
                Log a contact
              </button>
            ) : null}
          </>
        }
      />

      <FilterPanel search={search} onSearch={setSearch} placeholder="Search voter name, house number, result or note…" chips={chips} onClearAll={() => { setSearch(''); setParams({}, { replace: true }); }} cols="md:grid-cols-3">
        <FilterField label="How they were reached">
          <FilterSelect label="How" className="w-full" value={f.type} onChange={(v) => patch({ type: v })} options={[{ value: 'all', label: 'Any way' }, ...TYPES.map((t) => ({ value: t.value, label: t.label }))]} />
        </FilterField>
        <FilterField label="Result">
          <FilterSelect label="Result" className="w-full" value={f.outcome} onChange={(v) => patch({ outcome: v })} options={outcomeOptions} />
        </FilterField>
        <FilterField label="When">
          <FilterSelect label="When" className="w-full" value={f.days} onChange={(v) => patch({ days: v })} options={PERIODS} />
        </FilterField>
      </FilterPanel>

      <AlertBanner tone="danger">{list.error || stats.error}</AlertBanner>
      <AlertBanner tone="success">{notice}</AlertBanner>

      <StatStrip
        items={[
          { label: 'Contacts logged', value: fmt(s?.total), hint: 'all time' },
          { label: 'Today', value: fmt(s?.today), hint: 'contacts so far' },
          { label: 'Last 7 days', value: fmt(s?.last7), hint: 'contacts this week' },
          { label: 'Voters contacted', value: fmt(s?.voters_contacted), hint: s ? `${pct(s.voters_contacted, s.total_voters)}% of ${fmt(s.total_voters)} voters` : ' ' },
        ]}
      />

      {chartsOpen && s?.total ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ChartCard className="md:col-span-2 xl:col-span-1" title="Contacts each day" subtitle="The last 14 days">
            <ColumnChart data={dayData} unit="contacts" showEvery={1} />
          </ChartCard>
          <ChartCard title="How voters were reached">
            <BarList items={(s.by_type || []).map((t) => ({ key: t.key, label: t.key, value: t.count }))} unit="contacts" activeKey={f.type === 'all' ? null : f.type} onPick={(item) => patch({ type: f.type === item.key ? '' : item.key })} />
          </ChartCard>
          <ChartCard title="What happened">
            <BarList items={(s.by_outcome || []).map((t) => ({ key: t.key, label: t.key, value: t.count }))} unit="contacts" activeKey={f.outcome === 'all' ? null : f.outcome} onPick={(item) => patch({ outcome: f.outcome === item.key ? '' : item.key })} />
          </ChartCard>
        </div>
      ) : null}

      <DataList
        view={view}
        columns={columns}
        rows={rows}
        rowKey="id"
        renderCard={renderCard}
        loading={list.loading && !list.data}
        pagination={paging}
        emptyTitle={chips.length ? 'No contacts match these filters' : 'No contacts logged yet'}
        emptyDescription={chips.length ? 'Try removing a filter.' : canLog ? 'Choose “Log a contact” after your first visit or call.' : 'Contacts will appear here as the team logs them.'}
      />

      {editing ? (
        <LogModal
          role={role}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setNotice(msg);
            refresh();
          }}
        />
      ) : null}
      {deleting ? (
        <DeleteModal
          row={deleting}
          role={role}
          onClose={() => setDeleting(null)}
          onDeleted={(msg) => {
            setNotice(msg);
            refresh();
          }}
        />
      ) : null}
      {viewId != null ? <VoterModal id={viewId} onClose={() => setViewId(null)} onSelect={setViewId} /> : null}
      {history ? <HistoryModal row={history} onClose={() => setHistory(null)} /> : null}

      {logging ? (
        <LogModal
          role={role}
          onClose={() => setLogging(false)}
          onSaved={(msg) => {
            setNotice(msg);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}
