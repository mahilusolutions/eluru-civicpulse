/** Eluru Municipal Corporation / constituency map window (not whole district). */
export const ELURU_CENTER = [16.7107, 81.105];

export const ELURU_BOUNDS = {
  minLat: 16.68,
  maxLat: 16.78,
  minLng: 81.03,
  maxLng: 81.17,
};

/** Leaflet LatLngBounds corners: SW, NE */
export const ELURU_LATLNG_BOUNDS = [
  [ELURU_BOUNDS.minLat, ELURU_BOUNDS.minLng],
  [ELURU_BOUNDS.maxLat, ELURU_BOUNDS.maxLng],
];

export function inEluru(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return (
    a >= ELURU_BOUNDS.minLat &&
    a <= ELURU_BOUNDS.maxLat &&
    b >= ELURU_BOUNDS.minLng &&
    b <= ELURU_BOUNDS.maxLng
  );
}
