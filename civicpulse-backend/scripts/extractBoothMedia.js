/**
 * Cut the six booth pictures out of page 2 of each roll PDF and store them in public.booth_media.
 *
 *   node scripts/extractBoothMedia.js            # all booths
 *   node scripts/extractBoothMedia.js 1 2 5      # only these booth numbers
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const sharp = require('sharp');
const { prisma } = require('../db');
const { findPdftoppm } = require('../lib/poppler');
const { KINDS, ensureBoothMediaTable } = require('../lib/boothMedia');

const ROOT = path.resolve(__dirname, '..', '..');
const PDF_DIRS = [
  process.env.OCR_UPLOAD_DIR || path.join(ROOT, 'eluru_voters_data_ocr_extraction', 'uploaded_files'),
  path.join(ROOT, 'voter_data_eluru'),
];
// Cell boxes as fractions of the page width/height (measured on the ECI roll layout, page 2).
const COLS = [
  [0.105, 0.416],
  [0.585, 0.895],
];
const ROWS = [
  [0.0715, 0.2495], // under "Nazri Naksha" / "Google Map View"
  [0.2985, 0.4785],
  [0.5375, 0.7175],
];
const only = process.argv.slice(2).map(Number).filter(Boolean);

const findPdf = (doc) => [doc.storagePath, ...PDF_DIRS.map((d) => path.join(d, doc.filename))].find((p) => p && fs.existsSync(p));

(async () => {
  await ensureBoothMediaTable(prisma);
  const pdftoppm = findPdftoppm();
  const docs = await prisma.extractedDocument.findMany({ where: { partNo: { not: null } }, select: { partNo: true, filename: true, storagePath: true }, orderBy: { partNo: 'asc' } });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'boothmedia-'));
  let saved = 0;
  let skipped = 0;
  for (const doc of docs) {
    if (only.length && !only.includes(doc.partNo)) continue;
    const pdf = findPdf(doc);
    if (!pdf) {
      console.log(`booth ${doc.partNo}: PDF not found`);
      continue;
    }
    const prefix = path.join(work, `p${doc.partNo}`);
    spawnSync(pdftoppm, ['-png', '-r', '200', '-f', '2', '-l', '2', '-singlefile', pdf, prefix], { windowsHide: true, timeout: 90000 });
    const page = `${prefix}.png`;
    if (!fs.existsSync(page)) {
      console.log(`booth ${doc.partNo}: page 2 not rendered`);
      continue;
    }
    const { width: W, height: H } = await sharp(page).metadata();
    for (const k of KINDS) {
      const left = Math.round(COLS[k.col][0] * W);
      const top = Math.round(ROWS[k.row][0] * H);
      const width = Math.round((COLS[k.col][1] - COLS[k.col][0]) * W);
      const height = Math.round((ROWS[k.row][1] - ROWS[k.row][0]) * H);
      try {
        const cell = await sharp(page).extract({ left, top, width, height }).flatten({ background: '#ffffff' }).toBuffer();
        // Cut away the near-white margin so only the picture is kept.
        const { data, info } = await sharp(cell).trim({ background: '#ffffff', threshold: 14 }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
        if (info.width < 60 || info.height < 60) {
          skipped += 1;
          continue;
        }
        await prisma.$executeRaw`
          INSERT INTO public.booth_media (part_no, kind, label, mime, width, height, data)
          VALUES (${doc.partNo}, ${k.kind}, ${k.label}, 'image/jpeg', ${info.width}, ${info.height}, ${data})
          ON CONFLICT (part_no, kind) DO UPDATE SET label = EXCLUDED.label, width = EXCLUDED.width, height = EXCLUDED.height, data = EXCLUDED.data, created_at = now()`;
        saved += 1;
      } catch (err) {
        skipped += 1;
        console.log(`booth ${doc.partNo} ${k.kind}: ${err.message}`);
      }
    }
    console.log(`booth ${doc.partNo}: done`);
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log({ saved, skipped });
  process.exit(0);
})();
