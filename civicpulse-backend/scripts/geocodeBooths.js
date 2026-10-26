/**
 * Fill public.booths.lat / lng from real map geocoding (OpenStreetMap Nominatim).
 *
 * Sources used (in order), all real lookups — nothing invented:
 *   1. English polling-station text from elections.in (matched by booth / part no.)
 *   2. Our booth name + address (as stored)
 *   3. PIN code + Eluru (neighbourhood-level when the building is not in OSM)
 *
 *   node scripts/geocodeBooths.js              # dry run
 *   node scripts/geocodeBooths.js --apply      # write lat/lng
 *   node scripts/geocodeBooths.js --apply --overwrite
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { prisma } = require('../db');

const APPLY = process.argv.includes('--apply');
const OVERWRITE = process.argv.includes('--overwrite');
const UA = 'CivicPulse-Eluru/1.0 (campaign ops; contact: eluru.mahilusolutions.com)';
const SLEEP_MS = 1100;

/** Accept only points inside / near Eluru district. */
const BOX = { minLat: 16.45, maxLat: 17.05, minLng: 80.85, maxLng: 81.45 };

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

/** Drop room/side OCR noise so the geocoder sees the building / area. */
function simplifyPlace(s) {
  return clean(s)
    .replace(/\b(room|class|side|block|building|shed|northern|southern|eastern|western|north|south|east|west|1st|2nd|3rd|4th|5th|new|old)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function nominatim(query) {
  const params = new URLSearchParams({
    format: 'json',
    limit: '5',
    countrycodes: 'in',
    addressdetails: '0',
    q: query,
    viewbox: '80.85,17.05,81.45,16.45',
    bounded: '0',
  });
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
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

async function photon(query) {
  const params = new URLSearchParams({
    q: query,
    limit: '5',
    lang: 'en',
    lat: '16.71',
    lon: '81.10',
  });
  const url = `https://photon.komoot.io/api/?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
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

/**
 * elections.in English list for Eluru AC — part_no → station / area text.
 * Page is older than the current roll; used only as an English geocode hint.
 */
async function loadEnglishBoothHints() {
  const url = 'https://www.elections.in/andhra-pradesh/polling-stations/eluru.html';
  const html = await fetch(url, { headers: { 'User-Agent': UA } }).then((r) => r.text());
  const map = new Map();
  // Rows look like: | locality | 7 | Mp Up School Chodimella,... |
  // or: | | 8 | Mp Up School... |
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

async function geocodeQueries(queries) {
  for (const q of queries) {
    const key = q.toLowerCase();
    if (!key || key.length < 5) continue;
    if (cache.has(key)) {
      const hit = cache.get(key);
      if (hit) return { ...hit, query: q, cached: true };
      continue;
    }
    await sleep(SLEEP_MS);
    let hit = await nominatim(q);
    if (!hit) {
      await sleep(SLEEP_MS);
      hit = await photon(q);
    }
    cache.set(key, hit);
    if (hit) return { ...hit, query: q, cached: false };
  }
  return null;
}

function buildQueries(booth, eng) {
  const qs = [];
  const pin = booth.pin_code && /^\d{6}$/.test(booth.pin_code) ? booth.pin_code : null;
  const suffix = 'Eluru, Andhra Pradesh, India';

  if (eng?.area) {
    const area = simplifyPlace(eng.area);
    qs.push(`${area}, ${suffix}`);
    if (eng.locality) qs.push(`${simplifyPlace(eng.locality)}, ${suffix}`);
    // First clause before comma often has the building
    const head = area.split(',')[0];
    if (head && head.length > 6) qs.push(`${head}, ${suffix}`);
  }

  const name = clean(booth.polling_station_name);
  const addr = clean(booth.polling_station_address);
  // Prefer Latin-heavy fragments (OCR sometimes mixes scripts)
  const latinAddr = addr.replace(/[^\x00-\x7F]+/g, ' ').replace(/\s+/g, ' ').trim();
  const latinName = name.replace(/[^\x00-\x7F]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (latinAddr.length > 8) qs.push(`${simplifyPlace(latinAddr)}, ${suffix}`);
  if (latinName.length > 4) qs.push(`${latinName}, ${suffix}`);
  if (addr) qs.push(`${simplifyPlace(addr)}, ${suffix}`);
  if (name) qs.push(`${name}, ${suffix}`);

  const town = clean(booth.main_town).replace(/^[^:]*[:/]\s*/, '');
  if (town && town.length > 3 && town.length < 80) qs.push(`${town}, ${suffix}`);

  if (pin) qs.push(`${pin}, Eluru, Andhra Pradesh, India`);

  // Dedupe
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
  console.log(`Booths: ${booths.length}, to geocode: ${todo.length}, mode: ${APPLY ? 'APPLY' : 'DRY RUN'}${OVERWRITE ? ' overwrite' : ''}`);

  const report = [];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < todo.length; i += 1) {
    const b = todo[i];
    const eng = engMap.get(b.part_no) || null;
    const queries = buildQueries(b, eng);
    const hit = await geocodeQueries(queries);
    if (!hit) {
      fail += 1;
      report.push({ part: b.part_no, status: 'fail', tried: queries.slice(0, 3) });
      process.stdout.write(`  [${i + 1}/${todo.length}] part ${b.part_no}: FAIL\n`);
      continue;
    }
    ok += 1;
    report.push({
      part: b.part_no,
      status: 'ok',
      lat: hit.lat,
      lng: hit.lng,
      source: hit.source,
      query: hit.query,
      label: hit.label?.slice(0, 90),
    });
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

  const out = path.join(__dirname, '..', 'data', 'geocode-booths-report.json');
  try {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), apply: APPLY, ok, fail, report }, null, 2));
    console.log(`Report: ${out}`);
  } catch {
    /* optional */
  }
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
