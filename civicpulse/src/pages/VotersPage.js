import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiAssetUrl } from '../api/baseUrl';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDownAZ, ArrowUpAZ, BarChart3, Download, Eye, LayoutGrid, RefreshCw, Search, Table2, X } from 'lucide-react';
import { getBooths } from '../api/booths';
import { downloadVoters, getVoterStats, getVoters } from '../api/voters';
import AlertBanner from '../components/ui/AlertBanner';
import DataTable from '../components/ui/DataTable';
import { FilterSelect } from '../components/ui/FilterBar';
import LoadingBlock from '../components/ui/LoadingBlock';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { AgePyramid, BarList, ChartCard, DataCheck, GenderDonut } from '../components/voters/VoterCharts';
import VoterModal from '../components/voters/VoterModal';
import { useApi } from '../hooks/useApi';
import {
  AGE_BANDS,
  fmt,
  genderColor,
  genderLabel,
  initials,
  MISSING_OPTIONS,
  missingFields,
  niceName,
  pct,
  relationLabel,
  roadName,
  SORT_OPTIONS,
} from '../utils/voterFormat';

const FILTER_KEYS = ['q', 'part', 'section', 'gender', 'age', 'missing'];
const btnTool =
  'inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-60';
const CHARTS_KEY = 'civicpulse_voters_charts';
const VIEW_KEY = 'civicpulse_voters_view';

/** Remember the choice; first visit: charts open on large screens, closed on phones. */
function readChartsOpen() {
  try {
    const saved = localStorage.getItem(CHARTS_KEY);
    if (saved) return saved !== 'closed';
  } catch {
    /* storage may be blocked */
  }
  return typeof window === 'undefined' ? true : window.innerWidth >= 768;
}

/** Table on wide screens, cards elsewhere, unless the person chose one. */
function readView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'table' || saved === 'cards') return saved;
  } catch {
    /* storage may be blocked */
  }
  return typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'table' : 'cards';
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

function MiniFact({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-[var(--ink)]">{children || <span className="text-[var(--muted)]">—</span>}</dd>
    </div>
  );
}

function Avatar({ voter, size = 'h-8 w-8 text-[11px]' }) {
  const [broken, setBroken] = useState(false);
  // Telugu rolls: the real photo from the card. Everyone else (or if the photo cannot be loaded): coloured initials.
  if (voter.photo_url && !broken) {
    return (
      <img
        src={apiAssetUrl(voter.photo_url)}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full border border-[var(--line)] bg-[var(--bg-muted)] object-cover object-top ${size.split(' ').filter((c) => /^(h|w)-/.test(c)).join(' ')}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size}`}
      style={{ background: genderColor(voter.gender) }}
      aria-hidden
    >
      {initials(voter.name)}
    </span>
  );
}

function ViewButton({ voter, onView, className = '' }) {
  return (
    <button
      type="button"
      onClick={() => onView(voter.id)}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)] hover:bg-[var(--bg-muted)] ${className}`}
      aria-label={`View details of ${niceName(voter.name)}`}
    >
      <Eye className="h-3.5 w-3.5" />
      View
    </button>
  );
}

/** Phone layout: one card per voter instead of a wide table. */
function VoterCard({ voter, onView }) {
  const missing = missingFields(voter);
  return (
    <li className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3.5 shadow-soft">
      <div className="flex items-start gap-3">
        <Avatar voter={voter} size="h-10 w-10 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-1.5 font-bold leading-snug text-[var(--ink)]">
            <span className="break-words">{niceName(voter.name)}</span>
            {missing.length ? (
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-ink)]"
                aria-label={`Not read: ${missing.join(', ')}`}
              />
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Voter no. {voter.serial_no} · Booth {voter.part_no}
          </p>
        </div>
        <ViewButton voter={voter} onView={onView} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-[var(--line)] pt-3">
        <MiniFact label="Voter ID">
          {voter.epic ? <span className="font-mono text-xs">{voter.epic}</span> : <span className="text-[var(--muted)]">Not read</span>}
        </MiniFact>
        <MiniFact label="Age · Gender">
          {voter.age != null ? voter.age : 'Age not read'} · {voter.gender && voter.gender !== 'U' ? genderLabel(voter.gender) : 'Gender not read'}
        </MiniFact>
        <MiniFact label={relationLabel(voter.relation_type)} className="col-span-2">
          {niceName(voter.relation_name)}
        </MiniFact>
        <MiniFact label="House no.">{voter.house_number}</MiniFact>
        <MiniFact label="Address note">{voter.address_note ? niceName(voter.address_note) : null}</MiniFact>
        <MiniFact label="Road" className="col-span-2">
          {roadName(voter)}
        </MiniFact>
      </dl>
    </li>
  );
}

export default function VotersPage() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const f = {};
    FILTER_KEYS.forEach((k) => {
      f[k] = params.get(k) || (k === 'q' ? '' : 'all');
    });
    return f;
  }, [params]);
  const sort = params.get('sort') || 'serial';
  const dir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const [search, setSearch] = useState(filters.q);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [chartsOpen, setChartsOpen] = useState(readChartsOpen);
  const [view, setView] = useState(readView);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [viewId, setViewId] = useState(null);

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

  const setFilter = useCallback(
    (key, value) => {
      const changes = { [key]: value };
      if (key === 'part') changes.section = 'all';
      patchParams(changes);
    },
    [patchParams]
  );

  // Search box: wait for a short pause in typing before querying.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.q) patchParams({ q: search.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [search, filters.q, patchParams]);

  useEffect(() => {
    setSearch(filters.q);
  }, [filters.q]);

  const apiFilters = useMemo(() => {
    const out = {};
    FILTER_KEYS.forEach((k) => {
      if (filters[k] && filters[k] !== 'all') out[k] = filters[k];
    });
    return out;
  }, [filters]);

  const filterSignature = JSON.stringify(apiFilters);
  useEffect(() => {
    setPage(1);
  }, [filterSignature, sort, dir, pageSize]);

  const { data: booths } = useApi(getBooths, []);
  const stats = useApi(() => getVoterStats(apiFilters), [filterSignature]);
  const list = useApi(
    () => getVoters({ ...apiFilters, sort, dir, page, limit: pageSize }),
    [filterSignature, sort, dir, page, pageSize]
  );

  const summary = stats.data;
  const rows = list.data?.rows || [];
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const paging = {
    page,
    pageCount,
    from: total ? (page - 1) * pageSize + 1 : 0,
    to: Math.min(page * pageSize, total),
    total,
    pageSize,
    onPageChange: setPage,
    onPageSizeChange: setPageSize,
  };

  const refreshAll = useCallback(() => {
    stats.reload({ silent: true });
    list.reload({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.reload, list.reload]);

  const boothOptions = useMemo(
    () => [
      { value: 'all', label: 'All booths' },
      ...(booths || [])
        .filter((b) => b.voter_count > 0 || String(b.part_no) === filters.part)
        .map((b) => ({
          value: String(b.part_no),
          label: `Booth ${b.part_no}${b.voter_count ? ` · ${fmt(b.voter_count)} voters` : ''}`,
        })),
    ],
    [booths, filters.part]
  );

  const sections = useMemo(() => summary?.sections || [], [summary]);
  const singleBooth = (summary?.parts || []).length <= 1;
  const roadOptions = useMemo(
    () => [
      { value: 'all', label: 'All roads' },
      ...sections.map((s) => ({
        value: String(s.section_no),
        label: `${niceName(s.section_name)} — ${s.count} voters`,
      })),
    ],
    [sections]
  );
  const roadsEnabled = filters.part !== 'all' || singleBooth;

  const genderTotals = useMemo(() => {
    const g = Object.fromEntries((summary?.genders || []).map((x) => [x.key, x.count]));
    return { M: g.M || 0, F: g.F || 0, U: g.U || 0 };
  }, [summary]);

  const roadItems = useMemo(() => {
    const showBooth = !singleBooth && filters.part === 'all';
    return sections.map((s) => ({
      key: `${s.part_no}-${s.section_no}`,
      part_no: s.part_no,
      section_no: s.section_no,
      label: `${showBooth ? `B${s.part_no} · ` : ''}${niceName(s.section_name)}`,
      value: s.count,
    }));
  }, [sections, singleBooth, filters.part]);

  const boothItems = useMemo(
    () =>
      (summary?.parts || []).map((p) => ({
        key: String(p.part_no),
        part_no: p.part_no,
        label: `Booth ${p.part_no}`,
        value: p.count,
      })),
    [summary]
  );

  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.q) chips.push({ key: 'q', label: `“${filters.q}”` });
    if (filters.part !== 'all') chips.push({ key: 'part', label: `Booth ${filters.part}` });
    if (filters.section !== 'all') {
      const s = sections.find((x) => String(x.section_no) === filters.section);
      chips.push({ key: 'section', label: s ? niceName(s.section_name) : `Road ${filters.section}` });
    }
    if (filters.gender !== 'all') {
      chips.push({ key: 'gender', label: filters.gender === 'M' ? 'Male' : filters.gender === 'F' ? 'Female' : 'Gender not read' });
    }
    if (filters.age !== 'all') chips.push({ key: 'age', label: `Age ${filters.age}` });
    if (filters.missing !== 'all') {
      chips.push({ key: 'missing', label: MISSING_OPTIONS.find((m) => m.value === filters.missing)?.label || filters.missing });
    }
    return chips;
  }, [filters, sections]);

  function clearChip(key) {
    if (key === 'q') setSearch('');
    setFilter(key, key === 'q' ? '' : 'all');
  }

  function clearAll() {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  }

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

  async function onExport() {
    setExporting(true);
    setNotice('');
    try {
      const result = await downloadVoters({ ...apiFilters, sort, dir });
      setNotice(`Downloaded ${fmt(result.count)} voters.`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setExporting(false);
    }
  }

  // Every detail of a voter is a column; Name and Details stay pinned while scrolling sideways.
  const columns = useMemo(
    () => [
      {
        key: 'serial_no',
        header: 'No.',
        accessor: (r) => r.serial_no ?? '—',
        align: 'right',
        className: 'tabular-nums text-[var(--muted)]',
        width: '3.5rem',
        sticky: 'left',
        stickyOffset: 0,
      },
      {
        key: 'name',
        header: 'Name',
        truncate: false,
        sticky: 'left',
        stickyOffset: '3.5rem',
        cell: (r) => {
          const missing = missingFields(r);
          return (
            <div className="flex min-w-[10rem] items-center gap-2">
              <Avatar voter={r} size="h-7 w-7 text-[10px]" />
              <span className="font-semibold leading-snug text-[var(--ink)]">{niceName(r.name)}</span>
              {missing.length ? (
                <span title={`Not read: ${missing.join(', ')}`} className="shrink-0 text-[var(--accent-ink)]">
                  <AlertTriangle className="h-3.5 w-3.5" aria-label={`Not read: ${missing.join(', ')}`} />
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: 'relation_type',
        header: 'Relation',
        accessor: (r) => relationLabel(r.relation_type),
        width: '5.5rem',
      },
      {
        key: 'relation_name',
        header: 'Relative’s name',
        truncate: false,
        cell: (r) => <span className="inline-block min-w-[7.5rem] leading-snug">{niceName(r.relation_name) || '—'}</span>,
      },
      {
        key: 'epic',
        header: 'Voter ID',
        truncate: false,
        cell: (r) =>
          r.epic ? (
            <span className="font-mono text-xs text-[var(--ink-soft)]">{r.epic}</span>
          ) : (
            <span className="text-xs text-[var(--muted)]">Not read</span>
          ),
        width: '7rem',
      },
      {
        key: 'age',
        header: 'Age',
        accessor: (r) => r.age ?? '—',
        align: 'right',
        className: 'tabular-nums',
        width: '3.5rem',
      },
      {
        key: 'gender',
        header: 'Gender',
        truncate: false,
        cell: (r) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-2 w-2 rounded-full" style={{ background: genderColor(r.gender) }} />
            {genderLabel(r.gender)}
          </span>
        ),
        width: '6rem',
      },
      {
        key: 'house_number',
        header: 'House no.',
        truncate: false,
        cell: (r) => <span className="inline-block min-w-[4rem] font-semibold tabular-nums">{r.house_number || '—'}</span>,
      },
      {
        key: 'address_note',
        header: 'Address note',
        truncate: false,
        cell: (r) =>
          r.address_note ? (
            <span className="inline-block min-w-[6rem] max-w-[10rem] break-words leading-snug text-[var(--ink-soft)]">{niceName(r.address_note)}</span>
          ) : (
            <span className="text-[var(--muted)]">—</span>
          ),
      },
      {
        key: 'road',
        header: 'Road',
        truncate: false,
        cell: (r) => <span className="inline-block min-w-[7rem] whitespace-nowrap leading-snug">{roadName(r) || '—'}</span>,
      },
      {
        key: 'view',
        header: 'Details',
        align: 'center',
        truncate: false,
        sticky: 'right',
        cell: (r) => <ViewButton voter={r} onView={setViewId} />,
        width: '5.5rem',
      },
    ],
    []
  );

  const femaleShare = pct(genderTotals.F, genderTotals.M + genderTotals.F);
  const dataIssues = summary?.needs_check || 0;
  const emptyTitle = activeChips.length ? 'No voters match these filters' : 'No voters yet';
  const emptyText = activeChips.length
    ? 'Try removing a filter, or check the spelling of the name.'
    : 'Upload a voter list or add voters from a spreadsheet on the Data page.';

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Find any voter and see every detail in one table, with charts to explore each road and age group."
        actions={
          <>
            <div className="hidden items-center rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-0.5 md:inline-flex" role="group" aria-label="Choose how to show voters">
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
            <button type="button" onClick={onExport} disabled={exporting || !total} className={btnTool}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {exporting ? 'Preparing…' : 'Download list'}
            </button>
            <button type="button" onClick={refreshAll} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </>
        }
      />

      {/* Filters scope everything below */}
      <section aria-label="Filters" className="space-y-2.5 rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3 shadow-soft">
        <label className="relative block">
          <span className="sr-only">Search voters</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name (English or తెలుగు), voter ID, house…"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] py-2 pl-10 pr-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          />
        </label>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-3 xl:grid-cols-6">
          <FilterField label="Booth">
            <FilterSelect label="Booth" className="w-full" value={filters.part} onChange={(v) => setFilter('part', v)} options={boothOptions} />
          </FilterField>
          <FilterField label="Road">
            <FilterSelect
              label="Road"
              className={`w-full ${roadsEnabled ? '' : 'opacity-60'}`}
              value={filters.section}
              onChange={(v) => setFilter('section', v)}
              options={roadsEnabled ? roadOptions : [{ value: 'all', label: 'Pick a booth first' }]}
            />
          </FilterField>
          <FilterField label="Gender">
            <FilterSelect
              label="Gender"
              className="w-full"
              value={filters.gender}
              onChange={(v) => setFilter('gender', v)}
              options={[
                { value: 'all', label: 'All genders' },
                { value: 'M', label: 'Male' },
                { value: 'F', label: 'Female' },
                { value: 'U', label: 'Gender not read' },
              ]}
            />
          </FilterField>
          <FilterField label="Age">
            <FilterSelect
              label="Age"
              className="w-full"
              value={filters.age}
              onChange={(v) => setFilter('age', v)}
              options={[{ value: 'all', label: 'All ages' }, ...AGE_BANDS.map((b) => ({ value: b, label: `Age ${b}` }))]}
            />
          </FilterField>
          <FilterField label="Record check">
            <FilterSelect label="Record check" className="w-full" value={filters.missing} onChange={(v) => setFilter('missing', v)} options={MISSING_OPTIONS} />
          </FilterField>
          <FilterField label="Sort by">
            <div className="flex items-stretch gap-1.5">
              <FilterSelect
                label="Sort by"
                value={sort}
                onChange={(v) => patchParams({ sort: v === 'serial' ? '' : v })}
                options={SORT_OPTIONS}
                fluid
                className="w-full min-w-0 flex-1"
              />
              <button
                type="button"
                className="inline-flex w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                aria-label={dir === 'asc' ? 'Sorted ascending, switch to descending' : 'Sorted descending, switch to ascending'}
                title={dir === 'asc' ? 'Ascending (A→Z)' : 'Descending (Z→A)'}
                onClick={() => patchParams({ dir: dir === 'asc' ? 'desc' : '' })}
              >
                {dir === 'asc' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
              </button>
            </div>
          </FilterField>
        </div>

        {activeChips.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
            <span className="text-xs font-semibold text-[var(--muted)]">Showing:</span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => clearChip(chip.key)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--brand)] transition hover:bg-[var(--brand)]/20"
                aria-label={`Remove filter ${chip.label}`}
              >
                {chip.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button type="button" onClick={clearAll} className="text-xs font-semibold text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline">
              Clear all
            </button>
          </div>
        ) : null}
      </section>

      <AlertBanner tone="danger">{list.error || stats.error}</AlertBanner>
      <AlertBanner tone="info">{notice}</AlertBanner>

      {/* Headline numbers: one strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] shadow-soft sm:grid-cols-5">
        <Stat label="Voters" value={fmt(summary?.total ?? total)} hint={activeChips.length ? 'matching filters' : 'in the loaded lists'} />
        <Stat label="Households" value={fmt(summary?.households)} hint="homes to visit" />
        <Stat label="Average age" value={summary?.avg_age ? Math.round(summary.avg_age) : '—'} hint="years" />
        <Stat label="Women" value={`${femaleShare}%`}>
          <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${femaleShare}% women`}>
            <span style={{ flexGrow: genderTotals.M, background: 'var(--viz-male)' }} />
            <span style={{ flexGrow: genderTotals.F, background: 'var(--viz-female)' }} />
          </div>
        </Stat>
        <Stat
          className="col-span-2 sm:col-span-1"
          label="Need checking"
          value={fmt(dataIssues)}
          hint={summary?.total ? `${pct(dataIssues, summary.total)}% have a detail not read` : ' '}
        >
          {dataIssues ? (
            <button
              type="button"
              onClick={() => setFilter('missing', filters.missing === 'any' ? 'all' : 'any')}
              className="mt-1.5 text-xs font-semibold text-[var(--brand)] hover:underline"
            >
              {filters.missing === 'any' ? 'Show everyone' : 'Show these voters'}
            </button>
          ) : null}
        </Stat>
      </div>

      {/* Charts: every one is a filter */}
      {chartsOpen ? (
        <div className={`viz-fade grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${stats.loading ? 'opacity-60' : ''}`}>
          <ChartCard center title="Men and women" subtitle="Click a group to filter">
            <GenderDonut genders={summary?.genders || []} active={filters.gender === 'all' ? null : filters.gender} onPick={(v) => setFilter('gender', v)} />
          </ChartCard>

          <ChartCard center title="Age groups" subtitle="Click an age group to filter">
            <AgePyramid bands={summary?.age_bands || []} active={filters.age === 'all' ? null : filters.age} onPick={(v) => setFilter('age', v)} />
          </ChartCard>

          <ChartCard center className="md:col-span-2 xl:col-span-1" title="Data check" subtitle="How complete the details are">
            <DataCheck summary={summary} activeKey={filters.missing === 'all' || filters.missing === 'any' ? null : filters.missing} onPick={(v) => setFilter('missing', v)} />
          </ChartCard>

          <ChartCard
            className="md:col-span-2 xl:col-span-3"
            title={singleBooth || filters.part !== 'all' ? 'Voters on each road' : 'Voters in each booth'}
            subtitle="Numbers show how many voters · click a bar to filter"
          >
            {singleBooth || filters.part !== 'all' ? (
              <BarList
                columns
                items={roadItems}
                activeKey={filters.section === 'all' ? null : `${filters.part !== 'all' ? filters.part : sections[0]?.part_no}-${filters.section}`}
                onPick={(item) => {
                  const same = filters.section === String(item.section_no);
                  patchParams({ part: String(item.part_no), section: same ? 'all' : String(item.section_no) });
                }}
                empty="Roads appear once a voter list is loaded."
              />
            ) : (
              <BarList
                columns
                items={boothItems}
                activeKey={filters.part === 'all' ? null : filters.part}
                onPick={(item) => setFilter('part', filters.part === String(item.part_no) ? 'all' : String(item.part_no))}
              />
            )}
          </ChartCard>
        </div>
      ) : null}

      {/* Voters: table on larger screens, cards on phones */}
      <div className={`hidden ${view === 'table' ? 'md:block' : ''}`}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          loading={list.loading && !list.data}
          dense
          maxHeight="none"
          emptyTitle={emptyTitle}
          emptyDescription={emptyText}
          emptyActionLabel={activeChips.length ? undefined : 'Go to Data'}
          emptyActionTo={activeChips.length ? undefined : '/app/data'}
          pagination={paging}
        />
      </div>

      <div className={view === 'table' ? 'md:hidden' : ''}>
        {list.loading && !list.data ? (
          <LoadingBlock label="Loading…" />
        ) : rows.length ? (
          <>
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.map((voter) => (
                <VoterCard key={voter.id} voter={voter} onView={setViewId} />
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

      {viewId != null ? <VoterModal id={viewId} onClose={() => setViewId(null)} onSelect={setViewId} onChanged={refreshAll} /> : null}
    </section>
  );
}
