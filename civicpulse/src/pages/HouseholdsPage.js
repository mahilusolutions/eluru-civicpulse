import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, Eye, RefreshCw } from 'lucide-react';
import { getBooths } from '../api/booths';
import { getHouseholdMembers, getHouseholds } from '../api/households';
import { getVoterStats } from '../api/voters';
import AlertBanner from '../components/ui/AlertBanner';
import DataList, { CardShell } from '../components/ui/DataList';
import { FilterSelect } from '../components/ui/FilterBar';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import { FilterField, FilterPanel, MiniFact, StatStrip, ViewSwitch, btnTool, useChartsOpen, useDebouncedSearch, useViewMode } from '../components/ui/kit';
import { BarList, ChartCard } from '../components/voters/VoterCharts';
import { useApi } from '../hooks/useApi';
import { fmt, genderColor, genderLabel, initials, niceName, relationLabel, roadName } from '../utils/voterFormat';

const SIZE_OPTIONS = [
  { value: 'all', label: 'Any size' },
  { value: '1', label: '1 person' },
  { value: '2', label: '2 people' },
  { value: '3', label: '3 people' },
  { value: '4', label: '4 people' },
  { value: '5+', label: '5 or more' },
];
const SORTS = [
  { value: 'house', label: 'House number' },
  { value: 'members', label: 'Most people' },
  { value: 'seniors', label: 'Most seniors (60+)' },
];
const sizeLabel = (n) => (n >= 5 ? '5 or more people' : n === 1 ? '1 person' : `${n} people`);

function Members({ part, house }) {
  const { data, loading, error } = useApi(() => getHouseholdMembers(part, house), [part, house]);
  if (loading) return <p className="py-6 text-center text-sm text-[var(--muted)]">Loading…</p>;
  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  return (
    <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
      {(data || []).map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: genderColor(m.gender) }} aria-hidden>
            {initials(m.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">{niceName(m.name)}</p>
            <p className="truncate text-xs text-[var(--muted)]">
              {relationLabel(m.relation_type)}: {niceName(m.relation_name) || '—'}
            </p>
          </div>
          <div className="text-right text-xs text-[var(--ink-soft)]">
            <p>
              {m.age != null ? `Age ${m.age}` : 'Age not read'} · {m.gender && m.gender !== 'U' ? genderLabel(m.gender) : 'Gender not read'}
            </p>
            {m.epic ? (
              <Link to={`/app/voters?q=${m.epic}`} className="font-mono text-[11px] text-[var(--brand)] hover:underline" title="Find this voter in the Voters list">
                {m.epic}
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function HouseholdsPage() {
  const [params, setParams] = useSearchParams();
  const f = {
    q: params.get('q') || '',
    part: params.get('part') || 'all',
    section: params.get('section') || 'all',
    size: params.get('size') || 'all',
    sort: params.get('sort') || 'house',
  };
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
  const setFilter = (key, value) => patch(key === 'part' ? { part: value, section: 'all' } : { [key]: value });
  const [search, setSearch] = useDebouncedSearch(f.q, (v) => patch({ q: v }));

  const [view, setView] = useViewMode('civicpulse_households_view');
  const [chartsOpen, setChartsOpen] = useChartsOpen('civicpulse_households_charts');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState(null);

  const sig = JSON.stringify(f);
  useEffect(() => setPage(1), [sig, pageSize]);

  const { data: booths } = useApi(getBooths, []);
  const roads = useApi(() => getVoterStats(f.part !== 'all' ? { part: f.part } : {}), [f.part]);
  const list = useApi(
    () => getHouseholds({ q: f.q || undefined, part: f.part, section: f.section, size: f.size, sort: f.sort, page, limit: pageSize }),
    [sig, page, pageSize]
  );

  const rows = list.data?.rows || [];
  const total = list.data?.total ?? 0;
  const stats = list.data?.stats;
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

  const boothOptions = useMemo(
    () => [{ value: 'all', label: 'All booths' }, ...(booths || []).filter((b) => b.voters > 0 || String(b.part_no) === f.part).map((b) => ({ value: String(b.part_no), label: `Booth ${b.part_no}` }))],
    [booths, f.part]
  );
  const sections = roads.data?.sections || [];
  const roadOptions = [{ value: 'all', label: 'All roads' }, ...sections.map((s) => ({ value: String(s.section_no), label: `${niceName(s.section_name)}` }))];
  const roadsEnabled = f.part !== 'all' || (booths || []).length <= 1;

  const chips = [
    f.q && { key: 'q', label: `“${f.q}”`, onRemove: () => setSearch('') },
    f.part !== 'all' && { key: 'part', label: `Booth ${f.part}`, onRemove: () => setFilter('part', 'all') },
    f.section !== 'all' && { key: 'section', label: niceName(sections.find((s) => String(s.section_no) === f.section)?.section_name) || `Road ${f.section}`, onRemove: () => setFilter('section', 'all') },
    f.size !== 'all' && { key: 'size', label: SIZE_OPTIONS.find((s) => s.value === f.size)?.label, onRemove: () => setFilter('size', 'all') },
  ].filter(Boolean);

  const sizeItems = (stats?.sizes || []).map((s) => ({ key: s.size >= 5 ? '5+' : String(s.size), label: sizeLabel(s.size), value: s.count }));

  const columns = useMemo(
    () => [
      {
        key: 'house',
        header: 'House no.',
        truncate: false,
        sticky: 'left',
        stickyOffset: 0,
        cell: (r) => <span className="inline-block min-w-[4.5rem] font-bold tabular-nums">{r.house_number || '—'}</span>,
      },
      { key: 'note', header: 'Address note', truncate: false, cell: (r) => (r.address_note ? <span className="inline-block min-w-[7rem] max-w-[13rem] break-words text-[var(--ink-soft)]">{niceName(r.address_note)}</span> : <span className="text-[var(--muted)]">—</span>) },
      { key: 'road', header: 'Road', truncate: false, cell: (r) => <span className="inline-block min-w-[8rem] whitespace-nowrap">{roadName(r) || '—'}</span> },
      { key: 'part_no', header: 'Booth', accessor: 'part_no', align: 'center', className: 'tabular-nums font-semibold', width: '4.5rem' },
      { key: 'members', header: 'People', accessor: 'members', align: 'right', className: 'tabular-nums font-semibold', width: '4.5rem' },
      { key: 'split', header: 'Men · Women', accessor: (r) => `${r.men} · ${r.women}`, className: 'tabular-nums', width: '6.5rem' },
      { key: 'seniors', header: 'Aged 60+', accessor: (r) => r.seniors, align: 'right', className: 'tabular-nums', width: '5.5rem' },
      { key: 'eldest', header: 'Eldest member', truncate: false, cell: (r) => <span className="whitespace-nowrap">{niceName(r.eldest_name)} <span className="text-[var(--muted)]">· {r.eldest_age ?? '—'}</span></span> },
      {
        key: 'view',
        header: 'Details',
        align: 'center',
        truncate: false,
        sticky: 'right',
        width: '5.5rem',
        cell: (r) => (
          <button type="button" onClick={() => setOpen(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)]">
            <Eye className="h-3.5 w-3.5" />
            View
          </button>
        ),
      },
    ],
    []
  );

  const renderCard = (r) => (
    <CardShell>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-2 text-sm font-extrabold text-white">{r.members}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-[var(--ink)]">House {r.house_number || '—'}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{[r.address_note && niceName(r.address_note), roadName(r), `Booth ${r.part_no}`].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" onClick={() => setOpen(r)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)]">
          <Eye className="h-3.5 w-3.5" />
          View
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-[var(--line)] pt-3">
        <MiniFact label="People">{r.members}</MiniFact>
        <MiniFact label="Men · Women">{r.men} · {r.women}</MiniFact>
        <MiniFact label="Aged 60+">{r.seniors}</MiniFact>
        <MiniFact label="Eldest member" className="col-span-3">{niceName(r.eldest_name)}{r.eldest_age != null ? ` · ${r.eldest_age}` : ''}</MiniFact>
      </dl>
    </CardShell>
  );

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="Voters grouped by home, so a visit to one door can reach the whole family."
        actions={
          <>
            <ViewSwitch view={view} onChange={setView} />
            <button type="button" onClick={() => setChartsOpen((o) => !o)} className={btnTool} aria-pressed={chartsOpen}>
              <BarChart3 className="h-3.5 w-3.5" />
              {chartsOpen ? 'Hide chart' : 'Show chart'}
            </button>
            <button type="button" onClick={() => list.reload({ silent: true })} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </>
        }
      />

      <FilterPanel search={search} onSearch={setSearch} placeholder="Search house number or a family member’s name…" chips={chips} onClearAll={() => { setSearch(''); setParams({}, { replace: true }); }} cols="md:grid-cols-4">
        <FilterField label="Booth">
          <FilterSelect label="Booth" className="w-full" value={f.part} onChange={(v) => setFilter('part', v)} options={boothOptions} />
        </FilterField>
        <FilterField label="Road">
          <FilterSelect label="Road" className={`w-full ${roadsEnabled ? '' : 'opacity-60'}`} value={f.section} onChange={(v) => setFilter('section', v)} options={roadsEnabled ? roadOptions : [{ value: 'all', label: 'Pick a booth first' }]} />
        </FilterField>
        <FilterField label="Household size">
          <FilterSelect label="Household size" className="w-full" value={f.size} onChange={(v) => setFilter('size', v)} options={SIZE_OPTIONS} />
        </FilterField>
        <FilterField label="Sort by">
          <FilterSelect label="Sort by" className="w-full" value={f.sort} onChange={(v) => setFilter('sort', v === 'house' ? '' : v)} options={SORTS} />
        </FilterField>
      </FilterPanel>

      <AlertBanner tone="danger">{list.error}</AlertBanner>

      <StatStrip
        items={[
          { label: 'Households', value: fmt(stats?.households), hint: f.size !== 'all' ? `${fmt(total)} match the size` : 'homes to visit' },
          { label: 'Voters', value: fmt(stats?.voters), hint: 'living in them' },
          { label: 'Average size', value: stats ? stats.avg_size : '—', hint: 'people per home' },
          { label: 'With seniors', value: fmt(stats?.with_seniors), hint: 'homes with someone 60+' },
        ]}
      />

      {chartsOpen && sizeItems.length ? (
        <ChartCard title="How many people live in each home" subtitle="Numbers show how many homes · click a bar to filter">
          <BarList
            unit="homes"
            items={sizeItems}
            activeKey={f.size === 'all' ? null : f.size}
            onPick={(item) => setFilter('size', f.size === item.key ? 'all' : item.key)}
          />
        </ChartCard>
      ) : null}

      <DataList
        view={view}
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.part_no}-${r.house_no}`}
        renderCard={renderCard}
        loading={list.loading && !list.data}
        pagination={paging}
        emptyTitle={chips.length ? 'No households match these filters' : 'No households yet'}
        emptyDescription={chips.length ? 'Try removing a filter.' : 'Upload a voter list from Data to see homes here.'}
      />

      {open ? (
        <Modal
          title={`House ${open.house_number || '—'}`}
          subtitle={[open.address_note && niceName(open.address_note), roadName(open), `Booth ${open.part_no}`].filter(Boolean).join(' · ')}
          badge={open.members}
          size="md"
          onClose={() => setOpen(null)}
          footer={
            <Link to={`/app/voters?part=${open.part_no}&q=${encodeURIComponent(open.house_number || '')}`} className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110">
              See them in Voters
            </Link>
          }
        >
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
            {open.members} {open.members === 1 ? 'person lives' : 'people live'} here · {open.seniors} aged 60 or more
          </p>
          <Members part={open.part_no} house={open.house_no} />
        </Modal>
      ) : null}
    </section>
  );
}
