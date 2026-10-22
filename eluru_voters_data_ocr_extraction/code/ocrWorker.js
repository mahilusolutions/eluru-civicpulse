const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { parsePageMeta, parseRollCover } = require('./parseRollMeta');
const { readCardHeaders } = require('./cardReader');

const TESSERACT =
  process.env.TESSERACT_PATH ||
  (fs.existsSync('C:\\Program Files\\Tesseract-OCR\\tesseract.exe')
    ? 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
    : 'tesseract');

const PDFTOPPM =
  process.env.PDFTOPPM_PATH ||
  (() => {
    const winget = path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\WinGet\\Packages');
    if (fs.existsSync(winget)) {
      const found = [];
      const walk = (dir, depth = 0) => {
        if (depth > 6) return;
        let entries = [];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isFile() && e.name.toLowerCase() === 'pdftoppm.exe') found.push(full);
          else if (e.isDirectory() && !e.name.startsWith('.')) walk(full, depth + 1);
        }
      };
      walk(winget);
      if (found[0]) return found[0];
    }
    return 'pdftoppm';
  })();

// ---- Language (English rolls, or Telugu rolls whose card text is Telugu) ----
const TESSDATA_DIR = process.env.TESSDATA_DIR || path.join(__dirname, '..', 'tessdata');
let telChoice; // cached: null (not installed) or the extra tesseract args to use

/** Telugu rolls are named ...-TEL-<part>.pdf; English ones ...-ENG-<part>-WI.pdf. */
function langForFile(file) {
  return /[-_]TEL[-_]\d+/i.test(path.basename(String(file || ''))) ? 'tel' : 'eng';
}

/** tesseract args for a language: Telugu needs its language pack (system-wide, or the bundled tessdata folder). */
function tessLangArgs(lang) {
  if (lang !== 'tel') return ['-l', 'eng'];
  if (telChoice === undefined) {
    const { spawnSync } = require('child_process');
    const has = (args) => {
      const r = spawnSync(TESSERACT, [...args, '--list-langs'], { encoding: 'utf8', windowsHide: true });
      const langs = String(r.stdout || '').split(/\r?\n/).map((l) => l.trim());
      return langs.includes('tel') && langs.includes('eng');
    };
    if (fs.existsSync(path.join(TESSDATA_DIR, 'tel.traineddata')) && has(['--tessdata-dir', TESSDATA_DIR])) {
      telChoice = ['--tessdata-dir', TESSDATA_DIR, '-l', 'tel+eng']; // bundled model (tessdata_best)
    } else if (has([])) telChoice = ['-l', 'tel+eng'];
    else telChoice = null;
  }
  if (!telChoice) {
    throw new Error('Telugu language pack is not installed. Install it (Linux: apt install tesseract-ocr-tel) or put tel.traineddata and eng.traineddata in ' + TESSDATA_DIR);
  }
  return telChoice;
}

function isJunkElectorName(n) {
  if (!n) return true;
  const s = String(n).trim();
  if (s.length < 3 || s.length > 80) return true;
  // Roll header / footer OCR noise (not a person)
  if (
    /part\s*number|section\s*no|assembly|constituency|electoral|revision|polling|eluru|s01-?65|e-?roll|draft\s*roll|electors?\s*name|photo\s*available/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^\d{1,3}[-–]\s*[A-Z]{2,}/i.test(s)) return true; // e.g. 65-ELURU…
  // Must look like a person name (letters), not mostly digits/punctuation
  const letters = (s.match(/[A-Za-z\u0C00-\u0C7F]/g) || []).length;
  if (letters < 3) return true;
  return false;
}

function cleanName(raw) {
  if (!raw) return null;
  let n = raw
    .replace(/\s+/g, ' ')
    .replace(/\bName\b.*$/i, '')
    .replace(/\bPhoto\b/gi, '')
    .replace(/\bAvailable\b/gi, '')
    .trim();
  n = n.replace(/^[:\-.\s]+/, '').replace(/[:\-.\s]+$/, '');
  if (isJunkElectorName(n)) return null;
  return n;
}

/** Normalize OCR EPIC token → uppercase ID (e.g. WI02171684). */
function normalizeEpic(raw) {
  if (!raw) return null;
  let s = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  // OCR often inserts O between letters and digits: WIO2426021 → WIO2426021 (valid) or WI O…
  if (!/^[A-Z]{2,3}\d{6,9}$/.test(s)) return null;
  if (s.length < 9 || s.length > 12) return null;
  // Skip obvious non-EPIC noise
  if (/^(PAGE|AGE|GENDER|HOUSE|PHOTO|ELURU)/.test(s)) return null;
  return s;
}

function extractEpicsFromChunk(chunk) {
  if (!chunk) return [];
  const re = /\b([A-Za-z]{2,3}\d{6,9})\b/g;
  const out = [];
  let m;
  while ((m = re.exec(chunk))) {
    const epic = normalizeEpic(m[1]);
    if (epic) out.push(epic);
  }
  return out;
}

/** Assign epics to the last N voters without an epic (card EPICs sit under each row). */
function applyEpicsToTail(voters, epics) {
  if (!epics?.length || !voters?.length) return;
  const open = [];
  for (let i = 0; i < voters.length; i += 1) {
    if (!voters[i].epic) open.push(i);
  }
  const start = Math.max(0, open.length - epics.length);
  for (let i = 0; i < epics.length; i += 1) {
    const vi = open[start + i];
    if (vi == null) break;
    voters[vi].epic = epics[i];
  }
}

function extractVotersFromChunk(chunk, partNo, serialStart, pageMeta = {}) {
  const normalized = chunk
    .replace(/\r/g, '\n')
    .replace(/[|]/g, 'I')
    .replace(/\u00a0/g, ' ')
    .replace(/Fathers?\s*Name\s*:/gi, '<<<FATHER>>>:')
    .replace(/Husbands?\s*Name\s*:/gi, '<<<HUSBAND>>>:')
    .replace(/Mothers?\s*Name\s*:/gi, '<<<MOTHER>>>:')
    .replace(/Others?\s*:/gi, '<<<OTHER>>>:');

  const names = [];
  const nameRe =
    /Name\s*:\s*(.+?)(?=\s*(?:Name\s*:|<<<FATHER>>>|<<<HUSBAND>>>|<<<MOTHER>>>|<<<OTHER>>>|House\s*Number|Age\s*:|$))/gis;
  let m;
  while ((m = nameRe.exec(normalized))) {
    const name = cleanName(m[1]);
    if (name) names.push(name);
  }

  const relations = [];
  const relRe =
    /<<<(FATHER|HUSBAND|MOTHER|OTHER)>>>\s*:\s*(.+?)(?=\s*(?:<<<FATHER>>>|<<<HUSBAND>>>|<<<MOTHER>>>|<<<OTHER>>>|House\s*Number|Age\s*:|Name\s*:|$))/gis;
  while ((m = relRe.exec(normalized))) {
    relations.push({ type: m[1].toLowerCase(), name: cleanName(m[2]) });
  }

  const houses = [];
  const houseRe =
    /House\s*Number\s*:\s*([0-9A-Za-z][0-9A-Za-z\-\/,.]{0,40}?)(?=\s*(?:Photo|House\s*Number|Age\s*:|Name\s*:|<<<|$))/gi;
  while ((m = houseRe.exec(normalized))) {
    let h = m[1].replace(/\bPhoto\b.*/i, '').trim();
    houses.push(h && !/^name$/i.test(h) ? h.slice(0, 40) : null);
  }

  const ages = [];
  const ageRe = /Age\s*:\s*(\d{1,3})\s*Gender\s*:\s*(Male|Female|M|F)/gi;
  while ((m = ageRe.exec(normalized))) {
    const age = Number(m[1]);
    if (age >= 18 && age <= 120) {
      const g = m[2].toUpperCase();
      ages.push({ age, gender: g.startsWith('F') ? 'F' : 'M' });
    }
  }

  const count = Math.max(names.length, relations.length, houses.length, ages.length);
  const voters = [];
  const seen = new Set();
  let serial = serialStart;
  for (let i = 0; i < count; i += 1) {
    const name = names[i];
    if (!name) continue;
    const rel = relations[i] || {};
    const house_no = houses[i] || null;
    const ag = ages[i] || {};
    if (ag.age == null && !house_no && !rel.name) continue;
    const key = `${name.toLowerCase()}|${house_no || ''}|${ag.age || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    voters.push({
      part_no: partNo,
      serial_no: serial,
      epic: null,
      name,
      relation_type: rel.type || 'father',
      relation_name: rel.name || null,
      house_no,
      age: ag.age || null,
      gender: ag.gender || null,
      page_no: pageMeta.page_no || null,
      section_no: pageMeta.section_no || null,
      section_name: pageMeta.section_name || null,
      ac_name: pageMeta.ac_name || null,
      status: 'active',
      raw_ocr_text: `${name} | ${rel.name || ''} | ${house_no || ''} | ${ag.age || ''}`,
    });
    serial += 1;
  }
  return voters;
}

function parseEciOcrText(text, partNo) {
  if (!text || !text.trim()) return [];

  // Keep page markers so we know page_no for section/road + images
  const parts = String(text).split(/(===== PAGE \d+ =====)/i);
  const voters = [];
  let pendingEpics = [];
  let currentPageNo = null;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;
    const marker = part.match(/^===== PAGE (\d+) =====$/i);
    if (marker) {
      currentPageNo = Number(marker[1]);
      continue;
    }

    const page = part;
    const pageMeta = {
      ...parsePageMeta(page),
      page_no: currentPageNo,
    };

    if (!/Name\s*:/i.test(page)) {
      pendingEpics = pendingEpics.concat(extractEpicsFromChunk(page));
      continue;
    }

    const firstNameIdx = page.search(/Name\s*:/i);
    const early = page.slice(0, Math.max(0, firstNameIdx));
    const body = page.slice(Math.max(0, firstNameIdx));
    const earlyEpics = extractEpicsFromChunk(early);
    const bodyEpics = extractEpicsFromChunk(body);

    applyEpicsToTail(voters, pendingEpics.concat(earlyEpics));
    pendingEpics = [];

    const pageVoters = extractVotersFromChunk(body, partNo, voters.length + 1, pageMeta);
    applyEpicsToTail(pageVoters, bodyEpics);
    voters.push(...pageVoters);
  }

  applyEpicsToTail(voters, pendingEpics);

  for (const v of voters) {
    const road = v.section_name
      ? `${v.section_no != null ? `${v.section_no}-` : ''}${v.section_name}`
      : '';
    v.raw_ocr_text =
      `${v.epic || ''} | ${v.name} | ${v.relation_name || ''} | ${v.house_no || ''} | ${v.age || ''} | ${road}`
        .replace(/^\s*\|\s*/, '')
        .replace(/\s*\|\s*$/, '');
  }
  return voters;
}

/**
 * The age digits OCR gets wrong: a "7" often comes out with a stray slash ("67" -> "6/7",
 * "75" -> "/5" or "7/5"). Returns null when the text cannot be trusted rather than guessing.
 */
function parseAgeDigits(raw) {
  let s = String(raw || '').trim();
  if (!s || /[^0-9\/IlOS|]/.test(s)) return null;
  // A slash touching a 7 is part of that glyph (7/5 = 75, 6/7 = 67); a lone slash is the 7 itself (/5 = 75, 3/ = 37).
  s = s.replace(/\/(?=7)|(?<=7)\//g, '').replace(/\//g, '7').replace(/[Il|]/g, '1').replace(/O/g, '0').replace(/S/g, '5');
  const age = Number(s);
  return Number.isInteger(age) && age >= 18 && age <= 120 ? age : null;
}

const TELUGU_LABEL = /ఓటరు|వయస్సు|లింగము|ఇంటి\s*సంఖ్య/u;
const TELUGU_RELATION = { తండ్రి: 'father', భర్త: 'husband', తల్లి: 'mother', ఇతరుల: 'other' };

/** Keep Telugu and Latin letters only; drop stray marks picked up from the photo frame and card border. */
function cleanTeluguName(raw) {
  const kept = String(raw || '')
    .replace(/[^\u0C00-\u0C7FA-Za-z.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = kept.split(' ').filter(Boolean);
  while (tokens.length && /^[A-Za-z.]{1,2}$/.test(tokens[tokens.length - 1]) && tokens.length > 1) tokens.pop();
  const name = tokens.join(' ').trim();
  return name.length >= 2 ? name.slice(0, 120) : null;
}

/** Card text of a Telugu roll: ఓటరు పేరు (name), తండ్రి/భర్త పేరు (relative), ఇంటి సంఖ్య (house), వయస్సు (age), లింగము (gender). */
function parseTeluguCardBody(body, partNo, serial, meta = {}) {
  const flat = String(body || '').replace(/\r/g, '').replace(/[|]/g, ' ').split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  if (!flat) return null;

  const nameMatch = flat.match(/ఓటరు\s*పేరు\s*[:;=.]?\s*(.+?)(?=\s*\S{0,6}\s*పేరు\s*[:;=]|\s*ఇంటి\s*సంఖ్య|\s*వయస్సు|$)/u);
  let nameRaw = nameMatch ? nameMatch[1] : null;
  if (!nameRaw) {
    // The "voter" label was misread: the first "... పేరు :" on the card is still the voter's own name.
    const lead = flat.match(/పేరు\s*[:;=.]?\s*(.+?)(?=\s*\S{0,6}\s*పేరు\s*[:;=]|\s*ఇంటి\s*సంఖ్య|\s*వయస్సు|$)/u);
    nameRaw = lead ? lead[1] : null;
  }
  const name = cleanTeluguName(nameRaw);
  if (!name) return null;

  let relation_type = 'other';
  let relation_name = null;
  const after = nameMatch ? flat.slice(nameMatch.index + nameMatch[0].length) : flat.replace(/^.*?పేరు[^]*?(?=\S{0,6}\s*పేరు\s*[:;=])/u, '');
  const relMatch = after.match(/(\S{0,6})\s*పేరు\s*[:;=]\s*(.+?)(?=\s*ఇంటి|\s*వయస్సు|$)/u);
  if (relMatch) {
    const label = relMatch[1];
    const key = Object.keys(TELUGU_RELATION).find((k) => label.includes(k) || k.includes(label.replace(/[^\u0C00-\u0C7F]/g, '')) && label.length > 2);
    relation_type = key ? TELUGU_RELATION[key] : 'other';
    relation_name = cleanTeluguName(relMatch[2]);
  }

  let house_no = null;
  const houseMatch = flat.match(/ఇంటి\s*సంఖ్య\s*[:;=]?\s*(.+?)(?=\s*వయస్సు|$)/u);
  if (houseMatch) {
    const h = houseMatch[1].replace(/\s+/g, ' ').replace(/[^\u0C00-\u0C7F0-9A-Za-z\-\/.,() ]/g, '').trim();
    // Drop 1-2 character leftovers (photo frame, border) that follow the number.
    const parts = h.split(' ').filter(Boolean);
    while (parts.length > 1 && parts[parts.length - 1].length <= 2) parts.pop();
    house_no = parts.length ? parts.join(' ').slice(0, 60) : null;
  }

  let age = null;
  const a = flat.match(/వయస్సు\s*[:;=]?\s*([0-9\/>IlOS|]{1,4})/u);
  if (a) age = parseAgeDigits(a[1]);

  let gender = null;
  const g = flat.match(/లింగము\s*[:;=]?\s*(\S+)/u);
  if (g) {
    const v = g[1];
    if (/^పు/u.test(v) || /^(M|Male)\b/i.test(v)) gender = 'M';
    else if (/ఇత/u.test(v)) gender = 'O';
    else if (/[\u0C00-\u0C7F]{2,}/u.test(v) || /^(F|Female)\b/i.test(v)) gender = 'F'; // స్త్రీ, however the marks were read
  }

  return {
    part_no: partNo,
    serial_no: serial,
    epic: null,
    name,
    relation_type,
    relation_name,
    house_no,
    age,
    gender,
    page_no: meta.page_no || null,
    section_no: meta.section_no || null,
    section_name: meta.section_name || null,
    ac_name: meta.ac_name || null,
    status: 'active',
    raw_ocr_text: null,
  };
}

/** Parse the text block of one voter card (read on its own, so nothing is interleaved). */
function parseCardBody(body, partNo, serial, meta = {}) {
  if (TELUGU_LABEL.test(String(body || ''))) return parseTeluguCardBody(body, partNo, serial, meta);
  const flat = String(body || '')
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
    .replace(/[|]/g, 'I')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  if (!flat) return null;

  const REL = '(?:Fathers?|Husbands?|Mothers?|Others?)';
  const STOP = `(?=\\s*(?:${REL}\\s*(?:Name)?\\s*[:;=]|House\\s*Numb|Age\\s*[:;=]|$))`;

  let nameRaw = null;
  const nameMatch = flat.match(new RegExp(`^\\W*Name\\s*[^A-Za-z0-9\\s]{0,3}\\s*(.+?)${STOP}`, 'i'));
  if (nameMatch) nameRaw = nameMatch[1];
  else {
    // The "Name" label itself was misread: take everything before the first other label.
    const lead = flat.match(new RegExp(`^(.+?)${STOP}`, 'i'));
    nameRaw = lead ? lead[1].replace(/^\W*\w{0,6}\W+/, '') : null;
  }
  const name = cleanName(nameRaw);
  if (!name) return null;

  let relation_type = 'father';
  let relation_name = null;
  const relMatch = flat.match(
    new RegExp(`(${REL})\\s*(?:Name)?\\s*[:;=]?\\s*(.+?)(?=\\s*House\\s*Numb|\\s*Age\\s*[:;=]|$)`, 'i')
  );
  if (relMatch) {
    const kind = relMatch[1].toLowerCase();
    relation_type = kind.startsWith('h') ? 'husband' : kind.startsWith('m') ? 'mother' : kind.startsWith('o') ? 'other' : 'father';
    relation_name = cleanName(relMatch[2]);
  }

  let house_no = null;
  const houseMatch = flat.match(/House\s*Numb\w*\s*[:;=]?\s*(.+?)(?=\s*Age\s*[:;=]|\s*Photo|\s*Available|$)/i);
  if (houseMatch) {
    const h = houseMatch[1].replace(/^[:;=\s]+/, '').replace(/\s+/g, ' ').trim();
    house_no = h && !/^name$/i.test(h) ? h.slice(0, 60) : null;
  }

  let age = null;
  let gender = null;
  const ageGender = flat.match(/Age\s*[:;=]?\s*([0-9\/>IlOS|]{1,4})\s*Gender\s*[:;=]?\s*(Male|Female|Third|M\b|F\b)/i);
  if (ageGender) {
    age = parseAgeDigits(ageGender[1]);
    gender = /^f/i.test(ageGender[2]) ? 'F' : /^t/i.test(ageGender[2]) ? 'O' : 'M';
  } else {
    const a = flat.match(/Age\s*[:;=]?\s*([0-9\/>IlOS|]{1,4})/i);
    if (a) age = parseAgeDigits(a[1]);
    const g = flat.match(/Gender\s*[:;=]?\s*(Male|Female|Third)/i);
    if (g) gender = /^f/i.test(g[1]) ? 'F' : /^t/i.test(g[1]) ? 'O' : 'M';
  }

  return {
    part_no: partNo,
    serial_no: serial,
    epic: null,
    name,
    relation_type,
    relation_name,
    house_no,
    age,
    gender,
    page_no: meta.page_no || null,
    section_no: meta.section_no || null,
    section_name: meta.section_name || null,
    ac_name: meta.ac_name || null,
    status: 'active',
    raw_ocr_text: null,
  };
}

function formatRawOcr(v) {
  const road = v.section_name
    ? `${v.section_no != null ? `${v.section_no}-` : ''}${v.section_name}`
    : '';
  return `${v.epic || ''} | ${v.name} | ${v.relation_name || ''} | ${v.house_no || ''} | ${v.age || ''} | ${road}`
    .replace(/^\s*\|\s*/, '')
    .replace(/\s*\|\s*$/, '');
}

/**
 * Voters for one page. When the card reader ran, every card is parsed on its own
 * (serial, Voter ID and details always belong together). Otherwise fall back to
 * parsing the full-page text.
 */
function parsePageVoters(pageNo, pageText, cards, partNo, startSerial = 1) {
  if (Array.isArray(cards) && cards.length) {
    const meta = { ...parsePageMeta(pageText), page_no: pageNo };
    const voters = [];
    cards.forEach((card, i) => {
      const parsed = parseCardBody(card.body_text, partNo, startSerial + i, meta);
      if (!parsed) return;
      parsed.serial_no = startSerial + i;
      parsed.epic = card.epic || null;
      parsed.raw_ocr_text = formatRawOcr(parsed);
      voters.push(parsed);
    });
    return voters;
  }
  const voters = parseEciOcrText(`===== PAGE ${pageNo} =====\n${pageText}`, partNo);
  voters.forEach((v, i) => {
    v.serial_no = startSerial + i;
  });
  return voters;
}

/**
 * All voters for the roll, numbered in printed order. A card that cannot be read still
 * uses up its number, so later voters keep the serial printed on the roll.
 */
function buildVoters(pages, partNo) {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  const voters = [];
  let serial = 1;
  for (const page of sorted) {
    const pageVoters = parsePageVoters(page.page, page.text || '', page.cards, partNo, serial);
    voters.push(...pageVoters);
    serial += Array.isArray(page.cards) && page.cards.length ? page.cards.length : pageVoters.length;
  }
  return voters;
}

function runAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      if (status !== 0) {
        reject(
          new Error(
            `${path.basename(cmd)} failed (${status}): ${(stderr || stdout || '').slice(0, 400)}`
          )
        );
        return;
      }
      resolve({ stdout, stderr, status });
    });
  });
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    async () => {
      while (true) {
        const i = next;
        next += 1;
        if (i >= items.length) break;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function partFromFilename(name) {
  const m = name.match(/-(?:ENG|TEL)-(\d+)(?:-WI)?/i) || name.match(/part[-_]?(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Truncate page text for live SSE (keep enough to read, avoid huge payloads). */
function livePageText(text, maxChars = 4000) {
  const t = String(text || '');
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n…`;
}

async function pdfPageCount(pdfPath) {
  const PDFINFO = process.env.PDFINFO_PATH || 'pdfinfo';
  try {
    const res = await runAsync(PDFINFO, [pdfPath]);
    const m = String(res.stdout || '').match(/Pages:\s*(\d+)/i);
    if (m) return Number(m[1]);
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * OCR every page. Renders+OCRs page-by-page so live text streams immediately
 * (does not wait for the whole PDF to convert first).
 */
function keepPageImage(srcPath, imageDir, pageNo) {
  if (!imageDir || !srcPath || !fs.existsSync(srcPath)) return null;
  try {
    fs.mkdirSync(imageDir, { recursive: true });
    const name = `page-${pageNo}.png`;
    const dest = path.join(imageDir, name);
    fs.copyFileSync(srcPath, dest);
    return name;
  } catch (err) {
    console.warn('keepPageImage:', err.message);
    return null;
  }
}

function buildOcrResult(pageTexts, partNo, { pageWorkers, dpi, pageStartedAt }) {
  pageTexts.sort((a, b) => a.page - b.page);
  const fullText = pageTexts
    .map((p) => `===== PAGE ${p.page} =====\n${p.text || ''}`.trimEnd())
    .join('\n\n');
  const voters = buildVoters(pageTexts, partNo);
  const roll_info = parseRollCover(pageTexts);
  return {
    pages: pageTexts,
    full_text: fullText,
    voters,
    roll_info,
    pageCount: pageTexts.length,
    ocrPages: pageTexts.length,
    textLength: fullText.length,
    pageWorkers,
    dpi,
    durationMs: Date.now() - pageStartedAt,
  };
}

async function ocrPdfToVoters(pdfPath, partNo, opts = {}) {
  const {
    onProgress,
    maxPages = 0,
    dpi = 160,
    startPage = 1,
    pageWorkers = 3,
    imageDir = null,
  } = opts;

  const keepImages = process.env.OCR_KEEP_IMAGES !== '0' && Boolean(imageDir);
  const lang = opts.lang || langForFile(pdfPath);
  const langArgs = tessLangArgs(lang);

  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `eluru-ocr-${partNo}-`));
  const pageStartedAt = Date.now();

  try {
    if (onProgress) onProgress({ stage: 'render', page: 0, total: 0, etaSeconds: null });

    let totalPages = await pdfPageCount(pdfPath);
    if (!totalPages || totalPages < 1) {
      // Fallback: render all pages once, then OCR (still streams text per page)
      const prefix = path.join(tmpRoot, 'page');
      const ppmArgs = ['-png', '-r', String(dpi), '-f', String(startPage)];
      if (maxPages > 0) ppmArgs.push('-l', String(startPage + maxPages - 1));
      ppmArgs.push(pdfPath, prefix);
      await runAsync(PDFTOPPM, ppmArgs);
      const pageFiles = fs
        .readdirSync(tmpRoot)
        .filter((f) => f.toLowerCase().endsWith('.png'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (!pageFiles.length) throw new Error('pdftoppm produced no page images');
      totalPages = pageFiles.length;
      let finished = 0;
      const ocrStart = Date.now();
      const pageTexts = await mapPool(pageFiles, pageWorkers, async (pageFile, i) => {
        const imgPath = path.join(tmpRoot, pageFile);
        const outBase = path.join(tmpRoot, `ocr-${i + 1}`);
        await runAsync(TESSERACT, [imgPath, outBase, ...langArgs, '--psm', '6']);
        const pageText = fs.existsSync(`${outBase}.txt`)
          ? fs.readFileSync(`${outBase}.txt`, 'utf8')
          : '';
        const numMatch = pageFile.match(/(\d+)\.png$/i);
        const pageNo = numMatch ? Number(numMatch[1]) : startPage + i;
        const savedImage = keepImages ? keepPageImage(imgPath, imageDir, pageNo) : null;
        finished += 1;
        const elapsed = (Date.now() - ocrStart) / 1000;
        const etaSeconds = Math.round((elapsed / finished) * (pageFiles.length - finished));
        if (onProgress) {
          onProgress({
            stage: 'ocr',
            page: finished,
            total: pageFiles.length,
            pageNo,
            etaSeconds,
            pageVoters: parseEciOcrText(pageText, partNo).slice(0, 8),
            pageVoterCount: parseEciOcrText(pageText, partNo).length,
            pageText: livePageText(pageText),
            pageCharCount: pageText.length,
          });
        }
        return {
          page: pageNo,
          image: savedImage || `page-${pageNo}.png`,
          char_count: pageText.length,
          text: pageText,
        };
      });
      return buildOcrResult(pageTexts, partNo, { pageWorkers, dpi, pageStartedAt });
    }

    const lastPage =
      maxPages > 0 ? Math.min(totalPages, startPage + maxPages - 1) : totalPages;
    const pageNos = [];
    for (let p = startPage; p <= lastPage; p += 1) pageNos.push(p);
    if (!pageNos.length) throw new Error('No pages to OCR');

    if (onProgress) {
      onProgress({ stage: 'ocr', page: 0, total: pageNos.length, etaSeconds: null });
    }

    let finished = 0;
    const ocrStart = Date.now();
    const pageTexts = await mapPool(pageNos, pageWorkers, async (pageNo) => {
      const prefix = path.join(tmpRoot, `p${pageNo}`);
      await runAsync(PDFTOPPM, [
        '-png',
        '-r',
        String(dpi),
        '-f',
        String(pageNo),
        '-l',
        String(pageNo),
        '-singlefile',
        pdfPath,
        prefix,
      ]);
      let imgPath = `${prefix}.png`;
      if (!fs.existsSync(imgPath)) {
        const alt = fs
          .readdirSync(tmpRoot)
          .find((f) => f.startsWith(`p${pageNo}`) && f.endsWith('.png'));
        if (!alt) throw new Error(`No image for page ${pageNo}`);
        imgPath = path.join(tmpRoot, alt);
        await runAsync(TESSERACT, [imgPath, prefix, ...langArgs, '--psm', '6']);
      } else {
        await runAsync(TESSERACT, [imgPath, prefix, ...langArgs, '--psm', '6']);
      }
      const pageText = fs.existsSync(`${prefix}.txt`)
        ? fs.readFileSync(`${prefix}.txt`, 'utf8')
        : '';
      const savedImage = keepImages ? keepPageImage(imgPath, imageDir, pageNo) : null;
      try {
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      } catch {
        /* ignore */
      }
      finished += 1;
      const elapsed = (Date.now() - ocrStart) / 1000;
      const etaSeconds = Math.round((elapsed / finished) * (pageNos.length - finished));
      // Voter pages: read every card on its own (serial + Voter ID + details together).
      let cards = null;
      const isVoterPage = lang === 'tel' ? /ఓటరు\s*పేరు|విభాగం\s*సంఖ్య/u.test(pageText) || (pageText.match(/[A-Z]{3}\d{7}/g) || []).length >= 3 : /Section\s*No\s*and\s*Name/i.test(pageText);
      if (process.env.OCR_CARD_READER !== '0' && isVoterPage) {
        try {
          cards = await readCardHeaders({
            pdfPath,
            pageNo,
            pdftoppm: PDFTOPPM,
            tesseract: TESSERACT,
            tmpDir: tmpRoot,
            bodies: true,
            bodyLangArgs: langArgs,
            readAloneOnly: lang === 'tel',
            ...(lang === 'tel' ? { bodyBox: { x0: 6, x1: 330, y0: 26, y1: 176 } } : {}),
          });
        } catch (err) {
          console.warn(`Card reader failed on page ${pageNo}: ${err.message} (using page text)`);
        }
      }
      const voters = parsePageVoters(pageNo, pageText, cards, partNo);
      if (onProgress) {
        onProgress({
          stage: 'ocr',
          page: finished,
          total: pageNos.length,
          pageNo,
          etaSeconds,
          pageVoters: voters.slice(0, 8),
          pageVoterCount: voters.length,
          pageText: livePageText(pageText),
          pageCharCount: pageText.length,
        });
      }
      return {
        page: pageNo,
        image: savedImage || `page-${pageNo}.png`,
        char_count: pageText.length,
        text: pageText,
        cards,
      };
    });

    return buildOcrResult(pageTexts, partNo, { pageWorkers, dpi, pageStartedAt });
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  isJunkElectorName,
  normalizeEpic,
  parseEciOcrText,
  parsePageVoters,
  buildVoters,
  parseRollCover,
  ocrPdfToVoters,
  partFromFilename,
  langForFile,
  tessLangArgs,
  parseCardBody,
  TESSERACT,
  PDFTOPPM,
};
