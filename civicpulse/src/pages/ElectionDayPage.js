import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Pencil, RefreshCw } from 'lucide-react';
import { getElectionDay, updateElectionDay } from '../api/electionDay';
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../auth/roles';
import AlertBanner from '../components/ui/AlertBanner';
import DataList, { CardShell } from '../components/ui/DataList';
import { FilterSelect } from '../components/ui/FilterBar';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { btnPrimary } from '../components/ui/Panel';
import { FilterField, FilterPanel, MiniFact, StatStrip, ViewSwitch, btnTool, inputSm, useChartsOpen, useDebouncedSearch, useViewMode } from '../components/ui/kit';
import { BarList, ChartCard } from '../components/voters/VoterCharts';
import { useApi } from '../hooks/useApi';
import { REACH_STEPS, reachStep, stationName } from '../utils/boothFormat';
import { fmt, pct, plural } from '../utils/voterFormat';

const SORTS = [
  { value: 'part', label: 'Booth number' },
  { value: 'lowest', label: 'Lowest turnout first' },
  { value: 'highest', label: 'Highest turnout first' },
  { value: 'tovote', label: 'Most still to vote' },
];

function Turnout({ value }) {
  const v = Math.round(value);
  return (
    <div className="flex min-w-[7.5rem] items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--viz-track)]">
        <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${Math.min(100, v)}%` }} />
      </span>
      <span className="w-9 text-right text-xs font-semibold tabular-nums text-[var(--ink)]">{v}%</span>
    </div>
  );
}

function CountField({ label, value, onChange, steps, max }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--muted)]">
        {label}
        <input
          type="number"
          min="0"
          max={max || undefined}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
          className={`${inputSm} mt-1 text-lg font-bold tabular-nums`}
        />
      </label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {steps.map((n) => (
          <button key={n} type="button" onClick={() => onChange(Math.min(max || Infinity, (Number(value) || 0) + n))} className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)]">
            +{n}
          </button>
        ))}
        <button type="button" onClick={() => onChange(0)} className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
          Reset
        </button>
      </div>
    </div>
  );
}

function CountsModal({ row, onClose, onSaved }) {
  const [slips, setSlips] = useState(row.slip_printed);
  const [voted, setVoted] = useState(row.voted_count);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const turnout = row.voters ? Math.round((1000 * (Number(voted) || 0)) / row.voters) / 10 : 0;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateElectionDay(row.part_no, { slip_printed: Number(slips) || 0, voted_count: Number(voted) || 0 });
      onSaved(`Booth ${row.part_no} updated.`);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Booth ${row.part_no} · today’s counts`}
      subtitle={`${stationName(row.polling_station_name, row.part_no)} · ${fmt(row.voters)} voters on the list`}
      badge={row.part_no}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">
            Cancel
          </button>
          <button type="submit" form="counts-form" disabled={busy} className={`${btnPrimary} !py-2`}>
            {busy ? 'Saving…' : 'Save counts'}
          </button>
        </>
      }
    >
      <AlertBanner tone="danger">{error}</AlertBanner>
      <form id="counts-form" onSubmit={save} className="space-y-4">
        <CountField label="Voting slips printed" value={slips} onChange={setSlips} steps={[10, 50, 100]} />
        <CountField label="Voters who have voted" value={voted} onChange={setVoted} steps={[1, 5, 10, 50]} max={row.voters} />
        <div className="rounded-xl bg-[var(--bg-muted)] px-3 py-2.5">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-[var(--ink-soft)]">Turnout</span>
            <span className="text-[var(--muted)]">
              <span className="text-base font-extrabold tabular-nums text-[var(--ink)]">{turnout}%</span> · {fmt(Math.max(0, row.voters - (Number(voted) || 0)))} still to vote
            </span>
          </div>
          <Turnout value={turnout} />
        </div>
      </form>
    </Modal>
  );
}

export default function ElectionDayPage() {
  const { role } = useAuth();
  const canEdit = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR, ROLES.BOOTH_AGENT].includes(role);

  const { data, loading, error, reload } = useApi(getElectionDay, []);
  const all = useMemo(() => data || [], [data]);

  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'part';
  const patch = useCallback(
    (changes) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );
  const [search, setSearch] = useDebouncedSearch(q, (v) => patch({ q: v }));

  const [view, setView] = useViewMode('civicpulse_election_view');
  const [chartsOpen, setChartsOpen] = useChartsOpen('civicpulse_election_charts');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => setPage(1), [q, sort, pageSize]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = all.filter((r) => !needle || String(r.part_no) === needle || stationName(r.polling_station_name, r.part_no).toLowerCase().includes(needle));
    const by = {
      part: (a, b) => a.part_no - b.part_no,
      lowest: (a, b) => a.turnout_pct - b.turnout_pct || a.part_no - b.part_no,
      highest: (a, b) => b.turnout_pct - a.turnout_pct || a.part_no - b.part_no,
      tovote: (a, b) => b.to_vote - a.to_vote || a.part_no - b.part_no,
    }[sort];
    return [...list].sort(by);
  }, [all, q, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = { page: safePage, pageCount, from: filtered.length ? (safePage - 1) * pageSize + 1 : 0, to: Math.min(safePage * pageSize, filtered.length), total: filtered.length, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };

  const totals = useMemo(() => {
    const t = { voters: 0, slips: 0, voted: 0 };
    all.forEach((r) => {
      t.voters += r.voters;
      t.slips += r.slip_printed;
      t.voted += r.voted_count;
    });
    return t;
  }, [all]);
  const turnout = totals.voters ? Math.round((1000 * totals.voted) / totals.voters) / 10 : 0;
  const behind = useMemo(
    () => [...all].filter((r) => r.voters).sort((a, b) => a.turnout_pct - b.turnout_pct).slice(0, 8).map((r) => ({ key: String(r.part_no), part_no: r.part_no, label: `Booth ${r.part_no} · ${stationName(r.polling_station_name, r.part_no)}`, value: Math.round(r.turnout_pct) })),
    [all]
  );

  const edit = (r) => (canEdit ? setEditing(r) : null);

  const columns = useMemo(
    () => [
      { key: 'part_no', header: 'Booth', accessor: 'part_no', align: 'center', className: 'font-bold tabular-nums', width: '4.5rem', sticky: 'left', stickyOffset: 0 },
      { key: 'station', header: 'Polling station', truncate: false, cell: (r) => <span className="inline-block max-w-[20rem] truncate align-middle font-semibold text-[var(--ink)]">{stationName(r.polling_station_name, r.part_no)}</span> },
      { key: 'voters', header: 'Voters', accessor: (r) => fmt(r.voters), align: 'right', className: 'tabular-nums', width: '5rem' },
      { key: 'slips', header: 'Slips printed', accessor: (r) => fmt(r.slip_printed), align: 'right', className: 'tabular-nums', width: '6.5rem' },
      { key: 'voted', header: 'Voted', accessor: (r) => fmt(r.voted_count), align: 'right', className: 'tabular-nums font-semibold', width: '5rem' },
      { key: 'tovote', header: 'Still to vote', accessor: (r) => fmt(r.to_vote), align: 'right', className: 'tabular-nums', width: '6.5rem' },
      { key: 'turnout', header: 'Turnout', truncate: false, cell: (r) => <Turnout value={r.turnout_pct} />, width: '9rem' },
      { key: 'agent', header: 'Booth agent', truncate: false, cell: (r) => (r.agent_name ? <span className="whitespace-nowrap">{r.agent_name}</span> : <span className="text-[var(--muted)]">Not assigned</span>) },
      {
        key: 'update',
        header: canEdit ? 'Update' : 'Details',
        align: 'center',
        truncate: false,
        sticky: 'right',
        width: '6rem',
        cell: (r) => (
          <button type="button" onClick={() => edit(r)} disabled={!canEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)] disabled:opacity-50">
            <Pencil className="h-3.5 w-3.5" />
            Update
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit]
  );

  const renderCard = (r) => (
    <CardShell>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-2 text-sm font-extrabold text-white">{r.part_no}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-[var(--ink)]">{stationName(r.polling_station_name, r.part_no)}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{r.agent_name || 'No booth agent'}</p>
        </div>
        {canEdit ? (
          <button type="button" onClick={() => edit(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)]">
            <Pencil className="h-3.5 w-3.5" />
            Update
          </button>
        ) : null}
      </div>
      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--muted)]">
          <span>Turnout</span>
          <span className="tabular-nums">{fmt(r.voted_count)} of {fmt(r.voters)}</span>
        </div>
        <Turnout value={r.turnout_pct} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <MiniFact label="Slips printed">{fmt(r.slip_printed)}</MiniFact>
        <MiniFact label="Voted">{fmt(r.voted_count)}</MiniFact>
        <MiniFact label="Still to vote">{fmt(r.to_vote)}</MiniFact>
      </dl>
    </CardShell>
  );

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Polling day at a glance: slips printed, votes cast and turnout for every booth."
        actions={
          <>
            <ViewSwitch view={view} onChange={setView} />
            <button type="button" onClick={() => setChartsOpen((o) => !o)} className={btnTool} aria-pressed={chartsOpen}>
              <BarChart3 className="h-3.5 w-3.5" />
              {chartsOpen ? 'Hide charts' : 'Show charts'}
            </button>
            <button type="button" onClick={() => reload({ silent: true })} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </>
        }
      />

      <FilterPanel search={search} onSearch={setSearch} placeholder="Search booth number or polling station…" chips={q ? [{ key: 'q', label: `“${q}”`, onRemove: () => setSearch('') }] : []} onClearAll={() => setSearch('')} cols="md:grid-cols-4">
        <FilterField label="Sort by" className="col-span-2 md:col-span-1">
          <FilterSelect label="Sort by" className="w-full" value={sort} onChange={(v) => patch({ sort: v === 'part' ? '' : v })} options={SORTS} />
        </FilterField>
      </FilterPanel>

      <AlertBanner tone="danger">{error}</AlertBanner>
      <AlertBanner tone="success">{notice}</AlertBanner>

      <StatStrip
        items={[
          { label: 'Voters on the list', value: fmt(totals.voters), hint: plural(all.length, 'booth') },
          { label: 'Slips printed', value: fmt(totals.slips), hint: `${pct(totals.slips, totals.voters)}% of voters` },
          { label: 'Voted so far', value: fmt(totals.voted), hint: 'across all booths' },
          { label: 'Turnout', value: `${turnout}%`, children: <div className="mt-2"><Turnout value={turnout} /></div> },
          { label: 'Still to vote', value: fmt(Math.max(0, totals.voters - totals.voted)), hint: 'people to bring out' },
        ]}
      />

      {chartsOpen && all.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ChartCard className={all.length > 1 ? 'md:col-span-2' : 'md:col-span-2 xl:col-span-3'} title="Turnout by booth" subtitle="Each square is a booth. Darker means higher turnout. Click one to update it.">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(1.6rem,1fr))] gap-1">
              {all.map((b) => {
                const step = reachStep(Math.round(b.turnout_pct));
                return (
                  <button
                    key={b.part_no}
                    type="button"
                    onClick={() => edit(b)}
                    title={`Booth ${b.part_no} · ${Math.round(b.turnout_pct)}% turnout`}
                    aria-label={`Booth ${b.part_no}, ${Math.round(b.turnout_pct)}% turnout`}
                    className="flex aspect-square items-center justify-center rounded-md text-[9px] font-bold ring-1 ring-inset ring-[var(--line)] transition hover:scale-110 hover:ring-2 hover:ring-[var(--brand)]"
                    style={{ background: step.color, color: b.turnout_pct >= 25 ? '#fff' : 'var(--ink-soft)' }}
                  >
                    {b.part_no}
                  </button>
                );
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--muted)]">
              {REACH_STEPS.map((s) => (
                <li key={s.label} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-[var(--line)]" style={{ background: s.color }} />
                  {s.label === 'None yet' ? 'No votes yet' : `${s.label} turnout`}
                </li>
              ))}
            </ul>
          </ChartCard>
          {all.length > 1 ? (
            <ChartCard title="Booths furthest behind" subtitle="Lowest turnout first · numbers are turnout %">
              <BarList unit="%" items={behind} onPick={(item) => edit(all.find((b) => b.part_no === item.part_no))} />
            </ChartCard>
          ) : null}
        </div>
      ) : null}

      <DataList
        view={view}
        columns={columns}
        rows={rows}
        rowKey="part_no"
        renderCard={renderCard}
        loading={loading && !data}
        pagination={paging}
        emptyTitle={q ? 'No booths match' : 'No booths yet'}
        emptyDescription={q ? 'Try a different booth number or name.' : 'Upload a voter list from Data so booths appear here.'}
        emptyActionLabel={q ? undefined : 'Go to Data'}
        emptyActionTo={q ? undefined : '/app/data'}
      />

      {editing ? (
        <CountsModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setNotice(msg);
            reload({ silent: true });
          }}
        />
      ) : null}
    </section>
  );
}
