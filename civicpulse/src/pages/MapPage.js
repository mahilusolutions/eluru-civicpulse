import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Expand,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Minimize2,
  Navigation,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { getBooths } from '../api/booths';
import { useAuth } from '../auth/AuthContext';
import { ROLES } from '../auth/roles';
import BoothModal from '../components/booths/BoothModal';
import BoothLeafletMap, { groupBoothSites } from '../components/map/BoothLeafletMap';
import AlertBanner from '../components/ui/AlertBanner';
import { useApi } from '../hooks/useApi';
import { inEluru } from '../utils/eluruBounds';
import { reachedPct, stationName } from '../utils/boothFormat';
import { fmt } from '../utils/voterFormat';

const hasLocation = (b) => b.lat != null && b.lng != null && inEluru(b.lat, b.lng);

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'cold', label: 'Not reached' },
  { id: 'warm', label: 'Started' },
  { id: 'hot', label: 'Strong' },
];

function siteKeyOf(b) {
  if (!hasLocation(b)) return null;
  return `${Number(b.lat).toFixed(5)},${Number(b.lng).toFixed(5)}`;
}

function boothTone(pct) {
  if (pct <= 0) return '#38bdf8';
  if (pct < 25) return '#0ea5e9';
  if (pct < 50) return '#0284c7';
  if (pct < 75) return '#0369a1';
  return '#075985';
}

export default function MapPage() {
  const { role } = useAuth();
  const canEdit = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COORDINATOR].includes(role);
  const stageRef = useRef(null);
  const listRef = useRef(null);

  const { data, loading, error, reload } = useApi(getBooths, []);
  const booths = useMemo(() => data || [], [data]);

  const [search, setSearch] = useState('');
  const [reachFilter, setReachFilter] = useState('all');
  const [siteKey, setSiteKey] = useState(null);
  const [pickedPart, setPickedPart] = useState(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const [openPart, setOpenPart] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [locateNonce, setLocateNonce] = useState(0);
  const [fitNonce, setFitNonce] = useState(0);
  /** mobile: map | list */
  const [mobileTab, setMobileTab] = useState('map');

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
        String(b.part_no).includes(needle) ||
        stationName(b.polling_station_name, b.part_no).toLowerCase().includes(needle) ||
        (b.polling_station_address || '').toLowerCase().includes(needle) ||
        (b.area_name || '').toLowerCase().includes(needle)
      );
    });
  }, [located, search, reachFilter]);

  const sites = useMemo(() => groupBoothSites(filtered), [filtered]);
  const selectedSite = useMemo(() => sites.find((s) => s.key === siteKey) || null, [sites, siteKey]);
  const pickedBooth = useMemo(
    () => (pickedPart != null ? booths.find((b) => b.part_no === pickedPart) : null),
    [booths, pickedPart]
  );

  const list = useMemo(() => {
    if (selectedSite) return selectedSite.booths;
    return [...filtered].sort((a, b) => a.part_no - b.part_no);
  }, [filtered, selectedSite]);

  const activeBooth = pickedBooth || (selectedSite?.count === 1 ? selectedSite.booths[0] : null);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Keep the active booth row visible in the side list
  useEffect(() => {
    if (pickedPart == null || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-part="${pickedPart}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pickedPart, list]);

  // Leaflet needs a size refresh when the map tab becomes visible again
  useEffect(() => {
    if (mobileTab !== 'map') return;
    const t = window.setTimeout(() => setFocusSeq((n) => n + 1), 80);
    return () => window.clearTimeout(t);
  }, [mobileTab]);

  async function toggleFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) await el.requestFullscreen?.();
    else await document.exitFullscreen?.();
  }

  function bumpFocus() {
    setFocusSeq((n) => n + 1);
  }

  function selectSite(site) {
    setSiteKey(site.key);
    setPickedPart(site.count === 1 ? site.booths[0].part_no : null);
    bumpFocus();
    setMobileTab('map');
  }

  function pickBooth(part) {
    const booth = booths.find((b) => b.part_no === part);
    if (!booth) return;
    setSiteKey(siteKeyOf(booth));
    setPickedPart(part);
    bumpFocus();
    setMobileTab('map');
  }

  function clearSelection() {
    setSiteKey(null);
    setPickedPart(null);
  }

  return (
    <section className="cp-map-page">
      {error ? (
        <div className="absolute left-3 right-3 top-3 z-[600] max-w-lg">
          <AlertBanner tone="danger">{error}</AlertBanner>
        </div>
      ) : null}

      <div ref={stageRef} className={`cp-map-layout ${fullscreen ? 'is-fullscreen' : ''}`}>
        <aside className={`cp-map-panel ${mobileTab === 'list' ? 'is-mobile-show' : ''}`}>
          <div className="cp-map-panel-head">
            <div className="cp-map-search">
              <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search booth # or station"
                aria-label="Search booths"
              />
              {search ? (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <div className="cp-map-filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={reachFilter === f.id ? 'is-on' : ''}
                  onClick={() => setReachFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="cp-map-meta">
              <span>
                <strong>{fmt(filtered.length)}</strong> booths
              </span>
              <span>
                <strong>{fmt(sites.length)}</strong> pins
              </span>
              <button type="button" onClick={() => reload({ silent: true })} title="Refresh" aria-label="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {selectedSite ? (
            <div className="cp-map-panel-sel">
              <div className="flex items-start gap-2">
                <span className="cp-map-badge" style={{ background: '#db2777' }}>
                  {selectedSite.count === 1 ? selectedSite.booths[0].part_no : selectedSite.count}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {selectedSite.count === 1 ? 'On map' : `${selectedSite.count} booths share this pin`}
                  </p>
                  <p className="truncate text-sm font-bold text-[var(--ink)]">
                    {activeBooth
                      ? stationName(activeBooth.polling_station_name, activeBooth.part_no)
                      : 'Tap a booth below — map will zoom here'}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted)]">
                    {Number(selectedSite.lat).toFixed(5)}, {Number(selectedSite.lng).toFixed(5)}
                  </p>
                </div>
                <button type="button" className="cp-map-icon-btn" onClick={clearSelection} aria-label="Clear selection">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          <ul className="cp-map-panel-list" ref={listRef}>
            {loading && !data ? (
              <li className="cp-map-empty">Loading booths…</li>
            ) : list.length ? (
              list.map((b) => {
                const pct = reachedPct(b);
                const active = pickedPart === b.part_no;
                return (
                  <li key={b.part_no} data-part={b.part_no}>
                    <button type="button" className={`cp-map-row ${active ? 'is-active' : ''}`} onClick={() => pickBooth(b.part_no)}>
                      <span className="cp-map-badge" style={{ background: active ? '#db2777' : boothTone(pct) }}>
                        {b.part_no}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
                          {stationName(b.polling_station_name, b.part_no)}
                        </span>
                        <span className="block text-[11px] text-[var(--muted)]">
                          {fmt(b.voters)} voters · {pct}% reached
                        </span>
                      </span>
                      <MapPin className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[#db2777]' : 'text-[var(--muted)]'}`} />
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="cp-map-empty">
                {located.length ? 'No booths match.' : canEdit ? 'No coordinates yet.' : 'No booths on the map yet.'}
              </li>
            )}
          </ul>

          {activeBooth ? (
            <div className="cp-map-panel-foot">
              <button type="button" className="cp-map-primary" onClick={() => setOpenPart(activeBooth.part_no)}>
                Open booth {activeBooth.part_no}
              </button>
              <a
                className="cp-map-secondary"
                href={`https://www.google.com/maps/dir/?api=1&destination=${activeBooth.lat},${activeBooth.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation className="h-3.5 w-3.5" />
                Go
              </a>
            </div>
          ) : null}
        </aside>

        <div className={`cp-map-viewport ${mobileTab === 'map' ? 'is-mobile-show' : ''}`}>
          {loading && !data ? (
            <div className="cp-map-loading">Loading map…</div>
          ) : located.length ? (
            <BoothLeafletMap
              booths={filtered}
              selectedKey={siteKey}
              pickedPart={pickedPart}
              focusSeq={focusSeq}
              onSelectSite={selectSite}
              locateNonce={locateNonce}
              fitNonce={fitNonce}
              className="h-full w-full"
            />
          ) : (
            <div className="cp-map-loading flex-col gap-2">
              <MapPin className="h-7 w-7 text-[var(--brand)]" />
              <p className="font-semibold text-[var(--ink)]">No booth pins yet</p>
            </div>
          )}

          {/* Floating card on map when something is selected */}
          {selectedSite ? (
            <div className="cp-map-float">
              <div className="cp-map-float-top">
                <span className="cp-map-badge" style={{ background: '#db2777' }}>
                  {activeBooth ? activeBooth.part_no : selectedSite.count}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--ink)]">
                    {activeBooth
                      ? stationName(activeBooth.polling_station_name, activeBooth.part_no)
                      : `${selectedSite.count} booths at this pin`}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    {activeBooth
                      ? `${fmt(activeBooth.voters)} voters · ${reachedPct(activeBooth)}% reached`
                      : 'Choose a booth from the list'}
                  </p>
                </div>
                <button type="button" className="cp-map-icon-btn" onClick={clearSelection} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {activeBooth ? (
                <div className="cp-map-float-actions">
                  <button type="button" className="cp-map-primary" onClick={() => setOpenPart(activeBooth.part_no)}>
                    Details
                  </button>
                  <a
                    className="cp-map-secondary"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedSite.lat},${selectedSite.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Directions
                  </a>
                  {selectedSite.count > 1 ? (
                    <button type="button" className="cp-map-secondary" onClick={() => setMobileTab('list')}>
                      <List className="h-3.5 w-3.5" />
                      List
                    </button>
                  ) : null}
                </div>
              ) : (
                <button type="button" className="cp-map-primary mt-2 w-full" onClick={() => setMobileTab('list')}>
                  Show booths at this pin
                </button>
              )}
            </div>
          ) : null}

          <div className="cp-map-fabs">
            <button type="button" title="Fit all pins" onClick={() => setFitNonce((n) => n + 1)}>
              <Crosshair className="h-4 w-4" />
            </button>
            <button type="button" title="My location" onClick={() => setLocateNonce((n) => n + 1)}>
              <LocateFixed className="h-4 w-4" />
            </button>
            <button type="button" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile bottom switcher */}
        <div className="cp-map-mobile-tabs">
          <button type="button" className={mobileTab === 'map' ? 'is-on' : ''} onClick={() => setMobileTab('map')}>
            <MapIcon className="h-4 w-4" />
            Map
          </button>
          <button type="button" className={mobileTab === 'list' ? 'is-on' : ''} onClick={() => setMobileTab('list')}>
            <List className="h-4 w-4" />
            Booths
          </button>
        </div>
      </div>

      {openPart != null ? (
        <BoothModal part={openPart} canEdit={canEdit} onClose={() => setOpenPart(null)} onSaved={() => reload({ silent: true })} />
      ) : null}
    </section>
  );
}
