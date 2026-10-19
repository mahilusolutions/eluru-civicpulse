import { useEffect, useMemo, useState } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { getBooths } from '../api/booths';
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../auth/roles';
import BoothModal from '../components/booths/BoothModal';
import AlertBanner from '../components/ui/AlertBanner';
import DataList, { CardShell } from '../components/ui/DataList';
import { FilterSelect } from '../components/ui/FilterBar';
import PageHeader from '../components/ui/PageHeader';
import { FilterField, FilterPanel, MiniFact, StatStrip, ViewSwitch, btnTool, useViewMode } from '../components/ui/kit';
import { ChartCard, useChartTooltip } from '../components/voters/VoterCharts';
import { useApi } from '../hooks/useApi';
import { REACH_STEPS, reachStep, reachedPct, stationName } from '../utils/boothFormat';
import { fmt } from '../utils/voterFormat';

const hasLocation = (b) => b.lat != null && b.lng != null;
const locationCell = (b) => (hasLocation(b) ? <span className="whitespace-nowrap tabular-nums">{Number(b.lat).toFixed(4)}, {Number(b.lng).toFixed(4)}</span> : <span className="text-[var(--muted)]">Not set</span>);

const W = 900;
const H = 460;
const PAD = 48;

/** Booth positions drawn to scale from their latitude and longitude, coloured by how many voters were reached. */
function BoothPlot({ booths, onPick }) {
  const { ref, show, hide, node } = useChartTooltip();

  const plot = useMemo(() => {
    if (!booths.length) return null;
    const midLat = booths.reduce((n, b) => n + b.lat, 0) / booths.length;
    const k = Math.cos((midLat * Math.PI) / 180); // keep east-west and north-south distances in proportion
    const pts = booths.map((b) => ({ b, x: b.lng * k, y: -b.lat }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const dx = Math.max(Math.max(...xs) - minX, 1e-4);
    const dy = Math.max(Math.max(...ys) - minY, 1e-4);
    const scale = Math.min((W - 2 * PAD) / dx, (H - 2 * PAD) / dy);
    const offX = (W - dx * scale) / 2;
    const offY = (H - dy * scale) / 2;
    const maxVoters = Math.max(1, ...booths.map((b) => b.voters));
    return pts.map((p) => ({
      ...p,
      cx: booths.length === 1 ? W / 2 : offX + (p.x - minX) * scale,
      cy: booths.length === 1 ? H / 2 : offY + (p.y - minY) * scale,
      r: 9 + 11 * Math.sqrt(p.b.voters / maxVoters),
    }));
  }, [booths]);

  if (!plot) return null;

  return (
    <div ref={ref} className="relative">
      {node}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-xl border border-[var(--line)] bg-[var(--bg-muted)]/50" role="img" aria-label="Map of booths">
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f} stroke="var(--line)" strokeWidth="1">
            <line x1={W * f} y1="0" x2={W * f} y2={H} />
            <line x1="0" y1={H * f} x2={W} y2={H * f} />
          </g>
        ))}
        <text x={W - 22} y="26" textAnchor="middle" className="fill-[var(--muted)]" style={{ fontSize: 12, fontWeight: 700 }}>
          N ↑
        </text>
        {plot.map(({ b, cx, cy, r }) => {
          const step = reachStep(reachedPct(b));
          const tip = (e) =>
            show(e, {
              title: `Booth ${b.part_no} · ${stationName(b.polling_station_name, b.part_no)}`,
              rows: [
                { value: fmt(b.voters), label: 'voters' },
                { value: `${reachedPct(b)}%`, label: 'reached', color: step.color },
              ],
            });
          return (
            <g
              key={b.part_no}
              tabIndex={0}
              role="button"
              aria-label={`Booth ${b.part_no}`}
              className="cursor-pointer outline-none"
              onClick={() => onPick(b.part_no)}
              onKeyDown={(e) => e.key === 'Enter' && onPick(b.part_no)}
              onPointerMove={tip}
              onPointerLeave={hide}
              onFocus={tip}
              onBlur={hide}
            >
              <circle cx={cx} cy={cy} r={r + 3} fill="var(--bg-elevated)" />
              <circle cx={cx} cy={cy} r={r} fill={step.color} stroke="var(--brand)" strokeWidth="1.5" />
              <text x={cx} y={cy + 4} textAnchor="middle" style={{ fontSize: r >= 11 ? 11 : 9, fontWeight: 800, fill: reachedPct(b) >= 25 ? '#fff' : 'var(--ink)' }}>
                {b.part_no}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function MapPage() {
  const { role } = useAuth();
  const canEdit = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR].includes(role);

  const { data, loading, error, reload } = useApi(getBooths, []);
  const booths = useMemo(() => data || [], [data]);

  const [search, setSearch] = useState('');
  const [where, setWhere] = useState('all');
  const [view, setView] = useViewMode('civicpulse_map_view');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openPart, setOpenPart] = useState(null);

  useEffect(() => setPage(1), [search, where, pageSize]);

  const located = useMemo(() => booths.filter(hasLocation), [booths]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return booths.filter((b) => {
      if (where === 'located' && !hasLocation(b)) return false;
      if (where === 'missing' && hasLocation(b)) return false;
      return !needle || String(b.part_no) === needle || stationName(b.polling_station_name, b.part_no).toLowerCase().includes(needle) || (b.polling_station_address || '').toLowerCase().includes(needle);
    });
  }, [booths, search, where]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paging = { page: safePage, pageCount, from: filtered.length ? (safePage - 1) * pageSize + 1 : 0, to: Math.min(safePage * pageSize, filtered.length), total: filtered.length, pageSize, onPageChange: setPage, onPageSizeChange: setPageSize };

  const columns = useMemo(
    () => [
      { key: 'part_no', header: 'Booth', accessor: 'part_no', align: 'center', className: 'font-bold tabular-nums', width: '4.5rem', sticky: 'left', stickyOffset: 0 },
      { key: 'station', header: 'Polling station', truncate: false, cell: (b) => <span className="inline-block max-w-[18rem] truncate align-middle font-semibold text-[var(--ink)]">{stationName(b.polling_station_name, b.part_no)}</span> },
      { key: 'address', header: 'Address', truncate: false, cell: (b) => <span className="inline-block max-w-[24rem] truncate align-middle text-[var(--ink-soft)]" title={b.polling_station_address || ''}>{b.polling_station_address || '—'}</span> },
      { key: 'voters', header: 'Voters', accessor: (b) => fmt(b.voters), align: 'right', className: 'tabular-nums', width: '5rem' },
      { key: 'location', header: 'Location', truncate: false, cell: locationCell },
      {
        key: 'open',
        header: 'Details',
        align: 'center',
        truncate: false,
        sticky: 'right',
        width: '7rem',
        cell: (b) => (
          <button type="button" onClick={() => setOpenPart(b.part_no)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)] transition hover:border-[var(--brand)]">
            <MapPin className="h-3.5 w-3.5" />
            {canEdit && !hasLocation(b) ? 'Add location' : 'View'}
          </button>
        ),
      },
    ],
    [canEdit]
  );

  const renderCard = (b) => (
    <CardShell>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-2 text-sm font-extrabold text-white">{b.part_no}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-[var(--ink)]">{stationName(b.polling_station_name, b.part_no)}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{b.polling_station_address}</p>
        </div>
        <button type="button" onClick={() => setOpenPart(b.part_no)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[var(--brand)]">
          <MapPin className="h-3.5 w-3.5" />
          {canEdit && !hasLocation(b) ? 'Add' : 'View'}
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-3">
        <MiniFact label="Voters">{fmt(b.voters)}</MiniFact>
        <MiniFact label="Location">{locationCell(b)}</MiniFact>
      </dl>
    </CardShell>
  );

  const voterShare = booths.reduce((n, b) => n + b.voters, 0);
  const mappedVoters = located.reduce((n, b) => n + b.voters, 0);

  return (
    <section className="w-full space-y-3">
      <PageHeader
        description="See where each polling station is, and how much of it has been reached."
        actions={
          <>
            <ViewSwitch view={view} onChange={setView} />
            <button type="button" onClick={() => reload({ silent: true })} className={btnTool} aria-label="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </>
        }
      />

      <AlertBanner tone="danger">{error}</AlertBanner>

      <StatStrip
        items={[
          { label: 'Booths on the map', value: `${fmt(located.length)} of ${fmt(booths.length)}`, hint: 'have a location' },
          { label: 'Voters covered', value: fmt(mappedVoters), hint: `of ${fmt(voterShare)} on the list` },
          { label: 'Without a location', value: fmt(booths.length - located.length), hint: booths.length - located.length ? 'add one to show them here' : 'all booths placed' },
        ]}
      />

      <ChartCard title="Booth map" subtitle="Bigger circles have more voters. Darker means more voters reached. Click a booth to open it.">
        {located.length ? (
          <>
            <BoothPlot booths={located} onPick={setOpenPart} />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--muted)]">
              {REACH_STEPS.map((s) => (
                <li key={s.label} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-[var(--line)]" style={{ background: s.color }} />
                  {s.label} reached
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-[var(--line)] px-4 py-10 text-center">
            <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bg-muted)] text-[var(--brand)]">
              <MapPin className="h-5 w-5" />
            </span>
            <p className="text-sm font-bold text-[var(--ink)]">No booth locations yet</p>
            <p className="mt-1 max-w-md text-sm text-[var(--muted)]">
              {canEdit ? 'Open a booth below and add its latitude and longitude. It will appear here at once.' : 'A coordinator can add booth locations. They will appear here.'}
            </p>
          </div>
        )}
      </ChartCard>

      <FilterPanel search={search} onSearch={setSearch} placeholder="Search booth number, polling station or address…" chips={where !== 'all' ? [{ key: 'where', label: where === 'located' ? 'Has a location' : 'No location yet', onRemove: () => setWhere('all') }] : []} onClearAll={() => { setSearch(''); setWhere('all'); }} cols="md:grid-cols-4">
        <FilterField label="Location" className="col-span-2 md:col-span-1">
          <FilterSelect label="Location" className="w-full" value={where} onChange={setWhere} options={[{ value: 'all', label: 'All booths' }, { value: 'located', label: 'Has a location' }, { value: 'missing', label: 'No location yet' }]} />
        </FilterField>
      </FilterPanel>

      <DataList
        view={view}
        columns={columns}
        rows={rows}
        rowKey="part_no"
        renderCard={renderCard}
        loading={loading && !data}
        pagination={paging}
        emptyTitle={search || where !== 'all' ? 'No booths match' : 'No booths yet'}
        emptyDescription={search || where !== 'all' ? 'Try removing a filter.' : 'Upload a voter list from Data so booths appear here.'}
        emptyActionLabel={search || where !== 'all' ? undefined : 'Go to Data'}
        emptyActionTo={search || where !== 'all' ? undefined : '/app/data'}
      />

      {openPart != null ? <BoothModal part={openPart} canEdit={canEdit} onClose={() => setOpenPart(null)} onSaved={() => reload({ silent: true })} /> : null}
    </section>
  );
}
