const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

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

function extractVotersFromChunk(chunk, partNo, serialStart) {
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
      status: 'active',
      raw_ocr_text: `${name} | ${rel.name || ''} | ${house_no || ''} | ${ag.age || ''}`,
    });
    serial += 1;
  }
  return voters;
}

function parseEciOcrText(text, partNo) {
  if (!text || !text.trim()) return [];

  // Process page-by-page: EPIC lines sit under each 3-card row (often before the next Name line)
  const pages = String(text).split(/===== PAGE \d+ =====/i);
  const voters = [];
  let pendingEpics = [];

  for (const page of pages) {
    if (!page || !/Name\s*:/i.test(page)) {
      // Epics-only fragment / header page
      pendingEpics = pendingEpics.concat(extractEpicsFromChunk(page));
      continue;
    }

    const firstNameIdx = page.search(/Name\s*:/i);
    const early = page.slice(0, Math.max(0, firstNameIdx));
    const body = page.slice(Math.max(0, firstNameIdx));
    const earlyEpics = extractEpicsFromChunk(early);
    const bodyEpics = extractEpicsFromChunk(body);

    // Epics before first Name on this page belong to previous page's last cards
    applyEpicsToTail(voters, pendingEpics.concat(earlyEpics));
    pendingEpics = [];

    const pageVoters = extractVotersFromChunk(body, partNo, voters.length + 1);
    // Epics after Names on this page belong to this page's cards (OCR often misses early rows)
    applyEpicsToTail(pageVoters, bodyEpics);
    voters.push(...pageVoters);
  }

  applyEpicsToTail(voters, pendingEpics);

  // Refresh raw_ocr_text to include EPIC when present
  for (const v of voters) {
    v.raw_ocr_text = `${v.epic || ''} | ${v.name} | ${v.relation_name || ''} | ${v.house_no || ''} | ${v.age || ''}`.replace(
      /^\s*\|\s*/,
      ''
    );
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
  const m = name.match(/-ENG-(\d+)-WI/i) || name.match(/part[-_]?(\d+)/i);
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
async function ocrPdfToVoters(pdfPath, partNo, opts = {}) {
  const {
    onProgress,
    maxPages = 0,
    dpi = 160,
    startPage = 1,
    pageWorkers = 3,
  } = opts;

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
        await runAsync(TESSERACT, [imgPath, outBase, '-l', 'eng', '--psm', '6']);
        const pageText = fs.existsSync(`${outBase}.txt`)
          ? fs.readFileSync(`${outBase}.txt`, 'utf8')
          : '';
        const numMatch = pageFile.match(/(\d+)\.png$/i);
        const pageNo = numMatch ? Number(numMatch[1]) : startPage + i;
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
        return { page: pageNo, image: pageFile, char_count: pageText.length, text: pageText };
      });
      pageTexts.sort((a, b) => a.page - b.page);
      const fullText = pageTexts
        .map((p) => `===== PAGE ${p.page} =====\n${p.text || ''}`.trimEnd())
        .join('\n\n');
      return {
        pages: pageTexts,
        full_text: fullText,
        voters: parseEciOcrText(fullText, partNo),
        pageCount: pageTexts.length,
        ocrPages: pageTexts.length,
        textLength: fullText.length,
        pageWorkers,
        dpi,
        durationMs: Date.now() - pageStartedAt,
      };
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
      const imgPath = `${prefix}.png`;
      if (!fs.existsSync(imgPath)) {
        // some builds omit -singlefile behavior; pick any png for this prefix
        const alt = fs
          .readdirSync(tmpRoot)
          .find((f) => f.startsWith(`p${pageNo}`) && f.endsWith('.png'));
        if (!alt) throw new Error(`No image for page ${pageNo}`);
        await runAsync(TESSERACT, [
          path.join(tmpRoot, alt),
          prefix,
          '-l',
          'eng',
          '--psm',
          '6',
        ]);
      } else {
        await runAsync(TESSERACT, [imgPath, prefix, '-l', 'eng', '--psm', '6']);
      }
      const pageText = fs.existsSync(`${prefix}.txt`)
        ? fs.readFileSync(`${prefix}.txt`, 'utf8')
        : '';
      try {
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      } catch {
        /* ignore */
      }
      finished += 1;
      const elapsed = (Date.now() - ocrStart) / 1000;
      const etaSeconds = Math.round((elapsed / finished) * (pageNos.length - finished));
      const voters = parseEciOcrText(pageText, partNo);
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
        image: `page-${pageNo}.png`,
        char_count: pageText.length,
        text: pageText,
      };
    });

    pageTexts.sort((a, b) => a.page - b.page);
    const fullText = pageTexts
      .map((p) => `===== PAGE ${p.page} =====\n${p.text || ''}`.trimEnd())
      .join('\n\n');
    const voters = parseEciOcrText(fullText, partNo);
    return {
      pages: pageTexts,
      full_text: fullText,
      voters,
      pageCount: pageTexts.length,
      ocrPages: pageTexts.length,
      textLength: fullText.length,
      pageWorkers,
      dpi,
      durationMs: Date.now() - pageStartedAt,
    };
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
  ocrPdfToVoters,
  parseEciOcrText,
  partFromFilename,
  TESSERACT,
  PDFTOPPM,
};
