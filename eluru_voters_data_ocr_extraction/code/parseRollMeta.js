/**
 * Parse ECI roll cover / page headers from OCR text.
 *
 * Language-agnostic: prefer structure (NUMBER - NAME, dates, 6-digit pins, ":" values)
 * over English/Telugu/Hindi label words. Label regexes are optional hints only.
 */

function cleanLine(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/[|{}]/g, '')
    .trim();
}

/** Any letters (Latin or Indic), digits, common punctuation — not ASCII-only. */
const NAME_CHARS = String.raw`[^\n\r\d:|]`;

function afterColon(line) {
  const s = String(line || '');
  const i = s.indexOf(':');
  if (i < 0) return cleanLine(s);
  return cleanLine(s.slice(i + 1).replace(/^[:.\-–\s]+/, ''));
}

/** "65 - Eluru (GEN)" / "12 – Any City (SC)" — number, dash, name, optional (…). Script-agnostic. */
function matchAcNoName(text) {
  const m = String(text || '').match(
    /(\d{1,3})\s*[-–]\s*([^\n\r(]{2,80}?)(?:\s*(\([^)\n]{0,40}\)))?(?=\s*$|\s{2,}|\s+\d{1,3}\s*[-–]|$)/u
  );
  if (!m) return null;
  const no = m[1];
  let name = cleanLine(m[2]).replace(/\s+/g, ' ');
  // Drop trailing OCR crumbs (single glyphs, stray punctuation)
  name = name.replace(/[\s·.•]+$/u, '').replace(/\s+\S$/u, (tail) => (/\p{L}{2,}/u.test(tail) ? tail : '')).trim();
  if (!name || name.length < 2) return null;
  const reservation = m[3] ? ` ${cleanLine(m[3])}` : '';
  return `${no} - ${name}${reservation}`.trim();
}

/** First / second DD-MM-YYYY (or with . /) in text. */
function findDates(text) {
  const all = [...String(text || '').matchAll(/\b(\d{2}[-./]\d{2}[-./]\d{4})\b/g)].map((m) => m[1]);
  return { first: all[0] || null, second: all[1] || null, all };
}

/** Indian PIN: exactly 6 digits, not part of a longer number. Prefer 1xxxx–8xxxx. */
function findPin(text) {
  const pins = [...String(text || '').matchAll(/(?<!\d)([1-9]\d{5})(?!\d)/g)].map((m) => m[1]);
  return pins[0] || null;
}

/**
 * Part number: English label first; else page-2 "… : : N" after the AC line;
 * never treat the assembly constituency number as the part.
 */
function findPartNumber(t1, t2, assemblyNo) {
  const eng =
    t1.match(/Part\s*Number\s*:?\s*(\d+)/i) ||
    t2.match(/Part\s*Number\s*:?\s*(\d+)/i);
  if (eng) return Number(eng[1]);

  // Page 2 of ECI rolls usually has AC then part: "… : 65-Name … : : 10"
  const page2Parts = [...String(t2 || '').matchAll(/:\s*:?\s*(\d{1,3})\b/g)].map((m) => Number(m[1]));
  for (const n of page2Parts) {
    if (n >= 1 && n <= 500 && n !== assemblyNo) return n;
  }

  // Last "N - …" in the lower half of page 1 is usually the polling station (same as part no).
  const lower = String(t1 || '').slice(Math.floor(String(t1 || '').length * 0.5));
  const stations = [...lower.matchAll(/(?:^|\n)\s*(\d{1,3})\s*[-–]\s*\S/gm)].map((m) => Number(m[1]));
  for (let i = stations.length - 1; i >= 0; i -= 1) {
    const n = stations[i];
    if (n >= 1 && n <= 500 && n !== assemblyNo) return n;
  }
  return null;
}

/**
 * Assembly constituency: value after a colon that looks like "NN - Name",
 * scanned from early cover lines (works in any language).
 */
function findAssembly(t1, t2) {
  const eng =
    t1.match(
      /No\.\s*Name\s*and\s*Reservation\s*Status\s*of\s*Assembly\s*Constituency\s*:?\s*([^\n]+)/i
    ) ||
    t1.match(/Assembly\s*Constituency[^:]*:\s*([^\n]+)/i) ||
    t2.match(/Assembly\s*Constituency\s*No\s*and\s*Name\s*:?\s*([^\n]+)/i);
  if (eng) {
    const fromEng = matchAcNoName(eng[1]) || cleanLine(eng[1].split(/\s{2,}|\t/)[0]);
    if (fromEng) return fromEng;
  }

  // Structural: first "digits - name" after a colon in the first ~800 chars of cover / page 2.
  for (const chunk of [t1.slice(0, 900), t2.slice(0, 500)]) {
    const lines = chunk.split(/\r?\n/);
    for (const line of lines) {
      if (!line.includes(':') && !/\d{1,3}\s*[-–]/.test(line)) continue;
      const value = line.includes(':') ? afterColon(line) : cleanLine(line);
      const ac = matchAcNoName(value);
      if (ac) return ac;
    }
  }
  return matchAcNoName(t1.slice(0, 600)) || matchAcNoName(t2.slice(0, 400));
}

function parsePageMeta(pageText) {
  const text = String(pageText || '');
  const acMatch = text.match(
    /Assembly\s*Constituency\s*No\s*and\s*Name\s*:?\s*([^\n]+?)(?=\s*Part\s*Number|$)/i
  );
  const partMatch = text.match(/Part\s*Number\s*:?\s*(\d+)/i) || text.match(/:\s*:?\s*(\d{1,3})\b/);
  // Section: "12 - Road name" — name may be any script
  const secMatch =
    text.match(/Section\s*No\s*and\s*Name\s*:?\s*(\d+)\s*[-–]\s*([^\n\r]+)/i) ||
    text.match(/(\d{1,3})\s*[-–]\s*([^\n\r]{3,80})/);
  let section_name = secMatch ? cleanLine(secMatch[2]) : null;
  if (section_name) {
    section_name = section_name
      .replace(/\bName\s*:.*$/i, '')
      .replace(/\bPhoto\b.*$/i, '')
      .trim();
  }
  return {
    ac_name: acMatch ? cleanLine(acMatch[1]) : matchAcNoName(text.slice(0, 400)),
    part_no: partMatch ? Number(partMatch[1]) : null,
    section_no: secMatch ? Number(secMatch[1]) : null,
    section_name: section_name || null,
  };
}

function extractSectionList(page1Text) {
  const text = String(page1Text || '');
  // Prefer English section header when present; else scan the upper half of the cover.
  const start = text.search(/No\.?\s*and\s*name\s*of\s*sections/i);
  const end = text.search(/Polling\s*Station\s*Details|3\.\s*Polling/i);
  const chunk =
    start >= 0 ? text.slice(start, end > start ? end : start + 2500) : text.slice(0, 2500);
  const sections = [];
  const seen = new Set();
  // "1 - Some road" — letters in any script (not ASCII-only)
  const re = new RegExp(String.raw`(\d{1,3})\s*[-–]\s*(${NAME_CHARS}{2,70})`, 'gu');
  let m;
  while ((m = re.exec(chunk))) {
    const no = Number(m[1]);
    let name = cleanLine(m[2])
      .replace(/\b(Tehsil|District|Pin|Post|Police|Subdivision)\b.*$/i, '')
      .trim();
    if (!name || name.length < 2 || no < 1 || no > 200) continue;
    if (seen.has(no)) continue;
    seen.add(no);
    sections.push({ section_no: no, section_name: name });
  }
  return sections;
}

function parseRollCover(pages) {
  const list = Array.isArray(pages) ? pages : [];
  const p1 = list.find((p) => Number(p.page ?? p.page_no ?? p.pageNo) === 1);
  const p2 = list.find((p) => Number(p.page ?? p.page_no ?? p.pageNo) === 2);
  const t1 = p1?.text || '';
  const t2 = p2?.text || '';
  const combined = `${t1}\n${t2}`;

  const assembly = findAssembly(t1, t2);
  const assemblyNo = assembly ? Number(String(assembly).match(/^(\d{1,3})/)?.[1]) : null;
  const part_number = findPartNumber(t1, t2, assemblyNo);

  const pollChunkStart = t1.search(/Polling\s*Station\s*Details/i);
  // Without English header: last third of page 1 usually holds station name/address.
  const pollChunk =
    pollChunkStart >= 0 ? t1.slice(pollChunkStart, pollChunkStart + 1200) : t1.slice(Math.floor(t1.length * 0.45));

  let polling_station = null;
  const stationRe = new RegExp(String.raw`(\d{1,3})\s*[-–]\s*(${NAME_CHARS}{3,80})`, 'gu');
  const stationHits = [...pollChunk.matchAll(stationRe)].filter((h) => {
    const name = cleanLine(h[2]);
    // Skip "61 - page" / total-pages OCR crumbs
    if (/^(page|pages|పేజీ)\b/i.test(name)) return false;
    if (name.length < 5) return false;
    return true;
  });
  // Prefer the line whose leading number equals the part number (same booth).
  const preferred =
    (part_number != null && stationHits.find((h) => Number(h[1]) === part_number)) ||
    stationHits[stationHits.length - 1];
  if (preferred) {
    polling_station = cleanLine(`${preferred[1]} - ${preferred[2]}`)
      .replace(/\bType\s*of\s*Polling.*$/i, '')
      .replace(/\bAddress\b.*$/i, '')
      .trim();
  }

  const addrMatch = pollChunk.match(
    /Address\s*of\s*Polling\s*Station\s*:?\s*([\s\S]*?)(?=\s*4\.|NUMBER\s*OF\s*ELECTORS|Signature|$)/i
  );
  let address = addrMatch
    ? cleanLine(
        addrMatch[1]
          .replace(/Number\s*of\s*Auxiliary[\s\S]*/i, '')
          .replace(/Stations?\s*in\s*this\s*part\s*:?/i, '')
      )
    : null;
  // Language-agnostic fallback: longest multi-word line in the station chunk after the "N - name" line.
  if (!address) {
    const lines = pollChunk
      .split(/\r?\n/)
      .map(cleanLine)
      .filter((l) => l.length > 20 && !/^\d{1,3}\s*[-–]/.test(l) && !/^\d+$/.test(l));
    const best = [...lines].sort((a, b) => b.length - a.length)[0];
    if (best && best.length <= 400) address = best;
  }
  if (address && address.length > 400) address = address.slice(0, 400);

  const dates = findDates(combined);
  const pin_code = findPin(t1) || findPin(t2);

  // Optional English labels (ECI English form only). Other languages rely on booth cover OCR / UI fallback.
  const townMatch = t1.match(/Main\s*Town\s*or\s*Village\s*:?\s*([^\n]+)/i);
  const postMatch = t1.match(/Post\s*Office\s*:?\s*([^\n]+)/i);
  const tehsilMatch = t1.match(/Tehsil\s*:?\s*([^\n]+)/i);
  const districtMatch = t1.match(/District\s*[-:]?\s*([^\n]+)/i);
  const totalPagesMatch =
    t1.match(/Total\s*Pages\s*:?\s*(\d+)/i) ||
    t2.match(/Total\s*Pages\s*:?\s*(\d+)/i) ||
    combined.match(/(?:^|\s)(\d{2,3})\s*[-–]\s*(?:page|pages)\b/i);

  const main_town = townMatch ? cleanLine(townMatch[1]) : null;

  const sections = extractSectionList(t1);

  return {
    assembly,
    part_number,
    polling_station,
    polling_address: address,
    pin_code,
    qualifying_date: dates.first,
    publication_date: dates.second || null,
    main_town,
    post_office: postMatch ? cleanLine(postMatch[1]) : null,
    tehsil: tehsilMatch ? cleanLine(tehsilMatch[1]) : null,
    district: districtMatch ? cleanLine(districtMatch[1]) : null,
    total_pages: totalPagesMatch ? Number(totalPagesMatch[1]) : null,
    sections,
    page1_text: t1 || null,
    page2_text: t2 || null,
  };
}

module.exports = {
  parseRollCover,
  parsePageMeta,
  extractSectionList,
  cleanLine,
  matchAcNoName,
  findPin,
  findDates,
};
