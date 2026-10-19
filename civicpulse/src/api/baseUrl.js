/**
 * API base for axios (/api) and absolute asset roots (no /api).
 * Production (domain): same-origin relative paths — never hardcode the server IP.
 * Local dev: localhost:4000 unless REACT_APP_API_URL is set.
 */
function isBrowserLocalhost() {
  if (typeof window === 'undefined') return true;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

export function getApiBase() {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/\/$/, '');
  }
  if (!isBrowserLocalhost()) return '/api';
  return 'http://localhost:4000/api';
}

/** Origin for /api/... image paths (strip trailing /api). */
export function getApiOrigin() {
  return getApiBase().replace(/\/api\/?$/, '') || '';
}

export function apiAssetUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const origin = getApiOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${p}` : p;
}
