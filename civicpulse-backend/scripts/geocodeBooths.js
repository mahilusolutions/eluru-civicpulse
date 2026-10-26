/**
 * Fill public.booths.lat / lng from real OpenStreetMap geocoding (Eluru city only).
 *
 *   node scripts/geocodeBooths.js              # dry run (missing only)
 *   node scripts/geocodeBooths.js --apply      # write lat/lng for missing
 *   node scripts/geocodeBooths.js --apply --overwrite
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { prisma } = require('../db');

const APPLY = process.argv.includes('--apply');
const OVERWRITE = process.argv.includes('--overwrite');
const UA = 'CivicPulse-Eluru/1.0 (campaign ops; contact: eluru.mahilusolutions.com)';
const SLEEP_MS = 1100;

/** Eluru Municipal Corporation / constituency window. */
const BOX = { minLat: 16.68, maxLat: 16.78, minLng: 81.03, maxLng: 81.17 };
const VIEWBOX = `${BOX.minLng},${BOX.maxLat},${BOX.maxLng},${BOX.minLat}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function inBox(lat, lng) {
  return lat >= BOX.minLat && lat <= BOX.maxLat && lng >= BOX.minLng && lng <= BOX.maxLng;
}

function clean(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/[|{}]/g, '')
    .trim();
}

function simplifyPlace(s) {
  return clean(s)
    .replace(/\b(room|class|side|block|building|shed|northern|southern|eastern|western|north|south|east|west|1st|2nd|3rd|4th|5th|new|old|mp|ups|ps|high school|school)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasLatin(s) {
  return /[A-Za-z]{3,}/.test(s || '');
}

function latinOnly(s) {
  return clean(s)
    .replace(/[^\x00-\x7F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function nominatim(query, { bounded = true } = {}) {
  const params = new URLSearchParams({
    format: 'json',
    limit: '8',
    countrycodes: 'in',
    addressdetails: '0',
    q: query,
    viewbox: VIEWBOX,
    bounded: bounded ? '1' : '0',
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (res.status === 429 || res.status === 503) {
      await sleep(SLEEP_MS * (attempt + 2));
      continue;
    }
    if (!res.ok) return null;
    const rows = await res.json();
    for (const r of rows) {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng) && inBox(lat, lng)) {
        return {
          lat,
          lng,
          label: r.display_name,
          importance: Number(r.importance) || 0,
          source: 'nominatim',
        };
      }
    }
    return null;
  }
  return null;
}

async function photon(query) {
  const params = new URLSearchParams({
    q: query,
    limit: '8',
    lang: 'en',
    lat: '16.71',
    lon: '81.10',
  });
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  for (const f of data.features || []) {
    const [lng, lat] = f.geometry?.coordinates || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBox(lat, lng)) continue;
    const p = f.properties || {};
    return {
      lat,
      lng,
      label: [p.name, p.street, p.city || p.county, p.state].filter(Boolean).join(', '),
      importance: 0,
      source: 'photon',
    };
  }
  return null;
}

/** elections.in English polling list for Eluru AC. */
async function loadEnglishBoothHints() {
  const url = 'https://www.elections.in/andhra-pradesh/polling-stations/eluru.html';
  const html = await fetch(url, { headers: { 'User-Agent': UA } }).then((r) => r.text());
  const map = new Map();
  const re = /\|([^|]*)\|\s*(\d{1,3})\s*\|\s*([^|]+)\|/g;
  let m;
  let lastLocality = '';
  while ((m = re.exec(html))) {
    const loc = clean(m[1]);
    if (loc) lastLocality = loc;
    const part = Number(m[2]);
    const area = clean(m[3]);
    if (!part || part > 300 || !area) continue;
    if (/polling station no/i.test(area)) continue;
    map.set(part, { locality: lastLocality, area });
  }
  return map;
}

const cache = new Map();

async function geocodeOne(query) {
  const key = query.toLowerCase();
  if (cache.has(key)) {
    const hit = cache.get(key);
    return hit ? { ...hit, query, cached: true } : null;
  }
  // Prefer Photon first (more reliable under load); Nominatim as backup
  await sleep(SLEEP_MS);
  let hit = await photon(query);
  if (!hit) {
    await sleep(SLEEP_MS);
    hit = await nominatim(query, { bounded: true });
  }
  if (!hit) {
    await sleep(SLEEP_MS);
    hit = await nominatim(query, { bounded: false });
  }
  cache.set(key, hit);
  return hit ? { ...hit, query, cached: false } : null;
}

async function geocodeQueries(queries) {
  for (const q of queries) {
    if (!q || q.length < 5) continue;
    const hit = await geocodeOne(q);
    if (hit) return hit;
  }
  return null;
}

function buildQueries(booth, eng) {
  const qs = [];
  const pin = booth.pin_code && /^\d{6}$/.test(String(booth.pin_code)) ? String(booth.pin_code) : null;
  const suffix = 'Eluru, Andhra Pradesh, India';

  if (eng?.area) {
    const area = simplifyPlace(eng.area);
    if (area.length > 4) {
      qs.push(`${area}, ${suffix}`);
      const head = area.split(',')[0].trim();
      if (head.length > 5) qs.push(`${head}, ${suffix}`);
    }
    if (eng.locality) {
      const loc = simplifyPlace(eng.locality);
      if (loc.length > 3) {
        qs.push(`${loc}, ${suffix}`);
        if (area) qs.push(`${loc}, ${area.split(',')[0]}, ${suffix}`);
      }
    }
  }

  const areaName = clean(booth.area_name);
  if (areaName && hasLatin(areaName)) qs.push(`${simplifyPlace(latinOnly(areaName))}, ${suffix}`);
  if (areaName) qs.push(`${areaName}, ${suffix}`);

  const name = clean(booth.polling_station_name);
  const addr = clean(booth.polling_station_address);
  const latinAddr = latinOnly(addr);
  const latinName = latinOnly(name);
  if (latinAddr.length > 6) qs.push(`${simplifyPlace(latinAddr)}, ${suffix}`);
  if (latinName.length > 4) qs.push(`${latinName}, ${suffix}`);
  if (addr) qs.push(`${simplifyPlace(addr)}, ${suffix}`);
  if (name) qs.push(`${name}, ${suffix}`);

  const town = clean(booth.main_town).replace(/^[^:]*[:/]\s*/, '');
  if (town && town.length > 3 && town.length < 80) qs.push(`${town}, ${suffix}`);

  // PIN is last resort — neighbourhood level inside Eluru
  if (pin) {
    qs.push(`${pin}, Eluru, Andhra Pradesh, India`);
    qs.push(`postal code ${pin}, Eluru, India`);
  }

  const seen = new Set();
  return qs.filter((q) => {
    const k = q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

(async () => {
  console.log('Loading English booth hints from elections.in …');
  let engMap = new Map();
  try {
    engMap = await loadEnglishBoothHints();
    console.log(`English hints for ${engMap.size} part numbers`);
  } catch (e) {
    console.warn('Could not load elections.in hints:', e.message);
  }

  const booths = await prisma.$queryRaw`
    SELECT part_no, polling_station_name, polling_station_address, area_name,
           pin_code, main_town, lat, lng
    FROM public.booths
    ORDER BY part_no`;

  const todo = booths.filter((b) => OVERWRITE || b.lat == null || b.lng == null);
  console.log(
    `Booths: ${booths.length}, to geocode: ${todo.length}, mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${OVERWRITE ? ' overwrite' : ''}`
  );
  console.log(`Eluru box: ${BOX.minLat}–${BOX.maxLat} N, ${BOX.minLng}–${BOX.maxLng} E`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < todo.length; i += 1) {
    const b = todo[i];
    const eng = engMap.get(b.part_no) || null;
    const queries = buildQueries(b, eng);
    const hit = await geocodeQueries(queries);
    if (!hit) {
      fail += 1;
      process.stdout.write(`  [${i + 1}/${todo.length}] part ${b.part_no}: FAIL (${queries.length} queries)\n`);
      continue;
    }
    ok += 1;
    process.stdout.write(
      `  [${i + 1}/${todo.length}] part ${b.part_no}: ${hit.lat.toFixed(5)},${hit.lng.toFixed(5)} via ${hit.source}${hit.cached ? ' (cache)' : ''}\n`
    );
    if (APPLY) {
      await prisma.$executeRaw`
        UPDATE public.booths
        SET lat = ${hit.lat}, lng = ${hit.lng}, updated_at = now()
        WHERE part_no = ${b.part_no}`;
    }
  }

  console.log(`\nDone: ${ok} located, ${fail} failed, of ${todo.length}`);
  if (!APPLY) console.log('DRY RUN — nothing saved. Add --apply to write lat/lng.');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
