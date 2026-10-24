/**
 * Cut the booth pictures and read the cover page details for booths that have been read, and save them on the booth row.
 * The server does this by itself in the background; this is for running it by hand.
 *
 *   node scripts/extractBoothMedia.js            # all booths
 *   node scripts/extractBoothMedia.js 1 2 5      # only these booth numbers
 */
const fs = require('fs');
const path = require('path');
const { prisma } = require('../db');
const { ensureBoothMediaTable, cutBoothPictures, readTeluguCover } = require('../lib/boothMedia');
const { isTeluguRoll } = require('../lib/photos');

const ROOT = path.resolve(__dirname, '..', '..');
const PDF_DIRS = [process.env.OCR_UPLOAD_DIR || path.join(ROOT, 'eluru_voters_data_ocr_extraction', 'uploaded_files'), path.join(ROOT, 'voter_data_eluru')];
const only = process.argv.slice(2).map(Number).filter(Boolean);
const findPdf = (doc) => [doc.storagePath, ...PDF_DIRS.map((d) => path.join(d, doc.filename))].find((p) => p && fs.existsSync(p));

(async () => {
  await ensureBoothMediaTable(prisma);
  const docs = await prisma.extractedDocument.findMany({ where: { partNo: { not: null } }, select: { partNo: true, filename: true, storagePath: true }, orderBy: { partNo: 'asc' } });
  for (const doc of docs) {
    if (only.length && !only.includes(doc.partNo)) continue;
    const pdf = findPdf(doc);
    if (!pdf) {
      console.log(`booth ${doc.partNo}: PDF not found`);
      continue;
    }
    const pics = await cutBoothPictures({ prisma, partNo: doc.partNo, pdf });
    const cover = isTeluguRoll(doc.filename) ? await readTeluguCover(pdf) : null;
    console.log(`booth ${doc.partNo}: ${pics} pictures`, cover ? `${Object.values(cover).filter((v) => v != null).length} details` : '');
  }
  process.exit(0);
})();
