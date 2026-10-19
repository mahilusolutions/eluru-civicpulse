/**
 * Fill in missing age / gender by re-reading each voter's own printed card.
 *
 *   node scripts/repairAgeGender.js            # dry run: show what would change
 *   node scripts/repairAgeGender.js --apply    # write the values (and log each change)
 *
 * Only empty values are filled; anything already read is left alone.
 * A value is saved only when at least two independent reads of the card agree on it
 * (different resolution and page-segmentation mode); otherwise it is left empty for a person to enter.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { prisma } = require('../db');
const { findPdftoppm } = require('../lib/poppler');
const { logAudit } = require('../lib/audit');

const APPLY = process.argv.includes('--apply');
const TESSERACT = process.env.TESSERACT_PATH || 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
const ROOT = path.resolve(__dirname, '..', '..');
const PDF_DIRS = [
  process.env.OCR_UPLOAD_DIR || path.join(ROOT, 'eluru_voters_data_ocr_extraction', 'uploaded_files'),
  path.join(ROOT, 'voter_data_eluru'),
];
const COL_LEFT = [0.0248, 0.3447, 0.6638];
const ROW_TOP = [0.034, 0.1285, 0.2225, 0.317, 0.411, 0.505, 0.5995, 0.6935, 0.7875, 0.882];

const findPdf = (doc) =>
  [doc.storagePath, ...PDF_DIRS.map((d) => path.join(d, doc.filename))].find((p) => p && fs.existsSync(p));

function pageSize(pdftoppm, pdf) {
  const exe = path.join(path.dirname(pdftoppm), path.basename(pdftoppm).replace(/pdftoppm/i, 'pdfinfo'));
  const out = spawnSync(fs.existsSync(exe) ? exe : 'pdfinfo', [pdf], { windowsHide: true, timeout: 20000 });
  const m = String(out.stdout || '').match(/Page size:\s*([\d.]+)\s*x\s*([\d.]+)/i);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 595.3, h: 841.9 };
}

// The printed digits are small, so OCR confuses them with look-alike characters ("75" often reads "/S").
const LOOKALIKE = { '/': '7', '>': '7', S: '5', s: '5', I: '1', l: '1', '|': '1', O: '0', o: '0', B: '8', Z: '2', G: '6' };
const ageDigits = (raw) => {
  const n = Number([...raw].map((c) => LOOKALIKE[c] ?? c).join(''));
  return Number.isInteger(n) && n >= 18 && n <= 110 ? n : null;
};

function parse(text) {
  const flat = text.replace(/\s+/g, ' ');
  let age = null;
  let gender = null;
  const a = flat.match(/Age\s*[:;=]?\s*([0-9\/>SsIl|OoBZG]{2,3})(?=\s*Gender|\s|$)/);
  if (a) age = ageDigits(a[1]);
  const g = flat.match(/Gender\s*[:;=]?\s*(Male|Female|Third)/i);
  if (g) gender = /^f/i.test(g[1]) ? 'F' : /^t/i.test(g[1]) ? 'O' : 'M';
  return { age, gender };
}

(async () => {
  const pdftoppm = findPdftoppm();
  const rows = await prisma.$queryRaw`
    SELECT e.id, e.document_id, e.serial_no, e.page_no, e.age, e.gender::text AS gender, e.name,
           (SELECT MIN(serial_no) FROM voterdb.electors x WHERE x.document_id = e.document_id AND x.page_no = e.page_no)::int AS first_serial
    FROM voterdb.electors e
    WHERE e.document_id IS NOT NULL AND e.page_no IS NOT NULL AND (e.age IS NULL OR e.gender::text = 'U') AND (${process.env.ONLY_ID ? Number(process.env.ONLY_ID) : 0} = 0 OR e.id = ${process.env.ONLY_ID ? Number(process.env.ONLY_ID) : 0})
    ORDER BY e.document_id, e.page_no, e.serial_no`;
  const docs = new Map();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cardfix-'));
  const stats = { checked: rows.length, fixed: 0, still_missing: 0, no_pdf: 0 };
  const sizes = new Map();

  for (const r of rows) {
    if (!docs.has(String(r.document_id))) {
      docs.set(String(r.document_id), await prisma.extractedDocument.findUnique({ where: { id: r.document_id }, select: { filename: true, storagePath: true } }));
    }
    const doc = docs.get(String(r.document_id));
    const pdf = doc && findPdf(doc);
    if (!pdf) {
      stats.no_pdf += 1;
      continue;
    }
    if (!sizes.has(pdf)) sizes.set(pdf, pageSize(pdftoppm, pdf));
    const size = sizes.get(pdf);
    const slot = r.serial_no - r.first_serial;
    if (slot < 0 || slot > 29) {
      stats.still_missing += 1;
      continue;
    }
    const reads = [];
    for (const [dpi, psm] of [[220, '6'], [300, '6'], [300, '4'], [400, '6']]) {
      const pxW = (size.w * dpi) / 72;
      const pxH = (size.h * dpi) / 72;
      const x = Math.max(0, Math.round((COL_LEFT[slot % 3] - 0.004) * pxW));
      const y = Math.max(0, Math.round((ROW_TOP[Math.floor(slot / 3)] - 0.003) * pxH));
      const prefix = path.join(work, `c${r.id}_${dpi}`);
      spawnSync(
        pdftoppm,
        ['-png', '-r', String(dpi), '-f', String(r.page_no), '-l', String(r.page_no), '-x', String(x), '-y', String(y), '-W', String(Math.round(0.318 * pxW)), '-H', String(Math.round(0.096 * pxH)), '-singlefile', pdf, prefix],
        { windowsHide: true, timeout: 60000 }
      );
      const png = `${prefix}.png`;
      if (!fs.existsSync(png)) continue;
      const ocr = spawnSync(TESSERACT, [png, 'stdout', '--psm', psm, '-l', 'eng'], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
      reads.push(parse(ocr.stdout || '')); if (process.env.DEBUG_REPAIR) console.log(dpi, psm, JSON.stringify((ocr.stdout || '').slice(0, 400)), ocr.error && ocr.error.message, String(ocr.stderr || '').slice(0, 100));
      fs.rmSync(png, { force: true });
    }
    const agree = (key) => {
      const counts = new Map();
      for (const rd of reads) if (rd[key] != null) counts.set(rd[key], (counts.get(rd[key]) || 0) + 1);
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return best && best[1] >= 2 ? best[0] : null;
    };
    const got = { age: agree('age'), gender: agree('gender') };
    if (process.env.DEBUG_REPAIR) console.log(r.id, JSON.stringify(reads), 'slot', slot, size);
    const newAge = r.age == null ? got.age : null;
    const newGender = r.gender === 'U' ? got.gender : null;
    if (newAge == null && newGender == null) {
      stats.still_missing += 1;
      console.log(`#${r.id} ${r.name}: could not read — needs a manual look`);
      continue;
    }
    console.log(`#${r.id} ${r.name}: ${newAge != null ? `age ${newAge}` : ''} ${newGender ? `gender ${newGender}` : ''}`.trimEnd());
    stats.fixed += 1;
    if (APPLY) {
      if (newAge != null) await prisma.$executeRaw`UPDATE voterdb.electors SET age = ${newAge}, updated_at = now() WHERE id = ${r.id}`;
      if (newGender) await prisma.$executeRawUnsafe(`UPDATE voterdb.electors SET gender = '${newGender}', updated_at = now() WHERE id = ${Number(r.id)}`);
      await logAudit(prisma, {
        entity: 'voter',
        entityId: r.id,
        action: 'update',
        actorRole: 'system',
        summary: 'Age/gender recovered by re-reading the printed card',
        before: { age: r.age, gender: r.gender },
        after: { age: newAge ?? r.age, gender: newGender ?? r.gender },
      });
    }
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(APPLY ? 'APPLIED' : 'DRY RUN (add --apply to save)', stats);
  process.exit(0);
})();
