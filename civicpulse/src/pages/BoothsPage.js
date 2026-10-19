import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownAZ, ArrowUpAZ, BarChart3, Eye, LayoutGrid, RefreshCw, Search, Table2, X } from 'lucide-react';
import { getBooths } from '../api/booths';
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../auth/roles';
import BoothModal from '../components/booths/BoothModal';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import { FilterSelect } from '../components/ui/FilterBar';
import LoadingBlock from '../components/ui/LoadingBlock';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { BarList, ChartCard } from '../components/voters/VoterCharts';
import { useApi } from '../hooks/useApi';
import { BOOTH_SORTS, BOOTH_STATUS, REACH_STEPS, boothStatus, reachStep, reachedPct, stationName } from '../utils/boothFormat';
import { fmt, pct } from '../utils/voterFormat';

const VIEW_KEY = 'civicpulse_booths_view';
const CHARTS_KEY = 'civicpulse_booths_charts';
const btnTool =
  'inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-60';

function readView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'table' || saved === 'cards') return saved;
  } catch {
    /* storage may be blocked */
  }
  return typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'table' : 'cards';
}

function readChartsOpen() {
  try {
    const saved = localStorage.getItem(CHARTS_KEY);
    if (saved) return saved !== 'closed';
  } catch {
    /* storage may be blocked */
  }
  return typeof window === 'undefined' ? true : window.innerWidth >= 768;
}

function FilterField({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">{label}</span>
      {children}
    </div>
  );
}

function Stat({ label, value, hint, children, className = '' }) {
  return (
    <div className={`min-w-0 bg-[var(--bg-elevated)] px-3.5 py-3 ${className}`}>
      <p className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-extrabold leading-none tracking-tight text-[var(--ink)]">{value}</p>
      {children}
      {hint ? <p className="mt-1 text-xs leading-snug text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

function StatusPill({ value }) {
  const s = boothStatus(value);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--bg-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-soft)]">
      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

/** Bar with the figure beside it: how many of a booth's voters have been reached. */
function ReachBar({ booth }) {
  const value = reachedPct(booth);
  return (
    <div className="flex min-w-[6.5rem] items-center gap-2" title={`${fmt(booth.reached)} of ${fmt(booth.voters)} voters reached`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--viz-track)]">
        <span className="block h-full rounded-full" style={{ width: `${value}%`, background: 'var(--brand)' }} />
      </span>
      <span className="w-9 text-right text-xs font-semibold tabular-nums text-[var(--ink)]">{value}%</span>
    </div>
  );
}

/** Men and women as one small split bar with the numbers. */
function GenderSplit({ booth }) {
  const total = booth.male + booth.female;
  return (
    <div className="flex min-w-[7.5rem] items-center gap-2" title={`${fmt(booth.male)} men · ${fmt(booth.female)} women`}>
      <span className="flex h-1.5 w-10 shrink-0 gap-px overflow-hidden rounded-full">
        <span style={{ flexGrow: booth.male, background: 'var(--viz-male)' }} />
        <span style={{ flexGrow: booth.female, background: 'var(--viz-female)' }} />
        {!total ? <span className="flex-1 bg-[var(--viz-track)]" /> : null}
      </span>
      <span className="text-xs tabular-nums text-[var(--ink-soft)]">
        {fmt(booth.male)} · {fmt(booth.female)}
      </span>
    </div>
  );
}

function ViewButton({ booth, onView }) {
  return (
    <button
      type="button"
      onClick={() => onView(booth.part_no)}
      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)] hover:bg-[var(--bg-muted)]"
      aria-label={`View details of booth ${booth.part_no}`}
    >
      <Eye className="h-3.5 w-3.5" />
      View
    </button>
  );
}

function MiniFact({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-[var(--ink)]">{children || <span className="text-[var(--muted)]">—</span>}</dd>
    </div>
  );
}

function BoothCard({ booth, onView }) {
  return (
    <li className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3.5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-2 text-sm font-extrabold text-white">
          {booth.part_no}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-[var(--ink)]">{stationName(booth.polling_station_name, booth.part_no)}</p>
          <div className="mt-1">
            <StatusPill value={booth.status} />
          </div>
        </div>
        <ViewButton booth={booth} onView={onView} />
      </div>

      <div className="mt-3 border-t border-[var(--line)] pt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--muted)]">
          <span>Voters reached</span>
          <span className="tabular-nums">
            {fmt(booth.reached)} of {fmt(booth.voters)}
          </span>
        </div>
        <ReachBar booth={booth} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5">
        <MiniFact label="Voters">{fmt(booth.voters)}</MiniFact>
        <MiniFact label="Households">{fmt(booth.households)}</MiniFact>
        <MiniFact label="Roads">{fmt(booth.roads)}</MiniFact>
        <MiniFact label="Men · Women" className="col-span-3">
          <GenderSplit booth={booth} />
        </MiniFact>
        <MiniFact label="Booth agent" className="col-span-3 sm:col-span-1">
          {booth.agent_name || 'Not assigned'}
        </MiniFact>
        <MiniFact label="Coordinator" className="col-span-3 sm:col-span-2">
          {booth.coordinator_name || 'Not assigned'}
        </MiniFact>
      </dl>
    </li>
  );
}

export default function BoothsPage() {
  const { role } = useAuth();
  const canEdit = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR].includes(role);

  const { data, loading, error, reload } = useApi(getBooths, []);
  const booths = useMemo(() => data || [], [data]);

  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const status = params.get('status') || 'all';
  const assign = params.get('assign') || 'all';
  const sort = params.get('sort') || 'part';
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const [search, setSearch] = useState(q);
  const [view, setView] = useState(readView);
  const [chartsOpen, setChartsOpen] = useState(readChartsOpen);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openPart, setOpenPart] = useState(null);

  const patchParams = useCallback(
    (changes) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(changes).forEach(([key, value]) => {
            if (value == null || value === '' || value === 'all') next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) patchParams({ q: search.trim() });
    }, 250);
    return () => clearTimeout(t);
  }, [search, q, patchParams]);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [q, status, assign, sort, dir, pageSize]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = booths.filter((b) => {
      if (status !== 'all' && b.status !== status) return false;
      if (assign === 'unassigned' && b.agent_name) return false;
      if (assign === 'assigned' && !b.agent_name) return false;
      if (!needle) return true;
      return (
        String(b.part_no) === needle ||
        stationName(b.polling_station_name, b.part_no).toLowerCase().includes(needle) ||
        (b.polling_station_address || '').toLowerCase().includes(needle) ||
        (b.agent_name || '').toLowerCase().includes(needle) ||
        (b.coordinator_name || '').toLowerCase().includes(needle)
      );
    });
    const sign = dir === 'desc' ? -1 : 1;
    const key = {
      part: (b) => b.part_no,
      voters: (b) => b.voters,
      reached: (b) => reachedPct(b),
      station: (b) => stationName(b.polling_station_name, b.part_no).toLowerCase(),
    }[sort];
    return [...list].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (x < y ? -1 : x > y ? 1 : a.part_no - b.part_no) * sign;
    });
  }, [booths, q, status, assign, sort, dir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = {
    page: safePage,
    pageCount,
    from: filtered.length ? (safePage - 1) * pageSize + 1 : 0,
    to: Math.min(safePage * pageSize, filtered.length),
    total: filtered.length,
    pageSize,
    onPageChange: setPage,
    onPageSizeChange: setPageSize,
  };

  const totals = useMemo(() => {
    const t = { voters: 0, households: 0, reached: 0, with_epic: 0, noAgent: 0, noCoordinator: 0, male: 0, female: 0 };
    filtered.forEach((b) => {
      t.voters += b.voters;
      t.households += b.households;
      t.reached += b.reached;
      t.with_epic += b.with_epic;
      t.male += b.male;
      t.female += b.female;
      if (!b.agent_name) t.noAgent += 1;
      if (!b.coordinator_name) t.noCoordinator += 1;
    });
    return t;
  }, [filtered]);

  const reachedShare = pct(totals.reached, totals.voters);
  const filtersActive = Boolean(q || status !== 'all' || assign !== 'all');

  const largest = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => b.voters - a.voters)
        .slice(0, 10)
        .map((b) => ({
          key: String(b.part_no),
          part_no: b.part_no,
          label: `Booth ${b.part_no} · ${stationName(b.polling_station_name, b.part_no)}`,
          value: b.voters,
        })),
    [filtered]
  );

  const columns = useMemo(
    () => [
      {
        key: 'part_no',
        header: 'Booth',
        accessor: 'part_no',
        align: 'center',
        className: 'font-bold tabular-nums',
        width: '4.5rem',
        sticky: 'left',
        stickyOffset: 0,
      },
      {
        key: 'station',
        header: 'Polling station',
        truncate: false,
        cell: (b) => (
          <span className="inline-block max-w-[20rem] truncate align-middle font-semibold text-[var(--ink)]" title={b.polling_station_address || ''}>
            {stationName(b.polling_station_name, b.part_no)}
          </span>
        ),
      },
      {
        key: 'voters',
        header: 'Voters',
        accessor: (b) => fmt(b.voters),
        align: 'right',
        className: 'tabular-nums font-semibold',
        width: '5rem',
      },
      { key: 'gender', header: 'Men · Women', truncate: false, cell: (b) => <GenderSplit booth={b} /> },
      { key: 'roads', header: 'Roads', accessor: (b) => fmt(b.roads), align: 'right', className: 'tabular-nums', width: '4.5rem' },
      {
        key: 'agent',
        header: 'Booth agent',
        truncate: false,
        cell: (b) => (b.agent_name ? <span className="whitespace-nowrap">{b.agent_name}</span> : <span className="text-[var(--muted)]">Not assigned</span>),
      },
      {
        key: 'coordinator',
        header: 'Coordinator',
        truncate: false,
        cell: (b) => (b.coordinator_name ? <span className="whitespace-nowrap">{b.coordinator_name}</span> : <span className="text-[var(--muted)]">Not assigned</span>),
      },
      { key: 'reach', header: 'Voters reached', truncate: false, cell: (b) => <ReachBar booth={b} />, width: '8rem' },
      { key: 'status', header: 'Status', truncate: false, cell: (b) => <StatusPill value={b.status} />, width: '7.5rem' },
      {
        key: 'view',
        header: 'Details',
        align: 'center',
        truncate: false,
        sticky: 'right',
        cell: (b) => <ViewButton booth={b} onView={setOpenPart} />,
        width: '5.5rem',
      },
    ],
    []
  );

  function chooseView(next) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* storage may be blocked */
    }
  }

  function toggleCharts() {
    setChartsOpen((open) => {
      try {
        localStorage.setItem(CHARTS_KEY, open ? 'closed' : 'open');
      } catch {
        /* storage may be blocked */
      }
      return !open;
    });
  }

  const readiness = [
    { label: 'Booths with an agent', value: pct(filtered.length - totals.noAgent, filtered.length), detail: `${fmt(filtered.length - totals.noAgent)} of ${fmt(filtered.length)}` },
    { label: 'Booths with a coordinator', value: pct(filtered.length - totals.noCoordinator, filtered.length), detail: `${fmt(filtered.length - totals.noCoordinator)} of ${fmt(filtered.length)}` },
    { label: 'Voter IDs read', value: pct(totals.with_epic, totals.voters), detail: `${fmt(totals.with_epic)} of ${fmt(totals.voters)}` },
    { label: 'Voters reached', value: reachedShare, detail: `${fmt(totals.reached)} of ${fmt(totals.voters)}` },
  ];

  const emptyTitle = filtersActive ? 'No booths match these filters' : 'No booths yet';
  const emptyText = filtersActive ? 'Try removing a filter.' : 'Upload a voter list from Data to create the first booth.';

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Every polling booth in Eluru: who is voting there, who looks after it, and how much has been reached."
        actions={
          <>
            <div className="hidden items-center rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-0.5 md:inline-flex" role="group" aria-label="Choose how to show booths">
              {[
                ['table', 'Table', Table2],
                ['cards', 'Cards', LayoutGrid],
              ].map(([id, label, ViewIcon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => chooseView(id)}
                  aria-pressed={view === id}
                  className={`inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-semibold transition ${
                    view === id ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--ink-soft)] hover:text-[var(--brand)]'
                  }`}
                >
                  <ViewIcon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={toggleCharts} className={btnTool} aria-pressed={chartsOpen}>
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              {chartsOpen ? 'Hide charts' : 'Show charts'}
            </button>
            <button type="button" onClick={() => reload({ silent: true })} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </>
        }
      />

      <section aria-label="Filters" className="space-y-2.5 rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3 shadow-soft">
        <label className="relative block">
          <span className="sr-only">Search booths</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search booth, station, address or agent…"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] py-2 pl-10 pr-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          />
        </label>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-4">
          <FilterField label="Status">
            <FilterSelect
              label="Status"
              className="w-full"
              value={status}
              onChange={(v) => patchParams({ status: v })}
              options={[{ value: 'all', label: 'All statuses' }, ...BOOTH_STATUS.map((s) => ({ value: s.value, label: s.label }))]}
            />
          </FilterField>
          <FilterField label="Booth agent">
            <FilterSelect
              label="Booth agent"
              className="w-full"
              value={assign}
              onChange={(v) => patchParams({ assign: v })}
              options={[
                { value: 'all', label: 'Any' },
                { value: 'unassigned', label: 'Not assigned' },
                { value: 'assigned', label: 'Assigned' },
              ]}
            />
          </FilterField>
          <FilterField label="Sort by" className="col-span-2">
            <div className="flex items-stretch gap-1.5">
              <FilterSelect
                label="Sort by"
                fluid
                className="w-full min-w-0 flex-1"
                value={sort}
                onChange={(v) => patchParams({ sort: v === 'part' ? '' : v })}
                options={BOOTH_SORTS}
              />
              <button
                type="button"
                className="inline-flex w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                aria-label={dir === 'asc' ? 'Sorted ascending, switch to descending' : 'Sorted descending, switch to ascending'}
                onClick={() => patchParams({ dir: dir === 'asc' ? 'desc' : '' })}
              >
                {dir === 'asc' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
              </button>
            </div>
          </FilterField>
        </div>

        {filtersActive ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
            <span className="text-xs font-semibold text-[var(--muted)]">Showing:</span>
            {[
              q && { key: 'q', label: `“${q}”` },
              status !== 'all' && { key: 'status', label: boothStatus(status).label },
              assign !== 'all' && { key: 'assign', label: assign === 'unassigned' ? 'No agent' : 'Has agent' },
            ]
              .filter(Boolean)
              .map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    if (chip.key === 'q') setSearch('');
                    patchParams({ [chip.key]: '' });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--brand)] transition hover:bg-[var(--brand)]/20"
                  aria-label={`Remove filter ${chip.label}`}
                >
                  {chip.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setParams(new URLSearchParams(), { replace: true });
              }}
              className="text-xs font-semibold text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </section>

      <AlertBanner tone="danger">{error}</AlertBanner>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] shadow-soft sm:grid-cols-5">
        <Stat label="Booths" value={fmt(filtered.length)} hint={filtersActive ? 'matching filters' : 'polling booths'} />
        <Stat label="Voters" value={fmt(totals.voters)} hint={`${fmt(totals.households)} households`} />
        <Stat label="Voters reached" value={`${reachedShare}%`}>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--viz-track)]" role="img" aria-label={`${reachedShare}% of voters reached`}>
            <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${reachedShare}%` }} />
          </div>
        </Stat>
        <Stat label="Without an agent" value={fmt(totals.noAgent)} hint={totals.noAgent ? 'booths need someone' : 'all booths covered'}>
          {totals.noAgent && assign !== 'unassigned' ? (
            <button type="button" onClick={() => patchParams({ assign: 'unassigned' })} className="mt-1 text-xs font-semibold text-[var(--brand)] hover:underline">
              Show these booths
            </button>
          ) : null}
        </Stat>
        <Stat className="col-span-2 sm:col-span-1" label="Complete" value={fmt(filtered.filter((b) => b.status === 'complete').length)} hint="booths finished" />
      </div>

      {chartsOpen && filtered.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ChartCard className="md:col-span-2" title="All booths at a glance" subtitle="Each square is one booth. Darker means more of its voters have been reached. Click one to open it.">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(1.6rem,1fr))] gap-1">
              {filtered.map((b) => {
                const step = reachStep(reachedPct(b));
                return (
                  <button
                    key={b.part_no}
                    type="button"
                    onClick={() => setOpenPart(b.part_no)}
                    title={`Booth ${b.part_no} · ${stationName(b.polling_station_name, b.part_no)} · ${reachedPct(b)}% reached`}
                    aria-label={`Booth ${b.part_no}, ${reachedPct(b)}% reached`}
                    className="flex aspect-square items-center justify-center rounded-md text-[9px] font-bold ring-1 ring-inset ring-[var(--line)] transition hover:scale-110 hover:ring-2 hover:ring-[var(--brand)]"
                    style={{ background: step.color, color: reachedPct(b) >= 25 ? '#fff' : 'var(--ink-soft)' }}
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
                  {s.label} reached
                </li>
              ))}
            </ul>
          </ChartCard>

          <ChartCard center className="md:col-span-2 xl:col-span-1" title="How ready are the booths?" subtitle="Share of booths and voters covered">
            <ul className="space-y-2.5">
              {readiness.map((r) => (
                <li key={r.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--ink-soft)]">{r.label}</span>
                    <span className="text-[var(--muted)]">
                      <span className="font-bold tabular-nums text-[var(--ink)]">{r.value}%</span> · {r.detail}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--viz-track)]">
                    <div className="viz-bar-grow h-full rounded-full bg-[var(--brand)]" style={{ width: `${r.value}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </ChartCard>

          {filtered.length > 1 ? (
            <ChartCard className="md:col-span-2 xl:col-span-3" title="Largest booths" subtitle="Numbers show how many voters · click a bar to open the booth">
              <BarList columns items={largest} onPick={(item) => setOpenPart(item.part_no)} />
            </ChartCard>
          ) : null}
        </div>
      ) : null}

      <div className={`hidden ${view === 'table' ? 'md:block' : ''}`}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="part_no"
          loading={loading && !data}
          dense
          maxHeight="none"
          emptyTitle={emptyTitle}
          emptyDescription={emptyText}
          emptyActionLabel={filtersActive ? undefined : 'Go to Data'}
          emptyActionTo={filtersActive ? undefined : '/app/data'}
          pagination={paging}
        />
      </div>

      <div className={view === 'table' ? 'md:hidden' : ''}>
        {loading && !data ? (
          <LoadingBlock label="Loading…" />
        ) : rows.length ? (
          <>
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.map((b) => (
                <BoothCard key={b.part_no} booth={b} onView={setOpenPart} />
              ))}
            </ul>
            <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-soft">
              <Pagination {...paging} />
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-10 text-center">
            <p className="text-sm font-bold text-[var(--ink)]">{emptyTitle}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{emptyText}</p>
          </div>
        )}
      </div>

      {openPart != null ? (
        <BoothModal part={openPart} canEdit={canEdit} onClose={() => setOpenPart(null)} onSaved={() => reload({ silent: true })} />
      ) : null}
    </section>
  );
}
