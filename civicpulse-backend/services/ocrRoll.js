const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const TESSERACT =
  process.env.TESSERACT_PATH ||
  (fs.existsSync('C:\\Program Files\\Tesseract-OCR\\tesseract.exe')
    ? 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe'
    : 'tesseract');

const PDFTOPPM =
  process.env.PDFTOPPM_PATH ||
  (() => {
    const winget = path.join(
      process.env.LOCALAPPDATA || '',
      'Microsoft\\WinGet\\Packages'
    );
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

function cleanName(raw) {
  if (!raw) return null;
  let n = raw
    .replace(/\s+/g, ' ')
    .replace(/\bName\b.*$/i, '')
    .replace(/\bPhoto\b/gi, '')
    .replace(/\bAvailable\b/gi, '')
    .trim();
  n = n.replace(/^[:\-.\s]+/, '').replace(/[:\-.\s]+$/, '');
  if (n.length < 3 || n.length > 80) return null;
  if (/^(assembly|constituency|section|electoral|part|revision|polling)/i.test(n)) {
    return null;
  }
  return n;
}

/**
 * ECI draft rolls print ~3 elector cards per row (names / relations / houses / ages
 * each appear as parallel sequences). Zip those sequences into voters.
 */
function parseEciOcrText(text, partNo) {
  if (!text || !text.trim()) return [];

  const normalized = text
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
    relations.push({
      type: m[1].toLowerCase(),
      name: cleanName(m[2]),
    });
  }

  const houses = [];
  const houseRe =
    /House\s*Number\s*:\s*([0-9A-Za-z][0-9A-Za-z\-\/,.]{0,40}?)(?=\s*(?:Photo|House\s*Number|Age\s*:|Name\s*:|<<<|$))/gi;
  while ((m = houseRe.exec(normalized))) {
    let h = m[1].replace(/\bPhoto\b.*/i, '').trim();
    if (h && !/^name$/i.test(h)) houses.push(h.slice(0, 40));
    else houses.push(null);
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
      serial_no: voters.length + 1,
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
  }

  return voters;
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(
      `${path.basename(cmd)} failed (${res.status}): ${(res.stderr || res.stdout || '').slice(0, 400)}`
    );
  }
  return res;
}

/**
 * OCR a roll PDF → real electors.
 * Skips cover pages 1–2 by default (header / polling station details).
 */
async function ocrPdfToVoters(pdfPath, partNo, opts = {}) {
  const {
    onProgress,
    maxPages = 0,
    dpi = 200,
    startPage = 3,
  } = opts;

  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `cp-ocr-${partNo}-`));
  const prefix = path.join(tmpRoot, 'page');

  try {
    const ppmArgs = ['-png', '-r', String(dpi), '-f', String(startPage)];
    if (maxPages > 0) {
      ppmArgs.push('-l', String(startPage + maxPages - 1));
    }
    ppmArgs.push(pdfPath, prefix);

    if (onProgress) onProgress({ stage: 'render', partNo, page: 0, total: 0 });
    run(PDFTOPPM, ppmArgs);

    const images = fs
      .readdirSync(tmpRoot)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!images.length) {
      // Some short PDFs may have voters earlier — retry from page 1
      run(PDFTOPPM, ['-png', '-r', String(dpi), '-f', '1', '-l', '2', pdfPath, prefix]);
    }

    const pages = fs
      .readdirSync(tmpRoot)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!pages.length) throw new Error('pdftoppm produced no page images');

    let fullText = '';
    for (let i = 0; i < pages.length; i += 1) {
      const imgPath = path.join(tmpRoot, pages[i]);
      if (onProgress) {
        onProgress({ stage: 'ocr', partNo, page: i + 1, total: pages.length });
      }
      const outBase = path.join(tmpRoot, `ocr-${i + 1}`);
      run(TESSERACT, [imgPath, outBase, '-l', 'eng', '--psm', '6']);
      const txtFile = `${outBase}.txt`;
      const pageText = fs.existsSync(txtFile) ? fs.readFileSync(txtFile, 'utf8') : '';
      fullText += `\n\n---PAGE ${startPage + i}---\n${pageText}`;
    }

    const voters = parseEciOcrText(fullText, partNo);
    return {
      voters,
      pageCount: pages.length,
      ocrPages: pages.length,
      textLength: fullText.length,
      fullText,
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
  ocrPdfToVoters,
  parseEciOcrText,
  TESSERACT,
  PDFTOPPM,
};
