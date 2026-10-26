import { useEffect, useMemo, useState } from 'react';
import { Crosshair, MapPin, Navigation, RefreshCw, Search, Users, X } from 'lucide-react';
import { getBooths } from '../api/booths';
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../auth/roles';
import BoothModal from '../components/booths/BoothModal';
import BoothLeafletMap from '../components/map/BoothLeafletMap';
import AlertBanner from '../components/ui/AlertBanner';
import PageHeader from '../components/ui/PageHeader';
import { btnTool } from '../components/ui/kit';
import { useApi } from '../hooks/useApi';
import { REACH_STEPS, reachStep, reachedPct, stationName } from '../utils/boothFormat';
import { fmt } from '../utils/voterFormat';

const hasLocation = (b) => b.lat != null && b.lng != null;

export default function MapPage() {
  const { role } = useAuth();
  const canEdit = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR].includes(role);

  const { data, loading, error, reload } = useApi(getBooths, []);
  const booths = useMemo(() => data || [], [data]);

  const [search, setSearch] = useState('');
  const [reachFilter, setReachFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [openPart, setOpenPart] = useState(null);
  const [listOpen, setListOpen] = useState(true);

  const located = useMemo(() => booths.filter(hasLocation), [booths]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return located.filter((b) => {
      const pct = reachedPct(b);
      if (reachFilter === 'cold' && pct > 0) return false;
      if (reachFilter === 'warm' && (pct < 1 || pct > 49)) return false;
      if (reachFilter === 'hot' && pct < 50) return false;
      if (!needle) return true;
      return (
        String(b.part_no) === needle ||
        stationName(b.polling_station_name, b.part_no).toLowerCase().includes(needle) ||
        (b.polling_station_address || '').toLowerCase().includes(needle)
      );
    });
  }, [located, search, reachFilter]);

  const selectedBooth = useMemo(
    () => booths.find((b) => b.part_no === selected) || null,
    [booths, selected]
  );

  useEffect(() => {
    if (selected != null && !filtered.some((b) => b.part_no === selected)) {
      // keep selection if it still exists on the map dataset
    }
  }, [filtered, selected]);

  const voterShare = booths.reduce((n, b) => n + (b.voters || 0), 0);
  const mappedVoters = located.reduce((n, b) => n + (b.voters || 0), 0);
  const avgReach = located.length
    ? Math.round(located.reduce((n, b) => n + reachedPct(b), 0) / located.length)
    : 0;

  const list = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = [...filtered].sort((a, b) => {
      if (needle && String(a.part_no) === needle) return -1;
      if (needle && String(b.part_no) === needle) return 1;
      return reachedPct(a) - reachedPct(b) || a.part_no - b.part_no;
    });
    return rows.slice(0, 60);
  }, [filtered, search]);

  return (
    <section className="flex w-full flex-col gap-3">
      <PageHeader
        description="Live map of every Eluru polling booth — coloured by how many voters you have reached."
        actions={
          <button type="button" onClick={() => reload({ silent: true })} className={btnTool} aria-label="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
      />

      <AlertBanner tone="danger">{error}</AlertBanner>

      <div className="cp-map-stage">
        {/* Map */}
        <div className="cp-map-stage-canvas">
          {loading && !data ? (
            <div className="flex h-full min-h-[28rem] items-center justify-center bg-[var(--bg-muted)] text-sm text-[var(--muted)]">
              Loading booth map…
            </div>
          ) : located.length ? (
            <BoothLeafletMap
              booths={filtered.length ? filtered : located}
              selected={selected}
              onSelect={setSelected}
              className="h-full min-h-[28rem]"
            />
          ) : (
            <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-3 bg-[var(--bg-muted)] px-6 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand)]/10 text-[var(--brand)]">
                <MapPin className="h-7 w-7" />
              </span>
              <p className="text-base font-bold text-[var(--ink)]">No booth pins yet</p>
              <p className="max-w-sm text-sm text-[var(--muted)]">
                {canEdit
                  ? 'Add latitude and longitude on a booth, or run the geocode script, and they will appear here.'
                  : 'A coordinator can place booths on the map.'}
              </p>
            </div>
          )}
        </div>

        {/* Floating HUD */}
        <aside className="cp-map-hud">
          <div className="cp-map-glass cp-map-hud-search">
            <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Booth no. or station…"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
            />
            {search ? (
              <button type="button" onClick={() => setSearch('')} className="rounded-md p-0.5 text-[var(--muted)] hover:text-[var(--ink)]" aria-label="Clear">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="cp-map-glass flex flex-wrap gap-1.5 p-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'cold', label: 'Not reached' },
              { id: 'warm', label: '1–49%' },
              { id: 'hot', label: '50%+' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setReachFilter(f.id)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  reachFilter === f.id
                    ? 'bg-[var(--brand)] text-white shadow-sm'
                    : 'text-[var(--ink-soft)] hover:bg-[var(--bg-muted)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="cp-map-glass grid grid-cols-3 gap-px overflow-hidden !p-0">
            {[
              { label: 'On map', value: fmt(filtered.length || located.length), icon: Crosshair },
              { label: 'Voters', value: fmt(mappedVoters), icon: Users },
              { label: 'Avg reach', value: `${avgReach}%`, icon: Navigation },
            ].map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5 bg-[var(--bg-elevated)]/90 px-3 py-2.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <s.icon className="h-3 w-3" />
                  {s.label}
                </span>
                <span className="text-lg font-extrabold tabular-nums tracking-tight text-[var(--ink)]">{s.value}</span>
              </div>
            ))}
          </div>

          <div className="cp-map-glass hidden gap-3 p-3 sm:flex">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Reach</p>
            <ul className="flex flex-1 flex-wrap gap-x-3 gap-y-1">
              {REACH_STEPS.map((s) => (
                <li key={s.label} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-soft)]">
                  <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Selected booth card */}
        {selectedBooth ? (
          <div className="cp-map-glass cp-map-select">
            <div className="flex items-start gap-3">
              <span
                className="inline-flex h-12 min-w-12 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold text-white shadow-md"
                style={{ background: reachStep(reachedPct(selectedBooth)).color }}
              >
                {selectedBooth.part_no}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Booth {selectedBooth.part_no}</p>
                <p className="truncate text-sm font-bold leading-snug text-[var(--ink)]">
                  {stationName(selectedBooth.polling_station_name, selectedBooth.part_no)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{selectedBooth.polling_station_address || '—'}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--ink)]" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--line)] pt-3">
              <div>
                <p className="text-[10px] font-semibold uppercase text-[var(--muted)]">Voters</p>
                <p className="text-sm font-bold tabular-nums text-[var(--ink)]">{fmt(selectedBooth.voters)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-[var(--muted)]">Reached</p>
                <p className="text-sm font-bold tabular-nums text-[var(--ink)]">{reachedPct(selectedBooth)}%</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-[var(--muted)]">Coords</p>
                <p className="truncate text-xs font-semibold tabular-nums text-[var(--ink-soft)]">
                  {Number(selectedBooth.lat).toFixed(4)}, {Number(selectedBooth.lng).toFixed(4)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOpenPart(selectedBooth.part_no)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
              >
                Open booth
              </button>
              <a
                href={`https://www.google.com/maps?q=${selectedBooth.lat},${selectedBooth.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-semibold text-[var(--ink-soft)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
              >
                <Navigation className="h-3.5 w-3.5" />
                Maps
              </a>
            </div>
          </div>
        ) : null}

        {/* Compact booth rail */}
        <div className={`cp-map-rail ${listOpen ? 'is-open' : ''}`}>
          <button type="button" className="cp-map-rail-toggle" onClick={() => setListOpen((v) => !v)}>
            <span className="font-bold text-[var(--ink)]">{fmt(list.length)} booths</span>
            <span className="text-xs text-[var(--muted)]">{listOpen ? 'Hide list' : 'Show list'}</span>
          </button>
          {listOpen ? (
            <ul className="cp-map-rail-list">
              {list.map((b) => {
                const pct = reachedPct(b);
                const step = reachStep(pct);
                const active = selected === b.part_no;
                return (
                  <li key={b.part_no}>
                    <button
                      type="button"
                      onClick={() => setSelected(b.part_no)}
                      className={`cp-map-rail-item ${active ? 'is-active' : ''}`}
                    >
                      <span className="cp-map-rail-badge" style={{ background: step.color }}>
                        {b.part_no}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs font-bold text-[var(--ink)]">
                          {stationName(b.polling_station_name, b.part_no)}
                        </span>
                        <span className="block text-[10px] tabular-nums text-[var(--muted)]">
                          {fmt(b.voters)} voters · {pct}% reached
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {!list.length ? (
                <li className="px-3 py-6 text-center text-xs text-[var(--muted)]">No booths match this filter.</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>

      <p className="text-center text-[11px] text-[var(--muted)]">
        Showing {fmt(filtered.length || located.length)} of {fmt(booths.length)} booths · {fmt(voterShare)} voters on the roll
        {booths.length - located.length ? ` · ${booths.length - located.length} still need a pin` : ''}
      </p>

      {openPart != null ? (
        <BoothModal part={openPart} canEdit={canEdit} onClose={() => setOpenPart(null)} onSaved={() => reload({ silent: true })} />
      ) : null}
    </section>
  );
}
