import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, DoorOpen, Megaphone, MessageCircle, MessageSquareText, MoreHorizontal, Phone, Plus, RefreshCw } from 'lucide-react';
import { createOutreach, getOutreach, getOutreachStats } from '../api/outreach';
import { useAuth } from '../auth/AuthContext';
import { ROLES, ROLE_LABELS } from '../auth/roles';
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
const typeIcon = (name) => TYPES.find((t) => t.value === name)?.icon || MoreHorizontal;

function LogModal({ role, onClose, onSaved }) {
  const [voter, setVoter] = useState(null);
  const [type, setType] = useState('Visit');
  const [outcome, setOutcome] = useState('Contacted');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    if (!voter) {
      setError('Find and choose the voter first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createOutreach({ voter_id: voter.id, type, outcome, notes: notes.trim() || undefined, created_by_role: role });
      onSaved(`Contact with ${niceName(voter.name)} saved.`);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Log a contact"
      subtitle="Record a visit, call or message with a voter."
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
            Cancel
          </button>
          <button type="submit" form="log-form" disabled={busy} className={`${btnPrimary} !py-2`}>
            {busy ? 'Saving…' : 'Save contact'}
          </button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <form id="log-form" onSubmit={save} className="space-y-3.5">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">Who did you meet?</p>
          <VoterPicker value={voter} onChange={setVoter} autoFocus />
        </div>

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

export default function OutreachPage() {
  const { role } = useAuth();
  const canLog = role !== ROLES.VIEWER;

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

  const columns = useMemo(
    () => [
      { key: 'when', header: 'When', truncate: false, sticky: 'left', stickyOffset: 0, cell: (r) => <span className="whitespace-nowrap tabular-nums text-[var(--ink-soft)]">{when(r.created_at)}</span> },
      { key: 'voter', header: 'Voter', truncate: false, cell: (r) => <span className="inline-block min-w-[9rem] font-semibold text-[var(--ink)]">{niceName(r.voter_name)}</span> },
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
    ],
    []
  );

  const renderCard = (r) => {
    const TypeIcon = typeIcon(r.type);
    return (
      <CardShell>
        <div className="flex items-start gap-3">
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
