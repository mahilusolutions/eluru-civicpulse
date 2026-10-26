import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, ZoomControl, Circle, CircleMarker, Rectangle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ELURU_CENTER, ELURU_LATLNG_BOUNDS, inEluru } from '../../utils/eluruBounds';
import { reachedPct, stationName } from '../../utils/boothFormat';
import { fmt } from '../../utils/voterFormat';

const FOCUS_ZOOM = 16;
const MIN_ZOOM = 12;
const MAX_ZOOM = 19;

/** Sky-blue reach scale (default map theme). */
function pinColor(pct) {
  if (pct <= 0) return '#38bdf8';
  if (pct < 25) return '#0ea5e9';
  if (pct < 50) return '#0284c7';
  if (pct < 75) return '#0369a1';
  return '#075985';
}

/** One map pin per unique lat/lng — Eluru only. */
export function groupBoothSites(booths) {
  const groups = new Map();
  (booths || []).forEach((b) => {
    if (b.lat == null || b.lng == null) return;
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (!inEluru(lat, lng)) return;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, { key, lat, lng, booths: [] });
    groups.get(key).booths.push(b);
  });

  return [...groups.values()]
    .map((site) => {
      const list = [...site.booths].sort((a, b) => a.part_no - b.part_no);
      const voters = list.reduce((n, b) => n + (b.voters || 0), 0);
      const reached = list.reduce((n, b) => n + (b.reached || 0), 0);
      const pct = voters ? Math.round((reached / voters) * 100) : 0;
      return {
        ...site,
        booths: list,
        count: list.length,
        voters,
        reached,
        pct,
        color: pinColor(pct),
        label: list.length === 1 ? String(list[0].part_no) : String(list.length),
      };
    })
    .sort((a, b) => b.count - a.count);
}

function siteIcon(site, selected, pickedPart) {
  const multi = site.count > 1;
  const size = selected ? 52 : multi ? 42 : 36;
  const label =
    selected && pickedPart != null
      ? String(pickedPart)
      : selected && site.count === 1
        ? String(site.booths[0].part_no)
        : site.label;
  return L.divIcon({
    className: 'cp-map-icon',
    iconSize: [size, size + 14],
    iconAnchor: [size / 2, size + 10],
    popupAnchor: [0, -(size + 6)],
    html: `<div class="cp-pin ${selected ? 'is-selected' : ''} ${multi && !selected ? 'is-multi' : ''}" style="--pin:${selected ? '#db2777' : site.color};--size:${size}px">
      <span class="cp-pin-core">${label}</span>
      <span class="cp-pin-point"></span>
      ${multi && selected && pickedPart != null ? `<span class="cp-pin-stack" title="${site.count} booths share this pin">+${site.count - 1}</span>` : ''}
    </div>`,
  });
}

function sitePopupHtml(site, pickedPart) {
  if (site.count === 1 || pickedPart) {
    const b = pickedPart ? site.booths.find((x) => x.part_no === pickedPart) || site.booths[0] : site.booths[0];
    const name = stationName(b.polling_station_name, b.part_no).replace(/</g, '&lt;');
    return `<div class="cp-popup">
      <div class="cp-popup-kicker">Booth ${b.part_no}</div>
      <div class="cp-popup-title">${name}</div>
      <div class="cp-popup-stats"><span>${fmt(b.voters)} voters</span><span>${reachedPct(b)}% reached</span></div>
    </div>`;
  }
  return `<div class="cp-popup">
    <div class="cp-popup-kicker">${site.count} booths here</div>
    <div class="cp-popup-title">Pick a booth in the list</div>
    <div class="cp-popup-addr">${fmt(site.voters)} voters at this approximate pin</div>
  </div>`;
}

function MapChrome({ sites, selectedKey, focusSeq, locateNonce, fitNonce, onUserLocation }) {
  const map = useMap();
  const didFit = useRef(false);
  const eluruBounds = useMemo(() => L.latLngBounds(ELURU_LATLNG_BOUNDS), []);

  useMapEvents({
    locationfound: (e) => {
      if (!inEluru(e.latlng.lat, e.latlng.lng)) {
        onUserLocation?.(null);
        map.setView(ELURU_CENTER, 13);
        return;
      }
      onUserLocation?.([e.latlng.lat, e.latlng.lng]);
    },
    locationerror: () => onUserLocation?.(null),
  });

  useEffect(() => {
    const fix = () => map.invalidateSize({ animate: false });
    fix();
    const t = window.setTimeout(fix, 120);
    window.addEventListener('resize', fix);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', fix);
    };
  }, [map]);

  useEffect(() => {
    if (didFit.current) return;
    if (sites.length) {
      map.fitBounds(L.latLngBounds(sites.map((s) => [s.lat, s.lng])).pad(0.2), {
        animate: false,
        maxZoom: 14,
        padding: [28, 28],
      });
    } else {
      map.fitBounds(eluruBounds, { animate: false, padding: [24, 24] });
    }
    didFit.current = true;
  }, [map, sites, eluruBounds]);

  useEffect(() => {
    if (!fitNonce) return;
    if (sites.length) {
      map.fitBounds(L.latLngBounds(sites.map((s) => [s.lat, s.lng])).pad(0.2), {
        animate: true,
        maxZoom: 14,
        padding: [28, 28],
      });
    } else {
      map.fitBounds(eluruBounds, { animate: true, padding: [24, 24] });
    }
  }, [map, sites, fitNonce, eluruBounds]);

  useEffect(() => {
    if (!focusSeq || !selectedKey) return;
    const hit = sites.find((s) => s.key === selectedKey);
    if (!hit) return;
    map.invalidateSize({ animate: false });
    map.setView([hit.lat, hit.lng], FOCUS_ZOOM, { animate: true });
  }, [map, sites, selectedKey, focusSeq]);

  useEffect(() => {
    if (!locateNonce) return;
    map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true });
  }, [map, locateNonce]);

  return null;
}

function SiteLayer({ sites, selectedKey, pickedPart, onSelectSite }) {
  const map = useMap();
  const layerRef = useRef(null);
  const markersRef = useRef(new Map());

  useEffect(() => {
    const layer = L.layerGroup();
    const markers = markersRef.current;
    layerRef.current = layer;
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
      markers.clear();
    };
  }, [map]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    markersRef.current.clear();

    sites.forEach((site) => {
      const selected = selectedKey === site.key;
      const marker = L.marker([site.lat, site.lng], {
        icon: siteIcon(site, selected, selected ? pickedPart : null),
        title: site.count === 1 ? `Booth ${site.booths[0].part_no}` : `${site.count} booths`,
        riseOnHover: true,
        zIndexOffset: selected ? 1000 : site.count,
      });
      marker.bindPopup(sitePopupHtml(site, selected ? pickedPart : null), {
        className: 'cp-popup-wrap',
        maxWidth: 260,
        closeButton: true,
        autoPan: true,
        autoPanPadding: [48, 48],
      });
      marker.on('click', () => onSelectSite?.(site));
      layer.addLayer(marker);
      markersRef.current.set(site.key, marker);
    });
  }, [sites, selectedKey, pickedPart, onSelectSite]);

  useEffect(() => {
    if (!selectedKey) return;
    markersRef.current.get(selectedKey)?.openPopup();
  }, [selectedKey, pickedPart, sites]);

  return null;
}

export default function BoothLeafletMap({
  booths,
  selectedKey,
  pickedPart = null,
  focusSeq = 0,
  onSelectSite,
  locateNonce = 0,
  fitNonce = 0,
  className = '',
}) {
  const [userLoc, setUserLoc] = useState(null);
  const sites = useMemo(() => groupBoothSites(booths), [booths]);
  const selected = useMemo(() => sites.find((s) => s.key === selectedKey) || null, [sites, selectedKey]);
  const maxBounds = useMemo(() => L.latLngBounds(ELURU_LATLNG_BOUNDS).pad(0.08), []);

  return (
    <div className={`cp-map-shell ${className}`}>
      <MapContainer
        center={ELURU_CENTER}
        zoom={13}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxBounds={maxBounds}
        maxBoundsViscosity={1}
        className="cp-map-canvas"
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom
        doubleClickZoom
        touchZoom
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={MAX_ZOOM} />
        <Rectangle
          bounds={ELURU_LATLNG_BOUNDS}
          pathOptions={{ color: '#0ea5e9', weight: 1.5, dashArray: '6 6', fill: false, opacity: 0.55 }}
        />
        <ZoomControl position="bottomright" />
        <MapChrome
          sites={sites}
          selectedKey={selectedKey}
          focusSeq={focusSeq}
          locateNonce={locateNonce}
          fitNonce={fitNonce}
          onUserLocation={setUserLoc}
        />
        <SiteLayer sites={sites} selectedKey={selectedKey} pickedPart={pickedPart} onSelectSite={onSelectSite} />
        {selected ? (
          <Circle
            center={[selected.lat, selected.lng]}
            radius={90}
            pathOptions={{ color: '#db2777', fillColor: '#f472b6', fillOpacity: 0.18, weight: 2 }}
          />
        ) : null}
        {userLoc ? (
          <>
            <CircleMarker center={userLoc} radius={16} pathOptions={{ color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 0.22, weight: 1 }} />
            <CircleMarker center={userLoc} radius={6} pathOptions={{ color: '#fff', fillColor: '#0ea5e9', fillOpacity: 1, weight: 2 }} />
          </>
        ) : null}
      </MapContainer>
      {!sites.length ? (
        <div className="cp-map-empty-overlay">No booth pins inside Eluru yet.</div>
      ) : null}
    </div>
  );
}
