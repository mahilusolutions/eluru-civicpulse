import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import { reachStep, reachedPct, stationName } from '../../utils/boothFormat';
import { fmt } from '../../utils/voterFormat';
import 'leaflet/dist/leaflet.css';

const ELURU = [16.7107, 81.105];

/** Spread booths that share the same pin so every marker is clickable. */
export function spreadBooths(booths) {
  const groups = new Map();
  booths.forEach((b) => {
    const key = `${Number(b.lat).toFixed(5)},${Number(b.lng).toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  });
  const out = [];
  groups.forEach((list) => {
    if (list.length === 1) {
      out.push({ ...list[0], _lat: Number(list[0].lat), _lng: Number(list[0].lng), _stack: 1 });
      return;
    }
    const n = list.length;
    const radius = 0.00028 + Math.min(n, 12) * 0.00004; // ~30–80 m
    list.forEach((b, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      out.push({
        ...b,
        _lat: Number(b.lat) + radius * Math.sin(angle),
        _lng: Number(b.lng) + radius * Math.cos(angle),
        _stack: n,
      });
    });
  });
  return out;
}

function boothIcon(booth, selected) {
  const pct = reachedPct(booth);
  const step = reachStep(pct);
  const size = selected ? 44 : booth.voters > 1200 ? 38 : booth.voters > 800 ? 34 : 30;
  return L.divIcon({
    className: 'cp-map-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="cp-pin ${selected ? 'is-selected' : ''}" style="--pin:${step.color};--size:${size}px" title="Booth ${booth.part_no}">
      <span class="cp-pin-num">${booth.part_no}</span>
      ${booth._stack > 1 ? `<span class="cp-pin-stack">${booth._stack}</span>` : ''}
    </div>`,
  });
}

function FitBounds({ points, selected }) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    if (!points.length || didFit.current) return;
    const bounds = L.latLngBounds(points.map((p) => [p._lat, p._lng]));
    map.fitBounds(bounds.pad(0.18), { animate: false, maxZoom: 14 });
    didFit.current = true;
  }, [map, points]);

  useEffect(() => {
    if (selected == null) return;
    const hit = points.find((p) => p.part_no === selected);
    if (!hit) return;
    map.flyTo([hit._lat, hit._lng], Math.max(map.getZoom(), 15), { duration: 0.75 });
  }, [map, points, selected]);

  return null;
}

function ThemeTiles() {
  const dark =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
  const url = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  return (
    <TileLayer
      key={dark ? 'dark' : 'light'}
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
      url={url}
      maxZoom={19}
    />
  );
}

function FitAllControl({ points }) {
  const map = useMap();
  useEffect(() => {
    const Fit = L.Control.extend({
      onAdd() {
        const btn = L.DomUtil.create('button', 'cp-map-fab');
        btn.type = 'button';
        btn.title = 'Fit all booths';
        btn.setAttribute('aria-label', 'Fit all booths on the map');
        btn.innerHTML =
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4"/></svg>';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', () => {
          const bounds = L.latLngBounds(points.map((p) => [p._lat, p._lng]));
          map.fitBounds(bounds.pad(0.18), { animate: true, maxZoom: 14 });
        });
        return btn;
      },
    });
    const control = new Fit({ position: 'bottomright' });
    map.addControl(control);
    return () => map.removeControl(control);
  }, [map, points]);
  return null;
}

/**
 * Interactive Leaflet map of polling booths.
 * `selected` = part_no; `onSelect(part_no)` when a marker is clicked.
 */
export default function BoothLeafletMap({ booths, selected, onSelect, className = '' }) {
  const points = useMemo(() => spreadBooths(booths.filter((b) => b.lat != null && b.lng != null)), [booths]);

  if (!points.length) {
    return (
      <div className={`cp-map-shell flex items-center justify-center ${className}`}>
        <p className="text-sm text-[var(--muted)]">No booth coordinates to show.</p>
      </div>
    );
  }

  return (
    <div className={`cp-map-shell ${className}`}>
      <MapContainer center={ELURU} zoom={13} className="cp-map-canvas" zoomControl={false} scrollWheelZoom>
        <ThemeTiles />
        <ZoomControl position="bottomright" />
        <FitBounds points={points} selected={selected} />
        <FitAllControl points={points} />
        {points.map((b) => (
          <Marker
            key={`${b.part_no}-${selected === b.part_no ? 'on' : 'off'}`}
            position={[b._lat, b._lng]}
            icon={boothIcon(b, selected === b.part_no)}
            zIndexOffset={selected === b.part_no ? 1000 : b.voters || 0}
            eventHandlers={{
              click: () => onSelect?.(b.part_no),
            }}
            title={`Booth ${b.part_no} · ${stationName(b.polling_station_name, b.part_no)} · ${fmt(b.voters)} voters · ${reachedPct(b)}% reached`}
          />
        ))}
      </MapContainer>
    </div>
  );
}
